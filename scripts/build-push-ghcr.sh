#!/bin/bash
# ============================================
# Build and Push Images to GitHub Container Registry
# ============================================
set -e

REGISTRY="ghcr.io/kurusnsn/ostadchess"
TAG="${1:-latest}"

echo "🚀 Building and pushing images to $REGISTRY with tag: $TAG"
echo "=========================================================="

# Check if logged in to GHCR (skipped - manual login handled)
# if ! docker system info | grep -q "ghcr.io"; then
#     echo "⚠️ Not logged in to ghcr.io. Please login first:"
#     echo "  echo \$GHCR_TOKEN | docker login ghcr.io -u kurusnsn --password-stdin"
#     exit 1
# fi

# Services to build
SERVICES=(
    "gateway-service:gateway"
    "puzzle-service:puzzle"
    "stockfish-service:stockfish"
    "eco-service:eco"
    "opening-book-service:opening-book"
    "import-service:import"
    "payment-service:payment"
    "ui:ui"
)

# Build and push each service
for service_pair in "${SERVICES[@]}"; do
    dir="${service_pair%%:*}"
    name="${service_pair##*:}"

    echo ""
    echo "📦 Building $name..."
    
    if [ -d "$dir" ] && [ -f "$dir/Dockerfile" ]; then
        # For M1/M2/M3/M4 Macs, we need to build for linux/amd64 for the Hetzner cluster
        # unless the Hetzner nodes are ARM (which they usually aren't).
        # Hetzner Cloud x86 nodes need linux/amd64.
        docker build --platform linux/amd64 -t "$REGISTRY/$name:$TAG" "./$dir"
        docker push "$REGISTRY/$name:$TAG"
        echo "✅ Pushed $REGISTRY/$name:$TAG"
    else
        echo "⚠️ Skipping $name - no Dockerfile found in $dir"
    fi
done

echo ""
echo "=========================================="
echo "🎉 All images pushed to GHCR!"
echo "=========================================="
