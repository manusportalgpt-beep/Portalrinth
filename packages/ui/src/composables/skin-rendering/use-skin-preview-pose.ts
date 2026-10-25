import { useRenderLoop } from '@tresjs/core'
import * as THREE from 'three'
import type { Ref, ShallowRef } from 'vue'

/** How far the upper body leans forward while crouching, in radians. */
const CROUCH_LEAN = 0.5
/** How far arms and legs swing either way while walking, in radians. */
const WALK_SWING = 0.65
/** Walking steps, in radians of the swing per second. */
const WALK_SPEED = 6.5
/** How quickly a pose blends in and out; higher is snappier. */
const BLEND_RATE = 10

type Limb = 'Body' | 'Right_Arm' | 'Left_Arm' | 'Right_Leg' | 'Left_Leg' | 'Cape'
const LIMBS: Limb[] = ['Body', 'Right_Arm', 'Left_Arm', 'Right_Leg', 'Left_Leg', 'Cape']

interface LimbState {
	object: THREE.Object3D
	base: THREE.Quaternion
	posed: THREE.Quaternion
	applied: boolean
}

/**
 * Portalrinth's own: poses the preview player on top of whatever the animation
 * mixer did this frame — crouching, walking, and the outer skin layer shown or
 * hidden. The model ships only idle clips, so walking and crouching are worked
 * out here the way the game does them: limbs swinging about the hips and
 * shoulders, the upper body leaning forward from the waist.
 *
 * Every pose is a turn in the limb's parent frame put on after the mixer; one
 * the mixer did not overwrite is taken back off first, so turns never add up.
 */
export function useSkinPreviewPose(options: {
	scene: ShallowRef<THREE.Object3D | null>
	crouch: Readonly<Ref<boolean | undefined>>
	walk: Readonly<Ref<boolean | undefined>>
	hideLayers: Readonly<Ref<boolean | undefined>>
}) {
	let owner: THREE.Object3D | null = null
	let limbs: Partial<Record<Limb, LimbState>> = {}
	let layers: THREE.Object3D[] = []
	let layersHidden = false
	let crouchAmount = 0
	let walkAmount = 0
	let walkPhase = 0

	const turn = new THREE.Quaternion()
	const axisX = new THREE.Vector3(1, 0, 0)

	function bind(root: THREE.Object3D | null) {
		owner = root
		limbs = {}
		layers = []
		layersHidden = false
		if (!root) return
		for (const name of LIMBS) {
			const object = root.getObjectByName(name)
			if (object) {
				limbs[name] = {
					object,
					base: new THREE.Quaternion(),
					posed: new THREE.Quaternion(),
					applied: false,
				}
			}
		}
		root.traverse((object) => {
			if (object.name.endsWith('_Layer')) layers.push(object)
		})
	}

	function pose(name: Limb, angle: number) {
		const limb = limbs[name]
		if (!limb) return
		const { object } = limb
		if (limb.applied && object.quaternion.equals(limb.posed)) {
			object.quaternion.copy(limb.base)
		}
		limb.base.copy(object.quaternion)
		if (Math.abs(angle) < 1e-4) {
			limb.applied = false
			return
		}
		object.quaternion.premultiply(turn.setFromAxisAngle(axisX, angle))
		limb.posed.copy(object.quaternion)
		limb.applied = true
	}

	const { onLoop } = useRenderLoop()
	onLoop(({ delta }) => {
		const root = options.scene.value
		if (root !== owner) bind(root)
		if (!root) return

		const hide = options.hideLayers.value === true
		if (hide !== layersHidden) {
			layersHidden = hide
			for (const layer of layers) layer.visible = !hide
		}

		const blend = 1 - Math.exp(-BLEND_RATE * delta)
		crouchAmount += ((options.crouch.value ? 1 : 0) - crouchAmount) * blend
		walkAmount += ((options.walk.value ? 1 : 0) - walkAmount) * blend
		if (walkAmount > 1e-3) walkPhase = (walkPhase + delta * WALK_SPEED) % (Math.PI * 2)
		else walkPhase = 0

		const swing = Math.sin(walkPhase) * WALK_SWING * walkAmount
		// The front of the model is -Z in its own frame (the cape hangs on +Z),
		// so leaning forward and swinging a limb forward are opposite turns.
		const lean = -CROUCH_LEAN * crouchAmount
		pose('Body', lean)
		pose('Right_Arm', swing + 0.15 * crouchAmount)
		pose('Left_Arm', -swing + 0.15 * crouchAmount)
		pose('Right_Leg', -swing)
		pose('Left_Leg', swing)
		// The cape swings out behind while walking, a little more while crouched.
		pose('Cape', -0.25 * walkAmount - 0.2 * crouchAmount)
	})
}
