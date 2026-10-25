/**
 * Portalrinth's own: skins from laby.net's public skin library, searched,
 * previewed and put on the account right from Discover.
 *
 * laby.net has no "similar skins" lookup in its open API, so similarity is
 * worked out here: candidates come from searching by the skin's own tags and
 * by its main colours, then every candidate's texture is compared with the
 * reference one, colour for colour, and the closest come first.
 */
import { arrayBufferToBase64 } from '@modrinth/utils/utils'
import { ref } from 'vue'

import { proxiedFetch } from './proxy-fetch'
import { normalize_skin_texture, type SkinModel } from './skins'

export interface LabySkin {
	image_hash: string
	use_count: number
	tags: string
	skin_variant: 'CLASSIC' | 'SLIM'
}

/** How many skins laby.net hands out per page. */
export const LABY_PAGE_SIZE = 42

const SEARCH_URL = 'https://laby.net/api/texture/search'

export function labySkinTextureUrl(hash: string) {
	return `https://texture.laby.net/${hash}.png`
}

export function labySkinRenderUrl(hash: string, width = 135, height = 257) {
	return `https://laby.net/api/v3/render/skin/${hash}.png?width=${width}&height=${height}`
}

export function labySkinPageUrl(hash: string) {
	return `https://laby.net/skins/${hash}`
}

export function labySkinTags(skin: LabySkin): string[] {
	return [...new Set(skin.tags.split(/\s+/).filter(Boolean))]
}

export function labySkinVariant(skin: LabySkin): SkinModel {
	return skin.skin_variant === 'SLIM' ? 'SLIM' : 'CLASSIC'
}

export async function searchLabySkins(query: string, page = 1): Promise<LabySkin[]> {
	const params = new URLSearchParams({ type: 'SKIN' })
	const input = query.trim()
	if (input) params.set('input', input)
	if (page > 1) params.set('page', String(page))
	params.set('offset', String((page - 1) * LABY_PAGE_SIZE))
	const response = await proxiedFetch(`${SEARCH_URL}?${params.toString()}`, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	})
	if (!response.ok) throw new Error(`laby.net: ${response.status}`)
	const data = (await response.json()) as { textures?: LabySkin[] }
	return data.textures ?? []
}

/** The skin as a 64×64 PNG, older 64×32 ones filled out the way the game does. */
export async function labySkinTexture(hash: string): Promise<Uint8Array> {
	// Comes back over IPC as a plain list of bytes, not a typed array.
	return new Uint8Array(await normalize_skin_texture(labySkinTextureUrl(hash)))
}

export function pngDataUrl(png: Uint8Array) {
	return `data:image/png;base64,${arrayBufferToBase64(png)}`
}

/**
 * Set by the skin editor's "Similar skins" button: the texture to find
 * look-alikes of when Discover's skin tab opens.
 */
export const similarSkinReference = ref<{ texture: string; variant: SkinModel } | null>(null)

// ---- Similarity ---------------------------------------------------------

const BINS = 4
type Histogram = Float32Array

interface Fingerprint {
	histogram: Histogram
	colours: string[]
}

async function pixelsOf(source: string | Uint8Array): Promise<Uint8ClampedArray | null> {
	try {
		const png =
			typeof source === 'string' && !/^https?:\/\//.test(source)
				? await (await fetch(source)).blob()
				: new Blob(
						[
							typeof source === 'string'
								? new Uint8Array(await normalize_skin_texture(source))
								: new Uint8Array(source),
						],
						{ type: 'image/png' },
					)
		const bitmap = await createImageBitmap(png)
		const canvas = document.createElement('canvas')
		canvas.width = 64
		canvas.height = 64
		const context = canvas.getContext('2d', { willReadFrequently: true })
		if (!context) return null
		context.drawImage(bitmap, 0, 0, 64, 64)
		bitmap.close()
		return context.getImageData(0, 0, 64, 64).data
	} catch {
		return null
	}
}

function colourName(r: number, g: number, b: number): string {
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const lightness = (max + min) / 2 / 255
	const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
	if (lightness < 0.16) return 'Black'
	if (saturation < 0.18) return lightness > 0.8 ? 'White' : 'Gray'
	let hue = 0
	if (max === r) hue = ((g - b) / (max - min)) % 6
	else if (max === g) hue = (b - r) / (max - min) + 2
	else hue = (r - g) / (max - min) + 4
	hue = (hue * 60 + 360) % 360
	if (hue < 15 || hue >= 340) return lightness < 0.35 ? 'Brown' : 'Red'
	if (hue < 40) return lightness < 0.45 ? 'Brown' : 'Orange'
	if (hue < 65) return 'Yellow'
	if (hue < 160) return 'Green'
	if (hue < 255) return 'Blue'
	if (hue < 300) return 'Purple'
	return 'Pink'
}

function fingerprint(pixels: Uint8ClampedArray): Fingerprint {
	const histogram = new Float32Array(BINS * BINS * BINS)
	const names = new Map<string, number>()
	let total = 0
	for (let i = 0; i < pixels.length; i += 4) {
		if (pixels[i + 3] < 128) continue
		const r = pixels[i]
		const g = pixels[i + 1]
		const b = pixels[i + 2]
		const bin =
			Math.min(BINS - 1, (r * BINS) >> 8) * BINS * BINS +
			Math.min(BINS - 1, (g * BINS) >> 8) * BINS +
			Math.min(BINS - 1, (b * BINS) >> 8)
		histogram[bin] += 1
		total += 1
		const name = colourName(r, g, b)
		names.set(name, (names.get(name) ?? 0) + 1)
	}
	if (total > 0) for (let i = 0; i < histogram.length; i++) histogram[i] /= total
	const colours = [...names.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 2)
		.map(([name]) => name)
	return { histogram, colours }
}

function likeness(a: Histogram, b: Histogram) {
	let shared = 0
	for (let i = 0; i < a.length; i++) shared += Math.min(a[i], b[i])
	return shared
}

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
	const results: R[] = []
	for (let i = 0; i < items.length; i += size) {
		results.push(...(await Promise.all(items.slice(i, i + size).map(run))))
	}
	return results
}

/**
 * Skins that look like the reference: a laby.net skin (by hash, with its tags)
 * or any texture (a data URL or a URL), such as the one on the account.
 */
export async function findSimilarLabySkins(
	reference: { hash?: string; tags?: string[]; texture: string | Uint8Array },
	limit = 24,
): Promise<LabySkin[]> {
	const pixels = await pixelsOf(reference.texture)
	if (!pixels) return []
	const own = fingerprint(pixels)

	const queries = [...(reference.tags ?? []).slice(0, 3), ...own.colours]
	const candidates = new Map<string, LabySkin>()
	const pages = await Promise.all(queries.map((query) => searchLabySkins(query).catch(() => [])))
	for (const page of pages) {
		for (const skin of page) {
			if (skin.image_hash !== reference.hash) candidates.set(skin.image_hash, skin)
		}
	}

	const pool = [...candidates.values()].sort((a, b) => b.use_count - a.use_count).slice(0, 96)
	const scored = await inBatches(pool, 8, async (skin) => {
		const candidatePixels = await pixelsOf(labySkinTextureUrl(skin.image_hash))
		return {
			skin,
			score: candidatePixels ? likeness(own.histogram, fingerprint(candidatePixels).histogram) : -1,
		}
	})

	return scored
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((entry) => entry.skin)
}
