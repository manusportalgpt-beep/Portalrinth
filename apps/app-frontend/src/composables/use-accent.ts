/**
 * Portalrinth's accent presets.
 *
 * A theme fixes its accent at one colour, and the accent is most of what the
 * interface's own character comes from — so this is a second, smaller choice
 * next to the theme: pick a colour, not a number. Each preset carries two
 * values, one for light backgrounds and one for dark, because a purple that
 * reads on near-black is not the one that reads on white.
 *
 * A preset can colour more than the accent: the surfaces the app is built out
 * of — its background, its panels, its buttons — take the same hue at a fraction
 * of the strength, so picking Ember gives a warm dark app rather than a violet
 * one with orange buttons. They keep their own lightness, which is what the
 * theme's depth and contrast are made of; only the cast over them changes. The
 * That part is a setting of its own, for anyone who would rather keep the
 * theme's own greys.
 *
 * Anything the theme already painted in the brand colour follows the preset
 * regardless of that setting — the right-hand sidebar, the promo cards, the
 * dimmer behind a dialog, the loading bar. All four were written out in purple
 * by hand, which is why they used to stay purple behind a blue accent; they
 * were the brand's before and they are the brand's now.
 *
 * `theme` is the default and overrides nothing at all, so a build that has
 * never been touched draws exactly what its theme defines.
 *
 * The overrides are written onto the document element as inline custom
 * properties, which beat every theme stylesheet without editing one, and are
 * recomputed when the theme changes. The choice is also mirrored into local
 * storage, because the settings it really lives in are read from the database a
 * moment after the window opens — long enough for the splash screen to come up
 * in the wrong colour, which is exactly the flash this is meant to avoid.
 */
import { computed, ref, watch } from 'vue'

import { useTheme } from '@/composables/use-theme.ts'

export interface AccentPreset {
	id: string
	/** Shown in the picker; translated through `app.appearance-settings.accent.<id>`. */
	name: string
	/** Drawn on light backgrounds, then on dark ones. */
	light: string
	dark: string
}

export const DEFAULT_ACCENT_PRESET = 'crimson'

/** The id the wheel writes under, and the one a colour of its own takes. */
export const CUSTOM_ACCENT_ID = 'custom'

/**
 * The one id that is not a colour but an instruction: leave the interface in
 * whatever the theme drew it in. Everything else on the swatch row paints.
 */
export const THEME_ACCENT_ID = 'theme'
const DEFAULT_CUSTOM_ACCENT = '#4d9227'

/**
 * The list, in the order it is drawn.
 *
 * Each pair is the same colour at two lightnesses rather than two colours: the
 * light one is deep enough to read as a label on white, the dark one bright
 * enough to read on the near-black the app mostly is.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
	{ id: 'theme', name: 'Theme', light: '#8e32f3', dark: '#c78aff' },
	// The dark and the light are the same hue at two depths: a brighter accent
	// carries further on a light theme, and a deeper one does not turn to mud on
	// a dark one. Kept as one entry so nobody has to invent the pair twice.
	{ id: 'crimson', name: 'Crimson', light: '#c1121f', dark: '#ff4d5e' },
	{ id: 'blood', name: 'Blood', light: '#8b0f1c', dark: '#e0364a' },
	{ id: 'ember', name: 'Ember', light: '#c9510c', dark: '#ff8f4a' },
	{ id: 'sunset', name: 'Sunset', light: '#b8336a', dark: '#ff6ba5' },
	{ id: 'amethyst', name: 'Amethyst', light: '#7b2cbf', dark: '#a855f7' },
	{ id: 'nightshade', name: 'Nightshade', light: '#5b45d6', dark: '#8b7bff' },
	{ id: 'midnight', name: 'Midnight', light: '#1f68c0', dark: '#4f9cff' },
	{ id: 'glacier', name: 'Glacier', light: '#0e8fa8', dark: '#3ad2ec' },
	{ id: 'verdant', name: 'Verdant', light: '#0faa4f', dark: '#42e686' },
	{ id: 'moss', name: 'Moss', light: '#4a6b16', dark: '#9fd356' },
	{ id: 'lantern', name: 'Lantern', light: '#a86a00', dark: '#ffc857' },
	{ id: 'rose', name: 'Rose', light: '#cb2245', dark: '#ff6f95' },
]

/**
 * Every variable that carries the accent, repainted together.
 *
 * `--color-brand` is the accent; the purple variables are the same colour under
 * the name components reach for when they mean "purple" rather than "brand",
 * which in this fork is the same thing. Each keeps whatever alpha its theme
 * gave it, so a highlight stays a highlight and a shadow stays a shadow.
 */
const ACCENT_VARIABLES = [
	// The accent on its own, under a name no theme block declares. Anything
	// carrying a theme class of its own — the splash screen does — re-declares
	// every colour the theme defines on itself, which would drop the accent
	// chosen for the window; such a place can reach for this instead.
	'--portalrinth-accent',
	'--color-brand',
	'--color-brand-highlight',
	'--color-brand-shadow',
	'--color-purple',
	'--color-purple-highlight',
	'--color-purple-bg',
] as const

/**
 * Every surface the app is built out of, in the order the theme defines them —
 * `--color-bg`, `--color-raised-bg` and the button and divider colours are all
 * written in terms of these, so tinting them tints everything downstream.
 */
const SURFACE_VARIABLES = [
	'--surface-1',
	'--surface-1-5',
	'--surface-2',
	'--surface-2-5',
	'--surface-3',
	'--surface-4',
	'--surface-5',
] as const

/**
 * How much colour a surface is given, as OKLCh chroma.
 *
 * Enough to read as a cast rather than as grey — upstream's own dark surfaces
 * carry about a third of this, in blue — and far short of anything that would
 * compete with the accent drawn on top of it.
 */
const SURFACE_TINT = 0.016

/**
 * The gradients the fork paints its sidebar and promo cards with.
 *
 * These were written out as purple in the theme, so they stayed purple no
 * matter what the accent was — the one part of the window that never followed
 * it. Rebuilt from the preset at the same weights: a wash at low alpha for the
 * backgrounds, and a fade that has to stay opaque, so it is mixed into the page
 * background rather than laid over it.
 */
/**
 * The accent as something to lay *under* content, rather than on it.
 *
 * The theme writes these washes as dark purples — the dimmer behind a dialog is
 * `rgba(80, 35, 130, 0.45)`, not the accent itself — because their job is to
 * take light out of what is behind them. Built from the accent as it comes,
 * a bright preset such as Lantern brightens the window instead of dimming it,
 * and everything under the wash loses its contrast. Each one is therefore mixed
 * toward black by the same amount the theme's own value was, keeping its alpha.
 */
function wash(accent: string, strength: number, alpha: number): string {
	return `color-mix(in oklab, rgb(${accent} / ${alpha}) ${strength}%, rgb(0 0 0 / ${alpha}))`
}

function brandGradients(accent: string, borderAlpha: number): Record<string, string> {
	return {
		'--brand-gradient-bg': `linear-gradient(0deg, ${wash(accent, 25, 0.2)} 0%, ${wash(accent, 55, 0.1)} 100%)`,
		'--brand-gradient-strong-bg': `linear-gradient(270deg, color-mix(in oklab, var(--color-bg) 88%, rgb(${accent})) 10%, color-mix(in oklab, var(--color-bg) 80%, rgb(${accent})) 100%)`,
		'--brand-gradient-border': `rgb(${accent} / ${borderAlpha})`,
		'--brand-gradient-fade-out-color': `linear-gradient(to bottom, rgb(${accent} / 0) 0%, color-mix(in oklab, var(--color-bg) 86%, rgb(${accent})) 80%)`,
		// What a dialog dims the window with.
		'--modal-overlay-standard': `linear-gradient(to bottom, ${wash(accent, 50, 0.45)} 0%, ${wash(accent, 12, 0.95)} 100%)`,
		// The wash over the splash screen, which the theme also writes in purple.
		'--splash-wash': `linear-gradient(180deg, ${wash(accent, 55, 0.15)} 0%, ${wash(accent, 20, 0.3)} 97.29%)`,
	}
}

/**
 * The bar that runs along the top of the window while something loads.
 *
 * Its far end was a fixed lilac, so the bar left the accent behind halfway
 * across and finished in purple. It runs from the accent to a lighter cast of
 * itself on dark themes and a deeper one on light, which is the shape the
 * theme's own gradient had.
 */
function loadingBarGradient(accent: string, active: string): string {
	const far =
		active === 'light'
			? `color-mix(in oklab, rgb(${accent}) 65%, black)`
			: `color-mix(in oklab, rgb(${accent}) 60%, white)`
	return `linear-gradient(to right, rgb(${accent}) 0%, ${far} 100%)`
}

/**
 * A run of colours chosen as the accent, written the way CSS draws it:
 * `linear-gradient(<angle>deg, #hex, #hex, ...)`, evenly spaced, two to ten.
 *
 * Kept in the same setting a single colour of one's own is, because it is the
 * same choice - a colour of one's own - only more of it.
 */
export interface AccentGradient {
	angle: number
	stops: string[]
}

export const MAX_ACCENT_GRADIENT_STOPS = 10
const GRADIENT = /^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,(.+)\)$/i

export function parseAccentGradient(value: string | null | undefined): AccentGradient | null {
	if (typeof value !== 'string') return null
	const match = GRADIENT.exec(value.trim())
	if (!match) return null
	const stops = match[2].split(',').map((part) => part.trim().toLowerCase())
	if (
		stops.length < 2 ||
		stops.length > MAX_ACCENT_GRADIENT_STOPS ||
		stops.some((stop) => !/^#[\da-f]{6}$/.test(stop))
	)
		return null
	return { angle: ((Number(match[1]) % 360) + 360) % 360, stops }
}

function gradientCss({ angle, stops }: AccentGradient, direction: string = `${angle}deg`): string {
	return `linear-gradient(${direction}, ${stops.join(', ')})`
}

/** Whether a value is something the accent can be: one colour, or a run of them. */
export function isAccentColor(value: string | null | undefined): value is string {
	if (typeof value !== 'string') return false
	return /^#[\da-f]{6}$/i.test(value.trim()) || parseAccentGradient(value) !== null
}

/**
 * The one colour an accent comes down to where only one will do - a label, a
 * border, the window's icon. For a run, its first colour: the one it starts
 * from, and the one the picker was opened on.
 */
export function accentBaseColor(value: string): string {
	return parseAccentGradient(value)?.stops[0] ?? value
}

/**
 * The parts of the interface that are filled with the accent rather than
 * drawn in it: brand buttons, switches that are on, anything painted
 * `bg-brand`. With a run of colours chosen, those are filled with the run.
 */
const GRADIENT_STYLE_ID = 'portalrinth-accent-gradient'
const GRADIENT_CLASS = 'portalrinth-accent-gradient'
/** The class that sets the run moving, when that is asked for. */
const ANIMATED_CLASS = 'portalrinth-accent-gradient-animated'
const G = `html.${GRADIENT_CLASS}`
/** Where a rule for the moving run anchors: both classes on the html. */
const GA = `html.${GRADIENT_CLASS}.${ANIMATED_CLASS}`
const BRAND = '[style*="var(--color-brand)"]'

/** Everything painted outright with the run, under a scope of its own. */
const filledSelectors = (scope: string) => `${scope} .bg-brand,
${scope} .\\!bg-brand,
${scope} .btn.btn-primary:not(.btn-outline):not(.btn-transparent),
${scope} .button-frame--colored${BRAND},
${scope}.light-mode .bg-button-bgSelected,
${scope}.light-mode .nav-button.router-link-active::before,
${scope} .selected-option,
${scope} .portalrinth-gradient-fill`

/** Everything washed with the run, under a scope of its own. */
const softSelectors = (scope: string) => `${scope} .bg-brand-highlight,
${scope} .\\!bg-brand-highlight,
${scope} .chips .selected,
${scope} .btn.btn-secondary,
${scope}:not(.light-mode) .bg-button-bgSelected,
${scope} .button-frame--colored-text${BRAND},
${scope} .button-frame--outlined${BRAND},
${scope}:not(.light-mode) .nav-button.router-link-active::before,
${scope} [class*='bg-[color-mix(in_srgb,var(--color-brand)'],
${scope} .bg-brand\\/8,
${scope} .bg-brand\\/10,
${scope} .bg-brand\\/20,
${scope} .btn.featured,
${scope} .indicator[data-tone='green']`

const GRADIENT_STYLESHEET = `
/* Filled with the accent: filled with the run. */
${filledSelectors(G)} {
	background-image: var(--portalrinth-accent-gradient) !important;
}

/* Washed with the accent - a selected chip, the current page, a tab - washed with the run. */
${softSelectors(G)} {
	background-color: transparent !important;
	background-image: var(--portalrinth-accent-gradient-soft) !important;
}

/* Outlined in the accent: outlined in the run. */
${G} .chips .selected,
${G} .button-frame--outlined${BRAND} {
	border-color: transparent !important;
	box-shadow: none !important;
}
${G} .chips .selected {
	position: relative;
}
${G} .chips .selected::after,
${G} .button-frame--outlined${BRAND}::after {
	position: absolute;
	inset: 0;
	padding: 1px;
	pointer-events: none;
	content: '';
	border-radius: inherit;
	background: var(--portalrinth-accent-gradient);
	-webkit-mask:
		linear-gradient(#000 0 0) content-box,
		linear-gradient(#000 0 0);
	-webkit-mask-composite: xor;
	mask-composite: exclude;
}

/* The run set moving: drawn twice as wide and walked across what it fills.
   Only where that is asked for, and never for those who turn motion away. */
@media (prefers-reduced-motion: no-preference) {
${filledSelectors(GA)},
${softSelectors(GA)} {
	background-size: 280% 280% !important;
	animation: portalrinth-accent-shimmer var(--portalrinth-shimmer-duration, 9s) ease-in-out infinite;
}
}

@keyframes portalrinth-accent-shimmer {
	0%,
	100% {
		background-position: 0% 50%;
	}
	50% {
		background-position: 100% 50%;
	}
}
`

/** The run at the strength a highlight is drawn at, for washes under content. */
function softGradientCss({ angle, stops }: AccentGradient): string {
	const soft = stops.map((stop) => {
		const rgb = parseHex(stop)
		return rgb ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / 0.25)` : stop
	})
	return `linear-gradient(${angle}deg, ${soft.join(', ')})`
}

function setGradient(gradient: AccentGradient | null): void {
	const html = document.documentElement
	html.classList.toggle(ANIMATED_CLASS, gradient !== null && accentGradientAnimated.value)
	if (!gradient) {
		html.classList.remove(GRADIENT_CLASS)
		html.style.removeProperty('--portalrinth-accent-gradient')
		html.style.removeProperty('--portalrinth-accent-gradient-soft')
		return
	}
	if (!document.getElementById(GRADIENT_STYLE_ID)) {
		const style = document.createElement('style')
		style.id = GRADIENT_STYLE_ID
		style.textContent = GRADIENT_STYLESHEET
		document.head.appendChild(style)
	}
	html.style.setProperty('--portalrinth-accent-gradient', gradientCss(gradient))
	html.style.setProperty('--portalrinth-accent-gradient-soft', softGradientCss(gradient))
	html.classList.add(GRADIENT_CLASS)
}

const HEX = /^#([0-9a-f]{3,8})$/i
const RGB = /^rgba?\(([^)]+)\)$/i

interface ParsedColor {
	rgb: [number, number, number]
	alpha: number
}

/**
 * Reads a colour the way a theme might have written it — or been minified into.
 *
 * The four- and eight-digit hex forms matter more than they look: the release
 * build's minifier rewrites `rgba(199, 138, 255, 0.25)` as `#c78aff40`, so a
 * parser that only knew `rgb()` read every translucent variable as opaque and
 * repainted it solid. That is invisible in development, where the stylesheet is
 * not minified, and turned the selected tab, the badges and the sidebar's
 * divider into solid blocks of accent in a packaged build.
 */
function parseColor(value: string): ParsedColor | null {
	const text = value.trim()

	const hex = HEX.exec(text)
	if (hex) {
		const digits = hex[1]
		const short = digits.length <= 4
		const expanded = short
			? digits
					.split('')
					.map((digit) => digit + digit)
					.join('')
			: digits
		if (expanded.length !== 6 && expanded.length !== 8) return null

		const number = Number.parseInt(expanded.slice(0, 6), 16)
		const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
		return {
			rgb: [(number >> 16) & 255, (number >> 8) & 255, number & 255],
			alpha,
		}
	}

	const rgb = RGB.exec(text)
	if (rgb) {
		const parts = rgb[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number)
		if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null
		return {
			rgb: [parts[0], parts[1], parts[2]],
			alpha: Number.isFinite(parts[3]) ? parts[3] : 1,
		}
	}

	return null
}

function parseHex(value: string): [number, number, number] | null {
	return parseColor(value)?.rgb ?? null
}

/** The alpha a theme gave a variable, so repainting it does not flatten it. */
function alphaOf(value: string): number {
	return parseColor(value)?.alpha ?? 1
}

function toLinear(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** sRGB → OKLab, following Björn Ottosson's published matrices. */
function toOklab([red, green, blue]: [number, number, number]): [number, number, number] {
	const r = toLinear(red / 255)
	const g = toLinear(green / 255)
	const b = toLinear(blue / 255)

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

function hueOf(color: [number, number, number]): number {
	const [, a, b] = toOklab(color)
	return (Math.atan2(b, a) * 180) / Math.PI
}

function lightnessOf(color: [number, number, number]): number {
	return toOklab(color)[0]
}

function round(value: number, places: number): number {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

export function findAccentPreset(id: string): AccentPreset | undefined {
	return ACCENT_PRESETS.find((preset) => preset.id === id)
}

/**
 * What was chosen last time, read before anything is drawn.
 *
 * The database is the real home of both of these; this is only so the window
 * opens in the right colour rather than repainting itself once the settings
 * arrive.
 */
const CACHE_KEY = 'portalrinth-accent'

function readCache(): {
	preset: string
	tint: boolean
	color: string | null
	customColors: string[]
} {
	try {
		const raw = localStorage.getItem(CACHE_KEY)
		const cached = raw
			? (JSON.parse(raw) as {
					preset?: unknown
					tint?: unknown
					color?: unknown
					customColors?: unknown
				})
			: null
		return {
			preset:
				typeof cached?.preset === 'string' &&
				(cached.preset === CUSTOM_ACCENT_ID || findAccentPreset(cached.preset))
					? cached.preset
					: DEFAULT_ACCENT_PRESET,
			tint: cached?.tint !== false,
			color: typeof cached?.color === 'string' && isAccentColor(cached.color) ? cached.color : null,
			customColors: Array.isArray(cached?.customColors)
				? cached.customColors.filter((color): color is string => isAccentColor(color))
				: [],
		}
	} catch {
		return { preset: DEFAULT_ACCENT_PRESET, tint: true, color: null, customColors: [] }
	}
}

function writeCache(): void {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({
				preset: presetId.value,
				tint: tintBackground.value,
				color: customColor.value,
				customColors: customColors.value,
			}),
		)
	} catch (error) {
		console.warn('Failed to remember the accent for the next launch:', error)
	}
}

const cached = readCache()
const presetId = ref(cached.preset)
const tintBackground = ref(cached.tint)
const customColor = ref(cached.color ?? DEFAULT_CUSTOM_ACCENT)
/**
 * The colours the person has kept of their own.
 *
 * A colour that took a moment to find in the wheel is worth keeping, and
 * worth finding again next time without looking for it.
 */
const customColors = ref<string[]>(cached.customColors)
const theme = useTheme()

/**
 * Whether the run of colours, once chosen, slowly moves across what it
 * fills. A setting of its own, off until it is switched on, kept beside the
 * accent's own choice rather than in the database - it changes nothing the
 * rest of the launcher needs to know about.
 */
const ANIMATED_KEY = 'portalrinth-accent-gradient-animated'

function readAnimated(): boolean {
	try {
		return localStorage.getItem(ANIMATED_KEY) === 'true'
	} catch {
		return false
	}
}

export const accentGradientAnimated = ref(readAnimated())

/** Sets the run moving, or stills it, and keeps the choice. */
export function setAccentGradientAnimated(animated: boolean): void {
	accentGradientAnimated.value = animated
	try {
		localStorage.setItem(ANIMATED_KEY, animated ? 'true' : 'false')
	} catch {
		// Not kept, but still in effect until the window is closed.
	}
}

/** How many seconds one walk of the run takes, from a crawl to a blink.
 * A setting of its own, next to the switch that starts the walk at all. */
const SPEED_KEY = 'portalrinth-accent-gradient-speed'

function readSpeed(): number {
	try {
		const raw = Number(localStorage.getItem(SPEED_KEY))
		return Number.isFinite(raw) && raw >= 1 && raw <= 60 ? raw : 9
	} catch {
		return 9
	}
}

export const accentGradientSpeed = ref(readSpeed())

function applyShimmerSpeed(seconds: number): void {
	try {
		document.documentElement.style.setProperty('--portalrinth-shimmer-duration', `${seconds}s`)
	} catch {
		/* no document yet - it is applied on the next set */
	}
}

/** Changes how fast the run pours, and keeps the choice. */
export function setAccentGradientSpeed(seconds: number): void {
	const clamped = Math.max(1, Math.min(60, seconds))
	accentGradientSpeed.value = clamped
	applyShimmerSpeed(clamped)
	try {
		localStorage.setItem(SPEED_KEY, String(clamped))
	} catch {
		// Not kept, but still in effect until the window is closed.
	}
}

applyShimmerSpeed(accentGradientSpeed.value)

/**
 * Whether the icons that carry a brand's own colour - Modrinth, CurseForge,
 * the rest of them, and the mark in the title bar and on the desktop -
 * take the accent instead. Account icons keep their own faces. Where the
 * accent is a run of colours, the icons take its first, the one colour a
 * single small picture can hold.
 */
const ICONS_KEY = 'portalrinth-icons-accent'
const ICONS_CLASS = 'portalrinth-icons-accent'
const ICONS_STYLE_ID = 'portalrinth-icons-accent-style'

const ICONS_STYLESHEET = `
/* The source pickers, the badges on combined search results: everything
   painted in a brand's colour follows the accent instead. */
html.${ICONS_CLASS} .portalrinth-brand-icon,
html.${ICONS_CLASS} .browse-source-icon--modrinth,
html.${ICONS_CLASS} .browse-source-icon--curseforge {
	color: var(--portalrinth-accent, var(--color-brand)) !important;
}
`

function readIconsAccent(): boolean {
	try {
		return localStorage.getItem(ICONS_KEY) === 'true'
	} catch {
		return false
	}
}

export const iconsAccent = ref(readIconsAccent())

/** Sets the icons following the accent, and keeps the choice. */
export function setIconsAccent(on: boolean): void {
	iconsAccent.value = on
	try {
		localStorage.setItem(ICONS_KEY, on ? 'true' : 'false')
	} catch {
		// Not kept, but still in effect until the window is closed.
	}
}

/** The title bar's own rule lives with the logo; this one is for the rest. */
function applyIconsAccent(): void {
	if (!document.getElementById(ICONS_STYLE_ID)) {
		const style = document.createElement('style')
		style.id = ICONS_STYLE_ID
		style.textContent = ICONS_STYLESHEET
		document.head.appendChild(style)
	}
	document.documentElement.classList.toggle(ICONS_CLASS, iconsAccent.value)
}

/** The colour a preset is drawn in under the theme currently on screen. */
/**
 * The accent of a theme that is not purple, which is what "the theme's own"
 * means there: the swatch, the window icon and the shortcuts show it.
 */
const THEME_ACCENTS: Record<string, string> = { retro: '#4d9227' }

export function accentColorFor(preset: AccentPreset, active: string = theme.active): string {
	if (preset.id === CUSTOM_ACCENT_ID) return accentBaseColor(customColor.value)
	if (preset.id === THEME_ACCENT_ID)
		return THEME_ACCENTS[active] ?? (active === 'light' ? preset.light : preset.dark)
	return active === 'light' ? preset.light : preset.dark
}

/**
 * What the theme on screen defines for the variables the accent repaints.
 *
 * Reading them means taking the overrides off and asking the browser for the
 * computed style, which makes it restyle the whole window there and then. That
 * used to happen on every change of accent - twice, since the new values went
 * straight back on - and is most of what made switching colours stutter. The
 * theme's own values only change with the theme, so they are read once per
 * theme and kept.
 */
const THEME_VARIABLES = [
	...ACCENT_VARIABLES,
	...SURFACE_VARIABLES,
	'--brand-gradient-border',
] as const
let themeBase: { theme: string; values: Map<string, string> } | null = null

/** What this last wrote onto the document, so only what changed is written again. */
const written = new Map<string, string>()

function themeValues(): Map<string, string> {
	if (themeBase?.theme === theme.active) return themeBase.values
	const html = document.documentElement
	for (const variable of written.keys()) html.style.removeProperty(variable)
	written.clear()
	const styles = getComputedStyle(html)
	const values = new Map<string, string>()
	for (const variable of THEME_VARIABLES) values.set(variable, styles.getPropertyValue(variable))
	themeBase = { theme: theme.active, values }
	return values
}

/** The overrides an accent comes to, before any of it touches the document. */
function overridesFor(id: string, tint: boolean): Map<string, string> {
	const next = new Map<string, string>()

	// Only `theme` is a request to leave the interface as the theme drew it.
	// Every other id, the default one included, is a colour to paint: the default
	// being crimson means crimson is what has to appear, not a reason to do
	// nothing and let the theme's purple show through underneath.
	if (id === THEME_ACCENT_ID) return next

	// A colour of someone's own is not a preset; it is drawn from where the wheel
	// left it, and everything below works on it exactly as on one.
	const hex = id === CUSTOM_ACCENT_ID ? accentBaseColor(customColor.value) : null
	const preset = findAccentPreset(id)
	if (!preset && !hex) return next

	const rgb = parseHex(hex ?? accentColorFor(preset as AccentPreset))
	if (!rgb) return next

	const base = themeValues()
	const [red, green, blue] = rgb
	for (const variable of ACCENT_VARIABLES) {
		const alpha = alphaOf(base.get(variable) ?? '')
		next.set(
			variable,
			alpha >= 1 ? `rgb(${red} ${green} ${blue})` : `rgb(${red} ${green} ${blue} / ${alpha})`,
		)
	}

	// Everything the theme already painted in the brand colour — the right-hand
	// sidebar, the promo cards, the dialog dimmer, the loading bar — follows the
	// preset whether or not the greys do. It was the brand's before; it is the
	// brand's now.
	const accent = `${red} ${green} ${blue}`
	const borderAlpha = alphaOf(base.get('--brand-gradient-border') ?? '')
	for (const [variable, value] of Object.entries(brandGradients(accent, borderAlpha))) {
		next.set(variable, value)
	}
	const gradient = id === CUSTOM_ACCENT_ID ? parseAccentGradient(customColor.value) : null
	next.set(
		'--loading-bar-gradient',
		gradient ? gradientCss(gradient, 'to right') : loadingBarGradient(accent, theme.active),
	)

	if (!tint) return next

	// The surfaces keep their lightness — that is the theme's depth and its
	// contrast — and are given the preset's hue at a fraction of its strength.
	const hue = round(hueOf(rgb), 2)
	for (const variable of SURFACE_VARIABLES) {
		const surface = parseHex(base.get(variable) ?? '')
		if (!surface) continue
		next.set(variable, `oklch(${round(lightnessOf(surface), 4)} ${SURFACE_TINT} ${hue})`)
	}
	return next
}

function apply(id: string, tint: boolean): void {
	const html = document.documentElement
	// Read before anything is written, so the theme's values are its own.
	if (id !== THEME_ACCENT_ID) themeValues()

	const next = overridesFor(id, tint)
	for (const variable of [...written.keys()]) {
		if (next.has(variable)) continue
		html.style.removeProperty(variable)
		written.delete(variable)
	}
	for (const [variable, value] of next) {
		if (written.get(variable) === value) continue
		html.style.setProperty(variable, value)
		written.set(variable, value)
	}
	setGradient(id === CUSTOM_ACCENT_ID ? parseAccentGradient(customColor.value) : null)
}

/**
 * Changes of accent arrive faster than the window can draw them - a drag across
 * the wheel is a change per pointer event - so they are folded into one per
 * frame. The very first one is applied at once, so the window never opens in
 * the wrong colour.
 */
let frame: number | null = null
let pending: { id: string; tint: boolean; themeChanged: boolean } | null = null

function scheduleApply(id: string, tint: boolean, themeChanged: boolean): void {
	pending = { id, tint, themeChanged: themeChanged || (pending?.themeChanged ?? false) }
	if (frame !== null) return
	frame = requestAnimationFrame(() => {
		frame = null
		const next = pending
		pending = null
		if (!next) return
		// A new theme's class is on the document by now, so its colours can be read.
		if (next.themeChanged) themeBase = null
		apply(next.id, next.tint)
	})
}

/**
 * The cache and the window's icon follow the accent, but nothing has to wait
 * for them - the icon in particular is redrawn and handed to the window, which
 * is far too much to do for every colour passed on the way to the one chosen.
 */
let settleTimer: ReturnType<typeof setTimeout> | null = null

function settle(id: string): void {
	if (settleTimer) clearTimeout(settleTimer)
	settleTimer = setTimeout(() => {
		settleTimer = null
		writeCache()

		// The window's own icon is the last purple thing left when the app is not
		// purple any more. Loaded lazily: it is the one part of this that talks to
		// the window, and nothing waits on it.
		const preset =
			id === CUSTOM_ACCENT_ID ? ({ id: CUSTOM_ACCENT_ID } as AccentPreset) : findAccentPreset(id)
		if (preset) {
			void import('@/helpers/portalrinth-window-icon').then(({ paintWindowIcon }) =>
				paintWindowIcon(
					accentColorFor(preset),
					// The shortcuts go back to the executable's icon only when that
					// icon is the right colour. It never is once an accent other than
					// the theme's own has been chosen, and the default - crimson -
					// is such a choice, so this asks about the theme rather than
					// about whether the preset happens to be the default.
					preset.id === THEME_ACCENT_ID,
				),
			)
		}
	}, 400)
}

// Each theme carries its own alphas, and a preset is drawn differently on light
// than on dark, so the override is recomputed rather than kept.
let firstApply = true
watch(
	[presetId, tintBackground, customColor, accentGradientAnimated, () => theme.active, iconsAccent],
	([id, tint, , , active], previous) => {
		applyIconsAccent()
		if (firstApply) {
			firstApply = false
			apply(id, tint)
		} else {
			scheduleApply(id, tint, previous?.[4] !== active)
		}
		settle(id)
	},
	{ immediate: true },
)

export function useAccentPreset() {
	return {
		id: presetId,
		tintBackground,
		customColor,
		preset: computed(() => findAccentPreset(presetId.value) ?? ACCENT_PRESETS[0]),
		customColors: computed(() => customColors.value),
	}
}

/**
 * Sets the accent to a colour of someone's own choosing.
 *
 * The colour is remembered alongside the presets rather than as one of them,
 * because a list that could hold a hundred and fifty thousand entries is not a
 * list. The id becomes `custom`, which is what `apply` resolves through here.
 */
export function setCustomAccentColor(hex: string | null | undefined): void {
	const next = typeof hex === 'string' ? hex.trim().toLowerCase() : ''
	customColor.value = isAccentColor(next) ? next : DEFAULT_CUSTOM_ACCENT
	presetId.value = CUSTOM_ACCENT_ID
}

/**
 * Paints the interface in an accent without deciding on it.
 *
 * Used for previews — a colour under the pointer, a colour chosen but not yet
 * saved — and to put back the saved one afterwards. Nothing is written to the
 * settings here; that is the settings page's Save.
 */
export function showAccent(
	id: string | null | undefined,
	tint: boolean,
	hex?: string | null,
): void {
	if (id === CUSTOM_ACCENT_ID) {
		setCustomAccentColor(hex ?? customColor.value)
		tintBackground.value = tint
		return
	}
	setAccentPreset(id, tint)
}

/** Sets the accent without going through the settings tab — used at startup. */
/**
 * Keeps a colour of the person's own in the row under the picker.
 *
 * Keeping a colour is not choosing it: the accent changes only once the
 * settings are saved.
 *
 * The row of kept colours has room for a fixed number, and the number is
 * however many the row can show at once: a colour kept past that would push
 * the others onto a second line, and the row is meant to be one line.
 */
export const MAX_CUSTOM_ACCENT_COLORS = 8

export function addCustomAccentColor(hex: string | null | undefined): boolean {
	const color = hex?.trim().toLowerCase()
	if (!color || !isAccentColor(color)) return false
	if (customColors.value.length >= MAX_CUSTOM_ACCENT_COLORS) return false
	if (!customColors.value.includes(color)) {
		customColors.value = [...customColors.value, color]
		writeCache()
	}
	return true
}

export function removeCustomAccentColor(hex: string): void {
	customColors.value = customColors.value.filter((kept) => kept !== hex)
	writeCache()
}

export function setAccentPreset(id: string | null | undefined, tint = true): void {
	presetId.value =
		id === CUSTOM_ACCENT_ID
			? CUSTOM_ACCENT_ID
			: id && findAccentPreset(id)
				? id
				: DEFAULT_ACCENT_PRESET
	tintBackground.value = tint
}
