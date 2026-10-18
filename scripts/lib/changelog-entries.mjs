// Reading changelog entries out of a `changelog.ts` source.
//
// Both Portalrinth's changelog and upstream's are a TypeScript array of objects
// with a template-literal `body`, and two different things want to read them:
// the Pages site that lists every entry, and the release workflow that puts one
// of them in a GitHub release. They read it the same way, from here, so that a
// change to the shape of the file cannot fix one and leave the other quietly
// finding nothing.

import { readFileSync } from 'node:fs'

/** Where Portalrinth's own entries live. */
export const PORTALRINTH_CHANGELOG_SRC = 'apps/app-frontend/src/helpers/portalrinth-changelog.ts'

/**
 * Pulls every `{ ... body: `...` ... }` object out of a changelog source and
 * reads the fields with a regex per field.
 */
export function parseEntries(src) {
	const entries = []
	const entryRe = /\{((?:[^{}]|\{[^{}]*\})*?body:\s*`((?:\\`|[^`])*)`[^}]*)\}/g
	let m
	while ((m = entryRe.exec(src)) !== null) {
		const block = m[1]
		const body = m[2].replace(/\\`/g, '`').replace(/\\\$\{/g, '${')
		const version = block.match(/version:\s*['"`]([^'"`]+)['"`]/)?.[1]
		const date = block.match(/date:\s*['"`]([^'"`]+)['"`]/)?.[1]
		const product = block.match(/product:\s*['"`]([^'"`]+)['"`]/)?.[1]
		entries.push({ version, date, body, product })
	}
	return entries
}

/** The same, straight from a file. */
export function readEntries(path) {
	return parseEntries(readFileSync(path, 'utf-8'))
}

/** The Portalrinth entry for a version, or undefined if it has none yet. */
export function findPortalrinthEntry(version, path = PORTALRINTH_CHANGELOG_SRC) {
	return readEntries(path).find((entry) => entry.version === version)
}
