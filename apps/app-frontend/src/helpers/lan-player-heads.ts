/**
 * Faces for the players a running world reports.
 *
 * A name is all a world gives up about who is in it, so a face is worked
 * out rather than looked up in one place. An account signed into this
 * launcher is whoever it signed in as, and its face comes from its own
 * provider. Everyone else is asked at both places a name can live -
 * Mojang and Ely.by - with the platform the world's host plays on first,
 * since a world's players usually came from the same place as the person
 * who opened it. Whoever turns up nowhere keeps the classic Steve, which
 * is what an offline player answers with anyway.
 */
import { ref } from 'vue'

import { users } from './auth'
import { type ElyCredentials, ely_get_users } from './ely_auth'
import { getElyHeadUrl } from './ely_skins'
import { mojang_player_skin, type OfflineCredentials, offline_users } from './offline_auth'
import { generatePlayerHeadBlob } from './rendering/player-head'

/** The classic face, for players nothing is known about. */
export const STEVE_HEAD_URL = 'https://launcher-files.modrinth.com/assets/steve_head.png'

type Provider = 'microsoft' | 'ely_by' | 'offline'

interface KnownAccount {
	name: string
	provider: Provider
	id?: string
}

let accountsPromise: Promise<KnownAccount[]> | null = null

/** Every account signed into this launcher, as names and their providers. */
function knownAccounts(): Promise<KnownAccount[]> {
	if (!accountsPromise) {
		const microsoft = users().catch(() => [])
		const ely = ely_get_users().catch(() => [] as ElyCredentials[])
		const offline = offline_users().catch(() => [] as OfflineCredentials[])
		accountsPromise = Promise.all([microsoft, ely, offline]).then(
			([microsoft, ely, offline]) => [
				...microsoft.map((account) => ({
					name: account.profile.name,
					provider: 'microsoft' as const,
					id: account.profile.id,
				})),
				...ely.map((account) => ({ name: account.profile.name, provider: 'ely_by' as const })),
				...offline.map((account) => ({ name: account.profile.name, provider: 'offline' as const })),
			],
		)
	}
	return accountsPromise
}

/** The faces resolved so far, by name. */
const heads = ref<Record<string, string>>({})
const inFlight = new Set<string>()

/**
 * The face to show for a player: the one worked out for their name, or
 * the classic Steve while it is being worked out.
 */
export function playerHead(player: string): string {
	return heads.value[player] ?? STEVE_HEAD_URL
}

/** Works out whose face `player` is, once per name. */
export function resolvePlayerHead(player: string, hostName: string | null): void {
	if (heads.value[player] || inFlight.has(player)) return
	inFlight.add(player)
	void resolve(player, hostName)
		.catch(() => {})
		.finally(() => inFlight.delete(player))
}

async function resolve(player: string, hostName: string | null): Promise<void> {
	const accounts = await knownAccounts()
	const own = accounts.find((account) => account.name === player)
	if (own) {
		// An account of one's own is known to its provider; no asking around.
		if (own.provider === 'offline') {
			heads.value = { ...heads.value, [player]: STEVE_HEAD_URL }
			return
		}
		const face =
			own.provider === 'ely_by' ? await elyHead(player) : await licensedHead(own.id ?? '')
		heads.value = { ...heads.value, [player]: face ?? STEVE_HEAD_URL }
		return
	}

	// Everyone else is asked where names live, the host's own platform first.
	const host = accounts.find((account) => account.name === hostName)
	const order: Provider[] =
		host?.provider === 'ely_by' ? ['ely_by', 'microsoft'] : ['microsoft', 'ely_by']
	for (const provider of order) {
		const face = provider === 'ely_by' ? await elyHead(player) : await mojangHead(player)
		if (face) {
			heads.value = { ...heads.value, [player]: face }
			return
		}
	}
	heads.value = { ...heads.value, [player]: STEVE_HEAD_URL }
}

/**
 * The face Ely.by gives a name, cut out of the skin the account wears.
 * Null when Ely.by does not know the name or it wears no skin of its own.
 */
async function elyHead(player: string): Promise<string | null> {
	try {
		return await getElyHeadUrl(player)
	} catch {
		return null
	}
}

/** The face a licensed account wears, cut from the skin Mojang has for it. */
async function licensedHead(id: string): Promise<string | null> {
	try {
		const texture = await mojang_player_skin(id)
		if (!texture) return null
		return URL.createObjectURL(await generatePlayerHeadBlob(texture, 64))
	} catch {
		return null
	}
}

/**
 * The face the head services draw for a name of their own. An image is
 * asked for first, so a name nobody knows - which the services answer
 * with a refusal or the classic Steve for - can fall through to the next
 * place to ask.
 */
async function mojangHead(player: string): Promise<string | null> {
	const url = `https://mc-heads.net/avatar/${encodeURIComponent(player)}/64`
	const known = await new Promise<boolean>((resolve) => {
		const probe = new Image()
		probe.onload = () => resolve(true)
		probe.onerror = () => resolve(false)
		probe.src = url
	})
	return known ? url : null
}
