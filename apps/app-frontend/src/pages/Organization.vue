<template>
	<div class="w-full p-2">
		<div v-if="isLoading" class="flex min-h-[24rem] items-center justify-center">
			<SpinnerIcon class="h-8 w-8 animate-spin text-secondary" />
		</div>

		<NormalPage v-else-if="organization" sidebar="right" full-width>
			<template #header>
				<PageHeader :title="organization.name" :summary="organization.description">
					<template #leading>
						<Avatar
							:src="organization.icon_url"
							:alt="organization.name"
							size="96px"
							:tint-by="organization.id"
						/>
					</template>

					<template #badges>
						<PageHeaderBadgeItem :icon="OrganizationIcon">
							{{ formatMessage(messages.organizationLabel) }}
						</PageHeaderBadgeItem>
					</template>

					<template #metadata>
						<PageHeaderMetadata>
							<PageHeaderMetadataNumberItem
								:icon="UsersIcon"
								:value="members.length"
								:label="formatMessage(messages.membersCount, { count: members.length })"
							/>
							<PageHeaderMetadataNumberItem
								:icon="BoxIcon"
								:value="projects.length"
								:label="formatMessage(messages.projectsCount, { count: projects.length })"
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
								v-tooltip="formatMessage(messages.openOnModrinth)"
								circular
								type="transparent"
								@click="openOnModrinth"
							>
								<ExternalIcon />
							</Button>
						</PageHeaderActions>
					</template>
				</PageHeader>
			</template>

			<NavTabs v-if="navLinks.length > 2" :links="navLinks" replace page-nav />

			<div class="flex flex-col gap-3">
				<ProjectList
					v-if="filteredProjects.length > 0"
					:projects="filteredProjects"
					layout="list"
					link-mode="app"
				>
					<template #actions="{ project }">
						<Button
							v-if="project.minecraft_server == null"
							type="outlined"
							class="!text-brand [&>svg]:!text-brand !shadow-[inset_0_0_0_1px_var(--color-brand)]"
							:disabled="isProjectInstalling(project.id)"
							@click.stop="installProject(project)"
						>
							<SpinnerIcon v-if="isProjectInstalling(project.id)" class="animate-spin" />
							<DownloadIcon v-else-if="project.project_types.includes('modpack')" />
							<PlusIcon v-else />
							{{
								formatMessage(
									isProjectInstalling(project.id)
										? commonMessages.installingLabel
										: project.project_types.includes('modpack')
											? commonMessages.installButton
											: messages.installToInstance,
								)
							}}
						</Button>
					</template>
				</ProjectList>

				<EmptyState v-else type="empty" :heading="formatMessage(messages.noProjects)" />
			</div>

			<template #sidebar>
				<div class="flex flex-col">
					<div
						v-if="members.length > 0"
						class="border-0 border-b-[1px] border-solid border-[--brand-gradient-border] p-4"
					>
						<h2 class="m-0 mb-3 text-lg font-semibold text-contrast">
							{{ formatMessage(messages.membersTitle) }}
						</h2>
						<div class="flex flex-col gap-3">
							<router-link
								v-for="member in members"
								:key="member.user.id"
								:to="`/user/${encodeURIComponent(member.user.username)}`"
								class="group flex items-center gap-3 rounded-xl text-primary"
							>
								<Avatar
									:src="member.user.avatar_url"
									:alt="member.user.username"
									size="2.5rem"
									:tint-by="member.user.username"
									circle
								/>
								<div class="flex min-w-0 flex-col">
									<span
										class="flex items-center gap-1 truncate font-semibold text-contrast group-hover:underline"
									>
										{{ member.user.username }}
										<CrownIcon
											v-if="member.is_owner"
											v-tooltip="formatMessage(messages.ownerLabel)"
											class="h-4 w-4 shrink-0 text-orange"
										/>
									</span>
									<span class="truncate text-sm text-secondary">{{ member.role }}</span>
								</div>
							</router-link>
						</div>
					</div>
				</div>
			</template>
		</NormalPage>

		<div v-else class="flex min-h-[24rem] items-center justify-center p-6">
			<EmptyState
				type="error"
				:heading="formatMessage(messages.notFound)"
				:description="formatMessage(messages.loadError)"
			>
				<template #actions>
					<Button type="colored" color="brand" native-type="button" @click="load">
						{{ formatMessage(commonMessages.retryButton) }}
					</Button>
				</template>
			</EmptyState>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import {
	BoxIcon,
	CrownIcon,
	DownloadIcon,
	ExternalIcon,
	OrganizationIcon,
	PlusIcon,
	SpinnerIcon,
	UsersIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	catalogProjectTypes,
	commonMessages,
	defineMessages,
	EmptyState,
	filterProjectsByType,
	getProjectTypeCategoryMessage,
	injectNotificationManager,
	NavTabs,
	NormalPage,
	PageHeader,
	PageHeaderActions,
	PageHeaderBadgeItem,
	PageHeaderMetadata,
	PageHeaderMetadataNumberItem,
	parseProjectTypeRouteParam,
	ProjectList,
	sortProjectTypes,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { get_organization_profile, get_organization_projects } from '@/helpers/users'
import { injectContentInstall } from '@/providers/content-install'
import { useBreadcrumb } from '@/shared/breadcrumbs'

const route = useRoute()
const router = useRouter()
const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { install: installVersion } = injectContentInstall()

const messages = defineMessages({
	organizationLabel: {
		id: 'app.organization.label',
		defaultMessage: 'Organization',
	},
	membersCount: {
		id: 'app.organization.members-count',
		defaultMessage: '{count, plural, one {member} other {members}}',
	},
	projectsCount: {
		id: 'app.organization.projects-count',
		defaultMessage: '{count, plural, one {project} other {projects}}',
	},
	downloadsCount: {
		id: 'app.organization.downloads-count',
		defaultMessage: '{count, plural, one {download} other {downloads}}',
	},
	membersTitle: {
		id: 'app.organization.members',
		defaultMessage: 'Members',
	},
	ownerLabel: {
		id: 'app.organization.owner',
		defaultMessage: 'Owner',
	},
	openOnModrinth: {
		id: 'app.organization.open-on-modrinth',
		defaultMessage: 'Open on Modrinth',
	},
	noProjects: {
		id: 'app.organization.no-projects',
		defaultMessage: 'This organization has no projects yet',
	},
	notFound: {
		id: 'app.organization.not-found',
		defaultMessage: 'Organization not found',
	},
	loadError: {
		id: 'app.organization.load-error',
		defaultMessage: 'Could not load this organization. Check your connection and try again.',
	},
	installToInstance: {
		id: 'app.user.project.install-to-instance',
		defaultMessage: 'Install to instance',
	},
})

function readRouteParam(param: unknown): string | undefined {
	const value = Array.isArray(param) ? param[0] : param
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

const organizationId = computed(() => readRouteParam(route.params.id) ?? '')
const selectedProjectType = computed(() =>
	parseProjectTypeRouteParam(readRouteParam(route.params.projectType)),
)

const organization = ref<Labrinth.Organizations.v3.Organization | null>(null)
const projects = ref<Labrinth.Projects.v3.Project[]>([])
const isLoading = ref(true)

const members = computed(() =>
	(organization.value?.members ?? [])
		.filter((member) => member.accepted !== false)
		.slice()
		.sort((first, second) => {
			if (first.is_owner !== second.is_owner) return first.is_owner ? -1 : 1
			return (first.ordering ?? 0) - (second.ordering ?? 0)
		}),
)

const sumDownloads = computed(() =>
	projects.value.reduce((total, project) => total + project.downloads, 0),
)

const filteredProjects = computed(() =>
	filterProjectsByType(projects.value, selectedProjectType.value)
		.slice()
		.sort((first, second) => second.downloads - first.downloads),
)

const navLinks = computed(() => {
	if (!organization.value) return []
	const basePath = `/organization/${encodeURIComponent(organizationId.value)}`
	return [
		{
			label: formatMessage(commonMessages.allProjectType),
			href: basePath,
		},
		...sortProjectTypes(catalogProjectTypes(projects.value)).map((projectType) => ({
			label: formatMessage(getProjectTypeCategoryMessage(projectType)),
			href: `${basePath}/${projectType}s`,
		})),
	]
})

async function load(): Promise<void> {
	const id = organizationId.value
	if (!id) return
	isLoading.value = true
	try {
		const [profile, list] = await Promise.all([
			get_organization_profile(id),
			get_organization_projects(id),
		])
		if (id !== organizationId.value) return
		organization.value = profile
		projects.value = (list ?? []).filter(Boolean)
	} catch (error) {
		organization.value = null
		projects.value = []
		console.error(error)
	} finally {
		isLoading.value = false
	}
}

watch(organizationId, (next, previous) => {
	if (next && next !== previous) void load()
})

const installingProjectIds = ref(new Set<string>())

function isProjectInstalling(projectId: string): boolean {
	return installingProjectIds.value.has(projectId)
}

function setProjectInstalling(projectId: string, installing: boolean): void {
	const next = new Set(installingProjectIds.value)
	if (installing) {
		next.add(projectId)
	} else {
		next.delete(projectId)
	}
	installingProjectIds.value = next
}

async function installProject(project: Labrinth.Projects.v3.Project): Promise<void> {
	if (isProjectInstalling(project.id)) return

	setProjectInstalling(project.id, true)
	try {
		await installVersion(
			project.id,
			null,
			null,
			'OrganizationPage',
			() => setProjectInstalling(project.id, false),
			(instanceId) => router.push(`/instance/${encodeURIComponent(instanceId)}`),
		)
	} catch (error) {
		setProjectInstalling(project.id, false)
		handleError(error)
	}
}

function openOnModrinth(): void {
	const slug = organization.value?.slug ?? organizationId.value
	void openUrl(`https://modrinth.com/organization/${encodeURIComponent(slug)}`)
}

const breadcrumbId = ref(organizationId.value)
const breadcrumbLabel = ref(organizationId.value)
const breadcrumbTo = ref(route.fullPath)
watch(
	[organizationId, organization, () => route.fullPath],
	([currentId, currentOrganization, currentPath]) => {
		if (route.name !== 'Organization') return
		breadcrumbId.value = currentId
		breadcrumbLabel.value = currentOrganization?.name ?? currentId
		breadcrumbTo.value = currentPath
	},
	{ immediate: true, flush: 'sync' },
)

useBreadcrumb({
	slot: 'organization',
	id: () => `organization:${breadcrumbId.value}`,
	label: breadcrumbLabel,
	to: breadcrumbTo,
	visual: () => ({
		type: 'image',
		src: organization.value?.icon_url ?? undefined,
		alt: breadcrumbLabel.value,
		tintBy: breadcrumbId.value,
	}),
})

await load()
</script>
