/**
 * Theme preference stored in localStorage.
 * Uses a React context so all consumers (SideNav, BottomNav, etc.) share
 * the same state and always stay in sync when one of them toggles.
 */
import { useState, useEffect, createContext, useContext, createElement, type ReactNode } from "react"

type Theme = "dark" | "light"
const KEY = "closer-theme"

function getStored(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) ?? "dark"
  } catch {
    return "dark"
  }
}

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  isLight: boolean
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getStored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === "light") {
      root.classList.add("light")
      root.style.colorScheme = "light"
    } else {
      root.classList.remove("light")
      root.style.colorScheme = "dark"
    }
    try {
      localStorage.setItem(KEY, theme)
    } catch {}
  }, [theme])

  const toggle = () => setTheme(t => (t === "dark" ? "light" : "dark"))

  return createElement(ThemeContext.Provider, { value: { theme, toggle, isLight: theme === "light" } }, children)
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
