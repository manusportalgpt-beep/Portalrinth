<script setup lang="ts">
import {
	defineMessages,
	injectAuth,
	injectNotificationManager,
	injectUserPreferences,
	Slider,
	Toggle,
	useSavable,
	useVIntl,
} from '@modrinth/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, onMounted } from 'vue'

import { useAppSettings } from '@/composables/use-app-settings.ts'
import {
	QUICK_INSTANCE_LIMIT_MAX,
	useQuickInstanceLimit,
} from '@/composables/use-quick-instance-limit.ts'
import { injectAppSettingsModal } from '@/features/settings/app-settings-modal/context'
import { type GlobalSyncedOptions, set_global_synced_option } from '@/helpers/instance.ts'
import {
	BROWSE_PAGE_SIZES,
	browsePageSize,
	type BrowseScrollScope,
	browseScrollScope,
} from '@/helpers/portalrinth-browse.ts'
import { portalrinthFeatures } from '@/helpers/portalrinth-features'
import {
	type AppSettings,
	appSettingsKeys,
	appSettingsQueryOptions,
	get,
	set,
} from '@/helpers/settings.ts'
import { globalSyncedOptionsQueryOptions, syncedOptionsKeys } from '@/helpers/synced-options'
import { screenshotKeys } from '@/pages/instance/query-options.ts'

const appSettings = useAppSettings()
const { formatMessage } = useVIntl()
const auth = injectAuth()
const { handleError } = injectNotificationManager()
const { updatePreferences } = injectUserPreferences()
const settingsModal = injectAppSettingsModal()
const quickInstances = useQuickInstanceLimit()
const queryClient = useQueryClient()

const messages = defineMessages({
	scrollPagesTitle: {
		id: 'app.features.browse.scroll-pages.title',
		defaultMessage: 'Long pages',
	},
	scrollPagesDescription: {
		id: 'app.features.browse.scroll-pages.description',
		defaultMessage:
			'The list of results is one long scroll that loads as you go down, instead of pages with a number under them.',
	},
	scrollScopeOff: {
		id: 'app.features.browse.scroll-pages.scope.off',
		defaultMessage: 'Off',
	},
	scrollScopeDiscover: {
		id: 'app.features.browse.scroll-pages.scope.discover',
		defaultMessage: 'Discover',
	},
	scrollScopeBoth: {
		id: 'app.features.browse.scroll-pages.scope.both',
		defaultMessage: 'Discover and Find projects',
	},
	pageSizeTitle: {
		id: 'app.features.browse.page-size.title',
		defaultMessage: 'Results on a page',
	},
	pageSizeDescription: {
		id: 'app.features.browse.page-size.description',
		defaultMessage:
			'How many results are on a page. More of them means fewer pages, since the same list is divided up differently.',
	},
	syncAcrossDevicesTitle: {
		id: 'app.features-settings.sync-across-devices.title',
		defaultMessage: 'Sync features across devices',
	},
	syncAcrossDevicesDescription: {
		id: 'app.features-settings.sync-across-devices.description',
		defaultMessage:
			"Use these feature settings everywhere you're signed in. Turn this off to keep separate settings on this device.",
	},
	syncAcrossDevicesSignedOutTooltip: {
		id: 'app.features-settings.sync-across-devices.signed-out-tooltip',
		defaultMessage: 'Sign into a Modrinth account to sync settings.',
	},
	instancePagesTitle: {
		id: 'app.features-settings.instance-pages.title',
		defaultMessage: 'Instances',
	},
	showWorldsTabTitle: {
		id: 'app.features-settings.show-worlds-tab.title',
		defaultMessage: 'Show Worlds tab in instances',
	},
	showFilesTabTitle: {
		id: 'app.features-settings.show-files-tab.title',
		defaultMessage: 'Show Files tab in instances',
	},
	showScreenshotsTabTitle: {
		id: 'app.features-settings.show-screenshots-tab.title',
		defaultMessage: 'Show Screenshots tab in instances',
	},
	sidebarTitle: {
		id: 'app.features-settings.sidebar.title',
		defaultMessage: 'Sidebar',
	},
	showAllScreenshotsTitle: {
		id: 'app.features-settings.show-all-screenshots.title',
		defaultMessage: 'Show all screenshots in sidebar',
	},
	showAllScreenshotsDescription: {
		id: 'app.features-settings.show-all-screenshots.description',
		defaultMessage:
			'Show a button in the left sidebar to view screenshots from all your instances.',
	},
	showSkinSelectorTitle: {
		id: 'app.features-settings.show-skin-selector.title',
		defaultMessage: 'Show skin selector in sidebar',
	},
	showSkinSelectorDescription: {
		id: 'app.features-settings.show-skin-selector.description',
		defaultMessage: 'Show a button in the left sidebar to open the skin selector.',
	},
	quickInstancesTitle: {
		id: 'app.features-settings.quick-instances.title',
		defaultMessage: 'Quick instances in sidebar',
	},
	quickInstancesDescription: {
		id: 'app.features-settings.quick-instances.description',
		defaultMessage:
			'Choose the maximum number of recent instances shown in the left sidebar. You can also adjust this by dragging the divider.',
	},
	playPageTitle: {
		id: 'app.features-settings.play-page.title',
		defaultMessage: 'Play page',
	},
	showJumpInTitle: {
		id: 'app.features-settings.show-jump-in.title',
		defaultMessage: 'Show Jump in section',
	},
	showJumpInDescription: {
		id: 'app.features-settings.show-jump-in.description',
		defaultMessage: 'Show recently played worlds and instances at the top of the Play page.',
	},
	widgetsTitle: {
		id: 'app.widgets.title',
		defaultMessage: 'Виджеты и функции',
	},
	clockTitle: {
		id: 'app.widgets.clock.title',
		defaultMessage: 'Часы сверху',
	},
	clockDescription: {
		id: 'app.widgets.clock.description',
		defaultMessage:
			'Время по системному региону в центре титл-бара: солнце днём, луна ночью, рассвет и закат.',
	},
	aiLinksTitle: {
		id: 'app.features.ai-links.title',
		defaultMessage: 'Ссылки ИИ — во встроенный браузер',
	},
	aiLinksDescription: {
		id: 'app.features.ai-links.description',
		defaultMessage:
			'Внешние ссылки из чата Порталуса открываются в окне лаунчера, а не в браузере системы (по умолчанию выключено).',
	},
	weatherTitle: {
		id: 'app.widgets.weather.title',
		defaultMessage: 'Погода',
	},
	weatherDescription: {
		id: 'app.widgets.weather.description',
		defaultMessage:
			'Облачко у иконок сверху: регион игрока и погода. Можно добавить несколько городов и переключаться между ними (Open-Meteo, без ключа).',
	},
})

/**
 * Where the long scroll is used.
 *
 * A computed rather than a plain list, because it reads the messages, and
 * the messages are declared further down: a plain list would reach for them
 * before they exist.
 */
const scrollScopes = computed<
	{ id: BrowseScrollScope; label: { id: string; defaultMessage: string } }[]
>(() => [
	{ id: 'off', label: messages.scrollScopeOff },
	{ id: 'discover', label: messages.scrollScopeDiscover },
	{ id: 'both', label: messages.scrollScopeBoth },
])

type FeaturesSettingsState = {
	syncFeaturesAcrossDevices: boolean
	showFilesTab: boolean
	showWorldsTab: boolean
	showScreenshotsTab: boolean
	showAllScreenshots: boolean
	showSkinSelector: boolean
	quickInstanceCount: number
	showJumpIn: boolean
}

const settingsQuery = useQuery(appSettingsQueryOptions())
const globalOptionsQuery = useQuery(globalSyncedOptionsQueryOptions())
await Promise.all([settingsQuery.suspense(), globalOptionsQuery.suspense()])

function getFeaturesSettingsState(
	settings: AppSettings,
	globalSyncedOptions: GlobalSyncedOptions,
): FeaturesSettingsState {
	return {
		syncFeaturesAcrossDevices: settings.sync_features_across_devices,
		showFilesTab: settings.show_files_tab_in_instances,
		showWorldsTab: settings.show_worlds_tab_in_instances,
		showScreenshotsTab: settings.show_screenshots_tab_in_instances,
		showAllScreenshots: globalSyncedOptions.screenshots,
		showSkinSelector: settings.show_skin_selector_in_sidebar,
		quickInstanceCount: quickInstances.limit.value ?? QUICK_INSTANCE_LIMIT_MAX,
		showJumpIn: settings.show_jump_in,
	}
}

const settingsMutation = useMutation({
	mutationKey: appSettingsKeys.update,
	scope: { id: 'app-settings' },
	mutationFn: async ({
		value,
		updateQuickInstanceCount,
	}: {
		value: FeaturesSettingsState
		updateQuickInstanceCount: boolean
	}) => {
		if (value.syncFeaturesAcrossDevices && auth.user.value) {
			await updatePreferences({
				behavior: {
					show_jump_in: value.showJumpIn,
					show_files_tab_in_instances: value.showFilesTab,
					show_worlds_tab_in_instances: value.showWorldsTab,
					show_screenshots_tab_in_instances: value.showScreenshotsTab,
					show_all_screenshots: value.showAllScreenshots,
					show_skin_selector_in_sidebar: value.showSkinSelector,
					quick_instance_count: value.quickInstanceCount,
				},
			})
		}

		const latestSettings = await get()
		const nextSettings: AppSettings = {
			...latestSettings,
			sync_features_across_devices: value.syncFeaturesAcrossDevices,
			show_files_tab_in_instances: value.showFilesTab,
			show_worlds_tab_in_instances: value.showWorldsTab,
			show_screenshots_tab_in_instances: value.showScreenshotsTab,
			show_skin_selector_in_sidebar: value.showSkinSelector,
			show_jump_in: value.showJumpIn,
		}

		const screenshotsChanged =
			value.showAllScreenshots !== globalOptionsQuery.data.value!.screenshots
		const [, updatedGlobalSyncedOptions] = await Promise.all([
			set(nextSettings),
			screenshotsChanged
				? set_global_synced_option('screenshots', value.showAllScreenshots)
				: Promise.resolve(globalOptionsQuery.data.value!),
		])
		queryClient.setQueryData(appSettingsKeys.all, nextSettings)
		queryClient.setQueryData(syncedOptionsKeys.global, updatedGlobalSyncedOptions)
		if (screenshotsChanged) {
			await queryClient.invalidateQueries({ queryKey: screenshotKeys.all })
		}
		appSettings.setFeaturesSyncAcrossDevices(value.syncFeaturesAcrossDevices)
		appSettings.showFilesTabInInstances = value.showFilesTab
		appSettings.showWorldsTabInInstances = value.showWorldsTab
		appSettings.showScreenshotsTabInInstances = value.showScreenshotsTab
		appSettings.showSkinSelectorInSidebar = value.showSkinSelector
		appSettings.showJumpIn = value.showJumpIn

		if (updateQuickInstanceCount) {
			quickInstances.setLimit(value.quickInstanceCount)
		}
	},
	onMutate: () =>
		Promise.all([
			queryClient.cancelQueries({ queryKey: appSettingsKeys.all }),
			queryClient.cancelQueries({ queryKey: syncedOptionsKeys.global }),
		]),
	onError: handleError,
	onSettled: () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: appSettingsKeys.all }),
			queryClient.invalidateQueries({ queryKey: syncedOptionsKeys.global }),
		]),
})

const { saved, current, changes, saving, hasChanges, reset, save } = useSavable(
	() => getFeaturesSettingsState(settingsQuery.data.value!, globalOptionsQuery.data.value!),
	(changedValues) =>
		settingsMutation.mutateAsync({
			value: { ...current.value },
			updateQuickInstanceCount: changedValues.quickInstanceCount !== undefined,
		}),
)

async function saveFeaturesSettings(): Promise<void> {
	try {
		await save()
	} catch {
		return
	}
}

onMounted(() => {
	settingsModal.registerUnsavedChangesController({
		hasChanges: () => hasChanges.value,
		getOriginal: () => saved.value,
		getModified: () => changes.value,
		isSaving: () => saving.value,
		reset,
		save: saveFeaturesSettings,
	})
})

onBeforeUnmount(() => {
	settingsModal.registerUnsavedChangesController(null)
})
</script>

<template>
	<section class="border-0 border-b border-solid border-surface-4 pb-6">
		<div class="flex items-center justify-between gap-4">
			<div>
				<h2 id="sync-features-across-devices-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.syncAcrossDevicesTitle) }}
				</h2>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.syncAcrossDevicesDescription) }}
				</p>
			</div>
			<span
				v-tooltip="
					!auth.user.value ? formatMessage(messages.syncAcrossDevicesSignedOutTooltip) : undefined
				"
				class="inline-flex shrink-0"
			>
				<Toggle
					id="sync-features-across-devices"
					:model-value="Boolean(auth.user.value) && current.syncFeaturesAcrossDevices"
					:disabled="!auth.user.value"
					aria-labelledby="sync-features-across-devices-label"
					@update:model-value="current.syncFeaturesAcrossDevices = $event"
				/>
			</span>
		</div>
	</section>

	<section class="mt-6">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			{{ formatMessage(messages.instancePagesTitle) }}
		</h2>
		<div class="mt-4 flex flex-col gap-6">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.showWorldsTabTitle) }}
					</h3>
				</div>
				<Toggle
					id="show-worlds-tab-in-instances"
					v-model="current.showWorldsTab"
					:aria-label="formatMessage(messages.showWorldsTabTitle)"
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.showFilesTabTitle) }}
					</h3>
				</div>
				<Toggle
					id="show-files-tab-in-instances"
					v-model="current.showFilesTab"
					:aria-label="formatMessage(messages.showFilesTabTitle)"
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.showScreenshotsTabTitle) }}
					</h3>
				</div>
				<Toggle
					id="show-screenshots-tab-in-instances"
					v-model="current.showScreenshotsTab"
					:aria-label="formatMessage(messages.showScreenshotsTabTitle)"
				/>
			</div>
		</div>
	</section>

	<section class="mt-8 border-0 border-t border-solid border-surface-4 pt-6">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			{{ formatMessage(messages.sidebarTitle) }}
		</h2>
		<div class="mt-4 flex flex-col gap-6">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.showAllScreenshotsTitle) }}
					</h3>
					<p class="m-0 mt-1">
						{{ formatMessage(messages.showAllScreenshotsDescription) }}
					</p>
				</div>
				<Toggle
					id="show-all-screenshots"
					v-model="current.showAllScreenshots"
					:aria-label="formatMessage(messages.showAllScreenshotsTitle)"
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.showSkinSelectorTitle) }}
					</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.showSkinSelectorDescription) }}</p>
				</div>
				<Toggle
					id="show-skin-selector-in-sidebar"
					v-model="current.showSkinSelector"
					:aria-label="formatMessage(messages.showSkinSelectorTitle)"
				/>
			</div>

			<div class="flex flex-col gap-2.5">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.quickInstancesTitle) }}
				</h3>
				<Slider
					id="quick-instances-in-sidebar"
					v-model="current.quickInstanceCount"
					:aria-label="formatMessage(messages.quickInstancesTitle)"
					:min="0"
					:max="QUICK_INSTANCE_LIMIT_MAX"
					:step="1"
				/>
				<p class="m-0 leading-tight">
					{{ formatMessage(messages.quickInstancesDescription) }}
				</p>
			</div>
		</div>
	</section>

	<section class="mt-8 border-0 border-t border-solid border-surface-4 pt-6">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			{{ formatMessage(messages.playPageTitle) }}
		</h2>
		<div class="mt-4 flex items-center justify-between gap-4">
			<div>
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.showJumpInTitle) }}
				</h3>
				<p class="m-0 mt-1">{{ formatMessage(messages.showJumpInDescription) }}</p>
			</div>
			<Toggle
				id="show-jump-in-section"
				v-model="current.showJumpIn"
				:aria-label="formatMessage(messages.showJumpInTitle)"
			/>
		</div>
	</section>
	<!--
		Portalrinth's own: how the list of results is paged. The shared layout
		knows about both ways of doing it and is told which one is wanted.
	-->
	<section class="border-0 border-b border-solid border-surface-4 pb-6">
		<div class="flex flex-col gap-2">
			<h3 id="browse-scroll-pages-label" class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.scrollPagesTitle) }}
			</h3>
			<p class="m-0 text-secondary">
				{{ formatMessage(messages.scrollPagesDescription) }}
			</p>
			<div class="mt-1 flex flex-wrap gap-2">
				<button
					v-for="scope in scrollScopes"
					:key="scope.id"
					type="button"
					class="rounded-lg border-0 px-3 py-1.5 text-sm font-medium"
					:class="
						browseScrollScope === scope.id
							? 'bg-brand text-brand-inverted'
							: 'bg-button-bg text-contrast'
					"
					@click="browseScrollScope = scope.id"
				>
					{{ formatMessage(scope.label) }}
				</button>
			</div>
		</div>
	</section>

	<section class="border-0 border-b border-solid border-surface-4 pb-6">
		<div class="flex flex-col gap-2">
			<h3 id="browse-page-size-label" class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.pageSizeTitle) }}
			</h3>
			<p class="m-0 text-secondary">
				{{ formatMessage(messages.pageSizeDescription) }}
			</p>
			<div class="mt-1 flex flex-wrap gap-2">
				<button
					v-for="size in BROWSE_PAGE_SIZES"
					:key="size"
					type="button"
					class="rounded-lg border-0 px-3 py-1.5 text-sm font-medium"
					:class="
						browsePageSize === size ? 'bg-brand text-brand-inverted' : 'bg-button-bg text-contrast'
					"
					@click="browsePageSize = size"
				>
					{{ size }}
				</button>
			</div>
		</div>
	</section>

	<!--
		Portalrinth's own: the desktop widgets and windows that can be
		switched off entirely. They save instantly, no unsaved-changes gate.
	-->
	<section class="mt-8 border-0 border-t border-solid border-surface-4 pt-6">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			{{ formatMessage(messages.widgetsTitle) }}
		</h2>
		<div class="mt-4 flex flex-col gap-6">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.clockTitle) }}
					</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.clockDescription) }}</p>
				</div>
				<Toggle
					id="portalrinth-clock"
					v-model="portalrinthFeatures.clock"
					:aria-label="formatMessage(messages.clockTitle)"
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.weatherTitle) }}
					</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.weatherDescription) }}</p>
				</div>
				<Toggle
					id="portalrinth-weather"
					v-model="portalrinthFeatures.weather"
					:aria-label="formatMessage(messages.weatherTitle)"
				/>
			</div>
			<div class="flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-sm font-semibold text-contrast">{{ formatMessage(messages.aiLinksTitle) }}</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.aiLinksDescription) }}</p>
				</div>
				<Toggle
					id="portalrinth-ai-links"
					v-model="portalrinthFeatures.aiLinksWindow"
					:aria-label="formatMessage(messages.aiLinksTitle)"
				/>
			</div>
		</div>
	</section>
</template>
