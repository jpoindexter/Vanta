# Retired roadmap cards

Updated 2026-07-11. These records were removed from `roadmap.json` after an
evidence pass showed that none represented required executable work. This file
preserves the decision history without counting rejected or superseded ideas as
unfinished product work.

| Card | Disposition | Evidence / owner |
| --- | --- | --- |
| `VANTA-GREP-READ-EDIT` | Remove: not applicable | Vanta has no Edit-tool read-before-write gate; `write_file` uses post-write action proof. |
| `VANTA-NATIVE-CLIPBOARD` | Remove: invalid constraint | Node has no dependency-free native image clipboard API. Vanta's shipped clipboard flow owns the user outcome. |
| `VANTA-AUTO-THEME` | Remove: rejected design | `DECISIONS.md` locks removal of the TUI theme system; an auto theme would restore deliberately deleted complexity. |
| `VANTA-VIM-UNDO-REDO` | Remove: behavioral regression | `/undo` drops the latest conversation turn while `/rewind` restores file checkpoints. Aliasing them would erase a valid distinction. |
| `GHOST-OS-MCP` | Remove: optional experiment | Ghost OS is not installed or live-proven and is not required by Vanta. Reintroduce only from a new live acceptance result. |
| `VANTA-H-GITHUB` | Remove: rejected hosted surface | Local git/`gh` and the gateway cover the current operator model; a hosted GitHub App requires a new product decision. |
| `VANTA-H-SLACK` | Remove: superseded | `MSG-CHANNEL-PARITY` shipped the adapter-based Slack outcome without making Vanta a hosted app platform. |
| `HP-SECRETS` | Remove: superseded | `HERMES-VAULT-SECRETS-ROTATION` shipped scoped Bitwarden and 1Password-backed secret resolution and rotation. |
| `HP-ISOLATED-PROFILES` | Remove: superseded / rejected | `HERMES-PROFILE-ROSTER` shipped isolated specialist state; full multi-tenant `VANTA_HOME` profiles remain outside the one-owner model. |
| `HP-169-BUNDLED-SKILLS` | Remove: rejected metric | `PUBLIC-SKILL-REGISTRY-CLIENT` and profile distributions ship safe discovery and installation; bundled-skill count is not a product outcome. |
| `PCLIP-MULTI-COMPANY` | Remove: strategy rejected | `DECISIONS.md` locks Vanta to one owner and one trust boundary, not multi-company SaaS tenancy. |
| `PCLIP-MULTI-USER` | Remove: strategy rejected | Multiple supervisors require accounts, roles, invitations, and cross-user audit boundaries outside the current product. |
| `PLATFORM-MOBILE-TERMUX` | Remove: duplicate | `RUN-ANYWHERE-TERMUX` owns Android/Termux implementation and the remaining physical ARM64 proof. |
| `VANTA-A2A-AUTONOMOUS-SANDBOX` | Remove: superseded | `VANTA-A2A-DOCKER-AUTONOMOUS` shipped the selected containment backend; macOS `sandbox-exec` is not a second required backend. |

Reintroduction requires a new card with a current Vanta-native outcome and proof
criterion. Do not restore these records merely because an upstream competitor
has a similarly named feature.
