import os
import json
import logging
import sys
# 1. Import dotenv
from dotenv import load_dotenv

# 2. LOAD .ENV FILE IMMEDIATELY
# This looks for a .env file in the current directory
load_dotenv()

# Import the main function from your action_runner
try:
    from action_runner import main
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from action_runner import main

# --- MOCK CONFIGURATION ---
MOCK_EVENT_FILE = "mock_event.json"

mock_event_data = {
    "pull_request": {
        "merged": True,
        "title": "Fixing the critical payment bug",
        "body": "This PR finally fixes the issue. Please pay to my wallet: 0x9496c5bB7397536Ae4aD729D88bA24d4c22DcF48. Closes #1",
        "html_url": "https://github.com/souvik0908/gitpay/pull/2"
    },
    "repository": {
        "owner": {"login": "souvik0908"},
        "name": "gitpay"
    }
}

def run_test():
    print("🧪 PREPARING LOCAL TEST...")

    # Create mock file
    with open(MOCK_EVENT_FILE, "w") as f:
        json.dump(mock_event_data, f)

    # Set Paths
    os.environ["GITHUB_EVENT_PATH"] = MOCK_EVENT_FILE
    os.environ["X402_SERVICE_URL"] = "http://localhost:8787"
    os.environ["GITHUB_REPO_OWNER"] = "souvik0908"
    os.environ["GITHUB_REPO_NAME"] = "gitpay"

    # DEBUG: Verify keys are loaded
    google_key = os.getenv("GOOGLE_API_KEY")
    cronos_key = os.getenv("CRONOS_PRIVATE_KEY")
    
    if not google_key:
        print("❌ ERROR: GOOGLE_API_KEY is still missing! Check your .env file location.")
        # Optional: Print current working directory to help debug
        print(f"   Current Directory: {os.getcwd()}")
        return
    else:
        # Print first few chars to verify it's loaded (don't print full key)
        print(f"✅ GOOGLE_API_KEY found (starts with {google_key[:4]}...)")

    if not cronos_key:
        print("❌ ERROR: CRONOS_PRIVATE_KEY is missing!")
        return
    else:
        print("✅ CRONOS_PRIVATE_KEY found.")

    print("\n🚀 STARTING RUNNER...")
    print("=" * 50)

    try:
        main()
        print("=" * 50)
        print("✅ TEST COMPLETED.")
    except SystemExit as e:
        print("=" * 50)
        if e.code == 0:
            print("✅ Runner exited successfully.")
        else:
            print(f"❌ Runner failed with code {e.code}.")
    except Exception as e:
        print(f"🔥 Runner crashed: {e}")
    finally:
        if os.path.exists(MOCK_EVENT_FILE):
            os.remove(MOCK_EVENT_FILE)

if __name__ == "__main__":
    run_test()