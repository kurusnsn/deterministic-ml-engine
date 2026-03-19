#!/usr/bin/env python3
import argparse
import difflib
import importlib
import json
import os
from pathlib import Path
import sys
import types
from typing import Dict, Any

SERVICES: Dict[str, Dict[str, Any]] = {
    "gateway": {
        "path": "gateway-service",
        "module": "app",
        "app_attr": "app",
        "output": "contracts/openapi/gateway.openapi.json",
    },
    "puzzle": {
        "path": "puzzle-service",
        "module": "backend.services.puzzle_service",
        "app_attr": "app",
        "output": "contracts/openapi/puzzle.openapi.json",
    },
    "payment": {
        "path": "payment-service",
        "module": "app",
        "app_attr": "app",
        "output": "contracts/openapi/payment.openapi.json",
    },
    "import": {
        "path": "import-service",
        "module": "app.main",
        "app_attr": "app",
        "output": "contracts/openapi/import.openapi.json",
    },
    "opening-book": {
        "path": "opening-book-service",
        "module": "app.main",
        "app_attr": "app",
        "output": "contracts/openapi/opening-book.openapi.json",
    },
    "eco": {
        "path": "eco-service",
        "module": "app",
        "app_attr": "app",
        "output": "contracts/openapi/eco.openapi.json",
    },
    "stockfish": {
        "path": "stockfish-service",
        "module": "app",
        "app_attr": "app",
        "output": "contracts/openapi/stockfish.openapi.json",
    },
}


def _load_app(service: Dict[str, Any]):
    service_path = Path(service["path"]).resolve()
    if not service_path.exists():
        raise RuntimeError(f"Service path not found: {service_path}")

    for key in list(sys.modules.keys()):
        if key == "app" or key.startswith("app.") or key == "observability":
            sys.modules.pop(key, None)
    if service["module"].startswith("app."):
        app_dir = service_path / "app"
        if app_dir.is_dir():
            package = types.ModuleType("app")
            package.__path__ = [str(app_dir)]
            sys.modules["app"] = package
    sys.path.insert(0, str(service_path))
    try:
        module = importlib.import_module(service["module"])
        app = getattr(module, service.get("app_attr", "app"))
        return app
    finally:
        sys.path.pop(0)


def _render_openapi(app) -> str:
    payload = app.openapi()
    return json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n"


def _diff_text(expected: str, actual: str, path: Path) -> str:
    diff = difflib.unified_diff(
        expected.splitlines(),
        actual.splitlines(),
        fromfile=str(path),
        tofile="generated",
        lineterm="",
    )
    return "\n".join(diff)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate or verify OpenAPI snapshots")
    parser.add_argument("--check", action="store_true", help="Verify snapshots are up to date")
    parser.add_argument("--services", nargs="*", help="Subset of services to process")
    args = parser.parse_args()

    os.environ.setdefault("ENV", "development")

    targets = SERVICES
    if args.services:
        missing = [name for name in args.services if name not in SERVICES]
        if missing:
            raise SystemExit(f"Unknown services: {', '.join(missing)}")
        targets = {name: SERVICES[name] for name in args.services}

    failures = []
    for name, service in targets.items():
        app = _load_app(service)
        snapshot = _render_openapi(app)
        output_path = Path(service["output"])
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if args.check:
            if not output_path.exists():
                failures.append(f"Missing OpenAPI snapshot for {name}: {output_path}")
                continue
            existing = output_path.read_text(encoding="utf-8")
            if existing != snapshot:
                diff = _diff_text(existing, snapshot, output_path)
                failures.append(f"OpenAPI snapshot mismatch for {name}:\n{diff}")
        else:
            output_path.write_text(snapshot, encoding="utf-8")
            print(f"Wrote {output_path}")

    if failures:
        for failure in failures:
            print(failure)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
