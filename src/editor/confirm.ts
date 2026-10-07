/**
 * A yes-or-no dialog in the page, in the editor's own style: never the
 * browser's confirm box. Resolves true on the action, false on Cancel,
 * Escape or a click on the backdrop.
 */
export function tidyConfirm(opts: { title: string; body: string; cta: string; danger?: boolean }): Promise<boolean> {
	return new Promise((resolve) => {
		const backdrop = document.createElement("div");
		backdrop.className = "tidy-dialog-backdrop";
		const dialog = document.createElement("div");
		dialog.className = "tidy-dialog";
		dialog.setAttribute("role", "alertdialog");
		dialog.setAttribute("aria-modal", "true");
		const h = document.createElement("h2");
		h.textContent = opts.title;
		const p = document.createElement("p");
		p.textContent = opts.body;
		const actions = document.createElement("div");
		actions.className = "tidy-dialog-actions";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "tidy-btn";
		cancel.textContent = "Cancel";
		const go = document.createElement("button");
		go.type = "button";
		go.className = `tidy-btn ${opts.danger ? "tidy-btn-danger" : "tidy-btn-primary"}`;
		go.textContent = opts.cta;
		actions.append(cancel, go);
		dialog.append(h, p, actions);
		backdrop.append(dialog);
		const done = (ok: boolean) => {
			document.removeEventListener("keydown", onKey);
			backdrop.remove();
			resolve(ok);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") done(false);
		};
		cancel.addEventListener("click", () => done(false));
		go.addEventListener("click", () => done(true));
		backdrop.addEventListener("click", (e) => {
			if (e.target === backdrop) done(false);
		});
		document.addEventListener("keydown", onKey);
		document.body.append(backdrop);
		go.focus();
	});
}
