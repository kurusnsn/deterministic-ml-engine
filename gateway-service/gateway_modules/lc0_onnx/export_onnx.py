"""
LC0 T78 ONNX Export.

Exports the PyTorch LC0 T78 model to ONNX format with multiple outputs
for probe layer extraction.

The exported model includes:
- policy: Policy head output
- value: Value head WDL logits
- resblock_{N}: Activation at residual block N (for probing)
"""

import logging
from pathlib import Path
from typing import List, Optional
import numpy as np

logger = logging.getLogger(__name__)


def export_lc0_onnx(
    weights_path: str,
    output_path: str = "lc0_t78_probe.onnx",
    probe_layers: Optional[List[int]] = None,
    opset_version: int = 17,
    verify: bool = True,
) -> str:
    """
    Export LC0 T78 to ONNX with multi-output for probing.
    
    This creates an ONNX model that outputs:
    - policy: Policy logits (batch, 5120)
    - value: WDL logits (batch, 3)
    - resblock_N: Activation at block N (batch, 512, 8, 8) for each N in probe_layers
    
    Args:
        weights_path: Path to LC0 .pb.gz weights
        output_path: Path for output ONNX file
        probe_layers: List of residual block indices to export (default: [39])
        opset_version: ONNX opset version (default: 17)
        verify: Whether to verify the exported model
        
    Returns:
        Path to the exported ONNX file
        
    Raises:
        FileNotFoundError: If weights file not found
        RuntimeError: If export fails
    """
    import torch
    
    from .model_t78 import LC0T78, LC0T78ForExport
    from .weight_loader import load_lc0_weights_to_pytorch, verify_weight_load
    from .config import DEFAULT_PROBE_LAYER, T78_FILTERS, T78_RESIDUAL_BLOCKS, T78_SE_RATIO
    
    if probe_layers is None:
        probe_layers = [DEFAULT_PROBE_LAYER]
    
    # Validate weights path
    if not Path(weights_path).exists():
        raise FileNotFoundError(f"Weights file not found: {weights_path}")
    
    logger.info("=" * 60)
    logger.info("LC0 T78 ONNX EXPORT")
    logger.info("=" * 60)
    logger.info(f"Weights: {weights_path}")
    logger.info(f"Output: {output_path}")
    logger.info(f"Probe layers: {probe_layers}")
    
    # Create model
    logger.info("Creating LC0 T78 PyTorch model...")
    model = LC0T78(
        filters=T78_FILTERS,
        blocks=T78_RESIDUAL_BLOCKS,
        se_ratio=T78_SE_RATIO,
    )
    
    # Load weights
    logger.info("Loading weights from protobuf...")
    load_lc0_weights_to_pytorch(model, weights_path)
    
    # Verify weights loaded
    verification = verify_weight_load(model, weights_path)
    if not verification['verification_passed']:
        logger.error(f"Weight verification failed: {verification}")
        raise RuntimeError("Weight verification failed")
    logger.info("✓ Weight verification passed")
    
    # Set to eval mode
    model.eval()
    
    # Create export wrapper
    export_model = LC0T78ForExport(model, probe_layers=probe_layers)
    
    # Create dummy input
    dummy_input = torch.randn(1, 112, 8, 8)
    
    # Build output names
    output_names = ["policy", "value"]
    for layer_idx in sorted(probe_layers):
        output_names.append(f"resblock_{layer_idx}")
    
    logger.info(f"Output names: {output_names}")
    
    # Dynamic axes for batch dimension
    dynamic_axes = {"board": {0: "batch"}}
    for name in output_names:
        dynamic_axes[name] = {0: "batch"}
    
    # Export to ONNX
    logger.info("Exporting to ONNX...")
    torch.onnx.export(
        export_model,
        dummy_input,
        output_path,
        input_names=["board"],
        output_names=output_names,
        opset_version=opset_version,
        dynamic_axes=dynamic_axes,
        do_constant_folding=True,
        export_params=True,
    )
    
    logger.info(f"✓ ONNX model exported to {output_path}")
    
    # Verify exported model
    if verify:
        logger.info("Verifying exported ONNX model...")
        _verify_onnx_export(output_path, probe_layers)
    
    return output_path


def _verify_onnx_export(onnx_path: str, probe_layers: List[int]) -> None:
    """
    Verify the exported ONNX model.
    
    Checks:
    - Model loads correctly
    - All expected outputs are present
    - Shapes are correct
    - Inference runs without error
    """
    import onnx
    import onnxruntime as ort
    
    # Load and check model
    logger.info("  Loading ONNX model...")
    model = onnx.load(onnx_path)
    onnx.checker.check_model(model)
    logger.info("  ✓ ONNX model valid")
    
    # Check outputs
    output_names = [o.name for o in model.graph.output]
    expected_outputs = ["policy", "value"] + [f"resblock_{i}" for i in probe_layers]
    
    for expected in expected_outputs:
        if expected not in output_names:
            raise RuntimeError(f"Missing expected output: {expected}")
    logger.info(f"  ✓ All expected outputs present: {expected_outputs}")
    
    # Test inference
    logger.info("  Testing inference...")
    session = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    
    dummy_input = np.random.randn(1, 112, 8, 8).astype(np.float32)
    outputs = session.run(None, {"board": dummy_input})
    
    # Check output shapes
    logger.info(f"  Policy shape: {outputs[0].shape}")  # Should be (1, 5120)
    logger.info(f"  Value shape: {outputs[1].shape}")   # Should be (1, 3)
    
    for i, layer_idx in enumerate(probe_layers):
        activation_shape = outputs[2 + i].shape
        logger.info(f"  resblock_{layer_idx} shape: {activation_shape}")  # Should be (1, 512, 8, 8)
        
        if activation_shape != (1, 512, 8, 8):
            raise RuntimeError(
                f"Unexpected activation shape for resblock_{layer_idx}: "
                f"{activation_shape}, expected (1, 512, 8, 8)"
            )
    
    logger.info("  ✓ Inference test passed")


def get_onnx_model_info(onnx_path: str) -> dict:
    """
    Get information about an ONNX model.
    
    Args:
        onnx_path: Path to ONNX file
        
    Returns:
        Dict with model information
    """
    import onnx
    
    model = onnx.load(onnx_path)
    
    inputs = [(i.name, [d.dim_value for d in i.type.tensor_type.shape.dim]) 
              for i in model.graph.input]
    outputs = [(o.name, [d.dim_value for d in o.type.tensor_type.shape.dim]) 
               for o in model.graph.output]
    
    return {
        'path': onnx_path,
        'opset_version': model.opset_import[0].version,
        'inputs': dict(inputs),
        'outputs': dict(outputs),
        'num_nodes': len(model.graph.node),
    }


def main():
    """
    Command-line entry point for ONNX export.
    
    Usage:
        python -m gateway_modules.lc0_onnx.export_onnx --weights path/to/weights.pb.gz
    """
    import argparse
    
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    
    parser = argparse.ArgumentParser(description="Export LC0 T78 to ONNX")
    parser.add_argument(
        "--weights",
        type=str,
        required=True,
        help="Path to LC0 .pb.gz weights file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="lc0_t78_probe.onnx",
        help="Output ONNX file path",
    )
    parser.add_argument(
        "--probe-layers",
        type=int,
        nargs="+",
        default=[39],
        help="Residual block indices to export for probing",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version",
    )
    
    args = parser.parse_args()
    
    export_lc0_onnx(
        weights_path=args.weights,
        output_path=args.output,
        probe_layers=args.probe_layers,
        opset_version=args.opset,
    )
    
    print(f"\nExport complete: {args.output}")
    print(f"Size: {Path(args.output).stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
