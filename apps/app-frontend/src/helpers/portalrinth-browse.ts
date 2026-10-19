/**
 * How the list of results is paged, and how many of them are on a page.
 *
 * These are the launcher's own preferences rather than the app's settings:
 * they are about how the window is drawn, not about the account, and they are
 * remembered here so the website's settings are not touched by a choice made
 * in the app.
 */
import { ref, watch } from 'vue'

const CACHE_KEY = 'portalrinth-browse'

/** Where the long scroll is used. */
export type BrowseScrollScope = 'off' | 'discover' | 'both'

export const BROWSE_PAGE_SIZES = [10, 20, 30, 50, 100]

function read(): { scope: BrowseScrollScope; pageSize: number } {
	try {
		const raw = localStorage.getItem(CACHE_KEY)
		const cached = raw ? (JSON.parse(raw) as { scope?: unknown; pageSize?: unknown }) : null
		const scope = cached?.scope === 'discover' || cached?.scope === 'both' ? cached.scope : 'off'
		const pageSize =
			typeof cached?.pageSize === 'number' && BROWSE_PAGE_SIZES.includes(cached.pageSize)
				? cached.pageSize
				: 20
		return { scope, pageSize }
	} catch {
		return { scope: 'off', pageSize: 20 }
	}
}

const cached = read()

/** Where the long scroll is used: not at all, on Discover, or on both. */
export const browseScrollScope = ref<BrowseScrollScope>(cached.scope)
/** How many results are on a page. */
export const browsePageSize = ref<number>(cached.pageSize)

watch(
	[browseScrollScope, browsePageSize],
	() => {
		try {
			localStorage.setItem(
				CACHE_KEY,
				JSON.stringify({ scope: browseScrollScope.value, pageSize: browsePageSize.value }),
			)
		} catch (error) {
			console.warn('Failed to remember how results are paged:', error)
		}
	},
	{ deep: true },
)
