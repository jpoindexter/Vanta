# Vanta autonomous-agent container (VANTA-A2A-DOCKER-AUTONOMOUS).
#
# A full machine for a boxed agent — scoped at RUN time to exactly the folders Vanta mounts
# (the mount-set is the boundary). Has Node + git + the claude CLI. Credentials are NEVER baked in:
# the agent authenticates from a headless credential forwarded as env (-e ANTHROPIC_API_KEY or
# -e CLAUDE_CODE_OAUTH_TOKEN — value from the host, never in argv). Network is off by default and
# only opened for the model API.
#
# Build it once:  vanta agent-image build   (or: docker build -t vanta-agent -f agent.Dockerfile .)
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# Run as a NON-ROOT user: claude refuses --dangerously-skip-permissions under root/sudo (found live).
# node:22 ships a `node` user (uid 1000); auth comes from a forwarded env credential at runtime.
USER node
WORKDIR /work
