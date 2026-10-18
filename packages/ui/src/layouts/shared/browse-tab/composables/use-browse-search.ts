import type { Labrinth } from '@modrinth/api-client'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useDebugLogger } from '#ui/composables/debug-logger'
import {
	compatibleAdvancedFilters,
	getAdvancedOptionIds,
	getAvailableAdvancedIds,
	mergeAdvancedPrefs,
	replaceAdvancedFilters,
	sameOptionIds,
	useAdvancedPrefs,
} from '#ui/utils/advanced-filter-preferences'
import type {
	EnvironmentSearchOverride,
	FilterType,
	FilterValue,
	ProjectType,
	SortType,
} from '#ui/utils/search'
import { LOADER_FILTER_TYPES, useSearch } from '#ui/utils/search'
import { useServerSearch } from '#ui/utils/server-search'

import type { BrowseSearchResponse } from '../types'

export interface UseBrowseSearchOptions {
	projectType: Ref<string>
	tags: Ref<{
		gameVersions: Labrinth.Tags.v2.GameVersion[]
		loaders: Labrinth.Tags.v2.Loader[]
		categories: Labrinth.Tags.v2.Category[]
	}>
	providedFilters?: ComputedRef<FilterValue[]>
	environmentOverride?: ComputedRef<EnvironmentSearchOverride | undefined>
	active?: ComputedRef<boolean>
	search: (params: string) => Promise<BrowseSearchResponse>
	persistentQueryParams: string[]
	getExtraQueryParams?: () => Record<string, string | undefined>
	maxResultsOptions?: ComputedRef<number[]>
	displayMode?: Ref<'list' | 'grid' | 'gallery'> | ComputedRef<'list' | 'grid' | 'gallery'>
	/** When true, results arrive by scrolling instead of by turning pages. */
	infiniteScroll?: Ref<boolean>
}

export interface BrowseSearchState {
	query: Ref<string>

	filters: ComputedRef<FilterType[]>
	currentFilters: Ref<FilterValue[]>
	toggledGroups: Ref<string[]>
	overriddenProvidedFilterTypes: Ref<string[]>

	serverFilterTypes: ComputedRef<FilterType[]>
	serverCurrentFilters: Ref<FilterValue[]>
	serverToggledGroups: Ref<string[]>

	effectiveSortTypes: ComputedRef<readonly SortType[]>
	effectiveCurrentSortType: Ref<SortType>

	loading: Ref<boolean>
	refreshing: Ref<boolean>
	projectHits: ShallowRef<BrowseSearchResponse['projectHits']>
	serverHits: ShallowRef<BrowseSearchResponse['serverHits']>
	totalHits: Ref<number>
	pageCount: ComputedRef<number>

	maxResults: Ref<number>
	currentPage: Ref<number>

	isServerType: ComputedRef<boolean>
	effectiveLayout: ComputedRef<'list' | 'grid'>
	deprioritizedTags: ComputedRef<string[]>
	excludeLoaders: ComputedRef<boolean>

	refreshSearch: () => Promise<void>
	setPage: (page: number) => Promise<void>
	/** Appends the next page below the ones shown, for scrolling instead of paging. */
	loadMore: () => Promise<void>
	loadingMore: Ref<boolean>
	canLoadMore: ComputedRef<boolean>
	infiniteScroll: ComputedRef<boolean>
	clearSearch: () => void
	onFilterChange: () => void

	linkOverridesAdvancedPrefs: Ref<boolean>
	applySavedAdvancedPrefs: () => void
}

export function useBrowseSearch(options: UseBrowseSearchOptions): BrowseSearchState {
	const debug = useDebugLogger('BrowseSearch')
	const route = useRoute()
	const router = useRouter()

	debug('init, projectType:', options.projectType.value)

	const active = computed(() => options.active?.value ?? true)
	const projectTypes = computed(() => [options.projectType.value] as ProjectType[])
	const isServerType = computed(() => options.projectType.value === 'server')

	const {
		query,
		currentSortType,
		currentFilters,
		toggledGroups,
		maxResults,
		currentPage,
		overriddenProvidedFilterTypes,
		filters,
		sortTypes,
		requestParams,
		createPageParams,
	} = useSearch(
		projectTypes,
		options.tags,
		options.providedFilters ?? computed(() => []),
		options.environmentOverride ?? computed(() => undefined),
	)

	const {
		serverCurrentSortType,
		serverCurrentFilters,
		serverToggledGroups,
		serverSortTypes,
		serverFilterTypes,
		serverRequestParams,
		createServerPageParams,
	} = useServerSearch({
		tags: options.tags,
		query,
		maxResults,
		currentPage,
		providedFilters: options.providedFilters,
	})

	const effectiveRequestParams = computed(() =>
		isServerType.value ? serverRequestParams.value : requestParams.value,
	)
	const effectiveSortTypes = computed(() =>
		isServerType.value ? (serverSortTypes.value as readonly SortType[]) : sortTypes.value,
	)
	const effectiveCurrentSortType = computed({
		get: () => (isServerType.value ? serverCurrentSortType.value : currentSortType.value),
		set: (v: SortType) => {
			if (isServerType.value) serverCurrentSortType.value = v
			else currentSortType.value = v
		},
	})

	const effectiveMaxResultsOptions = computed(
		() => options.maxResultsOptions?.value ?? [5, 10, 15, 20, 50, 100],
	)

	watch(effectiveMaxResultsOptions, (opts) => {
		if (!opts.includes(maxResults.value)) {
			maxResults.value = opts.reduce((prev, curr) =>
				Math.abs(curr - maxResults.value) <= Math.abs(prev - maxResults.value) ? curr : prev,
			)
		}
	})

	const effectiveDisplayMode = computed(() => options.displayMode?.value ?? 'list')
	const effectiveLayout = computed<'list' | 'grid'>(() =>
		effectiveDisplayMode.value === 'grid' || effectiveDisplayMode.value === 'gallery'
			? 'grid'
			: 'list',
	)

	const selectedFilterTags = computed(() =>
		currentFilters.value
			.filter(
				(f) =>
					f.type.startsWith('category_') ||
					LOADER_FILTER_TYPES.includes(f.type as (typeof LOADER_FILTER_TYPES)[number]),
			)
			.map((f) => f.option),
	)
	const excludeLoaders = computed(
		() =>
			currentFilters.value.some((f) =>
				LOADER_FILTER_TYPES.includes(f.type as (typeof LOADER_FILTER_TYPES)[number]),
			) || ['resourcepack', 'datapack'].includes(options.projectType.value),
	)
	const loadersNotForThisType = computed(
		() =>
			options.tags.value?.loaders
				?.filter((loader) => !loader.supported_project_types.includes(options.projectType.value))
				?.map((loader) => loader.name) ?? [],
	)
	const deprioritizedTags = computed(() => [
		...selectedFilterTags.value,
		...loadersNotForThisType.value,
	])

	const loading = ref(true)
	const refreshing = ref(false)
	const projectHits = shallowRef<BrowseSearchResponse['projectHits']>([])
	const serverHits = shallowRef<BrowseSearchResponse['serverHits']>([])
	const totalHits = ref(0)

	/**
	 * Whether results arrive by scrolling rather than by turning pages.
	 *
	 * Set by whoever mounts the browse tab, because it is a setting and settings
	 * live with the application rather than with the search. It is read through
	 * a ref rather than copied, so turning it in settings takes effect on the
	 * tab that is already open instead of after a restart.
	 */
	const infiniteScroll = options.infiniteScroll ?? ref(false)
	const effectiveInfiniteScroll = computed(() => infiniteScroll.value && !isServerType.value)

	/** How many pages have already been appended below the first one. */
	const loadedExtraPages = ref(0)
	const loadingMore = ref(false)
	/**
	 * Set once a page comes back with nothing new in it.
	 *
	 * Without this the end-of-list marker stays in view after a page that added
	 * nothing — which is what an empty page, a filtered one or a repeated one
	 * all look like — and the observer asks again immediately, forever.
	 */
	const exhausted = ref(false)
	const canLoadMore = computed(
		() =>
			effectiveInfiniteScroll.value &&
			!exhausted.value &&
			!loading.value &&
			projectHits.value.length > 0 &&
			projectHits.value.length < totalHits.value,
	)

	const pageCount = computed(() => {
		if (totalHits.value === 0) return 1
		return Math.ceil(totalHits.value / maxResults.value)
	})

	let searchVersion = 0
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

	function clearSearchDebounce() {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer)
			searchDebounceTimer = null
		}
	}

	const providedFiltersOrEmpty = computed(() => options.providedFilters?.value ?? [])
	const effectiveCurrentFilters = computed(() =>
		isServerType.value ? serverCurrentFilters.value : currentFilters.value,
	)
	const effectiveFilterTypes = computed(() =>
		isServerType.value ? serverFilterTypes.value : filters.value,
	)

	const advancedPrefs = useAdvancedPrefs()
	const linkOverridesAdvancedPrefs = ref(false)
	const selectedAdvancedIds = computed(() => getAdvancedOptionIds(effectiveCurrentFilters.value))

	function hasSearchQuery(): boolean {
		return Object.keys(route.query).some((key) => !options.persistentQueryParams.includes(key))
	}

	function getCompatiblePrefs(): FilterValue[] {
		return compatibleAdvancedFilters(advancedPrefs.value, effectiveFilterTypes.value)
	}

	function setEffectiveFilters(nextFilters: FilterValue[]) {
		if (isServerType.value) {
			serverCurrentFilters.value = nextFilters
		} else {
			currentFilters.value = nextFilters
		}
	}

	function applyAdvancedPrefs(prefs: FilterValue[]) {
		setEffectiveFilters(replaceAdvancedFilters(effectiveCurrentFilters.value, prefs))
	}

	function syncLinkOverride() {
		const prefIds = getAdvancedOptionIds(getCompatiblePrefs())
		linkOverridesAdvancedPrefs.value =
			prefIds.length > 0 && !sameOptionIds(selectedAdvancedIds.value, prefIds)
	}

	function initAdvancedPrefs() {
		const prefs = getCompatiblePrefs()

		if (!hasSearchQuery()) {
			if (prefs.length > 0) {
				applyAdvancedPrefs(prefs)
			}
			linkOverridesAdvancedPrefs.value = false
			return
		}

		syncLinkOverride()
	}

	function applySavedAdvancedPrefs() {
		applyAdvancedPrefs(getCompatiblePrefs())
		linkOverridesAdvancedPrefs.value = false
	}

	initAdvancedPrefs()

	watch(selectedAdvancedIds, (selected, previous) => {
		if (previous && sameOptionIds(selected, previous)) {
			return
		}

		const nextPrefs = mergeAdvancedPrefs(
			advancedPrefs.value,
			selected,
			getAvailableAdvancedIds(effectiveFilterTypes.value),
		)
		if (!sameOptionIds(advancedPrefs.value, nextPrefs)) {
			advancedPrefs.value = nextPrefs
		}
		linkOverridesAdvancedPrefs.value = false
	})

	watch(
		[
			query,
			maxResults,
			options.projectType,
			effectiveCurrentSortType,
			effectiveCurrentFilters,
			overriddenProvidedFilterTypes,
			providedFiltersOrEmpty,
		],
		() => {
			currentPage.value = 1
		},
		{ deep: true },
	)

	watch(effectiveRequestParams, (newVal, oldVal) => {
		refreshing.value = true
		debug('effectiveRequestParams changed', {
			from: oldVal?.substring(0, 80),
			to: newVal?.substring(0, 80),
		})
		clearSearchDebounce()
		if (!active.value) {
			return
		}
		searchDebounceTimer = setTimeout(() => {
			refreshSearch()
		}, 200)
	})

	watch(active, (isActive, wasActive) => {
		clearSearchDebounce()
		if (isActive && wasActive === false) {
			void refreshSearch()
		}
	})

	async function refreshSearch() {
		if (!active.value) {
			return
		}

		const version = ++searchVersion
		refreshing.value = true
		debug('refreshSearch start', {
			version,
			projectType: options.projectType.value,
			params: effectiveRequestParams.value.substring(0, 100),
		})

		const currentHitsEmpty = isServerType.value
			? serverHits.value.length === 0
			: projectHits.value.length === 0
		if (currentHitsEmpty) {
			loading.value = true
		}

		try {
			const response = await options.search(effectiveRequestParams.value)

			if (!active.value) {
				return
			}

			if (version !== searchVersion) {
				debug('refreshSearch stale, discarding', { version, current: searchVersion })
				return
			}

			if (isServerType.value) {
				serverHits.value = response.serverHits
			} else {
				projectHits.value = response.projectHits
				loadedExtraPages.value = 0
				exhausted.value = false
			}
			totalHits.value = response.total_hits
			debug('refreshSearch complete', {
				version,
				hits: response.total_hits,
				projectHits: response.projectHits.length,
				serverHits: response.serverHits.length,
			})

			updateUrlParams()
			loading.value = false
			refreshing.value = false
		} catch (err) {
			debug('refreshSearch error', err)
			console.error('Browse search error:', err)
			if (version === searchVersion) {
				loading.value = false
				refreshing.value = false
			}
		}
	}

	function updateUrlParams() {
		if (!active.value) {
			return
		}

		debug('updateUrlParams', { path: route.path })
		const persistentParams: Record<string, string | (string | null)[] | null | undefined> = {}

		for (const [key, value] of Object.entries(route.query)) {
			if (options.persistentQueryParams.includes(key)) {
				persistentParams[key] = value
			}
		}

		const extraParams = options.getExtraQueryParams?.() ?? {}
		for (const [key, value] of Object.entries(extraParams)) {
			persistentParams[key] = value
		}

		const params = {
			...persistentParams,
			...(isServerType.value ? createServerPageParams() : createPageParams()),
		}

		router.replace({ path: route.path, query: params })
	}

	async function setPage(newPageNumber: number) {
		currentPage.value = newPageNumber
		await nextTick()
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	/**
	 * Appends the next page below the ones already shown.
	 *
	 * The page is set, read and put back within one synchronous block, so the
	 * watcher that normally turns a page change into a fresh search never sees
	 * the change at all — which is the point: this is an addition to what is on
	 * screen, not a replacement of it.
	 */
	async function loadMore() {
		if (!canLoadMore.value || loadingMore.value || !active.value) {
			return
		}

		const version = searchVersion
		const page = currentPage.value
		currentPage.value = page + 1
		const params = effectiveRequestParams.value
		currentPage.value = page

		loadingMore.value = true
		refreshing.value = true
		try {
			const response = await options.search(params)
			if (!active.value || version !== searchVersion) {
				return
			}

			// The first page is refreshed underneath the list while it is being
			// scrolled, so the same project can arrive twice; it is drawn once.
			const seen = new Set(projectHits.value.map((hit) => hit.project_id))
			const fresh = response.projectHits.filter((hit) => !seen.has(hit.project_id))
			projectHits.value = [...projectHits.value, ...fresh]
			totalHits.value = response.total_hits
			loadedExtraPages.value += 1
			if (!fresh.length) {
				exhausted.value = true
			}
		} catch (err) {
			debug('loadMore error', err)
		} finally {
			loadingMore.value = false
			refreshing.value = false
		}
	}

	function clearSearch() {
		query.value = ''
		currentPage.value = 1
	}

	function onFilterChange() {
		nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
	}

	watch(
		() => options.projectType.value,
		(newType, oldType) => {
			debug('projectType changed', { from: oldType, to: newType })
			effectiveCurrentSortType.value =
				effectiveSortTypes.value.find((sortType) => sortType.name === 'relevance') ??
				effectiveSortTypes.value[0]
			query.value = ''

			void nextTick(() => {
				initAdvancedPrefs()
			})
		},
	)

	return {
		query,
		filters,
		currentFilters,
		toggledGroups,
		overriddenProvidedFilterTypes,
		serverFilterTypes,
		serverCurrentFilters,
		serverToggledGroups,
		effectiveSortTypes,
		effectiveCurrentSortType,
		loading,
		refreshing,
		projectHits,
		serverHits,
		totalHits,
		pageCount,
		maxResults,
		currentPage,
		isServerType,
		effectiveLayout,
		deprioritizedTags,
		excludeLoaders,
		refreshSearch,
		setPage,
		loadMore,
		loadingMore,
		canLoadMore,
		infiniteScroll: effectiveInfiniteScroll,
		clearSearch,
		onFilterChange,
		linkOverridesAdvancedPrefs,
		applySavedAdvancedPrefs,
	}
}
