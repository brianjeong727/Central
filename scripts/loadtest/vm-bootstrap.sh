#!/usr/bin/env bash
# Stand up the load-test harness on a fresh Ubuntu 24.04 box.
# Run from the Mac, from anywhere:  bash scripts/loadtest/vm-bootstrap.sh <VM_IP>
#
# Layout on the VM is chosen so lib.cjs needs ZERO changes:
#   ROOT = path.resolve(__dirname, "..", "..")  →  /root/central
#   harness at /root/central/scripts/loadtest/, env at /root/central/.env.local
set -euo pipefail

VM="${1:-}"
[ -n "$VM" ] || { echo "usage: bash scripts/loadtest/vm-bootstrap.sh <VM_IP>"; exit 1; }

KEY="$HOME/.ssh/loadtest_ed25519"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "root@$VM")
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)

[ -f "$KEY" ] || { echo "missing SSH key $KEY"; exit 1; }
# .env.local is a symlink in the worktrees — resolve it so scp copies real content.
ENVFILE="$ROOT/.env.local"
[ -r "$ENVFILE" ] || { echo "missing/unreadable $ENVFILE"; exit 1; }
grep -q SUPABASE_SERVICE_ROLE_KEY "$ENVFILE" || { echo "$ENVFILE has no service-role key"; exit 1; }

echo "==> [1/4] node 20 + file-descriptor limits"
"${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
# 200 websockets + refresh churn: give the box plenty of headroom, persistently.
grep -q 'central-loadtest' /etc/security/limits.conf 2>/dev/null || cat >>/etc/security/limits.conf <<'EOF'
# central-loadtest
* soft nofile 65535
* hard nofile 65535
EOF
sysctl -qw net.ipv4.ip_local_port_range="10000 65535"
sysctl -qw net.core.somaxconn=4096
mkdir -p /root/central/scripts
node -v
REMOTE

echo "==> [2/4] copy harness + env"
"${SSH[@]}" 'rm -rf /root/central/scripts/loadtest'
"${SCP[@]}" -r "$HERE" "root@$VM:/root/central/scripts/loadtest" >/dev/null
"${SCP[@]}" "$ENVFILE" "root@$VM:/root/central/.env.local" >/dev/null
"${SSH[@]}" 'chmod 600 /root/central/.env.local && rm -rf /root/central/scripts/loadtest/logs /root/central/scripts/loadtest/.tokens.json'

echo "==> [3/4] npm deps"
"${SSH[@]}" 'cd /root/central && npm init -y >/dev/null 2>&1 || true; npm i --no-audit --no-fund @supabase/supabase-js ws >/dev/null 2>&1'

echo "==> [4/4] smoke check"
"${SSH[@]}" 'cd /root/central && ulimit -n 65535 && node -e "
const {loadEnv} = require(\"./scripts/loadtest/lib.cjs\");
loadEnv();
if(!process.env.NEXT_PUBLIC_SUPABASE_URL) { console.error(\"env not loaded\"); process.exit(1) }
console.log(\"env ok:\", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(\"nofile:\", require(\"node:child_process\").execSync(\"ulimit -n\",{shell:\"/bin/bash\"}).toString().trim());
"'

echo
echo "VM ready. Next: warm 200 sessions FROM THE VM's IP —"
echo "  ssh -i $KEY root@$VM 'cd /root/central && ulimit -n 65535 && node scripts/loadtest/warm-sessions.cjs --count 200 --pace 350'"
