<script setup lang="ts">
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
	read_instance_notes,
	write_instance_notes,
} from '@/helpers/portalrinth-notes'

import { injectInstancePage } from '../instance-context'

const instancePage = injectInstancePage()
const { formatMessage } = useVIntl()
const instance = computed(() => instancePage.instance.value!)

const messages = defineMessages({
	title: { id: 'app.instance.notes.title', defaultMessage: 'Заметки' },
	description: {
		id: 'app.instance.notes.description',
		defaultMessage:
			'Записка к этой сборке: планы, что проверить, адрес сервера. Перед каждым запуском игры она всплывёт на экране.',
	},
	placeholder: {
		id: 'app.instance.notes.placeholder',
		defaultMessage: 'Например: не забыть включить шейдеры и зайти на сервер…',
	},
	save: { id: 'app.instance.notes.save', defaultMessage: 'Сохранить' },
	saved: { id: 'app.instance.notes.saved', defaultMessage: 'Сохранено' },
	empty: {
		id: 'app.instance.notes.empty',
		defaultMessage: 'Пока пусто: запиши что-нибудь - и заметка станет выплывать перед каждым запуском этой сборки.',
	},
})

const text = ref('')
const dirty = ref(false)
const savedNote = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined

watch(
	() => instance.value?.id,
	(id) => {
		if (!id) return
		text.value = read_instance_notes(id)
		dirty.value = false
		savedNote.value = false
	},
	{ immediate: true },
)

function save() {
	const id = instance.value?.id
	if (!id) return
	write_instance_notes(id, text.value)
	dirty.value = false
	savedNote.value = true
	if (savedTimer) clearTimeout(savedTimer)
	savedTimer = setTimeout(() => (savedNote.value = false), 2500)
}

// Leaving the tab with an unsaved edit keeps it anyway - a note is too
// easy to lose to a missed click.
onBeforeUnmount(() => {
	const id = instance.value?.id
	if (id && dirty.value && text.value !== read_instance_notes(id)) {
		write_instance_notes(id, text.value)
	}
})
</script>

<template>
	<div class="flex min-h-0 flex-col gap-4">
		<textarea
			v-model="text"
			class="min-h-[16rem] w-full grow resize-y rounded-2xl border-0 bg-surface-3 p-3 text-sm text-contrast outline-none placeholder:text-secondary focus:outline-none"
			:placeholder="formatMessage(messages.placeholder)"
			@input="dirty = true"
		/>
		<div class="flex items-center gap-3">
			<Button :disabled="!dirty" @click="save">
				{{ formatMessage(messages.save) }}
			</Button>
			<span v-if="savedNote" class="text-sm font-semibold text-green">
				{{ formatMessage(messages.saved) }}
			</span>
		</div>
	</div>
</template>
