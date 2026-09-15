import type { Handoff, PlatformStore, Role, StoreUser } from "../src/lib/store";
import { ROLE_LEVEL } from "../src/lib/store";
import type { Deps } from "../src/lib/handlers";

export interface MemoryState {
	options: Map<string, unknown>;
	users: StoreUser[];
	tokens: Array<{ userId: string; name: string; hash: string; prefix: string; scopes: string[]; createdAt: number }>;
	handoffs: Map<string, Handoff>;
	migrations: { applied: number; pending: number };
}

export function createMemoryStore(seedState: Partial<MemoryState> = {}): PlatformStore & { state: MemoryState } {
	const state: MemoryState = {
		options: new Map(),
		users: [],
		tokens: [],
		handoffs: new Map(),
		migrations: { applied: 12, pending: 0 },
		...seedState
	};
	let nextId = 1;
	return {
		state,
		getOption: async <T>(name: string) => (state.options.has(name) ? (state.options.get(name) as T) : null),
		setOption: async (name, value) => void state.options.set(name, value),
		setOptionIfAbsent: async (name, value) => {
			if (!state.options.has(name)) state.options.set(name, value);
		},
		deleteOption: async (name) => void state.options.delete(name),

		findUserByEmail: async (email) => state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
		findUserById: async (id) => state.users.find((u) => u.id === id) ?? null,
		createUser: async ({ email, name, role }: { email: string; name: string; role: Role }) => {
			const u: StoreUser = { id: `u${nextId++}`, email, name, role: ROLE_LEVEL[role], disabled: false };
			state.users.push(u);
			return u;
		},
		setUserRole: async (id, role) => {
			const u = state.users.find((x) => x.id === id);
			if (u) u.role = ROLE_LEVEL[role];
		},
		markEmailVerified: async () => {},

		replaceToken: async ({ userId, name, hash, prefix, scopes }) => {
			state.tokens = state.tokens.filter((t) => !(t.userId === userId && t.name === name));
			state.tokens.push({ userId, name, hash, prefix, scopes, createdAt: Date.now() });
		},
		findTokenOwner: async (name) => [...state.tokens].reverse().find((t) => t.name === name)?.userId ?? null,

		putHandoff: async (token, handoff) => void state.handoffs.set(token, handoff),
		takeHandoff: async (token) => {
			const h = state.handoffs.get(token) ?? null;
			state.handoffs.delete(token);
			return h;
		},
		sweepHandoffs: async (now) => {
			let n = 0;
			for (const [k, v] of state.handoffs) if (v.expiresAt <= now) (state.handoffs.delete(k), n++);
			return n;
		},
		migrationStatus: async () => state.migrations
	};
}

export function createDeps(overrides: Partial<Deps> & { store?: ReturnType<typeof createMemoryStore> } = {}) {
	const store = overrides.store ?? createMemoryStore();
	let tokenCounter = 0;
	const deps: Deps & { store: ReturnType<typeof createMemoryStore> } = {
		store,
		seed: {
			load: async () => ({ version: 1, settings: { title: "Seed Title" }, collections: [] }),
			validate: () => ({ valid: true }),
			apply: async () => ({ collections: 3, content: 4 })
		},
		tokens: {
			generate: () => {
				tokenCounter++;
				return { raw: `ec_pat_raw${tokenCounter}`, hash: `hash${tokenCounter}`, prefix: "ec_pat_" };
			},
			scopes: ["content:read", "content:write"]
		},
		now: () => 1_700_000_000_000,
		...overrides
	};
	return deps;
}
