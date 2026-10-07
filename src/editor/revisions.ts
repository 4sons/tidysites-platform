/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Revision history and Publish live, on the editor bar for anyone signed in,
 * editing or not. Revisions are the site's publishes (the control plane keeps
 * a full copy of each). Pick one and the page you are on shows as it was
 * then; Restore puts the live site, and the staging content, back on it.
 * Publish live makes the live site follow staging now.
 *
 * Deep links: ?tidy-revisions=1 opens the list; ?tidy-revision=<id> opens
 * that revision of this page.
 */
import { tidyConfirm } from "./confirm";

interface Revision {
	id: string;
	at: string;
	pages: number | null;
	restoredFrom: string | null;
}

const ROUTE = "/_tidy/revisions";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") node.className = v;
		else if (k === "text") node.textContent = v;
		else node.setAttribute(k, v);
	}
	for (const c of children) node.append(c);
	return node;
}

function when(iso: string): string {
	return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function startRevisions(): void {
	const actions = document.getElementById("tidy-bar-actions");
	if (!actions) return;
	const here = location.pathname;
	const revBtn = el("button", { type: "button", class: "tidy-btn", text: "Revisions" });
	const liveBtn = el("button", { type: "button", class: "tidy-btn", text: "Publish live" });
	actions.prepend(revBtn, liveBtn);

	// --- the panel --------------------------------------------------------
	const panel = el("div", { class: "tidy-panel", hidden: "" });
	document.body.append(panel);
	let revisions: Revision[] = [];

	async function load(): Promise<Revision[]> {
		const r = await fetch(`${ROUTE}?path=${encodeURIComponent(here)}`, { credentials: "same-origin" });
		if (!r.ok) throw new Error(`${r.status}`);
		const j = (await r.json()) as { revisions: Revision[] };
		revisions = j.revisions;
		return revisions;
	}

	function close() {
		panel.hidden = true;
		panel.replaceChildren();
		viewer.hidden = true;
		frame.removeAttribute("srcdoc");
	}

	function renderList() {
		const head = el("div", { class: "tidy-panel-head" }, [el("h2", { text: "Revisions" }), el("p", { text: "Every earlier publish of the website. Open one to see this page as it was then." })]);
		const list = el("div", { class: "tidy-add-list" });
		// The newest revision is what is live now: nothing to view or restore, so the list starts after it.
		revisions.slice(1).forEach((rev) => {
			const note = rev.restoredFrom ? "Restored" : "";
			const item = el("button", { type: "button", class: "tidy-add-item" }, [el("strong", { text: when(rev.at) }), el("span", { text: [note, rev.pages ? `${rev.pages} pages` : ""].filter(Boolean).join(" · ") })]);
			item.addEventListener("click", () => void view(rev));
			list.append(item);
		});
		if (revisions.length < 2) list.append(el("p", { class: "tidy-field-note", text: "No earlier revisions yet." }));
		const closeBtn = el("button", { type: "button", class: "tidy-btn", text: "Close" });
		closeBtn.addEventListener("click", close);
		panel.replaceChildren(head, list, el("div", { class: "tidy-panel-actions" }, [closeBtn]));
		panel.hidden = false;
	}

	// --- the viewer: this page as it was in a revision --------------------
	const viewer = el("div", { class: "tidy-viewer", hidden: "" });
	const viewerBar = el("div", { class: "tidy-viewer-bar" });
	const viewerLabel = el("span", { class: "tidy-viewer-label" });
	const backBtn = el("button", { type: "button", class: "tidy-btn", text: "Back to revisions" });
	const restoreBtn = el("button", { type: "button", class: "tidy-btn tidy-btn-primary", text: "Restore this version" });
	const frame = el("iframe", { class: "tidy-viewer-frame", title: "This page in an earlier revision", sandbox: "allow-same-origin" });
	viewerBar.append(viewerLabel, backBtn, restoreBtn);
	viewer.append(viewerBar, frame);
	document.body.append(viewer);
	backBtn.addEventListener("click", () => { viewer.hidden = true; frame.removeAttribute("srcdoc"); renderList(); });

	async function view(rev: Revision) {
		panel.hidden = true;
		viewerLabel.textContent = when(rev.at);
		const r = await fetch(`${ROUTE}?id=${encodeURIComponent(rev.id)}&path=${encodeURIComponent(here)}`, { credentials: "same-origin" });
		if (!r.ok) {
			const j = (await r.json().catch(() => ({}))) as { error?: string };
			frame.srcdoc = `<p style="font:15px system-ui;margin:2rem">${j.error ?? "This revision could not be read."}</p>`;
		} else {
			// The stored copy links its built assets by absolute path (/_astro/...);
			// those are read from the revision itself, so the page shows the way it
			// was built. Everything else (uploads, links) resolves against this site.
			const html = await r.text();
			const own = (p: string) => `${ROUTE}?id=${encodeURIComponent(rev.id)}&path=${encodeURIComponent(p)}`;
			frame.srcdoc = html
				.replace(/(href|src)="(\/_astro\/[^"]+)"/g, (_m, attr: string, p: string) => `${attr}="${own(p)}"`)
				.replace(/<head([^>]*)>/i, `<head$1><base href="${location.origin}/"><style>html.tidy-has-bar body{padding-top:0!important}#tidy-bar,.tidy-bar,#emdash-toolbar{display:none!important}</style>`);
		}
		viewer.hidden = false;
		restoreBtn.onclick = async () => {
			if (!(await tidyConfirm({ title: `Restore the website to ${when(rev.at)}?`, body: "The live site goes back to how it was then, and so does staging: every change made since is lost.", cta: "Restore", danger: true }))) return;
			restoreBtn.disabled = true;
			restoreBtn.textContent = "Restoring";
			const p = await fetch(ROUTE, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore", id: rev.id }) });
			if (p.ok) location.href = here;
			else {
				restoreBtn.disabled = false;
				restoreBtn.textContent = "Restore failed. Try again";
			}
		};
	}

	revBtn.addEventListener("click", async () => {
		if (!panel.hidden) return close();
		try {
			await load();
			renderList();
		} catch {
			panel.replaceChildren(el("p", { class: "tidy-field-note", text: "The revisions could not be read right now." }));
			panel.hidden = false;
		}
	});

	liveBtn.addEventListener("click", async () => {
		if (!(await tidyConfirm({ title: "Publish the website?", body: "Everything on staging goes live, every change made since the last publish.", cta: "Publish" }))) return;
		liveBtn.disabled = true;
		liveBtn.textContent = "Publishing";
		const p = await fetch(ROUTE, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) });
		liveBtn.disabled = false;
		liveBtn.textContent = p.ok ? "Published" : "Publish failed";
		setTimeout(() => (liveBtn.textContent = "Publish live"), 4000);
	});

	// Deep links from the platform.
	const params = new URLSearchParams(location.search);
	const want = params.get("tidy-revision");
	if (want || params.get("tidy-revisions")) {
		void load().then((list) => {
			// The newest revision is live now and is not in the list, so a link to it opens the list.
			const rev = want ? list.slice(1).find((x) => x.id === want) : null;
			if (rev) void view(rev);
			else renderList();
		}).catch(() => undefined);
	}
}

startRevisions();
