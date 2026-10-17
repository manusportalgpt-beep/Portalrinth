<script setup lang="ts">
/**
 * The two places mods come from, as marks rather than as words.
 *
 * The names of the services are their trademarks and are drawn here rather than
 * typed out, both because that is what the services themselves look like and
 * because a word beside a search box is read as a label for the box rather than
 * as a choice. The choice is what these are: two of them lit, or both.
 */
import { defineMessages, useVIntl } from '@modrinth/ui'

const props = defineProps<{
	provider: 'modrinth' | 'both' | 'curseforge'
	disabled?: boolean
}>()

const emit = defineEmits<{
	(event: 'select', provider: 'modrinth' | 'both' | 'curseforge'): void
}>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	modrinth: { id: 'browse.provider.modrinth', defaultMessage: 'Modrinth' },
	curseforge: { id: 'browse.provider.curseforge', defaultMessage: 'CurseForge' },
	both: { id: 'browse.provider.both', defaultMessage: 'Search both Modrinth and CurseForge' },
	bothShort: { id: 'browse.provider.both-short', defaultMessage: 'Both' },
})

const options = [
	{ value: 'modrinth', label: messages.modrinth },
	{ value: 'both', label: messages.both },
	{ value: 'curseforge', label: messages.curseforge },
] as const

const isSelected = (value: (typeof options)[number]['value']) => props.provider === value

/**
 * Whether a mark is lit. In the middle option both are lit, because both are
 * being searched; a mark that is merely there but dim would say the opposite.
 */
function lit(value: 'modrinth' | 'curseforge') {
	if (props.provider === 'both') return true
	return props.provider === value
}
</script>

<template>
	<div class="flex items-center gap-1.5" role="group">
		<button
			v-for="option in options"
			:key="option.value"
			type="button"
			role="radio"
			:aria-checked="isSelected(option.value)"
			:aria-label="formatMessage(option.label)"
			:title="formatMessage(option.label)"
			:disabled="disabled"
			class="flex items-center gap-1.5 rounded-lg border border-solid px-2 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			:class="
				isSelected(option.value)
					? 'border-brand bg-brand/10'
					: 'border-surface-5 bg-surface-2 hover:bg-surface-3'
			"
			@click="emit('select', option.value)"
		>
			<!-- Modrinth's mark: the green ring with the cube at its centre. -->
			<svg
				v-if="option.value !== 'curseforge'"
				viewBox="0 0 24 24"
				class="h-5 w-5 shrink-0"
				:class="lit('modrinth') ? 'text-green' : 'text-contrast/40'"
				aria-hidden="true"
			>
				<path
					fill="currentColor"
					d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm0 2a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z"
				/>
				<path
					fill="currentColor"
					d="M13.9 8.6 8 8l-1.6 3.2 6.9.5-1.1 1.6H6.9l-.6-2.4 2.6-3.6 6.2-.5 2.4 3.1-.3 2.4-1.7 2.5h-4.4l1.2-1.9 2.4-1.6 1.1-1.6Z"
				/>
			</svg>

			<!--
				CurseForge's mark: the anvil. Drawn as a filled silhouette, which
				is how it is normally reproduced, and kept to one path so it stays
				readable at the size a button gives it.
			-->
			<svg
				v-if="option.value !== 'modrinth'"
				viewBox="0 0 24 24"
				class="h-5 w-5 shrink-0"
				:class="lit('curseforge') ? 'text-contrast' : 'text-contrast/40'"
				aria-hidden="true"
			>
				<path
					fill="currentColor"
					d="M2.4 4.1h12.1c1 0 1.7.8 1.7 1.7v.5h1.6c1.1 0 2 .9 2 2s-.9 2-2 2h-3.1c-.4 1.9-1.6 3.5-3.4 4.3l1.6 1.9h3.4c.6 0 1 .4 1 1s-.4 1-1 1h-4.3l-2.4-2.8-2.5 2.8H4.8c-.6 0-1-.4-1-1s.4-1 1-1h2.9l2.5-2.9c-2.3-.7-4-2.9-4.4-5.4H3.4c-.6 0-1-.5-1-1s.4-1 1-1Zm3.6 3.9c.3 2 1.9 3.5 3.9 3.5s3.6-1.5 3.9-3.5H6Z"
				/>
			</svg>

			<span v-if="option.value === 'both'" class="text-sm font-semibold text-contrast">
				{{ formatMessage(messages.bothShort) }}
			</span>
		</button>
	</div>
</template>
