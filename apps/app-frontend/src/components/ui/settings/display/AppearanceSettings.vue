<script setup lang="ts">
import {
	AppearanceSettingsLayout,
	defineMessages,
	injectAuth,
	injectUserPreferences,
	provideAppearanceSettings,
	Toggle,
	useSavable,
	useVIntl,
} from '@modrinth/ui'
import { platform } from '@tauri-apps/plugin-os'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import NoctrinthBackgroundSettings from '@/components/ui/settings/display/NoctrinthBackgroundSettings.vue'
import {
	DEFAULT_ACCENT_PRESET,
	findAccentPreset,
	setAccentPreset,
	useAccentPreset,
} from '@/composables/use-accent.ts'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import { type ColorTheme, isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { type AppSettings, get, set } from '@/helpers/settings.ts'
import { appSettingsModalContextKey } from '@/providers/app-settings-modal'

import AccentColorWheel from './AccentColorWheel.vue'

const theme = useTheme()
const appSettings = useAppSettings()
const auth = injectAuth()
const { updatePreferences } = injectUserPreferences()
const settingsModal = inject(appSettingsModalContextKey, null)
const os = platform()
const accent = useAccentPreset()

// The accent lives in a store of its own that the picker repaints as you move
// through it, so what was saved has to be kept apart from it РІР‚вЂќ otherwise the
// preview would read back as the saved value and nothing would count as a
// change. Upstream keeps the theme apart the same way, through `theme.preview`.
const savedAccent = ref({
	preset: findAccentPreset(accent.id.value)?.id ?? DEFAULT_ACCENT_PRESET,
	tint: accent.tintBackground.value,
})

const { formatMessage } = useVIntl()

const messages = defineMessages({
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
	accentTintDescription: {
		id: 'app.appearance-settings.accent-tint.description',
		defaultMessage:
			"Gives the app's greys РІР‚вЂќ its backgrounds and its panels РІР‚вЂќ a faint cast of the same colour. The accent, the sidebar and the loading bar follow the preset either way.",
	},
})

type AppearanceSettingsState = {
	theme: ColorTheme
	syncAcrossDevices: boolean
	advancedRendering: boolean
	nativeDecorations: boolean
	accentPreset: string
	accentTintBackground: boolean
}

function getAppearanceSettingsState(): AppearanceSettingsState {
	return {
		theme: theme.preferred,
		syncAcrossDevices: theme.syncAcrossDevices,
		advancedRendering: theme.advancedRendering,
		nativeDecorations: appSettings.nativeDecorations,
		accentPreset: savedAccent.value.preset,
		accentTintBackground: savedAccent.value.tint,
		accentColor: accent.customColor.value,
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
		}

		await set(nextSettings)
		if (isDarkTheme(value.theme)) {
			theme.preferredDark = value.theme
		}
		theme.preferred = value.theme
		theme.syncAcrossDevices = value.syncAcrossDevices
		theme.advancedRendering = value.advancedRendering
		appSettings.nativeDecorations = value.nativeDecorations
		savedAccent.value = { preset: value.accentPreset, tint: value.accentTintBackground }
	},
)

const themeOptions = computed(() =>
	theme.options.filter(
		(option) => option !== 'retro' || appSettings.devMode || current.value.theme === 'retro',
	),
)

const preferredDarkTheme = computed(() =>
	isDarkTheme(current.value.theme) ? current.value.theme : theme.preferredDark,
)

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
// saved РІР‚вЂќ which `useSavable` has already restored into `saved` by then.
watch([() => current.value.accentPreset, () => current.value.accentTintBackground], ([id, tint]) =>
	setAccentPreset(id, tint),
)

watch(
	[() => current.value.theme, () => saved.value.theme],
	([selectedTheme, savedTheme]) => {
		theme.preview = selectedTheme === savedTheme ? null : selectedTheme
	},
	{ immediate: true },
)

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
	setAccentPreset(saved.value.accentPreset, saved.value.accentTintBackground)
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

	<!-- Noctrinth's own: the shared layout has no notion of an accent that can
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
		<AccentColorWheel v-model="current.accentColor" />

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
	</div>

	<NoctrinthBackgroundSettings />
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
