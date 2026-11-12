import { defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { useQueryClient } from '@tanstack/vue-query'
import { reactive } from 'vue'

import {
	type HostedServer,
	type HostedServerView,
	hosting_remove,
	hosting_republish,
	hosting_restart,
	hosting_start,
	hosting_stop,
	hosting_update,
	isHostedActive,
	toHostedServer,
} from '@/helpers/hosting'

import { hostedServersKey } from './queries'

const messages = defineMessages({
	copied: { id: 'app.server-hosting.copied', defaultMessage: 'Address copied' },
	saved: { id: 'app.server-hosting.saved', defaultMessage: 'Settings saved' },
	removed: { id: 'app.server-hosting.removed', defaultMessage: 'Server deleted' },
})

export type HostedAction = 'power' | 'restart' | 'republish' | 'save' | 'remove'

export function useHostedServerActions() {
	const { formatMessage } = useVIntl()
	const { addNotification, handleError } = injectNotificationManager()
	const queryClient = useQueryClient()
	const pending = reactive(new Map<string, HostedAction>())

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: hostedServersKey })
	}

	async function run<T>(id: string, action: HostedAction, task: () => Promise<T>) {
		if (pending.has(id)) return undefined
		pending.set(id, action)
		try {
			return await task()
		} catch (error) {
			handleError(error as Error)
			return undefined
		} finally {
			pending.delete(id)
			await refresh()
		}
	}

	function isPending(id: string, action?: HostedAction) {
		const current = pending.get(id)
		return action ? current === action : current !== undefined
	}

	async function power(server: HostedServerView, askEula: () => Promise<boolean>) {
		if (isHostedActive(server.status)) {
			return run(server.id, 'power', () => hosting_stop(server.id))
		}
		if (!server.eula_accepted) {
			if (!(await askEula())) return undefined
		}
		return run(server.id, 'power', async () => {
			if (!server.eula_accepted) {
				await hosting_update(server.id, { ...toHostedServer(server), eula_accepted: true })
			}
			return hosting_start(server.id)
		})
	}

	function restart(id: string) {
		return run(id, 'restart', () => hosting_restart(id))
	}

	function republish(id: string) {
		return run(id, 'republish', () => hosting_republish(id))
	}

	async function save(id: string, server: HostedServer) {
		const result = await run(id, 'save', () => hosting_update(id, server))
		if (result) addNotification({ type: 'success', title: formatMessage(messages.saved) })
		return result
	}

	async function remove(id: string) {
		const ok = await run(id, 'remove', async () => {
			await hosting_remove(id)
			return true
		})
		if (ok) addNotification({ type: 'success', title: formatMessage(messages.removed) })
		return ok === true
	}

	async function copyAddress(address: string) {
		try {
			await navigator.clipboard.writeText(address)
			addNotification({ type: 'success', title: formatMessage(messages.copied) })
		} catch (error) {
			handleError(error as Error)
		}
	}

	return { power, restart, republish, save, remove, copyAddress, isPending, refresh }
}
