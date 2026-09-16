/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The Tideworthy on-site editor. Runs on a page rendered in edit mode. Every
 * custom block on the page sits in a frame (`[data-tidy-block]`, rendered by
 * the template); hovering a frame shows a chip with Edit, Up, Down, Remove,
 * and Add; Edit opens a panel whose form comes from the block's field schema.
 * Saves go through EmDash's own content API with the editor's session, as a
 * draft; Publish is the same call EmDash's toolbar makes.
 */
import { coerce, defaultsFor, insertBlock, moveBlock, removeBlock, updateBlock, type Block, type BlockSchema, type FieldSchema } from "./ops";

interface Config {
	collection: string;
	id: string;
	field: string;
	blocks: BlockSchema[];
	value: Block[];
	status?: string;
}

const API = "/_emdash/api";
const CSRF = { "X-EmDash-Request": "1" };

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

export function start(config: Config): void {
	let value: Block[] = config.value;
	const schemaOf = (type: string) => config.blocks.find((b) => b.type === type);
	const frames = () => Array.from(document.querySelectorAll<HTMLElement>("[data-tidy-block]"));

	// --- status pill -------------------------------------------------------
	const status = el("div", { class: "tidy-status", hidden: "" });
	const statusText = el("span");
	const publishBtn = el("button", { type: "button", class: "tidy-btn tidy-btn-primary", text: "Publish" });
	status.append(statusText, publishBtn);
	document.body.append(status);
	function setStatus(text: string, showPublish: boolean) {
		statusText.textContent = text;
		publishBtn.hidden = !showPublish;
		status.hidden = false;
	}
	publishBtn.addEventListener("click", async () => {
		publishBtn.disabled = true;
		setStatus("Publishing", true);
		const r = await fetch(`${API}/content/${encodeURIComponent(config.collection)}/${encodeURIComponent(config.id)}/publish`, { method: "POST", credentials: "same-origin", headers: CSRF });
		if (r.ok) location.reload();
		else {
			publishBtn.disabled = false;
			setStatus(`Publish failed (${r.status})`, true);
		}
	});
	// Saves make a draft; Publish is the same call EmDash's toolbar makes and is always at hand.
	setStatus(config.status === "draft" ? "Unpublished changes" : "Editing", true);

	async function save(next: Block[]): Promise<void> {
		setStatus("Saving", false);
		const r = await fetch(`${API}/content/${encodeURIComponent(config.collection)}/${encodeURIComponent(config.id)}`, {
			method: "PUT",
			credentials: "same-origin",
			headers: { ...CSRF, "content-type": "application/json" },
			body: JSON.stringify({ data: { [config.field]: next } })
		});
		if (!r.ok) {
			setStatus(`Save failed (${r.status})`, false);
			return;
		}
		value = next;
		setStatus("Saved. Reloading", false);
		location.reload();
	}

	// --- chip on the hovered frame ------------------------------------------
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

	function showChip(frame: HTMLElement) {
		current = frame;
		const key = frame.dataset.tidyBlock ?? "";
		const type = frame.dataset.tidyType ?? "";
		chipLabel.textContent = schemaOf(type)?.label ?? type;
		const r = frame.getBoundingClientRect();
		chip.style.top = `${Math.max(8, r.top + window.scrollY - 2)}px`;
		chip.style.left = `${Math.max(8, r.left + window.scrollX + 8)}px`;
		const i = value.findIndex((b) => b._key === key);
		bUp.disabled = i <= 0;
		bDown.disabled = i < 0 || i >= value.length - 1;
		chip.hidden = false;
		frames().forEach((f) => f.classList.toggle("tidy-active", f === frame));
	}
	for (const f of frames()) {
		f.addEventListener("mouseenter", () => showChip(f));
		f.addEventListener("click", (e) => {
			// Links and buttons inside a section keep working; clicking anything else edits it.
			if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
			e.preventDefault();
			showChip(f);
			openPanel(f.dataset.tidyBlock ?? "");
		});
	}
	chip.addEventListener("mouseenter", () => { if (current) current.classList.add("tidy-active"); });
	bEdit.addEventListener("click", () => current && openPanel(current.dataset.tidyBlock ?? ""));
	bUp.addEventListener("click", () => current && confirmSave(moveBlock(value, current.dataset.tidyBlock ?? "", -1)));
	bDown.addEventListener("click", () => current && confirmSave(moveBlock(value, current.dataset.tidyBlock ?? "", 1)));
	bRemove.addEventListener("click", () => {
		if (!current) return;
		if (confirm(`Remove this ${chipLabel.textContent} section?`)) void save(removeBlock(value, current.dataset.tidyBlock ?? ""));
	});
	bAdd.addEventListener("click", () => current && openAdd(current.dataset.tidyBlock ?? null));
	function confirmSave(next: Block[]) {
		if (next !== value) void save(next);
	}

	// "Add a section" at the end of the block list.
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

	function fieldInput(f: FieldSchema, v: unknown, name: string): HTMLElement {
		const wrap = el("label", { class: "tidy-field" }, [el("span", { class: "tidy-field-label", text: f.label })]);
		if (f.type === "toggle") {
			const cb = el("input", { type: "checkbox", name });
			cb.checked = v === true;
			wrap.className = "tidy-field tidy-field-toggle";
			wrap.prepend(cb);
		} else if (f.type === "select") {
			const s = el("select", { name });
			for (const o of f.options ?? []) {
				const opt = el("option", { value: o.value, text: o.label });
				if (o.value === v) opt.selected = true;
				s.append(opt);
			}
			wrap.append(s);
		} else if (f.type === "number_input") {
			const i = el("input", { type: "number", name });
			i.value = typeof v === "number" ? String(v) : "";
			wrap.append(i);
		} else if (f.multiline) {
			const t = el("textarea", { name, rows: "4" });
			t.value = typeof v === "string" ? v : "";
			wrap.append(t);
		} else {
			const i = el("input", { type: "text", name });
			i.value = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
			wrap.append(i);
		}
		return wrap;
	}

	/** Builds the form for a block; returns a reader that yields the block's data from the inputs. */
	function buildForm(schema: BlockSchema, data: Record<string, unknown>): { form: HTMLFormElement; read: () => Record<string, unknown> } {
		const form = el("form", { class: "tidy-form" });
		const repeaters = new Map<string, { field: FieldSchema; items: HTMLElement }>();
		for (const f of schema.fields) {
			if (f.type === "repeater") {
				const box = el("fieldset", { class: "tidy-repeater" }, [el("legend", { text: f.label })]);
				const items = el("div", { class: "tidy-repeater-items" });
				const rows = Array.isArray(data[f.action_id]) ? (data[f.action_id] as Record<string, unknown>[]) : [];
				const addItem = (row: Record<string, unknown>) => {
					const item = el("div", { class: "tidy-repeater-item" });
					for (const sub of f.fields ?? []) item.append(fieldInput(sub, row[sub.action_id], sub.action_id));
					const rm = el("button", { type: "button", class: "tidy-btn tidy-btn-danger tidy-btn-sm", text: `Remove ${f.item_label ?? "item"}` });
					rm.addEventListener("click", () => item.remove());
					item.append(rm);
					items.append(item);
				};
				rows.forEach(addItem);
				const add = el("button", { type: "button", class: "tidy-btn tidy-btn-sm", text: `Add ${f.item_label ?? "item"}` });
				add.addEventListener("click", () => addItem({}));
				box.append(items, add);
				form.append(box);
				repeaters.set(f.action_id, { field: f, items });
			} else form.append(fieldInput(f, data[f.action_id], f.action_id));
		}
		const read = (): Record<string, unknown> => {
			const out: Record<string, unknown> = {};
			for (const f of schema.fields) {
				if (f.type === "repeater") {
					const rep = repeaters.get(f.action_id)!;
					out[f.action_id] = Array.from(rep.items.children).map((item) => {
						const row: Record<string, unknown> = {};
						for (const sub of f.fields ?? []) {
							const input = item.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${sub.action_id}"]`);
							row[sub.action_id] = coerce(sub, sub.type === "toggle" ? (input as HTMLInputElement | null)?.checked : input?.value);
						}
						return row;
					});
					continue;
				}
				const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`:scope > .tidy-field [name="${f.action_id}"]`);
				out[f.action_id] = coerce(f, f.type === "toggle" ? (input as HTMLInputElement | null)?.checked : input?.value);
			}
			return out;
		};
		return { form, read };
	}

	function openPanel(key: string) {
		const block = value.find((b) => b._key === key);
		const schema = block ? schemaOf(block._type) : undefined;
		if (!block || !schema) return;
		panel.replaceChildren();
		const { form, read } = buildForm(schema, block);
		const saveBtn = el("button", { type: "submit", class: "tidy-btn tidy-btn-primary", text: "Save" });
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		cancel.addEventListener("click", closePanel);
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			saveBtn.disabled = true;
			void save(updateBlock(value, key, read()));
		});
		form.append(el("div", { class: "tidy-panel-actions" }, [saveBtn, cancel]));
		panel.append(el("header", { class: "tidy-panel-head" }, [el("h2", { text: schema.label }), ...(schema.description ? [el("p", { text: schema.description })] : [])]), form);
		panel.hidden = false;
		(form.querySelector("input,textarea,select") as HTMLElement | null)?.focus();
	}

	function openAdd(afterKey: string | null) {
		panel.replaceChildren();
		const head = el("header", { class: "tidy-panel-head" }, [el("h2", { text: "Add a section" })]);
		const listEl = el("div", { class: "tidy-add-list" });
		for (const s of config.blocks.filter((b) => b.category !== "Inline")) {
			const b = el("button", { type: "button", class: "tidy-add-item" }, [el("strong", { text: s.label }), el("span", { text: s.description ?? "" })]);
			b.addEventListener("click", () => void save(insertBlock(value, s.type, afterKey, defaultsFor(s))));
			listEl.append(b);
		}
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		cancel.addEventListener("click", closePanel);
		panel.append(head, listEl, el("div", { class: "tidy-panel-actions" }, [cancel]));
		panel.hidden = false;
	}

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !panel.hidden) closePanel();
	});
}

const cfgEl = document.getElementById("tidy-editor-config");
if (cfgEl?.textContent) {
	try {
		start(JSON.parse(cfgEl.textContent) as Config);
	} catch (err) {
		console.error("[tidy-editor]", err);
	}
}
