pub mod bridge;
pub mod commands;
pub mod db;
#[cfg(desktop)]
pub mod discord;
pub mod history;
pub mod http;
#[cfg(desktop)]
pub mod http_api;
#[cfg(mobile)]
pub mod innertube;
pub mod logging;
#[cfg(mobile)]
pub mod media_session;
#[cfg(desktop)]
pub mod mcp;
#[cfg(desktop)]
pub mod mpd;
pub mod net;
pub mod pagination;
mod setup;
pub mod stream_server;
pub mod tls;
#[cfg_attr(desktop, allow(dead_code))]
pub mod youtube_query;
pub mod ytdlp;
// yt-dlp is shipped as a downloaded binary, which Android doesn't allow us to
// execute. See ANDROID_PORT.md 3.1 for the replacement plan.
#[cfg(desktop)]
pub mod ytdlp_setup;

// Maximizes the window when running as a non-steam app in steam
#[cfg(target_os = "linux")]
fn maximize_for_gamescope(app: &tauri::App) {
    use tauri::Manager;

    let is_gamescope = std::env::var("GAMESCOPE_WAYLAND_DISPLAY").is_ok()
        || std::env::var("SteamDeck").map_or(false, |v| v == "1");

    if is_gamescope {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.maximize();
        }
    }
}

#[cfg(desktop)]
fn typescript_export_config() -> specta_typescript::Typescript {
    specta_typescript::Typescript::default().header("/* eslint-disable */")
}

// MPD, MCP, the local HTTP API and Discord presence are desktop integrations;
// they're left out of the mobile build entirely (see ANDROID_PORT.md 3.3).
#[cfg(desktop)]
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::is_flatpak,
        commands::copy_dir_recursive,
        commands::extract_zip,
        commands::download_file,
        http::http_fetch,
        ytdlp::ytdlp_search,
        ytdlp::ytdlp_get_stream,
        ytdlp::ytdlp_get_playlist,
        logging::get_startup_logs,
        mcp::mcp_start,
        mcp::mcp_stop,
        http_api::http_api_start,
        http_api::http_api_stop,
        mpd::mpd_start,
        mpd::mpd_stop,
        stream_server::stream_server_port,
        ytdlp_setup::ytdlp_ensure_installed,
        discord::discord_connect,
        discord::discord_disconnect,
        discord::discord_set_activity,
        discord::discord_clear_activity,
        bridge::bridge_respond,
        bridge::bridge_notify,
        history::commands::history_record_event,
        history::commands::history_fetch,
        history::commands::history_delete_range,
        history::commands::history_hourly_listening_time,
        history::commands::history_daily_listening_time,
        history::commands::history_first_play_at,
        history::commands::history_top_artists,
        history::commands::history_top_albums,
        history::commands::history_top_tracks
    ])
}

#[cfg(mobile)]
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::is_flatpak,
        commands::copy_dir_recursive,
        commands::extract_zip,
        commands::download_file,
        http::http_fetch,
        ytdlp::ytdlp_search,
        ytdlp::ytdlp_get_stream,
        ytdlp::ytdlp_get_playlist,
        logging::get_startup_logs,
        stream_server::stream_server_port,
        bridge::bridge_respond,
        bridge::bridge_notify,
        history::commands::history_record_event,
        history::commands::history_fetch,
        history::commands::history_delete_range,
        history::commands::history_hourly_listening_time,
        history::commands::history_daily_listening_time,
        history::commands::history_first_play_at,
        history::commands::history_top_artists,
        history::commands::history_top_albums,
        history::commands::history_top_tracks,
        media_session::media_session_update,
        media_session::media_session_clear
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = specta_builder();

    // Bindings are consumed by the frontend and generated from the desktop
    // command set, which is a superset of the mobile one.
    #[cfg(all(debug_assertions, desktop))]
    specta_builder
        .export(
            typescript_export_config(),
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/services/tauri/bindings.ts"
            ),
        )
        .expect("failed to export typescript bindings");

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_upload::init())
        .plugin(setup::log_plugin());

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        .difference(tauri_plugin_window_state::StateFlags::VISIBLE),
                )
                .build(),
        );

        let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
        if !is_flatpak {
            builder = builder
                .plugin(tauri_plugin_updater::Builder::new().build())
                .plugin(tauri_plugin_process::init());
        }
    }

    #[cfg(mobile)]
    {
        builder = builder.plugin(media_session::init());
    }

    builder
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app| {
            logging::mark_startup_complete();
            bridge::init_bridge(app.handle().clone());
            stream_server::init_stream_server(app.handle().clone());
            history::init_history(app.handle().clone());

            #[cfg(mobile)]
            innertube::init_innertube(app.handle().clone());

            #[cfg(desktop)]
            {
                mcp::init_mcp(app.handle().clone());
                mpd::init_mpd(app.handle().clone());
                http_api::init_http_api(app.handle().clone());
                discord::init_discord(app.handle().clone());
            }

            #[cfg(target_os = "linux")]
            maximize_for_gamescope(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
