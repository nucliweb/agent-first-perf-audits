#!/usr/bin/env sh
# Builds the shop image of each git ref given, with the Dockerfile of the working tree, so the
# baseline and the candidates are built the same way. The tag is the ref with "/" as "-":
#   scripts/build-shop.sh main pr/lcp-hero-lazy
#   -> ghcr.io/nucliweb/agent-first-perf-audits/shop:main
#   -> ghcr.io/nucliweb/agent-first-perf-audits/shop:pr-lcp-hero-lazy
set -eu

IMAGE="${SHOP_IMAGE:-ghcr.io/nucliweb/agent-first-perf-audits/shop}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <ref>..." >&2
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK:?}"' EXIT

for ref in "$@"; do
  # A branch of a fresh clone may exist only on the remote
  if git -C "$REPO" rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
    resolved="$ref"
  elif git -C "$REPO" rev-parse --verify --quiet "origin/$ref^{commit}" >/dev/null; then
    resolved="origin/$ref"
  else
    echo "The ref $ref does not exist" >&2
    exit 1
  fi

  tag="$(printf '%s' "$ref" | tr '/' '-')"
  context="$WORK/$tag"
  mkdir -p "$context"
  git -C "$REPO" archive "$resolved" apps/shop | tar -x -C "$context"

  echo "Building $IMAGE:$tag from $resolved ($(git -C "$REPO" rev-parse --short "$resolved"))"
  docker build --quiet \
    --label "org.opencontainers.image.revision=$(git -C "$REPO" rev-parse "$resolved")" \
    -f "$REPO/docker/shop/Dockerfile" -t "$IMAGE:$tag" "$context/apps/shop"
done
