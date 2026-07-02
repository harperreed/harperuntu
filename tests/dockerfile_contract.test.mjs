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
