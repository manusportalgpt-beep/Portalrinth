import { queryOptions } from '@tanstack/vue-query'

import { hosting_get, hosting_list } from '@/helpers/hosting'

export const hostedServersKey = ['server-hosting', 'servers'] as const

const REFETCH_INTERVAL = 2000

export function hostedServersQueryOptions() {
	return queryOptions({
		queryKey: hostedServersKey,
		queryFn: () => hosting_list(),
		refetchInterval: REFETCH_INTERVAL,
		refetchOnWindowFocus: false,
	})
}

export function hostedServerQueryOptions(id: () => string) {
	return queryOptions({
		queryKey: [...hostedServersKey, 'one', id] as const,
		queryFn: () => hosting_get(id()),
		refetchInterval: REFETCH_INTERVAL,
		refetchOnWindowFocus: false,
	})
}
