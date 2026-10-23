#!/usr/bin/env node
/**
 * Put the template's structure into a theme's seed file.
 *   npx tidysites-seed            (seed/seed.json, or the path in package.json "emdash.seed")
 *   npx tidysites-seed path/to/seed.json [--check]
 * The seed keeps its menus, settings, meta and content; collections, block
 * types and relations are replaced with the package's. --check exits 1 when
 * the file is out of date instead of writing it, for CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const check = args.includes("--check");
let file = args.find((a) => !a.startsWith("--"));
if (!file) {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
		file = pkg?.emdash?.seed ?? "seed/seed.json";
	} catch {
		file = "seed/seed.json";
	}
}
const seedPath = path.resolve(file);
const templatePath = fileURLToPath(new URL("../template/structure.json", import.meta.url));
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const seed = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, "utf8")) : {};

const { blockTypes: _b, collections: _c, relations: _r, ...rest } = seed;
const next = { $schema: template.$schema, version: template.version, meta: rest.meta ?? template.meta, settings: rest.settings ?? {}, blockTypes: template.blockTypes, collections: template.collections, menus: rest.menus ?? template.menus ?? [], content: rest.content ?? {} };
if (template.relations !== undefined) next.relations = template.relations;
// Every section value in the content must use only the fields its block type declares (EmDash refuses the seed otherwise).
const types = new Map(template.blockTypes.map((b) => [b.slug, new Set(["_type", "_key", "_version", ...((b.versions.find((v) => v.version === b.currentVersion) ?? b.versions[b.versions.length - 1]).fields.map((f) => f.slug))])]));
const problems = [];
for (const [collection, list] of Object.entries(next.content)) for (const e of list) for (const s of Array.isArray(e?.data?.sections) ? e.data.sections : []) {
	const allowed = types.get(s._type);
	if (!allowed) { problems.push(`${collection}/${e.id}: section type "${s._type}" is not in the template`); continue; }
	for (const k of Object.keys(s)) if (!allowed.has(k)) problems.push(`${collection}/${e.id}: section "${s._type}" (${s._key}) uses "${k}", which its block type does not declare`);
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
const text = JSON.stringify(next, null, "\t") + "\n";
const current = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, "utf8") : "";
if (check) {
	if (current === text) { console.log(`${file} matches the template.`); process.exit(0); }
	console.error(`${file} is out of date with the template. Run: npx tidysites-seed ${file}`);
	process.exit(1);
}
fs.mkdirSync(path.dirname(seedPath), { recursive: true });
fs.writeFileSync(seedPath, text);
console.log(`${file}: ${template.collections.length} collections, ${template.blockTypes.length} section types from the template; menus, settings and content kept.`);
