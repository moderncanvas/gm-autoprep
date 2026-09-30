FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY automation/package.json automation/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY automation/src ./src
ENV CHROMIUM_PATH=/usr/bin/chromium AUTOPREP_TOKEN_FILE=/data/token AUTOPREP_HEALTH_FILE=/tmp/autoprep-healthy
HEALTHCHECK --interval=60s --timeout=5s --start-period=240s \
  CMD test -n "$(find /tmp/autoprep-healthy -mmin -3 2>/dev/null)" || exit 1
USER node
CMD ["node", "src/automation.mjs"]
