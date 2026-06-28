#!/usr/bin/env bash
# Vanta v0.5.0 — autonomous-box containment demo (for the release GIF).
#
# Shows the REAL mount boundary: an agent is scoped to ONE folder, builds inside it, and the OS makes
# everything else invisible to it. The container + mount setup is identical to `call_agent(autonomous:true)`;
# the in-box step is a fast stand-in (narrated as the agent) so the demo needs no auth/network to record.
#
# Record it:  vhs scripts/demo-autonomous-box.tape   →   demo-autonomous-box.gif
# Or run it in a terminal you're screen-recording:  bash scripts/demo-autonomous-box.sh
set -euo pipefail

G=$'\033[0;32m'; R=$'\033[0;31m'; C=$'\033[1;36m'; D=$'\033[2m'; B=$'\033[1m'; X=$'\033[0m'
beat() { printf '%b' "$1"; sleep "${2:-1.0}"; }

SANDBOX=$(mktemp -d)

clear
beat "${B}${C}vanta${X} ${D}· an autonomous agent, boxed to one folder${X}\n\n" 1.2
beat "${D}# it can run anything it wants — but ONLY inside the folder you give it.${X}\n" 1.5
beat "${G}\$${X} docker run --rm ${B}-v ~/project:/work${X} -w /work ${B}--network none${X} vanta-agent \\\\\n" 0.6
beat "       claude ${R}--dangerously-skip-permissions${X} -p ${C}\"build it\"${X}\n\n" 1.9

docker run --rm -v "$SANDBOX:/work:rw" -w /work --network none alpine sh -c '
  G="\033[0;32m"; D="\033[2m"; C="\033[1;36m"; X="\033[0m"
  printf "%b\n" "${G}⋯ Write(hello.txt)${X}"; sleep 1
  echo "shipped by the boxed agent" > /work/hello.txt
  printf "%b\n\n" "${G}✓ built hello.txt ${D}— inside its sandbox${X}"; sleep 1
  printf "%b\n" "${D}⋯ Read(~/.ssh/id_rsa)  — the agent reaches OUTSIDE its box${X}"; sleep 1
  cat /root/.ssh/id_rsa 2>/dev/null || printf "%b\n" "${C}🔒 blocked — the agent literally cannot see it${X}"; sleep 1
'

beat "\n${B}your real machine — untouched:${X}\n" 1.2
beat "${G}✓ ~/.ssh · ~/.aws · everything — the box never saw any of it.${X}\n\n" 1.7
beat "${C}${B}Vanta v0.5.0${X}   ${D}curl -fsSL https://vanta.theft.studio/install.sh | bash${X}\n" 1.9

rm -rf "$SANDBOX"
