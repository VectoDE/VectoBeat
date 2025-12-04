FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl && corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
RUN npm ci --include=dev

FROM deps AS builder
WORKDIR /app
COPY frontend ./
COPY plan-capabilities.json ./plan-capabilities.json
# Ensure build uses real env (DATABASE_URL) for Prisma.
COPY .env ./.env
RUN set -a; . ./.env; set +a; \
    npx prisma generate && \
    npx prisma db push

# Provide a non-secret placeholder for STRIPE at build time to satisfy Next.js/Stripe checks.
ARG BUILD_STRIPE_KEY="dummy_stripe_key"
RUN STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" npx prisma generate && \
    STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" npm run build

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
COPY --from=builder /app/plan-capabilities.json ./plan-capabilities.json
EXPOSE 3060
CMD ["npm", "run", "start", "--", "-p", "3060"]
