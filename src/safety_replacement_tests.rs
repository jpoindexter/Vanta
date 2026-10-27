use super::{assess_action, Risk};
use std::{fs, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}, time::{SystemTime, UNIX_EPOCH}};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

struct Fixture { base: PathBuf, root: PathBuf }

impl Fixture {
    fn new() -> Self {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let serial = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let base = std::env::temp_dir().join(format!("vanta-replacement-{}-{stamp}-{serial}", std::process::id()));
        let root = base.join("project");
        fs::create_dir(&base).unwrap();
        fs::create_dir(&root).unwrap();
        Self { base: fs::canonicalize(&base).unwrap(), root: fs::canonicalize(root).unwrap() }
    }

    fn file(&self, path: &str) -> PathBuf {
        let target = self.root.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, "captured before\n").unwrap();
        target
    }

    fn risk(&self, path: &Path) -> Risk {
        assess_action(&format!("Overwrite existing file {}", path.display()), &self.root).risk
    }
}

impl Drop for Fixture {
    fn drop(&mut self) { fs::remove_dir_all(&self.base).unwrap(); }
}

#[test]
#[cfg(unix)]
fn ordinary_existing_file_replacement_requires_human_not_allow() {
    let fixture = Fixture::new();
    let target = fixture.file("Notes With Spaces.md");
    let verdict = assess_action(&format!("Overwrite existing file {}", target.display()), &fixture.root);
    assert_eq!(verdict.risk, Risk::Ask);
    assert!(verdict.needs_human);
    assert_eq!(fixture.risk(Path::new("Notes With Spaces.md")), Risk::Block);
}

#[test]
fn replacement_exception_never_admits_missing_directory_or_outside_paths() {
    let fixture = Fixture::new();
    let outside = fixture.base.join("outside.md");
    fs::write(&outside, "outside").unwrap();
    for path in [fixture.root.join("missing.md"), fixture.root.clone(), outside,
        fixture.root.join("../outside.md")] {
        assert_eq!(fixture.risk(&path), Risk::Block, "{}", path.display());
    }
}

#[test]
fn replacement_exception_preserves_protected_secret_and_control_plane_blocks() {
    let fixture = Fixture::new();
    for path in ["src/safety.rs", "Cargo.toml", "Cargo.lock", "MANIFESTO.md",
        "vanta-ts/src/factory/run.ts", ".env", ".env.local", "config/auth.json",
        "config/credentials.json", "config/key.pem", ".ssh/id_ed25519", ".aws/config",
        ".vanta/settings.json", ".git/config", ".mcp.json", ".claude/settings.json",
        ".agents/skills/example.md", "AGENTS.md", "CLAUDE.md", "SKILL.md", "MEMORY.md",
        "SOUL.md", "PROGRAM.md", "VANTA.md", ".zshrc", ".bashrc", "api key.md",
        ".config/gcloud/application_default_credentials.json", ".docker/config.json",
        ".codex/config.toml", "AuthKey.p8", ".zshenv", ".bash_login", ".bash_logout",
        ".login", ".cshrc", ".tcshrc", "profile", "zshenv", "zshrc", "zprofile", "bashrc"] {
        let target = fixture.file(path);
        assert_eq!(fixture.risk(&target), Risk::Block, "{path}");
    }
}

#[test]
fn replacement_exception_does_not_relax_generic_data_loss_or_shell_commands() {
    let fixture = Fixture::new();
    fixture.file("brief.md");
    for action in ["overwrite brief.md", "replace whole brief.md", "truncate brief.md",
        "drop table tasks", "git reset --hard", "git push --force origin main",
        "run shell command: Overwrite existing file brief.md", "rm -rf project",
        "Overwrite existing file brief.md\n", "Overwrite existing file brief.md; git push --force"] {
        assert_eq!(assess_action(action, &fixture.root).risk, Risk::Block, "{action}");
    }
}

#[cfg(unix)]
#[test]
fn replacement_exception_blocks_symlink_and_multiple_link_aliases() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let target = fixture.file("folder/brief.md");
    let alias = fixture.root.join("alias.md");
    symlink(&target, &alias).unwrap();
    assert_eq!(fixture.risk(&alias), Risk::Block);
    let parent_alias = fixture.root.join("alias-folder");
    symlink(target.parent().unwrap(), &parent_alias).unwrap();
    assert_eq!(fixture.risk(&parent_alias.join("brief.md")), Risk::Block);
    let hard = fixture.root.join("hard.md");
    fs::hard_link(&target, &hard).unwrap();
    assert_eq!(fixture.risk(&hard), Risk::Block);
    assert_eq!(fixture.risk(&target), Risk::Block);
}
