<template>
	<NewModal ref="modal" :header="formatMessage(messages.versionHeader)">
		<div class="flex w-[40rem] max-w-full flex-col gap-4">
			<div class="flex flex-col gap-2">
				<span class="flex flex-col gap-1">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.filesLabel) }}
						<span class="text-brand-red">*</span>
					</span>
					<span>{{ formatMessage(messages.filesHint) }}</span>
				</span>
				<div
					class="drop-zone"
					:class="{ active: dragging }"
					@dragover.prevent="dragging = true"
					@dragleave.prevent="dragging = false"
					@drop.prevent="onDrop"
				>
					<div v-if="files.length" class="flex w-full flex-col gap-1">
						<div v-for="(file, index) in files" :key="file.name + index" class="file-row">
							<FileIcon aria-hidden="true" class="shrink-0" />
							<span class="min-w-0 flex-1 truncate text-contrast">{{ file.name }}</span>
							<span v-if="index === 0" class="primary-tag">{{
								formatMessage(messages.primaryFile)
							}}</span>
							<span class="shrink-0 text-sm text-secondary">{{ formatSize(file.size) }}</span>
							<button
								class="icon-btn"
								:aria-label="formatMessage(messages.delete)"
								@click="removeFile(index)"
							>
								<XIcon aria-hidden="true" />
							</button>
						</div>
					</div>
					<Button @click="fileInput?.click()">
						<UploadIcon aria-hidden="true" />
						{{ formatMessage(messages.chooseFiles) }}
					</Button>
					<input
						ref="fileInput"
						type="file"
						class="hidden"
						multiple
						accept=".jar,.zip,.mrpack,.litemod"
						@change="onPicked"
					/>
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<label for="vu-name" class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.versionName) }}
					</label>
					<Input
						id="vu-name"
						v-model="name"
						:maxlength="64"
						:placeholder="versionNumber || '1.0.0'"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label for="vu-number" class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.versionNumber) }}
						<span class="text-brand-red">*</span>
					</label>
					<Input id="vu-number" v-model="versionNumber" :maxlength="32" placeholder="1.0.0" />
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.channelLabel) }}
				</span>
				<Chips
					v-model="channel"
					:items="channels"
					:format-label="channelLabel"
					:capitalize="false"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<span class="flex items-center justify-between gap-2">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.loadersLabel) }}
						<span class="text-brand-red">*</span>
					</span>
					<span class="text-sm text-secondary">
						{{ formatMessage(messages.selectedCount, { count: loaders.length }) }}
					</span>
				</span>
				<div class="tag-cloud">
					<button
						v-for="loader in availableLoaders"
						:key="loader.name"
						class="tag"
						:class="{ selected: loaders.includes(loader.name) }"
						@click="toggle(loaders, loader.name)"
					>
						<!-- eslint-disable-next-line vue/no-v-html -->
						<span v-if="loader.icon" class="tag-icon" v-html="loader.icon" />
						{{ loaderName(loader.name) }}
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="flex items-center justify-between gap-2">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.gameVersionsLabel) }}
						<span class="text-brand-red">*</span>
					</span>
					<Checkbox v-model="showSnapshots" :label="formatMessage(messages.showSnapshots)" />
				</span>
				<Input
					v-model="versionQuery"
					:icon="SearchIcon"
					clearable
					:placeholder="formatMessage(messages.searchVersions)"
				/>
				<div class="tag-cloud tag-cloud--scroll">
					<button
						v-for="version in visibleGameVersions"
						:key="version.version"
						class="tag"
						:class="{ selected: gameVersions.includes(version.version) }"
						@click="toggle(gameVersions, version.version)"
					>
						{{ version.version }}
					</button>
				</div>
				<span class="text-sm text-secondary">
					{{ formatMessage(messages.selectedCount, { count: gameVersions.length }) }}
					<template v-if="gameVersions.length"
						>· {{ gameVersions.slice(0, 6).join(', ') }}</template
					>
				</span>
			</div>

			<div class="flex flex-col gap-2">
				<label for="vu-changelog" class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.changelogLabel) }}
				</label>
				<Textarea
					id="vu-changelog"
					v-model="changelog"
					:placeholder="formatMessage(messages.changelogPlaceholder)"
				/>
			</div>

			<Checkbox v-model="featured" :label="formatMessage(messages.featuredLabel)" />

			<div class="flex justify-end gap-2">
				<Button type="outlined" @click="hide">
					<XIcon aria-hidden="true" />
					{{ formatMessage(messages.cancel) }}
				</Button>
				<Button :disabled="submitting || !valid" type="colored" color="brand" @click="submit">
					<SpinnerIcon v-if="submitting" class="animate-spin" aria-hidden="true" />
					<UploadIcon v-else aria-hidden="true" />
					{{ formatMessage(submitting ? messages.uploading : messages.upload) }}
				</Button>
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { FileIcon, SearchIcon, SpinnerIcon, UploadIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	Checkbox,
	Chips,
	injectNotificationManager,
	Input,
	NewModal,
	Textarea,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import {
	createVersion,
	type CreatorProject,
	type CreatorVersion,
	type GameVersionTag,
	getGameVersions,
	getLoaders,
	type LoaderTag,
} from '@/helpers/modrinth-creator'
import { creatorMessages as messages } from '@/pages/dashboard/creator-messages'

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const props = defineProps<{ project: CreatorProject }>()
const emit = defineEmits<{ uploaded: [CreatorVersion] }>()

const channels = ['release', 'beta', 'alpha'] as const
type Channel = (typeof channels)[number]

const modal = ref<InstanceType<typeof NewModal>>()
const fileInput = ref<HTMLInputElement>()
const files = ref<File[]>([])
const dragging = ref(false)
const name = ref('')
const versionNumber = ref('')
const channel = ref<Channel>('release')
const loaders = ref<string[]>([])
const gameVersions = ref<string[]>([])
const changelog = ref('')
const featured = ref(true)
const showSnapshots = ref(false)
const versionQuery = ref('')
const submitting = ref(false)
const allLoaders = ref<LoaderTag[]>([])
const allGameVersions = ref<GameVersionTag[]>([])

const LOADER_TYPES: Record<string, string[]> = {
	mod: ['mod'],
	modpack: ['modpack'],
	resourcepack: ['resourcepack'],
	shader: ['shader'],
	datapack: ['datapack', 'mod'],
	plugin: ['plugin'],
}

const availableLoaders = computed(() => {
	const wanted = LOADER_TYPES[props.project.project_type] ?? ['mod']
	const list = allLoaders.value.filter((loader) =>
		loader.supported_project_types.some((type) => wanted.includes(type)),
	)
	return list.length ? list : allLoaders.value
})

const visibleGameVersions = computed(() => {
	const needle = versionQuery.value.trim().toLowerCase()
	return allGameVersions.value.filter(
		(version) =>
			(showSnapshots.value || version.version_type === 'release') &&
			(!needle || version.version.toLowerCase().includes(needle)),
	)
})

const valid = computed(
	() =>
		files.value.length > 0 &&
		versionNumber.value.trim().length > 0 &&
		loaders.value.length > 0 &&
		gameVersions.value.length > 0,
)

function channelLabel(item: Channel) {
	if (item === 'beta') return formatMessage(messages.channelBeta)
	if (item === 'alpha') return formatMessage(messages.channelAlpha)
	return formatMessage(messages.channelRelease)
}

function loaderName(name: string) {
	return name
		.split(/[-_]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toggle(list: string[], value: string) {
	const index = list.indexOf(value)
	if (index === -1) list.push(value)
	else list.splice(index, 1)
}

function addFiles(list: FileList | null | undefined) {
	if (!list) return
	for (const file of Array.from(list)) {
		if (!files.value.some((existing) => existing.name === file.name)) files.value.push(file)
	}
	const primary = files.value[0]
	if (primary && !versionNumber.value) {
		const match = primary.name.match(
			/(\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?)(?=\.(?:jar|zip|mrpack)$)/i,
		)
		if (match) versionNumber.value = match[1]
	}
}

function onPicked(event: Event) {
	const input = event.target as HTMLInputElement
	addFiles(input.files)
	input.value = ''
}

function onDrop(event: DragEvent) {
	dragging.value = false
	addFiles(event.dataTransfer?.files)
}

function removeFile(index: number) {
	files.value.splice(index, 1)
}

async function show(event?: MouseEvent) {
	files.value = []
	name.value = ''
	versionNumber.value = ''
	channel.value = 'release'
	loaders.value = []
	gameVersions.value = []
	changelog.value = ''
	featured.value = true
	versionQuery.value = ''
	submitting.value = false
	modal.value?.show(event)
	try {
		const [loaderTags, versionTags] = await Promise.all([getLoaders(), getGameVersions()])
		allLoaders.value = loaderTags
		allGameVersions.value = versionTags
	} catch (error) {
		handleError(error as Error)
	}
}

function hide() {
	modal.value?.hide()
}

async function submit() {
	if (!valid.value) return
	submitting.value = true
	try {
		const version = await createVersion({
			project_id: props.project.id,
			name: name.value.trim() || versionNumber.value.trim(),
			version_number: versionNumber.value.trim(),
			changelog: changelog.value,
			version_type: channel.value,
			game_versions: gameVersions.value,
			loaders: loaders.value,
			featured: featured.value,
			files: files.value,
		})
		emit('uploaded', version)
		addNotification({
			title: formatMessage(messages.uploaded),
			text: version.name,
			type: 'success',
		})
		hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		submitting.value = false
	}
}

defineExpose({ show, hide })
</script>

<style scoped lang="scss">
.drop-zone {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--gap-sm);
	padding: var(--gap-md);
	border: 2px dashed var(--color-button-bg);
	border-radius: var(--radius-lg);
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease;

	&.active {
		border-color: var(--color-brand);
		background-color: var(--color-brand-highlight);
	}
}

.file-row {
	display: flex;
	align-items: center;
	gap: var(--gap-sm);
	padding: 0.4rem 0.6rem;
	border-radius: var(--radius-md);
	background-color: var(--color-button-bg);

	svg {
		width: 1rem;
		height: 1rem;
	}
}

.primary-tag {
	padding: 0.05rem 0.45rem;
	border-radius: 999px;
	font-size: var(--font-size-xs, 0.75rem);
	font-weight: 700;
	color: var(--color-brand);
	background-color: var(--color-brand-highlight);
}

.icon-btn {
	display: grid;
	place-items: center;
	padding: 0.2rem;
	border: none;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;

	&:hover {
		color: var(--color-red);
	}
}

.tag-cloud {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;

	&--scroll {
		max-height: 9.5rem;
		overflow-y: auto;
		padding-right: 0.25rem;
	}
}

.tag {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.3rem 0.7rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background-color: var(--color-button-bg);
	color: var(--color-base);
	font: inherit;
	font-size: var(--font-size-sm);
	font-weight: 600;
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		color 0.15s ease,
		border-color 0.15s ease;

	&:hover {
		color: var(--color-contrast);
	}

	&.selected {
		color: var(--color-brand);
		border-color: var(--color-brand);
		background-color: var(--color-brand-highlight);
	}
}

.tag-icon {
	display: inline-flex;
	width: 1rem;
	height: 1rem;

	:deep(svg) {
		width: 100%;
		height: 100%;
	}
}
</style>
