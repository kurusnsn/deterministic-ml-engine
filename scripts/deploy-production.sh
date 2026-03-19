#!/bin/bash
# ============================================
# Phase T & H: Deploy to Hetzner Production
# ============================================
set -e

cd "$(dirname "$0")/../terraform"

echo "🚀 ChessVector Production Deployment"
echo "====================================="
echo ""

# Check prerequisites
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform not found. Install from: https://www.terraform.io/downloads"
    exit 1
fi

if ! command -v ssh &> /dev/null; then
    echo "❌ SSH not found."
    exit 1
fi

# Check for tfvars
if [ ! -f terraform.tfvars ]; then
    echo "❌ terraform.tfvars not found!"
    echo ""
    echo "Create it from the example:"
    echo "  cp terraform.tfvars.example terraform.tfvars"
    echo "  # Then edit and add your Hetzner API token"
    exit 1
fi

# Initialize Terraform
echo "📦 Initializing Terraform..."
terraform init

# Plan
echo ""
echo "📋 Planning infrastructure..."
terraform plan -out=tfplan

echo ""
echo "============================================"
echo "Review the plan above."
echo "============================================"
echo ""
read -p "Apply this plan? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Apply
echo ""
echo "🔨 Creating infrastructure..."
terraform apply tfplan

# Get outputs
echo ""
echo "============================================"
echo "✅ Infrastructure created!"
echo "============================================"
echo ""
terraform output

# Get kubeconfig
echo ""
echo "📋 Fetching kubeconfig..."
MASTER_IP=$(terraform output -raw master_ip)

echo "Waiting for k3s to be ready (60s)..."
sleep 60

ssh -o StrictHostKeyChecking=no root@$MASTER_IP 'cat /etc/rancher/k3s/k3s.yaml' | \
    sed "s/127.0.0.1/$MASTER_IP/g" > ~/.kube/chessvector-prod.yaml

export KUBECONFIG=~/.kube/chessvector-prod.yaml

echo ""
echo "Testing connection..."
kubectl get nodes

echo ""
echo "============================================"
echo "🎉 Production cluster ready!"
echo "============================================"
echo ""
echo "Kubeconfig saved to: ~/.kube/chessvector-prod.yaml"
echo ""
echo "Next steps:"
echo "  1. Point DNS to Load Balancer IP: $(terraform output -raw load_balancer_ip)"
echo "  2. Install NGINX Ingress: ./scripts/install-nginx-ingress.sh"
echo "  3. Install cert-manager: ./scripts/install-cert-manager.sh"
echo "  4. Deploy application: kubectl apply -k k8s/overlays/prod"
echo ""
