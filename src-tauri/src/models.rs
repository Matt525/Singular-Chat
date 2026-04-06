use anyhow::{anyhow, Result};
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::Message;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChunk {
    pub conversation_id: String,
    pub chunk: String,
    pub done: bool,
}

fn build_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .expect("Failed to build HTTP client")
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

// ── Ollama ────────────────────────────────────────────────────────────────────

pub async fn ollama_list_models(base_url: &str) -> Result<Vec<OllamaModel>> {
    let client = build_client();
    let url = format!("{}/api/tags", base_url);
    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("Ollama returned status {}", resp.status()));
    }
    let json: Value = resp.json().await?;
    let models = json["models"]
        .as_array()
        .unwrap_or(&vec![])
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
        .get(&format!("{}/api/tags", base_url))
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
    let url = format!("{}/api/pull", base_url);
    let body = serde_json::json!({ "name": model_name, "stream": true });

    let resp = client.post(&url).json(&body).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("Ollama pull failed: {}", resp.status()));
    }

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk: Bytes = item?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<Value>(line) {
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
            }
        }
    }
    Ok(())
}

pub async fn ollama_delete_model(base_url: &str, model_name: &str) -> Result<()> {
    let client = build_client();
    let url = format!("{}/api/delete", base_url);
    let body = serde_json::json!({ "name": model_name });
    let resp = client.delete(&url).json(&body).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("Ollama delete failed: {}", resp.status()));
    }
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
    let url = format!("{}/api/chat", base_url);

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

    while let Some(item) = stream.next().await {
        let chunk: Bytes = item?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<Value>(line) {
                let done = json["done"].as_bool().unwrap_or(false);
                if let Some(content) = json["message"]["content"].as_str() {
                    if !content.is_empty() {
                        full_response.push_str(content);
                        emit_chunk(app, conversation_id, content, false);
                    }
                }
                if done {
                    break;
                }
            }
        }
    }

    emit_chunk(app, conversation_id, "", true);
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
) -> Result<String> {
    let client = build_client();
    let url = format!(
        "{}/v1/chat/completions",
        base_url.unwrap_or("https://api.openai.com")
    );

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
        return Err(anyhow!("OpenAI error: {}", err_text));
    }

    parse_openai_sse_stream(app, resp, conversation_id).await
}

async fn parse_openai_sse_stream(
    app: &AppHandle,
    resp: reqwest::Response,
    conversation_id: &str,
) -> Result<String> {
    let mut full_response = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(item) = stream.next().await {
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
                    if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            full_response.push_str(content);
                            emit_chunk(app, conversation_id, content, false);
                        }
                    }
                }
            }
        }
    }

    emit_chunk(app, conversation_id, "", true);
    Ok(full_response)
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

    while let Some(item) = stream.next().await {
        let chunk: Bytes = item?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if let Ok(json) = serde_json::from_str::<Value>(data) {
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
) -> Result<String> {
    openai_chat_stream(
        app,
        api_key,
        model,
        messages,
        system_prompt,
        conversation_id,
        Some("https://api.groq.com/openai"),
    )
    .await
}
