#!/usr/bin/env python3
"""Restricted host command: prune only unused volumes labelled for one app/environment."""

import fcntl
import os
import re
import subprocess


def prune(command, runner=subprocess.run, lock_path="/run/lock/atlas-prune-volumes.lock"):
    if os.geteuid() != 0:
        raise PermissionError("Volume maintenance must run as root")
    match = re.fullmatch(r"atlas-prune-volumes (test|prod) ([A-Za-z0-9][A-Za-z0-9_-]{0,63})", command)
    if not match:
        raise ValueError("Expected: atlas-prune-volumes <test|prod> <application UUID>")
    environment, application = match.groups()
    with open(lock_path, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runner(["docker", "volume", "prune", "--all", "--force",
                # A single composite label avoids OR semantics for repeated label filters.
                "--filter", f"label=io.constitution-atlas.deployment={environment}:{application}"], check=True)


if __name__ == "__main__":
    prune(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
