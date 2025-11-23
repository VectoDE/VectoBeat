import { ImageResponse } from "next/og"

export const size = {
  width: 64,
  height: 64,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#05060b",
          borderRadius: 16,
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: -1,
            color: "#8b5cf6",
            fontFamily: "Geist, Inter, 'Segoe UI', sans-serif",
          }}
        >
          VB
        </span>
      </div>
    ),
    {
      ...size,
    },
  )
}
