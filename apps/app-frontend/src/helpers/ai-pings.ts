/**
 * Пинги - способ ткнуть Порталуса в конкретный объект: фрагмент кода из
 * карточки, мод, скин, сборку. Пинг висит чипом над строкой ввода и уходит
 * вместе с следующим сообщением, поэтому агент видит не «переработай код»,
 * а «переработай ВОТ ЭТОТ код». Пинги одноразовые: отправились - и стёрлись.
 */
import { ref } from 'vue'

export interface AiPing {
	id: string
	/** Код из карточки или проект (мод/скин/сборка/...) из упоминания. */
	kind: 'code' | 'project'
	title: string
	/** Подпись чипа: язык кода, тип проекта. */
	subtitle?: string
	lang?: string
	code?: string
	meta?: { ptype: string; id: string; title: string }
}

export const aiPings = ref<AiPing[]>([])

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const CODE_PING_LIMIT = 6000

/** Добавляет пинг; повтор того же объекта не плодит дубликаты. */
export function addAiPing(ping: Omit<AiPing, 'id'>): void {
	const code = ping.code ? ping.code.slice(0, CODE_PING_LIMIT) : undefined
	const duplicate = aiPings.value.some(
		(kept) =>
			kept.kind === ping.kind &&
			kept.title === ping.title &&
			(kept.kind !== 'code' || kept.code === code),
	)
	if (duplicate) return
	aiPings.value = [...aiPings.value, { ...ping, code, id: newId() }]
}

export function removeAiPing(id: string): void {
	aiPings.value = aiPings.value.filter((ping) => ping.id !== id)
}

export function clearAiPings(): void {
	aiPings.value = []
}

const TYPE_LABELS: Record<string, string> = {
	mod: 'мод',
	modpack: 'сборка',
	shader: 'шейдер',
	resourcepack: 'ресурс-пак',
	datapack: 'датапак',
	skin: 'скин',
	server: 'сервер',
	plugin: 'плагин',
}

/**
 * Текст, который приписывается к сообщению игрока: агент обязан работать
 * именно с запинганными объектами. Пустая строка - когда пингов нет.
 */
export function serializeAiPings(): string {
	const pings = aiPings.value
	if (!pings.length) return ''
	const lines: string[] = []
	for (const ping of pings) {
		if (ping.kind === 'code' && ping.code !== undefined) {
			lines.push(
				`Код «${ping.title}»${ping.lang ? ` (${ping.lang})` : ''} - именно его игрок просит показать/переработать:\n\`\`\`${ping.lang || ''}\n${ping.code}\n\`\`\``,
			)
		} else if (ping.meta) {
			const label = TYPE_LABELS[ping.meta.ptype] ?? ping.meta.ptype
			lines.push(`Объект «${ping.meta.title}» (${label}, id: ${ping.meta.id}) - работай именно с ним.`)
		} else {
			lines.push(`Объект «${ping.title}»${ping.subtitle ? ` (${ping.subtitle})` : ''} - работай именно с ним.`)
		}
	}
	return `--- Пинги игрока (обращайся в первую очередь к ним) ---\n${lines.join('\n')}\n--- конец пингов ---\n\n`
}
