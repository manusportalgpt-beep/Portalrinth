<script setup lang="ts">
import { ChevronRightIcon, UserIcon, UserPlusIcon } from '@modrinth/assets'
import { defineMessages, IconButton, useScrollIndicator, useVIntl } from '@modrinth/ui'
import { OverlayScrollbars } from 'overlayscrollbars'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'

import { useTheme } from '@/composables/use-theme'
import PrideFundraiserBanner from '@/features/campaigns/pride-fundraiser-banner.vue'
import FriendsList from '@/features/friends/friends-list/index.vue'
import AccountsCard from '@/features/minecraft-accounts/accounts-card.vue'
import type { MinecraftAccountsActions } from '@/features/minecraft-accounts/context'
import NewsSidebar from '@/features/news/news-sidebar.vue'
import OnboardingChecklist from '@/features/onboarding/checklist.vue'
import type { ModrinthCredentials } from '@/helpers/mr_auth'
import { SIDEBAR_MOTION_MS } from '@/helpers/portalrinth-sidebar-motion'
import { injectOnboardingChecklist } from '@/providers/onboarding-checklist'

import Promotion from './promotion.vue'

const props = defineProps<{
	credentials: ModrinthCredentials | null | undefined
	hasPlus: boolean
	showAd: boolean
	visible: boolean
	requestSignIn: () => void
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
}>()

const { formatMessage } = useVIntl()
const appTheme = useTheme()
const { hasLoggedIntoMinecraft, hasLoggedIntoModrinth, showChecklist } = injectOnboardingChecklist()
const showFriendsList = computed(() => !showChecklist.value || hasLoggedIntoModrinth.value)
const accounts = ref<InstanceType<typeof AccountsCard> | null>(null)

/**
 * Whether the panel is folded to its rail.
 *
 * Kept here rather than in the window state because it is about this panel only,
 * and it survives navigation: the point of folding it is to make room for what
 * was opened, so reopening it every time the route changes defeats it.
 */
const collapsed = ref(false)

/**
 * Hovering over the rail opens it, and leaving closes it again.
 *
 * Only while it is folded, and only once the pointer has been still for a
 * moment - a rail that snapped open under the cursor as it travelled past would
 * be in the way of everything it was folded to make room for. A person who has
 * moved the pointer off it deliberately keeps it folded.
 */
const hovering = ref(false)
let hoverTimer: number | undefined

function toggleCollapsed() {
	cancelHover()
	collapsed.value = !collapsed.value
}

function cancelHover() {
	if (hoverTimer !== undefined) {
		window.clearTimeout(hoverTimer)
		hoverTimer = undefined
	}
	hovering.value = false
}

function onRailEnter() {
	if (!collapsed.value) return
	cancelHover()
	// Long enough that passing over the rail on the way somewhere does not
	// open it, short enough that it feels like it responded.
	hoverTimer = window.setTimeout(() => {
		hovering.value = true
		hoverTimer = undefined
	}, 350)
}

function onRailLeave() {
	cancelHover()
}

/**
 * Open means the list is shown, whether by pressing the button or by hovering
 * the rail. Everything else reads this rather than `collapsed` so the two ways
 * of opening behave identically.
 */
const open = computed(() => !collapsed.value || hovering.value)
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
		The rail and the panel are the same element at two widths, so folding is
		one animation of one thing rather than a panel being taken off screen and
		a different one put in its place. The pointer events are suspended while
		folded: the list is not there, and a control that cannot be seen should
		not be reachable either.
	-->
	<div
		class="app-sidebar mt-px relative flex h-[calc(100vh-var(--top-bar-height))] shrink-0 flex-col overflow-visible border-0 border-l-[1px] border-solid border-[--brand-gradient-border] before:pointer-events-none before:absolute before:inset-y-0 before:-left-8 before:w-8 before:content-[''] transition-[width] duration-300 ease-out motion-reduce:transition-none"
		:class="[
			open ? 'w-[300px]' : 'w-[4rem]',
			{ 'pointer-events-none': !open },
			{
				'before:shadow-[-15px_0_15px_-15px_rgba(0,0,0,0.1)_inset]': appTheme.advancedRendering,
			},
		]"
		@mouseenter="onRailEnter"
		@mouseleave="onRailLeave"
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
					<NewsSidebar
						:style="showAd ? { paddingBottom: `calc(1rem + ${upgradeHeight}px)` } : undefined"
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
			Folded, the panel is a column of what it holds rather than nothing: the
			account, the friend list and the search all still have one thing to say
			and that thing is an icon. Each names itself on hover, because a column
			of unlabelled symbols is a puzzle rather than a summary.
		-->
		<div v-if="!open" class="flex grow flex-col items-center gap-2 overflow-y-auto py-3">
			<IconButton
				v-if="hasLoggedIntoMinecraft"
				v-tooltip="formatMessage(messages.playingAs)"
				:label="formatMessage(messages.playingAs)"
				@click="emit('add-minecraft-account')"
			>
				<UserIcon />
			</IconButton>
			<IconButton
				v-tooltip="formatMessage(messages.friends)"
				:label="formatMessage(messages.friends)"
				@click="showAddFriendModal()"
			>
				<UserPlusIcon />
			</IconButton>
		</div>

		<!--
			The way out of the panel is its own bottom corner, where the eye
			already is after reading down a list, rather than a chevron at the top
			that has to be found before anything can be done.
		-->
		<div
			class="flex shrink-0 justify-end border-0 border-t-[1px] border-solid p-2 border-[--brand-gradient-border]"
		>
			<IconButton
				v-tooltip="formatMessage(collapsed ? messages.collapse : messages.expand)"
				:label="collapsed ? formatMessage(messages.expand) : formatMessage(messages.collapse)"
				@click="toggleCollapsed"
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
	background: linear-gradient(0deg, rgba(77, 146, 39, 0.06) 0%, rgba(77, 146, 39, 0.02) 100%);
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
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
