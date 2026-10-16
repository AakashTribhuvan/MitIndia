"""Dispatch providers: how a confirmed report leaves the user's device.

Only the MOCK provider exists. It "delivers" to the SignLine demo responder desk inside this app (the
responder dashboard), never to a real emergency service, phone number or messaging system. A real
provider would implement `DispatchProvider.send` and must report delivery only when the destination
actually acknowledged receipt.
"""

from __future__ import annotations

import abc
import uuid
from dataclasses import dataclass

from ..config import get_settings


@dataclass
class DispatchResult:
    status: str  # DELIVERED | FAILED
    receipt_id: str | None
    error: str | None
    simulated: bool


class DispatchProvider(abc.ABC):
    name = "ABSTRACT"
    simulated = True

    @abc.abstractmethod
    def send(self, incident_payload: dict, destination: str, simulate_failure: bool = False) -> DispatchResult: ...


class MockDispatchProvider(DispatchProvider):
    name = "MOCK_DISPATCH"
    simulated = True

    def send(self, incident_payload: dict, destination: str, simulate_failure: bool = False) -> DispatchResult:
        if simulate_failure:
            return DispatchResult("FAILED", None, "Simulated delivery failure (demo scenario). Nothing was received.", True)
        # The responder desk is this app's own database, so the report is visible there as soon as it is stored
        return DispatchResult("DELIVERED", f"SIM-{uuid.uuid4().hex[:10].upper()}", None, True)


def get_dispatch_provider() -> DispatchProvider:
    name = get_settings().dispatch_provider
    if name != "mock":
        raise RuntimeError(f"dispatch provider {name!r} is not available; only 'mock' is implemented")
    return MockDispatchProvider()
