//! Local file operations. These only ever create or write files the user has
//! chosen (through a save dialog, or a project root picked in Settings).
//! Nothing here deletes files.

use base64::Engine;
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_TEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BINARY_BYTES: u64 = 40 * 1024 * 1024;

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Turns arbitrary text (like a video title) into a safe Windows folder name.
pub fn sanitize_name(raw: &str) -> String {
    let mut s: String = raw
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if (c as u32) < 32 => ' ',
            c => c,
        })
        .collect();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    while s.ends_with('.') || s.ends_with(' ') {
        s.pop();
    }
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect::<String>().trim_end().to_string();
        while s.ends_with('.') {
            s.pop();
        }
    }
    if s.is_empty() {
        return "Untitled video".to_string();
    }
    let upper = s.to_uppercase();
    let stem = upper.split('.').next().unwrap_or("");
    if RESERVED.contains(&stem) {
        s = format!("Video {}", s);
    }
    s
}

/// A subfolder template entry must be a plain relative path without `..`.
pub fn validate_relative(sub: &str) -> Result<PathBuf, String> {
    let trimmed = sub.trim().trim_matches(|c| c == '/' || c == '\\');
    if trimmed.is_empty() {
        return Err("empty folder name in template".into());
    }
    let p = PathBuf::from(trimmed.replace('\\', "/"));
    for c in p.components() {
        match c {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if sanitize_name(&part) != part {
                    return Err(format!("folder name '{}' contains characters Windows does not allow", part));
                }
            }
            _ => return Err(format!("'{}' must be a simple relative folder name", sub)),
        }
    }
    Ok(p)
}

/// Creates `root/<name>/<sub>` for each template entry. Existing folders and
/// files are left untouched. Returns the project folder path.
pub fn create_project_folders(root: &Path, name: &str, subfolders: &[String]) -> Result<PathBuf, String> {
    if !root.is_dir() {
        return Err(format!("Project root '{}' does not exist or is not a folder", root.display()));
    }
    let base = root.join(sanitize_name(name));
    let mut subs = Vec::new();
    for s in subfolders {
        subs.push(validate_relative(s)?);
    }
    fs::create_dir_all(&base).map_err(|e| format!("Could not create '{}': {}", base.display(), e))?;
    for s in subs {
        let p = base.join(s);
        fs::create_dir_all(&p).map_err(|e| format!("Could not create '{}': {}", p.display(), e))?;
    }
    Ok(base)
}

pub fn write_text(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err(format!("Folder '{}' does not exist", parent.display()));
        }
    }
    // Write to a temporary sibling first so a crash never leaves a half file.
    let tmp = path.with_extension("creator-tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("Could not write '{}': {}", path.display(), e))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save '{}': {}", path.display(), e)
    })
}

pub fn write_base64(path: &Path, data: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("Invalid file data: {}", e))?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err(format!("Folder '{}' does not exist", parent.display()));
        }
    }
    let tmp = path.with_extension("creator-tmp");
    fs::write(&tmp, &bytes).map_err(|e| format!("Could not write '{}': {}", path.display(), e))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save '{}': {}", path.display(), e)
    })
}

pub fn read_text(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Could not open '{}': {}", path.display(), e))?;
    if meta.len() > MAX_TEXT_BYTES {
        return Err(format!("'{}' is too large to import ({} MB limit)", path.display(), MAX_TEXT_BYTES / 1024 / 1024));
    }
    let bytes = fs::read(path).map_err(|e| format!("Could not read '{}': {}", path.display(), e))?;
    // Strip a UTF-8 byte-order mark (YouTube Studio CSV exports include one).
    let slice = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { &bytes[..] };
    Ok(String::from_utf8_lossy(slice).into_owned())
}

pub fn read_base64(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Could not open '{}': {}", path.display(), e))?;
    if meta.len() > MAX_BINARY_BYTES {
        return Err(format!("'{}' is larger than {} MB", path.display(), MAX_BINARY_BYTES / 1024 / 1024));
    }
    let bytes = fs::read(path).map_err(|e| format!("Could not read '{}': {}", path.display(), e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_titles() {
        assert_eq!(sanitize_name("Is Windows XP: still \"good\"?"), "Is Windows XP- still -good--");
        assert_eq!(sanitize_name("  trailing dots... "), "trailing dots");
        assert_eq!(sanitize_name("CON"), "Video CON");
        assert_eq!(sanitize_name(""), "Untitled video");
        assert!(sanitize_name(&"x".repeat(200)).len() <= 80);
    }

    #[test]
    fn rejects_escaping_subfolders() {
        assert!(validate_relative("../evil").is_err());
        assert!(validate_relative("C:\\Windows").is_err());
        assert!(validate_relative("").is_err());
        assert!(validate_relative("Research/Sources").is_ok());
    }

    #[test]
    fn creates_folders_without_touching_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let existing = dir.path().join("My Video").join("Recordings");
        fs::create_dir_all(&existing).unwrap();
        fs::write(existing.join("take1.mp4"), b"footage").unwrap();
        let out = create_project_folders(
            dir.path(),
            "My Video",
            &["Recordings".into(), "Thumbnails".into(), "Research/Sources".into()],
        )
        .unwrap();
        assert!(out.join("Thumbnails").is_dir());
        assert!(out.join("Research").join("Sources").is_dir());
        assert_eq!(fs::read(existing.join("take1.mp4")).unwrap(), b"footage");
    }

    #[test]
    fn missing_root_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert!(create_project_folders(&missing, "x", &[]).is_err());
    }

    #[test]
    fn text_and_binary_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.txt");
        write_text(&p, "hello").unwrap();
        assert_eq!(read_text(&p).unwrap(), "hello");
        let b = dir.path().join("b.bin");
        write_base64(&b, "AAEC").unwrap();
        assert_eq!(read_base64(&b).unwrap(), "AAEC");
        fs::write(dir.path().join("bom.csv"), b"\xEF\xBB\xBFa,b").unwrap();
        assert_eq!(read_text(&dir.path().join("bom.csv")).unwrap(), "a,b");
        assert!(write_text(&dir.path().join("missing").join("x.txt"), "x").is_err());
        assert!(write_base64(&dir.path().join("c.bin"), "%%%").is_err());
    }
}
