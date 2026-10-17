//! Local-only, opt-in inspection of an original video selected by the creator.
//! This records objective container, video and audio signals, not "editing style"
//! or evidence of jokes. Neither FFprobe nor FFmpeg is invoked via a shell.

use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceRange {
    start: f64,
    end: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaAnalysis {
    path: String,
    file_name: String,
    duration_seconds: f64,
    inspected_seconds: f64,
    width: Option<u64>,
    height: Option<u64>,
    scene_seconds: Vec<f64>,
    silence_ranges: Vec<SilenceRange>,
    notes: Vec<String>,
}

fn after_number(line: &str, key: &str) -> Option<f64> {
    let tail = line.split(key).nth(1)?.trim_start();
    let token = tail.split_whitespace().next()?;
    token.parse::<f64>().ok().filter(|x| x.is_finite() && *x >= 0.0)
}

fn inspect(path: String) -> Result<LocalMediaAnalysis, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err("Choose an original local video file, not a URL or folder.".to_string());
    }
    let probe = Command::new("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", "-i"])
        .arg(p)
        .output()
        .map_err(|_| "FFprobe not found. Install FFmpeg and FFprobe, add them to your Windows PATH, then restart CREATOR.EXE.".to_string())?;
    if !probe.status.success() {
        return Err(format!("FFprobe couldn't inspect this file: {}", String::from_utf8_lossy(&probe.stderr).chars().take(320).collect::<String>()));
    }
    let document: Value = serde_json::from_slice(&probe.stdout).map_err(|_| "FFprobe returned invalid video metadata.".to_string())?;
    let duration = document["format"]["duration"].as_str().and_then(|s| s.parse::<f64>().ok())
        .filter(|x| x.is_finite() && *x > 0.0)
        .ok_or_else(|| "The file does not have a readable positive duration.".to_string())?;
    let video = document["streams"].as_array()
        .and_then(|a| a.iter().find(|s| s["codec_type"].as_str() == Some("video")));
    let (width, height) = match video {
        Some(v) => (v["width"].as_u64(), v["height"].as_u64()),
        None => (None, None),
    };
    if video.is_none() { return Err("No video stream was found in this file.".to_string()); }

    // Limit the sampled portion so large source files do not lock up a machine.
    let inspected = duration.min(90.0);
    let output = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-threads", "2", "-filter_threads", "2", "-v", "info", "-i"])
        .arg(p)
        .args(["-t", &format!("{:.3}", inspected), "-vf", "select='gt(scene,0.36)',showinfo",
            "-af", "silencedetect=noise=-35dB:d=0.45", "-f", "null", "-"])
        .output()
        .map_err(|_| "FFmpeg not found. Install FFmpeg and FFprobe and restart the application.".to_string())?;
    if !output.status.success() {
        return Err(format!("FFmpeg analysis failed: {}", String::from_utf8_lossy(&output.stderr).chars().rev().take(400).collect::<String>().chars().rev().collect::<String>()));
    }
    let log = String::from_utf8_lossy(&output.stderr);
    let mut scenes = Vec::new();
    let mut silences = Vec::new();
    let mut current_start: Option<f64> = None;
    for line in log.lines() {
        if line.contains("Parsed_showinfo") {
            if let Some(t) = after_number(line, "pts_time:") {
                if t <= inspected && scenes.len() < 200 { scenes.push(t); }
            }
        }
        if let Some(t) = after_number(line, "silence_start:") { current_start = Some(t); }
        if let Some(end) = after_number(line, "silence_end:") {
            if let Some(start) = current_start.take() {
                if silences.len() < 200 && end >= start { silences.push(SilenceRange { start, end }); }
            }
        }
    }
    if let Some(start) = current_start {
        if silences.len() < 200 && inspected >= start { silences.push(SilenceRange { start, end: inspected }); }
    }
    scenes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    scenes.dedup_by(|a,b| (*a - *b).abs() < 0.10);
    Ok(LocalMediaAnalysis {
        file_name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "original video".into()),
        path,
        duration_seconds: duration, inspected_seconds: inspected,
        width, height, scene_seconds: scenes, silence_ranges: silences,
        notes: vec![
            "These are estimated scene differences and quiet audio intervals, not verified edit cuts or jokes.".into(),
            "Only the first 90 seconds are inspected; no footage leaves this computer.".into(),
        ],
    })
}

#[tauri::command]
pub async fn inspect_local_video(path: String) -> Result<LocalMediaAnalysis, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(path))
        .await.map_err(|e| format!("The local media worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::after_number;
    #[test]
    fn parses_ffmpeg_timestamps() {
        assert_eq!(after_number("[Parsed_showinfo] pts_time:1.25 fmt:yuv", "pts_time:"), Some(1.25));
        assert_eq!(after_number("[silencedetect] silence_start: 3.5", "silence_start:"), Some(3.5));
        assert_eq!(after_number("missing", "pts_time:"), None);
    }
}
