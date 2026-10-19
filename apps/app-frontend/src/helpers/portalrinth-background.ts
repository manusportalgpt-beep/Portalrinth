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
export const backgroundBlur = ref(true)
/** From 0, the picture as it is, to 100. */
export const backgroundDim = ref(0)

export async function loadBackground(blur: boolean, dim = backgroundDim.value): Promise<void> {
	backgroundBlur.value = blur
	backgroundDim.value = dim
	const bytes = await invoke<ArrayBuffer>('plugin:portalrinth-background|background_get')
	backgroundKind.value = await invoke<string>('plugin:portalrinth-background|background_kind')
	if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value)
	backgroundUrl.value = bytes.byteLength ? URL.createObjectURL(new Blob([bytes])) : null
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

export async function saveBackgroundDim(dim: number): Promise<void> {
	await setSettings({ ...(await getSettings()), background_dim: dim })
}
