import { describe, expect, it } from "vitest";
import { Kysely } from "kysely";
import { applySeed } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import structure from "../template/structure.json";

/** The structure applied through the store itself, on an in-memory database: once to create, once to update (what a site's schema apply does). A field shape the store refuses fails here, not on a site. */
describe("the template's structure applied through the store", () => {
	it("creates and updates every collection, field and block type", async () => {
		const db = new Kysely<Record<string, never>>({ dialect: createDialect({ url: ":memory:" }) as never });
		await runMigrations(db as never);
		const first = await applySeed(db as never, structure as never, { includeContent: false, onConflict: "update" });
		expect(first.collections.created).toBeGreaterThan(20);
		const second = await applySeed(db as never, structure as never, { includeContent: false, onConflict: "update" });
		expect(second.fields.created).toBe(0);
	}, 120_000);
});
