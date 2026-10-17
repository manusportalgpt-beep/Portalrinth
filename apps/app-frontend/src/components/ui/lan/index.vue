<script setup lang="ts">
import {
	Button,
	commonMessages,
	defineMessages,
	EmptyState,
	ReadyTransition,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'

import { getInstanceIconUrl } from '@/helpers/instance'
import { instanceListQueryOptions } from '@/pages/instance/query-options'

import LanRelayRow from './row.vue'
import { useLanRelays } from './use-lan-relay'

const { formatMessage } = useVIntl()
const messages = defineMessages({
	heading: { id: 'app.lan.heading', defaultMessage: 'LAN' },
	description: {
		id: 'app.lan.description',
		defaultMessage: 'Open a world to LAN in Minecraft, then publish it from here.',
	},
	emptyHeading: { id: 'app.lan.empty-heading', defaultMessage: 'Nothing is running' },
	emptyDescription: {
		id: 'app.lan.empty-description',
		defaultMessage: 'Start an instance and it will show up here.',
	},
	errorHeading: { id: 'app.lan.error-heading', defaultMessage: 'Failed to read running instances' },
})

const { relays, relaysQuery, start, stop, isPublishing, isStopping, copyAddress } =
	useLanRelays()

const instancesQuery = useQuery(instanceListQueryOptions())
const iconsByInstance = computed(
	() =>
		new Map<string, string | null>(
			(instancesQuery.data.value ?? []).map((instance) => [
				instance.id,
				getInstanceIconUrl(instance.icon_path),
			]),
		),
)
</script>

<template>
	<div class="box-border flex h-full flex-col gap-4 overflow-y-auto p-6">
		<div class="flex flex-col gap-1">
			<h1 class="m-0 text-2xl font-bold text-contrast">
				{{ formatMessage(messages.heading) }}
			</h1>
			<p class="m-0 text-secondary">{{ formatMessage(messages.description) }}</p>
		</div>

		<ReadyTransition :pending="relaysQuery.isPending.value">
			<EmptyState
				v-if="relaysQuery.isError.value"
				type="error"
				:heading="formatMessage(messages.errorHeading)"
				:description="relaysQuery.error.value?.message"
			>
				<template #actions>
					<Button type="outlined" @click="relaysQuery.refetch()">
						{{ formatMessage(commonMessages.retryButton) }}
					</Button>
				</template>
			</EmptyState>

			<EmptyState
				v-else-if="relays.length === 0"
				type="empty"
				:heading="formatMessage(messages.emptyHeading)"
				:description="formatMessage(messages.emptyDescription)"
			/>

			<div v-else class="flex flex-col gap-2">
				<LanRelayRow
					v-for="relay in relays"
					:key="relay.process_uuid"
					:relay="relay"
					:icon-url="iconsByInstance.get(relay.instance_id) ?? null"
					:publishing="isPublishing(relay.process_uuid)"
					:stopping="isStopping(relay.process_uuid)"
					@publish="start"
					@unpublish="stop"
					@copy="copyAddress"
				/>
			</div>
		</ReadyTransition>
	</div>
</template>