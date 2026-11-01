<script setup lang="ts">
import { SquareIcon, StickyNotePlusIcon, XIcon } from '@modrinth/assets'
import { Button, defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import { get } from '@/helpers/instance'
import {
	type InstanceNoteTask,
	never_remind_instance_notes,
	open_instance_tasks,
	read_instance_notes,
	should_show_instance_notes,
} from '@/helpers/portalrinth-notes'

/**
 * When a game launches and its build carries a note, the note stands up in
 * the middle of the screen: the cross closes it for this run, "never remind"
 * puts it to rest for good, "OK" keeps it popping up before every launch.
 */
const { formatMessage } = useVIntl()

const messages = defineMessages({
	header: {
		id: 'app.instance.notes.popup.header',
		defaultMessage: 'Заметка к сборке «{name}»',
	},
	never: {
		id: 'app.instance.notes.popup.never',
		defaultMessage: 'Больше не напоминать',
	},
	ok: { id: 'app.instance.notes.popup.ok', defaultMessage: 'Ок' },
})

const popup = ref()
const instanceName = ref('')
const noteText = ref('')
const noteTasks = ref<InstanceNoteTask[]>([])
let noteInstanceId = ''

useAppEvent('process', async (payload) => {
	if (payload.event !== 'launched') return
	const instanceId = payload.instance_id
	if (!instanceId || !should_show_instance_notes(instanceId)) return
	noteInstanceId = instanceId
	noteText.value = read_instance_notes(instanceId)
	noteTasks.value = open_instance_tasks(instanceId)
	try {
		const instance = await get(instanceId)
		instanceName.value = instance?.name ?? instanceId
	} catch {
		instanceName.value = instanceId
	}
	popup.value?.show()
})

function hide() {
	popup.value?.hide()
}

function neverRemind() {
	if (noteInstanceId) never_remind_instance_notes(noteInstanceId)
	hide()
}
</script>

<template>
	<NewModal ref="popup">
		<template #title>
			<span class="flex items-center gap-2 text-lg font-bold text-contrast">
				<StickyNotePlusIcon class="size-5 text-orange" />
				{{ formatMessage(messages.header, { name: instanceName }) }}
			</span>
		</template>
		<div class="flex max-w-[34rem] flex-col gap-3">
			<p
				v-if="noteText.trim()"
				class="m-0 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-contrast"
			>
				{{ noteText }}
			</p>
			<ul v-if="noteTasks.length" class="m-0 flex list-none flex-col gap-1.5 p-0">
				<li
					v-for="task in noteTasks"
					:key="task.id"
					class="flex items-start gap-2 break-words text-sm text-contrast"
				>
					<SquareIcon class="mt-0.5 size-4 shrink-0 text-secondary" />
					{{ task.text }}
				</li>
			</ul>
		</div>
		<template #actions>
			<div class="flex w-full items-center justify-between gap-2">
				<Button class="grow" @click="neverRemind">
					<XIcon class="!size-3.5" />
					{{ formatMessage(messages.never) }}
				</Button>
				<Button class="grow" color="brand" @click="hide">
					{{ formatMessage(messages.ok) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>
