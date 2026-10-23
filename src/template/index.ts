/**
 * The Tidysites template: the one data shape every theme renders. The JSON
 * at /template/structure.json is the source; this module gives it types and
 * the merge a theme's seed goes through so a theme never carries a schema of
 * its own (see template/README.md).
 */
import structure from "../../template/structure.json";

export interface TemplateField {
	slug: string;
	label: string;
	type: string;
	required?: boolean;
	validation?: Record<string, unknown>;
	defaultValue?: unknown;
	[k: string]: unknown;
}
export interface TemplateCollection {
	slug: string;
	label: string;
	labelSingular: string;
	supports?: string[];
	fields: TemplateField[];
	[k: string]: unknown;
}
export interface SectionType {
	slug: string;
	label: string;
	description?: string;
	category?: string;
	currentVersion: number;
	versions: Array<{ version: number; fields: TemplateField[] }>;
}
export interface TemplateMenu {
	name: string;
	label: string;
	items: Array<Record<string, unknown>>;
}
export interface TemplateStructure {
	$schema?: string;
	version: string;
	meta?: Record<string, unknown>;
	blockTypes: SectionType[];
	collections: TemplateCollection[];
	menus?: TemplateMenu[];
	relations?: unknown;
}

export const template = structure as unknown as TemplateStructure;
/** Every section type a page may hold, in the template's order. */
export const sectionTypes: SectionType[] = template.blockTypes;
export const collections: TemplateCollection[] = template.collections;
/** The section type slugs, for a theme that wants to check coverage. */
export const SECTION_TYPES: string[] = sectionTypes.map((b) => b.slug);

export function collection(slug: string): TemplateCollection | undefined {
	return collections.find((c) => c.slug === slug);
}
export function sectionType(slug: string): SectionType | undefined {
	return sectionTypes.find((b) => b.slug === slug);
}

/**
 * A theme's seed with the template's structure in place of its own: the
 * collections, block types and relations come from the template; the menus,
 * settings, meta and content stay the theme's. A theme seed is content and
 * menus; everything structural is this package's.
 */
export function mergeStructure<T extends Record<string, unknown>>(seed: T): T & Pick<TemplateStructure, "version" | "blockTypes" | "collections"> {
	const { blockTypes: _b, collections: _c, relations: _r, ...rest } = seed as Record<string, unknown>;
	const out: Record<string, unknown> = { ...rest, version: template.version, blockTypes: template.blockTypes, collections: template.collections };
	if (template.relations !== undefined) out.relations = template.relations;
	if (!out.menus && template.menus) out.menus = template.menus;
	return out as T & Pick<TemplateStructure, "version" | "blockTypes" | "collections">;
}
