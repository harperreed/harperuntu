// ABOUTME: Verifies the sanitized dotfiles/ assets are complete and Linux-safe.
// ABOUTME: Guards against macOS-isms, hardcoded /Users/harper paths, and missing config keys.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(repoRoot, p), "utf8");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(repoRoot, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(repoRoot, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

test("gitconfig carries Harper's ergonomics", () => {
  const gitconfig = read("dotfiles/gitconfig");
  for (const needle of [
    "name = Harper Reed",
    "email = harper@nata2.org",
    "rebase = true",
    "autoSetupRemote = true",
    "default = current",
    "conflictstyle = zdiff3",
    "algorithm = histogram",
    "tool = difftastic",
    "defaultBranch = main",
    "sort = -committerdate",
    "verbose = true",
    "autoStash = true",
    "fsckobjects = true",
    "gh auth git-credential",
    "git-lfs filter-process",
    "st = status",
    "lola = log --graph --decorate --pretty=oneline --abbrev-commit --all",
  ]) {
    assert.ok(gitconfig.includes(needle), `gitconfig should contain "${needle}"`);
  }
});

test("gitconfig drops machine-specific config", () => {
  const gitconfig = read("dotfiles/gitconfig");
  for (const banned of ["hooksPath", "excludesfile", "insteadOf", "signingkey", "/opt/homebrew", "git-media"]) {
    assert.ok(!gitconfig.includes(banned), `gitconfig must not contain "${banned}"`);
  }
});

test("global git ignore merges both source files", () => {
  const ignore = read("dotfiles/git-ignore");
  assert.ok(ignore.includes("**/.claude/settings.local.json"));
  assert.ok(ignore.includes(".jj"));
});

test("dotfiles are Linux-safe and free of hardcoded home paths", () => {
  for (const file of walk("dotfiles")) {
    const content = readFileSync(join(repoRoot, file), "latin1");
    for (const banned of ["/Users/harper", "pbcopy", "pbpaste", "qlmanage", "osascript", "reattach-to-user-namespace"]) {
      assert.ok(!content.includes(banned), `${file} must not contain "${banned}"`);
    }
  }
});

test("tmux config keeps Harper's bindings, loses macOS clipboard and TPM", () => {
  const tmux = read("dotfiles/tmux.conf");
  assert.ok(tmux.includes("set -g prefix C-a"), "screen-style prefix");
  assert.ok(tmux.includes("set -g mode-keys vi"));
  assert.ok(tmux.includes("set -g set-clipboard on"), "OSC 52 clipboard");
  assert.ok(tmux.includes("copy-selection-and-cancel"));
  assert.ok(!tmux.includes("@plugin"), "TPM plugins are not installed in the image");
  assert.ok(!tmux.includes("tpm"), "tpm run line would error at tmux start");
});

test("direnvrc ships the uv layout", () => {
  const direnvrc = read("dotfiles/direnvrc");
  assert.ok(direnvrc.includes("layout_uv()"));
  assert.ok(direnvrc.includes("uv venv"));
  assert.ok(direnvrc.includes("export UV_ACTIVE=1"));
});

test("atuin config mirrors Harper's active settings", () => {
  const atuin = read("dotfiles/atuin-config.toml");
  for (const needle of [
    'dialect = "us"',
    "auto_sync = true",
    'sync_frequency = "10m"',
    'filter_mode = "global"',
    "workspaces = true",
    'filter_mode_shell_up_key_binding = "directory"',
    "show_preview = true",
    "enter_accept = true",
  ]) {
    assert.ok(atuin.includes(needle), `atuin config should contain ${needle}`);
  }
});
