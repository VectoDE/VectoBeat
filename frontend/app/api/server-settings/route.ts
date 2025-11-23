import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Server settings API is available. Use /api/control-panel/server-settings for panel requests or /api/bot/server-settings for bot sync.",
  })
}
