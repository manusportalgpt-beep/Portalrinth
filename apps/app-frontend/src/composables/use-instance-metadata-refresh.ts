import { useQueryClient } from '@tanstack/vue-query'
import { onScopeDispose } from 'vue'

import type { InstancePayload } from '@/generated/app-events/InstancePayload'
import { installJobInstanceId, isInstallJobFinished } from '@/helpers/install'
import { syncedPackKeys } from '@/helpers/synced-packs'
import { instanceKeys, instanceListQueryOptions } from '@/pages/instance/query-options'
import type { AppEvents } from '@/providers/app-events'

import { useAppEvent } from './use-app-event'

const INSTANCE_METADATA_EVENTS = new Set<InstancePayload['event']>([
	'created',
	'synced',
	'edited',
	'removed',
])

export function useInstanceMetadataRefresh(events: AppEvents) {
	const queryClient = useQueryClient()
	let refreshQueued = false
	let packsRefreshQueued = false
	let refreshPromise: Promise<void> | undefined

	function queueRefresh() {
		refreshQueued = true
		if (!refreshPromise) {
			refreshPromise = Promise.resolve().then(async () => {
				try {
					do {
						refreshQueued = false
						const refreshPacks = packsRefreshQueued
						packsRefreshQueued = false
						const joinedExistingRequest =
							queryClient.isFetching({ queryKey: instanceKeys.list(), exact: true }) > 0
						const instances = await queryClient.fetchQuery({
							...instanceListQueryOptions(),
							staleTime: 0,
						})

						for (const instance of instances) {
							queryClient.setQueryData(instanceKeys.detail(instance.id), instance)
						}
						if (refreshPacks) {
							await queryClient.invalidateQueries({ queryKey: syncedPackKeys.all })
						}

						if (joinedExistingRequest) {
							refreshQueued = true
						}
					} while (refreshQueued)
				} finally {
					refreshPromise = undefined
				}
			})
		}

		return refreshPromise
	}

	useAppEvent(
		'instance',
		(event) => {
			if (event.event === 'synced') {
				packsRefreshQueued = true
			}
			if (event.event === 'removed') {
				// Stale caches would keep a deleted instance's page issuing
				// commands and spam "unknown instance" errors until restart.
				for (const key of [
					instanceKeys.detail(event.instance_id),
					instanceKeys.content(event.instance_id),
					instanceKeys.contentSync(event.instance_id),
					instanceKeys.contentUpdateCheck(event.instance_id),
					instanceKeys.processes(event.instance_id),
					instanceKeys.linkedContent(event.instance_id),
					instanceKeys.worlds(event.instance_id),
					instanceKeys.sharedMembers(event.instance_id),
				]) {
					queryClient.removeQueries({ queryKey: key })
				}
			}
			if (INSTANCE_METADATA_EVENTS.has(event.event)) return queueRefresh()
		},
		events,
	)
	useAppEvent(
		'install_job',
		async (job) => {
			if (job.kind !== 'bulk_update_content' || !isInstallJobFinished(job.status)) return
			const instanceId = installJobInstanceId(job)
			if (!instanceId) return
			await queueRefresh()
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: instanceKeys.content(instanceId) }),
				queryClient.invalidateQueries({ queryKey: instanceKeys.contentUpdateCheck(instanceId) }),
				queryClient.invalidateQueries({ queryKey: instanceKeys.linkedContent(instanceId) }),
				queryClient.invalidateQueries({ queryKey: syncedPackKeys.all }),
			])
		},
		events,
	)
	useAppEvent('instance_groups_changed', queueRefresh, events)

	// Safety net: upstream refreshes are purely event-driven, but a lost
	// event used to leave the UI stale until restart. Re-sync periodically.
	const periodicResync = setInterval(() => {
		void queueRefresh()
	}, 30_000)
	onScopeDispose(() => clearInterval(periodicResync))
}
