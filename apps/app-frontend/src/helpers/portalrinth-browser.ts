/**
 * The launcher's own browser page: a search bar that answers with real
 * DuckDuckGo results and opens any page in a separate launcher window
 * (the same web view the title-bar search uses). No engine inside the
 * page itself - sites refuse to live in iframes, so a real window is
 * the honest shape - but the page keeps the history and does the search.
 */
import { invoke } from '@tauri-apps/api/core'

import { searchWeb } from '@/helpers/ai-assistant'

export interface BrowserHit {
        title: string
        url: string
}

export { searchWeb }

/** "modrinth.com" or "https://..." typed into the bar opens straight away. */
export function looksLikeUrl(text: string): boolean {
        const value = text.trim()
        if (!value || /\s/.test(value)) return false
        if (/^https?:\/\//i.test(value)) return true
        return /^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(value)
}

export function normalizeUrl(text: string): string {
        const value = text.trim()
        return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

const HISTORY_KEY = 'portalrinth-browser-history'
const HISTORY_LIMIT = 24

export function browserHistory(): string[] {
        try {
                const raw = localStorage.getItem(HISTORY_KEY)
                const list = raw ? (JSON.parse(raw) as string[]) : []
                return Array.isArray(list) ? list.slice(0, HISTORY_LIMIT) : []
        } catch {
                return []
        }
}

export function rememberBrowserQuery(query: string): void {
        const value = query.trim()
        if (!value) return
        const next = [value, ...browserHistory().filter((item) => item !== value)].slice(0, HISTORY_LIMIT)
        try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
        } catch {
                /* a full quota just means no history */
        }
}

let windowCounter = 0

/** Opens a real browser window (WebView) inside the launcher. */
export async function openInBrowserWindow(url: string, title = 'Браузер — Portalrinth'): Promise<void> {
        windowCounter = (windowCounter % 8) + 1
        const label = windowCounter === 1 ? 'portalrinth-browser' : `portalrinth-browser-${windowCounter}`
        try {
                await invoke('open_web_window', { label, url, title })
        } catch {
                // A refused window is not the end: the system browser still works.
                const { openUrl } = await import('@tauri-apps/plugin-opener')
                await openUrl(url)
        }
}
