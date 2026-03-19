#!/bin/bash
# ============================================
# NGINX Ingress Controller Installation
# Phase N: Traffic Control
# ============================================
set -e

echo "🚀 Installing NGINX Ingress Controller..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Check if KUBECONFIG is set or default exists
if [ -z "$KUBECONFIG" ] && [ ! -f ~/.kube/config ]; then
    echo "⚠️  No KUBECONFIG found. Set KUBECONFIG or use default cluster."
    exit 1
fi

# Install NGINX Ingress Controller
echo "📦 Installing NGINX Ingress Controller (latest stable)..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml

# Wait for the controller to be ready
echo "⏳ Waiting for NGINX Ingress Controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s

echo ""
echo "✅ NGINX Ingress Controller installed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Configure your DNS to point to the LoadBalancer IP"
echo "  2. Run: kubectl get svc -n ingress-nginx ingress-nginx-controller"
echo "  3. Update your domain (chessvector.com) DNS A record"
echo ""
echo "🔐 Access Control configured:"
echo "  - Basic Auth: admin / ChessVector2024!"
echo "  - To add IP whitelist, edit k8s/overlays/prod/ingress.yaml"
echo "  - Uncomment: nginx.ingress.kubernetes.io/whitelist-source-range"
echo ""
