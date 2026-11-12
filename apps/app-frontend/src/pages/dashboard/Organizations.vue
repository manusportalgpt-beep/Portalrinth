<script setup lang="ts">
import { OrganizationIcon, PlusIcon, SpinnerIcon, UsersIcon, XIcon } from '@modrinth/assets'
import {
	Avatar,
	Button,
	injectNotificationManager,
	Input,
	NewModal,
	Textarea,
	useVIntl,
} from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref, watch } from 'vue'

import {
	createOrganization,
	type CreatorOrganization,
	getMyOrganizations,
	MODRINTH_SITE,
	slugify,
} from '@/helpers/modrinth-creator'
import { get as getCreds } from '@/helpers/mr_auth.ts'

import { creatorMessages as messages } from './creator-messages'

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const signedIn = ref(true)
const organizations = ref<CreatorOrganization[]>([])

try {
	if (!(await getCreds())) signedIn.value = false
	else organizations.value = await getMyOrganizations()
} catch (error) {
	handleError(error as Error)
}

const modal = ref<InstanceType<typeof NewModal>>()
const name = ref('')
const slug = ref('')
const slugTouched = ref(false)
const summary = ref('')
const submitting = ref(false)

watch(name, (value) => {
	if (!slugTouched.value) slug.value = slugify(value)
})

const valid = computed(
	() =>
		name.value.trim().length >= 3 &&
		/^[\w!@$().+,"'-]{3,64}$/.test(slug.value) &&
		summary.value.trim().length >= 3,
)

function showCreate(event?: MouseEvent) {
	name.value = ''
	slug.value = ''
	slugTouched.value = false
	summary.value = ''
	submitting.value = false
	modal.value?.show(event)
}

async function submit() {
	if (!valid.value) return
	submitting.value = true
	try {
		const organization = await createOrganization({
			name: name.value.trim(),
			slug: slug.value,
			description: summary.value.trim(),
		})
		organizations.value = [
			...organizations.value,
			{ ...organization, members: organization.members ?? [] },
		]
		addNotification({
			title: formatMessage(messages.orgCreated),
			text: organization.name,
			type: 'success',
		})
		modal.value?.hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		submitting.value = false
	}
}

function open(organization: CreatorOrganization) {
	openUrl(`${MODRINTH_SITE}/organization/${organization.slug || organization.id}`)
}
</script>

<template>
	<div class="creator-sheet">
		<NewModal ref="modal" :header="formatMessage(messages.orgHeader)">
			<div class="flex w-[28rem] max-w-full flex-col gap-4">
				<div class="flex flex-col gap-2">
					<label for="org-name" class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.nameLabel) }}
						<span class="text-brand-red">*</span>
					</label>
					<Input
						id="org-name"
						v-model="name"
						:maxlength="64"
						:placeholder="formatMessage(messages.orgNamePlaceholder)"
						autocomplete="off"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label for="org-slug" class="flex flex-col gap-1">
						<span class="text-lg font-semibold text-contrast">
							{{ formatMessage(messages.urlLabel) }}
							<span class="text-brand-red">*</span>
						</span>
						<span>{{ formatMessage(messages.urlHint) }}</span>
					</label>
					<div class="slug-field">
						<span class="slug-prefix">modrinth.com/organization/</span>
						<input
							id="org-slug"
							v-model="slug"
							class="slug-input"
							maxlength="64"
							autocomplete="off"
							spellcheck="false"
							@input="slugTouched = true"
						/>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<label for="org-summary" class="flex flex-col gap-1">
						<span class="text-lg font-semibold text-contrast">
							{{ formatMessage(messages.summaryLabel) }}
							<span class="text-brand-red">*</span>
						</span>
						<span>{{ formatMessage(messages.orgSummaryHint) }}</span>
					</label>
					<Textarea id="org-summary" v-model="summary" :maxlength="256" />
				</div>
				<div class="flex justify-end gap-2">
					<Button type="outlined" @click="modal?.hide()">
						<XIcon aria-hidden="true" />
						{{ formatMessage(messages.cancel) }}
					</Button>
					<Button :disabled="submitting || !valid" type="colored" color="brand" @click="submit">
						<SpinnerIcon v-if="submitting" class="animate-spin" aria-hidden="true" />
						<PlusIcon v-else aria-hidden="true" />
						{{ formatMessage(submitting ? messages.creating : messages.createOrg) }}
					</Button>
				</div>
			</div>
		</NewModal>

		<div v-if="!signedIn" class="empty-state">
			<OrganizationIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.signIn) }}</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.signInBody) }}</p>
		</div>

		<template v-else>
			<div class="creator-head">
				<h2>{{ formatMessage(messages.orgsTitle) }}</h2>
				<Button type="colored" color="brand" @click="showCreate($event)">
					<PlusIcon aria-hidden="true" />
					{{ formatMessage(messages.createOrg) }}
				</Button>
			</div>

			<div v-if="organizations.length === 0" class="empty-state">
				<OrganizationIcon aria-hidden="true" />
				<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.noOrgs) }}</p>
				<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.noOrgsBody) }}</p>
			</div>

			<div v-else class="org-grid">
				<button
					v-for="organization in organizations"
					:key="organization.id"
					class="org-card"
					@click="open(organization)"
				>
					<Avatar :src="organization.icon_url" size="4rem" :tint-by="organization.id" />
					<span class="flex min-w-0 flex-col gap-1">
						<span class="truncate text-lg font-bold text-contrast">{{ organization.name }}</span>
						<span v-if="organization.description" class="org-desc">{{
							organization.description
						}}</span>
						<span class="inline-flex items-center gap-1 text-sm text-secondary">
							<UsersIcon aria-hidden="true" class="h-4 w-4" />
							{{ formatMessage(messages.members, { count: organization.members?.length ?? 0 }) }}
						</span>
					</span>
				</button>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.org-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
	gap: var(--gap-md);
}

.org-card {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: var(--gap-md);
	padding: var(--gap-lg);
	border: 1px solid color-mix(in srgb, var(--surface-5) 80%, transparent);
	border-radius: var(--radius-xl);
	background-color: color-mix(in srgb, var(--surface-4) 55%, transparent);
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	outline: 2px solid transparent;
	outline-offset: -2px;
	transition:
		background-color 0.15s ease,
		outline-color 0.15s ease;

	&:hover,
	&:focus-visible {
		background-color: var(--color-button-bg);
		outline-color: var(--color-brand);
	}
}

.org-desc {
	font-size: var(--font-size-sm);
	color: var(--color-secondary);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.slug-field {
	display: flex;
	align-items: center;
	min-height: 2.5rem;
	border-radius: var(--radius-md);
	background-color: var(--color-button-bg);
	overflow: hidden;
	outline: 2px solid transparent;
	transition: outline-color 0.15s ease;

	&:focus-within {
		outline-color: var(--color-brand);
	}
}

.slug-prefix {
	padding-left: 0.75rem;
	color: var(--color-secondary);
	white-space: nowrap;
	user-select: none;
}

.slug-input {
	flex: 1;
	min-width: 0;
	height: 2.5rem;
	padding: 0 0.75rem 0 0;
	border: none;
	background: transparent;
	color: var(--color-contrast);
	font: inherit;
	outline: none;
	box-shadow: none;
}
</style>
