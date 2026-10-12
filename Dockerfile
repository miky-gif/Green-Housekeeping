# Image unique : le frontend est compilé puis servi par FastAPI (API + WebSocket + pages).
# Fonctionne sur Render, Railway, Fly.io, Koyeb… ou tout hôte Docker.

# --- 1. Compilation du frontend -------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Serveur Python ----------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GH_MODE=demo \
    GH_DB_URL=sqlite:////data/green_housekeeping.db \
    PORT=8000
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN mkdir -p /data
EXPOSE 8000

# Une seule instance : les connexions WebSocket sont gérées en mémoire.
# --proxy-headers : l'hébergeur termine le HTTPS devant le conteneur.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*' --ws-ping-interval 10 --ws-ping-timeout 10 --no-access-log"]
