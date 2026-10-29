/**
 * The page editor and .prth themes.
 *
 * A decoration is a picture, a gif or a video a player puts over a page of
 * the launcher - a pumpkin by the search bar, a snowfall over Discover, a
 * hat on the logo. Where it sits, how big it is and which page it belongs
 * to are kept on this computer; the file itself is kept by the background
 * plugin (`decor/<id>.<ext>`), the way the wallpaper is.
 *
 * A theme (.prth) carries the whole look to a friend: the background, the
 * accent, a sound, and every decoration with its file inside - one JSON
 * file the launcher reads back.
 */
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { setAccentGradientAnimated,showAccent } from '@/composables/use-accent'
import {
	BACKGROUND_EXTENSIONS,
	backgroundBlur,
	backgroundDim,
	backgroundKind,
	headerShade,
	loadBackground,
	pageShade,
	saveBackgroundBlur,
	saveBackgroundDim,
	saveHeaderShade,
	savePageShade,
} from '@/helpers/portalrinth-background'

/** What a decoration can be made of; the same files a background takes. */
export const DECOR_IMAGE_EXTENSIONS = [...BACKGROUND_EXTENSIONS]
export const DECOR_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v']
export const DECOR_SOUND_EXTENSIONS = ['mp3', 'ogg', 'wav', 'flac', 'm4a']

/** One placed thing: where it is, how big, which page, which file. */
export interface DecorItem {
	id: string
	/** The page key the item lives on (see PAGE_KEYS). */
	page: string
	/** The id the file is kept under by the background plugin. */
	asset: string
	kind: 'image' | 'video'
	/** The extension the asset was stored with; tells its mime apart. */
	ext: string
	/** Position and size, in percent of the window, so any screen fits. */
	x: number
	y: number
	w: number
	h: number
	opacity: number
}

const DECOR_KEY = 'portalrinth.decorations'
const SOUND_KEY = 'portalrinth.theme-sound'

/** Pages a thing can be placed on, and how the routes map onto them. */
export const EDITOR_PAGES: { key: string; label: string; match: RegExp }[] = [
	{ key: 'home', label: 'Главная', match: /^\/$/ },
	{ key: 'library', label: 'Обзор', match: /^\/(library|instances)/ },
	{ key: 'browse', label: 'Найти проекты', match: /^\/browse\/(modpack|mod|resourcepack|datapack|shader|server)/ },
	{ key: 'skins', label: 'Скины', match: /^\/browse\/skin/ },
	{ key: 'ai', label: 'ИИ-Помощник', match: /^\/ai/ },
	{ key: 'instance', label: 'Страница сборки', match: /^\/instance/ },
	{ key: 'settings', label: 'Настройки', match: /^\/settings/ },
]

function currentPageKey(path: string): string {
	for (const page of EDITOR_PAGES) {
		if (page.match.test(path)) return page.key
	}
	return 'other'
}

function readDecorations(): DecorItem[] {
	try {
		const raw = localStorage.getItem(DECOR_KEY)
		const list = raw ? (JSON.parse(raw) as DecorItem[]) : []
		return list.filter(
			(item) =>
				item &&
				typeof item.id === 'string' &&
				typeof item.asset === 'string' &&
				(item.kind === 'image' || item.kind === 'video') &&
				typeof item.x === 'number' &&
				typeof item.y === 'number',
		)
	} catch {
		return []
	}
}

/** Every placed thing, on every page. */
export const decorations = ref<DecorItem[]>(readDecorations())
watch(decorations, saveDecorations, { deep: true })

function saveDecorations(): void {
	try {
		localStorage.setItem(DECOR_KEY, JSON.stringify(decorations.value))
	} catch {
		// Full storage keeps the memory of it, if not the next launch.
	}
}

/** The editor being open: placed things become draggable and resizable. */
export const decorEditorOpen = ref(false)

/** The page the overlay draws for - the route's own. */
export function useDecorPage(): { page: ReturnType<typeof computed> } {
	const route = useRoute()
	const page = computed(() => currentPageKey(String(route.path ?? '/')))
	return { page }
}

export function itemsForPage(page: string): DecorItem[] {
	return decorations.value.filter((item) => item.page === page)
}

function newId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** The mime an extension is shown with, so a file draws instead of failing. */
function mimeOf(extension: string): string {
	const types: Record<string, string> = {
		avif: 'image/avif',
		flac: 'audio/flac',
		gif: 'image/gif',
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		m4a: 'audio/mp4',
		m4v: 'video/mp4',
		mp3: 'audio/mpeg',
		mp4: 'video/mp4',
		ogg: 'audio/ogg',
		png: 'image/png',
		wav: 'audio/wav',
		webm: 'video/webm',
		webp: 'image/webp',
	}
	return types[extension] ?? 'application/octet-stream'
}

/** An object URL for a kept decoration file; short-lived, for one drawing. */
export async function decorUrl(asset: string, extension: string): Promise<string | null> {
	try {
		const bytes = await invoke<ArrayBuffer>('plugin:portalrinth-background|decor_get', { id: asset })
		if (!bytes.byteLength) return null
		return URL.createObjectURL(new Blob([bytes], { type: mimeOf(extension) }))
	} catch {
		return null
	}
}

/**
 * Asks for a file and keeps it as a new decoration in the middle of `page`.
 * False when nothing was picked or the file refused to be kept.
 */
export async function addDecoration(page: string, kind: 'image' | 'video'): Promise<boolean> {
	const path = await open({
		multiple: false,
		filters: [
			{ name: kind === 'video' ? 'Video' : 'Image', extensions: kind === 'video' ? DECOR_VIDEO_EXTENSIONS : DECOR_IMAGE_EXTENSIONS },
		],
	})
	if (typeof path !== 'string') return false
	const asset = newId('decor')
	const extension = await invoke<string>('plugin:portalrinth-background|decor_store', { id: asset, path })
	if (!extension) return false
	decorations.value = [
		...decorations.value,
		{
			id: newId('item'),
			page,
			asset,
			kind,
			ext: extension,
			x: 38,
			y: 38,
			w: 24,
			h: kind === 'video' ? 24 : 20,
			opacity: 100,
		},
	]
	return true
}

/** Takes a placed thing away, and its file with it if nothing else uses it. */
export async function removeDecoration(id: string): Promise<void> {
	const item = decorations.value.find((kept) => kept.id === id)
	decorations.value = decorations.value.filter((kept) => kept.id !== id)
	if (!item) return
	const stillUsed = decorations.value.some((kept) => kept.asset === item.asset)
	if (!stillUsed) {
		await invoke('plugin:portalrinth-background|decor_remove', { id: item.asset }).catch(() => {})
	}
}

/** Clears one page of everything the player added to it. */
export async function clearPage(page: string): Promise<void> {
	const items = itemsForPage(page)
	decorations.value = decorations.value.filter((item) => item.page !== page)
	for (const item of items) {
		const stillUsed = decorations.value.some((kept) => kept.asset === item.asset)
		if (!stillUsed) {
			await invoke('plugin:portalrinth-background|decor_remove', { id: item.asset }).catch(() => {})
		}
	}
}

/** Moves a thing (drag) or resizes it (corner handle), in window percent. */
export function updateDecorItem(id: string, patch: Partial<DecorItem>): void {
	decorations.value = decorations.value.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

function clampPercent(value: number, max: number): number {
	return Math.min(max, Math.max(0, Math.round(value * 10) / 10))
}

/** Keeps a dragged item inside the window and its size sane. */
export function normalizeDecorItem(item: DecorItem): DecorItem {
	return {
		...item,
		x: clampPercent(Math.min(item.x, 100 - 2), 98),
		y: clampPercent(Math.min(item.y, 100 - 2), 98),
		w: clampPercent(Math.min(Math.max(item.w, 3), 100), 100),
		h: clampPercent(Math.min(Math.max(item.h, 3), 100), 100),
		opacity: Math.min(100, Math.max(10, Math.round(item.opacity))),
	}
}

// ---- The theme's own sound -------------------------------------------------

function readSound(): { asset: string; ext: string; volume: number } | null {
	try {
		const raw = localStorage.getItem(SOUND_KEY)
		const parsed = raw ? (JSON.parse(raw) as { asset?: string; ext?: string; volume?: number }) : null
		if (!parsed?.asset || !parsed.ext) return null
		return { asset: parsed.asset, ext: parsed.ext, volume: Math.min(100, Math.max(0, parsed.volume ?? 40)) }
	} catch {
		return null
	}
}

/** The sound a theme came with, played quietly behind everything. */
export const themeSound = ref(readSound())
/** Whether the sound plays at all - a theme can carry one nobody wants. */
export const themeSoundOn = ref(localStorage.getItem(`${SOUND_KEY}-on`) !== 'false')

watch([themeSound, themeSoundOn], () => {
	try {
		localStorage.setItem(SOUND_KEY, JSON.stringify(themeSound.value))
		localStorage.setItem(`${SOUND_KEY}-on`, String(themeSoundOn.value))
	} catch {
		// As with the rest of this file, the memory is best effort.
	}
})

/** Asks for a sound and makes it the theme's. False when none was picked. */
export async function chooseThemeSound(): Promise<boolean> {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Audio', extensions: DECOR_SOUND_EXTENSIONS }],
	})
	if (typeof path !== 'string') return false
	const asset = 'theme-sound'
	const ext = await invoke<string>('plugin:portalrinth-background|decor_store', { id: asset, path })
	if (!ext) return false
	themeSound.value = { asset, ext, volume: themeSound.value?.volume ?? 40 }
	themeSoundOn.value = true
	return true
}

export function removeThemeSound(): void {
	void invoke('plugin:portalrinth-background|decor_remove', { id: 'theme-sound' }).catch(() => {})
	themeSound.value = null
}

// ---- .prth themes ----------------------------------------------------------

interface PrthPayload {
	portalrinthTheme: 1
	name: string
	accent: { preset: string; tint: boolean; color: string | null; animated?: boolean }
	background: { ext: string; data: string; blur: boolean; dim: number; pageShade: number; headerShade: number } | null
	sound: { ext: string; data: string; volume: number } | null
	decorations: DecorItem[]
	assets: Record<string, { ext: string; data: string }>
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	const chunk = 0x8000
	for (let at = 0; at < bytes.length; at += chunk) {
		binary += String.fromCharCode(...bytes.subarray(at, at + chunk))
	}
	return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value)
	const bytes = new Uint8Array(binary.length)
	for (let at = 0; at < binary.length; at += 1) {
		bytes[at] = binary.charCodeAt(at)
	}
	return bytes
}

async function assetBase64(id: string): Promise<{ ext: string; data: string } | null> {
	try {
		const [bytes, ext] = await Promise.all([
			invoke<ArrayBuffer>('plugin:portalrinth-background|decor_get', { id }),
			invoke<string>('plugin:portalrinth-background|decor_kind', { id }),
		])
		if (!bytes.byteLength || !ext) return null
		return { ext, data: bytesToBase64(new Uint8Array(bytes)) }
	} catch {
		return null
	}
}

/**
 * Writes the launcher's whole look - background, accent, sound, every placed
 * thing - as one .prth file a friend can import. False when nothing was saved.
 */
export async function exportTheme(
	accent: { id: string; tint: boolean; customColor: string | null },
	name: string,
): Promise<boolean> {
	const assets: Record<string, { ext: string; data: string }> = {}
	const usedAssets = new Set(decorations.value.map((item) => item.asset))
	if (themeSound.value) usedAssets.add(themeSound.value.asset)
	for (const asset of usedAssets) {
		const carried = await assetBase64(asset)
		if (carried) assets[asset] = carried
	}

	let background: PrthPayload['background'] = null
	try {
		const [bytes, ext] = await Promise.all([
			invoke<ArrayBuffer>('plugin:portalrinth-background|background_get'),
			invoke<string>('plugin:portalrinth-background|background_kind'),
		])
		if (bytes.byteLength && ext) {
			background = {
				ext,
				data: bytesToBase64(new Uint8Array(bytes)),
				blur: backgroundBlur.value,
				dim: backgroundDim.value,
				pageShade: pageShade.value,
				headerShade: headerShade.value,
			}
		}
	} catch {
		// A theme without a background is still a theme.
	}

	let sound: PrthPayload['sound'] = null
	if (themeSound.value) {
		const carried = assets[themeSound.value.asset]
		if (carried) {
			sound = { ext: carried.ext, data: carried.data, volume: themeSound.value.volume }
		}
	}

	const payload: PrthPayload = {
		portalrinthTheme: 1,
		name: name.trim() || 'Тема Portalrinth',
		accent: {
			preset: accent.id,
			tint: accent.tint,
			color: accent.customColor,
			animated: localStorage.getItem('portalrinth-accent-gradient-animated') === 'true',
		},
		background,
		sound,
		decorations: decorations.value,
		assets,
	}

	const path = await save({
		defaultPath: `${payload.name.replace(/[^\wа-яёА-ЯЁ -]/g, '').trim() || 'theme'}.prth`,
		filters: [{ name: 'Portalrinth theme', extensions: ['prth'] }],
	})
	if (typeof path !== 'string') return false
	await writeTextFile(path, JSON.stringify(payload))
	return true
}

/**
 * Reads a .prth back: keeps its files, paints the background and the accent,
 * places every decoration where the author left it. Throws with a readable
 * message when the file is not a theme.
 */
export async function importTheme(): Promise<string | null> {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Portalrinth theme', extensions: ['prth'] }],
	})
	if (typeof path !== 'string') return null
	let payload: PrthPayload
	try {
		payload = JSON.parse(await readTextFile(path)) as PrthPayload
	} catch {
		throw new Error('Файл не читается — это точно .prth?')
	}
	if (payload?.portalrinthTheme !== 1) {
		throw new Error('В файле нет темы Portalrinth')
	}

	for (const [id, asset] of Object.entries(payload.assets ?? {})) {
		if (!asset?.data) continue
		await invoke('plugin:portalrinth-background|decor_store_bytes', {
			id,
			extension: asset.ext,
			bytes: Array.from(base64ToBytes(asset.data)),
		}).catch(() => {})
	}

	if (payload.background?.data) {
		await invoke('plugin:portalrinth-background|decor_store_bytes', {
			id: 'imported-background',
			extension: payload.background.ext,
			bytes: Array.from(base64ToBytes(payload.background.data)),
		}).catch(() => {})
		const importPath = await importBackgroundPath(payload.background.ext)
		if (importPath) {
			await invoke('plugin:portalrinth-background|background_set', { path: importPath })
		}
		saveBackgroundBlur(payload.background.blur ?? true)
		saveBackgroundDim(payload.background.dim ?? 0)
		savePageShade(payload.background.pageShade ?? 50)
		saveHeaderShade(payload.background.headerShade ?? 50)
		await loadBackground(payload.background.blur ?? true, payload.background.dim ?? 0)
	}

	if (payload.accent) {
		showAccent(payload.accent.preset, payload.accent.tint ?? true, payload.accent.color ?? null)
		if (typeof payload.accent.animated === 'boolean') setAccentGradientAnimated(payload.accent.animated)
	}

	decorations.value = (payload.decorations ?? []).map((item) => normalizeDecorItem(item))

	if (payload.sound?.data) {
		await invoke('plugin:portalrinth-background|decor_store_bytes', {
			id: 'theme-sound',
			extension: payload.sound.ext,
			bytes: Array.from(base64ToBytes(payload.sound.data)),
		}).catch(() => {})
		themeSound.value = { asset: 'theme-sound', ext: payload.sound.ext, volume: payload.sound.volume ?? 40 }
		themeSoundOn.value = true
	} else {
		themeSound.value = null
	}

	return payload.name
}

/**
 * The imported background's bytes have to go through background_set, which
 * reads a path. So the bytes are written beside the window's own temporary
 * files through the file plugin, and the path handed over.
 */
async function importBackgroundPath(extension: string): Promise<string | null> {
	try {
		const { appDataDir, join } = await import('@tauri-apps/api/path')
		const bytes = await invoke<ArrayBuffer>('plugin:portalrinth-background|decor_get', {
			id: 'imported-background',
		})
		if (!bytes.byteLength) return null
		const dir = await appDataDir()
		const temp = await join(dir, 'settings', `imported-background.${extension}`)
		const { writeFile } = await import('@tauri-apps/plugin-fs')
		await writeFile(temp, new Uint8Array(bytes))
		await invoke('plugin:portalrinth-background|decor_remove', { id: 'imported-background' }).catch(() => {})
		return temp
	} catch {
		return null
	}
}

/** Whether the current look is worth carrying: anything at all is. */
export function themeHasContent(kind: string): boolean {
	if (kind === 'background') return Boolean(backgroundKind.value)
	return decorations.value.length > 0 || Boolean(themeSound.value)
}
