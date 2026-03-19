#!/usr/bin/env python3
"""
Third-Party Credential Leak Detector

This script parses ZAP alerts and flags any requests to non-internal domains
that contain authentication material (tokens, API keys, auth headers).

Usage:
    python3 check-third-party-creds.py zap-alerts.json

Exit Codes:
    0 - No credential leaks detected
    1 - Credential leaks to third-party domains detected
"""

import json
import re
import sys
from typing import List, Dict, Any
from urllib.parse import urlparse

# Internal domains that are allowed to receive credentials
INTERNAL_DOMAINS = [
    'chessvector.com',
    'staging.chessvector.com',
    'ui.staging.chessvector.com',
    'gateway.staging.chessvector.com',
    'localhost',
    '127.0.0.1',
]

# Patterns that indicate authentication material
AUTH_PATTERNS = [
    re.compile(r'bearer\s+[a-zA-Z0-9\-_\.]+', re.IGNORECASE),
    re.compile(r'authorization:\s*[a-zA-Z0-9\-_\.]+', re.IGNORECASE),
    re.compile(r'api[_-]?key["\']?\s*[:=]\s*["\']?[a-zA-Z0-9\-_]{16,}', re.IGNORECASE),
    re.compile(r'token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9\-_\.]{20,}', re.IGNORECASE),
    re.compile(r'secret["\']?\s*[:=]\s*["\']?[a-zA-Z0-9\-_]{16,}', re.IGNORECASE),
    re.compile(r'password["\']?\s*[:=]\s*["\']?[^\s"\']{8,}', re.IGNORECASE),
    # AWS patterns
    re.compile(r'AKIA[0-9A-Z]{16}'),
    re.compile(r'aws[_-]?secret[_-]?access[_-]?key', re.IGNORECASE),
    # Stripe patterns
    re.compile(r'sk_live_[a-zA-Z0-9]{24,}'),
    re.compile(r'sk_test_[a-zA-Z0-9]{24,}'),
    # Supabase patterns
    re.compile(r'eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+'),  # JWT
]

# Headers that should never be sent to third parties
SENSITIVE_HEADERS = [
    'authorization',
    'x-api-key',
    'x-auth-token',
    'cookie',
    'x-supabase-auth',
]


def is_internal_domain(url: str) -> bool:
    """Check if a URL belongs to an internal domain."""
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        
        # Remove port if present
        if ':' in host:
            host = host.split(':')[0]
        
        for internal in INTERNAL_DOMAINS:
            if host == internal or host.endswith('.' + internal):
                return True
        return False
    except:
        return False


def check_for_auth_patterns(text: str) -> List[str]:
    """Check text for authentication patterns."""
    findings = []
    for pattern in AUTH_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            # Redact the actual values
            findings.append(f"Pattern match: {pattern.pattern[:30]}...")
    return findings


def check_alerts(alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Check ZAP alerts for third-party credential leaks."""
    violations = []
    
    for alert in alerts:
        url = alert.get('url', '')
        evidence = alert.get('evidence', '')
        other = alert.get('other', '')
        param = alert.get('param', '')
        
        # Skip internal domains
        if is_internal_domain(url):
            continue
        
        # Check for auth material in the alert
        all_text = f"{evidence} {other} {param}"
        auth_findings = check_for_auth_patterns(all_text)
        
        if auth_findings:
            violations.append({
                'url': url,
                'alert_name': alert.get('name', 'Unknown'),
                'findings': auth_findings,
                'risk': 'CRITICAL',
            })
    
    return violations


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 check-third-party-creds.py <zap-alerts.json>")
        sys.exit(1)
    
    alerts_file = sys.argv[1]
    
    try:
        with open(alerts_file, 'r') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error reading alerts file: {e}")
        sys.exit(1)
    
    alerts = data.get('alerts', [])
    
    print("=" * 60)
    print("THIRD-PARTY CREDENTIAL LEAK CHECK")
    print("=" * 60)
    print(f"Checking {len(alerts)} alerts for credential leaks...")
    print(f"Internal domains: {', '.join(INTERNAL_DOMAINS)}")
    print()
    
    violations = check_alerts(alerts)
    
    if violations:
        print(f"❌ FOUND {len(violations)} CREDENTIAL LEAK(S) TO THIRD-PARTY DOMAINS:")
        print()
        for v in violations:
            print(f"  URL: {v['url']}")
            print(f"  Alert: {v['alert_name']}")
            print(f"  Findings:")
            for f in v['findings']:
                print(f"    - {f}")
            print()
        
        print("=" * 60)
        print("ACTION REQUIRED: Remove credentials from third-party requests")
        print("=" * 60)
        sys.exit(1)
    else:
        print("✅ No credential leaks to third-party domains detected!")
        print("=" * 60)
        sys.exit(0)


if __name__ == '__main__':
    main()
