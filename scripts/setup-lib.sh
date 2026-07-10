# shellcheck shell=sh
# Vanta setup helpers — sourced by install.sh and run.sh so the no-toolchain
# install path lives in ONE place. POSIX sh (works under bash and dash).
#
#   vanta_use_vendored_node       — put a previously-downloaded node on PATH
#   vanta_is_termux               — detect the Android/Termux runtime
#   vanta_termux_prepare          — install the curated native build/runtime set
#   vanta_termux_prepare_build    — install compiler fallback only when required
#   vanta_ensure_node             — guarantee node >= 22 (download a portable one)
#   vanta_fetch_prebuilt_kernel D — download the prebuilt kernel into D/target/debug
#
# A non-CS user needs neither Rust nor a system Node: the kernel comes from the
# GitHub release, Node comes from nodejs.org — both checksum-verified.

VANTA_NODE_DIR="${VANTA_NODE_DIR:-${VANTA_HOME:-$HOME/.vanta}/node}"
KERNEL_RELEASE_BASE="${VANTA_KERNEL_RELEASE_BASE:-https://github.com/jpoindexter/Vanta/releases/latest/download}"
NODE_DIST_BASE="${VANTA_NODE_DIST_BASE:-https://nodejs.org/dist/latest-v22.x}"

vanta_is_termux() {
  [ -n "${TERMUX_VERSION:-}" ] && return 0
  case "${PREFIX:-}" in */com.termux/*) return 0 ;; esac
  return 1
}

vanta_platform_name() {
  if vanta_is_termux; then printf '%s\n' termux
  else printf '%s/%s\n' "$(uname -s)" "$(uname -m)"; fi
}

vanta_termux_packages() {
  printf '%s\n' "curl git nodejs-lts python esbuild"
}

vanta_termux_build_packages() {
  printf '%s\n' "rust make clang pkg-config"
}

vanta_termux_prepare() {
  vanta_is_termux || return 1
  command -v pkg >/dev/null 2>&1 || {
    echo "vanta: Termux detected but its pkg command is unavailable." >&2
    return 1
  }
  # Native Node/esbuild run the agent. Compilers are installed separately only
  # when a checksum-verified Android kernel cannot be downloaded.
  pkg install -y $(vanta_termux_packages)
}

vanta_termux_prepare_build() {
  vanta_is_termux || return 1
  command -v pkg >/dev/null 2>&1 || return 1
  pkg install -y $(vanta_termux_build_packages)
}

# Prepend the vendored node to PATH if we've downloaded one before.
vanta_use_vendored_node() {
  if [ -x "$VANTA_NODE_DIR/bin/node" ]; then
    PATH="$VANTA_NODE_DIR/bin:$PATH"
    export PATH
  fi
  return 0
}

vanta_node_ready() {
  command -v node >/dev/null 2>&1 || return 1
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "${major:-0}" -ge 22 ]
}

# Ensure node >= 22 is on PATH; download a portable build from nodejs.org if not.
# Returns 0 when node is available afterwards, 1 if it couldn't be provided.
vanta_ensure_node() {
  vanta_use_vendored_node
  vanta_node_ready && return 0
  # nodejs.org's Linux tarballs target glibc and cannot run on Android/Bionic.
  # The Termux package is native and is installed by vanta_termux_prepare.
  vanta_is_termux && return 1
  command -v curl >/dev/null 2>&1 || return 1
  os=""; arch=""
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) return 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) return 1 ;; esac
  tmp="$(mktemp -d)"
  curl -fsSL "$NODE_DIST_BASE/SHASUMS256.txt" -o "$tmp/SHA" 2>/dev/null || { rm -rf "$tmp"; return 1; }
  fname="$(awk -v p="${os}-${arch}.tar.gz" '$2 ~ p {print $2}' "$tmp/SHA" | head -1)"
  [ -n "$fname" ] || { rm -rf "$tmp"; return 1; }
  curl -fsSL "$NODE_DIST_BASE/$fname" -o "$tmp/node.tgz" || { rm -rf "$tmp"; return 1; }
  want="$(awk -v f="$fname" '$2==f {print $1}' "$tmp/SHA")"
  if command -v shasum >/dev/null 2>&1; then got="$(shasum -a 256 "$tmp/node.tgz" | awk '{print $1}')"
  else got="$(sha256sum "$tmp/node.tgz" | awk '{print $1}')"; fi
  if [ -n "$want" ] && [ "$want" != "$got" ]; then rm -rf "$tmp"; return 1; fi
  mkdir -p "$VANTA_NODE_DIR"
  tar -xzf "$tmp/node.tgz" -C "$VANTA_NODE_DIR" --strip-components=1 || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
  vanta_use_vendored_node
  command -v node >/dev/null 2>&1
}

# Download the prebuilt kernel for this platform into <repo>/target/debug/vanta-kernel.
# Returns 0 on success, 1 to fall back to `cargo build`.
vanta_fetch_prebuilt_kernel() {
  repo="$1"
  command -v curl >/dev/null 2>&1 || return 1
  target=""
  if vanta_is_termux; then
    case "$(uname -m)" in
      aarch64|arm64) target="aarch64-linux-android" ;;
      *) return 1 ;;
    esac
  else
    case "$(uname -s)/$(uname -m)" in
      Darwin/arm64)              target="aarch64-apple-darwin" ;;
      Darwin/x86_64)             target="x86_64-apple-darwin" ;;
      Linux/aarch64|Linux/arm64) target="aarch64-unknown-linux-gnu" ;;
      Linux/x86_64)              target="x86_64-unknown-linux-gnu" ;;
      *) return 1 ;;
    esac
  fi
  tmp="$(mktemp -d)"
  curl -fsSL "$KERNEL_RELEASE_BASE/vanta-kernel-$target" -o "$tmp/vanta-kernel" || { rm -rf "$tmp"; return 1; }
  curl -fsSL "$KERNEL_RELEASE_BASE/vanta-kernel-$target.sha256" -o "$tmp/sum" 2>/dev/null || { rm -rf "$tmp"; return 1; }
  [ -s "$tmp/sum" ] || { rm -rf "$tmp"; return 1; }
  want="$(awk '{print $1}' "$tmp/sum")"
  if command -v shasum >/dev/null 2>&1; then got="$(shasum -a 256 "$tmp/vanta-kernel" | awk '{print $1}')"
  else got="$(sha256sum "$tmp/vanta-kernel" | awk '{print $1}')"; fi
  if [ -z "$want" ] || [ "$want" != "$got" ]; then rm -rf "$tmp"; return 1; fi
  mkdir -p "$repo/target/debug"
  cp "$tmp/vanta-kernel" "$repo/target/debug/vanta-kernel" || { rm -rf "$tmp"; return 1; }
  chmod +x "$repo/target/debug/vanta-kernel"
  xattr -d com.apple.quarantine "$repo/target/debug/vanta-kernel" 2>/dev/null || true
  rm -rf "$tmp"
  return 0
}

vanta_install_agent_deps() {
  agent_dir="$1"
  if vanta_is_termux; then
    # Android-native tools come from pkg. Package lifecycle scripts assume a
    # desktop Node runtime and try to execute incompatible shims or binaries.
    (cd "$agent_dir" && npm install --omit=dev --omit=optional --ignore-scripts)
  else
    (cd "$agent_dir" && npm install --omit=dev)
  fi
}
