/**
 * The narrow view of an EmDash database the platform routes need. Handlers
 * depend on this interface only, so they are unit-tested against an in-memory
 * store and run in production against `createEmdashStore(db)`.
 *
 * Every EmDash internal we touch is listed in MAINTAINING.md; when EmDash
 * changes, that list is what to re-verify.
 */
import type { Kysely } from "kysely";

export type Role = "admin" | "editor";

export interface StoreUser {
	id: string;
	email: string;
	name: string | null;
	role: number;
	disabled: boolean;
}

export interface Handoff {
	userId: string;
	redirect: string;
	editMode: boolean;
	expiresAt: number;
}

export interface PlatformStore {
	getOption<T = unknown>(name: string): Promise<T | null>;
	setOption(name: string, value: unknown): Promise<void>;
	setOptionIfAbsent(name: string, value: unknown): Promise<void>;
	deleteOption(name: string): Promise<void>;

	findUserByEmail(email: string): Promise<StoreUser | null>;
	findUserById(id: string): Promise<StoreUser | null>;
	createUser(input: { email: string; name: string; role: Role }): Promise<StoreUser>;
	setUserRole(id: string, role: Role): Promise<void>;
	markEmailVerified(id: string): Promise<void>;

	/** Replace the token named `name` for `userId` (at most one per name per user). */
	replaceToken(input: { userId: string; name: string; hash: string; prefix: string; scopes: string[] }): Promise<void>;
	findTokenOwner(name: string): Promise<string | null>;

	putHandoff(token: string, handoff: Handoff): Promise<void>;
	/** Read and delete in one go; a second call for the same token returns null. */
	takeHandoff(token: string): Promise<Handoff | null>;
	sweepHandoffs(now: number): Promise<number>;

	migrationStatus(): Promise<{ applied: number; pending: number }>;
}

const HANDOFF_PREFIX = "tidy:handoff:";
export const ROLE_LEVEL: Record<Role, number> = { admin: 50, editor: 40 };

type RepoUser = { id: string; email: string; name: string | null; role: number };

/** The slice of the `emdash` module the store uses. Injected so tests never import EmDash. */
export interface EmdashModule {
	OptionsRepository: new (db: Kysely<any>) => {
		get<T>(name: string): Promise<T | null>;
		set<T>(name: string, value: T): Promise<void>;
		setIfAbsent<T>(name: string, value: T): Promise<unknown>;
		delete(name: string): Promise<unknown>;
	};
	UserRepository: new (db: Kysely<any>) => {
		findByEmail(email: string): Promise<RepoUser | null>;
		findById(id: string): Promise<RepoUser | null>;
		create(input: { email: string; name?: string; role?: Role }): Promise<RepoUser>;
	};
	ulid: () => string;
	getMigrationStatus: (db: Kysely<any>) => Promise<{ applied: string[]; pending: string[] }>;
}

/** Production store over EmDash's repositories plus a little direct Kysely for what they do not expose. */
export function createEmdashStore(db: Kysely<any>, emdash: EmdashModule): PlatformStore {
	const options = new emdash.OptionsRepository(db);
	const users = new emdash.UserRepository(db);

	async function disabledFlag(id: string): Promise<boolean> {
		const row = await db.selectFrom("users").select("disabled").where("id", "=", id).executeTakeFirst();
		return Boolean(row?.disabled);
	}
	async function toStoreUser(u: RepoUser | null): Promise<StoreUser | null> {
		if (!u) return null;
		return { id: u.id, email: u.email, name: u.name, role: u.role, disabled: await disabledFlag(u.id) };
	}

	return {
		getOption: (name) => options.get(name),
		setOption: (name, value) => options.set(name, value),
		setOptionIfAbsent: async (name, value) => {
			await options.setIfAbsent(name, value);
		},
		deleteOption: async (name) => {
			await options.delete(name);
		},

		findUserByEmail: async (email) => toStoreUser(await users.findByEmail(email)),
		findUserById: async (id) => toStoreUser(await users.findById(id)),
		createUser: async (input) => (await toStoreUser(await users.create(input)))!,
		setUserRole: async (id, role) => {
			await db.updateTable("users").set({ role: ROLE_LEVEL[role], updated_at: new Date().toISOString() }).where("id", "=", id).execute();
		},
		markEmailVerified: async (id) => {
			await db.updateTable("users").set({ email_verified: 1 }).where("id", "=", id).execute();
		},

		replaceToken: async ({ userId, name, hash, prefix, scopes }) => {
			await db.deleteFrom("_emdash_api_tokens").where("user_id", "=", userId).where("name", "=", name).execute();
			await db
				.insertInto("_emdash_api_tokens")
				.values({ id: emdash.ulid(), name, token_hash: hash, prefix, user_id: userId, scopes: JSON.stringify(scopes), expires_at: null })
				.execute();
		},
		findTokenOwner: async (name) => {
			const row = await db
				.selectFrom("_emdash_api_tokens")
				.select("user_id")
				.where("name", "=", name)
				.orderBy("created_at", "desc")
				.executeTakeFirst();
			return (row?.user_id as string | undefined) ?? null;
		},

		putHandoff: (token, handoff) => options.set(HANDOFF_PREFIX + token, handoff),
		takeHandoff: async (token) => {
			const name = HANDOFF_PREFIX + token;
			const value = await options.get<Handoff>(name);
			if (!value) return null;
			await options.delete(name);
			return value;
		},
		sweepHandoffs: async (now) => {
			const rows = await db.selectFrom("options").select(["name", "value"]).where("name", "like", `${HANDOFF_PREFIX}%`).execute();
			let removed = 0;
			for (const row of rows) {
				let expiresAt = 0;
				try {
					expiresAt = Number((JSON.parse(String(row.value)) as Handoff).expiresAt ?? 0);
				} catch {
					/* unreadable row: remove it */
				}
				if (expiresAt <= now) {
					await options.delete(String(row.name));
					removed++;
				}
			}
			return removed;
		},

		migrationStatus: async () => {
			const s = await emdash.getMigrationStatus(db);
			return { applied: s.applied.length, pending: s.pending.length };
		}
	};
}
