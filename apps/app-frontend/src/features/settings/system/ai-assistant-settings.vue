<script setup lang="ts">
import { HammerIcon, SparklesIcon, TrashIcon } from '@modrinth/assets'
import { Button, defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { onMounted, ref } from 'vue'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import { AI_PROVIDERS, aiSettings, saveAiSettings } from '@/helpers/ai-assistant'
import { formatSize, gradleRemove, type GradleStatus, gradleStatus } from '@/helpers/ai-sandbox'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	assistantTitle: {
		id: 'app.settings.ai-assistant.assistant.title',
		defaultMessage: 'Помощник',
	},
	assistantDescription: {
		id: 'app.settings.ai-assistant.assistant.description',
		defaultMessage:
			'Вкладка «ИИ-Помощник»: отвечает на вопросы, ищет в интернете, работает с файлами в своей песочнице и управляет лаунчером. Всё, что он знает, хранится локально.',
	},
	effects: {
		id: 'app.settings.ai-assistant.effects',
		defaultMessage: 'Эффекты чата',
	},
	effectsHint: {
		id: 'app.settings.ai-assistant.effects-hint',
		defaultMessage: 'Ответ печатается по буквам, код появляется с анимацией.',
	},
	masterToggle: {
		id: 'app.settings.ai-assistant.enabled',
		defaultMessage: 'Включить ИИ-помощника',
	},
	masterHint: {
		id: 'app.settings.ai-assistant.enabled-hint',
		defaultMessage: 'Если выключить, вкладка ИИ и маскот скрываются из лаунчера.',
	},
	brainTitle: {
		id: 'app.settings.ai-assistant.brain.title',
		defaultMessage: 'Мозг',
	},
	brainDescription: {
		id: 'app.settings.ai-assistant.brain.description',
		defaultMessage:
			'Одна модель на всё: ответы, инструменты и песочница. Провайдеров с пометкой «РФ» можно использовать из России без VPN.',
	},
	gradleTitle: {
		id: 'app.settings.ai-assistant.gradle.title',
		defaultMessage: 'Сборка модов (Gradle)',
	},
	gradleDescription: {
		id: 'app.settings.ai-assistant.gradle.description',
		defaultMessage:
			'Порталус собирает моды через Gradle прямо в лаунчере. Gradle и нужный JDK скачиваются только при первой сборке и не входят в установщик.',
	},
	gradleInstalled: {
		id: 'app.settings.ai-assistant.gradle.installed',
		defaultMessage: 'Gradle {version} скачан · занято {size}',
	},
	gradleMissing: {
		id: 'app.settings.ai-assistant.gradle.missing',
		defaultMessage: 'Не скачан · занято {size}',
	},
	gradleRemove: {
		id: 'app.settings.ai-assistant.gradle.remove',
		defaultMessage: 'Удалить Gradle и кэш',
	},
})

const anyFreeProvider = AI_PROVIDERS.some((p) => !p.needsKey)

const gradle = ref<GradleStatus | null>(null)
const gradleBusy = ref(false)

async function refreshGradle() {
	gradle.value = await gradleStatus().catch(() => null)
}

async function removeGradle() {
	gradleBusy.value = true
	try {
		await gradleRemove()
	} finally {
		gradleBusy.value = false
		await refreshGradle()
	}
}

onMounted(refreshGradle)
</script>

<template>
	<div class="flex flex-col gap-6">
		<section class="flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<SparklesIcon class="text-brand" />
				{{ formatMessage(messages.assistantTitle) }}
			</h2>
			<p class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.assistantDescription) }}
			</p>
			<div class="flex items-center justify-between gap-4">
				<label for="ai-enabled" class="flex flex-col">
					<span class="font-semibold text-contrast">{{ formatMessage(messages.masterToggle) }}</span>
					<span class="text-sm text-secondary">{{ formatMessage(messages.masterHint) }}</span>
				</label>
				<Toggle
					id="ai-enabled"
					:model-value="aiSettings.enabled"
					@update:model-value="
						(value) => {
							aiSettings.enabled = Boolean(value)
							saveAiSettings()
						}
					"
				/>
			</div>
			<div v-if="aiSettings.enabled" class="flex items-center justify-between gap-4">
				<label for="ai-chat-effects" class="flex flex-col">
					<span class="font-semibold text-contrast">{{ formatMessage(messages.effects) }}</span>
					<span class="text-sm text-secondary">{{ formatMessage(messages.effectsHint) }}</span>
				</label>
				<Toggle
					id="ai-chat-effects"
					:model-value="aiSettings.chatEffects"
					@update:model-value="
						(value) => {
							aiSettings.chatEffects = Boolean(value)
							saveAiSettings()
						}
					"
				/>
			</div>
		</section>

		<section v-if="aiSettings.enabled" class="flex flex-col gap-3">
			<h2 class="m-0 text-lg font-bold text-primary">{{ formatMessage(messages.brainTitle) }}</h2>
			<p class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.brainDescription) }}
				<template v-if="anyFreeProvider">
					{{
						formatMessage({
							id: 'app.ai.settings.fallback',
							defaultMessage:
								'Если у основного кончатся лимиты, ответ придёт от запасного провайдера без ключа.',
						})
					}}
				</template>
			</p>
			<AiProviderSettings />
		</section>

		<section v-if="aiSettings.enabled && gradle" class="flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<HammerIcon />
				{{ formatMessage(messages.gradleTitle) }}
			</h2>
			<p class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.gradleDescription) }}
			</p>
			<div class="flex items-center justify-between gap-4">
				<span class="text-sm text-contrast">
					{{
						formatMessage(gradle.installed ? messages.gradleInstalled : messages.gradleMissing, {
							version: gradle.version,
							size: formatSize(gradle.bytes),
						})
					}}
				</span>
				<Button :disabled="gradleBusy || gradle.bytes === 0" @click="removeGradle">
					<TrashIcon />
					{{ formatMessage(messages.gradleRemove) }}
				</Button>
			</div>
		</section>
	</div>
</template>
