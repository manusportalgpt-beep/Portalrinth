<script setup lang="ts">
import { ArrowUpIcon, EyeIcon, EyeOffIcon, MoonIcon, SparklesIcon } from '@modrinth/assets'
import { Button, Input, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
	aiComplete,
	aiHistory,
	aiSettings,
	mascotRefs,
	pushAiMessage,
	saveAiSettings,
} from '@/helpers/ai-assistant'
import { labySkinTextureUrl } from '@/helpers/laby-skins'

const { formatMessage } = useVIntl()

const messages = {
	placeholder: {
		id: 'app.ai.mascot.placeholder',
		defaultMessage: 'Скажите маскоту…',
	},
	send: { id: 'app.ai.send', defaultMessage: 'Отправить' },
	hideReplies: { id: 'app.ai.mascot.hide', defaultMessage: 'Скрыть ответы' },
	showReplies: { id: 'app.ai.mascot.show', defaultMessage: 'Показать ответы' },
	yes: { id: 'app.ai.mascot.yes', defaultMessage: 'Да' },
	no: { id: 'app.ai.mascot.no', defaultMessage: 'Нет' },
	repliesTitle: { id: 'app.ai.mascot.replies', defaultMessage: 'Последние ответы' },
}

// ---- Position ------------------------------------------------------------

const POS_KEY = 'portalrinth-mascot-pos'

function readPos(): { x: number; y: number } | null {
	try {
		const raw = localStorage.getItem(POS_KEY)
		return raw ? JSON.parse(raw) : null
	} catch {
		return null
	}
}

const pos = reactive<{ x: number; y: number }>(readPos() ?? { x: -1, y: -1 })

function clampPos() {
	const width = window.innerWidth
	const height = window.innerHeight
	if (pos.x < 0 || pos.x > width - 60) pos.x = width - 140
	if (pos.y < 0 || pos.y > height - 80) pos.y = height - 220
	pos.x = Math.max(8, Math.min(pos.x, width - 80))
	pos.y = Math.max(60, Math.min(pos.y, height - 120))
}

function savePos() {
	try {
		localStorage.setItem(POS_KEY, JSON.stringify(pos))
	} catch {
		/* position is cosmetic, a full quota must not break anything */
	}
}

// ---- Skin ----------------------------------------------------------------

const SKIN_PX = 64

/** A stand-in skin drawn on the spot, so the mascot always has a body even
 * with no network at all. Classic Steve and Alex, block for block. */
function proceduralSkin(kind: 'steve' | 'alex'): string {
	const canvas = document.createElement('canvas')
	canvas.width = SKIN_PX
	canvas.height = SKIN_PX
	const ctx = canvas.getContext('2d')
	if (!ctx) return ''
	const fill = (x: number, y: number, w: number, h: number, colour: string) => {
		ctx.fillStyle = colour
		ctx.fillRect(x, y, w, h)
	}
	const skin = '#b5876b'
	if (kind === 'steve') {
		fill(8, 0, 8, 8, '#4a3120') // hair cap behind
		fill(8, 8, 8, 8, '#4a3120') // hair top of face plate
		fill(8, 11, 8, 5, skin) // forehead to chin
		fill(10, 13, 1, 1, '#ffffff')
		fill(11, 13, 1, 1, '#3a2ea6')
		fill(13, 13, 1, 1, '#ffffff')
		fill(14, 13, 1, 1, '#3a2ea6')
		fill(11, 15, 2, 1, '#8a5a44') // nose
		fill(11, 16, 2, 1, '#6f4a37') // mouth
		fill(20, 20, 8, 12, '#00a3a3') // shirt
		fill(40, 20, 4, 12, skin) // arm
		fill(40, 36, 4, 12, skin)
		fill(4, 20, 4, 12, '#3d3dbf') // jeans
		fill(4, 28, 4, 4, '#5a5a5a') // shoes
		fill(4, 36, 4, 12, '#3d3dbf')
		fill(4, 44, 4, 4, '#5a5a5a')
	} else {
		fill(8, 0, 8, 8, '#d97b28')
		fill(8, 8, 8, 3, '#d97b28')
		fill(8, 11, 8, 5, skin)
		fill(9, 8, 2, 8, '#d97b28') // side hair
		fill(10, 13, 1, 1, '#ffffff')
		fill(11, 13, 1, 1, '#4a7a3a')
		fill(13, 13, 1, 1, '#ffffff')
		fill(14, 13, 1, 1, '#4a7a3a')
		fill(11, 16, 2, 1, '#8a5a44')
		fill(20, 20, 8, 12, '#7bb04a') // shirt
		fill(40, 20, 3, 12, skin) // slim arm
		fill(40, 36, 3, 12, skin)
		fill(4, 20, 4, 12, '#6a4a34')
		fill(4, 28, 4, 4, '#7d7d7d')
		fill(4, 36, 4, 12, '#6a4a34')
		fill(4, 44, 4, 4, '#7d7d7d')
	}
	return canvas.toDataURL('image/png')
}

const skinImage = ref<HTMLImageElement | null>(null)
const skinReady = ref(false)
let skinToken = 0

const skinVariant = computed(() => (aiSettings.value.mascotSkin === 'alex' ? 'SLIM' : 'CLASSIC'))

async function loadSkin() {
	const token = ++skinToken
	const choice = aiSettings.value.mascotSkin || 'steve'
	let src = ''
	if (choice === 'steve' || choice === 'alex') {
		src = proceduralSkin(choice)
	} else if (choice === 'account') {
		try {
			const { get_available_skins } = await import('@/helpers/skins')
			const skins = await get_available_skins()
			const equipped = skins.find((s) => s.is_equipped) ?? skins[0]
			src = equipped?.texture ?? ''
		} catch {
			src = ''
		}
		if (!src) src = proceduralSkin('steve')
	} else if (/^[0-9a-f]{32,64}$/i.test(choice)) {
		src = labySkinTextureUrl(choice)
	} else {
		src = proceduralSkin('steve')
	}
	const image = new Image()
	image.crossOrigin = 'anonymous'
	image.decoding = 'async'
	const done = () => {
		if (token !== skinToken) return
		if (!image.naturalWidth) {
			// A texture that would not decode falls back to the drawn one.
			const fallback = new Image()
			fallback.onload = () => {
				if (token !== skinToken) return
				skinImage.value = fallback
				skinReady.value = true
			}
			fallback.src = proceduralSkin('steve')
			return
		}
		skinImage.value = image
		skinReady.value = true
	}
	image.onload = done
	image.onerror = done
	image.src = src
}

watch(
	() => aiSettings.value.mascotSkin,
	() => void loadSkin(),
)

// ---- Animation -----------------------------------------------------------

type Mood = 'idle' | 'walk' | 'sit' | 'sleep' | 'dance' | 'pet' | 'think' | 'talk'

const canvas = ref<HTMLCanvasElement | null>(null)
const S = 6
const CANVAS_W = 16 * S
const CANVAS_H = 32 * S

const state = {
	mood: 'idle' as Mood,
	moodUntil: 0,
	walkFrom: 0,
	walkTo: 0,
	walkStart: 0,
	walkDuration: 4000,
	lastInteraction: Date.now(),
	nextDecision: Date.now() + 6000,
	petCount: 0,
}

const zzzVisible = ref(false)
const heartsVisible = ref(false)
const notesVisible = ref(false)

function setMood(mood: Mood, ms: number) {
	state.mood = mood
	state.moodUntil = ms > 0 ? Date.now() + ms : 0
}

function poke() {
	state.lastInteraction = Date.now()
	if (state.mood === 'sleep') {
		zzzVisible.value = false
		setMood('idle', 0)
	}
}

function pet() {
	if (Date.now() - state.petCount < 900) return
	state.petCount = Date.now()
	poke()
	const settings = aiSettings.value
	settings.affection = Math.min(100, settings.affection + 2)
	saveAiSettings()
	heartsVisible.value = true
	setTimeout(() => (heartsVisible.value = false), 1800)
	setMood('pet', 1400)
	const tier =
		settings.affection > 70
			? ['Мм, спасибо! Ты лучший.', 'Ещё! …Только никому не скажи.', 'Я такому рад!']
			: settings.affection > 40
				? ['Приятно!', 'Эй, щекотно!', 'Люблю такие моменты.']
				: ['…ладно, приятно.', 'Ну-ну, подлизываешься?', 'Хм. Продолжай.']
	say(tier[Math.floor(Math.random() * tier.length)], 4)
}

/** Watches the module's shared bubble: anything the launcher wants the mascot
 * to say (celebrations, hints) arrives through here. */
watch(mascotRefs.bubble, (text) => {
	if (text) bubbleText.value = text
})

watch(mascotRefs.mood, (mood) => {
	if (mood === 'dance') {
		notesVisible.value = true
		setTimeout(() => (notesVisible.value = false), 4000)
	}
	setMood(mood, mood === 'dance' ? 4000 : mood === 'think' || mood === 'talk' ? 0 : 1600)
})

// ---- Speech --------------------------------------------------------------

const bubbleText = ref('')
const bubbleVisible = ref(false)
const inputOpen = ref(false)
const repliesOpen = ref(false)
const thinking = ref(false)
const draft = ref('')
const offer = ref<{ text: string; prompt: string } | null>(null)
const showBubble = ref(true)

let bubbleTimer: ReturnType<typeof setTimeout> | undefined

function say(text: string, seconds = 6) {
	if (!text) return
	bubbleText.value = text
	bubbleVisible.value = true
	clearTimeout(bubbleTimer)
	bubbleTimer = setTimeout(() => {
		bubbleVisible.value = false
	}, seconds * 1000)
}

watch(mascotRefs.bubbleVisible, (visible) => {
	if (!visible && !offer.value && !thinking.value) bubbleVisible.value = false
})

const recentReplies = computed(() =>
	aiHistory.value
		.filter((m) => m.role === 'assistant')
		.slice(-5)
		.reverse(),
)

async function ask(prompt: string) {
	if (thinking.value) return
	inputOpen.value = true
	poke()
	setMood('think', 0)
	thinking.value = true
	pushAiMessage({ role: 'user', content: prompt, ts: Date.now() })
	const payload = aiHistory.value
		.filter((m) => m.role !== 'note')
		.slice(-16)
		.map((m) => ({
			role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
			content: m.content,
		}))
	try {
		const result = await aiComplete({ kind: 'mascot', messages: payload })
		pushAiMessage({
			role: 'assistant',
			content: result.content,
			ts: Date.now(),
			provider: result.provider,
			actions: result.actions,
		})
		setMood('talk', 0)
		say(result.content, 12)
	} catch (error) {
		setMood('idle', 0)
		say(String((error as Error)?.message ?? error).slice(0, 120), 8)
	} finally {
		thinking.value = false
		if (state.mood === 'think') setMood('idle', 0)
	}
}

function sendDraft() {
	const text = draft.value.trim()
	if (!text || thinking.value) return
	draft.value = ''
	offer.value = null
	void ask(text)
}

function acceptOffer() {
	const current = offer.value
	offer.value = null
	if (current) void ask(current.prompt)
}

function declineOffer() {
	offer.value = null
	say('Ладно, позовите, если что.', 4)
}

// ---- Proactive help ------------------------------------------------------

const route = useRoute()
const routeWatch = computed(() => route.path)

const ROUTE_OFFERS: { pattern: RegExp; text: string; prompt: string }[] = [
	{
		pattern: /^\/browse\/(mod|modpack|resourcepack|shader|datapack)\/?$/,
		text: 'Ищете что-то конкретное? Могу подобрать!',
		prompt: 'Подбери лучшие проекты в текущем разделе и открой самый подходящий.',
	},
	{
		pattern: /^\/instance\/[^/]+\/logs\/?$/,
		text: 'Вижу, вы в логах. Разобрать ошибку?',
		prompt: 'Посмотри логи этой сборки и объясни, что случилось и как починить.',
	},
	{
		pattern: /^\/$/,
		text: 'Соберём новую сборку?',
		prompt: 'Открой окно создания сборки и подскажи, что выбрать для игры на последней версии.',
	},
]

let lastOffer = 0

watch(
	() => routeWatch.value,
	() => {
		inputOpen.value = false
		repliesOpen.value = false
		if (Date.now() - lastOffer < 240000) return
		if (Math.random() > 0.35) return
		for (const candidate of ROUTE_OFFERS) {
			if (candidate.pattern.test(routeWatch.value)) {
				lastOffer = Date.now()
				poke()
				offer.value = { text: candidate.text, prompt: candidate.prompt }
				say(candidate.text, 15)
				return
			}
		}
	},
)

// ---- Dragging ------------------------------------------------------------

const dragging = ref(false)
let dragOffset = { x: 0, y: 0 }
let moved = false

function onPointerDown(event: PointerEvent) {
	if (event.altKey) {
		event.preventDefault()
		pet()
		return
	}
	const target = event.currentTarget as HTMLElement
	target.setPointerCapture(event.pointerId)
	dragging.value = true
	moved = false
	dragOffset = { x: event.clientX - pos.x, y: event.clientY - pos.y }
}

function onPointerMove(event: PointerEvent) {
	if (!dragging.value) return
	const dx = event.clientX - dragOffset.x
	const dy = event.clientY - dragOffset.y
	if (Math.abs(dx - pos.x) > 4 || Math.abs(dy - pos.y) > 4) moved = true
	pos.x = dx
	pos.y = dy
}

function onPointerUp() {
	if (!dragging.value) return
	dragging.value = false
	savePos()
	if (!moved) {
		poke()
		if (offer.value) return
		inputOpen.value = !inputOpen.value
		if (inputOpen.value) say('Слушаю!', 3)
	}
}

// ---- Render loop ---------------------------------------------------------

function drawPart(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	sx: number,
	sy: number,
	w: number,
	h: number,
	pivotX: number,
	pivotY: number,
	angle: number,
) {
	ctx.save()
	ctx.translate(pivotX * S, pivotY * S)
	ctx.rotate(angle)
	ctx.drawImage(img, sx, sy, w, h, (-w / 2) * S, 0, w * S, h * S)
	ctx.restore()
}

let rafId = 0
let alive = false

function drawFrame(time: number) {
	if (!alive) return
	const ctx = canvas.value?.getContext('2d')
	const img = skinImage.value
	if (!ctx || !img || !skinReady.value) return
	ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
	ctx.imageSmoothingEnabled = false

	const slim = skinVariant.value === 'SLIM'
	const armW = slim ? 3 : 4
	const armSourceX = slim ? 40 : 44
	const t = time / 1000
	const now = Date.now()

	// Autonomous choices: walk a little, then sit, then sleep if ignored.
	if (state.mood === 'idle' || state.mood === 'walk' || state.mood === 'sit') {
		if (now - state.lastInteraction > 120000) {
			if (state.mood !== 'sleep') {
				setMood('sleep', 0)
				zzzVisible.value = true
			}
		} else if (now > state.nextDecision) {
			const roll = Math.random()
			if (state.mood === 'walk') {
				setMood(roll > 0.5 ? 'sit' : 'idle', 0)
				state.nextDecision = now + 12000 + Math.random() * 15000
			} else if (roll > 0.45) {
				startWalk()
			} else {
				setMood(roll > 0.2 ? 'sit' : 'idle', 0)
				state.nextDecision = now + 10000 + Math.random() * 12000
			}
		}
	}
	if (state.moodUntil > 0 && now > state.moodUntil) {
		setMood('idle', 0)
	}

	const bodyDx = 0
	let bodyDy = 0
	let headTilt = Math.sin(t * 1.4) * 0.03
	let bodyAngle = 0
	let wholeAngle = 0
	let armL = Math.sin(t * 1.4) * 0.05
	let armR = -Math.sin(t * 1.4) * 0.05
	let legL = 0
	let legR = 0
	let squash = 1

	if (state.mood === 'walk') {
		const phase = Math.sin(t * 9)
		legL = phase * 0.55
		legR = -phase * 0.55
		armL = -phase * 0.45
		armR = phase * 0.45
		bodyDy = Math.abs(Math.sin(t * 9)) * -0.15
	} else if (state.mood === 'sit') {
		legL = -1.25
		legR = -1.25
		bodyDy = 0.6
		armL = 0.12
		armR = -0.12
	} else if (state.mood === 'sleep') {
		wholeAngle = Math.PI / 2
		bodyDy = 1.4
		headTilt = Math.sin(t * 0.8) * 0.05
	} else if (state.mood === 'dance') {
		const beat = Math.sin(t * 10)
		bodyDy = Math.abs(Math.sin(t * 5)) * -0.4
		bodyAngle = beat * 0.08
		armL = -1.9 + beat * 0.5
		armR = 1.9 - beat * 0.5
		headTilt = beat * 0.12
		legL = beat * 0.25
		legR = -beat * 0.25
	} else if (state.mood === 'pet') {
		const p = Math.min(1, (now - state.petCount) / 1400)
		squash = 1 + Math.sin(p * Math.PI) * 0.08
		headTilt = Math.sin(p * Math.PI) * 0.15
		armL = -0.4 * Math.sin(p * Math.PI)
		armR = 0.4 * Math.sin(p * Math.PI)
	} else if (state.mood === 'think') {
		headTilt = 0.14
		armR = -1.15
		armL = 0.05
	} else if (state.mood === 'talk') {
		armR = -0.5 + Math.sin(t * 6) * 0.25
		headTilt = Math.sin(t * 3) * 0.06
	}

	if (dragging.value) {
		// Dangling while carried: legs and arms hang with a little swing.
		const swing = Math.sin(t * 6) * 0.12
		armL = swing
		armR = -swing
		legL = -swing * 0.7
		legR = swing * 0.7
		headTilt = swing * 0.5
	}

	ctx.save()
	ctx.translate(CANVAS_W / 2 + bodyDx * S, CANVAS_H - 12 * S + bodyDy * S)
	ctx.rotate(wholeAngle + bodyAngle)
	ctx.scale(2 - squash, squash)
	ctx.translate(-8 * S, -20 * S)

	// Legs
	drawPart(ctx, img, 4, 20, 4, 12, 6 * S, 20 * S, legL)
	drawPart(ctx, img, 4, 20, 4, 12, 10 * S, 20 * S, legR)
	// One arm behind the body, the other in front.
	drawPart(ctx, img, armSourceX, 20, armW, 12, (4 - armW / 2 + 0.5) * S, 8.5 * S, armL)
	// Body
	ctx.drawImage(img, 20, 20, 8, 12, 4 * S, 8 * S, 8 * S, 12 * S)
	// Head (base + hat layer)
	drawPart(ctx, img, 8, 8, 8, 8, 8 * S, 8 * S, headTilt)
	drawPart(ctx, img, 40, 8, 8, 8, 8 * S, 8 * S, headTilt)
	// Front arm
	drawPart(ctx, img, armSourceX, 20, armW, 12, (12 + armW / 2 - 0.5) * S, 8.5 * S, armR)

	ctx.restore()

	rafId = requestAnimationFrame(drawFrame)
}

function startWalk() {
	const width = window.innerWidth
	const span = Math.min(width - 120, 600)
	state.walkFrom = pos.x
	state.walkStart = Date.now()
	state.walkTo = 40 + Math.random() * Math.max(80, span)
	state.walkDuration = 2500 + Math.abs(state.walkTo - state.walkFrom) * 12
	setMood('walk', state.walkDuration)
	state.nextDecision = Date.now() + state.walkDuration + 3000
}

let walkRaf = 0

function walkStep() {
	if (!alive) return
	if (state.mood === 'walk') {
		const now = Date.now()
		const progress = Math.min(1, (now - state.walkStart) / state.walkDuration)
		const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
		pos.x = state.walkFrom + (state.walkTo - state.walkFrom) * eased
		pos.x = Math.max(8, Math.min(window.innerWidth - 80, pos.x))
	}
	walkRaf = window.setTimeout(walkStep, 32)
}

// ---- Lifecycle -----------------------------------------------------------

const hidden = computed(() => !aiSettings.value.mascotEnabled || route.path.startsWith('/ai'))

function onResize() {
	clampPos()
}

onMounted(() => {
	alive = true
	clampPos()
	void loadSkin()
	rafId = requestAnimationFrame(drawFrame)
	walkStep()
	window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
	alive = false
	cancelAnimationFrame(rafId)
	clearTimeout(bubbleTimer)
	clearTimeout(walkRaf)
	window.removeEventListener('resize', onResize)
})

const mascotName = computed(() => aiSettings.value.mascotName || 'Помощник')
</script>

<template>
	<Teleport to="body">
		<div
			v-if="!hidden"
			class="mascot fixed z-[70] select-none"
			:style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
		>
			<!-- Speech bubble -->
			<transition name="mascot-pop">
				<div
					v-if="bubbleVisible && showBubble"
					class="mascot-bubble absolute bottom-full mb-2 w-max max-w-[260px]"
				>
					<div
						class="flex flex-col gap-1.5 rounded-2xl rounded-br-md border border-solid border-surface-5 bg-surface-2 px-3 py-2 shadow-xl"
					>
						<p class="m-0 whitespace-pre-wrap break-words text-sm leading-snug">
							<span class="font-semibold text-brand">{{ mascotName }}: </span>
							<template v-if="thinking">…</template>
							<template v-else>{{ bubbleText.replace(/\*\*|__|~~|`/g, '') }}</template>
						</p>
						<div v-if="offer && !thinking" class="flex gap-1.5">
							<Button size="sm" color="brand" @click="acceptOffer">
								{{ formatMessage(messages.yes) }}
							</Button>
							<Button size="sm" @click="declineOffer">
								{{ formatMessage(messages.no) }}
							</Button>
						</div>
						<button
							v-if="recentReplies.length > 0"
							type="button"
							class="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-xs text-secondary"
							@click="
								() => {
									repliesOpen = !repliesOpen
								}
							"
						>
							<EyeIcon v-if="repliesOpen" class="size-3" />
							<EyeOffIcon v-else class="size-3" />
							{{ formatMessage(repliesOpen ? messages.hideReplies : messages.showReplies) }}
						</button>
					</div>
					<transition name="mascot-pop">
						<div
							v-if="repliesOpen"
							class="mt-1 max-h-48 max-w-[280px] overflow-y-auto rounded-2xl border border-solid border-surface-5 bg-surface-2 p-2 shadow-xl"
						>
							<p class="m-0 mb-1 text-xs font-semibold text-secondary">
								{{ formatMessage(messages.repliesTitle) }}
							</p>
							<p
								v-for="(reply, index) in recentReplies"
								:key="index"
								class="m-0 border-0 border-b border-solid border-surface-5 py-1 text-xs leading-snug last:border-0"
							>
								{{ reply.content }}
							</p>
						</div>
					</transition>
				</div>
			</transition>

			<!-- Effects -->
			<div
				v-if="heartsVisible"
				class="pointer-events-none absolute inset-x-0 -top-2 flex justify-center gap-1"
			>
				<span class="mascot-heart">♥</span>
				<span class="mascot-heart" style="animation-delay: 0.3s">♥</span>
				<span class="mascot-heart" style="animation-delay: 0.6s">♥</span>
			</div>
			<div v-if="zzzVisible" class="pointer-events-none absolute -top-4 right-2 flex flex-col">
				<span class="mascot-zzz" style="animation-delay: 0s">Z</span>
				<span class="mascot-zzz" style="animation-delay: 0.6s">z</span>
				<span class="mascot-zzz" style="animation-delay: 1.2s">z</span>
			</div>
			<div v-if="notesVisible" class="pointer-events-none absolute -top-3 left-1 flex flex-col">
				<span class="mascot-note">♪</span>
				<span class="mascot-note" style="animation-delay: 0.5s">♫</span>
			</div>

			<!-- The body itself -->
			<canvas
				ref="canvas"
				:width="CANVAS_W"
				:height="CANVAS_H"
				class="mascot-body cursor-grab touch-none"
				:class="{ 'cursor-grabbing': dragging }"
				:title="mascotName"
				@pointerdown="onPointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerUp"
			/>

			<!-- Chat input -->
			<transition name="mascot-pop">
				<div
					v-if="inputOpen"
					class="absolute left-1/2 top-full mt-1 flex w-64 -translate-x-1/2 items-center gap-1 rounded-2xl border border-solid border-surface-5 bg-surface-2 p-1.5 shadow-xl"
				>
					<Input
						v-model="draft"
						size="small"
						:placeholder="formatMessage(messages.placeholder)"
						autocomplete="off"
						@keydown.enter.prevent="sendDraft"
					/>
					<Button color="brand" :disabled="thinking || !draft.trim()" @click="sendDraft">
						<ArrowUpIcon />
					</Button>
				</div>
			</transition>

			<!-- Name tag -->
			<div
				class="pointer-events-none absolute left-1/2 -bottom-1 -translate-x-1/2 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-secondary opacity-80"
			>
				<SparklesIcon v-if="thinking" class="mr-0.5 inline size-3 text-brand" />
				<MoonIcon v-else-if="state.mood === 'sleep'" class="mr-0.5 inline size-3" />
				{{ mascotName }}
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.mascot {
	filter: drop-shadow(0 10px 20px rgb(0 0 0 / 35%));
}

.mascot-body {
	image-rendering: pixelated;
	transition: transform 0.15s ease;
}

.mascot-body:hover {
	transform: scale(1.03);
}

.mascot-bubble {
	animation: mascot-rise 0.25s ease;
}

.mascot-heart {
	color: var(--color-red);
	font-size: 0.9rem;
	animation: mascot-float 1.8s ease-out infinite;
}

.mascot-zzz {
	color: var(--color-secondary);
	font-weight: 700;
	font-size: 0.8rem;
	animation: mascot-drift 2.4s ease-in-out infinite;
}

.mascot-note {
	color: var(--color-brand);
	font-size: 0.85rem;
	animation: mascot-float 2s ease-out infinite;
}

.mascot-pop-enter-active,
.mascot-pop-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.mascot-pop-enter-from,
.mascot-pop-leave-to {
	opacity: 0;
	transform: translateY(6px) scale(0.96);
}

@keyframes mascot-float {
	0% {
		opacity: 0;
		transform: translateY(0) scale(0.6);
	}
	30% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translateY(-28px) scale(1.15);
	}
}

@keyframes mascot-drift {
	0% {
		opacity: 0;
		transform: translate(0, 0);
	}
	30% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate(10px, -24px);
	}
}

@keyframes mascot-rise {
	from {
		opacity: 0;
		transform: translateY(8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.mascot-heart,
	.mascot-zzz,
	.mascot-note,
	.mascot-bubble {
		animation: none;
	}
}
</style>
