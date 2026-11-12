import { defineMessages, useVIntl } from '@modrinth/ui'

const notes = defineMessages({
	zai: {
		id: 'app.ai.catalog.note.zai',
		defaultMessage:
			'Бесплатные GLM-модели, работают из России. У 4.5 Flash размышления отключены, 4.7 Flash думает всегда, но умнее; 4.6V Flash смотрит картинки (включается сама, когда ты прикрепил изображение). Ключ — бесплатно на z.ai/model-api.',
	},
	genapi: {
		id: 'app.ai.catalog.note.genapi',
		defaultMessage:
			'РФ-агрегатор в формате OpenAI: новый аккаунт получает бесплатные пробные генерации («Попробовать бесплатно»), дальше копейки за запрос. В списке — только бюджетные текстовые модели.',
	},
	kilo: {
		id: 'app.ai.catalog.note.kilo',
		defaultMessage:
			'Ключ не нужен — бесплатные модели работают сразу. Хороший запасной мозг, если у GLM час пик.',
	},
	ovh: {
		id: 'app.ai.catalog.note.ovh',
		defaultMessage:
			'Без ключа — анонимно, но с лимитом запросов в минуту; бесплатный токен OVH снимает лимит (необязательно).',
	},
	nvidia: {
		id: 'app.ai.catalog.note.nvidia',
		defaultMessage:
			'DeepSeek, Kimi, GLM 5 и MiniMax бесплатно по ключу NVIDIA (build.nvidia.com). Регистрация из России может попросить VPN — сами запросы обычно проходят.',
	},
	pollinations: {
		id: 'app.ai.catalog.note.pollinations',
		defaultMessage:
			'Ключ не нужен — работает сразу. Анонимный лимит: 1 ответ в 30 секунд на IP, так что это запасной вариант, а не основной.',
	},
	llm7: {
		id: 'app.ai.catalog.note.llm7',
		defaultMessage:
			'Ключ не нужен — бесплатный тариф «turbo» отвечает сразу (если сервис попросит токен, слово unused проходит как ключ). Запасной мозг без регистрации.',
	},
	openrouter: {
		id: 'app.ai.catalog.note.openrouter',
		defaultMessage:
			'Бесплатные модели под одним ключом — состав меняется, актуальные всегда с суффиксом :free. Обычно доступен из России.',
	},
	custom: {
		id: 'app.ai.catalog.note.custom',
		defaultMessage:
			'Локальные модели (LM Studio, Ollama) — бесплатно, всё считается на твоём компьютере.',
	},
	imagePollinations: {
		id: 'app.ai.catalog.note.image-pollinations',
		defaultMessage: 'Бесплатно и без ключа.',
	},
	imageZai: {
		id: 'app.ai.catalog.note.image-zai',
		defaultMessage: 'CogView-3-Flash — бесплатный; подходит тот же ключ Z.AI, что и для чата.',
	},
})

const tags = defineMessages({
	fastest: { id: 'app.ai.catalog.tag.fastest', defaultMessage: 'самая быстрая' },
	smarter: { id: 'app.ai.catalog.tag.smarter', defaultMessage: 'умнее' },
	vision: { id: 'app.ai.catalog.tag.vision', defaultMessage: 'видит картинки' },
	cheapest: { id: 'app.ai.catalog.tag.cheapest', defaultMessage: 'самая дешёвая' },
	bestFree: { id: 'app.ai.catalog.tag.best-free', defaultMessage: 'лучшая бесплатная' },
	smart: { id: 'app.ai.catalog.tag.smart', defaultMessage: 'умная' },
	fast: { id: 'app.ai.catalog.tag.fast', defaultMessage: 'быстрая' },
	code: { id: 'app.ai.catalog.tag.code', defaultMessage: 'код' },
	context: { id: 'app.ai.catalog.tag.context', defaultMessage: 'контекст {size}' },
	noKey: { id: 'app.ai.catalog.tag.no-key', defaultMessage: 'без ключа' },
})

const names = defineMessages({
	auto: { id: 'app.ai.catalog.name.auto', defaultMessage: 'Авто' },
	gptFast: { id: 'app.ai.catalog.name.gpt-fast', defaultMessage: 'GPT быстрый' },
	custom: { id: 'app.ai.catalog.name.custom', defaultMessage: 'Свой сервер' },
	customModel: { id: 'app.ai.catalog.name.custom-model', defaultMessage: 'Своя модель' },
})

const NOTE_KEYS: Record<string, keyof typeof notes> = {
	zai: 'zai',
	genapi: 'genapi',
	kilo: 'kilo',
	ovh: 'ovh',
	nvidia: 'nvidia',
	pollinations: 'pollinations',
	llm7: 'llm7',
	openrouter: 'openrouter',
	custom: 'custom',
}

const IMAGE_NOTE_KEYS: Record<string, keyof typeof notes> = {
	pollinations: 'imagePollinations',
	zai: 'imageZai',
}

const TAG_KEYS: Record<string, keyof typeof tags> = {
	'самая быстрая': 'fastest',
	умнее: 'smarter',
	'видит картинки': 'vision',
	'самая дешёвая': 'cheapest',
	'лучшая бесплатная': 'bestFree',
	умная: 'smart',
	быстрая: 'fast',
	код: 'code',
	'без ключа': 'noKey',
}

const NAME_KEYS: Record<string, keyof typeof names> = {
	Авто: 'auto',
	'GPT быстрый': 'gptFast',
	'Свой сервер': 'custom',
	'Своя модель': 'customModel',
}

/** The catalogue's Russian words (notes, model hints) in the player's language. */
export function useAiCatalogText() {
	const { formatMessage } = useVIntl()

	function label(text: string): string {
		const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(text)
		const base = match ? match[1] : text
		const name = NAME_KEYS[base] ? formatMessage(names[NAME_KEYS[base]]) : base
		if (!match) return name
		const parts = match[2].split(/,\s*/).map((part) => {
			const context = /^контекст\s+(.+)$/.exec(part)
			if (context) return formatMessage(tags.context, { size: context[1] })
			return TAG_KEYS[part] ? formatMessage(tags[TAG_KEYS[part]]) : part
		})
		return `${name} (${parts.join(', ')})`
	}

	function note(provider: { id: string; note?: string }): string {
		const key = NOTE_KEYS[provider.id]
		return key ? formatMessage(notes[key]) : (provider.note ?? '')
	}

	function imageNote(provider: { id: string; note?: string }): string {
		const key = IMAGE_NOTE_KEYS[provider.id]
		return key ? formatMessage(notes[key]) : (provider.note ?? '')
	}

	return { label, note, imageNote }
}
