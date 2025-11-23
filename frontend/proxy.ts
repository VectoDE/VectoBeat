import { NextResponse, type NextRequest } from "next/server"

const ONE_YEAR = 60 * 60 * 24 * 365

export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const existing = request.cookies.get("lang")?.value

  if (!existing) {
    response.cookies.set("lang", "en", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next|api|static|favicon.ico).*)"],
}
