<script setup lang="ts">
import { ServerStackIcon } from '@modrinth/assets'
import { useVIntl } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { onActivated, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { hostingMessages } from '@/components/ui/server-hosting/messages'
import { hostedServerQueryOptions } from '@/components/ui/server-hosting/queries'
import ServerHostingServerPage from '@/components/ui/server-hosting/server-page.vue'
import { useBreadcrumb, useRootBreadcrumb } from '@/shared/breadcrumbs'

defineOptions({ name: 'ServerHostingServerPage' })

const { formatMessage } = useVIntl()
const route = useRoute()
const id = ref(String(route.params.id ?? ''))
watch(
	() => route.params.id,
	(value) => {
		if (route.name === 'ServerHostingServer' && typeof value === 'string') id.value = value
	},
)
const serverQuery = useQuery(hostedServerQueryOptions(() => id.value))

const root = useRootBreadcrumb({
	slot: 'root',
	id: 'server-hosting',
	label: () => formatMessage(hostingMessages.heading),
	to: '/server-hosting',
	visual: { type: 'icon', component: ServerStackIcon },
})
const serverBreadcrumb = useBreadcrumb(
	{
		slot: 'hosted-server',
		id: () => `hosted-server:${id.value}`,
		label: () => serverQuery.data.value?.name ?? id.value,
		to: () => `/server-hosting/${encodeURIComponent(id.value)}`,
		visual: { type: 'icon', component: ServerStackIcon },
	},
	{ parent: root },
)
onActivated(() => {
	root.reset()
	serverBreadcrumb.activate()
})
</script>

<template>
	<ServerHostingServerPage v-if="id" :id="id" />
</template>
