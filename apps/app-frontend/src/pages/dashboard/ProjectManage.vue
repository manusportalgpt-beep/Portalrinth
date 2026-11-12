<script setup lang="ts">
import {
	ArrowLeftIcon,
	BoxIcon,
	DownloadIcon,
	ExternalIcon,
	HeartIcon,
	ImageIcon,
	SaveIcon,
	SendIcon,
	SpinnerIcon,
	TrashIcon,
	UploadIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	Chips,
	ConfirmModal,
	injectNotificationManager,
	Input,
	Textarea,
	useCompactNumber,
	useRelativeTime,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import VersionUploadModal from '@/components/ui/modal/VersionUploadModal.vue'
import {
	type CreatorProject,
	type CreatorVersion,
	deleteProject,
	deleteVersion,
	editProject,
	getProject,
	getProjectVersions,
	projectUrl,
	setProjectIcon,
	submitForReview,
} from '@/helpers/modrinth-creator'

import { creatorMessages as messages, statusTone, useCreatorLabels } from './creator-messages'

const { formatMessage } = useVIntl()
const { formatCompactNumber } = useCompactNumber()
const formatRelativeTime = useRelativeTime()
const { handleError, addNotification } = injectNotificationManager()
const { typeLabel, statusLabel } = useCreatorLabels()
const route = useRoute()
const router = useRouter()

type Tab = 'general' | 'versions' | 'links'
const tabs: Tab[] = ['general', 'versions', 'links']
const tab = ref<Tab>('general')
const sides = ['required', 'optional', 'unsupported'] as const

const project = ref<CreatorProject | null>(null)
const versions = ref<CreatorVersion[]>([])
const saving = ref(false)
const submitting = ref(false)
const iconBusy = ref(false)
const iconInput = ref<HTMLInputElement>()
const form = reactive({
	title: '',
	description: '',
	body: '',
	client_side: 'required',
	server_side: 'optional',
	source_url: '',
	issues_url: '',
	wiki_url: '',
	discord_url: '',
})

function fill(value: CreatorProject) {
	form.title = value.title
	form.description = value.description
	form.body = value.body ?? ''
	form.client_side = value.client_side
	form.server_side = value.server_side
	form.source_url = value.source_url ?? ''
	form.issues_url = value.issues_url ?? ''
	form.wiki_url = value.wiki_url ?? ''
	form.discord_url = value.discord_url ?? ''
}

async function load() {
	const id = String(route.params.id)
	const [loaded, list] = await Promise.all([getProject(id), getProjectVersions(id).catch(() => [])])
	project.value = loaded
	versions.value = list
	fill(loaded)
}

try {
	await load()
} catch (error) {
	handleError(error as Error)
}

const dirty = computed(() => {
	const value = project.value
	if (!value) return false
	return (
		form.title !== value.title ||
		form.description !== value.description ||
		form.body !== (value.body ?? '') ||
		form.client_side !== value.client_side ||
		form.server_side !== value.server_side ||
		form.source_url !== (value.source_url ?? '') ||
		form.issues_url !== (value.issues_url ?? '') ||
		form.wiki_url !== (value.wiki_url ?? '') ||
		form.discord_url !== (value.discord_url ?? '')
	)
})

const canSubmit = computed(
	() =>
		!!project.value &&
		['draft', 'rejected'].includes(project.value.status) &&
		versions.value.length > 0,
)

function tabLabel(item: Tab) {
	if (item === 'versions') return formatMessage(messages.tabVersions)
	if (item === 'links') return formatMessage(messages.tabLinks)
	return formatMessage(messages.tabGeneral)
}

function sideLabel(item: string) {
	if (item === 'optional') return formatMessage(messages.sideOptional)
	if (item === 'unsupported') return formatMessage(messages.sideUnsupported)
	return formatMessage(messages.sideRequired)
}

function channelLabel(item: string) {
	if (item === 'beta') return formatMessage(messages.channelBeta)
	if (item === 'alpha') return formatMessage(messages.channelAlpha)
	return formatMessage(messages.channelRelease)
}

async function save() {
	if (!project.value || !dirty.value) return
	saving.value = true
	const url = (value: string) => value.trim() || null
	try {
		await editProject(project.value.id, {
			title: form.title.trim(),
			description: form.description.trim(),
			body: form.body,
			client_side: form.client_side,
			server_side: form.server_side,
			source_url: url(form.source_url),
			issues_url: url(form.issues_url),
			wiki_url: url(form.wiki_url),
			discord_url: url(form.discord_url),
		})
		project.value = await getProject(project.value.id)
		fill(project.value)
		addNotification({ title: formatMessage(messages.saved), type: 'success' })
	} catch (error) {
		handleError(error as Error)
	} finally {
		saving.value = false
	}
}

async function onIconPicked(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file || !project.value) return
	iconBusy.value = true
	try {
		await setProjectIcon(project.value.id, file)
		project.value = await getProject(project.value.id)
		addNotification({ title: formatMessage(messages.iconUpdated), type: 'success' })
	} catch (error) {
		handleError(error as Error)
	} finally {
		iconBusy.value = false
	}
}

async function submitReview() {
	if (!project.value) return
	submitting.value = true
	try {
		await submitForReview(project.value.id)
		project.value = await getProject(project.value.id)
		addNotification({
			title: formatMessage(messages.submitted),
			text: formatMessage(messages.submittedDetail),
			type: 'success',
		})
	} catch (error) {
		handleError(error as Error)
	} finally {
		submitting.value = false
	}
}

const deleteModal = ref<InstanceType<typeof ConfirmModal>>()
const deleteVersionModal = ref<InstanceType<typeof ConfirmModal>>()
const versionToDelete = ref<string | null>(null)
const uploadModal = ref<InstanceType<typeof VersionUploadModal>>()

async function removeProject() {
	if (!project.value) return
	try {
		await deleteProject(project.value.id)
		addNotification({ title: formatMessage(messages.deleted), type: 'success' })
		router.push('/dashboard/projects')
	} catch (error) {
		handleError(error as Error)
	}
}

function askDeleteVersion(id: string) {
	versionToDelete.value = id
	deleteVersionModal.value?.show()
}

async function removeVersion() {
	const id = versionToDelete.value
	if (!id) return
	try {
		await deleteVersion(id)
		versions.value = versions.value.filter((version) => version.id !== id)
		addNotification({ title: formatMessage(messages.versionDeleted), type: 'success' })
	} catch (error) {
		handleError(error as Error)
	} finally {
		versionToDelete.value = null
	}
}

function onUploaded(version: CreatorVersion) {
	versions.value = [version, ...versions.value]
	tab.value = 'versions'
}

function openOnSite() {
	if (project.value) openUrl(projectUrl(project.value))
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<Button class="w-fit" type="quiet" @click="router.push('/dashboard/projects')">
			<ArrowLeftIcon aria-hidden="true" />
			{{ formatMessage(messages.backToProjects) }}
		</Button>

		<div v-if="!project" class="empty-state">
			<BoxIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.loadFailed) }}</p>
		</div>

		<template v-else>
			<ConfirmModal
				ref="deleteModal"
				:title="formatMessage(messages.deleteProjectTitle)"
				:description="formatMessage(messages.deleteProjectBody)"
				:proceed-label="formatMessage(messages.deleteProject)"
				:has-to-type="true"
				:confirmation-text="project.title"
				@proceed="removeProject"
			/>
			<ConfirmModal
				ref="deleteVersionModal"
				:title="formatMessage(messages.deleteVersionTitle)"
				:description="formatMessage(messages.deleteVersionBody)"
				:proceed-label="formatMessage(messages.delete)"
				@proceed="removeVersion"
			/>
			<VersionUploadModal ref="uploadModal" :project="project" @uploaded="onUploaded" />

			<div class="creator-card project-head">
				<button
					class="icon-edit"
					:disabled="iconBusy"
					:title="formatMessage(messages.changeIcon)"
					@click="iconInput?.click()"
				>
					<Avatar :src="project.icon_url" size="5rem" :tint-by="project.id" />
					<span class="icon-edit__overlay">
						<SpinnerIcon v-if="iconBusy" class="animate-spin" aria-hidden="true" />
						<ImageIcon v-else aria-hidden="true" />
					</span>
				</button>
				<input
					ref="iconInput"
					type="file"
					class="hidden"
					accept="image/png,image/jpeg,image/webp,image/gif"
					@change="onIconPicked"
				/>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="m-0 truncate text-2xl font-extrabold text-contrast">{{ project.title }}</h2>
						<span class="status-pill" :class="statusTone(project.status)">
							{{ statusLabel(project.status) }}
						</span>
					</div>
					<span class="truncate text-secondary">{{ project.description }}</span>
					<div class="flex flex-wrap items-center gap-4 text-sm text-secondary">
						<span>{{ typeLabel(project.project_type) }}</span>
						<span class="inline-flex items-center gap-1">
							<DownloadIcon aria-hidden="true" class="h-4 w-4" />
							{{ formatCompactNumber(project.downloads) }}
						</span>
						<span class="inline-flex items-center gap-1">
							<HeartIcon aria-hidden="true" class="h-4 w-4" />
							{{ formatCompactNumber(project.followers) }}
						</span>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						v-if="canSubmit"
						type="colored"
						color="brand"
						:disabled="submitting"
						@click="submitReview"
					>
						<SpinnerIcon v-if="submitting" class="animate-spin" aria-hidden="true" />
						<SendIcon v-else aria-hidden="true" />
						{{ formatMessage(messages.submitReview) }}
					</Button>
					<Button @click="openOnSite">
						<ExternalIcon aria-hidden="true" />
						{{ formatMessage(messages.openOnSite) }}
					</Button>
				</div>
			</div>

			<div
				v-if="project.status === 'draft' || project.status === 'processing'"
				class="creator-note"
			>
				{{
					formatMessage(project.status === 'draft' ? messages.draftNote : messages.processingNote)
				}}
			</div>

			<Chips v-model="tab" :items="tabs" :format-label="tabLabel" :capitalize="false" />

			<div v-if="tab === 'general'" class="creator-card">
				<div class="field">
					<label for="pm-title" class="field-label">{{ formatMessage(messages.nameLabel) }}</label>
					<Input id="pm-title" v-model="form.title" :maxlength="64" />
				</div>
				<div class="field">
					<label for="pm-summary" class="field-label">{{
						formatMessage(messages.summaryLabel)
					}}</label>
					<span class="field-hint">{{ formatMessage(messages.summaryHint) }}</span>
					<Textarea id="pm-summary" v-model="form.description" :maxlength="256" />
				</div>
				<div class="field">
					<label for="pm-body" class="field-label">{{
						formatMessage(messages.descriptionLabel)
					}}</label>
					<span class="field-hint">{{ formatMessage(messages.descriptionHint) }}</span>
					<Textarea id="pm-body" v-model="form.body" class="body-editor" :maxlength="65536" />
				</div>
				<div class="field">
					<span class="field-label">{{ formatMessage(messages.environmentLabel) }}</span>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-2">
							<span class="text-sm font-semibold text-secondary">{{
								formatMessage(messages.clientSide)
							}}</span>
							<Chips
								v-model="form.client_side"
								:items="[...sides]"
								:format-label="sideLabel"
								:capitalize="false"
								size="small"
							/>
						</div>
						<div class="flex flex-col gap-2">
							<span class="text-sm font-semibold text-secondary">{{
								formatMessage(messages.serverSide)
							}}</span>
							<Chips
								v-model="form.server_side"
								:items="[...sides]"
								:format-label="sideLabel"
								:capitalize="false"
								size="small"
							/>
						</div>
					</div>
				</div>
			</div>

			<div v-else-if="tab === 'links'" class="creator-card">
				<span class="field-hint text-secondary">{{ formatMessage(messages.linksHint) }}</span>
				<div class="grid gap-4 md:grid-cols-2">
					<div class="field">
						<label for="pm-source" class="field-label">{{
							formatMessage(messages.sourceUrl)
						}}</label>
						<Input id="pm-source" v-model="form.source_url" placeholder="https://github.com/..." />
					</div>
					<div class="field">
						<label for="pm-issues" class="field-label">{{
							formatMessage(messages.issuesUrl)
						}}</label>
						<Input
							id="pm-issues"
							v-model="form.issues_url"
							placeholder="https://github.com/.../issues"
						/>
					</div>
					<div class="field">
						<label for="pm-wiki" class="field-label">{{ formatMessage(messages.wikiUrl) }}</label>
						<Input id="pm-wiki" v-model="form.wiki_url" placeholder="https://..." />
					</div>
					<div class="field">
						<label for="pm-discord" class="field-label">{{
							formatMessage(messages.discordUrl)
						}}</label>
						<Input
							id="pm-discord"
							v-model="form.discord_url"
							placeholder="https://discord.gg/..."
						/>
					</div>
				</div>
			</div>

			<template v-else>
				<div class="flex justify-end">
					<Button type="colored" color="brand" @click="uploadModal?.show($event)">
						<UploadIcon aria-hidden="true" />
						{{ formatMessage(messages.uploadVersion) }}
					</Button>
				</div>
				<div v-if="versions.length === 0" class="empty-state">
					<UploadIcon aria-hidden="true" />
					<p class="m-0 text-lg font-medium text-contrast">
						{{ formatMessage(messages.noVersions) }}
					</p>
					<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.noVersionsBody) }}</p>
				</div>
				<div v-else class="creator-card !gap-1 !p-2">
					<div v-for="version in versions" :key="version.id" class="version-row">
						<span class="channel" :class="version.version_type">
							{{ channelLabel(version.version_type).charAt(0) }}
						</span>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-semibold text-contrast">{{ version.name }}</span>
							<span class="truncate text-sm text-secondary">
								{{ version.version_number }} ·
								{{
									version.loaders.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')
								}}
								· {{ version.game_versions.slice(0, 4).join(', ')
								}}{{ version.game_versions.length > 4 ? '…' : '' }}
							</span>
						</span>
						<span class="hide-sm text-sm text-secondary">
							{{ formatRelativeTime(version.date_published) }}
						</span>
						<span
							class="hide-sm inline-flex items-center gap-1 text-sm font-semibold text-contrast"
						>
							<DownloadIcon aria-hidden="true" class="h-4 w-4" />
							{{ formatCompactNumber(version.downloads) }}
						</span>
						<Button
							type="quiet"
							:aria-label="formatMessage(messages.delete)"
							@click="askDeleteVersion(version.id)"
						>
							<TrashIcon aria-hidden="true" />
						</Button>
					</div>
				</div>
			</template>

			<div v-if="tab !== 'versions'" class="flex flex-wrap items-center justify-between gap-2">
				<Button type="colored" color="red" @click="deleteModal?.show()">
					<TrashIcon aria-hidden="true" />
					{{ formatMessage(messages.deleteProject) }}
				</Button>
				<Button type="colored" color="brand" :disabled="!dirty || saving" @click="save">
					<SpinnerIcon v-if="saving" class="animate-spin" aria-hidden="true" />
					<SaveIcon v-else aria-hidden="true" />
					{{ formatMessage(saving ? messages.saving : messages.save) }}
				</Button>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.project-head {
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
}

.icon-edit {
	position: relative;
	padding: 0;
	border: none;
	border-radius: var(--radius-lg);
	background: transparent;
	cursor: pointer;

	&__overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: inherit;
		background-color: rgb(0 0 0 / 45%);
		backdrop-filter: blur(2px);
		color: #fff;
		opacity: 0;
		transition: opacity 0.15s ease;

		svg {
			width: 1.5rem;
			height: 1.5rem;
		}
	}

	&:hover &__overlay,
	&:focus-visible &__overlay,
	&:disabled &__overlay {
		opacity: 1;
	}
}

.creator-note {
	padding: var(--gap-md) var(--gap-lg);
	border-radius: var(--radius-xl);
	border-left: 3px solid var(--color-orange);
	background-color: color-mix(in srgb, var(--color-orange) 10%, var(--color-bg-raised));
	color: var(--color-base);
	font-size: var(--font-size-sm);
}

.body-editor :deep(textarea) {
	min-height: 14rem;
	font-family: var(--mono-font, monospace);
	font-size: var(--font-size-sm);
}

.version-row {
	display: grid;
	grid-template-columns: 2rem minmax(0, 1fr) 8rem 5.5rem auto;
	align-items: center;
	gap: var(--gap-md);
	padding: 0.5rem 0.75rem;
	border-radius: var(--radius-lg);
	transition: background-color 0.15s ease;

	&:hover {
		background-color: var(--color-button-bg);
	}
}

.channel {
	display: grid;
	place-items: center;
	width: 2rem;
	height: 2rem;
	border-radius: var(--radius-md);
	font-weight: 800;
	color: var(--color-green);
	background-color: color-mix(in srgb, var(--color-green) 15%, transparent);

	&.beta {
		color: var(--color-orange);
		background-color: color-mix(in srgb, var(--color-orange) 15%, transparent);
	}

	&.alpha {
		color: var(--color-red);
		background-color: color-mix(in srgb, var(--color-red) 15%, transparent);
	}
}

@media (max-width: 760px) {
	.version-row {
		grid-template-columns: 2rem minmax(0, 1fr) auto;
	}

	.hide-sm {
		display: none;
	}
}
</style>
