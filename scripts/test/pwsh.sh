#!/usr/bin/env sh
# Runs the tests of both preflight scripts with PowerShell, inside the Node image of the workshop,
# so a machine without pwsh can run the cases of preflight.ps1. From the root of the repo:
#   docker run --rm -v "$PWD:/repo" -w /repo node:22.23.4-bookworm-slim sh scripts/test/pwsh.sh
set -eu

POWERSHELL=7.4.6

case "$(dpkg --print-architecture)" in
  amd64) arch=x64 ;;
  arm64) arch=arm64 ;;
  *) echo "No PowerShell for $(dpkg --print-architecture)" >&2; exit 1 ;;
esac

apt-get -qq update >/dev/null
apt-get -qq install -y --no-install-recommends ca-certificates curl git libicu72 >/dev/null
mkdir -p /opt/pwsh
curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v$POWERSHELL/powershell-$POWERSHELL-linux-$arch.tar.gz" |
  tar -xz -C /opt/pwsh
chmod +x /opt/pwsh/pwsh
# The branches of the mounted repo belong to another user
git config --global --add safe.directory "$(pwd)"

PWSH=/opt/pwsh/pwsh node --test scripts/test/preflight.test.mjs
