/**
 * The vocabulary custom HTML can use to read the site's records. A custom
 * row (or a Columns HTML slot) is a person's or an agent's own markup, and
 * until now it was dead: the phone, the hours and the services list had to
 * be typed in. These few forms make it live without turning a text field
 * into a programming language:
 *
 *   {{ business.phone }}                      a value, HTML-escaped
 *   {{{ page.copy_html }}}                    a value already rendered as HTML (sanitised afterwards like the rest)
 *   {{#each services}} … {{this.title}} … {{/each}}     a loop; `{{#each services as s}}` names the item; `{{else}}` for an empty list
 *   {{#if page.summary}} … {{else}} … {{/if}}   also {{#if a == "x"}}, {{#if a != "x"}}, {{#if n == 1}}, {{#if s.category_title == c.title}}  a condition; `{{#unless x}}`; `{{#if page.collection == "services"}}`
 *   {{> menu "primary"}}                      a drop-in the renderer fills (menu, logo, phone, address, hours, social, year, button, form)
 *
 * Inside a loop `this` is the item, `@index`, `@first` and `@last` say where
 * it is, and the outer names stay in reach. A path that resolves to nothing
 * prints nothing. Drop-ins become placeholder tokens here; the caller fills
 * them after sanitising, so what they print is the platform's own markup.
 */

export type Scope = Record<string, unknown>;

/** A drop-in call found in the text: its name and its positional and named arguments. */
export interface Include { name: string; args: string[]; named: Record<string, string> }

export const INCLUDE_OPEN = "⸨ts:";
export const INCLUDE_CLOSE = "⸩";

type Node =
	| { kind: "text"; text: string }
	| { kind: "var"; path: string; raw: boolean }
	| { kind: "each"; path: string; alias: string | null; limit: number | null; body: Node[]; otherwise: Node[] }
	| { kind: "if"; test: Test; negate: boolean; body: Node[]; otherwise: Node[] }
	| { kind: "include"; include: Include };

type Test = { path: string; op?: "==" | "!="; value?: string; /** A path on the right of == or != instead of a literal. */ other?: string };

const TAG = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;

export class TemplateError extends Error {}

/** The parsed tree; throws TemplateError with a plain message on an unclosed or mismatched block. */
export function parse(text: string): Node[] {
	const tokens: Array<{ kind: "text"; text: string } | { kind: "tag"; body: string; raw: boolean }> = [];
	let last = 0;
	for (const m of text.matchAll(TAG)) {
		if (m.index! > last) tokens.push({ kind: "text", text: text.slice(last, m.index) });
		tokens.push({ kind: "tag", body: (m[1] ?? m[2] ?? "").trim(), raw: m[1] !== undefined });
		last = m.index! + m[0].length;
	}
	if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });

	let i = 0;
	const block = (until: string[] | null): { nodes: Node[]; closer: string | null } => {
		const nodes: Node[] = [];
		while (i < tokens.length) {
			const t = tokens[i++]!;
			if (t.kind === "text") { nodes.push({ kind: "text", text: t.text }); continue; }
			const b = t.body;
			if (until && until.includes(b)) return { nodes, closer: b };
			if (b.startsWith("#each ")) {
				const m = /^#each\s+([^\s]+)(?:\s+as\s+([A-Za-z_][\w]*))?(?:\s+limit=(\d+))?\s*$/.exec(b);
				if (!m) throw new TemplateError(`Cannot read "{{${b}}}": write {{#each services}} or {{#each services as s}}`);
				const body = block(["else", "/each"]);
				const otherwise = body.closer === "else" ? block(["/each"]) : { nodes: [] as Node[], closer: "/each" };
				if (body.closer === null || otherwise.closer === null) throw new TemplateError(`{{#each ${m[1]}}} has no {{/each}}`);
				nodes.push({ kind: "each", path: m[1]!, alias: m[2] ?? null, limit: m[3] ? Number(m[3]) : null, body: body.nodes, otherwise: otherwise.nodes });
				continue;
			}
			if (b.startsWith("#if ") || b.startsWith("#unless ")) {
				const negate = b.startsWith("#unless ");
				const expr = b.slice(negate ? 8 : 4).trim();
				// {{#if a}}, {{#if a == "literal"}}, {{#if a != "literal"}}, or a path on the right: {{#if s.category_title == c.title}}
				const m = /^([^\s=!]+)(?:\s*(==|!=)\s*(?:"([^"]*)"|([^\s"=!]+)))?\s*$/.exec(expr);
				if (!m) throw new TemplateError(`Cannot read "{{${b}}}": write {{#if page.summary}}, {{#if page.collection == "services"}} or {{#if s.category_title == c.title}}`);
				const body = block(["else", negate ? "/unless" : "/if"]);
				const otherwise = body.closer === "else" ? block([negate ? "/unless" : "/if"]) : { nodes: [] as Node[], closer: "/if" };
				if (body.closer === null || otherwise.closer === null) throw new TemplateError(`{{#if ${m[1]}}} has no {{/if}}`);
				// A bare number, true, false or null on the right is a literal ({{#if f.sort == 1}}), anything else a path ({{#if s.category_title == c.title}}).
				const bare = m[4];
				const literal = bare !== undefined && /^(-?\d+(\.\d+)?|true|false|null)$/.test(bare);
				nodes.push({ kind: "if", test: { path: m[1]!, ...(m[2] ? { op: m[2] as "==" | "!=", ...(bare !== undefined && !literal ? { other: bare } : { value: literal ? (bare === "false" || bare === "null" ? "" : bare) : m[3] ?? "" }) } : {}) }, negate, body: body.nodes, otherwise: otherwise.nodes });
				continue;
			}
			if (b.startsWith(">")) {
				nodes.push({ kind: "include", include: parseInclude(b.slice(1).trim()) });
				continue;
			}
			if (b.startsWith("/") || b === "else") throw new TemplateError(`Unexpected {{${b}}}`);
			if (b.startsWith("!")) continue; // a comment: {{! like this }}
			if (!/^[@A-Za-z_][\w.@-]*$/.test(b)) throw new TemplateError(`Cannot read "{{${b}}}": a value is a path like business.phone`);
			nodes.push({ kind: "var", path: b, raw: t.raw });
		}
		if (until) return { nodes, closer: null };
		return { nodes, closer: null };
	};
	const out = block(null);
	return out.nodes;
}

function parseInclude(src: string): Include {
	const m = /^([A-Za-z_][\w-]*)\s*([\s\S]*)$/.exec(src);
	if (!m) throw new TemplateError(`Cannot read "{{> ${src}}}": write {{> menu "primary"}}`);
	const args: string[] = [];
	const named: Record<string, string> = {};
	for (const a of m[2]!.matchAll(/([A-Za-z_][\w-]*)=("([^"]*)"|[^\s"]+)|"([^"]*)"|([^\s"]+)/g)) {
		if (a[1]) named[a[1]] = a[3] ?? a[2] ?? "";
		else args.push(a[4] ?? a[5] ?? "");
	}
	return { name: m[1]!, args, named };
}

/** The root names the text reads (business, page, services, …) and the drop-ins it calls, so the caller loads only those. */
export function referenced(text: string): { roots: Set<string>; includes: Include[] } {
	const roots = new Set<string>();
	const includes: Include[] = [];
	const walk = (nodes: Node[], locals: Set<string>) => {
		for (const n of nodes) {
			if (n.kind === "var") root(n.path, locals, roots);
			else if (n.kind === "each") { root(n.path, locals, roots); const inner = new Set(locals); if (n.alias) inner.add(n.alias); inner.add("this"); walk(n.body, inner); walk(n.otherwise, locals); }
			else if (n.kind === "if") { root(n.test.path, locals, roots); if (n.test.other) root(n.test.other, locals, roots); walk(n.body, locals); walk(n.otherwise, locals); }
			else if (n.kind === "include") includes.push(n.include);
		}
	};
	try { walk(parse(text), new Set()); } catch { /* a broken template reads nothing; render() reports it */ }
	return { roots, includes };
}
function root(path: string, locals: Set<string>, out: Set<string>) {
	const head = path.split(".")[0]!;
	if (head.startsWith("@") || locals.has(head)) return;
	out.add(head);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function lookup(path: string, scopes: Scope[]): unknown {
	const parts = path.split(".");
	const head = parts[0]!;
	let value: unknown;
	let found = false;
	for (let i = scopes.length - 1; i >= 0; i--) {
		const s = scopes[i]!;
		if (head in s) { value = s[head]; found = true; break; }
	}
	if (!found) return undefined;
	for (const p of parts.slice(1)) {
		if (value === null || value === undefined) return undefined;
		if (Array.isArray(value) && p === "length") { value = value.length; continue; }
		if (typeof value !== "object") return undefined;
		value = (value as Record<string, unknown>)[p];
	}
	return value;
}

const truthy = (v: unknown): boolean => {
	if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
	if (Array.isArray(v)) return v.length > 0;
	if (typeof v === "string") return v.trim() !== "";
	return true;
};

function print(v: unknown): string {
	if (v === null || v === undefined || v === false) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (Array.isArray(v)) return String(v.length);
	if (typeof v === "object") {
		const o = v as Record<string, unknown>;
		// An image prints as its address, a record as its title, so a half-finished path still says something useful.
		for (const k of ["url", "title", "label", "name"]) if (typeof o[k] === "string") return o[k] as string;
	}
	return "";
}

/** A placeholder for a drop-in, inert through the sanitizer; the caller fills it afterwards. */
export function includeToken(inc: Include): string {
	return `${INCLUDE_OPEN}${encodeURIComponent(JSON.stringify(inc))}${INCLUDE_CLOSE}`;
}
/** The tokens in rendered text, in order, with the text between them. */
export function splitIncludes(html: string): Array<{ html: string } | { include: Include }> {
	const out: Array<{ html: string } | { include: Include }> = [];
	const re = new RegExp(`${INCLUDE_OPEN}([^${INCLUDE_CLOSE}]*)${INCLUDE_CLOSE}`, "g");
	let last = 0;
	for (const m of html.matchAll(re)) {
		if (m.index! > last) out.push({ html: html.slice(last, m.index) });
		try { out.push({ include: JSON.parse(decodeURIComponent(m[1]!)) as Include }); } catch { /* a mangled token prints nothing */ }
		last = m.index! + m[0].length;
	}
	if (last < html.length) out.push({ html: html.slice(last) });
	return out;
}

/**
 * The text with its values filled from the context. Values are HTML-escaped
 * unless written with three braces; drop-ins become tokens for the caller.
 */
export function render(text: string, ctx: Scope): string {
	const nodes = parse(text);
	const out: string[] = [];
	const walk = (list: Node[], scopes: Scope[]) => {
		for (const n of list) {
			switch (n.kind) {
				case "text": out.push(n.text); break;
				case "var": { const v = print(lookup(n.path, scopes)); out.push(n.raw ? v : escapeHtml(v)); break; }
				case "include": out.push(includeToken(n.include)); break;
				case "if": {
					const v = lookup(n.test.path, scopes);
					const want = n.test.other !== undefined ? print(lookup(n.test.other, scopes)) : n.test.value ?? "";
					let pass = n.test.op ? (n.test.op === "==" ? print(v) === want : print(v) !== want) : truthy(v);
					if (n.negate) pass = !pass;
					walk(pass ? n.body : n.otherwise, scopes);
					break;
				}
				case "each": {
					const v = lookup(n.path, scopes);
					const items = Array.isArray(v) ? (n.limit ? v.slice(0, n.limit) : v) : [];
					if (!items.length) { walk(n.otherwise, scopes); break; }
					items.forEach((item, i) => {
						const local: Scope = { this: item, "@index": i, "@number": i + 1, "@first": i === 0, "@last": i === items.length - 1 };
						if (n.alias) local[n.alias] = item;
						// A plain {{title}} inside the loop reaches the item's own fields too.
						const scope: Scope = item && typeof item === "object" && !Array.isArray(item) ? { ...(item as Scope), ...local } : local;
						walk(n.body, [...scopes, scope]);
					});
					break;
				}
			}
		}
	};
	walk(nodes, [ctx]);
	return out.join("");
}

/** Whether the text uses the vocabulary at all; plain HTML skips the renderer. */
export const hasTemplate = (text: string): boolean => /\{\{/.test(text);
