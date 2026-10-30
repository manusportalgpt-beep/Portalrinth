/**
 * Portalus's newer hands: downloads into the sandbox, pictures shown in the
 * chat, the launcher's look (themes, accent colours, gradients) and starter
 * projects for mods, resource packs, data packs and shader packs that can be
 * dropped straight into a build.
 *
 * Registered after ai-assistant's own handlers, so the persistent versions
 * of launcher_set_accent and launcher_set_theme here win.
 */
import * as fs from '@tauri-apps/plugin-fs'

import {
	ACCENT_PRESETS,
	accentGradientAnimated,
	accentGradientSpeed,
	addCustomAccentColor,
	CUSTOM_ACCENT_ID,
	findAccentPreset,
	isAccentColor,
	parseAccentGradient,
	setAccentGradientAnimated,
	setAccentGradientSpeed,
	setAccentPreset,
	setCustomAccentColor,
	useAccentPreset,
} from '../composables/use-accent'
import { isDarkTheme, THEME_OPTIONS, useTheme } from '../composables/use-theme'
import { registerAiToolHandler } from './ai-assistant'
import {
	bytesToBase64,
	sandboxAbsolutePath,
	sandboxReadDataUrl,
	sandboxWrite,
	sandboxWriteBinary,
} from './ai-sandbox'
import { add_project_from_path, edit, get_full_path, list } from './instance'
import { get_max_memory as getMaxMemory } from './jre.js'
import { get_logs, get_output_by_filename } from './logs.js'
import { applyThemeBackground, savedThemes, saveTheme } from './portalrinth-themes'
import { proxiedFetch } from './proxy-fetch'
import { get as getSettings, set as setSettings } from './settings'
import { get_instance_worlds, getWorldDisplayName } from './worlds'

const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const FORBIDDEN = /\.(exe|msi|bat|cmd|com|scr|dll|ps1|vbs|apk)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i

// ---- Zip (stored) ---------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff
	for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

/** A plain zip with every entry at the archive root, as Minecraft wants packs. */
function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
	const encoder = new TextEncoder()
	const locals: Uint8Array[] = []
	const centrals: Uint8Array[] = []
	let offset = 0
	for (const entry of entries) {
		const name = encoder.encode(entry.name)
		const crc = crc32(entry.data)
		const local = new Uint8Array(30 + name.length)
		const lv = new DataView(local.buffer)
		lv.setUint32(0, 0x04034b50, true)
		lv.setUint16(4, 20, true)
		lv.setUint16(6, 0x0800, true)
		lv.setUint32(14, crc, true)
		lv.setUint32(18, entry.data.length, true)
		lv.setUint32(22, entry.data.length, true)
		lv.setUint16(26, name.length, true)
		local.set(name, 30)
		const central = new Uint8Array(46 + name.length)
		const cv = new DataView(central.buffer)
		cv.setUint32(0, 0x02014b50, true)
		cv.setUint16(4, 20, true)
		cv.setUint16(6, 20, true)
		cv.setUint16(8, 0x0800, true)
		cv.setUint32(16, crc, true)
		cv.setUint32(20, entry.data.length, true)
		cv.setUint32(24, entry.data.length, true)
		cv.setUint16(28, name.length, true)
		cv.setUint32(42, offset, true)
		central.set(name, 46)
		locals.push(local, entry.data)
		centrals.push(central)
		offset += local.length + entry.data.length
	}
	const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
	const end = new Uint8Array(22)
	const ev = new DataView(end.buffer)
	ev.setUint32(0, 0x06054b50, true)
	ev.setUint16(8, entries.length, true)
	ev.setUint16(10, entries.length, true)
	ev.setUint32(12, centralSize, true)
	ev.setUint32(16, offset, true)
	const parts = [...locals, ...centrals, end]
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
	let at = 0
	for (const part of parts) {
		out.set(part, at)
		at += part.length
	}
	return out
}

/** Every file of a sandbox folder, with paths relative to that folder. */
async function readFolder(folderRel: string): Promise<{ name: string; data: Uint8Array }[]> {
	const base = await sandboxAbsolutePath(folderRel)
	const separator = base.includes('\\') ? '\\' : '/'
	const out: { name: string; data: Uint8Array }[] = []
	const walk = async (dir: string, prefix: string) => {
		for (const entry of await fs.readDir(dir)) {
			const path = `${dir}${separator}${entry.name}`
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name
			if (entry.isDirectory) await walk(path, rel)
			else if (entry.isFile) out.push({ name: rel, data: new Uint8Array(await fs.readFile(path)) })
		}
	}
	await walk(base, '')
	return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function writeSandboxFile(rel: string, bytes: Uint8Array): Promise<string> {
	const parent = rel.replace(/\/[^/]*$/, '')
	if (parent && parent !== rel) {
		await fs.mkdir(await sandboxAbsolutePath(parent), { recursive: true }).catch(() => {})
	}
	return sandboxWriteBinary(rel, bytes)
}

// ---- Downloads ------------------------------------------------------------

function extensionFor(type: string): string {
	const mime = type.split(';')[0].trim().toLowerCase()
	const known: Record<string, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/webp': 'webp',
		'image/gif': 'gif',
		'image/avif': 'avif',
		'video/mp4': 'mp4',
		'video/webm': 'webm',
		'audio/mpeg': 'mp3',
		'audio/ogg': 'ogg',
		'application/zip': 'zip',
		'application/java-archive': 'jar',
		'application/json': 'json',
		'text/plain': 'txt',
		'application/pdf': 'pdf',
	}
	return known[mime] ?? 'bin'
}

/** For a page link: the real media behind it (og:video, og:image, <video>). */
function mediaOnPage(html: string, base: string): string | null {
	const doc = new DOMParser().parseFromString(html, 'text/html')
	const candidates = [
		doc.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content'),
		doc.querySelector('meta[property="og:video"]')?.getAttribute('content'),
		doc.querySelector('video source[src]')?.getAttribute('src'),
		doc.querySelector('video[src]')?.getAttribute('src'),
		doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
	]
	for (const candidate of candidates) {
		if (!candidate) continue
		try {
			const url = new URL(candidate, base).toString()
			if (/^https?:/.test(url)) return url
		} catch {
			/* next */
		}
	}
	return null
}

async function download(urlRaw: string, pathRaw: string, depth = 0): Promise<string> {
	const url = urlRaw.trim()
	if (!/^https?:\/\//i.test(url)) return 'Нужна полная http(s) ссылка на файл'
	if (/youtube\.com|youtu\.be|tiktok\.com|instagram\.com/i.test(url) && depth === 0) {
		return 'Это страница видеосервиса, а не файл: такие сайты не отдают видео напрямую, скачать его я не могу. Нужна прямая ссылка на .mp4/.webm.'
	}
	const response = await proxiedFetch(url, {
		headers: { 'User-Agent': UA, Accept: '*/*' },
		signal: AbortSignal.timeout(180000),
	})
	if (!response.ok) return `Не скачалось: HTTP ${response.status}`
	const type = response.headers.get('content-type') ?? ''
	if (/text\/html/i.test(type)) {
		const media = depth === 0 ? mediaOnPage(await response.text(), url) : null
		if (media) return download(media, pathRaw, depth + 1)
		return 'По ссылке страница, а не файл, и картинки или видео на ней не нашлось. Для чтения страницы есть <<web_fetch|url>>.'
	}
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (bytes.length > 300 * 1024 * 1024) return 'Файл больше 300 МБ — не беру'
	let fromUrl = ''
	try {
		fromUrl = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
	} catch {
		/* no name in the link */
	}
	let path = pathRaw.trim().replace(/^\/+/, '')
	if (!path || path.endsWith('/')) {
		const base = fromUrl && /\.[a-z0-9]{2,5}$/i.test(fromUrl) ? fromUrl : `file-${Date.now()}.${extensionFor(type)}`
		path = `${path || 'downloads/'}${base.replace(/[\\:*?"<>|]+/g, '_')}`
	}
	if (FORBIDDEN.test(path)) return 'Исполняемые файлы (.exe и т.п.) в песочницу не скачиваю'
	const absolute = await writeSandboxFile(path, bytes)
	const size =
		bytes.length > 1024 * 1024
			? `${(bytes.length / 1024 / 1024).toFixed(1)} МБ`
			: `${Math.round(bytes.length / 1024)} КБ`
	const isImage = /^image\//i.test(type) || IMAGE_EXT.test(path)
	const isVideo = /^video\//i.test(type) || VIDEO_EXT.test(path)
	const line = `Скачано: ${path} (${size}) → ${absolute}.${isVideo ? ' Это видео — сообщи игроку путь к файлу текстом.' : ''}`
	if (isImage && bytes.length <= 6 * 1024 * 1024) {
		const mime = /^image\//i.test(type) ? type.split(';')[0] : `image/${(path.split('.').pop() ?? 'png').replace('jpg', 'jpeg')}`
		return `${line}@@IMG@@data:${mime};base64,${bytesToBase64(bytes)}`
	}
	return line
}

// ---- Appearance -----------------------------------------------------------

/** Writes the accent into the settings, so it survives a restart. */
async function persistAccent(): Promise<void> {
	const accent = useAccentPreset()
	try {
		const settings = await getSettings()
		await setSettings({
			...settings,
			accent_preset: accent.id.value,
			accent_tint_background: accent.tintBackground.value,
			accent_custom_color: accent.id.value === CUSTOM_ACCENT_ID ? accent.customColor.value : settings.accent_custom_color,
		})
	} catch {
		/* shown now, just not remembered */
	}
}

/** Finds a build by id or by (fuzzy) name - for <<launcher_set_memory|сборка::МБ>>. */
async function resolveBuildLoose(raw: string): Promise<{ id: string; name: string } | undefined> {
	const wanted = raw.trim().toLowerCase()
	if (!wanted) return undefined
	const builds = await list()
	return (
		builds.find((build) => build.id === wanted) ??
		builds.find((build) => build.name.toLowerCase() === wanted) ??
		builds.find((build) => build.name.toLowerCase().includes(wanted))
	)
}

/** Real total RAM in MB (0 when the OS would not say). */
async function totalRamMb(): Promise<number> {
	try {
		return Math.floor(Number(await getMaxMemory()) / 1024)
	} catch {
		return 0
	}
}

/** Clamps a memory request to 512..(3/4 of the PC's RAM), rounded to 512. */
function clampMemoryMb(mb: number, totalMb: number): number {
	const cap = totalMb ? Math.floor((totalMb * 3) / 4) : 16384
	return Math.max(512, Math.floor(Math.min(mb, cap) / 512) * 512)
}

async function persistTheme(theme: (typeof THEME_OPTIONS)[number]): Promise<void> {
	const store = useTheme()
	store.preferred.value = theme
	if (isDarkTheme(theme)) store.preferredDark.value = theme
	try {
		const settings = await getSettings()
		await setSettings({ ...settings, theme })
	} catch {
		/* shown now, just not remembered */
	}
}

const COLOR_NAMES: Record<string, string> = {
	красный: '#ef4444',
	алый: '#dc2626',
	оранжевый: '#f97316',
	жёлтый: '#facc15',
	желтый: '#facc15',
	золотой: '#f5b301',
	зелёный: '#22c55e',
	зеленый: '#22c55e',
	лаймовый: '#84cc16',
	бирюзовый: '#14b8a6',
	голубой: '#38bdf8',
	синий: '#3b82f6',
	фиолетовый: '#8b5cf6',
	пурпурный: '#a855f7',
	розовый: '#ec4899',
	белый: '#f5f5f5',
	серый: '#9ca3af',
	чёрный: '#111111',
	черный: '#111111',
	red: '#ef4444',
	orange: '#f97316',
	yellow: '#facc15',
	green: '#22c55e',
	cyan: '#06b6d4',
	blue: '#3b82f6',
	purple: '#8b5cf6',
	pink: '#ec4899',
	white: '#f5f5f5',
}

function toHex(raw: string): string | null {
	const value = raw.trim().toLowerCase()
	if (/^#[\da-f]{6}$/.test(value)) return value
	if (/^#[\da-f]{3}$/.test(value)) {
		return `#${value
			.slice(1)
			.split('')
			.map((char) => char + char)
			.join('')}`
	}
	return COLOR_NAMES[value] ?? null
}

function appearanceInfo(): string {
	const accent = useAccentPreset()
	const theme = useTheme()
	const custom = accent.customColor.value
	const gradient = parseAccentGradient(custom)
	const current =
		accent.id.value === CUSTOM_ACCENT_ID
			? gradient
				? `свой градиент ${gradient.stops.join(' → ')} под углом ${gradient.angle}°`
				: `свой цвет ${custom}`
			: `пресет «${accent.id.value}»`
	return [
		`Тема: ${theme.preferred.value} (варианты: ${THEME_OPTIONS.join(', ')}).`,
		`Акцент: ${current}; подкраска фона: ${accent.tintBackground.value ? 'вкл' : 'выкл'}; анимация градиента: ${accentGradientAnimated.value ? `вкл, ${accentGradientSpeed.value} с` : 'выкл'}.`,
		`Пресеты акцента: ${ACCENT_PRESETS.map((preset) => preset.id).join(', ')}.`,
		savedThemes.value.length
			? `Сохранённые темы игрока: ${savedThemes.value.map((saved) => `«${saved.name}»`).join(', ')}.`
			: 'Сохранённых тем пока нет.',
	].join('\n')
}

// ---- Starter projects -----------------------------------------------------

const RESOURCE_FORMATS: [string, number][] = [
	['1.21.7', 64],
	['1.21.6', 63],
	['1.21.5', 55],
	['1.21.4', 46],
	['1.21.2', 42],
	['1.21', 34],
	['1.20.5', 32],
	['1.20.3', 22],
	['1.20.2', 18],
	['1.20', 15],
	['1.19.4', 13],
	['1.19.3', 12],
	['1.19', 9],
	['1.18', 8],
	['1.17', 7],
	['1.16.2', 6],
]
const DATA_FORMATS: [string, number][] = [
	['1.21.7', 81],
	['1.21.6', 80],
	['1.21.5', 71],
	['1.21.4', 61],
	['1.21.2', 57],
	['1.21', 48],
	['1.20.5', 41],
	['1.20.3', 26],
	['1.20.2', 18],
	['1.20', 15],
	['1.19.4', 12],
	['1.19', 10],
	['1.18.2', 9],
	['1.18', 8],
	['1.17', 7],
	['1.16.2', 6],
]

function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map(Number)
	const pb = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
		if (diff) return diff
	}
	return 0
}

function formatFor(table: [string, number][], version: string): number {
	for (const [from, format] of table) {
		if (compareVersions(version, from) >= 0) return format
	}
	return table[table.length - 1][1]
}

function packMeta(format: number, description: string): string {
	return `${JSON.stringify(
		{
			pack: {
				pack_format: format,
				supported_formats: [format, 999],
				min_format: format,
				max_format: 999,
				description,
			},
		},
		null,
		2,
	)}\n`
}

const slugOf = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'portalus_project'

async function latestFabric(version: string): Promise<{ loader: string; api: string }> {
	let loader = '0.16.14'
	let api = ''
	try {
		const response = await proxiedFetch('https://meta.fabricmc.net/v2/versions/loader', {
			signal: AbortSignal.timeout(10000),
		})
		const data = (await response.json()) as { version: string; stable: boolean }[]
		loader = data.find((item) => item.stable)?.version ?? loader
	} catch {
		/* the fallback is fine */
	}
	try {
		const response = await proxiedFetch(
			`https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(JSON.stringify([version]))}&loaders=${encodeURIComponent('["fabric"]')}`,
			{ signal: AbortSignal.timeout(10000) },
		)
		const data = (await response.json()) as { version_number: string }[]
		api = data[0]?.version_number ?? ''
	} catch {
		/* checked by the model later */
	}
	return { loader, api }
}

async function scaffold(type: string, name: string, version: string, loader: string): Promise<string> {
	const id = slugOf(name)
	const root = `projects/${id}`
	const files: Record<string, string> = {}
	const javaPackage = `com.portalus.${id.replace(/_/g, '')}`
	const className = (name.replace(/[^A-Za-z0-9]+/g, ' ').trim() || 'Portalus')
		.split(' ')
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('')
	switch (type) {
		case 'resourcepack': {
			files['pack.mcmeta'] = packMeta(formatFor(RESOURCE_FORMATS, version), `${name} — сделано Порталусом`)
			files['assets/minecraft/lang/ru_ru.json'] = `${JSON.stringify({ 'menu.singleplayer': 'Одиночная игра' }, null, 2)}\n`
			files['assets/minecraft/textures/block/README.txt'] =
				'Кладите сюда PNG-текстуры блоков с ванильными именами (например stone.png, 16x16).\n'
			files['assets/minecraft/textures/item/README.txt'] = 'Текстуры предметов (например diamond_sword.png).\n'
			break
		}
		case 'datapack': {
			const newLayout = compareVersions(version, '1.21') >= 0
			const folder = newLayout ? 'function' : 'functions'
			files['pack.mcmeta'] = packMeta(formatFor(DATA_FORMATS, version), `${name} — сделано Порталусом`)
			files[`data/${id}/${folder}/load.mcfunction`] = `tellraw @a {"text":"${name} загружен","color":"light_purple"}\n`
			files[`data/${id}/${folder}/tick.mcfunction`] = '# Выполняется каждый тик\n'
			files[`data/minecraft/tags/${newLayout ? 'function' : 'functions'}/load.json`] = `${JSON.stringify({ values: [`${id}:load`] }, null, 2)}\n`
			files[`data/minecraft/tags/${newLayout ? 'function' : 'functions'}/tick.json`] = `${JSON.stringify({ values: [`${id}:tick`] }, null, 2)}\n`
			break
		}
		case 'shader': {
			files['shaders/shaders.properties'] = 'oldLighting=false\nsliders=VIGNETTE SATURATION\n'
			files['shaders/final.vsh'] = [
				'#version 120',
				'varying vec2 texcoord;',
				'void main() {',
				'\tgl_Position = ftransform();',
				'\ttexcoord = gl_MultiTexCoord0.xy;',
				'}',
				'',
			].join('\n')
			files['shaders/final.fsh'] = [
				'#version 120',
				'#define VIGNETTE 0.35 // [0.0 0.15 0.25 0.35 0.5]',
				'#define SATURATION 1.15 // [0.8 1.0 1.15 1.3 1.5]',
				'uniform sampler2D colortex0;',
				'varying vec2 texcoord;',
				'void main() {',
				'\tvec3 color = texture2D(colortex0, texcoord).rgb;',
				'\tfloat gray = dot(color, vec3(0.299, 0.587, 0.114));',
				'\tcolor = mix(vec3(gray), color, SATURATION);',
				'\tfloat edge = distance(texcoord, vec2(0.5));',
				'\tcolor *= 1.0 - VIGNETTE * smoothstep(0.3, 0.8, edge);',
				'\tgl_FragColor = vec4(color, 1.0);',
				'}',
				'',
			].join('\n')
			files['shaders/lang/ru_ru.lang'] = 'option.VIGNETTE=Виньетка\noption.SATURATION=Насыщенность\n'
			break
		}
		case 'mod': {
			const chosen = loader || 'fabric'
			if (chosen === 'fabric' || chosen === 'quilt') {
				const fabric = await latestFabric(version)
				files['settings.gradle'] = [
					'pluginManagement {',
					'\trepositories {',
					"\t\tmaven { url = 'https://maven.fabricmc.net/' }",
					'\t\tmavenCentral()',
					'\t\tgradlePluginPortal()',
					'\t}',
					'}',
					`rootProject.name = '${id}'`,
					'',
				].join('\n')
				files['gradle.properties'] = [
					'org.gradle.jvmargs=-Xmx2G',
					`minecraft_version=${version}`,
					`loader_version=${fabric.loader}`,
					`fabric_version=${fabric.api || 'УКАЖИ_С_https://modrinth.com/mod/fabric-api'}`,
					'mod_version=1.0.0',
					`maven_group=${javaPackage}`,
					`archives_base_name=${id}`,
					'',
				].join('\n')
				files['build.gradle'] = [
					'plugins {',
					"\tid 'fabric-loom' version '1.10-SNAPSHOT'",
					'}',
					'version = project.mod_version',
					'group = project.maven_group',
					'base { archivesName = project.archives_base_name }',
					'dependencies {',
					'\tminecraft "com.mojang:minecraft:${project.minecraft_version}"',
					'\tmappings loom.officialMojangMappings()',
					'\tmodImplementation "net.fabricmc:fabric-loader:${project.loader_version}"',
					'\tmodImplementation "net.fabricmc.fabric-api:fabric-api:${project.fabric_version}"',
					'}',
					'processResources {',
					'\tinputs.property "version", project.version',
					'\tfilesMatching("fabric.mod.json") { expand "version": project.version }',
					'}',
					`java { toolchain.languageVersion = JavaLanguageVersion.of(${compareVersions(version, '1.20.5') >= 0 ? 21 : 17}) }`,
					'',
				].join('\n')
				files['src/main/resources/fabric.mod.json'] = `${JSON.stringify(
					{
						schemaVersion: 1,
						id,
						version: '${version}',
						name,
						description: `${name} — мод, созданный с Порталусом`,
						authors: ['Portalus'],
						license: 'MIT',
						environment: '*',
						entrypoints: { main: [`${javaPackage}.${className}`] },
						depends: { fabricloader: `>=${fabric.loader}`, minecraft: `~${version}`, 'fabric-api': '*' },
					},
					null,
					2,
				)}\n`
				files[`src/main/java/${javaPackage.replace(/\./g, '/')}/${className}.java`] = [
					`package ${javaPackage};`,
					'',
					'import net.fabricmc.api.ModInitializer;',
					'import org.slf4j.Logger;',
					'import org.slf4j.LoggerFactory;',
					'',
					`public class ${className} implements ModInitializer {`,
					`\tpublic static final String MOD_ID = "${id}";`,
					'\tpublic static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);',
					'',
					'\t@Override',
					'\tpublic void onInitialize() {',
					`\t\tLOGGER.info("${name} загружен");`,
					'\t}',
					'}',
					'',
				].join('\n')
			} else {
				const neo = chosen === 'neoforge'
				files[`src/main/resources/META-INF/${neo ? 'neoforge.mods.toml' : 'mods.toml'}`] = [
					'modLoader="javafml"',
					`loaderVersion="[1,)"`,
					'license="MIT"',
					'[[mods]]',
					`modId="${id}"`,
					'version="1.0.0"',
					`displayName="${name}"`,
					'authors="Portalus"',
					`description="${name} — мод, созданный с Порталусом"`,
					'',
				].join('\n')
				files[`src/main/java/${javaPackage.replace(/\./g, '/')}/${className}.java`] = [
					`package ${javaPackage};`,
					'',
					`import net.${neo ? 'neoforged.fml' : 'minecraftforge.fml'}.common.Mod;`,
					'',
					`@Mod(${className}.MOD_ID)`,
					`public class ${className} {`,
					`\tpublic static final String MOD_ID = "${id}";`,
					'}',
					'',
				].join('\n')
				files['README.md'] = [
					`# ${name}`,
					'',
					`Исходники мода под ${neo ? 'NeoForge' : 'Forge'} ${version}.`,
					`Gradle-обвязку возьми из официального шаблона: ${neo ? 'https://github.com/NeoForgeMDKs' : 'https://files.minecraftforge.net'} и скопируй сюда папку src.`,
					'Сборка: gradlew build (нужен JDK), готовый .jar будет в build/libs.',
					'',
				].join('\n')
			}
			files['README.md'] ??= [
				`# ${name}`,
				'',
				`Fabric-мод под Minecraft ${version}.`,
				'Сборка: установи Gradle или скопируй gradlew из https://github.com/FabricMC/fabric-example-mod, затем gradlew build (нужен JDK). Готовый .jar — в build/libs.',
				'',
			].join('\n')
			break
		}
		default:
			return 'Тип проекта: resourcepack, datapack, shader или mod'
	}
	for (const [path, content] of Object.entries(files)) {
		await sandboxWrite(`${root}/${path}`, content)
	}
	let packed = ''
	if (type !== 'mod') {
		const archive = `projects/${id}.zip`
		const encoder = new TextEncoder()
		await writeSandboxFile(
			archive,
			buildZip(Object.entries(files).map(([name, content]) => ({ name, data: encoder.encode(content) }))),
		)
		packed = ` Архив готов: ${archive} — поставь в сборку через <<install_to_instance|${archive}::${type === 'shader' ? 'shaderpack' : type}>>.`
	}
	return `Создал проект «${name}» (${type}, Minecraft ${version}${type === 'mod' ? `, ${loader || 'fabric'}` : ''}) в ${root}.${packed}\nФайлы:\n${Object.keys(files).join('\n')}\nДальше дописывай файлы через sandbox_write, потом собери и поставь в сборку через <<install_to_instance|файл::тип>>.`
}

function kindOfFile(path: string, hint: string): 'mod' | 'resourcepack' | 'shaderpack' | 'datapack' {
	const wanted = hint.trim().toLowerCase()
	if (/^(mod|мод)/.test(wanted)) return 'mod'
	if (/^(shader|шейдер)/.test(wanted)) return 'shaderpack'
	if (/^(data|дата)/.test(wanted)) return 'datapack'
	if (/^(resource|ресурс|rp|текстур)/.test(wanted)) return 'resourcepack'
	if (/\.jar$/i.test(path)) return 'mod'
	if (/shader/i.test(path)) return 'shaderpack'
	if (/data/i.test(path)) return 'datapack'
	return 'resourcepack'
}

// ---- Builds: search, logs, files, worlds -----------------------------------

type Build = Awaited<ReturnType<typeof list>>[number]

async function pickBuild(raw: string): Promise<Build | string> {
	const all = await list().catch(() => [] as Build[])
	const wanted = raw.trim().toLowerCase()
	if (!wanted) {
		const { readSelectedBuild } = await import('./ai-assistant')
		const selected = all.find((instance) => instance.id === readSelectedBuild()?.id)
		if (selected) return selected
		if (all.length === 1) return all[0]
		return `Какая сборка? Есть: ${all
			.slice(0, 15)
			.map((instance) => `«${instance.name}» (${instance.id})`)
			.join(', ')}`
	}
	return (
		all.find((instance) => instance.id.toLowerCase() === wanted) ??
		all.find((instance) => instance.name.toLowerCase() === wanted) ??
		all.find((instance) => instance.name.toLowerCase().includes(wanted)) ??
		`Сборки «${raw.trim()}» нет. Есть: ${all
			.slice(0, 15)
			.map((instance) => `«${instance.name}» (${instance.id})`)
			.join(', ')}`
	)
}

const buildLink = (build: Build) => `[${build.name.replace(/[[\]]/g, '')}](/instance/${encodeURIComponent(build.id)})`

async function searchBuilds(query: string): Promise<string> {
	const all = await list().catch(() => [] as Build[])
	if (all.length === 0) return 'У игрока пока нет сборок'
	const words = query.toLowerCase().split(/\s+/).filter(Boolean)
	const hits = all.filter((instance) => {
		const hay = `${instance.name} ${instance.game_version} ${instance.loader} ${instance.id}`.toLowerCase()
		return words.every((word) => hay.includes(word))
	})
	const shown = (words.length ? hits : all).slice(0, 30)
	if (shown.length === 0) return `По «${query}» сборок нет. Всего сборок: ${all.length}`
	return [
		`Найдено сборок: ${shown.length}${words.length ? ` по «${query}»` : ''}. Ссылки кликабельны — давай их игроку как есть:`,
		...shown.map(
			(instance) =>
				`- ${buildLink(instance)} — Minecraft ${instance.game_version}, ${instance.loader}${instance.loader_version ? ` ${instance.loader_version}` : ''} (id ${instance.id})`,
		),
	].join('\n')
}

const LOG_IMPORTANT = /(error|exception|caused by|fatal|crash|failed|warn|mixin|incompatible|missing)/i

async function buildLogs(raw: string): Promise<string> {
	const [buildRaw = '', fileRaw = ''] = raw.split('::').map((part) => part.trim())
	const build = await pickBuild(buildRaw)
	if (typeof build === 'string') return build
	const logs = ((await get_logs(build.id, true).catch(() => [])) ?? []) as {
		filename: string
		log_type: string
	}[]
	if (logs.length === 0) return `У «${build.name}» логов пока нет (игру ещё не запускали)`
	const wanted = fileRaw.toLowerCase()
	const crash = logs.find((log) => /crash/i.test(log.log_type) || /crash/i.test(log.filename))
	const log =
		(wanted && logs.find((item) => item.filename.toLowerCase().includes(wanted))) ||
		(/краш|crash/.test(wanted) ? crash : undefined) ||
		logs.find((item) => item.filename === 'latest.log') ||
		logs[0]
	const output = String((await get_output_by_filename(build.id, log.log_type, log.filename).catch(() => '')) ?? '')
	const lines = output.split(/\r?\n/)
	const important = lines.filter((line) => LOG_IMPORTANT.test(line)).slice(-60)
	const tail = lines.slice(-80)
	return [
		`Лог «${log.filename}» сборки ${buildLink(build)} — ${lines.length} строк. Все логи: ${logs
			.slice(0, 12)
			.map((item) => item.filename)
			.join(', ')}${crash && crash !== log ? ` (есть краш-репорт ${crash.filename} — <<instance_logs|${build.id}::${crash.filename}>>)` : ''}. Экран логов: [Логи](/instance/${encodeURIComponent(build.id)}/logs).`,
		important.length ? `Ошибки и предупреждения:\n${important.join('\n').slice(-3500)}` : 'Ошибок и предупреждений не видно.',
		`Конец лога:\n${tail.join('\n').slice(-3000)}`,
	].join('\n\n')
}

/** A path inside the build's folder, never outside it. */
function insideBuild(base: string, rel: string): string {
	const parts = rel
		.replace(/\\/g, '/')
		.split('/')
		.filter((part) => part && part !== '.')
	if (parts.includes('..')) throw new Error('Путь не может выходить из папки сборки')
	const separator = base.includes('\\') ? '\\' : '/'
	return [base.replace(/[\\/]+$/, ''), ...parts].join(separator)
}

async function buildFiles(raw: string): Promise<string> {
	const [buildRaw = '', relRaw = ''] = raw.split('::').map((part) => part.trim())
	const build = await pickBuild(buildRaw)
	if (typeof build === 'string') return build
	const base = await get_full_path(build.id)
	const dir = insideBuild(base, relRaw)
	const entries = await fs.readDir(dir)
	const sorted = entries.sort(
		(a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name),
	)
	return [
		`Папка «${relRaw || '/'}» сборки ${buildLink(build)} (${dir}), ${entries.length} шт.:`,
		...sorted.slice(0, 150).map((entry) => (entry.isDirectory ? `${entry.name}/` : entry.name)),
		entries.length > 150 ? `…и ещё ${entries.length - 150}` : '',
		'Прочитать файл: <<instance_read|сборка::путь/к/файлу>>.',
	]
		.filter(Boolean)
		.join('\n')
}

async function buildRead(raw: string): Promise<string> {
	const [buildRaw = '', relRaw = ''] = raw.split('::').map((part) => part.trim())
	if (!relRaw) return 'Формат: <<instance_read|сборка::путь (например config/sodium-options.json)>>'
	const build = await pickBuild(buildRaw)
	if (typeof build === 'string') return build
	const path = insideBuild(await get_full_path(build.id), relRaw)
	if (/\.(jar|zip|png|jpe?g|dat|mca|7z|exe)$/i.test(relRaw)) {
		const info = await fs.stat(path)
		return `${relRaw} — двоичный файл, ${Math.round((info.size ?? 0) / 1024)} КБ; читать его как текст бессмысленно`
	}
	const text = await fs.readTextFile(path)
	return `Файл ${relRaw} из ${buildLink(build)} (${text.length} симв.):\n${text.slice(0, 7000)}${text.length > 7000 ? '\n…(обрезано)' : ''}`
}

async function buildWorlds(raw: string): Promise<string> {
	const build = await pickBuild(raw)
	if (typeof build === 'string') return build
	const worlds = await get_instance_worlds(build.id).catch(() => [])
	if (worlds.length === 0) return `В ${buildLink(build)} нет миров и серверов`
	return [
		`Миры и серверы ${buildLink(build)} (экран: [Миры](/instance/${encodeURIComponent(build.id)}/worlds)):`,
		...worlds.slice(0, 40).map((world) =>
			world.type === 'singleplayer'
				? `- Мир «${getWorldDisplayName(world)}» — ${world.game_mode}${world.hardcore ? ', хардкор' : ''}${world.last_played ? `, играли ${new Date(world.last_played).toLocaleString('ru-RU')}` : ''}`
				: `- Сервер «${getWorldDisplayName(world)}» — \`${world.address}\``,
		),
	].join('\n')
}

/** Writes a text file into a build: configs, options, scripts. */
async function buildWrite(raw: string): Promise<string> {
	const first = raw.indexOf('::')
	const second = first < 0 ? -1 : raw.indexOf('::', first + 2)
	if (second < 0) return 'Формат: <<instance_write|сборка::путь::текст>>'
	const buildRaw = raw.slice(0, first).trim()
	const relRaw = raw.slice(first + 2, second).trim()
	const content = raw.slice(second + 2)
	if (!relRaw) return 'Формат: <<instance_write|сборка::путь::текст>>'
	const build = await pickBuild(buildRaw)
	if (typeof build === 'string') return build
	if (/\.(jar|zip|png|jpe?g|gif|webp|dat|mca|7z|exe|dll|msi|nbt|litematic|ogg|mp3)$/i.test(relRaw)) {
		return `${relRaw} — бинарный файл, записать его текстом нельзя`
	}
	const path = insideBuild(await get_full_path(build.id), relRaw)
	const text = content.replace(/\\n/g, '\n')
	try {
		await fs.writeTextFile(path, text)
	} catch {
		const separator = path.includes('\\') ? '\\' : '/'
		const parts = path.split(separator)
		parts.pop()
		await fs.mkdir(parts.join(separator), { recursive: true }).catch(() => {})
		await fs.writeTextFile(path, text)
	}
	return `Записал ${relRaw} в ${buildLink(build)} (${text.length} символов). Если игра была запущена, конфиг подхватится после её перезапуска.`
}
registerAiToolHandler(async (tool, args) => {
	try {
		switch (tool) {
			case 'instance_search':
				return await searchBuilds(args)
			case 'instance_logs':
				return await buildLogs(args)
			case 'instance_files':
				return await buildFiles(args)
			case 'instance_read':
				return await buildRead(args)
			case 'instance_worlds':
				return await buildWorlds(args)
			case 'instance_write':
				return await buildWrite(args)
		}
	} catch (error) {
		return `Не получилось: ${String(error).slice(0, 240)}`
	}
	return null
})

registerAiToolHandler(async (tool, args) => {
	switch (tool) {
		case 'sandbox_download': {
			const separator = args.indexOf('::')
			const url = separator < 0 ? args : args.slice(0, separator)
			const path = separator < 0 ? '' : args.slice(separator + 2)
			try {
				return await download(url, path)
			} catch (error) {
				return `Не скачалось: ${String(error).slice(0, 200)}`
			}
		}
		case 'sandbox_show': {
			const path = args.trim()
			if (!IMAGE_EXT.test(path)) return 'Показать в чате можно картинку (.png, .jpg, .webp, .gif)'
			try {
				return `Показываю ${path}@@IMG@@${await sandboxReadDataUrl(path)}`
			} catch (error) {
				return `Не открылась: ${String(error).slice(0, 160)}`
			}
		}
		case 'launcher_appearance':
			return appearanceInfo()
		case 'launcher_set_accent': {
			const value = args.trim()
			const preset = findAccentPreset(value.toLowerCase())
			if (preset) {
				setAccentPreset(preset.id, useAccentPreset().tintBackground.value)
				await persistAccent()
				return `Акцент: пресет «${preset.id}»`
			}
			const hex = toHex(value)
			if (!hex) return 'Нужен цвет: hex (#22c55e), название («синий») или пресет акцента'
			addCustomAccentColor(hex)
			setCustomAccentColor(hex)
			await persistAccent()
			return `Цвет акцента лаунчера сменён на ${hex} и сохранён`
		}
		case 'launcher_set_gradient': {
			const parts = args
				.split('::')
				.map((part) => part.trim())
				.filter(Boolean)
			let angle = 135
			if (parts.length && /^-?\d+(deg|°)?$/.test(parts[parts.length - 1])) {
				angle = Number.parseInt(parts.pop()!, 10)
			}
			const stops = parts.map(toHex)
			if (stops.length < 2 || stops.some((stop) => !stop)) {
				return 'Формат: <<launcher_set_gradient|#цвет1::#цвет2::…::угол>> — от 2 до 10 цветов, угол в градусах (необязательно)'
			}
			const css = `linear-gradient(${angle}deg, ${stops.slice(0, 10).join(', ')})`
			if (!isAccentColor(css)) return 'Такой градиент не подходит'
			addCustomAccentColor(css)
			setCustomAccentColor(css)
			await persistAccent()
			return `Градиент акцента: ${stops.join(' → ')}, ${angle}° — сохранён`
		}
		case 'launcher_gradient_animation': {
			const [state = '', seconds = ''] = args.split('::').map((part) => part.trim())
			const on = !/^(off|выкл|нет|0|false)/i.test(state)
			setAccentGradientAnimated(on)
			const speed = Number.parseFloat(seconds)
			if (Number.isFinite(speed)) setAccentGradientSpeed(speed)
			return `Анимация градиента ${on ? `включена (${accentGradientSpeed.value} с на проход)` : 'выключена'}`
		}
		case 'launcher_accent_tint': {
			const on = !/^(off|выкл|нет|0|false)/i.test(args.trim())
			const accent = useAccentPreset()
			if (accent.id.value === CUSTOM_ACCENT_ID) accent.tintBackground.value = on
			else setAccentPreset(accent.id.value, on)
			await persistAccent()
			return `Подкраска фона акцентом ${on ? 'включена' : 'выключена'}`
		}
		case 'launcher_set_theme': {
			const theme = args.trim().toLowerCase() as (typeof THEME_OPTIONS)[number]
			if (!THEME_OPTIONS.includes(theme)) return `Темы бывают: ${THEME_OPTIONS.join(', ')}`
			await persistTheme(theme)
			return `Тема лаунчера сменена на ${theme} и сохранена`
		}
		case 'launcher_get_settings': {
			const settings = await getSettings()
			const totalMb = await totalRamMb()
			return [
				`Память игре: ${settings.memory.maximum} МБ (всего на ПК: ${totalMb ? `${totalMb} МБ (~${Math.round(totalMb / 1024)} ГБ)` : 'неизвестно'})`,
				`Полноэкранный режим: ${settings.force_fullscreen ? 'вкл' : 'выкл'}`,
				`Разрешение окна: ${settings.game_resolution[0]}x${settings.game_resolution[1]}`,
				`Java-аргументы: ${settings.extra_launch_args.length ? settings.extra_launch_args.join(' ') : 'нет'}`,
				`Тема: ${settings.theme}`,
			].join('\n')
		}
		case 'launcher_set_memory': {
			const parts = args.split('::').map((part) => part.trim())
			const mb = Number.parseInt(parts[parts.length - 1] ?? '', 10)
			if (!Number.isFinite(mb)) {
				return 'Формат: <<launcher_set_memory|4096>> или <<launcher_set_memory|сборка::4096>> — МБ, кратно 512'
			}
			const totalMb = await totalRamMb()
			const rounded = clampMemoryMb(mb, totalMb)
			if (parts.length >= 2) {
				const build = await resolveBuildLoose(parts[0])
				if (!build) return `Сборка «${parts[0]}» не нашлась`
				await edit(build.id, { memory: { maximum: rounded } })
				return `Сборке «${build.name}» выделено ${rounded} МБ памяти (переопределение сборки)${
					rounded < mb ? ` — ограничил железом ПК (${totalMb} МБ всего, 3/4 в дело)` : ''
				}`
			}
			const settings = await getSettings()
			const before = settings.memory.maximum
			settings.memory = { maximum: rounded }
			await setSettings(settings)
			return `Память игры: ${rounded} МБ (было ${before} МБ), сохранено${
				rounded < mb ? ` — ограничил железом ПК (${totalMb} МБ всего, 3/4 в дело)` : ''
			}`
		}
		case 'launcher_set_setting': {
			const [what = '', ...rest] = args.split('::')
			const key = what.trim().toLowerCase()
			const value = rest.join('::').trim()
			const settings = await getSettings()
			if (key === 'force_fullscreen') {
				const on = !/^(off|выкл|нет|0|false)$/i.test(value)
				settings.force_fullscreen = on
				await setSettings(settings)
				return `Полноэкранный режим ${on ? 'включён' : 'выключен'} и сохранён`
			}
			if (key === 'resolution') {
				const dims = rest.map((dim) => Number.parseInt(dim.trim(), 10))
				const width = dims.find((dim) => Number.isFinite(dim) && dim >= 200)
				const height = dims.findLast((dim) => Number.isFinite(dim) && dim >= 200)
				if (!width || !height || width === height) {
					return 'Формат: <<launcher_set_setting|resolution::1920::1080>>'
				}
				settings.game_resolution = [width, height]
				await setSettings(settings)
				return `Разрешение окна игры: ${width}x${height}, сохранено`
			}
			if (key === 'java_args') {
				const next = value ? value.split(/\s+/).filter(Boolean).slice(0, 24) : []
				settings.extra_launch_args = next
				await setSettings(settings)
				return next.length ? `Java-аргументы сохранены: ${next.join(' ')}` : 'Java-аргументы очищены'
			}
			return 'Умею менять: force_fullscreen on/off, resolution ШИРИНА::ВЫСОТА, java_args текст'
		}
		case 'launcher_apply_theme': {
			const wanted = args.trim().toLowerCase()
			const theme =
				savedThemes.value.find((saved) => saved.name.toLowerCase() === wanted) ??
				savedThemes.value.find((saved) => saved.name.toLowerCase().includes(wanted))
			if (!theme) {
				return savedThemes.value.length
					? `Темы «${args.trim()}» нет. Есть: ${savedThemes.value.map((saved) => `«${saved.name}»`).join(', ')}`
					: 'Сохранённых тем нет — сохрани текущий вид через <<launcher_save_theme|название>>'
			}
			await applyThemeBackground(theme)
			if (theme.accent.preset === CUSTOM_ACCENT_ID) setCustomAccentColor(theme.accent.color)
			else setAccentPreset(theme.accent.preset, theme.accent.tint)
			await persistAccent()
			return `Применил тему «${theme.name}»: фон, затемнение и акцент`
		}
		case 'launcher_save_theme': {
			const name = args.trim().slice(0, 40)
			if (!name) return 'Нужно название темы'
			const accent = useAccentPreset()
			try {
				const existing = savedThemes.value.find((saved) => saved.name.toLowerCase() === name.toLowerCase())
				const theme = await saveTheme(
					name,
					'palette',
					{ preset: accent.id.value, tint: accent.tintBackground.value, color: accent.customColor.value },
					existing?.id,
				)
				return `Сохранил текущий вид как тему «${theme.name}»`
			} catch (error) {
				return `Не сохранилась: ${String(error).slice(0, 160)} (тем может быть не больше 8)`
			}
		}
		case 'scaffold': {
			const [typeRaw = '', name = 'Portalus', versionRaw = '', loader = ''] = args
				.split('::')
				.map((part) => part.trim())
			const type = /шейдер|shader/i.test(typeRaw)
				? 'shader'
				: /дата|data/i.test(typeRaw)
					? 'datapack'
					: /ресурс|resource|rp|текстур/i.test(typeRaw)
						? 'resourcepack'
						: /мод|mod/i.test(typeRaw)
							? 'mod'
							: typeRaw
			const version = /^\d+\.\d+(\.\d+)?$/.test(versionRaw) ? versionRaw : '1.21.1'
			try {
				return await scaffold(type, name, version, loader.toLowerCase())
			} catch (error) {
				return `Заготовка не создалась: ${String(error).slice(0, 200)}`
			}
		}
		case 'install_to_instance': {
			const [pathRaw = '', second = '', third = ''] = args.split('::').map((part) => part.trim())
			if (!pathRaw) return 'Формат: <<install_to_instance|файл или папка в песочнице::тип (mod/resourcepack/shaderpack/datapack)::сборка>>'
			const typeHint = /^(mod|мод|shader|шейдер|data|дата|resource|ресурс|rp|текстур)/i.test(second) ? second : ''
			const buildRaw = typeHint ? third : second
			const all = await list().catch(() => [])
			const { readSelectedBuild } = await import('./ai-assistant')
			const lower = buildRaw.toLowerCase()
			const target = buildRaw
				? (all.find((instance) => instance.id === buildRaw) ??
					all.find((instance) => instance.name.toLowerCase() === lower) ??
					all.find((instance) => instance.name.toLowerCase().includes(lower)))
				: (all.find((instance) => instance.id === readSelectedBuild()?.id) ?? (all.length === 1 ? all[0] : undefined))
			if (!target) {
				return `Не понял, в какую сборку. Есть: ${all
					.slice(0, 12)
					.map((instance) => `«${instance.name}» (${instance.id})`)
					.join(', ')}`
			}
			let path = pathRaw
			// A folder gets packed first: the game wants a .zip or a .jar.
			if (!/\.(zip|jar)$/i.test(path)) {
				const folder = path.replace(/\/+$/, '')
				const entries = await readFolder(folder).catch(() => [])
				if (entries.length === 0) return `В ${folder} пусто или такой папки нет`
				path = `${folder}.zip`
				await writeSandboxFile(path, buildZip(entries))
			}
			const kind = kindOfFile(path, typeHint)
			if (kind === 'mod' && (target.loader ?? 'vanilla') === 'vanilla') {
				return `«${target.name}» — ванильная сборка, моды в неё не ставятся`
			}
			try {
				const absolute = await sandboxAbsolutePath(path)
				await add_project_from_path(target.id, absolute, kind)
				return `Поставил ${path} как ${kind} в сборку «${target.name}» (Minecraft ${target.game_version}, ${target.loader})`
			} catch (error) {
				return `Не поставилось: ${String(error).slice(0, 200)}`
			}
		}
	}
	return null
})
