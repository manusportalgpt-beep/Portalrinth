<script setup lang="ts">
import { PlayIcon, ServerStackIcon, SpinnerIcon } from '@modrinth/assets'
import {
	Button,
	defineMessages,
	injectAuth,
	injectNotificationManager,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'

import {
	type ServerWorld,
	get_recent_worlds,
	get_server_status,
	start_join_server,
	type WorldWithInstance,
} from '@/helpers/worlds'
import { instanceListQueryOptions } from '@/pages/instance/query-options'

defineOptions({ name: 'LastServerCard' })

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const auth = injectAuth()

const props = defineProps<{
	/** The profile being looked at; the card only speaks about this player. */
	userId?: string
}>()

const messages = defineMessages({
	title: { id: 'app.profile.last-server.title', defaultMessage: 'Last server' },
	empty: {
		id: 'app.profile.last-server.empty',
		defaultMessage: 'Nothing here yet',
	},
	emptyDescription: {
		id: 'app.profile.last-server.empty-description',
		defaultMessage: 'Join any server in Minecraft and it will be remembered here.',
	},
	play: { id: 'app.profile.last-server.play', defaultMessage: 'Join' },
	offline: { id: 'app.profile.last-server.offline', defaultMessage: 'Offline' },
	online: {
		id: 'app.profile.last-server.online',
		defaultMessage: '{online}/{max} online',
	},
	joining: {
		id: 'app.profile.last-server.joining',
		defaultMessage: 'Joining...',
	},
})

const isOwnProfile = computed(() => !!auth.user.value?.id && auth.user.value.id === props.userId)

// Every world the launcher remembers, hidden ones included: the "last"
// server is the last one this player was on, whatever its status is now.
const recentWorldsQuery = useQuery({
	queryKey: ['worlds', 'recent', 'last-server'] as const,
	queryFn: (): Promise<WorldWithInstance[]> => get_recent_worlds(50),
	enabled: isOwnProfile,
	staleTime: 30_000,
	refetchOnWindowFocus: false,
})

const lastServer = computed<ServerWorld | null>(() => {
	const worlds = (recentWorldsQuery.data.value ?? []).filter(
		(world): world is ServerWorld =>
			world.type === 'server' && !!world.address && !!world.last_played,
	)
	worlds.sort((a, b) => dayjs(b.last_played).diff(dayjs(a.last_played)))
	return worlds[0] ?? null
})

const instancesQuery = useQuery({
	queryKey: instanceListQueryOptions().queryKey,
	queryFn: instanceListQueryOptions().queryFn,
	enabled: computed(() => isOwnProfile.value && !!lastServer.value),
	staleTime: 30_000,
})

const instanceName = computed(
	() =>
		instancesQuery.data.value?.find((instance) => instance.id === lastServer.value?.instance_id)
			?.name,
)

const statusQuery = useQuery({
	queryKey: computed(() => ['worlds', 'server-status', 'last-server', lastServer.value?.address]),
	queryFn: async () => get_server_status(lastServer.value!.address),
	enabled: computed(() => isOwnProfile.value && !!lastServer.value?.address),
	staleTime: 30_000,
	refetchOnWindowFocus: false,
})

function chatText(chat: unknown): string {
	if (typeof chat === 'string') return chat
	if (chat && typeof chat === 'object' && 'text' in chat) {
		const node = chat as { text?: unknown; extra?: unknown[] }
		const own = typeof node.text === 'string' ? node.text : ''
		const extra = Array.isArray(node.extra) ? node.extra.map(chatText).join('') : ''
		return own + extra
	}
	return ''
}

const serverTitle = computed(() => {
	const description = statusQuery.data.value?.description
	const text = description ? chatText(description).trim() : ''
	return text || lastServer.value?.address || ''
})

const joining = ref(false)

async function joinLastServer() {
	const server = lastServer.value
	if (!server || joining.value) return
	joining.value = true
	try {
		await start_join_server(server.instance_id, server.address)
	} catch (error) {
		handleError(error instanceof Error ? error : new Error(String(error)))
	} finally {
		joining.value = false
	}
}
</script>

<template>
	<div
		v-if="isOwnProfile"
		class="last-server-card rounded-2xl border border-solid border-surface-4 bg-surface-2 p-4"
	>
		<template v-if="recentWorldsQuery.isLoading.value">
			<div class="flex items-center gap-3">
				<span class="placeholder-icon flex items-center justify-center rounded-2xl">
					<SpinnerIcon class="animate-spin" />
				</span>
				<span class="text-lg font-semibold text-contrast">{{ formatMessage(messages.title) }}</span>
			</div>
		</template>

		<template v-else-if="lastServer">
			<div class="flex items-center gap-3">
				<img
					v-if="statusQuery.data.value?.favicon"
					:src="statusQuery.data.value.favicon"
					alt=""
					class="size-12 shrink-0 rounded-2xl border border-solid border-surface-4 object-cover"
				/>
				<span v-else class="placeholder-icon flex items-center justify-center rounded-2xl">
					<ServerStackIcon class="size-5" aria-hidden="true" />
				</span>
				<div class="min-w-0 flex-1">
					<h2 class="m-0 truncate text-lg font-semibold text-contrast">
						{{ formatMessage(messages.title) }}
					</h2>
					<p class="m-0 truncate text-sm text-secondary">
						{{ serverTitle || instanceName || lastServer.address }}
					</p>
				</div>
			</div>
			<div class="mt-3 flex items-center justify-between gap-2">
				<span class="text-sm text-secondary">
					<template v-if="statusQuery.data.value?.players">
						{{
							formatMessage(messages.online, {
								online: statusQuery.data.value.players.online,
								max: statusQuery.data.value.players.max,
							})
						}}
					</template>
					<template v-else-if="statusQuery.isError.value">
						{{ formatMessage(messages.offline) }}
					</template>
					<template v-else>{{ lastServer.address }}</template>
				</span>
				<Button type="colored" color="brand" size="sm" :disabled="joining" @click="joinLastServer">
					<SpinnerIcon v-if="joining" class="animate-spin" />
					<PlayIcon v-else aria-hidden="true" />
					{{ formatMessage(joining ? messages.joining : messages.play) }}
				</Button>
			</div>
		</template>

		<template v-else>
			<div class="flex items-center gap-3">
				<span class="placeholder-icon flex items-center justify-center rounded-2xl">
					<ServerStackIcon class="size-5" aria-hidden="true" />
				</span>
				<div class="min-w-0 flex-1">
					<h2 class="m-0 truncate text-lg font-semibold text-contrast">
						{{ formatMessage(messages.title) }}
					</h2>
					<p class="m-0 truncate text-sm text-secondary">
						{{ formatMessage(messages.empty) }}
					</p>
				</div>
			</div>
			<p class="mb-0 mt-2 text-sm text-secondary">
				{{ formatMessage(messages.emptyDescription) }}
			</p>
		</template>
	</div>
</template>

<style scoped>
.placeholder-icon {
	width: 3rem;
	height: 3rem;
	background: var(--color-surface-4);
	color: var(--color-secondary);
	flex-shrink: 0;
}
</style>
