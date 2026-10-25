mod ai;
mod anilist;

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
        Migration {
            version: 3,
            description: "anime_details_and_art",
            sql: include_str!("../migrations/003_details_and_art.sql"),
            kind: MigrationKind::Up,
        },
    ];

    // This URL must stay identical to DB_URL in src/lib/db.ts. The plugin maps the name
    // onto app_config_dir(), so migrations and queries always touch the same file in
    // %APPDATA%\com.hardtek.animemedialibrary\, independent of the working directory.
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
            anilist::anilist_lookup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
