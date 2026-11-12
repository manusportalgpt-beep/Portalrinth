<template>
	<TagItem :action="action" :style="isLoader ? `--_color: var(--color-platform-${tag})` : ''">
		<img
			v-if="iconUrl"
			:src="iconUrl"
			alt=""
			loading="lazy"
			class="h-4 w-4 shrink-0 rounded-sm object-contain"
		/>
		<component :is="icon" v-else-if="icon" />
		<FormattedTag :tag="tag" />
	</TagItem>
</template>
<script setup lang="ts">
import { getTagIcon } from '@modrinth/assets'
import { computed } from 'vue'

import { getTagIconUrl, getTagMessage } from '../../utils'
import FormattedTag from './FormattedTag.vue'
import TagItem from './TagItem.vue'

const props = withDefaults(
	defineProps<{
		tag: string
		hideNonLoaderIcon?: boolean
		action?: (event: MouseEvent) => void
	}>(),
	{
		hideNonLoaderIcon: false,
		action: undefined,
	},
)

const icon = computed(() =>
	props.hideNonLoaderIcon && !isLoader.value ? undefined : getTagIcon(props.tag),
)
const iconUrl = computed(() =>
	props.hideNonLoaderIcon && !isLoader.value ? undefined : getTagIconUrl(props.tag),
)
const isLoader = computed(() => getTagMessage(props.tag, 'loader') !== undefined)
</script>
