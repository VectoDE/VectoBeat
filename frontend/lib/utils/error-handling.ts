import { handlePrismaError } from "../prisma"

export const logError = (message: string, error: unknown) => {
  handlePrismaError(error)
  // eslint-disable-next-line no-console
  console.error("[ERROR]", message, error)
}

export const logSecurityError = (message: string, error?: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[SECURITY]", message, error)
}
