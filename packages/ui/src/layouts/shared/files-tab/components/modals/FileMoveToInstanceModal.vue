<template>
	<NewModal ref="modal" :header="formatMessage(messages.header)" max-width="440px">
		<div class="flex min-h-40 flex-col gap-1 md:min-w-[360px]">
			<span class="mb-2 text-secondary">
				{{ formatMessage(messages.description, { count: itemCount }) }}
			</span>
			<div v-if="instances.length === 0" class="py-6 text-center text-secondary">
				{{ formatMessage(messages.noInstances) }}
			</div>
			<button
				v-for="instance in instances"
				:key="instance.id"
				class="flex cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2 text-left hover:bg-surface-4"
				@click="emit('move', instance.id)"
			>
				<Avatar :src="instance.iconUrl" :alt="instance.name" size="2rem" />
				<span class="flex min-w-0 flex-col">
					<span class="truncate font-semibold text-contrast">{{ instance.name }}</span>
					<span v-if="instance.subtitle" class="truncate text-xs text-secondary">
						{{ instance.subtitle }}
					</span>
				</span>
			</button>
		</div>
		<template #actions>
			<div class="flex justify-end">
				<Button type="outlined" @click="hide">
					<XIcon class="h-5 w-5" />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { XIcon } from '@modrinth/assets'
import { ref } from 'vue'

import Avatar from '#ui/components/base/Avatar.vue'
import { Button } from '#ui/components/base/buttons'
import NewModal from '#ui/components/modal/NewModal.vue'
import { defineMessages, useVIntl } from '#ui/composables/i18n'
import { commonMessages } from '#ui/utils/common-messages'

import type { TransferInstance } from '../../types'

export type { TransferInstance }

const { formatMessage } = useVIntl()

const messages = defineMessages({
	header: {
		id: 'files.transfer-instance-modal.header',
		defaultMessage: 'Move to another instance',
	},
	description: {
		id: 'files.transfer-instance-modal.description',
		defaultMessage: 'Choose where to move {count, plural, one {# item} other {# items}}',
	},
	noInstances: {
		id: 'files.transfer-instance-modal.no-instances',
		defaultMessage: 'There are no other instances.',
	},
})

defineProps<{
	instances: TransferInstance[]
	itemCount: number
}>()

const emit = defineEmits<{
	move: [instanceId: string]
}>()

const modal = ref<InstanceType<typeof NewModal>>()

const show = () => {
	modal.value?.show()
}

const hide = () => {
	modal.value?.hide()
}

defineExpose({ show, hide })
</script>
