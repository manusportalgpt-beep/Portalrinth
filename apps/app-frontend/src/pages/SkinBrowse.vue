<script setup lang="ts">
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	CompassIcon,
	ExternalIcon,
	EyeIcon,
	EyeOffIcon,
	PauseIcon,
	PlayIcon,
	SearchIcon,
	ShirtIcon,
	SparklesIcon,
	SpinnerIcon,
	XIcon,
} from '@modrinth/assets'
import {
	Button,
	CapeButton,
	CapeLikeTextButton,
	defineMessages,
	injectNotificationManager,
	Input,
	NavTabs,
	NewModal,
	SkinButton,
	SkinPreviewRenderer,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
	findSimilarLabySkins,
	LABY_PAGE_SIZE,
	type LabySkin,
	labySkinPageUrl,
	labySkinPreview,
	labySkinTags,
	labySkinTexture,
	labySkinVariant,
	pngDataUrl,
	searchLabySkins,
	similarSkinReference,
} from '@/helpers/laby-skins'
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
	loadMore: { id: 'app.skin-browse.load-more', defaultMessage: 'Load more' },
	modalTitle: { id: 'app.skin-browse.modal-title', defaultMessage: 'Skin' },
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
})

const tabs = computed(() => [
	{ label: formatMessage(messages.modpacks), href: '/browse/modpack' },
	{ label: formatMessage(messages.mods), href: '/browse/mod' },
	{ label: formatMessage(messages.resourcePacks), href: '/browse/resourcepack' },
	{ label: formatMessage(messages.dataPacks), href: '/browse/datapack' },
	{ label: formatMessage(messages.shaders), href: '/browse/shader' },
	{ label: formatMessage(messages.servers), href: '/browse/server' },
	{ label: formatMessage(messages.skins), href: '/browse/skin' },
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

/** Grid previews, drawn on a canvas from each skin's own texture. */
const previews = ref<Record<string, string>>({})

/** The preview of a skin, kicked off the first time the card asks for it. */
function previewSrc(hash: string) {
	let preview = previews.value[hash]
	if (!preview) {
		labySkinPreview(hash)
			.then((url) => {
				previews.value = { ...previews.value, [hash]: url }
			})
			.catch(() => {})
	}
	return preview
}

async function load(reset: boolean) {
	const id = ++requestId
	if (reset) {
		page.value = 1
		hasMore.value = true
	}
	loading.value = true
	failed.value = false
	try {
		const found = await searchLabySkins(query.value, page.value)
		if (id !== requestId) return
		skins.value = reset ? found : [...skins.value, ...found]
		hasMore.value = found.length >= LABY_PAGE_SIZE
	} catch {
		if (id !== requestId) return
		failed.value = true
		if (reset) skins.value = []
	} finally {
		if (id === requestId) loading.value = false
	}
}

function loadMore() {
	page.value += 1
	load(false)
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
	similarMode.value = false
	clearTimeout(searchTimer)
	searchTimer = setTimeout(() => {
		router.replace({ query: value.trim() ? { q: value.trim() } : {} })
		load(true)
	}, 350)
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
		const found = await findSimilarLabySkins({ texture: reference.texture }, 42)
		if (id !== requestId) return
		skins.value = found
	} catch {
		if (id === requestId) failed.value = true
	} finally {
		if (id === requestId) loading.value = false
	}
}

function showAll() {
	similarSkinReference.value = null
	similarMode.value = false
	router.replace({ query: {} })
	load(true)
}

const heading = computed(() => {
	if (similarMode.value) return formatMessage(messages.similarToYours)
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
const crouching = ref(false)
const layersHidden = ref(false)
const walking = ref(false)
const capes = ref<Cape[]>([])
const capesLoaded = ref(false)
const capePickerOpen = ref(false)
const selectedCape = ref<Cape | undefined>(undefined)
const installing = ref(false)
const similar = ref<LabySkin[]>([])
const similarLoading = ref(false)
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
	similar.value = []
	try {
		const texture = await labySkinTexture(skin.image_hash)
		if (id !== viewerRequest) return
		currentTexture.value = pngDataUrl(texture)
	} catch (error) {
		if (id === viewerRequest) handleError(error as Error)
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
		await add_and_equip_custom_skin(texture, labySkinVariant(skin), selectedCape.value)
		addNotification({
			type: 'success',
			title: formatMessage(messages.installed),
			text: formatMessage(messages.installedText),
		})
		modal.value?.hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		installing.value = false
	}
}

function tagsOf(skin: LabySkin) {
	return labySkinTags(skin).slice(0, 4).join(', ')
}

const usesFormatter = new Intl.NumberFormat()
</script>

<template>
	<div class="flex flex-col gap-2 p-6">
		<NavTabs :links="tabs" replace />

		<Input
			v-model="query"
			:icon="SearchIcon"
			type="text"
			autocomplete="off"
			:placeholder="formatMessage(messages.searchPlaceholder)"
			clearable
			wrapper-class="w-full"
			size="large"
			@clear="query = ''"
		/>

		<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
			<h2 class="m-0 text-lg font-semibold text-contrast">{{ heading }}</h2>
			<div class="flex items-center gap-2">
				<Button v-if="similarMode" type="outlined" @click="showAll">
					<XIcon /> {{ formatMessage(messages.backToAll) }}
				</Button>
			</div>
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
			{{ formatMessage(messages.nothingFound) }}
		</div>

		<div v-else class="skin-browse-grid">
			<SkinButton
				v-for="skin in skins"
				:key="skin.image_hash"
				:forward-image-src="previewSrc(skin.image_hash)"
				:selected="false"
				:tooltip="tagsOf(skin) || undefined"
				@select="open(skin)"
			/>
		</div>

		<div v-if="loading" class="flex justify-center py-4">
			<SpinnerIcon class="size-6 animate-spin text-secondary" />
		</div>
		<div v-else-if="hasMore && skins.length > 0 && !similarMode" class="flex justify-center py-2">
			<Button @click="loadMore">{{ formatMessage(messages.loadMore) }}</Button>
		</div>
	</div>

	<NewModal ref="modal" :on-hide="() => (viewerRequest += 1)">
		<template #title>
			<span class="text-lg font-extrabold text-contrast">
				{{ current ? tagsOf(current) || formatMessage(messages.modalTitle) : '' }}
			</span>
		</template>

		<div v-if="current" class="flex flex-col gap-6 md:flex-row">
			<div class="h-[25rem] w-[16rem] min-w-[16rem] flex-shrink-0 md:self-center">
				<SkinPreviewRenderer
					v-if="currentTexture"
					:texture-src="currentTexture"
					:variant="labySkinVariant(current)"
					:cape-src="selectedCape?.texture"
					:crouch="crouching"
					:walk="walking"
					:hide-layers="layersHidden"
					framing="modal"
					:initial-rotation="Math.PI / 8"
					class="h-full w-full"
				/>
				<div v-else class="flex h-full w-full items-center justify-center">
					<SpinnerIcon class="size-6 animate-spin text-secondary" />
				</div>
			</div>

			<div class="flex min-w-52 w-full flex-col gap-4">
				<div class="text-sm text-secondary">
					{{ formatMessage(messages.uses, { count: usesFormatter.format(current.use_count) }) }}
				</div>

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
							v-for="skin in similar"
							:key="skin.image_hash"
							:forward-image-src="previewSrc(skin.image_hash)"
							:selected="false"
							:tooltip="tagsOf(skin) || undefined"
							@select="select(skin)"
						/>
					</div>
				</section>
			</div>
		</div>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button
					v-if="current"
					type="outlined"
					@click="openUrl(labySkinPageUrl(current.image_hash))"
				>
					<ExternalIcon /> {{ formatMessage(messages.openOnLaby) }}
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

.skin-browse-similar {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
	gap: 0.5rem;
	max-height: 14rem;
	overflow-y: auto;
	padding-right: 0.25rem;
}

.skin-browse-button--active {
	outline: 2px solid var(--color-brand);
	outline-offset: -2px;
}
</style>
