use std::{fs, path::{Component, Path}};

/// Only the file tool's exact descriptor can request a bounded replacement Ask.
pub(super) fn ordinary_replacement(text: &str, root: &Path) -> bool {
    let Some(raw) = text.strip_prefix("Overwrite existing file ") else { return false; };
    if raw.is_empty() || raw != raw.trim() || raw.chars().any(char::is_control) { return false; }
    let path = Path::new(raw);
    if !path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir)) { return false; }
    let Ok(root) = fs::canonicalize(root) else { return false; };
    let candidate = root.join(path);
    let Ok(metadata) = fs::symlink_metadata(&candidate) else { return false; };
    if !metadata.is_file() || !single_link(&metadata) { return false; }
    let Ok(target) = fs::canonicalize(&candidate) else { return false; };
    if target != candidate || target == root || !target.starts_with(&root) { return false; }
    if super::is_protected_path(path, &root) || super::is_protected_path(&target, &root) { return false; }
    let Ok(relative) = target.strip_prefix(&root) else { return false; };
    !relative.components().any(|part| sensitive_component(&part.as_os_str().to_string_lossy()))
}

fn sensitive_component(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.starts_with(".env") || matches!(name.as_str(),
        ".git" | ".vanta" | ".claude" | ".agents" | ".codex" | ".docker" | "gcloud" |
        ".ssh" | ".aws" | ".kube" | ".gnupg" |
        ".mcp.json" | "agents.md" | "claude.md" | "skill.md" | "memory.md" | "soul.md" | "program.md" | "vanta.md" |
        "auth.json" | "api-token" | "credentials" | "credentials.json" | "google-tokens.json" |
        "id_rsa" | "id_ed25519" | ".netrc" | ".npmrc" | ".pypirc" | ".zshrc" | ".bashrc" |
        ".profile" | ".bash_profile" | ".zprofile" | ".zlogin" | ".zlogout" | "config.fish" |
        ".zshenv" | ".bash_login" | ".bash_logout" | ".login" | ".cshrc" | ".tcshrc" |
        "profile" | "zshenv" | "zshrc" | "zprofile" | "bashrc") ||
        [".pem", ".key", ".p12", ".pfx", ".p8"].iter().any(|suffix| name.ends_with(suffix))
}

#[cfg(unix)]
fn single_link(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() == 1
}

#[cfg(not(unix))]
fn single_link(_metadata: &fs::Metadata) -> bool {
    false // Fail closed until this platform can verify that no hard-link alias exists.
}
