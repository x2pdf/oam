#!/usr/bin/env bash
# Keep CocoaPods in sync with Podfile.lock (needed after adding native modules
# such as expo-print / ExpoPrint). Safe to run repeatedly.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

if [[ "${SKIP_POD_INSTALL:-}" == "1" ]]; then
  echo "[ensure-pods] SKIP_POD_INSTALL=1, skip"
  exit 0
fi

if [[ ! -f "$IOS_DIR/Podfile" ]]; then
  echo "[ensure-pods] no Podfile, skip"
  exit 0
fi

if [[ -f "$IOS_DIR/.xcode.env" ]]; then
  # shellcheck disable=SC1091
  . "$IOS_DIR/.xcode.env"
fi
if [[ -f "$IOS_DIR/.xcode.env.local" ]]; then
  # shellcheck disable=SC1091
  . "$IOS_DIR/.xcode.env.local"
fi
if [[ -n "${NODE_BINARY:-}" && -x "${NODE_BINARY}" ]]; then
  export PATH="$(dirname "$NODE_BINARY"):$PATH"
fi
if [[ -s "${HOME}/.nvm/nvm.sh" ]] && ! command -v node >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
fi

NEED=0
if [[ ! -d "$IOS_DIR/Pods" || ! -f "$IOS_DIR/Pods/Manifest.lock" ]]; then
  NEED=1
elif ! diff -q "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock" >/dev/null 2>&1; then
  NEED=1
elif ! grep -q 'ExpoPrint' "$IOS_DIR/Podfile.lock" 2>/dev/null; then
  NEED=1
fi

if [[ "$NEED" -eq 0 ]]; then
  echo "[ensure-pods] CocoaPods already in sync"
  exit 0
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "[ensure-pods] CocoaPods not found. Install with: brew install cocoapods" >&2
  echo "[ensure-pods] Then run: npm run pods" >&2
  exit 1
fi

echo "[ensure-pods] running pod install (ExpoPrint / native modules)…"
cd "$IOS_DIR"
pod install
