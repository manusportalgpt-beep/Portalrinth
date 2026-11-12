<script setup lang="ts">
import {
	ArrowLeftIcon,
	CopyIcon,
	EditIcon,
	GlobeIcon,
	PowerIcon,
	RefreshCwIcon,
	ServerStackIcon,
} from '@modrinth/assets'
import {
	Admonition,
	Button,
	commonMessages,
	defineMessages,
	EmptyState,
	ReadyTransition,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, toRef, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { hostedAddress, isHostedActive, toHostedServer } from '@/helpers/hosting'

import BootProgress from './boot-progress.vue'
import ConsoleTab from './console-tab.vue'
import { contentKind, contentMessages } from './content-kind'
import CrashCard from './crash-card.vue'
import EulaModal from './eula-modal.vue'
import FilesTab from './files-tab.vue'
import { hostingMessages, softwareLabels } from './messages'
import OverviewTab from './overview-tab.vue'
import PlayersTab from './players-tab.vue'
import PluginsTab from './plugins-tab.vue'
import { hostedServerQueryOptions } from './queries'
import SettingsTab from './settings-tab.vue'
import StatusPill from './status-pill.vue'
import { useHostedServerActions } from './use-hosted-servers'
import { useOnlineHistory } from './use-online-history'

const props = defineProps<{ id: string }>()

const { formatMessage } = useVIntl()
const router = useRouter()
const messages = defineMessages({
	back: { id: 'app.server-hosting.back', defaultMessage: 'Back to servers' },
	notFound: { id: 'app.server-hosting.not-found', defaultMessage: 'Server not found' },
	tabDashboard: { id: 'app.server-hosting.tab.dashboard', defaultMessage: 'Dashboard' },
	tabConsole: { id: 'app.server-hosting.tab.console', defaultMessage: 'Console' },
	tabPlayers: { id: 'app.server-hosting.tab.players', defaultMessage: 'Players' },
	tabFiles: { id: 'app.server-hosting.tab.files', defaultMessage: 'Files' },
	tabSettings: { id: 'app.server-hosting.tab.settings', defaultMessage: 'Settings' },
	relayFailed: {
		id: 'app.server-hosting.relay-failed',
		defaultMessage: 'The public address could not be opened',
	},
})

const serverQuery = useQuery(hostedServerQueryOptions(() => props.id))
const server = computed(() => serverQuery.data.value)

const actions = useHostedServerActions()
const eulaModal = useTemplateRef<InstanceType<typeof EulaModal>>('eulaModal')
const { samplesFor } = useOnlineHistory(toRef(props, 'id'), server)

type Tab = 'dashboard' | 'console' | 'players' | 'plugins' | 'files' | 'settings'
const tab = ref<Tab>('dashboard')
watch(
	() => props.id,
	() => {
		tab.value = 'dashboard'
	},
)

const tabs = computed(() => [
	{ id: 'dashboard' as const, label: formatMessage(messages.tabDashboard) },
	{ id: 'console' as const, label: formatMessage(messages.tabConsole) },
	{ id: 'players' as const, label: formatMessage(messages.tabPlayers) },
	{
		id: 'plugins' as const,
		label: formatMessage(contentMessages[server.value ? contentKind(server.value) : 'plugins']),
	},
	{ id: 'files' as const, label: formatMessage(messages.tabFiles) },
	{ id: 'settings' as const, label: formatMessage(messages.tabSettings) },
])

const active = computed(() => (server.value ? isHostedActive(server.value.status) : false))
const address = computed(() => (server.value ? hostedAddress(server.value) : null))
const shownAddress = computed(() => {
	if (!server.value) return ''
	return address.value ?? formatMessage(hostingMessages.localAddress, { port: server.value.port })
})

function power() {
	if (!server.value) return
	void actions.power(server.value, () => eulaModal.value?.ask() ?? Promise.resolve(false))
}

async function useRightJava() {
	if (!server.value) return
	const saved = await actions.save(server.value.id, {
		...toHostedServer(server.value),
		java_path: '',
	})
	if (saved) power()
}

function copy() {
	void actions.copyAddress(address.value ?? `localhost:${server.value?.port ?? ''}`)
}

function back() {
	void router.push('/server-hosting')
}
</script>

<template>
	<div class="box-border flex h-full flex-col gap-4 overflow-y-auto p-6">
		<button type="button" class="hosting-back" @click="back">
			<ArrowLeftIcon />
			{{ formatMessage(messages.back) }}
		</button>

		<ReadyTransition :pending="serverQuery.isPending.value">
			<EmptyState
				v-if="serverQuery.isError.value || !server"
				type="error"
				:heading="formatMessage(messages.notFound)"
				:description="serverQuery.error.value?.message"
			>
				<template #actions>
					<Button type="outlined" @click="serverQuery.refetch()">
						{{ formatMessage(commonMessages.retryButton) }}
					</Button>
				</template>
			</EmptyState>

			<div v-else class="flex flex-col gap-4">
				<header class="hosting-header" :data-status="server.status">
					<div class="hosting-header-icon">
						<ServerStackIcon />
					</div>
					<div class="flex min-w-0 flex-1 flex-col gap-1.5">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="hosting-badge hosting-badge--blue">
								{{ formatMessage(hostingMessages.selfHosted) }}
							</span>
							<span
								class="hosting-badge"
								:class="server.public_relay ? 'hosting-badge--green' : 'hosting-badge--muted'"
							>
								{{
									formatMessage(
										server.public_relay ? hostingMessages.public : hostingMessages.private,
									)
								}}
							</span>
							<span class="hosting-badge hosting-badge--muted">
								{{ softwareLabels[server.software] ?? server.software }} {{ server.game_version }}
							</span>
							<StatusPill :status="server.status" />
						</div>
						<span class="truncate text-xl font-bold text-contrast">{{ server.name }}</span>
						<span class="flex min-w-0 items-center gap-1.5 text-sm text-secondary">
							<GlobeIcon class="shrink-0" />
							<span class="truncate font-mono" :class="{ 'text-contrast': address }">
								{{ shownAddress }}
							</span>
						</span>
					</div>
					<div class="flex shrink-0 items-center gap-2 self-start">
						<Button
							v-tooltip="formatMessage(hostingMessages.copyAddress)"
							type="outlined"
							:aria-label="formatMessage(hostingMessages.copyAddress)"
							@click="copy"
						>
							<CopyIcon />
						</Button>
						<Button
							v-tooltip="formatMessage(hostingMessages.edit)"
							type="outlined"
							:aria-label="formatMessage(hostingMessages.edit)"
							@click="tab = 'settings'"
						>
							<EditIcon />
						</Button>
						<Button
							v-if="server.public_relay && server.status === 'running'"
							v-tooltip="formatMessage(hostingMessages.republish)"
							type="outlined"
							:loading="actions.isPending(server.id, 'republish')"
							:disabled="actions.isPending(server.id)"
							:aria-label="formatMessage(hostingMessages.republish)"
							@click="actions.republish(server.id)"
						>
							<GlobeIcon />
						</Button>
						<Button
							v-tooltip="formatMessage(hostingMessages.restart)"
							type="colored"
							color="orange"
							:loading="actions.isPending(server.id, 'restart')"
							:disabled="!active || actions.isPending(server.id)"
							:aria-label="formatMessage(hostingMessages.restart)"
							@click="actions.restart(server.id)"
						>
							<RefreshCwIcon />
						</Button>
						<Button
							v-tooltip="formatMessage(active ? hostingMessages.stop : hostingMessages.start)"
							type="colored"
							:color="active ? 'red' : 'brand'"
							:loading="actions.isPending(server.id, 'power')"
							:disabled="server.status === 'stopping' || actions.isPending(server.id)"
							@click="power"
						>
							<PowerIcon />
							{{ formatMessage(active ? hostingMessages.stop : hostingMessages.start) }}
						</Button>
					</div>
				</header>

				<CrashCard
					v-if="server.status === 'crashed' && (server.error || server.crash_reason)"
					:server="server"
					:busy="actions.isPending(server.id)"
					@retry="power"
					@console="tab = 'console'"
					@settings="tab = 'settings'"
					@reset-java="useRightJava"
				/>
				<Admonition
					v-else-if="server.relay_error && server.public_relay"
					type="warning"
					:header="formatMessage(messages.relayFailed)"
				>
					{{ server.relay_error }}
				</Admonition>
				<Transition name="hosting-boot">
					<BootProgress
						v-if="server.status === 'installing' || server.status === 'starting'"
						:server="server"
					/>
				</Transition>

				<nav class="hosting-tabs" role="tablist">
					<button
						v-for="item in tabs"
						:key="item.id"
						type="button"
						role="tab"
						:aria-selected="tab === item.id"
						:class="{ 'is-active': tab === item.id }"
						@click="tab = item.id"
					>
						{{ item.label }}
					</button>
				</nav>

				<OverviewTab v-if="tab === 'dashboard'" :server="server" :samples="samplesFor(server.id)" />
				<ConsoleTab v-else-if="tab === 'console'" :server="server" />
				<PlayersTab v-else-if="tab === 'players'" :server="server" />
				<PluginsTab
					v-else-if="tab === 'plugins'"
					:key="`${server.id}:${server.software}`"
					:server="server"
				/>
				<FilesTab v-else-if="tab === 'files'" :server="server" />
				<SettingsTab v-else :key="server.id" :server="server" :actions="actions" @removed="back" />
			</div>
		</ReadyTransition>

		<EulaModal ref="eulaModal" />
	</div>
</template>

<style scoped lang="scss">
.hosting-back {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	width: fit-content;
	padding: 0.25rem 0.625rem 0.25rem 0.375rem;
	border: none;
	border-radius: var(--radius-md, 0.5rem);
	background: transparent;
	color: var(--color-secondary);
	font-weight: 600;
	cursor: pointer;
	transition:
		color 0.15s ease,
		background-color 0.15s ease;

	svg {
		width: 1.125rem;
		height: 1.125rem;
	}

	&:hover {
		background: var(--surface-4);
		color: var(--color-contrast);
	}
}

.hosting-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 1rem;
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	transition: border-color 0.3s ease;

	&[data-status='running'] {
		border-color: var(--color-brand);
	}

	&[data-status='crashed'] {
		border-color: color-mix(in srgb, var(--color-red) 55%, var(--surface-5));
	}
}

.hosting-header-icon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 3.5rem;
	height: 3.5rem;
	border-radius: var(--radius-md, 0.5rem);
	background: var(--surface-3);
	color: var(--color-secondary);

	svg {
		width: 2rem;
		height: 2rem;
	}

	[data-status='running'] & {
		background: var(--color-brand-highlight);
		color: var(--color-brand);
	}
}

.hosting-badge {
	padding: 0.125rem 0.625rem;
	border-radius: 999px;
	font-size: 0.75rem;
	font-weight: 600;
	white-space: nowrap;

	&--blue {
		background: color-mix(in srgb, var(--color-blue) 18%, transparent);
		color: var(--color-blue);
	}

	&--green {
		background: color-mix(in srgb, var(--color-green) 18%, transparent);
		color: var(--color-green);
	}

	&--muted {
		background: var(--surface-5);
		color: var(--color-secondary);
	}
}

.hosting-boot-enter-active,
.hosting-boot-leave-active {
	transition:
		opacity 0.25s ease,
		transform 0.25s ease;
}

.hosting-boot-enter-from,
.hosting-boot-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

.hosting-tabs {
	position: sticky;
	top: 0;
	z-index: 3;
	display: flex;
	gap: 0.25rem;
	overflow-x: auto;
	padding: 0.25rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: color-mix(in srgb, var(--surface-4) 80%, transparent);
	backdrop-filter: blur(14px) saturate(1.2);

	button {
		flex-shrink: 0;
		padding: 0.375rem 0.875rem;
		border: none;
		border-radius: var(--radius-md, 0.5rem);
		background: transparent;
		color: var(--color-secondary);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;

		&:hover {
			color: var(--color-contrast);
		}

		&.is-active {
			background: var(--color-brand-highlight);
			color: var(--color-brand);
		}
	}
}
</style>
