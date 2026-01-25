'use client'

import Link from 'next/link'

import { useMemo, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  Code2,
  DollarSign,
  FileLock2,
  Github,
  GitPullRequest,
  Globe,
  Layers3,
  Lock,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
  Zap,
  Bug, // Added Bug icon
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// NOTE:
// - This page is designed to match your current theme + shadcn setup.
// - No hard-coded colors (so it respects your OKLCH theme tokens).
// - Replace links + bounty data with your real API later.

type Bounty = {
  id: number
  title: string
  repo: string
  amount: string
  status: 'Open' | 'Funded'
  tags: string[]
  href: string
}

const DEMO_BOUNTIES: Bounty[] = [
  {
    id: 1,
    title: 'Fix EIP-3009 signature validation edge-case',
    repo: 'souvik0908/gitpay',
    amount: '50 USDC',
    status: 'Funded',
    tags: ['Blockchain', 'EIP-712'],
    href: '/bounties/1',
  },
  {
    id: 2,
    title: 'Implement Dispute Resolution UI (MVP)',
    repo: 'souvik0908/gitpay',
    amount: '100 USDC',
    status: 'Funded',
    tags: ['Next.js', 'UI'],
    href: '/bounties/2',
  },
  {
    id: 3,
    title: 'Optimize facilitator payment handshake (402)',
    repo: 'souvik0908/gitpay',
    amount: '20 USDC',
    status: 'Funded',
    tags: ['x402', 'Backend'],
    href: '/bounties/3',
  },
]

type FaqItem = { q: string; a: string }

const FAQ: FaqItem[] = [
  {
    q: 'What problem does GitPay solve?',
    a: 'Open-source bug fixes often stall due to missing proof-of-funds. GitPay locks USDC in escrow upfront and settles instantly when the fix ships.',
  },
  {
    q: 'How is proof-of-funds verified?',
    a: 'When a maintainer funds a bug report, GitPay records the transaction hash and marks it as Funded. Contributors can verify the escrow balance on-chain.',
  },
  {
    q: 'Is this live on mainnet?',
    a: 'Currently built for Cronos Testnet (T3). The architecture is mainnet-ready: swap contract addresses + environment configs, then deploy.',
  },
  {
    q: 'Do contributors need to pay gas to claim?',
    a: 'No. The payout flow is designed so contributors simply receive USDC to their wallet. Maintainers handle the gas fees via the Agent.',
  },
]

export function computeBountyStats(bounties: Bounty[]) {
  const total = bounties.length
  const funded = bounties.filter((b) => b.status === 'Funded').length
  const open = total - funded
  return { total, funded, open }
}

export default function HomePage() {
  const bountyStats = useMemo(() => computeBountyStats(DEMO_BOUNTIES), [])

  return (
    <div className="flex min-h-screen flex-col">
      {/* HERO */}
      <section className="relative overflow-hidden border-b">
        {/* subtle background */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 right-[-120px] h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
        </div>

        {/* Added 'relative z-10' to ensure text is above background elements */}
        <div className="container px-4 py-20 md:py-28 relative z-10">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                <Sparkles className="mr-2 h-3.5 w-3.5" /> Live on Cronos Testnet
              </Badge>
              <Badge variant="outline" className="rounded-full px-4 py-1">
                <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Proof-of-Funds
              </Badge>
              <Badge variant="outline" className="rounded-full px-4 py-1">
                <Zap className="mr-2 h-3.5 w-3.5" /> x402 Payments
              </Badge>
            </div>

            {/* Added pb-2 to prevent descender clipping */}
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl pb-2">
              GitPay
              <span className="block text-muted-foreground">Autonomous bug bounties on Cronos.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              GitPay turns GitHub Issues into trustless financial contracts. Maintainers lock USDC in escrow
              when creating a bug report, and contributors verify funds on-chain before writing a single line of code.
            </p>

            <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/bounties">
                  Explore Bugs <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/dashboard">
                  Post a Bug <Bug className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="gap-2">
                <a href="https://github.com/souvik0908/gitpay" target="_blank" rel="noreferrer">
                  View on GitHub <Github className="h-4 w-4" />
                </a>
              </Button>
            </div>

            {/* quick credibility row */}
            <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniStat icon={<Layers3 className="h-4 w-4" />} label="Total Bugs" value={`${bountyStats.total}`} />
              <MiniStat icon={<Lock className="h-4 w-4" />} label="Funded" value={`${bountyStats.funded}`} />
              <MiniStat icon={<Timer className="h-4 w-4" />} label="Open" value={`${bountyStats.open}`} />
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="container px-4 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold tracking-tight">Why GitPay?</h2>
            <p className="text-muted-foreground">Because open-source work deserves predictable payments, not promises.</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<FileLock2 className="h-6 w-6" />}
              title="Escrow secured"
              description="USDC is locked into the GitPay Treasury before any work begins. Proof-of-funds is visible on-chain."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Instant settlement"
              description="In the future-state flow, merged PRs trigger automatic release to the contributor via x402 facilitator."
            />
            <FeatureCard
              icon={<Globe className="h-6 w-6" />}
              title="Global by default"
              description="No banking friction. Contributors receive stablecoin payouts directly to their wallet across borders."
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* HOW IT WORKS */}
      <section className="container px-4 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="text-muted-foreground">A simple flow with cryptographic guarantees.</p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="h-5 w-5" /> Maintainer flow
                </CardTitle>
                <CardDescription>Fund a bug report with proof-of-funds built in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Step
                  n="1"
                  title="Select a GitHub issue"
                  desc="Pick a bug that needs fixing and set a bounty amount in USDC."
                  icon={<Code2 className="h-5 w-5" />}
                />
                <Step
                  n="2"
                  title="Connect wallet"
                  desc="MetaMask connects on demand (no automatic popups)."
                  icon={<Wallet className="h-5 w-5" />}
                />
                <Step
                  n="3"
                  title="Sign authorization"
                  desc="Sign EIP-712 / EIP-3009 structured data — readable and secure."
                  icon={<ShieldCheck className="h-5 w-5" />}
                />
                <Step
                  n="4"
                  title="Escrow lock"
                  desc="USDC moves into the GitPay Treasury escrow, recorded by tx hash."
                  icon={<Lock className="h-5 w-5" />}
                />
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full gap-2">
                  <Link href="/dashboard">
                    Fund a bug <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5" /> Contributor flow
                </CardTitle>
                <CardDescription>Verify first. Build second. Get paid.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Step
                  n="1"
                  title="Discover funded bugs"
                  desc="Browse bug reports that are marked Funded with on-chain verification."
                  icon={<Layers3 className="h-5 w-5" />}
                />
                <Step
                  n="2"
                  title="Ship code"
                  desc="Open a PR, follow the issue requirements, and iterate in public."
                  icon={<Github className="h-5 w-5" />}
                />
                <Step
                  n="3"
                  title="Merge triggers settlement"
                  desc="Future state: facilitator detects merge and releases escrow automatically."
                  icon={<Zap className="h-5 w-5" />}
                />
                <Step
                  n="4"
                  title="Get paid in USDC"
                  desc="Funds arrive directly to your wallet — global and instant."
                  icon={<DollarSign className="h-5 w-5" />}
                />
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link href="/bounties">
                    Find work <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* ACTIVE BUGS */}
      <section className="border-y bg-muted/30">
        <div className="container px-4 py-16 md:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Active Bugs</h2>
                <p className="text-muted-foreground">Real money waiting for code.</p>
              </div>
              <Button asChild variant="secondary" className="mt-4 sm:mt-0">
                <Link href="/bounties">View all bugs</Link>
              </Button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {DEMO_BOUNTIES.map((b) => (
                <Card key={b.id} className="rounded-3xl transition hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant={b.status === 'Funded' ? 'default' : 'secondary'}>{b.status}</Badge>
                      <span className="text-sm font-semibold">{b.amount}</span>
                    </div>
                    <CardTitle className="mt-4 line-clamp-2">{b.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Github className="h-3.5 w-3.5" />
                      <span className="truncate">{b.repo}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {b.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <Button asChild className="w-full">
                      <Link href={b.href}>View bug</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/30">
        <div className="container px-4 py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-col gap-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight">FAQ</h2>
              <p className="text-muted-foreground">Quick answers for judges and users.</p>
            </div>

            <div className="mt-10 space-y-3">
              {FAQ.map((item) => (
                <FaqCard key={item.q} q={item.q} a={item.a} />
              ))}
            </div>

            <div className="mt-12 flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">Ready to turn your repo into a marketplace for contributors?</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/dashboard">
                    Post a Bug <Bug className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <Link href="/bounties">
                    Contribute & earn <GitPullRequest className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t">
        <div className="container px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-primary p-2 text-primary-foreground">
                <Github className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">GitPay</p>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} GitPay. Built for hackathons and beyond.</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full">Cronos</Badge>
              <Badge variant="outline" className="rounded-full">x402</Badge>
              <Badge variant="outline" className="rounded-full">USDC</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border bg-card/60 p-4 text-left shadow-sm">
      <div className="rounded-xl border bg-background p-2 text-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-background">{icon}</div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function Step({
  n,
  title,
  desc,
  icon,
}: {
  n: string
  title: string
  desc: string
  icon: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border bg-background text-sm font-semibold">
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </div>
          <div className="mt-0.5 rounded-xl border bg-background p-2 text-muted-foreground">{icon}</div>
        </div>
      </div>
    </div>
  )
}

function FaqCard({ q, a }: { q: string; a: string }) {
  // Native <details> gives you accessible expand/collapse without extra UI dependencies.
  return (
    <Card className="rounded-3xl">
      <CardHeader className="pb-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <span className="text-base font-semibold">{q}</span>
            <span className="rounded-xl border bg-background p-2 text-muted-foreground transition group-open:rotate-180">
              <ArrowRight className="h-4 w-4 rotate-90" />
            </span>
          </summary>
          <div className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</div>
        </details>
      </CardHeader>
    </Card>
  )
}