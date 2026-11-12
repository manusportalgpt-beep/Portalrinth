<script setup lang="ts">
import { ServerStackIcon } from '@modrinth/assets'
import { useVIntl } from '@modrinth/ui'
import { onActivated } from 'vue'

import ServerHostingPage from '@/components/ui/server-hosting/index.vue'
import { hostingMessages } from '@/components/ui/server-hosting/messages'
import { useRootBreadcrumb } from '@/shared/breadcrumbs'

defineOptions({ name: 'ServerHostingPage' })

const { formatMessage } = useVIntl()
const breadcrumb = useRootBreadcrumb({
	slot: 'root',
	id: 'server-hosting',
	label: () => formatMessage(hostingMessages.heading),
	to: '/server-hosting',
	visual: { type: 'icon', component: ServerStackIcon },
})
onActivated(breadcrumb.reset)
</script>

<template>
	<ServerHostingPage />
</template>
