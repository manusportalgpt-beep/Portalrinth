<script setup lang="ts">
import { SparklesIcon } from '@modrinth/assets'
import { Button, defineMessages, Input, SkinPreviewRenderer, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import { AI_PROVIDERS, aiSettings, saveAiSettings } from '@/helpers/ai-assistant'
import { labySkinTextureUrl } from '@/helpers/laby-skins'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	mascotTitle: {
		id: 'app.settings.ai-assistant.mascot.title',
		defaultMessage: 'Маскот',
	},
	mascotDescription: {
		id: 'app.settings.ai-assistant.mascot.description',
		defaultMessage:
			'Маленький друг со скином, который живёт в интерфейсе: ходит по лаунчеру, подсказывает, отвечает в пузыре и умеет выполнять команды. Погладить — Alt + левая кнопка мыши. Всё, что он знает, хранится локально.',
	},
	enableMascot: {
		id: 'app.settings.ai-assistant.enable',
		defaultMessage: 'Показывать маскота',
	},
	effects: {
		id: 'app.settings.ai-assistant.effects',
		defaultMessage: 'Эффекты чата (печатающийся текст)',
	},
	name: {
		id: 'app.settings.ai-assistant.name',
		defaultMessage: 'Имя маскота',
	},
	nameHint: {
		id: 'app.settings.ai-assistant.name-hint',
		defaultMessage: 'Маскот отзывается на это имя в разговоре.',
	},
	skinTitle: {
		id: 'app.settings.ai-assistant.skin.title',
		defaultMessage: 'Скин маскота',
	},
	skinAccount: {
		id: 'app.settings.ai-assistant.skin.account',
		defaultMessage: 'Как у моего аккаунта',
	},
	skinHash: {
		id: 'app.settings.ai-assistant.skin.hash',
		defaultMessage: 'Скин из библиотеки (хэш laby.net)',
	},
	skinHashHint: {
		id: 'app.settings.ai-assistant.skin.hash-hint',
		defaultMessage:
			'Хэш можно взять из адреса любого скина в «Обзоре» — страница скина открывается по клику на него.',
	},
	brainTitle: {
		id: 'app.settings.ai-assistant.brain.title',
		defaultMessage: 'Мозг',
	},
	brainDescription: {
		id: 'app.settings.ai-assistant.brain.description',
		defaultMessage:
			'Одна модель на всё: вкладку «ИИ-Помощник» и маскота. Провайдеров с пометкой «РФ» можно использовать из России без VPN.',
	},
	affection: {
		id: 'app.settings.ai-assistant.affection',
		defaultMessage: 'Расположение маскота',
	},
	affectionHint: {
		id: 'app.settings.ai-assistant.affection-hint',
		defaultMessage: 'Растёт, когда маскота гладят (Alt + ЛКМ). Влияет на его характер.',
	},
	resetAffection: {
		id: 'app.settings.ai-assistant.reset-affection',
		defaultMessage: 'Сбросить',
	},
})

const hashDraft = ref('')

const skinChoice = computed(() => aiSettings.value.mascotSkin || 'steve')

const previewSrc = computed(() => {
	const choice = skinChoice.value
	if (choice === 'steve' || choice === 'alex') {
		return ''
	}
	if (choice === 'account') {
		return accountTexture.value
	}
	if (/^[0-9a-f]{32,64}$/i.test(choice)) {
		return labySkinTextureUrl(choice)
	}
	return ''
})

const accountTexture = ref('')

async function loadAccountTexture() {
	try {
		const { get_available_skins } = await import('@/helpers/skins')
		const skins = await get_available_skins()
		accountTexture.value = (skins.find((s) => s.is_equipped) ?? skins[0])?.texture ?? ''
	} catch {
		accountTexture.value = ''
	}
}

watch(
	() => aiSettings.value.mascotSkin,
	() => {
		hashDraft.value = /^[0-9a-f]{32,64}$/i.test(aiSettings.value.mascotSkin)
			? aiSettings.value.mascotSkin
			: ''
	},
	{ immediate: true },
)

if (aiSettings.value.mascotSkin === 'account') void loadAccountTexture()

const mascotNameModel = computed({
	get: () => aiSettings.value.mascotName,
	set: (value: string) => {
		aiSettings.value.mascotName = value
		saveAiSettings()
	},
})

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

function resetAffection() {
	aiSettings.value.affection = 20
	saveAiSettings()
}

const anyFreeProvider = AI_PROVIDERS.some((p) => !p.needsKey)
</script>

<template>
	<div class="flex flex-col gap-6">
		<section class="flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<SparklesIcon class="text-brand" />
				{{ formatMessage(messages.mascotTitle) }}
			</h2>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.mascotDescription) }}</p>
			<div class="flex flex-col gap-3">
				<Toggle
					:model-value="aiSettings.mascotEnabled"
					@update:model-value="
						(value) => {
							aiSettings.mascotEnabled = Boolean(value)
							saveAiSettings()
						}
					"
				>
					{{ formatMessage(messages.enableMascot) }}
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
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.name) }}</span>
				<Input v-model="mascotNameModel" autocomplete="off" maxlength="24" class="max-w-xs" />
				<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.nameHint) }}</p>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-sm font-semibold text-primary">{{
					formatMessage(messages.skinTitle)
				}}</span>
				<div class="flex flex-wrap items-start gap-4">
					<div
						class="h-48 w-36 shrink-0 overflow-hidden rounded-2xl border border-solid border-surface-5 bg-surface-2"
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
								{{ formatMessage(messages.skinAccount) }}
							</Button>
						</div>
						<div class="flex flex-col gap-1">
							<span class="text-sm font-semibold text-primary">
								{{ formatMessage(messages.skinHash) }}
							</span>
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
							<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.skinHashHint) }}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold text-primary">
					{{ formatMessage(messages.affection) }} — {{ aiSettings.affection }}%
				</span>
				<div class="flex items-center gap-2">
					<div class="affection-bar h-2 w-48 overflow-hidden rounded-full bg-surface-5">
						<div
							class="affection-fill h-full rounded-full transition-all"
							:style="{ width: `${aiSettings.affection}%` }"
						/>
					</div>
					<Button size="sm" @click="resetAffection">{{
						formatMessage(messages.resetAffection)
					}}</Button>
				</div>
				<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.affectionHint) }}</p>
			</div>
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

<style scoped>
.affection-fill {
	background: linear-gradient(90deg, var(--color-red), var(--color-brand));
}
</style>
