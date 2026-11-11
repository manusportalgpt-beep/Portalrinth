<template>
	<PageHeader
		:title="project.title"
		:summary="project.description"
		@contextmenu="emit('contextmenu', $event)"
	>
		<template #leading>
			<div class="relative flex shrink-0 items-center">
				<Avatar
					:src="project.icon_url"
					:raw-src="project.raw_icon_url"
					:alt="project.title"
					:tint-by="project.id"
					size="96px"
				/>
				<!-- Where the project comes from: Modrinth's own green for its
                                     projects, CurseForge's orange for the ones imported from
                                     there. Sits on the avatar, left of the title. -->
				<span
					v-tooltip="source.label"
					class="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-solid border-surface-5 bg-surface-2 p-1"
					:aria-label="source.label"
				>
					<component :is="source.icon" class="size-full" :class="source.iconClass" />
				</span>
			</div>
		</template>

		<template v-if="showStatusBadge" #badges>
			<ProjectStatusBadge :status="projectV3.status" />
		</template>

		<template #metadata>
			<PageHeaderMetadata>
				<template v-if="projectV3?.minecraft_server != null">
					<ServerDetails
						v-if="projectV3?.status !== 'draft'"
						:online-players="projectV3?.minecraft_java_server?.ping?.data?.players_online ?? 0"
						:status-online="!!projectV3?.minecraft_java_server?.ping?.data"
						:recent-plays="projectV3?.minecraft_java_server?.verified_plays_2w ?? 0"
					/>
				</template>
				<template v-else>
					<PageHeaderMetadataNumberItem
						:icon="DownloadIcon"
						:value="project.downloads"
						:label="formatMessage(messages.downloadsStat, { count: project.downloads })"
						:tooltip="formatNumber(project.downloads)"
					/>
					<!-- Noctrinth's own: left out for a project whose source counts no
                                             followers (CurseForge's likes are not the same thing). -->
					<PageHeaderMetadataNumberItem
						v-if="project.followers !== undefined"
						:icon="HeartIcon"
						:value="project.followers"
						:label="formatMessage(messages.followersStat, { count: project.followers })"
						:tooltip="formatNumber(project.followers)"
					/>
				</template>
				<PageHeaderMetadataTagsItem v-if="project.categories.length > 0" class="hidden md:flex">
					<TagItem
						v-for="category in project.categories"
						:key="category"
						:action="() => emit('category', category)"
					>
						<img
							v-if="categoryIcons?.[category]"
							:src="categoryIcons[category]"
							alt=""
							loading="lazy"
							class="h-4 w-4 rounded-sm object-contain"
						/>
						<component :is="getTagIcon(category)" v-else-if="getTagIcon(category)" />
						<FormattedTag :tag="category" />
					</TagItem>
				</PageHeaderMetadataTagsItem>
			</PageHeaderMetadata>
		</template>

		<template #actions>
			<PageHeaderActions>
				<slot name="actions" />
			</PageHeaderActions>
		</template>
	</PageHeader>
</template>

<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import {
	type Component,
	CurseForgeIcon,
	DownloadIcon,
	getTagIcon,
	HeartIcon,
	ModrinthBrandIcon,
} from '@modrinth/assets'
import { computed } from 'vue'

import { defineMessages, useFormatNumber, useVIntl } from '../../composables'
import Avatar from '../base/Avatar.vue'
import FormattedTag from '../base/FormattedTag.vue'
import PageHeader from '../base/page-header/index.vue'
import PageHeaderMetadata from '../base/page-header/metadata/index.vue'
import PageHeaderMetadataNumberItem from '../base/page-header/metadata/page-header-metadata-number-item.vue'
import PageHeaderMetadataTagsItem from '../base/page-header/metadata/page-header-metadata-tags-item.vue'
import PageHeaderActions from '../base/page-header/page-header-actions.vue'
import TagItem from '../base/TagItem.vue'
import ProjectStatusBadge from './ProjectStatusBadge.vue'
import ServerDetails from './server/ServerDetails.vue'

type HeaderProject = Pick<
	Labrinth.Projects.v2.Project,
	'id' | 'title' | 'description' | 'status' | 'downloads' | 'followers' | 'categories'
> & {
	icon_url?: string | null
	raw_icon_url?: string | null
}

type HeaderProjectV3 = Pick<
	Labrinth.Projects.v3.Project,
	'status' | 'minecraft_server' | 'minecraft_java_server'
>

const props = withDefaults(
	defineProps<{
		project: HeaderProject
		projectV3?: HeaderProjectV3 | null
		showStatusBadge?: boolean
		/** Category name to a picture of its own: CurseForge's categories
                    bring real icons from their API, Modrinth's names fall back to
                    the tag-icon catalogue. */
		categoryIcons?: Record<string, string>
	}>(),
	{
		projectV3: null,
		showStatusBadge: false,
		categoryIcons: undefined,
	},
)

const emit = defineEmits<{
	category: [category: string]
	contextmenu: [event: MouseEvent]
}>()

const messages = defineMessages({
	downloadsStat: {
		id: 'project.stats.downloads-label',
		defaultMessage: '{count, plural, one {download} other {downloads}}',
	},
	followersStat: {
		id: 'project.stats.followers-label',
		defaultMessage: '{count, plural, one {follower} other {followers}}',
	},
})

const { formatMessage } = useVIntl()
const formatNumber = useFormatNumber()

/** CurseForge projects are minted with a `cf-` id prefix by the backend; a
    Modrinth project never has it. The badge tells them apart at a glance. */
const source = computed(() => {
	if (props.project.id?.startsWith('cf-')) {
		return { icon: CurseForgeIcon as Component, label: 'CurseForge', iconClass: '' }
	}
	return {
		icon: ModrinthBrandIcon as Component,
		label: 'Modrinth',
		iconClass: 'text-[#00af54] dark:text-[#1bd96a]',
	}
})
</script>
