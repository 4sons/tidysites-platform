/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Editing in place. A click on a heading, a paragraph, a button label or an
 * image edits that one thing where it stands instead of opening the whole
 * section's form:
 *
 * - a section's string and text fields are matched to the elements that show
 *   them by exact text (targets.ts lists them from the block's values), so a
 *   theme needs no markers; the element becomes editable, Enter or Save
 *   writes that field back, Escape cancels;
 * - a Columns slot's text (`data-tidy-md`, markdown) opens a markdown box in
 *   its place;
 * - a section's images (`<img>` whose source carries the field's file) open
 *   the picker for that one field;
 * - a custom row's text and images are edited in the row itself and the
 *   row's HTML is written back, to the page for an inline row or to the saved
 *   row record for a shared one.
 *
 * The section's full form stays behind the chip's Edit.
 */
import type { Block, BlockTypeSchema } from "./ops";
import { getPath, imageTargets, labelFor, normText, setPath, textTargets } from "./targets";

export interface InlineHost {
	/** The block a frame edits (behind a Saved section, the shared record's block). */
	blockOf: (key: string) => Block | null;
	/** Write that block back where it lives: the page, or the shared record. */
	saveBlock: (key: string, next: Block) => Promise<boolean>;
	schemaOf: (type: string) => BlockTypeSchema | undefined;
	saveEntry: (collection: string, id: string, data: Record<string, unknown>, publishNow?: boolean) => Promise<boolean>;
	/** The picker for one image field; resolves to a media value, null to clear, undefined when cancelled. */
	pickImage: (label: string, currentUrl: string | null) => Promise<Record<string, unknown> | null | undefined>;
	status: (text?: string) => void;
}

type TextMeta = { key: string; path: string; multiline: boolean; label: string };
const textMeta = new WeakMap<Element, TextMeta>();
const imageMeta = new WeakMap<Element, { key: string; path: string; label: string }>();

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "OPTION", "SVG", "PATH", "IFRAME", "VIDEO", "NOSCRIPT"]);

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "text") n.textContent = v;
		else if (k === "class") n.className = v;
		else n.setAttribute(k, v);
	}
	n.append(...children);
	return n;
}

/** The deepest element inside `root` whose text is exactly `value`, skipping record cards, controls and elements already taken. */
function findText(root: Element, value: string, used: Set<Element>): Element | null {
	const want = normText(value);
	if (!want) return null;
	let best: Element | null = null;
	for (const e of Array.from(root.querySelectorAll<Element>("*"))) {
		if (SKIP_TAGS.has(e.tagName) || used.has(e)) continue;
		if (e.closest("[data-tidy-record]") && !root.matches("[data-tidy-record]")) continue;
		if (e.closest(".tidy-chip,.tidy-pill,.tidy-panel")) continue;
		if (normText(e.textContent ?? "") !== want) continue;
		// Prefer the deepest match: a parent whose only text is the child's is not it.
		const deeper = Array.from(e.children).some((c) => normText(c.textContent ?? "") === want);
		if (deeper) continue;
		best = e;
		break;
	}
	return best;
}

function imageMatches(img: HTMLImageElement, key: string): boolean {
	const src = decodeURIComponent(img.currentSrc || img.src || img.getAttribute("src") || "");
	return Boolean(key) && (src.includes(key) || src.includes(key.split("/").pop() ?? key));
}

/** Mark everything on the page that can be edited in place. */
export function annotate(host: InlineHost): void {
	for (const frame of Array.from(document.querySelectorAll<HTMLElement>("[data-tidy-block]"))) {
		const key = frame.dataset.tidyBlock ?? "";
		const block = host.blockOf(key);
		const type = block ? host.schemaOf(block._type) : undefined;
		if (!block || !type) continue;
		const used = new Set<Element>();
		for (const t of textTargets(type, block)) {
			if (t.markdown) continue; // marked by the renderer as data-tidy-md
			const e = findText(frame, t.value, used);
			if (!e) continue;
			used.add(e);
			e.setAttribute("data-tidy-field", t.path);
			textMeta.set(e, { key, path: t.path, multiline: t.multiline, label: labelFor(type, block, t.path) });
		}
		for (const t of imageTargets(type, block)) {
			const img = Array.from(frame.querySelectorAll("img")).find((i) => !imageMeta.has(i) && imageMatches(i, t.key));
			if (!img) continue;
			img.setAttribute("data-tidy-image", t.path);
			imageMeta.set(img, { key, path: t.path, label: labelFor(type, block, t.path) });
		}
	}
	// Custom rows: every element with text of its own, and every image.
	for (const row of Array.from(document.querySelectorAll<HTMLElement>(".ts-row"))) {
		for (const e of Array.from(row.querySelectorAll<HTMLElement>("*"))) {
			if (SKIP_TAGS.has(e.tagName) || e.closest("style")) continue;
			const own = Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && normText(n.textContent ?? ""));
			if (own) e.setAttribute("data-tidy-rowtext", "");
		}
		for (const img of Array.from(row.querySelectorAll("img"))) img.setAttribute("data-tidy-rowimage", "");
	}
}

// --- the floating Save / Cancel pill ----------------------------------------
let pill: HTMLElement | null = null;
let cancelCurrent: (() => void) | null = null;
function showPill(anchor: Element, label: string, onSave: () => void, onCancel: () => void): void {
	hidePill();
	const save = h("button", { type: "button", class: "tidy-btn tidy-btn-primary tidy-btn-sm", text: "Save" });
	const cancel = h("button", { type: "button", class: "tidy-btn tidy-btn-sm", text: "Cancel" });
	save.addEventListener("click", onSave);
	cancel.addEventListener("click", onCancel);
	pill = h("div", { class: "tidy-pill" }, [h("span", { class: "tidy-pill-label", text: label }), save, cancel]);
	document.body.append(pill);
	const r = anchor.getBoundingClientRect();
	pill.style.top = `${r.bottom + window.scrollY + 6}px`;
	pill.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
	cancelCurrent = onCancel;
}
function hidePill(): void {
	pill?.remove();
	pill = null;
	cancelCurrent = null;
}
/** Cancel whatever is being edited in place (Escape, or another edit starting). */
export function cancelInline(): void {
	cancelCurrent?.();
}

function placeCaretAtEnd(e: HTMLElement): void {
	const range = document.createRange();
	range.selectNodeContents(e);
	range.collapse(false);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
}

/** One element becomes editable; `save` gets the new text. */
function editText(e: HTMLElement, label: string, multiline: boolean, save: (text: string) => Promise<unknown>): void {
	cancelInline();
	const original = e.innerHTML;
	let done = false;
	const finish = () => {
		done = true;
		e.removeAttribute("contenteditable");
		e.classList.remove("tidy-editing-now");
		e.removeEventListener("keydown", onKey);
		hidePill();
	};
	const cancel = () => { if (done) return; finish(); e.innerHTML = original; };
	const commit = () => {
		if (done) return;
		const text = multiline ? e.innerText.replace(/\n{3,}/g, "\n\n").trim() : normText(e.innerText);
		finish();
		if (normText(text) === normText(e.textContent ?? "") && e.innerHTML === original) return;
		void save(text);
	};
	const onKey = (ev: KeyboardEvent) => {
		if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
		else if (ev.key === "Enter" && (!multiline || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); commit(); }
	};
	e.setAttribute("contenteditable", "plaintext-only");
	if (!e.isContentEditable) e.setAttribute("contenteditable", "true");
	e.classList.add("tidy-editing-now");
	e.addEventListener("keydown", onKey);
	e.focus();
	placeCaretAtEnd(e);
	showPill(e, label, commit, cancel);
}

/** A markdown box in place of a rendered prose block. */
function editMarkdown(prose: HTMLElement, label: string, source: string, save: (md: string) => Promise<unknown>): void {
	cancelInline();
	const original = prose.innerHTML;
	const box = h("div", { class: "tidy-md-box" });
	const ta = h("textarea", { rows: String(Math.max(6, source.split("\n").length + 2)) });
	ta.value = source;
	box.append(ta);
	prose.replaceChildren(box);
	let done = false;
	const finish = () => { done = true; hidePill(); };
	const cancel = () => { if (done) return; finish(); prose.innerHTML = original; };
	const commit = () => { if (done) return; const md = ta.value; finish(); if (md === source) { prose.innerHTML = original; return; } void save(md); };
	ta.addEventListener("keydown", (ev) => {
		if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
		else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); commit(); }
	});
	ta.focus();
	showPill(prose, label, commit, cancel);
}

/** The row's current markup, as the sanitizer left it, without the editor's own marks. */
function rowHtml(row: HTMLElement): string {
	const container = Array.from(row.children).reverse().find((c) => c.tagName === "DIV") as HTMLElement | undefined;
	if (!container) return "";
	const clone = container.cloneNode(true) as HTMLElement;
	for (const e of Array.from(clone.querySelectorAll<HTMLElement>("*"))) {
		e.removeAttribute("data-tidy-rowtext");
		e.removeAttribute("data-tidy-rowimage");
		e.removeAttribute("contenteditable");
		e.classList.remove("tidy-editing-now");
		if (!e.getAttribute("class")) e.removeAttribute("class");
	}
	return clone.innerHTML;
}

function saveRow(host: InlineHost, row: HTMLElement): Promise<unknown> {
	const html = rowHtml(row);
	host.status("Saving");
	if (row.dataset.tidyRecord === "rows" && row.dataset.tidyRecordId) return host.saveEntry("rows", row.dataset.tidyRecordId, { html }, true);
	const frame = row.closest<HTMLElement>("[data-tidy-block]");
	const key = frame?.dataset.tidyBlock;
	const block = key ? host.blockOf(key) : null;
	if (!key || !block) return Promise.resolve(false);
	return host.saveBlock(key, { ...block, html });
}

function imageUrl(v: unknown): string | null {
	if (!v || typeof v !== "object") return null;
	const o = v as { meta?: { storageKey?: string }; src?: string; url?: string };
	return o.src ?? o.url ?? (o.meta?.storageKey ? `/_emdash/api/media/file/${o.meta.storageKey}` : null);
}

/** Handle a click that lands on something editable in place. True when it did. */
export function handleClick(e: MouseEvent, host: InlineHost): boolean {
	const t = e.target as HTMLElement | null;
	if (!t) return false;
	if (t.closest(".tidy-pill,.tidy-md-box,.tidy-editing-now")) return true;
	const stop = () => { e.preventDefault(); e.stopPropagation(); };
	const setBlock = (key: string, path: string, v: unknown) => { const b = host.blockOf(key); return b ? host.saveBlock(key, setPath(b, path, v)) : Promise.resolve(false); };

	const md = t.closest<HTMLElement>("[data-tidy-md]");
	if (md) {
		stop();
		const frame = md.closest<HTMLElement>("[data-tidy-block]");
		const key = frame?.dataset.tidyBlock ?? "";
		const block = host.blockOf(key);
		const path = md.dataset.tidyMd ?? "";
		if (!block || !path) return true;
		const type = host.schemaOf(block._type);
		editMarkdown(md, type ? labelFor(type, block, path) : path, String(getPath(block, path) ?? ""), (v) => setBlock(key, path, v));
		return true;
	}
	const field = t.closest<HTMLElement>("[data-tidy-field]");
	if (field) {
		stop();
		const m = textMeta.get(field);
		if (m) editText(field, m.label, m.multiline, (v) => setBlock(m.key, m.path, v));
		return true;
	}
	const img = t.closest<HTMLElement>("[data-tidy-image]");
	if (img) {
		stop();
		const m = imageMeta.get(img);
		if (!m) return true;
		const block = host.blockOf(m.key);
		void host.pickImage(m.label, imageUrl(block ? getPath(block, m.path) : null)).then((v) => {
			if (v === undefined) return;
			void setBlock(m.key, m.path, v ?? undefined);
		});
		return true;
	}
	const rowImg = t.closest<HTMLImageElement>("img[data-tidy-rowimage]");
	if (rowImg) {
		stop();
		const row = rowImg.closest<HTMLElement>(".ts-row");
		if (!row) return true;
		void host.pickImage("Image", rowImg.getAttribute("src")).then((v) => {
			if (!v) return;
			const url = imageUrl(v);
			if (!url) return;
			rowImg.setAttribute("src", url);
			rowImg.removeAttribute("srcset");
			if (typeof (v as { alt?: unknown }).alt === "string") rowImg.setAttribute("alt", String((v as { alt?: string }).alt));
			void saveRow(host, row);
		});
		return true;
	}
	const rowText = t.closest<HTMLElement>("[data-tidy-rowtext]");
	if (rowText) {
		stop();
		const row = rowText.closest<HTMLElement>(".ts-row");
		if (!row) return true;
		editText(rowText, row.dataset.tidyRecord === "rows" ? "Shared row" : "Custom row", true, () => saveRow(host, row));
		return true;
	}
	return false;
}
