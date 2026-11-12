<script setup lang="ts">
import { LayoutGridIcon, ListIcon, PlusIcon } from '@modrinth/assets'
import {
	Button,
	commonMessages,
	defineMessages,
	EmptyState,
	ReadyTransition,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { useStorage } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import type { HostedServerView } from '@/helpers/hosting'

import CreateModal from './create-modal.vue'
import EulaModal from './eula-modal.vue'
import { hostingMessages } from './messages'
import { hostedServersQueryOptions } from './queries'
import ServerRow from './server-row.vue'
import { useHostedServerActions } from './use-hosted-servers'

const { formatMessage } = useVIntl()
const router = useRouter()
const messages = defineMessages({
	emptyHeading: { id: 'app.server-hosting.empty-heading', defaultMessage: 'No servers yet' },
	emptyDescription: {
		id: 'app.server-hosting.empty-description',
		defaultMessage: 'Create a server and it will run right on this computer.',
	},
	errorHeading: {
		id: 'app.server-hosting.error-heading',
		defaultMessage: 'Failed to read your servers',
	},
	create: { id: 'app.server-hosting.create', defaultMessage: 'Create server' },
	gridView: { id: 'app.server-hosting.view.grid', defaultMessage: 'Grid' },
	listView: { id: 'app.server-hosting.view.list', defaultMessage: 'List' },
})

const serversQuery = useQuery(hostedServersQueryOptions())
const servers = computed(() => serversQuery.data.value ?? [])
const grid = useStorage('portalrinth-server-hosting-grid', false)

const actions = useHostedServerActions()
const createModal = useTemplateRef<InstanceType<typeof CreateModal>>('createModal')
const eulaModal = useTemplateRef<InstanceType<typeof EulaModal>>('eulaModal')

function open(id: string) {
	void router.push(`/server-hosting/${encodeURIComponent(id)}`)
}

function power(server: HostedServerView) {
	void actions.power(server, () => eulaModal.value?.ask() ?? Promise.resolve(false))
}
</script>

<template>
	<div class="box-border flex h-full flex-col gap-4 overflow-y-auto p-6">
		<div class="flex items-start gap-4">
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<h1 class="m-0 text-2xl font-bold text-contrast">
					{{ formatMessage(hostingMessages.heading) }}
				</h1>
				<p class="m-0 text-secondary">{{ formatMessage(hostingMessages.description) }}</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<Button
					v-tooltip="formatMessage(grid ? messages.listView : messages.gridView)"
					type="outlined"
					:aria-label="formatMessage(grid ? messages.listView : messages.gridView)"
					@click="grid = !grid"
				>
					<ListIcon v-if="grid" />
					<LayoutGridIcon v-else />
				</Button>
				<Button type="colored" color="brand" @click="(event) => createModal?.show(event)">
					<PlusIcon />
					{{ formatMessage(messages.create) }}
				</Button>
			</div>
		</div>

		<ReadyTransition :pending="serversQuery.isPending.value">
			<EmptyState
				v-if="serversQuery.isError.value"
				type="error"
				:heading="formatMessage(messages.errorHeading)"
				:description="serversQuery.error.value?.message"
			>
				<template #actions>
					<Button type="outlined" @click="serversQuery.refetch()">
						{{ formatMessage(commonMessages.retryButton) }}
					</Button>
				</template>
			</EmptyState>

			<EmptyState
				v-else-if="servers.length === 0"
				type="empty"
				:heading="formatMessage(messages.emptyHeading)"
				:description="formatMessage(messages.emptyDescription)"
			>
				<template #actions>
					<Button type="colored" color="brand" @click="(event) => createModal?.show(event)">
						<PlusIcon />
						{{ formatMessage(messages.create) }}
					</Button>
				</template>
			</EmptyState>

			<div
				v-else
				:class="
					grid
						? 'grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3'
						: 'flex flex-col gap-2'
				"
			>
				<ServerRow
					v-for="server in servers"
					:key="server.id"
					:server="server"
					:grid="grid"
					:busy="actions.isPending(server.id)"
					@open="open"
					@power="power"
				/>
			</div>
		</ReadyTransition>

		<CreateModal ref="createModal" @created="(server) => open(server.id)" />
		<EulaModal ref="eulaModal" />
	</div>
</template>
