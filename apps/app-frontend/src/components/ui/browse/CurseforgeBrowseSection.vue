<script setup lang="ts">
/**
 * Searching CurseForge alongside Modrinth.
 *
 * Drawn as its own section rather than mixed into the project cards, because the
 * two do not describe the same thing: a CurseForge result has no Modrinth
 * project id, no Modrinth versions and no Modrinth compatibility answers, and
 * dressing it up as one would make the cards claim things nobody asked. Keeping
 * it separate also means every result says where it came from.
 *
 * Nothing here reaches the network directly — the backend owns the key, and
 * CurseForge's index window and loader numbering, and a second copy of either in
 * the frontend is how the two drift apart. See `@/helpers/curseforge-api`.
 */
import { BoxIcon, DownloadIcon, ExternalIcon } from '@modrinth/assets'
import { Button, Card, defineMessages, IconButton, ProgressBar, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import {
	type CurseforgeFile,
	curseforgeFiles,
	type CurseforgeHit,
	curseforgeProjectUrl,
	installCurseforgeMod,
	isCurseforgeAvailable,
	searchCurseforge,
} from '@/helpers/curseforge-api'

const props = defineProps<{
	/** The words in the search box, so both providers are asked the same question. */
	filter: string
	gameVersion?: string | null
	loader?: string | null
	/** Without an instance there is nowhere to install into, so only browsing is offered. */
	instanceId?: string | null
}>()

const emit = defineEmits<{ (event: 'hide-modrinth', hide: boolean): void }>()

const { formatMessage } = useVIntl()

type Provider = 'modrinth' | 'both' | 'curseforge'

const messages = defineMessages({
	providerLabel: { id: 'browse.curseforge.provider-label', defaultMessage: 'Search' },
	providerModrinth: { id: 'browse.curseforge.provider-modrinth', defaultMessage: 'Modrinth' },
	providerBoth: { id: 'browse.curseforge.provider-both', defaultMessage: 'Both' },
	providerCurseforge: {
		id: 'browse.curseforge.provider-curseforge',
		defaultMessage: 'CurseForge',
	},
	sectionTitle: { id: 'browse.curseforge.section-title', defaultMessage: 'From CurseForge' },
	noKey: {
		id: 'browse.curseforge.no-key',
		defaultMessage:
			'CurseForge is not available: no API key is configured. One can be added in Settings → Resources.',
	},
	noResults: {
		id: 'browse.curseforge.no-results',
		defaultMessage: 'Nothing on CurseForge matches these words.',
	},
	emptyFilter: {
		id: 'browse.curseforge.empty-filter',
		defaultMessage: 'Type something to search CurseForge.',
	},
	install: { id: 'browse.curseforge.install', defaultMessage: 'Install' },
	installing: { id: 'browse.curseforge.installing', defaultMessage: 'Installing…' },
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

const provider = ref<Provider>('modrinth')
const available = ref(false)
const searching = ref(false)
const hits = ref<CurseforgeHit[]>([])
const errorMessage = ref<string | null>(null)
const installingIds = ref<Set<string>>(new Set())
const openVersionsFor = ref<string | null>(null)
const filesByProject = ref<Record<string, CurseforgeFile[] | 'loading'>>({})

const includeCurseforge = computed(() => provider.value !== 'modrinth')

void isCurseforgeAvailable().then((answer) => {
	available.value = answer
	if (!answer) {
		// Offering a provider that cannot answer anything would be a control that
		// quietly does nothing, so it is not offered at all.
		provider.value = 'modrinth'
		emit('hide-modrinth', false)
	}
})

watch(
	() => provider.value,
	(hideModrinth) => emit('hide-modrinth', hideModrinth === 'curseforge'),
)

async function runSearch() {
	if (!includeCurseforge.value || !available.value) {
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
	[() => provider.value, () => props.filter, () => props.gameVersion, () => props.loader],
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
</script>

<template>
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center gap-3">
			<span class="text-sm text-secondary">{{ formatMessage(messages.providerLabel) }}</span>
			<div class="flex gap-1 rounded-lg bg-surface-3 p-1">
				<Button
					v-for="option in ['modrinth', 'both', 'curseforge'] as Provider[]"
					:key="option"
					:color="provider === option ? 'brand' : 'secondary'"
					size="sm"
					@click="provider = option"
				>
					{{
						formatMessage(
							option === 'modrinth'
								? messages.providerModrinth
								: option === 'both'
									? messages.providerBoth
									: messages.providerCurseforge,
						)
					}}
				</Button>
			</div>
			<p v-if="!available" class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.noKey) }}
			</p>
		</div>

		<template v-if="includeCurseforge && available">
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
								<strong class="truncate text-contrast">{{ hit.name }}</strong>
								<span v-if="hit.author_name" class="truncate text-sm text-secondary">
									{{ hit.author_name }}
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

					<p v-if="hit.summary" class="m-0 text-secondary">{{ hit.summary }}</p>
					<p class="m-0 text-sm text-secondary">
						{{ formatMessage(messages.downloads, { count: hit.download_count }) }}
						<span v-if="!hit.latest_file"> · {{ formatMessage(messages.noFileForVersion) }} </span>
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
	</div>
</template>
