#!/bin/bash
set -e

CLUSTER_NAME="ostadchess"
REGISTRY_NAME="ostadchess-registry"
REGISTRY_PORT=5111

echo "Setting up k3d cluster: $CLUSTER_NAME"

# Check if k3d is installed
if ! command -v k3d &> /dev/null; then
    echo "k3d is not installed. Please install it first:"
    echo "  brew install k3d"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed. Please install it first:"
    echo "  brew install kubectl"
    exit 1
fi

# Delete existing cluster if it exists
if k3d cluster list | grep -q "$CLUSTER_NAME"; then
    echo "Deleting existing cluster: $CLUSTER_NAME"
    k3d cluster delete "$CLUSTER_NAME"
fi

# Create local registry if not exists
if ! k3d registry list 2>/dev/null | grep -q "$REGISTRY_NAME"; then
    echo "Creating local registry: $REGISTRY_NAME"
    k3d registry create "$REGISTRY_NAME" --port "$REGISTRY_PORT"
fi

# Create cluster with registry
echo "Creating k3d cluster..."
k3d cluster create "$CLUSTER_NAME" \
    --registry-use "k3d-$REGISTRY_NAME:$REGISTRY_PORT" \
    --servers 1 \
    --agents 2 \
    --port "8080:80@loadbalancer" \
    --port "8443:443@loadbalancer" \
    --k3s-arg "--disable=traefik@server:0"

# Wait for cluster to be ready
echo "Waiting for cluster to be ready..."
kubectl wait --for=condition=ready node --all --timeout=120s

# Install nginx ingress controller
echo "Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Wait for ingress controller to be ready
echo "Waiting for ingress controller..."
kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s

echo ""
echo "=========================================="
echo "Cluster $CLUSTER_NAME created successfully!"
echo "=========================================="
echo ""
echo "Registry: localhost:$REGISTRY_PORT"
echo "HTTP:     http://localhost:8080"
echo "HTTPS:    https://localhost:8443"
echo ""
echo "Next steps:"
echo "  1. Build and push images: ./scripts/build-images.sh"
echo "  2. Deploy with kustomize:  kubectl apply -k k8s/overlays/dev"
echo ""
