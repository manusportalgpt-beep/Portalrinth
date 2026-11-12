<script setup lang="ts">
import { CheckIcon, DownloadIcon, HeartIcon, PlusIcon, SearchIcon } from '@modrinth/assets'
import {
	Avatar,
	Button,
	defineMessages,
	EmptyState,
	injectNotificationManager,
	Input,
	useCompactNumber,
	useVIntl,
} from '@modrinth/ui'
import { refDebounced } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
	type HostedSearchHit,
	installToHostedServer,
	NoFittingVersionError,
	searchHostedContent,
} from '@/helpers/hosted-content'
import type { HostedPlugin, HostedServerView } from '@/helpers/hosting'

import { softwareLabels } from './messages'

const props = defineProps<{ server: HostedServerView }>()
const emit = defineEmits<{ installed: [plugins: HostedPlugin[]] }>()

const { formatMessage } = useVIntl()
const { formatCompactNumber } = useCompactNumber()
const { addNotification, handleError } = injectNotificationManager()
const router = useRouter()
const messages = defineMessages({
	title: { id: 'app.server-hosting.browse.title', defaultMessage: 'Find on Modrinth' },
	search: { id: 'app.server-hosting.browse.search', defaultMessage: 'Search' },
	install: { id: 'app.server-hosting.browse.install', defaultMessage: 'Install' },
	installed: { id: 'app.server-hosting.browse.installed', defaultMessage: 'Installed' },
	more: { id: 'app.server-hosting.browse.more', defaultMessage: 'Show more' },
	by: { id: 'app.server-hosting.browse.by', defaultMessage: 'by {author}' },
	nothing: { id: 'app.server-hosting.browse.nothing', defaultMessage: 'Nothing found' },
	nothingHint: {
		id: 'app.server-hosting.browse.nothing-hint',
		defaultMessage: 'Nothing fits {core} {version}. Try another word.',
	},
	failed: {
		id: 'app.server-hosting.browse.failed',
		defaultMessage: 'Modrinth could not be reached',
	},
	noVersion: {
		id: 'app.server-hosting.browse.no-version',
		defaultMessage: 'No file of {name} fits this server',
	},
	installedToast: {
		id: 'app.server-hosting.browse.installed-toast',
		defaultMessage: '{name} is installed, restart the server to load it',
	},
})

const query = ref('')
const debounced = refDebounced(query, 350)
const hits = ref<HostedSearchHit[]>([])
const total = ref(0)
const loading = ref(false)
const failed = ref(false)
const installing = ref<string | null>(null)
const installed = ref(new Set<string>())
let controller: AbortController | null = null

async function load(append: boolean) {
	controller?.abort()
	const current = new AbortController()
	controller = current
	loading.value = true
	failed.value = false
	try {
		const result = await searchHostedContent(
			props.server,
			debounced.value.trim(),
			append ? hits.value.length : 0,
			current.signal,
		)
		if (current.signal.aborted) return
		hits.value = append ? [...hits.value, ...result.hits] : result.hits
		total.value = result.total
	} catch (error) {
		if (current.signal.aborted) return
		failed.value = true
		console.warn('Hosted content search failed', error)
	} finally {
		if (controller === current) loading.value = false
	}
}

watch(
	() => [debounced.value, props.server.id, props.server.software, props.server.game_version],
	() => void load(false),
	{ immediate: true },
)
onBeforeUnmount(() => controller?.abort())

const canLoadMore = computed(() => hits.value.length < total.value)

async function install(hit: HostedSearchHit) {
	if (installing.value) return
	installing.value = hit.project_id
	try {
		const plugins = await installToHostedServer(props.server, hit.project_id)
		installed.value = new Set([...installed.value, hit.project_id])
		emit('installed', plugins)
		addNotification({
			type: 'success',
			title: formatMessage(messages.installedToast, { name: hit.title }),
		})
	} catch (error) {
		if (error instanceof NoFittingVersionError) {
			addNotification({
				type: 'error',
				title: formatMessage(messages.noVersion, { name: hit.title }),
			})
		} else {
			handleError(error as Error)
		}
	} finally {
		installing.value = null
	}
}

function openProject(hit: HostedSearchHit) {
	void router.push(`/project/${hit.slug || hit.project_id}`)
}
</script>

<template>
	<section class="hosting-panel flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="m-0 text-lg font-bold text-contrast">{{ formatMessage(messages.title) }}</h2>
			<span class="text-sm text-secondary">{{ server.game_version }}</span>
		</div>
		<Input
			v-model="query"
			:icon="SearchIcon"
			autocomplete="off"
			:placeholder="formatMessage(messages.search)"
		/>

		<EmptyState
			v-if="failed && hits.length === 0"
			type="no-connection"
			:heading="formatMessage(messages.failed)"
		/>
		<EmptyState
			v-else-if="!loading && hits.length === 0"
			type="no-search-result"
			:heading="formatMessage(messages.nothing)"
			:description="
				formatMessage(messages.nothingHint, {
					core: softwareLabels[server.software],
					version: server.game_version,
				})
			"
		/>
		<div v-else class="flex flex-col gap-2" :class="{ 'opacity-60': loading && !hits.length }">
			<div v-for="hit in hits" :key="hit.project_id" class="hosting-hit">
				<button
					type="button"
					class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
					@click="openProject(hit)"
				>
					<Avatar :src="hit.icon_url ?? undefined" alt="" size="3rem" no-shadow />
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="flex min-w-0 items-baseline gap-1.5">
							<span class="truncate font-bold text-contrast">{{ hit.title }}</span>
							<span class="shrink-0 truncate text-xs text-secondary">
								{{ formatMessage(messages.by, { author: hit.author }) }}
							</span>
						</span>
						<span class="line-clamp-2 text-sm text-secondary">{{ hit.description }}</span>
						<span class="flex items-center gap-3 text-xs text-secondary">
							<span class="flex items-center gap-1">
								<DownloadIcon class="size-3.5" />
								{{ formatCompactNumber(hit.downloads) }}
							</span>
							<span class="flex items-center gap-1">
								<HeartIcon class="size-3.5" />
								{{ formatCompactNumber(hit.follows) }}
							</span>
						</span>
					</span>
				</button>
				<Button
					class="shrink-0"
					type="outlined"
					:color="installed.has(hit.project_id) ? 'green' : 'brand'"
					:loading="installing === hit.project_id"
					:disabled="installing !== null || installed.has(hit.project_id)"
					@click="install(hit)"
				>
					<CheckIcon v-if="installed.has(hit.project_id)" />
					<PlusIcon v-else />
					{{ formatMessage(installed.has(hit.project_id) ? messages.installed : messages.install) }}
				</Button>
			</div>
			<Button
				v-if="canLoadMore"
				class="self-center"
				type="quiet"
				:loading="loading"
				@click="load(true)"
			>
				{{ formatMessage(messages.more) }}
			</Button>
		</div>
	</section>
</template>

<style scoped lang="scss">
.hosting-panel {
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	min-width: 0;
}

.hosting-hit {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.625rem 0.75rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
	transition: border-color 0.15s ease;

	&:hover {
		border-color: var(--surface-6, var(--surface-5));
	}
}
</style>
