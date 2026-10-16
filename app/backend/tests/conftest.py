import os
import sys
import tempfile
from pathlib import Path

# Backend packages (mudra_api, signline_emergency) importable however pytest is started
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Tests must not write into the real live-use log
os.environ.setdefault("MUDRA_EVENTS_LOG", str(Path(tempfile.gettempdir()) / "mudra_test_stream_events.jsonl"))
# SignLine Emergency: tests use a throwaway database and a fixed demo password (nothing written to var/)
os.environ.setdefault("SIGNLINE_EM_DATABASE_URL", f"sqlite:///{(Path(tempfile.mkdtemp(prefix='signline_em_')) / 'test.db').as_posix()}")
os.environ.setdefault("SIGNLINE_EM_DEMO_RESPONDER_PASSWORD", "test-only-password")
