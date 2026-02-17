import { handlePrismaError } from "../prisma"

export const logError = (message: string, error: unknown) => {
  handlePrismaError(error)
  console.error(message, error)
}

export const logSecurityError = (message: string, error?: unknown) => {
  console.error(`[SECURITY] ${message}`, error)
}
