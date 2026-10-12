import os
import tempfile
from pathlib import Path

# Tests must not write into the real live-use log
os.environ.setdefault("MUDRA_EVENTS_LOG", str(Path(tempfile.gettempdir()) / "mudra_test_stream_events.jsonl"))
