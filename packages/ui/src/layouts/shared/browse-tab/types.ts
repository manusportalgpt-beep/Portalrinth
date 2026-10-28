import type { Labrinth } from '@modrinth/api-client'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export interface BrowseSearchResponse {
	projectHits: (Labrinth.Search.v3.ResultSearchProject & {
		installed?: boolean
		installing?: boolean
	})[]
	serverHits: Labrinth.Search.v3.ResultSearchProject[]
	total_hits: number
	per_page: number
}

export interface BrowseSelectedProject {
	id: string
	name: string
	iconUrl?: string | null
}

export interface BrowseInstallContext {
	name: string
	loader: string
	gameVersion: string
	serverId?: string | null
	upstream?: { project_id?: string | null } | null
	iconSrc?: string | null
	isMedal?: boolean
	backUrl: string | RouteLocationRaw
	backLabel: string
	heading: string
	warning?: string
	queuedCount?: number
	queuedLabel?: string
	clearQueued?: () => void | Promise<void>
	onBack?: () => boolean | void | Promise<boolean | void>
	selectedProjects?: BrowseSelectedProject[]
	isInstallingSelected?: boolean
	skipNonEssentialWarnings?: boolean
	installProgress?: {
		completed: number
		total: number
	}
	clearSelected?: () => void | Promise<void>
	discardSelectedAndBack?: () => void | Promise<void>
	installSelected?: () => boolean | void | Promise<boolean | void>
}

export interface CardAction {
	key: string
	label: string
	icon: Component
	iconClass?: string
	disabled?: boolean
	color?: 'brand' | 'red' | 'green'
	type?: 'standard' | 'outlined' | 'transparent'
	circular?: boolean
	tooltip?: string
	onClick: () => void | Promise<void>
}

/**
 * Where a card's project can be installed from, when Discover lists two
 * platforms at once. Two options draw a small toggle before the install
 * button (pick the one to install from); a single option draws a badge
 * naming the only platform the project is on.
 */
export interface CardSourceOption {
	key: string
	label: string
	icon: Component
	/** Icon colour, so each platform keeps its own. */
	iconClass?: string
	active: boolean
	onSelect: () => void
}

export interface CardSources {
	label: string
	options: CardSourceOption[]
}

export interface ServerModpackContent {
	name: string
	icon?: string
	onclick?: () => void
	showCustomModpackTooltip: boolean
}
