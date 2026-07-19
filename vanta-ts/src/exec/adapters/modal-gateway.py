"""Deploy Vanta's messaging gateway as a scale-to-zero Modal web server."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import modal


def resolve_repo_root(source: Path) -> Path:
    """Find the build root locally and retain a stable runtime fallback on Modal."""
    for candidate in source.parents:
        if (candidate / "Dockerfile.modal-gateway").is_file():
            return candidate
    return Path("/workspace")


REPO_ROOT = resolve_repo_root(Path(__file__).resolve())
APP_NAME = os.environ.get("VANTA_MODAL_GATEWAY_APP", "vanta-gateway")
SECRET_NAME = os.environ.get("VANTA_MODAL_GATEWAY_SECRET", "vanta-gateway")
TELEGRAM_SECRET_NAME = os.environ.get("VANTA_MODAL_GATEWAY_TELEGRAM_SECRET", "vanta-gateway-telegram")
VOLUME_NAME = os.environ.get("VANTA_MODAL_GATEWAY_VOLUME", "vanta-gateway-data")
SCALEDOWN_SEC = int(os.environ.get("VANTA_MODAL_GATEWAY_SCALEDOWN_SEC", "60"))
MIN_CONTAINERS = int(os.environ.get("VANTA_MODAL_GATEWAY_MIN_CONTAINERS", "0"))

if SCALEDOWN_SEC < 60:
    raise ValueError("VANTA_MODAL_GATEWAY_SCALEDOWN_SEC must be at least 60")
if MIN_CONTAINERS not in {0, 1}:
    raise ValueError("VANTA_MODAL_GATEWAY_MIN_CONTAINERS must be 0 or 1")

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
    if len(parts) == 1 and parts[0] in {"Cargo.toml", "Cargo.lock", "Dockerfile.modal-gateway", "roadmap.json"}:
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
    min_containers=MIN_CONTAINERS,
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
    project_link = Path("/workspace/vanta-ts/.vanta")
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
    provider = env.get("VANTA_PROVIDER", "openai")
    required_key = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }.get(provider)
    provider_state = "ready" if required_key is None or env.get(required_key) else f"missing {required_key}"
    print(f"vanta gateway: provider {provider} {provider_state}", flush=True)
    subprocess.Popen(
        ["node", "--import", "tsx", "src/cli.ts", "gateway"],
        cwd="/workspace/vanta-ts",
        env=env,
    )
