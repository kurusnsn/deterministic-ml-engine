#!/bin/bash
set -e

echo "Installing ArgoCD..."

# Create argocd namespace
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
echo "Waiting for ArgoCD to be ready..."
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Get initial admin password
echo ""
echo "=========================================="
echo "ArgoCD installed successfully!"
echo "=========================================="
echo ""
echo "Admin username: admin"
echo "Admin password:"
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo ""
echo ""
echo "To access ArgoCD UI:"
echo "  kubectl port-forward svc/argocd-server -n argocd 8443:443"
echo "  Then open: https://localhost:8443"
echo ""
echo "To login via CLI:"
echo "  argocd login localhost:8443 --username admin --password <password>"
echo ""
