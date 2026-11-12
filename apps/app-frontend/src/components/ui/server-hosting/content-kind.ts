import { defineMessages } from '@modrinth/ui'

import type { HostedServer } from '@/helpers/hosting'

export const contentMessages = defineMessages({
	plugins: { id: 'app.server-hosting.content.plugins', defaultMessage: 'Plugins' },
	mods: { id: 'app.server-hosting.content.mods', defaultMessage: 'Mods' },
	datapacks: { id: 'app.server-hosting.content.datapacks', defaultMessage: 'Datapacks' },
})

export type ContentKind = keyof typeof contentMessages

export function contentKind(server: Pick<HostedServer, 'software'>): ContentKind {
	if (server.software === 'fabric' || server.software === 'quilt') return 'mods'
	if (server.software === 'vanilla') return 'datapacks'
	return 'plugins'
}

export function contentFolder(server: Pick<HostedServer, 'software' | 'level_name'>): string {
	const kind = contentKind(server)
	if (kind === 'datapacks') return `${server.level_name}/datapacks`
	return kind
}

export function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
