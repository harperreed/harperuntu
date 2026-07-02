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
