<script setup lang="ts">
import { ChevronDownIcon, ExternalIcon, EyeIcon, EyeOffIcon, KeyIcon, XIcon } from '@modrinth/assets'
import { Button, Input, Toggle, useVIntl } from '@modrinth/ui'
import { computed, onMounted, ref } from 'vue'

import {
	AI_IMAGE_PROVIDERS,
	AI_PROVIDERS,
	type AiProvider,
	aiSettings,
	bridgeInfo,
	bridgeStatus,
	bridgeToggling,
	chosenModel,
	imageProviderById,
	isModelEnabled,
	saveAiSettings,
	startBridge,
	stopBridge,
	testProvider,
} from '@/helpers/ai-assistant'

defineProps<{
	/** Inside the chat's model popover: only the talking essentials, so
	 * the popover stays short and the model list is never clipped. */
	compact?: boolean
}>()

const { formatMessage } = useVIntl()
const messages = {
	workGroup: { id: 'app.ai.settings.group.work', defaultMessage: 'Для работы' },
	imageGroup: {
		id: 'app.ai.settings.group.image',
		defaultMessage: 'Для генерации изображений',
	},
	model: { id: 'app.ai.settings.model', defaultMessage: 'Модель' },
	key: { id: 'app.ai.settings.key', defaultMessage: 'API-ключ' },
	keyPlaceholder: {
		id: 'app.ai.settings.key.placeholder',
		defaultMessage: 'Вставьте API-ключ этого провайдера',
	},
	getKey: { id: 'app.ai.settings.getkey', defaultMessage: 'Получить ключ' },
	showKey: { id: 'app.ai.settings.showkey', defaultMessage: 'Показать ключ' },
	hideKey: { id: 'app.ai.settings.hidekey', defaultMessage: 'Скрыть ключ' },
	pickerHint: {
		id: 'app.ai.settings.picker.hint',
		defaultMessage: 'Выберите модель — список сгруппирован по провайдерам',
	},
	manage: { id: 'app.ai.settings.manage', defaultMessage: 'Управление моделями' },
	done: { id: 'app.ai.settings.done', defaultMessage: 'Готово' },
	manageHint: {
		id: 'app.ai.settings.manage.hint',
		defaultMessage: 'Нажмите на название провайдера, чтобы вставить ключ. Ползунок прячет модель из выбора выше.',
	},
	keyMissing: {
		id: 'app.ai.settings.key.missing',
		defaultMessage: 'Без ключа модели этого провайдера не работают — вставьте его здесь.',
	},
	allOff: {
		id: 'app.ai.settings.models.alloff',
		defaultMessage: 'Все модели этого провайдера выключены',
	},
	customBase: {
		id: 'app.ai.settings.custombase',
		defaultMessage: 'Адрес (OpenAI-совместимый)',
	},
	customModel: { id: 'app.ai.settings.custommodel', defaultMessage: 'Имя модели' },
	noteFree: {
		id: 'app.ai.settings.note.free',
		defaultMessage:
			'Бесплатно, без ключа. Если модель занята, лаунчер сам подхватит запасного провайдера.',
	},
	fallback: {
		id: 'app.ai.settings.fallback',
		defaultMessage:
			'Если у основного кончатся лимиты, ответ придёт от запасного провайдера без ключа.',
	},
	test: { id: 'app.ai.settings.test', defaultMessage: 'Проверить связь' },
	testRunning: {
		id: 'app.ai.settings.test.running',
		defaultMessage: 'Проверяю связь…',
	},
	testOk: {
		id: 'app.ai.settings.test.ok',
		defaultMessage: 'Связь есть — ИИ отвечает',
	},
	testFail: {
		id: 'app.ai.settings.test.fail',
		defaultMessage: 'Не отвечает',
	},
	bridge: { id: 'app.ai.bridge', defaultMessage: 'Мост' },
	bridgeHint: {
		id: 'app.ai.bridge.hint',
		defaultMessage:
			'Мост поднимает локальную страницу: открой адрес в браузере на этом же компьютере, введи ключ — и общайся с Порталусом со страницы. Всё работает через лаунчер, без облака и бесплатно.',
	},
	bridgeStart: { id: 'app.ai.bridge.start', defaultMessage: 'Запустить' },
	bridgeStop: { id: 'app.ai.bridge.stop', defaultMessage: 'Остановить' },
	bridgeCopy: { id: 'app.ai.bridge.copy', defaultMessage: 'Скопировать адрес и ключ' },
	bridgeCopied: { id: 'app.ai.bridge.copied', defaultMessage: 'Скопировано!' },
	bridgeRunning: { id: 'app.ai.bridge.running', defaultMessage: 'Работает' },
	bridgeIdle: { id: 'app.ai.bridge.idle', defaultMessage: 'Выключен' },
	skills: { id: 'app.ai.skills', defaultMessage: 'Скиллы' },
	skillsHint: {
		id: 'app.ai.skills.hint',
		defaultMessage:
			'Скилл - постоянная инструкция для ИИ (что уметь и как себя вести). ИИ тоже может ставить их сам через <<skill_save|имя::описание>>.',
	},
	skillsEmpty: {
		id: 'app.ai.skills.empty',
		defaultMessage: 'Скиллов пока нет - добавь свой ниже.',
	},
	skillName: { id: 'app.ai.skills.name', defaultMessage: 'Название скилла' },
	skillText: {
		id: 'app.ai.skills.text',
		defaultMessage: 'Что уметь и как (инструкция)',
	},
	skillAdd: { id: 'app.ai.skills.add', defaultMessage: 'Установить скилл' },
}

const showImageKey = ref(false)
const managing = ref(false)
const openGroups = ref<Record<string, boolean>>({ [aiSettings.value.provider]: true })
const showKeyFor = ref<Record<string, boolean>>({})

const provider = computed<AiProvider>(
	() => AI_PROVIDERS.find((p) => p.id === aiSettings.value.provider) ?? AI_PROVIDERS[0],
)

const imageProvider = computed(
	() => imageProviderById(aiSettings.value.imageProvider) ?? AI_IMAGE_PROVIDERS[0],
)

function toggleGroup(id: string) {
	openGroups.value = { ...openGroups.value, [id]: !openGroups.value[id] }
}

function groupOpen(id: string): boolean {
	return Boolean(openGroups.value[id])
}

function modelKey(providerId: string, modelId: string): string {
	return `${providerId}::${modelId}`
}

function modelOn(providerId: string, modelId: string): boolean {
	return isModelEnabled(aiSettings.value, providerId, modelId)
}

function toggleModel(providerId: string, modelId: string) {
	const next = { ...aiSettings.value.disabledModels }
	next[modelKey(providerId, modelId)] = modelOn(providerId, modelId)
	saveAiSettings({ disabledModels: next })
}

function enabledModels(p: AiProvider) {
	return p.models.filter((model) => modelOn(p.id, model.id))
}

function selectModel(p: AiProvider, modelId: string) {
	aiSettings.value.provider = p.id
	aiSettings.value.models = { ...aiSettings.value.models, [p.id]: modelId }
	saveAiSettings()
}

function chosenId(p: AiProvider): string {
	return chosenModel(aiSettings.value, p.id)
}

function keyOf(id: string): string {
	return aiSettings.value.keys[id] ?? ''
}

function setKeyOf(id: string, value: string) {
	aiSettings.value.keys = { ...aiSettings.value.keys, [id]: value }
	saveAiSettings()
}

function hasKey(p: AiProvider): boolean {
	return !p.needsKey || keyOf(p.id).trim().length > 0
}

function keyShown(id: string): boolean {
	return Boolean(showKeyFor.value[id])
}

function toggleKeyShown(id: string) {
	showKeyFor.value = { ...showKeyFor.value, [id]: !keyShown(id) }
}

function keyDomain(p: AiProvider): string {
	if (!p.keyUrl) return ''
	try {
		return new URL(p.keyUrl).hostname.replace(/^www\./, '')
	} catch {
		return p.keyUrl
	}
}

const imageKeyValue = computed({
	get: () => aiSettings.value.imageKeys[imageProvider.value.id] ?? '',
	set: (value: string) => {
		aiSettings.value.imageKeys = {
			...aiSettings.value.imageKeys,
			[imageProvider.value.id]: value,
		}
		saveAiSettings()
	},
})

const customBase = computed({
	get: () => aiSettings.value.customBaseUrl,
	set: (value: string) => {
		aiSettings.value.customBaseUrl = value
		saveAiSettings()
	},
})

const customModelName = computed({
	get: () => aiSettings.value.customModel,
	set: (value: string) => {
		aiSettings.value.customModel = value
		saveAiSettings()
	},
})

function openKeyPage(url?: string) {
	if (!url) return
	// window.open does nothing inside a Tauri webview: the key page must be
	// opened by the system browser through the opener plugin.
	void (async () => {
		try {
			const { openUrl } = await import('@tauri-apps/plugin-opener')
			await openUrl(url)
		} catch {
			console.error('Страница ключа не открылась', url)
		}
	})()
}

const testState = ref<'idle' | 'running' | 'ok' | 'fail'>('idle')
const testResult = ref('')

async function runConnectionTest() {
	if (testState.value === 'running') return
	testState.value = 'running'
	testResult.value = ''
	try {
		testResult.value = await testProvider()
		testState.value = 'ok'
	} catch (error) {
		testResult.value = String((error as Error)?.message ?? error).slice(0, 240)
		testState.value = 'fail'
	}
}

// ---- Skills ---------------------------------------------------------------

const skills = computed(() => aiSettings.value.skills ?? [])
const newSkillName = ref('')
const newSkillText = ref('')

function addSkill() {
	const name = newSkillName.value.trim()
	const text = newSkillText.value.trim()
	if (!name || !text) return
	saveAiSettings({
		skills: [...skills.value, { id: `skill-${Date.now()}`, name, text, on: true }],
	})
	newSkillName.value = ''
	newSkillText.value = ''
}

function removeSkill(id: string) {
	saveAiSettings({ skills: skills.value.filter((skill) => skill.id !== id) })
}

function toggleSkill(id: string) {
	saveAiSettings({
		skills: skills.value.map((skill) => (skill.id === id ? { ...skill, on: !skill.on } : skill)),
	})
}

// ---- The bridge -----------------------------------------------------------

const bridgeCopied = ref(false)

async function toggleBridge() {
	if (bridgeToggling.value) return
	bridgeToggling.value = true
	try {
		if (bridgeInfo.value) {
			await stopBridge()
		} else {
			await startBridge()
		}
	} catch {
		/* the status dot simply stays off */
	} finally {
		bridgeToggling.value = false
	}
}

async function copyBridgeDetails() {
	const info = bridgeInfo.value
	if (!info) return
	try {
		await navigator.clipboard.writeText(`${info.url} — ключ: ${info.key}`)
		bridgeCopied.value = true
		setTimeout(() => {
			bridgeCopied.value = false
		}, 1500)
	} catch {
		/* the clipboard may refuse - the fields are visible anyway */
	}
}

onMounted(() => {
	void bridgeStatus().catch(() => {})
})
</script>

<template>
	<div class="flex flex-col" :class="compact ? 'gap-3' : 'gap-4'">
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">{{
				formatMessage(messages.workGroup)
			}}</span>
			<p v-if="!managing" class="ai-model-hint m-0">{{ formatMessage(messages.pickerHint) }}</p>
			<p v-else class="ai-model-hint m-0">{{ formatMessage(messages.manageHint) }}</p>

			<div v-for="p in AI_PROVIDERS" :key="p.id" class="ai-provider-group">
				<button type="button" class="ai-provider-head" @click="() => toggleGroup(p.id)">
					<span class="ai-provider-name">{{ p.label }}</span>
					<span v-if="p.fromRussia" class="ai-badge ai-badge-rf">РФ</span>
					<span v-if="!p.needsKey" class="ai-badge ai-badge-free">free</span>
					<span v-if="p.needsKey && !hasKey(p)" class="ai-badge ai-badge-key">нужен ключ</span>
					<ChevronDownIcon class="ai-provider-chevron" :class="{ 'ai-provider-chevron--open': groupOpen(p.id) }" />
				</button>

				<div v-if="groupOpen(p.id)" class="ai-provider-body">
					<!-- Manage view: key first, then per-model switches -->
					<template v-if="managing">
						<div v-if="p.id === 'custom'" class="flex flex-col gap-2 py-1">
							<Input v-model="customBase" autocomplete="off" placeholder="http://localhost:1234/v1/chat/completions" />
							<Input v-model="customModelName" autocomplete="off" placeholder="my-model" />
						</div>
						<template v-else>
							<div v-if="p.needsKey" class="ai-key-panel">
								<Input
									:model-value="keyOf(p.id)"
									:type="keyShown(p.id) ? 'text' : 'password'"
									autocomplete="off"
									:placeholder="formatMessage(messages.keyPlaceholder)"
									@update:model-value="(value: string) => setKeyOf(p.id, String(value ?? ''))"
								/>
								<button type="button" class="ai-key-eye" @click="() => toggleKeyShown(p.id)">
									<EyeIcon v-if="keyShown(p.id)" class="size-4" />
									<EyeOffIcon v-else class="size-4" />
									{{ keyShown(p.id) ? formatMessage(messages.hideKey) : formatMessage(messages.showKey) }}
								</button>
								<a
									v-if="p.keyUrl"
									class="ai-getkey-link"
									href="#"
									@click.prevent="() => openKeyPage(p.keyUrl)"
								>
									{{ formatMessage(messages.getKey) }}: {{ keyDomain(p) }}
									<ExternalIcon class="size-3.5" />
								</a>
							</div>
							<p v-if="p.needsKey && !hasKey(p)" class="ai-model-missing m-0">
								{{ formatMessage(messages.keyMissing) }}
							</p>
							<div v-else class="ai-manage-list">
								<div v-for="m in p.models" :key="m.id" class="ai-manage-row">
									<span class="min-w-0">
										<span class="ai-model-label">{{ m.label }}</span>
										<span class="ai-model-id">{{ m.id }}</span>
									</span>
									<Toggle
										:model-value="modelOn(p.id, m.id)"
										small
										:aria-label="m.label"
										@update:model-value="() => toggleModel(p.id, m.id)"
									/>
								</div>
							</div>
						</template>
					</template>

					<!-- Picker view: enabled models of this provider -->
					<template v-else>
						<div v-if="p.id === 'custom'" class="flex flex-col gap-2 py-1">
							<Input v-model="customBase" autocomplete="off" placeholder="http://localhost:1234/v1/chat/completions" />
							<Input v-model="customModelName" autocomplete="off" placeholder="my-model" />
						</div>
						<template v-else>
							<div v-if="p.needsKey && !hasKey(p)" class="ai-key-panel">
								<Input
									:model-value="keyOf(p.id)"
									:type="keyShown(p.id) ? 'text' : 'password'"
									autocomplete="off"
									:placeholder="formatMessage(messages.keyPlaceholder)"
									@update:model-value="(value: string) => setKeyOf(p.id, String(value ?? ''))"
								/>
								<button type="button" class="ai-key-eye" @click="() => toggleKeyShown(p.id)">
									<EyeIcon v-if="keyShown(p.id)" class="size-4" />
									<EyeOffIcon v-else class="size-4" />
									{{ keyShown(p.id) ? formatMessage(messages.hideKey) : formatMessage(messages.showKey) }}
								</button>
								<a
									v-if="p.keyUrl"
									class="ai-getkey-link"
									href="#"
									@click.prevent="() => openKeyPage(p.keyUrl)"
								>
									{{ formatMessage(messages.getKey) }}: {{ keyDomain(p) }}
									<ExternalIcon class="size-3.5" />
								</a>
							</div>
							<template v-else>
								<button
									v-for="m in enabledModels(p)"
									:key="m.id"
									type="button"
									class="ai-model-row"
									:class="{ 'ai-model-row--active': p.id === aiSettings.provider && chosenId(p) === m.id }"
									@click="() => selectModel(p, m.id)"
								>
									<span class="ai-model-dot" />
									<span class="min-w-0 grow text-left">
										<span class="ai-model-label">{{ m.label }}</span>
										<span class="ai-model-id">{{ m.id }}</span>
									</span>
									<span v-if="p.id === aiSettings.provider && chosenId(p) === m.id" class="ai-model-check">✓</span>
								</button>
								<p v-if="enabledModels(p).length === 0" class="ai-model-missing m-0">
									{{ formatMessage(messages.allOff) }}
								</p>
							</template>
						</template>
					</template>
				</div>
			</div>

			<Button
				v-if="!managing"
				class="ai-manage-btn"
				@click="() => (managing = true)"
			>
				{{ formatMessage(messages.manage) }}
			</Button>
			<Button
				v-else
				color="brand"
				class="ai-manage-btn"
				@click="() => (managing = false)"
			>
				{{ formatMessage(messages.done) }}
			</Button>
		</div>

		<p v-if="provider.id === 'pollinations'" class="m-0 text-sm text-secondary">
			{{ formatMessage(messages.noteFree) }}
		</p>
		<p v-else-if="provider.note" class="m-0 text-sm text-secondary">{{ provider.note }}</p>
		<p class="m-0 flex items-center gap-1.5 text-sm text-secondary">
			<KeyIcon class="size-4 shrink-0" />
			{{ formatMessage(messages.fallback) }}
		</p>

		<div v-if="!compact" class="flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">
				{{ formatMessage(messages.imageGroup) }}
			</span>
			<div class="flex flex-wrap gap-2">
				<button
					v-for="p in AI_IMAGE_PROVIDERS"
					:key="p.id"
					type="button"
					class="ai-provider-card"
					:class="{ 'ai-provider-card-active': p.id === aiSettings.imageProvider }"
					@click="
						() => {
							aiSettings.imageProvider = p.id
							saveAiSettings()
						}
					"
				>
					<span class="flex items-center gap-1.5">
						{{ p.label }}
						<span v-if="p.fromRussia" class="ai-badge ai-badge-rf">РФ</span>
						<span v-if="!p.needsKey" class="ai-badge ai-badge-free">free</span>
					</span>
				</button>
			</div>
			<div v-if="imageProvider.needsKey" class="flex gap-2">
				<Input
					v-model="imageKeyValue"
					:type="showImageKey ? 'text' : 'password'"
					autocomplete="off"
					:placeholder="formatMessage(messages.keyPlaceholder)"
				/>
				<Button icon-only @click="() => (showImageKey = !showImageKey)">
					<EyeIcon v-if="showImageKey" />
					<EyeOffIcon v-else />
				</Button>
				<Button
					v-if="imageProvider.keyUrl"
					v-tooltip="formatMessage(messages.getKey)"
					icon-only
					@click="() => openKeyPage(imageProvider.keyUrl)"
				>
					<ExternalIcon />
				</Button>
			</div>
			<p v-if="imageProvider.note" class="m-0 text-xs text-secondary">
				{{ imageProvider.note }}
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="ai-provider-card ai-test-button"
					:disabled="testState === 'running'"
					@click="runConnectionTest"
				>
					{{
						testState === 'running'
							? formatMessage(messages.testRunning)
							: formatMessage(messages.test)
					}}
				</button>
				<span v-if="testState === 'ok'" class="ai-test-dot ai-test-ok">
					{{ testResult }} — {{ formatMessage(messages.testOk) }}
				</span>
				<span v-else-if="testState === 'fail'" class="ai-test-dot ai-test-fail">
					{{ formatMessage(messages.testFail) }}: {{ testResult }}
				</span>
			</div>
		</div>

		<div v-if="!compact" class="ai-skill-section flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.skills) }}</span>
			<p v-if="skills.length === 0" class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.skillsEmpty) }}
			</p>
			<div v-for="skill in skills" :key="skill.id" class="ai-skill-row">
				<label class="ai-skill-head">
					<input type="checkbox" :checked="skill.on" @change="() => toggleSkill(skill.id)" />
					<span class="text-sm font-medium text-primary">{{ skill.name }}</span>
				</label>
				<p class="ai-skill-text m-0">{{ skill.text }}</p>
				<button class="ai-skill-delete" aria-label="Удалить" @click="() => removeSkill(skill.id)">
					<XIcon class="size-3.5" />
				</button>
			</div>
			<div class="flex flex-col gap-1.5">
				<Input v-model="newSkillName" :placeholder="formatMessage(messages.skillName)" />
				<Input v-model="newSkillText" :placeholder="formatMessage(messages.skillText)" />
				<Button
					size="sm"
					:disabled="!newSkillName.trim() || !newSkillText.trim()"
					@click="addSkill"
				>
					{{ formatMessage(messages.skillAdd) }}
				</Button>
			</div>
			<p class="m-0 text-xs leading-relaxed text-secondary">
				{{ formatMessage(messages.skillsHint) }}
			</p>
		</div>
		<div v-if="!compact" class="ai-bridge-section flex flex-col gap-1.5">
			<div class="flex items-center justify-between gap-2">
				<span class="flex items-center gap-1.5 text-sm font-semibold text-primary">
					<span
						class="size-2 rounded-full"
						:style="{
							background: bridgeInfo ? 'var(--color-green)' : 'var(--color-surface-5)',
						}"
					/>
					{{ formatMessage(messages.bridge) }}
					<span class="text-xs font-normal text-secondary">
						{{
							bridgeInfo
								? formatMessage(messages.bridgeRunning)
								: formatMessage(messages.bridgeIdle)
						}}
					</span>
				</span>
				<div class="flex gap-2">
					<Button v-if="bridgeInfo" size="sm" @click="copyBridgeDetails">
						{{
							bridgeCopied
								? formatMessage(messages.bridgeCopied)
								: formatMessage(messages.bridgeCopy)
						}}
					</Button>
					<Button
						size="sm"
						:color="bridgeInfo ? undefined : 'brand'"
						:disabled="bridgeToggling"
						@click="toggleBridge"
					>
						{{
							bridgeInfo ? formatMessage(messages.bridgeStop) : formatMessage(messages.bridgeStart)
						}}
					</Button>
				</div>
			</div>
			<template v-if="bridgeInfo">
				<Input :model-value="bridgeInfo.url" readonly class="mb-1" />
				<Input :model-value="bridgeInfo.key" readonly />
			</template>
			<p class="m-0 text-xs leading-relaxed text-secondary">
				{{ formatMessage(messages.bridgeHint) }}
			</p>
		</div>
	</div>
</template>

<style scoped>
.ai-model-hint {
	font-size: 0.75rem;
	color: var(--color-secondary);
}

.ai-provider-group {
	border: 1px solid var(--surface-5);
	border-radius: 0.75rem;
	background: color-mix(in srgb, var(--color-bg) 30%, transparent);
	overflow: hidden;
	transition: border-color 0.18s ease;
}

.ai-provider-group:hover {
	border-color: color-mix(in srgb, var(--color-brand) 35%, transparent);
}

.ai-provider-head {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	width: 100%;
	padding: 0.55rem 0.7rem;
	border: none;
	background: transparent;
	font: inherit;
	font-weight: 700;
	font-size: 0.8125rem;
	color: var(--color-contrast);
	cursor: pointer;
	text-align: left;
}

.ai-provider-name {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ai-provider-chevron {
	margin-left: auto;
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
	color: var(--color-secondary);
	transition: transform 0.2s ease;
}

.ai-provider-chevron--open {
	transform: rotate(180deg);
}

.ai-provider-body {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	padding: 0.1rem 0.5rem 0.5rem;
	animation: ai-provider-body-in 0.18s ease;
}

@keyframes ai-provider-body-in {
	from {
		opacity: 0;
		transform: translateY(-0.2rem);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.ai-model-row {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	width: 100%;
	padding: 0.4rem 0.55rem;
	border: 1px solid transparent;
	border-radius: 0.55rem;
	background: transparent;
	font: inherit;
	font-size: 0.8125rem;
	color: var(--color-primary);
	cursor: pointer;
	text-align: left;
	transition:
		background-color 0.15s ease,
		border-color 0.15s ease;
}

.ai-model-row:hover {
	background: color-mix(in srgb, var(--color-contrast) 5%, transparent);
}

.ai-model-row--active {
	border-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
	background: color-mix(in srgb, var(--color-brand) 10%, transparent);
}

.ai-model-dot {
	width: 0.55rem;
	height: 0.55rem;
	flex-shrink: 0;
	border-radius: 999px;
	border: 1.5px solid var(--color-secondary);
	transition:
		border-color 0.15s ease,
		box-shadow 0.15s ease,
		background-color 0.15s ease;
}

.ai-model-row--active .ai-model-dot {
	border-color: var(--color-brand);
	background: var(--color-brand);
	box-shadow: 0 0 0.35rem color-mix(in srgb, var(--color-brand) 55%, transparent);
}

.ai-model-label {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.ai-model-id {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.6875rem;
	color: var(--color-secondary);
	font-family: var(--mono-font, ui-monospace, monospace);
}

.ai-model-check {
	color: var(--color-brand);
	font-weight: 800;
	flex-shrink: 0;
}

.ai-model-missing {
	padding: 0.3rem 0.55rem;
	font-size: 0.75rem;
	color: var(--color-orange, #e0a12f);
}

.ai-manage-btn {
	margin-top: 0.25rem;
}

.ai-manage-list {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.ai-manage-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.6rem;
	padding: 0.35rem 0.55rem;
	border-radius: 0.55rem;
	transition: background-color 0.15s ease;
}

.ai-manage-row:hover {
	background: color-mix(in srgb, var(--color-contrast) 4%, transparent);
}

.ai-key-panel {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.45rem;
	padding: 0.4rem 0.55rem;
	border-radius: 0.55rem;
	background: color-mix(in srgb, var(--color-contrast) 4%, transparent);
}

.ai-key-eye {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.35rem 0.55rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.5rem;
	background: var(--color-button-bg);
	font: inherit;
	font-size: 0.75rem;
	color: var(--color-secondary);
	cursor: pointer;
	white-space: nowrap;
	transition:
		border-color 0.15s ease,
		color 0.15s ease;
}

.ai-key-eye:hover {
	border-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
	color: var(--color-contrast);
}

.ai-getkey-link {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--color-brand);
	text-decoration: none;
	white-space: nowrap;
}

.ai-getkey-link:hover {
	text-decoration: underline;
}

.ai-badge {
	border-radius: 999px;
	font-size: 0.625rem;
	font-weight: 700;
	padding: 0.05rem 0.4rem;
	line-height: 1.4;
	flex-shrink: 0;
}

.ai-badge-rf {
	background: color-mix(in srgb, var(--color-blue) 22%, transparent);
	color: var(--color-blue);
}

.ai-badge-free {
	background: color-mix(in srgb, var(--color-green) 22%, transparent);
	color: var(--color-green);
}

.ai-badge-key {
	background: color-mix(in srgb, var(--color-orange, #e0a12f) 20%, transparent);
	color: var(--color-orange, #e0a12f);
}

.ai-provider-card {
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	border-radius: var(--radius-sm);
	padding: 0.4rem 0.7rem;
	cursor: pointer;
	font-size: 0.8125rem;
	color: var(--color-primary);
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		transform 0.1s ease;
}

.ai-provider-card:hover {
	border-color: var(--color-brand);
	transform: translateY(-1px);
}

.ai-provider-card-active {
	border-color: var(--color-brand);
	background: color-mix(in srgb, var(--color-brand) 12%, var(--color-button-bg));
}

.ai-test-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.ai-test-dot {
	font-size: 0.75rem;
	line-height: 1.35;
	overflow-wrap: anywhere;
}

.ai-test-ok {
	color: var(--color-green);
}

.ai-test-fail {
	color: var(--color-red);
}

.ai-bridge-section {
	border-top: 1px solid var(--surface-5);
	padding-top: 0.75rem;
}
.ai-skill-section {
	border-top: 1px solid var(--surface-5);
	padding-top: 0.75rem;
}

.ai-skill-row {
	border: 1px solid var(--surface-5);
	border-radius: 0.625rem;
	background: var(--color-button-bg);
	padding: 0.5rem 0.625rem;
	position: relative;
}

.ai-skill-head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
}

.ai-skill-text {
	margin-top: 0.25rem;
	font-size: 0.75rem;
	line-height: 1.45;
	color: var(--color-secondary);
	white-space: pre-wrap;
	word-break: break-word;
}

.ai-skill-delete {
	position: absolute;
	top: 0.4rem;
	right: 0.4rem;
	border: none;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	padding: 0.15rem;
	border-radius: 0.375rem;
}

.ai-skill-delete:hover {
	color: var(--color-red);
}
</style>
