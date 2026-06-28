# Vanta autonomous-agent container (VANTA-A2A-DOCKER-AUTONOMOUS).
#
# A full machine for a boxed agent — scoped at RUN time to exactly the folders Vanta mounts
# (the mount-set is the boundary). Has Node + git + the claude CLI. Credentials are NEVER baked
# in: ~/.claude is mounted read-only at runtime (-v ~/.claude:/root/.claude:ro). Network is off
# by default and only opened for the model API.
#
# Build it once:  vanta agent-image build   (or: docker build -t vanta-agent -f agent.Dockerfile .)
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# Run as a NON-ROOT user: claude refuses --dangerously-skip-permissions under root/sudo (found live).
# node:22 ships a `node` user (uid 1000); credentials mount at /home/node/.claude:ro at runtime.
USER node
WORKDIR /work
