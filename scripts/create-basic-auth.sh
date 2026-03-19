#!/bin/bash
set -e

# Create basic auth credentials for private access to chessvector.com
# Usage: ./scripts/create-basic-auth.sh <username> <password>

USERNAME="${1:-admin}"
PASSWORD="${2}"

if [ -z "$PASSWORD" ]; then
    echo "Usage: $0 <username> <password>"
    echo "Example: $0 kurus mysecretpassword"
    exit 1
fi

echo "Creating basic auth credentials for user: $USERNAME"

# Generate htpasswd file (requires htpasswd command)
if ! command -v htpasswd &> /dev/null; then
    echo "htpasswd not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install httpd
    else
        sudo apt-get install -y apache2-utils
    fi
fi

# Create auth file
htpasswd -cb auth "$USERNAME" "$PASSWORD"

echo ""
echo "=========================================="
echo "Basic Auth Credentials Created"
echo "=========================================="
echo ""
echo "To create the Kubernetes secret, run:"
echo ""
echo "  kubectl create secret generic basic-auth-secret \\"
echo "    --from-file=auth=auth \\"
echo "    -n ostadchess-prod"
echo ""
echo "Or for sealed-secrets (recommended for GitOps):"
echo ""
echo "  kubectl create secret generic basic-auth-secret \\"
echo "    --from-file=auth=auth \\"
echo "    --dry-run=client -o yaml | \\"
echo "    kubeseal --cert k8s/secrets/sealed-secrets-cert.pem -o yaml > \\"
echo "    k8s/overlays/prod/sealed-basic-auth.yaml"
echo ""
echo "Username: $USERNAME"
echo "Password: (the one you provided)"
echo ""

# Clean up
rm -f auth
