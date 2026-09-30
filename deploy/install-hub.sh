#!/bin/bash
# Install the campaign-loop hub as a systemd service next to Foundry.
# usage: install-hub.sh <dir containing hub/>   (run as root on the Foundry host)
set -e
SRC=${1:-/opt/campaign-loop}
cd "$SRC/hub" && npm install --omit=dev --silent
mkdir -p /etc/campaign-loop && chmod 700 /etc/campaign-loop
cat > /etc/systemd/system/campaign-loop-hub.service <<UNIT
[Unit]
Description=campaign-loop hub (AI agent <-> Foundry bridge)
After=network.target foundryvtt.service

[Service]
Environment=CL_DATA=/etc/campaign-loop
Environment=CL_HOST=127.0.0.1
Environment=CL_PORT=30777
ExecStart=/usr/bin/node $SRC/hub/src/hub.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now campaign-loop-hub
systemctl restart campaign-loop-hub
sleep 2
systemctl is-active campaign-loop-hub
echo "status:  $(curl -s localhost:30777/status)"
echo "no auth: $(curl -s -X POST localhost:30777/rpc -d '{"method":"system.ping"}')"
echo "auth:    $(curl -s -X POST -H "Authorization: Bearer $(cat /etc/campaign-loop/token)" localhost:30777/rpc -d '{"method":"system.ping"}')"
