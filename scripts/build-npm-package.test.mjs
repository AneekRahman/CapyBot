import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptSource = readFileSync(join(root, "scripts", "build-npm-package.mjs"), "utf8");

describe("build-npm-package assembly script", () => {
  it("excludes enterprise from output and preserves source sentinel in isolated fixture", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "omb-build-npm-"));
    try {
      mkdirSync(join(fixtureDir, "scripts"), { recursive: true });
      mkdirSync(join(fixtureDir, "dist-server", "enterprise"), { recursive: true });
      mkdirSync(join(fixtureDir, "dist"), { recursive: true });

      writeFileSync(join(fixtureDir, "scripts", "build-npm-package.mjs"), scriptSource);

      writeFileSync(
        join(fixtureDir, "package.json"),
        JSON.stringify({
          version: "0.1.0-test",
          dependencies: {
            "@1password/sdk": "^0.1.0",
            "@duckdb/node-api": "^0.1.0",
            "@resvg/resvg-js": "^0.1.0",
          },
        }),
      );

      writeFileSync(join(fixtureDir, "LICENSE"), "Apache-2.0 License Text\n");

      writeFileSync(join(fixtureDir, "dist-server", "index.js"), "export const server = true;\n");
      writeFileSync(join(fixtureDir, "dist-server", "openmausbot.js"), "export const cli = true;\n");
      writeFileSync(join(fixtureDir, "dist-server", "enterprise-adapter.js"), "export const optionalAdapter = true;\n");
      writeFileSync(join(fixtureDir, "dist", "index.html"), "<!doctype html><title>Test</title>\n");

      const secretContent = "STALE_ENTERPRISE_SECRET_SENTINEL_DO_NOT_LEAK";
      const sentinelPath = join(fixtureDir, "dist-server", "enterprise", "sentinel.secret");
      writeFileSync(sentinelPath, secretContent);

      const stdout = execFileSync(process.execPath, [join(fixtureDir, "scripts", "build-npm-package.mjs")], {
        cwd: fixtureDir,
        encoding: "utf8",
      });

      expect(stdout).toContain("npm package assembled at");

      const outDir = join(fixtureDir, "release", "npm");

      expect(existsSync(join(outDir, "package.json"))).toBe(true);
      expect(existsSync(join(outDir, "cli.js"))).toBe(true);
      expect(existsSync(join(outDir, "dist", "index.html"))).toBe(true);
      expect(existsSync(join(outDir, "dist-server", "index.js"))).toBe(true);
      expect(existsSync(join(outDir, "dist-server", "openmausbot.js"))).toBe(true);
      expect(existsSync(join(outDir, "dist-server", "enterprise-adapter.js"))).toBe(true);

      expect(existsSync(join(outDir, "dist-server", "enterprise"))).toBe(false);
      expect(existsSync(join(outDir, "enterprise"))).toBe(false);

      expect(existsSync(sentinelPath)).toBe(true);
      expect(readFileSync(sentinelPath, "utf8")).toBe(secretContent);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
