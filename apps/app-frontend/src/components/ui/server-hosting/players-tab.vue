<script setup lang="ts">
import { BanIcon, CrownIcon, LogOutIcon, UserPlusIcon, UsersIcon } from '@modrinth/assets'
import {
	Avatar,
	Button,
	defineMessages,
	injectNotificationManager,
	Input,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import { type HostedServerView, hosting_command } from '@/helpers/hosting'
import { playerHead, resolvePlayerHead } from '@/helpers/lan-player-heads'

const props = defineProps<{ server: HostedServerView }>()

const { formatMessage } = useVIntl()
const { addNotification, handleError } = injectNotificationManager()
const messages = defineMessages({
	heading: { id: 'app.server-hosting.players.heading', defaultMessage: 'Online now' },
	none: { id: 'app.server-hosting.players.none', defaultMessage: 'Nobody is on the server yet' },
	offline: {
		id: 'app.server-hosting.players.offline',
		defaultMessage: 'The server is not running, so nobody can be on it',
	},
	op: { id: 'app.server-hosting.players.op', defaultMessage: 'Make operator' },
	kick: { id: 'app.server-hosting.players.kick', defaultMessage: 'Kick' },
	ban: { id: 'app.server-hosting.players.ban', defaultMessage: 'Ban' },
	whitelist: { id: 'app.server-hosting.players.whitelist', defaultMessage: 'Whitelist' },
	whitelistHint: {
		id: 'app.server-hosting.players.whitelist-hint',
		defaultMessage: 'Add a player by name. The whitelist itself is turned on in the settings.',
	},
	whitelistPlaceholder: {
		id: 'app.server-hosting.players.whitelist-placeholder',
		defaultMessage: 'Player name',
	},
	add: { id: 'app.server-hosting.players.add', defaultMessage: 'Add' },
	sent: { id: 'app.server-hosting.players.sent', defaultMessage: 'Command sent: {command}' },
})

const running = computed(() => props.server.status === 'running')
const busy = ref<string | null>(null)
const whitelistName = ref('')

function headOf(player: string) {
	resolvePlayerHead(player, null)
	return playerHead(player)
}

async function send(command: string, key: string) {
	if (busy.value) return
	busy.value = key
	try {
		await hosting_command(props.server.id, command)
		addNotification({ type: 'success', title: formatMessage(messages.sent, { command }) })
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = null
	}
}

async function addToWhitelist() {
	const name = whitelistName.value.trim()
	if (!/^\w{1,16}$/.test(name)) return
	await send(`whitelist add ${name}`, 'whitelist')
	whitelistName.value = ''
}
</script>

<template>
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<section class="hosting-panel flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-contrast">
				<UsersIcon class="shrink-0" />
				{{ formatMessage(messages.heading) }}
				<span v-if="running && server.players.length > 0" class="text-secondary">
					{{ server.players.length }} / {{ server.max_players }}
				</span>
			</h2>
			<span v-if="!running" class="text-sm text-secondary">{{
				formatMessage(messages.offline)
			}}</span>
			<span v-else-if="server.players.length === 0" class="text-sm text-secondary">
				{{ formatMessage(messages.none) }}
			</span>
			<div v-else class="flex flex-col gap-2">
				<div v-for="player in server.players" :key="player" class="hosting-player">
					<Avatar :src="headOf(player)" alt="" size="2rem" no-shadow />
					<span class="min-w-0 flex-1 truncate font-semibold text-contrast">{{ player }}</span>
					<Button
						v-tooltip="formatMessage(messages.op)"
						size="sm"
						type="quiet"
						:disabled="busy !== null"
						:aria-label="formatMessage(messages.op)"
						@click="send(`op ${player}`, `op:${player}`)"
					>
						<CrownIcon />
					</Button>
					<Button
						v-tooltip="formatMessage(messages.kick)"
						size="sm"
						type="quiet"
						:disabled="busy !== null"
						:aria-label="formatMessage(messages.kick)"
						@click="send(`kick ${player}`, `kick:${player}`)"
					>
						<LogOutIcon />
					</Button>
					<Button
						v-tooltip="formatMessage(messages.ban)"
						size="sm"
						type="quiet"
						color="red"
						:disabled="busy !== null"
						:aria-label="formatMessage(messages.ban)"
						@click="send(`ban ${player}`, `ban:${player}`)"
					>
						<BanIcon />
					</Button>
				</div>
			</div>
		</section>

		<section class="hosting-panel flex flex-col gap-3 self-start">
			<h2 class="m-0 text-lg font-bold text-contrast">{{ formatMessage(messages.whitelist) }}</h2>
			<span class="text-sm text-secondary">{{ formatMessage(messages.whitelistHint) }}</span>
			<form class="flex gap-2" @submit.prevent="addToWhitelist">
				<Input
					v-model="whitelistName"
					class="min-w-0 flex-1"
					:maxlength="16"
					autocomplete="off"
					:disabled="!running"
					:placeholder="formatMessage(messages.whitelistPlaceholder)"
				/>
				<Button
					native-type="submit"
					type="outlined"
					:loading="busy === 'whitelist'"
					:disabled="!running || !/^\w{1,16}$/.test(whitelistName.trim())"
				>
					<UserPlusIcon />
					{{ formatMessage(messages.add) }}
				</Button>
			</form>
		</section>
	</div>
</template>

<style scoped lang="scss">
.hosting-panel {
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	min-width: 0;
}

.hosting-player {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.375rem 0.5rem 0.375rem 0.625rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
}
</style>
