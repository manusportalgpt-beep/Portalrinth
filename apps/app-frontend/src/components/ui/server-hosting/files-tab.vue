<script setup lang="ts">
import {
	CheckIcon,
	ChevronRightIcon,
	FileIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderUpIcon,
	RefreshCwIcon,
	TrashIcon,
	UploadIcon,
} from '@modrinth/assets'
import { Button, defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, ref, watch } from 'vue'

import {
	type HostedFile,
	type HostedServerView,
	hosting_file_delete,
	hosting_file_import,
	hosting_files,
} from '@/helpers/hosting'
import { openPath } from '@/helpers/utils.js'

import { formatSize } from './content-kind'

const props = defineProps<{ server: HostedServerView }>()

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const messages = defineMessages({
	root: { id: 'app.server-hosting.files.root', defaultMessage: 'Server' },
	up: { id: 'app.server-hosting.files.up', defaultMessage: 'Up a level' },
	refresh: { id: 'app.server-hosting.files.refresh', defaultMessage: 'Refresh' },
	upload: { id: 'app.server-hosting.files.upload', defaultMessage: 'Upload files' },
	openFolder: { id: 'app.server-hosting.files.open-folder', defaultMessage: 'Open folder' },
	remove: { id: 'app.server-hosting.files.remove', defaultMessage: 'Delete' },
	confirmRemove: {
		id: 'app.server-hosting.files.confirm-remove',
		defaultMessage: 'Delete for good',
	},
	empty: { id: 'app.server-hosting.files.empty', defaultMessage: 'This folder is empty' },
})

const path = ref<string[]>([])
const relative = computed(() => path.value.join('/'))

watch(
	() => props.server.id,
	() => {
		path.value = []
	},
)

const filesQuery = useQuery({
	queryKey: computed(() => ['server-hosting', 'files', props.server.id, relative.value] as const),
	queryFn: () => hosting_files(props.server.id, relative.value),
	refetchOnWindowFocus: false,
	retry: false,
})
const files = computed(() => filesQuery.data.value ?? [])
const busy = ref(false)
const confirming = ref<string | null>(null)

function enter(file: HostedFile) {
	if (!file.dir) return
	confirming.value = null
	path.value = [...path.value, file.name]
}

function goTo(depth: number) {
	confirming.value = null
	path.value = path.value.slice(0, depth)
}

async function remove(file: HostedFile) {
	if (confirming.value !== file.name) {
		confirming.value = file.name
		return
	}
	confirming.value = null
	busy.value = true
	try {
		await hosting_file_delete(props.server.id, [...path.value, file.name].join('/'))
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
		await filesQuery.refetch()
	}
}

async function upload() {
	const picked = await open({ multiple: true })
	if (!picked) return
	const paths = Array.isArray(picked) ? picked : [picked]
	if (paths.length === 0) return
	busy.value = true
	try {
		await hosting_file_import(props.server.id, relative.value, paths)
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
		await filesQuery.refetch()
	}
}

function openFolder() {
	const target = relative.value ? `${props.server.dir}/${relative.value}` : props.server.dir
	void openPath(target).catch(handleError)
}
</script>

<template>
	<section class="hosting-panel flex flex-col gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<nav class="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
				<button type="button" class="hosting-crumb" @click="goTo(0)">
					{{ formatMessage(messages.root) }}
				</button>
				<template v-for="(segment, index) in path" :key="`${index}:${segment}`">
					<ChevronRightIcon class="shrink-0 text-secondary" />
					<button type="button" class="hosting-crumb" @click="goTo(index + 1)">
						{{ segment }}
					</button>
				</template>
			</nav>
			<Button
				v-tooltip="formatMessage(messages.up)"
				type="outlined"
				:disabled="path.length === 0"
				:aria-label="formatMessage(messages.up)"
				@click="goTo(path.length - 1)"
			>
				<FolderUpIcon />
			</Button>
			<Button
				v-tooltip="formatMessage(messages.refresh)"
				type="outlined"
				:aria-label="formatMessage(messages.refresh)"
				@click="filesQuery.refetch()"
			>
				<RefreshCwIcon :class="{ 'animate-spin': filesQuery.isFetching.value }" />
			</Button>
			<Button type="outlined" @click="openFolder">
				<FolderOpenIcon />
				{{ formatMessage(messages.openFolder) }}
			</Button>
			<Button type="colored" color="brand" :loading="busy" @click="upload">
				<UploadIcon />
				{{ formatMessage(messages.upload) }}
			</Button>
		</div>

		<span v-if="filesQuery.isError.value" class="text-sm text-brand-red">
			{{ filesQuery.error.value?.message }}
		</span>
		<span
			v-else-if="!filesQuery.isPending.value && files.length === 0"
			class="hosting-files-empty text-sm text-secondary"
		>
			{{ formatMessage(messages.empty) }}
		</span>
		<div v-else class="hosting-files">
			<div
				v-for="file in files"
				:key="file.name"
				class="hosting-file"
				:class="{ 'is-dir': file.dir }"
				@click="enter(file)"
			>
				<FolderIcon v-if="file.dir" class="shrink-0 text-brand" />
				<FileIcon v-else class="shrink-0 text-secondary" />
				<span class="min-w-0 flex-1 truncate text-contrast">{{ file.name }}</span>
				<span v-if="!file.dir" class="shrink-0 text-xs text-secondary">{{
					formatSize(file.size)
				}}</span>
				<Button
					v-tooltip="
						formatMessage(confirming === file.name ? messages.confirmRemove : messages.remove)
					"
					size="sm"
					:type="confirming === file.name ? 'colored' : 'quiet'"
					color="red"
					:disabled="busy"
					:aria-label="
						formatMessage(confirming === file.name ? messages.confirmRemove : messages.remove)
					"
					@click.stop="remove(file)"
				>
					<CheckIcon v-if="confirming === file.name" />
					<TrashIcon v-else />
				</Button>
			</div>
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

.hosting-crumb {
	max-width: 12rem;
	overflow: hidden;
	padding: 0.125rem 0.375rem;
	border: none;
	border-radius: 0.375rem;
	background: transparent;
	color: var(--color-secondary);
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
	cursor: pointer;

	&:hover,
	&:last-of-type {
		color: var(--color-contrast);
	}

	&:hover {
		background: var(--surface-5);
	}
}

.hosting-files {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
}

.hosting-files-empty {
	padding: 1.5rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px dashed var(--surface-5);
	text-align: center;
}

.hosting-file {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	min-height: 2.5rem;
	padding: 0.25rem 0.5rem 0.25rem 0.875rem;
	font-size: 0.875rem;

	& + & {
		border-top: 1px solid var(--surface-5);
	}

	&.is-dir {
		cursor: pointer;

		&:hover {
			background: var(--surface-4);
		}
	}
}
</style>
