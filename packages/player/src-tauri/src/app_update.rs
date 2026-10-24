use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Wry};

#[derive(Deserialize)]
struct CanInstall {
    value: bool,
}

#[derive(Serialize)]
struct InstallArgs {
    path: String,
}

pub struct AppUpdate(Option<PluginHandle<Wry>>);

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("app-update")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle =
                Some(api.register_android_plugin("com.nuclearplayer", "AppUpdatePlugin")?);
            #[cfg(not(target_os = "android"))]
            let handle = {
                let _ = api;
                None
            };

            app.manage(AppUpdate(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
#[specta::specta]
pub async fn app_update_can_install(update: tauri::State<'_, AppUpdate>) -> Result<bool, String> {
    let can_install: CanInstall = run(&update, "canInstall", serde_json::json!({})).await?;
    Ok(can_install.value)
}

#[tauri::command]
#[specta::specta]
pub async fn app_update_open_install_settings(
    update: tauri::State<'_, AppUpdate>,
) -> Result<(), String> {
    run::<serde_json::Value>(&update, "openInstallSettings", serde_json::json!({}))
        .await
        .map(|_| ())
}

#[tauri::command]
#[specta::specta]
pub async fn app_update_install(
    update: tauri::State<'_, AppUpdate>,
    path: String,
) -> Result<(), String> {
    run::<serde_json::Value>(&update, "install", InstallArgs { path })
        .await
        .map(|_| ())
}

async fn run<Response: serde::de::DeserializeOwned>(
    update: &AppUpdate,
    command: &str,
    payload: impl Serialize,
) -> Result<Response, String> {
    let Some(handle) = &update.0 else {
        return Err("Updating the app from inside is only available on Android".to_string());
    };

    handle
        .run_mobile_plugin_async::<Response>(command, payload)
        .await
        .map_err(|error| error.to_string())
}
