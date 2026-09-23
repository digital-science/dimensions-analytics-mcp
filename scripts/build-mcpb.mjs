#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageName = "@digital-science-dsl/dimensions-analytics-mcp";
const pkg = JSON.parse(readFileSync(join(root, "apps/mcp/package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "mcpb/manifest.json"), "utf8"));
if (pkg.name !== packageName || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
  throw new Error("Invalid MCP package name or version");
}
if (!existsSync(join(root, "apps/mcp/dist/main.js"))) {
  throw new Error("Build the MCP package before building its desktop extension");
}

const temp = mkdtempSync(join(tmpdir(), "dimensions-mcpb-"));
const deployed = join(temp, "deployed");
const bundle = join(temp, "bundle");
const server = join(bundle, "server");
const output = join(root, "dist", "dimensions-analytics-mcp.mcpb");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && command === "pnpm.cmd",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function copyDependencies(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyDependencies(from, to);
    } else if (!existsSync(to) && existsSync(from)) {
      cpSync(from, to, { recursive: true, dereference: true });
    }
  }
}

try {
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "--filter",
    packageName,
    "deploy",
    "--prod",
    deployed,
  ]);
  mkdirSync(server, { recursive: true });
  for (const name of ["bin", "dist"]) {
    cpSync(join(deployed, name), join(server, name), { recursive: true });
  }
  const modules = join(server, "node_modules");
  mkdirSync(modules);
  copyDependencies(join(deployed, "node_modules"), modules);
  copyDependencies(join(deployed, "node_modules/.pnpm/node_modules"), modules);
  writeFileSync(join(server, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  manifest.version = pkg.version;
  writeFileSync(join(bundle, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(bundle, "README.md"), readFileSync(join(root, "mcpb/README.md")));

  const cli = join(root, "node_modules/@anthropic-ai/mcpb/dist/cli/cli.js");
  run(process.execPath, [cli, "validate", bundle]);
  mkdirSync(join(root, "dist"), { recursive: true });
  const packed = join(temp, "dimensions-analytics-mcp.mcpb");
  run(process.execPath, [cli, "pack", bundle, packed]);
  renameSync(packed, output);
  console.log(`Built ${output} (${pkg.version})`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
