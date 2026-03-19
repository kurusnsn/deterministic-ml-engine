#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from ruamel.yaml import YAML
except ImportError:  # pragma: no cover - runtime guard
    sys.stderr.write("ruamel.yaml is required. Install with: python -m pip install ruamel.yaml\n")
    sys.exit(2)


def load_yaml(path: Path, yaml: YAML):
    if not path.exists():
        sys.stderr.write(f"Missing file: {path}\n")
        sys.exit(1)
    with path.open("r", encoding="utf-8") as handle:
        return yaml.load(handle)


def extract_images(data, label):
    images = data.get("images") if isinstance(data, dict) else None
    if not images:
        sys.stderr.write(f"No images found in {label} kustomization.\n")
        sys.exit(1)
    if not isinstance(images, list):
        sys.stderr.write(f"Unexpected images format in {label} kustomization.\n")
        sys.exit(1)
    return images


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote staging image tags into prod overlay.")
    parser.add_argument(
        "--staging",
        default="k8s/overlays/staging/kustomization.yaml",
        help="Path to staging kustomization.yaml",
    )
    parser.add_argument(
        "--prod",
        default="k8s/overlays/prod/kustomization.yaml",
        help="Path to prod kustomization.yaml",
    )
    parser.add_argument(
        "--fail-on-latest",
        action="store_true",
        help="Fail if any staging image tag is 'latest'.",
    )
    args = parser.parse_args()

    yaml = YAML()
    yaml.preserve_quotes = True

    staging_path = Path(args.staging)
    prod_path = Path(args.prod)

    staging = load_yaml(staging_path, yaml)
    prod = load_yaml(prod_path, yaml)

    staging_images = extract_images(staging, "staging")
    prod_images = extract_images(prod, "prod")

    staging_map = {}
    for image in staging_images:
        if isinstance(image, dict) and image.get("name"):
            staging_map[image["name"]] = image

    if not staging_map:
        sys.stderr.write("No valid image entries found in staging.\n")
        return 1

    missing = [img.get("name") for img in prod_images if img.get("name") not in staging_map]
    if missing:
        sys.stderr.write(f"Missing staging entries for prod images: {', '.join(missing)}\n")
        return 1

    if args.fail_on_latest:
        latest = [
            name
            for name, image in staging_map.items()
            if str(image.get("newTag", "")).strip() == "latest"
        ]
        if latest:
            sys.stderr.write(
                "Refusing to promote 'latest' tags for: " + ", ".join(latest) + "\n"
            )
            return 1

    updated = False
    for prod_image in prod_images:
        name = prod_image.get("name")
        staging_image = staging_map.get(name)
        if not staging_image:
            continue
        for key in ("newName", "newTag"):
            if key in staging_image and prod_image.get(key) != staging_image.get(key):
                prod_image[key] = staging_image.get(key)
                updated = True

    if not updated:
        print("No image changes to promote.")
        return 0

    with prod_path.open("w", encoding="utf-8") as handle:
        yaml.dump(prod, handle)

    print("Promoted staging image tags into prod overlay.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
