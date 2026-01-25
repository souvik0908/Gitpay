'use client'

import * as React from 'react'
import { ExternalLink, Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type ReceiptData = {
  owner: string
  repo: string
  issue_number: number
  funded_tx_hash?: string
  fundedTxHash?: string
  amount_base_units?: string
  asset?: string
  treasury_wallet?: string
  funded_from?: string
  funded_at?: string
}

function getHash(r: ReceiptData) {
  return r.funded_tx_hash || r.fundedTxHash || ''
}

export function ReceiptDialog({ receipt }: { receipt: ReceiptData }) {
  const hash = getHash(receipt)
  const explorer = hash ? `https://explorer.cronos.org/testnet/tx/${hash}` : ''

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Receipt className="h-4 w-4" /> Receipt
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          {/* ✅ Fixes Radix warning: DialogTitle required */}
          <DialogTitle>Payment Receipt</DialogTitle>

          {/* ✅ Fixes Radix warning: DialogDescription or aria-describedby */}
          <DialogDescription>
            Funding details for {receipt.owner}/{receipt.repo} #{receipt.issue_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Tx Hash</div>
            {hash ? (
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono break-all">{hash}</div>
                <Button asChild size="sm" variant="secondary" className="gap-2">
                  <a href={explorer} target="_blank">
                    <ExternalLink className="h-4 w-4" /> View
                  </a>
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground">No tx hash available.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Amount (base units)</div>
              <div className="font-mono break-all">{receipt.amount_base_units || '-'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Asset</div>
              <div className="font-mono break-all">{receipt.asset || '-'}</div>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Treasury</div>
            <div className="font-mono break-all">{receipt.treasury_wallet || '-'}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Funded From</div>
              <div className="font-mono break-all">{receipt.funded_from || '-'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Funded At</div>
              <div className="font-mono break-all">{receipt.funded_at || '-'}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
