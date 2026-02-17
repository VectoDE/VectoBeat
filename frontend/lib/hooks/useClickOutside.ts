import { useState, useEffect, useRef } from "react"

interface UseClickOutsideReturn {
  ref: React.RefObject<HTMLDivElement | null>
  isOpen: boolean
  setIsOpen: (value: boolean) => void
}

export function useClickOutside(initialState = false): UseClickOutsideReturn {
  const [isOpen, setIsOpen] = useState(initialState)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener("mousedown", handler)
      return () => document.removeEventListener("mousedown", handler)
    }
  }, [isOpen])

  return { ref, isOpen, setIsOpen }
}
