import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { apiClient } from "@/lib/api-client"

interface UseAuthReturn {
  isLoggedIn: boolean
  user: any | null
  isLoading: boolean
  checkLoginStatus: () => Promise<void>
  handleLogout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const checkLoginStatus = async () => {
    try {
      const data = await apiClient<any>("/api/verify-session", { credentials: "include" })
      if (data?.authenticated) {
        setIsLoggedIn(true)
        setUser(data)
      } else {
        setIsLoggedIn(false)
        setUser(null)
      }
    } catch (error) {
      setIsLoggedIn(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await apiClient("/api/logout", { method: "POST" })
    } catch (error) {
      // Error is already logged by apiClient
    }
    localStorage.removeItem("discord_token")
    localStorage.removeItem("discord_user_id")
    setUser(null)
    setIsLoggedIn(false)
    router.push("/")
  }

  useEffect(() => {
    void checkLoginStatus()
  }, [])

  return { isLoggedIn, user, isLoading, checkLoginStatus, handleLogout }
}