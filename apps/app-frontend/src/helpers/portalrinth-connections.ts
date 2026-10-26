/**
 * Portalrinth's own: the network journal. Every request that leaves through
 * the launcher's proxied fetch is written down here - where it went, when,
 * how it answered and how long it took - so the Settings' "Подключения" tab
 * can show the player exactly who the launcher talks to.
 */
import { ref } from 'vue'

export interface ConnectionEntry {
	id: number
	at: number
	method: string
	url: string
	/** HTTP status once known, or 0 while pending / on hard failures. */
	status: number
	ms: number
	error?: string
}

const LIMIT = 300

const log = ref<ConnectionEntry[]>([])
let nextId = 1

/** The journal, newest first. */
export const connectionLog = ref<ConnectionEntry[]>([])

function commit(entry: ConnectionEntry) {
	log.value = [entry, ...log.value].slice(0, LIMIT)
	connectionLog.value = log.value
}

/** Wraps the actual fetch so both success and failure land in the journal. */
export async function loggedFetch(
	input: Parameters<typeof fetch>[0],
	init: RequestInit | undefined,
	run: () => Promise<Response>,
): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
	const method = (init?.method ?? 'GET').toUpperCase()
	const started = Date.now()
	try {
		const response = await run()
		commit({
			id: nextId++,
			at: started,
			method,
			url,
			status: response.status,
			ms: Date.now() - started,
		})
		return response
	} catch (error) {
		commit({
			id: nextId++,
			at: started,
			method,
			url,
			status: 0,
			ms: Date.now() - started,
			error: String((error as Error)?.message ?? error).slice(0, 200),
		})
		throw error
	}
}

/** Wipes the journal (the "Очистить" button in settings). */
export function clearConnectionLog() {
	log.value = []
	connectionLog.value = []
}
