<script setup lang="ts">
import { SparklesIcon } from '@modrinth/assets'
import { defineMessages, Toggle, useVIntl } from '@modrinth/ui'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import { AI_PROVIDERS, aiSettings, saveAiSettings } from '@/helpers/ai-assistant'

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
		defaultMessage: 'Эффекты чата (печатающийся текст)',
	},
	masterToggle: {
		id: 'app.settings.ai-assistant.enabled',
		defaultMessage: 'Включить ИИ-помощника',
	},
	masterHint: {
		id: 'app.settings.ai-assistant.enabled-hint',
		defaultMessage:
			'Выключишь — вкладка «ИИ-Помощник» исчезнет из настроек, пока не вернёшься сюда.',
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
})

const anyFreeProvider = AI_PROVIDERS.some((p) => !p.needsKey)
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
			<Toggle
				:model-value="aiSettings.enabled"
				@update:model-value="
					(value) => {
						aiSettings.enabled = Boolean(value)
						saveAiSettings()
					}
				"
			>
				{{ formatMessage(messages.masterToggle) }}
				<template v-if="!aiSettings.enabled"> — {{ formatMessage(messages.masterHint) }}</template>
			</Toggle>
			<Toggle
				:model-value="aiSettings.chatEffects"
				@update:model-value="
					(value) => {
						aiSettings.chatEffects = Boolean(value)
						saveAiSettings()
					}
				"
			>
				{{ formatMessage(messages.effects) }}
			</Toggle>
		</section>

		<section class="flex flex-col gap-3">
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
	</div>
</template>
