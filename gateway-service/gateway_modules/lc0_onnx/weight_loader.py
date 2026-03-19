"""
LC0 Weight Loader for PyTorch.

Loads weights from LC0 .pb.gz protobuf format into the PyTorch T78 model.
This module parses the protobuf structure and maps weights to PyTorch tensors.
"""

import gzip
import sys
import logging
from pathlib import Path
from typing import Dict, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Add lczeroTraining to path for protobuf definitions
def _setup_proto_path():
    """Add lczeroTraining proto to sys.path for importing net_pb2."""
    # Get the project root (chess-feature-2) from this file's location
    # This file is at: gateway-service/gateway_modules/lc0_onnx/weight_loader.py
    # Project root is 4 levels up
    this_file = Path(__file__).resolve()
    project_root = this_file.parent.parent.parent.parent  # gateway-service -> project root
    
    possible_paths = [
        "/root/lczeroTraining/tf",  # Modal container
        project_root / "lczeroTraining" / "tf",  # Local dev - lczeroTraining/tf
    ]
    
    for base_path in possible_paths:
        base_path = Path(base_path)
        proto_path = base_path / "proto"
        
        if proto_path.exists() and (proto_path / "net_pb2.py").exists():
            # Add the tf directory so "from proto import net_pb2" works
            if str(base_path) not in sys.path:
                sys.path.insert(0, str(base_path))
            logger.info(f"Added lczeroTraining path: {base_path}")
            return True
    
    logger.warning(f"Could not find lczeroTraining proto. Searched: {possible_paths}")
    return False


def _denorm_layer(layer) -> np.ndarray:
    """
    Denormalize a 16-bit encoded layer from protobuf.
    
    LC0 stores weights as 16-bit integers with min/max scaling.
    This function recovers the original floating-point values.
    """
    params = np.frombuffer(layer.params, np.uint16).astype(np.float32)
    params /= 0xffff
    return params * (layer.max_val - layer.min_val) + layer.min_val


class LC0WeightLoader:
    """
    Load weights from LC0 .pb.gz protobuf into PyTorch model.
    
    The loader handles:
    - Reading gzipped protobuf format
    - Denormalizing 16-bit weights
    - Transposing convolution weights from LC0 to PyTorch format
    - Mapping SE blocks correctly
    """
    
    def __init__(self, weights_path: str):
        """
        Initialize loader with path to weights file.
        
        Args:
            weights_path: Path to .pb.gz weights file
        """
        self.weights_path = weights_path
        self.pb = None
        self.filters = None
        self.blocks = None
        
    def parse(self):
        """
        Parse the protobuf file and extract metadata.
        
        Returns:
            Dict with 'filters' and 'blocks' counts
        """
        _setup_proto_path()
        
        # Try to import net_pb2 - handle collision with system 'proto' package
        # by using importlib to load directly from file
        try:
            from proto import net_pb2 as pb
        except ImportError:
            # Fall back to direct file import
            import importlib.util
            
            # Find net_pb2.py
            this_file = Path(__file__).resolve()
            project_root = this_file.parent.parent.parent.parent
            net_pb2_path = project_root / "lczeroTraining" / "tf" / "proto" / "net_pb2.py"
            
            if not net_pb2_path.exists():
                # Try Modal path
                net_pb2_path = Path("/root/lczeroTraining/tf/proto/net_pb2.py")
            
            if not net_pb2_path.exists():
                logger.error(f"Could not find net_pb2.py at {net_pb2_path}")
                raise ImportError(
                    "Cannot import LC0 protobuf. Ensure lczeroTraining is available "
                    "and proto files are generated."
                )
            
            spec = importlib.util.spec_from_file_location("net_pb2", net_pb2_path)
            pb = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(pb)
            logger.info(f"Loaded net_pb2 directly from {net_pb2_path}")
        
        logger.info(f"Parsing LC0 weights from {self.weights_path}")
        
        with gzip.open(self.weights_path, 'rb') as f:
            self.pb = pb.Net()
            self.pb.ParseFromString(f.read())
        
        # Extract metadata
        self.filters = len(np.frombuffer(
            self.pb.weights.input.bn_means.params, np.uint16
        ))
        self.blocks = len(self.pb.weights.residual)
        
        logger.info(f"Parsed LC0 weights: {self.filters} filters, {self.blocks} blocks")
        
        return {
            'filters': self.filters,
            'blocks': self.blocks,
        }

    
    def get_input_weights(self) -> Dict[str, np.ndarray]:
        """
        Extract input convolution block weights.
        
        Returns:
            Dict with 'conv_weight', 'bn_gamma', 'bn_beta', 'bn_mean', 'bn_var'
        """
        if self.pb is None:
            self.parse()
        
        input_block = self.pb.weights.input
        
        # Convolution weight: LC0 is [out, in, h, w], PyTorch expects [out, in, h, w]
        conv_weight = _denorm_layer(input_block.weights)
        conv_weight = conv_weight.reshape(self.filters, 112, 3, 3)
        
        # Batch norm parameters
        bn_gamma = _denorm_layer(input_block.bn_gammas)
        bn_beta = _denorm_layer(input_block.bn_betas)
        bn_mean = _denorm_layer(input_block.bn_means)
        bn_var = _denorm_layer(input_block.bn_stddivs)
        # bn_stddivs is actually variance in LC0, need to convert
        # It's stored as stddev, so square it to get variance
        # Actually in net.py it says stddev is sqrt(var + eps), so var = stddev^2 - eps
        bn_var = np.square(bn_var) - 1e-5
        bn_var = np.maximum(bn_var, 0)  # Clamp to non-negative
        
        return {
            'conv_weight': conv_weight,
            'bn_gamma': bn_gamma,
            'bn_beta': bn_beta,
            'bn_mean': bn_mean,
            'bn_var': bn_var,
        }
    
    def get_residual_weights(self, block_idx: int) -> Dict[str, np.ndarray]:
        """
        Extract weights for a single residual block.
        
        Args:
            block_idx: 0-indexed block number
            
        Returns:
            Dict with conv1, bn1, conv2, bn2, se_fc1, se_fc2 weights
        """
        if self.pb is None:
            self.parse()
        
        if block_idx >= self.blocks:
            raise ValueError(f"Block {block_idx} out of range (max: {self.blocks - 1})")
        
        res = self.pb.weights.residual[block_idx]
        
        # Conv1
        conv1_weight = _denorm_layer(res.conv1.weights)
        conv1_weight = conv1_weight.reshape(self.filters, self.filters, 3, 3)
        
        bn1_gamma = _denorm_layer(res.conv1.bn_gammas)
        bn1_beta = _denorm_layer(res.conv1.bn_betas)
        bn1_mean = _denorm_layer(res.conv1.bn_means)
        bn1_var = _denorm_layer(res.conv1.bn_stddivs)
        bn1_var = np.square(bn1_var) - 1e-5
        bn1_var = np.maximum(bn1_var, 0)
        
        # Conv2
        conv2_weight = _denorm_layer(res.conv2.weights)
        conv2_weight = conv2_weight.reshape(self.filters, self.filters, 3, 3)
        
        bn2_gamma = _denorm_layer(res.conv2.bn_gammas)
        bn2_beta = _denorm_layer(res.conv2.bn_betas)
        bn2_mean = _denorm_layer(res.conv2.bn_means)
        bn2_var = _denorm_layer(res.conv2.bn_stddivs)
        bn2_var = np.square(bn2_var) - 1e-5
        bn2_var = np.maximum(bn2_var, 0)
        
        # SE block
        se_channels = self.filters // 16  # SE ratio is 16
        
        # SE FC1: [se_channels, filters] in LC0
        se_fc1_w = _denorm_layer(res.se.w1)
        se_fc1_w = se_fc1_w.reshape(self.filters, se_channels).T  # [se_channels, filters]
        se_fc1_b = _denorm_layer(res.se.b1)
        
        # SE FC2: [2*filters, se_channels] in LC0 (gamma + beta)
        se_fc2_w = _denorm_layer(res.se.w2)
        se_fc2_w = se_fc2_w.reshape(se_channels, 2 * self.filters).T  # [2*filters, se_channels]
        se_fc2_b = _denorm_layer(res.se.b2)
        
        return {
            'conv1_weight': conv1_weight,
            'bn1_gamma': bn1_gamma,
            'bn1_beta': bn1_beta,
            'bn1_mean': bn1_mean,
            'bn1_var': bn1_var,
            'conv2_weight': conv2_weight,
            'bn2_gamma': bn2_gamma,
            'bn2_beta': bn2_beta,
            'bn2_mean': bn2_mean,
            'bn2_var': bn2_var,
            'se_fc1_weight': se_fc1_w,
            'se_fc1_bias': se_fc1_b,
            'se_fc2_weight': se_fc2_w,
            'se_fc2_bias': se_fc2_b,
        }
    
    def get_policy_head_weights(self) -> Dict[str, np.ndarray]:
        """
        Extract policy head weights.
        
        Returns:
            Dict with policy1 conv block and policy output weights
        """
        if self.pb is None:
            self.parse()
        
        # Policy1 conv block (if present)
        policy1 = self.pb.weights.policy1
        
        policy1_conv_weight = _denorm_layer(policy1.weights)
        policy1_conv_weight = policy1_conv_weight.reshape(self.filters, self.filters, 3, 3)
        
        policy1_bn_gamma = _denorm_layer(policy1.bn_gammas)
        policy1_bn_beta = _denorm_layer(policy1.bn_betas)
        policy1_bn_mean = _denorm_layer(policy1.bn_means)
        policy1_bn_var = _denorm_layer(policy1.bn_stddivs)
        policy1_bn_var = np.square(policy1_bn_var) - 1e-5
        policy1_bn_var = np.maximum(policy1_bn_var, 0)
        
        # Policy output conv (80 channels)
        policy = self.pb.weights.policy
        policy_conv_weight = _denorm_layer(policy.weights)
        policy_conv_weight = policy_conv_weight.reshape(80, self.filters, 3, 3)
        policy_conv_bias = _denorm_layer(policy.biases)
        
        return {
            'policy1_conv_weight': policy1_conv_weight,
            'policy1_bn_gamma': policy1_bn_gamma,
            'policy1_bn_beta': policy1_bn_beta,
            'policy1_bn_mean': policy1_bn_mean,
            'policy1_bn_var': policy1_bn_var,
            'policy_conv_weight': policy_conv_weight,
            'policy_conv_bias': policy_conv_bias,
        }
    
    def get_value_head_weights(self) -> Dict[str, np.ndarray]:
        """
        Extract value head weights.
        
        Returns:
            Dict with value conv block and FC layer weights
        """
        if self.pb is None:
            self.parse()
        
        # Value conv block (1x1 to 32 channels)
        value_block = self.pb.weights.value
        
        value_conv_weight = _denorm_layer(value_block.weights)
        value_conv_weight = value_conv_weight.reshape(32, self.filters, 1, 1)
        
        value_bn_gamma = _denorm_layer(value_block.bn_gammas)
        value_bn_beta = _denorm_layer(value_block.bn_betas)
        value_bn_mean = _denorm_layer(value_block.bn_means)
        value_bn_var = _denorm_layer(value_block.bn_stddivs)
        value_bn_var = np.square(value_bn_var) - 1e-5
        value_bn_var = np.maximum(value_bn_var, 0)
        
        # FC layers
        # FC1: 32*64 -> 128
        fc1_weight = _denorm_layer(self.pb.weights.ip1_val_w)
        fc1_weight = fc1_weight.reshape(128, 32 * 64)
        fc1_bias = _denorm_layer(self.pb.weights.ip1_val_b)
        
        # FC2: 128 -> 3 (WDL)
        fc2_weight = _denorm_layer(self.pb.weights.ip2_val_w)
        fc2_weight = fc2_weight.reshape(3, 128)
        fc2_bias = _denorm_layer(self.pb.weights.ip2_val_b)
        
        return {
            'value_conv_weight': value_conv_weight,
            'value_bn_gamma': value_bn_gamma,
            'value_bn_beta': value_bn_beta,
            'value_bn_mean': value_bn_mean,
            'value_bn_var': value_bn_var,
            'fc1_weight': fc1_weight,
            'fc1_bias': fc1_bias,
            'fc2_weight': fc2_weight,
            'fc2_bias': fc2_bias,
        }


def load_lc0_weights_to_pytorch(model, weights_path: str) -> None:
    """
    Load LC0 .pb.gz weights into a PyTorch LC0T78 model.
    
    This function handles all the weight mapping and shape transformations
    needed to go from LC0's protobuf format to PyTorch tensors.
    
    Args:
        model: LC0T78 PyTorch model instance
        weights_path: Path to .pb.gz weights file
        
    Raises:
        ValueError: If weight shapes don't match model architecture
    """
    import torch
    
    loader = LC0WeightLoader(weights_path)
    metadata = loader.parse()
    
    # Verify architecture matches
    if metadata['filters'] != model.filters:
        raise ValueError(
            f"Weight filters ({metadata['filters']}) don't match "
            f"model filters ({model.filters})"
        )
    if metadata['blocks'] != model.blocks:
        raise ValueError(
            f"Weight blocks ({metadata['blocks']}) don't match "
            f"model blocks ({model.blocks})"
        )
    
    logger.info("Loading input block weights...")
    input_w = loader.get_input_weights()
    
    model.input_conv.weight.data = torch.from_numpy(input_w['conv_weight'])
    model.input_bn.weight.data = torch.from_numpy(input_w['bn_gamma'])
    model.input_bn.bias.data = torch.from_numpy(input_w['bn_beta'])
    model.input_bn.running_mean.data = torch.from_numpy(input_w['bn_mean'])
    model.input_bn.running_var.data = torch.from_numpy(input_w['bn_var'])
    
    logger.info(f"Loading {model.blocks} residual blocks...")
    for i in range(model.blocks):
        res_w = loader.get_residual_weights(i)
        block = model.residual_blocks[i]
        
        # Conv1
        block.conv1.weight.data = torch.from_numpy(res_w['conv1_weight'])
        block.bn1.weight.data = torch.from_numpy(res_w['bn1_gamma'])
        block.bn1.bias.data = torch.from_numpy(res_w['bn1_beta'])
        block.bn1.running_mean.data = torch.from_numpy(res_w['bn1_mean'])
        block.bn1.running_var.data = torch.from_numpy(res_w['bn1_var'])
        
        # Conv2
        block.conv2.weight.data = torch.from_numpy(res_w['conv2_weight'])
        block.bn2.weight.data = torch.from_numpy(res_w['bn2_gamma'])
        block.bn2.bias.data = torch.from_numpy(res_w['bn2_beta'])
        block.bn2.running_mean.data = torch.from_numpy(res_w['bn2_mean'])
        block.bn2.running_var.data = torch.from_numpy(res_w['bn2_var'])
        
        # SE block
        block.se.fc1.weight.data = torch.from_numpy(res_w['se_fc1_weight'])
        block.se.fc1.bias.data = torch.from_numpy(res_w['se_fc1_bias'])
        block.se.fc2.weight.data = torch.from_numpy(res_w['se_fc2_weight'])
        block.se.fc2.bias.data = torch.from_numpy(res_w['se_fc2_bias'])
    
    logger.info("Loading policy head weights...")
    policy_w = loader.get_policy_head_weights()
    
    model.policy_head.conv1.weight.data = torch.from_numpy(policy_w['policy1_conv_weight'])
    model.policy_head.bn1.weight.data = torch.from_numpy(policy_w['policy1_bn_gamma'])
    model.policy_head.bn1.bias.data = torch.from_numpy(policy_w['policy1_bn_beta'])
    model.policy_head.bn1.running_mean.data = torch.from_numpy(policy_w['policy1_bn_mean'])
    model.policy_head.bn1.running_var.data = torch.from_numpy(policy_w['policy1_bn_var'])
    model.policy_head.conv2.weight.data = torch.from_numpy(policy_w['policy_conv_weight'])
    model.policy_head.conv2.bias.data = torch.from_numpy(policy_w['policy_conv_bias'])
    
    logger.info("Loading value head weights...")
    value_w = loader.get_value_head_weights()
    
    model.value_head.conv.weight.data = torch.from_numpy(value_w['value_conv_weight'])
    model.value_head.bn.weight.data = torch.from_numpy(value_w['value_bn_gamma'])
    model.value_head.bn.bias.data = torch.from_numpy(value_w['value_bn_beta'])
    model.value_head.bn.running_mean.data = torch.from_numpy(value_w['value_bn_mean'])
    model.value_head.bn.running_var.data = torch.from_numpy(value_w['value_bn_var'])
    model.value_head.fc1.weight.data = torch.from_numpy(value_w['fc1_weight'])
    model.value_head.fc1.bias.data = torch.from_numpy(value_w['fc1_bias'])
    model.value_head.fc2.weight.data = torch.from_numpy(value_w['fc2_weight'])
    model.value_head.fc2.bias.data = torch.from_numpy(value_w['fc2_bias'])
    
    logger.info("✓ All weights loaded successfully")


def verify_weight_load(model, weights_path: str) -> Dict[str, bool]:
    """
    Verify that weights were loaded correctly by checking stats.
    
    Args:
        model: Loaded PyTorch model
        weights_path: Original weights path
        
    Returns:
        Dict with verification results
    """
    import torch
    
    results = {}
    
    # Check input conv
    input_weight_mean = model.input_conv.weight.data.mean().item()
    results['input_conv_non_zero'] = abs(input_weight_mean) > 1e-6
    
    # Check a middle residual block
    mid_block = model.residual_blocks[model.blocks // 2]
    mid_weight_mean = mid_block.conv1.weight.data.mean().item()
    results['residual_non_zero'] = abs(mid_weight_mean) > 1e-6
    
    # Check value head
    value_fc_mean = model.value_head.fc1.weight.data.mean().item()
    results['value_head_non_zero'] = abs(value_fc_mean) > 1e-6
    
    # Check no NaNs
    all_finite = all(
        torch.isfinite(p).all().item()
        for p in model.parameters()
    )
    results['all_finite'] = all_finite
    
    results['verification_passed'] = all(results.values())
    
    return results
