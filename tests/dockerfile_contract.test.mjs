// ABOUTME: Checks the Dockerfile keeps Harper's dotfile-backed dev tools available.
// ABOUTME: Guards shell, PATH, and runtime-manager setup without building the full image.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

test("installs Linux packages required by Harper's dotfiles", () => {
  const requiredPackages = [
    "fish",
    "yadm",
    "figlet",
    "lolcat",
    "fortune-mod",
    "bsdgames",
    "fd-find",
    "fzf",
    "zoxide",
    "direnv",
    "bat",
    "eza",
    "btop",
    "tmux",
    "hugo",
    "nmap",
    "pv",
    "mosh",
    "grc",
  ];

  for (const packageName of requiredPackages) {
    assert.match(
      dockerfile,
      new RegExp(`\\b${packageName}\\b`),
      `Dockerfile should install ${packageName}`,
    );
  }
});

test("configures fish as the exedev login shell with dotfile-compatible hooks", () => {
  assert.match(dockerfile, /chsh\s+-s\s+\/usr\/bin\/fish\s+exedev/);
  assert.match(dockerfile, /fish_add_path\s+-g\s+\$HOME\/\.config\/bin/);
  assert.match(dockerfile, /atuin init fish \| source/);
  assert.match(dockerfile, /zoxide init fish \| source/);
  assert.match(dockerfile, /direnv hook fish \| source/);
  assert.match(dockerfile, /mise activate fish \| source/);
});

test("normalizes Ubuntu command names expected by the dotfiles", () => {
  assert.match(dockerfile, /ln -sf \/usr\/bin\/fdfind \/usr\/local\/bin\/fd/);
  assert.match(dockerfile, /ln -sf \/usr\/bin\/batcat \/usr\/local\/bin\/bat/);
});

test("installs fish plugin manager and runtime manager for Harper's workflow", () => {
  assert.match(dockerfile, /fisher install/);
  assert.match(dockerfile, /jorgebucaran\/fisher/);
  assert.match(dockerfile, /patrickf1\/fzf\.fish/);
  assert.match(dockerfile, /mise\.run/);
  assert.match(dockerfile, /setup\.atuin\.sh/);
});

test("copies translated git config into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/gitconfig \/home\/exedev\/\.gitconfig/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/git-ignore \/home\/exedev\/\.config\/git\/ignore/);
  assert.ok(!dockerfile.includes("git config --global init.defaultBranch"), "defaultBranch now lives in dotfiles/gitconfig");
});

test("copies tmux, direnv, and atuin configs into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/tmux\.conf \/home\/exedev\/\.tmux\.conf/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/direnvrc \/home\/exedev\/\.config\/direnv\/direnvrc/);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/atuin-config\.toml \/home\/exedev\/\.config\/atuin\/config\.toml/);
});

test("copies personal bin scripts and fish extras into the image", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/bin\/ \/home\/exedev\/\.config\/bin\//);
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/fish\/conf\.d\/ \/home\/exedev\/\.config\/fish\/conf\.d\//);
});

test("installs apt dev utilities for fast dev loops", () => {
  for (const pkg of ["shellcheck", "shfmt", "git-lfs", "hyperfine", "just"]) {
    assert.match(dockerfile, new RegExp(`\\b${pkg}\\b`), `Dockerfile should install ${pkg}`);
  }
});

test("bootstraps mise toolchains and corepack for JS readiness", () => {
  assert.match(dockerfile, /COPY --chown=exedev:exedev dotfiles\/mise-config\.toml \/home\/exedev\/\.config\/mise\/config\.toml/);
  assert.match(dockerfile, /mise install/);
  assert.match(dockerfile, /corepack enable/);
  assert.match(dockerfile, /corepack install -g pnpm/);
  assert.match(dockerfile, /\.local\/share\/mise\/shims/, "shims must be on PATH for non-interactive shells");
});

test("bakes and runs the smoke test as a build gate", () => {
  assert.match(dockerfile, /COPY smoke-test\.sh \/usr\/local\/bin\/harperuntu-smoke/);
  assert.match(dockerfile, /RUN \/usr\/local\/bin\/harperuntu-smoke/);
});
