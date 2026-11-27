"""
Run the supplied mock_services.py unchanged, but bound to 0.0.0.0:$PORT so a hosted app can reach it.
The original file only binds 127.0.0.1; we import its Handler and serve it ourselves.
"""
import importlib.util
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

here = Path(__file__).resolve().parent
src = here / "mock_services.py" if (here / "mock_services.py").exists() else here.parents[1] / "attachments" / "mock_services.py"
spec = importlib.util.spec_from_file_location("mock_services", src)
mod = importlib.util.module_from_spec(spec)
sys.modules["mock_services"] = mod
spec.loader.exec_module(mod)  # loads business_data.json next to it; does not start the server (guarded by __main__)

port = int(os.environ.get("PORT", "8765"))
print(f"Mock services on 0.0.0.0:{port} (source: {src})", flush=True)
ThreadingHTTPServer(("0.0.0.0", port), mod.Handler).serve_forever()
