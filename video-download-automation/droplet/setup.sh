#!/usr/bin/env bash
# One-time droplet hardening + n8n bring-up. Run as root on 198.211.114.184.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Firewall: allow SSH + HTTP/HTTPS only"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ufw status verbose
else
  echo "    ufw not installed; skipping (install with: apt-get install -y ufw)"
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

if [[ ! -f "$HERE/.env" ]]; then
  echo "==> Creating .env from template — EDIT IT (domain, passwords) before continuing"
  cp "$HERE/.env.example" "$HERE/.env"
  echo "    Edit $HERE/.env then re-run this script."
  exit 0
fi

echo "==> Starting n8n + Caddy"
cd "$HERE"
docker compose --env-file .env up -d
docker compose ps
echo "==> Done. Open https://\$N8N_HOST, log in, then import n8n-workflow.json."
