<script setup>
import { BoxIcon, FolderSearchIcon, KeyIcon } from '@modrinth/assets'
import { defineMessages, IconButton, Input, Slider, useVIntl } from '@modrinth/ui'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { onMounted, ref, watch } from 'vue'

import { get, set } from '@/helpers/settings.ts'

import ContentStorageSettings from './content-storage.vue'

const { formatMessage } = useVIntl()
const settings = ref(await get())

const messages = defineMessages({
	appDirectoryTitle: {
		id: 'app.settings.resource-management.app-directory.title',
		defaultMessage: 'App directory',
	},
	appDirectoryDescription: {
		id: 'app.settings.resource-management.app-directory.description',
		defaultMessage:
			'Where Modrinth App stores instances and other files. Changes take effect after restarting the app.',
	},
	selectAppDirectory: {
		id: 'app.settings.resource-management.app-directory.select',
		defaultMessage: 'Select a new app directory',
	},
	browseAppDirectory: {
		id: 'app.settings.resource-management.app-directory.browse',
		defaultMessage: 'Browse for an app directory',
	},
	curseforgeTitle: {
		id: 'app.settings.resource-management.curseforge.title',
		defaultMessage: 'CurseForge API key',
	},
	curseforgeDescription: {
		id: 'app.settings.resource-management.curseforge.description',
		defaultMessage:
			'CurseForge requires a key for searching, listing files and downloading. Leave this empty to use the key this build was made with, if it has one.',
	},
	curseforgeHint: {
		id: 'app.settings.resource-management.curseforge.hint',
		defaultMessage: 'Create an API token at',
	},
	curseforgeMissing: {
		id: 'app.settings.resource-management.curseforge.missing',
		defaultMessage:
			'No key is configured, so CurseForge is not available anywhere in this launcher.',
	},
	curseforgePresent: {
		id: 'app.settings.resource-management.curseforge.present',
		defaultMessage: 'A key of your own is in use for CurseForge.',
	},
	maximumConcurrentDownloadsTitle: {
		id: 'app.settings.resource-management.maximum-concurrent-downloads.title',
		defaultMessage: 'Maximum concurrent downloads',
	},
	maximumConcurrentDownloadsDescription: {
		id: 'app.settings.resource-management.maximum-concurrent-downloads.description',
		defaultMessage:
			'Number of files the app can download at once. Lower this if downloads are unreliable on your connection. Requires an app restart.',
	},
	maximumConcurrentWritesTitle: {
		id: 'app.settings.resource-management.maximum-concurrent-writes.title',
		defaultMessage: 'Maximum concurrent writes',
	},
	maximumConcurrentWritesDescription: {
		id: 'app.settings.resource-management.maximum-concurrent-writes.description',
		defaultMessage:
			'Number of files the app can write to disk at once. Lower this if you frequently encounter I/O errors. Requires an app restart.',
	},
})

watch(
	settings,
	async () => {
		const setSettings = JSON.parse(JSON.stringify(settings.value))

		if (!setSettings.custom_dir) {
			setSettings.custom_dir = null
		}

		if (!setSettings.curseforge_api_key) {
			setSettings.curseforge_api_key = null
		}

		await set(setSettings)
	},
	{ deep: true },
)

/*
 * Whether a key of the person's own is in force, asked again whenever the
 * settings change: a key can be pasted, changed or cleared while the tab is
 * open, and this is what decides whether CurseForge is reachable at all.
 */
const curseforgeAvailable = ref(false)

async function refreshCurseforgeAvailability() {
	try {
		curseforgeAvailable.value = await invoke(
			'plugin:portalrinth-curseforge|curseforge_is_available',
		)
	} catch {
		// An empty key is the ordinary case, not a failure to report.
		curseforgeAvailable.value = false
	}
}

onMounted(refreshCurseforgeAvailability)

async function findLauncherDir() {
	const newDir = await open({
		multiple: false,
		directory: true,
		title: formatMessage(messages.selectAppDirectory),
	})

	if (newDir) {
		settings.value.custom_dir = newDir
	}
}
</script>

<template>
	<div class="flex flex-col gap-6">
		<ContentStorageSettings />
		<div class="flex flex-col gap-2.5">
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.appDirectoryTitle) }}
			</h2>
			<Input
				id="appDir"
				v-model="settings.custom_dir"
				:icon="BoxIcon"
				type="text"
				wrapper-class="w-full"
			>
				<template #right>
					<IconButton
						v-tooltip="formatMessage(messages.browseAppDirectory)"
						:label="formatMessage(messages.browseAppDirectory)"
						class="ml-1.5"
						@click="findLauncherDir"
					>
						<FolderSearchIcon aria-hidden="true" />
					</IconButton>
				</template>
			</Input>
			<p class="m-0 leading-tight text-secondary">
				{{ formatMessage(messages.appDirectoryDescription) }}
			</p>
		</div>

		<div class="flex flex-col gap-2.5">
			<h2 class="m-0 text-lg font-semibold text-contrast mt-4">
				{{ formatMessage(messages.maximumConcurrentDownloadsTitle) }}
			</h2>
			<Slider
				id="max-downloads"
				v-model="settings.max_concurrent_downloads"
				:min="1"
				:max="10"
				:step="1"
			/>
			<p class="m-0 leading-tight text-secondary">
				{{ formatMessage(messages.maximumConcurrentDownloadsDescription) }}
			</p>
		</div>

		<div class="flex flex-col gap-2.5">
			<h2 class="mt-0 m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.maximumConcurrentWritesTitle) }}
			</h2>
			<Slider
				id="max-writes"
				v-model="settings.max_concurrent_writes"
				:min="1"
				:max="50"
				:step="1"
			/>
			<p class="m-0 leading-tight text-secondary">
				{{ formatMessage(messages.maximumConcurrentWritesDescription) }}
			</p>
		</div>

		<div class="flex flex-col gap-2.5">
			<h2 class="mt-0 m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.curseforgeTitle) }}
			</h2>
			<Input
				id="curseforge-api-key"
				v-model="settings.curseforge_api_key"
				:icon="KeyIcon"
				type="password"
				placeholder="••••••••••••••••"
				wrapper-class="w-full"
			/>
			<p class="m-0 leading-tight text-secondary">
				{{ formatMessage(messages.curseforgeDescription) }}
			</p>
			<span class="text-sm text-secondary">
				{{ formatMessage(messages.curseforgeHint) }}
				<a
					href="https://www.curseforge.com/account/api-tokens"
					target="_blank"
					rel="noopener noreferrer"
					class="font-semibold text-brand hover:underline"
					>curseforge.com</a
				>
			</span>
			<p class="m-0 leading-tight text-secondary">
				{{
					curseforgeAvailable
						? formatMessage(messages.curseforgePresent)
						: formatMessage(messages.curseforgeMissing)
				}}
			</p>
		</div>
	</div>
</template>
