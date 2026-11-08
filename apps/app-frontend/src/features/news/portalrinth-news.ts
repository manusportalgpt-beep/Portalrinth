/**
 * What the launcher reads from the fork sites' news feeds: Portalrinth's and
 * Noctrinth's articles, shown in the sidebar next to Modrinth's.
 */
import { type NewsArticle, useVIntl } from '@modrinth/ui'
import { queryOptions, useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'

import { proxiedFetch } from '@/helpers/proxy-fetch'

const CHANGELOG_SITE = 'https://everelsu.github.io/Portalrinth/'
const NEWS_FEED = `${CHANGELOG_SITE}news/feed/articles.json`

const NOCTRINTH_SITE = 'https://everelsu.github.io/Noctrinth/'
const NOCTRINTH_NEWS_FEED = `${NOCTRINTH_SITE}news/feed/articles.json`

type FeedArticle = Omit<NewsArticle, 'path'> & {
	link: string
	title_ru?: string
	summary_ru?: string
}

/**
 * A site's news articles, from its feed: the same shape as
 * modrinth.com/news/feed/articles.json, plus a Russian title and summary.
 */
function siteNewsQueryOptions(source: string, feedUrl: string) {
	return queryOptions({
		queryKey: ['news', source],
		queryFn: async (): Promise<FeedArticle[]> => {
			const response = await proxiedFetch(feedUrl, { connectTimeout: 8000 })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const feed: { articles?: FeedArticle[] } | null = await response.json()
			return feed?.articles ?? []
		},
		staleTime: 10 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	})
}

/** Portalrinth's news articles, from the site's feed. */
export function portalrinthNewsQueryOptions() {
	return siteNewsQueryOptions('portalrinth-articles', NEWS_FEED)
}

/** Noctrinth's news articles, from the site's feed. */
export function noctrinthNewsQueryOptions() {
	return siteNewsQueryOptions('noctrinth-articles', NOCTRINTH_NEWS_FEED)
}

/** A site's articles as news cards, in the launcher's language where they have it. */
function useSiteNews(options: ReturnType<typeof siteNewsQueryOptions>) {
	const { locale } = useVIntl()
	const feed = useQuery(options)

	return computed<NewsArticle[]>(() => {
		const russian = locale.value.startsWith('ru')
		return (feed.data.value ?? []).map((article) => ({
			path: article.link,
			thumbnail: article.thumbnail,
			title: (russian && article.title_ru) || article.title,
			summary: (russian && article.summary_ru) || article.summary,
			date: article.date,
		}))
	})
}

/** Portalrinth's articles as news cards. */
export function usePortalrinthNews() {
	return useSiteNews(portalrinthNewsQueryOptions())
}

/** Noctrinth's articles as news cards. */
export function useNoctrinthNews() {
	return useSiteNews(noctrinthNewsQueryOptions())
}
