# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend-web/package.json frontend-web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend-web/index.html frontend-web/tsconfig*.json frontend-web/vite.config.ts ./
COPY frontend-web/src/ ./src/
COPY frontend-web/public/ ./public/
RUN VITE_CARDFIGHT_API_URL= npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CARDFIGHT_FRONTEND_DIST=/app/frontend-web/dist

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && groupadd --system cardfight \
    && useradd --system --gid cardfight --no-create-home cardfight \
    && install -d -o cardfight -g cardfight /app/instance

COPY backend/ ./backend/
COPY migrations/ ./migrations/
COPY deploy/container.py ./deploy/
COPY deck.py ./
COPY --from=frontend /build/dist ./frontend-web/dist/

USER cardfight
EXPOSE 8080
ENTRYPOINT ["python", "-m", "deploy.container"]
