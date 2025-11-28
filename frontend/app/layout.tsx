import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { CookieBanner } from "@/components/cookie-banner"
import { Analytics } from "@vercel/analytics/react"
import { SiteAnalyticsTracker } from "@/components/site-analytics"

const _geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const _geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  metadataBase: new URL("https://vectobeat.uplytech.de"),
  title: {
    default: "VectoBeat - Premium Discord Music Bot | Professional Audio Streaming",
    template: "%s | VectoBeat",
  },
  description:
    "The ultimate Discord music bot with high-fidelity audio streaming, advanced playback controls, multi-source support, and premium features for communities of any size.",
  applicationName: "VectoBeat",
  generator: "VectoBeat",
  keywords: [
    "Discord music bot",
    "VectoBeat",
    "Lavalink v4",
    "audio streaming",
    "premium music bot",
    "discord automation",
    "discord analytics",
    "discord dj",
  ],
  openGraph: {
    title: "VectoBeat - Premium Discord Music Bot",
    description: "Professional-grade music streaming for Discord servers",
    type: "website",
    url: "/",
    siteName: "VectoBeat",
    images: [
      {
        url: "/favicon.ico",
        width: 1200,
        height: 630,
        alt: "VectoBeat - Premium Discord Music Bot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VectoBeat - Premium Discord Music Bot",
    description: "Professional-grade music streaming for Discord servers",
    images: ["/favicon.ico"],
    creator: "@vectobeat",
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/logo.png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
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
    <html
      lang={language}
      suppressHydrationWarning
      data-language={language}
      className={`${_geist.variable} ${_geistMono.variable}`}
    >
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
        <Suspense fallback={null}>
          <SiteAnalyticsTracker />
        </Suspense>
      </body>
    </html>
  )
}
