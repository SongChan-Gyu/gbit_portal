# 로컬: Docker 미사용. MySQL 따로 띄우고 npm run dev
# 운영: Dockerfile만 사용 (Railway 등에서 빌드·실행)
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci && npx prisma generate

# ── 운영 (next build + start) ─────────────────────────
FROM base AS prod
COPY . .
RUN npm run build
EXPOSE 3000
# 컨테이너 시작 시 마이그레이션·시드 후 앱 실행 (Pre-deploy가 빌드 단계에서 돌아가는 경우 대비)
CMD ["npm", "run", "start:prod"]
