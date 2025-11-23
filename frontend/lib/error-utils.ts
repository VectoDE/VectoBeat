export const correlationIdFromError = (error?: { digest?: string }) => {
  if (error?.digest) return error.digest
  const randomUuid = (globalThis.crypto as Crypto | undefined)?.randomUUID
  if (typeof randomUuid === "function") {
    return randomUuid.call(globalThis.crypto)
  }
  return `incident-${Date.now()}`
}
