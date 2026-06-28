#!/usr/bin/env bash
# Vanta v0.5.0 — autonomous-box containment demo (for the release GIF).
#
# Shows the REAL mount boundary: an agent is scoped to ONE folder, builds inside it, and the OS blocks
# everything outside it. The container + mount setup is identical to `call_agent(autonomous:true)`; the
# in-box step is a fast stand-in (narrated as the agent) so the demo needs no auth/network to record.
#
# Record it:  vhs scripts/demo-autonomous-box.tape   →   demo-autonomous-box.gif
# Or just run it in a terminal you're screen-recording: bash scripts/demo-autonomous-box.sh
set -euo pipefail

G=$'\033[0;32m'; R=$'\033[0;31m'; C=$'\033[1;36m'; D=$'\033[2m'; B=$'\033[1m'; X=$'\033[0m'
beat() { printf '%b' "$1"; sleep "${2:-1.0}"; }

SANDBOX=$(mktemp -d)
SECRET=$(mktemp); echo "your-private-keys-and-everything-else" > "$SECRET"

clear
beat "${B}${C}vanta${X} ${D}· run an agent autonomously — boxed${X}\n\n" 1.2
beat "${D}# give the agent ONE folder. nothing else on the machine exists, to it.${X}\n" 1.4
beat "${G}\$${X} docker run --rm ${B}-v \$SANDBOX:/work:rw${X} -w /work ${B}--network none${X} vanta-agent \\\\\n" 0.6
beat "       claude ${R}--dangerously-skip-permissions${X} -p ${C}\"build it\"${X}\n\n" 1.7

docker run --rm -v "$SANDBOX:/work:rw" -w /work --network none alpine sh -c '
  G="\033[0;32m"; R="\033[0;31m"; D="\033[2m"; X="\033[0m"
  printf "%b\n" "${G}⋯ agent: Write(hello.txt)${X}"; sleep 1
  echo "shipped by the boxed agent" > /work/hello.txt
  printf "%b\n\n" "${G}✓ built /work/hello.txt ${D}— inside its sandbox${X}"; sleep 1
  printf "%b\n" "${D}⋯ now it reaches for a secret OUTSIDE its box...${X}"; sleep 1
  if cat "$1" 2>/dev/null; then printf "%b\n" "${R}✗ ESCAPED${X}"; else printf "%b\n" "${R}✗ that file is not in the box — blocked by the OS${X}"; fi
  sleep 1
' _ "$SECRET"

beat "\n${B}meanwhile, on your actual machine:${X}\n" 1.1
beat "${G}\$${X} cat ~/your-secret\n" 0.4
printf '%b\n' "${G}$(cat "$SECRET")${X}"; sleep 0.5
beat "${G}↑ untouched. the box never even saw it.${X}\n\n" 1.6
beat "${C}${B}Vanta v0.5.0${X}   ${D}curl -fsSL https://vanta.theft.studio/install.sh | bash${X}\n" 1.8

rm -rf "$SANDBOX"; rm -f "$SECRET"
