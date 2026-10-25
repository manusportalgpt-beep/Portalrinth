<template>
	<span
		class="account-provider-icon"
		:class="`account-provider-icon--${provider}`"
		aria-hidden="true"
	>
		<MicrosoftColorIcon v-if="provider === 'microsoft'" />
		<template v-else-if="provider === 'ely_by'">E</template>
		<UserIcon v-else />
	</span>
</template>

<script setup lang="ts">
import { MicrosoftColorIcon, UserIcon } from '@modrinth/assets'

/** The mark of the way an account signs in, as the sign-in picker draws it. */
defineProps<{
	provider: 'microsoft' | 'ely_by' | 'offline'
}>()
</script>

<style scoped>
.account-provider-icon {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	border-radius: 0.25rem;
	font-size: 0.625rem;
	line-height: 1;

	svg {
		width: 0.75rem;
		height: 0.75rem;
	}
}

.account-provider-icon--microsoft {
	background: #fff;
}

/* Ely.by's own green, as its mark wears it. */
.account-provider-icon--ely_by {
	background: #207e5c;
	color: #fff;
	font-weight: 800;
}

.account-provider-icon--offline {
	background: var(--surface-4);
	color: var(--color-base);
}
</style>
