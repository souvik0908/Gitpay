# 🚀 GitPay: Autonomous Financial Agent for Open Source

**The "Merge-to-Pay" Financial OS for the Agentic Economy.**

GitPay transforms GitHub Pull Requests into trustless financial settlement events. It allows maintainers to lock bounty funds in escrow (USDC on Cronos) and uses an autonomous AI Agent to release them instantly when code is merged.

![GitPay Demo](https://i.imgur.com/YourDemoImage.png)
*(Replace with a screenshot of your Home Page)*

## 🏆 Hackathon Tracks
- **Main Track:** x402 Applications (Automated settlement).
- **Crypto.com Integration:** Built on the AI Agent SDK & Facilitator Client.
- **Dev Tooling:** Infrastructure for autonomous developer payouts.

## ⚙️ How It Works
1.  **Fund:** Maintainer connects wallet to the Dashboard and signs an **EIP-712** authorization.
2.  **Lock:** The **x402 Service** verifies the signature and locks USDC in the Treasury.
3.  **Code:** Contributor submits a PR with `Closes #IssueID`.
4.  **Settle:** Upon merge, the **GitPay Agent** (GitHub Action) verifies the fund status via the Cloudflare Tunnel and executes the payout on **Cronos Testnet**.

## 🛠️ Tech Stack
- **Frontend:** Next.js 14, Tailwind CSS, Shadcn UI, Ethers.js.
- **Settlement:** Node.js, Express, SQLite, @crypto.com/facilitator-client.
- **Agent:** Python, Crypto.com AI Agent SDK, GitHub Actions.
- **Network:** Cronos EVM Testnet (Chain ID 338).

## 🚀 Getting Started

### 1. Backend (x402 Service)
```bash
cd gitpay/x402
npm install
cp .env.example .env
npm run dev
```

2. Agent (Local Mode)
```Bash
cd gitpay/agent
pip install -r requirements.txt
python app.py
```
3. Frontend
```Bash
cd frontend
npm install
npm run dev
```
