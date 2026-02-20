import { useEffect } from "react"

export function useScrollAnimation() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return
    }

    const sections = Array.from(document.querySelectorAll("section")).filter(
      (section) => section.getAttribute("data-animate-on-scroll") !== "off",
    )
    
    sections.forEach((section) => {
      if (!section.hasAttribute("data-animate-on-scroll")) {
        section.setAttribute("data-animate-on-scroll", "")
      }
    })

    const animatedElements = Array.from(document.querySelectorAll("[data-animate-on-scroll]")).filter(
      (element) => element.getAttribute("data-animate-on-scroll") !== "off",
    )

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    )

    animatedElements.forEach((element) => observer.observe(element))

    return () => observer.disconnect()
  }, [])
}