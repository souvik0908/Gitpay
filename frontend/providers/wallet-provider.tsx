'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'

type WalletState = {
  address: string | null
  chainId: number | null
  isConnecting: boolean
  connectError: string | null
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
  const [connectError, setConnectError] = useState<string | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)

  const disconnect = useCallback(() => {
    setAddress(null)
    setChainId(null)
    setSigner(null)
    setProvider(null)
    setConnectError(null)
  }, [])

  const refresh = useCallback(async (p: ethers.BrowserProvider) => {
    const s = await p.getSigner()
    const a = await s.getAddress()
    const n = await p.getNetwork()
    setSigner(s)
    setAddress(a)
    setChainId(Number(n.chainId))
  }, [])

  const ensureCronosTestnet = useCallback(async () => {
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
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setConnectError('MetaMask not found. Please install MetaMask and retry.')
      return
    }

    setIsConnecting(true)
    setConnectError(null)
    try {
      // Request accounts
      await window.ethereum.request({ method: 'eth_requestAccounts' })

      const p = new ethers.BrowserProvider(window.ethereum)
      setProvider(p)

      // Optional but recommended: enforce correct chain before signing
      await ensureCronosTestnet()

      await refresh(p)
    } catch (err: any) {
      const msg =
        err?.code === 4001
          ? 'Connection rejected. Please approve the MetaMask request to continue.'
          : err?.message || 'Failed to connect wallet.'
      setConnectError(msg)
    } finally {
      setIsConnecting(false)
    }
  }, [ensureCronosTestnet, refresh])

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
  }, [provider, disconnect, refresh])

  const value = useMemo(
    () => ({
      address,
      chainId,
      isConnecting,
      connectError,
      provider,
      signer,
      connect,
      disconnect,
      ensureCronosTestnet,
    }),
    [address, chainId, isConnecting, connectError, provider, signer, connect, disconnect, ensureCronosTestnet]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
