<script setup lang="ts">
import { SparklesIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import { onActivated } from 'vue'

import AiAssistantPage from '@/components/ui/ai/AiAssistantPage.vue'
import { useRootBreadcrumb } from '@/shared/breadcrumbs'

defineOptions({ name: 'AiPage' })

const { formatMessage } = useVIntl()
const messages = defineMessages({
	heading: { id: 'app.nav.ai', defaultMessage: 'ИИ-Помощник' },
})
const breadcrumb = useRootBreadcrumb({
	slot: 'root',
	id: 'ai',
	label: () => formatMessage(messages.heading),
	to: '/ai',
	visual: { type: 'icon', component: SparklesIcon },
})
onActivated(breadcrumb.reset)
</script>

<template>
	<AiAssistantPage />
</template>
