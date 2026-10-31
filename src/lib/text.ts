/**
 * Plain text fields keep what was typed: a blank line is a paragraph break,
 * a single newline a line break. Sections print them as paragraphs, so the
 * gap between them is the theme's (or the site's `--ts-para-gap`), not a
 * blank line's height.
 */
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The text as paragraphs, each a list of lines. Empty when there is nothing to print. */
export function paragraphs(text: string): string[][] {
	return (text ?? "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean)).filter((p) => p.length);
}

/** The text as HTML paragraphs (escaped), lines joined with <br>. */
export function paragraphsHtml(text: string): string {
	return paragraphs(text).map((p) => `<p>${p.map(escapeText).join("<br>")}</p>`).join("");
}
