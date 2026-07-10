# Remote sandbox execution

Vanta can run `shell_cmd` and `run_code` in a Modal Sandbox selected through the
execution-backend port. Local execution remains the default. Remote execution is
explicit and fails closed when the provider CLI or configuration is unavailable.
For Modal, Vanta also checks `modal token info` before constructing the remote
invocation and reports `modal token new --verify` when authentication is missing.

## Modal setup

Install and authenticate the official CLI:

```sh
uv tool install modal
modal token new --verify
```

Then select **remote sandbox - Modal** in `vanta setup`, or set:

```sh
export VANTA_EXEC_BACKEND=serverless
export VANTA_SERVERLESS_PROVIDER=modal
export VANTA_SERVERLESS_NET=0
```

Optional settings:

- `VANTA_SERVERLESS_APP`: Modal app name; defaults to `vanta-remote-exec`.
- `VANTA_SERVERLESS_IMAGE`: container image; defaults to `node:24-bookworm-slim`.
- `VANTA_SERVERLESS_IDLE_SEC`: command and idle timeout in seconds; defaults to 300.
- `VANTA_SERVERLESS_NET=1`: allow outbound network access. Network is blocked by default.

## Boundary

The kernel assesses the action before the execution adapter changes where it runs.
The selected command's working directory is copied to `/workspace` in the remote
image. Vanta excludes `.git`, `.vanta`, `node_modules`, Python caches, and `.env`
files from that upload, applies `.gitignore` and `.dockerignore`, and refuses to
upload the home or filesystem root. The command runs in `/workspace`; remote
stdout, stderr, exit status, and timeout are returned to the original tool call.

This path creates and terminates a bounded Sandbox for each command. A persistent
gateway that hibernates and wakes on inbound messages is a separate live-release
gate; this adapter does not claim that behavior.
