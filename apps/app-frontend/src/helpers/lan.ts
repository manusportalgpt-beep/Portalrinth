import { invoke } from '@tauri-apps/api/core'

/**
 * How a world's public address is doing.
 *
 * `closed` — the game is running and no world of it is open to the network.
 * `ready` — a world is open and its port is known, but nothing is published.
 * `live` — published, and reachable at `public_host`:`public_port`.
 * `lost` — it was published and is not any more.
 */
export type LanRelayState = 'closed' | 'ready' | 'live' | 'lost'

/**
 * One running copy of an instance, and where its world can be reached.
 *
 * The same instance running twice has one of these each, and nothing else tells
 * them apart — which is why the address is per `process_uuid` and not per
 * `instance_id`.
 */
export interface LanRelayInfo {
	process_uuid: string
	instance_id: string
	instance_name: string
	account_name: string
	started_at: string
	state: LanRelayState
	local_port: number | null
	public_host: string | null
	public_port: number | null
	error: string | null
}

/** Every copy of an instance that is running, with the state of its world. */
export async function list_lan_relays(): Promise<LanRelayInfo[]> {
	return await invoke('plugin:noctrinth-lan|lan_list')
}

/** Publishes the world one running copy of an instance has open. */
export async function start_lan_relay(processUuid: string): Promise<LanRelayInfo> {
	return await invoke('plugin:noctrinth-lan|lan_start', { processUuid })
}

/** Takes a published world back down. */
export async function stop_lan_relay(processUuid: string): Promise<void> {
	await invoke('plugin:noctrinth-lan|lan_stop', { processUuid })
}