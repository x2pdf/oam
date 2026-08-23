#!/usr/bin/env bash
# One-click macOS (Apple Silicon) desktop packager for this Expo + Tauri repo.
# Verified on M1 MacBook Air 13, macOS 14.8.7, Node v20.20.2, Rust 1.95.0.
#
# Usage:
#   bash doc/deploy/build-macos.sh
#   bash doc/deploy/build-macos.sh --skip-npm-install
set -euo pipefail

SKIP_NPM=0
if [[ "${1:-}" == "--skip-npm-install" ]]; then
  SKIP_NPM=1
fi

step() { printf '\n==== %s ====\n' "$1"; }
ok()   { printf '[OK] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ ! -f "$ROOT/package.json" ]]; then
  fail "Cannot find package.json at repo root: $ROOT"
fi
if [[ ! -f "$ROOT/src-tauri/tauri.conf.json" ]]; then
  fail "Cannot find src-tauri/tauri.conf.json. This script is for the Tauri desktop build."
fi

step "Repo"
ok "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This script is macOS-only (Darwin). Current: $(uname -s)"
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  warn "uname -m is $ARCH (expected arm64 on M1/M2/M3). Native Apple Silicon is recommended."
else
  ok "uname -m=$ARCH"
fi

step "Check toolchain"

if ! have xcode-select; then
  fail "xcode-select not found. Install Xcode Command Line Tools: xcode-select --install"
fi
if ! xcode-select -p >/dev/null 2>&1; then
  fail "Xcode Command Line Tools not selected. Run: xcode-select --install"
fi
ok "xcode-select: $(xcode-select -p)"

if ! have node; then
  fail "Node.js not found. Install Node >= 20.19.4 (nvm install 20.19.4) then reopen the terminal."
fi
NODE_VER_RAW="$(node -v)"
if ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); const ok=a>20||(a===20&&(b>19||(b===19&&c>=4))); process.exit(ok?0:1)'; then
  fail "Node $NODE_VER_RAW is too old. Need >= v20.19.4 (nvm install 20.19.4; nvm use 20.19.4)."
fi
NODE_ARCH="$(node -p 'process.arch')"
ok "Node $NODE_VER_RAW ($NODE_ARCH)"
if [[ "$NODE_ARCH" != "arm64" && "$ARCH" == "arm64" ]]; then
  warn "Node process.arch is $NODE_ARCH on an arm64 Mac. Reinstall Node as ARM64 to avoid mixed-arch builds."
fi

if ! have npm; then
  fail "npm not found."
fi
ok "npm $(npm -v)"

if ! have rustc || ! have cargo; then
  fail "Rust toolchain missing. Install rustup (https://sh.rustup.rs) and reopen the terminal."
fi
ok "$(rustc --version)"
ok "$(cargo --version)"
RUST_HOST="$(rustc -vV | awk '/^host:/{print $2}')"
ok "rustc host=$RUST_HOST"
if [[ "$ARCH" == "arm64" && "$RUST_HOST" != "aarch64-apple-darwin" ]]; then
  warn "rustc host is $RUST_HOST; expected aarch64-apple-darwin on Apple Silicon."
fi

if have clang; then
  ok "$(clang --version | head -n 1)"
else
  warn "clang not on PATH. cargo may fail to link; reinstall Command Line Tools."
fi

TARGET_DIR="$ROOT/src-tauri/target"
mkdir -p "$TARGET_DIR"
export CARGO_TARGET_DIR="$TARGET_DIR"
ok "CARGO_TARGET_DIR=$CARGO_TARGET_DIR"

cd "$ROOT"

if [[ "$SKIP_NPM" -eq 1 ]]; then
  warn "--skip-npm-install set"
else
  if [[ ! -d "$ROOT/node_modules" || ! -d "$ROOT/node_modules/@tauri-apps/cli" ]]; then
    step "npm install"
    npm install
  else
    ok "node_modules present, skip npm install"
  fi
fi

NAME="OAM"
VER="26.1.0"
META="$(node -e 'const fs=require("fs"); let name="OAM", ver="1.0.0"; try { const p=JSON.parse(fs.readFileSync("package.json","utf8")); if (p.name) name=String(p.name); if (p.version) ver=String(p.version);} catch(e) {} try { const c=JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json","utf8")); if (c.productName) name=String(c.productName); if (c.version) ver=String(c.version);} catch(e) {} process.stdout.write(name+"\n"+ver);')"
NAME="$(printf '%s\n' "$META" | sed -n '1p')"
VER="$(printf '%s\n' "$META" | sed -n '2p')"
ok "product=$NAME version=$VER"

step "tauri build (web export + rust + app/dmg)"
printf 'First Rust compile can take several minutes.\n'
printf 'Overriding bundle targets to app,dmg (tauri.conf.json is nsis for Windows).\n'

LOG_PATH="$TARGET_DIR/macos-build.log"
set +e
npx tauri build --bundles app,dmg 2>&1 | tee "$LOG_PATH"
BUILD_CODE=${PIPESTATUS[0]}
set -e

if [[ "$BUILD_CODE" -ne 0 ]]; then
  if grep -Eq 'nsis|makensis' "$LOG_PATH" 2>/dev/null; then
    warn "Log still mentions nsis/makensis. Confirm you passed --bundles app,dmg."
  fi
  fail "npx tauri build --bundles app,dmg failed (exit $BUILD_CODE). See $LOG_PATH"
fi
ok "tauri build finished"

step "Artifacts"

APP_CANDIDATES=(
  "$TARGET_DIR/release/bundle/macos/${NAME}.app"
  "$TARGET_DIR/aarch64-apple-darwin/release/bundle/macos/${NAME}.app"
  "$TARGET_DIR/universal-apple-darwin/release/bundle/macos/${NAME}.app"
)
DMG_CANDIDATES=(
  "$TARGET_DIR/release/bundle/dmg/${NAME}_${VER}_aarch64.dmg"
  "$TARGET_DIR/release/bundle/dmg/${NAME}_${VER}_x64.dmg"
  "$TARGET_DIR/release/bundle/dmg/${NAME}_${VER}_universal.dmg"
  "$TARGET_DIR/aarch64-apple-darwin/release/bundle/dmg/${NAME}_${VER}_aarch64.dmg"
  "$TARGET_DIR/universal-apple-darwin/release/bundle/dmg/${NAME}_${VER}_universal.dmg"
)

FOUND_APP=""
for p in "${APP_CANDIDATES[@]}"; do
  if [[ -d "$p" ]]; then FOUND_APP="$p"; break; fi
done
if [[ -z "$FOUND_APP" ]]; then
  FOUND_APP="$(find "$TARGET_DIR" -type d -name "${NAME}.app" 2>/dev/null | head -n 1 || true)"
fi

FOUND_DMG=""
for p in "${DMG_CANDIDATES[@]}"; do
  if [[ -f "$p" ]]; then FOUND_DMG="$p"; break; fi
done
if [[ -z "$FOUND_DMG" ]]; then
  FOUND_DMG="$(find "$TARGET_DIR" -type f -name "${NAME}_*.dmg" 2>/dev/null | head -n 1 || true)"
fi

if [[ -n "$FOUND_APP" ]]; then
  ok "app: $FOUND_APP"
else
  warn "app bundle not found (looked for ${NAME}.app under $TARGET_DIR)"
fi
if [[ -n "$FOUND_DMG" ]]; then
  ok "dmg: $FOUND_DMG"
else
  warn "dmg not found (looked for ${NAME}_*.dmg under $TARGET_DIR)"
fi

if [[ -z "$FOUND_APP" ]]; then
  fail "Build finished without ${NAME}.app"
fi
if [[ -z "$FOUND_DMG" ]]; then
  warn "DMG missing, but .app exists. You can still: open \"$FOUND_APP\""
  exit 2
fi

printf '\nmacOS package ready (unsigned).\n'
printf 'If Gatekeeper blocks it: right-click Open, or xattr -cr the .app\n'
exit 0
