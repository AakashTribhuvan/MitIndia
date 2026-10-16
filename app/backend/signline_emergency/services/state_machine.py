"""Emergency status state machine: only the transitions listed here are possible.

Report prepared (READY_TO_SHARE), shared (SENT_TO_CONFIGURED_DESTINATION), acknowledged by a responder
(ACKNOWLEDGED) and resolved (RESOLVED) are different states. Nothing here contacts emergency services.
"""

from __future__ import annotations

STATES = [
    "SESSION_CREATED", "COMMUNICATING", "POSSIBLE_EMERGENCY_DETECTED", "AWAITING_USER_CONFIRMATION",
    "USER_CONFIRMED", "READY_TO_SHARE", "SENT_TO_CONFIGURED_DESTINATION", "ACKNOWLEDGED", "RESOLVED",
    "CANCELLED", "DELIVERY_FAILED",
]

TRANSITIONS: dict[str, set[str]] = {
    "SESSION_CREATED": {"COMMUNICATING", "CANCELLED"},
    "COMMUNICATING": {"POSSIBLE_EMERGENCY_DETECTED", "AWAITING_USER_CONFIRMATION", "CANCELLED"},
    "POSSIBLE_EMERGENCY_DETECTED": {"AWAITING_USER_CONFIRMATION", "COMMUNICATING", "CANCELLED"},
    "AWAITING_USER_CONFIRMATION": {"USER_CONFIRMED", "COMMUNICATING", "POSSIBLE_EMERGENCY_DETECTED", "CANCELLED"},
    "USER_CONFIRMED": {"READY_TO_SHARE", "CANCELLED"},
    "READY_TO_SHARE": {"SENT_TO_CONFIGURED_DESTINATION", "DELIVERY_FAILED", "CANCELLED"},
    "SENT_TO_CONFIGURED_DESTINATION": {"ACKNOWLEDGED", "DELIVERY_FAILED"},
    "DELIVERY_FAILED": {"READY_TO_SHARE", "CANCELLED"},
    "ACKNOWLEDGED": {"RESOLVED"},
    "RESOLVED": set(),
    "CANCELLED": set(),
}

TERMINAL = {"RESOLVED", "CANCELLED"}
# Which statuses a responder may set directly (everything else follows from the user's actions)
RESPONDER_SETTABLE = {"ACKNOWLEDGED", "RESOLVED"}

LABELS = {
    "SESSION_CREATED": "Session started", "COMMUNICATING": "Communicating",
    "POSSIBLE_EMERGENCY_DETECTED": "Possible emergency (not confirmed)",
    "AWAITING_USER_CONFIRMATION": "Waiting for your confirmation", "USER_CONFIRMED": "Confirmed by you",
    "READY_TO_SHARE": "Report prepared (not shared yet)", "SENT_TO_CONFIGURED_DESTINATION": "Shared with the configured destination",
    "ACKNOWLEDGED": "Acknowledged by a responder", "RESOLVED": "Resolved", "CANCELLED": "Cancelled",
    "DELIVERY_FAILED": "Delivery failed (not received)",
}


class InvalidTransition(ValueError):
    def __init__(self, current: str, target: str):
        super().__init__(f"cannot change status from {current} to {target}")
        self.current, self.target = current, target


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def check(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidTransition(current, target)


def path_to(current: str, target: str) -> list[str]:
    """Shortest list of transitions from current to target (empty if unreachable or equal)."""
    if current == target:
        return []
    frontier, seen = [[current]], {current}
    while frontier:
        nxt = []
        for p in frontier:
            for s in sorted(TRANSITIONS.get(p[-1], set())):
                if s in seen:
                    continue
                if s == target:
                    return p[1:] + [s]
                seen.add(s)
                nxt.append(p + [s])
        frontier = nxt
    return []
