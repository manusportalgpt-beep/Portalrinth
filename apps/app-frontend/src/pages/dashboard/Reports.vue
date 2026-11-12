<script setup lang="ts">
import { ExternalIcon, ReportIcon } from '@modrinth/assets'
import {
	Button,
	Checkbox,
	injectNotificationManager,
	useRelativeTime,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref } from 'vue'

import { type CreatorReport, getMyReports, MODRINTH_SITE } from '@/helpers/modrinth-creator'
import { get as getCreds } from '@/helpers/mr_auth.ts'

import { creatorMessages as messages } from './creator-messages'

const { formatMessage } = useVIntl()
const formatRelativeTime = useRelativeTime()
const { handleError } = injectNotificationManager()

const signedIn = ref(true)
const reports = ref<CreatorReport[]>([])
const showClosed = ref(false)

try {
	if (!(await getCreds())) signedIn.value = false
	else reports.value = await getMyReports()
} catch (error) {
	handleError(error as Error)
}

const visible = computed(() =>
	reports.value
		.filter((report) => showClosed.value || !report.closed)
		.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()),
)

function itemLabel(type: string) {
	if (type === 'version') return formatMessage(messages.itemVersion)
	if (type === 'user') return formatMessage(messages.itemUser)
	return formatMessage(messages.itemProject)
}

function reportType(type: string) {
	return type.charAt(0).toUpperCase() + type.slice(1).replace(/[-_]/g, ' ')
}

function open(report: CreatorReport) {
	openUrl(`${MODRINTH_SITE}/dashboard/report/${report.id}`)
}
</script>

<template>
	<div class="creator-sheet">
		<div v-if="!signedIn" class="empty-state">
			<ReportIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.signIn) }}</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.signInBody) }}</p>
		</div>

		<template v-else>
			<div class="creator-head">
				<h2>{{ formatMessage(messages.reportsTitle) }}</h2>
				<Checkbox
					v-if="reports.some((report) => report.closed)"
					v-model="showClosed"
					:label="formatMessage(messages.showClosed)"
				/>
			</div>

			<div v-if="visible.length === 0" class="empty-state">
				<ReportIcon aria-hidden="true" />
				<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.noReports) }}</p>
				<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.noReportsBody) }}</p>
			</div>

			<div v-else class="flex flex-col gap-3">
				<div v-for="report in visible" :key="report.id" class="creator-card report">
					<div class="flex flex-wrap items-center gap-2">
						<span class="report-icon"><ReportIcon aria-hidden="true" /></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-bold text-contrast">{{
								reportType(report.report_type)
							}}</span>
							<span class="block truncate text-sm text-secondary">
								{{ formatMessage(messages.reportOn, { type: itemLabel(report.item_type) }) }} ·
								<code>{{ report.item_id }}</code> · {{ formatRelativeTime(report.created) }}
							</span>
						</span>
						<span class="status-pill" :class="report.closed ? 'gray' : 'orange'">
							{{ formatMessage(report.closed ? messages.reportClosed : messages.reportOpen) }}
						</span>
						<Button @click="open(report)">
							<ExternalIcon aria-hidden="true" />
							{{ formatMessage(messages.openOnSite) }}
						</Button>
					</div>
					<p v-if="report.body" class="report-body">{{ report.body }}</p>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.creator-sheet .report {
	padding: var(--gap-lg);
	border-radius: var(--radius-lg);
	border: 1px solid color-mix(in srgb, var(--surface-5) 80%, transparent);
	background-color: color-mix(in srgb, var(--surface-4) 55%, transparent);
}

.report-icon {
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	border-radius: var(--radius-md);
	color: var(--color-orange);
	background-color: color-mix(in srgb, var(--color-orange) 14%, transparent);

	svg {
		width: 1.1rem;
		height: 1.1rem;
	}
}

.report-body {
	margin: 0;
	padding: var(--gap-md);
	border-radius: var(--radius-lg);
	background-color: var(--color-button-bg);
	color: var(--color-base);
	font-size: var(--font-size-sm);
	white-space: pre-wrap;
	word-break: break-word;
	display: -webkit-box;
	-webkit-line-clamp: 6;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
