import { NextResponse } from "next/server"
import { getBotCommands } from "@/lib/commands"

export async function GET() {
  const commands = await getBotCommands()
  return NextResponse.json({ commands })
}
