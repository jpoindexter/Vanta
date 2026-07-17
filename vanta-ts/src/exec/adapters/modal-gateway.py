"""Deploy Vanta's messaging gateway as a scale-to-zero Modal web server."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import modal


REPO_ROOT = Path(__file__).resolve().parents[4]
APP_NAME = os.environ.get("VANTA_MODAL_GATEWAY_APP", "vanta-gateway")
SECRET_NAME = os.environ.get("VANTA_MODAL_GATEWAY_SECRET", "vanta-gateway")
TELEGRAM_SECRET_NAME = os.environ.get("VANTA_MODAL_GATEWAY_TELEGRAM_SECRET", "vanta-gateway-telegram")
VOLUME_NAME = os.environ.get("VANTA_MODAL_GATEWAY_VOLUME", "vanta-gateway-data")
SCALEDOWN_SEC = int(os.environ.get("VANTA_MODAL_GATEWAY_SCALEDOWN_SEC", "60"))

if SCALEDOWN_SEC < 60:
    raise ValueError("VANTA_MODAL_GATEWAY_SCALEDOWN_SEC must be at least 60")

app = modal.App(APP_NAME)
secret = modal.Secret.from_name(SECRET_NAME)
telegram_secret = modal.Secret.from_name(TELEGRAM_SECRET_NAME)
gateway_secrets = [secret] if TELEGRAM_SECRET_NAME == SECRET_NAME else [secret, telegram_secret]
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


def _ignore_context(path: Path) -> bool:
    """Keep the Modal build context to the files copied by the Dockerfile."""
    try:
        candidate = path if path.is_absolute() else REPO_ROOT / path
        relative = candidate.resolve().relative_to(REPO_ROOT)
    except ValueError:
        return True
    parts = relative.parts
    if not parts:
        return False
    if len(parts) == 1 and parts[0] in {"Cargo.toml", "Cargo.lock", "Dockerfile.modal-gateway"}:
        return False
    if parts[0] == "src":
        return False
    if parts[0] != "vanta-ts":
        return True
    if len(parts) == 1:
        return False
    if len(parts) == 2 and parts[1] in {"package.json", "package-lock.json"}:
        return False
    return parts[1] != "src"


image = modal.Image.from_dockerfile(
    REPO_ROOT / "Dockerfile.modal-gateway",
    context_dir=REPO_ROOT,
    add_python="3.12",
    ignore=_ignore_context,
)


@app.function(
    image=image,
    secrets=gateway_secrets,
    volumes={"/data": volume},
    min_containers=0,
    max_containers=1,
    scaledown_window=SCALEDOWN_SEC,
    timeout=86_400,
)
@modal.web_server(3978, startup_timeout=120, label="gateway")
def gateway() -> None:
    project_data = Path("/data/project")
    home_data = Path("/data/home")
    project_data.mkdir(parents=True, exist_ok=True)
    home_data.mkdir(parents=True, exist_ok=True)
    project_link = Path("/workspace/.vanta")
    if not project_link.exists():
        project_link.symlink_to(project_data, target_is_directory=True)

    env = os.environ.copy()
    env.update(
        {
            "VANTA_EXEC_BACKEND": "local",
            "VANTA_GATEWAY_TICK_MS": "1000",
            "VANTA_HOME": str(home_data),
            "VANTA_MESSAGING_WEBHOOK_HOST": "0.0.0.0",
            "VANTA_MESSAGING_WEBHOOK_PORT": "3978",
            "VANTA_NO_TUI": "1",
        }
    )
    subprocess.Popen(
        ["node", "--import", "tsx", "src/cli.ts", "gateway"],
        cwd="/workspace/vanta-ts",
        env=env,
    )
