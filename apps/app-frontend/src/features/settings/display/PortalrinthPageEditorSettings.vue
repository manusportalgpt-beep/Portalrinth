<script setup lang="ts">
/**
 * The page editor's own block in Appearance.
 *
 * It used to sit under the background picture, where it could not be reached
 * without one. Here it is a section of its own: what is placed where, the
 * sound of the theme, and the way in - the editor itself works on the pages,
 * not in this window, so the settings only point at it and stay out of its way.
 */
import { ImageIcon, MusicIcon } from '@modrinth/assets'
import { Button, defineMessages, injectNotificationManager, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import {
	chooseThemeSound,
	decorations,
	decorEditorOpen,
	EDITOR_PAGES,
	removeThemeSound,
	themeSound,
	themeSoundOn,
} from '@/helpers/portalrinth-decor'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const messages = defineMessages({
	title: { id: 'portalrinth.settings.editor.title', defaultMessage: 'Редактор страниц' },
	description: {
		id: 'portalrinth.settings.editor.description',
		defaultMessage:
			'Ставь картинки, GIF и видео на любую страницу лаунчера: перетаскивай, тяни за уголок, удаляй. Экспорт и импорт темы — .prth, в нём же фон, цвет и звук.',
	},
	open: { id: 'portalrinth.settings.editor.open', defaultMessage: 'Открыть редактор' },
	hint: {
		id: 'portalrinth.settings.editor.hint',
		defaultMessage: 'Закрой окно настроек — редактор ждёт тебя прямо на страницах.',
	},
	placed: { id: 'portalrinth.settings.editor.placed', defaultMessage: 'Расставлено: {count}' },
	empty: {
		id: 'portalrinth.settings.editor.empty',
		defaultMessage:
			'Пока ничего не расставлено: открой редактор и перетащи картинку или видео на любую страницу.',
	},
	soundTitle: { id: 'portalrinth.settings.editor.sound', defaultMessage: 'Звук темы' },
	soundChoose: { id: 'portalrinth.settings.editor.sound-choose', defaultMessage: 'Выбрать звук' },
	soundRemove: { id: 'portalrinth.settings.editor.sound-remove', defaultMessage: 'Убрать' },
})

const busy = ref(false)

async function run(action: () => Promise<unknown>) {
	busy.value = true
	try {
		await action()
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
	}
}

/**
 * How many things stand on each named page, so a glance says where the look
 * lives. Pages nothing stands on are kept in the row, drawn quietly - an empty
 * page is a place to put something, not a hole in the list.
 */
const pageCounts = computed(() =>
	EDITOR_PAGES.map((page) => ({
		label: page.label,
		count: decorations.value.filter((item) => item.page === page.key).length,
	})),
)

const placedCount = computed(() => decorations.value.length)

function toggleSound() {
	themeSoundOn.value = !themeSoundOn.value
}
</script>

<template>
	<div class="mt-6 flex flex-col gap-3">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">{{ formatMessage(messages.title) }}</h2>
			<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.description) }}</p>
		</div>

		<!-- A card of its own, so the editor reads as one thing: the way in on
		     top, the pages under it, the theme's sound at the bottom. -->
		<div
			class="flex flex-col gap-4 rounded-2xl border border-solid border-surface-5 bg-surface-2 p-4"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-highlight text-brand"
						aria-hidden="true"
					>
						<ImageIcon class="size-5" />
					</span>
					<span class="min-w-0 text-sm font-semibold text-contrast">
						{{
							formatMessage(placedCount ? messages.placed : messages.empty, {
								count: placedCount,
							})
						}}
					</span>
				</div>
				<Button type="colored" color="brand" :disabled="busy" @click="decorEditorOpen = true">
					{{ formatMessage(messages.open) }}
				</Button>
			</div>

			<!-- The pages as chips: the count is the whole story, a number next to a
			     name, rather than a list to read through. -->
			<div class="flex flex-wrap gap-1.5">
				<span
					v-for="page in pageCounts"
					:key="page.label"
					class="rounded-full px-2.5 py-0.5 text-xs font-medium"
					:class="page.count ? 'bg-brand-highlight text-brand' : 'bg-surface-3 text-secondary'"
				>
					{{ page.label }} · {{ page.count }}
				</span>
			</div>

			<div class="flex flex-wrap items-center gap-2 border-t border-solid border-surface-4 pt-4">
				<span class="text-sm font-semibold text-contrast">{{
					formatMessage(messages.soundTitle)
				}}</span>
				<Toggle
					v-if="themeSound"
					:model-value="themeSoundOn"
					:aria-label="formatMessage(messages.soundTitle)"
					@update:model-value="toggleSound()"
				/>
				<Button v-if="!themeSound" :disabled="busy" @click="run(() => chooseThemeSound())">
					{{ formatMessage(messages.soundChoose) }}
				</Button>
				<template v-else>
					<Button :disabled="busy" @click="run(() => chooseThemeSound())">
						{{ formatMessage(messages.soundChoose) }}
					</Button>
					<Button type="quiet" :disabled="busy" @click="run(() => removeThemeSound())">
						<MusicIcon />
						{{ formatMessage(messages.soundRemove) }}
					</Button>
				</template>
			</div>
		</div>

		<p v-if="decorEditorOpen" class="m-0 text-xs text-secondary">
			{{ formatMessage(messages.hint) }}
		</p>
	</div>
</template>
