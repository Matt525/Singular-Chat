use anyhow::Result;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub assistant_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub used_web: bool,
}

#[cfg(test)]
mod tests {
    use super::Database;
    use rusqlite::{params, Connection};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("singular-chat-db-migration-{}.sqlite", nanos))
    }

    #[test]
    fn migrates_used_web_before_first_message_insert() {
        let db_path = temp_db_path();

        {
            let conn = Connection::open(&db_path).expect("create temporary sqlite database");
            conn.execute_batch(
                "
                CREATE TABLE conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    model TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'ollama',
                    assistant_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE assistants (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    system_prompt TEXT NOT NULL,
                    model TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'ollama',
                    avatar_color TEXT NOT NULL DEFAULT '#10a37f',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            )
            .expect("seed old schema");

            conn.execute(
                "INSERT INTO conversations (id, title, model, provider, assistant_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "c1",
                    "Conversation",
                    "llama3.2",
                    "ollama",
                    Option::<String>::None,
                    "2026-01-01T00:00:00Z",
                    "2026-01-01T00:00:00Z",
                ],
            )
            .expect("insert conversation");
        }

        let db = Database::new(
            db_path
                .to_str()
                .expect("temporary database path should be valid UTF-8"),
        )
        .expect("open database should run migrations");

        let saved = db
            .save_message(
                "m1",
                "c1",
                "user",
                "hello",
                "2026-01-01T00:00:01Z",
                false,
            )
            .expect("save_message should succeed on migrated schema");

        assert!(!saved.used_web);

        let _ = fs::remove_file(&db_path);
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Assistant {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub model: String,
    pub provider: String,
    pub avatar_color: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub openai_api_key: String,
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub xai_api_key: String,
    pub default_model: String,
    pub default_provider: String,
    pub ollama_url: String,
    pub theme: String,
    pub show_full_model_picker: bool,
    pub web_search_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            xai_api_key: String::new(),
            default_model: "llama3.2".to_string(),
            default_provider: "ollama".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            theme: "dark".to_string(),
            show_full_model_picker: false,
            web_search_enabled: true,
        }
    }
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database { conn };
        db.init_tables()?;
        db.run_migrations()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'ollama',
                assistant_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                used_web INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS assistants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                system_prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'ollama',
                avatar_color TEXT NOT NULL DEFAULT '#10a37f',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    // ── Conversations ────────────────────────────────────────────────────────

    pub fn get_conversations(&self) -> Result<Vec<Conversation>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, model, provider, assistant_id, created_at, updated_at
             FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                model: row.get(2)?,
                provider: row.get(3)?,
                assistant_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_conversation(&self, id: &str) -> Result<Conversation> {
        self.conn
            .query_row(
                "SELECT id, title, model, provider, assistant_id, created_at, updated_at
                 FROM conversations WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Conversation {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        model: row.get(2)?,
                        provider: row.get(3)?,
                        assistant_id: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn create_conversation(
        &self,
        id: &str,
        title: &str,
        model: &str,
        provider: &str,
        assistant_id: Option<&str>,
        now: &str,
    ) -> Result<Conversation> {
        self.conn.execute(
            "INSERT INTO conversations (id, title, model, provider, assistant_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, model, provider, assistant_id, now, now],
        )?;
        Ok(Conversation {
            id: id.to_string(),
            title: title.to_string(),
            model: model.to_string(),
            provider: provider.to_string(),
            assistant_id: assistant_id.map(|s| s.to_string()),
            created_at: now.to_string(),
            updated_at: now.to_string(),
        })
    }

    pub fn update_conversation_title(&self, id: &str, title: &str, now: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, id],
        )?;
        Ok(())
    }

    pub fn touch_conversation(&self, id: &str, now: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    fn run_migrations(&self) -> Result<()> {
        self.ensure_messages_used_web_column()?;
        Ok(())
    }

    fn messages_has_column(&self, column_name: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(messages)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        for row in rows {
            if row?.eq_ignore_ascii_case(column_name) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn ensure_messages_used_web_column(&self) -> Result<()> {
        if !self.messages_has_column("used_web")? {
            self.conn.execute(
                "ALTER TABLE messages ADD COLUMN used_web INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        Ok(())
    }

    pub fn set_conversation_model_provider(
        &self,
        id: &str,
        model: &str,
        provider: &str,
        now: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE conversations SET model = ?1, provider = ?2, updated_at = ?3 WHERE id = ?4",
            params![model, provider, now, id],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn rename_conversation(&self, id: &str, title: &str, now: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, id],
        )?;
        Ok(())
    }

    // ── Messages ─────────────────────────────────────────────────────────────

    pub fn get_messages(&self, conversation_id: &str) -> Result<Vec<Message>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, conversation_id, role, content, created_at, used_web
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                used_web: row.get::<_, i64>(5).unwrap_or(0) != 0,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn save_message(
        &self,
        id: &str,
        conversation_id: &str,
        role: &str,
        content: &str,
        now: &str,
        used_web: bool,
    ) -> Result<Message> {
        self.conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at, used_web) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, conversation_id, role, content, now, if used_web { 1 } else { 0 }],
        )?;
        Ok(Message {
            id: id.to_string(),
            conversation_id: conversation_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            created_at: now.to_string(),
            used_web,
        })
    }

    // ── Assistants ────────────────────────────────────────────────────────────

    pub fn get_assistants(&self) -> Result<Vec<Assistant>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, system_prompt, model, provider, avatar_color, created_at
             FROM assistants ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Assistant {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                model: row.get(4)?,
                provider: row.get(5)?,
                avatar_color: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_assistant(&self, id: &str) -> Result<Assistant> {
        self.conn.query_row(
            "SELECT id, name, description, system_prompt, model, provider, avatar_color, created_at
             FROM assistants WHERE id = ?1",
            params![id],
            |row| {
                Ok(Assistant {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    system_prompt: row.get(3)?,
                    model: row.get(4)?,
                    provider: row.get(5)?,
                    avatar_color: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .map_err(Into::into)
    }

    pub fn create_assistant(&self, a: &Assistant) -> Result<()> {
        self.conn.execute(
            "INSERT INTO assistants (id, name, description, system_prompt, model, provider, avatar_color, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![a.id, a.name, a.description, a.system_prompt, a.model, a.provider, a.avatar_color, a.created_at],
        )?;
        Ok(())
    }

    pub fn update_assistant(&self, a: &Assistant) -> Result<()> {
        self.conn.execute(
            "UPDATE assistants SET name=?1, description=?2, system_prompt=?3, model=?4, provider=?5, avatar_color=?6
             WHERE id = ?7",
            params![a.name, a.description, a.system_prompt, a.model, a.provider, a.avatar_color, a.id],
        )?;
        Ok(())
    }

    pub fn delete_assistant(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM assistants WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    pub fn get_settings(&self) -> Result<Settings> {
        let defaults = Settings::default();
        let mut settings = defaults.clone();
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (key, value) = row?;
            match key.as_str() {
                "openai_api_key" => settings.openai_api_key = value,
                "anthropic_api_key" => settings.anthropic_api_key = value,
                "groq_api_key" => settings.groq_api_key = value,
                "xai_api_key" => settings.xai_api_key = value,
                "default_model" if !value.is_empty() => settings.default_model = value,
                "default_provider" if !value.is_empty() => settings.default_provider = value,
                "ollama_url" if !value.is_empty() => settings.ollama_url = value,
                "theme" if !value.is_empty() => settings.theme = value,
                "show_full_model_picker" => {
                    settings.show_full_model_picker = match value.trim().to_ascii_lowercase().as_str()
                    {
                        "1" | "true" | "yes" | "on" => true,
                        "0" | "false" | "no" | "off" => false,
                        _ => defaults.show_full_model_picker,
                    }
                }
                "web_search_enabled" => {
                    settings.web_search_enabled = match value.trim().to_ascii_lowercase().as_str() {
                        "1" | "true" | "yes" | "on" => true,
                        "0" | "false" | "no" | "off" => false,
                        _ => defaults.web_search_enabled,
                    }
                }
                _ => {}
            }
        }

        Ok(settings)
    }

    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        let pairs: Vec<(&str, String)> = vec![
            ("openai_api_key", s.openai_api_key.clone()),
            ("anthropic_api_key", s.anthropic_api_key.clone()),
            ("groq_api_key", s.groq_api_key.clone()),
            ("xai_api_key", s.xai_api_key.clone()),
            ("default_model", s.default_model.clone()),
            ("default_provider", s.default_provider.clone()),
            ("ollama_url", s.ollama_url.clone()),
            ("theme", s.theme.clone()),
            (
                "show_full_model_picker",
                if s.show_full_model_picker { "1".to_string() } else { "0".to_string() },
            ),
            (
                "web_search_enabled",
                if s.web_search_enabled { "1".to_string() } else { "0".to_string() },
            ),
        ];
        for (key, value) in pairs {
            self.conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
        }
        Ok(())
    }
}
