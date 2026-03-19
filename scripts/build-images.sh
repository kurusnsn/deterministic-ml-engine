#!/bin/bash
set -e

REGISTRY="localhost:5111"
TAG="${1:-dev}"

echo "Building and pushing images to $REGISTRY with tag: $TAG"

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
    echo "========================================"
    echo "Building $name from $dir..."
    echo "========================================"

    if [ -d "$dir" ] && [ -f "$dir/Dockerfile" ]; then
        docker build -t "$REGISTRY/ostadchess/$name:$TAG" "./$dir"
        docker push "$REGISTRY/ostadchess/$name:$TAG"
        echo "Pushed $REGISTRY/ostadchess/$name:$TAG"
    else
        echo "WARNING: Skipping $name - no Dockerfile found in $dir"
    fi
done

echo ""
echo "========================================"
echo "All images built and pushed!"
echo "========================================"
echo ""
echo "Images available:"
for service_pair in "${SERVICES[@]}"; do
    name="${service_pair##*:}"
    echo "  - $REGISTRY/ostadchess/$name:$TAG"
done
