from ...config import get_settings
from .base import ISLRecognitionProvider, RecognitionEvent, boundaries
from .mock_provider import MockISLRecognitionProvider
from .real_signline_adapter import RealSignLineRecognitionProvider

_override: ISLRecognitionProvider | None = None


def get_provider() -> ISLRecognitionProvider:
    """The configured provider (SIGNLINE_EM_RECOGNITION_PROVIDER = mock | real); tests may override it."""
    if _override is not None:
        return _override
    return RealSignLineRecognitionProvider() if get_settings().recognition_provider == "real" else MockISLRecognitionProvider()


def set_provider(provider: ISLRecognitionProvider | None) -> None:
    global _override
    _override = provider


__all__ = [
    "ISLRecognitionProvider",
    "MockISLRecognitionProvider",
    "RealSignLineRecognitionProvider",
    "RecognitionEvent",
    "boundaries",
    "get_provider",
    "set_provider",
]
