import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner"; // <--- IMPORT THIS

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GitPay",
  description: "Autonomous Bounties",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <Toaster /> {/* <--- ADD THIS HERE */}
        </Providers>
      </body>
    </html>
  );
}