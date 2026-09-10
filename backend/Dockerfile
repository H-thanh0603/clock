# ---- deps (giữ nguyên prisma CLI + tsx trong image để migrate/seed chạy được) ----
FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY src ./src
COPY tsconfig*.json nest-cli.json ./
RUN npm run build

# ---- run ----
# Non-root: node user có sẵn trong image node:*-alpine (uid 1000).
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Prisma CLI cần devDeps đã cài ở base; copy nguyên deps (CLI prisma nằm
# trong dependencies) + build output + prisma artifacts để `migrate deploy`
# và `npm run seed` chạy được ngay trong container.
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/generated ./generated
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/package.json ./package.json

# Thư mục uploads ghi được cho user node (uid 1000).
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
VOLUME /app/uploads

# Healthcheck trong image (không cần curl — node có sẵn).
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
