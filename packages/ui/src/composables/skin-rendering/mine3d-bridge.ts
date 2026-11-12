import * as THREE from 'three'

import { type SkinAnimation, SkinModelType, SkinViewEngine } from '../../vendor/mine3d/index'

export { SkinModelType, SkinViewEngine }

/** The GLB rig is measured in blocks, mine3d (skin3d) in skin pixels. */
export const RIG_TO_ENGINE_SCALE = 16
/** The rig stands on y=0; the skin3d player is centred on its own origin. */
export const ENGINE_PLAYER_FEET_OFFSET = 16

const EARS_FEATURE_PREFIX = 'EarsModFeature'
const EARS_OVERLAY_PREFIX = 'EarsModEmissiveOverlay'
const MIRRORED_EARS_NAME = 'PortalrinthEarsMirror'

type RigLimb = 'Body' | 'Head' | 'Right_Arm' | 'Left_Arm' | 'Right_Leg' | 'Left_Leg'

export interface SkinRigNodes {
	body: THREE.Object3D
	head: THREE.Object3D
	rightArm: THREE.Object3D
	leftArm: THREE.Object3D
	rightLeg: THREE.Object3D
	leftLeg: THREE.Object3D
	cape: THREE.Object3D | null
}

interface EnginePart extends THREE.Object3D {
	innerLayer?: THREE.Object3D
	outerLayer?: THREE.Object3D
}

export interface EnginePlayer extends THREE.Object3D {
	skin: THREE.Object3D & {
		head: EnginePart
		body: EnginePart
		rightArm: EnginePart
		leftArm: EnginePart
		rightLeg: EnginePart
		leftLeg: EnginePart
	}
	cape: THREE.Object3D
}

export function findRigNodes(root: THREE.Object3D | null): SkinRigNodes | null {
	if (!root) return null
	const get = (name: RigLimb) => root.getObjectByName(name) ?? null
	const body = get('Body')
	const head = get('Head')
	const rightArm = get('Right_Arm')
	const leftArm = get('Left_Arm')
	const rightLeg = get('Right_Leg')
	const leftLeg = get('Left_Leg')
	if (!body || !head || !rightArm || !leftArm || !rightLeg || !leftLeg) return null
	return {
		body,
		head,
		rightArm,
		leftArm,
		rightLeg,
		leftLeg,
		cape: root.getObjectByName('Cape') ?? null,
	}
}

const BODY_CENTER = new THREE.Vector3(0, 0.375, 0)
const scratchPosition = new THREE.Vector3()
const scratchRotation = new THREE.Quaternion()

/**
 * The rig hangs under a node turned half a circle about Y, so the player's
 * own frame there is the skin3d one with X and Z flipped, in blocks, with the
 * origin at the hips instead of the neck.
 */
function placePart(
	part: THREE.Object3D,
	position: THREE.Vector3,
	rotation: THREE.Quaternion,
	yOffset = 0,
) {
	part.position.set(
		-position.x * RIG_TO_ENGINE_SCALE,
		position.y * RIG_TO_ENGINE_SCALE - 12 + yOffset,
		-position.z * RIG_TO_ENGINE_SCALE,
	)
	part.quaternion.set(-rotation.x, rotation.y, -rotation.z, rotation.w)
}

function placeBodyChild(part: THREE.Object3D, body: THREE.Object3D, node: THREE.Object3D) {
	scratchPosition.copy(node.position).applyQuaternion(body.quaternion).add(body.position)
	scratchRotation.copy(body.quaternion).multiply(node.quaternion)
	placePart(part, scratchPosition, scratchRotation)
}

/** Copies the rig's current pose, as posed by the mixer, look and pose, onto the mine3d player. */
export function retargetRigToPlayer(nodes: SkinRigNodes, player: EnginePlayer) {
	const { body } = nodes
	const skin = player.skin

	scratchPosition.copy(BODY_CENTER).applyQuaternion(body.quaternion).add(body.position)
	placePart(skin.body, scratchPosition, body.quaternion)
	placeBodyChild(skin.head, body, nodes.head)
	placeBodyChild(skin.rightArm, body, nodes.rightArm)
	placeBodyChild(skin.leftArm, body, nodes.leftArm)
	placePart(skin.rightLeg, nodes.rightLeg.position, nodes.rightLeg.quaternion)
	placePart(skin.leftLeg, nodes.leftLeg.position, nodes.leftLeg.quaternion)

	if (nodes.cape) {
		scratchPosition.copy(nodes.cape.position).applyQuaternion(body.quaternion).add(body.position)
		scratchRotation.copy(body.quaternion).multiply(nodes.cape.quaternion)
		placePart(player.cape, scratchPosition, scratchRotation, 8)
	}
}

/** A mine3d animation whose every frame is handed to the caller. */
export class RigDrivenAnimation implements SkinAnimation {
	speed = 1
	paused = false
	progress = 0
	readonly controlsLegs = true

	constructor(private readonly onFrame: (player: EnginePlayer, delta: number) => void) {}

	update(player: EnginePlayer, deltaTime: number) {
		if (this.paused) return
		const delta = deltaTime * this.speed
		this.onFrame(player, delta)
		this.progress += delta
	}
}

const PART_OFFSETS: Record<RigLimb, [keyof EnginePlayer['skin'], number]> = {
	Head: ['head', 0],
	Body: ['body', -6],
	Right_Arm: ['rightArm', 0],
	Left_Arm: ['leftArm', 0],
	Right_Leg: ['rightLeg', 0],
	Left_Leg: ['leftLeg', 0],
}

export function clearMirroredEars(player: EnginePlayer) {
	const stale: THREE.Object3D[] = []
	player.traverse((object) => {
		if (object.name === MIRRORED_EARS_NAME) stale.push(object)
	})
	for (const object of stale) object.removeFromParent()
}

/**
 * Ears mod features are built on the rig's body nodes; the same meshes, shared
 * rather than copied, are hung on the matching mine3d parts so they move with them.
 */
export function mirrorEarsFeatures(root: THREE.Object3D | null, player: EnginePlayer) {
	clearMirroredEars(player)
	if (!root) return

	root.traverse((object) => {
		if (!object.name.startsWith(EARS_FEATURE_PREFIX) || !object.parent) return
		const owner = PART_OFFSETS[object.parent.name as RigLimb]
		if (!owner) return
		const part = player.skin[owner[0]] as THREE.Object3D

		const wrapper = new THREE.Group()
		wrapper.name = MIRRORED_EARS_NAME
		wrapper.position.set(0, owner[1], 0)
		wrapper.rotation.y = Math.PI
		wrapper.scale.setScalar(RIG_TO_ENGINE_SCALE)
		wrapper.add(object.clone(true))
		part.add(wrapper)
	})
}

function textureImage(texture: THREE.Texture | null | undefined): CanvasImageSource | null {
	const image = texture?.image as CanvasImageSource | undefined
	if (!image) return null
	if (image instanceof HTMLImageElement && !image.complete) return null
	return image
}

function findMesh(root: THREE.Object3D, name: string): THREE.Mesh | null {
	const object = root.getObjectByName(name) as THREE.Mesh | undefined
	return object?.isMesh ? object : null
}

/**
 * The skin as the rig shows it: the ears mod may have erased or moved pixels,
 * and split glowing ones onto an overlay, which is laid back on top here.
 */
export function readRigSkinImage(root: THREE.Object3D | null): CanvasImageSource | null {
	if (!root) return null
	const head = findMesh(root, 'Head_2')
	if (!head) return null
	const material = head.material as THREE.MeshStandardMaterial
	const base = textureImage(material.map)
	if (!base) return null

	const overlay = head.children.find((child) => child.name.startsWith(EARS_OVERLAY_PREFIX)) as
		| THREE.Mesh
		| undefined
	const glow = overlay ? textureImage((overlay.material as THREE.MeshStandardMaterial).map) : null
	if (!glow) return base

	const canvas = document.createElement('canvas')
	canvas.width = 64
	canvas.height = 64
	const context = canvas.getContext('2d')
	if (!context) return base
	context.imageSmoothingEnabled = false
	context.drawImage(base, 0, 0, 64, 64)
	context.drawImage(glow, 0, 0, 64, 64)
	return canvas
}

/** The cape image the rig is wearing, or null while it wears none. */
export function readRigCapeImage(root: THREE.Object3D | null): CanvasImageSource | null {
	if (!root) return null
	const cape = findMesh(root, 'Cape_2')
	if (!cape) return null
	const material = cape.material as THREE.MeshStandardMaterial
	if (!material.visible) return null
	return textureImage(material.map)
}

export function engineModelType(variant: string | undefined) {
	return variant === 'SLIM' ? SkinModelType.Slim : SkinModelType.Classic
}
