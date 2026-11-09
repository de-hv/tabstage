#!/bin/sh
# Tests for site/install.sh. Run: sh tests/install_test.sh
# They never download or install anything: the release JSON comes from a
# fixture and the OS and architecture are overridden.

set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FIXTURE="$ROOT/tests/fixtures/release.json"
failures=0
passed=0

# Load the functions without running the installer.
TABSTAGE_INSTALL_LIB=1
. "$ROOT/site/install.sh"
# The installer runs with `set -e`; the tests must keep going on failures.
set +e

check() {
  name=$1 expected=$2 actual=$3
  if [ "$expected" = "$actual" ]; then
    passed=$((passed + 1))
  else
    failures=$((failures + 1))
    printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$name" "$expected" "$actual"
  fi
}

urls=$(asset_urls < "$FIXTURE")
base=https://github.com/de-hv/tabstage-desktop/releases/download/v0.1.0

check "macOS gets the universal dmg" "$base/Tabstage_0.1.0_universal.dmg" "$(pick_asset macos aarch64 app "$urls")"
check "Intel Mac gets the same dmg" "$base/Tabstage_0.1.0_universal.dmg" "$(pick_asset macos x86_64 app "$urls")"
check "Linux x86_64 gets the AppImage" "$base/Tabstage_0.1.0_amd64.AppImage" "$(pick_asset linux x86_64 app "$urls")"
check "Linux arm gets the arm AppImage" "$base/Tabstage_0.1.0_aarch64.AppImage" "$(pick_asset linux aarch64 app "$urls")"
check "--system on Debian gets the deb" "$base/Tabstage_0.1.0_amd64.deb" "$(pick_asset linux x86_64 deb "$urls")"
check "--system on arm Debian gets the arm deb" "$base/Tabstage_0.1.0_arm64.deb" "$(pick_asset linux aarch64 deb "$urls")"
check "--system on Fedora gets the rpm" "$base/Tabstage-0.1.0-1.x86_64.rpm" "$(pick_asset linux x86_64 rpm "$urls")"
check "missing asset gives nothing" "" "$(pick_asset linux riscv64 app "$urls")"

check "x86_64 is normalized" "x86_64" "$(normalize_arch amd64)"
check "arm64 is normalized" "aarch64" "$(normalize_arch arm64)"
check "unknown arch is kept" "riscv64" "$(normalize_arch riscv64)"
check "Darwin is macos" "macos" "$(normalize_os Darwin)"
check "Linux is linux" "linux" "$(normalize_os Linux)"

sums=$(printf '%s  %s\n%s  %s\n' aaa Tabstage_0.1.0_universal.dmg bbb Tabstage_0.1.0_amd64.deb)
check "checksum lookup by file name" "bbb" "$(expected_sum Tabstage_0.1.0_amd64.deb "$sums")"
check "checksum lookup misses unknown files" "" "$(expected_sum other.dmg "$sums")"

check "release tag is read" "v0.1.0" "$(release_tag < "$FIXTURE")"

dry=$(TABSTAGE_RELEASE_JSON="$FIXTURE" TABSTAGE_OS=Linux TABSTAGE_ARCH=x86_64 sh "$ROOT/site/install.sh" --dry-run 2>&1)
check "dry run names the file it would install" \
  "Tabstage v0.1.0: would install $base/Tabstage_0.1.0_amd64.AppImage" "$dry"

unsupported=$(TABSTAGE_RELEASE_JSON="$FIXTURE" TABSTAGE_OS=FreeBSD TABSTAGE_ARCH=x86_64 sh "$ROOT/site/install.sh" --dry-run 2>&1)
status=$?
check "unsupported OS fails" "1" "$status"
case $unsupported in
  *"only supports macOS and Linux"*) passed=$((passed + 1)) ;;
  *) failures=$((failures + 1)); printf 'FAIL unsupported OS message: %s\n' "$unsupported" ;;
esac

printf '%s passed, %s failed\n' "$passed" "$failures"
[ "$failures" -eq 0 ]
