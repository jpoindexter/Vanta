use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Component, Path};

fn validate_directory(directory: &Path) -> Result<(), String> {
    if !directory.is_absolute()
        || directory
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err("kernel state directory must be absolute and normalized".into());
    }
    let canonical = fs::canonicalize(directory).map_err(|error| error.to_string())?;
    if canonical != directory {
        return Err("kernel state directory must not traverse a symlink".into());
    }
    crate::app::ensure_private_dir(directory).map_err(|error| error.to_string())?;
    let mut has_files = false;
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        has_files = true;
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_symlink()
        {
            return Err("kernel state files must not be symlinks".into());
        }
    }
    let file = directory.join("owner");
    if has_files && !file.exists() {
        return Err("refusing unbound existing kernel state".into());
    }
    Ok(())
}

fn bind_owner(directory: &Path, binding: &str) -> Result<(), String> {
    let file = directory.join("owner");
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    match options.open(&file) {
        Ok(mut output) => output
            .write_all(binding.as_bytes())
            .map_err(|error| error.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if fs::read_to_string(&file).map_err(|error| error.to_string())? != binding {
                return Err("kernel state belongs to another profile or project".into());
            }
        }
        Err(error) => return Err(error.to_string()),
    }
    Ok(())
}

/// The caller supplies a private state location, not a replacement safety root.
pub fn prepare(root: &Path, directory: &Path, owner: &str) -> Result<String, String> {
    if owner.is_empty()
        || owner.len() > 64
        || !owner.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
    {
        return Err("kernel state owner is invalid".into());
    }
    validate_directory(directory)?;
    let project = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let binding = format!("{owner}\n{}", project.display());
    bind_owner(directory, &binding)?;
    Ok(crate::audit::sha256_hex(binding.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture() -> (PathBuf, PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("vanta-state-{}-{nonce}", std::process::id()));
        fs::create_dir_all(base.join("project")).unwrap();
        let base = fs::canonicalize(base).unwrap();
        (base.join("project"), base)
    }

    #[test]
    fn private_owner_keeps_project_scope_without_copying_legacy_authority() {
        let (root, base) = fixture();
        fs::create_dir(root.join(".vanta")).unwrap();
        fs::write(root.join(".vanta/approvals.tsv"), "existing authority").unwrap();
        let directory = base.join("private");
        fs::create_dir(&directory).unwrap();
        let state = crate::app::State::scoped(root.clone(), directory.clone(), "writer").unwrap();
        assert_eq!(state.root, root);
        assert_eq!(state.data_dir, directory);
        assert!(state.scope_id.is_some());
        crate::app::doctor(&state).unwrap();
        assert!(!directory.join("approvals.tsv").exists());
        assert!(prepare(&root, &directory, "writer").is_ok());
        assert!(prepare(&root, &directory, "other").is_err());
        assert!(prepare(&base, &directory, "writer").is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_unbound_existing_tokens_and_relative_directories() {
        let (root, base) = fixture();
        let directory = base.join("private");
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("api-token"), "foreign-token").unwrap();
        assert!(prepare(&root, &directory, "writer").is_err());
        assert!(prepare(&root, Path::new("relative"), "writer").is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_corrupt_or_partial_owner_markers_without_repairing_them() {
        let (root, base) = fixture();
        let directory = base.join("private");
        fs::create_dir(&directory).unwrap();
        for marker in ["", "writer", "writer\nwrong project"] {
            fs::write(directory.join("owner"), marker).unwrap();
            assert!(prepare(&root, &directory, "writer").is_err());
            assert_eq!(fs::read_to_string(directory.join("owner")).unwrap(), marker);
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_directory_and_token_symlinks() {
        use std::os::unix::fs::symlink;
        let (root, base) = fixture();
        let directory = base.join("private");
        fs::create_dir(&directory).unwrap();
        symlink(&directory, base.join("linked")).unwrap();
        assert!(prepare(&root, &base.join("linked"), "writer").is_err());
        fs::write(base.join("secret"), "must not read").unwrap();
        symlink(base.join("secret"), directory.join("api-token")).unwrap();
        assert!(prepare(&root, &directory, "writer").is_err());
        fs::remove_dir_all(base).unwrap();
    }
}
