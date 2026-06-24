#!/usr/bin/env bash
# Dimensions Analytics MCP one-step installer (macOS, Linux, Git Bash on Windows)
# Run from the repo, or: curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh | bash
set -euo pipefail

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
fi
REPO="digital-science/dimensions-analytics-mcp"
REF="${DIMENSIONS_MCP_INSTALL_REF:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${REF}"
MIN_NODE_MAJOR=20

info() { printf '%s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }

need_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$major" -lt "$MIN_NODE_MAJOR" ]]; then
      warn "Node.js ${MIN_NODE_MAJOR}+ is required. Found $(node -v)."
      exit 1
    fi
    return 0
  fi
  return 1
}

offer_node_install() {
  info ""
  info "Node.js is not installed (or not on your PATH)."
  info "Node.js ${MIN_NODE_MAJOR}+ is required to run Dimensions Analytics MCP."
  info ""
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        read -r -p "Install Node.js with Homebrew now? [y/N] " ans </dev/tty
        if [[ "${ans:-}" =~ ^[Yy]$ ]]; then
          brew install node
          return 0
        fi
      fi
      info "Install from https://nodejs.org/ (LTS), then run this script again."
      ;;
    Linux)
      info "Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org/ or your package manager."
      info "  Ubuntu/Debian: sudo apt install nodejs npm"
      info "  Fedora: sudo dnf install nodejs npm"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      info "On Windows, run the PowerShell installer instead:"
      info "  irm https://raw.githubusercontent.com/${REPO}/${REF}/scripts/install.ps1 | iex"
      ;;
    *)
      info "Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org/"
      ;;
  esac
  exit 1
}

resolve_install_mjs() {
  if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/install.mjs" ]]; then
    printf '%s\n' "${SCRIPT_DIR}/install.mjs"
    return
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is required to download the installer."
    exit 1
  fi
  local tmp mjs
  tmp="$(mktemp -d)"
  mjs="${tmp}/install.mjs"
  info "Downloading installer from ${RAW}/scripts/install.mjs ..." >&2
  curl -fsSL "${RAW}/scripts/install.mjs" -o "${mjs}"
  printf '%s\n' "${mjs}"
}

main() {
  info "Dimensions Analytics MCP installer"
  if ! need_node; then
    offer_node_install
  fi
  local mjs
  mjs="$(resolve_install_mjs)"
  if [[ -t 0 ]]; then
    exec node "${mjs}" "$@"
  elif [[ -r /dev/tty ]]; then
    exec node "${mjs}" "$@" </dev/tty
  else
    warn "No interactive terminal. Pass --yes --api-key and --clients, or run ./scripts/install.sh from a clone."
    exec node "${mjs}" "$@"
  fi
}

main "$@"
