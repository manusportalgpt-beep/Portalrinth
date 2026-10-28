/**
 * Portalrinth's own launcher updates.
 *
 * Two ways to the newest build, picked by what the running build can do:
 *  - release builds carry Tauri's updater: App.vue checks it, and with
 *    "install at once" on it downloads and installs right at start-up;
 *  - every build can also look at the GitHub releases themselves. A release is
 *    recognised by its tag AND by its name (whichever carries the higher
 *    version wins - "v0.22.0+4", "Portalrinth 0.22.0 (4)", "0.22.0-build.4"),
 *    and on Windows the installer is downloaded and started for the player.
 */
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { fetch } from '@tauri-apps/plugin-http'
import { reactive } from 'vue'

export const LAUNCHER_REPO = 'manusportalgpt-beep/Portalrinth'
export const LAUNCHER_RELEASES_URL = `https://github.com/${LAUNCHER_REPO}/releases`

const AUTO_KEY = 'portalrinth-auto-update'
const INSTALLED_KEY = 'portalrinth-installed-release'

export interface ParsedVersion {
	major: number
	minor: number
	patch: number
	build: number
}

export interface LauncherRelease {
	tag: string
	name: string
	version: ParsedVersion
	label: string
	date: string
	url: string
	body: string
	installer?: { name: string; url: string; size: number }
}

export interface UpdateSettings {
	/** Install the newest build as soon as the launcher starts and finds it. */
	autoInstall: boolean
}

function loadSettings(): UpdateSettings {
	try {
		const raw = localStorage.getItem(AUTO_KEY)
		if (raw) return { autoInstall: true, ...JSON.parse(raw) }
	} catch {
		/* defaults below */
	}
	return { autoInstall: true }
}

export const updateSettings = reactive<UpdateSettings>(loadSettings())

export function saveUpdateSettings(patch: Partial<UpdateSettings>) {
	Object.assign(updateSettings, patch)
	localStorage.setItem(AUTO_KEY, JSON.stringify(updateSettings))
}

export const launcherUpdate = reactive({
	checking: false,
	installing: false,
	progress: 0,
	error: '',
	current: '',
	currentBuild: 0,
	latest: null as LauncherRelease | null,
	available: false,
	checkedAt: 0,
	/** True when this build has Tauri's own updater (release builds). */
	native: false,
	nativeVersion: '',
})

/** "v0.22.0+4", "Portalrinth 0.22.0 (4)", "0.22.0-build.4", "0.22" … */
export function parseVersion(text: string): ParsedVersion | null {
	const match =
		/(\d+)\.(\d+)(?:\.(\d+))?(?:\s*(?:\+|-build\.?|-b|\.|\s\(|\s#|\sbuild\s?)(\d+)\)?)?/i.exec(
			text ?? '',
		)
	if (!match) return null
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3] ?? 0),
		build: Number(match[4] ?? 0),
	}
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
	return a.major - b.major || a.minor - b.minor || a.patch - b.patch || a.build - b.build
}

export function versionLabel(version: ParsedVersion): string {
	const base = `${version.major}.${version.minor}.${version.patch}`
	return version.build > 0 ? `${base}+${version.build}` : base
}

function sameBase(a: ParsedVersion, b: ParsedVersion) {
	return a.major === b.major && a.minor === b.minor && a.patch === b.patch
}

interface GithubRelease {
	tag_name: string
	name: string | null
	draft: boolean
	prerelease: boolean
	published_at: string
	html_url: string
	body: string | null
	assets: { name: string; browser_download_url: string; size: number }[]
}

function pickInstaller(assets: GithubRelease['assets']) {
	const setups = assets.filter((asset) => /setup\.exe$/i.test(asset.name))
	// Duplicate uploads get a ".1" before the extension; the plain one is the real one.
	const plain = setups.find((asset) => !/\.\d+\.exe$/i.test(asset.name.replace(/-setup\./i, '.')))
	const chosen = plain ?? setups[0] ?? assets.find((asset) => /\.msi$/i.test(asset.name))
	return chosen
		? { name: chosen.name, url: chosen.browser_download_url, size: chosen.size }
		: undefined
}

/** All published releases, newest first by version (tag and name both count). */
export async function fetchLauncherReleases(): Promise<LauncherRelease[]> {
	const response = await fetch(
		`https://api.github.com/repos/${LAUNCHER_REPO}/releases?per_page=20`,
		{
			headers: { Accept: 'application/vnd.github+json' },
		},
	)
	if (!response.ok) throw new Error(`GitHub ответил ${response.status}`)
	const list = (await response.json()) as GithubRelease[]
	const releases: LauncherRelease[] = []
	for (const release of list) {
		if (release.draft || release.prerelease) continue
		const fromTag = parseVersion(release.tag_name)
		const fromName = parseVersion(release.name ?? '')
		const version =
			fromTag && fromName
				? compareVersions(fromTag, fromName) >= 0
					? fromTag
					: fromName
				: (fromTag ?? fromName)
		if (!version) continue
		releases.push({
			tag: release.tag_name,
			name: release.name || release.tag_name,
			version,
			label: versionLabel(version),
			date: release.published_at,
			url: release.html_url,
			body: release.body ?? '',
			installer: pickInstaller(release.assets ?? []),
		})
	}
	releases.sort(
		(a, b) => compareVersions(b.version, a.version) || Date.parse(b.date) - Date.parse(a.date),
	)
	return releases
}

/** The build running now: the app's version plus the build number we installed. */
async function installedVersion(): Promise<ParsedVersion> {
	const current = parseVersion(await getVersion()) ?? { major: 0, minor: 0, patch: 0, build: 0 }
	try {
		const marker = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? 'null') as {
			label: string
		} | null
		const stored = marker ? parseVersion(marker.label) : null
		if (stored && sameBase(stored, current)) current.build = stored.build
	} catch {
		/* no marker */
	}
	return current
}

function rememberInstalled(version: ParsedVersion) {
	localStorage.setItem(INSTALLED_KEY, JSON.stringify({ label: versionLabel(version) }))
}

/**
 * Looks for a newer release. With nothing remembered about the build number
 * and the same base version, the build is taken as current - otherwise a fresh
 * manual install would be "updated" to itself once.
 */
export async function checkLauncherRelease(): Promise<LauncherRelease | null> {
	if (launcherUpdate.checking) return launcherUpdate.latest
	launcherUpdate.checking = true
	launcherUpdate.error = ''
	try {
		const [releases, current] = await Promise.all([fetchLauncherReleases(), installedVersion()])
		launcherUpdate.current = versionLabel(current)
		launcherUpdate.currentBuild = current.build
		const latest = releases[0] ?? null
		launcherUpdate.latest = latest
		launcherUpdate.checkedAt = Date.now()
		if (!latest) {
			launcherUpdate.available = false
			return null
		}
		const hasMarker = Boolean(localStorage.getItem(INSTALLED_KEY))
		if (!hasMarker && sameBase(latest.version, current)) {
			rememberInstalled(latest.version)
			launcherUpdate.current = latest.label
			launcherUpdate.available = false
			return latest
		}
		launcherUpdate.available = compareVersions(latest.version, current) > 0
		return latest
	} catch (error) {
		launcherUpdate.error = error instanceof Error ? error.message : String(error)
		return null
	} finally {
		launcherUpdate.checking = false
	}
}

let quitLauncher: (() => void | Promise<void>) | null = null
let nativeInstall: (() => Promise<void>) | null = null
let nativeCheck: (() => Promise<string | null>) | null = null

/** App.vue hands over how to quit and its own updater, if the build has one. */
export function registerLauncherUpdater(options: {
	quit?: () => void | Promise<void>
	nativeCheck?: () => Promise<string | null>
	nativeInstall?: () => Promise<void>
}) {
	if (options.quit) quitLauncher = options.quit
	if (options.nativeCheck) {
		nativeCheck = options.nativeCheck
		launcherUpdate.native = true
	}
	if (options.nativeInstall) nativeInstall = options.nativeInstall
}

/** One button for both ways: the native updater first, GitHub after. */
export async function checkForLauncherUpdate(): Promise<boolean> {
	const release = await checkLauncherRelease()
	if (nativeCheck) {
		try {
			const version = await nativeCheck()
			launcherUpdate.nativeVersion = version ?? ''
			if (version) launcherUpdate.available = true
		} catch {
			/* the GitHub answer stays */
		}
	}
	return launcherUpdate.available && Boolean(release || launcherUpdate.nativeVersion)
}

async function isWindows() {
	try {
		const { type } = await import('@tauri-apps/plugin-os')
		return type() === 'windows'
	} catch {
		return navigator.userAgent.includes('Windows')
	}
}

/**
 * Installs the newest build: through the native updater when there is one,
 * otherwise by downloading the release's installer and starting it.
 */
export async function installLauncherUpdate(): Promise<void> {
	if (launcherUpdate.installing) return
	launcherUpdate.installing = true
	launcherUpdate.error = ''
	launcherUpdate.progress = 0
	try {
		if (nativeInstall && launcherUpdate.nativeVersion) {
			if (launcherUpdate.latest) rememberInstalled(launcherUpdate.latest.version)
			await nativeInstall()
			return
		}
		const release = launcherUpdate.latest
		if (!release) throw new Error('Нет сведений о новой версии')
		if (!release.installer || !(await isWindows())) {
			const { openUrl } = await import('@tauri-apps/plugin-opener')
			await openUrl(release.url)
			return
		}
		const { appDataDir, join } = await import('@tauri-apps/api/path')
		const { writeFile } = await import('@tauri-apps/plugin-fs')
		const { openPath } = await import('@tauri-apps/plugin-opener')
		const target = await join(await appDataDir(), 'Portalrinth-Update.exe')

		const response = await fetch(release.installer.url)
		if (!response.ok || !response.body) throw new Error(`Загрузка: ${response.status}`)
		const total = release.installer.size || Number(response.headers.get('content-length')) || 0
		const reader = response.body.getReader()
		const chunks: Uint8Array[] = []
		let received = 0
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			if (value) {
				chunks.push(value)
				received += value.byteLength
				if (total) launcherUpdate.progress = Math.min(1, received / total)
			}
		}
		const file = new Uint8Array(received)
		let offset = 0
		for (const chunk of chunks) {
			file.set(chunk, offset)
			offset += chunk.byteLength
		}
		await writeFile(target, file)
		launcherUpdate.progress = 1
		rememberInstalled(release.version)
		await openPath(target)
		// The installer replaces the running launcher: step aside for it.
		setTimeout(() => void quitLauncher?.(), 1500)
	} catch (error) {
		launcherUpdate.error = error instanceof Error ? error.message : String(error)
	} finally {
		launcherUpdate.installing = false
	}
}

/** Nothing gets replaced under a running game. */
async function gameRunning(): Promise<boolean> {
	try {
		const processes = (await invoke('plugin:process|process_get_all')) as unknown[]
		return Array.isArray(processes) && processes.length > 0
	} catch {
		return false
	}
}

/**
 * At start-up, for builds without the native updater: the newest release is
 * installed at once when "install at once" is on and no game is running.
 */
export async function startupLauncherUpdate(): Promise<void> {
	const release = await checkLauncherRelease()
	if (!release || !launcherUpdate.available || !updateSettings.autoInstall) return
	// Only an installer can be run unattended; elsewhere the update is offered
	// in Settings → Changes instead of a browser tab popping up at start-up.
	if (!release.installer || !(await isWindows())) return
	if (await gameRunning()) return
	await installLauncherUpdate()
}
