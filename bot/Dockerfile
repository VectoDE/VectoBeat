FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

COPY bot/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY bot/src ./src
COPY bot/config.yml ./config.yml

# Default configuration path; can be overridden via CONFIG_PATH env.
ENV CONFIG_PATH=/app/config.yml

FROM base AS production
CMD ["python", "-m", "src.main"]

# Development target keeps the same layout but can be used with bind mounts.
FROM base AS development
ENV PYTHONPATH=/app
CMD ["python", "-m", "src.main"]
