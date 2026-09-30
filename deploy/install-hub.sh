#!/bin/bash
# Install the gm-autoprep hub as a systemd service next to Foundry.
# usage: [AUTOPREP_HOST=0.0.0.0] install-hub.sh <dir containing hub/>   (run as root on the Foundry host)
# AUTOPREP_HOST defaults to 127.0.0.1; use 0.0.0.0 to reach the hub from other machines on your LAN
# (every call still needs the token — put TLS in front of it before exposing it any further).
set -e
SRC=${1:-/opt/gm-autoprep}
cd "$SRC/hub" && npm install --omit=dev --silent
mkdir -p /etc/gm-autoprep && chmod 700 /etc/gm-autoprep
cat > /etc/systemd/system/gm-autoprep-hub.service <<UNIT
[Unit]
Description=gm-autoprep hub (AI agent <-> Foundry bridge)
After=network.target foundryvtt.service

[Service]
Environment=AUTOPREP_DATA=/etc/gm-autoprep
Environment=AUTOPREP_HOST=${AUTOPREP_HOST:-127.0.0.1}
Environment=AUTOPREP_PORT=30777
ExecStart=/usr/bin/node $SRC/hub/src/hub.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now gm-autoprep-hub
systemctl restart gm-autoprep-hub
sleep 2
systemctl is-active gm-autoprep-hub
echo "status:  $(curl -s localhost:30777/status)"
echo "no auth: $(curl -s -X POST localhost:30777/rpc -d '{"method":"system.ping"}')"
echo "auth:    $(curl -s -X POST -H "Authorization: Bearer $(cat /etc/gm-autoprep/token)" localhost:30777/rpc -d '{"method":"system.ping"}')"
