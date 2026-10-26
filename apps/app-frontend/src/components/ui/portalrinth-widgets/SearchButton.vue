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
import { defineMessages, IconButton, useVIntl } from '@modrinth/ui'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

import { portalrinthFeatures } from '@/helpers/portalrinth-features'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: { id: 'app.search.title', defaultMessage: 'Поиск в интернете' },
})

let counter = 0

async function openSearch() {
	if (!portalrinthFeatures.value.search) return
	counter++
	const label = counter > 1 ? `-${counter}` : ''
	const webview = new WebviewWindow(`portalrinth-search${label}`, {
		url: 'https://duckduckgo.com/?kae=d&k1=-1',
		title: 'Поиск — Portalrinth',
		width: 1100,
		height: 760,
		center: true,
		minWidth: 500,
		minHeight: 400,
	})
	webview.once('tauri://error', (error) => {
		console.error('Окно поиска не открылось', error)
	})
}
</script>
