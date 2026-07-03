// ABOUTME: Verifies package-manager config files keep npm and pnpm settings separated.
// ABOUTME: Prevents npm test output from warning on pnpm-only project settings.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const npmrc = readFileSync(new URL("../pi-extension/.npmrc", import.meta.url), "utf8");
const pnpmrcPath = new URL("../pi-extension/.pnpmrc", import.meta.url);
const pnpmrc = existsSync(pnpmrcPath) ? readFileSync(pnpmrcPath, "utf8") : "";

test("keeps pnpm-only settings out of npm config", () => {
  assert.ok(!npmrc.includes("minimum-release-age"), "npm warns when pnpm-only minimum-release-age is in .npmrc");
  assert.match(pnpmrc, /^minimum-release-age=10080$/m);
});
