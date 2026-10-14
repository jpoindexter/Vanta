# Kernel process lifecycle: before and after
(Draft for desktop-next/docs/proofs/kernel-lifecycle/REPORT.md. The Write tool refused a file named REPORT.md in this session; evidence files are committed beside it.)

Date 2026-10-14, macOS arm64, Node 22.23. Branch claude/desktop-kernel-closeout-20261014 on 5d05cde1. "Before" = 15af9c06 (550e0040~1).
Done criterion: after every way a shell/runtime can end, zero vanta-kernel/guard/runtime/Electron processes the run started survive and the pid file is gone; two runtimes on one profile+port never make two kernels or kill each other's.

| Surface | Exit paths | Survivors before | Survivors after | Evidence |
| runtime (default env) | SIGTERM, SIGINT, SIGHUP, SIGKILL, parent SIGKILLed | 1,1,1,1,2 | 0,0,0,0,0 | before-matrix.txt, after-matrix.txt |
| packaged Vanta Next.app | quit, SIGTERM, SIGKILL of Electron | 1,1,2 | 0,0,0 | packaged-before.json, packaged-after.json |
| source app main.mjs | --smoke quit, SIGTERM, SIGKILL | not measured | 0,0,0 | old-app-after.json |
| 2 runtimes, 1 profile+port | start together | pid file erased 3/3 | pid file intact 4/4, 1 kernel | two-runtimes-after.json |

Commands: see commit 495a741e / the scripts' headers:
 cd vanta-ts && node scripts/kernel-lifecycle-repro.mjs ; node scripts/kernel-lifecycle-repro.mjs --two-runtimes
 cd desktop-next && npm run vanta:package && node tools/prove-kernel-lifecycle.mjs --out f.json   (--app <path> for another build)
 cd vanta-ts && node scripts/desktop-kernel-lifecycle-proof.mjs --out f.json
Still open: VANTA_KERNEL_EPHEMERAL=0 leaks by design (shared detached kernel, 1/path); SIGSTOPped shell undetected; spawnGuardedKernel has no 'error' listener (missing project root => uncaught "spawn node ENOENT" ends the runtime); macOS only; "attach" means the attached runtime loses the kernel when the owner quits; project-switch restart of the source app not exercised.
