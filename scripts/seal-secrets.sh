#!/bin/bash
set -e

echo "Installing Sealed Secrets controller..."

# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Wait for controller to be ready
echo "Waiting for Sealed Secrets controller..."
kubectl wait --for=condition=ready pod -l name=sealed-secrets-controller -n kube-system --timeout=60s

# Create directory for certs if it doesn't exist
mkdir -p k8s/secrets

# Fetch the public key
echo "Fetching public certificate..."
kubeseal --fetch-cert > k8s/secrets/sealed-secrets-cert.pem

echo ""
echo "=========================================="
echo "Sealed Secrets installed successfully!"
echo "=========================================="
echo ""
echo "Public certificate saved to: k8s/secrets/sealed-secrets-cert.pem"
echo ""
echo "To seal a secret:"
echo "  kubectl create secret generic my-secret --from-literal=key=value --dry-run=client -o yaml | \\"
echo "    kubeseal --cert k8s/secrets/sealed-secrets-cert.pem -o yaml > sealed-secret.yaml"
echo ""
