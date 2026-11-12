<script setup lang="ts">
import { useVIntl } from '@modrinth/ui'

import type { HostedStatus } from '@/helpers/hosting'

import { statusMessages } from './messages'

defineProps<{ status: HostedStatus }>()

const { formatMessage } = useVIntl()
</script>

<template>
	<span class="hosting-status" :data-status="status">
		<span class="hosting-status-dot" />
		{{ formatMessage(statusMessages[status]) }}
	</span>
</template>

<style scoped lang="scss">
.hosting-status {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.125rem 0.625rem;
	border-radius: 999px;
	background: var(--surface-5);
	color: var(--color-secondary);
	font-size: 0.75rem;
	font-weight: 600;
	white-space: nowrap;

	&[data-status='running'] {
		color: var(--color-brand);
		background: var(--color-brand-highlight);
	}

	&[data-status='installing'],
	&[data-status='starting'],
	&[data-status='stopping'] {
		color: var(--color-orange);
	}

	&[data-status='crashed'] {
		color: var(--color-red);
	}
}

.hosting-status-dot {
	position: relative;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 999px;
	background: currentColor;
	opacity: 0.8;

	[data-status='running'] &::after,
	[data-status='starting'] &::after,
	[data-status='installing'] &::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: currentColor;
		animation: hosting-status-pulse 1.6s ease-out infinite;
	}
}

@keyframes hosting-status-pulse {
	0% {
		transform: scale(1);
		opacity: 0.7;
	}
	100% {
		transform: scale(2.6);
		opacity: 0;
	}
}

@media (prefers-reduced-motion) {
	.hosting-status-dot::after {
		animation: none !important;
	}
}
</style>
