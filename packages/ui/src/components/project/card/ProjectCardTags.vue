<script setup lang="ts">
import { PackageOpenIcon } from '@modrinth/assets'
import { computed } from 'vue'

import { useVIntl } from '../../../composables'
import { commonMessages, getTagMessage, sortTagsForDisplay } from '../../../utils'
import { TagItem, TagTagItem } from '../../base'
import TagsOverflow from '../TagsOverflow.vue'

function isLoader(tag: string) {
	return getTagMessage(tag, 'loader') !== undefined
}

function uniqueSorted(tags?: string[]) {
	return tags ? sortTagsForDisplay([...new Set(tags)]) : undefined
}

const props = withDefaults(
	defineProps<{
		tags: string[]
		extraTags?: string[]
		deprioritizedTags?: string[]
		excludeLoaders?: boolean
		maxTags?: number
		/** Whether the project is a modpack, said with a chip of its own first. */
		modpack?: boolean
	}>(),
	{
		maxTags: 5,
		excludeLoaders: false,
		modpack: false,
		extraTags: () => [],
		deprioritizedTags: () => [],
	},
)

const { formatMessage } = useVIntl()

const sortedTags = computed(() => uniqueSorted(props.tags))
const sortedExtraTags = computed(() => uniqueSorted(props.extraTags))
const filteredTags = computed(() => {
	if (!sortedTags.value) {
		return undefined
	}
	return sortedTags.value.filter(
		(tag) => !props.deprioritizedTags.includes(tag) && (!props.excludeLoaders || !isLoader(tag)),
	)
})

/**
 * How many categories a card shows by name. The rest are behind the "+N" chip,
 * so a project with many categories says so instead of filling the row.
 */
const MAX_CATEGORY_TAGS = 2

const visibleTags = computed(() => {
	if (!filteredTags.value) return undefined
	let categories = 0
	return filteredTags.value
		.filter((tag) => isLoader(tag) || ++categories <= MAX_CATEGORY_TAGS)
		.slice(0, props.maxTags)
})
const overflowTags = computed(() => [
	...new Set([
		...(props.tags.filter((x) => !visibleTags.value?.includes(x)) ?? []),
		...(sortedExtraTags.value?.filter((x) => !visibleTags.value?.includes(x)) ?? []),
	]),
])
</script>

<template>
	<TagItem v-if="modpack">
		<PackageOpenIcon />
		{{ formatMessage(commonMessages.modpackLabel) }}
	</TagItem>
	<TagTagItem v-for="tag in visibleTags" :key="'visible-tag-' + tag" :tag="tag" />
	<TagsOverflow
		v-if="overflowTags.length > 0"
		:tags="overflowTags"
		class="smart-clickable:allow-pointer-events"
	/>
</template>
