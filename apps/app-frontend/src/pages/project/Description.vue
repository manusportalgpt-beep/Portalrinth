<template>
	<Card>
		<PortalrinthTranslatableDescription :description="project.body" />
	</Card>
</template>

<script setup>
import { Card } from '@modrinth/ui'

import PortalrinthTranslatableDescription from '@/components/ui/PortalrinthTranslatableDescription.vue'

defineProps({
	project: {
		type: Object,
		default: () => {},
	},
})
</script>

<script>
export default {
	name: 'Description',
}
</script>
