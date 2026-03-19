"""
Tests for LC0 T78 PyTorch Model.

Validates that the model architecture matches T78 specifications:
- 512 filters
- 40 residual blocks
- SE ratio 16
- Proper activation extraction
"""

import pytest
import numpy as np

# Skip all tests if torch not available
torch = pytest.importorskip("torch")

from gateway_modules.lc0_onnx.model_t78 import (
    LC0T78,
    ResidualBlock,
    SEBlock,
    create_t78_model,
    count_parameters,
)


class TestSEBlock:
    """Tests for Squeeze-and-Excitation block."""
    
    def test_se_block_output_shape(self):
        """SE block should preserve input shape."""
        se = SEBlock(channels=512, se_ratio=16)
        x = torch.randn(2, 512, 8, 8)
        
        out = se(x)
        
        assert out.shape == (2, 512, 8, 8)
    
    def test_se_block_fc_sizes(self):
        """SE block FC layers should have correct sizes."""
        se = SEBlock(channels=512, se_ratio=16)
        
        # FC1: 512 -> 32 (512 / 16)
        assert se.fc1.in_features == 512
        assert se.fc1.out_features == 32
        
        # FC2: 32 -> 1024 (2 * 512)
        assert se.fc2.in_features == 32
        assert se.fc2.out_features == 1024


class TestResidualBlock:
    """Tests for residual block."""
    
    def test_residual_block_output_shape(self):
        """Residual block should preserve input shape."""
        block = ResidualBlock(channels=512, se_ratio=16)
        x = torch.randn(2, 512, 8, 8)
        
        out = block(x)
        
        assert out.shape == (2, 512, 8, 8)
    
    def test_residual_block_components(self):
        """Residual block should have correct components."""
        block = ResidualBlock(channels=512, se_ratio=16)
        
        # Two conv layers
        assert block.conv1.in_channels == 512
        assert block.conv1.out_channels == 512
        assert block.conv2.in_channels == 512
        assert block.conv2.out_channels == 512
        
        # Two batch norms
        assert block.bn1.num_features == 512
        assert block.bn2.num_features == 512
        
        # SE block
        assert isinstance(block.se, SEBlock)


class TestLC0T78:
    """Tests for full LC0 T78 model."""
    
    def test_model_creation(self):
        """Model should be created with T78 parameters."""
        model = create_t78_model()
        
        assert model.filters == 512
        assert model.blocks == 40
        assert model.se_ratio == 16
        assert model.input_planes == 112
    
    def test_model_forward_shape(self):
        """Forward pass should produce correct output shapes."""
        model = create_t78_model()
        x = torch.randn(2, 112, 8, 8)
        
        policy, value, activations = model(x)
        
        # Policy: flattened 80*64
        assert policy.shape == (2, 5120)
        
        # Value: WDL (3 outputs)
        assert value.shape == (2, 3)
        
        # No activations if not requested
        assert activations is None
    
    def test_model_activation_extraction(self):
        """Model should extract activations when requested."""
        model = create_t78_model()
        x = torch.randn(2, 112, 8, 8)
        
        policy, value, activations = model(x, return_activations=True, probe_layers=[39])
        
        assert activations is not None
        assert "resblock_39" in activations
        assert activations["resblock_39"].shape == (2, 512, 8, 8)
    
    def test_model_multiple_layers_extraction(self):
        """Model should extract multiple activation layers."""
        model = create_t78_model()
        x = torch.randn(1, 112, 8, 8)
        
        _, _, activations = model(
            x, return_activations=True, probe_layers=[0, 19, 39]
        )
        
        assert "resblock_0" in activations
        assert "resblock_19" in activations
        assert "resblock_39" in activations
    
    def test_model_num_residual_blocks(self):
        """Model should have exactly 40 residual blocks."""
        model = create_t78_model()
        
        assert len(model.residual_blocks) == 40
    
    def test_forward_with_probes_dict(self):
        """forward_with_probes should return dict with all outputs."""
        model = create_t78_model()
        x = torch.randn(1, 112, 8, 8)
        
        result = model.forward_with_probes(x, probe_layers=[39])
        
        assert "policy" in result
        assert "value" in result
        assert "resblock_39" in result
    
    def test_model_deterministic(self):
        """Model output should be deterministic in eval mode."""
        model = create_t78_model()
        model.eval()
        
        x = torch.randn(1, 112, 8, 8)
        
        with torch.no_grad():
            _, value1, acts1 = model(x, return_activations=True, probe_layers=[39])
            _, value2, acts2 = model(x, return_activations=True, probe_layers=[39])
        
        torch.testing.assert_close(value1, value2)
        torch.testing.assert_close(acts1["resblock_39"], acts2["resblock_39"])


class TestModelParameters:
    """Tests for model parameter counts."""
    
    def test_parameter_count_reasonable(self):
        """Model should have reasonable parameter count for T78."""
        model = create_t78_model()
        param_count = count_parameters(model)
        
        # T78 should have ~100M parameters
        assert 50_000_000 < param_count < 200_000_000
    
    def test_all_parameters_trainable(self):
        """All parameters should be trainable by default."""
        model = create_t78_model()
        
        total = sum(p.numel() for p in model.parameters())
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        
        assert total == trainable
