"use client"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import { MenuIcon, CloseIcon } from "./icons"
import { RoleBadge } from "./role-badge"

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  useEffect(() => {
    let isSubscribed = true
    const checkLoginStatus = async () => {
      try {
        const response = await fetch("/api/verify-session", {
          credentials: "include",
        })
        if (!response.ok) {
          if (isSubscribed) {
            setIsLoggedIn(false)
            setUser(null)
          }
          return
        }
        const data = await response.json()
        if (!isSubscribed) {
          return
        }
        if (data?.authenticated) {
          setIsLoggedIn(true)
          setUser(data)
        } else {
          setIsLoggedIn(false)
          setUser(null)
        }
      } catch (error) {
        console.error("[VectoBeat] Login check error:", error)
        if (isSubscribed) {
          setIsLoggedIn(false)
          setUser(null)
        }
      }
    }
    void checkLoginStatus()
    return () => {
      isSubscribed = false
    }
  }, [])

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

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" })
    } catch (error) {
      console.error("[VectoBeat] Logout failed:", error)
    }
    localStorage.removeItem("discord_token")
    localStorage.removeItem("discord_user_id")
    setUser(null)
    setIsLoggedIn(false)
    setProfileMenuOpen(false)
    router.push("/")
  }

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/features", label: "Features" },
    { href: "/commands", label: "Commands" },
    { href: "/pricing", label: "Pricing" },
    { href: "/blog", label: "Blog" },
    { href: "/forum", label: "Forum" },
  ]

  return (
    <nav className="fixed w-full top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border animate-slide-down">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/logo.png" alt="VectoBeat" width={32} height={32} className="h-8 w-8 rounded-md" />
            <span className="font-bold text-lg text-primary group-hover:text-primary/80 transition-colors hidden sm:inline">
              VectoBeat
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8 flex-1 justify-center">
            {navLinks.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-foreground/70 hover:text-primary transition-colors duration-200 text-sm font-medium animate-slide-down"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3 flex-1 justify-end">
            <a
              href="https://github.com/VectoDE/VectoBeat"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-primary transition-colors animate-slide-in-right animation-delay-200"
            >
              GitHub
            </a>
            <a
              href={DISCORD_BOT_INVITE_URL}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all duration-300 text-sm animate-zoom-bounce animation-delay-300 hover:glow-pulse"
            >
              Add to Discord
            </a>
            {isLoggedIn && user && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-2 border border-border/60 rounded-full bg-card/70 hover:border-primary/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center">
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt={user.username}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-sm font-semibold text-primary">
                        {user.username?.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-xs text-foreground/60">Signed in</span>
                    <span className="text-sm font-semibold text-foreground">
                      {user.displayName || user.username}
                    </span>
                  </div>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-3 w-48 rounded-lg border border-border/60 bg-card/90 backdrop-blur shadow-xl z-50">
                    <div className="px-4 py-2 border-b border-border/50">
                      <p className="text-sm font-semibold text-foreground truncate">{user.username}</p>
                      <p className="text-xs text-foreground/60 truncate">{user.email || "No email connected"}</p>
                      <div className="mt-2">
                        <RoleBadge role={user.role} />
                      </div>
                    </div>
                    <div className="py-2 text-sm text-foreground/70">
                      {(user.role === "admin" || user.role === "operator") && (
                        <Link
                          href="/control-panel/admin"
                          className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                          onClick={() => setProfileMenuOpen(false)}
                        >
                          Admin
                        </Link>
                      )}
                      <Link
                        href="/control-panel"
                        className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        Control Panel
                      </Link>
                      <Link
                        href="/account"
                        className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        Account
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 hover:bg-destructive/20 text-destructive transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-foreground hover:text-primary transition-colors animate-rotate-in ml-auto"
          >
            {isOpen ? <CloseIcon size={24} /> : <MenuIcon size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden border-t border-border bg-card/95 backdrop-blur-sm animate-slide-down">
            <div className="px-4 py-4 space-y-3">
              {navLinks.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="block text-foreground/70 hover:text-primary transition-colors py-2 animate-slide-in-right"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {link.label}
                </Link>
              ))}

              {isLoggedIn && user ? (
                <div className="pt-2">
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setProfileMenuOpen((prev) => !prev)}
                      className="w-full flex items-center gap-3 px-3 py-2 border border-border/60 rounded-xl bg-card/80 hover:border-primary/60 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center">
                        {user.avatarUrl ? (
                          <Image
                            src={user.avatarUrl}
                            alt={user.username}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-sm font-semibold text-primary">
                            {user.username?.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-xs text-foreground/60">Signed in</span>
                        <span className="text-sm font-semibold text-foreground">
                          {user.displayName || user.username}
                        </span>
                      </div>
                    </button>
                    {profileMenuOpen && (
                      <div className="absolute left-0 right-0 mt-2 rounded-lg border border-border/60 bg-card/95 backdrop-blur shadow-xl z-50">
                        <div className="px-4 py-2 border-b border-border/50">
                          <p className="text-sm font-semibold text-foreground truncate">{user.username}</p>
                          <p className="text-xs text-foreground/60 truncate">{user.email || "No email connected"}</p>
                        </div>
                        <div className="py-1 text-sm text-foreground/80">
                          {(user.role === "admin" || user.role === "operator") && (
                            <Link
                              href="/control-panel/admin"
                              className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                              onClick={() => {
                                setProfileMenuOpen(false)
                                setIsOpen(false)
                              }}
                            >
                              Admin
                            </Link>
                          )}
                          <Link
                            href="/control-panel"
                            className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                            onClick={() => {
                              setProfileMenuOpen(false)
                              setIsOpen(false)
                            }}
                          >
                            Control Panel
                          </Link>
                          <Link
                            href="/account"
                            className="block px-4 py-2 hover:bg-primary/10 transition-colors"
                            onClick={() => {
                              setProfileMenuOpen(false)
                              setIsOpen(false)
                            }}
                          >
                            Account
                          </Link>
                          <button
                            onClick={() => {
                              handleLogout()
                              setProfileMenuOpen(false)
                              setIsOpen(false)
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-destructive/20 text-destructive transition-colors"
                          >
                            Logout
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="pt-3 border-t border-border space-y-2">
                <a
                  href="https://github.com/VectoDE/VectoBeat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-foreground/70 hover:text-primary transition-colors py-2 animate-slide-in-right animation-delay-300"
                >
                  GitHub
                </a>
                <a
                  href={DISCORD_BOT_INVITE_URL}
                  className="block w-full px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all text-center animate-zoom-bounce animation-delay-400"
                >
                  Add to Discord
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
