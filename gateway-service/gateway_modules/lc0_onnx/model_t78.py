"""
LC0 T78 PyTorch Model Definition.

Faithful PyTorch implementation of the LC0 T78 architecture:
- 512 filters
- 40 residual blocks
- Squeeze-and-Excitation (SE) with ratio 16
- WDL value head (3 outputs)
- Standard convolution policy head

This model outputs intermediate activations for probe extraction.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple
import logging

from .config import (
    T78_FILTERS,
    T78_RESIDUAL_BLOCKS,
    T78_SE_RATIO,
    T78_INPUT_PLANES,
    DEFAULT_PROBE_LAYER,
)

logger = logging.getLogger(__name__)


class SEBlock(nn.Module):
    """
    Squeeze-and-Excitation block.
    
    Applies channel-wise attention by:
    1. Global average pooling (squeeze)
    2. Two FC layers with ReLU (excitation)
    3. Sigmoid gating of original channels
    
    The SE output in LC0 is applied as: sigmoid(gamma) * x + beta
    where gamma and beta are the two halves of the SE output.
    """
    
    def __init__(self, channels: int, se_ratio: int = 16):
        super().__init__()
        se_channels = channels // se_ratio
        
        # SE layers
        self.fc1 = nn.Linear(channels, se_channels)
        self.fc2 = nn.Linear(se_channels, 2 * channels)  # gamma + beta
        
        self.channels = channels
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size = x.size(0)
        
        # Global average pooling: (B, C, H, W) -> (B, C)
        squeezed = x.mean(dim=[2, 3])
        
        # Excitation: FC -> ReLU -> FC
        excited = F.relu(self.fc1(squeezed))
        excited = self.fc2(excited)
        
        # Split into gamma and beta
        gamma, beta = excited.split(self.channels, dim=1)
        
        # Reshape for broadcasting: (B, C) -> (B, C, 1, 1)
        gamma = gamma.view(batch_size, self.channels, 1, 1)
        beta = beta.view(batch_size, self.channels, 1, 1)
        
        # Apply SE: sigmoid(gamma) * x + beta
        return torch.sigmoid(gamma) * x + beta


class ResidualBlock(nn.Module):
    """
    LC0 T78 Residual Block.
    
    Architecture:
        input -> Conv3x3 -> BN -> ReLU -> Conv3x3 -> BN -> SE -> + input -> ReLU
    
    Note: The SE block is applied after the second batch norm but before
    the residual addition, matching the LC0 implementation.
    """
    
    def __init__(self, channels: int, se_ratio: int = 16):
        super().__init__()
        
        # First convolution
        self.conv1 = nn.Conv2d(
            channels, channels, kernel_size=3, padding=1, bias=False
        )
        self.bn1 = nn.BatchNorm2d(channels)
        
        # Second convolution
        self.conv2 = nn.Conv2d(
            channels, channels, kernel_size=3, padding=1, bias=False
        )
        self.bn2 = nn.BatchNorm2d(channels)
        
        # Squeeze-and-Excitation
        self.se = SEBlock(channels, se_ratio)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x
        
        # First conv block
        out = self.conv1(x)
        out = self.bn1(out)
        out = F.relu(out)
        
        # Second conv block
        out = self.conv2(out)
        out = self.bn2(out)
        
        # SE block (before residual add)
        out = self.se(out)
        
        # Residual add and activation
        out = out + identity
        out = F.relu(out)
        
        return out


class PolicyHead(nn.Module):
    """
    LC0 convolution policy head.
    
    Architecture:
        input -> Conv3x3(filters) -> BN -> ReLU -> Conv3x3(80) -> PolicyMap -> 1858
    """
    
    def __init__(self, input_channels: int, filters: int):
        super().__init__()
        
        self.conv1 = nn.Conv2d(
            input_channels, filters, kernel_size=3, padding=1, bias=False
        )
        self.bn1 = nn.BatchNorm2d(filters)
        
        # Output 80 policy channels before mapping
        self.conv2 = nn.Conv2d(
            filters, 80, kernel_size=3, padding=1, bias=True
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.conv1(x)
        out = self.bn1(out)
        out = F.relu(out)
        
        # Policy output: (B, 80, 8, 8)
        out = self.conv2(out)
        
        # Flatten for policy logits
        # Note: Full policy mapping to 1858 moves requires additional mapping
        # For probing purposes, we don't need full policy output
        return out.view(out.size(0), -1)  # (B, 80*64)


class ValueHead(nn.Module):
    """
    LC0 WDL value head.
    
    Architecture:
        input -> Conv1x1(32) -> BN -> ReLU -> Flatten -> FC(128) -> ReLU -> FC(3)
    
    Outputs 3 values for Win/Draw/Loss probabilities.
    """
    
    def __init__(self, input_channels: int):
        super().__init__()
        
        self.conv = nn.Conv2d(
            input_channels, 32, kernel_size=1, bias=False
        )
        self.bn = nn.BatchNorm2d(32)
        
        # FC layers after flatten (32 * 8 * 8 = 2048)
        self.fc1 = nn.Linear(32 * 8 * 8, 128)
        self.fc2 = nn.Linear(128, 3)  # WDL
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.conv(x)
        out = self.bn(out)
        out = F.relu(out)
        
        # Flatten
        out = out.view(out.size(0), -1)
        
        # FC layers
        out = F.relu(self.fc1(out))
        out = self.fc2(out)
        
        return out


class LC0T78(nn.Module):
    """
    LC0 T78 Neural Network.
    
    Full architecture:
        - Input convolutional block (112 -> 512 channels)
        - 40 residual blocks with SE
        - Policy head (convolution-based)
        - Value head (WDL with 3 outputs)
    
    This model supports extracting intermediate activations for probe
    use via the `probe_layers` parameter.
    
    Args:
        filters: Number of convolutional filters (default: 512)
        blocks: Number of residual blocks (default: 40)
        se_ratio: Squeeze-and-Excitation ratio (default: 16)
        input_planes: Number of input planes (default: 112)
    """
    
    def __init__(
        self,
        filters: int = T78_FILTERS,
        blocks: int = T78_RESIDUAL_BLOCKS,
        se_ratio: int = T78_SE_RATIO,
        input_planes: int = T78_INPUT_PLANES,
    ):
        super().__init__()
        
        self.filters = filters
        self.blocks = blocks
        self.se_ratio = se_ratio
        self.input_planes = input_planes
        
        # Input convolution: (112, 8, 8) -> (512, 8, 8)
        self.input_conv = nn.Conv2d(
            input_planes, filters, kernel_size=3, padding=1, bias=False
        )
        self.input_bn = nn.BatchNorm2d(filters)
        
        # Residual tower
        self.residual_blocks = nn.ModuleList([
            ResidualBlock(filters, se_ratio)
            for _ in range(blocks)
        ])
        
        # Heads
        self.policy_head = PolicyHead(filters, filters)
        self.value_head = ValueHead(filters)
        
        logger.info(
            f"Created LC0T78 model: {filters} filters, {blocks} blocks, "
            f"SE ratio {se_ratio}"
        )
    
    def forward(
        self,
        x: torch.Tensor,
        return_activations: bool = False,
        probe_layers: Optional[List[int]] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor, Optional[Dict[str, torch.Tensor]]]:
        """
        Forward pass with optional activation extraction.
        
        Args:
            x: Input tensor of shape (B, 112, 8, 8)
            return_activations: Whether to return intermediate activations
            probe_layers: List of residual block indices to extract (0-indexed)
                         If None and return_activations=True, extracts layer 39
        
        Returns:
            Tuple of:
            - policy: Policy logits (B, 5120) - 80*64 raw values
            - value: Value head WDL logits (B, 3)
            - activations: Dict mapping "resblock_{i}" to activation tensors
                          (only if return_activations=True)
        """
        if probe_layers is None:
            probe_layers = [DEFAULT_PROBE_LAYER]
        
        activations = {} if return_activations else None
        
        # Input block
        x = self.input_conv(x)
        x = self.input_bn(x)
        x = F.relu(x)
        
        # Residual tower with activation extraction
        for i, block in enumerate(self.residual_blocks):
            x = block(x)
            
            if return_activations and i in probe_layers:
                # Store activation for this layer
                # Shape: (B, 512, 8, 8) - post-ReLU activation
                activations[f"resblock_{i}"] = x
        
        # Heads
        policy = self.policy_head(x)
        value = self.value_head(x)
        
        if return_activations:
            return policy, value, activations
        else:
            return policy, value, None
    
    def forward_with_probes(
        self,
        x: torch.Tensor,
        probe_layers: List[int] = None,
    ) -> Dict[str, torch.Tensor]:
        """
        Convenience method for probe extraction.
        
        Returns a dictionary containing policy, value, and all requested
        probe layer activations.
        
        Args:
            x: Input tensor
            probe_layers: Layers to extract
            
        Returns:
            Dict with "policy", "value", and "resblock_{i}" keys
        """
        if probe_layers is None:
            probe_layers = [DEFAULT_PROBE_LAYER]
        
        policy, value, activations = self.forward(
            x, return_activations=True, probe_layers=probe_layers
        )
        
        result = {
            "policy": policy,
            "value": value,
        }
        result.update(activations)
        
        return result


class LC0T78ForExport(nn.Module):
    """
    Wrapper model for ONNX export with named outputs.
    
    ONNX export requires a fixed number of outputs with names.
    This wrapper returns a tuple that maps to named outputs.
    """
    
    def __init__(self, model: LC0T78, probe_layers: List[int] = None):
        super().__init__()
        self.model = model
        self.probe_layers = probe_layers or [DEFAULT_PROBE_LAYER]
    
    def forward(self, x: torch.Tensor):
        """
        Forward pass returning tuple for ONNX export.
        
        Returns tuple of (policy, value, activation_0, activation_1, ...)
        """
        policy, value, activations = self.model.forward(
            x, return_activations=True, probe_layers=self.probe_layers
        )
        
        # Build output tuple in order
        outputs = [policy, value]
        for layer_idx in sorted(self.probe_layers):
            key = f"resblock_{layer_idx}"
            if key in activations:
                outputs.append(activations[key])
        
        return tuple(outputs)


def create_t78_model(
    filters: int = T78_FILTERS,
    blocks: int = T78_RESIDUAL_BLOCKS,
    se_ratio: int = T78_SE_RATIO,
) -> LC0T78:
    """
    Factory function to create LC0 T78 model.
    
    Args:
        filters: Number of filters (default: 512)
        blocks: Number of residual blocks (default: 40)
        se_ratio: SE ratio (default: 16)
        
    Returns:
        LC0T78 model instance
    """
    return LC0T78(
        filters=filters,
        blocks=blocks,
        se_ratio=se_ratio,
    )


def count_parameters(model: nn.Module) -> int:
    """Count trainable parameters in model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
