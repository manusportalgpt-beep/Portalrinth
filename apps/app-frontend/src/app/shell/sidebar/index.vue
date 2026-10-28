<script setup lang="ts">
import { ChevronRightIcon, SearchIcon, UserIcon, UserPlusIcon } from '@modrinth/assets'
import { defineMessages, IconButton, UserAvatar, useScrollIndicator, useVIntl } from '@modrinth/ui'
import { OverlayScrollbars } from 'overlayscrollbars'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import PrideFundraiserBanner from '@/features/campaigns/pride-fundraiser-banner.vue'
import FriendsList from '@/features/friends/friends-list/index.vue'
import AccountsCard from '@/features/minecraft-accounts/accounts-card.vue'
import type { MinecraftAccountsActions } from '@/features/minecraft-accounts/context'
import OnboardingChecklist from '@/features/onboarding/checklist.vue'
import type { ModrinthCredentials } from '@/helpers/mr_auth'
import { SIDEBAR_MOTION_MS } from '@/helpers/portalrinth-sidebar-motion'
import { injectOnboardingChecklist } from '@/providers/onboarding-checklist'

import Promotion from './promotion.vue'
import RailMirror from './rail-mirror.vue'

const props = defineProps<{
	credentials: ModrinthCredentials | null | undefined
	hasPlus: boolean
	showAd: boolean
	visible: boolean
	requestSignIn: () => void
	/** Whether the panel is folded to its rail. Decided by the window. */
	collapsed: boolean
}>()

/**
 * Portalrinth: the default content stays up until the column has finished
 * closing (App.vue's `.app-contents` transition), so what slides away is the
 * sidebar and not an empty panel.
 */
const contentVisible = ref(props.visible)
let hideContentTimer: ReturnType<typeof setTimeout> | undefined
watch(
	() => props.visible,
	(visible) => {
		clearTimeout(hideContentTimer)
		if (visible) contentVisible.value = true
		else hideContentTimer = setTimeout(() => (contentVisible.value = false), SIDEBAR_MOTION_MS)
	},
)
onScopeDispose(() => clearTimeout(hideContentTimer))

const emit = defineEmits<{
	'create-instance': []
	'login-modrinth': []
	/** Portalrinth: adding a Minecraft account asks which kind first. */
	'add-minecraft-account': []
	/** Asked for when the rail wants to be unfolded. */
	'toggle-collapse': []
}>()

const { formatMessage } = useVIntl()
const { hasLoggedIntoMinecraft, hasLoggedIntoModrinth, showChecklist } = injectOnboardingChecklist()
const showFriendsList = computed(() => !showChecklist.value || hasLoggedIntoModrinth.value)
const accounts = ref<InstanceType<typeof AccountsCard> | null>(null)

/** The face the rail shows for whoever is playing, taken from the account card. */
const headUrl = computed(() => accounts.value?.avatarUrl ?? null)

/**
 * Whether the panel is folded to its rail.
 *
 * Owned by the window rather than here, because the width of the column the
 * panel sits in is decided there too: the rail is narrow and the panel is wide,
 * and the space between those two widths belongs to the page. One owner for
 * both halves of that decision, so the rail and the column cannot disagree
 * about how wide they are.
 */
const collapsed = computed(() => props.collapsed)

/**
 * The rail, and the buttons on it, are how a folded panel is used at all. It
 * carries the account at the top and the friend list's two actions under it, so
 * the things a person reaches for most are reachable without unfolding.
 */
function unfold() {
	emit('toggle-collapse')
}

const router = useRouter()

/**
 * The friends the rail shows, split into the two groups the line divides.
 *
 * They are read out of the friend list rather than fetched again, so the rail
 * and the panel below it are always the same list: one is the other's summary.
 */
const railOnline = computed(() => friends.value?.railOnline ?? [])
const railOffline = computed(() => friends.value?.railOffline ?? [])
const railFriends = computed(() => [...railOnline.value, ...railOffline.value])

function openProfile(username: string) {
	void router.push(`/user/${encodeURIComponent(username)}`)
}

function showFindFriendsModal() {
	friends.value?.showFindFriendsModal()
}

/**
 * The list is shown exactly when the panel is unfolded. The rail replaces it,
 * not overlaps it.
 */
const open = computed(() => !collapsed.value)
/** The folded rail is showing a page's side panel (filters and so on). */
const pageHasPanel = ref(false)
const friends = ref<InstanceType<typeof FriendsList> | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const scrollViewport = ref<HTMLElement | null>(null)
const upgradeHeight = ref(0)
const { showTopFade, showBottomFade, checkScrollState } = useScrollIndicator(scrollViewport)

let removeScrollbarListener: (() => void) | undefined

onMounted(() => {
	if (!scrollContainer.value) return
	const scrollbars = OverlayScrollbars(scrollContainer.value)
	if (!scrollbars) return
	scrollViewport.value = scrollbars.elements().viewport
	removeScrollbarListener = scrollbars.on('updated', checkScrollState)
})

onScopeDispose(() => removeScrollbarListener?.())

const minecraftAccounts = computed<MinecraftAccountsActions | null>(() => {
	const card = accounts.value
	if (!card) return null
	return {
		loginDisabled: card.loginDisabled,
		refreshValues: card.refreshValues,
		setEquippedSkin: card.setEquippedSkin,
		setLoginDisabled: card.setLoginDisabled,
		login: card.login,
		selectedAccount: card.selectedAccount,
		showElyLogin: card.showElyLogin,
		showOfflineLogin: card.showOfflineLogin,
	}
})

function showAddFriendModal() {
	friends.value?.showAddFriendModal()
}

defineExpose({ minecraftAccounts, showAddFriendModal })

const scrollbarOptions = Object.freeze({
	overflow: {
		x: 'hidden',
		y: 'scroll',
	},
})

const messages = defineMessages({
	playingAs: {
		id: 'app.sidebar.playing-as',
		defaultMessage: 'Playing as',
	},
	friends: {
		id: 'app.sidebar.friends',
		defaultMessage: 'Friends',
	},
	findFriends: {
		id: 'app.sidebar.find-friends',
		defaultMessage: 'Find friends',
	},
	addFriend: {
		id: 'app.sidebar.add-friend',
		defaultMessage: 'Add a friend',
	},
	expand: {
		id: 'app.sidebar.expand',
		defaultMessage: 'Expand the sidebar',
	},
	collapse: {
		id: 'app.sidebar.collapse',
		defaultMessage: 'Collapse the sidebar',
	},
})
</script>

<template>
	<!--
			The rail and the panel are one element, and its width is not its own:
			it fills the column the window gives it. That is what makes the fold
			work - the column narrows from 300px to the rail's width and the page
			takes the difference, so the page is wider when the panel is folded,
			not merely shifted left.
		-->
	<div
		class="app-sidebar relative flex h-[calc(100vh-var(--top-bar-height))] w-full shrink-0 flex-col overflow-visible"
	>
		<div v-show="open" class="relative flex min-h-0 grow shrink flex-col">
			<div
				ref="scrollContainer"
				v-overlay-scrollbars="scrollbarOptions"
				class="app-sidebar-scrollable relative min-h-0 grow shrink"
				data-overlayscrollbars-initialize
			>
				<OnboardingChecklist
					@create-instance="emit('create-instance')"
					@login-minecraft="emit('add-minecraft-account')"
					@login-modrinth="emit('login-modrinth')"
				/>
				<div id="sidebar-teleport-target" class="sidebar-teleport-content contents"></div>
				<div class="sidebar-default-content hidden" :class="{ 'sidebar-enabled': contentVisible }">
					<div
						v-show="hasLoggedIntoMinecraft"
						class="p-4 border-0 border-b-[1px] border-[--brand-gradient-border] border-solid"
					>
						<h3 class="text-base text-primary font-medium m-0">
							{{ formatMessage(messages.playingAs) }}
						</h3>
						<Suspense>
							<AccountsCard ref="accounts" @add-account="emit('add-minecraft-account')" />
						</Suspense>
					</div>
					<div
						v-show="showFriendsList"
						class="p-4 border-0 border-b-[1px] border-[--brand-gradient-border] border-solid"
					>
						<Suspense>
							<FriendsList
								ref="friends"
								:credentials="credentials ?? null"
								:sign-in="requestSignIn"
							/>
						</Suspense>
					</div>
					<PrideFundraiserBanner
						class="p-4 border-0 border-b-[1px] border-[--brand-gradient-border] border-solid"
					/>
				</div>
			</div>
			<div
				class="sidebar-scroll-fade pointer-events-none absolute inset-x-0 top-0 z-10 h-8 rotate-180 transition-opacity duration-200 motion-reduce:transition-none"
				:class="showTopFade ? 'opacity-100' : 'opacity-0'"
				aria-hidden="true"
			/>
			<div
				class="sidebar-scroll-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 transition-opacity duration-200 motion-reduce:transition-none"
				:class="showAd || showBottomFade ? 'opacity-100' : 'opacity-0'"
				aria-hidden="true"
			/>
		</div>
		<Promotion v-if="showAd && open" @upgrade-height="upgradeHeight = $event" />

		<!--
			Folded, the panel is the four things it holds that are wanted without
			opening it: the account, and the friend list's two actions. They run
			down the rail in the order they are used - who I am, then who I am
			looking for, then who I am adding - each naming itself on hover, because
			a column of unlabelled symbols is a puzzle rather than a summary.
		-->
		<div v-if="!open" class="flex min-h-0 grow flex-col items-center gap-1 py-2">
			<!--
				The account is the head itself, square as a Minecraft head is, and
				it is the way back: pressing it unfolds the panel. It is the first
				thing on the rail because it is the first thing the panel shows
				when it opens.
			-->
			<template v-if="!pageHasPanel">
			<IconButton
				v-tooltip="formatMessage(messages.playingAs)"
				:label="formatMessage(messages.playingAs)"
				@click="unfold"
			>
				<img
					v-if="headUrl"
					:src="headUrl"
					alt=""
					class="size-6 rounded-[3px] object-cover"
					draggable="false"
				/>
				<UserIcon v-else />
			</IconButton>
			<IconButton
				v-tooltip="formatMessage(messages.findFriends)"
				:label="formatMessage(messages.findFriends)"
				@click="showFindFriendsModal()"
			>
				<SearchIcon />
			</IconButton>
			<IconButton
				v-tooltip="formatMessage(messages.addFriend)"
				:label="formatMessage(messages.addFriend)"
				@click="showAddFriendModal()"
			>
				<UserPlusIcon />
			</IconButton>
			</template>

			<!--
				Portalrinth: the page's own side panel - filters, links, members -
				drawn as icons, so the fold does not take them away. While a page
				has one, its buttons take the place of the account and the friends.
			-->
			<RailMirror
				:active="!open"
				class="shrink grow-0 basis-auto"
				@present="(value) => (pageHasPanel = value)"
				@unfold="unfold"
			/>

			<!--
				The friends, and the line that divides them. The line above the ones
				who are there is green because they are there, and the line above
				the ones who are not is red for the same reason in the other
				direction. With nobody in, the one line is grey: it divides
				nothing, and says so.
			-->
			<div
				v-if="!pageHasPanel && railFriends.length > 0"
				class="mt-2 flex w-full flex-col items-center gap-1.5"
			>
				<div
					class="h-0.5 w-6 rounded-full"
					:class="railOnline.length > 0 ? 'bg-green-500' : 'bg-surface-5'"
				/>
				<template v-if="railOnline.length > 0">
					<button
						v-for="friend in railOnline"
						:key="friend.id"
						v-tooltip="friend.username"
						type="button"
						class="border-0 bg-transparent p-0 cursor-pointer"
						:aria-label="friend.username"
						@click="openProfile(friend.username)"
					>
						<UserAvatar :src="friend.avatar" size="24px" :badge="friend.online" />
					</button>
					<div class="h-0.5 w-6 rounded-full bg-red-500" />
				</template>
				<button
					v-for="friend in railOffline"
					:key="friend.id"
					v-tooltip="friend.username"
					type="button"
					class="border-0 bg-transparent p-0 cursor-pointer"
					:aria-label="friend.username"
					@click="openProfile(friend.username)"
				>
					<UserAvatar :src="friend.avatar" size="24px" :grayscale="friend.accepted" />
				</button>
			</div>
		</div>

		<!--
			The way out of the panel is its own bottom corner, where the eye
			already is after reading down a list, rather than a chevron at the top
			that has to be found before anything can be done. It sits on the one
			side the panel is on - the window's own edge - so it is in the same
			place whether the panel is open or folded to its rail.
		-->
		<div
			class="flex shrink-0 justify-end border-0 border-t-[1px] border-solid p-2 border-[--brand-gradient-border]"
		>
			<IconButton
				v-tooltip="formatMessage(collapsed ? messages.expand : messages.collapse)"
				:label="formatMessage(collapsed ? messages.expand : messages.collapse)"
				@click="emit('toggle-collapse')"
			>
				<ChevronRightIcon :class="collapsed ? 'rotate-180' : ''" />
			</IconButton>
		</div>
	</div>
</template>

<style scoped>
.app-sidebar {
	/* Glass: nothing painted behind the list, so what shows through is the
	   window's own background blurred once rather than a second, darker copy of
	   it. The faint tint is kept so the panel still reads as a panel. */
	/* The accent's own wash. It was the green of the theme this came from,
	   which is why the panel was green while everything else was red. */
	/* Now part of the window's frame, like the bar on the left: the page meets
	   it with an arc drawn by the page, so the panel itself is left plain. */
	background: transparent;
	--color-button-bg: var(--brand-gradient-button);
	--surface-4: var(--brand-gradient-button);
	--color-button-bg-hover: var(--brand-gradient-border);
	--surface-5: var(--brand-gradient-border);
	--color-divider: var(--brand-gradient-border);
	--color-divider-dark: var(--brand-gradient-border);
}

.sidebar-teleport-content:empty + .sidebar-default-content.sidebar-enabled {
	display: contents;
}

.sidebar-scroll-fade {
	/* A fade to nothing, not to a colour. Fading to a colour paints that colour
	   over the panel, which is how a transparent sidebar ends up with a black
	   slab down one side of it. */
	background: linear-gradient(to bottom, transparent, var(--brand-gradient-fade-out-color));
}
</style>
