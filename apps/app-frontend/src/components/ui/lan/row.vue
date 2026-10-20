<script setup lang="ts">
import { CopyIcon, MoreVerticalIcon, PowerIcon, RadioTowerIcon } from '@modrinth/assets'
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
	/** Said under the world, not in a panel over the page. */
	hint: [text: string]
}>()

const { formatMessage } = useVIntl()
const router = useRouter()
const messages = defineMessages({
	publish: { id: 'app.lan.action.publish', defaultMessage: 'Open LAN' },
	unpublish: { id: 'app.lan.action.unpublish', defaultMessage: 'Stop' },
	copy: { id: 'app.lan.action.copy', defaultMessage: 'Copy the address' },
	more: { id: 'app.lan.action.more', defaultMessage: 'More' },
	notOpenYet: {
		id: 'app.lan.action.open-in-game.hint',
		defaultMessage:
			'In Minecraft, open the world to the network: E, then "Open to LAN". This page finds it by itself.',
	},
})

const address = computed(() => lanAddress(props.relay))
const detailsModal = useTemplateRef<InstanceType<typeof LanDetailsModal>>('detailsModal')

/** The head of a player, drawn from their name. */
function headOf(player: string) {
	return `https://mc-heads.net/avatar/${encodeURIComponent(player)}/64`
}

/** The profile a name belongs to. */
function openProfile(username: string) {
	void router.push(`/user/${encodeURIComponent(username)}`)
}

function copyAddress() {
	if (address.value) emit('copy', address.value)
}

/**
 * Opening the world to the network is done from inside the game, and nothing
 * here can do that for it. So the button says where to press, and says it
 * where the world is rather than in a panel over the page.
 */
function openLan() {
	if (!address.value && props.relay.state !== 'ready') {
		emit('hint', formatMessage(messages.notOpenYet))
		return
	}
	emit('publish', props.relay.process_uuid)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<!--
			The card of a world. On a dark theme it is a little warmer and a
			little softer than the page under it, so it sits on it rather than
			being cut out of it; on OLED, where the page is true black, the card
			is the only thing on the screen with any light in it.
		-->
		<div class="lan-world flex flex-wrap items-center gap-4 rounded-2xl border border-solid p-4">
			<!-- The build's own picture, and the name of whoever is playing it. -->
			<Avatar :src="iconUrl" :tint-by="relay.instance_id" alt="" size="3rem" class="shrink-0" />
			<button
				type="button"
				class="flex min-w-0 cursor-pointer flex-col items-start border-0 bg-transparent p-0 text-left"
				:aria-label="relay.account_name"
				@click="openProfile(relay.account_name)"
			>
				<span class="truncate text-lg font-semibold text-contrast">
					{{ relay.instance_name }}
				</span>
				<span class="flex items-center gap-1.5 text-sm text-secondary">
					<Avatar :src="headOf(relay.account_name)" alt="" size="1.125rem" circle />
					<span class="truncate">{{ relay.account_name }}</span>
				</span>
			</button>

			<div class="ml-auto flex flex-wrap items-center gap-2">
				<Button size="sm" color="brand" :loading="publishing" @click="openLan">
					<RadioTowerIcon />
					{{ formatMessage(messages.publish) }}
				</Button>

				<!--
					The address, and a way to take it. It is beside the world it
					belongs to, so it is copied from the same place it is read.
				-->
				<template v-if="address">
					<span class="font-mono text-sm text-contrast">{{ address }}</span>
					<Button
						size="sm"
						type="quiet"
						:aria-label="formatMessage(messages.copy)"
						:title="formatMessage(messages.copy)"
						@click="copyAddress"
					>
						<CopyIcon />
					</Button>
					<Button
						size="sm"
						type="outlined"
						:loading="stopping"
						@click="emit('unpublish', relay.process_uuid)"
					>
						<PowerIcon />
						{{ formatMessage(messages.unpublish) }}
					</Button>
				</template>

				<Button
					size="sm"
					type="quiet"
					:aria-label="formatMessage(messages.more)"
					:title="formatMessage(messages.more)"
					@click="detailsModal?.show()"
				>
					<MoreVerticalIcon />
				</Button>
			</div>
		</div>

		<LanDetailsModal ref="detailsModal" :relay="relay" :address="address" />
	</div>
</template>

<style scoped>
.lan-world {
	background: color-mix(in srgb, var(--surface-4) 70%, transparent);
	border-color: color-mix(in srgb, var(--surface-5) 70%, transparent);
	transition:
		background 0.25s ease,
		border-color 0.25s ease;
}

/*
 * On a dark theme the card is lit rather than merely shaded: a little of the
 * accent in it, so it sits on the page rather than being cut out of it.
 */
:global(html.dark-mode) .lan-world,
:global(html.oled-mode) .lan-world {
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--color-brand) 7%, var(--surface-4)),
		color-mix(in srgb, var(--surface-4) 82%, transparent)
	);
	border-color: color-mix(in srgb, var(--color-brand) 16%, var(--surface-5));
	box-shadow: 0 1px 0 0 color-mix(in srgb, white 4%, transparent) inset;
}

:global(html.oled-mode) .lan-world {
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--color-brand) 9%, var(--surface-3)),
		color-mix(in srgb, var(--surface-3) 70%, transparent)
	);
}
</style>
