import { defineConfig } from "vitest/config";

// The command line tool under cli/ runs its own tests with node:test (npm run check in cli/); vitest leaves it alone.
export default defineConfig({ test: { exclude: ["**/node_modules/**", "cli/**"] } });
