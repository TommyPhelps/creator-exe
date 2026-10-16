//! API keys live in Windows Credential Manager, never in the database or in
//! backups.

const SERVICE: &str = "CREATOR.EXE";

pub fn valid_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if ok {
        Ok(())
    } else {
        Err(format!("'{}' is not a valid secret name", name))
    }
}

#[cfg(windows)]
mod imp {
    use super::SERVICE;

    fn entry(name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        entry(name)?.set_password(value).map_err(|e| e.to_string())
    }

    pub fn get(name: &str) -> Result<Option<String>, String> {
        match entry(name)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn delete(name: &str) -> Result<(), String> {
        match entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    const MSG: &str = "Secure credential storage is only available in the Windows build";
    pub fn set(_name: &str, _value: &str) -> Result<(), String> {
        let _ = super::SERVICE;
        Err(MSG.into())
    }
    pub fn get(_name: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
    pub fn delete(_name: &str) -> Result<(), String> {
        Ok(())
    }
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    valid_name(name)?;
    imp::set(name, value)
}

pub fn get(name: &str) -> Result<Option<String>, String> {
    valid_name(name)?;
    imp::get(name)
}

pub fn delete(name: &str) -> Result<(), String> {
    valid_name(name)?;
    imp::delete(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_names() {
        assert!(valid_name("youtube_api_key").is_ok());
        assert!(valid_name("").is_err());
        assert!(valid_name("bad name").is_err());
        assert!(valid_name("../x").is_err());
    }
}
