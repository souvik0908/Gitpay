import requests
import json

BASE_URL = "https://adventures-put-flavor-proceedings.trycloudflare.com"

def check_issue_status(owner: str, repo: str, issue_number: int):
    endpoint = f"{BASE_URL}/bounties/status"
    params = {"owner": owner, "repo": repo, "issueNumber": issue_number}

    print(f"📡 GET {endpoint}")
    print(f"🔍 Params: {params}")

    try:
        r = requests.get(endpoint, params=params, timeout=15)
        print(f"✅ Status Code: {r.status_code}")

        # Print raw text if not JSON
        try:
            data = r.json()
        except Exception:
            print("⚠️ Non-JSON response:")
            print(r.text)
            return

        print("📦 Response:")
        print(json.dumps(data, indent=2))

        if r.status_code == 200 and data.get("funded") is True:
            amt = data["record"]["amountBaseUnits"]
            # USDC usually 6 decimals
            print(f"\n🎉 FUNDED ✅ Issue #{issue_number}")
            print(f"💰 Amount: {int(amt) / 1_000_000} USDC")
            print(f"🧾 Tx: {data['record'].get('fundedTxHash')}")
        elif r.status_code == 404:
            print(f"\n⏹️ NOT FUNDED ❌ Issue #{issue_number}")
        else:
            print(f"\n⚠️ Unexpected response for issue #{issue_number}")

    except requests.RequestException as e:
        print(f"\n🔥 Connection Error: {e}")
        print("💡 Check if your Cloudflare tunnel is active and URL is correct.")

if __name__ == "__main__":
    check_issue_status("souvik0908", "Gitpay", 1)
