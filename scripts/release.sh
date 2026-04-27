#!/usr/bin/env bash
# Build the extension and publish a GitHub Release with the zip as an asset.
#
# Usage:
#   scripts/release.sh                     # uses version from package.json
#   scripts/release.sh --version 1.2.3     # bump package.json + release
#   scripts/release.sh --dry-run           # build only, no tag, no release
#   scripts/release.sh --notes "text"      # custom release notes
#
# Requires: jq, gh (GitHub CLI authenticated), git, npm.
# The extension's runtime update-check fetches the latest GitHub release for
# the configured repo (see src/update/providers/github.ts).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
OVERRIDE_VERSION=""
RELEASE_NOTES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)   OVERRIDE_VERSION="$2"; shift 2 ;;
    --notes)     RELEASE_NOTES="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    -h|--help)   sed -n '1,12p' "$0"; exit 0 ;;
    *)           echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# --- Tooling check ---
for cmd in jq npm git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: '$cmd' not found"; exit 1; }
done
if [[ "$DRY_RUN" == "0" ]]; then
  command -v gh >/dev/null 2>&1 || { echo "ERROR: 'gh' (GitHub CLI) not found"; exit 1; }
fi

# --- Pre-flight (before bumping so the script's own bump doesn't trip the check) ---
if [[ "$DRY_RUN" == "0" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: working tree is dirty. Commit or stash first." >&2; exit 1
  fi
fi

# --- Version bump (optional) ---
if [[ -n "$OVERRIDE_VERSION" ]]; then
  echo "→ Bumping package.json version to $OVERRIDE_VERSION"
  jq --arg v "$OVERRIDE_VERSION" '.version = $v' package.json > package.json.tmp
  mv package.json.tmp package.json
fi

VERSION="$(jq -r .version package.json)"
[[ -z "$VERSION" || "$VERSION" == "null" ]] && { echo "ERROR: cannot read version" >&2; exit 1; }
TAG="v$VERSION"
echo "→ Version: $VERSION (tag: $TAG)"

if [[ "$DRY_RUN" == "0" ]] && git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "ERROR: tag $TAG already exists" >&2; exit 1
fi

# --- Build & test ---
echo "→ Running tests"
npm run test --silent

echo "→ Building zip"
npm run zip --silent

SRC_ZIP="$(ls -t output/*.zip 2>/dev/null | head -n1 || true)"
[[ -z "$SRC_ZIP" ]] && { echo "ERROR: no zip produced under output/" >&2; exit 1; }
echo "→ Built: $SRC_ZIP"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "✓ Dry run complete. Would publish $TAG with $SRC_ZIP"
  exit 0
fi

# --- Tag & release ---
if [[ -n "$OVERRIDE_VERSION" ]]; then
  echo "→ Committing version bump"
  git add package.json
  git commit -m "chore: bump version to $VERSION"
fi

echo "→ Creating git tag $TAG"
git tag "$TAG"

echo "→ Pushing tag and current branch"
git push
git push origin "$TAG"

echo "→ Creating GitHub release"
NOTES_ARG=()
if [[ -n "$RELEASE_NOTES" ]]; then
  NOTES_ARG=(--notes "$RELEASE_NOTES")
else
  NOTES_ARG=(--generate-notes)
fi

gh release create "$TAG" "$SRC_ZIP" \
  --title "$TAG" \
  "${NOTES_ARG[@]}"

echo "✓ Released $TAG"
gh release view "$TAG" --json url --jq .url
