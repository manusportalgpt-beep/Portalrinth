<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.header)"
		max-width="520px"
		width="100%"
		:on-hide="reset"
	>
		<div class="flex w-full flex-col gap-3">
			<div v-if="project" class="flex min-w-0 items-center gap-3">
				<Avatar :src="project.iconUrl ?? undefined" alt="" size="2.5rem" no-shadow />
				<span class="min-w-0 truncate font-bold text-contrast">{{ project.name }}</span>
			</div>

			<span v-if="serversQuery.isPending.value" class="text-sm text-secondary">
				{{ formatMessage(messages.loading) }}
			</span>
			<EmptyState
				v-else-if="servers.length === 0"
				type="empty"
				:heading="formatMessage(messages.none)"
				:description="formatMessage(messages.noneHint)"
			/>
			<div v-else class="flex max-h-[22rem] flex-col gap-2 overflow-y-auto">
				<div v-for="server in servers" :key="server.id" class="hosted-target">
					<ServerStackIcon class="shrink-0 text-secondary" />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-semibold text-contrast">{{ server.name }}</span>
						<span class="truncate text-xs text-secondary">
							{{ softwareLabels[server.software] }} {{ server.game_version }}
						</span>
					</span>
					<span
						v-if="!fits(server)"
						v-tooltip="formatMessage(messages.unsupportedHint)"
						class="shrink-0 text-xs text-secondary"
					>
						{{ formatMessage(messages.unsupported) }}
					</span>
					<Button
						v-else
						class="shrink-0"
						type="outlined"
						:color="done.has(server.id) ? 'green' : 'brand'"
						:loading="installing === server.id"
						:disabled="installing !== null || done.has(server.id)"
						@click="install(server)"
					>
						<CheckIcon v-if="done.has(server.id)" />
						<PlusIcon v-else />
						{{ formatMessage(done.has(server.id) ? messages.installed : messages.install) }}
					</Button>
				</div>
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { CheckIcon, PlusIcon, ServerStackIcon } from '@modrinth/assets'
import {
	Avatar,
	Button,
	defineMessages,
	EmptyState,
	injectNotificationManager,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import {
	hostedProjectType,
	hostedServerFits,
	installToHostedServer,
	NoFittingVersionError,
} from '@/helpers/hosted-content'
import type { HostedServerView } from '@/helpers/hosting'

import { softwareLabels } from './messages'
import { hostedServersQueryOptions } from './queries'

interface HostedInstallProject {
	id: string
	name: string
	iconUrl?: string | null
	loaders: string[]
}

const { formatMessage } = useVIntl()
const { addNotification, handleError } = injectNotificationManager()
const messages = defineMessages({
	header: { id: 'app.server-hosting.install-to.header', defaultMessage: 'Install on a server' },
	loading: { id: 'app.server-hosting.install-to.loading', defaultMessage: 'Loading servers…' },
	none: { id: 'app.server-hosting.install-to.none', defaultMessage: 'No servers for plugins' },
	noneHint: {
		id: 'app.server-hosting.install-to.none-hint',
		defaultMessage: 'Create a Paper, Purpur or Folia server in Self-Hosted first.',
	},
	install: { id: 'app.server-hosting.browse.install', defaultMessage: 'Install' },
	installed: { id: 'app.server-hosting.browse.installed', defaultMessage: 'Installed' },
	unsupported: { id: 'app.server-hosting.install-to.unsupported', defaultMessage: 'Not supported' },
	unsupportedHint: {
		id: 'app.server-hosting.install-to.unsupported-hint',
		defaultMessage: 'This plugin has no build for this core',
	},
	noVersion: {
		id: 'app.server-hosting.browse.no-version',
		defaultMessage: 'No file of {name} fits this server',
	},
	installedToast: {
		id: 'app.server-hosting.browse.installed-toast',
		defaultMessage: '{name} is installed, restart the server to load it',
	},
})

const modal = ref<InstanceType<typeof NewModal>>()
const project = ref<HostedInstallProject | null>(null)
const installing = ref<string | null>(null)
const done = ref(new Set<string>())

const serversQuery = useQuery({ ...hostedServersQueryOptions(), refetchInterval: false })
const servers = computed(() =>
	(serversQuery.data.value ?? []).filter(
		(server) => hostedProjectType(server.software) === 'plugin',
	),
)

function fits(server: HostedServerView) {
	return !project.value?.loaders.length || hostedServerFits(server, project.value.loaders)
}

async function install(server: HostedServerView) {
	if (!project.value || installing.value) return
	const current = project.value
	installing.value = server.id
	try {
		await installToHostedServer(server, current.id)
		done.value = new Set([...done.value, server.id])
		addNotification({
			type: 'success',
			title: formatMessage(messages.installedToast, { name: current.name }),
		})
	} catch (error) {
		if (error instanceof NoFittingVersionError) {
			addNotification({
				type: 'error',
				title: formatMessage(messages.noVersion, { name: current.name }),
			})
		} else {
			handleError(error as Error)
		}
	} finally {
		installing.value = null
	}
}

function reset() {
	done.value = new Set()
}

function show(next: HostedInstallProject) {
	project.value = next
	done.value = new Set()
	void serversQuery.refetch()
	modal.value?.show()
}

defineExpose({ show })
</script>

<style scoped lang="scss">
.hosted-target {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.5rem 0.5rem 0.5rem 0.875rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
}
</style>
