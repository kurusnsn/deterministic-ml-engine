"""
Utility script to inspect LC0 frozen graph tensor names.
Run this in Modal to find the correct activation tensor names.
"""
import modal
import gzip

app = modal.App("inspect-lc0-graph")

models_vol = modal.Volume.from_name("chess-coach-models", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("tensorflow>=2.12.0")
)


@app.function(
    image=image,
    volumes={"/models": models_vol},
    timeout=60,
)
def inspect_graph():
    """List all tensor names in the LC0 frozen graph."""
    import tensorflow as tf
    from pathlib import Path
    
    lc0_path = Path("/models/lc0/t78_512x40.pb.gz")
    
    if not lc0_path.exists():
        print(f"Model not found at {lc0_path}")
        print("Available files in /models/lc0/:")
        lc0_dir = Path("/models/lc0")
        if lc0_dir.exists():
            for f in lc0_dir.iterdir():
                print(f"  - {f.name}")
        return
    
    print(f"Loading model from {lc0_path}...")
    
    with gzip.open(lc0_path, "rb") as f:
        graph_def = tf.compat.v1.GraphDef()
        graph_def.ParseFromString(f.read())
    
    graph = tf.Graph()
    with graph.as_default():
        tf.import_graph_def(graph_def, name="lc0")
    
    # List all operations
    ops = graph.get_operations()
    print(f"\nTotal operations: {len(ops)}")
    
    # Find operations with "encoder" or "block" or "residual" in name
    print("\n=== Encoder/Block/Residual operations ===")
    encoder_ops = [op for op in ops if any(x in op.name.lower() for x in ['encoder', 'block', 'residual'])]
    for op in encoder_ops[:50]:  # First 50
        print(f"  {op.name}: {op.type}")
    
    # Find output-like operations
    print("\n=== Output/Squeeze/Dense operations ===")
    output_ops = [op for op in ops if any(x in op.name.lower() for x in ['output', 'squeeze', 'dense', 'matmul'])]
    for op in output_ops[:30]:
        print(f"  {op.name}: {op.type}")
    
    # Find all operations at layer 39-40 level
    print("\n=== Operations with '39' or '40' in name ===")
    layer_ops = [op for op in ops if '39' in op.name or '40' in op.name]
    for op in layer_ops:
        print(f"  {op.name}: {op.type}")
    
    # Find input tensor
    print("\n=== Input-like operations ===")
    input_ops = [op for op in ops if 'input' in op.name.lower() or 'placeholder' in op.type.lower()]
    for op in input_ops:
        print(f"  {op.name}: {op.type}")
        for output in op.outputs:
            print(f"    -> {output.name} shape={output.shape}")


@app.local_entrypoint()
def main():
    inspect_graph.remote()
