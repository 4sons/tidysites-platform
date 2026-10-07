/**
 * Request a change, from the staging site: a button on the bar and a
 * floating one at the corner open a panel with the form; the request goes
 * to the platform through /_tidy/change and shows up under Changes.
 */
const ROUTE = "/_tidy/change";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "text") node.textContent = v;
		else node.setAttribute(k, v);
	}
	node.append(...children);
	return node;
}

export function mountRequestChange(): void {
	const actions = document.getElementById("tidy-bar-actions");
	if (!actions) return;
	const here = location.pathname + location.search;

	const panel = el("div", { class: "tidy-panel", hidden: "" });
	document.body.append(panel);
	let sending = false;

	function close() {
		panel.hidden = true;
		panel.replaceChildren();
	}

	function render() {
		const head = el("div", { class: "tidy-panel-head" }, [el("h2", { text: "Request a change" }), el("p", { text: "Say what you would like changed. It shows up under Changes and someone picks it up." })]);
		const body = el("textarea", { id: "tidy-change-body", rows: "7", maxlength: "10000", required: "" });
		const page = el("input", { id: "tidy-change-page", type: "text", value: here });
		const err = el("p", { class: "tidy-field-note", hidden: "" });
		const cancel = el("button", { type: "button", class: "tidy-btn", text: "Cancel" });
		const send = el("button", { type: "button", class: "tidy-btn tidy-btn-primary", text: "Send request" });
		cancel.addEventListener("click", close);
		send.addEventListener("click", async () => {
			if (sending) return;
			const text = body.value.trim();
			if (!text) {
				body.focus();
				return;
			}
			sending = true;
			send.disabled = true;
			send.textContent = "Sending";
			err.hidden = true;
			const r = await fetch(ROUTE, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, pageUrl: page.value.trim() || null }) }).catch(() => null);
			const j = ((await r?.json().catch(() => ({}))) ?? {}) as { ok?: boolean; error?: string };
			sending = false;
			if (r?.ok && j.ok) {
				panel.replaceChildren(
					el("div", { class: "tidy-panel-head" }, [el("h2", { text: "Request sent" }), el("p", { text: "It is under Changes now. You will hear back there." })]),
					el("div", { class: "tidy-panel-actions" }, [el("button", { type: "button", class: "tidy-btn", text: "Close" })])
				);
				panel.querySelector("button")?.addEventListener("click", close);
				return;
			}
			send.disabled = false;
			send.textContent = "Send request";
			err.textContent = j.error ?? "The request could not be sent. Try again.";
			err.hidden = false;
		});
		panel.replaceChildren(
			head,
			el("div", { class: "tidy-form" }, [
				el("div", { class: "tidy-field" }, [el("label", { class: "tidy-field-label", for: "tidy-change-body", text: "What would you like changed?" }), body]),
				el("div", { class: "tidy-field" }, [el("label", { class: "tidy-field-label", for: "tidy-change-page", text: "Which page" }), page]),
				err
			]),
			el("div", { class: "tidy-panel-actions" }, [cancel, send])
		);
		panel.hidden = false;
		body.focus();
	}

	const barBtn = el("button", { type: "button", class: "tidy-btn", text: "Request a change" });
	barBtn.addEventListener("click", render);
	actions.prepend(barBtn);

	const fab = el("button", { type: "button", class: "tidy-fab", title: "Request a change", "aria-label": "Request a change" });
	fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
	fab.addEventListener("click", render);
	document.body.append(fab);
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !panel.hidden) close();
	});
}

mountRequestChange();
