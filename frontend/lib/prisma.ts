import { Prisma, PrismaClient } from "@prisma/client"

type GlobalWithPrisma = typeof globalThis & {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as GlobalWithPrisma
let prismaClient: PrismaClient | null = globalForPrisma.prisma ?? null

const PrismaInitError = (Prisma as { PrismaClientInitializationError?: new (...args: any[]) => Error }).PrismaClientInitializationError
const PrismaRustError = (Prisma as { PrismaClientRustPanicError?: new (...args: any[]) => Error }).PrismaClientRustPanicError

const isInstanceOf = (value: unknown, ctor?: new (...args: any[]) => Error) =>
  typeof ctor === "function" && value instanceof ctor

const shouldResetPrisma = (error: unknown) => {
  if (isInstanceOf(error, PrismaInitError) || isInstanceOf(error, PrismaRustError)) {
    return true
  }

  if (error instanceof Error && /server has closed the connection/i.test(error.message)) {
    return true
  }

  return false
}

const detachClient = () => {
  if (process.env.NODE_ENV !== "production") {
    delete globalForPrisma.prisma
  }
  prismaClient = null
}

export const resetPrismaClient = async () => {
  if (prismaClient) {
    try {
      await prismaClient.$disconnect()
    } catch {
      // ignore disconnect errors, we're resetting anyway
    }
  }
  detachClient()
}

export const handlePrismaError = (error: unknown) => {
  if (shouldResetPrisma(error)) {
    resetPrismaClient().catch(() => undefined)
  }
}

export const getPrismaClient = () => {
  if (!process.env.DATABASE_URL) {
    return null
  }

  if (!prismaClient) {
    prismaClient = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
      log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    })

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = prismaClient
    }
  }

  return prismaClient
}
