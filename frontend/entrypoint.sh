#!/bin/sh
set -e

# Ensure Prisma client and database schema are up-to-date before starting.
npx prisma generate
npx prisma db push

exec npm run start -- -p 3060
