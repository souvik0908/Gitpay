"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ethers } from "ethers";
import { Facilitator, CronosNetwork } from "@crypto.com/facilitator-client";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Bug,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ✅ Your backend
const BACKEND_URL = (
  process.env.NEXT_PUBLIC_X402_BASE || "http://localhost:8787"
).replace(/\/$/, "");

// ✅ Cronos Testnet ChainId
const CRONOS_TESTNET_CHAIN_ID_HEX = "0x152"; // 338 in hex

// -------------------- Types --------------------
type PaymentRequirements = {
  scheme: "exact";
  network: "cronos-testnet" | "cronos";
  payTo: string;
  asset: string;
  description?: string;
  mimeType?: string;
  maxAmountRequired: string; // base units string
  maxTimeoutSeconds: number;
};

type FundIntent402 = {
  paymentRequirements: PaymentRequirements;
};

type FundSuccessShape = any;

// -------------------- Base64 Helpers (browser-safe) --------------------
function b64DecodeJson<T = any>(b64: string): T {
  return JSON.parse(atob(b64)) as T;
}
function b64EncodeJson(obj: any): string {
  return btoa(JSON.stringify(obj));
}

// -------------------- Signature Fix (v=27/28) --------------------
function normalizeVTo27(sigHex: string): string {
  const sig = ethers.Signature.from(sigHex);
  const v = sig.v === 27 || sig.v === 28 ? sig.v : 27 + sig.yParity;
  return ethers.Signature.from({ r: sig.r, s: sig.s, v }).serialized;
}

function fixX402Header(paymentHeaderBase64: string): string {
  const header = b64DecodeJson<any>(paymentHeaderBase64);
  if (!header?.payload?.signature) {
    throw new Error("Invalid payment header: missing payload.signature");
  }
  header.payload.signature = normalizeVTo27(header.payload.signature);
  return b64EncodeJson(header);
}

// -------------------- Guards --------------------
function assertHeaderNotFromEqualsTo(paymentHeaderBase64: string) {
  const h = b64DecodeJson<any>(paymentHeaderBase64);
  const from = h?.payload?.from;
  const to = h?.payload?.to;
  if (!from || !to) throw new Error("Invalid payment header: missing payload.from/to");
  if (ethers.getAddress(from) === ethers.getAddress(to)) {
    throw new Error(
      `Invalid payment header: payload.from equals payload.to (${from}). Switch MetaMask account (buyer wallet) and retry.`
    );
  }
}

function assertHeaderMatchesRequirements(paymentHeaderBase64: string, reqs: PaymentRequirements) {
  const h = b64DecodeJson<any>(paymentHeaderBase64);
  const p = h?.payload;

  if (!p?.to || !p?.asset || !p?.value) {
    throw new Error("Invalid payment header: missing payload.to/asset/value");
  }

  if (ethers.getAddress(p.to) !== ethers.getAddress(reqs.payTo)) {
    throw new Error(`Header 'to' mismatch: ${p.to} != payTo(${reqs.payTo})`);
  }

  if (ethers.getAddress(p.asset) !== ethers.getAddress(reqs.asset)) {
    throw new Error(`Header 'asset' mismatch: ${p.asset} != asset(${reqs.asset})`);
  }

  if (String(p.value) !== String(reqs.maxAmountRequired)) {
    throw new Error(`Header 'value' mismatch: ${p.value} != required(${reqs.maxAmountRequired})`);
  }
}

function extractTxHash(data: FundSuccessShape): string | null {
  const candidates = [
    data?.funded?.funded_tx_hash,
    data?.funded?.fundedTxHash,
    data?.funded_tx_hash,
    data?.fundedTxHash,
    data?.funded?.funded?.funded_tx_hash,
    data?.funded?.funded?.fundedTxHash,
    data?.fundedTxHash,
  ];
  return (candidates.find(Boolean) as string) || null;
}

// -------------------- MetaMask Utilities (NO dependency on your wallet-provider) --------------------
async function requireMetaMask(): Promise<any> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("MetaMask not found. Install MetaMask and retry.");
  return eth;
}

async function ensureCronosTestnet(eth: any) {
  const current = await eth.request({ method: "eth_chainId" });
  if (current?.toLowerCase() === CRONOS_TESTNET_CHAIN_ID_HEX.toLowerCase()) return;

  // Try switch
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CRONOS_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    // If chain not added, add it
    if (err?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CRONOS_TESTNET_CHAIN_ID_HEX,
            chainName: "Cronos Testnet",
            nativeCurrency: { name: "tCRO", symbol: "tCRO", decimals: 18 },
            rpcUrls: ["https://evm-t3.cronos.org"],
            blockExplorerUrls: ["https://explorer.cronos.org/testnet"],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

async function getMetaMaskSignerAndAddress() {
  const eth = await requireMetaMask();
  await eth.request({ method: "eth_requestAccounts" });
  await ensureCronosTestnet(eth);

  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { eth, provider, signer, address };
}

// -------------------- Component --------------------
export default function Dashboard() {
  const router = useRouter();

  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "signing" | "settling" | "success" | "error"
  >("idle");
  const [txHash, setTxHash] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [receipt, setReceipt] = useState<{
    owner: string;
    repo: string;
    issueNumber: number;
    amountBaseUnits: string;
    payTo?: string;
    asset?: string;
    txHash?: string;
    alreadyFunded?: boolean;
  } | null>(null);

  const [formData, setFormData] = useState({
    owner: "souvik0908",
    repo: "gitpay",
    issueNumber: "1",
    amount: "1.0",
  });

  // Auto-detect if MetaMask has an account already
  useEffect(() => {
    (async () => {
      try {
        const eth = (window as any).ethereum;
        if (!eth) return;
        const accounts = await eth.request({ method: "eth_accounts" });
        if (accounts?.[0]) setConnectedAddress(accounts[0]);
      } catch {
        // ignore
      }
    })();
  }, []);

  // protect route - if you want this page to require wallet connection
  useEffect(() => {
    if (connectedAddress === null) {
      // you can redirect to "/" if needed
      // router.replace("/");
    }
  }, [connectedAddress, router]);

  const explorerUrl = useMemo(() => {
    if (!txHash) return "";
    return `https://explorer.cronos.org/testnet/tx/${txHash}`;
  }, [txHash]);

  const validateIssue = async () => {
    setValidating(true);
    setErrorMsg("");
    try {
      const res = await axios.get(
        `https://api.github.com/repos/${formData.owner}/${formData.repo}/issues/${formData.issueNumber}`
      );
      if (res.status !== 200) throw new Error("Issue not found");
      return true;
    } catch (err: any) {
      let msg = "Could not verify GitHub Issue.";
      if (err.response?.status === 404)
        msg = "Repo or Issue not found. Please check details.";
      setErrorMsg(msg);
      toast.error("Validation Failed", { description: msg });
      return false;
    } finally {
      setValidating(false);
    }
  };

  const connectWallet = async () => {
    try {
      const { address } = await getMetaMaskSignerAndAddress();
      setConnectedAddress(address);
      toast.success("Wallet connected", { description: address });
    } catch (e: any) {
      toast.error("Wallet connect failed", { description: e?.message || "Error" });
    }
  };

  const handleFund = async () => {
    setLoading(true);
    setStatus("signing");
    setErrorMsg("");
    setTxHash("");
    setReceipt(null);

    try {
      // 0) Force correct MetaMask signer + Cronos testnet
      const { signer, address } = await getMetaMaskSignerAndAddress();
      setConnectedAddress(address);

      // 1) Validate GitHub issue exists
      const ok = await validateIssue();
      if (!ok) return;

      const owner = formData.owner.trim();
      const repo = formData.repo.trim();
      const issueNumber = Number(formData.issueNumber);
      const amountBaseUnits = ethers.parseUnits(formData.amount || "0", 6).toString();

      // 2) fund-intent
      const intentRes = await axios.post(
        `${BACKEND_URL}/bounties/fund-intent`,
        { owner, repo, issueNumber, amountBaseUnits },
        { validateStatus: (s) => s === 402 || s === 200 }
      );

      if (intentRes.status === 200) {
        const hash = extractTxHash(intentRes.data);
        if (hash) {
          setTxHash(hash);
          setReceipt({
            owner,
            repo,
            issueNumber,
            amountBaseUnits,
            txHash: hash,
            alreadyFunded: true,
          });
          setStatus("success");
          toast.success("Already funded", { description: "This issue was funded earlier." });
          return;
        }
        throw new Error(intentRes.data?.error || "Already funded.");
      }

      const reqs = (intentRes.data as FundIntent402)?.paymentRequirements;
      if (!reqs?.payTo || !reqs?.maxAmountRequired || !reqs?.asset) {
        throw new Error("Server returned 402 but missing paymentRequirements fields");
      }

      setStatus("settling");

      // 3) Create header using MetaMask signer (buyer)
      const facilitator = new Facilitator({ network: CronosNetwork.CronosTestnet });

      const rawHeader = await facilitator.generatePaymentHeader({
        to: reqs.payTo,
        value: reqs.maxAmountRequired,
        signer, // ✅ MetaMask signer
        validBefore: Math.floor(Date.now() / 1000) + (reqs.maxTimeoutSeconds || 300),
      });

      // 4) Fix v + strict guards
      const paymentHeader = fixX402Header(rawHeader);

      // Ensure from is buyer and to is treasury
      const decoded = b64DecodeJson<any>(paymentHeader);
      if (decoded?.payload?.from?.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `Signer mismatch: header.from=${decoded?.payload?.from} but MetaMask=${address}. Switch MetaMask account and retry.`
        );
      }

      assertHeaderNotFromEqualsTo(paymentHeader);
      assertHeaderMatchesRequirements(paymentHeader, reqs);

      // 5) Send to backend (backend does verify + settle)
      const fundedRes = await axios.post(
        `${BACKEND_URL}/bounties/fund`,
        { owner, repo, issueNumber, amountBaseUnits, paymentHeader },
        { validateStatus: (s) => s === 200 || s === 402 || s === 400 }
      );

      if (fundedRes.status === 400) {
        throw new Error(fundedRes.data?.details || fundedRes.data?.error || "Bad request");
      }

      if (fundedRes.status === 402) {
        throw new Error(
          fundedRes.data?.reason || fundedRes.data?.error || "Payment failed (402)."
        );
      }

      const data = fundedRes.data;
      const hash = extractTxHash(data);
      if (!hash) throw new Error("Server returned 200 but missing tx hash");

      setTxHash(hash);
      setReceipt({
        owner,
        repo,
        issueNumber,
        amountBaseUnits,
        payTo: reqs.payTo,
        asset: reqs.asset,
        txHash: hash,
        alreadyFunded: Boolean(data?.alreadyFunded),
      });
      setStatus("success");

      toast.success("Bounty Created!", {
        description: "Funds locked in escrow.",
        action: {
          label: "View Tx",
          onClick: () => window.open(`https://explorer.cronos.org/testnet/tx/${hash}`),
        },
      });
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.reason ||
        err?.message ||
        "Unknown error";
      setErrorMsg(msg);
      toast.error("Funding Failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl py-20 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Create Bug Bounty</h1>
        <p className="text-muted-foreground mt-2">
          Fund bug fixes instantly with USDC escrow.
        </p>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Fund a Bug
          </CardTitle>
          <CardDescription>Lock funds in the GitPay Treasury.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!connectedAddress && (
            <Button className="w-full" onClick={connectWallet}>
              Connect MetaMask
            </Button>
          )}

          {connectedAddress && (
            <div className="text-xs text-muted-foreground break-all">
              Connected: <span className="font-mono">{connectedAddress}</span>
            </div>
          )}

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
                  onChange={(e) =>
                    setFormData({ ...formData, issueNumber: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Bounty Amount (USDC)</Label>
              <Input
                id="amount"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
          </div>

          {(status === "error" || errorMsg) && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {errorMsg}
            </div>
          )}

          {status === "success" && txHash && (
            <div className="rounded-lg bg-green-500/10 p-4 text-green-600 border border-green-500/20">
              <div className="flex items-center gap-2 font-bold mb-2">
                <CheckCircle2 className="h-5 w-5" />{" "}
                {receipt?.alreadyFunded ? "Already Funded" : "Bug Bounty Created!"}
              </div>

              <p className="text-xs text-muted-foreground break-all">
                Tx Hash:{" "}
                <a href={explorerUrl} target="_blank" className="underline">
                  {txHash}
                </a>
              </p>

              {receipt && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    <span className="font-mono">
                      {receipt.owner}/{receipt.repo} #{receipt.issueNumber}
                    </span>
                  </div>
                  <div className="font-mono">
                    Amount (base units): {receipt.amountBaseUnits}
                  </div>
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
            disabled={loading || validating || !connectedAddress}
          >
            {validating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Repo...
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status === "signing" ? "Check MetaMask..." : "Settling on-chain..."}
              </>
            ) : (
              "Create Bug Bounty"
            )}
          </Button>
        </CardFooter>
      </Card>

      <div className="mt-8 text-center">
        <Badge variant="outline" className="text-muted-foreground font-mono">
          X402: {BACKEND_URL} • Chain: Cronos Testnet (338)
        </Badge>
      </div>
    </div>
  );
}
