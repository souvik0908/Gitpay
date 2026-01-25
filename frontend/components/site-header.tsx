'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Wallet, Github } from 'lucide-react'  // Replaced Bug with Github

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { useWallet } from '@/providers/wallet-provider'

const links = [
  { href: '/', label: 'Home' },
  { href: '/bounties', label: 'Active Bugs' },
  { href: '/dashboard', label: 'Create Bug' },
]

export function SiteHeader() {
  const pathname = usePathname()

  // ✅ GLOBAL WALLET
  const { address, connect, disconnect, isConnecting } = useWallet()

  const principalLabel = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  const fallback = address
    ? address.slice(2, 4).toUpperCase()
    : 'U'

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="bg-primary text-primary-foreground rounded-lg p-1">
              <Github className="h-6 w-6" />  {/* Replaced Bug with GitHub logo */}
            </div>
            <span>GitPay</span>
          </Link>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              {links.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      href={link.href}
                      className={cn(
                        navigationMenuTriggerStyle(),
                        pathname === link.href && 'bg-accent'
                      )}
                    >
                      {link.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {address ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden h-9 w-9 md:inline-flex">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {fallback}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">Connected</p>
                  <p className="text-xs text-muted-foreground font-mono">{principalLabel}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Create Bug Bounty</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={disconnect}>Disconnect</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={connect}
              disabled={isConnecting}
              className="hidden md:inline-flex gap-2"
            >
              <Wallet className="h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right">
              <nav className="flex flex-col gap-4 mt-4">
                {links.map((link) => (
                  <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
                    {link.label}
                  </Link>
                ))}

                <Button
                  onClick={address ? disconnect : connect}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {address ? 'Disconnect' : isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
