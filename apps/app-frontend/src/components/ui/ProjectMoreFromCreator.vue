<template>
	<div v-if="creator && otherProjects.length > 0" class="flex flex-col gap-3">
		<h2 class="m-0 text-lg font-semibold">
			{{ formatMessage(messages.title, { name: creator.name }) }}
		</h2>
		<div class="flex flex-col gap-3">
			<router-link
				v-for="project in otherProjects"
				:key="project.id"
				:to="`/project/${project.slug ?? project.id}`"
				class="group flex w-full min-w-0 items-center gap-2 text-primary leading-[1.2]"
			>
				<Avatar :src="project.icon_url" :alt="project.name" size="32px" />
				<div class="flex min-w-0 flex-col">
					<span class="truncate font-medium group-hover:underline">{{ project.name }}</span>
					<span class="flex items-center gap-1 text-sm text-secondary">
						<DownloadIcon class="h-3.5 w-3.5 shrink-0" />
						{{ formatCompactNumber(project.downloads) }}
						<template v-if="project.project_types.includes('modpack')">
							<span aria-hidden="true">•</span>
							<PackageOpenIcon class="h-3.5 w-3.5 shrink-0" />
							{{ formatMessage(commonMessages.modpackLabel) }}
						</template>
					</span>
				</div>
			</router-link>
		</div>
		<router-link :to="creator.link" class="w-fit text-sm font-semibold text-brand hover:underline">
			{{ formatMessage(messages.viewAll, { count: totalCount }) }}
		</router-link>
	</div>
</template>

<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import { DownloadIcon, PackageOpenIcon } from '@modrinth/assets'
import { Avatar, commonMessages, defineMessages, useCompactNumber, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import { get_organization_projects, get_user_projects } from '@/helpers/users'

const props = defineProps<{
	projectId: string
	organization?: { id: string; slug: string; name: string } | null
	owner?: { id: string; username: string } | null
}>()

const { formatMessage } = useVIntl()
const { formatCompactNumber } = useCompactNumber()

const messages = defineMessages({
	title: {
		id: 'app.project.more-from-creator.title',
		defaultMessage: 'More from {name}',
	},
	viewAll: {
		id: 'app.project.more-from-creator.view-all',
		defaultMessage: 'View all projects ({count})',
	},
})

const MAX_SHOWN = 4

const creator = computed(() => {
	if (props.organization) {
		return {
			key: `organization:${props.organization.id}`,
			name: props.organization.name,
			link: `/organization/${encodeURIComponent(props.organization.slug)}`,
			load: () => get_organization_projects(props.organization!.id),
		}
	}
	if (props.owner) {
		return {
			key: `user:${props.owner.id}`,
			name: props.owner.username,
			link: `/user/${encodeURIComponent(props.owner.username)}`,
			load: () => get_user_projects(props.owner!.id),
		}
	}
	return null
})

const projects = ref<Labrinth.Projects.v3.Project[]>([])

const others = computed(() =>
	projects.value
		.filter((project) => project && project.id !== props.projectId)
		.sort((first, second) => second.downloads - first.downloads),
)
const otherProjects = computed(() => others.value.slice(0, MAX_SHOWN))
const totalCount = computed(() => others.value.length + 1)

watch(
	() => creator.value?.key,
	async (key) => {
		projects.value = []
		const current = creator.value
		if (!key || !current) return
		try {
			const list = await current.load()
			if (creator.value?.key === key) projects.value = list ?? []
		} catch (error) {
			// Optional extra block: keep the page quiet if it cannot be loaded.
			console.warn('Could not load other projects of the creator', error)
		}
	},
	{ immediate: true },
)
</script>
