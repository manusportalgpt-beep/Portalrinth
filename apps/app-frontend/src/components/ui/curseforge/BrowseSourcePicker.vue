<script setup lang="ts">
/**
 * Portalrinth's own: one button for where Discover searches - Modrinth,
 * CurseForge, or both at once. The button shows the current choice (an icon
 * and a name, or both icons with a "+"), and opens a small panel with the
 * three choices.
 */
import { CheckIcon, CurseForgeIcon, ModrinthBrandIcon, PlusIcon } from '@modrinth/assets'
import { defineMessages, TeleportPopoutMenu, useVIntl } from '@modrinth/ui'
import { computed } from 'vue'

import type { BrowseMode } from '@/helpers/curseforge'

const model = defineModel<BrowseMode>({ required: true })

const { formatMessage } = useVIntl()

const messages = defineMessages({
	label: { id: 'app.browse.source.label', defaultMessage: 'Where to browse' },
	both: { id: 'app.browse.source.both', defaultMessage: 'Modrinth + CurseForge' },
	bothHint: {
		id: 'app.browse.source.both-hint',
		defaultMessage: 'One list, no repeats - pick the platform on each card',
	},
})

const options = computed(() => [
	{ value: 'modrinth' as const, label: 'Modrinth', icons: ['modrinth'] as const },
	{
		value: 'both' as const,
		label: formatMessage(messages.both),
		icons: ['modrinth', 'curseforge'] as const,
	},
	{ value: 'curseforge' as const, label: 'CurseForge', icons: ['curseforge'] as const },
])

const current = computed(
	() => options.value.find((option) => option.value === model.value) ?? options.value[0],
)

function pick(value: BrowseMode, close: () => void) {
	model.value = value
	close()
}
</script>

<template>
	<TeleportPopoutMenu
		type="base"
		size="sm"
		placement="top-end"
		:label="formatMessage(messages.label)"
		:tooltip="formatMessage(messages.label)"
		:auto-focus="false"
	>
		<template #trigger>
			<span class="browse-source-trigger">
				<template v-if="current.value === 'both'">
					<ModrinthBrandIcon class="browse-source-icon browse-source-icon--modrinth" />
					<PlusIcon class="browse-source-plus" />
					<CurseForgeIcon class="browse-source-icon browse-source-icon--curseforge" />
				</template>
				<template v-else>
					<ModrinthBrandIcon
						v-if="current.value === 'modrinth'"
						class="browse-source-icon browse-source-icon--modrinth"
					/>
					<CurseForgeIcon v-else class="browse-source-icon browse-source-icon--curseforge" />
					<span>{{ current.label }}</span>
				</template>
			</span>
		</template>
		<template #panel="{ close }">
			<div
				class="browse-source-panel"
				role="radiogroup"
				:aria-label="formatMessage(messages.label)"
			>
				<button
					v-for="option in options"
					:key="option.value"
					type="button"
					role="radio"
					:aria-checked="model === option.value"
					class="browse-source-row"
					:class="{ 'browse-source-row--active': model === option.value }"
					@click="pick(option.value, close)"
				>
					<span class="browse-source-row-icons">
						<template v-for="(icon, index) in option.icons" :key="icon">
							<PlusIcon v-if="index > 0" class="browse-source-plus" />
							<ModrinthBrandIcon
								v-if="icon === 'modrinth'"
								class="browse-source-icon browse-source-icon--modrinth"
							/>
							<CurseForgeIcon v-else class="browse-source-icon browse-source-icon--curseforge" />
						</template>
					</span>
					<span class="browse-source-row-text">
						<span class="browse-source-row-label">{{ option.label }}</span>
						<span v-if="option.value === 'both'" class="browse-source-row-hint">
							{{ formatMessage(messages.bothHint) }}
						</span>
					</span>
					<CheckIcon class="browse-source-check" />
				</button>
			</div>
		</template>
	</TeleportPopoutMenu>
</template>

<style scoped>
.browse-source-trigger {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-weight: 600;
}

.browse-source-icon {
	width: 1.05rem;
	height: 1.05rem;
	flex-shrink: 0;
}

.browse-source-icon--modrinth {
	color: var(--color-green, #1bd96a);
}

.browse-source-icon--curseforge {
	color: #f16436;
}

.browse-source-plus {
	width: 0.7rem;
	height: 0.7rem;
	color: var(--color-secondary);
	stroke-width: 3;
}

.browse-source-panel {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	min-width: 15rem;
	margin: -0.5rem;
}

.browse-source-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.55rem 0.7rem;
	border: none;
	border-radius: var(--radius-md, 0.75rem);
	background: transparent;
	color: var(--color-base);
	text-align: left;
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		color 0.18s ease;
}

.browse-source-row:hover,
.browse-source-row:focus-visible {
	background: var(--surface-4);
	color: var(--color-contrast);
	outline: none;
}

.browse-source-row--active {
	background: var(--color-brand-highlight);
	color: var(--color-contrast);
}

.browse-source-row-icons {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.25rem;
	min-width: 3rem;
}

.browse-source-row-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.1rem;
}

.browse-source-row-label {
	font-weight: 600;
}

.browse-source-row-hint {
	font-size: 0.75rem;
	color: var(--color-secondary);
	max-width: 13rem;
}

.browse-source-check {
	width: 1rem;
	height: 1rem;
	color: var(--color-brand);
	opacity: 0;
	transform: scale(0.6);
	transition:
		opacity 0.18s ease,
		transform 0.18s ease;
}

.browse-source-row--active .browse-source-check {
	opacity: 1;
	transform: scale(1);
}
</style>
