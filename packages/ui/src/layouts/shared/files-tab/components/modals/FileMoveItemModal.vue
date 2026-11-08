<template>
	<NewModal
		ref="modal"
		:header="
			itemCount && itemCount > 1
				? formatMessage(messages.bulkHeader, { count: itemCount })
				: formatMessage(messages.header, {
						type: formatFileItemType(formatMessage, item?.type),
					})
		"
		max-width="500px"
	>
		<form class="space-y-6 md:min-w-[400px]" @submit.prevent="handleSubmit">
			<div class="flex flex-col gap-1">
				<span class="font-semibold text-contrast">{{
					formatMessage(messages.currentLocation)
				}}</span>
				<span class="text-secondary">{{ locationLine }}</span>
			</div>
			<label class="flex flex-col gap-2">
				<span class="font-semibold text-contrast">{{
					formatMessage(messages.destinationPath)
				}}</span>
				<Input
					ref="destinationInput"
					v-model="destination"
					:placeholder="formatMessage(messages.destinationPlaceholder)"
					wrapper-class="w-full"
				/>
			</label>
		</form>
		<template #actions>
			<div class="flex gap-2 justify-end">
				<Button type="outlined" @click="hide">
					<XIcon class="h-5 w-5" />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
				<Button type="colored" color="brand" @click="handleSubmit">
					<RightArrowIcon class="h-5 w-5" />
					{{ formatMessage(commonMessages.moveButton) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { RightArrowIcon, XIcon } from '@modrinth/assets'
import { computed, nextTick, ref } from 'vue'

import { Button } from '#ui/components/base/buttons'
import Input from '#ui/components/base/inputs/Input.vue'
import NewModal from '#ui/components/modal/NewModal.vue'
import { defineMessages, useVIntl } from '#ui/composables/i18n'
import { commonMessages, formatFileItemType } from '#ui/utils/common-messages'

import type { FileItem } from '../../types'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	header: {
		id: 'files.move-modal.header',
		defaultMessage: 'Move {type}',
	},
	bulkHeader: {
		id: 'files.move-modal.bulk-header',
		defaultMessage: 'Move {count, plural, one {# item} other {# items}}',
	},
	currentLocation: {
		id: 'files.move-modal.current-location',
		defaultMessage: 'Current location',
	},
	destinationPath: {
		id: 'files.move-modal.destination-path',
		defaultMessage: 'Destination path',
	},
	destinationPlaceholder: {
		id: 'files.move-modal.destination-placeholder',
		defaultMessage: 'e.g. /my-folder',
	},
})

const destinationInput = ref<HTMLInputElement | null>(null)

const props = defineProps<{
	item: Pick<FileItem, 'name' | 'type'> | null
	currentPath: string
	itemCount?: number
}>()

const locationLine = computed(() =>
	props.item ? `${props.currentPath}/${props.item.name}`.replace('//', '/') : props.currentPath,
)

const emit = defineEmits<{
	move: [destination: string]
}>()

const modal = ref<InstanceType<typeof NewModal>>()
const destination = ref('')

const handleSubmit = () => {
	const path = destination.value.replace('//', '/')
	const normalized = path.startsWith('/') ? path : `/${path}`
	emit('move', normalized)
	hide()
}

const show = () => {
	destination.value = ''
	modal.value?.show()
	nextTick(() => {
		setTimeout(() => {
			destinationInput.value?.focus()
		}, 100)
	})
}

const hide = () => {
	modal.value?.hide()
}

defineExpose({ show, hide })
</script>
