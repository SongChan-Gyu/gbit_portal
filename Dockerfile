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
ENV RUN_RESET_LEAVE_TEST_DATA_ONCE=0
# 컨테이너 시작: migrate → 스탬프 장 백필(쿠폰만 있는 기존 DB 정합, 이미 장 있으면 스킵) → seed → next
CMD ["npm", "run", "start:prod"]
