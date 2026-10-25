<script setup>
import { BoxIcon, CheckIcon, FolderSearchIcon, KeyIcon } from '@modrinth/assets'
import { defineMessages, IconButton, Input, Slider, useVIntl } from '@modrinth/ui'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { onMounted, ref, watch } from 'vue'

import { get, set } from '@/helpers/settings.ts'
import { setSkinRenderService, useSkinRenderService } from '@/helpers/skin-render-service'

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
	skinServicesTitle: {
		id: 'app.settings.resource-management.skin-services.title',
		defaultMessage: 'Skin services',
	},
	skinServicesDescription: {
		id: 'app.settings.resource-management.skin-services.description',
		defaultMessage:
			'Who draws the 3D previews of skins. One service works at a time, everywhere previews are shown, and it can be switched.',
	},
	skinServicesLaby: {
		id: 'app.settings.resource-management.skin-services.laby',
		defaultMessage:
			"The skin library's own render: understands the hashes of every skin in Discover. Chosen by default.",
	},
	skinServicesCrafty: {
		id: 'app.settings.resource-management.skin-services.crafty',
		defaultMessage:
			'Renders by texture hash, but only knows the textures Mojang has indexed - library skins can come out as the default Steve.',
	},
	skinServicesMcskin: {
		id: 'app.settings.resource-management.skin-services.mcskin',
		defaultMessage:
			'Renders players by name or UUID and has no render for a bare texture hash, so previews are drawn by the launcher itself.',
	},
})

const skinService = useSkinRenderService()

const skinServiceOptions = [
	{ id: 'laby', name: 'Laby.net', description: messages.skinServicesLaby },
	{ id: 'crafty', name: 'Crafty.gg', description: messages.skinServicesCrafty },
	{ id: 'mcskin', name: 'mcskin.me', description: messages.skinServicesMcskin },
]

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

		<div class="flex flex-col gap-2.5">
			<h2 class="mt-0 m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.skinServicesTitle) }}
			</h2>
			<p class="m-0 leading-tight text-secondary">
				{{ formatMessage(messages.skinServicesDescription) }}
			</p>
			<div class="mt-1 flex flex-col gap-2">
				<button
					v-for="option in skinServiceOptions"
					:key="option.id"
					type="button"
					class="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border-2 border-solid p-4 text-left transition-colors"
					:class="
						skinService === option.id
							? 'border-contrast bg-surface-2'
							: 'border-surface-5 hover:border-surface-4'
					"
					:aria-pressed="skinService === option.id"
					@click="setSkinRenderService(option.id)"
				>
					<span class="flex min-w-0 flex-col gap-1">
						<span class="font-semibold text-contrast">{{ option.name }}</span>
						<span class="text-sm leading-snug text-secondary">
							{{ formatMessage(option.description) }}
						</span>
					</span>
					<CheckIcon
						v-if="skinService === option.id"
						class="size-5 shrink-0 text-contrast"
					/>
				</button>
			</div>
		</div>
	</div>
</template>
