/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The Tideworthy on-site editor. Runs on a page rendered in edit mode.
 *
 * Sections: every block of the page's `blocks` field sits in a frame
 * (`[data-tidy-block]`, rendered by the template); hovering shows a chip with
 * Edit, Up, Down, Add and Remove, and Edit opens a panel whose form comes from
 * the block type's field definitions (the same ones EmDash's admin and MCP
 * read).
 *
 * Records: a region wrapped in `[data-tidy-record]` (a service's header, say)
 * gets an "Edit … details" chip whose form comes from EmDash's manifest for
 * that collection; the business record is always reachable from the bar.
 *
 * Images: an `image` field, in a block or a record, gets a picker over the
 * site's media library with upload and stores EmDash's media value.
 *
 * Saves go through EmDash's content API with the editor's session, as drafts.
 * Publish reads the entry's draft state from EmDash (so a draft an agent
 * staged over the API is publishable from the page too) and publishes it,
 * plus any record whose publish failed in this browser session.
 */
import { EDITABLE_TYPES, coerce, compact, defaultsFor, fieldsOf, insertBlock, moveBlock, removeBlock, updateBlock, type Block, type BlockTypeSchema, type FieldSchema } from "./ops";

interface RecordRef {
	collection: string;
	id: string;
	label: string;
}

interface Config {
	collection: string;
	id: string;
	field: string;
	blocks: BlockTypeSchema[];
	value: Block[];
	records?: RecordRef[];
	/** Where "Done" goes: /_tidy/edit switching editing off and returning here. */
	done?: string;
}

interface ManifestField {
	kind: string;
	label?: string;
	options?: Array<{ value: string; label: string }> | Record<string, unknown>;
}

interface MediaItem {
	id: string;
	filename: string;
	mimeType: string;
	width?: number | null;
	height?: number | null;
	alt?: string | null;
	storageKey: string;
	url?: string;
}

const API = "/_emdash/api";
const CSRF = { "X-EmDash-Request": "1" };
const PENDING_KEY = "tidy-pending";
/** Record fields the panel never shows: system, structural, or edited elsewhere. */
const HIDDEN_RECORD_FIELDS = new Set(["content", "sections", "sort", "brand_primary", "brand_accent", "font_display", "font_body"]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") e.className = v;
		else if (k === "text") e.textContent = v;
		else e.setAttribute(k, v);
	}
	for (const c of children) e.append(c);
	return e;
}

function mediaUrl(m: MediaItem): string {
	return m.url ?? `${API}/media/file/${m.storageKey}`;
}

/** The value an image field stores: EmDash's media value for a library item. */
function mediaValue(m: MediaItem): Record<string, unknown> {
	return { provider: "local", id: m.id, alt: m.alt ?? "", width: m.width ?? undefined, height: m.height ?? undefined, mimeType: m.mimeType, filename: m.filename, meta: { storageKey: m.storageKey } };
}

/** A URL to preview a stored image value, whatever shape it came in. */
function imageSrc(v: unknown): string | null {
	if (!v || typeof v !== "object") return typeof v === "string" && v ? v : null;
	const o = v as { src?: string; url?: string; meta?: { storageKey?: string } };
	return o.src ?? o.url ?? (o.meta?.storageKey ? `${API}/media/file/${o.meta.storageKey}` : null);
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(`${API}${path}`, { credentials: "same-origin", ...init, headers: { ...CSRF, ...(init.headers as Record<string, string> | undefined) } });
}

export function start(config: Config): void {
	let value: Block[] = config.value;
	const schemaOf = (type: string) => config.blocks.find((b) => b.slug === type);
	const frames = () => Array.from(document.querySelectorAll<HTMLElement>("[data-tidy-block]"));

	// EmDash's inline editor is for prose pages; here the sections and records own their fields.
	document.documentElement.classList.add("tidy-editing");
	document.querySelectorAll("[data-emdash-ref]").forEach((n) => n.removeAttribute("data-emdash-ref"));

	// --- pending publishes ---------------------------------------------------
	// Records whose publish failed after a save; the page itself is read from EmDash.
	const pending = new Set<string>(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "[]") as string[]);
	const persistPending = () => sessionStorage.setItem(PENDING_KEY, JSON.stringify([...pending]));
	let pageHasDraft = false;

	// --- the bar's controls --------------------------------------------------
	const status = document.getElementById("tidy-bar-actions") ?? document.body.appendChild(el("div", { class: "tidy-bar-actions" }));
	const statusText = el("span", { class: "tidy-bar-count" });
	const bizBtn = el("button", { type: "button", class: "tidy-btn", text: "Business details" });
	const publishBtn = el("button", { type: "button", class: "tidy-btn tidy-btn-primary", text: "Publish" });
	const doneBtn = el("a", { class: "tidy-btn", href: config.done ?? `/_tidy/edit?on=0&to=${encodeURIComponent(location.pathname + location.search)}`, text: "Done" });
	status.replaceChildren(statusText, bizBtn, publishBtn, doneBtn);
	const business = (config.records ?? []).find((r) => r.collection === "business");
	bizBtn.hidden = !business;
	bizBtn.addEventListener("click", () => business && void openRecord(business));
	function refreshStatus(text?: string) {
		const n = pending.size + (pageHasDraft ? 1 : 0);
		statusText.textContent = text ?? (n === 0 ? "" : `${n} unpublished change${n === 1 ? "" : "s"}`);
		publishBtn.hidden = n === 0 && !text?.startsWith("Publish failed");
	}
	refreshStatus();
	/** Ask EmDash whether this page has a draft that differs from what is live. */
	async function readDraftState(): Promise<void> {
		try {
			const r = await api(`/content/${encodeURIComponent(config.collection)}/${encodeURIComponent(config.id)}/compare`);
			if (!r.ok) return;
			const j = (await r.json().catch(() => ({}))) as { data?: { hasChanges?: boolean } };
			pageHasDraft = j.data?.hasChanges === true;
			refreshStatus();
		} catch {
			// the bar just shows no count
		}
	}
	void readDraftState();
	publishBtn.addEventListener("click", async () => {
		publishBtn.disabled = true;
		refreshStatus("Publishing");
		const targets = new Set<string>(pending);
		if (pageHasDraft || targets.size === 0) targets.add(`${config.collection}/${config.id}`);
		let failed = 0;
		for (const t of targets) {
			const [collection, id] = t.split("/") as [string, string];
			const r = await api(`/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/publish`, { method: "POST" });
			if (r.ok) pending.delete(t);
			else failed++;
		}
		persistPending();
		if (failed === 0) location.reload();
		else {
			publishBtn.disabled = false;
			refreshStatus(`Publish failed for ${failed}`);
		}
	});

	/**
	 * Page sections save as a draft the page previews in edit mode; Publish
	 * makes them live. Record details (the business, a service) are read by
	 * many pages from their published version, so a draft would look like
	 * nothing happened: they save and publish in one step.
	 */
	async function saveEntry(collection: string, id: string, data: Record<string, unknown>, publishNow = false): Promise<boolean> {
		refreshStatus("Saving");
		const r = await api(`/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
		if (!r.ok) {
			const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
			refreshStatus(`Save failed (${j.error?.message ?? r.status})`);
			return false;
		}
		if (publishNow) {
			const p = await api(`/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/publish`, { method: "POST" });
			if (!p.ok) {
				pending.add(`${collection}/${id}`);
				persistPending();
				refreshStatus(`Saved; publish failed (${p.status})`);
				return false;
			}
		}
		refreshStatus("Saved. Reloading");
		location.reload();
		return true;
	}
	const saveBlocks = (next: Block[]) => saveEntry(config.collection, config.id, { [config.field]: next });

	// --- chip on the hovered frame or record ---------------------------------
	const chip = el("div", { class: "tidy-chip", hidden: "" });
	const chipLabel = el("span", { class: "tidy-chip-label" });
	const bEdit = el("button", { type: "button", class: "tidy-btn", text: "Edit" });
	const bUp = el("button", { type: "button", class: "tidy-btn", title: "Move up", text: "↑" });
	const bDown = el("button", { type: "button", class: "tidy-btn", title: "Move down", text: "↓" });
	const bAdd = el("button", { type: "button", class: "tidy-btn", title: "Add a section below", text: "+" });
	const bRemove = el("button", { type: "button", class: "tidy-btn tidy-btn-danger", title: "Remove this section", text: "Remove" });
	chip.append(chipLabel, bEdit, bUp, bDown, bAdd, bRemove);
	document.body.append(chip);
	let current: HTMLElement | null = null;

	function placeChip(target: HTMLElement) {
		const r = target.getBoundingClientRect();
		chip.style.top = `${Math.max(8, r.top + window.scrollY - 2)}px`;
		chip.style.left = `${Math.max(8, r.left + window.scrollX + 8)}px`;
		chip.hidden = false;
		document.querySelectorAll(".tidy-active").forEach((n) => n.classList.remove("tidy-active"));
		target.classList.add("tidy-active");
	}
	function showBlockChip(frame: HTMLElement) {
		current = frame;
		const key = frame.dataset.tidyBlock ?? "";
		chipLabel.textContent = schemaOf(frame.dataset.tidyType ?? "")?.label ?? frame.dataset.tidyType ?? "";
		const i = value.findIndex((b) => b._key === key);
		bUp.disabled = i <= 0;
		bDown.disabled = i < 0 || i >= value.length - 1;
		for (const b of [bUp, bDown, bAdd, bRemove]) b.hidden = false;
		bEdit.textContent = "Edit";
		placeChip(frame);
	}
	function showRecordChip(region: HTMLElement) {
		current = region;
		chipLabel.textContent = region.dataset.tidyRecordLabel ?? region.dataset.tidyRecord ?? "";
		for (const b of [bUp, bDown, bAdd, bRemove]) b.hidden = true;
		bEdit.textContent = "Edit details";
		placeChip(region);
	}
	const isInteractive = (t: EventTarget | null) => Boolean((t as HTMLElement | null)?.closest("a,button,input,select,textarea,label"));
	for (const f of frames()) {
		f.addEventListener("mouseenter", () => showBlockChip(f));
		f.addEventListener("click", (e) => {
			// A record listed inside the section (a service card) handles its own click.
			if ((e.target as HTMLElement).closest("[data-tidy-record]")) return;
			if (isInteractive(e.target)) return;
			e.preventDefault();
			showBlockChip(f);
			openBlock(f.dataset.tidyBlock ?? "");
		});
	}
	for (const r of Array.from(document.querySelectorAll<HTMLElement>("[data-tidy-record]"))) {
		const frame = r.parentElement?.closest<HTMLElement>("[data-tidy-block]") ?? null;
		r.addEventListener("mouseenter", () => showRecordChip(r));
		// Leaving a card inside a section hands the chip back to the section.
		if (frame) r.addEventListener("mouseleave", () => showBlockChip(frame));
		r.addEventListener("click", (e) => {
			// Cards are often links; in edit mode a click edits instead of navigating.
			if ((e.target as HTMLElement).closest("button,input,select,textarea,label")) return;
			e.preventDefault();
			e.stopPropagation();
			showRecordChip(r);
			void openRecord({ collection: r.dataset.tidyRecord ?? "", id: r.dataset.tidyRecordId ?? "", label: r.dataset.tidyRecordLabel ?? "" });
		});
	}
	// Editing is a page edit: inside the sections a click edits what it lands
	// on and never follows a link; outside them the header and footer show the
	// business record's facts, so a click there opens Business details. The
	// menu keeps walking the site, and the editor's own controls are untouched.
	document.addEventListener(
		"click",
		(e) => {
			const t = e.target as HTMLElement | null;
			if (!t || t.closest(".tidy-bar,.tidy-chip,.tidy-panel,.tidy-add-end,#emdash-toolbar")) return;
			if (t.closest("[data-tidy-blocks]")) {
				if (!t.closest("a,button")) return;
				e.preventDefault();
				e.stopPropagation();
				const record = t.closest<HTMLElement>("[data-tidy-record]");
				const frame = t.closest<HTMLElement>("[data-tidy-block]");
				if (record) {
					showRecordChip(record);
					void openRecord({ collection: record.dataset.tidyRecord ?? "", id: record.dataset.tidyRecordId ?? "", label: record.dataset.tidyRecordLabel ?? "" });
				} else if (frame) {
					showBlockChip(frame);
					openBlock(frame.dataset.tidyBlock ?? "");
				}
				return;
			}
			if (t.closest("main") || t.closest("nav a, header button, input, select, textarea, label")) return;
			if (!business) return;
			e.preventDefault();
			e.stopPropagation();
			void openRecord(business);
		},
		true
	);
	// The chip sits outside every frame; hovering it must not count as leaving.
	chip.addEventListener("mouseenter", () => current?.classList.add("tidy-active"));
	bEdit.addEventListener("click", () => {
		if (!current) return;
		if (current.dataset.tidyBlock) openBlock(current.dataset.tidyBlock);
		else void openRecord({ collection: current.dataset.tidyRecord ?? "", id: current.dataset.tidyRecordId ?? "", label: current.dataset.tidyRecordLabel ?? "" });
	});
	bUp.addEventListener("click", () => current?.dataset.tidyBlock && moved(moveBlock(value, current.dataset.tidyBlock, -1)));
	bDown.addEventListener("click", () => current?.dataset.tidyBlock && moved(moveBlock(value, current.dataset.tidyBlock, 1)));
	bRemove.addEventListener("click", () => {
		if (!current?.dataset.tidyBlock) return;
		if (confirm(`Remove this ${chipLabel.textContent} section?`)) void saveBlocks(removeBlock(value, current.dataset.tidyBlock));
	});
	bAdd.addEventListener("click", () => current?.dataset.tidyBlock && openAdd(current.dataset.tidyBlock));
	function moved(next: Block[]) {
		if (next !== value) void saveBlocks(next);
	}

	const list = document.querySelector<HTMLElement>("[data-tidy-blocks]");
	if (list) {
		const add = el("button", { type: "button", class: "tidy-add-end", text: "+ Add a section" });
		add.addEventListener("click", () => openAdd(null));
		list.after(add);
	}

	// --- panel ---------------------------------------------------------------
	const panel = el("aside", { class: "tidy-panel", hidden: "" });
	document.body.append(panel);
	function closePanel() {
		panel.hidden = true;
		panel.replaceChildren();
	}
	function openPanel(title: string, description: string | undefined, body: HTMLElement) {
		panel.replaceChildren(el("header", { class: "tidy-panel-head" }, [el("h2", { text: title }), ...(description ? [el("p", { text: description })] : [])]), body);
		panel.hidden = false;
		(body.querySelector("input:not([type=file]),textarea,select") as HTMLElement | null)?.focus();
	}
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !panel.hidden) closePanel();
	});

	// --- image picker -----------------------------------------------------------
	/** An image control: preview, choose from the library, upload, remove. `onPick` receives the library item or null. */
	function imageControl(label: string, currentUrl: string | null, onPick: (item: MediaItem | null) => void): HTMLElement {
		const wrap = el("div", { class: "tidy-field tidy-image" }, [el("span", { class: "tidy-field-label", text: label })]);
		const preview = el("div", { class: "tidy-image-preview" });
		const setPreview = (url: string | null) => {
			preview.replaceChildren(url ? el("img", { src: url, alt: "" }) : el("span", { class: "tidy-image-empty", text: "No image" }));
		};
		setPreview(currentUrl);
		const choose = el("button", { type: "button", class: "tidy-btn tidy-btn-sm", text: "Choose image" });
		const upload = el("button", { type: "button", class: "tidy-btn tidy-btn-sm", text: "Upload" });
		const clear = el("button", { type: "button", class: "tidy-btn tidy-btn-sm tidy-btn-danger", text: "Remove" });
		const file = el("input", { type: "file", accept: "image/*", hidden: "" });
		const grid = el("div", { class: "tidy-image-grid", hidden: "" });
		wrap.append(preview, el("div", { class: "tidy-image-actions" }, [choose, upload, clear, file]), grid);
		choose.addEventListener("click", async () => {
			if (!grid.hidden) {
				grid.hidden = true;
				return;
			}
			grid.hidden = false;
			grid.replaceChildren(el("span", { class: "tidy-image-empty", text: "Loading" }));
			const r = await api("/media?mimeType=image/&limit=60");
			const j = (await r.json().catch(() => ({}))) as { data?: { items?: MediaItem[] }; items?: MediaItem[] };
			const items = j.data?.items ?? j.items ?? [];
			grid.replaceChildren();
			if (items.length === 0) grid.append(el("span", { class: "tidy-image-empty", text: "No images yet. Upload one." }));
			for (const item of items) {
				const b = el("button", { type: "button", class: "tidy-image-thumb", title: item.alt ?? item.filename }, [el("img", { src: mediaUrl(item), alt: item.alt ?? item.filename, loading: "lazy" })]);
				b.addEventListener("click", () => {
					onPick(item);
					setPreview(mediaUrl(item));
					grid.hidden = true;
				});
				grid.append(b);
			}
		});
		upload.addEventListener("click", () => file.click());
		file.addEventListener("change", async () => {
			const f = file.files?.[0];
			if (!f) return;
			upload.disabled = true;
			upload.textContent = "Uploading";
			const body = new FormData();
			body.append("file", f);
			body.append("alt", f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
			const r = await api("/media", { method: "POST", body });
			const j = (await r.json().catch(() => ({}))) as { data?: { item?: MediaItem } };
			upload.disabled = false;
			upload.textContent = "Upload";
			file.value = "";
			if (!r.ok || !j.data?.item) {
				alert(`Upload failed (${r.status})`);
				return;
			}
			onPick(j.data.item);
			setPreview(mediaUrl(j.data.item));
		});
		clear.addEventListener("click", () => {
			onPick(null);
			setPreview(null);
		});
		return wrap;
	}

	// --- block forms ---------------------------------------------------------
	type Reader = () => unknown;

	/** One control for a block field (or a repeater row's sub-field). Returns the element and a reader of its coerced value. */
	function fieldControl(f: FieldSchema, v: unknown): { node: HTMLElement; read: Reader } {
		const label = f.label || f.slug;
		if (f.type === "image") {
			let picked: unknown = v && typeof v === "object" ? v : undefined;
			const node = imageControl(label, imageSrc(v), (item) => {
				picked = item ? mediaValue(item) : undefined;
			});
			return { node, read: () => picked };
		}
		const wrap = el("label", { class: "tidy-field" }, [el("span", { class: "tidy-field-label", text: label })]);
		if (f.type === "boolean") {
			const cb = el("input", { type: "checkbox" });
			cb.checked = v === true;
			wrap.className = "tidy-field tidy-field-toggle";
			wrap.prepend(cb);
			return { node: wrap, read: () => cb.checked };
		}
		if (f.type === "select") {
			const s = el("select");
			if (!f.required) s.append(el("option", { value: "", text: "" }));
			for (const o of f.validation?.options ?? []) {
				const opt = el("option", { value: o, text: o });
				if (o === v) opt.selected = true;
				s.append(opt);
			}
			wrap.append(s);
			return { node: wrap, read: () => coerce(f, s.value) };
		}
		if (f.type === "multiSelect") {
			const box = el("div", { class: "tidy-multi" });
			const chosen = new Set(Array.isArray(v) ? (v as string[]) : []);
			const boxes: HTMLInputElement[] = [];
			for (const o of f.validation?.options ?? []) {
				const cb = el("input", { type: "checkbox", value: o });
				cb.checked = chosen.has(o);
				boxes.push(cb);
				box.append(el("label", { class: "tidy-multi-item" }, [cb, o]));
			}
			wrap.append(box);
			return { node: wrap, read: () => boxes.filter((b) => b.checked).map((b) => b.value) };
		}
		if (f.type === "number" || f.type === "integer") {
			const i = el("input", { type: "number", ...(f.type === "integer" ? { step: "1" } : { step: "any" }) });
			i.value = typeof v === "number" ? String(v) : "";
			wrap.append(i);
			return { node: wrap, read: () => coerce(f, i.value) };
		}
		if (f.type === "datetime") {
			const i = el("input", { type: "datetime-local" });
			i.value = typeof v === "string" ? v.slice(0, 16) : "";
			wrap.append(i);
			return { node: wrap, read: () => (i.value ? new Date(i.value).toISOString() : undefined) };
		}
		if (f.type === "text") {
			const t = el("textarea", { rows: "4" });
			t.value = typeof v === "string" ? v : "";
			wrap.append(t);
			return { node: wrap, read: () => t.value };
		}
		const i = el("input", { type: f.type === "url" ? "url" : "text" });
		i.value = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
		wrap.append(i);
		return { node: wrap, read: () => i.value };
	}

	function buildBlockForm(type: BlockTypeSchema, block: Block): { form: HTMLFormElement; read: () => Record<string, unknown> } {
		const form = el("form", { class: "tidy-form" });
		const readers: Array<[string, Reader]> = [];
		for (const f of fieldsOf(type, block._version)) {
			if (!EDITABLE_TYPES.has(f.type)) {
				form.append(el("p", { class: "tidy-field-note", text: `${f.label || f.slug}: edit in the admin` }));
				continue;
			}
			if (f.type === "repeater") {
				const sub = f.validation?.subFields ?? [];
				const box = el("fieldset", { class: "tidy-repeater" }, [el("legend", { text: f.label || f.slug })]);
				const items = el("div", { class: "tidy-repeater-items" });
				const rows = Array.isArray(block[f.slug]) ? (block[f.slug] as Record<string, unknown>[]) : [];
				const rowReaders = new Map<HTMLElement, Array<[string, Reader]>>();
				const addItem = (row: Record<string, unknown>) => {
					const item = el("div", { class: "tidy-repeater-item" });
					const rs: Array<[string, Reader]> = [];
					for (const s of sub) {
						const c = fieldControl(s, row[s.slug]);
						item.append(c.node);
						rs.push([s.slug, c.read]);
					}
					const rm = el("button", { type: "button", class: "tidy-btn tidy-btn-danger tidy-btn-sm", text: "Remove" });
					rm.addEventListener("click", () => {
						rowReaders.delete(item);
						item.remove();
					});
					item.append(rm);
					items.append(item);
					rowReaders.set(item, rs);
				};
				rows.forEach(addItem);
				const add = el("button", { type: "button", class: "tidy-btn tidy-btn-sm", text: "Add" });
				add.addEventListener("click", () => addItem({}));
				box.append(items, add);
				form.append(box);
				readers.push([f.slug, () => Array.from(items.children).map((item) => compact(Object.fromEntries((rowReaders.get(item as HTMLElement) ?? []).map(([k, r]) => [k, r()]))))]);
				continue;
			}
			const c = fieldControl(f, block[f.slug]);
			form.append(c.node);
			readers.push([f.slug, c.read]);
		}
		const read = (): Record<string, unknown> => {
			const out: Record<string, unknown> = {};
			for (const [k, r] of readers) out[k] = r();
			return out;
		};
		return { form, read };
	}

	function openBlock(key: string) {
		const block = value.find((b) => b._key === key);
		const type = block ? schemaOf(block._type) : undefined;
		if (!block || !type) return;
		const { form, read } = buildBlockForm(type, block);
		const saveBtn = el("button", { type: "submit", class: "tidy-btn tidy-btn-primary", text: "Save" });
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		cancel.addEventListener("click", closePanel);
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			saveBtn.disabled = true;
			// Fields the form read as "no value" are removed from the block, not written as null.
			const data = read();
			const next = updateBlock(value, key, data).map((b) => (b._key === key ? compact(b) : b)) as Block[];
			void saveBlocks(next);
		});
		form.append(el("div", { class: "tidy-panel-actions" }, [saveBtn, cancel]));
		openPanel(type.label, type.description, form);
	}

	function openAdd(afterKey: string | null) {
		const listEl = el("div", { class: "tidy-add-list" });
		for (const s of config.blocks) {
			const b = el("button", { type: "button", class: "tidy-add-item" }, [el("strong", { text: s.label }), el("span", { text: s.description ?? "" })]);
			b.addEventListener("click", () => void saveBlocks(insertBlock(value, s.slug, afterKey, defaultsFor(s))));
			listEl.append(b);
		}
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		cancel.addEventListener("click", closePanel);
		const body = el("div", {}, [listEl, el("div", { class: "tidy-panel-actions" }, [cancel])]);
		openPanel("Add a section", undefined, body);
	}

	// --- record forms (fields from EmDash's manifest) ---------------------------
	let manifest: Promise<Record<string, { fields: Record<string, ManifestField> }>> | null = null;
	function collections() {
		manifest ??= api("/manifest")
			.then((r) => r.json())
			.then((j: { data?: { collections?: Record<string, { fields: Record<string, ManifestField> }> }; collections?: Record<string, { fields: Record<string, ManifestField> }> }) => j.data?.collections ?? j.collections ?? {});
		return manifest;
	}

	async function openRecord(ref: RecordRef) {
		openPanel(ref.label, undefined, el("p", { class: "tidy-image-empty", text: "Loading" }));
		const [cols, entryRes] = await Promise.all([collections(), api(`/content/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`)]);
		const fields = cols[ref.collection]?.fields ?? {};
		const entry = (await entryRes.json().catch(() => ({}))) as { data?: { item?: { data?: Record<string, unknown> } } };
		const data = entry.data?.item?.data ?? {};
		const form = el("form", { class: "tidy-form" });
		const values: Record<string, unknown> = {};
		const readers: Array<() => void> = [];
		for (const [name, f] of Object.entries(fields)) {
			if (HIDDEN_RECORD_FIELDS.has(name) || ["portableText", "reference", "json", "datetime", "blocks"].includes(f.kind)) continue;
			const label = f.label ?? name;
			const v = data[name];
			if (f.kind === "image") {
				values[name] = v ?? null;
				form.append(imageControl(label, imageSrc(v), (item) => {
					values[name] = item ? mediaValue(item) : null;
				}));
				continue;
			}
			if (f.kind === "boolean") {
				const w = el("label", { class: "tidy-field tidy-field-toggle" }, [el("span", { class: "tidy-field-label", text: label })]);
				const cb = el("input", { type: "checkbox" });
				cb.checked = v === true;
				w.prepend(cb);
				form.append(w);
				readers.push(() => (values[name] = cb.checked));
				continue;
			}
			if (f.kind === "number") {
				const w = el("label", { class: "tidy-field" }, [el("span", { class: "tidy-field-label", text: label })]);
				const i = el("input", { type: "number", step: "any" });
				i.value = typeof v === "number" ? String(v) : "";
				w.append(i);
				form.append(w);
				readers.push(() => (values[name] = i.value === "" ? null : Number(i.value)));
				continue;
			}
			if (f.kind === "select" && Array.isArray(f.options)) {
				const w = el("label", { class: "tidy-field" }, [el("span", { class: "tidy-field-label", text: label })]);
				const s = el("select");
				for (const o of f.options as Array<{ value: string; label: string }>) {
					const opt = el("option", { value: o.value, text: o.label });
					if (o.value === v) opt.selected = true;
					s.append(opt);
				}
				w.append(s);
				form.append(w);
				readers.push(() => (values[name] = s.value));
				continue;
			}
			const w = el("label", { class: "tidy-field" }, [el("span", { class: "tidy-field-label", text: label })]);
			const long = f.kind === "text" || f.kind === "richText";
			const i = long ? el("textarea", { rows: "4" }) : el("input", { type: "text" });
			i.value = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
			w.append(i);
			form.append(w);
			readers.push(() => (values[name] = i.value));
		}
		const saveBtn = el("button", { type: "submit", class: "tidy-btn tidy-btn-primary", text: "Save" });
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		cancel.addEventListener("click", closePanel);
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			saveBtn.disabled = true;
			for (const r of readers) r();
			void saveEntry(ref.collection, ref.id, values, true);
		});
		form.append(el("div", { class: "tidy-panel-actions" }, [saveBtn, cancel]));
		openPanel(ref.label, undefined, form);
	}
}

const cfgEl = document.getElementById("tidy-editor-config");
if (cfgEl?.textContent) {
	try {
		start(JSON.parse(cfgEl.textContent) as Config);
	} catch (err) {
		console.error("[tidy-editor]", err);
	}
}
