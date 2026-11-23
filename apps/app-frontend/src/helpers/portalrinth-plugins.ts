/**
 * Portalrinth plugins: CSS themes for the launcher.
 *
 * A plugin is a manifest.json plus one or more .css files packed into a .zip;
 * a bare .css file is accepted too and becomes a one-file theme. Only CSS is
 * ever applied - themes restyle the interface and no code is executed, so a
 * broken theme can at worst look wrong, never break the launcher.
 *
 * Safe Mode (Ctrl+Shift+Alt+P, or the switch in Settings → Plugins) turns
 * every plugin off for the current session, so a theme that paints everything
 * black is one hotkey away from being undone. Quick CSS is a scratchpad
 * stylesheet that sits on top of all installed plugins.
 */
import JSZip from 'jszip'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { reactive, ref, watch } from 'vue'

export interface PluginManifest {
	/** Stable identifier, also used as the style tag marker. */
	id: string
	name: string
	version?: string
	author?: string
	description?: string
	/** Paths of the CSS files inside the archive, in apply order. */
	css?: string[]
	/** A picture shown at the top of the plugin's card, like a mod's. */
	banner?: string
	/** The plugin's own icon, as a URL or a data URL. */
	icon?: string
	/** Short chips under the description, straight from the catalog. */
	tags?: string[]
	/** Where the plugin comes from. */
	homepage?: string
	/**
	 * The catalog's settings schema (key/type/label/default), kept raw.
	 * Values become CSS custom properties on :root: --plugin-<key>.
	 */
	settings?: unknown[]
	/** The catalog's entry script; Portalrinth runs no plugin code. */
	entry?: string
}

export interface InstalledPlugin {
	manifest: PluginManifest
	/** Concatenated CSS of all the plugin's stylesheets. */
	css: string
	enabled: boolean
	installedAt: string
}

const PLUGINS_KEY = 'portalrinth-plugins'
const QUICK_CSS_KEY = 'portalrinth-quick-css'
const SAFE_MODE_KEY = 'portalrinth-plugin-safe-mode'
const STYLE_MARKER = 'data-pr-plugin'
const QUICK_CSS_ID = '__quick-css__'

function loadPlugins(): InstalledPlugin[] {
	try {
		const raw = localStorage.getItem(PLUGINS_KEY)
		const list = raw ? (JSON.parse(raw) as InstalledPlugin[]) : []
		return Array.isArray(list)
			? list.filter((plugin) => plugin?.manifest?.id && typeof plugin.css === 'string')
			: []
	} catch {
		return []
	}
}

function loadQuickCss(): { css: string; enabled: boolean } {
	try {
		const raw = localStorage.getItem(QUICK_CSS_KEY)
		if (raw) {
			const parsed = JSON.parse(raw) as { css?: string; enabled?: boolean }
			return { css: parsed.css ?? '', enabled: parsed.enabled !== false }
		}
	} catch {
		/* defaults below */
	}
	return { css: '', enabled: true }
}

export const plugins = reactive<InstalledPlugin[]>(loadPlugins())
export const quickCss = reactive(loadQuickCss())

export const isPluginSafeMode = () => sessionStorage.getItem(SAFE_MODE_KEY) === '1'

/** Reactive mirror, so the settings switch and the hotkey stay in sync. */
export const pluginSafeMode = ref(isPluginSafeMode())

/** Safe Mode lasts one session: the flag is cleared when it is turned off. */
export function setPluginSafeMode(on: boolean) {
	if (on) sessionStorage.setItem(SAFE_MODE_KEY, '1')
	else sessionStorage.removeItem(SAFE_MODE_KEY)
	pluginSafeMode.value = isPluginSafeMode()
	applyPlugins()
}

const SETTINGS_KEY = 'portalrinth-plugin-settings'

function loadSettings(): Record<string, Record<string, unknown>> {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY)
		const parsed = raw ? JSON.parse(raw) : {}
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch {
		return {}
	}
}

const pluginSettings = reactive<Record<string, Record<string, unknown>>>(loadSettings())

export function readPluginSettings(id: string): Record<string, unknown> {
	return pluginSettings[id] ?? {}
}

export function savePluginSettings(id: string, values: Record<string, unknown>) {
	pluginSettings[id] = { ...values }
	scheduleSaveAndApply()
}

/**
 * A plugin's settings, as CSS custom properties on :root, so a theme's
 * stylesheet can read them: `--plugin-<key>`. Booleans become true/false,
 * numbers and strings land as they are written.
 */
function settingsToCss(schema: unknown, values: Record<string, unknown>): string {
	if (!Array.isArray(schema)) return ''
	const lines: string[] = []
	for (const raw of schema) {
		const setting = raw as { key?: string; default?: unknown }
		if (!setting?.key) continue
		const value = values[setting.key] ?? setting.default
		if (value === undefined || value === null) continue
		if (typeof value === 'boolean') {
			lines.push(`--plugin-${setting.key}: ${value ? 'true' : 'false'};`)
		} else if (typeof value === 'number' || typeof value === 'string') {
			lines.push(`--plugin-${setting.key}: ${String(value).replace(/[;{}]/g, '')};`)
		}
	}
	return lines.length ? ':root {\n\t' + lines.join('\n\t') + '\n}' : ''
}

function injectStyle(id: string, css: string) {
	const style = document.createElement('style')
	style.setAttribute(STYLE_MARKER, id)
	style.textContent = css
	document.head.appendChild(style)
}

/** Re-applies every enabled plugin, then Quick CSS on top of them. */
export function applyPlugins() {
	for (const style of document.querySelectorAll(`style[${STYLE_MARKER}]`)) {
		style.remove()
	}
	if (pluginSafeMode.value) return
	for (const plugin of plugins) {
		if (plugin.enabled && plugin.css.trim()) {
			const settingsCss = settingsToCss(
				plugin.manifest.settings,
				readPluginSettings(plugin.manifest.id),
			)
			injectStyle(plugin.manifest.id, settingsCss ? `${plugin.css}\n${settingsCss}` : plugin.css)
		}
	}
	if (quickCss.enabled && quickCss.css.trim()) {
		injectStyle(QUICK_CSS_ID, quickCss.css)
	}
}

let applyTimer: ReturnType<typeof setTimeout> | null = null

/** Saves and re-applies, throttled so a live editor can type through it. */
function scheduleSaveAndApply() {
	if (applyTimer) clearTimeout(applyTimer)
	applyTimer = setTimeout(() => {
		applyTimer = null
		try {
			localStorage.setItem(PLUGINS_KEY, JSON.stringify(plugins))
		} catch {
			/* a full quota keeps the session's styles but stops persisting */
		}
		try {
			localStorage.setItem(QUICK_CSS_KEY, JSON.stringify(quickCss))
		} catch {
			/* same as above */
		}
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(pluginSettings))
		} catch {
			/* same as above */
		}
		applyPlugins()
	}, 200)
}

watch(plugins, scheduleSaveAndApply, { deep: true })
watch(quickCss, scheduleSaveAndApply, { deep: true })
watch(pluginSettings, scheduleSaveAndApply, { deep: true })

export function togglePlugin(id: string, enabled: boolean) {
	const plugin = plugins.find((entry) => entry.manifest.id === id)
	if (plugin) plugin.enabled = enabled
}

export function removePlugin(id: string) {
	const index = plugins.findIndex((entry) => entry.manifest.id === id)
	if (index >= 0) plugins.splice(index, 1)
}

export function setQuickCss(css: string) {
	quickCss.css = css
}

function upsertPlugin(plugin: InstalledPlugin) {
	const index = plugins.findIndex((entry) => entry.manifest.id === plugin.manifest.id)
	if (index >= 0) {
		// An update keeps the switch where the player left it.
		plugin.enabled = plugins[index].enabled
		plugins.splice(index, 1, plugin)
	} else {
		plugins.push(plugin)
	}
}

function sanitizeId(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64) || 'plugin'
	)
}

function baseName(path: string): string {
	const tail = path.split(/[/\\]/).pop() ?? path
	return tail.replace(/\.css$/i, '') || path
}

function buildPlugin(manifest: PluginManifest, css: string): InstalledPlugin {
	return {
		manifest: {
			...manifest,
			id: sanitizeId(manifest.id),
			name: manifest.name?.trim() || manifest.id,
		},
		css,
		enabled: true,
		installedAt: new Date().toISOString(),
	}
}

/**
 * Installs from picked files: a .zip with a manifest (root, or one folder
 * deep), a bare .css file, or a loose folder pick of manifest.json + css.
 * Re-installing a plugin id replaces it - that is how a theme updates.
 */
export async function installPluginFiles(files: File[]): Promise<'zip' | 'css' | 'folder'> {
	const usable = files.filter((file) => file && file.size < 20 * 1024 * 1024)
	if (usable.length === 0) {
		throw new Error('Не удалось прочитать выбранные файлы')
	}

	const zip = usable.find((file) => /\.zip$/i.test(file.name))
	if (zip) {
		let archive: JSZip
		try {
			archive = await JSZip.loadAsync(await zip.arrayBuffer())
		} catch {
			throw new Error('Архив повреждён или это не zip')
		}
		const entries = Object.keys(archive.files).filter((name) => !archive.files[name].dir)
		const manifestEntry = entries.find((name) => /(^|\/)manifest\.json$/i.test(name)) ?? null
		let manifest: PluginManifest = {
			id: baseName(zip.name),
			name: baseName(zip.name),
		}
		if (manifestEntry) {
			try {
				const parsed = JSON.parse(
					(await archive.files[manifestEntry].async('string')) || '{}',
				) as Partial<PluginManifest>
				manifest = {
					id: typeof parsed.id === 'string' && parsed.id ? parsed.id : manifest.id,
					name: typeof parsed.name === 'string' && parsed.name ? parsed.name : manifest.name,
					version: typeof parsed.version === 'string' ? parsed.version : undefined,
					author: typeof parsed.author === 'string' ? parsed.author : undefined,
					description: typeof parsed.description === 'string' ? parsed.description : undefined,
					css: Array.isArray(parsed.css)
						? parsed.css.filter((path): path is string => typeof path === 'string')
						: undefined,
				}
			} catch {
				throw new Error('manifest.json не читается — проверьте JSON')
			}
		}
		const manifestDir = manifestEntry ? manifestEntry.replace(/manifest\.json$/i, '') : ''
		let cssPaths: string[]
		if (manifest.css?.length) {
			cssPaths = manifest.css.map((path) => manifestDir + path)
		} else {
			cssPaths = entries
				.filter((name) => /\.css$/i.test(name))
				.sort((a, b) => a.length - b.length || a.localeCompare(b))
		}
		if (cssPaths.length === 0) {
			throw new Error('В архиве нет ни одного .css файла')
		}
		const chunks: string[] = []
		for (const path of cssPaths) {
			const file = archive.files[path]
			if (!file) continue
			chunks.push((await file.async('string')) || '')
		}
		const css = chunks.join('\n').trim()
		if (!css) throw new Error('CSS-файлы архива пусты')
		upsertPlugin(buildPlugin(manifest, css))
		return 'zip'
	}

	const cssFiles = usable.filter((file) => /\.css$/i.test(file.name))
	if (cssFiles.length > 0) {
		for (const file of cssFiles) {
			const css = (await file.text()).trim()
			if (!css) throw new Error(`Файл ${file.name} пуст`)
			const manifest: PluginManifest = {
				id: baseName(file.name),
				name: baseName(file.name),
			}
			upsertPlugin(buildPlugin(manifest, css))
		}
		return 'css'
	}

	const manifestFile = usable.find((file) => /manifest\.json$/i.test(file.name))
	if (manifestFile) {
		let manifest: PluginManifest
		try {
			const parsed = JSON.parse((await manifestFile.text()) || '{}') as Partial<PluginManifest>
			manifest = {
				id: typeof parsed.id === 'string' && parsed.id ? parsed.id : 'plugin',
				name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Плагин',
				version: typeof parsed.version === 'string' ? parsed.version : undefined,
				author: typeof parsed.author === 'string' ? parsed.author : undefined,
				description: typeof parsed.description === 'string' ? parsed.description : undefined,
			}
		} catch {
			throw new Error('manifest.json не читается — проверьте JSON')
		}
		const chunks: string[] = []
		for (const file of usable.filter((entry) => /\.css$/i.test(entry.name))) {
			chunks.push((await file.text()) || '')
		}
		const css = chunks.join('\n').trim()
		if (!css) throw new Error('Рядом с manifest.json нет .css файлов')
		upsertPlugin(buildPlugin(manifest, css))
		return 'folder'
	}

	throw new Error('Поддерживаются .zip с манифестом или .css файлы')
}

/**
 * The Noctrinth catalog - the community's plugin and theme database
 * (github.com/Everelsu/Noctrinth-Plugins). It lives on GitHub Pages as one
 * index.json; a plugin is a zip with plugin.json and CSS files inside.
 * Catalog installs go through the same localStorage store as local ones, so
 * both kinds sit in one list and are toggled and deleted the same way.
 */
export interface CatalogPluginEntry {
	id: string
	name: string
	version: string
	type?: string
	author?: string
	description?: string
	homepage?: string
	repository?: string
	banner_url?: string
	tags?: string[]
	download_url?: string
	sha256?: string
}

export interface Catalog {
	schema_version?: unknown
	updated_at?: string
	plugins: CatalogPluginEntry[]
}

const CATALOG_URL = 'https://everelsu.github.io/Noctrinth-Plugins/index.json'
const CATALOG_CACHE_KEY = 'portalrinth-plugin-catalog'
const CATALOG_MAX_BYTES = 512 * 1024
const PLUGIN_ZIP_MAX_BYTES = 16 * 1024 * 1024
const ICON_MAX_BYTES = 256 * 1024

export const catalogLoading = ref(false)
export const catalogUpdatedAt = ref<string | null>(null)

/** The catalog, fresh when the network allows it, cached when it does not. */
export async function loadCatalog(): Promise<Catalog> {
	try {
		const reply = await tauriFetch(CATALOG_URL)
		if (!reply.ok) throw new Error(`Каталог ответил ${reply.status}`)
		const text = await reply.text()
		if (text.length > CATALOG_MAX_BYTES) throw new Error('Каталог подозрительно велик')
		const catalog = JSON.parse(text) as Catalog
		localStorage.setItem(
			CATALOG_CACHE_KEY,
			JSON.stringify({ fetchedAt: new Date().toISOString(), catalog }),
		)
		catalogUpdatedAt.value = catalog.updated_at ?? new Date().toISOString()
		return catalog
	} catch {
		const cached = localStorage.getItem(CATALOG_CACHE_KEY)
		if (!cached) throw new Error('Каталог недоступен, и кэша ещё нет')
		const parsed = JSON.parse(cached) as {
			fetchedAt?: string
			catalog?: Catalog
		}
		if (!parsed.catalog) throw new Error('Кэш каталога не читается')
		catalogUpdatedAt.value = parsed.catalog.updated_at ?? parsed.fetchedAt ?? null
		return parsed.catalog
	}
}

function mimeOfIcon(name: string): string | null {
	const extension = name.toLowerCase().split('.').pop() ?? ''
	if (extension === 'svg') return 'image/svg+xml'
	if (extension === 'png') return 'image/png'
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
	if (extension === 'webp') return 'image/webp'
	if (extension === 'gif') return 'image/gif'
	return null
}

/** A picture from the archive, as a data URL the card can show offline. */
async function zipPicture(archive: JSZip, path: string | undefined): Promise<string | undefined> {
	if (!path) return undefined
	if (/^https?:\/\//i.test(path)) return path
	const file = archive.files[path] ?? archive.files[path.replace(/^\//, '')]
	if (!file || file.dir) return undefined
	const base64 = await file.async('base64')
	if (base64.length > (ICON_MAX_BYTES * 4) / 3) return undefined
	const mime = mimeOfIcon(path)
	if (!mime) return undefined
	return `data:${mime};base64,${base64}`
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Installs a plugin from the catalog: downloads the zip, checks the
 * checksum the catalog publishes, reads plugin.json (the catalog's format)
 * or manifest.json, and lands the theme in the same list as local plugins.
 * Only CSS is applied - an `entry` script is kept for the record, never run.
 */
export async function installCatalogPlugin(entry: CatalogPluginEntry): Promise<InstalledPlugin> {
	if (!entry.download_url) throw new Error('У плагина нет ссылки на скачивание')
	if (!/^https:\/\//i.test(entry.download_url)) {
		throw new Error('Плагины качаются только по https')
	}
	const reply = await tauriFetch(entry.download_url)
	if (!reply.ok) throw new Error(`Плагин не скачался: ${reply.status}`)
	const bytes = await reply.arrayBuffer()
	if (bytes.byteLength > PLUGIN_ZIP_MAX_BYTES) {
		throw new Error('Плагин больше 16 МБ - слишком велик для темы')
	}
	if (entry.sha256 && crypto?.subtle) {
		const actual = await sha256Hex(bytes)
		if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
			throw new Error('Контрольная сумма не совпала - архив повреждён')
		}
	}

	let archive: JSZip
	try {
		archive = await JSZip.loadAsync(bytes)
	} catch {
		throw new Error('Архив повреждён или это не zip')
	}
	const entries = Object.keys(archive.files).filter((name) => !archive.files[name].dir)

	const manifestEntry =
		entries.find((name) => /(^|\/)plugin\.json$/i.test(name)) ??
		entries.find((name) => /(^|\/)manifest\.json$/i.test(name))
	let manifest: Partial<PluginManifest> & { id?: string; name?: string } = {}
	if (manifestEntry) {
		try {
			manifest = JSON.parse((await archive.files[manifestEntry].async('string')) || '{}')
		} catch {
			throw new Error('plugin.json не читается - проверьте JSON')
		}
	}
	const manifestDir = manifestEntry ? manifestEntry.replace(/[^/]*(\.json)?$/i, '') : ''

	const stylePaths = Array.isArray(manifest.css)
		? manifest.css.map((path) => manifestDir + path)
		: Array.isArray((manifest as { styles?: string[] }).styles)
			? (manifest as { styles?: string[] }).styles!.map((path) => manifestDir + path)
			: entries
					.filter((name) => /\.css$/i.test(name))
					.sort((a, b) => a.length - b.length || a.localeCompare(b))
	const chunks: string[] = []
	for (const path of stylePaths) {
		const file = archive.files[path]
		if (!file || file.dir) continue
		chunks.push((await file.async('string')) || '')
	}
	const css = chunks.join('\n').trim()
	if (!css) throw new Error('В архиве нет ни одного .css файла')

	const icon = await zipPicture(archive, manifest.icon)
	const fallbackName = entry.name || baseName(manifestEntry ?? entry.id)
	const installed = buildPlugin(
		{
			id: typeof manifest.id === 'string' && manifest.id ? manifest.id : entry.id,
			name: typeof manifest.name === 'string' && manifest.name ? manifest.name : fallbackName,
			version: manifest.version ?? entry.version,
			author: manifest.author ?? entry.author,
			description: manifest.description ?? entry.description,
			tags: manifest.tags ?? entry.tags,
			homepage: manifest.homepage ?? entry.homepage ?? entry.repository,
			settings: manifest.settings,
			entry: manifest.entry,
			banner: entry.banner_url,
			icon,
		},
		css,
	)
	upsertPlugin(installed)
	return installed
}
