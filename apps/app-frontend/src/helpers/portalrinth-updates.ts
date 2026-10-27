/**
 * The Updates page: the latest release notes from the three family repos -
 * Modrinth App, Noctrinth and Portalrinth itself - with the built-in Google
 * translator over them, plus an honest answer to "is my launcher behind?"
 * with a one-click update from the newest GitHub release (.exe).
 */
import { getVersion } from '@tauri-apps/api/app'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export const UPDATE_REPOS = [
        {
                id: 'portalrinth',
                label: 'Portalrinth',
                repo: 'manusportalgpt-beep/Portalrinth',
        },
        {
                id: 'noctrinth',
                label: 'Noctrinth',
                repo: 'Everelsu/Noctrinth',
        },
        {
                id: 'modrinth',
                label: 'Modrinth App',
                repo: 'modrinth/code',
        },
] as const

export interface ReleaseNote {
        tag: string
        name: string
        date: string
        url: string
        body: string
}

interface GitHubRelease {
        tag_name?: string
        name?: string
        published_at?: string
        html_url?: string
        body?: string
        assets?: { name?: string; browser_download_url?: string }[]
}

async function githubGet(path: string): Promise<GitHubRelease[]> {
        const response = await tauriFetch(`https://api.github.com${path}`, {
                headers: { Accept: 'application/vnd.github+json' },
                signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new Error(`GitHub: HTTP ${response.status}`)
        return (await response.json()) as GitHubRelease[]
}

export async function fetchReleases(repo: string, limit = 4): Promise<ReleaseNote[]> {
        const releases = await githubGet(`/repos/${repo}/releases?per_page=${limit}`)
        return releases
                .filter((release) => release.tag_name)
                .map((release) => ({
                        tag: release.tag_name ?? '',
                        name: release.name || release.tag_name || '',
                        date: release.published_at ? new Date(release.published_at).toLocaleDateString() : '',
                        url: release.html_url ?? `https://github.com/${repo}/releases`,
                        body: (release.body ?? '').slice(0, 6000),
                }))
}

export interface LauncherUpdate {
        current: string
        latest: string
        isNewer: boolean
        assetUrl: string
        assetName: string
        releaseUrl: string
        notes: string
}

function versionIsOlder(current: string, latest: string): boolean {
        const parse = (value: string) =>
                value
                        .replace(/^[^\d]*/, '')
                        .split(/[.\-+]/)
                        .map((part) => Number.parseInt(part, 10) || 0)
        const a = parse(current)
        const b = parse(latest)
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
                const left = a[i] ?? 0
                const right = b[i] ?? 0
                if (left !== right) return left < right
        }
        return false
}

/** The launcher's own release: is there a newer tag, and where is the .exe. */
export async function launcherUpdateInfo(): Promise<LauncherUpdate> {
        const current = await getVersion()
        const releases = await githubGet('/repos/manusportalgpt-beep/Portalrinth/releases?per_page=1')
        const release = releases[0]
        if (!release?.tag_name) throw new Error('Релизы Порталуса недоступны')
        const asset = (release.assets ?? []).find((item) => /\.exe$/i.test(item.name ?? ''))
        const latest = release.tag_name
        return {
                current,
                latest,
                isNewer: versionIsOlder(current, latest),
                assetUrl: asset?.browser_download_url ?? '',
                assetName: asset?.name ?? '',
                releaseUrl: release.html_url ?? 'https://github.com/manusportalgpt-beep/Portalrinth/releases',
                notes: (release.body ?? '').slice(0, 6000),
        }
}

const UPDATE_FILE = 'Portalrinth-Update.exe'

/**
 * Downloads the installer into the launcher's data folder and runs it.
 * The installer itself takes over from there (NSIS closes and refreshes
 * the app the way it always does).
 */
export async function downloadAndRunUpdate(info: LauncherUpdate): Promise<string> {
        if (!info.assetUrl) throw new Error('В релизе нет .exe — скачайте со страницы релиза')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const { appDataDir, join } = await import('@tauri-apps/api/path')
        const response = await tauriFetch(info.assetUrl, { signal: AbortSignal.timeout(600000) })
        if (!response.ok) throw new Error(`Скачивание не вышло: HTTP ${response.status}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const dir = await appDataDir()
        const target = await join(dir, UPDATE_FILE)
        await writeFile(target, bytes)
        const { openPath } = await import('@tauri-apps/plugin-opener')
        await openPath(target)
        return target
}
