<script setup lang="ts">
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	EditIcon,
	ExternalIcon,
	PlayIcon,
	PlusIcon,
	SearchIcon,
	SpinnerIcon,
	TagLoaderBedrockIcon,
	TrashIcon,
	XIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	Combobox,
	type ComboboxOption,
	defineMessages,
	injectNotificationManager,
	Input,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
	BEDROCK_SORTS,
	bedrockCategories,
	type BedrockCategory,
	type BedrockClass,
	bedrockClasses,
	type BedrockContent,
	bedrockCurseforgeAvailable,
	type BedrockFile,
	bedrockFiles,
	bedrockIconUrl,
	type BedrockProfile,
	type BedrockProject,
	type BedrockStatus,
	bedrockStatus,
	getBedrock,
	installBedrockContent,
	launchBedrock,
	refreshBedrockProfiles,
	removeBedrock,
	renameBedrock,
	searchBedrock,
	setBedrockIcon,
	uninstallBedrockContent,
} from '@/helpers/bedrock'
import { useRootBreadcrumb } from '@/shared/breadcrumbs'

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()
const route = useRoute()
const router = useRouter()

const messages = defineMessages({
	notFoundTitle: { id: 'app.bedrock.not-found.title', defaultMessage: 'Build not found' },
	notFoundDescription: {
		id: 'app.bedrock.not-found.description',
		defaultMessage:
			'This Bedrock build no longer exists \u2014 it may have been removed. The sidebar has been refreshed.',
	},
	goHome: { id: 'app.bedrock.not-found.home', defaultMessage: 'Back to the launcher' },
	edition: { id: 'app.bedrock.edition', defaultMessage: 'Bedrock Edition' },
	play: { id: 'app.bedrock.play', defaultMessage: 'Play' },
	getFromStore: { id: 'app.bedrock.get-from-store', defaultMessage: 'Get it from Microsoft Store' },
	notInstalled: {
		id: 'app.bedrock.not-installed',
		defaultMessage:
			'Minecraft for Windows is not installed on this PC. Install it from Microsoft Store, then come back.',
	},
	recheck: { id: 'app.bedrock.recheck', defaultMessage: 'Check again' },
	launched: { id: 'app.bedrock.launched', defaultMessage: 'Minecraft for Windows is starting' },
	installedTab: { id: 'app.bedrock.tab.installed', defaultMessage: 'Content' },
	browseTab: { id: 'app.bedrock.tab.browse', defaultMessage: 'Add content' },
	nothingInstalled: {
		id: 'app.bedrock.nothing-installed',
		defaultMessage: 'Nothing is installed in this build yet.',
	},
	remove: { id: 'app.bedrock.remove', defaultMessage: 'Remove' },
	deleteBuild: { id: 'app.bedrock.delete-build', defaultMessage: 'Delete build' },
	deleteTitle: { id: 'app.bedrock.delete-title', defaultMessage: 'Delete this Bedrock build?' },
	deleteBody: {
		id: 'app.bedrock.delete-body',
		defaultMessage:
			'The build is removed from the launcher. Packs and worlds it installed can be removed from the game too.',
	},
	deleteKeep: { id: 'app.bedrock.delete-keep', defaultMessage: 'Keep packs in the game' },
	deleteAll: { id: 'app.bedrock.delete-all', defaultMessage: 'Remove packs too' },
	cancel: { id: 'app.bedrock.cancel', defaultMessage: 'Cancel' },
	rename: { id: 'app.bedrock.rename', defaultMessage: 'Rename' },
	save: { id: 'app.bedrock.save', defaultMessage: 'Save' },
	changeIcon: { id: 'app.bedrock.change-icon', defaultMessage: 'Change icon' },
	removeIcon: { id: 'app.bedrock.remove-icon', defaultMessage: 'Remove icon' },
	search: { id: 'app.bedrock.search', defaultMessage: 'Search Bedrock content...' },
	allCategories: { id: 'app.bedrock.all-categories', defaultMessage: 'All categories' },
	sortPopularity: { id: 'app.bedrock.sort.popularity', defaultMessage: 'Popularity' },
	sortDownloads: { id: 'app.bedrock.sort.downloads', defaultMessage: 'Downloads' },
	sortUpdated: { id: 'app.bedrock.sort.updated', defaultMessage: 'Recently updated' },
	sortName: { id: 'app.bedrock.sort.name', defaultMessage: 'Name' },
	install: { id: 'app.bedrock.install', defaultMessage: 'Install' },
	installed: { id: 'app.bedrock.installed', defaultMessage: 'Installed' },
	installedToast: { id: 'app.bedrock.installed-toast', defaultMessage: '{name} is installed' },
	chooseFile: { id: 'app.bedrock.choose-file', defaultMessage: 'Choose a file' },
	noFiles: { id: 'app.bedrock.no-files', defaultMessage: 'This project has no files to install.' },
	openCurseforge: { id: 'app.bedrock.open-curseforge', defaultMessage: 'Open on CurseForge' },
	nothingFound: { id: 'app.bedrock.nothing-found', defaultMessage: 'Nothing found' },
	page: { id: 'app.bedrock.page', defaultMessage: 'Стр. {page}' },
	pageLast: { id: 'app.bedrock.page-last', defaultMessage: 'Стр. {page} — последняя' },
	downloads: { id: 'app.bedrock.downloads', defaultMessage: '{count} downloads' },
	byAuthor: { id: 'app.bedrock.by-author', defaultMessage: 'by {author}' },
	noKey: {
		id: 'app.bedrock.no-key',
		defaultMessage: 'Add a CurseForge API key in the settings to browse Bedrock content.',
	},
	kindResource: { id: 'app.bedrock.kind.resource', defaultMessage: 'Resource pack' },
	kindBehavior: { id: 'app.bedrock.kind.behavior', defaultMessage: 'Behavior pack' },
	kindSkin: { id: 'app.bedrock.kind.skin', defaultMessage: 'Skin pack' },
	kindWorld: { id: 'app.bedrock.kind.world', defaultMessage: 'World' },
	kindWorldTemplate: { id: 'app.bedrock.kind.world-template', defaultMessage: 'World template' },
})

const profileId = computed(() => String(route.params.id ?? ''))
const profile = ref<BedrockProfile | null>(null)
const status = ref<BedrockStatus | null>(null)
const tab = ref<'installed' | 'browse'>('installed')

useRootBreadcrumb({
	slot: 'instance',
	id: () => `bedrock:${profileId.value}`,
	label: () => profile.value?.name ?? 'Bedrock',
	visual: () => ({
		type: 'image',
		src: bedrockIconUrl(profile.value) ?? undefined,
		alt: profile.value?.name,
		tintBy: profile.value?.id ?? profileId.value,
	}),
	to: () => `/bedrock/${encodeURIComponent(profileId.value)}`,
})

const notFound = ref(false)

async function loadProfile() {
	// Navigating away empties the route id; asking the backend for a build
	// with no id only ever comes back with a "no Bedrock build" error.
	if (!profileId.value) return
	try {
		profile.value = await getBedrock(profileId.value)
		notFound.value = false
	} catch {
		// A removed or stale build gets a quiet note on the page itself,
		// not a modal - the sidebar is refreshed so the dead entry leaves.
		notFound.value = true
		profile.value = null
	}
	void refreshBedrockProfiles()
}

async function loadStatus() {
	try {
		status.value = await bedrockStatus()
	} catch (error) {
		handleError(error as Error)
	}
}

watch(profileId, () => {
	if (profileId.value) void loadProfile()
})

onMounted(() => {
	void loadProfile()
	void loadStatus()
})

// ---- Header ---------------------------------------------------------------

const launching = ref(false)
async function play() {
	if (!profile.value) return
	launching.value = true
	try {
		await launchBedrock(profile.value.id)
		addNotification({ type: 'success', title: formatMessage(messages.launched) })
		await loadProfile()
	} catch (error) {
		handleError(error as Error)
	} finally {
		launching.value = false
	}
}

async function openStore() {
	if (!status.value) return
	try {
		await openUrl(status.value.store_url)
	} catch {
		await openUrl(status.value.store_web_url)
	}
}

async function changeIcon() {
	if (!profile.value) return
	const value = await open({
		multiple: false,
		filters: [{ name: 'Image', extensions: ['png', 'jpeg', 'svg', 'webp', 'gif', 'jpg'] }],
	})
	if (!value || Array.isArray(value)) return
	try {
		profile.value = await setBedrockIcon(profile.value.id, value)
		await refreshBedrockProfiles()
	} catch (error) {
		handleError(error as Error)
	}
}

async function clearIcon() {
	if (!profile.value) return
	try {
		profile.value = await setBedrockIcon(profile.value.id, null)
		await refreshBedrockProfiles()
	} catch (error) {
		handleError(error as Error)
	}
}

const renaming = ref(false)
const newName = ref('')
function startRename() {
	newName.value = profile.value?.name ?? ''
	renaming.value = true
}
async function saveName() {
	if (!profile.value || !newName.value.trim()) return
	try {
		profile.value = await renameBedrock(profile.value.id, newName.value.trim())
		renaming.value = false
		await refreshBedrockProfiles()
	} catch (error) {
		handleError(error as Error)
	}
}

const deleteModal = useTemplateRef<InstanceType<typeof NewModal>>('deleteModal')
async function deleteBuild(removeContent: boolean) {
	if (!profile.value) return
	try {
		await removeBedrock(profile.value.id, removeContent)
		deleteModal.value?.hide()
		await refreshBedrockProfiles()
		await router.push('/')
	} catch (error) {
		handleError(error as Error)
	}
}

// ---- Installed content ----------------------------------------------------

function kindLabel(content: BedrockContent) {
	const kinds = [...new Set(content.packs.map((pack) => pack.kind))]
	return kinds
		.map((kind) => {
			switch (kind) {
				case 'resource':
					return formatMessage(messages.kindResource)
				case 'behavior':
					return formatMessage(messages.kindBehavior)
				case 'skin':
					return formatMessage(messages.kindSkin)
				case 'world':
					return formatMessage(messages.kindWorld)
				default:
					return formatMessage(messages.kindWorldTemplate)
			}
		})
		.join(' · ')
}

const removing = ref<number | null>(null)
async function uninstall(content: BedrockContent) {
	if (!profile.value) return
	removing.value = content.project_id
	try {
		profile.value = await uninstallBedrockContent(profile.value.id, content.project_id)
	} catch (error) {
		handleError(error as Error)
	} finally {
		removing.value = null
	}
}

// ---- Browse (CurseForge, Bedrock only) -----------------------------------

const PAGE_SIZE = 20
const keyAvailable = ref(true)
const classes = ref<BedrockClass[]>([])
const categories = ref<BedrockCategory[]>([])
const classId = ref<number | null>(null)
const categoryId = ref<number | null>(null)
const query = ref('')
const sortField = ref<number>(BEDROCK_SORTS[0].id)
const hits = ref<BedrockProject[]>([])
const total = ref(0)
const searching = ref(false)
/** Which page of the browse list is on the screen right now. */
const pageNum = ref(1)

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const sortLabels: Record<string, () => string> = {
	popularity: () => formatMessage(messages.sortPopularity),
	downloads: () => formatMessage(messages.sortDownloads),
	updated: () => formatMessage(messages.sortUpdated),
	name: () => formatMessage(messages.sortName),
}
const sortOptions = computed<ComboboxOption<number>[]>(() =>
	BEDROCK_SORTS.map((sort) => ({ value: sort.id, label: sortLabels[sort.key]() })),
)
const categoryOptions = computed<ComboboxOption<number | null>[]>(() => [
	{ value: null, label: formatMessage(messages.allCategories) },
	...categories.value
		.filter((category) => category.id !== classId.value)
		.map((category) => ({ value: category.id, label: category.name })),
])

let browseLoaded = false
async function openBrowse() {
	tab.value = 'browse'
	if (browseLoaded) return
	browseLoaded = true
	try {
		keyAvailable.value = await bedrockCurseforgeAvailable()
		if (!keyAvailable.value) return
		classes.value = await bedrockClasses()
		classId.value = classes.value[0]?.id ?? null
	} catch (error) {
		handleError(error as Error)
	}
}

watch(classId, async (id) => {
	categoryId.value = null
	categories.value = []
	if (id !== null) {
		try {
			categories.value = await bedrockCategories(id)
		} catch (error) {
			handleError(error as Error)
		}
	}
	void runSearch(true)
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, () => {
	clearTimeout(searchTimer)
	searchTimer = setTimeout(() => void runSearch(true), 350)
})
watch([categoryId, sortField], () => {
	void runSearch(true)
})

let searchToken = 0
async function runSearch(reset: boolean) {
	if (!keyAvailable.value || classId.value === null) return
	const token = ++searchToken
	searching.value = true
	try {
		const index = reset ? 0 : (pageNum.value - 1) * PAGE_SIZE
		const page = await searchBedrock({
			classId: classId.value,
			categoryId: categoryId.value,
			query: query.value.trim(),
			sortField: sortField.value,
			index,
			pageSize: PAGE_SIZE,
		})
		if (token !== searchToken) return
		hits.value = page.hits
		total.value = page.total
		if (reset) pageNum.value = 1
	} catch (error) {
		if (token === searchToken) handleError(error as Error)
	} finally {
		if (token === searchToken) searching.value = false
	}
}

/** Flips the browse list to another page - the whole list is replaced, the
 * way a book turns a page instead of growing a tail. */
function goToPage(p: number) {
	if (p < 1 || p > maxPage.value || p === pageNum.value || searching.value) return
	pageNum.value = p
	void runSearch(false)
}

const installedIds = computed(
	() => new Set((profile.value?.content ?? []).map((content) => content.project_id)),
)

const filesModal = useTemplateRef<InstanceType<typeof NewModal>>('filesModal')
const chosenProject = ref<BedrockProject | null>(null)
const files = ref<BedrockFile[]>([])
const filesLoading = ref(false)
const installing = ref<number | null>(null)

async function chooseFile(project: BedrockProject, event?: MouseEvent) {
	chosenProject.value = project
	files.value = []
	filesLoading.value = true
	filesModal.value?.show(event)
	try {
		files.value = await bedrockFiles(project.id)
	} catch (error) {
		handleError(error as Error)
	} finally {
		filesLoading.value = false
	}
}

async function install(file: BedrockFile) {
	if (!profile.value || !chosenProject.value) return
	installing.value = file.id
	try {
		profile.value = await installBedrockContent(profile.value.id, chosenProject.value.id, file.id)
		addNotification({
			type: 'success',
			title: formatMessage(messages.installedToast, { name: chosenProject.value.name }),
		})
		filesModal.value?.hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		installing.value = null
	}
}

function formatCount(count: number) {
	return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(count)
}

function formatDate(date: string | null) {
	if (!date) return ''
	return new Date(date).toLocaleDateString()
}
</script>

<template>
	<div
		v-if="notFound"
		class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
	>
		<h1 class="m-0 text-xl font-bold text-contrast">
			{{ formatMessage(messages.notFoundTitle) }}
		</h1>
		<p class="m-0 max-w-md text-secondary">
			{{ formatMessage(messages.notFoundDescription) }}
		</p>
		<Button @click="() => router.push('/')">{{ formatMessage(messages.goHome) }}</Button>
	</div>
	<div v-if="profile" class="flex flex-col gap-4 p-6">
		<div
			class="flex flex-wrap items-center gap-4 rounded-2xl border border-solid border-surface-5 bg-surface-3 p-4"
		>
			<button
				v-tooltip="formatMessage(messages.changeIcon)"
				class="bedrock-icon relative shrink-0 cursor-pointer rounded-2xl border-none bg-transparent p-0"
				@click="changeIcon"
				@contextmenu.prevent="clearIcon"
			>
				<Avatar :src="bedrockIconUrl(profile)" size="96px" :tint-by="profile.id" />
				<span class="bedrock-icon__edit"><EditIcon /></span>
			</button>
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<div v-if="renaming" class="flex items-center gap-2">
					<Input v-model="newName" type="text" autocomplete="off" @keydown.enter="saveName" />
					<Button type="colored" color="brand" @click="saveName">
						<CheckIcon /> {{ formatMessage(messages.save) }}
					</Button>
					<Button type="outlined" @click="renaming = false"><XIcon /></Button>
				</div>
				<div v-else class="flex min-w-0 items-center gap-2">
					<h1 class="m-0 truncate text-2xl font-extrabold text-contrast">{{ profile.name }}</h1>
					<Button v-tooltip="formatMessage(messages.rename)" type="quiet" @click="startRename">
						<EditIcon />
					</Button>
				</div>
				<div class="flex items-center gap-1.5 text-secondary">
					<TagLoaderBedrockIcon class="size-4" />
					{{ formatMessage(messages.edition) }}
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					v-if="!status || status.installed"
					type="colored"
					color="brand"
					size="lg"
					:disabled="launching || !status"
					@click="play"
				>
					<SpinnerIcon v-if="launching" class="animate-spin" />
					<PlayIcon v-else />
					{{ formatMessage(messages.play) }}
				</Button>
				<Button v-else type="colored" color="brand" size="lg" @click="openStore">
					<ExternalIcon /> {{ formatMessage(messages.getFromStore) }}
				</Button>
				<Button
					v-tooltip="formatMessage(messages.deleteBuild)"
					type="outlined"
					@click="(event: MouseEvent) => deleteModal?.show(event)"
				>
					<TrashIcon />
				</Button>
			</div>
		</div>

		<div
			v-if="status && !status.installed"
			class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-solid border-surface-5 bg-surface-3 px-4 py-3"
		>
			<span class="text-secondary">{{ formatMessage(messages.notInstalled) }}</span>
			<Button type="outlined" @click="loadStatus">{{ formatMessage(messages.recheck) }}</Button>
		</div>

		<div class="flex gap-2">
			<Button
				:type="tab === 'installed' ? 'colored' : 'outlined'"
				:color="tab === 'installed' ? 'brand' : undefined"
				@click="tab = 'installed'"
			>
				{{ formatMessage(messages.installedTab) }}
			</Button>
			<Button
				:type="tab === 'browse' ? 'colored' : 'outlined'"
				:color="tab === 'browse' ? 'brand' : undefined"
				@click="openBrowse"
			>
				<PlusIcon /> {{ formatMessage(messages.browseTab) }}
			</Button>
		</div>

		<template v-if="tab === 'installed'">
			<div
				v-if="profile.content.length === 0"
				class="rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center text-secondary"
			>
				{{ formatMessage(messages.nothingInstalled) }}
			</div>
			<div v-else class="bedrock-list">
				<div
					v-for="content in profile.content"
					:key="content.project_id"
					class="bedrock-row flex items-center gap-3 px-4 py-3"
				>
					<Avatar
						:src="content.icon_url ?? undefined"
						size="40px"
						:tint-by="String(content.project_id)"
					/>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-semibold text-contrast">{{ content.name }}</span>
						<span class="truncate text-sm text-secondary">
							{{ kindLabel(content)
							}}<template v-if="content.file_name"> · {{ content.file_name }}</template>
						</span>
					</div>
					<Button
						type="outlined"
						:disabled="removing === content.project_id"
						@click="uninstall(content)"
					>
						<SpinnerIcon v-if="removing === content.project_id" class="animate-spin" />
						<TrashIcon v-else />
						{{ formatMessage(messages.remove) }}
					</Button>
				</div>
			</div>
		</template>

		<template v-else>
			<div
				v-if="!keyAvailable"
				class="rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center text-secondary"
			>
				{{ formatMessage(messages.noKey) }}
			</div>
			<template v-else>
				<div class="flex flex-wrap gap-2">
					<Button
						v-for="cls in classes"
						:key="cls.id"
						:type="classId === cls.id ? 'colored' : 'outlined'"
						:color="classId === cls.id ? 'brand' : undefined"
						@click="classId = cls.id"
					>
						<img v-if="cls.icon_url" :src="cls.icon_url" alt="" class="size-4 rounded-sm" />
						{{ cls.name }}
					</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Input
						v-model="query"
						:icon="SearchIcon"
						type="text"
						autocomplete="off"
						:placeholder="formatMessage(messages.search)"
						clearable
						wrapper-class="min-w-64 flex-1"
						@clear="query = ''"
					/>
					<Combobox
						v-model="categoryId"
						:options="categoryOptions"
						class="w-56"
						listbox
						show-chevron
					/>
					<Combobox v-model="sortField" :options="sortOptions" class="w-48" listbox show-chevron />
				</div>

				<div
					v-if="!searching && hits.length === 0"
					class="rounded-2xl border border-solid border-surface-5 bg-surface-3 px-6 py-10 text-center text-secondary"
				>
					{{ formatMessage(messages.nothingFound) }}
				</div>
				<div v-else class="bedrock-list">
					<div
						v-for="project in hits"
						:key="project.id"
						class="bedrock-row flex items-center gap-3 px-4 py-3"
					>
						<Avatar
							:src="project.icon_url ?? undefined"
							size="56px"
							:tint-by="String(project.id)"
						/>
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<div class="flex min-w-0 items-baseline gap-2">
								<span class="truncate font-bold text-contrast">{{ project.name }}</span>
								<span v-if="project.author" class="shrink-0 text-sm text-secondary">
									{{ formatMessage(messages.byAuthor, { author: project.author }) }}
								</span>
							</div>
							<span class="line-clamp-2 text-sm text-secondary">{{ project.summary }}</span>
							<span class="flex items-center gap-1 text-xs text-secondary">
								<DownloadIcon class="size-3.5" />
								{{ formatMessage(messages.downloads, { count: formatCount(project.downloads) }) }}
							</span>
						</div>
						<Button
							v-if="project.website_url"
							v-tooltip="formatMessage(messages.openCurseforge)"
							type="quiet"
							@click="openUrl(project.website_url)"
						>
							<ExternalIcon />
						</Button>
						<Button v-if="installedIds.has(project.id)" type="outlined" disabled>
							<CheckIcon /> {{ formatMessage(messages.installed) }}
						</Button>
						<Button
							v-else
							type="colored"
							color="brand"
							@click="(event: MouseEvent) => chooseFile(project, event)"
						>
							<DownloadIcon /> {{ formatMessage(messages.install) }}
						</Button>
					</div>
				</div>
				<div v-if="searching" class="flex justify-center py-4">
					<SpinnerIcon class="size-6 animate-spin text-secondary" />
				</div>
				<div
						v-if="total > PAGE_SIZE"
						class="flex items-center justify-center gap-3 py-2"
					>
						<Button type="outlined" :disabled="searching || pageNum <= 1" @click="goToPage(pageNum - 1)">
							<ChevronLeftIcon />
						</Button>
						<span class="text-sm tabular-nums text-secondary">
							{{ formatMessage(pageNum >= maxPage ? messages.pageLast : messages.page, { page: pageNum }) }}
						</span>
						<Button type="outlined" :disabled="searching || pageNum >= maxPage" @click="goToPage(pageNum + 1)">
							<ChevronRightIcon />
						</Button>
					</div>
			</template>
		</template>

		<NewModal ref="filesModal" :header="chosenProject?.name ?? formatMessage(messages.chooseFile)">
			<div class="flex w-[34rem] max-w-full flex-col gap-2">
				<span class="text-secondary">{{ formatMessage(messages.chooseFile) }}</span>
				<div v-if="filesLoading" class="flex justify-center py-6">
					<SpinnerIcon class="size-6 animate-spin text-secondary" />
				</div>
				<div v-else-if="files.length === 0" class="py-4 text-center text-secondary">
					{{ formatMessage(messages.noFiles) }}
				</div>
				<div v-else class="bedrock-list max-h-[50vh] overflow-y-auto">
					<div
						v-for="file in files"
						:key="file.id"
						class="bedrock-row flex items-center gap-3 px-3 py-2"
					>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-semibold text-contrast">{{ file.display_name }}</span>
							<span class="truncate text-xs text-secondary">
								{{ formatDate(file.file_date)
								}}<template v-if="file.game_versions.length">
									· {{ file.game_versions.slice(0, 4).join(', ') }}</template
								>
							</span>
						</div>
						<Button
							type="colored"
							color="brand"
							:disabled="installing !== null"
							@click="install(file)"
						>
							<SpinnerIcon v-if="installing === file.id" class="animate-spin" />
							<DownloadIcon v-else />
							{{ formatMessage(messages.install) }}
						</Button>
					</div>
				</div>
			</div>
		</NewModal>

		<NewModal ref="deleteModal" :header="formatMessage(messages.deleteTitle)">
			<div class="flex w-[30rem] max-w-full flex-col gap-4">
				<p class="m-0 text-secondary">{{ formatMessage(messages.deleteBody) }}</p>
				<div class="flex flex-wrap justify-end gap-2">
					<Button type="outlined" @click="deleteModal?.hide()">
						{{ formatMessage(messages.cancel) }}
					</Button>
					<Button type="outlined" @click="deleteBuild(false)">
						{{ formatMessage(messages.deleteKeep) }}
					</Button>
					<Button type="colored" color="red" @click="deleteBuild(true)">
						<TrashIcon /> {{ formatMessage(messages.deleteAll) }}
					</Button>
				</div>
			</div>
		</NewModal>
	</div>
	<div v-else class="flex justify-center p-10">
		<SpinnerIcon class="size-8 animate-spin text-secondary" />
	</div>
</template>

<style scoped lang="scss">
.bedrock-icon__edit {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 1rem;
	background: rgb(0 0 0 / 0.45);
	color: white;
	opacity: 0;
	transition: opacity 0.15s ease;

	svg {
		width: 1.5rem;
		height: 1.5rem;
	}
}

.bedrock-icon:hover .bedrock-icon__edit,
.bedrock-icon:focus-visible .bedrock-icon__edit {
	opacity: 1;
}

.bedrock-list {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--surface-5);
	border-radius: 1rem;
}

.bedrock-row {
	background: color-mix(in srgb, var(--surface-3) 70%, transparent);

	& + & {
		border-top: 1px solid var(--surface-5);
	}
}
</style>
