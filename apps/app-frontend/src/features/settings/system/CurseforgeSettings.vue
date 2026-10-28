<script setup lang="ts">
/** Noctrinth's own: what the launcher does with CurseForge, and whether at all. */
import { CheckIcon, SpinnerIcon, TrashIcon, UndoIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	Combobox,
	type ComboboxOption,
	defineMessages,
	Input,
	Toggle,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import {
	checkCurseforgeKey,
	clearCurseforgeCache,
	curseforgeKeyAvailable,
	type CurseforgeReleaseType,
	curseforgeSettings,
	hasUserCurseforgeKey,
	setUserCurseforgeKey,
} from '@/helpers/curseforge-settings'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: { id: 'noctrinth.settings.curseforge.title', defaultMessage: 'CurseForge' },
	description: {
		id: 'noctrinth.settings.curseforge.description',
		defaultMessage:
			'Поиск и установка с CurseForge, распознавание его файлов в сборках и их обновление. Если выключено — лаунчер ничего не запрашивает у CurseForge.',
	},
	noKey: {
		id: 'noctrinth.settings.curseforge.no-key',
		defaultMessage: 'В этой сборке лаунчера нет ключа API CurseForge. Добавьте свой ниже, чтобы пользоваться CurseForge.',
	},
	discoverSection: {
		id: 'noctrinth.settings.curseforge.section.discover',
		defaultMessage: 'Обзор',
	},
	defaultSource: {
		id: 'noctrinth.settings.curseforge.default-source',
		defaultMessage: 'Обзор открывается на',
	},
	defaultSourceDescription: {
		id: 'noctrinth.settings.curseforge.default-source.description',
		defaultMessage:
			'Какой каталог показывать первым. Переключатель над результатами меняет его в любой момент.',
	},
	modrinth: { id: 'noctrinth.settings.curseforge.source.modrinth', defaultMessage: 'Modrinth' },
	curseforge: {
		id: 'noctrinth.settings.curseforge.source.curseforge',
		defaultMessage: 'CurseForge',
	},
	filesSection: {
		id: 'noctrinth.settings.curseforge.section.files',
		defaultMessage: 'Файлы и обновления',
	},
	recognizeFilesTitle: {
		id: 'noctrinth.settings.curseforge.recognize-files.title',
		defaultMessage: 'Распознавать файлы',
	},
	recognizeFiles: {
		id: 'noctrinth.settings.curseforge.recognize-files',
		defaultMessage: 'Узнавать моды, добавленные вручную или из других лаунчеров, по отпечатку файла',
	},
	checkUpdatesTitle: {
		id: 'noctrinth.settings.curseforge.check-updates.title',
		defaultMessage: 'Проверять обновления',
	},
	checkUpdates: {
		id: 'noctrinth.settings.curseforge.check-updates',
		defaultMessage: 'Проверять на CurseForge обновления его модов и сборок',
	},
	releaseType: {
		id: 'noctrinth.settings.curseforge.release-type',
		defaultMessage: 'Обновлять до',
	},
	releaseTypeDescription: {
		id: 'noctrinth.settings.curseforge.release-type.description',
		defaultMessage: 'Какие файлы считать обновлением.',
	},
	release: {
		id: 'noctrinth.settings.curseforge.release-type.release',
		defaultMessage: 'Только релизы',
	},
	beta: {
		id: 'noctrinth.settings.curseforge.release-type.beta',
		defaultMessage: 'Релизы и беты',
	},
	alpha: {
		id: 'noctrinth.settings.curseforge.release-type.alpha',
		defaultMessage: 'Любые файлы, включая альфы',
	},
	restrictedSection: {
		id: 'noctrinth.settings.curseforge.section.restricted',
		defaultMessage: 'Файлы, недоступные лаунчерам',
	},
	searchOtherLaunchersTitle: {
		id: 'noctrinth.settings.curseforge.search-other-launchers.title',
		defaultMessage: 'Искать в других лаунчерах',
	},
	searchOtherLaunchers: {
		id: 'noctrinth.settings.curseforge.search-other-launchers',
		defaultMessage:
			'Искать недоступные лаунчерам файлы в сборках других лаунчеров, а не только в «Загрузках»',
	},
	ownKey: { id: 'noctrinth.settings.curseforge.own-key', defaultMessage: 'Свой ключ API' },
	ownKeyHint: {
		id: 'noctrinth.settings.curseforge.own-key.hint',
		defaultMessage:
			'Используется вместо встроенного и хранится только на этом компьютере. Войдите в консоль CurseForge и скопируйте ключ на странице API keys:',
	},
	ownKeyPlaceholder: {
		id: 'noctrinth.settings.curseforge.own-key.placeholder',
		defaultMessage: 'Ваш ключ сохранён',
	},
	check: { id: 'noctrinth.settings.curseforge.own-key.check', defaultMessage: 'Проверить' },
	checkAndSave: {
		id: 'noctrinth.settings.curseforge.own-key.check-and-save',
		defaultMessage: 'Проверить и сохранить',
	},
	forget: { id: 'noctrinth.settings.curseforge.own-key.forget', defaultMessage: 'Забыть мой ключ' },
	keyOk: {
		id: 'noctrinth.settings.curseforge.own-key.ok',
		defaultMessage: 'CurseForge принимает ключ',
	},
	keySaved: {
		id: 'noctrinth.settings.curseforge.own-key.saved',
		defaultMessage: 'CurseForge принимает ключ, он сохранён',
	},
	keyInvalid: {
		id: 'noctrinth.settings.curseforge.own-key.invalid',
		defaultMessage: 'CurseForge не принимает этот ключ',
	},
	checkFailed: {
		id: 'noctrinth.settings.curseforge.own-key.check-failed',
		defaultMessage: 'Не удалось связаться с CurseForge для проверки ключа',
	},
	cacheTitle: { id: 'noctrinth.settings.curseforge.cache.title', defaultMessage: 'Кэш' },
	clearCache: {
		id: 'noctrinth.settings.curseforge.clear-cache',
		defaultMessage: 'Сбросить ответы CurseForge',
	},
	clearCacheHint: {
		id: 'noctrinth.settings.curseforge.clear-cache-hint',
		defaultMessage: 'Они хранятся пять минут; кнопка запросит заново прямо сейчас.',
	},
	cleared: { id: 'noctrinth.settings.curseforge.cleared', defaultMessage: 'Сброшено' },
})

const sourceOptions = computed<ComboboxOption<'modrinth' | 'curseforge'>[]>(() => [
	{ value: 'modrinth', label: formatMessage(messages.modrinth) },
	{ value: 'curseforge', label: formatMessage(messages.curseforge) },
])
const releaseTypeOptions = computed<ComboboxOption<CurseforgeReleaseType>[]>(() =>
	(['release', 'beta', 'alpha'] as const).map((type) => ({
		value: type,
		label: formatMessage(messages[type]),
	})),
)

/** Everything but the key waits on CurseForge being on and usable. */
const active = computed(() => curseforgeKeyAvailable.value && curseforgeSettings.enabled)

const keyInput = ref('')
const checking = ref(false)
const keyResult = ref<{ ok: boolean; text: string } | null>(null)

/** Checks the typed key and saves it if CurseForge takes it, or checks the saved one. */
async function checkKey() {
	const key = keyInput.value.trim() || null
	checking.value = true
	keyResult.value = null
	try {
		const ok = await checkCurseforgeKey(key)
		if (ok && key) {
			await setUserCurseforgeKey(key)
			keyInput.value = ''
		}
		keyResult.value = {
			ok,
			text: formatMessage(ok ? (key ? messages.keySaved : messages.keyOk) : messages.keyInvalid),
		}
	} catch {
		keyResult.value = { ok: false, text: formatMessage(messages.checkFailed) }
	} finally {
		checking.value = false
	}
}

async function forgetKey() {
	await setUserCurseforgeKey(null)
	keyResult.value = null
}

const cleared = ref(false)
async function clearCache() {
	await clearCurseforgeCache()
	cleared.value = true
}
</script>

<template>
	<section class="border-0 border-b border-solid border-divider pb-6">
		<div class="flex items-center justify-between gap-4">
			<div>
				<h2 id="curseforge-enabled-label" class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.title) }}
				</h2>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(curseforgeKeyAvailable ? messages.description : messages.noKey) }}
				</p>
			</div>
			<Toggle
				id="curseforge-enabled"
				v-model="curseforgeSettings.enabled"
				:disabled="!curseforgeKeyAvailable"
				aria-labelledby="curseforge-enabled-label"
			/>
		</div>
	</section>

	<div :class="['transition-opacity', active ? '' : 'pointer-events-none opacity-50']">
		<section class="mt-6">
			<h2 class="m-0 text-xl font-semibold text-contrast">
				{{ formatMessage(messages.discoverSection) }}
			</h2>
			<div class="mt-4 flex flex-wrap items-center justify-between gap-4">
				<div class="min-w-0 flex-1">
					<h3 id="curseforge-source-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.defaultSource) }}
					</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.defaultSourceDescription) }}</p>
				</div>
				<Combobox
					v-model="curseforgeSettings.defaultSource"
					:options="sourceOptions"
					aria-labelledby="curseforge-source-label"
					class="w-56"
				/>
			</div>
		</section>

		<section class="mt-6">
			<h2 class="m-0 text-xl font-semibold text-contrast">
				{{ formatMessage(messages.filesSection) }}
			</h2>
			<div class="mt-4 flex flex-col gap-6">
				<div class="flex items-center justify-between gap-4">
					<div>
						<h3 class="m-0 text-lg font-semibold text-contrast">
							{{ formatMessage(messages.recognizeFilesTitle) }}
						</h3>
						<p class="m-0 mt-1">{{ formatMessage(messages.recognizeFiles) }}</p>
					</div>
					<Toggle id="curseforge-recognize" v-model="curseforgeSettings.recognizeFiles" />
				</div>
				<div class="flex items-center justify-between gap-4">
					<div>
						<h3 class="m-0 text-lg font-semibold text-contrast">
							{{ formatMessage(messages.checkUpdatesTitle) }}
						</h3>
						<p class="m-0 mt-1">{{ formatMessage(messages.checkUpdates) }}</p>
					</div>
					<Toggle id="curseforge-updates" v-model="curseforgeSettings.checkUpdates" />
				</div>
				<div
					:class="[
						'flex flex-wrap items-center justify-between gap-4',
						curseforgeSettings.checkUpdates ? '' : 'pointer-events-none opacity-50',
					]"
				>
					<div class="min-w-0 flex-1">
						<h3 id="curseforge-release-label" class="m-0 text-lg font-semibold text-contrast">
							{{ formatMessage(messages.releaseType) }}
						</h3>
						<p class="m-0 mt-1">{{ formatMessage(messages.releaseTypeDescription) }}</p>
					</div>
					<Combobox
						v-model="curseforgeSettings.updateReleaseType"
						:options="releaseTypeOptions"
						aria-labelledby="curseforge-release-label"
						class="w-56"
					/>
				</div>
			</div>
		</section>

		<section class="mt-6">
			<h2 class="m-0 text-xl font-semibold text-contrast">
				{{ formatMessage(messages.restrictedSection) }}
			</h2>
			<div class="mt-4 flex items-center justify-between gap-4">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.searchOtherLaunchersTitle) }}
					</h3>
					<p class="m-0 mt-1">{{ formatMessage(messages.searchOtherLaunchers) }}</p>
				</div>
				<Toggle id="curseforge-other-launchers" v-model="curseforgeSettings.searchOtherLaunchers" />
			</div>
		</section>
	</div>

	<section class="mt-6">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			<label for="noctrinth-curseforge-key">{{ formatMessage(messages.ownKey) }}</label>
		</h2>
		<p class="m-0 mt-1">
			{{ formatMessage(messages.ownKeyHint) }}
			<a
				href="https://console.curseforge.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="font-semibold text-brand hover:underline"
				>console.curseforge.com</a
			>
		</p>
		<div class="mt-4 flex flex-col gap-3">
			<Input
				id="noctrinth-curseforge-key"
				v-model="keyInput"
				type="password"
				autocomplete="off"
				class="max-w-md"
				:placeholder="hasUserCurseforgeKey ? formatMessage(messages.ownKeyPlaceholder) : ''"
				@update:model-value="keyResult = null"
			/>
			<div class="flex flex-wrap items-center gap-3">
				<Button
					:disabled="checking || (!keyInput.trim() && !hasUserCurseforgeKey)"
					@click="checkKey"
				>
					<SpinnerIcon v-if="checking" class="animate-spin" aria-hidden="true" />
					<CheckIcon v-else aria-hidden="true" />
					{{ formatMessage(keyInput.trim() ? messages.checkAndSave : messages.check) }}
				</Button>
				<Button v-if="hasUserCurseforgeKey" :disabled="checking" @click="forgetKey">
					<UndoIcon aria-hidden="true" />
					{{ formatMessage(messages.forget) }}
				</Button>
				<span
					v-if="keyResult"
					class="flex items-center gap-1.5 text-sm"
					:class="keyResult.ok ? 'text-green' : 'text-red'"
				>
					<CheckIcon v-if="keyResult.ok" class="size-4 shrink-0" aria-hidden="true" />
					<XIcon v-else class="size-4 shrink-0" aria-hidden="true" />
					{{ keyResult.text }}
				</span>
			</div>
		</div>
	</section>

	<section :class="['mt-6', active ? '' : 'pointer-events-none opacity-50']">
		<h2 class="m-0 text-xl font-semibold text-contrast">
			{{ formatMessage(messages.cacheTitle) }}
		</h2>
		<div class="mt-4 flex flex-wrap items-center justify-between gap-4">
			<p class="m-0 min-w-0 flex-1">
				<span v-if="cleared" class="inline-flex items-center gap-1.5 text-green">
					<CheckIcon class="size-4 shrink-0" aria-hidden="true" />
					{{ formatMessage(messages.cleared) }}
				</span>
				<template v-else>{{ formatMessage(messages.clearCacheHint) }}</template>
			</p>
			<Button @click="clearCache">
				<TrashIcon aria-hidden="true" />
				{{ formatMessage(messages.clearCache) }}
			</Button>
		</div>
	</section>
</template>
