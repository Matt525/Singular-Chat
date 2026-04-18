mod db;
mod models;

use chrono::Utc;
use db::{Assistant, Conversation, Database, Message, Settings};
use models::{
    HuggingFaceGgufFile, HuggingFaceModelSearchResult, OllamaModel, OllamaRuntimeStatus,
};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

pub struct AppState {
    pub db: Mutex<Database>,
    pub cancel_requests: Mutex<HashSet<String>>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn sanitize_path_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "value".to_string()
    } else {
        trimmed.to_string()
    }
}

fn validate_hf_relative_path(file_name: &str) -> Result<PathBuf, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Err("Hugging Face file name is required.".to_string());
    }
    let rel_path = PathBuf::from(trimmed);
    if rel_path.is_absolute() {
        return Err("Hugging Face file name must be a relative path from the repo.".to_string());
    }
    if rel_path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Hugging Face file path is invalid.".to_string());
    }
    Ok(rel_path)
}

// ── Conversation commands ─────────────────────────────────────────────────────

#[tauri::command]
async fn get_conversations(state: State<'_, AppState>) -> Result<Vec<Conversation>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.get_conversations().map_err(map_err)
}

#[tauri::command]
async fn create_conversation(
    state: State<'_, AppState>,
    model: String,
    provider: String,
    assistant_id: Option<String>,
) -> Result<Conversation, String> {
    let id = Uuid::new_v4().to_string();
    let title = "New Chat".to_string();
    let n = now();
    let db = state.db.lock().map_err(map_err)?;
    db.create_conversation(
        &id,
        &title,
        &model,
        &provider,
        assistant_id.as_deref(),
        &n,
    )
    .map_err(map_err)
}

#[tauri::command]
async fn delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(map_err)?;
    db.delete_conversation(&id).map_err(map_err)
}

#[tauri::command]
async fn rename_conversation(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let n = now();
    let db = state.db.lock().map_err(map_err)?;
    db.rename_conversation(&id, &title, &n).map_err(map_err)
}

#[tauri::command]
async fn set_conversation_model_provider(
    state: State<'_, AppState>,
    conversation_id: String,
    model: String,
    provider: String,
) -> Result<(), String> {
    let n = now();
    let db = state.db.lock().map_err(map_err)?;
    db.set_conversation_model_provider(&conversation_id, &model, &provider, &n)
        .map_err(map_err)
}

// ── Message commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<Message>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.get_messages(&conversation_id).map_err(map_err)
}

#[tauri::command]
async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
    model: String,
    provider: String,
) -> Result<String, String> {
    {
        let mut cancel_requests = state.cancel_requests.lock().map_err(map_err)?;
        cancel_requests.remove(&conversation_id);
    }

    let user_id = Uuid::new_v4().to_string();
    let n = now();

    // Get all data we need while holding the lock, then release it
    let (history, settings, system_prompt, is_first_message) = {
        let db = state.db.lock().map_err(map_err)?;

        // Save the user message
        db.save_message(&user_id, &conversation_id, "user", &content, &n, false)
            .map_err(map_err)?;

        // Fetch only the active conversation rather than scanning the full list.
        let assistant_id = db
            .get_conversation(&conversation_id)
            .map_err(map_err)?
            .assistant_id;

        let system_prompt = if let Some(aid) = assistant_id {
            db.get_assistant(&aid)
                .ok()
                .map(|a| a.system_prompt)
                .unwrap_or_default()
        } else {
            String::new()
        };

        let history = db.get_messages(&conversation_id).map_err(map_err)?;
        let is_first = history.iter().filter(|m| m.role == "user").count() == 1;
        let settings = db.get_settings().map_err(map_err)?;

        db.touch_conversation(&conversation_id, &n).map_err(map_err)?;

        (history, settings, system_prompt, is_first)
    };
    // Mutex released here — safe to do async work

    let web_context = if settings.web_search_enabled
        && models::should_enable_web_tools_for_messages(&history)
    {
        models::build_web_context_for_messages(&history)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    let runtime_identity_prompt = format!(
        "Runtime metadata (authoritative for this chat request):
- Active provider: {}
- Active model ID: {}

If the user asks which model/provider is running, answer using this metadata exactly and do not guess from memory or prior turns.",
        provider, model
    );

    let realtime_context_block = web_context.as_ref().map(|ctx| {
        format!(
            "Realtime web context (retrieved by Singular Chat web tool):\n{}\n\nYou MUST treat this web context as current external data for this reply. Do not say you lack realtime access when this block is present. If the user asks about current events, prioritize this context and include at least one URL citation from it.",
            ctx
        )
    });

    let merged_system_prompt = match (system_prompt.is_empty(), realtime_context_block) {
        (true, None) => runtime_identity_prompt,
        (false, None) => format!("{}\n\n{}", system_prompt, runtime_identity_prompt),
        (true, Some(rt)) => format!("{}\n\n{}", runtime_identity_prompt, rt),
        (false, Some(rt)) => format!("{}\n\n{}\n\n{}", system_prompt, runtime_identity_prompt, rt),
    };
    let sp = Some(merged_system_prompt.as_str());

    let persist_response = |response: &str, used_web: bool| -> Result<(), String> {
        let assistant_id = Uuid::new_v4().to_string();
        let n2 = now();
        let db = state.db.lock().map_err(map_err)?;
        db.save_message(
            &assistant_id,
            &conversation_id,
            "assistant",
            response,
            &n2,
            used_web,
        )
        .map_err(map_err)?;

        if is_first_message {
            let title: String = content.chars().take(60).collect();
            let title = if content.len() > 60 {
                format!("{}...", title)
            } else {
                title
            };
            db.update_conversation_title(&conversation_id, &title, &n2)
                .map_err(map_err)?;
        } else {
            db.touch_conversation(&conversation_id, &n2)
                .map_err(map_err)?;
        }
        Ok(())
    };

    if let Some(weather_response) = models::build_weather_response_for_messages(&history)
        .await
        .map_err(map_err)?
    {
        persist_response(&weather_response, true)?;
        return Ok(weather_response);
    }

    let _ = app.emit(
        "chat-model-debug",
        serde_json::json!({
            "conversation_id": conversation_id,
            "phase": "request",
            "provider": provider,
            "requested_model": model,
        }),
    );

    let (response, mut used_web) = match provider.as_str() {
        "openai" => {
            if settings.openai_api_key.is_empty() {
                return Err("OpenAI API key not configured. Go to Settings → API Keys.".to_string());
            }
            models::openai_chat_stream(
                &app,
                &settings.openai_api_key,
                &model,
                &history,
                sp,
                &conversation_id,
                None,
                settings.web_search_enabled,
            )
            .await
        }
        "anthropic" => {
            if settings.anthropic_api_key.is_empty() {
                return Err(
                    "Anthropic API key not configured. Go to Settings → API Keys.".to_string(),
                );
            }
            models::anthropic_chat_stream(
                &app,
                &settings.anthropic_api_key,
                &model,
                &history,
                sp,
                &conversation_id,
            )
            .await
            .map(|text| (text, false))
        }
        "groq" => {
            if settings.groq_api_key.is_empty() {
                return Err("Groq API key not configured. Go to Settings → API Keys.".to_string());
            }
            models::groq_chat_stream(
                &app,
                &settings.groq_api_key,
                &model,
                &history,
                sp,
                &conversation_id,
                settings.web_search_enabled,
            )
            .await
        }
        "xai" => {
            if settings.xai_api_key.is_empty() {
                return Err("xAI API key not configured. Go to Settings → API Keys.".to_string());
            }
            let available_models = models::xai_list_models(&settings.xai_api_key)
                .await
                .map_err(map_err)?;
            if !available_models.iter().any(|m| m == &model) {
                let preview = available_models
                    .iter()
                    .take(20)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(format!(
                    "Selected xAI model '{}' is not available for this API key. Available models: {}",
                    model, preview
                ));
            }
            models::xai_chat_stream(
                &app,
                &settings.xai_api_key,
                &model,
                &history,
                sp,
                &conversation_id,
                settings.web_search_enabled,
            )
            .await
        }
        _ => {
            // Default to Ollama
            models::ollama_chat_stream(
                &app,
                &settings.ollama_url,
                &model,
                &history,
                sp,
                &conversation_id,
            )
            .await
            .map(|text| (text, false))
        }
    }
    .map_err(map_err)?;
    if web_context.is_some() {
        used_web = true;
    }

    persist_response(&response, used_web)?;
    Ok(response)
}

#[tauri::command]
async fn send_image_message(
    app: AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    prompt: String,
    model: String,
    provider: String,
) -> Result<String, String> {
    let trimmed_prompt = prompt.trim();
    if trimmed_prompt.is_empty() {
        return Err("Image prompt is required.".to_string());
    }

    let user_id = Uuid::new_v4().to_string();
    let n = now();

    let (settings, is_first_message) = {
        let db = state.db.lock().map_err(map_err)?;
        db.save_message(&user_id, &conversation_id, "user", trimmed_prompt, &n, false)
            .map_err(map_err)?;

        let history = db.get_messages(&conversation_id).map_err(map_err)?;
        let is_first = history.iter().filter(|m| m.role == "user").count() == 1;
        let settings = db.get_settings().map_err(map_err)?;
        db.touch_conversation(&conversation_id, &n).map_err(map_err)?;
        (settings, is_first)
    };

    let _ = app.emit(
        "chat-model-debug",
        serde_json::json!({
            "conversation_id": conversation_id,
            "phase": "request",
            "provider": provider,
            "requested_model": "image-generation",
        }),
    );

    let (response_model, response) = match provider.as_str() {
        "xai" => {
            if settings.xai_api_key.is_empty() {
                return Err("No ImageGen API detected. Add an xAI API key in Settings.".to_string());
            }
            models::xai_generate_image(&settings.xai_api_key, &model, trimmed_prompt)
                .await
                .map_err(map_err)?
        }
        _ => {
            return Err(
                "No ImageGen API detected for the selected provider. Switch to an image-capable provider."
                    .to_string(),
            )
        }
    };

    let _ = app.emit(
        "chat-model-debug",
        serde_json::json!({
            "conversation_id": conversation_id,
            "phase": "response",
            "response_model": response_model,
        }),
    );

    let assistant_id = Uuid::new_v4().to_string();
    let n2 = now();
    {
        let db = state.db.lock().map_err(map_err)?;
        db.save_message(
            &assistant_id,
            &conversation_id,
            "assistant",
            &response,
            &n2,
            false,
        )
            .map_err(map_err)?;

        if is_first_message {
            let title: String = trimmed_prompt.chars().take(60).collect();
            let title = if trimmed_prompt.len() > 60 {
                format!("{}...", title)
            } else {
                title
            };
            db.update_conversation_title(&conversation_id, &title, &n2)
                .map_err(map_err)?;
        } else {
            db.touch_conversation(&conversation_id, &n2)
                .map_err(map_err)?;
        }
    }

    Ok(response)
}

#[tauri::command]
async fn cancel_stream(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String> {
    let mut cancel_requests = state.cancel_requests.lock().map_err(map_err)?;
    cancel_requests.insert(conversation_id);
    Ok(())
}

// ── Settings commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.get_settings().map_err(map_err)
}

#[tauri::command]
async fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    let db = state.db.lock().map_err(map_err)?;
    db.save_settings(&settings).map_err(map_err)
}

// ── Assistant commands ────────────────────────────────────────────────────────

#[tauri::command]
async fn get_assistants(state: State<'_, AppState>) -> Result<Vec<Assistant>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.get_assistants().map_err(map_err)
}

#[tauri::command]
async fn create_assistant(
    state: State<'_, AppState>,
    name: String,
    description: String,
    system_prompt: String,
    model: String,
    provider: String,
    avatar_color: String,
) -> Result<Assistant, String> {
    let assistant = Assistant {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        system_prompt,
        model,
        provider,
        avatar_color,
        created_at: now(),
    };
    let db = state.db.lock().map_err(map_err)?;
    db.create_assistant(&assistant).map_err(map_err)?;
    Ok(assistant)
}

#[tauri::command]
async fn update_assistant(
    state: State<'_, AppState>,
    assistant: Assistant,
) -> Result<(), String> {
    let db = state.db.lock().map_err(map_err)?;
    db.update_assistant(&assistant).map_err(map_err)
}

#[tauri::command]
async fn delete_assistant(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(map_err)?;
    db.delete_assistant(&id).map_err(map_err)
}

// ── Model/Ollama commands ─────────────────────────────────────────────────────

#[tauri::command]
async fn check_ollama(state: State<'_, AppState>) -> Result<bool, String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    Ok(models::ollama_check(&url).await)
}

#[tauri::command]
async fn get_ollama_runtime_status(state: State<'_, AppState>) -> Result<OllamaRuntimeStatus, String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    Ok(models::get_ollama_runtime_status(&url).await)
}

#[tauri::command]
async fn install_or_update_ollama() -> Result<String, String> {
    models::install_or_update_ollama().await.map_err(map_err)
}

#[tauri::command]
async fn get_ollama_models(state: State<'_, AppState>) -> Result<Vec<OllamaModel>, String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    models::ollama_list_models(&url).await.map_err(map_err)
}

#[tauri::command]
async fn get_xai_models(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let api_key = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.xai_api_key
    };

    if api_key.is_empty() {
        return Ok(vec![]);
    }

    models::xai_list_models(&api_key).await.map_err(map_err)
}

#[tauri::command]
async fn get_openai_models(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let api_key = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.openai_api_key
    };

    if api_key.is_empty() {
        return Ok(vec![]);
    }

    models::openai_list_models(&api_key).await.map_err(map_err)
}

#[tauri::command]
async fn pull_ollama_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    models::ollama_pull_model(&app, &url, &model_name)
        .await
        .map_err(map_err)
}

#[tauri::command]
async fn delete_ollama_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    models::ollama_delete_model(&url, &model_name)
        .await
        .map_err(map_err)
}

#[tauri::command]
async fn import_local_gguf_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_name: String,
    gguf_path: String,
) -> Result<(), String> {
    let model_name = model_name.trim();
    if model_name.is_empty() {
        return Err("Model name is required.".to_string());
    }

    let gguf_path = gguf_path.trim();
    if gguf_path.is_empty() {
        return Err("GGUF file path is required.".to_string());
    }

    let path = Path::new(gguf_path);
    if !path.exists() {
        return Err(format!("GGUF file not found: {}", gguf_path));
    }
    if !path.is_file() {
        return Err(format!("Path is not a file: {}", gguf_path));
    }

    let is_gguf = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false);
    if !is_gguf {
        return Err("Only .gguf files are supported for import.".to_string());
    }

    let canonical_path = std::fs::canonicalize(path).map_err(map_err)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };

    models::ollama_create_model_from_gguf(&app, &url, model_name, &canonical_str)
        .await
        .map_err(map_err)
}

#[tauri::command]
async fn list_hf_gguf_files(
    repo_id: String,
    hf_token: Option<String>,
) -> Result<Vec<HuggingFaceGgufFile>, String> {
    models::huggingface_list_gguf_files(&repo_id, hf_token.as_deref())
        .await
        .map_err(map_err)
}

#[tauri::command]
async fn search_hf_models(
    query: String,
    hf_token: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<HuggingFaceModelSearchResult>, String> {
    models::huggingface_search_models(&query, hf_token.as_deref(), limit.unwrap_or(30))
        .await
        .map_err(map_err)
}

#[tauri::command]
async fn download_hf_and_import_model(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    file_name: String,
    model_name: String,
    revision: Option<String>,
    hf_token: Option<String>,
) -> Result<(), String> {
    let model_name = model_name.trim();
    if model_name.is_empty() {
        return Err("Model name is required.".to_string());
    }

    let repo_id = repo_id.trim().trim_matches('/');
    if repo_id.is_empty() || repo_id.split('/').count() < 2 {
        return Err("Hugging Face repo must be in owner/repository format.".to_string());
    }

    let relative_file = validate_hf_relative_path(&file_name)?;
    let file_name_str = relative_file.to_string_lossy().to_string();
    if !file_name_str.to_ascii_lowercase().ends_with(".gguf") {
        return Err("Selected Hugging Face file must end with .gguf.".to_string());
    }

    let revision_clean = revision
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("main")
        .to_string();

    let app_data_dir = app.path().app_data_dir().map_err(map_err)?;
    std::fs::create_dir_all(&app_data_dir).map_err(map_err)?;
    let destination = app_data_dir
        .join("hf-model-imports")
        .join(sanitize_path_component(repo_id))
        .join(sanitize_path_component(&revision_clean))
        .join(&relative_file);

    models::huggingface_download_gguf(
        &app,
        repo_id,
        &file_name_str,
        &destination,
        Some(&revision_clean),
        hf_token.as_deref(),
        model_name,
    )
    .await
    .map_err(map_err)?;

    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };

    models::ollama_create_model_from_gguf(
        &app,
        &url,
        model_name,
        &destination.to_string_lossy(),
    )
    .await
    .map_err(map_err)
}

// ── App entry point ───────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&data_dir).expect("Failed to create app data dir");
            let db_path = data_dir.join("singular_chat.db");
            let database = Database::new(db_path.to_str().unwrap())
                .expect("Failed to initialize database");
            app.manage(AppState {
                db: Mutex::new(database),
                cancel_requests: Mutex::new(HashSet::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_conversations,
            create_conversation,
            delete_conversation,
            rename_conversation,
            set_conversation_model_provider,
            get_messages,
            send_message,
            send_image_message,
            cancel_stream,
            get_settings,
            save_settings,
            get_assistants,
            create_assistant,
            update_assistant,
            delete_assistant,
            check_ollama,
            get_ollama_runtime_status,
            install_or_update_ollama,
            get_ollama_models,
            get_openai_models,
            get_xai_models,
            pull_ollama_model,
            delete_ollama_model,
            import_local_gguf_model,
            list_hf_gguf_files,
            search_hf_models,
            download_hf_and_import_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
