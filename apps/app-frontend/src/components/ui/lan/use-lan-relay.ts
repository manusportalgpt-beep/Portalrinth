import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'

import { start_lan_relay, stop_lan_relay } from '@/helpers/lan'

import { lanRelayKey, lanRelaysQueryOptions } from './queries'

const messages = defineMessages({
	stopped: { id: 'app.lan.stopped', defaultMessage: 'No longer published' },
	copied: { id: 'app.lan.copied', defaultMessage: 'Address copied' },
})

/** The address a published world is reachable at, or nothing when it is not. */
export function lanAddress(relay: {
	state: string
	public_host: string | null
	public_port: number | null
}): string | null {
	if (relay.state !== 'live' || !relay.public_host || !relay.public_port) return null
	return `${relay.public_host}:${relay.public_port}`
}

export function useLanRelays() {
	const { formatMessage } = useVIntl()
	const { addNotification, handleError } = injectNotificationManager()
	const queryClient = useQueryClient()

	const relaysQuery = useQuery(lanRelaysQueryOptions())
	const relays = computed(() => relaysQuery.data.value ?? [])

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: lanRelayKey })
	}

	// What publishing went through, and where it stopped if it did, is shown
	// step by step by the publishing window rather than said in a notification.
	const startMutation = useMutation({
		mutationFn: (processUuid: string) => start_lan_relay(processUuid),
		onSettled: refresh,
	})

	const stopMutation = useMutation({
		mutationFn: (processUuid: string) => stop_lan_relay(processUuid),
		onSuccess: async () => {
			await refresh()
			addNotification({ type: 'success', title: formatMessage(messages.stopped) })
		},
		onError: handleError,
	})

	function isPublishing(processUuid: string) {
		return startMutation.isPending.value && startMutation.variables.value === processUuid
	}

	function isStopping(processUuid: string) {
		return stopMutation.isPending.value && stopMutation.variables.value === processUuid
	}

	async function copyAddress(address: string) {
		try {
			await navigator.clipboard.writeText(address)
			addNotification({ type: 'success', title: formatMessage(messages.copied) })
		} catch (error) {
			handleError(error)
		}
	}

	return {
		relays,
		relaysQuery,
		start: (processUuid: string) => startMutation.mutateAsync(processUuid),
		stop: (processUuid: string) => stopMutation.mutate(processUuid),
		isPublishing,
		isStopping,
		copyAddress,
	}
}
