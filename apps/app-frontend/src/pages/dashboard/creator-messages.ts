import { defineMessages, useVIntl } from '@modrinth/ui'

import type { CreatorProjectStatus, CreatorProjectType } from '@/helpers/modrinth-creator'

export const creatorMessages = defineMessages({
	signIn: { id: 'app.creator.sign-in', defaultMessage: 'Sign in to Modrinth' },
	signInBody: {
		id: 'app.creator.sign-in.body',
		defaultMessage: 'This page works with your Modrinth account. Sign in to continue.',
	},
	openOnSite: { id: 'app.creator.open-on-site', defaultMessage: 'Open on Modrinth' },
	loadFailed: { id: 'app.creator.load-failed', defaultMessage: 'Could not load data' },
	cancel: { id: 'app.creator.cancel', defaultMessage: 'Cancel' },
	save: { id: 'app.creator.save', defaultMessage: 'Save changes' },
	saving: { id: 'app.creator.saving', defaultMessage: 'Saving...' },
	saved: { id: 'app.creator.saved', defaultMessage: 'Changes saved' },
	delete: { id: 'app.creator.delete', defaultMessage: 'Delete' },
	searchProjects: { id: 'app.creator.projects.search', defaultMessage: 'Search projects...' },
	createProject: { id: 'app.creator.projects.create', defaultMessage: 'Create a project' },
	noProjects: {
		id: 'app.creator.projects.empty',
		defaultMessage: "You don't have any projects yet",
	},
	noProjectsBody: {
		id: 'app.creator.projects.empty.body',
		defaultMessage: 'Create a project to publish your mods, packs and plugins on Modrinth.',
	},
	noMatch: { id: 'app.creator.projects.no-match', defaultMessage: 'No projects match your search' },
	columnName: { id: 'app.creator.projects.column.name', defaultMessage: 'Name' },
	columnType: { id: 'app.creator.projects.column.type', defaultMessage: 'Type' },
	columnStatus: { id: 'app.creator.projects.column.status', defaultMessage: 'Status' },
	columnDownloads: { id: 'app.creator.projects.column.downloads', defaultMessage: 'Downloads' },
	manage: { id: 'app.creator.projects.manage', defaultMessage: 'Manage' },
	totalProjects: { id: 'app.creator.projects.total', defaultMessage: 'Projects' },
	totalDownloads: { id: 'app.creator.projects.total-downloads', defaultMessage: 'Total downloads' },
	totalFollowers: { id: 'app.creator.projects.total-followers', defaultMessage: 'Followers' },

	typeMod: { id: 'app.creator.type.mod', defaultMessage: 'Mod' },
	typeModpack: { id: 'app.creator.type.modpack', defaultMessage: 'Modpack' },
	typeResourcepack: { id: 'app.creator.type.resourcepack', defaultMessage: 'Resource pack' },
	typeShader: { id: 'app.creator.type.shader', defaultMessage: 'Shader' },
	typeDatapack: { id: 'app.creator.type.datapack', defaultMessage: 'Data pack' },
	typePlugin: { id: 'app.creator.type.plugin', defaultMessage: 'Plugin' },

	statusApproved: { id: 'app.creator.status.approved', defaultMessage: 'Public' },
	statusUnlisted: { id: 'app.creator.status.unlisted', defaultMessage: 'Unlisted' },
	statusPrivate: { id: 'app.creator.status.private', defaultMessage: 'Private' },
	statusDraft: { id: 'app.creator.status.draft', defaultMessage: 'Draft' },
	statusProcessing: { id: 'app.creator.status.processing', defaultMessage: 'Under review' },
	statusRejected: { id: 'app.creator.status.rejected', defaultMessage: 'Rejected' },
	statusArchived: { id: 'app.creator.status.archived', defaultMessage: 'Archived' },
	statusWithheld: { id: 'app.creator.status.withheld', defaultMessage: 'Withheld' },
	statusScheduled: { id: 'app.creator.status.scheduled', defaultMessage: 'Scheduled' },
	statusUnknown: { id: 'app.creator.status.unknown', defaultMessage: 'Unknown' },

	createHeader: { id: 'app.creator.create.header', defaultMessage: 'Creating a project' },
	nameLabel: { id: 'app.creator.create.name', defaultMessage: 'Name' },
	namePlaceholder: {
		id: 'app.creator.create.name.placeholder',
		defaultMessage: 'Enter project name...',
	},
	urlLabel: { id: 'app.creator.create.url', defaultMessage: 'URL' },
	urlHint: {
		id: 'app.creator.create.url.hint',
		defaultMessage: 'Letters, numbers and dashes, 3 to 64 characters.',
	},
	typeLabel: { id: 'app.creator.create.type', defaultMessage: 'Project type' },
	visibilityLabel: { id: 'app.creator.create.visibility', defaultMessage: 'Visibility' },
	visibilityHint: {
		id: 'app.creator.create.visibility.hint',
		defaultMessage: 'The visibility your project will have after it has been approved.',
	},
	summaryLabel: { id: 'app.creator.create.summary', defaultMessage: 'Summary' },
	summaryHint: {
		id: 'app.creator.create.summary.hint',
		defaultMessage: 'A sentence or two that describes your project.',
	},
	summaryPlaceholder: {
		id: 'app.creator.create.summary.placeholder',
		defaultMessage: 'This project adds...',
	},
	iconLabel: { id: 'app.creator.create.icon', defaultMessage: 'Icon' },
	chooseIcon: { id: 'app.creator.create.icon.choose', defaultMessage: 'Choose image' },
	removeIcon: { id: 'app.creator.create.icon.remove', defaultMessage: 'Remove' },
	create: { id: 'app.creator.create.submit', defaultMessage: 'Create project' },
	creating: { id: 'app.creator.create.submitting', defaultMessage: 'Creating...' },
	created: { id: 'app.creator.create.created', defaultMessage: 'Project created' },
	createdDetail: {
		id: 'app.creator.create.created.detail',
		defaultMessage: '“{name}” was created as a draft.',
	},

	backToProjects: { id: 'app.creator.manage.back', defaultMessage: 'All projects' },
	tabGeneral: { id: 'app.creator.manage.tab.general', defaultMessage: 'General' },
	tabVersions: { id: 'app.creator.manage.tab.versions', defaultMessage: 'Versions' },
	tabLinks: { id: 'app.creator.manage.tab.links', defaultMessage: 'Links' },
	descriptionLabel: { id: 'app.creator.manage.description', defaultMessage: 'Description' },
	descriptionHint: {
		id: 'app.creator.manage.description.hint',
		defaultMessage: 'The full page of your project. Markdown is supported.',
	},
	environmentLabel: { id: 'app.creator.manage.environment', defaultMessage: 'Environment' },
	clientSide: { id: 'app.creator.manage.client', defaultMessage: 'Client' },
	serverSide: { id: 'app.creator.manage.server', defaultMessage: 'Server' },
	sideRequired: { id: 'app.creator.side.required', defaultMessage: 'Required' },
	sideOptional: { id: 'app.creator.side.optional', defaultMessage: 'Optional' },
	sideUnsupported: { id: 'app.creator.side.unsupported', defaultMessage: 'Unsupported' },
	changeIcon: { id: 'app.creator.manage.icon.change', defaultMessage: 'Change icon' },
	iconUpdated: { id: 'app.creator.manage.icon.updated', defaultMessage: 'Icon updated' },
	sourceUrl: { id: 'app.creator.manage.links.source', defaultMessage: 'Source code' },
	issuesUrl: { id: 'app.creator.manage.links.issues', defaultMessage: 'Issue tracker' },
	wikiUrl: { id: 'app.creator.manage.links.wiki', defaultMessage: 'Wiki page' },
	discordUrl: { id: 'app.creator.manage.links.discord', defaultMessage: 'Discord invite' },
	linksHint: {
		id: 'app.creator.manage.links.hint',
		defaultMessage: 'Links shown on the project page. Leave a field empty to hide it.',
	},
	submitReview: { id: 'app.creator.manage.submit', defaultMessage: 'Submit for review' },
	submitted: { id: 'app.creator.manage.submitted', defaultMessage: 'Sent for review' },
	submittedDetail: {
		id: 'app.creator.manage.submitted.detail',
		defaultMessage: 'The moderators will look at your project soon.',
	},
	draftNote: {
		id: 'app.creator.manage.draft-note',
		defaultMessage:
			'This project is a draft. Upload at least one version, then submit it for review to publish it.',
	},
	processingNote: {
		id: 'app.creator.manage.processing-note',
		defaultMessage: 'This project is waiting for the moderators. You can keep editing it.',
	},
	deleteProject: { id: 'app.creator.manage.delete', defaultMessage: 'Delete project' },
	deleteProjectTitle: {
		id: 'app.creator.manage.delete.title',
		defaultMessage: 'Are you sure you want to delete this project?',
	},
	deleteProjectBody: {
		id: 'app.creator.manage.delete.body',
		defaultMessage:
			'The project, its versions and its files will be removed from Modrinth forever. This cannot be undone.',
	},
	deleted: { id: 'app.creator.manage.deleted', defaultMessage: 'Project deleted' },

	uploadVersion: { id: 'app.creator.versions.upload', defaultMessage: 'Upload a version' },
	noVersions: { id: 'app.creator.versions.empty', defaultMessage: 'No versions yet' },
	noVersionsBody: {
		id: 'app.creator.versions.empty.body',
		defaultMessage: 'Upload the first file of your project so players can download it.',
	},
	deleteVersionTitle: {
		id: 'app.creator.versions.delete.title',
		defaultMessage: 'Delete this version?',
	},
	deleteVersionBody: {
		id: 'app.creator.versions.delete.body',
		defaultMessage: 'Its files will no longer be available to download.',
	},
	versionDeleted: { id: 'app.creator.versions.deleted', defaultMessage: 'Version deleted' },
	versionHeader: { id: 'app.creator.version.header', defaultMessage: 'Uploading a version' },
	filesLabel: { id: 'app.creator.version.files', defaultMessage: 'Files' },
	filesHint: {
		id: 'app.creator.version.files.hint',
		defaultMessage: 'The first file is the primary one. .jar, .zip and .mrpack are accepted.',
	},
	primaryFile: { id: 'app.creator.version.files.primary', defaultMessage: 'Primary' },
	chooseFiles: { id: 'app.creator.version.files.choose', defaultMessage: 'Choose files' },
	versionName: { id: 'app.creator.version.name', defaultMessage: 'Version name' },
	versionNumber: { id: 'app.creator.version.number', defaultMessage: 'Version number' },
	channelLabel: { id: 'app.creator.version.channel', defaultMessage: 'Release channel' },
	channelRelease: { id: 'app.creator.version.channel.release', defaultMessage: 'Release' },
	channelBeta: { id: 'app.creator.version.channel.beta', defaultMessage: 'Beta' },
	channelAlpha: { id: 'app.creator.version.channel.alpha', defaultMessage: 'Alpha' },
	loadersLabel: { id: 'app.creator.version.loaders', defaultMessage: 'Loaders' },
	gameVersionsLabel: { id: 'app.creator.version.game-versions', defaultMessage: 'Game versions' },
	showSnapshots: { id: 'app.creator.version.snapshots', defaultMessage: 'Show snapshots' },
	searchVersions: {
		id: 'app.creator.version.game-versions.search',
		defaultMessage: 'Search versions...',
	},
	changelogLabel: { id: 'app.creator.version.changelog', defaultMessage: 'Changelog' },
	changelogPlaceholder: {
		id: 'app.creator.version.changelog.placeholder',
		defaultMessage: 'What changed in this version?',
	},
	featuredLabel: { id: 'app.creator.version.featured', defaultMessage: 'Feature this version' },
	upload: { id: 'app.creator.version.submit', defaultMessage: 'Upload version' },
	uploading: { id: 'app.creator.version.submitting', defaultMessage: 'Uploading...' },
	uploaded: { id: 'app.creator.version.uploaded', defaultMessage: 'Version uploaded' },
	selectedCount: {
		id: 'app.creator.version.selected',
		defaultMessage: '{count, plural, =0 {Nothing selected} one {# selected} other {# selected}}',
	},

	orgsTitle: { id: 'app.creator.orgs.title', defaultMessage: 'Organizations' },
	createOrg: { id: 'app.creator.orgs.create', defaultMessage: 'Create organization' },
	noOrgs: { id: 'app.creator.orgs.empty', defaultMessage: "You aren't in any organizations yet" },
	noOrgsBody: {
		id: 'app.creator.orgs.empty.body',
		defaultMessage: 'Organizations let a team publish and manage projects together.',
	},
	orgHeader: { id: 'app.creator.orgs.header', defaultMessage: 'Creating an organization' },
	orgNamePlaceholder: {
		id: 'app.creator.orgs.name.placeholder',
		defaultMessage: 'Enter organization name...',
	},
	orgSummaryHint: {
		id: 'app.creator.orgs.summary.hint',
		defaultMessage: 'A sentence or two that describes your organization.',
	},
	orgCreated: { id: 'app.creator.orgs.created', defaultMessage: 'Organization created' },
	members: {
		id: 'app.creator.orgs.members',
		defaultMessage: '{count, plural, one {# member} other {# members}}',
	},

	analyticsTitle: { id: 'app.creator.analytics.title', defaultMessage: 'Analytics' },
	metricDownloads: { id: 'app.creator.analytics.downloads', defaultMessage: 'Downloads' },
	metricViews: { id: 'app.creator.analytics.views', defaultMessage: 'Views' },
	range1: { id: 'app.creator.analytics.range.1', defaultMessage: '24 hours' },
	range7: { id: 'app.creator.analytics.range.7', defaultMessage: '7 days' },
	range30: { id: 'app.creator.analytics.range.30', defaultMessage: '30 days' },
	range90: { id: 'app.creator.analytics.range.90', defaultMessage: '90 days' },
	totalInRange: { id: 'app.creator.analytics.total', defaultMessage: 'Total for the period' },
	topProjects: { id: 'app.creator.analytics.top', defaultMessage: 'By project' },
	noAnalytics: {
		id: 'app.creator.analytics.empty',
		defaultMessage: 'Analytics appear once you have a published project.',
	},

	revenueTitle: { id: 'app.creator.revenue.title', defaultMessage: 'Revenue' },
	available: { id: 'app.creator.revenue.available', defaultMessage: 'Available now' },
	pending: { id: 'app.creator.revenue.pending', defaultMessage: 'Pending' },
	pendingHint: {
		id: 'app.creator.revenue.pending.hint',
		defaultMessage: 'Revenue becomes available about 60 days after the end of the month.',
	},
	withdrawnLifetime: { id: 'app.creator.revenue.lifetime', defaultMessage: 'Withdrawn in total' },
	withdrawnYtd: { id: 'app.creator.revenue.ytd', defaultMessage: 'Withdrawn this year' },
	withdraw: { id: 'app.creator.revenue.withdraw', defaultMessage: 'Withdraw' },
	withdrawHint: {
		id: 'app.creator.revenue.withdraw.hint',
		defaultMessage: 'Withdrawals need identity checks, so they finish on modrinth.com.',
	},
	transactions: { id: 'app.creator.revenue.transactions', defaultMessage: 'Transactions' },
	noTransactions: {
		id: 'app.creator.revenue.transactions.empty',
		defaultMessage: 'No transactions yet',
	},
	txWithdrawal: { id: 'app.creator.revenue.tx.withdrawal', defaultMessage: 'Withdrawal' },
	txIncome: { id: 'app.creator.revenue.tx.income', defaultMessage: 'Creator revenue' },
	txFee: { id: 'app.creator.revenue.tx.fee', defaultMessage: 'Fee {amount}' },
	txStatusSuccess: { id: 'app.creator.revenue.tx.success', defaultMessage: 'Completed' },
	txStatusFailed: { id: 'app.creator.revenue.tx.failed', defaultMessage: 'Failed' },
	txStatusPending: { id: 'app.creator.revenue.tx.pending', defaultMessage: 'Processing' },
	upcoming: { id: 'app.creator.revenue.upcoming', defaultMessage: 'Becoming available' },

	reportsTitle: { id: 'app.creator.reports.title', defaultMessage: 'Active reports' },
	noReports: { id: 'app.creator.reports.empty', defaultMessage: 'You have no active reports' },
	noReportsBody: {
		id: 'app.creator.reports.empty.body',
		defaultMessage: 'Reports you send about projects, versions or users appear here.',
	},
	reportOpen: { id: 'app.creator.reports.open', defaultMessage: 'Open' },
	reportClosed: { id: 'app.creator.reports.closed', defaultMessage: 'Closed' },
	reportOn: { id: 'app.creator.reports.on', defaultMessage: 'Reported {type}' },
	itemProject: { id: 'app.creator.reports.item.project', defaultMessage: 'project' },
	itemVersion: { id: 'app.creator.reports.item.version', defaultMessage: 'version' },
	itemUser: { id: 'app.creator.reports.item.user', defaultMessage: 'user' },
	showClosed: { id: 'app.creator.reports.show-closed', defaultMessage: 'Show closed' },
})

const TYPE_KEYS: Record<CreatorProjectType, keyof typeof creatorMessages> = {
	mod: 'typeMod',
	modpack: 'typeModpack',
	resourcepack: 'typeResourcepack',
	shader: 'typeShader',
	datapack: 'typeDatapack',
	plugin: 'typePlugin',
}

const STATUS_KEYS: Partial<Record<CreatorProjectStatus, keyof typeof creatorMessages>> = {
	approved: 'statusApproved',
	unlisted: 'statusUnlisted',
	private: 'statusPrivate',
	draft: 'statusDraft',
	processing: 'statusProcessing',
	rejected: 'statusRejected',
	archived: 'statusArchived',
	withheld: 'statusWithheld',
	scheduled: 'statusScheduled',
}

export function useCreatorLabels() {
	const { formatMessage } = useVIntl()
	return {
		typeLabel: (type: string) =>
			formatMessage(creatorMessages[TYPE_KEYS[type as CreatorProjectType] ?? 'typeMod']),
		statusLabel: (status: string) =>
			formatMessage(
				creatorMessages[STATUS_KEYS[status as CreatorProjectStatus] ?? 'statusUnknown'],
			),
	}
}

export function statusTone(status: string) {
	if (status === 'approved') return 'green'
	if (status === 'processing' || status === 'scheduled') return 'orange'
	if (status === 'rejected' || status === 'withheld') return 'red'
	return 'gray'
}
