<script setup lang="ts">
import {
	CopyIcon,
	InfoIcon,
	PowerIcon,
	RadioTowerIcon,
	TriangleAlertIcon,
	UsersIcon,
	WorldIcon,
} from '@modrinth/assets'
import { Avatar, Button, defineMessages, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { get_user } from '@/helpers/cache.js'
import type { LanRelayInfo } from '@/helpers/lan'

import { lanAddress } from './use-lan-relay'

const props = defineProps<{
	relay: LanRelayInfo
	iconUrl: string | null
	publishing: boolean
	stopping: boolean
}>()

const emit = defineEmits<{
	publish: [relay: LanRelayInfo]
	unpublish: [processUuid: string]
	copy: [address: string]
}>()

const { formatMessage } = useVIntl()
const router = useRouter()
const messages = defineMessages({
	stateClosed: {
		id: 'app.lan.card.closed',
		defaultMessage: 'Waiting for a world',
	},
	stateReady: {
		id: 'app.lan.card.ready',
		defaultMessage: 'World is open',
	},
	stateLive: {
		id: 'app.lan.state.live',
		defaultMessage: 'In the network',
	},
	stateLost: {
		id: 'app.lan.card.lost',
		defaultMessage: 'Connection lost',
	},
	closedHint: {
		id: 'app.lan.card.closed-hint',
		defaultMessage:
			'In Minecraft, press Esc, then "Open to LAN" and "Start LAN World". The card notices it by itself.',
	},
	readyHint: {
		id: 'app.lan.card.ready-hint',
		defaultMessage:
			'The world is open on port {port}. Open it to friends and they can join from anywhere.',
	},
	liveHint: {
		id: 'app.lan.card.live-hint',
		defaultMessage: 'Friends add this address as a server in Minecraft.',
	},
	publish: { id: 'app.lan.action.publish', defaultMessage: 'Open LAN' },
	players: { id: 'app.lan.players', defaultMessage: 'In the world' },
	playersNone: {
		id: 'app.lan.players.none',
		defaultMessage: 'Nobody is in the world yet',
	},
	copyAddress: { id: 'app.lan.action.copy', defaultMessage: 'Copy the address' },
	unpublish: { id: 'app.lan.action.unpublish', defaultMessage: 'Stop' },
})

const address = computed(() => lanAddress(props.relay))

const state = computed(() => props.relay.state)
const stateLabel = computed(() =>
	formatMessage(
		{
			closed: messages.stateClosed,
			ready: messages.stateReady,
			live: messages.stateLive,
			lost: messages.stateLost,
		}[state.value],
	),
)

/** The head of a player, drawn from their name. */
function headOf(player: string) {
	return `https://mc-heads.net/avatar/${encodeURIComponent(player)}/64`
}

/** Steve's head, for a player who has no picture of their own on Modrinth. */
const STEVE_HEAD_URL = 'https://launcher-files.modrinth.com/assets/steve_head.png'

/**
 * The picture of whoever opened the world: the one on their Modrinth profile
 * when they have one, Steve otherwise.
 */
const ownerAvatar = ref(STEVE_HEAD_URL)
watch(
	() => props.relay.account_name,
	async (name) => {
		ownerAvatar.value = STEVE_HEAD_URL
		if (!name) return
		try {
			const user = await get_user(name)
			if (props.relay.account_name === name && user?.avatar_url) {
				ownerAvatar.value = user.avatar_url
			}
		} catch {
			// Not on Modrinth: Steve stays.
		}
	},
	{ immediate: true },
)

/** The profile a name belongs to. */
function openProfile(username: string) {
	void router.push(`/user/${encodeURIComponent(username)}`)
}

function copyAddress() {
	if (address.value) emit('copy', address.value)
}
</script>

<template>
	<div class="lan-card" :data-state="state">
		<div class="flex items-center gap-3">
			<Avatar :src="iconUrl" :tint-by="relay.instance_id" alt="" size="3rem" class="shrink-0" />
			<div class="flex min-w-0 flex-col gap-1">
				<span class="truncate text-lg font-bold text-contrast">{{ relay.instance_name }}</span>
				<!-- Whoever is playing it; the name opens the profile it belongs to. -->
				<button
					type="button"
					class="flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left"
					:aria-label="relay.account_name"
					@click="openProfile(relay.account_name)"
				>
					<Avatar :src="ownerAvatar" alt="" size="1.25rem" circle no-shadow />
					<span class="truncate text-sm text-secondary hover:underline">
						{{ relay.account_name }}
					</span>
				</button>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<span class="lan-card-state">
					<span class="lan-card-dot" />
					{{ stateLabel }}
				</span>
			</div>
		</div>

		<!--
			What to do next, which depends only on where the world is: not open
			yet, open and waiting to be shared, or shared. The button to share it
			is only there while there is a world to share, and goes away by itself
			when the world is left.
		-->
		<Transition name="lan-card-body" mode="out-in">
			<div v-if="state === 'closed'" key="closed" class="lan-card-hint">
				<WorldIcon class="lan-card-hint-icon lan-card-hint-icon--waiting" />
				<span>{{ formatMessage(messages.closedHint) }}</span>
			</div>

			<div v-else-if="state === 'ready'" key="ready" class="lan-card-hint lan-card-hint--ready">
				<RadioTowerIcon class="lan-card-hint-icon" />
				<span class="flex-1">
					{{ formatMessage(messages.readyHint, { port: relay.local_port ?? '' }) }}
				</span>
				<Button
					type="colored"
					color="brand"
					class="shrink-0"
					:loading="publishing"
					@click="emit('publish', relay)"
				>
					<RadioTowerIcon />
					{{ formatMessage(messages.publish) }}
				</Button>
			</div>

			<div v-else-if="state === 'lost'" key="lost" class="lan-card-hint lan-card-hint--lost">
				<TriangleAlertIcon class="lan-card-hint-icon" />
				<span>{{ relay.error }}</span>
			</div>

			<div v-else key="live" class="flex flex-col gap-2">
				<div class="lan-card-address">
					<span class="truncate font-mono text-base font-semibold text-contrast">
						{{ address }}
					</span>
					<Button
						size="sm"
						type="quiet"
						class="ml-auto shrink-0"
						:aria-label="formatMessage(messages.copyAddress)"
						@click="copyAddress"
					>
						<CopyIcon />
					</Button>
					<Button
						size="sm"
						type="outlined"
						class="shrink-0"
						:loading="stopping"
						@click="emit('unpublish', relay.process_uuid)"
					>
						<PowerIcon />
						{{ formatMessage(messages.unpublish) }}
					</Button>
				</div>
				<span class="flex items-center gap-1.5 text-sm text-secondary">
					<InfoIcon class="shrink-0" />
					{{ formatMessage(messages.liveHint) }}
				</span>
			</div>
		</Transition>

		<!-- Who is in the world, as the game says. -->
		<div v-if="state === 'live' || relay.players.length > 0" class="flex flex-col gap-1.5">
			<span class="flex items-center gap-1.5 text-sm font-medium text-secondary">
				<UsersIcon class="shrink-0" />
				{{ formatMessage(messages.players) }}
				<span v-if="relay.players.length > 0" class="text-contrast">
					{{ relay.players.length }}
				</span>
			</span>
			<div v-if="relay.players.length > 0" class="flex flex-wrap gap-2">
				<span
					v-for="player in relay.players"
					:key="player"
					class="flex items-center gap-2 rounded-full border border-solid border-surface-5 bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-sm text-contrast"
				>
					<Avatar :src="headOf(player)" alt="" size="1.5rem" circle no-shadow />
					{{ player }}
				</span>
			</div>
			<span v-else class="text-sm text-secondary">
				{{ formatMessage(messages.playersNone) }}
			</span>
		</div>
	</div>
</template>

<style scoped lang="scss">
.lan-card {
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	transition: border-color 0.3s ease;

	&[data-state='live'] {
		border-color: var(--color-brand);
	}
}

.lan-card-state {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.125rem 0.625rem;
	border-radius: 999px;
	background: var(--surface-5);
	color: var(--color-secondary);
	font-size: 0.75rem;
	font-weight: 600;

	[data-state='ready'] & {
		color: var(--color-brand);
		background: var(--color-brand-highlight);
	}

	[data-state='live'] & {
		color: var(--color-brand);
		background: var(--color-brand-highlight);
	}

	[data-state='lost'] & {
		color: var(--color-orange);
	}
}

.lan-card-dot {
	position: relative;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 999px;
	background: currentColor;
	opacity: 0.8;

	[data-state='live'] &::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: currentColor;
		animation: lan-card-pulse 1.6s ease-out infinite;
	}
}

.lan-card-hint {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px dashed var(--surface-5);
	background: var(--surface-3);
	color: var(--color-secondary);
	font-size: 0.875rem;

	&--ready {
		border-style: solid;
		border-color: var(--color-brand);
		background: var(--color-brand-highlight);
		color: var(--color-contrast);
	}

	&--lost {
		border-style: solid;
		color: var(--color-orange);
	}
}

.lan-card-hint-icon {
	flex-shrink: 0;
	width: 1.25rem;
	height: 1.25rem;

	.lan-card-hint--ready & {
		color: var(--color-brand);
	}

	&--waiting {
		animation: lan-card-breathe 2.4s ease-in-out infinite;
	}
}

.lan-card-address {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.5rem 0.5rem 0.875rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-2);
}

.lan-card-body-enter-active,
.lan-card-body-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.lan-card-body-enter-from,
.lan-card-body-leave-to {
	opacity: 0;
	transform: translateY(0.25rem);
}

@keyframes lan-card-pulse {
	0% {
		transform: scale(1);
		opacity: 0.7;
	}
	100% {
		transform: scale(2.6);
		opacity: 0;
	}
}

@keyframes lan-card-breathe {
	0%,
	100% {
		opacity: 0.5;
	}
	50% {
		opacity: 1;
	}
}

@media (prefers-reduced-motion) {
	.lan-card-dot::after,
	.lan-card-hint-icon--waiting {
		animation: none !important;
	}
}
</style>
