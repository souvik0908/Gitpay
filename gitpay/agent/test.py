import os
from dotenv import load_dotenv
from langchain_agent import process_with_ai

load_dotenv()

os.environ.setdefault("GITPAY_DRY_RUN", "1")

fake_pr_body = """
Hey! I fixed the bug in the login page.
Please send my bounty here:
Wallet: 0xD10E14a380614C52f10b5658de86A11f0477c556
Thanks!
"""

print("🧪 Testing AI Agent...")
result = process_with_ai(fake_pr_body, issue_number=1)
print("\n--- FINAL RESULT ---")
print(result)
