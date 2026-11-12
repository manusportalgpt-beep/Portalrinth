<script setup lang="ts">
import { BoxIcon, FolderOpenIcon, TrashIcon, UploadIcon } from '@modrinth/assets'
import {
	Button,
	defineMessages,
	EmptyState,
	injectNotificationManager,
	Toggle,
	useVIntl,
} from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, ref } from 'vue'

import {
	type HostedPlugin,
	type HostedServerView,
	hosting_plugin_import,
	hosting_plugin_remove,
	hosting_plugin_toggle,
	hosting_plugins,
} from '@/helpers/hosting'
import { openPath } from '@/helpers/utils.js'

import { contentFolder, contentKind, contentMessages, formatSize } from './content-kind'

const props = defineProps<{ server: HostedServerView }>()

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const queryClient = useQueryClient()
const messages = defineMessages({
	importButton: { id: 'app.server-hosting.content.import', defaultMessage: 'Add from file' },
	openFolder: { id: 'app.server-hosting.content.open-folder', defaultMessage: 'Open folder' },
	remove: { id: 'app.server-hosting.content.remove', defaultMessage: 'Delete' },
	empty: { id: 'app.server-hosting.content.empty', defaultMessage: 'Nothing is installed yet' },
	emptyHint: {
		id: 'app.server-hosting.content.empty-hint',
		defaultMessage: 'Add files from your computer, they take effect after a restart.',
	},
	restartHint: {
		id: 'app.server-hosting.content.restart-hint',
		defaultMessage: 'Changes take effect after the server restarts.',
	},
})

const kind = computed(() => contentKind(props.server))
const queryKey = computed(() => ['server-hosting', 'plugins', props.server.id] as const)
const pluginsQuery = useQuery({
	queryKey,
	queryFn: () => hosting_plugins(props.server.id),
	refetchOnWindowFocus: false,
})
const plugins = computed(() => pluginsQuery.data.value ?? [])
const busy = ref<string | null>(null)

async function apply(key: string, task: () => Promise<HostedPlugin[]>) {
	if (busy.value) return
	busy.value = key
	try {
		queryClient.setQueryData(queryKey.value, await task())
	} catch (error) {
		handleError(error as Error)
		await pluginsQuery.refetch()
	} finally {
		busy.value = null
	}
}

async function importFiles() {
	const picked = await open({
		multiple: true,
		filters: [
			kind.value === 'datapacks'
				? { name: 'Datapack', extensions: ['zip'] }
				: { name: 'Java', extensions: ['jar'] },
		],
	})
	if (!picked) return
	const paths = Array.isArray(picked) ? picked : [picked]
	if (paths.length === 0) return
	await apply('import', () => hosting_plugin_import(props.server.id, paths))
}

function openFolder() {
	void openPath(`${props.server.dir}/${contentFolder(props.server)}`).catch(handleError)
}
</script>

<template>
	<section class="hosting-panel flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-contrast">
				<BoxIcon class="shrink-0" />
				{{ formatMessage(contentMessages[kind]) }}
				<span v-if="plugins.length > 0" class="text-secondary">{{ plugins.length }}</span>
			</h2>
			<div class="flex items-center gap-2">
				<Button type="outlined" @click="openFolder">
					<FolderOpenIcon />
					{{ formatMessage(messages.openFolder) }}
				</Button>
				<Button type="colored" color="brand" :loading="busy === 'import'" @click="importFiles">
					<UploadIcon />
					{{ formatMessage(messages.importButton) }}
				</Button>
			</div>
		</div>

		<EmptyState
			v-if="!pluginsQuery.isPending.value && plugins.length === 0"
			type="empty"
			:heading="formatMessage(messages.empty)"
			:description="formatMessage(messages.emptyHint)"
		/>
		<template v-else>
			<div class="flex flex-col gap-2">
				<div
					v-for="plugin in plugins"
					:key="plugin.name"
					class="hosting-item"
					:class="{ 'is-off': !plugin.enabled }"
				>
					<BoxIcon class="shrink-0 text-secondary" />
					<span class="min-w-0 flex-1 truncate font-semibold text-contrast">{{ plugin.name }}</span>
					<span class="shrink-0 text-sm text-secondary">{{ formatSize(plugin.size) }}</span>
					<Toggle
						:model-value="plugin.enabled"
						:disabled="busy !== null"
						@update:model-value="
							apply(`toggle:${plugin.name}`, () => hosting_plugin_toggle(server.id, plugin.name))
						"
					/>
					<Button
						v-tooltip="formatMessage(messages.remove)"
						size="sm"
						type="quiet"
						color="red"
						:disabled="busy !== null"
						:aria-label="formatMessage(messages.remove)"
						@click="
							apply(`remove:${plugin.name}`, () => hosting_plugin_remove(server.id, plugin.name))
						"
					>
						<TrashIcon />
					</Button>
				</div>
			</div>
			<span v-if="plugins.length > 0" class="text-sm text-secondary">
				{{ formatMessage(messages.restartHint) }}
			</span>
		</template>
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

.hosting-item {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.5rem 0.5rem 0.5rem 0.875rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
	transition: opacity 0.2s ease;

	&.is-off {
		opacity: 0.6;
	}
}
</style>
