/**
 * A picture behind the launcher, after Celestial Launcher's
 * (github.com/Wemsur/Celestial-Launcher). The picture is a file the app keeps
 * next to its database; how it is blurred and darkened are settings.
 */
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, ref } from 'vue'

import { get as getSettings, set as setSettings } from '@/helpers/settings.ts'

/** What can be a background; also what a dropped file is checked against. */
export const BACKGROUND_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']

/**
 * Videos, which may be a background as well as a picture.
 *
 * A background that moves is a different thing from one that does not, but
 * only in how it is drawn: the same file is kept, the same blur and the same
 * darkening apply, and the same setting turns it off.
 */
export const BACKGROUND_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v']

/** An object URL for the picture, or null when there is none. */
export const backgroundUrl = ref<string | null>(null)
/** The extension the background was stored with; empty when there is none. */
export const backgroundKind = ref<string>('')
/** Whether the background is one that moves. */
export const backgroundIsVideo = computed(() =>
	BACKGROUND_VIDEO_EXTENSIONS.includes(backgroundKind.value),
)

function backgroundMime(extension: string): string {
	const types: Record<string, string> = {
		avif: 'image/avif',
		gif: 'image/gif',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		m4v: 'video/mp4',
		mov: 'video/quicktime',
		mp4: 'video/mp4',
		png: 'image/png',
		webm: 'video/webm',
		webp: 'image/webp',
	}
	return types[extension] ?? 'application/octet-stream'
}
export const backgroundBlur = ref(true)
/** From 0, the picture as it is, to 100. */
export const backgroundDim = ref(0)

export async function loadBackground(blur: boolean, dim = backgroundDim.value): Promise<void> {
	backgroundBlur.value = blur
	backgroundDim.value = dim
	const bytes = await invoke<ArrayBuffer>('plugin:portalrinth-background|background_get')
	backgroundKind.value = await invoke<string>('plugin:portalrinth-background|background_kind')
	if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value)
	backgroundUrl.value = bytes.byteLength
		? URL.createObjectURL(new Blob([bytes], { type: backgroundMime(backgroundKind.value) }))
		: null
}

export function isBackgroundFile(path: string): boolean {
	const extension = path.split('.').pop()?.toLowerCase() ?? ''
	return (
		BACKGROUND_EXTENSIONS.includes(extension) || BACKGROUND_VIDEO_EXTENSIONS.includes(extension)
	)
}

/** Makes the picture at `path` the background. */
export async function setBackgroundFromPath(path: string): Promise<void> {
	await invoke('plugin:portalrinth-background|background_set', { path })
	await loadBackground(backgroundBlur.value)
}

/** Asks for a picture and makes it the background. False when none was picked. */
export async function chooseBackground(): Promise<boolean> {
	const path = await open({
		multiple: false,
		filters: [
			{ name: 'Image', extensions: BACKGROUND_EXTENSIONS },
			{ name: 'Video', extensions: BACKGROUND_VIDEO_EXTENSIONS },
		],
	})
	if (typeof path !== 'string') return false
	await setBackgroundFromPath(path)
	return true
}

export async function clearBackground(): Promise<void> {
	await invoke('plugin:portalrinth-background|background_clear')
	await loadBackground(backgroundBlur.value)
}

export async function saveBackgroundBlur(blur: boolean): Promise<void> {
	backgroundBlur.value = blur
	await setSettings({ ...(await getSettings()), background_blur: blur })
}

/**
 * How much darker the page in the middle is than the frame around it, from 0,
 * the same as the panels, to 100, solid. Kept on this computer, as it only
 * says how this window is drawn.
 */
const PAGE_SHADE_KEY = 'portalrinth.background.page-shade'
export const DEFAULT_PAGE_SHADE = 50

function readPageShade(): number {
	try {
		const stored = Number(localStorage.getItem(PAGE_SHADE_KEY))
		const raw = localStorage.getItem(PAGE_SHADE_KEY)
		if (raw === null || !Number.isFinite(stored)) return DEFAULT_PAGE_SHADE
		return Math.min(100, Math.max(0, stored))
	} catch {
		return DEFAULT_PAGE_SHADE
	}
}

export const pageShade = ref(readPageShade())

export function savePageShade(shade: number): void {
	pageShade.value = Math.min(100, Math.max(0, shade))
	try {
		localStorage.setItem(PAGE_SHADE_KEY, String(pageShade.value))
	} catch {
		// Not kept, but still shown until the window is closed.
	}
}

/**
 * How dark the bar over the search is while content is added to an instance,
 * from 0, see-through, to 100, solid. Its own setting, so the bar can be made
 * darker than the page under it and the list scrolling beneath stays out of
 * its text.
 */
const HEADER_SHADE_KEY = 'portalrinth.background.header-shade'
export const DEFAULT_HEADER_SHADE = 50

function readHeaderShade(): number {
	try {
		const raw = localStorage.getItem(HEADER_SHADE_KEY)
		const stored = Number(raw)
		if (raw === null || !Number.isFinite(stored)) return DEFAULT_HEADER_SHADE
		return Math.min(100, Math.max(0, stored))
	} catch {
		return DEFAULT_HEADER_SHADE
	}
}

export const headerShade = ref(readHeaderShade())

export function saveHeaderShade(shade: number): void {
	headerShade.value = Math.min(100, Math.max(0, shade))
	try {
		localStorage.setItem(HEADER_SHADE_KEY, String(headerShade.value))
	} catch {
		// Not kept, but still shown until the window is closed.
	}
}

/**
 * The opacity the bar is painted at. Eased so the middle of the slider is
 * already well covered (50 is 75%), while 100 is still fully solid.
 */
export function headerShadeOpacity(shade: number): number {
	const rest = 100 - Math.min(100, Math.max(0, shade))
	return Math.round(100 - (rest * rest) / 100)
}

export async function saveBackgroundDim(dim: number): Promise<void> {
	await setSettings({ ...(await getSettings()), background_dim: dim })
}
