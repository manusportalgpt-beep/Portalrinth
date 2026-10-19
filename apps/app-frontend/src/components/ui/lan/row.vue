<script setup lang="ts">
import {
	CopyIcon,
	MoreVerticalIcon,
	PowerIcon,
	RadioTowerIcon,
	TriangleAlertIcon,
} from '@modrinth/assets'
import { Avatar, Button, defineMessages, useVIntl } from '@modrinth/ui'
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import type { LanRelayInfo } from '@/helpers/lan'

import LanDetailsModal from './details-modal.vue'
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
	hint: [text: string]
}>()

const { formatMessage } = useVIntl()
const router = useRouter()
const messages = defineMessages({
	stateClosed: {
		id: 'app.lan.state.closed',
		defaultMessage: 'No world is open to the network',
	},
	stateReady: {
		id: 'app.lan.state.ready',
		defaultMessage: 'The world is open to the network, on port {port}',
	},
	stateLost: {
		id: 'app.lan.state.lost',
		defaultMessage: 'The relay stopped carrying players',
	},
	stateLive: {
		id: 'app.lan.state.live',
		defaultMessage: 'In the network',
	},
	stateNotLive: {
		id: 'app.lan.state.not-live',
		defaultMessage: 'Not in the network',
	},
	publish: { id: 'app.lan.action.publish', defaultMessage: 'Open LAN' },
	players: { id: 'app.lan.players', defaultMessage: 'In the world' },
	playersNone: {
		id: 'app.lan.players.none',
		defaultMessage: 'Nobody is in the world yet',
	},
	copyAddress: { id: 'app.lan.action.copy', defaultMessage: 'Copy the address' },
	more: { id: 'app.lan.action.more', defaultMessage: 'More' },
	openInGame: { id: 'app.lan.action.open-in-game', defaultMessage: 'Open LAN' },
	openInGameHint: {
		id: 'app.lan.action.open-in-game.hint',
		defaultMessage:
			'In Minecraft, open the world to the network: E, then "Open to LAN". This page finds it by itself.',
	},
	unpublish: { id: 'app.lan.action.unpublish', defaultMessage: 'Stop' },
})

const address = computed(() => lanAddress(props.relay))
const detailsModal = useTemplateRef<InstanceType<typeof LanDetailsModal>>('detailsModal')
const detail = computed(() => {
	if (props.relay.state === 'ready' && props.relay.local_port) {
		return formatMessage(messages.stateReady, { port: props.relay.local_port })
	}
	if (props.relay.state === 'closed') return formatMessage(messages.stateClosed)
	if (props.relay.state === 'lost') return formatMessage(messages.stateLost)
	return null
})
const failed = computed(() => props.relay.state === 'lost')

/**
 * Whether the world is in the network, which is the one thing about it that
 * decides whether anybody can get into it.
 */
const inNetwork = computed(() => props.relay.state === 'live')
const stateLabel = computed(() =>
	inNetwork.value ? formatMessage(messages.stateLive) : formatMessage(messages.stateNotLive),
)

/** The head of a player, drawn from their name. */
function headOf(player: string) {
	return `https://mc-heads.net/avatar/${encodeURIComponent(player)}/64`
}

/** The profile a name belongs to. */
function openProfile(username: string) {
	void router.push(`/user/${encodeURIComponent(username)}`)
}
const canPublish = computed(() => props.relay.state === 'ready')

function copyAddress() {
	if (address.value) emit('copy', address.value)
}

/**
 * The world is opened to the network from inside the game, and nothing here
 * can do that for it. So the button says where to press, and the page goes
 * on watching the log for the port the game will say.
 */
function openInGame() {
	emit('hint', formatMessage(messages.openInGameHint))
}
</script>

<template>
	<div class="flex flex-col gap-3 rounded-xl border border-solid border-surface-5 bg-surface-4 p-4">
		<div class="flex items-center gap-3">
			<Avatar :src="iconUrl" :tint-by="relay.instance_id" alt="" size="2rem" class="shrink-0" />
			<div class="flex min-w-0 flex-col">
				<span class="truncate font-bold text-contrast">{{ relay.instance_name }}</span>
				<!--
					Whoever is playing it: the face and the name, and the name
					opens the profile it belongs to.
				-->
				<button
					type="button"
					class="flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left"
					:aria-label="relay.account_name"
					@click="openProfile(relay.account_name)"
				>
					<Avatar :src="headOf(relay.account_name)" alt="" size="1.25rem" circle />
					<span class="truncate text-sm text-secondary">{{ relay.account_name }}</span>
				</button>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<Button
					size="sm"
					type="quiet"
					:aria-label="formatMessage(messages.more)"
					@click="detailsModal?.show()"
				>
					<MoreVerticalIcon />
				</Button>
				<Button v-if="address" size="sm" type="outlined" color="brand" @click="copyAddress">
					<CopyIcon />
					{{ address }}
				</Button>
				<!--
					Open the world in Minecraft first: the game is the only one
					that can open a world to the network, and the button says so
					rather than pretending otherwise.
				-->
				<Button v-if="!canPublish" size="sm" type="outlined" @click="openInGame">
					<RadioTowerIcon />
					{{ formatMessage(messages.openInGame) }}
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

		<div class="flex items-center gap-2">
			<span
				class="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
				:class="inNetwork ? 'bg-green-500/15 text-green-400' : 'bg-surface-5 text-secondary'"
			>
				<span class="size-1.5 rounded-full" :class="inNetwork ? 'bg-green-400' : 'bg-surface-5'" />
				{{ stateLabel }}
			</span>
			<div
				v-if="detail"
				class="flex items-center gap-1.5 text-sm"
				:class="failed ? 'text-orange' : 'text-secondary'"
			>
				<TriangleAlertIcon v-if="failed" class="shrink-0" />
				<span class="truncate">{{ detail }}</span>
			</div>
		</div>

		<!--
			The address, under the build it belongs to, so it can be taken and
			given to somebody without hunting for the button.
		-->
		<div
			v-if="address"
			class="flex items-center gap-2 rounded-lg border border-solid border-surface-5 bg-surface-2 px-3 py-2"
		>
			<span class="truncate font-mono text-sm text-contrast">{{ address }}</span>
			<Button
				size="sm"
				type="quiet"
				class="ml-auto shrink-0"
				:aria-label="formatMessage(messages.copyAddress)"
				@click="copyAddress"
			>
				<CopyIcon />
			</Button>
		</div>

		<!--
			Who is in the world, and who has come and gone: the game says so,
			and this is that said in a list.
		-->
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-secondary">
				{{ formatMessage(messages.players) }}
			</span>
			<div v-if="relay.players.length > 0" class="flex flex-wrap gap-2">
				<span
					v-for="player in relay.players"
					:key="player"
					class="flex items-center gap-2 rounded-full border border-solid border-surface-5 bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-sm text-contrast"
				>
					<!-- The face is the name's: the head service draws it. -->
					<Avatar :src="headOf(player)" alt="" size="1.5rem" circle />
					{{ player }}
				</span>
			</div>
			<span v-else class="text-sm text-secondary">
				{{ formatMessage(messages.playersNone) }}
			</span>
		</div>

		<LanDetailsModal ref="detailsModal" :relay="relay" :address="address" />
	</div>
</template>
