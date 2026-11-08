<script setup lang="ts">
import { CheckIcon, DropdownIcon, PlusIcon, XIcon } from '@modrinth/assets'
import {
	AppearanceSettingsLayout,
	ColorPicker,
	Collapsible,
	Combobox,
	commonMessages,
	defineMessages,
	injectAuth,
	injectUserPreferences,
	provideAppearanceSettings,
	Slider,
	Toggle,
	useSavable,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { platform } from '@tauri-apps/plugin-os'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
	ACCENT_PRESETS,
	accentColorFor,
	accentGradientAnimated,
	accentGradientSpeed,
	addCustomAccentColor,
	CUSTOM_ACCENT_ID,
	DEFAULT_ACCENT_PRESET,
	findAccentPreset,
	iconsAccent,
	MAX_ACCENT_GRADIENT_STOPS,
	MAX_CUSTOM_ACCENT_COLORS,
	removeCustomAccentColor,
	setAccentGradientAnimated,
	setAccentGradientSpeed,
	setIconsAccent,
	showAccent,
	useAccentPreset,
} from '@/composables/use-accent.ts'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import {
	FONT_PRESETS,
	fontFamilyCss,
	installedFontFamilies,
	setInterfaceFont,
	useInterfaceFont,
} from '@/composables/use-font.ts'
import { type ColorTheme, isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { injectAppSettingsModal } from '@/features/settings/app-settings-modal/context'
import PortalrinthBackgroundSettings from '@/features/settings/display/PortalrinthBackgroundSettings.vue'
import type { ThemeAccent } from '@/helpers/portalrinth-themes'
import { type AppSettings, get, set } from '@/helpers/settings.ts'

const theme = useTheme()

/** The colour the wheel is on. It is not the accent until it is chosen. */
const pickedColor = ref('#c1121f')

/**
 * A colour chosen with the tick, or one of the kept ones clicked.
 *
 * Choosing is not saving: the colour becomes the pending accent, the interface
 * shows it, and the Save / Reset bar decides whether it stays - the same as
 * every other setting here. It is also kept in the row, so it can be found
 * again; a colour past the limit is simply not kept.
 */
function onColourPicked(color: string): void {
	pickedColor.value = color
	if (!addCustomAccentColor(color)) {
		console.warn('The row of accent colours is full.')
	}
	current.value.accentColor = color
	current.value.accentPreset = CUSTOM_ACCENT_ID
}

/** Shows a colour under the pointer without choosing it. */
function previewAccent(preset: string, color?: string | null): void {
	showAccent(preset, current.value.accentTintBackground, color ?? current.value.accentColor)
}

/** Puts back whatever is pending once the pointer has moved on. */
function endAccentPreview(): void {
	showAccent(
		current.value.accentPreset,
		current.value.accentTintBackground,
		current.value.accentColor,
	)
}

/**
 * Lets a kept colour go straight from the row, without opening the picker.
 * The accent itself is stored apart from the row, so it is left as it is.
 */
function removeKeptColour(color: string): void {
	removeCustomAccentColor(color)
}

function onPickerPreview(color: string | null): void {
	if (color) previewAccent(CUSTOM_ACCENT_ID, color)
	else endAccentPreview()
}

function onCustomColoursChanged(colors: string[]): void {
	for (const color of accent.customColors.value) {
		if (!colors.includes(color)) removeCustomAccentColor(color)
	}
	for (const color of colors) {
		addCustomAccentColor(color)
	}
}

const appSettings = useAppSettings()
const auth = injectAuth()
const { updatePreferences } = injectUserPreferences()
const settingsModal = injectAppSettingsModal()
const os = platform()
const accent = useAccentPreset()
const interfaceFont = useInterfaceFont()

// Kept apart from the live font for the same reason as the accent.
const savedFont = ref(interfaceFont.value)

/** The run of accent colours set moving, switched on and kept at once. */
const gradientAnimated = computed({
	get: () => accentGradientAnimated.value,
	set: setAccentGradientAnimated,
})

/** Whether the brand icons and our mark wear the accent, switched at once. */
const iconsAccentMode = computed({
	get: () => iconsAccent.value,
	set: setIconsAccent,
})

/** How fast the run pours: one walk of the gradient in seconds. */
const gradientSpeed = computed({
	get: () => accentGradientSpeed.value,
	set: setAccentGradientSpeed,
})

// The accent lives in a store of its own that the picker repaints as you move
// through it, so what was saved has to be kept apart from it ╨а╨Ж╨атАЪ╨▓╨В╤Ь otherwise the
// preview would read back as the saved value and nothing would count as a
// change. Upstream keeps the theme apart the same way, through `theme.preview`.
const savedAccent = ref({
	preset:
		accent.id.value === CUSTOM_ACCENT_ID
			? CUSTOM_ACCENT_ID
			: (findAccentPreset(accent.id.value)?.id ?? DEFAULT_ACCENT_PRESET),
	tint: accent.tintBackground.value,
	color: accent.customColor.value,
})

const { formatMessage } = useVIntl()

const messages = defineMessages({
	accentPickTitle: {
		id: 'app.appearance-settings.accent.pick',
		defaultMessage: 'Pick an accent colour',
	},
	accentMyColoursTitle: {
		id: 'app.appearance-settings.accent.my-colours',
		defaultMessage: 'My accent colours',
	},
	accentKeepColour: {
		id: 'app.appearance-settings.accent.keep-colour',
		defaultMessage: 'Keep this colour',
	},
	accentRemoveColour: {
		id: 'app.appearance-settings.accent.remove-colour',
		defaultMessage: 'Remove this colour',
	},
	accentTooManyColours: {
		id: 'app.appearance-settings.accent.too-many-colours',
		defaultMessage: 'The row is full - remove one of your colours first',
	},
	accentSolid: { id: 'app.appearance-settings.accent.solid', defaultMessage: 'Colour' },
	accentGradient: { id: 'app.appearance-settings.accent.gradient', defaultMessage: 'Gradient' },
	accentAddStop: {
		id: 'app.appearance-settings.accent.add-stop',
		defaultMessage: 'Add a colour to the gradient',
	},
	accentRemoveStop: {
		id: 'app.appearance-settings.accent.remove-stop',
		defaultMessage: 'Remove from the gradient',
	},
	accentApply: { id: 'app.appearance-settings.accent.apply', defaultMessage: 'Use it' },
	accentUseColour: {
		id: 'app.appearance-settings.accent.use-colour',
		defaultMessage: 'Use {color}',
	},
	accentTitle: {
		id: 'app.appearance-settings.accent.title',
		defaultMessage: 'Accent colour',
	},
	accentDescription: {
		id: 'app.appearance-settings.accent.description',
		defaultMessage:
			'The colour the interface is picked out in. Each one is drawn deeper on light themes and brighter on dark ones.',
	},
	accentTintTitle: {
		id: 'app.appearance-settings.accent-tint.title',
		defaultMessage: 'Tint the background too',
	},
	accentShimmerTitle: {
		id: 'app.appearance-settings.accent.gradient-shimmer.title',
		defaultMessage: 'Shimmering gradient',
	},
	accentShimmerSpeedTitle: {
		id: 'app.appearance-settings.accent.gradient-speed.title',
		defaultMessage: 'Pour speed',
	},
	accentShimmerSpeedDescription: {
		id: 'app.appearance-settings.accent.gradient-speed.description',
		defaultMessage: 'One walk of the gradient takes {seconds} s.',
	},
	accentShimmerDescription: {
		id: 'app.appearance-settings.accent.gradient-shimmer.description',
		defaultMessage: 'The colours of a gradient accent slowly move across what they fill.',
	},
	fontTitle: {
		id: 'app.appearance-settings.font.title',
		defaultMessage: 'Interface font',
	},
	fontDescription: {
		id: 'app.appearance-settings.font.description',
		defaultMessage:
			'The typeface the app is set in. A letter the chosen font does not have is drawn in Inter.',
	},
	fontDefault: { id: 'app.appearance-settings.font.default', defaultMessage: 'Inter' },
	fontSystem: { id: 'app.appearance-settings.font.system', defaultMessage: 'System' },
	fontMinecraft: { id: 'app.appearance-settings.font.minecraft', defaultMessage: 'Minecraft' },
	fontCustom: { id: 'app.appearance-settings.font.custom', defaultMessage: 'Custom' },
	fontDefaultBadge: {
		id: 'app.appearance-settings.font.default.badge',
		defaultMessage: 'Default',
	},
	fontCustomPlaceholder: {
		id: 'app.appearance-settings.font.custom.placeholder',
		defaultMessage: 'Choose a font installed on this computer',
	},
	fontCustomSearch: {
		id: 'app.appearance-settings.font.custom.search',
		defaultMessage: 'Search fonts',
	},
	fontCustomNone: {
		id: 'app.appearance-settings.font.custom.none',
		defaultMessage: 'No installed font is called that',
	},
	iconsAccentTitle: {
		id: 'app.appearance-settings.accent-icons.title',
		defaultMessage: 'All icons in the accent',
	},
	iconsAccentDescription: {
		id: 'app.appearance-settings.accent-icons.description',
		defaultMessage:
			'The Modrinth and CurseForge icons and our mark - in the title bar and on the desktop - take the accent\u2019s colour. A gradient gives them its first colour. Account icons keep their own.',
	},
	accentTintDescription: {
		id: 'app.appearance-settings.accent-tint.description',
		defaultMessage:
			"Gives the app's greys ╨а╨Ж╨атАЪ╨▓╨В╤Ь its backgrounds and its panels ╨а╨Ж╨атАЪ╨▓╨В╤Ь a faint cast of the same colour. The accent, the sidebar and the loading bar follow the preset either way.",
	},
})

type AppearanceSettingsState = {
	interfaceFont: string
	theme: ColorTheme
	syncAcrossDevices: boolean
	advancedRendering: boolean
	nativeDecorations: boolean
	accentPreset: string
	accentTintBackground: boolean
	accentColor: string
}

function getAppearanceSettingsState(): AppearanceSettingsState {
	return {
		theme: theme.preferred,
		syncAcrossDevices: theme.syncAcrossDevices,
		advancedRendering: theme.advancedRendering,
		nativeDecorations: appSettings.nativeDecorations,
		accentPreset: savedAccent.value.preset,
		accentTintBackground: savedAccent.value.tint,
		accentColor: savedAccent.value.color,
		interfaceFont: savedFont.value,
	}
}

const { saved, current, changes, saving, hasChanges, reset, save } = useSavable(
	getAppearanceSettingsState,
	async (appearanceChanges) => {
		const value = current.value
		if (
			value.syncAcrossDevices &&
			auth.user.value &&
			(appearanceChanges.theme !== undefined || appearanceChanges.syncAcrossDevices !== undefined)
		) {
			await updatePreferences({
				appearance: value.theme === 'system' ? { auto: true } : { auto: false, theme: value.theme },
			})
		}

		const nextSettings: AppSettings = {
			...(await get()),
			theme: value.theme,
			sync_theme_across_devices: value.syncAcrossDevices,
			advanced_rendering: value.advancedRendering,
			native_decorations: value.nativeDecorations,
			accent_preset: value.accentPreset,
			accent_tint_background: value.accentTintBackground,
			accent_custom_color: value.accentColor,
			interface_font: value.interfaceFont.trim(),
		}

		await set(nextSettings)
		if (isDarkTheme(value.theme)) {
			theme.preferredDark = value.theme
		}
		theme.preferred = value.theme
		theme.syncAcrossDevices = value.syncAcrossDevices
		theme.advancedRendering = value.advancedRendering
		appSettings.nativeDecorations = value.nativeDecorations
		savedAccent.value = {
			preset: value.accentPreset,
			tint: value.accentTintBackground,
			color: value.accentColor,
		}
		savedFont.value = value.interfaceFont.trim()
	},
)

// Names for the colour circles, so the tooltip says what the colour is called
// rather than leaving a colour with no name at all.
const presetNames = {
	theme: { id: 'app.appearance-settings.accent.theme', defaultMessage: 'Theme' },
	crimson: { id: 'app.appearance-settings.accent.crimson', defaultMessage: 'Crimson' },
	blood: { id: 'app.appearance-settings.accent.blood', defaultMessage: 'Blood' },
	ember: { id: 'app.appearance-settings.accent.ember', defaultMessage: 'Ember' },
	sunset: { id: 'app.appearance-settings.accent.sunset', defaultMessage: 'Sunset' },
	amethyst: { id: 'app.appearance-settings.accent.amethyst', defaultMessage: 'Amethyst' },
	nightshade: { id: 'app.appearance-settings.accent.nightshade', defaultMessage: 'Nightshade' },
	midnight: { id: 'app.appearance-settings.accent.midnight', defaultMessage: 'Midnight' },
	glacier: { id: 'app.appearance-settings.accent.glacier', defaultMessage: 'Glacier' },
	verdant: { id: 'app.appearance-settings.accent.verdant', defaultMessage: 'Verdant' },
	moss: { id: 'app.appearance-settings.accent.moss', defaultMessage: 'Moss' },
	lantern: { id: 'app.appearance-settings.accent.lantern', defaultMessage: 'Lantern' },
	rose: { id: 'app.appearance-settings.accent.rose', defaultMessage: 'Rose' },
}

const themeOptions = computed(() =>
	theme.options.filter(
		(option) => option !== 'retro' || appSettings.devMode || current.value.theme === 'retro',
	),
)

const preferredDarkTheme = computed(() =>
	isDarkTheme(current.value.theme) ? current.value.theme : theme.preferredDark,
)

const fontOptions = computed(() => [
	{ id: '', label: formatMessage(messages.fontDefault), family: 'Inter', isDefault: true },
	{ id: 'system', label: formatMessage(messages.fontSystem), family: 'system-ui' },
	{
		id: 'minecraft',
		label: formatMessage(messages.fontMinecraft),
		family: fontFamilyCss('minecraft'),
	},
])

const customFontSelected = computed(
	() => !(FONT_PRESETS as readonly string[]).includes(current.value.interfaceFont),
)
// The picker stays open while Custom is chosen, and can be opened before a font
// is picked, without the app changing font until one is.
const customFontOpen = ref(customFontSelected.value)
const installedFonts = useQuery({
	queryKey: ['portalrinth', 'installed-font-families'],
	queryFn: installedFontFamilies,
	enabled: customFontOpen,
	staleTime: Infinity,
})
const installedFontOptions = computed(() =>
	(installedFonts.data.value ?? []).map((family) => ({ label: family, value: family })),
)

function chooseFont(id: string): void {
	customFontOpen.value = false
	current.value.interfaceFont = id
}

function setTheme(value: ColorTheme): void {
	current.value.theme = value
}

function setSyncAcrossDevices(enabled: boolean): void {
	current.value.syncAcrossDevices = enabled
}

function setAdvancedRendering(enabled: boolean): void {
	current.value.advancedRendering = enabled
}

function setNativeDecorations(enabled: boolean): void {
	current.value.nativeDecorations = enabled
}

// The accent is previewed the same way the theme is: the whole app recolours
// while the slider moves, and closing the tab without saving puts back what was
// saved тАФ which `useSavable` has already restored into `saved` by then.
watch(
	[
		() => current.value.accentPreset,
		() => current.value.accentTintBackground,
		() => current.value.accentColor,
	],
	([id, tint, color]) => showAccent(id, tint, color),
)

// The font is previewed the same way the accent is: the whole app redraws in
// it while the picker is open, and closing the tab without saving puts back
// what was saved.
watch(
	() => current.value.interfaceFont,
	(name) => setInterfaceFont(name),
)

watch(
	[() => current.value.theme, () => saved.value.theme],
	([selectedTheme, savedTheme]) => {
		theme.preview = selectedTheme === savedTheme ? null : selectedTheme
	},
	{ immediate: true },
)

/** A saved theme's accent, put back and kept at once, as its background is. */
async function applyThemeAccent(accent: ThemeAccent): Promise<void> {
	current.value.accentPreset = accent.preset
	current.value.accentTintBackground = accent.tint
	current.value.accentColor = accent.color
	await saveAppearanceSettings()
}

async function saveAppearanceSettings(): Promise<void> {
	try {
		await save()
	} catch {
		return
	}
}

onMounted(() => {
	settingsModal?.registerUnsavedChangesController({
		hasChanges: () => hasChanges.value,
		getOriginal: () => saved.value,
		getModified: () => changes.value,
		isSaving: () => saving.value,
		reset,
		save: saveAppearanceSettings,
	})
})

onBeforeUnmount(() => {
	theme.preview = null
	showAccent(saved.value.accentPreset, saved.value.accentTintBackground, saved.value.accentColor)
	setInterfaceFont(saved.value.interfaceFont)
	settingsModal?.registerUnsavedChangesController(null)
})

provideAppearanceSettings({
	deferPersistence: true,
	theme: {
		current: computed(() => current.value.theme),
		options: themeOptions,
		system: computed(() => (theme.native === 'light' ? 'light' : preferredDarkTheme.value)),
		preferredDark: preferredDarkTheme,
		set: setTheme,
		syncAcrossDevices: {
			value: computed(() => current.value.syncAcrossDevices),
			set: setSyncAcrossDevices,
		},
		syncDisabled: computed(() => !auth.user.value),
	},
	advancedRendering: {
		value: computed(() => current.value.advancedRendering),
		set: setAdvancedRendering,
	},
	nativeDecorations:
		os !== 'macos'
			? {
					value: computed(() => current.value.nativeDecorations),
					set: setNativeDecorations,
				}
			: undefined,
	updatePreferences,
})
</script>

<template>
	<AppearanceSettingsLayout />

	<!-- Portalrinth's own: the shared layout has no notion of an accent that can
	     be chosen, so the picker is added here rather than to it. -->
	<div class="mt-6 flex flex-col gap-3">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.accentTitle) }}
			</h2>
			<p class="m-0 mt-1 text-secondary">
				{{ formatMessage(messages.accentDescription) }}
			</p>
		</div>
		<!--
			The colours as themselves: a circle of the colour, named by nothing.
			Someone who wants the interface to be a particular colour should be
			able to see that colour rather than read its name, and a row of names
			cannot show twelve of them at once without becoming a list.
		-->
		<div class="flex flex-wrap items-center gap-2">
			<button
				v-for="preset in ACCENT_PRESETS"
				:key="preset.id"
				type="button"
				:title="formatMessage(presetNames[preset.id] ?? preset.name)"
				:aria-label="formatMessage(presetNames[preset.id] ?? preset.name)"
				:aria-pressed="current.accentPreset === preset.id"
				class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 motion-reduce:transition-none"
				:class="
					current.accentPreset === preset.id ? 'border-contrast scale-110' : 'border-transparent'
				"
				:style="{ background: accentColorFor(preset, theme.active) }"
				@click="current.accentPreset = preset.id"
			/>
		</div>

		<!--
			And a way to put a colour nothing else offers. The empty circle is
			what opens the wheel: the wheel is a picture of every colour at
			once, and a row of letters asking for one is not the same thing.
			Whatever is picked is kept underneath, so it is there next time
			without being looked for again.
		-->
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<div
				v-for="color in accent.customColors.value"
				:key="color"
				class="custom-accent group relative h-8 w-8"
			>
				<button
					type="button"
					class="h-8 w-8 cursor-pointer rounded-full border-2 p-0 transition-transform hover:scale-110"
					:class="
						current.accentPreset === CUSTOM_ACCENT_ID && current.accentColor === color
							? 'border-contrast scale-110'
							: 'border-transparent'
					"
					:style="{ background: color }"
					:aria-label="formatMessage(messages.accentUseColour, { color })"
					:aria-pressed="current.accentPreset === CUSTOM_ACCENT_ID && current.accentColor === color"
					@click="onColourPicked(color)"
					@contextmenu.prevent="removeKeptColour(color)"
				/>
				<button
					type="button"
					class="custom-accent__remove absolute -right-1 -top-1 grid size-4 cursor-pointer place-items-center rounded-full border-none bg-surface-4 p-0 text-secondary opacity-0 shadow transition-opacity hover:text-contrast focus-visible:opacity-100 group-hover:opacity-100"
					:title="formatMessage(messages.accentRemoveColour)"
					:aria-label="formatMessage(messages.accentRemoveColour)"
					@click.stop="removeKeptColour(color)"
				>
					<XIcon class="size-3" />
				</button>
			</div>
			<ColorPicker
				v-model="pickedColor"
				inline
				:label="formatMessage(messages.accentPickTitle)"
				:custom-colors="accent.customColors.value"
				:custom-colors-label="formatMessage(messages.accentMyColoursTitle)"
				:custom-colors-add-label="formatMessage(messages.accentKeepColour)"
				:custom-colors-remove-label="formatMessage(messages.accentRemoveColour)"
				:custom-colors-full-label="formatMessage(messages.accentTooManyColours)"
				:custom-colors-limit="MAX_CUSTOM_ACCENT_COLORS"
				allow-gradient
				:max-stops="MAX_ACCENT_GRADIENT_STOPS"
				:solid-label="formatMessage(messages.accentSolid)"
				:gradient-label="formatMessage(messages.accentGradient)"
				:add-stop-label="formatMessage(messages.accentAddStop)"
				:remove-stop-label="formatMessage(messages.accentRemoveStop)"
				:apply-label="formatMessage(messages.accentApply)"
				class="!h-8 !w-8 !rounded-full"
				@update:model-value="onColourPicked"
				@preview="onPickerPreview"
				@update:custom-colors="onCustomColoursChanged"
			>
				<template #trigger>
					<span
						class="grid size-full place-items-center rounded-full border-2 border-dashed border-surface-5 text-secondary transition-colors hover:text-contrast"
						aria-hidden="true"
					>
						<PlusIcon class="size-4" />
					</span>
				</template>
			</ColorPicker>
		</div>

		<div class="mt-3 flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h3 id="accent-tint-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.accentTintTitle) }}
				</h3>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.accentTintDescription) }}
				</p>
			</div>
			<Toggle
				id="accent-tint"
				v-model="current.accentTintBackground"
				aria-labelledby="accent-tint-label"
				:disabled="current.accentPreset === DEFAULT_ACCENT_PRESET"
			/>
		</div>
		<!--
			And whether the run of colours moves once it is on. It takes effect as
			soon as it is switched, like the background's own settings do; the run
			itself is still the picker's to choose.
		-->
		<div class="mt-3 flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h3 id="accent-gradient-shimmer-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.accentShimmerTitle) }}
				</h3>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.accentShimmerDescription) }}
				</p>
			</div>
			<Toggle
				id="accent-gradient-shimmer"
				v-model="gradientAnimated"
				aria-labelledby="accent-gradient-shimmer-label"
			/>
		</div>
		<div v-if="gradientAnimated" class="mt-3 flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h3 id="accent-shimmer-speed-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.accentShimmerSpeedTitle) }}
				</h3>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.accentShimmerSpeedDescription, { seconds: gradientSpeed }) }}
				</p>
			</div>
			<Slider
				id="accent-shimmer-speed"
				v-model="gradientSpeed"
				:min="1"
				:max="30"
				:step="1"
				unit="s"
				aria-labelledby="accent-shimmer-speed-label"
			/>
		</div>
		<div class="mt-3 flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h3 id="accent-icons-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.iconsAccentTitle) }}
				</h3>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.iconsAccentDescription) }}
				</p>
			</div>
			<Toggle id="accent-icons" v-model="iconsAccentMode" aria-labelledby="accent-icons-label" />
		</div>
	</div>

	<!-- Portalrinth's own: the shared layout has no notion of a font that can
	     be chosen, so the picker is added here rather than to it. -->
	<div class="mt-6 flex flex-col gap-3">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.fontTitle) }}
			</h2>
			<p class="m-0 mt-1 text-secondary">
				{{ formatMessage(messages.fontDescription) }}
			</p>
		</div>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
			<button
				v-for="option in fontOptions"
				:key="option.id"
				type="button"
				class="accent-option flex items-center gap-3 rounded-xl border border-solid border-button-border bg-button-bg p-3 text-left"
				:class="{
					'accent-option--selected': !customFontOpen && current.interfaceFont === option.id,
				}"
				:aria-pressed="!customFontOpen && current.interfaceFont === option.id"
				@click="chooseFont(option.id)"
			>
				<span class="flex min-w-0 flex-col">
					<span
						class="truncate text-lg font-medium text-contrast"
						:style="{ fontFamily: `${option.family}, Inter, sans-serif` }"
						>{{ option.label }}</span
					>
					<span v-if="option.isDefault" class="text-xs text-secondary">{{
						formatMessage(messages.fontDefaultBadge)
					}}</span>
				</span>
				<CheckIcon
					v-if="!customFontOpen && current.interfaceFont === option.id"
					class="ml-auto size-4 shrink-0 text-contrast"
				/>
			</button>
			<button
				type="button"
				class="accent-option flex items-center gap-3 rounded-xl border border-solid border-button-border bg-button-bg p-3 text-left"
				:class="{ 'accent-option--selected': customFontOpen }"
				:aria-pressed="customFontSelected"
				:aria-expanded="customFontOpen"
				@click="customFontOpen = !customFontOpen || !customFontSelected"
			>
				<span
					class="truncate text-lg font-medium text-contrast"
					:style="
						customFontSelected
							? { fontFamily: `${fontFamilyCss(current.interfaceFont)}, Inter, sans-serif` }
							: undefined
					"
					>{{
						customFontSelected ? current.interfaceFont : formatMessage(messages.fontCustom)
					}}</span
				>
				<DropdownIcon
					class="ml-auto size-4 shrink-0 text-secondary transition-transform"
					:class="{ 'rotate-180': customFontOpen }"
					aria-hidden="true"
				/>
			</button>
		</div>

		<Collapsible :collapsed="!customFontOpen" overflow-visible>
			<Combobox
				class="mt-1"
				:model-value="customFontSelected ? current.interfaceFont : undefined"
				:options="installedFontOptions"
				:placeholder="formatMessage(messages.fontCustomPlaceholder)"
				:search-placeholder="formatMessage(messages.fontCustomSearch)"
				:no-options-message="
					installedFonts.isPending.value
						? formatMessage(commonMessages.loadingLabel)
						: formatMessage(messages.fontCustomNone)
				"
				:max-height="320"
				searchable
				listbox
				@update:model-value="(family?: string) => family && (current.interfaceFont = family)"
			>
				<template #option="{ item, isSelected }">
					<span
						class="truncate text-base"
						:class="isSelected ? 'text-brand' : 'text-primary'"
						:style="{ fontFamily: `${fontFamilyCss(item.value)}, Inter, sans-serif` }"
						>{{ item.label }}</span
					>
				</template>
			</Combobox>
		</Collapsible>
	</div>

	<PortalrinthBackgroundSettings
		:accent="{
			preset: current.accentPreset,
			tint: current.accentTintBackground,
			color: current.accentColor,
		}"
		@apply-accent="applyThemeAccent"
	/>
</template>

<style scoped>
.accent-option {
	transition:
		border-color 150ms ease,
		box-shadow 150ms ease;
}

.accent-option:hover {
	border-color: var(--accent-swatch);
}

.accent-option--selected {
	border-color: var(--accent-swatch);
	box-shadow: 0 0 0 1px var(--accent-swatch);
}

.accent-option__swatch {
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	flex-shrink: 0;
	border-radius: 999px;
	background: var(--accent-swatch);
}
</style>
