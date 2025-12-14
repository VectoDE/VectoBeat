import { buildPageMetadata } from "@/lib/seo"
import { PartnersClient } from "./partners-client"

export const metadata = buildPageMetadata({
  title: "Partners | VectoBeat Network",
  description:
    "Meet the partners powering VectoBeat. Infrastructure, payments, and platform collaborators that keep the music flowing.",
  path: "/partners",
  keywords: ["VectoBeat partners", "Discord music partners", "Lavalink partners", "Discord bot ecosystem"],
})

export default function PartnersPage() {
  return <PartnersClient />
}
