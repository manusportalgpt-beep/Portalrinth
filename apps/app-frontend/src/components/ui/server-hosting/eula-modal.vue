<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.header)"
		max-width="460px"
		width="100%"
		actions-divider
		:on-hide="() => settle(false)"
	>
		<div class="flex w-full flex-col gap-3">
			<p class="m-0 text-base leading-6 text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
			<a
				class="flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline"
				href="https://aka.ms/MinecraftEULA"
				target="_blank"
				rel="noopener"
			>
				<ExternalIcon class="shrink-0" />
				{{ formatMessage(messages.read) }}
			</a>
		</div>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button type="outlined" @click="settle(false)">
					<XIcon aria-hidden="true" />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
				<Button type="colored" color="brand" @click="settle(true)">
					<CheckIcon aria-hidden="true" />
					{{ formatMessage(messages.accept) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { CheckIcon, ExternalIcon, XIcon } from '@modrinth/assets'
import { Button, commonMessages, defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

const { formatMessage } = useVIntl()
const messages = defineMessages({
	header: { id: 'app.server-hosting.eula.header', defaultMessage: 'Minecraft EULA' },
	description: {
		id: 'app.server-hosting.eula.description',
		defaultMessage:
			'To run a Minecraft server you have to agree to the Minecraft End User License Agreement.',
	},
	read: { id: 'app.server-hosting.eula.read', defaultMessage: 'Read the agreement' },
	accept: { id: 'app.server-hosting.eula.accept', defaultMessage: 'I agree' },
})

const modal = ref<InstanceType<typeof NewModal>>()
let resolver: ((value: boolean) => void) | null = null

function settle(value: boolean) {
	const resolve = resolver
	resolver = null
	if (resolve) {
		resolve(value)
		modal.value?.hide()
	}
}

function ask() {
	settle(false)
	return new Promise<boolean>((resolve) => {
		resolver = resolve
		modal.value?.show()
	})
}

defineExpose({ ask })
</script>
