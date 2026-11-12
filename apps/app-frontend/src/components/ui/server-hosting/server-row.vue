<script setup lang="ts">
import { PowerIcon, ServerStackIcon, SpinnerIcon } from '@modrinth/assets'
import { useVIntl } from '@modrinth/ui'
import { computed } from 'vue'

import { hostedAddress, type HostedServerView, isHostedActive } from '@/helpers/hosting'

import { crashMessages, hostingMessages, softwareLabels } from './messages'
import StatusPill from './status-pill.vue'

const props = defineProps<{
	server: HostedServerView
	grid: boolean
	busy: boolean
}>()

const emit = defineEmits<{
	open: [id: string]
	power: [server: HostedServerView]
}>()

const { formatMessage } = useVIntl()

const active = computed(() => isHostedActive(props.server.status))
const crashTitle = computed(() =>
	props.server.status === 'crashed' && props.server.crash_reason
		? formatMessage(crashMessages[`${props.server.crash_reason}Title`], {
				port: props.server.port,
				version: props.server.game_version,
				need: props.server.java_need,
			})
		: null,
)
const subtitle = computed(
	() =>
		crashTitle.value ??
		hostedAddress(props.server) ??
		formatMessage(hostingMessages.serverSubtitle, {
			software: softwareLabels[props.server.software] ?? props.server.software,
			version: props.server.game_version,
		}),
)
</script>

<template>
	<div
		class="hosting-row"
		:class="{ 'is-grid': grid }"
		:data-status="server.status"
		role="button"
		tabindex="0"
		@click="emit('open', server.id)"
		@keydown.enter="emit('open', server.id)"
	>
		<div class="hosting-row-icon">
			<ServerStackIcon />
		</div>
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-base font-bold text-contrast">{{ server.name }}</span>
			<span class="truncate text-sm" :class="crashTitle ? 'text-red' : 'text-secondary'">
				{{ subtitle }}
			</span>
		</div>
		<div class="hosting-row-actions">
			<StatusPill :status="server.status" />
			<button
				v-tooltip="formatMessage(active ? hostingMessages.stop : hostingMessages.start)"
				type="button"
				class="hosting-power"
				:class="{ 'is-on': active }"
				:disabled="busy || server.status === 'stopping'"
				:aria-label="formatMessage(active ? hostingMessages.stop : hostingMessages.start)"
				@click.stop="emit('power', server)"
			>
				<SpinnerIcon v-if="busy" class="animate-spin" />
				<PowerIcon v-else />
			</button>
		</div>
	</div>
</template>

<style scoped lang="scss">
.hosting-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 0.875rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	cursor: pointer;
	transition:
		border-color 0.2s ease,
		background-color 0.2s ease;

	&:hover,
	&:focus-visible {
		background: var(--surface-5);
		outline: none;
	}

	&[data-status='running'] {
		border-color: var(--color-brand);
	}

	&.is-grid {
		flex-wrap: wrap;

		.hosting-row-actions {
			width: 100%;
			justify-content: space-between;
		}
	}
}

.hosting-row-icon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 2.75rem;
	height: 2.75rem;
	border-radius: var(--radius-md, 0.5rem);
	background: var(--surface-3);
	color: var(--color-secondary);

	svg {
		width: 1.5rem;
		height: 1.5rem;
	}

	[data-status='running'] & {
		color: var(--color-brand);
		background: var(--color-brand-highlight);
	}
}

.hosting-row-actions {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 0.625rem;
}

.hosting-power {
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: var(--surface-3);
	color: var(--color-secondary);
	cursor: pointer;
	transition:
		color 0.15s ease,
		background-color 0.15s ease,
		border-color 0.15s ease;

	svg {
		width: 1.125rem;
		height: 1.125rem;
	}

	&:hover:not(:disabled) {
		color: var(--color-brand);
		border-color: var(--color-brand);
	}

	&.is-on {
		color: var(--color-red);

		&:hover:not(:disabled) {
			border-color: var(--color-red);
			color: var(--color-red);
		}
	}

	&:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
}
</style>
