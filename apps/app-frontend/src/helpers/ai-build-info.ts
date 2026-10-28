/**
 * What Portalus knows about a build: name, Minecraft version, loader and its
 * version, where the build came from and what is inside, with the CDN every
 * file is downloaded from. One text both the prompt and the `instance_info`
 * tool use, so the agent never guesses "which version is this pack" again.
 */
import { get, get_content_items } from './instance'
import type { GameInstance } from './types'

const LOADER_LABEL: Record<string, string> = {
	vanilla: 'Vanilla (без модов)',
	fabric: 'Fabric',
	quilt: 'Quilt',
	forge: 'Forge',
	neoforge: 'NeoForge',
}

export function loaderLabel(loader: string): string {
	return LOADER_LABEL[loader] ?? loader
}

/** Where a build came from, in words. */
function originOf(instance: GameInstance): string {
	const link = instance.link
	if (!link) return 'собрана вручную в лаунчере'
	switch (link.type) {
		case 'modrinth_modpack':
			return `модпак Modrinth (project ${link.project_id}, версия ${link.version_id}; файлы с cdn.modrinth.com)`
		case 'imported_modpack':
			return `импортированный модпак${link.name ? ` «${link.name}»` : ''}${link.version_number ? ` ${link.version_number}` : ''}`
		case 'shared_instance':
			return 'общая сборка (синхронизируется с владельцем)'
		case 'server_project':
		case 'server_project_modpack':
			return 'сборка сервера с Modrinth'
		case 'modrinth_hosting':
			return 'сборка Modrinth Hosting'
		default:
			return String((link as { type?: string }).type ?? 'неизвестно')
	}
}

const SOURCE_CDN: Record<string, string> = {
	curseforge: 'CurseForge (edge.forgecdn.net)',
	curseforge_modpack: 'CurseForge (edge.forgecdn.net)',
	local: 'локальный файл',
}

/** The one-paragraph portrait of a build. */
export function buildHeadline(instance: GameInstance): string {
	const loader = loaderLabel(instance.loader)
	const loaderVersion =
		instance.loader !== 'vanilla' && instance.loader_version ? ` ${instance.loader_version}` : ''
	const stage =
		instance.install_stage === 'installed'
			? ''
			: instance.install_stage === 'installing' || instance.install_stage === 'pack_installing'
				? ', ещё устанавливается'
				: `, состояние установки: ${instance.install_stage}`
	return `«${instance.name}» (id: ${instance.id}) — Minecraft ${instance.game_version}, ядро ${loader}${loaderVersion}; ${originOf(instance)}${stage}`
}

/**
 * The full picture: headline, what kind of content is inside and how much,
 * which CDN it came from, what has updates. `withList` adds the names
 * (for `instance_info`); the prompt gets the counts only.
 */
export async function describeBuild(id: string, withList = false): Promise<string> {
	const instance = await get(id).catch(() => null)
	if (!instance) return `Сборка ${id} не найдена (возможно, удалена).`
	const lines = [buildHeadline(instance)]
	try {
		const items = await get_content_items(id)
		const byType = new Map<string, number>()
		const bySource = new Map<string, number>()
		let disabled = 0
		const updates: string[] = []
		for (const item of items) {
			byType.set(item.project_type, (byType.get(item.project_type) ?? 0) + 1)
			const source =
				SOURCE_CDN[item.source_kind ?? ''] ??
				(item.project?.id ? 'Modrinth (cdn.modrinth.com)' : 'локальный файл')
			bySource.set(source, (bySource.get(source) ?? 0) + 1)
			if (item.enabled === false) disabled++
			if (item.has_update) updates.push(item.project?.title ?? item.file_name)
		}
		const typeLabel: Record<string, string> = {
			mod: 'модов',
			resourcepack: 'ресурс-паков',
			shaderpack: 'шейдеров',
			shader: 'шейдеров',
			datapack: 'датапаков',
		}
		const counts = [...byType.entries()]
			.map(([type, count]) => `${count} ${typeLabel[type] ?? type}`)
			.join(', ')
		lines.push(
			items.length === 0
				? 'Контента нет — чистая сборка.'
				: `Внутри: ${counts}${disabled ? ` (выключено: ${disabled})` : ''}. Источники файлов: ${[
						...bySource.entries(),
					]
						.map(([source, count]) => `${source} — ${count}`)
						.join('; ')}.`,
		)
		if (updates.length > 0) {
			lines.push(
				`Есть обновления (${updates.length}): ${updates.slice(0, 12).join(', ')}${updates.length > 12 ? '…' : ''} — обнови через <<update_mods|${id}>>.`,
			)
		}
		if (withList && items.length > 0) {
			lines.push(
				'Список:\n' +
					items
						.slice(0, 120)
						.map(
							(item) =>
								`- ${item.project?.title ?? item.file_name}${item.version?.version_number ? ` ${item.version.version_number}` : ''} [${item.project_type}${item.enabled === false ? ', выкл' : ''}${item.has_update ? ', есть обновление' : ''}]`,
						)
						.join('\n') +
					(items.length > 120 ? `\n…и ещё ${items.length - 120}` : ''),
			)
		}
	} catch {
		lines.push('Список контента прочитать не удалось.')
	}
	return lines.join('\n')
}
