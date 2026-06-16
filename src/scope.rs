use std::path::{Component, Path, PathBuf};

// Path / scope resolution for the safety boundary. Split out of safety.rs so each
// module stays small: this owns "is this path inside the approved root, and is it
// a protected path?", safety.rs owns action-risk classification. All resolution is
// canonicalize-when-it-exists (symlinks + `..`) with a lexical fallback, and a
// trailing-separator containment check so sibling prefixes don't count as inside.

/// True if any whitespace token is an absolute path not under `root`. Each token is
/// lexically normalized first, so `root/../escape` (`..` traversal) and a
/// sibling-prefix path (`/a/vanta-evil` vs `/a/vanta`) can no longer slip through.
pub(crate) fn references_abs_path_outside_root(text: &str, root: &Path) -> bool {
    let base = lex_norm_str(root);
    text.split_whitespace()
        .any(|tok| tok.starts_with('/') && tok.len() > 1 && !is_inside(&lex_norm_str(Path::new(tok)), &base))
}

/// Is `path` inside `root`? Resolves symlinks + `..` via the filesystem when the
/// path EXISTS (so an in-root symlink can't point out of bounds undetected); else
/// falls back to lexical `..`/`.` resolution. Containment is checked with a
/// trailing separator so a sibling prefix is NOT counted as inside.
pub fn inside_scope(path: &Path, root: &Path) -> bool {
    let abs = if path.is_absolute() { path.to_path_buf() } else { root.join(path) };
    is_inside(&resolve_scope_path(&abs), &resolve_scope_path(root))
}

/// Resolve `.`/`..` components WITHOUT the filesystem (works on paths that don't
/// exist yet). Does NOT resolve symlinks.
pub(crate) fn lexically_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => { out.pop(); }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Lowercased, lexically-normalized string form for case-insensitive containment.
fn lex_norm_str(path: &Path) -> String {
    lexically_normalize(path).display().to_string().to_lowercase()
}

/// Real path for a scope check: canonicalize (symlinks + `..`) when it exists,
/// else lexical fallback. Lowercased.
fn resolve_scope_path(path: &Path) -> String {
    match std::fs::canonicalize(path) {
        Ok(real) => real.display().to_string().to_lowercase(),
        Err(_) => lex_norm_str(path),
    }
}

/// True when `child` equals `base` or sits strictly under it. The trailing
/// separator stops a sibling prefix (`/a/vanta-evil` under `/a/vanta`).
fn is_inside(child: &str, base: &str) -> bool {
    child == base || child.starts_with(&format!("{base}/"))
}

/// Lowercased copy of a path (component case-folding for case-insensitive compares).
fn lower_pathbuf(path: &Path) -> PathBuf {
    PathBuf::from(path.to_string_lossy().to_lowercase())
}

pub(crate) fn mentions_outside_home(text: &str) -> bool {
    ["/etc/", "/var/", "/system/", "/library/", "~/documents", "~/desktop"]
        .iter()
        .any(|p| text.contains(p))
}

/// True if the text references something under root's PARENT dir but not the root
/// itself — i.e., a sibling project outside scope. Derived entirely from `root`,
/// never hardcoded to a user/machine.
pub(crate) fn mentions_outside_scope(text: &str, root: &Path) -> bool {
    let marker = root.display().to_string().to_lowercase();
    match root.parent() {
        Some(parent) => {
            let p = parent.display().to_string().to_lowercase();
            !p.is_empty() && p != "/" && text.contains(&p) && !text.contains(&marker)
        }
        None => false,
    }
}

/// True for paths that autonomous writes are permanently forbidden from touching:
/// kernel source, factory loop files, human MANIFESTO. `..` traversal can't escape
/// the check (paths are lexically normalized + lowercased before the prefix match).
pub fn is_protected_path(path: &Path, root: &Path) -> bool {
    let joined = if path.is_absolute() { path.to_path_buf() } else { root.join(path) };
    let abs = lower_pathbuf(&lexically_normalize(&joined));
    let base = lower_pathbuf(&lexically_normalize(root));
    let rel = match abs.strip_prefix(&base) {
        Ok(r) => r.to_string_lossy().to_string(),
        Err(_) => return false,
    };
    let s: &str = rel.as_ref();
    if (s.starts_with("src/") && (s.ends_with(".rs") || s.ends_with(".toml") || s.ends_with(".lock")))
        || s == "cargo.toml"
        || s == "cargo.lock"
    {
        return true; // kernel source — the safety boundary itself
    }
    if s.starts_with("vanta-ts/src/factory/") && s.ends_with(".ts") {
        return true; // factory loop — can't rewrite its own guardrails or their tests
    }
    s == "manifesto.md" // human north star
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/repo/projects/vanta")
    }

    #[test]
    fn lexically_normalize_resolves_dotdot() {
        assert_eq!(lexically_normalize(Path::new("/a/b/../c")), PathBuf::from("/a/c"));
        assert_eq!(lexically_normalize(Path::new("/a/./b")), PathBuf::from("/a/b"));
    }

    #[test]
    fn sibling_prefix_is_not_inside_scope() {
        assert!(!inside_scope(Path::new("/repo/projects/vanta-evil/x"), &root()));
        assert!(inside_scope(Path::new("/repo/projects/vanta/src/x"), &root()));
    }

    #[test]
    fn references_abs_path_catches_dotdot_and_sibling() {
        let r = root();
        assert!(references_abs_path_outside_root("/repo/projects/vanta/../secret", &r));
        assert!(references_abs_path_outside_root("/repo/projects/vanta-evil/x", &r));
        assert!(!references_abs_path_outside_root("/repo/projects/vanta/src/a", &r));
    }

    #[test]
    fn protected_paths_caught_incl_dotdot() {
        let r = root();
        assert!(is_protected_path(&r.join("src/safety.rs"), &r));
        assert!(is_protected_path(&r.join("Cargo.toml"), &r));
        assert!(is_protected_path(&r.join("vanta-ts/src/factory/run.ts"), &r));
        assert!(is_protected_path(&r.join("MANIFESTO.md"), &r));
        assert!(is_protected_path(&r.join("vanta-ts/src/factory/../../../src/safety.rs"), &r));
        assert!(!is_protected_path(&r.join("ROADMAP.md"), &r));
        assert!(!is_protected_path(&r.join("vanta-ts/src/tools/new-tool.ts"), &r));
    }
}
