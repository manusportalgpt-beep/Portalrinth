/**
 * Saved themes: a background with the accent (a colour or a gradient) and how
 * the background is drawn, under a name and an icon, to be put back with one
 * click. At most eight are kept; a ninth replaces one of them.
 *
 * The background itself is copied aside by the background plugin
 * (`themes/<id>.<ext>`); the rest is kept on this computer, as the background
 * is.
 */
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { ref, watch } from 'vue'

import {
	BACKGROUND_EXTENSIONS,
	backgroundBlur,
	backgroundDim,
	headerShade,
	loadBackground,
	pageShade,
	saveBackgroundBlur,
	saveBackgroundDim,
	saveHeaderShade,
	savePageShade,
} from '@/helpers/portalrinth-background'

export const MAX_THEMES = 8

/** Icons a theme can wear when it has no picture of its own. */
export const THEME_ICONS = [
	'palette',
	'star',
	'heart',
	'sparkles',
	'moon',
	'sun',
	'game',
	'rocket',
	'crown',
	'music',
	'globe',
	'image',
] as const
export type ThemeIconName = (typeof THEME_ICONS)[number]

export interface ThemeAccent {
	preset: string
	tint: boolean
	color: string
}

export interface SavedTheme {
	id: string
	name: string
	/** One of THEME_ICONS, or a small picture as a data URL. */
	icon: string
	accent: ThemeAccent
	blur: boolean
	dim: number
	pageShade: number
	headerShade: number
	savedAt: number
}

const THEMES_KEY = 'portalrinth.themes'

function read(): SavedTheme[] {
	try {
		const raw = localStorage.getItem(THEMES_KEY)
		return raw ? (JSON.parse(raw) as SavedTheme[]).slice(0, MAX_THEMES) : []
	} catch {
		return []
	}
}

export const savedThemes = ref<SavedTheme[]>(read())
watch(
	savedThemes,
	() => {
		try {
			localStorage.setItem(THEMES_KEY, JSON.stringify(savedThemes.value))
		} catch {
			// Not kept past this window.
		}
	},
	{ deep: true },
)

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Saves what is on screen as a theme. With `replace`, over that theme, keeping
 * its place among the eight; otherwise as a new one, which needs a free place.
 */
export async function saveTheme(
	name: string,
	icon: string,
	accent: ThemeAccent,
	replace?: string,
): Promise<SavedTheme> {
	if (!replace && savedThemes.value.length >= MAX_THEMES) {
		throw new Error(`No more than ${MAX_THEMES} themes`)
	}
	const id = newId()
	await invoke('plugin:portalrinth-background|background_theme_store', { id })
	const theme: SavedTheme = {
		id,
		name: name.trim(),
		icon,
		accent: { ...accent },
		blur: backgroundBlur.value,
		dim: backgroundDim.value,
		pageShade: pageShade.value,
		headerShade: headerShade.value,
		savedAt: Date.now(),
	}
	const index = replace ? savedThemes.value.findIndex((kept) => kept.id === replace) : -1
	if (index >= 0) {
		const old = savedThemes.value[index]
		savedThemes.value = savedThemes.value.map((kept, at) => (at === index ? theme : kept))
		await invoke('plugin:portalrinth-background|background_theme_remove', { id: old.id }).catch(
			() => {},
		)
	} else {
		savedThemes.value = [...savedThemes.value, theme]
	}
	return theme
}

/** Puts the theme's background and its drawing back. The accent is the caller's to apply. */
export async function applyThemeBackground(theme: SavedTheme): Promise<void> {
	await invoke('plugin:portalrinth-background|background_theme_apply', { id: theme.id })
	savePageShade(theme.pageShade)
	saveHeaderShade(theme.headerShade)
	await saveBackgroundBlur(theme.blur)
	await saveBackgroundDim(theme.dim)
	await loadBackground(theme.blur, theme.dim)
}

export async function deleteTheme(id: string): Promise<void> {
	await invoke('plugin:portalrinth-background|background_theme_remove', { id })
	savedThemes.value = savedThemes.value.filter((theme) => theme.id !== id)
}

/** Asks for a picture to be an icon and makes it small. Null when none was picked. */
export async function chooseThemeIcon(): Promise<string | null> {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Image', extensions: BACKGROUND_EXTENSIONS }],
	})
	if (typeof path !== 'string') return null
	const bytes = await invoke<ArrayBuffer>('plugin:portalrinth-background|background_read_icon', {
		path,
	})
	const bitmap = await createImageBitmap(new Blob([bytes]))
	const size = 96
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext('2d')
	if (!context) return null
	const scale = Math.max(size / bitmap.width, size / bitmap.height)
	const width = bitmap.width * scale
	const height = bitmap.height * scale
	context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
	bitmap.close()
	return canvas.toDataURL('image/png')
}
