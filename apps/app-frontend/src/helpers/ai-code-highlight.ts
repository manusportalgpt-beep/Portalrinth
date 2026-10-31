/**
 * Цветной код в карточках чата Порталуса: лёгкий токенайзер без зависимостей,
 * по строке за раз. Никакого HTML - только пары «текст + имя класса», так что
 * код модели не может ни внедрить разметку, ни сломать вёрстку.
 *
 * Поддержка практичная, а не академическая: python, js/ts, json, java,
 * glsl (шейдеры!), css, html/xml, lua, yaml/toml, bash, c/c++, c#, rust,
 * sql, php и properties. Неизвестный язык рисуется как есть.
 */

export interface CodeToken {
	t: string
	c: string
}

interface TokRule {
	re: RegExp
	c: string
}

const KW = {
	py: /\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|self|match|case)\b/y,
	js: /\b(?:abstract|any|as|async|await|boolean|break|case|catch|class|const|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|number|of|private|protected|public|readonly|return|satisfies|set|static|string|super|switch|this|throw|true|try|type|typeof|undefined|union|unknown|var|void|while|with|yield)\b/y,
	java: /\b(?:abstract|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|var|record|yield|sealed)\b/y,
	glsl: /\b(?:attribute|const|uniform|varying|break|continue|do|for|while|if|else|in|out|inout|float|int|void|bool|true|false|lowp|mediump|highp|precision|invariant|discard|return|sampler2D|samplerCube|sampler3D|vec2|vec3|vec4|ivec2|ivec3|ivec4|bvec2|bvec3|bvec4|mat2|mat3|mat4|struct|layout|flat|smooth|noperspective|centroid|texture2D|texture|gl_FragColor|gl_FragData|gl_Position|gl_VertexID|gl_FragCoord|gl_Vertex|gl_Normal|gl_MultiTexCoord0|worldTime|gameTime)\b/y,
	sql: /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DATABASE|INDEX|VIEW|DROP|ALTER|ADD|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|NULL|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|UNIQUE)\b/y,
	lua: /\b(?:and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while|self)\b/y,
	bash: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|select|until|time|coproc|return|exit|local|export|readonly|declare|unset|shift|source|alias|echo|cd|pwd|true|false)\b/y,
	rust: /\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/y,
	cs: /\b(?:abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while|var|async|await)\b/y,
	css: /(?:@media|@import|@keyframes|@supports|@font-face|@charset|!important)\b/y,
}

const RULES: Record<string, TokRule[]> = {
	python: [
		{ re: /#.*$/y, c: 'tok-com' },
		{ re: /(?:[rRbBfu]{0,2})("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/y, c: 'tok-str' },
		{ re: /(?:[rRbBfu]{0,2})("""[\s\S]*$|'''[\s\S]*$)/y, c: 'tok-str' },
		{ re: /\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?)[jJ]?\b/y, c: 'tok-num' },
		{ re: KW.py, c: 'tok-kw' },
		{ re: /\b[a-zA-Z_]\w*(?=\s*\()/y, c: 'tok-fn' },
		{ re: /@[a-zA-Z_][\w.]*/y, c: 'tok-typ' },
	],
	javascript: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /`(?:\\.|[^`\\])*`/y, c: 'tok-str' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?)\b/y, c: 'tok-num' },
		{ re: KW.js, c: 'tok-kw' },
		{ re: /\b[a-zA-Z_$][\w$]*(?=\s*\()/y, c: 'tok-fn' },
	],
	json: [
		{ re: /"(?:\\.|[^"\\])*"(?=\s*:)/y, c: 'tok-prop' },
		{ re: /"(?:\\.|[^"\\])*"/y, c: 'tok-str' },
		{ re: /\b(?:true|false|null)\b/y, c: 'tok-kw' },
		{ re: /-?\b\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?\b/y, c: 'tok-num' },
	],
	java: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[fFdDlL])?)\b/y, c: 'tok-num' },
		{ re: /@\w+/y, c: 'tok-typ' },
		{ re: KW.java, c: 'tok-kw' },
		{ re: /\b[A-Z][\w$]*\b/y, c: 'tok-typ' },
		{ re: /\b[a-z_$][\w$]*(?=\s*\()/y, c: 'tok-fn' },
	],
	glsl: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"/y, c: 'tok-str' },
		{ re: /\b\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?[fF]?\b/y, c: 'tok-num' },
		{ re: KW.glsl, c: 'tok-kw' },
		{ re: /\b[a-zA-Z_]\w*(?=\s*\()/y, c: 'tok-fn' },
	],
	css: [
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: KW.css, c: 'tok-kw' },
		{ re: /#[0-9a-fA-F]{3,8}\b/y, c: 'tok-num' },
		{ re: /[.#][a-zA-Z_][\w-]*/y, c: 'tok-typ' },
		{ re: /--[\w-]+/y, c: 'tok-prop' },
		{ re: /\b[a-z-]+(?=\s*:)/y, c: 'tok-prop' },
	],
	html: [
		{ re: /<!--[\s\S]*?(?:-->|$)/y, c: 'tok-com' },
		{ re: /<\/?[a-zA-Z][\w-]*/y, c: 'tok-tag' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /[a-zA-Z-]+(?==)/y, c: 'tok-attr' },
		{ re: /\/?>|=/y, c: 'tok-tag' },
	],
	lua: [
		{ re: /--\[\[[\s\S]*?(?:\]\]|$)/y, c: 'tok-com' },
		{ re: /--.*$/y, c: 'tok-com' },
		{ re: /\[\[[\s\S]*?(?:\]\]|$)\]?/y, c: 'tok-str' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\b\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?\b/y, c: 'tok-num' },
		{ re: KW.lua, c: 'tok-kw' },
		{ re: /\b[a-zA-Z_]\w*(?=\s*\()/y, c: 'tok-fn' },
	],
	yaml: [
		{ re: /#.*$/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\b(?:true|false|null|yes|no|on|off)\b/y, c: 'tok-kw' },
		{ re: /-?\b\d[\d_]*(?:\.\d*)?\b/y, c: 'tok-num' },
		{ re: /^[\t ]*-?[\t ]*[\w.$-]+(?=:)/y, c: 'tok-prop' },
	],
	bash: [
		{ re: /#.*$/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\$\{?[\w@#?!-]*\}?/y, c: 'tok-prop' },
		{ re: /\b\d+\b/y, c: 'tok-num' },
		{ re: KW.bash, c: 'tok-kw' },
	],
	cpp: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /#\s*\w+/y, c: 'tok-kw' },
		{ re: /\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?[uUlLfF]*)\b/y, c: 'tok-num' },
		{ re: /\b(?:alignas|alignof|auto|bool|break|case|catch|char|class|const|constexpr|continue|decltype|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|private|protected|public|register|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|override|final)\b/y, c: 'tok-kw' },
		{ re: /\b[A-Z][\w]*\b/y, c: 'tok-typ' },
		{ re: /\b[a-z_][\w]*(?=\s*\()/y, c: 'tok-fn' },
	],
	rust: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /r?#*"(?:\\.|[^"\\])*"|#*/y, c: 'tok-str' },
		{ re: /\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?(?:[iuf](?:8|16|32|64|size))?)\b/y, c: 'tok-num' },
		{ re: KW.rust, c: 'tok-kw' },
		{ re: /\b[A-Z][\w]*\b/y, c: 'tok-typ' },
		{ re: /\b[a-z_][\w]*(?=\s*[(!])/y, c: 'tok-fn' },
	],
	sql: [
		{ re: /--.*$/y, c: 'tok-com' },
		{ re: /'(?:''|[^'])*'/y, c: 'tok-str' },
		{ re: /\b\d[\d_]*(?:\.\d*)?\b/y, c: 'tok-num' },
		{ re: KW.sql, c: 'tok-kw' },
	],
	csharp: [
		{ re: /\/\/.*$/y, c: 'tok-com' },
		{ re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'tok-com' },
		{ re: /\$?"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, c: 'tok-str' },
		{ re: /\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?[fFdDmMuUlL]?)\b/y, c: 'tok-num' },
		{ re: KW.cs, c: 'tok-kw' },
		{ re: /\b[A-Z][\w]*\b/y, c: 'tok-typ' },
		{ re: /\b[a-z_][\w]*(?=\s*\()/y, c: 'tok-fn' },
	],
	properties: [
		{ re: /[#!].*$/y, c: 'tok-com' },
		{ re: /^[^=:]+(?=[=:])/y, c: 'tok-prop' },
		{ re: /\$\{[^}]*\}/y, c: 'tok-prop' },
	],
}

const ALIASES: Record<string, string> = {
	py: 'python',
	python3: 'python',
	js: 'javascript',
	jsx: 'javascript',
	ts: 'javascript',
	tsx: 'javascript',
	typescript: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	java: 'java',
	json: 'json',
	jsonc: 'json',
	mcmeta: 'json',
	glsl: 'glsl',
	vsh: 'glsl',
	fsh: 'glsl',
	vert: 'glsl',
	frag: 'glsl',
	shader: 'glsl',
	glsles: 'glsl',
	css: 'css',
	scss: 'css',
	less: 'css',
	html: 'html',
	xml: 'html',
	svg: 'html',
	vue: 'html',
	htm: 'html',
	lua: 'lua',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'yaml',
	bash: 'bash',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	powershell: 'bash',
	ps1: 'bash',
	c: 'cpp',
	h: 'cpp',
	cpp: 'cpp',
	hpp: 'cpp',
	cxx: 'cpp',
	cc: 'cpp',
	rust: 'rust',
	rs: 'rust',
	sql: 'sql',
	cs: 'csharp',
	csharp: 'csharp',
	properties: 'properties',
	ini: 'properties',
	cfg: 'properties',
	conf: 'properties',
}

/** Rules for a language tag, resolved through the aliases; null when unknown. */
function rulesFor(lang: string): TokRule[] | null {
	const name = ALIASES[lang.trim().toLowerCase()] ?? ''
	return name ? (RULES[name] ?? null) : null
}

/** Splits one line into coloured tokens; plain text keeps an empty class. */
export function highlightLine(line: string, lang: string): CodeToken[] {
	const rules = rulesFor(lang)
	if (!rules || !line) return line ? [{ t: line, c: '' }] : []
	const out: CodeToken[] = []
	let plain = ''
	let at = 0
	while (at < line.length) {
		let matched = false
		for (const rule of rules) {
			rule.re.lastIndex = at
			const hit = rule.re.exec(line)
			if (hit && hit[0].length > 0) {
				if (plain) {
					out.push({ t: plain, c: '' })
					plain = ''
				}
				out.push({ t: hit[0], c: rule.c })
				at += hit[0].length
				matched = true
				break
			}
		}
		if (!matched) {
			plain += line[at]
			at += 1
		}
	}
	if (plain) out.push({ t: plain, c: '' })
	return out
}
