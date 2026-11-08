/**
 * The typeface the interface is set in.
 *
 * The shared stylesheet sets `font-family: var(--font-standard, ...)` on
 * `:root` (html), so the choice is written there as an inline property - on
 * the root element itself. Writing it on the body left the root's rule blind
 * to it (a custom property inherits downward, never upward), and the font
 * then reached only the few elements that resolve the variable directly.
 * Inter, the theme's own, always follows the chosen font, so a font missing
 * a glyph falls back to Inter rather than to a default serif.
 *
 * The choice is written in three places at once, each covering a way the
 * others can miss: the variable on the root (what the stylesheet's `:root`
 * rule reads), the variable on the body (what anything resolving the variable
 * at body level - or reading it off body's computed style - sees), and the
 * `font-family` itself inline on the root, which holds the choice even where
 * a stylesheet rule or an engine quirk would out-compete the variable.
 *
 * Like the accent, the choice is mirrored into local storage so the window
 * opens in it, rather than changing font once settings arrive from the database.
 */
import { invoke } from '@tauri-apps/api/core'
import { ref, watch } from 'vue'

/** Offered by name; anything else is the family name of an installed font. */
export const FONT_PRESETS = ['', 'system', 'minecraft'] as const

const PRESET_STACKS: Record<string, string> = {
	system: 'system-ui',
	// The Minecraft font has no Cyrillic; Monocraft's, bundled, stands in for it.
	minecraft: "'bundled-minecraft-font-mrapp', 'portalrinth-minecraft-cyrillic'",
}

const CACHE_KEY = 'portalrinth-font'

function readCache(): string {
	try {
		return localStorage.getItem(CACHE_KEY) ?? ''
	} catch {
		return ''
	}
}

const font = ref(readCache())

/**
 * A font as CSS: a preset's own stack, or a family name quoted, so a name with
 * spaces or digits stays one name.
 */
export function fontFamilyCss(name: string): string {
	return PRESET_STACKS[name] ?? `"${name.replace(/["\\]/g, '')}"`
}

watch(
	font,
	(name) => {
		const root = document.documentElement
		const body = document.body
		const trimmed = name.trim()

		// The variable feeds the stylesheet's `:root` rule; the root is where
		// that rule looks, the body where anything resolving the variable one
		// step down (or reading body's computed style) looks.
		if (trimmed) {
			const value = `${fontFamilyCss(trimmed)}, Inter, sans-serif`
			root.style.setProperty('--font-standard', value)
			body?.style.setProperty('--font-standard', value)
			// The family itself, inline on the root: holds the choice even
			// where a stylesheet rule would out-compete the variable.
			root.style.fontFamily = value
		} else {
			root.style.removeProperty('--font-standard')
			body?.style.removeProperty('--font-standard')
			root.style.removeProperty('font-family')
		}

		try {
			localStorage.setItem(CACHE_KEY, trimmed)
		} catch (error) {
			console.warn('Failed to remember the font for the next launch:', error)
		}
	},
	{ immediate: true },
)

export function useInterfaceFont() {
	return font
}

/** Sets the font without going through the settings tab — used at startup. */
export function setInterfaceFont(name: string | null | undefined): void {
	font.value = name ?? ''
}

/** The font families installed on this computer, read by the backend. */
export function installedFontFamilies(): Promise<string[]> {
	return invoke<string[]>('plugin:portalrinth-fonts|fonts_installed_families')
}
