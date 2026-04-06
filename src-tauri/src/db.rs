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
    pub default_model: String,
    pub default_provider: String,
    pub ollama_url: String,
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            default_model: "llama3.2".to_string(),
            default_provider: "ollama".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            theme: "dark".to_string(),
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
        Ok(rows.filter_map(|r| r.ok()).collect())
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
            "SELECT id, conversation_id, role, content, created_at
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn save_message(
        &self,
        id: &str,
        conversation_id: &str,
        role: &str,
        content: &str,
        now: &str,
    ) -> Result<Message> {
        self.conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, conversation_id, role, content, now],
        )?;
        Ok(Message {
            id: id.to_string(),
            conversation_id: conversation_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            created_at: now.to_string(),
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
        Ok(rows.filter_map(|r| r.ok()).collect())
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
        let get = |key: &str| -> String {
            self.conn
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    params![key],
                    |row| row.get::<_, String>(0),
                )
                .unwrap_or_default()
        };

        let defaults = Settings::default();
        Ok(Settings {
            openai_api_key: get("openai_api_key"),
            anthropic_api_key: get("anthropic_api_key"),
            groq_api_key: get("groq_api_key"),
            default_model: {
                let v = get("default_model");
                if v.is_empty() { defaults.default_model } else { v }
            },
            default_provider: {
                let v = get("default_provider");
                if v.is_empty() { defaults.default_provider } else { v }
            },
            ollama_url: {
                let v = get("ollama_url");
                if v.is_empty() { defaults.ollama_url } else { v }
            },
            theme: {
                let v = get("theme");
                if v.is_empty() { defaults.theme } else { v }
            },
        })
    }

    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        let pairs = [
            ("openai_api_key", &s.openai_api_key),
            ("anthropic_api_key", &s.anthropic_api_key),
            ("groq_api_key", &s.groq_api_key),
            ("default_model", &s.default_model),
            ("default_provider", &s.default_provider),
            ("ollama_url", &s.ollama_url),
            ("theme", &s.theme),
        ];
        for (key, value) in &pairs {
            self.conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
        }
        Ok(())
    }
}
