import React from 'react';

import './styles/pluginOverrides.css';

import App from './App';
import { initLogStream } from './hooks/useLogStream';
import { applyThemeFromSettingsIfAny } from './services/advancedThemeService';
import { startAdvancedThemeWatcher } from './services/advancedThemeWatcher';
import { initBridgeHandler } from './services/bridge/bridgeHandler';
import { registerBuiltInCoreSettings } from './services/coreSettings';
import { initDiscordHandler } from './services/discordHandler';
import { initDiscoveryService } from './services/discoveryService';
import { initFailedTrackSkipper } from './services/failedTrackSkipper';
import { initHistoryService } from './services/history';
import { initHttpApiHandler } from './services/httpApi';
import {
  applyLanguageFromSettings,
  initLanguageWatcher,
} from './services/languageService';
import { loadMarketplaceThemes } from './services/marketplaceThemeDirService';
import { initMcpHandler } from './services/mcp';
import { initMediaSessionHandler } from './services/mediaSessionHandler';
import { initMpdHandler } from './services/mpd';
import { initNextTrackPreparation } from './services/nextTrackPreparation';
import { initPlaybackEventBridge } from './services/playbackEventBridge';
import { hydratePluginsFromRegistry } from './services/plugins/pluginBootstrap';
import { ytdlpEnsureInstalled } from './services/tauri/commands';
import { initializeFavoritesStore } from './stores/favoritesStore';
import { initializePlaylistStore } from './stores/playlistStore';
import { initializeQueueStore } from './stores/queueStore';
import { initializeSettingsStore } from './stores/settingsStore';
import { initializeShortcutsStore } from './stores/shortcutsStore';
import { initializeStreamVerificationStore } from './stores/streamVerificationStore';
import { hydrateThemeStore } from './stores/themeStore';
import { useUpdaterStore } from './stores/updaterStore';
import { isAndroid, isMobile, skipOnMobile } from './utils/platform';

const initializeStores = () =>
  initializeSettingsStore()
    .then(() => initializeShortcutsStore())
    .then(() => initializeQueueStore())
    .then(() => initializeFavoritesStore())
    .then(() => initializeStreamVerificationStore())
    .then(() => initializePlaylistStore());

const initRemoteControl = () =>
  Promise.resolve()
    .then(skipOnMobile(initMcpHandler))
    .then(skipOnMobile(initMpdHandler))
    .then(skipOnMobile(initHttpApiHandler))
    .then(() => initBridgeHandler());

const initLanguage = () =>
  applyLanguageFromSettings().then(() => initLanguageWatcher());

const initThemes = () =>
  startAdvancedThemeWatcher()
    .then(() => loadMarketplaceThemes())
    .then(() => hydrateThemeStore())
    .then(() => applyThemeFromSettingsIfAny());

const startBackgroundTasks = () => {
  void hydratePluginsFromRegistry();
  if (!isMobile()) {
    void useUpdaterStore.getState().checkForUpdate();
    void ytdlpEnsureInstalled();
  }
};

export const initPlayerApp = async (
  root: ReturnType<typeof import('react-dom/client').createRoot>,
) => {
  initLogStream();

  await initializeStores()
    .then(() => registerBuiltInCoreSettings())
    .then(() => initDiscoveryService())
    .then(() => initRemoteControl())
    .then(skipOnMobile(initDiscordHandler))
    .then(() => initPlaybackEventBridge())
    .then(() => (isAndroid() ? initMediaSessionHandler() : undefined))
    .then(() => initNextTrackPreparation())
    .then(() => initFailedTrackSkipper())
    .then(() => initHistoryService())
    .then(() => initLanguage())
    .then(() => initThemes())
    .then(() => startBackgroundTasks());

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  signalBootCompleteToAndroidWatchdog();
};

// MainActivity.kt starts a timer as soon as the webview is created and
// restarts the whole app if this never fires — see the comment above
// `installBootWatchdog` there for why: on some cold starts on Android, the
// Tauri IPC bridge comes up dead (every invoke() hangs forever, even one for
// a command that doesn't exist), so we never reach this line, and a plain
// page reload doesn't recover it — only a full process restart does. This
// interface deliberately bypasses Tauri's own IPC so it still works when
// that's the thing that's broken. A no-op everywhere else (desktop, iOS,
// tests), since the bridge is only ever injected on Android.
const signalBootCompleteToAndroidWatchdog = () => {
  (
    window as unknown as {
      __nuclearBootWatchdog?: { signalBootComplete?: () => void };
    }
  ).__nuclearBootWatchdog?.signalBootComplete?.();
};
