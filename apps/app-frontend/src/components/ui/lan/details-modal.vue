<script setup lang="ts">
/**
 * What is in the world that is open to the network, and how to have it.
 *
 * Somebody who is told "join this world" wants to know what is in it before
 * they join: which mods, which packs, which game version and loader. This is
 * that, in the middle of the window where a person can read it.
 */
import { SpinnerIcon } from '@modrinth/assets'
import type { ContentItem } from '@modrinth/ui'
import { Avatar, defineMessages, injectNotificationManager, NewModal, useVIntl } from '@modrinth/ui'
import { computed, ref, useTemplateRef } from 'vue'

import { get_content_items } from '@/helpers/instance'
import type { LanRelayInfo } from '@/helpers/lan'

const props = defineProps<{
	relay: LanRelayInfo
	/** The address the world is reachable at, when it is published. */
	address: string | null
}>()

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const modal = useTemplateRef<InstanceType<typeof NewModal>>('modal')
const content = ref<ContentItem[]>([])
const loading = ref(false)

const messages = defineMessages({
	header: { id: 'app.lan.details.header', defaultMessage: 'What is in this world' },
	loading: { id: 'app.lan.details.loading', defaultMessage: 'Reading the world...' },
	empty: { id: 'app.lan.details.empty', defaultMessage: 'Nothing is in it' },
	mods: { id: 'app.lan.details.mods', defaultMessage: 'Mods' },
	resourcePacks: { id: 'app.lan.details.resource-packs', defaultMessage: 'Resource packs' },
	dataPacks: { id: 'app.lan.details.data-packs', defaultMessage: 'Data packs' },
	shaders: { id: 'app.lan.details.shaders', defaultMessage: 'Shaders' },
	other: { id: 'app.lan.details.other', defaultMessage: 'Other' },
	players: { id: 'app.lan.players', defaultMessage: 'In the world' },
	playersNone: {
		id: 'app.lan.players.none',
		defaultMessage: 'Nobody is in the world yet',
	},
	world: { id: 'app.lan.details.world', defaultMessage: 'The world is at' },
	worldClosed: {
		id: 'app.lan.details.world-closed',
		defaultMessage: 'not open to the network yet',
	},
	downloadDone: { id: 'app.lan.details.download-done', defaultMessage: 'The modpack was saved' },
	join: { id: 'app.lan.details.join', defaultMessage: 'Join the world' },
	version: { id: 'app.lan.details.version', defaultMessage: 'Minecraft {version}' },
	loader: { id: 'app.lan.details.loader', defaultMessage: '{loader} {loaderVersion}' },
})

/** The content, in the sections a person would look for it in. */
const sections = computed(() => {
	const groups: {
		key: string
		label: { id: string; defaultMessage: string }
		items: ContentItem[]
	}[] = [
		{ key: 'mod', label: messages.mods, items: [] },
		{ key: 'resourcepack', label: messages.resourcePacks, items: [] },
		{ key: 'datapack', label: messages.dataPacks, items: [] },
		{ key: 'shader', label: messages.shaders, items: [] },
		{ key: 'other', label: messages.other, items: [] },
	]
	for (const item of content.value) {
		const type = String(item.project_type ?? '').toLowerCase()
		const group =
			groups.find((candidate) => candidate.key === type) ??
			groups.find((candidate) => candidate.key === 'other')
		group?.items.push(item)
	}
	return groups.filter((group) => group.items.length > 0)
})

async function load() {
	loading.value = true
	try {
		content.value = await get_content_items(props.relay.instance_id)
	} catch (error) {
		handleError(error)
	} finally {
		loading.value = false
	}
}

/** The head of a player, drawn from their name. */
function headOf(player: string) {
	return `https://mc-heads.net/avatar/${encodeURIComponent(player)}/64`
}

function show() {
	void load()
	modal.value?.show()
}

defineExpose({ show })
</script>

<template>
	<NewModal ref="modal" :header="formatMessage(messages.header)">
		<div class="flex min-w-[28rem] flex-col gap-4">
			<div class="flex flex-col gap-1 text-sm text-secondary">
				<span>{{ relay.instance_name }}</span>
				<span>{{ relay.account_name }}</span>
			</div>

			<div v-if="loading" class="flex items-center gap-2 text-secondary">
				<SpinnerIcon class="size-4 animate-spin" />
				{{ formatMessage(messages.loading) }}
			</div>

			<div v-else-if="sections.length === 0" class="text-sm text-secondary">
				{{ formatMessage(messages.empty) }}
			</div>

			<div v-else class="flex flex-col gap-3">
				<div v-for="section in sections" :key="section.key" class="flex flex-col gap-1">
					<h3 class="m-0 text-sm font-semibold text-contrast">
						{{ formatMessage(section.label) }}
					</h3>
					<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
						<li
							v-for="item in section.items"
							:key="item.id"
							class="flex items-center gap-2 text-sm text-primary"
						>
							<span class="truncate">{{ item.name }}</span>
							<span v-if="item.version_number" class="text-secondary">
								{{ item.version_number }}
							</span>
						</li>
					</ul>
				</div>
			</div>

			<!--
				Who is in the world, with the faces the game gives them.
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
						<Avatar :src="headOf(player)" alt="" size="1.5rem" circle />
						{{ player }}
					</span>
				</div>
				<span v-else class="text-sm text-secondary">
					{{ formatMessage(messages.playersNone) }}
				</span>
			</div>

			<!--
				Where the world is, so it can be joined. There is nothing to
				download: the pack is given out, not fetched.
			-->
			<div
				class="flex items-center gap-2 rounded-lg border border-solid border-surface-5 bg-surface-2 px-3 py-2"
			>
				<span class="text-sm text-secondary">
					{{ formatMessage(messages.world) }}
				</span>
				<span v-if="address" class="truncate font-mono text-sm text-contrast">
					{{ address }}
				</span>
				<span v-else class="truncate text-sm text-secondary">
					{{ formatMessage(messages.worldClosed) }}
				</span>
			</div>
		</div>
	</NewModal>
</template>
