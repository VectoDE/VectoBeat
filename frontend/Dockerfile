FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl && corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
RUN npm ci --include=dev

FROM deps AS builder
WORKDIR /app
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN [ -n "$DATABASE_URL" ] || (echo "DATABASE_URL build arg is required for Prisma" && exit 1)
COPY frontend ./
COPY plan-capabilities.json ./plan-capabilities.json
# Run Prisma with provided DATABASE_URL before building.
RUN npx prisma generate

# Provide a non-secret placeholder for STRIPE at build time to satisfy Next.js/Stripe checks.
ARG BUILD_STRIPE_KEY="dummy_stripe_key"
RUN --mount=type=secret,id=DATA_ENCRYPTION_KEY \
    DATA_ENCRYPTION_KEY="$(cat /run/secrets/DATA_ENCRYPTION_KEY)" \
    STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" \
    npx prisma generate && \
    DATA_ENCRYPTION_KEY="$(cat /run/secrets/DATA_ENCRYPTION_KEY)" \
    STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" \
    npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3060
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/plan-capabilities.json ./plan-capabilities.json
EXPOSE 3060
CMD ["sh", "-c", "npx prisma db push && npm start"]
