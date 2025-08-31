// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;
mod data;
mod downloader;
mod commands;



fn main() {
    tauri::Builder::default()
            .invoke_handler(tauri::generate_handler![
        commands::quick_download,
        commands::download_with_progress,
        commands::run_script,
        commands::run_script_playground,
        commands::get_installed_scripts,
        commands::save_script,
        commands::get_script,
        commands::delete_script,
        commands::get_settings,
        commands::save_settings_cmd,
        commands::pick_directory,
        commands::get_download_history,
        commands::get_download_session_details,
        commands::open_file_in_system,
        commands::delete_file_at_path
        ,commands::record_failed_download
        ,commands::delete_download_session
        ,commands::start_download_session
        ,commands::cancel_download_session
        ,commands::pause_download_session
        ,commands::resume_download_session
        ,commands::setup_python_environment
        ,commands::install_python_packages
        ,commands::check_python_packages
        ,commands::install_python_essentials
        ,commands::detect_scripts_for_url
    ])
        .setup(|app| {
            // Initialize app state
            let app_handle = app.handle();
            
            // Create necessary directories
            let data_dir = app.path_resolver().app_data_dir().unwrap();
            std::fs::create_dir_all(&data_dir).unwrap();
            // attempt to migrate legacy JSON history into persistent DB (best-effort)
            let _ = commands::migrate_json_history_to_db(app_handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
