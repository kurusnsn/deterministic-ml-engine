#!/bin/bash
# ============================================
# cert-manager + Let's Encrypt Installation
# Phase 3: HTTPS & TLS
# ============================================
set -e

echo "🔐 Installing cert-manager for automatic HTTPS..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Install cert-manager
CERT_MANAGER_VERSION="v1.13.3"
echo "📦 Installing cert-manager ${CERT_MANAGER_VERSION}..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml

# Wait for cert-manager to be ready
echo "⏳ Waiting for cert-manager to be ready..."
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s

echo "⏳ Waiting for webhook to be ready..."
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=webhook \
  --timeout=300s

# Create Let's Encrypt ClusterIssuer for staging (testing)
echo "📋 Creating Let's Encrypt staging issuer..."
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: admin@chessvector.com
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

# Create Let's Encrypt ClusterIssuer for production
echo "📋 Creating Let's Encrypt production issuer..."
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@chessvector.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

echo ""
echo "✅ cert-manager installed successfully!"
echo ""
echo "📋 Created issuers:"
echo "  - letsencrypt-staging (for testing)"
echo "  - letsencrypt-prod (for production)"
echo ""
echo "🔐 Your ingress will automatically get HTTPS certificates!"
echo "   Make sure your domain (chessvector.com) points to your cluster."
echo ""
echo "📝 To check certificate status:"
echo "   kubectl get certificates -A"
echo "   kubectl describe certificate chessvector-tls -n ostadchess-prod"
echo ""
