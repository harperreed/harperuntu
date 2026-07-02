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

const expectedBinScripts = [
  "biggest_files.sh", "domaininfo.sh", "e", "external_ip.sh", "get_ssl_cert.sh",
  "git-all", "git-amend", "git-credit", "git-delete-local-merged", "git-edit-new",
  "git-nuke", "git-promote", "git-track", "git-undo", "git-unpushed",
  "git-unpushed-stat", "git-up", "gpg_dec.sh", "headers", "jpg2svg.sh",
  "lowerit.sh", "png2svg.sh", "spark", "tarscp", "tm", "whatismyip",
];

test("ships the Linux-safe personal bin scripts", () => {
  const present = readdirSync(join(repoRoot, "dotfiles/bin")).sort();
  assert.deepEqual(present, [...expectedBinScripts].sort());
  for (const script of expectedBinScripts) {
    const mode = statSync(join(repoRoot, "dotfiles/bin", script)).mode;
    assert.ok(mode & 0o111, `${script} must be executable`);
  }
});

const expectedFishFiles = [
  "15-harper-aliases.fish", "17-qol.fish", "50-greeting.fish", "70-keys.fish",
  "71-nav.fish", "80-git-fzf.fish", "85-abbreviations.fish",
];

test("ships sanitized fish conf.d extras", () => {
  const present = readdirSync(join(repoRoot, "dotfiles/fish/conf.d")).sort();
  assert.deepEqual(present, [...expectedFishFiles].sort());
});

test("fish abbreviations use Linux equivalents", () => {
  const abbr = read("dotfiles/fish/conf.d/85-abbreviations.fish");
  assert.ok(abbr.includes("abbr -a g git"));
  assert.ok(abbr.includes("apt"), "update/cleanup abbrs should use apt");
  assert.ok(!abbr.includes("brew"));
  assert.ok(!abbr.includes("ipconfig getifaddr"), "localip must not use macOS ipconfig");
});

test("fish qol keeps bat manpager, drops macOS clipboard helpers", () => {
  const qol = read("dotfiles/fish/conf.d/17-qol.fish");
  assert.ok(qol.includes("MANPAGER"));
  for (const banned of ["function cb", "function pb", "function ql"]) {
    assert.ok(!qol.includes(banned), `17-qol.fish must not define ${banned}`);
  }
});

test("greeting drops the macOS keychain check", () => {
  const greeting = read("dotfiles/fish/conf.d/50-greeting.fish");
  assert.ok(greeting.includes("figlet"));
  assert.ok(!greeting.toLowerCase().includes("keychain"));
  assert.ok(!greeting.includes("security "));
});

test("tarscp uses a bash shebang", () => {
  const tarscp = read("dotfiles/bin/tarscp");
  assert.ok(tarscp.startsWith("#!/bin/bash\n"), "tarscp must start with #!/bin/bash");
});

test("greeting does not reference unshipped font files", () => {
  const greeting = read("dotfiles/fish/conf.d/50-greeting.fish");
  assert.ok(!greeting.includes(".config/fonts"), "50-greeting.fish must not reference .config/fonts");
});
