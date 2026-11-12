/**
 * Portalus's hands on the player's own Self-Hosted servers: see what runs,
 * start and stop them, read the console and type commands into it, exactly
 * as the player would on the server's console tab.
 */
import { noteAgentThought, registerAiToolHandler } from './ai-assistant'
import {
	hostedAddress,
	type HostedServerView,
	hosting_command,
	hosting_get,
	hosting_list,
	hosting_log,
	hosting_restart,
	hosting_start,
	hosting_stop,
	isHostedActive,
} from './hosting'

const STATUS: Record<string, string> = {
	stopped: 'выключен',
	installing: 'устанавливается',
	starting: 'запускается',
	running: 'работает',
	stopping: 'выключается',
	crashed: 'упал',
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function describe(server: HostedServerView) {
	const address = hostedAddress(server) ?? `localhost:${server.port}`
	const players =
		server.status === 'running'
			? `, онлайн ${server.players.length}/${server.max_players}${server.players.length ? `: ${server.players.join(', ')}` : ''}`
			: ''
	return `- «${server.name}» (id ${server.id}): ${STATUS[server.status] ?? server.status}, ${server.software} ${server.game_version}, адрес \`${address}\`${players}`
}

async function resolveServer(raw: string): Promise<HostedServerView | string> {
	const servers = await hosting_list().catch(() => [] as HostedServerView[])
	if (servers.length === 0)
		return 'У игрока нет своих серверов. Создать: экран Self-Hosted — [Self-Hosted](/server-hosting).'
	const wanted = raw.trim().toLowerCase()
	if (!wanted) {
		const running = servers.filter((server) => isHostedActive(server.status))
		if (servers.length === 1) return servers[0]
		if (running.length === 1) return running[0]
		return `Какой сервер? Спроси игрока через ask_user. Серверы:\n${servers.map(describe).join('\n')}`
	}
	const found =
		servers.find((server) => server.id === raw.trim()) ??
		servers.find((server) => server.name.toLowerCase() === wanted) ??
		servers.find((server) => server.name.toLowerCase().includes(wanted))
	return found ?? `Сервер «${raw.trim()}» не найден. Есть:\n${servers.map(describe).join('\n')}`
}

function splitArgs(args: string): [string, string] {
	const at = args.indexOf('::')
	return at < 0 ? ['', args.trim()] : [args.slice(0, at).trim(), args.slice(at + 2).trim()]
}

async function waitRunning(id: string, timeoutMs: number) {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		const fresh = await hosting_get(id).catch(() => null)
		if (
			!fresh ||
			fresh.status === 'running' ||
			fresh.status === 'crashed' ||
			fresh.status === 'stopped'
		)
			return fresh
		await sleep(1500)
	}
	return hosting_get(id).catch(() => null)
}

async function runCommands(server: HostedServerView, commands: string[]) {
	const before = await hosting_log(server.id).catch(() => [] as string[])
	const mark = before[before.length - 1]
	for (const command of commands) {
		await hosting_command(server.id, command)
		await sleep(150)
	}
	let answer: string[] = []
	for (let attempt = 0; attempt < 6; attempt++) {
		await sleep(attempt === 0 ? 700 : 400)
		const after = await hosting_log(server.id).catch(() => [] as string[])
		const from = mark === undefined ? 0 : after.lastIndexOf(mark) + 1
		answer = (from > 0 || mark === undefined ? after.slice(from) : after.slice(-24)).filter(
			(line) => !line.startsWith('> '),
		)
		if (answer.length >= commands.length) break
	}
	return answer
		.map((line) => line.replace(ANSI, '').trim())
		.filter(Boolean)
		.slice(-20)
}

registerAiToolHandler(async (tool, args) => {
	switch (tool) {
		case 'hosting_list': {
			const servers = await hosting_list().catch(() => [] as HostedServerView[])
			if (servers.length === 0)
				return 'Своих серверов нет. Создать можно на экране [Self-Hosted](/server-hosting).'
			return `Серверы игрока (Self-Hosted):\n${servers.map(describe).join('\n')}`
		}
		case 'hosting_status': {
			const server = await resolveServer(args)
			if (typeof server === 'string') return server
			const lines = [describe(server)]
			if (server.status === 'running')
				lines.push(
					`CPU ${Math.round(server.cpu_percent)}%, RAM ${server.ram_used_mb}/${server.memory_mb} МБ`,
				)
			lines.push(
				`Настройки: режим ${server.gamemode}, сложность ${server.difficulty}, whitelist ${server.white_list ? 'вкл' : 'выкл'}, PvP ${server.pvp ? 'вкл' : 'выкл'}, лицензия ${server.online_mode ? 'нужна' : 'не нужна'}`,
			)
			if (server.status === 'crashed' && server.crash_line)
				lines.push(`Причина падения: ${server.crash_line}`)
			return lines.join('\n')
		}
		case 'hosting_power': {
			const [target, action] = splitArgs(args)
			const server = await resolveServer(target)
			if (typeof server === 'string') return server
			const verb = action.toLowerCase()
			if (verb === 'stop') {
				if (!isHostedActive(server.status)) return `«${server.name}» и так выключен.`
				await hosting_stop(server.id)
				return `Выключаю «${server.name}» — мир сохранится сам.`
			}
			if (verb === 'restart') {
				await hosting_restart(server.id)
				return `Перезапускаю «${server.name}».`
			}
			if (verb !== 'start') return 'Действие: start, stop или restart.'
			if (server.status === 'running') return `«${server.name}» уже работает.`
			noteAgentThought(`Запускаю сервер «${server.name}»`)
			await hosting_start(server.id)
			const fresh = await waitRunning(server.id, 120000)
			if (fresh?.status === 'running') return `«${server.name}» запущен.\n${describe(fresh)}`
			if (fresh?.status === 'crashed')
				return `«${server.name}» упал при запуске: ${fresh.crash_line ?? fresh.error ?? 'смотри консоль'}`
			return `«${server.name}» ещё запускается — проверь позже <<hosting_status|${server.id}>>.`
		}
		case 'hosting_cmd': {
			const [target, raw] = splitArgs(args)
			const server = await resolveServer(target)
			if (typeof server === 'string') return server
			const commands = raw
				.split(/;;|\n/)
				.map((command) => command.trim().replace(/^\//, ''))
				.filter(Boolean)
				.slice(0, 20)
			if (commands.length === 0)
				return 'Нет команды. Формат: <<hosting_cmd|сервер::команда;;команда>>.'
			if (server.status !== 'running') {
				return `«${server.name}» ${STATUS[server.status] ?? server.status} — команды принимает только работающий сервер. Предложи игроку запустить: <<hosting_power|${server.id}::start>>.`
			}
			const answer = await runCommands(server, commands)
			return [
				`Консоль «${server.name}»:`,
				...commands.map((command) => `> ${command}`),
				answer.length ? answer.join('\n') : '(сервер ничего не ответил)',
			].join('\n')
		}
		case 'hosting_console': {
			const [target, count] = splitArgs(args)
			const server = await resolveServer(target || count)
			if (typeof server === 'string') return server
			const lines = await hosting_log(server.id).catch(() => [] as string[])
			const take = Math.min(200, Math.max(10, Number.parseInt(target ? count : '', 10) || 40))
			const tail = lines.slice(-take).map((line) => line.replace(ANSI, ''))
			return tail.length
				? `Последние строки консоли «${server.name}»:\n${tail.join('\n')}`
				: 'Консоль пуста.'
		}
		default:
			return null
	}
})
