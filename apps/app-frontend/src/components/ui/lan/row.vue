<script setup lang="ts">
import { CopyIcon, PowerIcon, RadioTowerIcon, TriangleAlertIcon } from '@modrinth/assets'
import { Avatar, Button, defineMessages, useVIntl } from '@modrinth/ui'
import { computed } from 'vue'

import type { LanRelayInfo } from '@/helpers/lan'

import { lanAddress } from './use-lan-relay'

const props = defineProps<{
	relay: LanRelayInfo
	iconUrl: string | null
	publishing: boolean
	stopping: boolean
}>()

const emit = defineEmits<{
	publish: [processUuid: string]
	unpublish: [processUuid: string]
	copy: [address: string]
}>()

const { formatMessage } = useVIntl()
const messages = defineMessages({
	stateClosed: {
		id: 'app.lan.state.closed',
		defaultMessage: 'No world is open to the network',
	},
	stateReady: {
		id: 'app.lan.state.ready',
		defaultMessage: 'Minecraft is serving port {port}',
	},
	stateLost: {
		id: 'app.lan.state.lost',
		defaultMessage: 'The relay stopped carrying players',
	},
	publish: { id: 'app.lan.action.publish', defaultMessage: 'Open LAN' },
	unpublish: { id: 'app.lan.action.unpublish', defaultMessage: 'Stop' },
})

const address = computed(() => lanAddress(props.relay))
const detail = computed(() => {
	if (props.relay.state === 'ready' && props.relay.local_port) {
		return formatMessage(messages.stateReady, { port: props.relay.local_port })
	}
	if (props.relay.state === 'closed') return formatMessage(messages.stateClosed)
	if (props.relay.state === 'lost') return formatMessage(messages.stateLost)
	return null
})
const failed = computed(() => props.relay.state === 'lost')
const canPublish = computed(() => props.relay.state === 'ready')

function copyAddress() {
	if (address.value) emit('copy', address.value)
}
</script>

<template>
	<div class="flex flex-col gap-3 rounded-xl border border-solid border-surface-5 bg-surface-4 p-4">
		<div class="flex items-center gap-3">
			<Avatar :src="iconUrl" :tint-by="relay.instance_id" alt="" size="2rem" class="shrink-0" />
			<div class="flex min-w-0 flex-col">
				<span class="truncate font-bold text-contrast">{{ relay.instance_name }}</span>
				<span class="truncate text-sm text-secondary">{{ relay.account_name }}</span>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<Button v-if="address" size="sm" type="outlined" color="brand" @click="copyAddress">
					<CopyIcon />
					{{ address }}
				</Button>
				<Button
					v-if="canPublish"
					size="sm"
					color="brand"
					:loading="publishing"
					@click="emit('publish', relay.process_uuid)"
				>
					<RadioTowerIcon />
					{{ formatMessage(messages.publish) }}
				</Button>
				<Button
					v-else-if="address"
					size="sm"
					type="outlined"
					:loading="stopping"
					@click="emit('unpublish', relay.process_uuid)"
				>
					<PowerIcon />
					{{ formatMessage(messages.unpublish) }}
				</Button>
			</div>
		</div>

		<div
			v-if="detail"
			class="flex items-center gap-1.5 text-sm"
			:class="failed ? 'text-orange' : 'text-secondary'"
		>
			<TriangleAlertIcon v-if="failed" class="shrink-0" />
			<span class="truncate">{{ detail }}</span>
		</div>
	</div>
</template>
