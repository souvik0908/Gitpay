# 🚀 GitPay: Autonomous Financial Agent for Open Source

**The "Merge-to-Pay" Financial OS for the Agentic Economy.**

GitPay transforms GitHub Pull Requests into trustless financial settlement events. It allows maintainers to lock bounty funds in escrow (USDC on Cronos) and uses an autonomous **AI Agent** (powered by Gemini & Cronos) to identify wallet addresses and release funds instantly when code is merged.



## ⚙️ How It Works (The "Merge-to-Pay" Flow)

1.  **Fund (Escrow):** A maintainer creates a bounty on the **GitPay Dashboard**. They sign an **EIP-712** intent, locking USDC via the **x402 Protocol**.
2.  **Develop:** A contributor solves the issue and opens a Pull Request. They include their wallet in the description (e.g., *"Closes #31. Wallet: 0x..."*).
3.  **Merge:** The maintainer reviews and merges the code.
4.  **Agent Trigger:** The merge event wakes up the **GitPay AI Agent** (GitHub Action).
5.  **AI Extraction:** The Agent uses **Google Gemini** to intelligently parse the PR text for the wallet address and issue number.
6.  **Settlement:** The Agent verifies funding via a **Cloudflare Tunnel** to the local backend and executes the on-chain payout on **Cronos Testnet**.

---

## 🛠️ Tech Stack

* **Agent Logic:** Python, LangChain, Google Gemini 1.5 Flash, Web3.py.
* **Settlement Layer:** Node.js, Express, SQLite (Persistent Storage), @crypto.com/facilitator-client.
* **Frontend:** Next.js 14, Tailwind CSS, Shadcn UI, Ethers.js.
* **Infrastructure:** GitHub Actions, Cloudflare Tunnels (Localhost exposure).
* **Blockchain:** Cronos EVM Testnet (Chain ID 338).

---

## 🚀 Getting Started

Follow these steps to run the full stack locally and connect it to the GitHub Agent.

### 1. Backend Service (x402 Node)
This service manages the "Escrow" database and signs settlement intents.

```bash
cd gitpay/x402

# Install dependencies
npm install

# Setup Environment
# Ensure you set TREASURY_WALLET and USDCE_CONTRACT in .env
cp .env.example .env

# Run Server (Starts on Port 8787)
npm run dev
```
### 2. Expose Localhost (Cloudflare Tunnel)

The GitHub Action needs to talk to your local database to verify funding. We use a Cloudflare tunnel to expose your local port 8787 to the internet.Bash# Run this in a new terminal window

```bash
cloudflared tunnel --url http://localhost:8787
```
⚠️ Critical: The command above will output a URL like https://random-name.trycloudflare.com. Copy this URL. You must update your GitHub Repository Secret X402_SERVICE_URL with this new URL every time you restart the tunnel.

### 3. Frontend DashboardThe UI for funding issues and managing bounties.
```bash
cd frontend

# Install dependencies
npm install

# Run the Next.js app
npm run dev
```
### 4. Agent (Local Testing Only)
You usually do not need to run this locally, as GitHub Actions handles it. However, if you want to test the script manually:

```bash
cd gitpay/agent
# Create venv and install requirements
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run the test script (Ensure .env is populated with API keys)
python test_local.py
```

### 🤖 Configuring the AI Agent (GitHub Actions)

The Agent runs automatically on GitHub via GitHub Actions. You must configure these secrets for it to work.Go to your GitHub Repository.
Navigate to Settings > Secrets and variables > Actions.Click New repository secret and add the following:

### 🔑 Required GitHub Secrets

| Secret Name | Value Description |
| :--- | :--- |
| `CRONOS_PRIVATE_KEY` | Your wallet private key (Must hold TCRO for gas). |
| `GOOGLE_API_KEY` | Your Google Gemini API Key. |
| `X402_SERVICE_URL` | The Cloudflare URL from Step 2 (e.g., `https://...trycloudflare.com`). |

🧪 How to Test (End-to-End)
Fund an Issue:

Go to the Dashboard (localhost:3000).

Enter your Repo Owner/Name and Issue ID (e.g., 1).

Click Fund and confirm the transaction in your wallet.

Wait for the "Success" alert.

Submit Code:

Create a Pull Request in your repository.

Title: Fixing payment bug

Description: Closes #1. Wallet: 0x9496c5bB7397536Ae4aD729D88bA24d4c22DcF48

Merge:

Click "Merge Pull Request" on GitHub.

Watch the Magic:

Go to the Actions tab in your repository.

Click on the GitPay Auto Payout workflow.

Watch the Agent wake up, read your PR, verify the funds via the tunnel, and execute the payout on-chain!
