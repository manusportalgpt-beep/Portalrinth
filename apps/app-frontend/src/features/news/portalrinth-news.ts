/**
 * What the launcher reads from Portalrinth's site: the news articles shown in the
 * sidebar next to Modrinth's - and the changelog the Changelog settings tab
 * shows, which is read straight from the repository's commits, so a change
 * appears there the moment it lands on main, with nobody writing it in.
 */
import { type NewsArticle, useVIntl } from '@modrinth/ui'
import { queryOptions, useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'

import type { PortalrinthVersionEntry } from '@/helpers/portalrinth-changelog'
import { proxiedFetch } from '@/helpers/proxy-fetch'

const CHANGELOG_SITE = 'https://everelsu.github.io/Portalrinth/'
const NEWS_FEED = `${CHANGELOG_SITE}news/feed/articles.json`

/** The fork's own repository: its commit history IS the changelog. */
const GITHUB_API = 'https://api.github.com/repos/manusportalgpt-beep/Portalrinth'

function isEntry(value: unknown): value is PortalrinthVersionEntry {
	const entry = value as Partial<PortalrinthVersionEntry> | null
	return (
		(entry?.version === undefined || typeof entry.version === 'string') &&
		typeof entry.date === 'string' &&
		typeof entry.body === 'string'
	)
}

/** One commit as the GitHub API hands it over - only the fields read here. */
interface GithubCommit {
	sha: string
	commit?: { message?: string; author?: { date?: string } }
	parents?: unknown[]
}

/** One tag: `v`-prefixed names are release versions, keyed by their commit. */
interface GithubTag {
	name?: string
	commit?: { sha?: string }
}

const ROUND_TITLE_RE = /^(Раунд\s+\d+[^:]*):?\s*(.*)$/i

/**
 * A commit message as a changelog body: the leading «Раунд N: …» becomes a
 * section heading, the `;`-separated rest of the line becomes bullets, and
 * any further lines come along as bullets too - the exact shape the tab
 * already renders, produced from what was written anyway.
 */
function entryFromCommit(commit: GithubCommit, version?: string): PortalrinthVersionEntry {
	const message = (commit.commit?.message ?? '').trim()
	const lines = message.split('\n')
	const firstLine = (lines[0] ?? '').trim()
	const round = ROUND_TITLE_RE.exec(firstLine)
	// «Раунд N: item; item» → heading «Раунд N», bullets after the colon. Any
	// other commit splits on its first colon the same way; without one, the
	// whole line is the heading and there are no bullets to repeat it.
	let title = firstLine.slice(0, 80) || commit.sha.slice(0, 9)
	let rest = ''
	if (round) {
		title = round[1].trim()
		rest = round[2]
	} else {
		const colon = firstLine.indexOf(':')
		if (colon > 0 && colon < 60) {
			title = firstLine.slice(0, colon).trim()
			rest = firstLine.slice(colon + 1)
		}
	}
	const items = rest
		.split(';')
		.map((item) => item.trim())
		.filter(Boolean)
	for (const line of lines.slice(1)) {
		const item = line.trim()
		if (item) items.push(item)
	}
	const body = [`### ${title}`, '', ...items.map((item) => `- ${item}`)].join('\n')
	return { version, date: commit.commit?.author?.date ?? '', body }
}

/**
 * The changelog as the repository stands right now, which is newer than this
 * build's whenever anything has been pushed since: every commit on main is an
 * entry the moment it lands, tagged ones under their version. Merges are not
 * changes; the site feed stays as a shape-checked fallback for offline.
 */
export function portalrinthChangelogFeedQueryOptions() {
	return queryOptions({
		queryKey: ['portalrinth-changelog-feed'],
		queryFn: async (): Promise<PortalrinthVersionEntry[]> => {
			const headers = { Accept: 'application/vnd.github+json' }
			const commitsResponse = await proxiedFetch(`${GITHUB_API}/commits?per_page=30`, {
				headers,
				connectTimeout: 8000,
				signal: AbortSignal.timeout(12000),
			})
			if (!commitsResponse.ok) throw new Error(`HTTP ${commitsResponse.status}`)
			const commits: unknown = await commitsResponse.json()
			if (!Array.isArray(commits) || commits.length === 0) {
				throw new Error('The commit list is empty or malformed')
			}

			// Versions come from the repository's own tags; without them the tab
			// just dates the entry, which is honest for an untagged push.
			const tagsBySha = new Map<string, string>()
			try {
				const tagsResponse = await proxiedFetch(`${GITHUB_API}/tags?per_page=100`, {
					headers,
					connectTimeout: 8000,
					signal: AbortSignal.timeout(12000),
				})
				if (tagsResponse.ok) {
					const tags: unknown = await tagsResponse.json()
					if (Array.isArray(tags)) {
						for (const tag of tags as GithubTag[]) {
							if (tag.name && tag.commit?.sha) {
								tagsBySha.set(tag.commit.sha, tag.name.replace(/^v/, ''))
							}
						}
					}
				}
			} catch {
				// Unnamed commits are fine; the dates still tell the story.
			}

			const entries = (commits as GithubCommit[])
				.filter((commit) => (commit.parents?.length ?? 1) <= 1)
				.map((commit) => entryFromCommit(commit, tagsBySha.get(commit.sha)))
				.filter(isEntry)
			if (entries.length === 0) throw new Error('No changelog entries in the commit history')
			return entries
		},
		staleTime: 10 * 60 * 1000,
		retry: 1,
	})
}

type FeedArticle = Omit<NewsArticle, 'path'> & {
	link: string
	title_ru?: string
	summary_ru?: string
}

/**
 * Portalrinth's news articles, from the site's feed: the same shape as
 * modrinth.com/news/feed/articles.json, plus a Russian title and summary.
 */
export function portalrinthNewsQueryOptions() {
	return queryOptions({
		queryKey: ['news', 'portalrinth-articles'],
		queryFn: async (): Promise<FeedArticle[]> => {
			const response = await proxiedFetch(NEWS_FEED, { connectTimeout: 8000 })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const feed: { articles?: FeedArticle[] } | null = await response.json()
			return feed?.articles ?? []
		},
		staleTime: 10 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	})
}

/** Those articles as news cards, in the launcher's language where they have it. */
export function usePortalrinthNews() {
	const { locale } = useVIntl()
	const feed = useQuery(portalrinthNewsQueryOptions())

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
