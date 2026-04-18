use anyhow::{anyhow, Result};
use bytes::Bytes;
use chrono::{Datelike, Utc};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::db::Message;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HuggingFaceGgufFile {
    pub name: String,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HuggingFaceModelSearchResult {
    pub id: String,
    pub downloads: Option<u64>,
    pub likes: Option<u64>,
    pub last_modified: Option<String>,
    pub pipeline_tag: Option<String>,
    pub private: bool,
    pub gated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChunk {
    pub conversation_id: String,
    pub chunk: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaRuntimeStatus {
    pub installed: bool,
    pub running: bool,
    pub local_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub platform: String,
}

#[derive(Debug, Deserialize, Clone)]
struct OpenMeteoLocation {
    name: String,
    country: Option<String>,
    admin1: Option<String>,
    latitude: f64,
    longitude: f64,
    timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoGeocodingResponse {
    results: Option<Vec<OpenMeteoLocation>>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrentWeather {
    time: Option<String>,
    temperature_2m: Option<f64>,
    apparent_temperature: Option<f64>,
    precipitation: Option<f64>,
    rain: Option<f64>,
    showers: Option<f64>,
    snowfall: Option<f64>,
    weather_code: Option<i64>,
    wind_speed_10m: Option<f64>,
    wind_direction_10m: Option<f64>,
    wind_gusts_10m: Option<f64>,
    relative_humidity_2m: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoForecastResponse {
    current: Option<OpenMeteoCurrentWeather>,
    timezone: Option<String>,
    timezone_abbreviation: Option<String>,
}

fn build_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .expect("Failed to build HTTP client")
}

fn resolve_ollama_executable() -> String {
    if let Ok(explicit) = std::env::var("OLLAMA_EXE") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let candidate = Path::new(&local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe");
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            let candidate = Path::new(&program_files).join("Ollama").join("ollama.exe");
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let app_paths = [
            Path::new("/Applications")
                .join("Ollama.app")
                .join("Contents")
                .join("Resources")
                .join("ollama"),
        ];
        for candidate in app_paths {
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            let candidate = Path::new(&home)
                .join("Applications")
                .join("Ollama.app")
                .join("Contents")
                .join("Resources")
                .join("ollama");
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    "ollama".to_string()
}

fn parse_version_token(input: &str) -> Option<String> {
    let trimmed = input.trim();
    let stripped = trimmed
        .trim_start_matches(|c: char| !c.is_ascii_alphanumeric())
        .trim_end_matches(|c: char| !c.is_ascii_alphanumeric());
    let without_v = stripped.trim_start_matches('v');
    let has_dot = without_v.contains('.');
    let valid = without_v
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.');
    if has_dot && valid && !without_v.is_empty() {
        Some(without_v.to_string())
    } else {
        None
    }
}

fn extract_version_text(raw: &str) -> Option<String> {
    raw.split_whitespace().find_map(parse_version_token)
}

fn parse_semver_like(input: &str) -> Option<Vec<u32>> {
    let mut parts = vec![];
    for piece in input.trim().trim_start_matches('v').split('.') {
        let value = piece.parse::<u32>().ok()?;
        parts.push(value);
    }
    if parts.is_empty() { None } else { Some(parts) }
}

fn compare_semver_like(local: &str, latest: &str) -> Option<Ordering> {
    let a = parse_semver_like(local)?;
    let b = parse_semver_like(latest)?;
    let max_len = a.len().max(b.len());
    for idx in 0..max_len {
        let av = *a.get(idx).unwrap_or(&0);
        let bv = *b.get(idx).unwrap_or(&0);
        match av.cmp(&bv) {
            Ordering::Equal => {}
            non_eq => return Some(non_eq),
        }
    }
    Some(Ordering::Equal)
}

async fn get_local_ollama_version() -> Option<String> {
    let candidates = [resolve_ollama_executable(), "ollama".to_string()];
    for exe in candidates {
        let output = match Command::new(&exe)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
        {
            Ok(out) => out,
            Err(_) => continue,
        };
        if !output.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if let Some(version) = extract_version_text(&stdout).or_else(|| extract_version_text(&stderr))
        {
            return Some(version);
        }
    }
    None
}

async fn get_latest_ollama_version() -> Option<String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;
    let resp = client
        .get("https://api.github.com/repos/ollama/ollama/releases/latest")
        .header("User-Agent", "singular-chat")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json = resp.json::<Value>().await.ok()?;
    let tag = json.get("tag_name")?.as_str()?;
    parse_version_token(tag)
}

async fn run_winget_ollama(mode: &str) -> Result<String> {
    let winget_exists = Command::new("winget")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    if !winget_exists {
        return Err(anyhow!("winget is not available on this machine."));
    }

    let mut cmd = Command::new("winget");
    if mode == "upgrade" {
        cmd.args([
            "upgrade",
            "--id",
            "Ollama.Ollama",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--disable-interactivity",
        ]);
    } else {
        cmd.args([
            "install",
            "--id",
            "Ollama.Ollama",
            "-e",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--disable-interactivity",
        ]);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if output.status.success() {
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if out.is_empty() {
            format!("Ollama {} completed via winget.", mode)
        } else {
            out
        })
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let combined = format!("{stdout}\n{err}");
        if mode == "upgrade"
            && (combined.contains("No available upgrade found")
                || combined.contains("No newer package versions are available"))
        {
            return Ok("Ollama is already up to date.".to_string());
        }
        Err(anyhow!(
            "winget {} failed: {}",
            mode,
            if err.is_empty() {
                "unknown error".to_string()
            } else {
                err
            }
        ))
    }
}

async fn launch_windows_installer_fallback(mode: &str) -> Result<String> {
    let client = build_client();
    let response = client
        .get("https://ollama.com/download/OllamaSetup.exe")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "Failed to download Ollama installer: {}",
            response.status()
        ));
    }
    let bytes = response.bytes().await?;
    let installer_dir = std::env::temp_dir().join("singular-chat");
    std::fs::create_dir_all(&installer_dir)?;
    let installer_path = installer_dir.join("OllamaSetup.exe");
    tokio::fs::write(&installer_path, bytes).await?;

    Command::new(&installer_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    Ok(format!(
        "Launched Ollama installer for {}. Complete the installer, then click Refresh.",
        mode
    ))
}

pub async fn get_ollama_runtime_status(base_url: &str) -> OllamaRuntimeStatus {
    let local_version = get_local_ollama_version().await;
    let installed = local_version.is_some();
    let running = if installed {
        ollama_check(base_url).await
    } else {
        false
    };
    let latest_version = get_latest_ollama_version().await;
    let update_available = match (local_version.as_deref(), latest_version.as_deref()) {
        (Some(local), Some(latest)) => compare_semver_like(local, latest)
            .map(|ord| ord == Ordering::Less)
            .unwrap_or(false),
        _ => false,
    };

    OllamaRuntimeStatus {
        installed,
        running,
        local_version,
        latest_version,
        update_available,
        platform: std::env::consts::OS.to_string(),
    }
}

pub async fn install_or_update_ollama() -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        let current = get_local_ollama_version().await;
        let mode = if current.is_some() { "upgrade" } else { "install" };

        match run_winget_ollama(mode).await {
            Ok(msg) => Ok(msg),
            Err(_) => launch_windows_installer_fallback(mode).await,
        }
    }

    #[cfg(target_os = "macos")]
    {
        let current = get_local_ollama_version().await;
        let install_url = "https://ollama.com/download/mac";
        if current.is_some() {
            return Ok(format!(
                "Ollama is already installed. If you want to update it on macOS, use the official installer from {} or run `curl -fsSL https://ollama.com/install.sh | sh` in Terminal.",
                install_url
            ));
        } else {
            return Ok(format!(
                "Ollama is not installed. Download it from {} or run `curl -fsSL https://ollama.com/install.sh | sh` in Terminal, then reopen Singular Chat.",
                install_url
            ));
        }
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Err(anyhow!(
            "In-app Ollama install is not automated on this platform. Install Ollama from https://ollama.com/download, then reopen Singular Chat."
        ))
    }
}

/// Emit a streaming chunk to the frontend
fn emit_chunk(app: &AppHandle, conversation_id: &str, chunk: &str, done: bool) {
    let _ = app.emit(
        "chat-stream",
        StreamChunk {
            conversation_id: conversation_id.to_string(),
            chunk: chunk.to_string(),
            done,
        },
    );
}

fn emit_tool_status(app: &AppHandle, conversation_id: &str, status: &str, active: bool) {
    let _ = app.emit(
        "chat-tool-status",
        serde_json::json!({
            "conversation_id": conversation_id,
            "status": status,
            "active": active,
        }),
    );
}

fn stream_cancelled(app: &AppHandle, conversation_id: &str) -> bool {
    let state = app.state::<crate::AppState>();
    let cancelled = match state.cancel_requests.lock() {
        Ok(cancel_requests) => cancel_requests.contains(conversation_id),
        Err(_) => false,
    };
    cancelled
}

fn emit_local_import_progress(
    app: &AppHandle,
    stage: &str,
    model: &str,
    status: &str,
    completed: Option<u64>,
    total: Option<u64>,
) {
    let _ = app.emit(
        "local-model-import-progress",
        serde_json::json!({
            "stage": stage,
            "model": model,
            "status": status,
            "completed": completed,
            "total": total,
        }),
    );
}

fn normalize_ollama_base_url(input: &str) -> String {
    let trimmed = input.trim();
    let mut base = if trimmed.is_empty() {
        "http://localhost:11434".to_string()
    } else {
        trimmed.to_string()
    };

    if !base.starts_with("http://") && !base.starts_with("https://") {
        base = format!("http://{}", base);
    }

    base = base.trim_end_matches('/').to_string();

    let lower = base.to_ascii_lowercase();
    for suffix in ["/api/v1", "/v1", "/api"] {
        if lower.ends_with(suffix) {
            let len = base.len().saturating_sub(suffix.len());
            base.truncate(len);
            break;
        }
    }

    base.trim_end_matches('/').to_string()
}

fn ollama_api_url(base_url: &str, path: &str) -> String {
    format!("{}/api/{}", normalize_ollama_base_url(base_url), path)
}

fn parse_json_lines<F>(buffer: &mut String, incoming: &str, mut on_json: F) -> Result<()>
where
    F: FnMut(Value) -> Result<()>,
{
    buffer.push_str(incoming);

    while let Some(newline_pos) = buffer.find('\n') {
        let raw_line = buffer[..newline_pos].trim_end_matches('\r').trim().to_string();
        *buffer = buffer[newline_pos + 1..].to_string();

        if raw_line.is_empty() {
            continue;
        }

        let line = raw_line
            .strip_prefix("data:")
            .map(|s| s.trim())
            .unwrap_or(raw_line.as_str());

        if line.is_empty() || line == "[DONE]" {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<Value>(line) {
            on_json(json)?;
        }
    }

    Ok(())
}

// ── Ollama ────────────────────────────────────────────────────────────────────

const OLLAMA_CONTEXT_MESSAGE_LIMIT: usize = 16;
const OLLAMA_CONTEXT_BYTE_LIMIT: usize = 12_000;
const OLLAMA_CONTEXT_MIN_MESSAGES: usize = 6;

fn trim_ollama_history<'a>(messages: &'a [Message]) -> Vec<&'a Message> {
    let mut trimmed = Vec::new();
    let mut byte_budget = 0usize;

    for message in messages.iter().rev() {
        if message.role == "system" {
            continue;
        }

        if trimmed.len() >= OLLAMA_CONTEXT_MESSAGE_LIMIT {
            break;
        }

        let content_bytes = message.content.len();
        let would_exceed_budget =
            byte_budget.saturating_add(content_bytes) > OLLAMA_CONTEXT_BYTE_LIMIT;
        if would_exceed_budget && trimmed.len() >= OLLAMA_CONTEXT_MIN_MESSAGES {
            break;
        }

        byte_budget = byte_budget.saturating_add(content_bytes);
        trimmed.push(message);
    }

    trimmed.reverse();
    trimmed
}

fn build_ollama_messages(messages: &[Message], system_prompt: Option<&str>) -> Vec<Value> {
    let trimmed_history = trim_ollama_history(messages);
    let mut msg_array = Vec::with_capacity(
        trimmed_history.len() + if system_prompt.is_some() { 1 } else { 0 },
    );

    if let Some(sp) = system_prompt {
        if !sp.is_empty() {
            msg_array.push(serde_json::json!({ "role": "system", "content": sp }));
        }
    }

    for m in trimmed_history {
        if m.role != "system" {
            msg_array.push(serde_json::json!({ "role": m.role, "content": m.content }));
        }
    }

    msg_array
}

pub async fn ollama_list_models(base_url: &str) -> Result<Vec<OllamaModel>> {
    let client = build_client();
    let url = ollama_api_url(base_url, "tags");
    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama returned status {}: {}", status, err));
    }
    let json: Value = resp.json().await?;
    let models = json
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("Invalid response from Ollama /api/tags"))?
        .iter()
        .map(|m| OllamaModel {
            name: m["name"].as_str().unwrap_or("").to_string(),
            size: m["size"].as_u64().unwrap_or(0),
            modified_at: m["modified_at"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    Ok(models)
}

pub async fn ollama_check(base_url: &str) -> bool {
    let client = build_client();
    client
        .get(&ollama_api_url(base_url, "tags"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

pub async fn ollama_pull_model(
    app: &AppHandle,
    base_url: &str,
    model_name: &str,
) -> Result<()> {
    let client = build_client();
    let url = ollama_api_url(base_url, "pull");
    let body = serde_json::json!({ "name": model_name, "stream": true });

    let resp = client.post(&url).json(&body).send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama pull failed: {}: {}", status, err));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    while let Some(item) = stream.next().await {
        let chunk: Bytes = item?;
        let text = String::from_utf8_lossy(&chunk);
        parse_json_lines(&mut buffer, &text, |json| {
            let status = json["status"].as_str().unwrap_or("").to_string();
            let completed = json["completed"].as_u64();
            let total = json["total"].as_u64();
            let _ = app.emit(
                "model-pull-progress",
                serde_json::json!({
                    "model": model_name,
                    "status": status,
                    "completed": completed,
                    "total": total,
                }),
            );
            Ok(())
        })?;
    }

    if !buffer.trim().is_empty() {
        parse_json_lines(&mut buffer, "\n", |json| {
            let status = json["status"].as_str().unwrap_or("").to_string();
            let completed = json["completed"].as_u64();
            let total = json["total"].as_u64();
            let _ = app.emit(
                "model-pull-progress",
                serde_json::json!({
                    "model": model_name,
                    "status": status,
                    "completed": completed,
                    "total": total,
                }),
            );
            Ok(())
        })?;
    }

    Ok(())
}

pub async fn ollama_delete_model(base_url: &str, model_name: &str) -> Result<()> {
    let client = build_client();
    let url = ollama_api_url(base_url, "delete");
    let body = serde_json::json!({ "name": model_name });
    let resp = client.delete(&url).json(&body).send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama delete failed: {}: {}", status, err));
    }
    Ok(())
}

pub async fn ollama_create_model_from_gguf(
    app: &AppHandle,
    base_url: &str,
    model_name: &str,
    gguf_path: &str,
) -> Result<()> {
    let normalized_path = gguf_path.replace('\\', "/");
    if normalized_path.trim().is_empty() {
        return Err(anyhow!("GGUF path is required"));
    }

    emit_local_import_progress(
        app,
        "import",
        model_name,
        "Preparing Modelfile",
        None,
        None,
    );

    let temp_name = format!(
        "singular-chat-modelfile-{}-{}.txt",
        model_name.replace(':', "_"),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let modelfile_path = std::env::temp_dir().join(temp_name);
    tokio::fs::write(&modelfile_path, format!("FROM {}\n", normalized_path)).await?;

    emit_local_import_progress(
        app,
        "import",
        model_name,
        "Running `ollama create`",
        None,
        None,
    );

    let mut cmd = Command::new(resolve_ollama_executable());
    cmd.arg("create")
        .arg(model_name)
        .arg("-f")
        .arg(&modelfile_path)
        .env("OLLAMA_HOST", normalize_ollama_base_url(base_url))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd.output().await?;
    let _ = tokio::fs::remove_file(&modelfile_path).await;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(anyhow!("Ollama create failed: {}", detail));
    }

    emit_local_import_progress(
        app,
        "import",
        model_name,
        "Import complete",
        None,
        None,
    );
    Ok(())
}

pub async fn huggingface_list_gguf_files(
    repo_id: &str,
    token: Option<&str>,
) -> Result<Vec<HuggingFaceGgufFile>> {
    let clean_repo = repo_id.trim().trim_matches('/');
    if clean_repo.is_empty() || clean_repo.split('/').count() < 2 {
        return Err(anyhow!(
            "Invalid Hugging Face repository id. Use owner/repository."
        ));
    }

    let client = build_client();
    let url = format!("https://huggingface.co/api/models/{}", clean_repo);
    let mut request = client.get(url);
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        request = request.bearer_auth(t);
    }

    let resp = request.send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(anyhow!(
                "Repository '{}' is not available. It may be private, gated, removed, or misspelled.",
                clean_repo
            ));
        }
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(anyhow!(
                "Repository '{}' requires access. Add a valid Hugging Face token and try again.",
                clean_repo
            ));
        }
        return Err(anyhow!(
            "Hugging Face model lookup failed ({}): {}",
            status,
            err
        ));
    }

    let json: Value = resp.json().await?;
    let siblings = json
        .get("siblings")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("Invalid Hugging Face model metadata response"))?;

    let mut files = Vec::<HuggingFaceGgufFile>::new();
    for file in siblings {
        let name = file
            .get("rfilename")
            .and_then(Value::as_str)
            .or_else(|| file.get("path").and_then(Value::as_str));
        if let Some(name) = name {
            if name.to_ascii_lowercase().ends_with(".gguf") {
                files.push(HuggingFaceGgufFile {
                    name: name.to_string(),
                    size: file.get("size").and_then(Value::as_u64),
                });
            }
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));

    if files.is_empty() {
        return Err(anyhow!(
            "No GGUF files were found in Hugging Face repo '{}'",
            clean_repo
        ));
    }

    Ok(files)
}

pub async fn huggingface_search_models(
    query: &str,
    token: Option<&str>,
    limit: usize,
) -> Result<Vec<HuggingFaceModelSearchResult>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let clamped_limit = limit.clamp(1, 100);
    let mut url = reqwest::Url::parse("https://huggingface.co/api/models")?;
    url.query_pairs_mut()
        .append_pair("search", trimmed)
        .append_pair("filter", "gguf")
        .append_pair("limit", &clamped_limit.to_string());

    let client = build_client();
    let mut request = client.get(url);
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        request = request.bearer_auth(t);
    }

    let resp = request.send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(anyhow!(
            "Hugging Face model search failed ({}): {}",
            status,
            err
        ));
    }

    let json: Value = resp.json().await?;
    let models = json
        .as_array()
        .ok_or_else(|| anyhow!("Invalid Hugging Face model search response"))?;

    let mut out = Vec::with_capacity(models.len());
    for m in models {
        let id = m
            .get("id")
            .or_else(|| m.get("modelId"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }

        let gated = match m.get("gated") {
            Some(Value::Bool(v)) => *v,
            Some(Value::String(s)) => {
                let lower = s.to_ascii_lowercase();
                !lower.is_empty() && lower != "false" && lower != "none"
            }
            _ => false,
        };

        out.push(HuggingFaceModelSearchResult {
            id,
            downloads: m.get("downloads").and_then(Value::as_u64),
            likes: m.get("likes").and_then(Value::as_u64),
            last_modified: m
                .get("lastModified")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            pipeline_tag: m
                .get("pipeline_tag")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            private: m.get("private").and_then(Value::as_bool).unwrap_or(false),
            gated,
        });
    }

    Ok(out)
}

pub async fn huggingface_download_gguf(
    app: &AppHandle,
    repo_id: &str,
    file_name: &str,
    destination: &Path,
    revision: Option<&str>,
    token: Option<&str>,
    model_name: &str,
) -> Result<()> {
    let clean_repo = repo_id.trim().trim_matches('/');
    let clean_file = file_name.trim().trim_start_matches('/');
    if clean_repo.is_empty() || clean_file.is_empty() {
        return Err(anyhow!("Hugging Face repository and file name are required"));
    }

    let rev = revision
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("main");

    let mut url = reqwest::Url::parse("https://huggingface.co")?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| anyhow!("Failed to build Hugging Face download URL"))?;
        segments.pop_if_empty();
        for seg in clean_repo.split('/') {
            segments.push(seg);
        }
        segments.push("resolve");
        segments.push(rev);
        for seg in clean_file.split('/') {
            segments.push(seg);
        }
    }
    url.query_pairs_mut().append_pair("download", "true");

    let client = build_client();
    let mut request = client.get(url);
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        request = request.bearer_auth(t);
    }

    emit_local_import_progress(
        app,
        "download",
        model_name,
        "Starting Hugging Face download",
        Some(0),
        None,
    );

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_default();
        return Err(anyhow!(
            "Hugging Face download failed ({}): {}",
            status,
            err
        ));
    }

    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let total = response.content_length();
    let mut completed = 0u64;
    let mut file = File::create(destination).await?;
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item?;
        file.write_all(&chunk).await?;
        completed = completed.saturating_add(chunk.len() as u64);
        emit_local_import_progress(
            app,
            "download",
            model_name,
            "Downloading GGUF from Hugging Face",
            Some(completed),
            total,
        );
    }
    file.flush().await?;

    emit_local_import_progress(
        app,
        "download",
        model_name,
        "Download complete",
        Some(completed),
        total,
    );
    Ok(())
}

pub async fn ollama_chat_stream(
    app: &AppHandle,
    base_url: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
) -> Result<String> {
    let client = build_client();
    let url = ollama_api_url(base_url, "chat");
    let msg_array = build_ollama_messages(messages, system_prompt);

    let body = serde_json::json!({
        "model": model,
        "messages": msg_array,
        "stream": true
    });

    let resp = client.post(&url).json(&body).send().await?;
    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama error: {}", err_text));
    }

    let mut full_response = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut emitted_done = false;
    let mut response_model_emitted = false;

    while let Some(item) = stream.next().await {
        if stream_cancelled(app, conversation_id) {
            if !emitted_done {
                emit_chunk(app, conversation_id, "", true);
            }
            return Ok(full_response);
        }
        let chunk: Bytes = item?;
        let text = String::from_utf8_lossy(&chunk);
        parse_json_lines(&mut buffer, &text, |json| {
            if !response_model_emitted {
                if let Some(response_model) = json["model"].as_str() {
                    let _ = app.emit(
                        "chat-model-debug",
                        serde_json::json!({
                            "conversation_id": conversation_id,
                            "phase": "response",
                            "response_model": response_model,
                        }),
                    );
                    response_model_emitted = true;
                }
            }
            let done = json["done"].as_bool().unwrap_or(false);
            if let Some(content) = json["message"]["content"].as_str() {
                if !content.is_empty() {
                    full_response.push_str(content);
                    emit_chunk(app, conversation_id, content, false);
                }
            }
            if done && !emitted_done {
                emit_chunk(app, conversation_id, "", true);
                emitted_done = true;
            }
            Ok(())
        })?;
    }

    if !emitted_done {
        emit_chunk(app, conversation_id, "", true);
    }
    Ok(full_response)
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

pub async fn openai_chat_stream(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
    base_url: Option<&str>,
    tools_enabled: bool,
) -> Result<(String, bool)> {
    let client = build_client();
    let provider_label = match base_url {
        Some(url) if url.contains("api.x.ai") => "xAI",
        Some(url) if url.contains("api.groq.com") => "Groq",
        _ => "OpenAI",
    };
    let url = format!(
        "{}/v1/chat/completions",
        base_url.unwrap_or("https://api.openai.com")
    );

    if tools_enabled && should_enable_web_tools(messages) {
        if let Ok(tool_result) = openai_chat_with_tools(
            app,
            &client,
            provider_label,
            &url,
            api_key,
            model,
            messages,
            system_prompt,
            conversation_id,
            true,
        )
        .await
        {
            return Ok(tool_result);
        }
    }

    let msg_array = build_openai_messages(messages, system_prompt);
    let body = serde_json::json!({
        "model": model,
        "messages": msg_array,
        "stream": true
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("{} error: {}", provider_label, err_text));
    }

    let response = parse_openai_sse_stream(app, resp, conversation_id).await?;
    Ok((response, false))
}

fn build_openai_messages(messages: &[Message], system_prompt: Option<&str>) -> Vec<Value> {
    let mut msg_array: Vec<Value> = vec![];
    if let Some(sp) = system_prompt {
        if !sp.is_empty() {
            msg_array.push(serde_json::json!({ "role": "system", "content": sp }));
        }
    }
    for m in messages {
        if m.role != "system" {
            msg_array.push(serde_json::json!({ "role": m.role, "content": m.content }));
        }
    }
    msg_array
}

fn last_user_message_lower(messages: &[Message]) -> String {
    messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.to_ascii_lowercase())
        .unwrap_or_default()
}

fn normalize_for_intent_match(input: &str) -> String {
    input
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_generic_web_search_command(input: &str) -> bool {
    let normalized = normalize_for_intent_match(input);
    matches!(
        normalized.as_str(),
        "search the web"
            | "search web"
            | "web search"
            | "search online"
            | "look it up"
            | "look this up"
            | "browse the web"
            | "browse web"
            | "can you search the web"
            | "please search the web"
    )
}

fn effective_web_query(messages: &[Message]) -> String {
    let last = last_user_message_lower(messages);
    if last.is_empty() || !is_generic_web_search_command(&last) {
        return last;
    }

    for message in messages.iter().rev().skip(1) {
        if message.role != "user" {
            continue;
        }
        let candidate = message.content.trim().to_ascii_lowercase();
        if candidate.is_empty() || is_generic_web_search_command(&candidate) {
            continue;
        }
        return candidate;
    }

    last
}

fn contains_whole_word(input: &str, needle: &str) -> bool {
    input
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|token| token == needle)
}

fn contains_any_whole_word(input: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| contains_whole_word(input, needle))
}

fn contains_model_identity_hint(input: &str) -> bool {
    let model_identity_hints = [
        "which model are you",
        "what model are you",
        "what model is this",
        "what provider are you",
        "which provider are you",
        "who are you",
        "what are you",
        "model id",
        "model name",
        "running model",
        "runtime model",
    ];
    model_identity_hints.iter().any(|h| input.contains(h))
}

fn contains_weather_intent(input: &str) -> bool {
    let normalized = normalize_for_intent_match(input);
    normalized.contains("current conditions")
        || contains_any_whole_word(
            &normalized,
            &[
                "weather",
                "forecast",
                "temperature",
                "rain",
                "snow",
                "wind",
                "storm",
                "humidity",
                "precipitation",
                "sunny",
                "cloudy",
                "showers",
                "drizzle",
            ],
        )
}

fn strip_prefixes_once(mut input: String, prefixes: &[&str]) -> String {
    loop {
        let mut changed = false;
        for prefix in prefixes {
            if let Some(rest) = input.strip_prefix(prefix) {
                input = rest.trim_start().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }
    input
}

fn strip_suffixes_once(mut input: String, suffixes: &[&str]) -> String {
    loop {
        let mut changed = false;
        for suffix in suffixes {
            if let Some(rest) = input.strip_suffix(suffix) {
                input = rest.trim_end().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }
    input
}

fn extract_weather_location_query(input: &str) -> Option<String> {
    let mut query = normalize_for_intent_match(input);
    query = query
        .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ':' | ';' | '-' | '"'))
        .to_string();
    query = strip_prefixes_once(
        query,
        &[
            "tell me ",
            "please ",
            "can you ",
            "could you ",
            "what is ",
            "what's ",
            "whats ",
            "how is ",
            "how's ",
            "hows ",
        ],
    );
    query = strip_prefixes_once(
        query,
        &[
            "the weather in ",
            "weather in ",
            "the weather for ",
            "weather for ",
            "the weather like in ",
            "weather like in ",
            "the forecast in ",
            "forecast in ",
            "the forecast for ",
            "forecast for ",
            "the temperature in ",
            "current weather in ",
            "current conditions in ",
            "weather at ",
            "weather near ",
            "temperature in ",
            "will it rain in ",
            "will it snow in ",
            "is it raining in ",
            "is it snowing in ",
            "how hot is it in ",
            "how cold is it in ",
            "what's it like in ",
            "whats it like in ",
            "what is it like in ",
            "how is the weather in ",
            "how's the weather in ",
            "hows the weather in ",
            "how is the weather like in ",
            "how's the weather like in ",
            "hows the weather like in ",
        ],
    );
    query = query
        .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ':' | ';' | '-' | '"'))
        .to_string();
    query = strip_suffixes_once(
        query,
        &[
            " right now",
            " currently",
            " now",
            " today",
            " tonight",
            " tomorrow",
            " this morning",
            " this afternoon",
            " this evening",
            " this week",
            " please",
            " for me",
        ],
    );
    query = query
        .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ':' | ';' | '-' | '"'))
        .trim()
        .to_string();
    let is_only_weather_word = matches!(
        query.as_str(),
        "weather" | "forecast" | "temperature" | "conditions"
    );
    if query.is_empty() || is_only_weather_word {
        None
    } else {
        Some(query)
    }
}

fn contains_recency_hint(input: &str) -> bool {
    let recency_hints = [
        "latest",
        "today",
        "as of",
        "recent",
        "up to date",
        "up-to-date",
        "newest",
        "right now",
        "breaking",
    ];
    recency_hints.iter().any(|h| input.contains(h))
}

fn contains_current_events_topic(input: &str) -> bool {
    let topic_hints = [
        "war",
        "conflict",
        "ceasefire",
        "invasion",
        "missile",
        "strike",
        "attack",
        "military",
        "sanctions",
        "iran",
        "israel",
        "gaza",
        "ukraine",
        "russia",
        "president",
        "election",
        "prime minister",
        "breaking news",
    ];
    topic_hints.iter().any(|h| input.contains(h))
}

fn should_enable_web_tools(messages: &[Message]) -> bool {
    let last_user = effective_web_query(messages);
    if last_user.is_empty() {
        return false;
    }

    if contains_model_identity_hint(&last_user) {
        return false;
    }

    if last_user.contains("don't search web")
        || last_user.contains("do not search web")
        || last_user.contains("no web search")
    {
        return false;
    }

    let has_url = last_user.contains("http://") || last_user.contains("https://");
    if has_url {
        return true;
    }

    let strong_web_hints = [
        "search the web",
        "search web",
        "web search",
        "look up",
        "browse",
        "online source",
        "sources",
        "cite",
        "verify",
        "news",
        "what happened",
        "link",
        "url",
        "latest price",
        "stock price",
    ];
    if strong_web_hints.iter().any(|h| last_user.contains(h)) {
        return true;
    }

    if contains_recency_hint(&last_user) {
        return true;
    }

    contains_current_events_topic(&last_user)
}

pub fn should_enable_web_tools_for_messages(messages: &[Message]) -> bool {
    should_enable_web_tools(messages)
}

pub async fn build_web_context_for_messages(messages: &[Message]) -> Result<Option<String>> {
    let query = effective_web_query(messages);
    if query.trim().is_empty() {
        return Ok(None);
    }

    let search_json = web_search_tool(&query, 5).await?;
    let parsed: Value = serde_json::from_str(&search_json).unwrap_or_else(|_| serde_json::json!({}));
    let Some(results) = parsed.get("results").and_then(Value::as_array) else {
        return Ok(None);
    };
    if results.is_empty() {
        return Ok(None);
    }

    let mut lines = vec![format!(
        "Web snapshot date (UTC): {}",
        Utc::now().format("%Y-%m-%d")
    )];
    for item in results.iter().take(5) {
        let title = item
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled result")
            .trim();
        let url = item.get("url").and_then(Value::as_str).unwrap_or("").trim();
        let published_at = item
            .get("published_at")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let snippet = item
            .get("snippet")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        lines.push(match (url.is_empty(), published_at.is_empty()) {
            (true, true) => format!("- {} | {}", title, snippet),
            (true, false) => format!("- {} | {} | {}", title, published_at, snippet),
            (false, true) => format!("- {} | {} | {}", title, url, snippet),
            (false, false) => format!("- {} | {} | {} | {}", title, url, published_at, snippet),
        });
    }

    Ok(Some(lines.join("\n")))
}

async fn geocode_weather_location(query: &str) -> Result<Option<OpenMeteoLocation>> {
    let mut url = reqwest::Url::parse("https://geocoding-api.open-meteo.com/v1/search")?;
    url.query_pairs_mut()
        .append_pair("name", query)
        .append_pair("count", "5")
        .append_pair("language", "en");

    let client = build_client();
    let response = client
        .get(url)
        .header("User-Agent", "singular-chat")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "weather geocoding failed ({}): {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }

    let payload = response.json::<OpenMeteoGeocodingResponse>().await?;
    Ok(payload.results.and_then(|mut results| results.drain(..).next()))
}

async fn fetch_weather_for_location(
    location: &OpenMeteoLocation,
) -> Result<Option<OpenMeteoForecastResponse>> {
    let timezone = location.timezone.as_deref().unwrap_or("auto");
    let mut url = reqwest::Url::parse("https://api.open-meteo.com/v1/forecast")?;
    url.query_pairs_mut()
        .append_pair("latitude", &location.latitude.to_string())
        .append_pair("longitude", &location.longitude.to_string())
        .append_pair("current", "temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,is_day")
        .append_pair("temperature_unit", "fahrenheit")
        .append_pair("wind_speed_unit", "mph")
        .append_pair("precipitation_unit", "inch")
        .append_pair("timezone", timezone);

    let client = build_client();
    let response = client
        .get(url)
        .header("User-Agent", "singular-chat")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "weather lookup failed ({}): {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }

    let payload = response.json::<OpenMeteoForecastResponse>().await?;
    Ok(Some(payload))
}

fn format_weather_location_label(location: &OpenMeteoLocation) -> String {
    let mut parts = vec![location.name.trim().to_string()];
    if let Some(admin1) = location.admin1.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if !parts.iter().any(|part| part.eq_ignore_ascii_case(admin1)) {
            parts.push(admin1.to_string());
        }
    }
    if let Some(country) = location.country.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if !parts.iter().any(|part| part.eq_ignore_ascii_case(country)) && parts.len() < 2 {
            parts.push(country.to_string());
        }
    }
    parts.join(", ")
}

fn weather_code_label(code: i64) -> &'static str {
    match code {
        0 => "clear sky",
        1 => "mostly clear",
        2 => "partly cloudy",
        3 => "overcast",
        45 | 48 => "fog",
        51 | 53 | 55 => "drizzle",
        56 | 57 => "freezing drizzle",
        61 | 63 | 65 => "rain",
        66 | 67 => "freezing rain",
        71 | 73 | 75 => "snow",
        77 => "snow grains",
        80 | 81 | 82 => "showers",
        85 | 86 => "snow showers",
        95 => "thunderstorm",
        96 | 99 => "thunderstorm with hail",
        _ => "unclassified conditions",
    }
}

fn wind_direction_to_cardinal(degrees: f64) -> &'static str {
    let wrapped = degrees.rem_euclid(360.0);
    match wrapped {
        d if d < 22.5 => "N",
        d if d < 67.5 => "NE",
        d if d < 112.5 => "E",
        d if d < 157.5 => "SE",
        d if d < 202.5 => "S",
        d if d < 247.5 => "SW",
        d if d < 292.5 => "W",
        d if d < 337.5 => "NW",
        _ => "N",
    }
}

fn format_weather_response(
    location: &OpenMeteoLocation,
    current: &OpenMeteoCurrentWeather,
    timezone: Option<&str>,
) -> String {
    let location_label = format_weather_location_label(location);
    let mut lines = Vec::new();
    let condition = current
        .weather_code
        .map(weather_code_label)
        .unwrap_or("current conditions unavailable");
    let temperature = current
        .temperature_2m
        .map(|value| format!("{value:.0}°F"))
        .unwrap_or_else(|| "temperature unavailable".to_string());
    let feels_like = current
        .apparent_temperature
        .map(|value| format!("{value:.0}°F"))
        .unwrap_or_else(|| "feels-like unavailable".to_string());
    lines.push(format!(
        "Current weather for {}: {}, feels like {}, {}.",
        location_label, temperature, feels_like, condition
    ));

    let mut details = Vec::new();
    if let Some(wind_speed) = current.wind_speed_10m {
        let wind_direction = current
            .wind_direction_10m
            .map(wind_direction_to_cardinal)
            .unwrap_or("");
        let gusts = current
            .wind_gusts_10m
            .map(|value| format!("; gusts up to {value:.0} mph"))
            .unwrap_or_default();
        if wind_direction.is_empty() {
            details.push(format!("Wind {wind_speed:.0} mph{gusts}"));
        } else {
            details.push(format!("Wind {wind_speed:.0} mph {wind_direction}{gusts}"));
        }
    }
    if let Some(humidity) = current.relative_humidity_2m {
        details.push(format!("Humidity {humidity:.0}%"));
    }
    if let Some(precipitation) = current.precipitation {
        details.push(format!("Precipitation {precipitation:.2} in"));
    }
    if let Some(rain) = current.rain {
        if rain > 0.0 {
            details.push(format!("Rain {rain:.2} in"));
        }
    }
    if let Some(showers) = current.showers {
        if showers > 0.0 {
            details.push(format!("Showers {showers:.2} in"));
        }
    }
    if let Some(snowfall) = current.snowfall {
        if snowfall > 0.0 {
            details.push(format!("Snowfall {snowfall:.2} in"));
        }
    }
    if !details.is_empty() {
        lines.push(details.join("; "));
    }

    if let Some(time) = current.time.as_deref() {
        let timezone_text = timezone.unwrap_or("local time");
        lines.push(format!("Updated: {} ({})", time, timezone_text));
    }

    lines.join(" ")
}

pub async fn build_weather_response_for_messages(messages: &[Message]) -> Result<Option<String>> {
    let last_user = last_user_message_lower(messages);
    if last_user.trim().is_empty() || !contains_weather_intent(&last_user) {
        return Ok(None);
    }

    let Some(location_query) = extract_weather_location_query(&last_user) else {
        return Ok(Some(
            "I need a city, state, or ZIP code to check the weather. Try: What is the weather in Charleston, SC right now?".to_string(),
        ));
    };

    let Some(location) = geocode_weather_location(&location_query).await? else {
        return Ok(Some(format!(
            "I couldn't resolve \"{}\" to a location for weather lookup. Please give me a city, state, or ZIP code.",
            location_query
        )));
    };

    let Some(weather) = fetch_weather_for_location(&location).await? else {
        return Ok(Some(format!(
            "I found {}, but the weather service returned no current conditions. Please try again in a moment.",
            format_weather_location_label(&location)
        )));
    };

    let Some(current) = weather.current.as_ref() else {
        return Ok(Some(format!(
            "I found {}, but the weather service did not return current conditions. Please try again in a moment.",
            format_weather_location_label(&location)
        )));
    };

    Ok(Some(format_weather_response(
        &location,
        current,
        weather
            .timezone_abbreviation
            .as_deref()
            .or(weather.timezone.as_deref()),
    )))
}

fn strip_cdata(input: &str) -> String {
    let trimmed = input.trim();
    if let Some(inner) = trimmed
        .strip_prefix("<![CDATA[")
        .and_then(|s| s.strip_suffix("]]>"))
    {
        inner.trim().to_string()
    } else {
        trimmed.to_string()
    }
}

fn extract_xml_tag(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = block.find(&open)?;
    let value_start = start + open.len();
    let rest = &block[value_start..];
    let end = rest.find(&close)?;
    Some(rest[..end].to_string())
}

fn parse_google_news_rss_results(body: &str, max_results: usize) -> Vec<Value> {
    let mut out = Vec::new();
    let mut cursor = 0usize;

    while out.len() < max_results {
        let Some(item_start_rel) = body[cursor..].find("<item>") else {
            break;
        };
        let item_start = cursor + item_start_rel + "<item>".len();
        let Some(item_end_rel) = body[item_start..].find("</item>") else {
            break;
        };
        let item_end = item_start + item_end_rel;
        let item = &body[item_start..item_end];

        let title = extract_xml_tag(item, "title")
            .map(|v| decode_basic_html_entities(&strip_html_tags(&strip_cdata(&v))))
            .unwrap_or_default();
        let url = extract_xml_tag(item, "link")
            .map(|v| decode_basic_html_entities(&strip_cdata(&v)))
            .unwrap_or_default();
        let snippet = extract_xml_tag(item, "description")
            .map(|v| decode_basic_html_entities(&strip_html_tags(&strip_cdata(&v))))
            .unwrap_or_default();
        let published_at = extract_xml_tag(item, "pubDate")
            .map(|v| decode_basic_html_entities(&strip_cdata(&v)))
            .unwrap_or_default();

        if !title.trim().is_empty() && !url.trim().is_empty() {
            out.push(serde_json::json!({
                "title": title.trim(),
                "url": url.trim(),
                "snippet": snippet.trim(),
                "published_at": published_at.trim(),
            }));
        }

        cursor = item_end + "</item>".len();
    }

    out
}

async fn web_search_news_rss(query: &str, max_results: usize) -> Result<Vec<Value>> {
    let mut url = reqwest::Url::parse("https://news.google.com/rss/search")?;
    let q = format!("{} when:7d", query.trim());
    url.query_pairs_mut()
        .append_pair("q", &q)
        .append_pair("hl", "en-US")
        .append_pair("gl", "US")
        .append_pair("ceid", "US:en");

    let client = build_client();
    let resp = client
        .get(url)
        .header("User-Agent", "singular-chat")
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let body = resp.text().await?;
    Ok(parse_google_news_rss_results(&body, max_results))
}

fn enrich_web_query_for_freshness(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed.to_ascii_lowercase();
    let has_url = lower.contains("http://") || lower.contains("https://");
    if has_url {
        return trimmed.to_string();
    }

    let current_year = Utc::now().year();
    let mut has_stale_year = false;
    for token in lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
    {
        if token.len() == 4 && token.starts_with("20") && token.chars().all(|c| c.is_ascii_digit())
        {
            if let Ok(year) = token.parse::<i32>() {
                if year < current_year {
                    has_stale_year = true;
                    break;
                }
            }
        }
    }

    if contains_current_events_topic(&lower) {
        if contains_recency_hint(&lower) && !has_stale_year {
            return trimmed.to_string();
        }
        let base = trimmed
            .split_whitespace()
            .filter(|token| {
                let t = token.trim_matches(|c: char| !c.is_ascii_alphanumeric());
                !(t.len() == 4 && t.starts_with("20") && t.chars().all(|c| c.is_ascii_digit()))
            })
            .collect::<Vec<_>>()
            .join(" ");
        return format!(
            "{} latest updates as of {}",
            if base.trim().is_empty() { trimmed } else { base.trim() },
            Utc::now().format("%Y-%m-%d")
        );
    }

    if contains_recency_hint(&lower) {
        return trimmed.to_string();
    }

    trimmed.to_string()
}

fn derive_broadened_web_query(query: &str) -> String {
    let stop_words = [
        "latest", "current", "today", "right", "now", "update", "updates", "news", "as", "of",
        "in", "on", "for", "the", "and", "april", "may", "june", "july", "august", "september",
        "october", "november", "december", "january", "february", "march",
    ];
    let mut tokens = vec![];
    for raw in query
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
    {
        let token = raw.to_ascii_lowercase();
        if token.len() <= 2 {
            continue;
        }
        if token.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if stop_words.contains(&token.as_str()) {
            continue;
        }
        tokens.push(token);
    }
    if tokens.is_empty() {
        return query.trim().to_string();
    }
    let core = tokens.into_iter().take(6).collect::<Vec<_>>().join(" ");
    format!("{} latest news", core).trim().to_string()
}

fn content_to_text(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(items) = content.as_array() {
        let mut out = String::new();
        for item in items {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }
        }
        return out;
    }
    String::new()
}

fn emit_text_as_chunks(app: &AppHandle, conversation_id: &str, text: &str) {
    if text.is_empty() {
        return;
    }
    let mut current = String::new();
    let mut count = 0usize;
    for ch in text.chars() {
        current.push(ch);
        count += 1;
        if count >= 80 {
            emit_chunk(app, conversation_id, &current, false);
            current.clear();
            count = 0;
        }
    }
    if !current.is_empty() {
        emit_chunk(app, conversation_id, &current, false);
    }
}

fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    collapse_whitespace(&out)
}

fn decode_basic_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn extract_attr_value(tag_html: &str, attr: &str) -> Option<String> {
    let pattern = format!(r#"{attr}=""#);
    let start = tag_html.find(&pattern)?;
    let value_start = start + pattern.len();
    let rest = &tag_html[value_start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn normalize_duckduckgo_result_url(raw_href: &str) -> String {
    let href_decoded = decode_basic_html_entities(raw_href);
    let trimmed = href_decoded.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let absolute = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.starts_with('/') {
        format!("https://duckduckgo.com{}", trimmed)
    } else {
        return trimmed.to_string();
    };

    if let Ok(parsed) = reqwest::Url::parse(&absolute) {
        if parsed.host_str().unwrap_or_default().contains("duckduckgo.com")
            && parsed.path().starts_with("/l/")
        {
            if let Some((_, target)) = parsed.query_pairs().find(|(k, _)| k == "uddg") {
                return target.to_string();
            }
        }
    }

    absolute
}

async fn web_search_html_fallback(query: &str, max_results: usize) -> Result<Vec<Value>> {
    let mut url = reqwest::Url::parse("https://html.duckduckgo.com/html/")?;
    url.query_pairs_mut().append_pair("q", query);

    let client = build_client();
    let resp = client
        .get(url)
        .header("User-Agent", "singular-chat")
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let body = resp.text().await?;
    Ok(parse_duckduckgo_html_results(&body, max_results))
}

fn parse_duckduckgo_html_results(body: &str, max_results: usize) -> Vec<Value> {
    let mut out = Vec::<Value>::new();
    let mut cursor = 0usize;

    while out.len() < max_results {
        let Some(rel_idx) = body[cursor..].find("result__a") else {
            break;
        };
        let match_idx = cursor + rel_idx;
        let Some(anchor_start) = body[..match_idx].rfind("<a ") else {
            cursor = match_idx + 8;
            continue;
        };
        let Some(anchor_close_rel) = body[match_idx..].find("</a>") else {
            break;
        };
        let anchor_end = match_idx + anchor_close_rel + 4;
        let anchor_html = &body[anchor_start..anchor_end];

        let href = extract_attr_value(anchor_html, "href")
            .map(|raw| normalize_duckduckgo_result_url(&raw))
            .unwrap_or_default();
        let title_html = anchor_html
            .split_once('>')
            .map(|(_, right)| right.trim_end_matches("</a>"))
            .unwrap_or("")
            .trim();
        let title = decode_basic_html_entities(&strip_html_tags(title_html));

        let mut snippet = String::new();
        if let Some(snippet_rel_idx) = body[anchor_end..].find("result__snippet") {
            let snippet_marker_idx = anchor_end + snippet_rel_idx;
            if let Some(snippet_tag_start) = body[..snippet_marker_idx].rfind('<') {
                if let Some(snippet_tag_end_rel) = body[snippet_tag_start..].find('>') {
                    let content_start = snippet_tag_start + snippet_tag_end_rel + 1;
                    if let Some(content_end_rel) = body[content_start..].find("</") {
                        let snippet_html = &body[content_start..content_start + content_end_rel];
                        snippet = decode_basic_html_entities(&strip_html_tags(snippet_html));
                    }
                }
            }
        }

        if !href.is_empty() && !title.is_empty() {
            out.push(serde_json::json!({
                "title": title,
                "url": href,
                "snippet": snippet
            }));
        }

        cursor = anchor_end;
    }

    out
}

async fn web_search_tool(query: &str, max_results: usize) -> Result<String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(serde_json::json!({
            "query": query,
            "results": [],
            "error": "query is required"
        })
        .to_string());
    }
    let resolved_query = enrich_web_query_for_freshness(query);
    let broadened_query = derive_broadened_web_query(query);

    let mut attempted_queries: Vec<String> = vec![resolved_query.clone()];
    if !query.eq_ignore_ascii_case(&resolved_query) {
        attempted_queries.push(query.to_string());
    }
    if !broadened_query.is_empty()
        && !attempted_queries
            .iter()
            .any(|q| q.eq_ignore_ascii_case(&broadened_query))
    {
        attempted_queries.push(broadened_query);
    }

    let mut final_results: Vec<Value> = vec![];
    let mut final_errors: Vec<String> = vec![];
    let mut chosen_query = resolved_query.clone();
    let mut source = "duckduckgo".to_string();
    let query_lower = query.to_ascii_lowercase();
    let likely_current_events =
        contains_current_events_topic(&query_lower) || contains_recency_hint(&query_lower);

    if likely_current_events {
        for candidate in &attempted_queries {
            match web_search_news_rss(candidate, max_results).await {
                Ok(news_results) if !news_results.is_empty() => {
                    final_results = news_results;
                    chosen_query = candidate.to_string();
                    source = "google_news_rss".to_string();
                    final_errors.clear();
                    break;
                }
                Ok(_) => final_errors.push(format!("{} => google news rss returned no results", candidate)),
                Err(e) => final_errors.push(format!("{} => google news rss failed: {}", candidate, e)),
            }
        }
    }

    for candidate in &attempted_queries {
        if !final_results.is_empty() {
            break;
        }
        let mut url = reqwest::Url::parse("https://api.duckduckgo.com/")?;
        url.query_pairs_mut()
            .append_pair("q", candidate)
            .append_pair("format", "json")
            .append_pair("no_html", "1")
            .append_pair("skip_disambig", "1");

        let client = build_client();
        let resp = client
            .get(url)
            .header("User-Agent", "singular-chat")
            .send()
            .await?;
        let mut results: Vec<Value> = vec![];
        let mut errors: Vec<String> = vec![];

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            errors.push(format!("instant answer search failed ({}): {}", status, err));
        } else {
            let payload = resp.text().await.unwrap_or_default();
            if let Ok(json) = serde_json::from_str::<Value>(&payload) {
                let abstract_text = json
                    .get("AbstractText")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                let abstract_url = json
                    .get("AbstractURL")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if !abstract_text.is_empty() {
                    results.push(serde_json::json!({
                        "title": json.get("Heading").and_then(Value::as_str).unwrap_or("Overview"),
                        "url": abstract_url,
                        "snippet": abstract_text
                    }));
                }

                fn collect_related_topics(input: &Value, out: &mut Vec<Value>, remaining: usize) {
                    if remaining == 0 {
                        return;
                    }
                    let Some(arr) = input.as_array() else {
                        return;
                    };
                    for item in arr {
                        if out.len() >= remaining {
                            break;
                        }
                        if let (Some(text), Some(url)) = (
                            item.get("Text").and_then(Value::as_str),
                            item.get("FirstURL").and_then(Value::as_str),
                        ) {
                            out.push(serde_json::json!({
                                "title": text.split(" - ").next().unwrap_or("Result"),
                                "url": url,
                                "snippet": text
                            }));
                            continue;
                        }
                        if let Some(topics) = item.get("Topics") {
                            collect_related_topics(topics, out, remaining);
                            if out.len() >= remaining {
                                break;
                            }
                        }
                    }
                }

                if results.len() < max_results {
                    let mut related = vec![];
                    collect_related_topics(
                        &json["RelatedTopics"],
                        &mut related,
                        max_results - results.len(),
                    );
                    results.extend(related);
                }
            } else {
                errors.push("instant answer returned malformed JSON".to_string());
            }
        }

        if results.is_empty() {
            match web_search_html_fallback(candidate, max_results).await {
                Ok(fallback) => {
                    if !fallback.is_empty() {
                        results.extend(fallback);
                    } else {
                        errors.push("html search returned no results".to_string());
                    }
                }
                Err(e) => errors.push(format!("html search failed: {}", e)),
            }
        }

        if results.len() > max_results {
            results.truncate(max_results);
        }

        if !results.is_empty() {
            final_results = results;
            chosen_query = candidate.to_string();
            source = "duckduckgo".to_string();
            final_errors.clear();
            break;
        } else {
            final_errors.extend(errors.into_iter().map(|e| format!("{} => {}", candidate, e)));
        }
    }

    let mut payload = serde_json::json!({
        "query": query,
        "resolved_query": chosen_query,
        "attempted_queries": attempted_queries,
        "results": final_results,
        "source": source
    });

    if payload
        .get("results")
        .and_then(Value::as_array)
        .map(|r| r.is_empty())
        .unwrap_or(true)
        && !final_errors.is_empty()
    {
        payload["error"] = Value::String(final_errors.join("; "));
    }

    Ok(payload.to_string())
}

async fn web_open_tool(url: &str, max_chars: usize) -> Result<String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| anyhow!("invalid url"))?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Ok(serde_json::json!({
            "url": url,
            "error": "only http/https urls are allowed"
        })
        .to_string());
    }

    if let Some(host) = parsed.host_str() {
        let host_l = host.to_ascii_lowercase();
        if host_l == "localhost" || host_l == "127.0.0.1" || host_l == "::1" {
            return Ok(serde_json::json!({
                "url": url,
                "error": "local addresses are blocked"
            })
            .to_string());
        }
    }

    let client = build_client();
    let resp = client
        .get(parsed)
        .header("User-Agent", "singular-chat")
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Ok(serde_json::json!({
            "url": url,
            "error": format!("fetch failed ({}): {}", status, err)
        })
        .to_string());
    }

    let body = resp.text().await?;
    let cleaned = strip_html_tags(&body);
    let excerpt: String = cleaned.chars().take(max_chars.max(200).min(12000)).collect();

    Ok(serde_json::json!({
        "url": url,
        "content": excerpt
    })
    .to_string())
}

async fn run_tool_by_name(name: &str, args: &str) -> String {
    let parsed_args: Value = serde_json::from_str(args).unwrap_or_else(|_| serde_json::json!({}));
    match name {
        "web_search" => {
            let query = parsed_args
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("");
            let max_results = parsed_args
                .get("max_results")
                .and_then(Value::as_u64)
                .unwrap_or(5)
                .clamp(1, 10) as usize;
            let result = match web_search_tool(query, max_results).await {
                Ok(result) => result,
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            };
            result
        }
        "web_open" => {
            let target_url = parsed_args
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("");
            let max_chars = parsed_args
                .get("max_chars")
                .and_then(Value::as_u64)
                .unwrap_or(3000)
                .clamp(500, 12000) as usize;
            let result = match web_open_tool(target_url, max_chars).await {
                Ok(result) => result,
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            };
            result
        }
        _ => serde_json::json!({ "error": format!("unknown tool '{}'", name) }).to_string(),
    }
}

async fn openai_chat_with_tools(
    app: &AppHandle,
    client: &Client,
    provider_label: &str,
    url: &str,
    api_key: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
    force_tool_call: bool,
) -> Result<(String, bool)> {
    let tools = serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the public web for up-to-date information and return short result snippets with URLs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query." },
                        "max_results": { "type": "integer", "minimum": 1, "maximum": 10, "description": "Maximum results to return (default 5)." }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "web_open",
                "description": "Fetch a web page and return cleaned text content for grounding.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "HTTP or HTTPS URL." },
                        "max_chars": { "type": "integer", "minimum": 500, "maximum": 12000, "description": "Max characters of page text to return (default 3000)." }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }
            }
        }
    ]);

    let mut convo_messages = build_openai_messages(messages, system_prompt);
    let freshness_instruction = format!(
        "You have tool access for realtime grounding. For time-sensitive or current-events prompts, call web_search first, then optionally web_open for the most relevant links. Prefer the newest available reporting. Current UTC date: {}.",
        Utc::now().format("%Y-%m-%d")
    );
    convo_messages.insert(
        0,
        serde_json::json!({
            "role": "system",
            "content": freshness_instruction
        }),
    );
    let mut used_web = false;
    for _ in 0..4 {
        if stream_cancelled(app, conversation_id) {
            if used_web {
                emit_tool_status(app, conversation_id, "searching_web", false);
            }
            emit_chunk(app, conversation_id, "", true);
            return Ok((String::new(), used_web));
        }

        let body = serde_json::json!({
            "model": model,
            "messages": convo_messages.clone(),
            "tools": tools.clone(),
            "tool_choice": if force_tool_call { serde_json::json!("required") } else { serde_json::json!("auto") },
            "stream": false
        });

        let resp = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            if used_web {
                emit_tool_status(app, conversation_id, "searching_web", false);
            }
            return Err(anyhow!("{} error: {}", provider_label, err_text));
        }

        let json: Value = resp.json().await?;
        if let Some(response_model) = json.get("model").and_then(Value::as_str) {
            let _ = app.emit(
                "chat-model-debug",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "phase": "response",
                    "response_model": response_model,
                }),
            );
        }

        let message = json
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .cloned()
            .ok_or_else(|| anyhow!("{} error: invalid response shape", provider_label))?;

        let tool_calls = message
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        if tool_calls.is_empty() {
            let content = content_to_text(message.get("content").unwrap_or(&Value::Null));
            emit_text_as_chunks(app, conversation_id, &content);
            emit_chunk(app, conversation_id, "", true);
            if used_web {
                emit_tool_status(app, conversation_id, "searching_web", false);
            }
            return Ok((content, used_web));
        }

        if !used_web {
            emit_tool_status(app, conversation_id, "searching_web", true);
        }
        used_web = true;

        convo_messages.push(serde_json::json!({
            "role": "assistant",
            "content": message.get("content").cloned().unwrap_or(Value::Null),
            "tool_calls": Value::Array(tool_calls.clone())
        }));

        for tool_call in tool_calls {
            let tool_call_id = tool_call
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let function_name = tool_call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let arguments = tool_call
                .get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            let tool_result = run_tool_by_name(&function_name, &arguments).await;

            convo_messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "name": function_name,
                "content": tool_result
            }));
        }
    }

    if used_web {
        emit_tool_status(app, conversation_id, "searching_web", false);
    }
    Err(anyhow!(
        "{} error: tool call loop limit reached",
        provider_label
    ))
}

async fn parse_openai_sse_stream(
    app: &AppHandle,
    resp: reqwest::Response,
    conversation_id: &str,
) -> Result<String> {
    let mut full_response = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut response_model_emitted = false;

    while let Some(item) = stream.next().await {
        if stream_cancelled(app, conversation_id) {
            emit_chunk(app, conversation_id, "", true);
            return Ok(full_response);
        }
        let chunk: Bytes = item?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete lines from buffer
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    emit_chunk(app, conversation_id, "", true);
                    return Ok(full_response);
                }
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if !response_model_emitted {
                        if let Some(response_model) = json["model"].as_str() {
                            let _ = app.emit(
                                "chat-model-debug",
                                serde_json::json!({
                                    "conversation_id": conversation_id,
                                    "phase": "response",
                                    "response_model": response_model,
                                }),
                            );
                            response_model_emitted = true;
                        }
                    }
                    if let Some(content) = extract_openai_delta_text(&json["choices"][0]["delta"]) {
                        if !content.is_empty() {
                            full_response.push_str(&content);
                            emit_chunk(app, conversation_id, &content, false);
                        }
                    }
                }
            }
        }
    }

    emit_chunk(app, conversation_id, "", true);
    Ok(full_response)
}

fn extract_openai_delta_text(delta: &Value) -> Option<String> {
    if let Some(s) = delta.get("content").and_then(Value::as_str) {
        return Some(s.to_string());
    }

    let mut out = String::new();
    if let Some(items) = delta.get("content").and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }
        }
    }

    if out.is_empty() { None } else { Some(out) }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

pub async fn anthropic_chat_stream(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
) -> Result<String> {
    let client = build_client();
    let url = "https://api.anthropic.com/v1/messages";

    let mut msg_array: Vec<Value> = vec![];
    for m in messages {
        if m.role != "system" {
            msg_array.push(serde_json::json!({ "role": m.role, "content": m.content }));
        }
    }

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 8096,
        "messages": msg_array,
        "stream": true
    });

    if let Some(sp) = system_prompt {
        if !sp.is_empty() {
            body["system"] = Value::String(sp.to_string());
        }
    }

    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Anthropic error: {}", err_text));
    }

    let mut full_response = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut response_model_emitted = false;

    while let Some(item) = stream.next().await {
        if stream_cancelled(app, conversation_id) {
            emit_chunk(app, conversation_id, "", true);
            return Ok(full_response);
        }
        let chunk: Bytes = item?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if !response_model_emitted {
                        if let Some(response_model) = json["message"]["model"].as_str() {
                            let _ = app.emit(
                                "chat-model-debug",
                                serde_json::json!({
                                    "conversation_id": conversation_id,
                                    "phase": "response",
                                    "response_model": response_model,
                                }),
                            );
                            response_model_emitted = true;
                        }
                    }
                    if json["type"] == "content_block_delta" {
                        if let Some(text) = json["delta"]["text"].as_str() {
                            if !text.is_empty() {
                                full_response.push_str(text);
                                emit_chunk(app, conversation_id, text, false);
                            }
                        }
                    } else if json["type"] == "message_stop" {
                        emit_chunk(app, conversation_id, "", true);
                        return Ok(full_response);
                    }
                }
            }
        }
    }

    emit_chunk(app, conversation_id, "", true);
    Ok(full_response)
}

// ── Groq (OpenAI-compatible) ──────────────────────────────────────────────────

pub async fn groq_chat_stream(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
    tools_enabled: bool,
) -> Result<(String, bool)> {
    openai_chat_stream(
        app,
        api_key,
        model,
        messages,
        system_prompt,
        conversation_id,
        Some("https://api.groq.com/openai"),
        tools_enabled,
    )
    .await
}

pub async fn xai_chat_stream(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    messages: &[Message],
    system_prompt: Option<&str>,
    conversation_id: &str,
    tools_enabled: bool,
) -> Result<(String, bool)> {
    openai_chat_stream(
        app,
        api_key,
        model,
        messages,
        system_prompt,
        conversation_id,
        Some("https://api.x.ai"),
        tools_enabled,
    )
    .await
}

pub async fn xai_generate_image(
    api_key: &str,
    requested_model: &str,
    prompt: &str,
) -> Result<(String, String)> {
    let available_models = xai_list_models(api_key).await?;

    let requested_trimmed = requested_model.trim();
    let requested_available = !requested_trimmed.is_empty()
        && available_models
            .iter()
            .any(|m| m.eq_ignore_ascii_case(requested_trimmed));

    let selected_model = if requested_available
        && (requested_trimmed.to_ascii_lowercase().contains("imagine")
            || requested_trimmed.to_ascii_lowercase().contains("image"))
    {
        requested_trimmed.to_string()
    } else {
        available_models
            .iter()
            .find(|id| {
                let lower = id.to_ascii_lowercase();
                lower.contains("imagine") || lower.contains("image")
            })
            .cloned()
            .ok_or_else(|| anyhow!("No ImageGen API detected. No image-capable model is available."))?
    };

    let client = build_client();
    let resp = client
        .post("https://api.x.ai/v1/images/generations")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": selected_model,
            "prompt": prompt,
            "n": 1
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("xAI image generation error ({}): {}", status, err_text));
    }

    let json: Value = resp.json().await?;
    let image_data = json
        .get("data")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .ok_or_else(|| anyhow!("No image was returned by the image generation endpoint."))?;

    let image_url = image_data
        .get("url")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            image_data
                .get("image_url")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            image_data
                .get("b64_json")
                .and_then(Value::as_str)
                .map(|b64| format!("data:image/png;base64,{}", b64))
        })
        .ok_or_else(|| anyhow!("Image generation completed but no image URL was returned."))?;

    let response = format!(
        "Generated with `{}`.\n\n![Generated image]({})",
        selected_model, image_url
    );

    Ok((selected_model, response))
}

pub async fn xai_list_models(api_key: &str) -> Result<Vec<String>> {
    let client = build_client();
    let resp = client
        .get("https://api.x.ai/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("xAI models list error ({}): {}", status, err_text));
    }

    let json: Value = resp.json().await?;
    let model_array = json
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| json.get("models").and_then(Value::as_array))
        .ok_or_else(|| anyhow!("Invalid xAI /v1/models response shape"))?;

    let mut grok_ids = BTreeSet::new();
    let mut all_ids = BTreeSet::new();

    for model in model_array {
        if let Some(id) = model.get("id").and_then(Value::as_str) {
            if id.starts_with("grok-") {
                grok_ids.insert(id.to_string());
            }
            all_ids.insert(id.to_string());
        }
    }

    if !grok_ids.is_empty() {
        return Ok(grok_ids.into_iter().collect());
    }

    let all: Vec<String> = all_ids.into_iter().collect();
    if all.is_empty() {
        return Err(anyhow!("No models returned by xAI /v1/models"));
    }
    Ok(all)
}

fn is_openai_chat_model_id(model_id: &str) -> bool {
    let lower = model_id
        .trim()
        .to_ascii_lowercase()
        .replace("chatgpt-", "gpt-")
        .replace("openai/", "")
        .replace("openai-", "");
    if !(lower.starts_with("gpt-") || lower.starts_with("o")) {
        return false;
    }
    let excluded = [
        "image",
        "audio",
        "realtime",
        "transcribe",
        "tts",
        "embedding",
        "moderation",
        "video",
        "sora",
        "computer-use",
        "deep-research",
        "search-preview",
        "search",
    ];
    !excluded.iter().any(|hint| lower.contains(hint))
}

pub async fn openai_list_models(api_key: &str) -> Result<Vec<String>> {
    let client = build_client();
    let resp = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("OpenAI models list error ({}): {}", status, err_text));
    }

    let json: Value = resp.json().await?;
    let model_array = json
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("Invalid OpenAI /v1/models response shape"))?;

    let mut ids = BTreeSet::new();
    for model in model_array {
        if let Some(id) = model.get("id").and_then(Value::as_str) {
            if is_openai_chat_model_id(id) {
                ids.insert(id.to_string());
            }
        }
    }

    let models: Vec<String> = ids.into_iter().collect();
    if models.is_empty() {
        return Err(anyhow!("No chat-capable OpenAI models returned by /v1/models"));
    }
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::{
        build_ollama_messages, effective_web_query, enrich_web_query_for_freshness,
        extract_weather_location_query, format_weather_response, contains_weather_intent,
        normalize_duckduckgo_result_url, parse_duckduckgo_html_results,
        parse_google_news_rss_results, should_enable_web_tools, web_open_tool, web_search_tool,
        OpenMeteoCurrentWeather, OpenMeteoLocation, OLLAMA_CONTEXT_MESSAGE_LIMIT,
    };
    use crate::db::Message;
    use serde_json::Value;

    fn user_message(content: &str) -> Message {
        Message {
            id: "m1".to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: content.to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            used_web: false,
        }
    }

    #[test]
    fn enables_web_for_explicit_search_intent() {
        let msgs = vec![user_message("Search the web for latest NVIDIA stock price")];
        assert!(should_enable_web_tools(&msgs));
    }

    #[test]
    fn enables_web_for_url_queries() {
        let msgs = vec![user_message("Summarize this page: https://example.com/article")];
        assert!(should_enable_web_tools(&msgs));
    }

    #[test]
    fn disables_web_for_model_identity_questions() {
        let msgs = vec![user_message("What model are you running right now?")];
        assert!(!should_enable_web_tools(&msgs));
    }

    #[test]
    fn disables_web_for_non_recency_general_questions() {
        let msgs = vec![user_message("Explain how transformers work")];
        assert!(!should_enable_web_tools(&msgs));
    }

    #[test]
    fn detects_weather_intent_for_weather_queries() {
        assert!(contains_weather_intent(
            "Tell me the weather in Charleston, SC right now"
        ));
        assert!(contains_weather_intent("Will it rain in Charleston tomorrow?"));
        assert!(!contains_weather_intent("Weathering steel is durable."));
    }

    #[test]
    fn extracts_weather_location_from_weather_prompt() {
        assert_eq!(
            extract_weather_location_query("Tell me the weather in Charleston, SC right now")
                .as_deref(),
            Some("charleston, sc")
        );
        assert_eq!(
            extract_weather_location_query("What's the forecast for Seattle, WA tomorrow")
                .as_deref(),
            Some("seattle, wa")
        );
        assert_eq!(
            extract_weather_location_query("Will it rain in Charleston, SC today").as_deref(),
            Some("charleston, sc")
        );
    }

    #[test]
    fn enables_web_for_current_events_topic_without_recency_words() {
        let msgs = vec![user_message("iran war")];
        assert!(should_enable_web_tools(&msgs));
    }

    #[test]
    fn generic_web_command_reuses_previous_user_query() {
        let msgs = vec![
            user_message("Can you tell me what is going on now with the Iran war?"),
            Message {
                id: "m2".to_string(),
                conversation_id: "c1".to_string(),
                role: "assistant".to_string(),
                content: "I need to search.".to_string(),
                created_at: "2026-01-01T00:00:01Z".to_string(),
                used_web: false,
            },
            user_message("search the web"),
        ];
        let resolved = effective_web_query(&msgs);
        assert!(resolved.contains("iran war"));
        assert!(!resolved.contains("search the web"));
    }

    #[test]
    fn ollama_history_keeps_recent_messages_and_drops_old_ones() {
        let mut msgs = Vec::new();
        for idx in 0..32 {
            msgs.push(Message {
                id: format!("m{idx}"),
                conversation_id: "c1".to_string(),
                role: if idx % 2 == 0 {
                    "user".to_string()
                } else {
                    "assistant".to_string()
                },
                content: format!("message-{idx}"),
                created_at: format!("2026-01-01T00:00:{idx:02}Z"),
                used_web: false,
            });
        }

        let built = build_ollama_messages(&msgs, Some("system prompt"));
        let contents: Vec<String> = built
            .iter()
            .filter_map(|value| value.get("content").and_then(Value::as_str))
            .map(ToString::to_string)
            .collect();

        assert!(contents.iter().any(|content| content == "system prompt"));
        assert!(contents.iter().any(|content| content == "message-31"));
        assert!(!contents.iter().any(|content| content == "message-0"));
        assert!(built.len() <= OLLAMA_CONTEXT_MESSAGE_LIMIT + 1);
    }

    #[test]
    fn parses_google_news_rss_results() {
        let xml = r#"
        <rss><channel>
          <item>
            <title><![CDATA[Iran conflict latest updates]]></title>
            <link>https://example.com/story</link>
            <description><![CDATA[Reuters reports new developments]]></description>
            <pubDate>Sat, 11 Apr 2026 14:00:00 GMT</pubDate>
          </item>
        </channel></rss>
        "#;
        let parsed = parse_google_news_rss_results(xml, 5);
        assert_eq!(parsed.len(), 1);
        assert_eq!(
            parsed[0].get("url").and_then(Value::as_str).unwrap_or(""),
            "https://example.com/story"
        );
        assert!(
            parsed[0]
                .get("published_at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .contains("2026")
        );
    }

    #[test]
    fn parses_duckduckgo_html_fallback_results() {
        let html = r#"
        <div class="results">
          <a rel="nofollow" class="result__a" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fexample.com%2Fai-news">AI &amp; News</a>
          <a class="result__snippet" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fexample.com%2Fai-news">Latest &lt;b&gt;headline&lt;/b&gt; here</a>
        </div>
        "#;
        let parsed = parse_duckduckgo_html_results(html, 5);
        assert_eq!(parsed.len(), 1);
        let title = parsed[0].get("title").and_then(|v| v.as_str()).unwrap_or("");
        let url = parsed[0].get("url").and_then(|v| v.as_str()).unwrap_or("");
        assert_eq!(title, "AI & News");
        assert_eq!(url, "https://example.com/ai-news");
    }

    #[test]
    fn normalizes_duckduckgo_redirect_links() {
        let resolved = normalize_duckduckgo_result_url(
            "/l/?kh=-1&uddg=https%3A%2F%2Fdocs.example.com%2Fguide",
        );
        assert_eq!(resolved, "https://docs.example.com/guide");
    }

    #[test]
    fn enriches_current_event_queries_with_date() {
        let enriched = enrich_web_query_for_freshness("iran war");
        assert!(enriched.to_ascii_lowercase().contains("iran war"));
        assert!(enriched.to_ascii_lowercase().contains("latest updates"));
        assert!(enriched.contains("202"));
    }

    #[test]
    fn rewrites_stale_year_current_event_queries() {
        let enriched = enrich_web_query_for_freshness("current war involving Iran 2023");
        let lower = enriched.to_ascii_lowercase();
        assert!(lower.contains("iran"));
        assert!(lower.contains("latest updates"));
        assert!(!lower.contains("2023"));
    }

    #[test]
    fn formats_weather_summary_readably() {
        let location = OpenMeteoLocation {
            name: "Charleston".to_string(),
            country: Some("United States".to_string()),
            admin1: Some("South Carolina".to_string()),
            latitude: 32.78,
            longitude: -79.93,
            timezone: Some("America/New_York".to_string()),
        };
        let current = OpenMeteoCurrentWeather {
            time: Some("2026-04-14T10:00".to_string()),
            temperature_2m: Some(78.0),
            apparent_temperature: Some(82.0),
            precipitation: Some(0.0),
            rain: Some(0.0),
            showers: Some(0.0),
            snowfall: Some(0.0),
            weather_code: Some(2),
            wind_speed_10m: Some(11.0),
            wind_direction_10m: Some(225.0),
            wind_gusts_10m: Some(18.0),
            relative_humidity_2m: Some(65.0),
        };
        let text = format_weather_response(&location, &current, Some("America/New_York"));
        assert!(text.contains("Charleston, South Carolina"));
        assert!(text.contains("partly cloudy"));
        assert!(text.contains("78"));
        assert!(text.contains("Wind 11 mph SW"));
    }

    #[tokio::test]
    async fn web_search_tool_returns_results_for_common_query() {
        let raw = web_search_tool("OpenAI", 5).await.expect("web search should return JSON");
        let json: Value = serde_json::from_str(&raw).expect("web search output should be JSON");
        let results = json
            .get("results")
            .and_then(Value::as_array)
            .expect("results should be an array");
        let error_text = json.get("error").and_then(Value::as_str).unwrap_or("");
        assert!(
            !results.is_empty() || !error_text.is_empty(),
            "expected results or an explicit error payload"
        );
    }

    #[tokio::test]
    async fn web_open_tool_returns_content_for_example_domain() {
        let raw = web_open_tool("https://example.com", 1200)
            .await
            .expect("web open should return JSON");
        let json: Value = serde_json::from_str(&raw).expect("web open output should be JSON");
        let content = json.get("content").and_then(Value::as_str).unwrap_or("");
        assert!(
            !content.trim().is_empty(),
            "expected non-empty content for https://example.com"
        );
    }

    #[tokio::test]
    async fn web_search_tool_returns_results_for_iran_war_prompt() {
        let raw = web_search_tool("iran war", 5)
            .await
            .expect("web search should return JSON");
        let json: Value = serde_json::from_str(&raw).expect("web search output should be JSON");
        let results = json
            .get("results")
            .and_then(Value::as_array)
            .expect("results should be an array");
        assert!(
            !results.is_empty(),
            "expected non-empty results for 'iran war'"
        );
    }

    #[tokio::test]
    async fn web_search_tool_recovers_from_overconstrained_iran_query() {
        let raw = web_search_tool("current wars or conflicts involving Iran as of April 2026", 5)
            .await
            .expect("web search should return JSON");
        let json: Value = serde_json::from_str(&raw).expect("web search output should be JSON");
        let attempted = json
            .get("attempted_queries")
            .and_then(Value::as_array)
            .expect("attempted_queries should be an array");
        assert!(
            attempted.len() >= 2,
            "expected retry/broadening behavior for overconstrained query"
        );
    }
}
