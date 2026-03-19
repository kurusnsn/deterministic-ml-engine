import pytest
from gateway_modules.services.repertoire_service import classify_time_control

@pytest.mark.parametrize(
    "time_control,duration,expected_key",
    [
        ("180+0", None, "blitz"),
        ("120+2", None, "bullet"),
        ("rapid", None, "rapid"),
        ("classical", None, "classical"),
        (None, 500, "blitz"),
        (None, None, "unknown"),
    ],
)
def test_classify_time_control(time_control, duration, expected_key):
    key, _ = classify_time_control(time_control, duration)
    assert key == expected_key
