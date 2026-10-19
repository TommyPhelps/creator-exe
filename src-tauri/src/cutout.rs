//! On-device face cutout: U²-Net human segmentation (Apache-2.0) run with
//! ONNX Runtime (MIT), entirely on this PC. The model (176 MB) is downloaded
//! once, only when you ask, from the rembg project's GitHub release, and its
//! SHA-256 is checked before it is used. Nothing is uploaded anywhere.
//!
//! The frontend resizes your photo to 320×320 and sends the pixels here; this
//! returns a 320×320 mask that the frontend scales back up and applies.

use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

pub const MODEL_FILE: &str = "u2net_human_seg.onnx";
pub const MODEL_URL: &str =
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx";
pub const MODEL_SHA256: &str = "01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c";
pub const MODEL_BYTES: u64 = 175_997_641;
pub const SIZE: usize = 320;

static ENV: OnceLock<Result<ort::environment::Environment, String>> = OnceLock::new();
static SESSION: Mutex<Option<ort::session::Session>> = Mutex::new(None);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CutoutStatus {
    pub model_ready: bool,
    pub runtime_ready: bool,
    pub model_bytes: u64,
    pub model_url: String,
    pub model_path: String,
}

pub fn model_path(data_dir: &Path) -> PathBuf {
    data_dir.join("models").join(MODEL_FILE)
}

/// ONNX Runtime ships next to the app (resources/onnxruntime.dll).
pub fn runtime_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?;
    let p = dir.join("resources").join(if cfg!(windows) {
        "onnxruntime.dll"
    } else {
        "libonnxruntime.so"
    });
    p.exists().then_some(p)
}

pub fn status(app: &tauri::AppHandle, data_dir: &Path) -> CutoutStatus {
    let mp = model_path(data_dir);
    CutoutStatus {
        model_ready: mp.exists()
            && std::fs::metadata(&mp)
                .map(|m| m.len() == MODEL_BYTES)
                .unwrap_or(false),
        runtime_ready: runtime_path(app).is_some(),
        model_bytes: MODEL_BYTES,
        model_url: MODEL_URL.to_string(),
        model_path: mp.display().to_string(),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: u64,
    total: u64,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex(&h.finalize())
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Downloads the model to a temporary file, checks its SHA-256, then moves it into place.
pub async fn download(app: &tauri::AppHandle, data_dir: &Path) -> Result<(), String> {
    let dest = model_path(data_dir);
    std::fs::create_dir_all(dest.parent().unwrap())
        .map_err(|e| format!("Could not create the models folder: {e}"))?;
    let part = dest.with_extension("onnx.part");
    let client = tauri_plugin_http::reqwest::Client::builder()
        .user_agent(concat!("CREATOR.EXE/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Download failed: the server answered {}",
            resp.status()
        ));
    }
    let total = resp.content_length().unwrap_or(MODEL_BYTES);
    let mut file =
        std::fs::File::create(&part).map_err(|e| format!("Could not write the model: {e}"))?;
    let mut hasher = Sha256::new();
    let mut done: u64 = 0;
    let mut last_emit = 0u64;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Download interrupted: {e}"))?
    {
        file.write_all(&chunk)
            .map_err(|e| format!("Could not write the model: {e}"))?;
        hasher.update(&chunk);
        done += chunk.len() as u64;
        if done - last_emit > 2_000_000 || done == total {
            last_emit = done;
            let _ = app.emit("cutout-download", Progress { done, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let got = hex(&hasher.finalize());
    if got != MODEL_SHA256 {
        let _ = std::fs::remove_file(&part);
        return Err("The downloaded model didn't match its expected checksum, so it was deleted. Try again later.".into());
    }
    std::fs::rename(&part, &dest)
        .map_err(|e| format!("Could not move the model into place: {e}"))?;
    Ok(())
}

/// Normalises 320×320 RGBA pixels the way U²-Net was trained (ImageNet mean/std after max-scaling).
pub fn preprocess(rgba: &[u8]) -> Result<Vec<f32>, String> {
    if rgba.len() != SIZE * SIZE * 4 {
        return Err(format!("Expected {}×{} pixels.", SIZE, SIZE));
    }
    let mut max = 1u8;
    for px in rgba.chunks_exact(4) {
        max = max.max(px[0]).max(px[1]).max(px[2]);
    }
    let mean = [0.485f32, 0.456, 0.406];
    let std = [0.229f32, 0.224, 0.225];
    let plane = SIZE * SIZE;
    let mut out = vec![0f32; plane * 3];
    for (i, px) in rgba.chunks_exact(4).enumerate() {
        for c in 0..3 {
            let v = px[c] as f32 / max as f32;
            out[c * plane + i] = (v - mean[c]) / std[c];
        }
    }
    Ok(out)
}

/// Min-max scales the network output to 0..255.
pub fn postprocess(pred: &[f32]) -> Vec<u8> {
    let (mut lo, mut hi) = (f32::MAX, f32::MIN);
    for &v in pred {
        lo = lo.min(v);
        hi = hi.max(v);
    }
    let span = (hi - lo).max(1e-6);
    pred.iter()
        .map(|&v| (((v - lo) / span) * 255.0).round().clamp(0.0, 255.0) as u8)
        .collect()
}

fn environment(app: &tauri::AppHandle) -> Result<&'static ort::environment::Environment, String> {
    let r = ENV.get_or_init(|| {
        let dll = runtime_path(app)
            .ok_or_else(|| "ONNX Runtime is missing from this installation.".to_string())?;
        ort::init_from(&dll)
            .map_err(|e| format!("Could not load ONNX Runtime: {e}"))?
            .with_name("creator-exe")
            .build()
            .map_err(|e| format!("Could not start ONNX Runtime: {e}"))
    });
    r.as_ref().map_err(|e| e.clone())
}

/// Runs the model on 320×320 RGBA pixels (base64) and returns the mask (base64, one byte per pixel).
pub fn run(app: &tauri::AppHandle, data_dir: &Path, rgba_b64: &str) -> Result<String, String> {
    let rgba = base64::engine::general_purpose::STANDARD
        .decode(rgba_b64)
        .map_err(|e| e.to_string())?;
    let input = preprocess(&rgba)?;
    let mp = model_path(data_dir);
    if !mp.exists() {
        return Err("The cutout model hasn't been downloaded yet.".into());
    }
    let env = environment(app)?;
    let mut guard = SESSION
        .lock()
        .map_err(|_| "The cutout engine is busy.".to_string())?;
    if guard.is_none() {
        let session = ort::session::Session::builder(env)
            .map_err(|e| e.to_string())?
            .commit_from_file(&mp)
            .map_err(|e| format!("Could not load the cutout model: {e}"))?;
        *guard = Some(session);
    }
    let session = guard.as_mut().unwrap();
    let tensor = ort::value::Tensor::from_array((vec![1i64, 3, SIZE as i64, SIZE as i64], input))
        .map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![tensor])
        .map_err(|e| format!("The cutout failed: {e}"))?;
    let (_, pred) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    if pred.len() < SIZE * SIZE {
        return Err("The model returned an unexpected result.".into());
    }
    let mask = postprocess(&pred[..SIZE * SIZE]);
    Ok(base64::engine::general_purpose::STANDARD.encode(mask))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preprocess_normalises_and_checks_size() {
        assert!(preprocess(&[0u8; 12]).is_err());
        let px = vec![255u8; SIZE * SIZE * 4];
        let v = preprocess(&px).unwrap();
        assert_eq!(v.len(), SIZE * SIZE * 3);
        assert!((v[0] - (1.0 - 0.485) / 0.229).abs() < 1e-4);
        assert!((v[SIZE * SIZE * 2] - (1.0 - 0.406) / 0.225).abs() < 1e-4);
    }

    #[test]
    fn postprocess_scales_to_bytes() {
        assert_eq!(postprocess(&[0.2, 0.6, 1.0]), vec![0, 128, 255]);
        assert_eq!(postprocess(&[0.5, 0.5]), vec![0, 0]);
    }

    #[test]
    fn checksum_is_hex_sha256() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
