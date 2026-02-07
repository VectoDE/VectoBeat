# Stage 1: Builder
FROM python:3.11-alpine3.19 AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev libffi-dev libsodium-dev make

# Install python dependencies to a specific prefix
COPY bot/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install --prefix=/install --no-cache-dir --no-warn-script-location -r requirements.txt

# Stage 2: Runner
FROM python:3.11-alpine3.19 AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    CONFIG_PATH=/app/config.yml

# Install runtime dependencies only and clean cache
RUN apk add --no-cache libsodium && \
    rm -rf /var/cache/apk/* /tmp/*

# Copy installed python packages from builder
COPY --from=builder /install /usr/local

# Copy application source code
COPY bot/src ./src
COPY bot/config.yml ./config.yml

# Create non-root user
RUN adduser -D vectode && \
    chown -R vectode:vectode /app

USER vectode

CMD ["python", "-m", "src.main"]
