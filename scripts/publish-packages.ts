#!/usr/bin/env tsx

/**
 * Publishes all non-private workspace packages in topological order.
 * @module scripts/publish-packages
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKSPACE_DIRS = ["apps"];

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
}

interface PackageInfo {
  path: string;
  name: string;
  version: string;
  deps: string[];
}

async function discoverPackages(): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  for (const dir of WORKSPACE_DIRS) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(dir, entry.name);
      const pkgJsonPath = join(pkgPath, "package.json");
      try {
        const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8")) as PackageJson;
        if (!pkgJson.private) {
          const deps = Object.keys(pkgJson.dependencies ?? {}).filter((d) =>
            d.startsWith("@digital-science-dsl/"),
          );
          packages.push({
            path: pkgPath,
            name: pkgJson.name,
            version: pkgJson.version,
            deps,
          });
        }
      } catch {
        // No package.json
      }
    }
  }

  return packages;
}

function topoSort(packages: PackageInfo[]): PackageInfo[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const visited = new Set<string>();
  const sorted: PackageInfo[] = [];

  function visit(pkg: PackageInfo): void {
    if (visited.has(pkg.name)) return;
    visited.add(pkg.name);
    for (const dep of pkg.deps) {
      const depPkg = byName.get(dep);
      if (depPkg) visit(depPkg);
    }
    sorted.push(pkg);
  }

  for (const pkg of packages) visit(pkg);
  return sorted;
}

function publishPackage(pkg: PackageInfo): boolean {
  console.log(`\nPublishing ${pkg.name}@${pkg.version}...`);

  const packDir = mkdtempSync(join(tmpdir(), "dimensions-analytics-mcp-pack-"));
  const pack = spawnSync("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: pkg.path,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const packOutput = `${pack.stdout ?? ""}${pack.stderr ?? ""}`;
  if (pack.status !== 0) {
    console.error(`[error] Failed to pack ${pkg.name}@${pkg.version}`);
    console.error(packOutput);
    rmSync(packDir, { recursive: true, force: true });
    return false;
  }

  const tarballName = `${pkg.name.replace(/^@/, "").replace(/\//g, "-")}-${pkg.version}.tgz`;
  const tarballPath = join(packDir, tarballName);
  const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;

  const npmArgs = ["publish", tarballPath, "--access", "public"];
  if (token) {
    const npmrcPath = join(packDir, ".npmrc.publish");
    writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`, { mode: 0o600 });
    npmArgs.push("--userconfig", npmrcPath);
  }

  const result = spawnSync("npm", npmArgs, {
    cwd: pkg.path,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  rmSync(packDir, { recursive: true, force: true });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (result.status === 0) {
    console.log(`[ok] ${pkg.name}@${pkg.version} published`);
    return true;
  }

  const lowerOutput = output.toLowerCase();
  if (
    lowerOutput.includes("already exists") ||
    lowerOutput.includes("previously published") ||
    lowerOutput.includes("cannot publish over") ||
    lowerOutput.includes("409 conflict")
  ) {
    console.log(`[skip] ${pkg.name}@${pkg.version} already published`);
    return true;
  }

  console.error(`[error] Failed to publish ${pkg.name}@${pkg.version}`);
  console.error(output);
  return false;
}

async function main(): Promise<void> {
  console.log("Discovering packages...");
  const sorted = topoSort(await discoverPackages());
  console.log(`Found ${sorted.length} packages: ${sorted.map((p) => p.name).join(", ")}`);

  let failed = false;
  for (const pkg of sorted) {
    if (!publishPackage(pkg)) failed = true;
  }

  if (failed) {
    console.error("\n[error] Some packages failed to publish");
    process.exit(1);
  }

  console.log("\n[ok] All packages published successfully");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
