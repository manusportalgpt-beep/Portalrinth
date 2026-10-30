<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import {
	BlocksIcon,
	CheckIcon,
	CompassIcon,
	CurseForgeIcon,
	ExternalIcon,
	GlobeIcon,
	LayersIcon,
	ModrinthBrandIcon,
	PackageIcon,
	PaintbrushIcon,
	PlusIcon,
	ServerStackIcon,
	SettingsIcon,
	ShirtIcon,
	SpinnerIcon,
	WrenchIcon,
} from '@modrinth/assets'
import type {
	BrowseInstallContentType,
	CardAction,
	CardSources,
	ProjectType,
	Tags,
} from '@modrinth/ui'
import {
	BrowsePageLayout,
	BrowseSidebar,
	Button,
	commonMessages,
	ContextMenu,
	CreationFlowModal,
	defineMessages,
	formatProjectTypeSentence,
	getLatestMatchingInstallVersion,
	getSelectedInstallPreferences,
	getTargetInstallPreferences,
	injectNotificationManager,
	preferencesDiffer,
	provideBrowseManager,
	requestInstall,
	resolveInstallPlan,
	stripServerRuntimeInstallFilters,
	stripServerRuntimeInstallOverrides,
	useBrowseSearch,
	useDebugLogger,
	useVIntl,
} from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { LocationQuery } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'

import BrowseSourcePicker from '@/components/ui/curseforge/BrowseSourcePicker.vue'
import { useAppServerBrowse } from '@/composables/browse/use-app-server-browse'
import { useAppEvent } from '@/composables/use-app-event'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import { injectSettingsActions } from '@/features/settings/settings-actions'
import {
	get_organization_many,
	get_project,
	get_search_results_v3,
	get_user_many,
	get_version_many,
} from '@/helpers/cache.js'
import {
	type BrowseMode,
	type BrowseSource,
	CURSEFORGE_PROJECT_TYPES,
	curseforgeCategoriesQueryOptions,
	curseforgeFilesIn,
	curseforgeIdOf,
	curseforgeKeys,
	curseforgeProjectQueryOptions,
	curseforgeSearch,
	isCurseforgeId,
} from '@/helpers/curseforge'
import { curseforgeCategoryIcon, curseforgeCategoryMessage } from '@/helpers/curseforge-categories'
import { curseforgeKeyAvailable, curseforgeSettings } from '@/helpers/curseforge-settings'
import {
	get as getInstance,
	get_installed_project_ids as getInstalledProjectIds,
	get_linked_modpack_content,
	getInstanceIconUrl,
	list as listInstances,
} from '@/helpers/instance'
import { get_loader_versions as getLoaderManifest } from '@/helpers/metadata'
import {
	BROWSE_PAGE_SIZES,
	browsePageSize,
	browseScrollScope,
} from '@/helpers/portalrinth-browse.ts'
import { get as getSettings, set as setSettings } from '@/helpers/settings.ts'
import { get_categories, get_game_versions, get_loaders } from '@/helpers/tags'
import { get_instance_worlds } from '@/helpers/worlds'
import {
	instanceDetailQueryOptions,
	instanceKeys,
	instanceLinkedProjectQueryOptions,
} from '@/pages/instance/query-options'
import { injectContentInstall } from '@/providers/content-install'
import { injectServerInstall } from '@/providers/server-install'
import {
	createServerInstallContent,
	provideServerInstallContent,
} from '@/providers/setup/server-install-content'
import { type BreadcrumbDefinition, injectBreadcrumbManager } from '@/shared/breadcrumbs'

const { handleError } = injectNotificationManager()
const { formatMessage } = useVIntl()
const { installingServerProjects, playServerProject, showAddServerToInstanceModal } =
	injectServerInstall()
const { install: installVersion } = injectContentInstall()
const queryClient = useQueryClient()
const debugLog = useDebugLogger('Browse')

const router = useRouter()
const route = useRoute()
const displayedBrowseRoute = shallowRef(router.currentRoute.value)
watch(
	() => router.currentRoute.value,
	(nextRoute) => {
		if (nextRoute.path.startsWith('/browse/')) {
			displayedBrowseRoute.value = nextRoute
		}
	},
	{ immediate: true },
)
const breadcrumbMessages = defineMessages({
	discoverProjectType: {
		id: 'app.browse.discover-project-type',
		defaultMessage: 'Discover {projectType}',
	},
	discoverServers: {
		id: 'app.browse.discover-servers',
		defaultMessage: 'Discover servers',
	},
})
const breadcrumbLabel = computed(() => {
	const browseRoute = displayedBrowseRoute.value
	if (browseRoute.query.from === 'worlds' || browseRoute.params.projectType === 'server') {
		return formatMessage(breadcrumbMessages.discoverServers)
	}

	return formatMessage(breadcrumbMessages.discoverProjectType, {
		projectType: formatProjectTypeSentence(
			formatMessage,
			String(browseRoute.params.projectType ?? ''),
			2,
		),
	})
})
const appSettings = useAppSettings()
const browseRouteActive = computed(() => route.path.startsWith('/browse/'))
const serverSetupModalRef = ref<InstanceType<typeof CreationFlowModal> | null>(null)
const serverInstallContent = createServerInstallContent({ serverSetupModalRef })
provideServerInstallContent(serverInstallContent)
const {
	serverIdQuery,
	serverFlowFrom,
	isFromWorlds,
	isServerContext,
	isSetupServerContext,
	effectiveServerWorldId,
	serverContextServerData,
	serverContentProjectIds,
	queuedServerInstallRootProjectIds,
	queuedServerInstallProjectIds,
	queuedServerInstallCount,
	selectedServerInstallProjects,
	isInstallingQueuedServerInstalls,
	queuedInstallProgress,
	serverBackUrl,
	serverBackLabel,
	serverBrowseHeading,
	clearQueuedServerInstalls,
	removeQueuedServerInstall,
	flushQueuedServerInstalls,
	discardQueuedServerInstallsAndBack,
	installQueuedServerInstallsAndBack,
	initServerContext,
	watchServerContextChanges,
	searchServerModpacks,
	getServerProjectVersions,
	enforceSetupModpackRoute,
	getQueuedServerInstallPlans,
	setQueuedServerInstallPlans,
	resolveQueuedServerInstallPlan,
	openServerModpackInstallFlow,
	onServerFlowBack,
	handleServerModpackFlowCreate,
	markServerProjectInstalled,
} = serverInstallContent

// Taken from the browse route on show, not the current one: when a project
// or an author is opened from here, the instance in the trail above keeps
// its name and icon instead of turning back into "Loading...".
const initialInstanceId = computed(() => String(displayedBrowseRoute.value.query.i ?? ''))
const instanceQuery = useQuery(
	computed(() => ({
		...instanceDetailQueryOptions(initialInstanceId.value),
		enabled: !!initialInstanceId.value,
	})),
)
const instance = computed(() => instanceQuery.data.value ?? null)
const linkedInstanceProjectId = computed(() => instance.value?.link?.project_id ?? '')
const linkedInstanceProjectQuery = useQuery(
	computed(() => ({
		...instanceLinkedProjectQueryOptions(linkedInstanceProjectId.value),
		enabled: !!linkedInstanceProjectId.value,
	})),
)
const installedProjectIds: Ref<string[] | null> = ref(null)
const instanceHideInstalled = ref(route.query.ai === 'true')
const newlyInstalled = ref<string[]>([])
const hiddenInstanceProjectIds = ref<Set<string>>(new Set())
const hiddenInstanceProjectIdsInitialized = ref(false)
const isServerInstance = computed(
	() => linkedInstanceProjectQuery.data.value?.minecraft_server != null,
)

const breadcrumbManager = injectBreadcrumbManager()
const instanceBreadcrumbDefinition = {
	slot: 'instance',
	id: () => `instance:${String(displayedBrowseRoute.value.query.i ?? '')}`,
	label: () => instance.value?.name ?? formatMessage(commonMessages.loadingLabel),
	visual: () => ({
		type: 'image' as const,
		src: getInstanceIconUrl(instance.value?.icon_path),
		alt: instance.value?.name,
		tintBy: String(displayedBrowseRoute.value.query.i ?? ''),
	}),
	to: () => {
		const instancePath = `/instance/${encodeURIComponent(
			String(displayedBrowseRoute.value.query.i ?? ''),
		)}`
		return displayedBrowseRoute.value.query.from === 'worlds'
			? `${instancePath}/worlds`
			: instancePath
	},
} satisfies BreadcrumbDefinition
const serversBreadcrumbDefinition = {
	slot: 'root',
	id: 'servers',
	label: () => formatMessage(commonMessages.serversLabel),
	to: '/hosting/manage/',
	visual: { type: 'icon', component: ServerStackIcon },
} satisfies BreadcrumbDefinition
const serverBreadcrumbTo = ref(serverBackUrl.value)
watch(serverBackUrl, (value) => {
	if (route.path.startsWith('/browse/')) {
		serverBreadcrumbTo.value = value
	}
})
const serverBreadcrumbDefinition = {
	slot: 'server',
	id: () => `server:${String(displayedBrowseRoute.value.query.sid ?? '')}`,
	label: () => serverContextServerData.value?.name ?? formatMessage(commonMessages.loadingLabel),
	visual: { type: 'icon', component: ServerStackIcon },
	to: serverBreadcrumbTo,
} satisfies BreadcrumbDefinition
const breadcrumbDefinition = {
	slot: 'browse',
	id: () =>
		`browse:${String(displayedBrowseRoute.value.params.projectType ?? '')}:${String(
			displayedBrowseRoute.value.query.i ?? '',
		)}:${String(displayedBrowseRoute.value.query.sid ?? '')}:${String(
			displayedBrowseRoute.value.query.from ?? '',
		)}`,
	label: breadcrumbLabel,
	to: () => displayedBrowseRoute.value.fullPath,
	visual: { type: 'icon', component: CompassIcon },
} satisfies BreadcrumbDefinition

function syncBreadcrumbs() {
	if (displayedBrowseRoute.value.query.i) {
		const instanceBreadcrumb = breadcrumbManager.reset(instanceBreadcrumbDefinition)
		breadcrumbManager.push(breadcrumbDefinition, { parent: instanceBreadcrumb })
		return
	}

	if (displayedBrowseRoute.value.query.sid) {
		const serversBreadcrumb = breadcrumbManager.reset(serversBreadcrumbDefinition)
		const serverBreadcrumb = breadcrumbManager.push(serverBreadcrumbDefinition, {
			parent: serversBreadcrumb,
		})
		breadcrumbManager.push(breadcrumbDefinition, { parent: serverBreadcrumb })
		return
	}

	breadcrumbManager.reset(breadcrumbDefinition)
}

watch(displayedBrowseRoute, syncBreadcrumbs, { immediate: true, flush: 'sync' })

debugLog('fetching tags (categories, loaders, gameVersions)')
const [categories, loaders, availableGameVersions] = await Promise.all([
	get_categories()
		.catch(handleError)
		.then(ref<Labrinth.Tags.v2.Category[]>),
	get_loaders()
		.catch(handleError)
		.then(ref<Labrinth.Tags.v2.Loader[]>),
	get_game_versions()
		.catch(handleError)
		.then(ref<Labrinth.Tags.v2.GameVersion[]>),
])

const tags: Ref<Tags> = computed(() => ({
	gameVersions: availableGameVersions.value ?? [],
	loaders: loaders.value ?? [],
	categories: categories.value ?? [],
}))

if (isFromWorlds.value && route.params.projectType !== 'server') {
	router.replace({
		path: '/browse/server',
		query: route.query,
	})
}

enforceSetupModpackRoute(route.params.projectType as string | undefined)

const allInstalledIds = computed(
	() => new Set([...newlyInstalled.value, ...(installedProjectIds.value ?? [])]),
)

function syncHiddenInstanceProjectIds() {
	hiddenInstanceProjectIds.value = new Set([
		...(installedProjectIds.value ?? []),
		...newlyInstalled.value,
	])
	hiddenInstanceProjectIdsInitialized.value = true
}

watch(
	installedProjectIds,
	(ids) => {
		if (!ids) return
		if (!hiddenInstanceProjectIdsInitialized.value) {
			syncHiddenInstanceProjectIds()
		}
	},
	{ immediate: true },
)

watchServerContextChanges()

await initInstanceContext()

async function refreshInstalledProjectIds() {
	if (!route.query.i) {
		const instances = await queryClient
			.fetchQuery({
				queryKey: [...instanceKeys.all, 'installed-project-ids'],
				queryFn: listInstances,
				staleTime: 0,
			})
			.catch(handleError)
		if (!instances) return

		const ids = instances
			.map((gameInstance) => gameInstance.link?.project_id)
			.filter((id): id is string => !!id)
		debugLog('installedInstanceProjectIds loaded', { count: ids.length })
		installedProjectIds.value = ids
		return
	}

	if (route.query.from === 'worlds') {
		const targetInstanceId = route.query.i as string
		const worlds = await queryClient
			.fetchQuery({
				queryKey: instanceKeys.installedProjectIds(targetInstanceId, 'worlds'),
				queryFn: () => get_instance_worlds(targetInstanceId),
				staleTime: 0,
			})
			.catch(handleError)
		if (!worlds) return

		const serverProjectIds = worlds
			.filter((w) => w.type === 'server' && 'project_id' in w && w.project_id)
			.map((w) => (w as { project_id: string }).project_id)
		debugLog('installedServerProjectIds loaded', { count: serverProjectIds.length })
		installedProjectIds.value = serverProjectIds
		return
	}

	const targetInstanceId = route.query.i as string
	const ids = await queryClient
		.fetchQuery({
			queryKey: instanceKeys.installedProjectIds(targetInstanceId, 'content'),
			queryFn: () => getInstalledProjectIds(targetInstanceId),
			staleTime: 0,
		})
		.catch(handleError)
	if (!ids) return

	debugLog('installedProjectIds loaded', { count: ids.length })
	// Portalrinth's own: a CurseForge file's entry carries CurseForge's bare
	// numeric id, while a CurseForge search hit is `cf-<id>`; both forms are
	// kept so either one is recognised as installed.
	// A pack from a CurseForge zip records its files only by fingerprint, so
	// its listing is asked which CurseForge projects they are. A Modrinth
	// pack's files carry their ids, so it is not asked.
	const link = (await getInstance(targetInstanceId).catch(() => null))?.link
	const packContent =
		link && link.type !== 'modrinth_modpack'
			? await queryClient
					.fetchQuery({
						queryKey: instanceKeys.linkedContent(targetInstanceId),
						queryFn: () => get_linked_modpack_content(targetInstanceId),
						staleTime: 30_000,
					})
					.catch(() => null)
			: null
	installedProjectIds.value = [
		...ids,
		...ids.filter((id) => /^\d+$/.test(id)).map(curseforgeIdOf),
		...curseforgeFilesIn(packContent ?? []).map(([id]) => id),
	]
}

async function initInstanceContext() {
	debugLog('initInstanceContext', {
		queryI: route.query.i,
		queryAi: route.query.ai,
		querySid: route.query.sid,
		queryWid: route.query.wid,
		queryFrom: route.query.from,
	})
	await Promise.all([
		initServerContext(),
		refreshInstalledProjectIds(),
		route.query.i ? instanceQuery.suspense().catch(handleError) : Promise.resolve(),
	])

	if (route.query.i) {
		debugLog('instance loaded', {
			name: instance.value?.name,
			loader: instance.value?.loader,
			gameVersion: instance.value?.game_version,
		})

		if (instance.value?.link?.project_id) {
			await linkedInstanceProjectQuery.suspense().catch(handleError)
		}
	}
}

function setHideInstalledModpacks(value: boolean) {
	appSettings.hideInstalledModpacks = value
	getSettings()
		.then((settings) => {
			settings.hide_installed_modpacks = value
			return setSettings(settings)
		})
		.catch(handleError)
}

const hideInstalledModpacks = computed({
	get: () => appSettings.hideInstalledModpacks,
	set: (value: boolean) => setHideInstalledModpacks(value),
})

const instanceFilters = computed(() => {
	const filters = []

	// A server is not made for one version of the game: it says which ones it
	// supports, and a filter for one of them hides the rest. So the version is
	// not filtered on when looking for servers, which is also why searching for
	// them by version found nothing at all.
	const isServerSearch = projectType.value === 'server'

	if (instance.value && projectType.value !== 'resourcepack') {
		const isVanillaShader = projectType.value === 'shader' && instance.value.loader === 'vanilla'
		const gameVersion = instance.value.game_version
		if (gameVersion && !isVanillaShader && !isServerSearch) {
			filters.push({ type: 'game_version', option: gameVersion })
		}

		const platform = instance.value.loader
		const supportedModLoaders = ['fabric', 'forge', 'quilt', 'neoforge']

		if (platform && projectType.value === 'mod' && supportedModLoaders.includes(platform)) {
			filters.push({ type: 'mod_loader', option: platform })
		}
		if (isVanillaShader) {
			filters.push({ type: 'shader_loader', option: 'vanilla' })
		}

		if (isServerInstance.value) {
			filters.push({ type: 'environment', option: 'client' })
		}
	}

	if (
		(instance.value || projectType.value === 'modpack') &&
		(projectType.value === 'modpack' ? hideInstalledModpacks.value : instanceHideInstalled.value) &&
		hiddenInstanceProjectIds.value.size > 0
	) {
		for (const id of hiddenInstanceProjectIds.value) {
			filters.push({ type: 'project_id', option: `project_id:${id}`, negative: true })
		}
	}

	return filters
})

const serverHideInstalled = ref(false)
const hideSelectedServerInstalls = ref(false)
if (route.query.shi) {
	serverHideInstalled.value = route.query.shi === 'true'
}
const hiddenServerContentProjectIds = ref<Set<string>>(new Set())
const hiddenServerContentProjectIdsInitialized = ref(false)

function syncHiddenServerContentProjectIds() {
	hiddenServerContentProjectIds.value = new Set(serverContentProjectIds.value)
	hiddenServerContentProjectIdsInitialized.value = true
}

watch(
	serverContentProjectIds,
	() => {
		if (!hiddenServerContentProjectIdsInitialized.value) {
			syncHiddenServerContentProjectIds()
		}
	},
	{ immediate: true },
)

const serverContextFilters = computed(() => {
	const filters: { type: string; option: string; negative?: boolean }[] = []
	if (!serverContextServerData.value) return filters
	const pt = projectType.value

	if (pt !== 'modpack') {
		const gameVersion = serverContextServerData.value.mc_version
		if (gameVersion) filters.push({ type: 'game_version', option: gameVersion })

		const platform = serverContextServerData.value.loader?.toLowerCase()
		if (platform && ['fabric', 'forge', 'quilt', 'neoforge'].includes(platform))
			filters.push({ type: 'mod_loader', option: platform })
		if (platform && ['paper', 'purpur'].includes(platform))
			filters.push({ type: 'plugin_loader', option: platform })

		if (pt === 'mod') filters.push({ type: 'environment', option: 'server' })

		if (hideSelectedServerInstalls.value && queuedServerInstallProjectIds.value.size > 0) {
			for (const id of queuedServerInstallProjectIds.value) {
				filters.push({ type: 'project_id', option: `project_id:${id}`, negative: true })
			}
		}
	}

	if (pt === 'modpack') {
		filters.push(
			{ type: 'environment', option: 'client' },
			{ type: 'environment', option: 'server' },
		)

		if (hideInstalledModpacks.value && hiddenInstanceProjectIds.value.size > 0) {
			for (const id of hiddenInstanceProjectIds.value) {
				filters.push({ type: 'project_id', option: `project_id:${id}`, negative: true })
			}
		}
	}

	if (serverHideInstalled.value && hiddenServerContentProjectIds.value.size > 0) {
		for (const id of hiddenServerContentProjectIds.value) {
			filters.push({ type: 'project_id', option: `project_id:${id}`, negative: true })
		}
	}

	return filters
})

const combinedProvidedFilters = computed(() =>
	isServerContext.value ? serverContextFilters.value : instanceFilters.value,
)

const {
	serverPings,
	contextMenuRef,
	updateServerHits,
	getServerModpackContent,
	getServerCardActions,
	handleRightClick,
} = useAppServerBrowse({
	instance,
	isFromWorlds,
	allInstalledIds,
	newlyInstalled,
	installingServerProjects,
	playServerProject,
	showAddServerToInstanceModal,
	handleError,
	router,
})

const offline = ref(!navigator.onLine)
const handleOffline = () => {
	debugLog('went offline')
	offline.value = true
}
const handleOnline = () => {
	debugLog('went online')
	offline.value = false
}
window.addEventListener('offline', handleOffline)
window.addEventListener('online', handleOnline)

onBeforeUnmount(() => {
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
})

const messages = defineMessages({
	addServersToInstance: {
		id: 'app.browse.add-servers-to-instance',
		defaultMessage: 'Adding server to instance',
	},
	projectActionsLabel: {
		id: 'app.browse.project-actions.label',
		defaultMessage: 'Project actions',
	},
	addToAnInstance: {
		id: 'app.browse.add-to-an-instance',
		defaultMessage: 'Add to an instance',
	},
	environmentProvidedByServer: {
		id: 'search.filter.locked.server-environment.title',
		defaultMessage: 'Only client-side mods can be added to the server instance',
	},
	gameVersionProvidedByInstance: {
		id: 'search.filter.locked.instance-game-version.title',
		defaultMessage: 'Game version is provided by the instance',
	},
	hideAddedServers: {
		id: 'app.browse.hide-added-servers',
		defaultMessage: 'Hide servers already added',
	},
	hideInstalledModpacks: {
		id: 'app.browse.hide-installed-modpacks',
		defaultMessage: 'Hide already installed',
	},
	installingToServer: {
		id: 'app.browse.server.installing',
		defaultMessage: 'Installing',
	},
	backToInstance: {
		id: 'app.browse.back-to-instance',
		defaultMessage: 'Back to instance',
	},
	serverInstanceContentWarning: {
		id: 'app.browse.server-instance-content-warning',
		defaultMessage:
			'Adding content may prevent you from joining this server. Any content you add will be removed when the managed server content is updated.',
	},
	modLoaderProvidedByInstance: {
		id: 'search.filter.locked.instance-loader.title',
		defaultMessage: 'Loader is provided by the instance',
	},
	modpacksProjectType: {
		id: 'app.browse.project-type.modpacks',
		defaultMessage: 'Modpacks',
	},
	modsProjectType: { id: 'app.browse.project-type.mods', defaultMessage: 'Mods' },
	resourcePacksProjectType: {
		id: 'app.browse.project-type.resource-packs',
		defaultMessage: 'Resource Packs',
	},
	dataPacksProjectType: {
		id: 'app.browse.project-type.data-packs',
		defaultMessage: 'Data Packs',
	},
	shadersProjectType: { id: 'app.browse.project-type.shaders', defaultMessage: 'Shaders' },
	skinsProjectType: { id: 'app.browse.project-type.skins', defaultMessage: 'Skins' },
	serversProjectType: { id: 'app.browse.project-type.servers', defaultMessage: 'Servers' },
	providedByInstance: {
		id: 'search.filter.locked.instance',
		defaultMessage: 'Provided by the instance',
	},
	syncFilterButton: {
		id: 'search.filter.locked.instance.sync',
		defaultMessage: 'Sync with instance',
	},
	cardSourceLabel: {
		id: 'app.browse.card-source.label',
		defaultMessage: 'Install from',
	},
	browseSourceLabel: {
		id: 'app.browse.source.label',
		defaultMessage: 'Where to browse',
	},
	curseforgeKeyTitle: {
		id: 'app.browse.curseforge.key.title',
		defaultMessage: 'CurseForge needs an API key',
	},
	curseforgeKeyDescription: {
		id: 'app.browse.curseforge.key.description',
		defaultMessage:
			'This build came without a CurseForge key. Add your own in settings and CurseForge projects will show up here.',
	},
	curseforgeKeyAction: {
		id: 'app.browse.curseforge.key.action',
		defaultMessage: 'Open CurseForge settings',
	},
})

const projectType = ref<ProjectType>(route.params.projectType as ProjectType)

// Portalrinth's own: CurseForge as a second place to browse. Only offered when
// the build has a key, only for the project types CurseForge has, and never
// while adding to a server, whose flow is Modrinth's from end to end.
// 'both' lists Modrinth and CurseForge together, without repeats: a project
// on both is one card with a toggle for where to install it from.
function initialBrowseSource(): BrowseMode {
	if (!curseforgeSettings.enabled) return 'modrinth'
	const src = route.query.src
	if (src === 'all') return 'both'
	if (src === 'cf') return 'curseforge'
	if (src === 'mr') return 'modrinth'
	return curseforgeSettings.defaultSource
}
const browseSource = ref<BrowseMode>(initialBrowseSource())
/** The source in the URL; only the one that is not the default is written. */
function sourceQuery(source: BrowseMode) {
	if (source === curseforgeSettings.defaultSource) return undefined
	return source === 'both' ? 'all' : source === 'curseforge' ? 'cf' : 'mr'
}
// Offered whenever CurseForge is on, key or no key: without one, picking it
// says where to put one instead of the switch never showing at all.
const curseforgeOffered = computed(
	() =>
		curseforgeSettings.enabled &&
		!isServerContext.value &&
		(CURSEFORGE_PROJECT_TYPES as readonly string[]).includes(projectType.value),
)
const isCurseforge = computed(() => curseforgeOffered.value && browseSource.value === 'curseforge')
/** Both at once; without a key it is Modrinth alone. */
const isCombined = computed(
	() => curseforgeOffered.value && browseSource.value === 'both' && curseforgeKeyAvailable.value,
)
/** CurseForge is picked but there is nothing to ask it with. */
const curseforgeNeedsKey = computed(() => isCurseforge.value && !curseforgeKeyAvailable.value)
const settingsActions = injectSettingsActions()
// The filters CurseForge can search by; every other one is hidden while
// browsing it rather than silently ignored. Categories are CurseForge's own,
// swapped in below.
const CURSEFORGE_FILTER_TYPES = ['game_version', 'mod_loader', 'modpack_loader']
const isCurseforgeFilterType = (id: string) =>
	CURSEFORGE_FILTER_TYPES.includes(id) || id.startsWith('category_')

// CurseForge's categories for the current type, in the shape the sidebar
// draws Modrinth's in, so the very same filter list shows them.
const curseforgeCategoriesQuery = useQuery(
	computed(() => ({
		...curseforgeCategoriesQueryOptions(projectType.value),
		enabled: isCurseforge.value || isCombined.value,
	})),
)
// CurseForge's own categories, with their own names and pictures, in the
// shape the sidebar draws Modrinth's in.
const curseforgeCategories = computed(() => curseforgeCategoriesQuery.data.value ?? [])
const browseTags: Ref<Tags> = computed(() =>
	isCurseforge.value
		? {
				...tags.value,
				// Drawn like Modrinth's: a monochrome icon and a name in the app's
				// language, not CurseForge's coloured picture and English name.
				categories: curseforgeCategories.value.map((category) => {
					const message = curseforgeCategoryMessage(category.name)
					return {
						icon: '',
						icon_url: null,
						icon_component: curseforgeCategoryIcon(category.name),
						display_name: message ? formatMessage(message) : category.name,
						name: category.name,
						project_type: projectType.value,
						header: 'categories',
					}
				}),
			}
		: tags.value,
)

/** Names compared loosely: case, spaces and punctuation aside. */
const looseName = (value: string | null | undefined) =>
	(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * When both are listed, the CurseForge copy of each Modrinth card's project
 * (found by slug or by name and author), and which of the two to install.
 */
const combinedTwins = shallowRef(new Map<string, Labrinth.Search.v3.ResultSearchProject>())
const pickedSource = ref<Record<string, BrowseSource>>({})

function resetInstanceContext() {
	debugLog('instance context removed, resetting')
	installedProjectIds.value = null
	instanceHideInstalled.value = false
	newlyInstalled.value = []
	hiddenInstanceProjectIds.value = new Set()
	hiddenInstanceProjectIdsInitialized.value = false
	// isServerInstance and the breadcrumbs follow the route by themselves; the
	// old reset here named a breadcrumb that no longer exists and threw.
	void refreshInstalledProjectIds()
}

watch(
	() => route.params.projectType as ProjectType,
	async (newType) => {
		if (!browseRouteActive.value) {
			return
		}
		if (isSetupServerContext.value) {
			enforceSetupModpackRoute(newType)
			if (newType !== 'modpack') return
		}

		if (!newType || newType === projectType.value) return

		debugLog('projectType route param changed', { from: projectType.value, to: newType })
		projectType.value = newType
	},
)

watch(
	() => route.query.i,
	async (nextInstanceId, previousInstanceId) => {
		if (!route.path.startsWith('/browse') || nextInstanceId === previousInstanceId) return
		if (!nextInstanceId) {
			resetInstanceContext()
			return
		}

		installedProjectIds.value = null
		hiddenInstanceProjectIdsInitialized.value = false
		await Promise.all([instanceQuery.suspense().catch(handleError), refreshInstalledProjectIds()])
		if (instance.value?.link?.project_id) {
			await linkedInstanceProjectQuery.suspense().catch(handleError)
		}
	},
)

const selectableProjectTypes = computed(() => {
	let dataPacks = false,
		mods = false,
		modpacks = false

	if (instance.value) {
		if (
			availableGameVersions.value &&
			availableGameVersions.value.findIndex((x) => x.version === instance.value?.game_version) <=
				availableGameVersions.value.findIndex((x) => x.version === '1.13') &&
			!isServerInstance.value
		) {
			dataPacks = true
		}

		if (instance.value.loader !== 'vanilla') {
			mods = true
		}
	} else {
		dataPacks = true
		mods = true
		modpacks = true
	}

	const params: LocationQuery = {}

	if (route.query.i) params.i = route.query.i
	if (route.query.ai) params.ai = route.query.ai
	if (route.query.from) params.from = route.query.from
	if (route.query.sid) params.sid = route.query.sid
	if (effectiveServerWorldId.value) params.wid = effectiveServerWorldId.value

	const queryString = new URLSearchParams(params as Record<string, string>).toString()
	const suffix = queryString ? `?${queryString}` : ''

	if (isSetupServerContext.value) {
		return [
			{ label: formatMessage(messages.modpacksProjectType), href: `/browse/modpack${suffix}` },
		]
	}

	if (isFromWorlds.value) {
		return [{ label: formatMessage(messages.serversProjectType), href: `/browse/server${suffix}` }]
	}

	return [
		{
			label: formatMessage(messages.modpacksProjectType),
			href: `/browse/modpack${suffix}`,
			shown: modpacks,
			icon: PackageIcon,
		},
		{ label: formatMessage(messages.modsProjectType), href: `/browse/mod${suffix}`, shown: mods, icon: WrenchIcon },
		{
			label: formatMessage(messages.resourcePacksProjectType),
			href: `/browse/resourcepack${suffix}`,
			icon: PaintbrushIcon,
		},
		{
			label: formatMessage(messages.dataPacksProjectType),
			href: `/browse/datapack${suffix}`,
			shown: dataPacks,
			icon: BlocksIcon,
		},
		{ label: formatMessage(messages.shadersProjectType), href: `/browse/shader${suffix}`, icon: LayersIcon },
		{
			label: formatMessage(messages.serversProjectType),
			href: `/browse/server${suffix}`,
			shown: !instance.value,
			icon: GlobeIcon,
		},
		{
			label: formatMessage(messages.skinsProjectType),
			href: '/browse/skin',
			shown: !instance.value && !suffix,
			icon: ShirtIcon,
		},
	]
})

const installContext = computed(() => {
	if (isServerContext.value && serverContextServerData.value) {
		return {
			name: serverContextServerData.value.name,
			loader: serverContextServerData.value.loader ?? '',
			gameVersion: serverContextServerData.value.mc_version ?? '',
			serverId: serverIdQuery.value,
			upstream: serverContextServerData.value.upstream,
			iconSrc: null as string | null,
			isMedal: serverContextServerData.value.is_medal,
			backUrl: serverBackUrl.value,
			backLabel: serverBackLabel.value,
			heading: serverBrowseHeading.value,
			queuedCount: queuedServerInstallCount.value,
			selectedProjects: selectedServerInstallProjects.value,
			isInstallingSelected: isInstallingQueuedServerInstalls.value,
			skipNonEssentialWarnings: appSettings.skipNonEssentialWarnings,
			installProgress: queuedInstallProgress.value,
			clearQueued: clearQueuedServerInstalls,
			clearSelected: clearQueuedServerInstalls,
			onBack: flushQueuedServerInstalls,
			discardSelectedAndBack: discardQueuedServerInstallsAndBack,
			installSelected: installQueuedServerInstallsAndBack,
		}
	}
	if (instance.value) {
		return {
			name: instance.value.name,
			loader: instance.value.loader,
			gameVersion: instance.value.game_version,
			iconSrc: getInstanceIconUrl(instance.value.icon_path),
			backUrl: `/instance/${encodeURIComponent(instance.value.id)}${isFromWorlds.value ? '/worlds' : ''}`,
			backLabel: formatMessage(messages.backToInstance),
			heading: formatMessage(
				isFromWorlds.value ? messages.addServersToInstance : commonMessages.installingContentLabel,
			),
			warning:
				isServerInstance.value && instance.value.loader !== 'vanilla' && !isFromWorlds.value
					? formatMessage(messages.serverInstanceContentWarning)
					: undefined,
		}
	}
	return null
})

const installingProjectIds = ref<Set<string>>(new Set())

function setProjectInstalling(projectId: string, installing: boolean) {
	const next = new Set(installingProjectIds.value)
	if (installing) {
		next.add(projectId)
	} else {
		next.delete(projectId)
	}
	installingProjectIds.value = next
}

const serverInstallQueue = {
	get: getQueuedServerInstallPlans,
	set: setQueuedServerInstallPlans,
}

function getCurrentSelectedInstallPreferences(projectTypeValue: string) {
	return getSelectedInstallPreferences({
		contentType: projectTypeValue,
		selectedFilters: searchState.currentFilters.value,
		providedFilters: combinedProvidedFilters.value,
		overriddenProvidedFilterTypes: searchState.overriddenProvidedFilterTypes.value,
	})
}

function getServerInstallTargetPreferences(contentType: BrowseInstallContentType) {
	return getTargetInstallPreferences(
		{
			gameVersion: serverContextServerData.value?.mc_version,
			loader: serverContextServerData.value?.loader,
		},
		contentType,
	)
}

function getInstanceInstallTargetPreferences(projectTypeValue: string) {
	return getTargetInstallPreferences(
		{
			gameVersion: instance.value?.game_version,
			loader: instance.value?.loader,
		},
		projectTypeValue,
	)
}

async function getInstallProjectVersions(projectId: string) {
	const project = await get_project(projectId, 'must_revalidate')
	return (await get_version_many(
		project.versions,
		'must_revalidate',
	)) as Labrinth.Versions.v2.Version[]
}

async function chooseInstanceInstallVersion(
	project: Labrinth.Search.v3.ResultSearchProject,
	projectTypeValue: string,
) {
	const targetInstance = instance.value
	if (!targetInstance) {
		return { versionId: null as string | null }
	}

	const selectedPreferences = getCurrentSelectedInstallPreferences(projectTypeValue)
	const targetPreferences = getInstanceInstallTargetPreferences(projectTypeValue)
	if (!preferencesDiffer(selectedPreferences, targetPreferences)) {
		return { versionId: null as string | null }
	}

	const selectedVersion = getLatestMatchingInstallVersion(
		await getInstallProjectVersions(project.project_id),
		selectedPreferences,
	)

	if (!selectedVersion) {
		return { versionId: null as string | null }
	}

	return { versionId: selectedVersion.id }
}

async function chooseFilterMatchingInstallVersion(
	project: Labrinth.Search.v3.ResultSearchProject,
	projectTypeValue: string,
) {
	const plan = await resolveInstallPlan({
		project: {
			project_id: project.project_id,
			title: project.title,
			icon_url: project.icon_url,
		},
		contentType: projectTypeValue as BrowseInstallContentType,
		selectedFilters: searchState.currentFilters.value,
		providedFilters: combinedProvidedFilters.value,
		overriddenProvidedFilterTypes: searchState.overriddenProvidedFilterTypes.value,
		targetPreferences: {},
		getProjectVersions: getInstallProjectVersions,
	})

	return { versionId: plan.versionId }
}

function getCardActions(
	result: Labrinth.Search.v3.ResultSearchProject,
	currentProjectType: string,
): CardAction[] {
	if (currentProjectType === 'server') {
		return getServerCardActions(result)
	}

	if (isCurseforgeId(result.project_id)) {
		return getCurseforgeCardActions(result, currentProjectType)
	}

	const twin = isCombined.value ? combinedTwins.value.get(result.project_id) : undefined
	if (twin && pickedSource.value[result.project_id] === 'curseforge') {
		return getCurseforgeCardActions(twin, currentProjectType)
	}

	const projectResult = result as Labrinth.Search.v3.ResultSearchProject & {
		installed?: boolean
		installing?: boolean
	}
	const isInstalled =
		projectResult.installed ||
		allInstalledIds.value.has(projectResult.project_id || '') ||
		serverContentProjectIds.value.has(projectResult.project_id || '') ||
		serverContextServerData.value?.upstream?.project_id === projectResult.project_id
	const isInstalling = installingProjectIds.value.has(projectResult.project_id)
	const showAsInstalled = isInstalled && currentProjectType !== 'modpack'

	if (
		isServerContext.value &&
		['modpack', 'mod', 'plugin', 'datapack'].includes(currentProjectType)
	) {
		const isQueued = queuedServerInstallProjectIds.value.has(projectResult.project_id)
		const isQueuedRoot = queuedServerInstallRootProjectIds.value.has(projectResult.project_id)
		const isInstallingSelection = isInstallingQueuedServerInstalls.value
		const validatingInstall =
			isInstalling && currentProjectType !== 'modpack' && !isInstallingSelection
		const installLabel = showAsInstalled
			? commonMessages.installedLabel
			: isQueued
				? isInstalling || isInstallingSelection
					? validatingInstall
						? commonMessages.validatingLabel
						: messages.installingToServer
					: commonMessages.selectedLabel
				: isInstalling || isInstallingSelection
					? validatingInstall
						? commonMessages.validatingLabel
						: messages.installingToServer
					: commonMessages.installButton
		return [
			{
				key: 'install',
				label: formatMessage(installLabel),
				icon:
					isInstalling || isInstallingSelection
						? SpinnerIcon
						: isQueued || showAsInstalled
							? CheckIcon
							: PlusIcon,
				iconClass: isInstalling || isInstallingSelection ? 'animate-spin' : undefined,
				disabled:
					showAsInstalled || isInstalling || isInstallingSelection || (isQueued && !isQueuedRoot),
				color: isQueued && !isInstalling && !isInstallingSelection ? 'green' : 'brand',
				type: 'outlined',
				onClick: async () => {
					if (isQueuedRoot) {
						removeQueuedServerInstall(projectResult.project_id)
						return
					}
					if (isQueued) return

					const contentType = currentProjectType as BrowseInstallContentType
					const isModpack = contentType === 'modpack'
					const shouldShowInstalling = isModpack || !isQueued
					if (shouldShowInstalling) {
						setProjectInstalling(projectResult.project_id, true)
					}
					try {
						const plan = await requestInstall({
							project: projectResult,
							contentType,
							mode: isModpack ? 'immediate' : 'queue',
							selectedFilters: isModpack
								? []
								: stripServerRuntimeInstallFilters(searchState.currentFilters.value),
							providedFilters: isModpack ? [] : combinedProvidedFilters.value,
							overriddenProvidedFilterTypes: isModpack
								? []
								: stripServerRuntimeInstallOverrides(
										searchState.overriddenProvidedFilterTypes.value,
									),
							targetPreferences: getServerInstallTargetPreferences(contentType),
							getProjectVersions: getInstallProjectVersions,
							queue: serverInstallQueue,
							install: (plan) =>
								openServerModpackInstallFlow({
									projectId: plan.projectId,
									versionId: plan.versionId,
									name: plan.project.name,
									iconUrl: plan.project.icon_url ?? undefined,
								}),
						})
						if (!isModpack) await resolveQueuedServerInstallPlan(plan)
					} catch (err) {
						if (!isModpack) removeQueuedServerInstall(projectResult.project_id)
						handleError(err as Error)
					} finally {
						if (shouldShowInstalling) {
							setProjectInstalling(projectResult.project_id, false)
						}
					}
				},
			},
		]
	}

	const isModpack = projectResult.project_types?.includes('modpack')
	const shouldUseInstallIcon = !!instance.value || isModpack

	return [
		{
			key: 'install',
			label: formatMessage(
				isInstalling
					? messages.installingToServer
					: showAsInstalled
						? commonMessages.installedLabel
						: shouldUseInstallIcon
							? commonMessages.installButton
							: messages.addToAnInstance,
			),
			icon: isInstalling ? SpinnerIcon : showAsInstalled ? CheckIcon : PlusIcon,
			iconClass: isInstalling ? 'animate-spin' : undefined,
			disabled: showAsInstalled || isInstalling,
			color: 'brand',
			type: 'outlined',
			onClick: async () => {
				setProjectInstalling(projectResult.project_id, true)
				try {
					const selectedInstall = instance.value
						? await chooseInstanceInstallVersion(projectResult, currentProjectType)
						: isModpack
							? await chooseFilterMatchingInstallVersion(projectResult, currentProjectType)
							: { versionId: null as string | null }
					if (selectedInstall === null) {
						setProjectInstalling(projectResult.project_id, false)
						return
					}
					const selectedPreferences = getCurrentSelectedInstallPreferences(currentProjectType)
					await installVersion(
						projectResult.project_id,
						selectedInstall.versionId,
						instance.value ? instance.value.id : null,
						'SearchCard',
						(versionId, installedProjectIds) => {
							setProjectInstalling(projectResult.project_id, false)
							if (versionId) {
								onSearchResultsInstalled(installedProjectIds ?? [projectResult.project_id])
							}
						},
						(profile) => {
							router.push(`/instance/${profile}`)
						},
						{
							preferredLoader: instance.value?.loader ?? selectedPreferences.loaders?.[0],
							preferredGameVersion:
								instance.value?.game_version ?? selectedPreferences.gameVersions?.[0],
						},
					)
				} catch (err) {
					setProjectInstalling(projectResult.project_id, false)
					handleError(err)
				}
			},
		},
	]
}

/**
 * Portalrinth's own: the install button on a CurseForge result.
 *
 * It goes through the same install flow a Modrinth result does, so the user
 * gets the same instance picker with its compatibility and "already
 * installed" checks, the same incompatible-version warning, and a modpack
 * becomes a new instance through the CurseForge pack installer.
 */
function getCurseforgeCardActions(
	result: Labrinth.Search.v3.ResultSearchProject,
	currentProjectType: string,
): CardAction[] {
	const projectResult = result as Labrinth.Search.v3.ResultSearchProject & { installed?: boolean }
	const isModpack = currentProjectType === 'modpack'
	const isInstalling = installingProjectIds.value.has(projectResult.project_id)
	const isInstalled =
		!isModpack && (projectResult.installed || allInstalledIds.value.has(projectResult.project_id))
	const shouldUseInstallIcon = !!instance.value || isModpack

	return [
		{
			key: 'install',
			label: formatMessage(
				isInstalling
					? messages.installingToServer
					: isInstalled
						? commonMessages.installedLabel
						: shouldUseInstallIcon
							? commonMessages.installButton
							: messages.addToAnInstance,
			),
			icon: isInstalling ? SpinnerIcon : isInstalled ? CheckIcon : PlusIcon,
			iconClass: isInstalling ? 'animate-spin' : undefined,
			disabled: isInstalled || isInstalling,
			color: 'brand',
			type: 'outlined',
			onClick: async () => {
				setProjectInstalling(projectResult.project_id, true)
				try {
					const selectedPreferences = getCurrentSelectedInstallPreferences(currentProjectType)
					await installVersion(
						projectResult.project_id,
						null,
						instance.value ? instance.value.id : null,
						'SearchCard',
						(versionId, installedProjectIds) => {
							setProjectInstalling(projectResult.project_id, false)
							if (versionId) {
								onSearchResultsInstalled(installedProjectIds ?? [projectResult.project_id])
							}
						},
						(profile) => {
							router.push(`/instance/${profile}`)
						},
						{
							preferredLoader: instance.value?.loader ?? selectedPreferences.loaders?.[0],
							preferredGameVersion:
								instance.value?.game_version ?? selectedPreferences.gameVersions?.[0],
						},
					)
				} catch (err) {
					setProjectInstalling(projectResult.project_id, false)
					handleError(err)
				}
			},
		},
	]
}

/**
 * The platform toggle on a card while both are listed: two icons when the
 * project is on both, a badge when it is on just one.
 */
function getCardSources(result: Labrinth.Search.v3.ResultSearchProject): CardSources | null {
	if (!isCombined.value || projectType.value === 'server') return null
	const modrinth = {
		key: 'modrinth',
		label: 'Modrinth',
		icon: ModrinthBrandIcon,
		iconClass: 'text-[#1bd96a] portalrinth-brand-icon',
	}
	const curseforge = {
		key: 'curseforge',
		label: 'CurseForge',
		icon: CurseForgeIcon,
		iconClass: 'text-[#f16436] portalrinth-brand-icon',
	}
	const label = formatMessage(messages.cardSourceLabel)
	if (isCurseforgeId(result.project_id)) {
		return { label, options: [{ ...curseforge, active: true, onSelect: () => {} }] }
	}
	if (!combinedTwins.value.has(result.project_id)) {
		return { label, options: [{ ...modrinth, active: true, onSelect: () => {} }] }
	}
	const picked = pickedSource.value[result.project_id] ?? 'modrinth'
	const select = (source: BrowseSource) => () => {
		pickedSource.value = { ...pickedSource.value, [result.project_id]: source }
	}
	return {
		label,
		options: [
			{ ...modrinth, active: picked === 'modrinth', onSelect: select('modrinth') },
			{ ...curseforge, active: picked === 'curseforge', onSelect: select('curseforge') },
		],
	}
}

/** Loads a CurseForge project's page ahead of a click on its card. */
// Only a card the pointer rests on is loaded ahead, not every card it crosses.
let hoverPrefetchTimer: ReturnType<typeof setTimeout> | undefined
function prefetchCurseforgeProject(result: Labrinth.Search.v3.ResultSearchProject) {
	clearTimeout(hoverPrefetchTimer)
	if (!isCurseforgeId(result.project_id)) return
	hoverPrefetchTimer = setTimeout(
		() => void queryClient.prefetchQuery(curseforgeProjectQueryOptions(result.project_id)),
		250,
	)
}

function onSearchResultInstalled(id: string) {
	if (isServerContext.value) {
		markServerProjectInstalled(id)
		return
	}
	if (!newlyInstalled.value.includes(id)) {
		newlyInstalled.value = [...newlyInstalled.value, id]
	}
}

function onSearchResultsInstalled(ids: string[]) {
	if (isServerContext.value) {
		for (const id of ids) {
			markServerProjectInstalled(id)
		}
		return
	}
	newlyInstalled.value = Array.from(new Set([...newlyInstalled.value, ...ids]))
}

/**
 * Portalrinth's own: the same search, asked of CurseForge.
 *
 * Paging, sort and the typed query come from the very request string a
 * Modrinth search is sent; filters are read from the structured list instead,
 * since CurseForge only understands a game version and loaders. What comes
 * back is already in Labrinth's search-hit shape, so the cards cannot tell.
 */
async function searchCurseforge(requestParams: string, combined = false) {
	const nothing = { projectHits: [], serverHits: [], total_hits: 0, per_page: 20 }
	if (!curseforgeKeyAvailable.value) {
		return nothing
	}
	const params = new URLSearchParams(requestParams.replace(/^\?/, ''))
	const provided = combinedProvidedFilters.value.filter(
		(filter) => !searchState.overriddenProvidedFilterTypes.value.includes(filter.type),
	)
	const filters = [
		...searchState.currentFilters.value.filter(
			(filter) => !provided.some((p) => p.type === filter.type),
		),
		...provided,
	].filter((filter) => !filter.negative)
	const optionsOf = (...types: string[]) =>
		filters.filter((filter) => types.includes(filter.type)).map((filter) => filter.option)
	const categoryFilters = filters.filter((filter) => filter.type.startsWith('category_'))
	// Listed together, the filters are Modrinth's: categories are matched to
	// CurseForge's by name, and a filter CurseForge cannot apply leaves it out
	// rather than letting it answer unfiltered.
	if (combined) {
		const allFilters = [
			...searchState.currentFilters.value.filter(
				(filter) => !provided.some((p) => p.type === filter.type),
			),
			...provided,
		]
		if (allFilters.some((filter) => filter.negative || !isCurseforgeFilterType(filter.type))) {
			return nothing
		}
	}
	const categoryIds = categoryFilters
		.map(
			(filter) =>
				curseforgeCategories.value.find((c) =>
					combined ? looseName(c.name) === looseName(filter.option) : c.name === filter.option,
				)?.id,
		)
		.filter((id): id is number => id !== undefined)
	if (combined && categoryIds.length < categoryFilters.length) {
		return nothing
	}

	const query = {
		query: params.get('query'),
		project_type: projectType.value,
		game_versions: optionsOf('game_version'),
		loaders: optionsOf('mod_loader', 'modpack_loader'),
		category_ids: categoryIds,
		sort: params.get('index') ?? 'relevance',
		offset: Number(params.get('offset') ?? 0),
		limit: Number(params.get('limit') ?? 20),
	}
	const results = await queryClient.fetchQuery({
		queryKey: ['search', 'curseforge', query],
		queryFn: () => curseforgeSearch(query),
		staleTime: 30_000,
	})
	// So a project's page can draw its header the moment its card is clicked.
	for (const hit of results.hits) {
		queryClient.setQueryData(curseforgeKeys.summary(hit.project_id), hit)
	}

	const installedIds = new Set([...newlyInstalled.value, ...(installedProjectIds.value ?? [])])
	// CurseForge's search cannot leave projects out, so "hide installed" drops
	// them from the page it answered, which then holds fewer than asked for.
	const hideInstalled =
		(instance.value || projectType.value === 'modpack') &&
		(projectType.value === 'modpack' ? hideInstalledModpacks.value : instanceHideInstalled.value)
	const hits = hideInstalled
		? results.hits.filter((hit) => !hiddenInstanceProjectIds.value.has(hit.project_id))
		: results.hits
	return {
		projectHits: hits.map((hit) => ({
			...hit,
			// CurseForge counts likes, not followers, so the card shows none.
			follows: undefined as unknown as number,
			installed: projectType.value !== 'modpack' && installedIds.has(hit.project_id),
		})),
		serverHits: [],
		total_hits: results.total_hits,
		per_page: results.hits_per_page,
	}
}

/**
 * Both at once: the two answer side by side, a project on both is one card
 * (Modrinth's, with a toggle for where to install it from), and the rest
 * take turns so neither is buried under the other.
 */
async function searchCombined(requestParams: string) {
	const [modrinth, curseforge] = await Promise.all([
		searchModrinth(requestParams),
		searchCurseforge(requestParams, true).catch((err) => {
			debugLog('curseforge search failed in combined mode', err)
			return { projectHits: [], serverHits: [], total_hits: 0, per_page: 20 }
		}),
	])
	const twins = new Map<string, Labrinth.Search.v3.ResultSearchProject>()
	const bySlug = new Map<string, Labrinth.Search.v3.ResultSearchProject>()
	const byName = new Map<string, Labrinth.Search.v3.ResultSearchProject>()
	for (const hit of modrinth.projectHits) {
		if (hit.slug) bySlug.set(looseName(hit.slug), hit)
		byName.set(looseName(hit.name), hit)
	}
	const onlyCurseforge: Labrinth.Search.v3.ResultSearchProject[] = []
	for (const hit of curseforge.projectHits) {
		const name = byName.get(looseName(hit.name))
		const match =
			(hit.slug ? bySlug.get(looseName(hit.slug)) : undefined) ??
			(name && looseName(name.author) === looseName(hit.author) ? name : undefined) ??
			name
		if (match && !twins.has(match.project_id)) {
			twins.set(match.project_id, hit)
		} else if (!match) {
			onlyCurseforge.push(hit)
		}
	}
	const merged: Labrinth.Search.v3.ResultSearchProject[] = []
	const length = Math.max(modrinth.projectHits.length, onlyCurseforge.length)
	for (let i = 0; i < length; i++) {
		if (modrinth.projectHits[i]) merged.push(modrinth.projectHits[i])
		if (onlyCurseforge[i]) merged.push(onlyCurseforge[i])
	}
	combinedTwins.value = new Map([...combinedTwins.value, ...twins])
	return {
		projectHits: merged,
		serverHits: [],
		total_hits: Math.max(modrinth.total_hits, curseforge.total_hits),
		per_page: modrinth.per_page,
	}
}

async function search(requestParams: string) {
	if (isCurseforge.value) {
		return await searchCurseforge(requestParams)
	}
	if (isCombined.value && projectType.value !== 'server') {
		return await searchCombined(requestParams)
	}
	return await searchModrinth(requestParams)
}

async function searchModrinth(requestParams: string) {
	debugLog('searching v3', requestParams)
	const isServer = projectType.value === 'server'

	const rawResults = await queryClient.fetchQuery({
		queryKey: ['search', 'v3', requestParams],
		queryFn: () =>
			get_search_results_v3(requestParams, 'must_revalidate') as Promise<{
				result: Labrinth.Search.v3.SearchResults & {
					hits: (Labrinth.Search.v3.ResultSearchProject & { installed?: boolean })[]
				}
			} | null>,
		staleTime: 30_000,
	})

	if (!rawResults) {
		return {
			projectHits: [],
			serverHits: [],
			total_hits: 0,
			per_page: 20,
		}
	}

	for (const hit of rawResults.result.hits) {
		for (const identifier of [hit.project_id, hit.slug]) {
			if (identifier) {
				queryClient.setQueryData(['projects', 'summary', identifier], hit)
			}
		}
	}

	if (isServer) {
		const hits = rawResults.result.hits ?? []
		updateServerHits(hits)
		return {
			projectHits: [],
			serverHits: hits,
			total_hits: rawResults.result.total_hits ?? 0,
			per_page: rawResults.result.hits_per_page,
		}
	}

	const hits = rawResults.result.hits.map((hit) => {
		const mapped: Labrinth.Search.v3.ResultSearchProject & { installed?: boolean } = {
			...hit,
		}

		if (instance.value || isServerContext.value || projectType.value === 'modpack') {
			const installedIds =
				isServerContext.value && projectType.value !== 'modpack'
					? serverContentProjectIds.value
					: new Set([...newlyInstalled.value, ...(installedProjectIds.value ?? [])])
			mapped.installed = installedIds.has(hit.project_id)
		}

		return mapped
	})

	return {
		projectHits: hits,
		serverHits: [],
		total_hits: rawResults.result.total_hits,
		per_page: rawResults.result.hits_per_page,
	}
}

const lockedFilterMessages = computed(() => ({
	gameVersion: formatMessage(messages.gameVersionProvidedByInstance),
	modLoader: formatMessage(messages.modLoaderProvidedByInstance),
	environment: formatMessage(messages.environmentProvidedByServer),
	syncButton: formatMessage(messages.syncFilterButton),
	providedBy: formatMessage(messages.providedByInstance),
}))

/**
 * Whether the results are one long scroll rather than pages, and how many
 * are on a page. Both are the person's own choices, remembered between
 * launches.
 */
const browseInfiniteScroll = computed(() => browseScrollScope.value !== 'off')
const browsePageSizeOptions = computed(() => {
	const sizes = new Set(BROWSE_PAGE_SIZES)
	sizes.add(browsePageSize.value)
	const sorted = [...sizes].sort((a, b) => a - b)
	// CurseForge hands out at most 50 results a page.
	return isCurseforge.value || isCombined.value ? sorted.filter((size) => size <= 50) : sorted
})

const searchState = useBrowseSearch({
	projectType,
	tags: browseTags,
	active: browseRouteActive,
	providedFilters: combinedProvidedFilters,
	search,
	// Whether the list is one long scroll, and how many are on a page.
	infiniteScroll: browseInfiniteScroll,
	maxResultsOptions: browsePageSizeOptions,
	persistentQueryParams: ['i', 'ai', 'shi', 'sid', 'wid', 'from', 'src'],
	getExtraQueryParams: () => ({
		src: sourceQuery(browseSource.value),
		sid: serverIdQuery.value || undefined,
		wid: effectiveServerWorldId.value || undefined,
		ai: instanceHideInstalled.value ? 'true' : undefined,
		shi: serverHideInstalled.value ? 'true' : undefined,
	}),
})

watch(
	browsePageSize,
	(size) => {
		searchState.maxResults.value = size
	},
	{ immediate: true },
)

watch(
	[
		() => searchState.query.value,
		() =>
			searchState.isServerType.value
				? searchState.serverCurrentFilters.value
				: searchState.currentFilters.value,
		() => projectType.value,
	],
	() => {
		if (isServerContext.value && projectType.value !== 'modpack') {
			syncHiddenServerContentProjectIds()
		} else if (instance.value || projectType.value === 'modpack') {
			syncHiddenInstanceProjectIds()
		}
	},
	{ deep: true },
)

watch(browseSource, async (source, previous) => {
	// CurseForge's categories are its own, so none carries over to or from it
	// (listing both uses Modrinth's); and pages do not line up between them,
	// so a switch starts from the top.
	if (source === 'curseforge' || previous === 'curseforge') {
		searchState.currentFilters.value = searchState.currentFilters.value.filter(
			(filter) => !filter.type.startsWith('category_'),
		)
	}
	await searchState.setPage(1)
	// The search only reruns by itself when its request changes, and the
	// source is not part of the request, so it is rerun here.
	await router.replace({
		query: { ...route.query, src: sourceQuery(source) },
	})
	await searchState.refreshSearch()
})

watch(queuedServerInstallCount, (count) => {
	if (count === 0) {
		hideSelectedServerInstalls.value = false
	}
})

if (instance.value?.game_version) {
	const gv = instance.value.game_version
	const alreadyHasGv = searchState.serverCurrentFilters.value.some(
		(f) => f.type === 'server_game_version' && f.option === gv,
	)
	if (!alreadyHasGv) {
		searchState.serverCurrentFilters.value.push({ type: 'server_game_version', option: gv })
	}
}

void searchState.refreshSearch()

useAppEvent('instance', async (event) => {
	if (event.event === 'created' || event.event === 'removed') {
		if (!route.query.i) {
			await refreshInstalledProjectIds()
			if (projectType.value === 'modpack') {
				if (event.event === 'removed') {
					syncHiddenInstanceProjectIds()
				}
				await searchState.refreshSearch()
			}
		}
	}

	if (instance.value && event.instance_id === instance.value.id && event.event === 'synced') {
		await refreshInstalledProjectIds()
		await searchState.refreshSearch()
	}
})

function getProjectBrowseQuery() {
	if (!browseRouteActive.value) {
		return undefined
	}
	if (!installContext.value) return undefined
	return {
		...route.query,
		b: route.fullPath,
	}
}

const advancedFiltersCollapsed = computed({
	get: () => appSettings.advancedFiltersCollapsed,
	set: (value) => {
		appSettings.advancedFiltersCollapsed = value
		getSettings()
			.then((settings) => {
				settings.advanced_filters_collapsed = value
				return setSettings(settings)
			})
			.catch(handleError)
	},
})

const dismissedPhotosensitivityFilterWarning = computed({
	get: () => appSettings.dismissedPhotosensitivityFilterWarning,
	set: (value) => {
		appSettings.dismissedPhotosensitivityFilterWarning = value
		getSettings()
			.then((settings) => {
				settings.dismissed_photosensitivity_filter_warning = value
				return setSettings(settings)
			})
			.catch(handleError)
	},
})

/**
 * The pictures of the people and organizations whose projects are on the page,
 * by `u:<user id>` and `o:<organization id>`. Search does not say what they
 * are, so they are asked for once a page arrives, in one request for each kind,
 * and kept for as long as the page is open. CurseForge's results bring their
 * own.
 */
const authorAvatars = ref<Record<string, string | null>>({})

watch(
	() => searchState.projectHits.value,
	async (hits) => {
		const known = authorAvatars.value
		const userIds = new Set<string>()
		const organizationIds = new Set<string>()
		for (const hit of hits) {
			if (isCurseforgeId(hit.project_id)) continue
			if (hit.organization_id) {
				if (!(`o:${hit.organization_id}` in known)) organizationIds.add(hit.organization_id)
			} else if (hit.author_id && !(`u:${hit.author_id}` in known)) {
				userIds.add(hit.author_id)
			}
		}
		if (userIds.size === 0 && organizationIds.size === 0) return

		const [users, organizations] = await Promise.all([
			userIds.size > 0
				? (get_user_many([...userIds]) as Promise<{ id: string; avatar_url?: string | null }[]>)
				: Promise.resolve([]),
			organizationIds.size > 0
				? (get_organization_many([...organizationIds]) as Promise<
						{ id: string; icon_url?: string | null }[]
					>)
				: Promise.resolve([]),
		]).catch(() => [[], []] as const)

		const next = { ...authorAvatars.value }
		// Asked for and not found is remembered too, so it is not asked for again.
		for (const id of userIds) next[`u:${id}`] = null
		for (const id of organizationIds) next[`o:${id}`] = null
		for (const user of users ?? []) next[`u:${user.id}`] = user.avatar_url ?? null
		for (const organization of organizations ?? []) {
			next[`o:${organization.id}`] = organization.icon_url ?? null
		}
		authorAvatars.value = next
	},
)

function getAuthorAvatar(result: Labrinth.Search.v3.ResultSearchProject): string | null {
	const own = (result as { author_avatar_url?: string | null }).author_avatar_url
	if (own) return own
	if (result.organization_id) return authorAvatars.value[`o:${result.organization_id}`] ?? null
	if (result.author_id) return authorAvatars.value[`u:${result.author_id}`] ?? null
	return null
}

provideBrowseManager({
	getAuthorAvatar,
	tags: browseTags,
	projectType,
	...searchState,
	advancedFiltersCollapsed,
	dismissedPhotosensitivityFilterWarning,
	getProjectLink: (result: Labrinth.Search.v3.ResultSearchProject) => ({
		path: isCurseforgeId(result.project_id)
			? `/curseforge/${result.project_id}`
			: `/project/${result.project_id ?? result.slug}`,
		query: getProjectBrowseQuery(),
	}),
	hiddenFilterTypes: computed(() =>
		isCurseforge.value
			? searchState.filters.value
					.map((filter) => filter.id)
					.filter((id) => !isCurseforgeFilterType(id))
			: [],
	),
	onProjectHover: prefetchCurseforgeProject,
	getServerProjectLink: (result: Labrinth.Search.v3.ResultSearchProject) => ({
		path: `/project/${result.slug ?? result.project_id}`,
		query: getProjectBrowseQuery(),
	}),
	selectableProjectTypes,
	showProjectTypeTabs: computed(() => !isServerContext.value),
	variant: 'app',
	getCardActions,
	getCardSources,
	installContext,
	providedFilters: combinedProvidedFilters,
	hideInstalled: computed({
		get: () => {
			if (projectType.value === 'modpack') return hideInstalledModpacks.value
			if (isServerContext.value) return serverHideInstalled.value
			return instanceHideInstalled.value
		},
		set: (val: boolean) => {
			if (projectType.value === 'modpack') {
				hideInstalledModpacks.value = val
				if (val) syncHiddenInstanceProjectIds()
				return
			}
			if (isServerContext.value) {
				serverHideInstalled.value = val
				if (val) syncHiddenServerContentProjectIds()
			} else {
				instanceHideInstalled.value = val
				if (val) syncHiddenInstanceProjectIds()
			}
		},
	}),
	showHideInstalled: computed(
		() =>
			projectType.value === 'modpack' ||
			(isServerContext.value && projectType.value !== 'modpack') ||
			!!instance.value,
	),
	hideInstalledLabel: computed(() =>
		formatMessage(
			isFromWorlds.value
				? messages.hideAddedServers
				: projectType.value === 'modpack'
					? messages.hideInstalledModpacks
					: commonMessages.hideInstalledContentLabel,
		),
	),
	hideSelected: hideSelectedServerInstalls,
	showHideSelected: computed(
		() =>
			isServerContext.value &&
			projectType.value !== 'modpack' &&
			queuedServerInstallCount.value > 0,
	),
	hideSelectedLabel: computed(() => formatMessage(commonMessages.hideSelectedContentLabel)),
	onInstalled: onSearchResultInstalled,
	serverPings,
	getServerModpackContent,
	onContextMenu: handleRightClick,
	offline,
	lockedFilterMessages,
})
</script>

<template>
	<div class="flex flex-col gap-2 p-6">
		<BrowsePageLayout>
			<template v-if="curseforgeOffered" #tabs-end>
				<BrowseSourcePicker v-model="browseSource" />
			</template>
			<template v-if="curseforgeNeedsKey" #results-replacement>
				<div
					class="flex flex-col items-center gap-3 rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center"
				>
					<CurseForgeIcon class="h-10 w-10 text-secondary" />
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.curseforgeKeyTitle) }}
					</h3>
					<p class="m-0 max-w-[32rem] text-secondary">
						{{ formatMessage(messages.curseforgeKeyDescription) }}
					</p>
					<Button type="colored" color="brand" @click="settingsActions.openCurseforge()">
						<SettingsIcon />
						{{ formatMessage(messages.curseforgeKeyAction) }}
					</Button>
				</div>
			</template>
			<template #after>
				<ContextMenu ref="contextMenuRef" :label="formatMessage(messages.projectActionsLabel)">
					<template #open_link="{ option }">
						<GlobeIcon /> {{ option.label }} <ExternalIcon />
					</template>
				</ContextMenu>
			</template>
		</BrowsePageLayout>
		<CreationFlowModal
			v-if="isServerContext && projectType === 'modpack'"
			ref="serverSetupModalRef"
			:type="serverFlowFrom === 'reset-server' ? 'reset-server' : 'server-onboarding'"
			:available-loaders="['vanilla', 'fabric', 'neoforge', 'forge', 'quilt', 'paper', 'purpur']"
			:show-snapshot-toggle="true"
			:on-back="onServerFlowBack"
			:search-modpacks="searchServerModpacks"
			:get-project-versions="getServerProjectVersions"
			:get-loader-manifest="getLoaderManifest"
			@hide="() => {}"
			@browse-modpacks="() => {}"
			@create="handleServerModpackFlowCreate"
		/>
		<Teleport v-if="browseRouteActive" to="#sidebar-teleport-target">
			<BrowseSidebar />
		</Teleport>
	</div>
</template>
