import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { CookieBanner } from "@/components/cookie-banner"
import { Analytics } from "@vercel/analytics/react"
import { SiteAnalyticsTracker } from "@/components/site-analytics"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "VectoBeat - Premium Discord Music Bot | Professional Audio Streaming",
  description:
    "The ultimate Discord music bot with high-fidelity audio streaming, advanced playback controls, multi-source support, and premium features for communities of any size.",
  generator: "VectoBeat",
  keywords: "Discord, music bot, streaming, audio, VectoBeat, premium, Lavalink v4",
  openGraph: {
    title: "VectoBeat - Premium Discord Music Bot",
    description: "Professional-grade music streaming for Discord servers",
    type: "website",
    url: "https://vectobeat.com",
  },
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const language = "en"
  return (
    <html lang={language} suppressHydrationWarning data-language={language}>
      <head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://discord.com https://api.stripe.com;"
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className={`font-sans antialiased`}>
        {children}
        <CookieBanner />
        <Analytics />
        <SiteAnalyticsTracker />
      </body>
    </html>
  )
}
