FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl && corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
RUN npm ci --include=dev

FROM deps AS builder
WORKDIR /app
ARG DATABASE_URL="mysql://placeholder:placeholder@localhost:3306/vectobeat"
# Prisma needs a DATABASE_URL at build time even though it does not connect.
ENV DATABASE_URL="mysql://placeholder:placeholder@localhost:3306/vectobeat"
# Provide a non-secret placeholder for STRIPE at build time to satisfy Next.js/Stripe checks.
ARG BUILD_STRIPE_KEY="dummy_stripe_key"
COPY frontend ./
COPY plan-capabilities.json ./plan-capabilities.json
RUN STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" npx prisma generate && \
    STRIPE_SECRET_KEY="${BUILD_STRIPE_KEY}" npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3050
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/plan-capabilities.json ./plan-capabilities.json
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3050"]
