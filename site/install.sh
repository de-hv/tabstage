#!/bin/sh
# Installs Tabstage Desktop from its GitHub releases.
#
#   curl -fsSL https://de-hv.github.io/tabstage-desktop/install.sh | sh
#   curl -fsSL https://de-hv.github.io/tabstage-desktop/install.sh | sh -s -- --system
#
# macOS: copies Tabstage.app to /Applications (or ~/Applications).
# Linux: installs the AppImage for your user, or with --system the .deb or
# .rpm package through apt or dnf.
#
# Every download is checked against the SHA256SUMS file of the release.

set -eu

REPO="${TABSTAGE_REPO:-de-hv/tabstage-desktop}"
APP_NAME="Tabstage"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'tabstage install: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: install.sh [options]

  --version vX.Y.Z  Install that release instead of the latest
  --system          Linux: install the .deb or .rpm package system-wide
  --uninstall       Remove Tabstage installed by this script
  --dry-run         Show what would be installed, change nothing
  -h, --help        Show this help
USAGE
}

# --- Pure helpers (tested in tests/install_test.sh) ------------------------

normalize_os() {
  case $1 in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    *) echo "$1" ;;
  esac
}

normalize_arch() {
  case $1 in
    x86_64 | amd64) echo x86_64 ;;
    arm64 | aarch64) echo aarch64 ;;
    *) echo "$1" ;;
  esac
}

# Download URLs listed in a GitHub release JSON read from stdin.
asset_urls() {
  grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/'
}

# Tag of a GitHub release JSON read from stdin.
release_tag() {
  grep -o '"tag_name": *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# pick_asset OS ARCH KIND URLS -> the URL to download, or nothing.
# KIND is app (dmg or AppImage), deb or rpm.
pick_asset() {
  os=$1 arch=$2 kind=$3 urls=$4
  case "$os/$kind/$arch" in
    macos/app/*) pattern='_universal\.dmg$' ;;
    linux/app/x86_64) pattern='_amd64\.AppImage$' ;;
    linux/app/aarch64) pattern='_aarch64\.AppImage$' ;;
    linux/deb/x86_64) pattern='_amd64\.deb$' ;;
    linux/deb/aarch64) pattern='_arm64\.deb$' ;;
    linux/rpm/x86_64) pattern='\.x86_64\.rpm$' ;;
    linux/rpm/aarch64) pattern='\.aarch64\.rpm$' ;;
    *) return 0 ;;
  esac
  printf '%s\n' "$urls" | grep -E "$pattern" | head -n 1 || true
}

# expected_sum FILE SUMS -> the SHA-256 listed for FILE in a SHA256SUMS text.
expected_sum() {
  printf '%s\n' "$2" | awk -v file="$1" '$2 == file || $2 == "*" file { print $1; exit }'
}

# --- Side effects ----------------------------------------------------------

need() {
  command -v "$1" >/dev/null 2>&1 || fail "this needs '$1', please install it and try again"
}

fetch_release() {
  if [ -n "${TABSTAGE_RELEASE_JSON:-}" ]; then
    cat "$TABSTAGE_RELEASE_JSON"
  elif [ -n "$version" ]; then
    curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$version"
  else
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# download URL DIR SUMS_URL -> path of the verified file
download() {
  url=$1 dir=$2 sums_url=$3
  file="$dir/${url##*/}"
  say "Downloading ${url##*/}…" >&2
  curl -fL --progress-bar -o "$file" "$url"
  [ -n "$sums_url" ] || fail "the release has no SHA256SUMS file, refusing to install an unverified download"
  sums=$(curl -fsSL "$sums_url")
  expected=$(expected_sum "${url##*/}" "$sums")
  [ -n "$expected" ] || fail "SHA256SUMS does not list ${url##*/}"
  actual=$(sha256_of "$file")
  [ "$expected" = "$actual" ] || fail "checksum mismatch for ${url##*/}, the download may be corrupted"
  printf '%s\n' "$file"
}

install_macos() {
  file=$1 dir=$2
  need hdiutil
  mount="$dir/mount"
  mkdir -p "$mount"
  hdiutil attach -nobrowse -quiet -readonly -mountpoint "$mount" "$file"
  target=/Applications
  [ -w "$target" ] || target="$HOME/Applications"
  mkdir -p "$target"
  rm -rf "$target/$APP_NAME.app"
  # Files downloaded by curl carry no quarantine flag, so Gatekeeper does
  # not block the app even before it is notarized.
  ditto "$mount/$APP_NAME.app" "$target/$APP_NAME.app"
  hdiutil detach -quiet "$mount"
  say "Installed $target/$APP_NAME.app"
}

install_appimage() {
  file=$1 tag=$2
  bin="$HOME/.local/bin"
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/128x128/apps"
  mkdir -p "$bin" "$apps" "$icons"
  install -m 755 "$file" "$bin/tabstage"
  curl -fsSL -o "$icons/tabstage.png" \
    "https://raw.githubusercontent.com/$REPO/$tag/src-tauri/icons/128x128.png" || true
  cat >"$apps/tabstage.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Groups of tabs that open in the browser you choose
Exec=$bin/tabstage
Icon=tabstage
Categories=Utility;Network;
Terminal=false
DESKTOP
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" || true
  say "Installed $bin/tabstage"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) say "Add $bin to your PATH to run 'tabstage' from a terminal." ;;
  esac
  say "AppImages need FUSE 2; if it does not start, install libfuse2 (or fuse-libs)."
}

install_package() {
  file=$1 kind=$2
  case $kind in
    deb) sudo apt-get install -y "$file" ;;
    rpm) sudo dnf install -y "$file" ;;
  esac
  say "Installed the $APP_NAME package"
}

uninstall() {
  case $os in
    macos)
      rm -rf "/Applications/$APP_NAME.app" "$HOME/Applications/$APP_NAME.app"
      ;;
    linux)
      rm -f "$HOME/.local/bin/tabstage" \
        "${XDG_DATA_HOME:-$HOME/.local/share}/applications/tabstage.desktop" \
        "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/128x128/apps/tabstage.png"
      ;;
  esac
  say "Removed $APP_NAME. Your groups stay in its data folder."
}

package_kind() {
  if command -v apt-get >/dev/null 2>&1; then
    echo deb
  elif command -v dnf >/dev/null 2>&1; then
    echo rpm
  else
    fail "--system needs apt or dnf; run without --system to install the AppImage"
  fi
}

main() {
  version=""
  system=0
  dry_run=0
  remove=0
  while [ $# -gt 0 ]; do
    case $1 in
      --version)
        [ $# -ge 2 ] || fail "--version needs a value such as v0.1.0"
        version=$2
        shift
        ;;
      --system) system=1 ;;
      --uninstall) remove=1 ;;
      --dry-run) dry_run=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) fail "unknown option '$1' (see --help)" ;;
    esac
    shift
  done

  os=$(normalize_os "${TABSTAGE_OS:-$(uname -s)}")
  arch=$(normalize_arch "${TABSTAGE_ARCH:-$(uname -m)}")
  case $os in
    macos | linux) ;;
    *) fail "Tabstage only supports macOS and Linux (found $os)" ;;
  esac

  if [ "$remove" -eq 1 ]; then
    uninstall
    exit 0
  fi

  kind=app
  if [ "$system" -eq 1 ]; then
    [ "$os" = linux ] || fail "--system is only for Linux"
    kind=$(package_kind)
  fi

  [ -n "${TABSTAGE_RELEASE_JSON:-}" ] || need curl
  release=$(fetch_release) || fail "could not read the release from GitHub"
  tag=$(printf '%s\n' "$release" | release_tag)
  urls=$(printf '%s\n' "$release" | asset_urls)
  url=$(pick_asset "$os" "$arch" "$kind" "$urls")
  [ -n "$url" ] || fail "no $kind download for $os $arch in release ${tag:-unknown}"

  if [ "$dry_run" -eq 1 ]; then
    say "$APP_NAME $tag: would install $url"
    exit 0
  fi

  sums_url=$(printf '%s\n' "$urls" | grep '/SHA256SUMS$' | head -n 1 || true)
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT INT TERM
  file=$(download "$url" "$dir" "$sums_url")
  case "$os/$kind" in
    macos/app) install_macos "$file" "$dir" ;;
    linux/app) install_appimage "$file" "$tag" ;;
    linux/deb | linux/rpm) install_package "$file" "$kind" ;;
  esac
  say "Done. Open $APP_NAME from your applications."
}

if [ "${TABSTAGE_INSTALL_LIB:-}" != 1 ]; then
  main "$@"
fi
