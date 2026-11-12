import { useStorage } from '@vueuse/core'
import { type Ref, watch } from 'vue'

import type { HostedServerView } from '@/helpers/hosting'

export type OnlineSample = [time: number, players: number]

const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const SAMPLE_EVERY_MS = 60 * 1000

export function useOnlineHistory(id: Ref<string>, server: Ref<HostedServerView | undefined>) {
	const history = useStorage<Record<string, OnlineSample[]>>(
		'portalrinth-server-hosting-online',
		{},
	)

	watch(
		() => [server.value?.id, server.value?.status, server.value?.players.length] as const,
		([serverId, status, count]) => {
			if (!serverId || serverId !== id.value || status !== 'running') return
			const now = Date.now()
			const samples = (history.value[serverId] ?? []).filter(([time]) => now - time < KEEP_MS)
			const last = samples[samples.length - 1]
			if (last && last[1] === count && now - last[0] < SAMPLE_EVERY_MS) return
			samples.push([now, count ?? 0])
			history.value = { ...history.value, [serverId]: samples }
		},
		{ immediate: true },
	)

	function samplesFor(serverId: string): OnlineSample[] {
		return history.value[serverId] ?? []
	}

	function forget(serverId: string) {
		if (!(serverId in history.value)) return
		history.value = Object.fromEntries(
			Object.entries(history.value).filter(([id]) => id !== serverId),
		)
	}

	return { samplesFor, forget }
}
