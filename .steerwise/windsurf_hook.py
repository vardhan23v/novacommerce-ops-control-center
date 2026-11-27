# Steerwise: notes which Windsurf (Cascade) conversations ran in this take-home folder, so they are collected
# when you submit. It reads what Windsurf passes it, writes the conversation's id to .steerwise/windsurf and keeps a
# copy of its transcript in .steerwise/windsurf-transcripts. It sends nothing anywhere and never blocks Cascade.
import json, os, re, shutil, sys
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    event = json.loads(sys.stdin.read() or "{}")
except Exception:
    sys.exit(0)
def values(v):
    if isinstance(v, dict):
        for k, x in v.items():
            yield k, x
            yield from values(x)
    elif isinstance(v, list):
        for x in v:
            yield from values(x)
found = dict(values(event))
conversation = str(found.get("trajectory_id") or found.get("trajectoryId") or found.get("conversation_id") or "")
try:
    os.makedirs(os.path.join(here, ".steerwise", "windsurf-transcripts"), exist_ok=True)
    if not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}", conversation):
        sys.exit(0)
    with open(os.path.join(here, ".steerwise", "windsurf"), "a", encoding="utf-8") as out:
        out.write(conversation + "\n")
    # Only Windsurf's own transcript of this conversation: in its transcripts folder, named by the conversation id
    home = os.path.expanduser("~")
    folders = [os.path.realpath(os.path.join(home, d, "transcripts")) for d in (".windsurf", os.path.join(".codeium", "windsurf"), ".devin")]
    for key, value in values(event):
        if not (isinstance(value, str) and value.endswith(".jsonl") and os.path.isfile(value)):
            continue
        real = os.path.realpath(value)
        if os.path.dirname(real) in folders and os.path.basename(real) == conversation + ".jsonl":
            shutil.copyfile(real, os.path.join(here, ".steerwise", "windsurf-transcripts", conversation + ".jsonl"))
except Exception:
    pass
sys.exit(0)
