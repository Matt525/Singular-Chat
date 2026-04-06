mod db;
mod models;

use chrono::Utc;
use db::{Assistant, Conversation, Database, Message, Settings};
use models::OllamaModel;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

pub struct AppState {
    pub db: Mutex<Database>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
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
    let user_id = Uuid::new_v4().to_string();
    let n = now();

    // Get all data we need while holding the lock, then release it
    let (history, settings, system_prompt, is_first_message) = {
        let db = state.db.lock().map_err(map_err)?;

        // Save the user message
        db.save_message(&user_id, &conversation_id, "user", &content, &n)
            .map_err(map_err)?;

        // Get conversation to check for assistant
        let convs = db.get_conversations().map_err(map_err)?;
        let conv = convs.iter().find(|c| c.id == conversation_id);
        let assistant_id = conv.and_then(|c| c.assistant_id.clone());

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

    let sp = if system_prompt.is_empty() {
        None
    } else {
        Some(system_prompt.as_str())
    };

    let response = match provider.as_str() {
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
        }
    }
    .map_err(map_err)?;

    // Save assistant response and possibly update title
    let assistant_id = Uuid::new_v4().to_string();
    let n2 = now();
    {
        let db = state.db.lock().map_err(map_err)?;
        db.save_message(&assistant_id, &conversation_id, "assistant", &response, &n2)
            .map_err(map_err)?;

        if is_first_message {
            // Generate a title from the first user message (first 60 chars)
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
    }

    Ok(response)
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
async fn get_ollama_models(state: State<'_, AppState>) -> Result<Vec<OllamaModel>, String> {
    let url = {
        let db = state.db.lock().map_err(map_err)?;
        db.get_settings().map_err(map_err)?.ollama_url
    };
    models::ollama_list_models(&url).await.map_err(map_err)
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
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_conversations,
            create_conversation,
            delete_conversation,
            rename_conversation,
            get_messages,
            send_message,
            get_settings,
            save_settings,
            get_assistants,
            create_assistant,
            update_assistant,
            delete_assistant,
            check_ollama,
            get_ollama_models,
            pull_ollama_model,
            delete_ollama_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
