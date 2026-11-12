import { invoke } from '@tauri-apps/api/core'

export type HostedStatus =
	| 'stopped'
	| 'installing'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'crashed'

export type HostedSoftware = 'paper' | 'purpur' | 'vanilla' | 'fabric' | 'quilt' | 'folia'

export const HOSTED_SOFTWARE: HostedSoftware[] = [
	'paper',
	'purpur',
	'vanilla',
	'fabric',
	'quilt',
	'folia',
]

export interface HostedServer {
	id: string
	name: string
	software: HostedSoftware
	game_version: string
	port: number
	memory_mb: number
	motd: string
	max_players: number
	gamemode: 'survival' | 'creative' | 'adventure' | 'spectator'
	difficulty: 'peaceful' | 'easy' | 'normal' | 'hard'
	view_distance: number
	level_name: string
	online_mode: boolean
	pvp: boolean
	white_list: boolean
	allow_flight: boolean
	command_blocks: boolean
	hardcore: boolean
	public_relay: boolean
	eula_accepted: boolean
	java_path: string
	jvm_args: string
	created_at: number
}

export interface HostedServerView extends HostedServer {
	status: HostedStatus
	error: string | null
	relay_error: string | null
	public_host: string | null
	public_port: number | null
	players: string[]
	cpu_percent: number
	ram_used_mb: number
	started_at: number | null
	core_ready: boolean
	java_need: number
	dir: string
}

export interface HostedPlugin {
	name: string
	enabled: boolean
	size: number
}

export interface HostedFile {
	name: string
	dir: boolean
	size: number
}

const plugin = (command: string) => `plugin:portalrinth-hosting|${command}`

export function isHostedActive(status: HostedStatus) {
	return (
		status === 'installing' ||
		status === 'starting' ||
		status === 'running' ||
		status === 'stopping'
	)
}

export function hostedAddress(server: HostedServerView): string | null {
	if (!server.public_host || !server.public_port) return null
	return `${server.public_host}:${server.public_port}`
}

export function toHostedServer(view: HostedServerView): HostedServer {
	return {
		id: view.id,
		name: view.name,
		software: view.software,
		game_version: view.game_version,
		port: view.port,
		memory_mb: view.memory_mb,
		motd: view.motd,
		max_players: view.max_players,
		gamemode: view.gamemode,
		difficulty: view.difficulty,
		view_distance: view.view_distance,
		level_name: view.level_name,
		online_mode: view.online_mode,
		pvp: view.pvp,
		white_list: view.white_list,
		allow_flight: view.allow_flight,
		command_blocks: view.command_blocks,
		hardcore: view.hardcore,
		public_relay: view.public_relay,
		eula_accepted: view.eula_accepted,
		java_path: view.java_path,
		jvm_args: view.jvm_args,
		created_at: view.created_at,
	}
}

export const hosting_list = () => invoke<HostedServerView[]>(plugin('hosting_list'))
export const hosting_get = (id: string) => invoke<HostedServerView>(plugin('hosting_get'), { id })
export const hosting_create = (name: string, software: HostedSoftware, gameVersion: string) =>
	invoke<HostedServerView>(plugin('hosting_create'), { name, software, gameVersion })
export const hosting_update = (id: string, server: HostedServer) =>
	invoke<HostedServerView>(plugin('hosting_update'), { id, server })
export const hosting_remove = (id: string) => invoke<void>(plugin('hosting_remove'), { id })
export const hosting_start = (id: string) =>
	invoke<HostedServerView>(plugin('hosting_start'), { id })
export const hosting_stop = (id: string) => invoke<HostedServerView>(plugin('hosting_stop'), { id })
export const hosting_restart = (id: string) =>
	invoke<HostedServerView>(plugin('hosting_restart'), { id })
export const hosting_republish = (id: string) =>
	invoke<HostedServerView>(plugin('hosting_republish'), { id })
export const hosting_command = (id: string, command: string) =>
	invoke<void>(plugin('hosting_command'), { id, command })
export const hosting_log = (id: string) => invoke<string[]>(plugin('hosting_log'), { id })
export const hosting_versions = (software: HostedSoftware) =>
	invoke<string[]>(plugin('hosting_versions'), { software })
export const hosting_install_core = (id: string) =>
	invoke<HostedServerView>(plugin('hosting_install_core'), { id })
export const hosting_plugins = (id: string) =>
	invoke<HostedPlugin[]>(plugin('hosting_plugins'), { id })
export const hosting_plugin_toggle = (id: string, name: string) =>
	invoke<HostedPlugin[]>(plugin('hosting_plugin_toggle'), { id, name })
export const hosting_plugin_remove = (id: string, name: string) =>
	invoke<HostedPlugin[]>(plugin('hosting_plugin_remove'), { id, name })
export const hosting_plugin_import = (id: string, paths: string[]) =>
	invoke<HostedPlugin[]>(plugin('hosting_plugin_import'), { id, paths })
export const hosting_files = (id: string, path: string) =>
	invoke<HostedFile[]>(plugin('hosting_files'), { id, path })
export const hosting_file_delete = (id: string, path: string) =>
	invoke<void>(plugin('hosting_file_delete'), { id, path })
export const hosting_file_import = (id: string, path: string, paths: string[]) =>
	invoke<void>(plugin('hosting_file_import'), { id, path, paths })
