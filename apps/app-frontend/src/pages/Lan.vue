<script setup lang="ts">
import { RadioTowerIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import { onActivated } from 'vue'

import LanPage from '@/components/ui/lan/index.vue'
import { useRootBreadcrumb } from '@/shared/breadcrumbs'

defineOptions({ name: 'LanPage' })

const { formatMessage } = useVIntl()
const messages = defineMessages({
	heading: { id: 'app.lan.heading', defaultMessage: 'LAN' },
})
const breadcrumb = useRootBreadcrumb({
	slot: 'root',
	id: 'lan',
	label: () => formatMessage(messages.heading),
	to: '/lan',
	visual: { type: 'icon', component: RadioTowerIcon },
})
onActivated(breadcrumb.reset)
</script>

<template>
	<LanPage />
</template>
