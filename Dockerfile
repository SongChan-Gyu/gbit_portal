# 개발: docker compose up (기본)
# 운영: docker compose -f docker-compose.prod.yml up -d
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci && npx prisma generate

# ── 개발 (소스 마운트로 핫리로드) ─────────────────────
FROM base AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ── 운영 (next build + start) ─────────────────────────
FROM base AS prod
COPY . .
RUN npm run build
EXPOSE 3000
# 컨테이너 시작 시 마이그레이션·시드 후 앱 실행 (Pre-deploy가 빌드 단계에서 돌아가는 경우 대비)
CMD ["npm", "run", "start:prod"]
