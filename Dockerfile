# Stage 1: React 빌드
FROM node:20-alpine AS builder
WORKDIR /app

COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Stage 2: 프로덕션 서버
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production

# Cloud Run은 PORT 환경변수를 자동 주입 (기본 8080)
EXPOSE 8080

CMD ["node", "server.js"]
