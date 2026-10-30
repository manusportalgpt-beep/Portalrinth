<script setup lang="ts">
import {
	ArrowDownIcon,
	ArrowUpIcon,
	BlocksIcon,
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CompassIcon,
	ExternalIcon,
	EyeIcon,
	EyeOffIcon,
	GlobeIcon,
	LayersIcon,
	PackageIcon,
	PaintbrushIcon,
	PauseIcon,
	PlayIcon,
	SearchIcon,
	ShirtIcon,
	SparklesIcon,
	SpinnerIcon,
	TagCategoryCartoonIcon,
	TagCategoryCrownIcon,
	TagCategoryFantasyIcon,
	TagCategoryGamepad2Icon,
	TagCategoryMobsIcon,
	TagCategorySkullIcon,
	TagCategorySwordIcon,
	TagCategoryThemedIcon,
	TagCategoryTreePineIcon,
	UserIcon,
	UserRoundIcon,
	UserSearchIcon,
	WrenchIcon,
	XIcon,
} from '@modrinth/assets'
import {
	Button,
	CapeButton,
	CapeLikeTextButton,
	Chips,
	defineMessages,
	injectNotificationManager,
	Input,
	NavTabs,
	NewModal,
	Pagination,
	SkinButton,
	SkinPreviewRenderer,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type Component, computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
	findSimilarLabySkins,
	findSkinByNick,
	isStockLabySkin,
	LABY_PAGE_SIZE,
	type LabySkin,
	labySkinPageUrl,
	labySkinPreview,
	labySkinRenderSources,
	labySkinTags,
	labySkinTexture,
	labySkinVariant,
	type NickSkin,
	pngDataUrl,
	remotePreviewDataUrl,
	searchLabySkins,
	similarSkinCategory,
	similarSkinReference,
} from '@/helpers/laby-skins'
import { playSoundEffect } from '@/helpers/portalrinth-sfx'
import { add_and_equip_custom_skin, type Cape, get_available_capes } from '@/helpers/skins'
import { type BreadcrumbDefinition, injectBreadcrumbManager } from '@/shared/breadcrumbs'

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()
const route = useRoute()
const router = useRouter()

const messages = defineMessages({
	modpacks: { id: 'app.browse.project-type.modpacks', defaultMessage: 'Modpacks' },
	mods: { id: 'app.browse.project-type.mods', defaultMessage: 'Mods' },
	resourcePacks: { id: 'app.browse.project-type.resource-packs', defaultMessage: 'Resource Packs' },
	dataPacks: { id: 'app.browse.project-type.data-packs', defaultMessage: 'Data Packs' },
	shaders: { id: 'app.browse.project-type.shaders', defaultMessage: 'Shaders' },
	servers: { id: 'app.browse.project-type.servers', defaultMessage: 'Servers' },
	skins: { id: 'app.browse.project-type.skins', defaultMessage: 'Skins' },
	discoverSkins: { id: 'app.browse.discover-skins', defaultMessage: 'Discover skins' },
	searchPlaceholder: { id: 'app.skin-browse.search', defaultMessage: 'Search skins...' },
	popular: { id: 'app.skin-browse.popular', defaultMessage: 'Popular skins' },
	results: { id: 'app.skin-browse.results', defaultMessage: 'Results for “{query}”' },
	similarToYours: {
		id: 'app.skin-browse.similar-to-yours',
		defaultMessage: 'Skins similar to yours',
	},
	backToAll: { id: 'app.skin-browse.back-to-all', defaultMessage: 'All skins' },
	nothingFound: { id: 'app.skin-browse.nothing-found', defaultMessage: 'No skins found' },
	loadError: {
		id: 'app.skin-browse.load-error',
		defaultMessage: 'Could not reach laby.net. Check the connection and try again.',
	},
	retry: { id: 'app.skin-browse.retry', defaultMessage: 'Try again' },
	page: { id: 'app.skin-browse.page', defaultMessage: 'Стр. {page}' },
	pageLast: { id: 'app.skin-browse.page-last', defaultMessage: 'Стр. {page} — последняя' },
	modalTitle: { id: 'app.skin-browse.modal-title', defaultMessage: 'Skin' },
	armClassic: { id: 'app.skin-browse.arm-classic', defaultMessage: 'Классика' },
	armSlim: { id: 'app.skin-browse.arm-slim', defaultMessage: 'Slim' },
	uses: { id: 'app.skin-browse.uses', defaultMessage: '{count} players' },
	crouch: { id: 'app.skin-browse.crouch', defaultMessage: 'Crouch' },
	stand: { id: 'app.skin-browse.stand', defaultMessage: 'Stand up' },
	hideLayer: { id: 'app.skin-browse.hide-layer', defaultMessage: 'Hide layer' },
	showLayer: { id: 'app.skin-browse.show-layer', defaultMessage: 'Show layer' },
	addCape: { id: 'app.skin-browse.add-cape', defaultMessage: 'Add cape' },
	noCapes: {
		id: 'app.skin-browse.no-capes',
		defaultMessage: 'This account has no capes',
	},
	noCape: { id: 'app.skin-browse.no-cape', defaultMessage: 'None' },
	capeFallback: { id: 'app.skin-browse.cape-fallback', defaultMessage: 'Cape' },
	startWalking: { id: 'app.skin-browse.start-walking', defaultMessage: 'Enable animation' },
	stopWalking: { id: 'app.skin-browse.stop-walking', defaultMessage: 'Disable animation' },
	install: { id: 'app.skin-browse.install', defaultMessage: 'Install skin' },
	installed: { id: 'app.skin-browse.installed', defaultMessage: 'Skin installed' },
	installedText: {
		id: 'app.skin-browse.installed-text',
		defaultMessage: 'The skin was added to your skins and put on.',
	},
	openOnLaby: { id: 'app.skin-browse.open-on-laby', defaultMessage: 'Open on laby.net' },
	similar: { id: 'app.skin-browse.similar', defaultMessage: 'Similar skins' },
	similarEmpty: {
		id: 'app.skin-browse.similar-empty',
		defaultMessage: 'No similar skins found',
	},
	similarPageOf: {
		id: 'app.skin-browse.similar-page',
		defaultMessage: 'Page {page} of {total}',
	},
	similarCategory: {
		id: 'app.skin-browse.similar-category',
		defaultMessage: 'Category: {tags}',
	},
	filters: { id: 'app.skin-browse.filters', defaultMessage: 'Skin filters' },
	byNick: { id: 'app.skin-browse.filter-nick', defaultMessage: 'By nickname' },
	nickPlaceholder: {
		id: 'app.skin-browse.nick-placeholder',
		defaultMessage: 'Enter a player nickname...',
	},
	nickHeading: { id: 'app.skin-browse.nick-heading', defaultMessage: 'Skin of {nick}' },
	nickPrompt: {
		id: 'app.skin-browse.nick-prompt',
		defaultMessage: 'Type a nickname into the search — the player’s skin will show up here.',
	},
	nickNotFound: {
		id: 'app.skin-browse.nick-not-found',
		defaultMessage: 'No player “{nick}” found, or the player has no skin of their own.',
	},
	nickSource: {
		id: 'app.skin-browse.nick-source',
		defaultMessage: 'Player skin · {source}',
	},
	openOnNameMc: { id: 'app.skin-browse.open-on-namemc', defaultMessage: 'Open on NameMC' },
	openOnEly: { id: 'app.skin-browse.open-on-ely', defaultMessage: 'Open on Ely.by' },
	filterResults: {
		id: 'app.skin-browse.filter-results',
		defaultMessage: 'Skins: {filter}',
	},
	profile: { id: 'app.skin-browse.profile', defaultMessage: 'Профиль игрока' },
	profileAccount: { id: 'app.skin-browse.profile-account', defaultMessage: 'Учётная запись' },
	profileCopy: { id: 'app.skin-browse.profile-copy', defaultMessage: 'Копировать' },
	profileColor: { id: 'app.skin-browse.profile-color', defaultMessage: 'Цвет полосы локатора' },
	profileHead: { id: 'app.skin-browse.profile-head', defaultMessage: 'Получение головы' },
	profileCopied: { id: 'app.skin-browse.profile-copied', defaultMessage: 'Скопировано' },
})

// ---- Filters --------------------------------------------------------------
//
// One chip at a time: a laby.net tag narrows the list, "By nickname" turns
// the search box into a nickname box that finds that very player's skin.

interface SkinFilter {
	id: string
	label: string
	icon: Component
	/** The laby.net tag the filter searches by; none for the nickname mode. */
	tag?: string
}

const NICK_FILTER = 'nick'
const SKIN_FILTERS: SkinFilter[] = [
	{ id: NICK_FILTER, label: '', icon: UserSearchIcon },
	{ id: 'boy', label: 'Boy', icon: UserIcon, tag: 'boy' },
	{ id: 'girl', label: 'Girl', icon: UserRoundIcon, tag: 'girl' },
	{ id: 'anime', label: 'Anime', icon: TagCategoryCartoonIcon, tag: 'anime' },
	{ id: 'cute', label: 'Cute', icon: TagCategoryThemedIcon, tag: 'cute' },
	{ id: 'knight', label: 'Knight', icon: TagCategorySwordIcon, tag: 'knight' },
	{ id: 'royal', label: 'King', icon: TagCategoryCrownIcon, tag: 'king' },
	{ id: 'demon', label: 'Demon', icon: TagCategorySkullIcon, tag: 'demon' },
	{ id: 'magic', label: 'Wizard', icon: TagCategoryFantasyIcon, tag: 'wizard' },
	{ id: 'animal', label: 'Animal', icon: TagCategoryMobsIcon, tag: 'animal' },
	{ id: 'gamer', label: 'Gamer', icon: TagCategoryGamepad2Icon, tag: 'gamer' },
	{ id: 'christmas', label: 'Christmas', icon: TagCategoryTreePineIcon, tag: 'christmas' },
]

const filterId = ref<string | null>(
	typeof route.query.filter === 'string' &&
		SKIN_FILTERS.some((filter) => filter.id === route.query.filter)
		? route.query.filter
		: null,
)
const activeFilter = computed(() => SKIN_FILTERS.find((filter) => filter.id === filterId.value))
const nickMode = computed(() => filterId.value === NICK_FILTER)
const filterLabel = (filter: SkinFilter) =>
	filter.id === NICK_FILTER ? formatMessage(messages.byNick) : filter.label

/** What laby.net is asked for: the typed words plus the chosen tag. */
const effectiveQuery = () => [activeFilter.value?.tag ?? '', query.value.trim()].filter(Boolean).join(' ')

const nickResult = ref<NickSkin | null>(null)
const nickSearched = ref('')

function syncRoute() {
	const next: Record<string, string> = {}
	if (query.value.trim()) next.q = query.value.trim()
	if (filterId.value) next.filter = filterId.value
	router.replace({ query: next })
}

const tabs = computed(() => [
	{ label: formatMessage(messages.modpacks), href: '/browse/modpack', icon: PackageIcon },
	{ label: formatMessage(messages.mods), href: '/browse/mod', icon: WrenchIcon },
	{ label: formatMessage(messages.resourcePacks), href: '/browse/resourcepack', icon: PaintbrushIcon },
	{ label: formatMessage(messages.dataPacks), href: '/browse/datapack', icon: BlocksIcon },
	{ label: formatMessage(messages.shaders), href: '/browse/shader', icon: LayersIcon },
	{ label: formatMessage(messages.servers), href: '/browse/server', icon: GlobeIcon },
	{ label: formatMessage(messages.skins), href: '/browse/skin', icon: ShirtIcon },
])

const breadcrumbManager = injectBreadcrumbManager()
breadcrumbManager.reset({
	slot: 'browse',
	id: 'browse:skin',
	label: () => formatMessage(messages.discoverSkins),
	to: '/browse/skin',
	visual: { type: 'icon', component: CompassIcon },
} satisfies BreadcrumbDefinition)

// ---- List ---------------------------------------------------------------

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const skins = ref<LabySkin[]>([])
const page = ref(1)
const loading = ref(false)
const failed = ref(false)
const hasMore = ref(true)
/** Showing look-alikes of the skin on the account instead of a search. */
const similarMode = ref(false)
let requestId = 0

// ---- Pages ----------------------------------------------------------------
//
// The grid is paged, 55 cards to a page: the arrow flips to the next five
// dozen, and every page the player has seen is remembered on disk - the next
// visit draws it instantly from the shelf while the live list quietly
// refreshes behind it. The page to come downloads itself in the background.

const UI_PAGE_SIZE = 55
// v2: the popular list no longer carries Mojang's stock skins.
const PAGE_CACHE_KEY = 'portalrinth-skinbrowse-pages-v2'
const PAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const PAGE_CACHE_LIMIT = 80

let buffer: LabySkin[] = []
let labyPagesLoaded = 0
let labyDone = false

const pageCacheKeyOf = (q: string, p: number) => `${q.trim().toLowerCase() || '__all'}:${p}`

function readPageCache(q: string, p: number): LabySkin[] | null {
	try {
		const all = JSON.parse(localStorage.getItem(PAGE_CACHE_KEY) ?? '{}') as Record<
			string,
			{ at: number; skins: LabySkin[] }
		>
		const hit = all[pageCacheKeyOf(q, p)]
		if (!hit || Date.now() - hit.at > PAGE_CACHE_TTL || !Array.isArray(hit.skins)) return null
		return hit.skins
	} catch {
		return null
	}
}

function writePageCache(q: string, p: number, list: LabySkin[]) {
	try {
		const all = new Map(
			Object.entries(
				JSON.parse(localStorage.getItem(PAGE_CACHE_KEY) ?? '{}') as Record<
					string,
					{ at: number; skins: LabySkin[] }
				>,
			),
		)
		// The oldest pages give way when the shelf runs out of room.
		const keys = [...all.keys()]
		if (keys.length >= PAGE_CACHE_LIMIT) {
			keys.sort((a, b) => (all.get(a)?.at ?? 0) - (all.get(b)?.at ?? 0))
			for (const key of keys.slice(0, keys.length - PAGE_CACHE_LIMIT + 1)) all.delete(key)
		}
		all.set(pageCacheKeyOf(q, p), { at: Date.now(), skins: list })
		localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(Object.fromEntries(all)))
	} catch {
		/* a full shelf just means the next visit refetches */
	}
}

/** Pulls laby.net pages until `need` skins sit in the buffer (or the well
 * runs dry). One shared buffer per visit: flipping back and forth never
 * refetches what is already here. */
async function ensureBuffer(q: string, need: number, id: number): Promise<void> {
	while (buffer.length < need && !labyDone) {
		try {
			const found = await searchLabySkins(q, labyPagesLoaded + 1)
			if (id !== requestId) return
			labyPagesLoaded += 1
			// The popular list opens with Mojang's stock skins in both arm
			// widths - they live under "Default skins" already.
			buffer = [...buffer, ...(q.trim() ? found : found.filter((skin) => !isStockLabySkin(skin)))]
			if (found.length < LABY_PAGE_SIZE) labyDone = true
		} catch (error) {
			// laby.net caps the deep pages (offset past ~1500 answers 401):
			// that is the end of the well, not a failure - the pages already
			// collected stay good.
			if (/\b401\b/.test(String(error))) labyDone = true
			else throw error
		}
		// A seam between two fetches never shows the same skin twice.
		buffer = [...new Map(buffer.map((skin) => [skin.image_hash, skin])).values()]
	}
}

async function fetchUiPage(q: string, p: number, id: number): Promise<LabySkin[]> {
	await ensureBuffer(q, p * UI_PAGE_SIZE, id)
	if (id !== requestId) return []
	return buffer.slice((p - 1) * UI_PAGE_SIZE, p * UI_PAGE_SIZE)
}

function updateHasMore(p: number) {
	hasMore.value = !labyDone || buffer.length > p * UI_PAGE_SIZE
}

/** Grid previews, drawn in 3D on a canvas from each skin's own texture. */
const previews = ref<Record<string, string>>({})
/** Arm width per hash, so the 3D preview draws slim arms slim. */
const variants = new Map<string, LabySkin['skin_variant']>()

/**
 * The preview of a skin: drawn right here on a canvas from the skin's own
 * texture. Remote render services answer a texture hash they have never
 * seen with a stock Steve or Alex, or with nothing at all - so the grid
 * trusts only the real texture, the same one the 3D viewer loads in a
 * couple of seconds. A small queue keeps the fetches civil, and the service
 * chosen in "Сервис-скинов" stands in only when the canvas could not draw.
 */
function previewSrc(skin: LabySkin): string | undefined {
	variants.set(skin.image_hash, skin.skin_variant)
	queuePreview(skin.image_hash)
	return previews.value[skin.image_hash]
}

const previewRequested = new Set<string>()
const previewQueue: string[] = []
let previewActive = 0
const PREVIEW_PARALLEL = 10

/** One texture at a time per lane: a page of skins fills in fast without
 * flooding the network and slowing every single card down. */
function queuePreview(hash: string) {
	if (previewRequested.has(hash)) return
	previewRequested.add(hash)
	previewQueue.push(hash)
	pumpPreviews()
}

function pumpPreviews() {
	while (previewActive < PREVIEW_PARALLEL && previewQueue.length > 0) {
		const hash = previewQueue.shift() as string
		previewActive += 1
		void fillPreview(hash).finally(() => {
			previewActive -= 1
			pumpPreviews()
		})
	}
}

const PREVIEW_CEILING_MS = 12000

/** A ceiling for one preview attempt: a host that never answers must not
 * hold a queue lane forever - the rest of the page would starve behind it.
 * The attempt that outlives the ceiling may still land later on its own;
 * its picture is welcome whenever it arrives. */
function withCeiling<T>(task: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('preview ceiling')), ms)
		task.then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/** One lane of the preview queue: the canvas first (racing every texture
 * road under a ceiling), then the render chain fetched by the app's own
 * client - the one that follows the system proxy and knows no CORS - and
 * only then the plain image chain for `@error` to walk. */
async function fillPreview(hash: string): Promise<void> {
	try {
		const variant = variants.get(hash)
		const url = await withCeiling(
			labySkinPreview(hash, variant === 'SLIM' ? 'SLIM' : variant ? 'CLASSIC' : undefined),
			PREVIEW_CEILING_MS,
		)
		if (previews.value[hash] === undefined) {
			previews.value = { ...previews.value, [hash]: url }
		}
		return
	} catch {
		/* the canvas road is out - the render roads take over */
	}
	if (previews.value[hash] !== undefined) return
	try {
		const url = await remotePreviewDataUrl(hash)
		previews.value = { ...previews.value, [hash]: url }
		return
	} catch {
		/* the app-client roads are out too - the webview chain is left */
	}
	if (previews.value[hash] !== undefined) return
	previews.value = { ...previews.value, [hash]: renderChain(hash)[0] }
}

/** The page on screen is served first: hashes queued for other pages step
 * aside and re-queue the moment their card renders again - a flip to the
 * next page never waits behind the tail of the previous one. */
function refocusQueue() {
	const wanted = new Set(visibleSkins.value.map((skin) => skin.image_hash))
	for (let i = previewQueue.length - 1; i >= 0; i--) {
		if (!wanted.has(previewQueue[i])) {
			previewRequested.delete(previewQueue[i])
			previewQueue.splice(i, 1)
		}
	}
}

/**
 * The render chain per hash, the last resort when the texture itself will
 * not come: laby.net's own render straight, then through two image proxies
 * (a lossy route to laby.net does not stop the picture). Only laby.net knows
 * its hashes - the other services answer them with a stock Alex or Steve.
 * `@error` walks the chain.
 */
const renderChains = new Map<string, string[]>()
const renderStep = new Map<string, number>()

function renderChain(hash: string): string[] {
	let chain = renderChains.get(hash)
	if (!chain) {
		chain = labySkinRenderSources(hash, 360, 684)
		renderChains.set(hash, chain)
		renderStep.set(hash, 0)
	}
	return chain
}

function advanceRender(hash: string): string | null {
	const chain = renderChain(hash)
	const step = (renderStep.get(hash) ?? 0) + 1
	renderStep.set(hash, step)
	return step < chain.length ? chain[step] : null
}

/**
 * The picture on a card did not come through - some networks drop part of
 * their requests. The next road in the chain takes the card; when every
 * road is dead the card gets one more canvas try, and only then leaves
 * the grid - a broken tile helps nobody.
 */
const previewGaveUp = ref<Set<string>>(new Set())
const previewRetried = new Set<string>()

function onPreviewError(hash: string) {
	const next = advanceRender(hash)
	if (next) {
		previews.value = { ...previews.value, [hash]: next }
		return
	}
	if (!previewRetried.has(hash)) {
		// One more honest try: the canvas path, from the very first road.
		previewRetried.add(hash)
		renderStep.set(hash, 0)
		previewRequested.delete(hash)
		const { [hash]: gone, ...rest } = previews.value
		void gone
		previews.value = rest
		queuePreview(hash)
		return
	}
	// Nothing worked - the card leaves the grid instead of sulking dark.
	previewGaveUp.value = new Set([...previewGaveUp.value, hash])
}

/** Cards whose every preview road died leave the grid quietly. */
const visibleSkins = computed(() =>
	skins.value.filter((skin) => !previewGaveUp.value.has(skin.image_hash)),
)

async function loadNick(id: number) {
	const nick = query.value.trim()
	nickSearched.value = nick
	nickResult.value = null
	skins.value = []
	hasMore.value = false
	failed.value = false
	if (!nick) {
		loading.value = false
		return
	}
	loading.value = true
	try {
		const found = await findSkinByNick(nick)
		if (id !== requestId) return
		nickResult.value = found
		skins.value = found ? [found] : []
		refocusQueue()
	} catch {
		if (id === requestId) skins.value = []
	} finally {
		if (id === requestId) loading.value = false
	}
}

async function load(reset: boolean) {
	const id = ++requestId
	if (nickMode.value) return loadNick(id)
	if (reset) {
		page.value = 1
		buffer = []
		labyPagesLoaded = 0
		labyDone = false
	}
	loading.value = true
	failed.value = false
	const q = effectiveQuery()
	const p = page.value
	// A page the player has already seen comes off the shelf first: the grid
	// is full the moment the tab opens, no waiting for the network.
	const cached = readPageCache(q, p)
	if (cached && cached.length > 0) {
		if (id !== requestId) return
		skins.value = cached
		updateHasMore(p)
		loading.value = false
		refocusQueue()
		void refreshPage(q, p, id)
		void preloadNext(q, p)
		return
	}
	try {
		const list = await fetchUiPage(q, p, id)
		if (id !== requestId) return
		skins.value = list
		updateHasMore(p)
		refocusQueue()
		if (list.length > 0) writePageCache(q, p, list)
		void preloadNext(q, p)
	} catch {
		if (id !== requestId) return
		failed.value = true
	} finally {
		if (id === requestId) loading.value = false
	}
}

/** Freshens the page behind the cached copy: nothing flickers unless the
 * live list actually changed. */
async function refreshPage(q: string, p: number, id: number) {
	try {
		const list = await fetchUiPage(q, p, id)
		if (id !== requestId || list.length === 0) return
		writePageCache(q, p, list)
		const same =
			list.length === skins.value.length &&
			list.every((skin, index) => skin.image_hash === skins.value[index]?.image_hash)
		if (!same) skins.value = list
		updateHasMore(p)
	} catch {
		/* the cached copy stays on the grid */
	}
}

/** The next page downloads itself while this one is being looked at. */
async function preloadNext(q: string, p: number) {
	if (!hasMore.value) return
	try {
		const list = await fetchUiPage(q, p + 1, requestId)
		if (list.length > 0) writePageCache(q, p + 1, list)
	} catch {
		/* the next flip will simply fetch then */
	}
}

/**
 * laby.net never says how many pages there are, so the page strip counts the
 * pages known so far: every page seen, plus the next one while there is more.
 * It looks and works exactly like the strip on the other Discover tabs.
 */
const furthestPage = ref(1)
watch(page, (value) => {
	if (value > furthestPage.value) furthestPage.value = value
})
const pageCount = computed(() =>
	Math.max(furthestPage.value, page.value + (hasMore.value ? 1 : 0)),
)

function switchPage(p: number) {
	goTo(p)
	document.querySelector('.app-viewport')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function goTo(p: number) {
	if (p < 1 || loading.value || p === page.value) return
	page.value = p
	void load(false)
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
	similarMode.value = false
	clearTimeout(searchTimer)
	searchTimer = setTimeout(
		() => {
			void value
			syncRoute()
			load(true)
		},
		nickMode.value ? 500 : 350,
	)
})

watch(filterId, (value, old) => {
	similarMode.value = false
	clearTimeout(searchTimer)
	// A nickname and a search for skins are different words: switching
	// into or out of the nickname mode starts the box afresh.
	if ((value === NICK_FILTER) !== (old === NICK_FILTER) && query.value) {
		query.value = ''
		return
	}
	syncRoute()
	load(true)
})

async function loadSimilarToReference() {
	const reference = similarSkinReference.value
	if (!reference) return load(true)
	similarMode.value = true
	const id = ++requestId
	loading.value = true
	failed.value = false
	hasMore.value = false
	skins.value = []
	try {
		const found = await findSimilarLabySkins({ texture: reference.texture }, 48)
		if (id !== requestId) return
		skins.value = found
		refocusQueue()
	} catch {
		if (id === requestId) failed.value = true
	} finally {
		if (id === requestId) loading.value = false
	}
}

function showAll() {
	similarSkinReference.value = null
	similarMode.value = false
	syncRoute()
	load(true)
}

const heading = computed(() => {
	if (similarMode.value) return formatMessage(messages.similarToYours)
	if (nickMode.value) {
		return nickResult.value
			? formatMessage(messages.nickHeading, { nick: nickResult.value.nick })
			: formatMessage(messages.byNick)
	}
	if (activeFilter.value && !query.value.trim()) {
		return formatMessage(messages.filterResults, { filter: activeFilter.value.label })
	}
	if (query.value.trim()) return formatMessage(messages.results, { query: query.value.trim() })
	return formatMessage(messages.popular)
})

onMounted(() => {
	if (route.query.similar && similarSkinReference.value) loadSimilarToReference()
	else load(true)
})

watch(
	() => route.query.similar,
	(similar) => {
		if (similar && similarSkinReference.value) loadSimilarToReference()
	},
)

// ---- Viewer -------------------------------------------------------------

const modal = useTemplateRef('modal')
const current = ref<LabySkin | null>(null)
const currentTexture = ref('')
/** The render of the open skin, shown when its texture will not come. */
const currentRender = ref('')
/** The live 3D model is drawn - the stand-in picture fades out. */
const modelReady = ref(false)
const crouching = ref(false)
const layersHidden = ref(false)
const walking = ref(false)
const capes = ref<Cape[]>([])
const capesLoaded = ref(false)
const capePickerOpen = ref(false)
const selectedCape = ref<Cape | undefined>(undefined)
/** Arm model used for the preview and the install: the skin's own at first. */
const armVariant = ref<'CLASSIC' | 'SLIM'>('CLASSIC')
watch(current, (skin) => {
	armVariant.value = skin ? labySkinVariant(skin) : 'CLASSIC'
})
const installing = ref(false)
const similar = ref<LabySkin[]>([])
const similarLoading = ref(false)
/** The look-alikes are paged like the grid behind the modal: a shelf of
 * eight at a time instead of a cramped scroll. */
const SIMILAR_PER_PAGE = 8
const similarPage = ref(1)
const similarPages = computed(() => Math.max(1, Math.ceil(similar.value.length / SIMILAR_PER_PAGE)))
const similarPaged = computed(() =>
	similar.value.slice(
		(similarPage.value - 1) * SIMILAR_PER_PAGE,
		similarPage.value * SIMILAR_PER_PAGE,
	),
)
function similarGoTo(p: number) {
	if (p < 1 || p > similarPages.value) return
	similarPage.value = p
}
let viewerRequest = 0

async function loadCapes() {
	if (capesLoaded.value) return
	try {
		capes.value = (await get_available_capes()) ?? []
	} catch {
		capes.value = []
	}
	capesLoaded.value = true
}

async function select(skin: LabySkin) {
	const id = ++viewerRequest
	current.value = skin
	currentTexture.value = ''
	modelReady.value = false
	// The card's own 3D preview stands in at once while the texture for the
	// live model arrives - usually a few dozen milliseconds, from the shelf.
	currentRender.value = previews.value[skin.image_hash] ?? ''
	similar.value = []
	similarPage.value = 1
	try {
		const texture = await labySkinTexture(skin.image_hash)
		if (id !== viewerRequest) return
		currentTexture.value = pngDataUrl(texture)
	} catch {
		// The texture would not come. A render stands in for the model instead
		// of a spinner that never ends; installing stays disabled, as it needs
		// the texture itself.
		if (id === viewerRequest && !currentRender.value) {
			renderStep.set(skin.image_hash, 0)
			currentRender.value = renderChain(skin.image_hash)[0]
		}
	}
	loadSimilar(skin, id)
}

async function loadSimilar(skin: LabySkin, id: number) {
	if (!currentTexture.value) return
	similarLoading.value = true
	try {
		const found = await findSimilarLabySkins(
			{ hash: skin.image_hash, tags: labySkinTags(skin), texture: currentTexture.value },
			12,
		)
		if (id === viewerRequest) similar.value = found
	} catch {
		if (id === viewerRequest) similar.value = []
	} finally {
		if (id === viewerRequest) similarLoading.value = false
	}
}

/** The stand-in picture in the viewer failed: walk the render chain. */
function onRenderError() {
	const skin = current.value
	if (!skin) return
	const next = advanceRender(skin.image_hash)
	if (next) currentRender.value = next
}

function open(skin: LabySkin) {
	crouching.value = false
	layersHidden.value = false
	walking.value = false
	capePickerOpen.value = false
	loadCapes()
	select(skin)
	modal.value?.show()
}

function toggleCapePicker() {
	if (capes.value.length === 0) return
	capePickerOpen.value = !capePickerOpen.value
}

async function install() {
	const skin = current.value
	if (!skin || installing.value) return
	installing.value = true
	try {
		const texture = await labySkinTexture(skin.image_hash)
		await add_and_equip_custom_skin(texture, armVariant.value, selectedCape.value)
		addNotification({
			type: 'success',
			title: formatMessage(messages.installed),
			text: formatMessage(messages.installedText),
		})
		playSoundEffect('success')
		modal.value?.hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		installing.value = false
	}
}

const isNickSkin = (skin: LabySkin | null): skin is NickSkin =>
	Boolean(skin && 'nick' in skin && (skin as NickSkin).nick)

function openSkinPage(skin: LabySkin) {
	void openUrl(isNickSkin(skin) ? skin.pageUrl : labySkinPageUrl(skin.image_hash))
}

function tagsOf(skin: LabySkin) {
	return labySkinTags(skin).slice(0, 4).join(', ')
}

const usesFormatter = new Intl.NumberFormat()

// ---- The player's own page (nickname mode) ------------------------------------

/** The account panel: the head, the UUID, the colour and the /give command. */
const profileHead = ref('')
const profileColor = ref('')
const profileHeadVersion = ref('new')

const PROFILE_VERSIONS = [
	{ id: 'new', label: '1.20.5+' },
	{ id: 'mid', label: '1.13 - 1.20.4' },
	{ id: 'old', label: '1.8 - 1.12.2' },
]

const profileCommand = computed(() => {
	const nick = isNickSkin(current.value) ? current.value.nick : ''
	if (!nick) return ''
	if (profileHeadVersion.value === 'old') {
		return `/give @p minecraft:skull 1 3 {SkullOwner:"${nick}"}`
	}
	if (profileHeadVersion.value === 'mid') {
		return `/give @p minecraft:player_head{SkullOwner:"${nick}"} 1`
	}
	// The command is assembled from pieces: a whole bracketed profile in the
	// source reads as a Tailwind arbitrary class and breaks the CSS build.
	const give = String.fromCharCode(91)
	return `/give @p minecraft:player_head${give}minecraft:profile={name:"${nick}"}${give}] 1`
})

/**
 * Cuts the face out of the 64x64 texture and grows it without smoothing:
 * that is the head the player wears, and the average of its pixels is the
 * colour their locator bar shows as.
 */
async function loadPlayerProfile() {
	if (!currentTexture.value || !current.value || !isNickSkin(current.value)) {
		profileHead.value = ''
		profileColor.value = ''
		return
	}
	try {
		const image = new Image()
		image.src = currentTexture.value
		await image.decode()
		const face = document.createElement('canvas')
		face.width = 8
		face.height = 8
		const faceContext = face.getContext('2d')
		if (!faceContext) return
		faceContext.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8)
		const grown = document.createElement('canvas')
		grown.width = 64
		grown.height = 64
		const grownContext = grown.getContext('2d')
		if (!grownContext) return
		grownContext.imageSmoothingEnabled = false
		grownContext.drawImage(face, 0, 0, 64, 64)
		profileHead.value = grown.toDataURL('image/png')
		const { data: pixels } = faceContext.getImageData(0, 0, 8, 8)
		let red = 0
		let green = 0
		let blue = 0
		let seen = 0
		for (let at = 0; at < pixels.length; at += 4) {
			if (pixels[at + 3] < 128) continue
			red += pixels[at]
			green += pixels[at + 1]
			blue += pixels[at + 2]
			seen += 1
		}
		if (seen === 0) return
		const hex = (value: number) => Math.round(value / seen).toString(16).padStart(2, '0')
		profileColor.value = `#${hex(red)}${hex(green)}${hex(blue)}`
	} catch {
		profileHead.value = ''
	}
}

watch(currentTexture, () => {
	void loadPlayerProfile()
})

async function copyProfile(text: string) {
	try {
		await navigator.clipboard.writeText(text)
		addNotification({ type: 'success', title: formatMessage(messages.profileCopied), text })
	} catch {
		// The clipboard said no; the text stays selectable on screen.
	}
}
</script>

<template>
	<div class="flex flex-col gap-2 p-6">
		<NavTabs :links="tabs" replace />

		<Input
			v-model="query"
			type="text"
			autocomplete="off"
			:icon="nickMode ? UserSearchIcon : SearchIcon"
			:placeholder="formatMessage(nickMode ? messages.nickPlaceholder : messages.searchPlaceholder)"
			clearable
			wrapper-class="w-full"
			size="large"
			@clear="query = ''"
		/>

		<Teleport to="#sidebar-teleport-target">
			<div class="skin-browse-side">
				<h3 class="skin-browse-side__title">{{ formatMessage(messages.filters) }}</h3>
				<Chips
					v-model="filterId"
					:items="SKIN_FILTERS.map((filter) => filter.id)"
					:format-label="(id) => filterLabel(SKIN_FILTERS.find((filter) => filter.id === id)!)"
					:format-icon="(id) => SKIN_FILTERS.find((filter) => filter.id === id)?.icon"
					:never-empty="false"
					:capitalize="false"
					hide-checkmark-icon
					:aria-label="formatMessage(messages.filters)"
					class="skin-browse-filters"
				/>
			</div>
		</Teleport>

		<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
			<h2 class="m-0 text-lg font-semibold text-contrast">{{ heading }}</h2>
			<div class="flex items-center gap-2">
				<Button v-if="similarMode" type="outlined" @click="showAll">
					<XIcon /> {{ formatMessage(messages.backToAll) }}
				</Button>
				<Pagination
					v-else-if="skins.length > 0 && !nickMode"
					:page="page"
					:count="pageCount"
					class="ml-auto"
					@switch-page="switchPage"
				/>
			</div>
		</div>

		<div v-if="similarMode && similarSkinCategory.length > 0" class="text-sm text-secondary">
			{{ formatMessage(messages.similarCategory, { tags: similarSkinCategory.join(', ') }) }}
		</div>

		<div
			v-if="failed && skins.length === 0"
			class="flex flex-col items-center gap-3 rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center"
		>
			<p class="m-0 text-secondary">{{ formatMessage(messages.loadError) }}</p>
			<Button
				type="colored"
				color="brand"
				@click="similarMode ? loadSimilarToReference() : load(true)"
			>
				{{ formatMessage(messages.retry) }}
			</Button>
		</div>

		<div
			v-else-if="!loading && skins.length === 0"
			class="rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center text-secondary"
		>
			<template v-if="nickMode && !nickSearched">
				<UserSearchIcon class="mx-auto mb-2 block size-7 opacity-70" />
				{{ formatMessage(messages.nickPrompt) }}
			</template>
			<template v-else-if="nickMode">
				{{ formatMessage(messages.nickNotFound, { nick: nickSearched }) }}
			</template>
			<template v-else>{{ formatMessage(messages.nothingFound) }}</template>
		</div>

		<div v-else class="skin-browse-grid">
			<SkinButton
				v-for="skin in visibleSkins"
				:key="skin.image_hash"
				:forward-image-src="previewSrc(skin)"
				:selected="false"
				:tooltip="tagsOf(skin) || undefined"
				@error="onPreviewError(skin.image_hash)"
				@select="open(skin)"
			/>
		</div>

		<div v-if="loading" class="flex justify-center py-4">
			<SpinnerIcon class="size-6 animate-spin text-secondary" />
		</div>
		<div
			v-else-if="!similarMode && !nickMode && skins.length > 0"
			class="flex items-center justify-end gap-3 py-2"
		>
			<Pagination :page="page" :count="pageCount" @switch-page="switchPage" />
		</div>
	</div>

	<NewModal ref="modal" :on-hide="() => (viewerRequest += 1)">
		<template #title>
			<span class="text-lg font-extrabold text-contrast">
				{{ current ? tagsOf(current) || formatMessage(messages.modalTitle) : '' }}
			</span>
		</template>

		<div v-if="current" class="flex flex-col gap-6 md:flex-row">
			<div class="relative h-[25rem] w-[16rem] min-w-[16rem] flex-shrink-0 md:self-center">
				<!-- The card's 3D picture holds the place at once; the live model
				     fades in over it and the picture steps aside. -->
				<div
					v-if="currentRender"
					class="skin-browse-standin pointer-events-none absolute inset-0 flex items-center justify-center"
					:class="{ 'skin-browse-standin--hidden': modelReady }"
				>
					<img
						:src="currentRender"
						alt=""
						class="max-h-[88%] max-w-full object-contain [image-rendering:pixelated]"
						@error="onRenderError"
					/>
				</div>
				<SkinPreviewRenderer
					v-if="currentTexture"
					:texture-src="currentTexture"
					:variant="armVariant"
					:cape-src="selectedCape?.texture"
					:crouch="crouching"
					:walk="walking"
					:hide-layers="layersHidden"
					framing="modal"
					:initial-rotation="Math.PI / 8"
					class="relative h-full w-full"
					@ready="modelReady = true"
				/>
				<div v-else-if="!currentRender" class="flex h-full w-full items-center justify-center">
					<SpinnerIcon class="size-6 animate-spin text-secondary" />
				</div>
			</div>

			<div class="flex min-w-52 w-full flex-col gap-4">
				<div class="text-sm text-secondary">
					<template v-if="isNickSkin(current)">
						{{
							formatMessage(messages.nickSource, {
								source: current.source === 'mojang' ? 'Minecraft' : 'Ely.by',
							})
						}}
					</template>
					<template v-else>
						{{ formatMessage(messages.uses, { count: usesFormatter.format(current.use_count) }) }}
					</template>
				</div>

				<section
					v-if="isNickSkin(current)"
					class="flex flex-col gap-2 rounded-2xl border border-solid border-surface-5 bg-surface-3 p-3"
				>
					<h3 class="m-0 flex items-center gap-1.5 text-base font-semibold text-contrast">
						<UserIcon class="size-4" /> {{ formatMessage(messages.profile) }}
					</h3>

					<div class="flex items-center gap-3">
						<img
							v-if="profileHead"
							:src="profileHead"
							alt=""
							class="size-14 rounded-lg [image-rendering:pixelated]"
						/>
						<div class="min-w-0 flex flex-col gap-1">
							<span class="truncate text-sm font-bold text-contrast">{{ current.nick }}</span>
							<template v-if="current.uuid">
								<span class="truncate text-xs text-secondary">UUID: {{ current.uuid }}</span>
								<button
									type="button"
									class="w-fit cursor-pointer border-0 bg-transparent p-0 text-xs text-brand"
									@click="copyProfile(current.uuid)"
								>
									{{ formatMessage(messages.profileCopy) }}
								</button>
							</template>
							<span v-else class="text-xs text-secondary">{{ formatMessage(messages.nickSource, { source: current.source === 'mojang' ? 'Minecraft' : 'Ely.by' }) }}</span>
						</div>
					</div>

					<div v-if="profileColor" class="flex items-center gap-2">
						<span
							class="inline-block size-5 rounded-md border border-solid border-surface-5"
							:style="{ background: profileColor }"
						/>
						<span class="text-xs text-secondary">{{ formatMessage(messages.profileColor) }}: {{ profileColor.toUpperCase() }}</span>
						<button
							type="button"
							class="cursor-pointer border-0 bg-transparent p-0 text-xs text-brand"
							@click="copyProfile(profileColor)"
						>
							{{ formatMessage(messages.profileCopy) }}
						</button>
					</div>

					<div class="flex flex-col gap-1.5">
						<h4 class="m-0 text-sm font-semibold text-contrast">{{ formatMessage(messages.profileHead) }}</h4>
						<div class="flex flex-wrap items-center gap-2">
							<select
								v-model="profileHeadVersion"
								class="rounded-xl border-none bg-surface-4 px-3 py-1.5 text-sm text-contrast"
							>
								<option v-for="version in PROFILE_VERSIONS" :key="version.id" :value="version.id">
									{{ version.label }}
								</option>
							</select>
							<code class="min-w-0 flex-1 truncate rounded-xl bg-surface-4 px-3 py-1.5 text-xs text-secondary">
								{{ profileCommand }}
							</code>
							<Button size="small" @click="copyProfile(profileCommand)">
								{{ formatMessage(messages.profileCopy) }}
							</Button>
						</div>
					</div>
				</section>

				<div class="grid grid-cols-2 gap-2">
					<Button @click="crouching = !crouching">
						<ArrowUpIcon v-if="crouching" />
						<ArrowDownIcon v-else />
						{{ formatMessage(crouching ? messages.stand : messages.crouch) }}
					</Button>
					<Button @click="layersHidden = !layersHidden">
						<EyeIcon v-if="layersHidden" />
						<EyeOffIcon v-else />
						{{ formatMessage(layersHidden ? messages.showLayer : messages.hideLayer) }}
					</Button>
					<Button
						v-tooltip="
							capesLoaded && capes.length === 0 ? formatMessage(messages.noCapes) : undefined
						"
						:disabled="capesLoaded && capes.length === 0"
						:class="{ 'skin-browse-button--active': capePickerOpen || selectedCape }"
						@click="toggleCapePicker"
					>
						<ShirtIcon />
						{{ formatMessage(messages.addCape) }}
					</Button>
					<Button @click="walking = !walking">
						<PauseIcon v-if="walking" />
						<PlayIcon v-else />
						{{ formatMessage(walking ? messages.stopWalking : messages.startWalking) }}
					</Button>
					<Button
						:class="{ 'skin-browse-button--active': armVariant === 'CLASSIC' }"
						@click="armVariant = 'CLASSIC'"
					>
						{{ formatMessage(messages.armClassic) }}
					</Button>
					<Button
						:class="{ 'skin-browse-button--active': armVariant === 'SLIM' }"
						@click="armVariant = 'SLIM'"
					>
						{{ formatMessage(messages.armSlim) }}
					</Button>
				</div>

				<div v-if="capePickerOpen" class="grid grid-cols-[repeat(4,max-content)] gap-2">
					<CapeLikeTextButton
						:tooltip="formatMessage(messages.noCape)"
						:highlighted="!selectedCape"
						@click="selectedCape = undefined"
					>
						<template #icon><XIcon /></template>
						<span>{{ formatMessage(messages.noCape) }}</span>
					</CapeLikeTextButton>
					<CapeButton
						v-for="cape in capes"
						:id="cape.id"
						:key="cape.id"
						:texture="cape.texture"
						:name="cape.name || formatMessage(messages.capeFallback)"
						:selected="selectedCape?.id === cape.id"
						@select="selectedCape = cape"
					/>
				</div>

				<section class="flex flex-col gap-2">
					<h3 class="m-0 flex items-center gap-1.5 text-base font-semibold text-contrast">
						<SparklesIcon class="size-4" /> {{ formatMessage(messages.similar) }}
					</h3>
					<div v-if="similarLoading" class="flex py-3">
						<SpinnerIcon class="size-5 animate-spin text-secondary" />
					</div>
					<div v-else-if="similar.length === 0" class="text-sm text-secondary">
						{{ formatMessage(messages.similarEmpty) }}
					</div>
					<div v-else class="skin-browse-similar">
						<SkinButton
							v-for="skin in similarPaged"
							:key="skin.image_hash"
							:forward-image-src="previewSrc(skin)"
							:selected="false"
							:tooltip="tagsOf(skin) || undefined"
							@error="onPreviewError(skin.image_hash)"
							@select="select(skin)"
						/>
					</div>
					<div
						v-if="!similarLoading && similar.length > SIMILAR_PER_PAGE"
						class="flex items-center justify-center gap-2"
					>
						<Button
							type="outlined"
							:disabled="similarPage <= 1"
							@click="similarGoTo(similarPage - 1)"
						>
							<ChevronLeftIcon />
						</Button>
						<span class="text-sm tabular-nums text-secondary">
							{{
								formatMessage(messages.similarPageOf, {
									page: similarPage,
									total: similarPages,
								})
							}}
						</span>
						<Button
							type="outlined"
							:disabled="similarPage >= similarPages"
							@click="similarGoTo(similarPage + 1)"
						>
							<ChevronRightIcon />
						</Button>
					</div>
				</section>
			</div>
		</div>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button
					v-if="current"
					type="outlined"
					@click="openSkinPage(current)"
				>
					<ExternalIcon />
					{{
						formatMessage(
							isNickSkin(current)
								? current.source === 'mojang'
									? messages.openOnNameMc
									: messages.openOnEly
								: messages.openOnLaby,
						)
					}}
				</Button>
				<Button
					type="colored"
					color="brand"
					:disabled="installing || !currentTexture"
					@click="install"
				>
					<SpinnerIcon v-if="installing" class="animate-spin" />
					<CheckIcon v-else />
					{{ formatMessage(messages.install) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<style scoped>
.skin-browse-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
	gap: 0.75rem;
}

.skin-browse-side {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 1rem 1rem 1.5rem;
}

.skin-browse-side__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	color: var(--color-contrast);
}

.skin-browse-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.skin-browse-filters :deep(.btn) {
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-raised-bg) 55%, transparent);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	font-size: 0.95rem;
	font-weight: 600;
	padding: 0.55rem 1.05rem;
	gap: 0.5rem;
	transition:
		background-color 0.2s ease,
		color 0.2s ease,
		transform 0.15s ease;
}

.skin-browse-filters :deep(.btn svg) {
	width: 1.15em;
	height: 1.15em;
}

.skin-browse-filters :deep(.btn:active) {
	transform: scale(0.96);
}

.skin-browse-filters :deep(.btn.selected) {
	background: color-mix(in srgb, var(--color-brand) 22%, transparent);
	color: var(--color-contrast);
}

.skin-browse-similar {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.625rem;
}

.skin-browse-standin {
	transition: opacity 0.35s ease;
}

.skin-browse-standin--hidden {
	opacity: 0;
}

.skin-browse-button--active {
	outline: 2px solid var(--color-brand);
	outline-offset: -2px;
}
</style>
