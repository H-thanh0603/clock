# ---- deps (giữ nguyên prisma CLI + tsx trong image để migrate/seed chạy được) ----
# BUILD CONTEXT PHẢI LÀ REPO-ROOT (docker-compose.yml đã set như vậy) vì
# prisma/seed.ts import dữ liệu FE ở src/data/products (../../src/data).
FROM node:22-alpine AS base
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
# prisma.config.ts resolve env("DATABASE_URL") ngay khi load config — kể cả
# `prisma generate` cũng cần biến này tồn tại (dù không chạm DB). Build-arg
# mặc định là placeholder; runtime compose override bằng DATABASE_URL thật.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY backend/src ./src
# Dữ liệu catalog dùng chung FE/BE (seed import src/data/products từ đây;
# chỉ copy đúng các file seed cần: products/straps/format, tránh kéo
# dependency @/lib của FE qua site.ts)
COPY src/data/products.ts src/data/straps.ts src/data/format.ts ./src/data/
COPY backend/tsconfig*.json backend/nest-cli.json ./
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
# Dữ liệu FE cho seed. seed.ts import "../../src/data/products": ngoài
# container đường dẫn đó là repo-root/src/data; trong container /app/prisma
# → copy data sang /src/data để resolution giữ nguyên mà không sửa seed.ts.
COPY --from=base /app/src/data /src/data
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
