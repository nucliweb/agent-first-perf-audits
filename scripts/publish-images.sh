#!/usr/bin/env sh
# The lists of services, refs and architectures split on spaces on purpose: none has a space
# shellcheck disable=SC2086,SC2046
# Builds, checks and publishes the images of the workshop for one architecture, and joins both
# architectures into the multiarch tags that docker compose pull downloads. Each architecture is
# built natively, on its own runner, as IMAGE:TAG-<arch>; the manifest step joins them as IMAGE:TAG.
#   scripts/publish-images.sh build amd64      every image, as IMAGE:TAG-amd64
#   scripts/publish-images.sh check amd64      smoke tests of the images of that architecture
#   scripts/publish-images.sh push amd64       pushes IMAGE:TAG-amd64
#   scripts/publish-images.sh manifest         IMAGE:TAG from IMAGE:TAG-amd64 and IMAGE:TAG-arm64
# The images of the services and their tags come from compose.yaml; the shop has one image per
# git ref, main and every pr/* branch, built by scripts/build-shop.sh.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SHOP="${SHOP_IMAGE:-ghcr.io/nucliweb/agent-first-perf-audits/shop}"
SERVICES="thirdparty agents ollama"
ARCHES="amd64 arm64"
# agents runs with docker compose run and ollama only with the llm profile
export COMPOSE_PROFILES=llm,run

compose() { docker compose --project-directory "$REPO" "$@"; }

# The image of a service, as compose.yaml names it
image_of() { compose config --format json | jq -r --arg s "$1" '.services[$s].image'; }

# main and the pr/* branches, local or only on the remote, once each
shop_refs() {
  echo main
  {
    git -C "$REPO" for-each-ref --format='%(refname:lstrip=2)' 'refs/heads/pr/'
    git -C "$REPO" for-each-ref --format='%(refname:lstrip=3)' 'refs/remotes/origin/pr/'
  } | sort -u
}

# Every multiarch tag of the workshop
images() {
  for service in $SERVICES; do image_of "$service"; done
  for ref in $(shop_refs); do echo "$SHOP:$(printf '%s' "$ref" | tr '/' '-')"; done
}

build() {
  arch="$1"
  compose build $SERVICES
  "$REPO/scripts/build-shop.sh" $(shop_refs)
  for image in $(images); do docker tag "$image" "$image-$arch"; done
}

# The images work on this architecture: Ollama answers JSON constrained by a schema with the model
# of the image, and the agents image starts Chromium and both MCP servers
check() {
  arch="$1"
  ollama="$(image_of ollama)-$arch"
  container="publish-check-ollama"
  docker rm -f "$container" >/dev/null 2>&1 || true
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
  # A free port of the host, chosen by Docker
  docker run -d --name "$container" -p 127.0.0.1::11434 "$ollama" >/dev/null
  port="$(docker port "$container" 11434/tcp | cut -d: -f2)"
  tries=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy ]; do
    tries=$((tries + 1))
    [ "$tries" -lt 90 ] || { docker logs "$container" >&2; echo "ollama on $arch never got healthy" >&2; exit 1; }
    sleep 2
  done
  answer="$(curl -sf "http://127.0.0.1:$port/api/chat" -d '{
    "model": "llama3.2:3b", "stream": false, "options": {"temperature": 0, "seed": 42},
    "messages": [{"role": "user", "content": "Is 1000 ms slower than 500 ms? Answer in JSON."}],
    "format": {"type": "object", "properties": {"slower": {"type": "boolean"}}, "required": ["slower"]}
  }' | jq -c '.message.content | fromjson')"
  [ "$answer" = '{"slower":true}' ] || { echo "ollama on $arch answered $answer" >&2; exit 1; }
  echo "ollama on $arch: $answer"

  docker run --rm "$(image_of agents)-$arch" npm test
}

push() {
  for image in $(images); do docker push --quiet "$image-$1"; done
}

manifest() {
  for image in $(images); do
    docker buildx imagetools create -t "$image" $(for arch in $ARCHES; do echo "$image-$arch"; done)
  done
}

case "${1:-}" in
  build | check | push) [ -n "${2:-}" ] || { echo "Usage: $0 $1 <amd64|arm64>" >&2; exit 2; }; "$1" "$2" ;;
  manifest) manifest ;;
  images) images ;;
  *) echo "Usage: $0 build|check|push <arch> | manifest | images" >&2; exit 2 ;;
esac
