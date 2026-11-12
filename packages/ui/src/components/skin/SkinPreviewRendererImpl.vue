<template>
	<div
		ref="skinPreviewContainer"
		class="relative w-full h-full overflow-visible cursor-grab"
		@click="onCanvasClick"
		@wheel="onWheel"
	>
		<div
			ref="previewControlsElement"
			data-skin-preview-debug="controls"
			class="skin-hints absolute left-0 right-0 z-10 flex items-center justify-center pointer-events-none transition-opacity duration-300"
			:class="{ 'opacity-0': modelZoom > 1.05 }"
			:style="boundedPreviewControlsPositionStyle"
		>
			<span
				class="skin-hints__row flex items-center justify-center gap-3 text-sm font-medium leading-6 text-secondary"
			>
				<span class="flex items-center gap-1.5 whitespace-nowrap">
					<MoveIcon class="size-4 shrink-0" />
					{{ formatMessage(messages.dragToRotate) }}
				</span>
				<span class="skin-hints__divider h-4 w-px bg-surface-5" />
				<span class="flex items-center gap-1.5 whitespace-nowrap">
					<ChevronsUpDownIcon class="size-4 shrink-0" />
					{{ formatMessage(messages.scrollToZoom) }}
				</span>
			</span>
		</div>
		<div
			v-if="$slots.subtitle"
			data-skin-preview-debug="subtitle"
			class="absolute left-0 right-0 z-10 flex items-center justify-center pointer-events-none"
			:style="boundedSubtitlePositionStyle"
		>
			<div ref="subtitleElement" class="w-full pointer-events-auto" @click="ignoreControlClick">
				<slot name="subtitle" />
			</div>
		</div>
		<div
			v-if="nametag || $slots['nametag-badge']"
			data-skin-preview-debug="nametag"
			class="absolute left-1/2 pointer-events-none z-10"
			:style="nametagStyle"
		>
			<div
				v-if="$slots['nametag-badge']"
				class="absolute bottom-[calc(100%+1rem)] left-1/2 flex -translate-x-1/2 items-center justify-center"
			>
				<slot name="nametag-badge" />
			</div>
			<div v-if="nametag" class="px-3 py-1 rounded-md font-minecraft text-gray nametag-bg">
				{{ nametagText }}
			</div>
		</div>

		<canvas
			ref="canvasElement"
			class="block h-full w-full object-contain transition-opacity duration-500"
			:class="{ 'opacity-0': !isPreviewVisible, 'opacity-100': isPreviewVisible }"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointerleave="onPointerUp"
		/>

		<div v-if="showLoading" class="absolute inset-0 flex items-center justify-center">
			<div class="text-primary">Loading...</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ChevronsUpDownIcon, ClassicPlayerModel, MoveIcon, SlimPlayerModel } from '@modrinth/assets'
import { useElementSize } from '@vueuse/core'
import * as THREE from 'three'
import {
	computed,
	markRaw,
	nextTick,
	onMounted,
	onUnmounted,
	ref,
	toRef,
	useSlots,
	useTemplateRef,
	watch,
} from 'vue'

import { defineMessages, useVIntl } from '#ui/composables/i18n'
import type {
	SkinPreviewAnimationConfig,
	SkinPreviewFitPadding,
	SkinPreviewFraming,
	SkinPreviewTuple,
} from '#ui/composables/skin-rendering'
import {
	useSkinPreviewAnimation,
	useSkinPreviewControls,
	useSkinPreviewFit,
	useSkinPreviewLoading,
	useSkinPreviewLook,
	useSkinPreviewPose,
	useSkinPreviewScene,
} from '#ui/composables/skin-rendering'
import {
	clearMirroredEars,
	ENGINE_PLAYER_FEET_OFFSET,
	engineModelType,
	type EnginePlayer,
	findRigNodes,
	mirrorEarsFeatures,
	readRigCapeImage,
	readRigSkinImage,
	retargetRigToPlayer,
	RIG_TO_ENGINE_SCALE,
	RigDrivenAnimation,
	type SkinRigNodes,
	SkinViewEngine,
} from '#ui/composables/skin-rendering/mine3d-bridge'

import { useDynamicFontSize } from '../../composables'
import { createRadialSpotlightShader, syncDamageFlashShader } from './skin-preview-shader'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	dragToRotate: {
		id: 'skin.preview.drag-to-rotate',
		defaultMessage: 'Drag to rotate',
	},
	scrollToZoom: {
		id: 'skin.preview.scroll-to-zoom',
		defaultMessage: 'Scroll to zoom',
	},
})

const props = withDefaults(
	defineProps<{
		textureSrc: string
		earsTextureSrc?: string
		capeSrc?: string
		variant?: 'SLIM' | 'CLASSIC' | 'UNKNOWN'
		nametag?: string
		fit?: boolean
		lockFit?: boolean
		framing?: SkinPreviewFraming
		fitZoom?: number
		fitPadding?: Partial<SkinPreviewFitPadding>
		/** @deprecated Manual framing fallback. */
		scale?: number
		/** @deprecated Manual framing fallback, or auto-fit FOV override when fit=true. */
		fov?: number
		initialRotation?: number
		animationConfig?: SkinPreviewAnimationConfig
		earsEnabled?: boolean
		crouch?: boolean
		walk?: boolean
		hideLayers?: boolean
	}>(),
	{
		variant: 'CLASSIC',
		earsTextureSrc: undefined,
		capeSrc: undefined,
		initialRotation: 15.75,
		nametag: undefined,
		fit: undefined,
		lockFit: true,
		framing: 'page',
		fitZoom: 1,
		earsEnabled: true,
		crouch: false,
		walk: false,
		hideLayers: false,
		animationConfig: () => ({
			baseAnimation: 'idle',
			randomAnimations: ['idle_sub_1', 'idle_sub_2', 'idle_sub_3'],
			randomAnimationInterval: 8000,
			transitionDuration: 0.2,
		}),
	},
)

const emit = defineEmits<{
	earsFeaturesDetected: [detected: boolean]
	/** The model is drawn and fading in - a stand-in picture can step aside. */
	ready: []
}>()

const skinPreviewContainer = useTemplateRef<HTMLElement>('skinPreviewContainer')
const canvasElement = useTemplateRef<HTMLCanvasElement>('canvasElement')
const subtitleElement = useTemplateRef<HTMLElement>('subtitleElement')
const slots = useSlots()
const nametagText = computed(() => props.nametag)
const hasSubtitle = computed(() => Boolean(slots.subtitle))
const hasNametagBadge = computed(() => Boolean(slots['nametag-badge']))
const isSubtitleWrapped = ref(false)
const { height: subtitleHeight } = useElementSize(subtitleElement, undefined, { box: 'border-box' })
const previewControlsElement = ref<HTMLElement | null>(null)
const { height: previewControlsHeight } = useElementSize(previewControlsElement, undefined, {
	box: 'border-box',
})
const selectedModelSrc = computed(() =>
	props.variant === 'SLIM' ? SlimPlayerModel : ClassicPlayerModel,
)

let subtitleResizeObserver: ResizeObserver | undefined

function getSubtitleLayoutRoot(element: HTMLElement) {
	const elementChildren = Array.from(element.children).filter(
		(child): child is HTMLElement => child instanceof HTMLElement,
	)

	return elementChildren.length === 1 ? elementChildren[0] : element
}

function updateSubtitleWrapped() {
	const element = subtitleElement.value
	if (!element) {
		isSubtitleWrapped.value = false
		return
	}

	const layoutRoot = getSubtitleLayoutRoot(element)
	const children = Array.from(layoutRoot.children).filter(
		(child): child is HTMLElement => child instanceof HTMLElement,
	)

	if (children.length < 2) {
		isSubtitleWrapped.value = false
		return
	}

	const firstTop = children[0].getBoundingClientRect().top
	isSubtitleWrapped.value = children.some(
		(child) => Math.abs(child.getBoundingClientRect().top - firstTop) > 1,
	)
}

function observeSubtitleElement() {
	subtitleResizeObserver?.disconnect()

	const element = subtitleElement.value
	if (!element) {
		isSubtitleWrapped.value = false
		return
	}

	const layoutRoot = getSubtitleLayoutRoot(element)

	subtitleResizeObserver = new ResizeObserver(updateSubtitleWrapped)
	subtitleResizeObserver.observe(element)
	if (layoutRoot !== element) {
		subtitleResizeObserver.observe(layoutRoot)
	}

	void nextTick(updateSubtitleWrapped)
}

const {
	cleanupAnimationState,
	clickImpulseOffsetX,
	clickImpulseRotationZ,
	clickImpulseScaleX,
	clickImpulseScaleY,
	currentAnimation,
	damageFlashIntensity,
	getAvailableAnimations,
	initializeAnimations,
	playAnimation,
	playClickInteraction,
	stopAnimations,
	update: updateAnimation,
} = useSkinPreviewAnimation(toRef(props, 'animationConfig'))

const {
	ignoreControlClick,
	modelPitch,
	modelRotation,
	modelZoom,
	onCanvasClick,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onWheel,
} = useSkinPreviewControls({
	initialRotation: toRef(props, 'initialRotation'),
	onClickWithoutDrag: () => {
		playClickInteraction()
	},
})

const {
	hasEarsFeatures,
	isModelLoaded,
	isTextureLoaded,
	modelCenter,
	modelSize,
	revision: sceneRevision,
	scene,
	visibleBounds,
} = useSkinPreviewScene({
	selectedModelSrc,
	textureSrc: toRef(props, 'textureSrc'),
	earsTextureSrc: toRef(props, 'earsTextureSrc'),
	capeSrc: toRef(props, 'capeSrc'),
	earsEnabled: toRef(props, 'earsEnabled'),
	initializeAnimations,
	cleanupAnimationState,
})

const { update: updateLook } = useSkinPreviewLook({
	scene,
	container: skinPreviewContainer,
	modelRotation,
})
const { update: updatePose } = useSkinPreviewPose({
	scene,
	crouch: toRef(props, 'crouch'),
	walk: toRef(props, 'walk'),
	hideLayers: toRef(props, 'hideLayers'),
})

function syncDamageFlashShaderMaterials() {
	syncDamageFlashShader(scene.value, damageFlashIntensity.value)
	if (engine) syncDamageFlashShader(engine.player.skin, damageFlashIntensity.value)
}

const {
	cameraConfig,
	containerSize,
	fitEnabled,
	hasResolvedFit,
	modelGroupPosition,
	modelGroupScale,
	modelOffset,
	nametagTop,
	previewControlsPositionStyle,
	spotlightPosition,
	spotlightScale,
	subtitlePositionStyle,
} = useSkinPreviewFit({
	containerElement: computed(() => skinPreviewContainer.value),
	fit: toRef(props, 'fit'),
	lockFit: toRef(props, 'lockFit'),
	framing: toRef(props, 'framing'),
	fitZoom: toRef(props, 'fitZoom'),
	fitPadding: toRef(props, 'fitPadding'),
	scale: toRef(props, 'scale'),
	fov: toRef(props, 'fov'),
	modelRotation,
	nametag: toRef(props, 'nametag'),
	hasSubtitle,
	hasNametagBadge,
	subtitleWrapped: isSubtitleWrapped,
	modelCenter,
	modelSize,
	scene,
	visibleBounds,
	isModelLoaded,
})

// The controls under the feet follow the model, which moves a little when a
// cape is put on or taken off; they must not slip past the bottom of the
// preview, or the whole page would get a scrollbar for a moment.
const boundedSubtitlePositionStyle = computed(() => {
	const style = subtitlePositionStyle.value
	const top =
		typeof style.top === 'string' && style.top.endsWith('px') ? parseFloat(style.top) : NaN
	const limit = containerSize.value.height - subtitleHeight.value - 4
	if (!Number.isFinite(top) || subtitleHeight.value <= 0 || limit <= 0) return style
	return { ...style, top: `${Math.min(top, limit)}px` }
})

// The hints under the feet move with the model too: taking the cape off makes
// the model shorter, its feet drop, and the hints with them. Kept inside the
// preview so the dialog or page around it never grows a scrollbar for it.
const boundedPreviewControlsPositionStyle = computed(() => {
	const style = previewControlsPositionStyle.value
	const top =
		typeof style.top === 'string' && style.top.endsWith('px') ? parseFloat(style.top) : NaN
	const limit = containerSize.value.height - previewControlsHeight.value - 4
	if (!Number.isFinite(top) || previewControlsHeight.value <= 0 || limit <= 0) return style
	return { ...style, top: `${Math.min(top, limit)}px` }
})

const radialSpotlightShader = createRadialSpotlightShader()
const isEngineSkinLoaded = ref(false)
const isReady = computed(
	() =>
		isModelLoaded.value &&
		isTextureLoaded.value &&
		hasResolvedFit.value &&
		isEngineSkinLoaded.value,
)
const { isPreviewVisible, showLoading } = useSkinPreviewLoading(isReady)
watch(isPreviewVisible, (visible) => {
	if (visible) emit('ready')
})

onMounted(observeSubtitleElement)

let engine: SkinViewEngine | null = null
let rigNodes: SkinRigNodes | null = null
let rigOwner: THREE.Object3D | null = null
let skinSyncVersion = 0
const spotlightGroup = markRaw(new THREE.Group())
const spotlightMesh = markRaw(
	new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.ShaderMaterial(radialSpotlightShader)),
)
spotlightMesh.rotation.x = -Math.PI / 2
spotlightGroup.add(spotlightMesh)
const cameraTarget = new THREE.Vector3()

function scaled(target: THREE.Vector3, [x, y, z]: SkinPreviewTuple) {
	return target.set(x * RIG_TO_ENGINE_SCALE, y * RIG_TO_ENGINE_SCALE, z * RIG_TO_ENGINE_SCALE)
}

function applyFrameLayout(activeEngine: SkinViewEngine, player: EnginePlayer) {
	const [offsetX, offsetY, offsetZ] = modelOffset.value
	player.position.set(
		offsetX * RIG_TO_ENGINE_SCALE,
		offsetY * RIG_TO_ENGINE_SCALE + ENGINE_PLAYER_FEET_OFFSET,
		offsetZ * RIG_TO_ENGINE_SCALE,
	)
	player.rotation.set(0, 0, 0)

	const wrapper = player.parent
	if (wrapper) {
		wrapper.rotation.set(...animatedModelGroupRotation.value)
		scaled(wrapper.position, animatedModelGroupPosition.value)
		wrapper.scale.set(...animatedModelGroupScale.value)
	}

	spotlightGroup.rotation.set(modelPitch.value, 0, 0)
	scaled(spotlightMesh.position, animatedSpotlightPosition.value)
	scaled(spotlightMesh.scale, animatedSpotlightScale.value)

	const camera = activeEngine.threeCamera
	const { fov, position, target } = cameraConfig.value
	if (camera.fov !== fov) {
		camera.fov = fov
		camera.updateProjectionMatrix()
	}
	scaled(camera.position, position)
	camera.lookAt(scaled(cameraTarget, target))
}

function onEngineFrame(player: EnginePlayer, delta: number) {
	updateAnimation(delta)
	updateLook(delta)
	updatePose(delta)

	const root = scene.value
	if (root !== rigOwner) {
		rigOwner = root
		rigNodes = findRigNodes(root)
	}
	if (rigNodes) retargetRigToPlayer(rigNodes, player)
	if (engine) applyFrameLayout(engine, player)
}

async function syncEngineSkin() {
	const activeEngine = engine
	if (!activeEngine) return
	const version = ++skinSyncVersion
	const root = scene.value
	const skinImage = readRigSkinImage(root)
	const capeImage = readRigCapeImage(root)

	const modelType = engineModelType(props.variant)
	if (activeEngine.modelType !== modelType) activeEngine.setModelType(modelType)
	try {
		if (skinImage) await activeEngine.setSkin(skinImage as HTMLCanvasElement)
		if (capeImage) await activeEngine.setCape(capeImage as HTMLCanvasElement)
		else activeEngine.clearCape()
	} catch (error) {
		console.error('Failed to apply skin to the preview:', error)
		return
	}
	if (version !== skinSyncVersion || activeEngine !== engine) return

	const player = activeEngine.player as unknown as EnginePlayer
	mirrorEarsFeatures(root, player)
	syncDamageFlashShader(player.skin, damageFlashIntensity.value)
	if (skinImage) isEngineSkinLoaded.value = true
}

onMounted(() => {
	const canvas = canvasElement.value
	if (!canvas) return
	try {
		engine = new SkinViewEngine(canvas, {
			transparent: true,
			enableControls: false,
			enableEffects: false,
			autoDetectModel: false,
			modelType: engineModelType(props.variant),
			idleAnimation: new RigDrivenAnimation(onEngineFrame),
		})
	} catch (error) {
		console.error('Failed to start the skin preview renderer:', error)
		return
	}
	engine.threeScene.add(spotlightGroup)
	engine.setOuterLayerVisible(!props.hideLayers)
	engine.start()
	void syncEngineSkin()
})

watch([scene, sceneRevision, () => props.variant], () => void syncEngineSkin())
watch(
	() => props.hideLayers,
	(hide) => engine?.setOuterLayerVisible(!hide),
)

watch(hasSubtitle, () => nextTick(observeSubtitleElement), { flush: 'post' })
watch(
	hasEarsFeatures,
	(detected) => {
		emit('earsFeaturesDetected', detected)
	},
	{ immediate: true },
)
watch(scene, syncDamageFlashShaderMaterials, { immediate: true })
// The shadow tilts with the model now, so a pitch that shows the soles would
// have it painted over them, seen from under the floor. It fades out first.
const SHADOW_OPACITY = radialSpotlightShader.uniforms.innerOpacity.value
watch(
	modelPitch,
	(pitch) => {
		radialSpotlightShader.uniforms.innerOpacity.value =
			SHADOW_OPACITY * Math.min(1, Math.max(0, 1 - pitch / (Math.PI / 4)))
	},
	{ immediate: true },
)
watch(damageFlashIntensity, syncDamageFlashShaderMaterials)

onUnmounted(() => {
	subtitleResizeObserver?.disconnect()
	skinSyncVersion++
	if (engine) {
		clearMirroredEars(engine.player as unknown as EnginePlayer)
		engine.dispose()
		engine = null
	}
	spotlightMesh.geometry.dispose()
	spotlightMesh.material.dispose()
})

const { fontSize: nametagFontSize } = useDynamicFontSize({
	containerElement: skinPreviewContainer,
	text: nametagText,
	baseFontSize: 1.8,
	minFontSize: 1.25,
	maxFontSize: 2,
	padding: 24,
	fontFamily: 'inherit',
})

/**
 * Where a point just above the head lands on screen, with every turn, tilt and zoom
 * the model has. The nametag rides on it, so it stays above the head instead
 * of above where the head was before the wheel moved it.
 */
/** Floats above the head in the scene, so tilting never sinks it into the crown. */
const NAMETAG_LIFT = 0.1

const headAnchor = computed(() => {
	if (!fitEnabled.value) return null
	const { width, height } = containerSize.value
	const { fov, position, target } = cameraConfig.value
	const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000)
	camera.position.set(...position)
	camera.lookAt(...target)
	camera.updateMatrixWorld(true)

	const [offsetX, offsetY, offsetZ] = modelOffset.value
	const [centerX, , centerZ] = modelCenter.value
	const [scaleX, scaleY, scaleZ] = animatedModelGroupScale.value
	const point = new THREE.Vector3(
		(centerX + offsetX) * scaleX,
		(visibleBounds.value.max[1] + offsetY + modelSize.value[1] * NAMETAG_LIFT) * scaleY,
		(centerZ + offsetZ) * scaleZ,
	)
	point.applyEuler(new THREE.Euler(...animatedModelGroupRotation.value))
	point.add(new THREE.Vector3(...animatedModelGroupPosition.value))
	point.project(camera)

	return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height }
})

/**
 * Turned like a sign with the same words on both sides: it follows the model
 * round until it is edge-on, then shows its other face rather than mirrored text.
 */
const nametagTurn = computed(() => {
	const yaw = modelRotation.value - Math.PI * Math.round(modelRotation.value / Math.PI)
	return `perspective(800px) rotateX(${modelPitch.value}rad) rotateY(${yaw}rad) scale(${modelZoom.value})`
})

const nametagStyle = computed(() => {
	const anchor = headAnchor.value
	if (!anchor) {
		return {
			fontSize: nametagFontSize.value,
			top: nametagTop.value,
			transform: 'translateX(-50%)',
		}
	}
	return {
		fontSize: nametagFontSize.value,
		left: `${anchor.x}px`,
		top: `${anchor.y}px`,
		transform: `translate(-50%, -100%) ${nametagTurn.value}`,
		transformOrigin: 'bottom center',
	}
})

const animatedModelGroupRotation = computed<SkinPreviewTuple>(() => [
	modelPitch.value,
	modelRotation.value,
	clickImpulseRotationZ.value,
])

const animatedModelGroupPosition = computed<SkinPreviewTuple>(() => {
	const [x, y, z] = modelGroupPosition.value
	return [x + clickImpulseOffsetX.value, y, z]
})

const animatedModelGroupScale = computed<SkinPreviewTuple>(() => {
	const [x, y, z] = modelGroupScale.value
	const zoom = modelZoom.value
	return [x * clickImpulseScaleX.value * zoom, y * clickImpulseScaleY.value * zoom, z * zoom]
})

// The shadow is a sibling of the model rather than a child of it, so none of
// the movement above reaches it on its own: zoom in and it stayed the size it
// was, nudge the model sideways on a click and it stayed where it was. It
// follows the same values here. It tilts with the model's pitch too, as a floor
// would under a camera orbiting it; turning is left out, the circle is round.
const animatedSpotlightPosition = computed<SkinPreviewTuple>(() => {
	const [x, y, z] = spotlightPosition.value
	// The model is centred on the group's origin, so squashing it vertically
	// draws the feet up towards that centre, and the shadow with them.
	return [x + clickImpulseOffsetX.value, y * clickImpulseScaleY.value * modelZoom.value, z]
})

const animatedSpotlightScale = computed<SkinPreviewTuple>(() => {
	const [x, y, z] = spotlightScale.value
	const zoom = modelZoom.value
	// A circle lying in its own XY plane, turned to face up: its Y is the
	// floor's Z, so only its X takes the horizontal squash.
	return [x * clickImpulseScaleX.value * zoom, y * zoom, z * zoom]
})

defineExpose({
	playAnimation,
	playClickInteraction,
	stopAnimations,
	getAvailableAnimations,
	getCurrentAnimation: () => currentAnimation.value,
})
</script>

<style scoped lang="scss">
/* A narrow preview, like the one in the edit dialog, stacks the two hints
   rather than breaking each of them over three lines. */
.skin-hints {
	container-type: inline-size;
}

@container (max-width: 340px) {
	.skin-hints__row {
		flex-direction: column;
		gap: 0;
	}

	.skin-hints__divider {
		display: none;
	}
}

.nametag-bg {
	background:
		linear-gradient(308.68deg, rgba(50, 50, 50, 0.2) -52.46%, rgba(100, 100, 100, 0.2) 94.75%),
		rgba(0, 0, 0, 0.2);
	box-shadow:
		inset -0.5px -0.5px 0px rgba(0, 0, 0, 0.25),
		inset 0.5px 0.5px 0px rgba(255, 255, 255, 0.05);
}
</style>
