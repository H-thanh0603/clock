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

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
