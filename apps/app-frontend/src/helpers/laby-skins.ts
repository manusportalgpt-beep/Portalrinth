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
        // The texture CDN (texture.laby.net) resets connections on some networks;
        // the same files are served by laby.net itself, whose API the skin
        // library already runs on.
        return `https://laby.net/texture/${hash}.png`
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

const STOCK_SKIN_NAMES = /\b(steve|alex|ari|efe|kai|makena|noor|sunny|zuri)\b/i

/**
 * Mojang's own default skins (Steve, Alex and the seven new ones), each in
 * both arm widths and a few legacy copies, crowd the top of laby.net's
 * popular list - eighteen near-identical cards before the first real one.
 * The launcher already offers them under "Default skins", so Discover skips
 * them in the popular list and among look-alikes.
 */
export function isStockLabySkin(skin: LabySkin): boolean {
        if (skin.use_count >= 1_000_000) return true
        return /\bdefault\b/i.test(skin.tags) && STOCK_SKIN_NAMES.test(skin.tags)
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

/** Every way a texture can come in, most likely to serve first: laby.net's
 * own hosts, then an image proxy that fetches on its own servers, for the
 * networks whose route to laby.net's CDN drops a share of the requests. */
export function labySkinTextureSources(hash: string): string[] {
        const main = labySkinTextureUrl(hash)
        const cdn = `https://texture.laby.net/${hash}.png`
        const through = (url: string) =>
                `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=png`
        const wsrv = (url: string) =>
                `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
        // minotar is not here on purpose: it does not know laby.net's hashes and
        // answers every one of them with a stock Steve - the "broken" textures
        // and the grid full of Steves came from that road.
        return [cdn, main, wsrv(cdn), through(cdn), wsrv(main), through(main)]
}

/**
 * The preview render of a skin, by its texture hash: laby.net draws its own
 * library in 3D on the same host the skin library runs on, so what the grid
 * asks for is what the library already serves. The previous stand-in,
 * crafty.gg, only knows Mojang's own texture hashes and answered every
 * laby.net skin with the same Steve.
 */
export function labySkinRenderUrl(hash: string, width = 270, height = 514) {
        return `https://laby.net/api/v3/render/skin/${hash}.png?width=${width}&height=${height}`
}

/**
 * Every way the render itself can arrive: straight from laby.net, then
 * through two image proxies that fetch it on their own servers. When the
 * route to laby.net is lossy (as it is on some Russian networks), the
 * proxied copies still come through - same picture, different road.
 */
export function labySkinRenderSources(hash: string, width = 360, height = 684): string[] {
        const direct = labySkinRenderUrl(hash, width, height)
        const through = (url: string) =>
                `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=png`
        const wsrv = (url: string) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
        // Only laby.net itself knows its own hashes: vzge, NMSR and SkinRender.dev
        // take Mojang's 64-character texture hashes and answer laby.net's with a
        // 400 or a stock Alex - so they are not roads for a library skin.
        return [direct, wsrv(direct), through(direct)]
}

/**
 * vzge.me renders a full 3D body from a bare texture hash on its own edge
 * network - fast and hash-friendly, no Mojang indexing needed.
 */
export function vzgeBodyUrl(hash: string, width = 512) {
        return `https://vzge.me/full/${Math.min(width, 1024)}/${hash}.png`
}

/**
 * SkinRender.dev draws a 3D body from a texture hash with its own pose
 * engine; the size caps at 1024, the body comes back transparent.
 */
export function skinrenderBodyUrl(hash: string, width = 512) {
        return `https://skinrender.dev/render/${hash}/body?size=${Math.min(width, 1024)}`
}

/**
 * NMSR (nmsr.nickac.dev) is the reference-quality renderer behind several
 * frontends; it accepts raw texture hashes and draws a full body.
 */
export function nmsrBodyUrl(hash: string, width = 360, height = 684) {
        return `https://nmsr.nickac.dev/fullbody/${hash}?width=${Math.min(width, 1024)}&height=${Math.min(height, 1024)}`
}

/**
 * A flat full-body picture straight from the texture hash, drawn by minotar.
 * Unlike every other hash-capable renderer it needs no Mojang indexing, and
 * unlike laby.net's own render it sits on a separate host - when one is
 * throttled or unreachable, the other usually answers.
 */
export function minotarBodyUrl(hash: string, height = 512) {
        return `https://minotar.net/body/${hash}/${height}`
}

/** Reads a texture with the webview's own network stack. Both laby.net hosts
 * answer with open CORS, and to Cloudflare a browser is a known face where
 * the app's client is not. */
async function browserTextureBytes(url: string): Promise<Uint8Array> {
        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' })
        if (!response.ok) throw new Error(`skin texture: ${response.status}`)
        return new Uint8Array(await response.arrayBuffer())
}

/** Resolves with the first task that answers, rejects only when all do. */
function firstSuccess<T>(tasks: (() => Promise<T>)[]): Promise<T> {
        return new Promise((resolve, reject) => {
                let pending = tasks.length
                let firstError: unknown
                if (pending === 0) {
                        reject(new Error('no sources to try'))
                        return
                }
                for (const task of tasks) {
                        let started: Promise<T>
                        try {
                                started = task()
                        } catch (error) {
                                started = Promise.reject(error)
                        }
                        started.then(resolve, (error: unknown) => {
                                if (firstError === undefined) firstError = error
                                pending -= 1
                                if (pending === 0) reject(firstError)
                        })
                }
        })
}

const textureCache = new Map<string, Promise<Uint8Array>>()

/**
 * The skin as a 64×64 PNG (older 64×32 ones filled out the way the game does).
 * One download per skin per run: the grid's preview, the 3D viewer and the
 * look-alike search all share it, and a texture seen once is kept on disk -
 * the viewer opens at once on the next visit.
 */
export function labySkinTexture(hash: string): Promise<Uint8Array> {
        let cached = textureCache.get(hash)
        if (!cached) {
                cached = (async () => {
                        const stored = await readStored(`tex:${hash}`)
                        if (stored) {
                                try {
                                        return base64ToBytes(stored)
                                } catch {
                                        /* a damaged entry just downloads again */
                                }
                        }
                        const texture = await downloadTexture(hash)
                        void writeStored(`tex:${hash}`, arrayBufferToBase64(texture))
                        return texture
                })().catch((error) => {
                        textureCache.delete(hash)
                        throw error
                })
                textureCache.set(hash, cached)
        }
        return cached
}

/**
 * Speed comes from a real race: the two laby.net hosts over the app's client
 * and over the webview at once - the fastest answer wins. The proxies join
 * only when both hosts fail, and a calm sequential pass is the last resort.
 */
async function downloadTexture(hash: string): Promise<Uint8Array> {
        const sources = labySkinTextureSources(hash)
        const viaApp = (source: string) => async () =>
                new Uint8Array(await normalize_skin_texture(source))
        const viaBrowser = (source: string) => async () =>
                new Uint8Array(await normalize_skin_texture(await browserTextureBytes(source)))
        let lastError: unknown
        const direct = sources.slice(0, 2)
        const proxied = sources.slice(2)
        try {
                return await firstSuccess([...direct.map(viaApp), ...direct.map(viaBrowser)])
        } catch (error) {
                lastError = error
        }
        try {
                return await firstSuccess([...proxied.map(viaApp), ...proxied.map(viaBrowser)])
        } catch (error) {
                lastError = error
        }
        await new Promise((resolve) => setTimeout(resolve, 600))
        for (const source of sources) {
                try {
                        return await viaApp(source)()
                } catch (error) {
                        lastError = error
                }
        }
        throw lastError ?? new Error(`The skin texture ${hash} could not be loaded`)
}

function base64ToBytes(value: string): Uint8Array {
        const binary = atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes
}

/**
 * The last road for a preview: the render chain fetched by the app's own
 * client - the one that follows the system proxy and knows no CORS - each
 * answer checked for a real PNG and turned into a data URL. A card the
 * webview's network starves still fills through here.
 */
export async function remotePreviewDataUrl(hash: string): Promise<string> {
        const sources = labySkinRenderSources(hash, 360, 684)
        let lastError: unknown
        for (const source of sources) {
                try {
                        const response = await proxiedFetch(source, {
                                method: 'GET',
                                headers: { Accept: 'image/png,image/*' },
                        })
                        if (!response.ok) throw new Error(`render: ${response.status}`)
                        const bytes = new Uint8Array(await response.arrayBuffer())
                        // A real render is never tiny; an error page is.
                        if (bytes.length < 512) throw new Error('render too small')
                        return pngDataUrl(bytes)
                } catch (error) {
                        lastError = error
                }
        }
        throw lastError ?? new Error(`no render road for ${hash}`)
}

export function pngDataUrl(png: Uint8Array) {
        return `data:image/png;base64,${arrayBufferToBase64(png)}`
}

// ---- Local previews ------------------------------------------------------

const previewCache = new Map<string, Promise<string>>()

// ---- Persistent previews ---------------------------------------------------
//
// Canvas previews used to live in memory only: the second visit to the same
// grid refetched every texture. A small IndexedDB shelf keeps the drawn
// previews between runs - a skin the player has already seen paints the
// moment the page opens, and a missing or broken entry just redraws once.

const PREVIEW_DB = 'portalrinth-laby-previews'

let previewDb: Promise<IDBDatabase | null> | null = null

function openPreviewDb(): Promise<IDBDatabase | null> {
        if (previewDb) return previewDb
        previewDb = new Promise((resolve) => {
                try {
                        const request = indexedDB.open(PREVIEW_DB, 1)
                        request.onupgradeneeded = () => {
                                if (!request.result.objectStoreNames.contains('previews')) {
                                        request.result.createObjectStore('previews')
                                }
                        }
                        request.onsuccess = () => resolve(request.result)
                        request.onerror = () => resolve(null)
                } catch {
                        resolve(null)
                }
        })
        return previewDb
}

async function readStored(key: string): Promise<string | null> {
        const db = await openPreviewDb()
        if (!db) return null
        return new Promise((resolve) => {
                try {
                        const request = db.transaction('previews').objectStore('previews').get(key)
                        request.onsuccess = () =>
                                resolve(typeof request.result === 'string' ? request.result : null)
                        request.onerror = () => resolve(null)
                } catch {
                        resolve(null)
                }
        })
}

async function writeStored(key: string, value: string): Promise<void> {
        const db = await openPreviewDb()
        if (!db) return
        try {
                db.transaction('previews', 'readwrite').objectStore('previews').put(value, key)
        } catch {
                /* an unstored entry just redraws next time */
        }
}

/** Bumped whenever the drawing changes, so old flat previews are not reused. */
const PREVIEW_STYLE = 'iso2'

/**
 * A 3D view of the skin - head, body, arms and legs as lit boxes with the
 * outer layer over them, in the same three-quarter look SkinRender.dev
 * draws - painted right here on a canvas from the skin's own texture.
 * SkinRender.dev, vzge and NMSR only know Mojang's 64-character hashes and
 * answer laby.net's with a stock Alex or Steve, so a library skin is drawn
 * locally: instant, crisp, and always the right skin.
 */
export function labySkinPreview(hash: string, variant?: SkinModel): Promise<string> {
        const key = `${PREVIEW_STYLE}:${hash}`
        let cached = previewCache.get(key)
        if (!cached) {
                cached = (async () => {
                        const stored = await readStored(key)
                        if (stored) return stored
                        const url = await drawSkinPreview(hash, variant)
                        void writeStored(key, url)
                        return url
                })().catch((error) => {
                        previewCache.delete(key)
                        throw error
                })
                previewCache.set(key, cached)
        }
        return cached
}

type Vec3 = [number, number, number]

interface SkinBox {
        /** Texture origin of the part (top-left of its net). */
        u: number
        v: number
        /** Size: width along x, height along y, depth along z, in skin pixels. */
        w: number
        h: number
        d: number
        /** Lowest corner in model space (feet at y = 0, facing +z). */
        at: Vec3
        /** Outer layers sit a little proud of the part they cover. */
        inflate: number
        /** Drawn over the inner box of the same part. */
        layer: number
}

/** Skins drawn slim when the texture says so: the 4th column of the right
 * arm's front is empty on slim (3-pixel) arms. */
function looksSlim(pixels: Uint8ClampedArray): boolean {
        for (let y = 20; y < 32; y++) {
                if (pixels[(y * 64 + 47) * 4 + 3] > 0) return false
        }
        return true
}

function skinBoxes(slim: boolean): SkinBox[] {
        const arm = slim ? 3 : 4
        const part = (u: number, v: number, w: number, h: number, d: number, at: Vec3, layer = 0) => ({
                u,
                v,
                w,
                h,
                d,
                at,
                inflate: layer ? (w === 8 && h === 8 ? 0.5 : 0.25) : 0,
                layer,
        })
        return [
                part(0, 0, 8, 8, 8, [-4, 24, -4]),
                part(32, 0, 8, 8, 8, [-4, 24, -4], 1),
                part(16, 16, 8, 12, 4, [-4, 12, -2]),
                part(16, 32, 8, 12, 4, [-4, 12, -2], 1),
                part(40, 16, arm, 12, 4, [-4 - arm, 12, -2]),
                part(40, 32, arm, 12, 4, [-4 - arm, 12, -2], 1),
                part(32, 48, arm, 12, 4, [4, 12, -2]),
                part(48, 48, arm, 12, 4, [4, 12, -2], 1),
                part(0, 16, 4, 12, 4, [-4, 0, -2]),
                part(0, 32, 4, 12, 4, [-4, 0, -2], 1),
                part(16, 48, 4, 12, 4, [0, 0, -2]),
                part(0, 48, 4, 12, 4, [0, 0, -2], 1),
        ]
}

/** A copy of the texture darkened by `amount` on its opaque pixels only. */
function shadedTexture(source: CanvasImageSource, amount: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 64
        const context = canvas.getContext('2d')
        if (!context) return canvas
        context.drawImage(source, 0, 0)
        if (amount > 0) {
                context.globalCompositeOperation = 'source-atop'
                context.fillStyle = `rgba(0, 0, 0, ${amount})`
                context.fillRect(0, 0, 64, 64)
        }
        return canvas
}

/** Paints the skin in three-quarter view, 3D boxes lit from above-left. */
async function drawSkinPreview(hash: string, variant?: SkinModel): Promise<string> {
        const texture = await labySkinTexture(hash)
        const bitmap = await createImageBitmap(
                new Blob([new Uint8Array(texture)], { type: 'image/png' }),
        )
        try {
                const probe = shadedTexture(bitmap, 0)
                const probeData = probe.getContext('2d')?.getImageData(0, 0, 64, 64).data
                const slim = variant ? variant === 'SLIM' : probeData ? looksSlim(probeData) : false
                return renderSkinIso(probe, slim)
        } finally {
                bitmap.close()
        }
}

/** The three-quarter render itself, out of a 64×64 texture canvas. */
export function renderSkinIso(texture: HTMLCanvasElement, slim: boolean, width = 360, height = 504): string {
        const yaw = (-32 * Math.PI) / 180
        const pitch = (14 * Math.PI) / 180
        const cy = Math.cos(yaw)
        const sy = Math.sin(yaw)
        const cp = Math.cos(pitch)
        const sp = Math.sin(pitch)
        // Screen x/y of a model point, and its depth toward the camera.
        const project = ([x, y, z]: Vec3): [number, number, number] => {
                const x1 = x * cy + z * sy
                const z1 = -x * sy + z * cy
                return [x1, -y * cp + z1 * sp, z1 * cp + y * sp]
        }
        const toCamera: Vec3 = [-sy * cp, sp, cy * cp]

        const lit = shadedTexture(texture, 0)
        const front = shadedTexture(texture, 0.1)
        const side = shadedTexture(texture, 0.32)

        type Face = { origin: Vec3; uAxis: Vec3; vAxis: Vec3; sx: number; sy: number; sw: number; sh: number; normal: Vec3; image: HTMLCanvasElement }
        const faces: { depth: number; layer: number; faces: Face[] }[] = []
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity

        for (const box of skinBoxes(slim)) {
                const g = box.inflate
                const x0 = box.at[0] - g
                const y0 = box.at[1] - g
                const z0 = box.at[2] - g
                const x1 = box.at[0] + box.w + g
                const y1 = box.at[1] + box.h + g
                const z1 = box.at[2] + box.d + g
                const W = x1 - x0
                const H = y1 - y0
                const D = z1 - z0
                const { u, v, w, h, d } = box
                const all: Face[] = [
                        // front (+z)
                        { origin: [x0, y1, z1], uAxis: [W, 0, 0], vAxis: [0, -H, 0], sx: u + d, sy: v + d, sw: w, sh: h, normal: [0, 0, 1], image: front },
                        // player's right (-x)
                        { origin: [x0, y1, z0], uAxis: [0, 0, D], vAxis: [0, -H, 0], sx: u, sy: v + d, sw: d, sh: h, normal: [-1, 0, 0], image: side },
                        // player's left (+x)
                        { origin: [x1, y1, z1], uAxis: [0, 0, -D], vAxis: [0, -H, 0], sx: u + d + w, sy: v + d, sw: d, sh: h, normal: [1, 0, 0], image: side },
                        // top (+y)
                        { origin: [x0, y1, z0], uAxis: [W, 0, 0], vAxis: [0, 0, D], sx: u + d, sy: v, sw: w, sh: d, normal: [0, 1, 0], image: lit },
                ]
                const visible = all.filter(
                        (face) =>
                                face.normal[0] * toCamera[0] + face.normal[1] * toCamera[1] + face.normal[2] * toCamera[2] > 0,
                )
                const center = project([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
                faces.push({ depth: center[2], layer: box.layer, faces: visible })
                for (const corner of [
                        [x0, y0, z0],
                        [x1, y0, z0],
                        [x0, y1, z0],
                        [x1, y1, z0],
                        [x0, y0, z1],
                        [x1, y0, z1],
                        [x0, y1, z1],
                        [x1, y1, z1],
                ] as Vec3[]) {
                        const [px, py] = project(corner)
                        minX = Math.min(minX, px)
                        maxX = Math.max(maxX, px)
                        minY = Math.min(minY, py)
                        maxY = Math.max(maxY, py)
                }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not create a canvas context for a skin preview')
        context.imageSmoothingEnabled = false
        const margin = 0.06
        const scale = Math.min(
                (width * (1 - 2 * margin)) / (maxX - minX),
                (height * (1 - 2 * margin)) / (maxY - minY),
        )
        const offsetX = width / 2 - ((minX + maxX) / 2) * scale
        const offsetY = height / 2 - ((minY + maxY) / 2) * scale

        // Far parts first; an outer layer right after the part it covers.
        faces.sort((a, b) => a.depth - b.depth || a.layer - b.layer)
        for (const part of faces) {
                for (const face of part.faces) {
                        const [ox, oy] = project(face.origin)
                        const [ux, uy] = project(face.uAxis)
                        const [vx, vy] = project(face.vAxis)
                        context.setTransform(
                                (ux / face.sw) * scale,
                                (uy / face.sw) * scale,
                                (vx / face.sh) * scale,
                                (vy / face.sh) * scale,
                                offsetX + ox * scale,
                                offsetY + oy * scale,
                        )
                        // A hair of overlap closes the seams between neighbouring faces.
                        const e = 0.04
                        context.drawImage(
                                face.image,
                                face.sx,
                                face.sy,
                                face.sw,
                                face.sh,
                                -e,
                                -e,
                                face.sw + 2 * e,
                                face.sh + 2 * e,
                        )
                }
        }
        context.setTransform(1, 0, 0, 1, 0, 0)
        return canvas.toDataURL('image/png')
}

/**
 * Set by the skin editor's "Similar skins" button: the texture to find
 * look-alikes of when Discover's skin tab opens.
 */
export const similarSkinReference = ref<{ texture: string; variant: SkinModel } | null>(null)

/**
 * The category the reference was filed under: its own laby.net tags when it
 * has them, the palette's colours when it does not - the player's own skin
 * among them. Discover names it above the look-alikes.
 */
export const similarSkinCategory = ref<string[]>([])

// ---- Similarity ---------------------------------------------------------

const BINS = 4
type Histogram = Float32Array

interface Fingerprint {
        histogram: Histogram
        colours: string[]
        /** Mean colour of the head, torso, arms and legs, front on. */
        regions: number[]
}

/** Front faces of each part (x, y, w, h) on the 64×64 net, outer layer first. */
const REGIONS: [number, number, number, number][][] = [
        [
                [40, 8, 8, 8],
                [8, 8, 8, 8],
        ],
        [
                [20, 36, 8, 12],
                [20, 20, 8, 12],
        ],
        [
                [44, 36, 4, 12],
                [44, 20, 4, 12],
                [52, 52, 4, 12],
                [36, 52, 4, 12],
        ],
        [
                [4, 36, 4, 12],
                [4, 20, 4, 12],
                [4, 52, 4, 12],
                [20, 52, 4, 12],
        ],
]

function regionColours(pixels: Uint8ClampedArray): number[] {
        const out: number[] = []
        for (const rects of REGIONS) {
                let r = 0
                let g = 0
                let b = 0
                let n = 0
                for (const [rx, ry, rw, rh] of rects) {
                        for (let y = ry; y < ry + rh; y++) {
                                for (let x = rx; x < rx + rw; x++) {
                                        const i = (y * 64 + x) * 4
                                        if (pixels[i + 3] < 128) continue
                                        r += pixels[i]
                                        g += pixels[i + 1]
                                        b += pixels[i + 2]
                                        n += 1
                                }
                        }
                }
                out.push(n ? r / n : 0, n ? g / n : 0, n ? b / n : 0)
        }
        return out
}

/** How close two skins are part by part: 1 is the same colours everywhere. */
function regionLikeness(a: number[], b: number[]) {
        let total = 0
        for (let i = 0; i < a.length; i += 3) {
                const dr = a[i] - b[i]
                const dg = a[i + 1] - b[i + 1]
                const db = a[i + 2] - b[i + 2]
                total += Math.sqrt(dr * dr + dg * dg + db * db) / 441.7
        }
        return 1 - total / (a.length / 3)
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
        return { histogram, colours, regions: regionColours(pixels) }
}

function likeness(a: Histogram, b: Histogram) {
        let shared = 0
        for (let i = 0; i < a.length; i++) shared += Math.min(a[i], b[i])
        return shared
}

/**
 * How much two skins agree in words: the tags a skin carries ("marvel",
 * "suit", "rainbow", "boy") say what it is about - a thing a colour
 * comparison alone keeps missing. Separators vary ("iron-man", "iron_man"),
 * so everything is flattened before the match.
 */
function tagLikeness(referenceTags: string[] | undefined, candidateTags: string): number {
        const wanted = (referenceTags ?? [])
                .map((tag) => tag.toLowerCase().replace(/[_-]+/g, ' ').trim())
                .filter(Boolean)
        if (wanted.length === 0) return 0
        const owned = candidateTags.toLowerCase().replace(/[_-]+/g, ' ')
        const hits = wanted.filter((tag) => owned.includes(tag)).length
        return hits / wanted.length
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

        // A skin without laby.net tags - the player's own among them - is filed
        // under the category its palette points to, so the same tag search runs
        // for it as for any library skin.
        similarSkinCategory.value =
            reference.tags && reference.tags.length > 0 ? reference.tags.slice(0, 3) : own.colours
        const queries = [...similarSkinCategory.value, ...own.colours]
        const candidates = new Map<string, LabySkin>()
        const pages = await Promise.all(queries.map((query) => searchLabySkins(query).catch(() => [])))
        for (const page of pages) {
                for (const skin of page) {
                        if (skin.image_hash !== reference.hash && !isStockLabySkin(skin)) {
                                candidates.set(skin.image_hash, skin)
                        }
                }
        }

        const pool = [...candidates.values()].sort((a, b) => b.use_count - a.use_count).slice(0, 48)
        const withDeadline = (hash: string) =>
                Promise.race([
                        labySkinTexture(hash),
                        new Promise<Uint8Array>((_, reject) =>
                                setTimeout(() => reject(new Error('texture too slow')), 6000),
                        ),
                ])
        // Each candidate is judged three ways: by its whole palette, part by part
        // (hair, shirt, sleeves, trousers), and by its tags - two skins with the
        // same colours in the same places read as alike, the same colours
        // scattered do not, and skins wearing the same words ("suit", "rainbow",
        // "superhero") belong together even when their palettes drift apart.
        const scored = await inBatches(pool, 16, async (skin) => {
                const candidatePixels = await withDeadline(skin.image_hash)
                        .then((texture) => pixelsOf(texture))
                        .catch(() => null)
                if (!candidatePixels) return { skin, score: -1 }
                const other = fingerprint(candidatePixels)
                const score =
                        0.35 * likeness(own.histogram, other.histogram) +
                        0.45 * regionLikeness(own.regions, other.regions) +
                        0.2 * tagLikeness(reference.tags, skin.tags)
                // A pixel-for-pixel copy of the reference is not a look-alike.
                return { skin, score: score > 0.995 ? -2 : score }
        })

        // Skins whose texture would not come in time still take the row, at the
        // end: an approximate look-alike beats an empty shelf - on a lossy road
        // to laby.net this is what keeps "similar" from reading as "none".
        const good = scored
                .filter((entry) => entry.score >= 0)
                .sort((a, b) => b.score - a.score)
        const rest = scored
                .filter((entry) => entry.score === -1)
                .sort((a, b) => b.skin.use_count - a.skin.use_count)
        return [...good, ...rest].slice(0, limit).map((entry) => entry.skin)
}

// ---- Skins by nickname ------------------------------------------------------

/** A player's own skin, found by nickname: shown and installed like a library one. */
export interface NickSkin extends LabySkin {
        nick: string
        source: 'mojang' | 'ely'
        pageUrl: string
        /** The account's UUID when the source tells it; dashed, as the game shows it. */
        uuid?: string
}

function decodeTextures(value: string): { url: string; slim: boolean } | null {
        try {
                const data = JSON.parse(atob(value)) as {
                        textures?: { SKIN?: { url?: string; metadata?: { model?: string } } }
                }
                const skin = data.textures?.SKIN
                if (!skin?.url) return null
                return { url: skin.url.replace(/^http:/, 'https:'), slim: skin.metadata?.model === 'slim' }
        } catch {
                return null
        }
}

/** A bare Mojang uuid (no dashes) read the way the game prints it. */
function dashedUuid(raw: string): string {
        const clean = raw.replace(/-/g, '')
        if (clean.length !== 32) return raw
        return [clean.slice(0, 8), clean.slice(8, 12), clean.slice(12, 16), clean.slice(16, 20), clean.slice(20)].join('-')
}

async function mojangSkin(nick: string): Promise<{ name: string; url: string; slim: boolean; uuid?: string } | null> {
        const profile = await proxiedFetch(
                `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`,
                { signal: AbortSignal.timeout(10000) },
        )
        if (profile.status === 204 || profile.status === 404) return null
        if (!profile.ok) throw new Error(`Mojang: ${profile.status}`)
        const { id, name } = (await profile.json()) as { id: string; name: string }
        const session = await proxiedFetch(
                `https://sessionserver.mojang.com/session/minecraft/profile/${id}`,
                { signal: AbortSignal.timeout(10000) },
        )
        if (!session.ok) throw new Error(`Mojang: ${session.status}`)
        const data = (await session.json()) as { properties?: { name: string; value: string }[] }
        const textures = data.properties?.find((property) => property.name === 'textures')
        const skin = textures ? decodeTextures(textures.value) : null
        return skin ? { name, ...skin, uuid: dashedUuid(id) } : null
}

async function elySkin(nick: string): Promise<{ name: string; url: string; slim: boolean; uuid?: string } | null> {
        const response = await proxiedFetch(
                `https://skinsystem.ely.by/textures/${encodeURIComponent(nick)}`,
                { signal: AbortSignal.timeout(10000) },
        )
        if (!response.ok) return null
        const text = await response.text()
        if (!text.trim()) return null
        const data = JSON.parse(text) as {
                SKIN?: { url?: string; metadata?: { model?: string } }
                uuid?: string
                user?: { uuid?: string }
        }
        if (!data.SKIN?.url) return null
        return {
                name: nick,
                url: data.SKIN.url.replace(/^http:/, 'https:'),
                slim: data.SKIN.metadata?.model === 'slim',
                uuid: data.uuid ?? data.user?.uuid,
        }
}

/**
 * The skin a player wears, by nickname: the Mojang account first, then
 * Ely.by. The texture lands in the same cache the library uses, so the 3D
 * viewer, the card preview and "Install skin" work on it unchanged.
 */
export async function findSkinByNick(nickRaw: string): Promise<NickSkin | null> {
        const nick = nickRaw.trim()
        if (!/^[A-Za-z0-9_]{2,16}$/.test(nick)) return null
        let found: { name: string; url: string; slim: boolean } | null = null
        let source: NickSkin['source'] = 'mojang'
        try {
                found = await mojangSkin(nick)
        } catch {
                found = null
        }
        if (!found) {
                source = 'ely'
                found = await elySkin(nick).catch(() => null)
        }
        if (!found) return null
        const texture = new Uint8Array(await normalize_skin_texture(found.url))
        const hash = found.url.split('/').pop()?.replace(/\.png$/i, '') || `${source}-${nick.toLowerCase()}`
        textureCache.set(hash, Promise.resolve(texture))
        return {
                image_hash: hash,
                use_count: 0,
                tags: found.name,
                skin_variant: found.slim ? 'SLIM' : 'CLASSIC',
                nick: found.name,
                source,
                uuid: found.uuid,
                pageUrl:
                        source === 'mojang'
                                ? `https://namemc.com/profile/${encodeURIComponent(found.name)}`
                                : `https://ely.by/skins?uploader=${encodeURIComponent(found.name)}`,
        }
}
