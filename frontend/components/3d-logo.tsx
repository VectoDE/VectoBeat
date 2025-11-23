"use client"

import Image from "next/image"

export default function Logo3D() {
  return (
    <div className="w-full h-auto flex items-center justify-center">
      <div className="relative w-96 h-96 animate-fade-in-up">
        <Image
          src="/logo.png"
          alt="VectoBeat Logo"
          width={384}
          height={384}
          priority
          className="w-full h-full object-contain filter hover:drop-shadow-[0_0_25px_rgba(255,149,0,0.4)] transition-all duration-300"
        />
      </div>
    </div>
  )
}
