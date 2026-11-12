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

export const crashMessages = defineMessages({
	bad_optionTitle: {
		id: 'app.server-hosting.crash.bad-option.title',
		defaultMessage: 'The core did not understand a launch option',
	},
	bad_optionHint: {
		id: 'app.server-hosting.crash.bad-option.hint',
		defaultMessage:
			'Older cores reject some options. The app already starts this server without them — just press Start again. If you added your own Java arguments, check them in the settings.',
	},
	java_versionTitle: {
		id: 'app.server-hosting.crash.java.title',
		defaultMessage: 'This Java does not fit the server',
	},
	java_versionHint: {
		id: 'app.server-hosting.crash.java.hint',
		defaultMessage:
			'Minecraft {version} needs Java {need}. Clear your own Java path and the app will pick and download the right one itself.',
	},
	memoryTitle: { id: 'app.server-hosting.crash.memory.title', defaultMessage: 'Not enough memory' },
	memoryHint: {
		id: 'app.server-hosting.crash.memory.hint',
		defaultMessage:
			'Java could not get the memory the server asked for. Lower the memory in the settings, or close heavy programs and try again.',
	},
	port_in_useTitle: {
		id: 'app.server-hosting.crash.port.title',
		defaultMessage: 'Port {port} is already taken',
	},
	port_in_useHint: {
		id: 'app.server-hosting.crash.port.hint',
		defaultMessage:
			'Another server or program is listening on this port. Stop it, or pick another port in the settings.',
	},
	eulaTitle: {
		id: 'app.server-hosting.crash.eula.title',
		defaultMessage: 'The Minecraft EULA is not accepted',
	},
	eulaHint: {
		id: 'app.server-hosting.crash.eula.hint',
		defaultMessage: 'Press Start and accept the EULA, the server cannot run without it.',
	},
	modsTitle: {
		id: 'app.server-hosting.crash.mods.title',
		defaultMessage: 'Mods do not get along',
	},
	modsHint: {
		id: 'app.server-hosting.crash.mods.hint',
		defaultMessage:
			'A mod is missing a dependency or does not fit this version. The line below names it — remove or update that mod.',
	},
	pluginTitle: {
		id: 'app.server-hosting.crash.plugin.title',
		defaultMessage: 'A plugin failed to load',
	},
	pluginHint: {
		id: 'app.server-hosting.crash.plugin.hint',
		defaultMessage:
			'Turn the plugin named below off, or install a build made for this version of the server.',
	},
	worldTitle: {
		id: 'app.server-hosting.crash.world.title',
		defaultMessage: 'The world could not be loaded',
	},
	worldHint: {
		id: 'app.server-hosting.crash.world.hint',
		defaultMessage:
			'The world may be damaged or made by a newer version. Try another world name in the settings to start a fresh one.',
	},
	jvmTitle: {
		id: 'app.server-hosting.crash.jvm.title',
		defaultMessage: 'Java could not start',
	},
	jvmHint: {
		id: 'app.server-hosting.crash.jvm.hint',
		defaultMessage: 'Check the Java arguments and the memory in the settings.',
	},
	launchTitle: {
		id: 'app.server-hosting.crash.launch.title',
		defaultMessage: 'The server could not be started',
	},
	launchHint: {
		id: 'app.server-hosting.crash.launch.hint',
		defaultMessage:
			'Something went wrong before Minecraft even began. Check your connection and try again.',
	},
	unknownTitle: {
		id: 'app.server-hosting.crash.unknown.title',
		defaultMessage: 'The server stopped with an error',
	},
	unknownHint: {
		id: 'app.server-hosting.crash.unknown.hint',
		defaultMessage:
			'The console shows what happened right before the stop. Open it to see the whole story.',
	},
	whatHappened: {
		id: 'app.server-hosting.crash.what-happened',
		defaultMessage: 'What the server said',
	},
	tryAgain: { id: 'app.server-hosting.crash.try-again', defaultMessage: 'Start again' },
	openConsole: { id: 'app.server-hosting.crash.open-console', defaultMessage: 'Open console' },
	openSettings: { id: 'app.server-hosting.crash.open-settings', defaultMessage: 'Settings' },
	resetJava: { id: 'app.server-hosting.crash.reset-java', defaultMessage: 'Use the right Java' },
	copyLine: { id: 'app.server-hosting.crash.copy-line', defaultMessage: 'Copy' },
})

export const bootMessages = defineMessages({
	core: { id: 'app.server-hosting.boot.core', defaultMessage: 'Core' },
	java: { id: 'app.server-hosting.boot.java', defaultMessage: 'Java' },
	world: { id: 'app.server-hosting.boot.world', defaultMessage: 'World' },
	done: { id: 'app.server-hosting.boot.done', defaultMessage: 'Online' },
	coreHint: {
		id: 'app.server-hosting.boot.core-hint',
		defaultMessage: 'Downloading the server core, the first start takes a minute or two…',
	},
	javaHint: {
		id: 'app.server-hosting.boot.java-hint',
		defaultMessage: 'Java is warming up and loading the server…',
	},
	worldHint: {
		id: 'app.server-hosting.boot.world-hint',
		defaultMessage: 'Preparing the world…',
	},
	worldProgress: {
		id: 'app.server-hosting.boot.world-progress',
		defaultMessage: 'Preparing the world — {percent}%',
	},
})
