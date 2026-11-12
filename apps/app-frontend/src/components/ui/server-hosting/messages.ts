import { defineMessages } from '@modrinth/ui'

import type { HostedSoftware, HostedStatus } from '@/helpers/hosting'

export const statusMessages = defineMessages({
	stopped: { id: 'app.server-hosting.status.stopped', defaultMessage: 'Stopped' },
	installing: { id: 'app.server-hosting.status.installing', defaultMessage: 'Installing' },
	starting: { id: 'app.server-hosting.status.starting', defaultMessage: 'Starting' },
	running: { id: 'app.server-hosting.status.running', defaultMessage: 'Online' },
	stopping: { id: 'app.server-hosting.status.stopping', defaultMessage: 'Stopping' },
	crashed: { id: 'app.server-hosting.status.crashed', defaultMessage: 'Crashed' },
}) satisfies Record<HostedStatus, unknown>

export const softwareLabels: Record<HostedSoftware, string> = {
	paper: 'Paper',
	purpur: 'Purpur',
	vanilla: 'Vanilla',
	fabric: 'Fabric',
	quilt: 'Quilt',
	folia: 'Folia',
}

export const hostingMessages = defineMessages({
	heading: { id: 'app.server-hosting.heading', defaultMessage: 'Server Hosting' },
	description: {
		id: 'app.server-hosting.description',
		defaultMessage:
			'Run a Minecraft server on this computer and let friends join it from anywhere through a public address.',
	},
	selfHosted: { id: 'app.server-hosting.self-hosted', defaultMessage: 'Self-hosted' },
	public: { id: 'app.server-hosting.public', defaultMessage: 'Public' },
	private: { id: 'app.server-hosting.private', defaultMessage: 'Local only' },
	start: { id: 'app.server-hosting.start', defaultMessage: 'Start' },
	stop: { id: 'app.server-hosting.stop', defaultMessage: 'Stop' },
	restart: { id: 'app.server-hosting.restart', defaultMessage: 'Restart' },
	republish: { id: 'app.server-hosting.republish', defaultMessage: 'Reconnect public address' },
	copyAddress: { id: 'app.server-hosting.copy-address', defaultMessage: 'Copy address' },
	edit: { id: 'app.server-hosting.edit', defaultMessage: 'Edit server' },
	localAddress: { id: 'app.server-hosting.local-address', defaultMessage: 'localhost:{port}' },
	noAddress: {
		id: 'app.server-hosting.no-address',
		defaultMessage: 'The public address appears once the server is online',
	},
	serverSubtitle: {
		id: 'app.server-hosting.server-subtitle',
		defaultMessage: '{software} {version}',
	},
})
