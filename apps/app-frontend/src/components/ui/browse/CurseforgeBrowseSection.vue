<script setup lang="ts">
/**
 * What CurseForge has for the current search.
 *
 * Drawn as its own section rather than mixed into the project cards, because the
 * two do not describe the same thing: a CurseForge result has no Modrinth
 * project id, no Modrinth versions and no Modrinth compatibility answers, and
 * dressing it up as one would make the cards claim things nobody asked. Keeping
 * it separate also means every result says where it came from.
 *
 * The switch that chooses whether to ask CurseForge at all lives above the
 * search box, where the search itself is; its state is owned by whoever mounts
 * both and passed in, so the two are never out of step.
 *
 * Nothing here reaches the network directly — the backend owns the key, and
 * CurseForge's index window and loader numbering, and a second copy of either in
 * the frontend is how the two drift apart. See `@/helpers/curseforge-api`.
 */
import { BoxIcon, DownloadIcon, ExternalIcon } from '@modrinth/assets'
import { Button, Card, defineMessages, IconButton, ProgressBar, useVIntl } from '@modrinth/ui'
import { computed, reactive, ref, watch } from 'vue'

import {
	type CurseforgeFile,
	curseforgeFiles,
	type CurseforgeHit,
	curseforgeProjectUrl,
	installCurseforgeMod,
	searchCurseforge,
} from '@/helpers/curseforge-api'
import { needsNoTranslation, resolveTarget, translateText } from '@/helpers/noctrinth-translate'

const props = defineProps<{
	provider: 'modrinth' | 'both' | 'curseforge'
	/** Whether a key is in force. Asked of the backend, never assumed. */
	available: boolean
	/** The words in the search box, so both providers are asked the same question. */
	filter: string
	gameVersion?: string | null
	loader?: string | null
	/** The tab being searched, which decides what counts as a result. */
	projectType?: string
	/** Without an instance there is nowhere to install into, so only browsing is offered. */
	instanceId?: string | null
}>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	sectionTitle: { id: 'browse.curseforge.section-title', defaultMessage: 'From CurseForge' },
	noResults: {
		id: 'browse.curseforge.no-results',
		defaultMessage: 'Nothing on CurseForge matches these words.',
	},
	emptyFilter: {
		id: 'browse.curseforge.empty-filter',
		defaultMessage: 'Type something to search CurseForge.',
	},
	install: { id: 'browse.curseforge.install', defaultMessage: 'Install' },
	installing: { id: 'browse.curseforge.installing', defaultMessage: 'Installing...' },
	openOnCurseforge: {
		id: 'browse.curseforge.open',
		defaultMessage: 'Open on CurseForge',
	},
	otherVersions: {
		id: 'browse.curseforge.other-versions',
		defaultMessage: 'Other versions',
	},
	noFileForVersion: {
		id: 'browse.curseforge.no-file-for-version',
		defaultMessage: 'No file for this game version',
	},
	downloads: {
		id: 'browse.curseforge.downloads',
		defaultMessage: '{count, plural, one {# download} other {# downloads}}',
	},
})

const searching = ref(false)
const hits = ref<CurseforgeHit[]>([])
const errorMessage = ref<string | null>(null)
const installingIds = ref<Set<string>>(new Set())
const openVersionsFor = ref<string | null>(null)
const filesByProject = ref<Record<string, CurseforgeFile[] | 'loading'>>({})

const wanted = computed(() => props.provider !== 'modrinth')

async function runSearch() {
	if (!wanted.value || !props.available) {
		hits.value = []
		return
	}

	const words = props.filter.trim()
	if (!words) {
		hits.value = []
		return
	}

	searching.value = true
	errorMessage.value = null
	try {
		const page = await searchCurseforge({
			filter: words,
			pageSize: 20,
			gameVersion: props.gameVersion,
			loader: props.loader,
			kind: curseforgeKindFor(props.projectType ?? 'mod'),
		})
		hits.value = page.hits
	} catch (error) {
		// Shown where the person is looking: a silent empty list reads as
		// "nothing matched", which is a different and wrong claim.
		errorMessage.value = error instanceof Error ? error.message : String(error)
		hits.value = []
	} finally {
		searching.value = false
	}
}

watch(
	[
		() => props.provider,
		() => props.filter,
		() => props.gameVersion,
		() => props.loader,
		() => props.projectType,
		() => props.available,
	],
	() => {
		void runSearch()
	},
	{ immediate: true },
)

function isInstalling(id: string) {
	return installingIds.value.has(id)
}

async function install(hit: CurseforgeHit, file: CurseforgeFile | null) {
	if (!props.instanceId || !file) return

	installingIds.value = new Set(installingIds.value).add(hit.id)
	try {
		await installCurseforgeMod(props.instanceId, hit.id, file.id)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	} finally {
		const after = new Set(installingIds.value)
		after.delete(hit.id)
		installingIds.value = after
	}
}

function openOnCurseforge(hit: CurseforgeHit) {
	window.open(curseforgeProjectUrl(hit), '_blank', 'noopener')
}

async function toggleVersions(hit: CurseforgeHit) {
	if (openVersionsFor.value === hit.id) {
		openVersionsFor.value = null
		return
	}

	openVersionsFor.value = hit.id
	if (filesByProject.value[hit.id]) return

	filesByProject.value = { ...filesByProject.value, [hit.id]: 'loading' }
	try {
		filesByProject.value = {
			...filesByProject.value,
			[hit.id]: await curseforgeFiles(hit.id, props.gameVersion, props.loader),
		}
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
		filesByProject.value = { ...filesByProject.value, [hit.id]: [] }
	}
}
/**
 * The same translation the rest of the launcher uses, applied to CurseForge's
 * own text.
 *
 * Keys are the entry's own identity, so a name that appears on several rows is
 * asked about once rather than once per row, and a result that arrives from
 * somewhere else and carries the same text is not paid for twice.
 */
const translated = reactive<Record<string, string>>({})
const appSettings = useAppSettings()

function translationKey(id: string, field: string, text: string) {
	return `${field}:${id}:${text}`
}

async function translateHit(hit: CurseforgeHit) {
	const target = resolveTarget(appSettings.locale)
	if (!target) return

	const fields: [string, string | null | undefined][] = [
		['title', hit.title],
		['author', hit.author],
		['summary', hit.description],
	]

	await Promise.all(
		fields.map(async ([field, text]) => {
			if (!text || needsNoTranslation(text, target)) return
			const key = translationKey(hit.id, field, text)
			if (translated[key]) return
			try {
				const result = await translateText(text, target)
				if (result && result !== text) translated[key] = result
			} catch {
				// A translation that could not be fetched leaves the original,
				// which is still something a person can read.
			}
		}),
	)
}

watch(
	hits,
	(list) => {
		for (const hit of list) void translateHit(hit)
	},
	{ immediate: true },
)

/** The field as translated, or as CurseForge wrote it. */
function textOf(hit: CurseforgeHit, field: 'title' | 'author' | 'description') {
	const text = hit[field]
	if (!text) return null
	return translated[translationKey(hit.id, field, text)] ?? text
}
</script>

<template>
	<template v-if="wanted && available">
		<ProgressBar v-if="searching" />
		<p v-if="errorMessage" class="m-0 text-sm text-red-500">{{ errorMessage }}</p>

		<p v-else-if="!filter.trim()" class="m-0 text-sm text-secondary">
			{{ formatMessage(messages.emptyFilter) }}
		</p>
		<p v-else-if="!hits.length" class="m-0 text-sm text-secondary">
			{{ formatMessage(messages.noResults) }}
		</p>

		<div v-else class="flex flex-col gap-2">
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.sectionTitle) }}
			</h2>

			<Card v-for="hit in hits" :key="hit.id">
				<template #header>
					<div class="flex w-full items-center gap-3">
						<img
							v-if="hit.icon_url"
							:src="hit.icon_url"
							:alt="hit.name"
							class="h-12 w-12 rounded"
						/>
						<BoxIcon v-else class="h-12 w-12 shrink-0 text-contrast" />
						<div class="flex min-w-0 flex-col">
							<strong class="truncate text-contrast">{{ textOf(hit, 'title') ?? hit.name }}</strong>
							<span v-if="hit.author_name" class="truncate text-sm text-secondary">
								{{ textOf(hit, 'author') ?? hit.author_name }}
							</span>
						</div>

						<div class="ml-auto flex shrink-0 items-center gap-2">
							<IconButton
								v-tooltip="formatMessage(messages.openOnCurseforge)"
								:label="formatMessage(messages.openOnCurseforge)"
								@click="openOnCurseforge(hit)"
							>
								<ExternalIcon />
							</IconButton>
							<Button
								v-if="instanceId"
								size="sm"
								:disabled="!hit.latest_file || isInstalling(hit.id)"
								@click="toggleVersions(hit)"
							>
								{{ formatMessage(messages.otherVersions) }}
							</Button>
							<Button
								v-if="instanceId"
								:disabled="!hit.latest_file || isInstalling(hit.id)"
								@click="install(hit, hit.latest_file)"
							>
								<DownloadIcon />
								{{
									isInstalling(hit.id)
										? formatMessage(messages.installing)
										: formatMessage(messages.install)
								}}
							</Button>
						</div>
					</div>
				</template>

				<p v-if="hit.description" class="m-0 text-secondary">
					{{ textOf(hit, 'description') ?? hit.description }}
				</p>
				<ul
					v-if="hit.categories?.length"
					class="mt-1 flex list-none flex-wrap gap-1 p-0 text-xs text-secondary"
				>
					<li
						v-for="category in hit.categories"
						:key="category"
						class="rounded bg-surface-3 px-1.5 py-0.5"
					>
						{{ category }}
					</li>
				</ul>
				<p class="m-0 text-sm text-secondary">
					{{ formatMessage(messages.downloads, { count: hit.download_count }) }}
					<span v-if="!hit.latest_file"> - {{ formatMessage(messages.noFileForVersion) }}</span>
				</p>

				<ul
					v-if="openVersionsFor === hit.id && filesByProject[hit.id] !== 'loading'"
					class="mt-2 flex list-none flex-col gap-1 p-0"
				>
					<li
						v-for="file in filesByProject[hit.id] as CurseforgeFile[]"
						:key="file.id"
						class="flex items-center gap-2 text-sm"
					>
						<span class="truncate text-primary">{{ file.display_name }}</span>
						<span v-if="file.game_version" class="shrink-0 text-secondary">
							{{ file.game_version }}
						</span>
						<Button
							class="ml-auto shrink-0"
							size="sm"
							:disabled="isInstalling(hit.id)"
							@click="install(hit, file)"
						>
							{{ formatMessage(messages.install) }}
						</Button>
					</li>
				</ul>
			</Card>
		</div>
	</template>
</template>
