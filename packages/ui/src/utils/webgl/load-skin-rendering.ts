/** Loads the skin-rendering helpers when a renderer is needed. */
export async function loadSkinRendering() {
	const [rendering, ears, engine] = await Promise.all([
		import('./skin-rendering'),
		import('../../composables/skin-rendering/use-ears-mod-features'),
		import('../../composables/skin-rendering/mine3d-bridge'),
	])
	return {
		...rendering,
		applyEarsMod: ears.applyEarsMod,
		removeEarsMod: ears.removeEarsMod,
		SkinViewEngine: engine.SkinViewEngine,
		engineModelType: engine.engineModelType,
		mirrorEarsFeatures: engine.mirrorEarsFeatures,
		clearMirroredEars: engine.clearMirroredEars,
		readRigSkinImage: engine.readRigSkinImage,
		readRigCapeImage: engine.readRigCapeImage,
	}
}
