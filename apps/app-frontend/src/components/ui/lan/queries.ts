import { queryOptions } from '@tanstack/vue-query'

import { list_lan_relays } from '@/helpers/lan'

export const lanRelayKey = ['lan', 'relays'] as const

/**
 * How often the running copies and their worlds are asked about again.
 *
 * Nothing pushes either one. A world is opened to the network by somebody
 * pressing a button in Minecraft, and the port it lands on only exists in the
 * game's own output until it is read; a tunnel can drop without the launcher
 * hearing about it. So this asks, and often enough that the button somebody is
 * about to press is never stale.
 */
const REFETCH_INTERVAL = 2000

export function lanRelaysQueryOptions() {
	return queryOptions({
		queryKey: lanRelayKey,
		queryFn: () => list_lan_relays(),
		refetchInterval: REFETCH_INTERVAL,
		refetchOnWindowFocus: false,
	})
}