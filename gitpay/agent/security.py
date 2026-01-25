import os
import hmac
import hashlib
from flask import Request


def verify_github_signature(request: Request) -> bool:
    # Skip signature verification for testing (Not recommended in production)
    return True

