# Harper Dev Ergonomics + Toolchain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the harperuntu image feel like Harper's machine: translated git config, Linux-safe dotfile assets, JS/Rust toolchains via mise, fast dev utilities, and an in-image smoke test that gates the build.

**Architecture:** Sanitized dotfiles are snapshotted into a new `dotfiles/` directory in this repo (the docker build context) and `COPY`'d into `/home/exedev`. Tools install apt-first (security updates ride the weekly rebuild); tools absent from noble install via mise's aqua backend. Every capability is asserted twice: contract tests run on the host against the Dockerfile/asset text (`node --test "tests/*.test.mjs"`), and `smoke-test.sh` runs inside the image as a build gate.

**Tech Stack:** Dockerfile (Ubuntu 24.04 "noble", BuildKit heredocs), bash, fish, mise, node:test contract tests.

## Global Constraints

- Image base is `ubuntu:24.04` (noble); apt package names must exist in noble (verified: `shellcheck` 0.9.0, `shfmt` 3.8.0, `git-lfs` 3.4.1, `hyperfine` 1.18.0, `just` 1.21.0).
- Dockerfile `SHELL` is `["/bin/bash", "-euxo", "pipefail", "-c"]` — every command in every `RUN` must succeed.
- The dev user is `exedev` (UID 1000, home `/home/exedev`, login shell fish). Files copied into `/home/exedev` must end up owned `exedev:exedev` (use `COPY --chown=exedev:exedev`).
- The string `/Users/harper` must not appear anywhere in `dotfiles/` or the Dockerfile. Neither may `pbcopy`, `pbpaste`, `qlmanage`, `osascript`, or `brew` (as a command — a comment naming apt alternatives is fine).
- No secrets: never copy `~/.local/share/atuin/key`, `~/.local/share/atuin/session`, `~/.gitconfig.local`, `~/.secrets/`, or SSH keys.
- Every new script/config file starts with two `ABOUTME:` comment lines.
- Source dotfiles live on THIS macOS host under `/Users/harper` — copy from them with `cp`, then sanitize; do not retype file bodies from memory.
- Contract tests (`node --test "tests/*.test.mjs"`) must pass before every commit. Never use `--no-verify`.
- Commits: conventional format, imperative, present tense.
- Existing tests in `tests/dockerfile_contract.test.mjs` must keep passing (they pin fish/mise/atuin/fd/bat setup).

---

### Task 1: Checkpoint the in-progress fish/mise/atuin work

The working tree already contains uncommitted Dockerfile changes (fish login shell, dotfile tool packages, mise + atuin installs, fisher plugins) and the untracked `tests/dockerfile_contract.test.mjs` that pins them. Commit them as the branch's baseline so later tasks produce clean diffs.

**Files:**
- Modify: none (commit existing state)
- Test: `tests/dockerfile_contract.test.mjs` (already written)

**Interfaces:**
- Consumes: nothing
- Produces: a clean working tree; later tasks commit only their own changes

- [ ] **Step 1: Run the existing contract tests**

Run: `node --test "tests/*.test.mjs"`
Expected: 4 tests pass, 0 fail

- [ ] **Step 2: Commit the existing work**

```bash
git add Dockerfile tests/dockerfile_contract.test.mjs
git commit -m "feat: adopt fish shell with dotfile tooling, mise, and atuin"
```

- [ ] **Step 3: Verify clean tree**

Run: `git status --porcelain`
Expected: empty output (docs/ may appear if the plan file is untracked; leave it for the final task)

---

### Task 2: Translated global git config + global excludes

**Files:**
- Create: `dotfiles/gitconfig`
- Create: `dotfiles/git-ignore`
- Modify: `Dockerfile` (asset COPY block; delete the now-redundant `RUN git config --global init.defaultBranch main`)
- Test: `tests/dotfiles_assets.test.mjs` (create), `tests/dockerfile_contract.test.mjs` (extend)

**Interfaces:**
- Consumes: `exedev` user and `/home/exedev/.config` dirs from the existing Dockerfile
- Produces: `dotfiles/` directory pattern + the Dockerfile "harper dotfile assets" COPY block that Tasks 3, 4, 6 append to; `expect_git`-able config keys the smoke test (Task 7) asserts

Translation decisions (already made — do not relitigate):
- `diff.tool = difftastic` (his real config; delta is NOT used). Add an explicit `[difftool "difftastic"]` cmd so `git difftool` works.
- `merge.tool` becomes `nvimdiff` (his config defines the nvimdiff mergetool; his macOS `meld` is a GUI app and useless headless).
- Dropped deliberately: `core.hooksPath` (hooks depend on roborev/llm), `core.excludesfile` (we use git's default XDG path instead), `[gpg]`/signing (keys are machine-local), `url insteadOf git@github.com:` (a VM without Harper's SSH keys must clone public repos over https), `safe.directory /private/tmp` (macOS path), `[filter "media"]` (dead git-media tool), `[hub]`, and the `llm`/`llm-staged`/`pr` aliases (need the `llm` CLI).
- Kept: identity, simple aliases, colors, whitespace, push/pull/init/diff/merge/branch/commit/rebase settings, transfer/fetch/receive fsckobjects, gh credential helper (gh is in the image), LFS filter (equivalent to `git lfs install`), `[include] path = .gitconfig.local` as a VM-local override hook.

- [ ] **Step 1: Write the failing tests**

Create `tests/dotfiles_assets.test.mjs`:

```javascript
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
```

Also append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("copies translated git config into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/gitconfig \/home\/exedev\/\.gitconfig/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/git-ignore \/home\/exedev\/\.config\/git\/ignore/);
  assert.ok(!dockerfile.includes("git config --global init.defaultBranch"), "defaultBranch now lives in dotfiles/gitconfig");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `dotfiles/gitconfig` ENOENT, plus the new dockerfile_contract test failing

- [ ] **Step 3: Create `dotfiles/gitconfig`**

```ini
# ABOUTME: Harper's global git configuration, translated for the harperuntu Linux image.
# ABOUTME: Sanitized from macOS ~/.gitconfig: no signing keys, no absolute host paths, no llm-CLI aliases.
[user]
	name = Harper Reed
	email = harper@nata2.org
[github]
	user = harperreed
[alias]
	st = status
	ci = commit
	br = branch
	co = checkout
	df = diff
	lg = log -p
	lol = log --graph --decorate --pretty=oneline --abbrev-commit
	lola = log --graph --decorate --pretty=oneline --abbrev-commit --all
	ls = ls-files
[color]
	ui = true
[color "diff"]
	whitespace = red reverse
[core]
	whitespace = fix,-indent-with-non-tab,trailing-space,cr-at-eol
	editor = nvim
[push]
	default = current
	autoSetupRemote = true
[pull]
	rebase = true
[init]
	defaultBranch = main
[diff]
	algorithm = histogram
	tool = difftastic
[difftool]
	prompt = false
[difftool "difftastic"]
	cmd = difft "$LOCAL" "$REMOTE"
[merge]
	conflictstyle = zdiff3
	tool = nvimdiff
[mergetool]
	prompt = false
[mergetool "nvimdiff"]
	cmd = nvim -d "$BASE" "$LOCAL" "$REMOTE" -c "wincmd l"
[branch]
	sort = -committerdate
[commit]
	verbose = true
[rebase]
	autoStash = true
[transfer]
	fsckobjects = true
[fetch]
	fsckobjects = true
[receive]
	fsckObjects = true
[credential "https://github.com"]
	helper = 
	helper = !gh auth git-credential
[credential "https://gist.github.com"]
	helper = 
	helper = !gh auth git-credential
[filter "lfs"]
	process = git-lfs filter-process
	required = true
	clean = git-lfs clean -- %f
	smudge = git-lfs smudge -- %f
[include]
	path = .gitconfig.local
```

Note: the two `helper = ` lines with trailing space are intentional (they reset the credential helper list). Preserve them exactly.

- [ ] **Step 4: Create `dotfiles/git-ignore`**

```gitignore
# ABOUTME: Global git excludes for the harperuntu image.
# ABOUTME: Merged from Harper's ~/.config/git/ignore and ~/.gitignore_global.
**/.claude/settings.local.json
.jj
```

(No `core.excludesFile` pointer is needed: `~/.config/git/ignore` is git's default global excludes path.)

- [ ] **Step 5: Wire into the Dockerfile**

In the Dockerfile, extend the existing mkdir block (currently `RUN mkdir -p /home/exedev /home/exedev/.config/shelley /home/exedev/.config/fish/conf.d /home/exedev/.config/bin && ...`) to create all asset dirs, and add the COPY block right after it, BEFORE `USER exedev`:

```dockerfile
RUN mkdir -p /home/exedev /home/exedev/.config/shelley /home/exedev/.config/fish/conf.d /home/exedev/.config/bin \
        /home/exedev/.config/git /home/exedev/.config/direnv /home/exedev/.config/atuin /home/exedev/.config/mise && \
    chown -R exedev:exedev /home/exedev /home/exedev/.config

# Harper's sanitized dotfile assets (see dotfiles/ in the repo).
COPY --chown=exedev:exedev dotfiles/gitconfig /home/exedev/.gitconfig
COPY --chown=exedev:exedev dotfiles/git-ignore /home/exedev/.config/git/ignore
```

Then DELETE these two lines further down (init.defaultBranch now comes from dotfiles/gitconfig):

```dockerfile
# Configure git to use 'main' as default branch name
RUN git config --global init.defaultBranch main
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add dotfiles/gitconfig dotfiles/git-ignore tests/dotfiles_assets.test.mjs tests/dockerfile_contract.test.mjs Dockerfile
git commit -m "feat: bake translated global git config into the image"
```

---

### Task 3: tmux, direnv, and atuin configs

**Files:**
- Create: `dotfiles/tmux.conf` (copied from `/Users/harper/.tmux.conf`, sanitized)
- Create: `dotfiles/direnvrc` (copied from `/Users/harper/.config/direnv/direnvrc`, verbatim + header)
- Create: `dotfiles/atuin-config.toml`
- Modify: `Dockerfile` (extend the asset COPY block from Task 2)
- Test: `tests/dotfiles_assets.test.mjs` (extend), `tests/dockerfile_contract.test.mjs` (extend)

**Interfaces:**
- Consumes: the "harper dotfile assets" COPY block introduced in Task 2
- Produces: `~/.tmux.conf`, `~/.config/direnv/direnvrc`, `~/.config/atuin/config.toml` in-image; file paths the smoke test (Task 7) asserts exist

- [ ] **Step 1: Write the failing tests**

Append to `tests/dotfiles_assets.test.mjs`:

```javascript
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
```

Append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("copies tmux, direnv, and atuin configs into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/tmux\.conf \/home\/exedev\/\.tmux\.conf/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/direnvrc \/home\/exedev\/\.config\/direnv\/direnvrc/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/atuin-config\.toml \/home\/exedev\/\.config\/atuin\/config\.toml/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — the three new asset files don't exist

- [ ] **Step 3: Create `dotfiles/tmux.conf` from the real file**

```bash
cp /Users/harper/.tmux.conf dotfiles/tmux.conf
```

Then make exactly three edits:

1. Prepend the header:

```tmux
# ABOUTME: Harper's tmux configuration, translated for the harperuntu Linux image.
# ABOUTME: Same bindings as macOS; clipboard via OSC 52 instead of pbcopy; TPM plugins omitted.
```

2. Replace the pbcopy bind. The source lines:

```tmux
# Copy to macOS clipboard via pbcopy (primary)
bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
```

become:

```tmux
# Copy into the tmux buffer; set-clipboard (OSC 52) forwards it to the local clipboard over SSH.
bind -T copy-mode-vi y send-keys -X copy-selection-and-cancel
```

3. Delete the TPM block at the end of the file (the `# TPM plugins` comment, the three `set -g @plugin` lines, the `@continuum-restore`/`@continuum-save-interval`/`@resurrect-capture-pane-contents` lines, and `run '~/.tmux/plugins/tpm/tpm'`). TPM is not cloned in the image, and the `run` line errors at startup when missing.

Verify: `grep -cE 'pbcopy|@plugin|tpm' dotfiles/tmux.conf` prints `0`.

- [ ] **Step 4: Create `dotfiles/direnvrc` from the real file**

```bash
cp /Users/harper/.config/direnv/direnvrc dotfiles/direnvrc
```

Prepend the header (the file is already Linux-safe):

```bash
# ABOUTME: direnv stdlib extensions for the harperuntu image.
# ABOUTME: layout_uv auto-creates and activates a uv-managed .venv (from Harper's dotfiles).
```

- [ ] **Step 5: Create `dotfiles/atuin-config.toml`**

```toml
# ABOUTME: Atuin shell-history configuration for the harperuntu image.
# ABOUTME: Harper's active settings only; sync activates after `atuin login` (no keys are baked in).
dialect = "us"
auto_sync = true
update_check = true
sync_frequency = "10m"
filter_mode = "global"
workspaces = true
filter_mode_shell_up_key_binding = "directory"
style = "auto"
show_preview = true
enter_accept = true
```

- [ ] **Step 6: Extend the Dockerfile COPY block**

After the two git COPY lines from Task 2, add:

```dockerfile
COPY --chown=exedev:exedev dotfiles/tmux.conf /home/exedev/.tmux.conf
COPY --chown=exedev:exedev dotfiles/direnvrc /home/exedev/.config/direnv/direnvrc
COPY --chown=exedev:exedev dotfiles/atuin-config.toml /home/exedev/.config/atuin/config.toml
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add dotfiles/tmux.conf dotfiles/direnvrc dotfiles/atuin-config.toml tests/ Dockerfile
git commit -m "feat: add tmux, direnv, and atuin configs from dotfiles"
```

---

### Task 4: Linux-safe personal bin scripts + fish conf.d extras

**Files:**
- Create: `dotfiles/bin/` — 26 scripts copied from `/Users/harper/.config/bin/`
- Create: `dotfiles/fish/conf.d/` — 7 sanitized files from `/Users/harper/.config/fish/`
- Modify: `Dockerfile` (extend the asset COPY block)
- Test: `tests/dotfiles_assets.test.mjs` (extend), `tests/dockerfile_contract.test.mjs` (extend)

**Interfaces:**
- Consumes: asset COPY block (Task 2); `$HOME/.config/bin` is already on fish PATH via `00-exeuntu.fish`
- Produces: `~/.config/bin/*` and `~/.config/fish/conf.d/*` in-image

- [ ] **Step 1: Write the failing tests**

Append to `tests/dotfiles_assets.test.mjs`:

```javascript
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
```

Append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("copies personal bin scripts and fish extras into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/bin\/ \/home\/exedev\/\.config\/bin\//);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/fish\/conf\.d\/ \/home\/exedev\/\.config\/fish\/conf\.d\//);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `dotfiles/bin` ENOENT

- [ ] **Step 3: Copy the bin scripts**

```bash
mkdir -p dotfiles/bin
cd dotfiles/bin
for s in biggest_files.sh domaininfo.sh e external_ip.sh get_ssl_cert.sh \
         git-all git-amend git-credit git-delete-local-merged git-edit-new \
         git-nuke git-promote git-track git-undo git-unpushed \
         git-unpushed-stat git-up gpg_dec.sh headers jpg2svg.sh \
         lowerit.sh png2svg.sh spark tarscp tm whatismyip; do
  cp -p "/Users/harper/.config/bin/$s" .
done
cd ../..
```

Excluded on purpose: `battery*`, `dns-flush`, `marked`, `journal`, `todo`, `unlock.sh`, `vkb`, `claude-projects`, `sync-claude-projects` (macOS-only); `git-copy-branch-name`, `gpg_enc.sh` (pbcopy); `git-wtf` (needs ruby, not in image); `git-secrets` (large vendored tool); `mirror_site.sh` (needs s3cmd); `pr.sh` (needs the `llm` CLI).

Then sanitize `jpg2svg.sh` and `png2svg.sh`: each mentions installing dependencies via brew in a comment. Change those comments to the apt equivalent, e.g. `# requires: sudo apt install imagemagick potrace` (both packages are already installed in the image). Make no other changes.

Verify: `grep -rlE 'pbcopy|/Users/harper|brew' dotfiles/bin/` prints nothing.

- [ ] **Step 4: Copy + sanitize the fish conf.d extras**

```bash
mkdir -p dotfiles/fish/conf.d
cp /Users/harper/.config/fish/aliases.fish        dotfiles/fish/conf.d/15-harper-aliases.fish
cp /Users/harper/.config/fish/conf.d/17-qol.fish  dotfiles/fish/conf.d/17-qol.fish
cp /Users/harper/.config/fish/conf.d/50-greeting.fish dotfiles/fish/conf.d/50-greeting.fish
cp /Users/harper/.config/fish/conf.d/70-keys.fish dotfiles/fish/conf.d/70-keys.fish
cp /Users/harper/.config/fish/conf.d/71-nav.fish  dotfiles/fish/conf.d/71-nav.fish
cp /Users/harper/.config/fish/conf.d/80-git-fzf.fish dotfiles/fish/conf.d/80-git-fzf.fish
cp /Users/harper/.config/fish/conf.d/85-abbreviations.fish dotfiles/fish/conf.d/85-abbreviations.fish
```

Sanitize each (keep everything else byte-identical, including comments):

1. `15-harper-aliases.fish`: delete the `# macOS Finder helpers ...` comment plus the whole `if test (uname) = "Darwin" ... end` block (showfiles/hidefiles are Finder-only).
2. `17-qol.fish`: keep MANPAGER/LESS settings; delete the `cb`/`pb` (pbcopy/pbpaste) and `ql` (qlmanage) function definitions and any comments that describe only them.
3. `50-greeting.fish`: delete the `_check_keychain_status` function definition and its call site (macOS `security` CLI). Keep the figlet/lolcat/fortune banner (figlet, lolcat, fortune-mod are in the image's apt list).
4. `70-keys.fish`: no changes (already portable).
5. `71-nav.fish`: no changes (already portable — lsof and fzf are installed).
6. `80-git-fzf.fish`: no changes (already portable).
7. `85-abbreviations.fish`: replace the System and Network macOS lines:
   - `abbr -a update 'brew update && brew upgrade'` → `abbr -a update 'sudo apt update && sudo apt upgrade'`
   - `abbr -a cleanup 'brew cleanup'` → `abbr -a cleanup 'sudo apt autoremove && sudo apt clean'`
   - `abbr -a localip 'ipconfig getifaddr en0'` → `abbr -a localip 'hostname -I | cut -d" " -f1'`
   - `abbr -a dc docker-compose` → `abbr -a dc 'docker compose'` (image ships compose v2 as a docker plugin)

If a file's real content differs from what this plan expects (these are live dotfiles), keep the real content and apply the same category of sanitization: remove macOS-only constructs, keep everything portable. The contract tests define the acceptance bar.

Verify: `grep -rlE 'pbcopy|pbpaste|qlmanage|brew|/Users/harper|Darwin' dotfiles/fish/` prints nothing.

- [ ] **Step 5: Extend the Dockerfile COPY block**

After the Task 3 COPY lines, add:

```dockerfile
COPY --chown=exedev:exedev dotfiles/bin/ /home/exedev/.config/bin/
COPY --chown=exedev:exedev dotfiles/fish/conf.d/ /home/exedev/.config/fish/conf.d/
```

(Directory COPY merges into the existing conf.d; fisher later adds its own files as exedev. No collision: the image's own file is `00-exeuntu.fish`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add dotfiles/bin dotfiles/fish tests/ Dockerfile
git commit -m "feat: ship Linux-safe personal bin scripts and fish config"
```

---

### Task 5: Dev utilities via apt

**Files:**
- Modify: `Dockerfile` (one line in the main apt install list)
- Test: `tests/dockerfile_contract.test.mjs` (extend)

**Interfaces:**
- Consumes: the main `apt-get install -y` list in the first big RUN
- Produces: `shellcheck`, `shfmt`, `git-lfs`, `hyperfine`, `just` binaries the smoke test asserts

- [ ] **Step 1: Write the failing test**

Append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("installs apt dev utilities for fast dev loops", () => {
  for (const pkg of ["shellcheck", "shfmt", "git-lfs", "hyperfine", "just"]) {
    assert.match(dockerfile, new RegExp(`\\b${pkg}\\b`), `Dockerfile should install ${pkg}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — shellcheck/shfmt/git-lfs/hyperfine/just not in Dockerfile

- [ ] **Step 3: Add the packages**

In the main apt list, directly after the line

```
		fd-find fzf zoxide direnv bat eza tmux hugo nmap pv mosh grc \
```

add:

```
		shellcheck shfmt git-lfs hyperfine just \
```

(All five verified present in noble: shellcheck 0.9.0, shfmt 3.8.0, git-lfs 3.4.1, hyperfine 1.18.0, just 1.21.0. jq is already installed; mikefarah yq arrives via mise in Task 6.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add Dockerfile tests/dockerfile_contract.test.mjs
git commit -m "feat: install shellcheck, shfmt, git-lfs, hyperfine, and just via apt"
```

---

### Task 6: mise toolchain bootstrap (node, bun, rust, release-binary tools) + corepack/pnpm

**Files:**
- Create: `dotfiles/mise-config.toml`
- Modify: `Dockerfile` (COPY into config dir; `mise install` + corepack RUNs as exedev; shims on PATH in the fish heredoc and `.bashrc`)
- Test: `tests/dotfiles_assets.test.mjs` (extend), `tests/dockerfile_contract.test.mjs` (extend)

**Interfaces:**
- Consumes: `/usr/local/bin/mise` (already installed), asset COPY block, the `00-exeuntu.fish` heredoc, the `.bashrc` PATH RUN
- Produces: node/bun/rust + ast-grep/difftastic/lazygit/ripgrep-all/watchexec/yq under `~/.local/share/mise`; `pnpm` via corepack; shims dir on PATH for non-interactive shells (what agents use)

Decisions (already made): go stays as the system install from go.dev (do NOT add go to mise — it would shadow and duplicate it). python stays with uv + apt python3. claude/codex/pi stay with the exeuntu updaters. zig/java/firebase from Harper's config are deliberately omitted from the image.

- [ ] **Step 1: Write the failing tests**

Append to `tests/dotfiles_assets.test.mjs`:

```javascript
test("mise config pins Harper's runtimes and release tools", () => {
  const mise = read("dotfiles/mise-config.toml");
  for (const tool of ["node", "bun", "rust", "ast-grep", "difftastic", "lazygit", "ripgrep-all", "watchexec", "yq", "usage"]) {
    assert.match(mise, new RegExp(`^${tool} = `, "m"), `mise config should pin ${tool}`);
  }
  for (const banned of ["go = ", "claude", "codex", "zig", "java", "firebase", "pbcopy"]) {
    assert.ok(!mise.includes(banned), `mise config must not contain "${banned}"`);
  }
});
```

Append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("bootstraps mise toolchains and corepack for JS readiness", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/mise-config\.toml \/home\/exedev\/\.config\/mise\/config\.toml/);
  assert.match(dockerfile, /mise install/);
  assert.match(dockerfile, /corepack enable/);
  assert.match(dockerfile, /corepack install -g pnpm/);
  assert.match(dockerfile, /\.local\/share\/mise\/shims/, "shims must be on PATH for non-interactive shells");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — mise-config.toml missing, Dockerfile lacks mise install/corepack

- [ ] **Step 3: Create `dotfiles/mise-config.toml`**

```toml
# ABOUTME: mise runtime and tool configuration for the harperuntu image.
# ABOUTME: Sanitized from Harper's ~/.config/mise/config.toml — runtimes and release-binary tools; llm task definitions omitted.
[settings]
experimental = true
idiomatic_version_file_enable_tools = ["python"]

[tools]
usage = "latest"
node = "latest"
bun = "latest"
rust = "latest"
ast-grep = "latest"
difftastic = "latest"
lazygit = "latest"
ripgrep-all = "latest"
watchexec = "latest"
yq = "latest"
```

- [ ] **Step 4: Wire into the Dockerfile**

(a) Add to the asset COPY block (after the Task 4 lines):

```dockerfile
COPY --chown=exedev:exedev dotfiles/mise-config.toml /home/exedev/.config/mise/config.toml
```

(b) After the fisher RUN (which already runs as exedev), add:

```dockerfile
# Install Harper's mise-managed toolchains and dev tools (see dotfiles/mise-config.toml).
# Versions resolve at build time; the weekly no-cache rebuild keeps them fresh.
RUN mise install && \
    mise reshim && \
    mise x -- node --version && \
    mise x -- bun --version && \
    mise x -- cargo --version && \
    mise x -- ast-grep --version && \
    mise x -- difft --version && \
    mise x -- lazygit --version && \
    mise x -- rga --version && \
    mise x -- watchexec --version && \
    mise x -- yq --version

# Enable corepack so pnpm/yarn shims exist, and bake the current pnpm release.
RUN mise x -- sh -c 'export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack enable && corepack install -g pnpm@latest' && \
    mise reshim && \
    env PATH="/home/exedev/.local/share/mise/shims:$PATH" pnpm --version
```

(c) In the `00-exeuntu.fish` heredoc, after the existing `fish_add_path` lines, add:

```fish
set -gx PNPM_HOME $HOME/.local/share/pnpm
fish_add_path -g $HOME/.local/share/pnpm
fish_add_path -g $HOME/.local/share/mise/shims
```

(`mise activate` later replaces shim paths in interactive shells; the shims line is what makes `node`/`pnpm` work in the non-interactive `fish -c`/`bash -c` shells agents use.)

(d) In the `.bashrc` PATH RUN, change

```dockerfile
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/exedev/.bashrc && \
```

to

```dockerfile
RUN echo 'export PATH="$HOME/.local/share/mise/shims:$HOME/.local/share/pnpm:$HOME/.local/bin:$PATH"' >> /home/exedev/.bashrc && \
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add dotfiles/mise-config.toml tests/ Dockerfile
git commit -m "feat: bootstrap node, bun, rust, and release dev tools via mise"
```

Build-time note (do not "fix" preemptively): mise's aqua backend downloads GitHub release artifacts. If the weekly CI rebuild ever hits GitHub rate limits (the fd install comment in the Dockerfile shows this has happened before), the fix is passing a `GITHUB_TOKEN` build secret — out of scope here.

---

### Task 7: In-image smoke test + Makefile targets

**Files:**
- Create: `smoke-test.sh` (repo root, next to the other COPY'd assets)
- Modify: `Dockerfile` (COPY + build-gate RUN near the end)
- Modify: `Makefile` (`test` and `smoke` targets)
- Test: `tests/dockerfile_contract.test.mjs` (extend), `tests/dotfiles_assets.test.mjs` (extend)

**Interfaces:**
- Consumes: everything Tasks 2–6 installed
- Produces: `/usr/local/bin/harperuntu-smoke` inside the image; `make test` and `make smoke` for humans/CI

- [ ] **Step 1: Write the failing tests**

Append to `tests/dockerfile_contract.test.mjs`:

```javascript
test("bakes and runs the smoke test as a build gate", () => {
  assert.match(dockerfile, /COPY smoke-test\.sh \/usr\/local\/bin\/harperuntu-smoke/);
  assert.match(dockerfile, /RUN \/usr\/local\/bin\/harperuntu-smoke/);
});
```

Append to `tests/dotfiles_assets.test.mjs`:

```javascript
test("smoke test covers the required tool roster", () => {
  const smoke = readFileSync(join(repoRoot, "smoke-test.sh"), "utf8");
  for (const tool of [
    "fish", "mise", "atuin", "fd", "bat", "direnv", "zoxide",
    "node", "go", "uv", "codex", "claude", "pi",
    "bun", "pnpm", "rustc", "ast-grep", "lazygit", "rga", "watchexec",
    "yq", "difft", "just", "hyperfine", "shellcheck", "shfmt",
  ]) {
    assert.ok(smoke.includes(`"${tool}"`) || smoke.includes(` ${tool} `), `smoke test should check ${tool}`);
  }
  for (const key of ["pull.rebase", "push.autoSetupRemote", "merge.conflictstyle", "diff.algorithm"]) {
    assert.ok(smoke.includes(key), `smoke test should assert git ${key}`);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — smoke-test.sh missing, Dockerfile lacks the gate

- [ ] **Step 3: Create `smoke-test.sh`**

```bash
#!/usr/bin/env bash
# ABOUTME: In-image smoke test asserting harperuntu's dev toolchain is present and configured.
# ABOUTME: Runs as exedev as a Dockerfile build gate and via `make smoke` against a built image.
set -uo pipefail

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$HOME/.config/bin:$PATH"

fails=0

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf 'ok       %s\n' "$desc"
  else
    printf 'MISSING  %s (tried: %s)\n' "$desc" "$*"
    fails=$((fails + 1))
  fi
}

expect_git() {
  local key="$1" want="$2" got
  got=$(git config --global --get "$key" 2>/dev/null || true)
  if [ "$got" = "$want" ]; then
    printf 'ok       git %s = %s\n' "$key" "$want"
  else
    printf 'WRONG    git %s: want "%s", got "%s"\n' "$key" "$want" "${got:-<unset>}"
    fails=$((fails + 1))
  fi
}

expect_file() {
  if [ -f "$1" ]; then
    printf 'ok       file %s\n' "$1"
  else
    printf 'MISSING  file %s\n' "$1"
    fails=$((fails + 1))
  fi
}

# Shell + shell tooling
check "fish"       fish --version
check "tmux"       tmux -V
check "atuin"      atuin --version
check "zoxide"     zoxide --version
check "direnv"     direnv version
check "fzf"        fzf --version
check "eza"        eza --version

# File + search tooling
check "fd"         fd --version
check "bat"        bat --version
check "rg"         rg --version
check "rga"        rga --version
check "ast-grep"   ast-grep --version
check "jq"         jq --version
check "yq"         yq --version

# Git tooling
check "git"        git --version
check "gh"         gh --version
check "git-lfs"    git lfs version
check "lazygit"    lazygit --version
check "difft"      difft --version

# Build/dev loop tooling
check "just"       just --version
check "hyperfine"  hyperfine --version
check "watchexec"  watchexec --version
check "shellcheck" shellcheck --version
check "shfmt"      shfmt --version
check "nvim"       nvim --version

# Runtimes + package managers
check "mise"       mise --version
check "go"         go version
check "uv"         uv --version
check "node"       node --version
check "bun"        bun --version
check "corepack"   corepack --version
check "pnpm"       pnpm --version
check "rustc"      rustc --version
check "cargo"      cargo --version

# LLM agents
check "claude"     claude --version
check "codex"      codex --version
check "pi"         pi --version

# Git ergonomics from dotfiles/gitconfig
expect_git pull.rebase true
expect_git push.autoSetupRemote true
expect_git merge.conflictstyle zdiff3
expect_git diff.algorithm histogram
expect_git init.defaultBranch main
expect_git user.name "Harper Reed"

# Dotfile assets in place
expect_file "$HOME/.gitconfig"
expect_file "$HOME/.config/git/ignore"
expect_file "$HOME/.tmux.conf"
expect_file "$HOME/.config/direnv/direnvrc"
expect_file "$HOME/.config/atuin/config.toml"
expect_file "$HOME/.config/mise/config.toml"
expect_file "$HOME/.config/bin/git-up"
expect_file "$HOME/.config/fish/conf.d/85-abbreviations.fish"

if [ "$fails" -gt 0 ]; then
  echo "smoke test FAILED: $fails problem(s)"
  exit 1
fi
echo "smoke test passed"
```

Make it executable: `chmod +x smoke-test.sh`

- [ ] **Step 4: Wire into the Dockerfile**

Near the end, after the nginx/terminfo blocks and right before `EXPOSE 8000 9999`, add:

```dockerfile
# Bake the smoke test and run it as a build gate: the image fails to build
# if any expected tool or config regresses.
COPY smoke-test.sh /usr/local/bin/harperuntu-smoke
RUN chmod 0755 /usr/local/bin/harperuntu-smoke
USER exedev
RUN /usr/local/bin/harperuntu-smoke
USER root
```

- [ ] **Step 5: Add Makefile targets**

Append to `Makefile`:

```make
test: ## Run Dockerfile/dotfiles contract tests on the host
	node --test "tests/*.test.mjs"

smoke: ## Run the in-image smoke test against the built image
	docker run --rm --user exedev -e HOME=/home/exedev \
	  ghcr.io/boldsoftware/exeuntu:latest /usr/local/bin/harperuntu-smoke
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test "tests/*.test.mjs"` (also exercised by `make test`)
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add smoke-test.sh Makefile tests/ Dockerfile
git commit -m "feat: add in-image smoke test as a build gate"
```

---

### Task 8: Full-image verification (build + smoke)

No new code. Prove the image actually builds and the smoke gate passes. Docker on this Mac runs through colima (currently stopped, sized 1 CPU/2GiB/5GiB — far too small) and the docker CLI is an unlinked brew keg.

**Files:**
- Modify: none (fixes only if the build surfaces defects — fix root causes, commit each fix separately)

- [ ] **Step 1: Link the docker CLI and start colima with adequate resources**

```bash
brew link docker
colima start --cpu 8 --memory 12 --disk 60
docker version
```

Expected: server + client respond. (Disk grows in place; existing VM data is preserved.)

- [ ] **Step 2: Run the host-side contract tests one more time**

Run: `make test`
Expected: all PASS

- [ ] **Step 3: Build the image (long — run in background, expect 30–60+ min)**

Run: `make build`
Expected: exits 0; the final `RUN /usr/local/bin/harperuntu-smoke` layer prints `smoke test passed`.

Known environment caveats, not defects: colima here is aarch64, so this validates the arm64 path; `chromedp/headless-shell` is amd64-only and will pull with a platform warning (its files are only COPY'd, never executed at build time). If the build fails on disk space, restart colima with a larger `--disk`.

- [ ] **Step 4: Run the smoke test against the built image**

Run: `make smoke`
Expected: every line `ok`, final line `smoke test passed`, exit 0.

- [ ] **Step 5: Commit the plan document and report**

```bash
git add docs/
git commit -m "docs: add harper dev ergonomics and toolchain plan"
```

Report results honestly: build duration, image size (`docker images ghcr.io/boldsoftware/exeuntu:latest`), full smoke output, and any caveats.
