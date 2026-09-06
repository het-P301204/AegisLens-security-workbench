# AegisLens - single-image build.
# Stage 1 builds the React bundle; stage 2 runs FastAPI and serves that bundle,
# so the whole application is one container with no reverse proxy to configure.

# ---------- Stage 1: frontend ----------
FROM node:22-alpine AS frontend

WORKDIR /build

# Copy manifests first so dependency installation is cached across source edits.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: application ----------
FROM python:3.12-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AEGISLENS_DATABASE_URL=sqlite:////data/aegislens.db \
    AEGISLENS_SAMPLE_DATA_DIR=/app/sample-data \
    AEGISLENS_STATIC_DIR=/app/frontend/dist

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app ./backend/app
COPY sample-data ./sample-data
COPY --from=frontend /build/dist ./frontend/dist

# Run as an unprivileged user; /data holds the SQLite file and is a mount point.
RUN useradd --create-home --uid 10001 aegis \
    && mkdir -p /data \
    && chown -R aegis:aegis /app /data
USER aegis

WORKDIR /app/backend
EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
