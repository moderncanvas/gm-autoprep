FROM node:22-alpine
WORKDIR /app
COPY hub/package.json hub/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY hub/src ./src
ENV AUTOPREP_HOST=0.0.0.0 AUTOPREP_PORT=30777 AUTOPREP_DATA=/data
VOLUME /data
EXPOSE 30777
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:30777/status >/dev/null || exit 1
USER node
CMD ["node", "src/hub.mjs"]
