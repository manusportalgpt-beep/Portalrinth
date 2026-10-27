<template>
	<IconButton
		v-tooltip="formatMessage(messages.title)"
		type="quiet"
		:label="formatMessage(messages.title)"
		@click="openSearch"
	>
		<SearchIcon />
	</IconButton>
</template>

<script setup lang="ts">
/**
 * The built-in search: opens DuckDuckGo in its own launcher window, not
 * in the system browser - the player searches without ever leaving the
 * app. The window is plain and movable, closable with a cross like any
 * other window.
 */
import { SearchIcon } from '@modrinth/assets'
import { invoke } from '@tauri-apps/api/core'
import { defineMessages, IconButton, useVIntl } from '@modrinth/ui'

import { portalrinthFeatures } from '@/helpers/portalrinth-features'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: { id: 'app.search.title', defaultMessage: 'Поиск в интернете' },
})

let counter = 0

async function openSearch() {
	if (!portalrinthFeatures.value.search) return
	counter++
	const label = counter > 1 ? `portalrinth-search-${counter}` : 'portalrinth-search'
	try {
		await invoke('open_web_window', {
			label,
			url: 'https://duckduckgo.com/?kae=d&k1=-1',
			title: 'Поиск — Portalrinth',
		})
	} catch (error) {
		console.error('Окно поиска не открылось', error)
	}
}
</script>
