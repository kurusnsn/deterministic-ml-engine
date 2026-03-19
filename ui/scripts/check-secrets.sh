#!/bin/bash
# Check for potential secrets exposed via NEXT_PUBLIC_
# Exclude known public keys and configuration files
if grep -r "NEXT_PUBLIC_" . \
  | grep -E "KEY|SECRET|TOKEN" \
  | grep -v "NEXT_PUBLIC_TURNSTILE_SITE_KEY" \
  | grep -v "check-secrets.sh" \
  | grep -v "NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  | grep -v "eslint.config.mjs" \
  | grep -v "MockAuthProvider.tsx" \
  | grep -v ".next/" \
  | grep -v "node_modules/"; then
  echo "ERROR: Potential secret exposed via NEXT_PUBLIC_ found!"
  echo "Please verify if these are truly public. If so, whitelist them in this script."
  exit 1
fi
echo "No obvious NEXT_PUBLIC_ secrets found."