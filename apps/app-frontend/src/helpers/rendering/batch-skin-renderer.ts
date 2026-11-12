import { ClassicPlayerModel, SlimPlayerModel } from '@modrinth/assets'
import { loadSkinRendering } from '@modrinth/ui'
import type * as THREE from 'three'

import type { Cape, Skin } from '../skins'
import { determineModelType, get_normalized_skin_texture } from '../skins'

export interface RenderResult {
	forwards: string
}

export interface RawRenderResult {
	forwards: Blob
}

type SkinRendering = Awaited<ReturnType<typeof loadSkinRendering>>
type SkinEngine = InstanceType<SkinRendering['SkinViewEngine']>
type EnginePlayer = Parameters<SkinRendering['mirrorEarsFeatures']>[1]

class BatchSkinRenderer {
	private engine: SkinEngine | null = null
	private currentModel: THREE.Object3D | null = null
	private readonly width: number
	private readonly height: number

	constructor(
		private readonly rendering: SkinRendering,
		width: number = 360,
		height: number = 504,
	) {
		this.width = width
		this.height = height
	}

	private initializeEngine(): SkinEngine {
		if (this.engine) return this.engine

		const canvas = document.createElement('canvas')
		canvas.width = this.width
		canvas.height = this.height

		const engine = new this.rendering.SkinViewEngine(canvas, {
			transparent: true,
			enableControls: false,
			enableEffects: false,
			autoDetectModel: false,
			autoResize: false,
			idleAnimation: false,
			preserveDrawingBuffer: true,
		})
		engine.setSize(this.width, this.height)
		this.engine = engine
		return engine
	}

	private get player(): EnginePlayer {
		return this.engine!.player as unknown as EnginePlayer
	}

	public async renderSkin(
		textureUrl: string,
		modelUrl: string,
		variant: string,
		capeUrl?: string,
		earsTextureUrl?: string,
	): Promise<RawRenderResult> {
		const engine = this.initializeEngine()

		this.clearScene()

		const model = await this.setupModel(modelUrl, textureUrl, capeUrl, earsTextureUrl)
		const skinImage = this.rendering.readRigSkinImage(model)
		if (!skinImage) {
			throw new Error('Failed to read the skin texture.')
		}
		const capeImage = capeUrl ? this.rendering.readRigCapeImage(model) : null

		engine.setModelType(this.rendering.engineModelType(variant))
		await engine.setSkin(skinImage as HTMLCanvasElement)
		if (capeImage) {
			await engine.setCape(capeImage as HTMLCanvasElement)
		} else {
			engine.clearCape()
		}
		this.rendering.mirrorEarsFeatures(model, this.player)

		engine.fitPlayerToFrame({ fillY: 0.9 })
		engine.renderFrame()

		const forwards = await new Promise<Blob>((resolve, reject) => {
			engine.threeRenderer.domElement.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob)
					} else {
						reject(new Error('Failed to create blob from rendered canvas'))
					}
				},
				'image/webp',
				0.9,
			)
		})

		return { forwards }
	}

	private async setupModel(
		modelUrl: string,
		textureUrl: string,
		capeUrl?: string,
		earsTextureUrl?: string,
	): Promise<THREE.Object3D> {
		const [{ model }, earsTexture] = await Promise.all([
			this.rendering.setupSkinModel(modelUrl, textureUrl, capeUrl),
			earsTextureUrl ? this.rendering.loadTexture(earsTextureUrl) : Promise.resolve(null),
		])

		if (earsTexture) {
			this.rendering.applyEarsMod(model, earsTexture)
		}

		this.currentModel = model
		return model
	}

	private clearScene(): void {
		if (this.engine) this.rendering.clearMirroredEars(this.player)
		if (!this.currentModel) return

		this.rendering.removeEarsMod(this.currentModel)
		this.currentModel.clear()
		this.currentModel = null
	}

	public dispose(): void {
		this.clearScene()
		this.engine?.dispose()
		this.engine = null
		this.rendering.disposeCaches()
	}
}

function getModelUrlForVariant(variant: string): string {
	switch (variant) {
		case 'SLIM':
			return SlimPlayerModel
		case 'CLASSIC':
		case 'UNKNOWN':
		default:
			return ClassicPlayerModel
	}
}

let sharedRenderer: BatchSkinRenderer | null = null

export function disposeSharedRenderer(): void {
	sharedRenderer?.dispose()
	sharedRenderer = null
}

export async function renderSkinPreview(skin: Skin, capes: Cape[]): Promise<RawRenderResult> {
	sharedRenderer ??= new BatchSkinRenderer(await loadSkinRendering())
	const variant =
		skin.variant === 'UNKNOWN'
			? await determineModelType(skin.texture).catch(() => 'CLASSIC')
			: skin.variant
	return sharedRenderer.renderSkin(
		await get_normalized_skin_texture(skin),
		getModelUrlForVariant(variant),
		variant,
		capes.find((cape) => cape.id === skin.cape_id)?.texture,
		skin.texture,
	)
}
