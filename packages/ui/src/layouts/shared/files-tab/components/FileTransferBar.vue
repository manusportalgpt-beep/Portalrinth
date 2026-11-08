<template>
	<div
		class="flex flex-col gap-2 rounded-[16px] border border-solid border-surface-4 bg-surface-2 px-3 py-2.5 shadow-sm"
	>
		<template v-if="mode === 'move'">
			<div class="flex flex-wrap items-center gap-2">
				<span class="mr-1 text-sm font-semibold text-contrast">
					{{ formatMessage(messages.moveTitle, { count: items.length }) }}
				</span>
				<Button
					v-tooltip="disabled ? disabledTooltip : undefined"
					type="quiet"
					:disabled="disabled"
					@click="emit('move-folder')"
				>
					<FolderOpenIcon />
					<span class="whitespace-nowrap">
						{{ formatMessage(messages.moveToFolder) }}
					</span>
				</Button>
				<Button
					v-if="canMoveToInstance"
					v-tooltip="disabled ? disabledTooltip : undefined"
					type="quiet"
					:disabled="disabled"
					@click="emit('move-instance')"
				>
					<BoxIcon />
					<span class="whitespace-nowrap">
						{{ formatMessage(messages.moveToInstance) }}
					</span>
				</Button>
				<Button
					v-if="canReplace"
					v-tooltip="disabled ? disabledTooltip : undefined"
					type="quiet"
					:disabled="disabled"
					@click="emit('replace')"
				>
					<RepeatIcon />
					<span class="whitespace-nowrap">
						{{ formatMessage(messages.replaceFile) }}
					</span>
				</Button>
				<div class="ml-auto">
					<Button
						type="quiet"
						:aria-label="formatMessage(commonMessages.cancelButton)"
						@click="emit('cancel')"
					>
						<XIcon />
					</Button>
				</div>
			</div>
		</template>
		<template v-else>
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="mr-1 text-sm font-semibold text-contrast">
					{{ formatMessage(messages.replaceTitle) }}
				</span>
				<div
					v-for="(item, index) in items"
					:key="item.path"
					class="flex items-center gap-1 rounded-full border border-solid border-surface-5 bg-surface-3 py-0.5 pr-1 pl-2"
				>
					<span
						class="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-[var(--color-accent-contrast)] tabular-nums"
					>
						{{ index + 1 }}
					</span>
					<span class="max-w-40 truncate text-xs text-contrast">{{ item.name }}</span>
					<span class="flex">
						<button
							:aria-label="formatMessage(messages.moveUp)"
							:disabled="index === 0"
							class="grid size-5 cursor-pointer place-items-center rounded-full text-secondary hover:bg-surface-5 hover:text-contrast disabled:cursor-default disabled:opacity-30"
							@click="emit('renumber', index, -1)"
						>
							<ChevronUpIcon class="h-3.5 w-3.5" />
						</button>
						<button
							:aria-label="formatMessage(messages.moveDown)"
							:disabled="index === items.length - 1"
							class="grid size-5 cursor-pointer place-items-center rounded-full text-secondary hover:bg-surface-5 hover:text-contrast disabled:cursor-default disabled:opacity-30"
							@click="emit('renumber', index, 1)"
						>
							<ChevronDownIcon class="h-3.5 w-3.5" />
						</button>
					</span>
				</div>
				<div class="ml-auto flex items-center gap-2">
					<span class="text-xs text-secondary">
						{{ formatMessage(messages.replaceHint) }}
					</span>
					<Button type="quiet" @click="emit('cancel')">
						<XIcon />
						{{ formatMessage(commonMessages.cancelButton) }}
					</Button>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import {
	BoxIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	FolderOpenIcon,
	RepeatIcon,
	XIcon,
} from '@modrinth/assets'

import { Button } from '#ui/components/base/buttons'
import { defineMessages, useVIntl } from '#ui/composables/i18n'
import { commonMessages } from '#ui/utils/common-messages'

import type { ReplaceSourceItem } from '../composables/file-replace-state'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	moveTitle: {
		id: 'files.transfer.move-title',
		defaultMessage: 'Move {count, plural, one {# item} other {# items}}',
	},
	moveToFolder: {
		id: 'files.transfer.move-to-folder',
		defaultMessage: 'Move to another folder',
	},
	moveToInstance: {
		id: 'files.transfer.move-to-instance',
		defaultMessage: 'Move to another instance',
	},
	replaceFile: {
		id: 'files.transfer.replace-file',
		defaultMessage: 'Replace file',
	},
	replaceTitle: {
		id: 'files.transfer.replace-title',
		defaultMessage: 'Replacing files',
	},
	replaceHint: {
		id: 'files.transfer.replace-hint',
		defaultMessage:
			'Right-click the checkbox of the target file to mark it; click again to replace. #1 replaces #1.',
	},
	moveUp: {
		id: 'files.transfer.move-up',
		defaultMessage: 'Move up',
	},
	moveDown: {
		id: 'files.transfer.move-down',
		defaultMessage: 'Move down',
	},
})

defineProps<{
	mode: 'move' | 'replace'
	items: ReplaceSourceItem[]
	canMoveToInstance?: boolean
	canReplace?: boolean
	disabled?: boolean
	disabledTooltip?: string
}>()

const emit = defineEmits<{
	(e: 'move-folder' | 'move-instance' | 'replace' | 'cancel'): void
	(e: 'renumber', index: number, direction: -1 | 1): void
}>()
</script>
