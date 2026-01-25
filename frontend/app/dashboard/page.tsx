'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { ethers } from 'ethers'
import { Facilitator, CronosNetwork } from '@crypto.com/facilitator-client'
import { Loader2, Wallet, CheckCircle2, AlertCircle, Bug, Receipt } from 'lucide-react'
import { toast } from 'sonner'

import { useWallet } from '@/providers/wallet-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const BACKEND_URL = (process.env.NEXT_PUBLIC_X402_BASE || 'http://localhost:8787').replace(/\/$/, '')

type PaymentRequirements = {
  scheme: 'exact'
  network: 'cronos-testnet' | 'cronos'
  payTo: string
  asset: string
  description?: string
  mimeType?: string
  maxAmountRequired: string // base units string
  maxTimeoutSeconds: number
}

type FundIntent402 = {
  paymentRequirements: PaymentRequirements
}

type FundSuccessShape = any

function extractTxHash(data: FundSuccessShape): string | null {
  // Handles many possible shapes/keys to avoid “missing hash” false errors
  const candidates = [
    data?.funded?.funded_tx_hash,
    data?.funded?.fundedTxHash,
    data?.funded_tx_hash,
    data?.fundedTxHash,
    data?.funded?.funded?.funded_tx_hash,
    data?.funded?.funded?.fundedTxHash,
  ]
  return (candidates.find(Boolean) as string) || null
}

export default function Dashboard() {
  const router = useRouter()

  // ✅ wallet from global provider
  const { address, signer, connect, ensureCronosTestnet, isConnecting, chainId } = useWallet()

  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [status, setStatus] = useState<'idle' | 'signing' | 'settling' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [receipt, setReceipt] = useState<{
    owner: string
    repo: string
    issueNumber: number
    amountBaseUnits: string
    payTo?: string
    asset?: string
    txHash?: string
    alreadyFunded?: boolean
  } | null>(null)

  const [formData, setFormData] = useState({
    owner: 'souvik0908',
    repo: 'gitpay',
    issueNumber: '1',
    amount: '1.0', // USDC, decimals=6
  })

  // ✅ protect route
  useEffect(() => {
    if (address === null) router.replace('/')
  }, [address, router])

  const explorerUrl = useMemo(() => {
    if (!txHash) return ''
    return `https://explorer.cronos.org/testnet/tx/${txHash}`
  }, [txHash])

  const validateIssue = async () => {
    setValidating(true)
    setErrorMsg('')
    try {
      const res = await axios.get(
        `https://api.github.com/repos/${formData.owner}/${formData.repo}/issues/${formData.issueNumber}`
      )
      if (res.status !== 200) throw new Error('Issue not found')
      return true
    } catch (err: any) {
      let msg = 'Could not verify GitHub Issue.'
      if (err.response?.status === 404) msg = 'Repo or Issue not found. Please check details.'
      setErrorMsg(msg)
      toast.error('Validation Failed', { description: msg })
      return false
    } finally {
      setValidating(false)
    }
  }

  const handleFund = async () => {
    setLoading(true)
    setStatus('signing')
    setErrorMsg('')
    setTxHash('')
    setReceipt(null)

    try {
      // 0) Ensure wallet/signer ready
      if (!signer) await connect()
      await ensureCronosTestnet()

      if (!address || !signer) {
        throw new Error('Wallet not connected')
      }

      // 1) Validate GitHub issue
      const ok = await validateIssue()
      if (!ok) return

      const owner = formData.owner.trim()
      const repo = formData.repo.trim()
      const issueNumber = Number(formData.issueNumber)
      const amountBaseUnits = ethers.parseUnits(formData.amount || '0', 6).toString()

      // 2) fund-intent (EXPECT 402 with paymentRequirements)
      const intentRes = await axios.post(
        `${BACKEND_URL}/bounties/fund-intent`,
        { owner, repo, issueNumber, amountBaseUnits },
        { validateStatus: (s) => s === 402 || s === 200 }
      )

      // If backend returns 200 here, it’s usually “already funded”
      if (intentRes.status === 200) {
        // show receipt if hash exists
        const hash = extractTxHash(intentRes.data)
        if (hash) {
          setTxHash(hash)
          setReceipt({
            owner,
            repo,
            issueNumber,
            amountBaseUnits,
            txHash: hash,
            alreadyFunded: true,
          })
          setStatus('success')
          toast.success('Already funded', { description: 'This issue was funded earlier.' })
          return
        }
        throw new Error(intentRes.data?.error || 'This bug is already funded.')
      }

      const intentData = intentRes.data as FundIntent402
      const reqs = intentData?.paymentRequirements

      if (!reqs?.payTo || !reqs?.maxAmountRequired || !reqs?.asset) {
        console.log('Invalid 402 payload from /fund-intent:', intentRes.data)
        throw new Error('Server returned 402 but did not include paymentRequirements')
      }

      setStatus('settling')

      // 3) generate X402 payment header using MetaMask signer
      const facilitator = new Facilitator({ network: CronosNetwork.CronosTestnet })
      const paymentHeader = await facilitator.generatePaymentHeader({
        to: reqs.payTo,
        value: reqs.maxAmountRequired,
        signer,
        validBefore: Math.floor(Date.now() / 1000) + (reqs.maxTimeoutSeconds || 3600),
      })

      // 4) settle /fund (EXPECT 200 success OR 402 failure)
      const fundedRes = await axios.post(
        `${BACKEND_URL}/bounties/fund`,
        { owner, repo, issueNumber, amountBaseUnits, paymentHeader },
        { validateStatus: (s) => s === 200 || s === 402 }
      )

      if (fundedRes.status === 402) {
        console.log('Fund failed (402) payload:', fundedRes.data)
        throw new Error(
          fundedRes.data?.reason ||
            fundedRes.data?.error ||
            'Payment failed (402). Check console for details.'
        )
      }

      // 200 success but could be “already funded” too
      const data = fundedRes.data

      const hash = extractTxHash(data)
      if (!hash) {
        console.log('Fund success response but missing tx hash:', data)
        throw new Error('Server returned 200 but did not include tx hash (funded_tx_hash / fundedTxHash)')
      }

      setTxHash(hash)
      setReceipt({
        owner,
        repo,
        issueNumber,
        amountBaseUnits,
        payTo: reqs.payTo,
        asset: reqs.asset,
        txHash: hash,
        alreadyFunded: Boolean(data?.alreadyFunded),
      })
      setStatus('success')

      toast.success('Bounty Created!', {
        description: 'Funds locked in escrow.',
        action: {
          label: 'View Tx',
          onClick: () => window.open(`https://explorer.cronos.org/testnet/tx/${hash}`),
        },
      })
    } catch (err: any) {
      console.error(err)
      setStatus('error')

      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.reason ||
        err?.message ||
        'Unknown error'

      setErrorMsg(msg)
      toast.error('Funding Failed', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  if (!address) return null

  return (
    <div className="container mx-auto max-w-2xl py-20 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Create Bug Bounty</h1>
        <p className="text-muted-foreground mt-2">Fund bug fixes instantly with USDC escrow.</p>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Fund a Bug
          </CardTitle>
          <CardDescription>Lock funds in the GitPay Treasury.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="owner">Repo Owner</Label>
              <Input
                id="owner"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo">Repo Name</Label>
              <Input
                id="repo"
                value={formData.repo}
                onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issue">Bug Issue Number</Label>
              <div className="relative">
                <Bug className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="issue"
                  className="pl-9"
                  value={formData.issueNumber}
                  onChange={(e) => setFormData({ ...formData, issueNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Bounty Amount (USDC)</Label>
              <div className="relative">
                <span className="absolute left-3 top-3 font-bold text-muted-foreground">$</span>
                <Input
                  id="amount"
                  className="pl-7"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
            </div>
          </div>

          {(status === 'error' || errorMsg) && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {errorMsg}
            </div>
          )}

          {status === 'success' && txHash && (
            <div className="rounded-lg bg-green-500/10 p-4 text-green-600 border border-green-500/20">
              <div className="flex items-center gap-2 font-bold mb-2">
                <CheckCircle2 className="h-5 w-5" /> {receipt?.alreadyFunded ? 'Already Funded' : 'Bug Bounty Created!'}
              </div>
              <p className="text-xs text-muted-foreground break-all">
                Tx Hash:{' '}
                <a href={explorerUrl} target="_blank" className="underline hover:text-green-600">
                  {txHash}
                </a>
              </p>

              {/* Receipt summary */}
              {receipt && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    <span className="font-mono">
                      {receipt.owner}/{receipt.repo} #{receipt.issueNumber}
                    </span>
                  </div>
                  <div className="font-mono">Amount (base units): {receipt.amountBaseUnits}</div>
                  {receipt.asset && <div className="font-mono">Asset: {receipt.asset}</div>}
                  {receipt.payTo && <div className="font-mono">Treasury: {receipt.payTo}</div>}
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter>
          <Button
            className="w-full h-11 text-lg gap-2"
            onClick={handleFund}
            disabled={loading || validating || isConnecting}
          >
            {validating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Repo...
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status === 'signing' ? 'Check MetaMask...' : 'Settling on-chain...'}
              </>
            ) : (
              'Create Bug Bounty'
            )}
          </Button>
        </CardFooter>
      </Card>

      <div className="mt-8 text-center">
        <Badge variant="outline" className="text-muted-foreground font-mono">
          X402: {BACKEND_URL} • Chain: {String(chainId ?? 'unknown')}
        </Badge>
      </div>
    </div>
  )
}
