# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy source and build
COPY frontend ./
COPY plan-capabilities.json ./plan-capabilities.json

# Build arguments and environment variables
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
ARG BUILD_STRIPE_KEY="dummy_stripe_key"
ARG DATA_ENCRYPTION_KEY="dummy_encryption_key_32_chars_exactly_!!!!"

# Generate Prisma client and build application
RUN STRIPE_SECRET_KEY=${BUILD_STRIPE_KEY} \
    DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY} \
    npx prisma generate && \
    STRIPE_SECRET_KEY=${BUILD_STRIPE_KEY} \
    DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY} \
    npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3060

# Install production dependencies only and clean cache
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Copy built artifacts and necessary configuration
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/plan-capabilities.json ./plan-capabilities.json

# Ensure Prisma client is available
RUN npx prisma generate

EXPOSE 3060
CMD ["sh", "-c", "npx prisma db push && npm start"]
