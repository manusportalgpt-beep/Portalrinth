import { reactive } from 'vue'

const tagIconUrls = reactive(new Map<string, string>())

/** Pictures a tag brings from its own platform, drawn instead of the built-in icon. */
export function registerTagIconUrls(icons: Iterable<[string, string | null | undefined]>) {
	for (const [tag, url] of icons) {
		if (url && tagIconUrls.get(tag) !== url) tagIconUrls.set(tag, url)
	}
}

export function getTagIconUrl(tag: string): string | undefined {
	return tagIconUrls.get(tag)
}
