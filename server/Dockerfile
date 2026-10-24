FROM node:24-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY src/lib/ ./src/lib/
COPY tsconfig.json ./tsconfig.json
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    PORT=8080 \
    SQLITE_PATH=/data/hcommunity.sqlite \
    USE_DEMO_DATA=false
RUN mkdir -p /data /backups && chown -R node:node /app /data /backups
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./node_modules/.bin/tsx", "server/src/main.ts"]
