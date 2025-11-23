import { getStoredBotCommands } from "./db"
import { getBotStatus } from "./bot-status"

export type BotCommand = {
  name: string
  description: string
  category: string
}

export type BotCommandGroup = {
  category: string
  commands: Array<{ name: string; description: string }>
}

const normalizeCommand = (input: any, fallbackCategory: string): BotCommand | null => {
  if (!input) return null

  if (typeof input === "string") {
    return {
      name: input,
      description: "",
      category: fallbackCategory,
    }
  }

  if (typeof input === "object") {
    const name = typeof input.name === "string" ? input.name : typeof input.cmd === "string" ? input.cmd : null
    if (!name) {
      return null
    }
    const description =
      typeof input.description === "string"
        ? input.description
        : typeof input.desc === "string"
          ? input.desc
          : typeof input.summary === "string"
            ? input.summary
            : ""
    const category =
      typeof input.category === "string"
        ? input.category
        : typeof input.group === "string"
          ? input.group
          : fallbackCategory

    return {
      name,
      description,
      category,
    }
  }

  return null
}

const normalizeFromObject = (payload: Record<string, any>): BotCommand[] => {
  return Object.entries(payload).flatMap(([category, commands]) => {
    if (!Array.isArray(commands)) {
      return []
    }
    return commands
      .map((entry) => normalizeCommand(entry, category))
      .filter((command): command is BotCommand => Boolean(command))
  })
}

const groupBotCommands = (commands: BotCommand[]): BotCommandGroup[] => {
  if (!commands.length) {
    return []
  }
  const deduped = new Map<string, BotCommand>()
  commands.forEach((command) => {
    const key = `${command.category.toLowerCase()}::${command.name.toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, command)
    }
  })

  const grouped = new Map<string, Array<{ name: string; description: string }>>()
  for (const command of deduped.values()) {
    const category = command.category || "General"
    if (!grouped.has(category)) {
      grouped.set(category, [])
    }
    grouped.get(category)?.push({
      name: command.name,
      description: command.description,
    })
  }

  const groupedArray = Array.from(grouped.entries()).map(([category, groupCommands]) => ({
    category,
    commands: groupCommands.sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return groupedArray.sort((a, b) => a.category.localeCompare(b.category))
}

const loadCommandsFromStatus = async (): Promise<BotCommandGroup[]> => {
  const status = await getBotStatus()
  if (!status) {
    return []
  }

  let commands: BotCommand[] = []
  const raw = (status as { commands?: unknown; commandReference?: unknown }).commands ?? status?.commandReference

  if (Array.isArray(raw)) {
    commands = raw
      .map((entry) => normalizeCommand(entry, "General"))
      .filter((command): command is BotCommand => Boolean(command))
  } else if (raw && typeof raw === "object") {
    commands = normalizeFromObject(raw as Record<string, any>)
  }

  if (!commands.length && status && typeof status === "object") {
    const fallbackSource = (status as { commandCategories?: Record<string, any> }).commandCategories
    if (fallbackSource && typeof fallbackSource === "object") {
      commands = normalizeFromObject(fallbackSource)
    }
  }

  return groupBotCommands(commands)
}

export const getBotCommands = async (): Promise<BotCommandGroup[]> => {
  const stored = await getStoredBotCommands()
  if (stored.length) {
    const normalized = stored.map<BotCommand>((command) => ({
      name: command.name,
      description: command.description ?? "",
      category: command.category || "General",
    }))
    const grouped = groupBotCommands(normalized)
    if (grouped.length) {
      return grouped
    }
  }

  return loadCommandsFromStatus()
}
