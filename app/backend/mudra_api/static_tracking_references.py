"""Optional one-image landmark references for the isolated static-sign experiment."""

from __future__ import annotations

from pathlib import Path

import numpy as np


class StaticTrackingReferences:
    """Reads the separately stored, held-out examples without loading source photos."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._archive = None
        if self.path.is_file():
            self._archive = np.load(self.path, allow_pickle=False)
        self.available = set(self._archive["labels"].astype(str).tolist()) if self._archive else set()

    def get(self, sign: str) -> dict | None:
        if not self._archive or sign not in self.available:
            return None
        labels = self._archive["labels"].astype(str)
        index = int(np.where(labels == sign)[0][0])
        pose = self._archive["pose"][index]
        present = self._archive["hand_present"][index]
        hands = self._archive["hands"][index]
        normals = self._archive["palm_directions"][index]
        width, height = self._archive["image_sizes"][index].tolist()
        # Compact hands and their normals together so the browser can draw each detected hand.
        hand_points = [hands[slot].tolist() for slot in range(len(present)) if present[slot]]
        palm_directions = [normals[slot].tolist() for slot in range(len(present)) if present[slot]]
        scale = np.asarray((width, height), dtype=np.float32)
        pose_xy = pose[:, :2] * scale
        shoulder_width = float(np.linalg.norm(pose_xy[11] - pose_xy[12]))
        shoulder_midpoint = (pose_xy[11] + pose_xy[12]) / 2
        visible_hands = [hands[slot] for slot in range(len(present)) if present[slot]]
        finger_count = 0
        wrist_torso = []
        for hand in visible_hands:
            hand_xy = hand[:, :2] * scale
            palm_width = float(np.linalg.norm(hand_xy[5] - hand_xy[17]))
            if palm_width > 1e-6:
                for tip, mcp in zip((4, 8, 12, 16, 20), (1, 5, 9, 13, 17)):
                    extension = float(np.linalg.norm(hand_xy[tip] - hand_xy[0])) / palm_width
                    base = float(np.linalg.norm(hand_xy[mcp] - hand_xy[0])) / palm_width
                    finger_count += int(extension / max(base, 1e-4) > 1.35)
            if shoulder_width > 1e-6:
                wrist_torso.append(float(np.linalg.norm(hand_xy[0] - shoulder_midpoint)) / shoulder_width)
        region_distances = {}
        for region, point_indices in {"eyes": (2, 5), "ears": (7, 8), "mouth": (9, 10)}.items():
            points = [pose_xy[index] for index in point_indices if pose[index, 3] >= 0.2]
            if points and visible_hands and shoulder_width > 1e-6:
                distances = [np.linalg.norm((hand[:, :2] * scale)[:, None, :] - np.asarray(points)[None, :, :], axis=2).min()
                             for hand in visible_hands]
                region_distances[region] = float(min(distances) / shoulder_width)
        metrics = {"hands": len(visible_hands), "extended_fingers": finger_count,
                   "wrist_to_torso": min(wrist_torso) if wrist_torso else None,
                   "nearest_face_regions": region_distances}
        frame = {"pose": pose.tolist(), "hands": hand_points, "palmDirections": palm_directions,
                 "metrics": metrics}
        return {
            "sign": sign,
            "label": sign.replace("_", " ").title(),
            "kind": "static-landmark-example",
            "fps": 1,
            "width": int(width),
            "height": int(height),
            "frames": [frame],
        }
