<script setup lang="ts">
import { RefreshCwIcon } from '@modrinth/assets'
import { Button, Toggle, defineMessages, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import {
	modSyncEnabled,
	setModSyncEnabled,
	syncModsFrom,
	syncReport,
	syncRunning,
} from '@/helpers/portalrinth-mods'

import { injectInstanceSettings } from './instance-settings-context'

const { instance } = injectInstanceSettings()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'instance.settings.mods-sync.title',
		defaultMessage: 'Синхронизация модов',
	},
	description: {
		id: 'instance.settings.mods-sync.description',
		defaultMessage:
			'Моды, установленные или обновлённые в этой сборке, сами обновятся во всех остальных сборках, где тот же мод уже стоит. Чего-то нового туда не добавляется — только общие моды держатся одной версии. По умолчанию выключена.',
	},
	enabled: {
		id: 'instance.settings.mods-sync.enabled',
		defaultMessage: 'Синхронизировать общие моды с другими сборками',
	},
	syncNow: {
		id: 'instance.settings.mods-sync.sync-now',
		defaultMessage: 'Синхронизировать сейчас',
	},
	running: {
		id: 'instance.settings.mods-sync.running',
		defaultMessage: 'Сверяю версии…',
	},
})

const enabled = ref(modSyncEnabled(instance.value.id))

function setEnabled(value: boolean) {
	enabled.value = Boolean(value)
	setModSyncEnabled(instance.value.id, enabled.value)
}

async function syncNow() {
	if (syncRunning.value) return
	await syncModsFrom(instance.value.id)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<section class="flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<RefreshCwIcon class="text-brand" />
				{{ formatMessage(messages.title) }}
			</h2>
			<p class="m-0 max-w-3xl text-sm text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
			<Toggle :model-value="enabled" @update:model-value="setEnabled">
				{{ formatMessage(messages.enabled) }}
			</Toggle>
			<div class="flex flex-wrap items-center gap-2">
				<Button :disabled="syncRunning || !enabled" @click="syncNow">
					{{ syncRunning ? formatMessage(messages.running) : formatMessage(messages.syncNow) }}
				</Button>
				<span v-if="syncReport" class="text-sm text-secondary">{{ syncReport }}</span>
			</div>
		</section>
	</div>
</template>
