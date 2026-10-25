mod ai;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_anime_and_season",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "anime_description",
            sql: include_str!("../migrations/002_anime_description.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:anime-library.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            ai::ai_has_key,
            ai::ai_set_key,
            ai::ai_clear_key,
            ai::ai_lookup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
