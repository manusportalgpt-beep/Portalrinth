<script setup lang="ts">
import { SparklesIcon } from '@modrinth/assets'
import { Button, defineMessages, Input, SkinPreviewRenderer, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import { injectSettingsActions } from '@/features/settings/settings-actions'
import { aiSettings, saveAiSettings } from '@/helpers/ai-assistant'
import { labySkinTextureUrl } from '@/helpers/laby-skins'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'app.settings.ai-assistant.skin.mascot-section',
		defaultMessage: 'Маскот',
	},
	description: {
		id: 'app.settings.ai-assistant.skin.mascot-section-description',
		defaultMessage:
			'Свой скин для маленького друга из вкладки «ИИ-Помощник». Он ходит по лаунчеру, помогает и с ним можно переписываться из любого экрана.',
	},
	account: {
		id: 'app.settings.ai-assistant.skin.account',
		defaultMessage: 'Как у моего аккаунта',
	},
	hash: {
		id: 'app.settings.ai-assistant.skin.hash',
		defaultMessage: 'Скин из библиотеки (хэш laby.net)',
	},
	openSettings: {
		id: 'app.settings.ai-assistant.skin.open-settings',
		defaultMessage: 'Настроить маскота',
	},
})

const hashDraft = ref('')
const accountTexture = ref('')

const skinChoice = computed(() => aiSettings.value.mascotSkin || 'steve')

const previewSrc = computed(() => {
	const choice = skinChoice.value
	if (choice === 'account') return accountTexture.value
	if (/^[0-9a-f]{32,64}$/i.test(choice)) return labySkinTextureUrl(choice)
	return ''
})

watch(
	() => aiSettings.value.mascotSkin,
	() => {
		hashDraft.value = /^[0-9a-f]{32,64}$/i.test(aiSettings.value.mascotSkin)
			? aiSettings.value.mascotSkin
			: ''
	},
	{ immediate: true },
)

async function loadAccountTexture() {
	try {
		const { get_available_skins } = await import('@/helpers/skins')
		const skins = await get_available_skins()
		accountTexture.value = (skins.find((s) => s.is_equipped) ?? skins[0])?.texture ?? ''
	} catch {
		accountTexture.value = ''
	}
}

if (skinChoice.value === 'account') void loadAccountTexture()

function setSkin(choice: string) {
	aiSettings.value.mascotSkin = choice
	saveAiSettings()
	if (choice === 'account') void loadAccountTexture()
}

function applyHash() {
	const value = hashDraft.value.trim()
	if (/^[0-9a-f]{32,64}$/i.test(value)) {
		setSkin(value.toLowerCase())
	} else if (value === '') {
		setSkin('steve')
	}
}

const settingsActions = injectSettingsActions()

function openSettings() {
	settingsActions?.openSettings()
}
</script>

<template>
	<section class="flex flex-col gap-4 mt-1">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<SparklesIcon class="text-brand" />
				{{ formatMessage(messages.title) }}
			</h2>
			<Button @click="openSettings">{{ formatMessage(messages.openSettings) }}</Button>
		</div>
		<p class="text-secondary m-0">{{ formatMessage(messages.description) }}</p>
		<div class="flex flex-wrap items-start gap-4">
			<div
				class="h-44 w-32 shrink-0 overflow-hidden rounded-2xl border border-solid border-surface-5 bg-surface-2"
			>
				<SkinPreviewRenderer
					v-if="previewSrc"
					:texture-src="previewSrc"
					:variant="skinChoice === 'alex' ? 'SLIM' : 'CLASSIC'"
					walk
				/>
				<div v-else class="flex h-full items-center justify-center text-sm text-secondary">
					{{ skinChoice === 'steve' ? 'Steve' : 'Alex' }}
				</div>
			</div>
			<div class="flex min-w-64 flex-col gap-2">
				<div class="flex flex-wrap gap-2">
					<Button
						:type="skinChoice === 'steve' ? 'colored' : 'base'"
						color="brand"
						@click="() => setSkin('steve')"
					>
						Steve
					</Button>
					<Button
						:type="skinChoice === 'alex' ? 'colored' : 'base'"
						color="brand"
						@click="() => setSkin('alex')"
					>
						Alex
					</Button>
					<Button
						:type="skinChoice === 'account' ? 'colored' : 'base'"
						color="brand"
						@click="() => setSkin('account')"
					>
						{{ formatMessage(messages.account) }}
					</Button>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.hash) }}</span>
					<div class="flex gap-2">
						<Input
							v-model="hashDraft"
							autocomplete="off"
							placeholder="64-символьный хэш"
							class="max-w-xs"
							@keydown.enter.prevent="applyHash"
						/>
						<Button @click="applyHash">OK</Button>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>
