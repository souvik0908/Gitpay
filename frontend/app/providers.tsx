"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { WalletProvider } from "@/providers/wallet-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      <WalletProvider>
        {children}
      </WalletProvider>
    </NextThemesProvider>
  )
}
