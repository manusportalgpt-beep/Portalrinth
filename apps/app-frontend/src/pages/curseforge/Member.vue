<template>
	<div class="w-full p-2">
		<NormalPage sidebar="right" full-width>
			<template #header>
				<PageHeader :title="memberName" :summary="formatMessage(messages.summary)">
					<template #leading>
						<Avatar :src="avatarUrl" :alt="memberName" size="96px" :tint-by="memberName" circle />
					</template>

					<template #badges>
						<PageHeaderBadgeItem :icon="CurseForgeIcon">
							{{ formatMessage(messages.curseforgeMember) }}
						</PageHeaderBadgeItem>
					</template>

					<template #metadata>
						<PageHeaderMetadata>
							<PageHeaderMetadataNumberItem
								:icon="BoxIcon"
								:value="allProjects.length"
								:label="formatMessage(messages.projectsCount, { count: allProjects.length })"
							/>
							<PageHeaderMetadataNumberItem
								:icon="DownloadIcon"
								:value="sumDownloads"
								:label="formatMessage(messages.downloadsCount, { count: sumDownloads })"
							/>
						</PageHeaderMetadata>
					</template>

					<template #actions>
						<PageHeaderActions>
							<Button
								v-tooltip="formatMessage(messages.openOnCurseforge)"
								circular
								type="transparent"
								@click="openOnCurseforge"
							>
								<ExternalIcon />
							</Button>
						</PageHeaderActions>
					</template>
				</PageHeader>
			</template>

			<div v-if="isLoading" class="flex min-h-[16rem] items-center justify-center">
				<SpinnerIcon class="h-8 w-8 animate-spin text-secondary" />
			</div>

			<template v-else>
				<NavTabs v-if="navLinks.length > 2" :links="navLinks" replace page-nav />

				<div class="flex flex-col gap-3">
					<ProjectCardList v-if="shownProjects.length > 0" layout="list">
						<ProjectCard
							v-for="project in shownProjects"
							:key="project.project_id"
							:link="`/curseforge/${encodeURIComponent(project.project_id)}`"
							:title="project.name"
							:icon-url="project.icon_url ?? undefined"
							:summary="project.summary"
							:project-types="project.project_types"
							:tags="project.display_categories.slice(0, 3)"
							:all-tags="project.display_categories"
							:downloads="project.downloads"
							:date-updated="project.date_modified"
							layout="list"
						>
							<template #actions>
								<Button
									type="outlined"
									class="!text-brand [&>svg]:!text-brand !shadow-[inset_0_0_0_1px_var(--color-brand)]"
									:disabled="isProjectInstalling(project.project_id)"
									@click.stop.prevent="installProject(project)"
								>
									<SpinnerIcon
										v-if="isProjectInstalling(project.project_id)"
										class="animate-spin"
									/>
									<DownloadIcon v-else-if="project.project_types.includes('modpack')" />
									<PlusIcon v-else />
									{{
										formatMessage(
											isProjectInstalling(project.project_id)
												? commonMessages.installingLabel
												: project.project_types.includes('modpack')
													? commonMessages.installButton
													: messages.installToInstance,
										)
									}}
								</Button>
							</template>
						</ProjectCard>
					</ProjectCardList>

					<EmptyState
						v-else-if="loadFailed"
						type="error"
						:heading="formatMessage(messages.loadError)"
						:description="formatMessage(messages.loadErrorDescription)"
					>
						<template #actions>
							<Button type="colored" color="brand" native-type="button" @click="load">
								{{ formatMessage(commonMessages.retryButton) }}
							</Button>
						</template>
					</EmptyState>

					<EmptyState v-else type="empty" :heading="formatMessage(messages.noProjects)">
						<template #actions>
							<Button type="outlined" native-type="button" @click="openOnCurseforge">
								<ExternalIcon /> {{ formatMessage(messages.openOnCurseforge) }}
							</Button>
						</template>
					</EmptyState>
				</div>
			</template>
		</NormalPage>
	</div>
</template>

<script setup lang="ts">
import {
	BoxIcon,
	CurseForgeIcon,
	DownloadIcon,
	ExternalIcon,
	PlusIcon,
	SpinnerIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	commonMessages,
	defineMessages,
	EmptyState,
	getProjectTypeCategoryMessage,
	injectNotificationManager,
	NavTabs,
	NormalPage,
	PageHeader,
	PageHeaderActions,
	PageHeaderBadgeItem,
	PageHeaderMetadata,
	PageHeaderMetadataNumberItem,
	ProjectCard,
	ProjectCardList,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
	curseforgeMemberWebUrl,
	curseforgeSearch,
	type CurseforgeSearchHit,
} from '@/helpers/curseforge'
import { injectContentInstall } from '@/providers/content-install'
import { useBreadcrumb } from '@/shared/breadcrumbs'

const route = useRoute()
const router = useRouter()
const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { install: installVersion } = injectContentInstall()

const messages = defineMessages({
	curseforgeMember: {
		id: 'app.curseforge-member.label',
		defaultMessage: 'CurseForge author',
	},
	summary: {
		id: 'app.curseforge-member.summary',
		defaultMessage: 'Projects this author or team published on CurseForge.',
	},
	projectsCount: {
		id: 'app.organization.projects-count',
		defaultMessage: '{count, plural, one {project} other {projects}}',
	},
	downloadsCount: {
		id: 'app.organization.downloads-count',
		defaultMessage: '{count, plural, one {download} other {downloads}}',
	},
	openOnCurseforge: {
		id: 'app.curseforge-member.open-on-curseforge',
		defaultMessage: 'Open on CurseForge',
	},
	noProjects: {
		id: 'app.curseforge-member.no-projects',
		defaultMessage: 'No projects were found for this author',
	},
	loadError: {
		id: 'app.curseforge-member.load-error',
		defaultMessage: 'Could not load the projects',
	},
	loadErrorDescription: {
		id: 'app.curseforge-member.load-error-description',
		defaultMessage: 'Check your connection and your CurseForge API key, then try again.',
	},
	installToInstance: {
		id: 'app.user.project.install-to-instance',
		defaultMessage: 'Install to instance',
	},
})

/** CurseForge's project classes, in the order the tabs show them. */
const PROJECT_TYPES = ['modpack', 'mod', 'resourcepack', 'shader', 'datapack'] as const
/** CurseForge pages at most 50 at a time; four pages cover any author. */
const PAGE_SIZE = 50
const MAX_PAGES = 4

function readParam(param: unknown): string {
	const value = Array.isArray(param) ? param[0] : param
	return typeof value === 'string' ? value : ''
}

const memberId = computed(() => readParam(route.params.id))
const memberName = computed(() => readParam(route.query.name) || memberId.value)
const avatarUrl = computed(() => readParam(route.query.avatar) || undefined)
const numericId = computed(() => (/^\d+$/.test(memberId.value) ? Number(memberId.value) : null))
const selectedType = computed(() => {
	const type = readParam(route.params.projectType).replace(/s$/, '')
	return (PROJECT_TYPES as readonly string[]).includes(type) ? type : null
})

const projectsByType = ref<Record<string, CurseforgeSearchHit[]>>({})
const isLoading = ref(true)
const loadFailed = ref(false)

const allProjects = computed(() =>
	Object.values(projectsByType.value)
		.flat()
		.sort((first, second) => second.downloads - first.downloads),
)
const shownProjects = computed(() =>
	selectedType.value ? (projectsByType.value[selectedType.value] ?? []) : allProjects.value,
)
const sumDownloads = computed(() =>
	allProjects.value.reduce((total, project) => total + project.downloads, 0),
)

const navLinks = computed(() => {
	const base = `/curseforge/member/${encodeURIComponent(memberId.value)}`
	const query = new URLSearchParams(
		Object.entries(route.query).flatMap(([key, value]) =>
			typeof value === 'string' ? [[key, value]] : [],
		),
	).toString()
	const suffix = query ? `?${query}` : ''
	return [
		{ label: formatMessage(commonMessages.allProjectType), href: `${base}${suffix}` },
		...PROJECT_TYPES.filter((type) => (projectsByType.value[type]?.length ?? 0) > 0).map(
			(type) => ({
				label: formatMessage(getProjectTypeCategoryMessage(type)),
				href: `${base}/${type}s${suffix}`,
			}),
		),
	]
})

async function loadType(authorId: number, projectType: string): Promise<CurseforgeSearchHit[]> {
	const found: CurseforgeSearchHit[] = []
	for (let page = 0; page < MAX_PAGES; page++) {
		const results = await curseforgeSearch({
			query: null,
			project_type: projectType,
			game_versions: [],
			loaders: [],
			category_ids: [],
			sort: 'downloads',
			offset: page * PAGE_SIZE,
			limit: PAGE_SIZE,
			author_id: authorId,
		})
		found.push(...results.hits)
		if (found.length >= results.total_hits || results.hits.length < PAGE_SIZE) break
	}
	return found
}

let loadToken = 0
async function load(): Promise<void> {
	const token = ++loadToken
	const authorId = numericId.value
	isLoading.value = true
	loadFailed.value = false
	projectsByType.value = {}
	if (authorId === null) {
		isLoading.value = false
		return
	}
	try {
		const lists = await Promise.allSettled(
			PROJECT_TYPES.map((projectType) => loadType(authorId, projectType)),
		)
		if (token !== loadToken) return
		const next: Record<string, CurseforgeSearchHit[]> = {}
		PROJECT_TYPES.forEach((projectType, index) => {
			const list = lists[index]
			if (list.status === 'fulfilled' && list.value.length > 0) next[projectType] = list.value
		})
		projectsByType.value = next
		loadFailed.value = lists.every((list) => list.status === 'rejected')
	} finally {
		if (token === loadToken) isLoading.value = false
	}
}

watch(memberId, (next, previous) => {
	if (next && next !== previous) void load()
})
onMounted(() => {
	void load()
})

const installingProjectIds = ref(new Set<string>())

function isProjectInstalling(projectId: string): boolean {
	return installingProjectIds.value.has(projectId)
}

function setProjectInstalling(projectId: string, installing: boolean): void {
	const next = new Set(installingProjectIds.value)
	if (installing) next.add(projectId)
	else next.delete(projectId)
	installingProjectIds.value = next
}

async function installProject(project: CurseforgeSearchHit): Promise<void> {
	const projectId = project.project_id
	if (isProjectInstalling(projectId)) return
	setProjectInstalling(projectId, true)
	try {
		await installVersion(
			projectId,
			null,
			null,
			'CurseforgeMemberPage',
			() => setProjectInstalling(projectId, false),
			(instanceId) => router.push(`/instance/${encodeURIComponent(instanceId)}`),
		)
	} catch (error) {
		setProjectInstalling(projectId, false)
		handleError(error as Error)
	}
}

function openOnCurseforge(): void {
	void openUrl(curseforgeMemberWebUrl(memberName.value))
}

useBreadcrumb({
	slot: 'organization',
	id: () => `curseforge-member:${memberId.value}`,
	label: () => memberName.value,
	to: () => route.fullPath,
	visual: () => ({
		type: 'image',
		src: avatarUrl.value,
		alt: memberName.value,
		tintBy: memberName.value,
	}),
})
</script>
