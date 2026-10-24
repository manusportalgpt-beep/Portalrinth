<script setup lang="ts">
import { ExternalIcon } from '@modrinth/assets'

import { AutoLink, Avatar } from '../../base'

export type ProjectCardAuthorDetails = {
	name: string
	link?: string
	/** The author's picture. Absent, a placeholder is drawn in its place. */
	avatar?: string | null
	/** Whether the author is an organization, whose picture is square. */
	organization?: boolean
}

defineProps<{
	author: ProjectCardAuthorDetails
}>()
</script>

<template>
	<!-- author will try to be full width, but no longer than the proper fit. but this also allows it to truncate if necessary -->
	<!-- the weird padding and negative margin are to include the potential hover underline in bounding box which affects rendering on firefox -->
	<span
		class="line-clamp-1 break-all text-secondary font-normal max-w-fit w-full pb-[2px] mb-[-2px]"
	>
		by
		<AutoLink
			:to="author.link"
			:class="
				author.link
					? 'custom-focus-indicator text-inherit outline-none group focus-visible:text-[--color-focus-ring] smart-clickable:allow-pointer-events'
					: ''
			"
		>
			<Avatar
				:src="author.avatar"
				:alt="author.name"
				size="1.125rem"
				:circle="!author.organization"
				no-shadow
				loading="lazy"
				class="project-card-author-avatar mx-1 inline-block align-[-0.25em]"
			/>
			<span
				class="group-focus:underline group-focus:brightness-[--hover-brightness] group-hover:brightness-[--hover-brightness] group-hover:underline"
			>
				{{ author.name }}
			</span>
			<ExternalIcon v-if="author.link?.startsWith('http')" class="shrink-0 ml-1" />
		</AutoLink>
	</span>
</template>
