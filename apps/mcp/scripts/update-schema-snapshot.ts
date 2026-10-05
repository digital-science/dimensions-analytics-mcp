/**
 * Refreshes the describe schema snapshot bundled with the package.
 *
 * The snapshot lets a first launch (no disk cache yet) answer MCP `initialize`
 * without waiting on the API. Run before a release when the DSL schema changes:
 *   DIMENSIONS_API_KEY=... pnpm run schema:snapshot
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDimensionsClient } from "../src/dsl/create-client.js";
import { extractDescribeSchema, extractDescribeVersion } from "../src/dsl/schema/index.js";
import { normalizeInstanceBaseUrl } from "../src/mcp/profile-urls.js";

const client = createDimensionsClient({
  mode: "local",
  apiKey: process.env.DIMENSIONS_API_KEY,
  baseUrl: normalizeInstanceBaseUrl(),
});
const [schema, version] = await Promise.all([
  client.rawQuery("describe schema"),
  client.rawQuery("describe version"),
]);
const envelope = {
  cachedAt: new Date().toISOString(),
  version: extractDescribeVersion(version),
  schema: extractDescribeSchema(schema),
};
const target = fileURLToPath(new URL("../src/dsl/schema/snapshot.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(envelope)}\n`);
console.log(`Wrote ${target} (DSL ${envelope.version ?? "unknown"})`);
