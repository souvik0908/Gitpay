'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'

type WalletState = {
  address: string | null
  chainId: number | null
  isConnecting: boolean
  provider: ethers.BrowserProvider | null
  signer: ethers.Signer | null
  connect: () => Promise<void>
  disconnect: () => void
  ensureCronosTestnet: () => Promise<void>
}

const WalletContext = createContext<WalletState | null>(null)

// Cronos Testnet (T3) chain id in your env is 338. Keep consistent.
const CRONOS_TESTNET_CHAIN_ID = 338

declare global {
  interface Window {
    ethereum?: any
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)

  const disconnect = () => {
    setAddress(null)
    setChainId(null)
    setSigner(null)
    // provider can remain, but it’s fine to keep it
  }

  const refresh = async (p: ethers.BrowserProvider) => {
    const s = await p.getSigner()
    const a = await s.getAddress()
    const n = await p.getNetwork()
    setSigner(s)
    setAddress(a)
    setChainId(Number(n.chainId))
  }

  const ensureCronosTestnet = async () => {
    if (!window.ethereum) return
    const hexChainId = '0x' + CRONOS_TESTNET_CHAIN_ID.toString(16)

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      })
    } catch (err: any) {
      // If chain not added
      if (err?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: 'Cronos Testnet',
              nativeCurrency: { name: 'TCRO', symbol: 'TCRO', decimals: 18 },
              rpcUrls: ['https://evm-t3.cronos.org'],
              blockExplorerUrls: ['https://explorer.cronos.org/testnet'],
            },
          ],
        })
      } else {
        throw err
      }
    }
  }

  const connect = async () => {
    if (!window.ethereum) throw new Error('MetaMask not found')

    setIsConnecting(true)
    try {
      // Request accounts
      await window.ethereum.request({ method: 'eth_requestAccounts' })

      const p = new ethers.BrowserProvider(window.ethereum)
      setProvider(p)

      // Optional but recommended: enforce correct chain before signing
      await ensureCronosTestnet()

      await refresh(p)
    } finally {
      setIsConnecting(false)
    }
  }

  // keep state synced with metamask changes
  useEffect(() => {
    if (!window.ethereum) return

    const onAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) return disconnect()
      if (provider) await refresh(provider)
      else {
        const p = new ethers.BrowserProvider(window.ethereum)
        setProvider(p)
        await refresh(p)
      }
    }

    const onChainChanged = async () => {
      if (!window.ethereum) return
      const p = new ethers.BrowserProvider(window.ethereum)
      setProvider(p)
      await refresh(p)
    }

    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)

    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', onChainChanged)
    }
  }, [provider])

  const value = useMemo(
    () => ({
      address,
      chainId,
      isConnecting,
      provider,
      signer,
      connect,
      disconnect,
      ensureCronosTestnet,
    }),
    [address, chainId, isConnecting, provider, signer]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
