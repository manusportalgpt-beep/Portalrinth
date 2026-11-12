<script setup lang="ts">
import {
	BoxIcon,
	DownloadIcon,
	HeartIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	injectNotificationManager,
	Input,
	useCompactNumber,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import ProjectCreateModal from '@/components/ui/modal/ProjectCreateModal.vue'
import { type CreatorProject, getMyProjects } from '@/helpers/modrinth-creator'
import { get as getCreds } from '@/helpers/mr_auth.ts'

import { creatorMessages as messages, statusTone, useCreatorLabels } from './creator-messages'

const { formatMessage } = useVIntl()
const { formatCompactNumber } = useCompactNumber()
const { handleError } = injectNotificationManager()
const { typeLabel, statusLabel } = useCreatorLabels()
const router = useRouter()

const signedIn = ref(true)
const projects = ref<CreatorProject[]>([])
const query = ref('')

try {
	if (!(await getCreds())) signedIn.value = false
	else projects.value = await getMyProjects()
} catch (error) {
	handleError(error as Error)
}

const filtered = computed(() => {
	const needle = query.value.trim().toLowerCase()
	return [...projects.value]
		.filter(
			(project) =>
				!needle ||
				project.title.toLowerCase().includes(needle) ||
				project.slug.toLowerCase().includes(needle),
		)
		.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
})

const totals = computed(() => ({
	downloads: projects.value.reduce((sum, project) => sum + project.downloads, 0),
	followers: projects.value.reduce((sum, project) => sum + project.followers, 0),
}))

const createModal = ref<InstanceType<typeof ProjectCreateModal>>()

function onCreated(project: CreatorProject) {
	projects.value = [project, ...projects.value]
	router.push(`/dashboard/projects/${project.id}`)
}

function manage(project: CreatorProject) {
	router.push(`/dashboard/projects/${project.id}`)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<ProjectCreateModal ref="createModal" @created="onCreated" />

		<div v-if="!signedIn" class="empty-state">
			<BoxIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.signIn) }}</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.signInBody) }}</p>
		</div>

		<template v-else>
			<div class="creator-stats">
				<div class="creator-stat">
					<span class="label"
						><BoxIcon aria-hidden="true" />{{ formatMessage(messages.totalProjects) }}</span
					>
					<span class="value">{{ projects.length }}</span>
				</div>
				<div class="creator-stat">
					<span class="label">
						<DownloadIcon aria-hidden="true" />{{ formatMessage(messages.totalDownloads) }}
					</span>
					<span class="value">{{ formatCompactNumber(totals.downloads) }}</span>
				</div>
				<div class="creator-stat">
					<span class="label">
						<HeartIcon aria-hidden="true" />{{ formatMessage(messages.totalFollowers) }}
					</span>
					<span class="value">{{ formatCompactNumber(totals.followers) }}</span>
				</div>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<Input
					v-model="query"
					:icon="SearchIcon"
					type="text"
					clearable
					:placeholder="formatMessage(messages.searchProjects)"
					wrapper-class="w-full sm:flex-1"
					input-class="!h-10"
				/>
				<Button type="colored" color="brand" @click="createModal?.show($event)">
					<PlusIcon aria-hidden="true" />
					{{ formatMessage(messages.createProject) }}
				</Button>
			</div>

			<div v-if="filtered.length === 0" class="empty-state">
				<BoxIcon aria-hidden="true" />
				<p class="m-0 text-lg font-medium text-contrast">
					{{ formatMessage(query ? messages.noMatch : messages.noProjects) }}
				</p>
				<p v-if="!query" class="m-0 text-sm text-secondary">
					{{ formatMessage(messages.noProjectsBody) }}
				</p>
			</div>

			<div v-else class="creator-card !gap-0 !p-2">
				<div class="project-row project-row--head">
					<span />
					<span>{{ formatMessage(messages.columnName) }}</span>
					<span class="hide-sm">{{ formatMessage(messages.columnType) }}</span>
					<span>{{ formatMessage(messages.columnStatus) }}</span>
					<span class="hide-sm text-right">{{ formatMessage(messages.columnDownloads) }}</span>
					<span />
				</div>
				<button
					v-for="project in filtered"
					:key="project.id"
					class="project-row"
					@click="manage(project)"
				>
					<Avatar :src="project.icon_url" size="2.75rem" :tint-by="project.id" />
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-semibold text-contrast">{{ project.title }}</span>
						<span class="truncate text-sm text-secondary">{{ project.description }}</span>
					</span>
					<span class="hide-sm truncate text-secondary">{{ typeLabel(project.project_type) }}</span>
					<span class="status-pill" :class="statusTone(project.status)">
						{{ statusLabel(project.status) }}
					</span>
					<span class="hide-sm text-right font-semibold tabular-nums text-contrast">
						{{ formatCompactNumber(project.downloads) }}
					</span>
					<span class="row-action" :title="formatMessage(messages.manage)">
						<SettingsIcon aria-hidden="true" />
					</span>
				</button>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.project-row {
	display: grid;
	grid-template-columns: 2.75rem minmax(0, 1fr) 8rem 8.5rem 6rem 2rem;
	align-items: center;
	gap: var(--gap-md);
	padding: 0.6rem 0.75rem;
	border: none;
	border-radius: var(--radius-lg);
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 0.15s ease;

	&:hover,
	&:focus-visible {
		background-color: var(--color-button-bg);

		.row-action {
			color: var(--color-contrast);
		}
	}

	&--head {
		cursor: default;
		padding-block: 0.5rem;
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-secondary);

		&:hover {
			background: transparent;
		}
	}
}

.row-action {
	display: grid;
	place-items: center;
	color: var(--color-secondary);
	transition: color 0.15s ease;

	svg {
		width: 1.15rem;
		height: 1.15rem;
	}
}

@media (max-width: 760px) {
	.project-row {
		grid-template-columns: 2.75rem minmax(0, 1fr) 8.5rem 2rem;
	}

	.hide-sm {
		display: none;
	}
}
</style>
