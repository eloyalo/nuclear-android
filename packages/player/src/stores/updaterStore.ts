import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import gt from 'semver/functions/gt';
import { create } from 'zustand';

import {
  androidReleaseApi,
  type AndroidRelease,
} from '../apis/androidReleaseApi';
import {
  canInstallApk,
  downloadApk,
  installApk,
  openInstallSettings,
} from '../services/androidUpdateInstaller';
import { Logger } from '../services/logger';
import { errorMessage } from '../utils/errorMessage';
import { reportError } from '../utils/logging';
import { isAndroid } from '../utils/platform';
import { getSetting } from './settingsStore';

type UpdaterState = {
  isUpdateAvailable: boolean;
  updateInfo: Update | null;
  androidUpdate: AndroidRelease | null;
  androidApkPath: string | null;
  needsInstallPermission: boolean;
  lastChecked: Date | null;
  isChecking: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  isReadyToRestart: boolean;
  downloadProgress: number;
  error: string | null;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  checkForAndroidUpdate: () => Promise<void>;
  downloadAndroidUpdate: (options: { thenInstall: boolean }) => Promise<void>;
  installAndroidUpdate: () => Promise<void>;
};

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  isUpdateAvailable: false,
  updateInfo: null,
  androidUpdate: null,
  androidApkPath: null,
  needsInstallPermission: false,
  lastChecked: null,
  isChecking: false,
  isDownloading: false,
  isInstalling: false,
  isReadyToRestart: false,
  downloadProgress: 0,
  error: null,

  checkForUpdate: async () => {
    const checkEnabled = getSetting('core.updates.checkForUpdates');
    if (checkEnabled === false) {
      return;
    }

    if (isAndroid()) {
      return get().checkForAndroidUpdate();
    }

    set({ isChecking: true, error: null });
    try {
      const update = await check();
      set({
        isUpdateAvailable: update !== null,
        updateInfo: update,
        lastChecked: new Date(),
        isChecking: false,
        error: null,
      });

      if (update !== null) {
        const autoInstall = getSetting('core.updates.autoInstall');
        if (autoInstall === true) {
          await get().downloadUpdate();
        }
      }
    } catch (error) {
      const message = errorMessage(error);

      Logger.updates.error(`Failed to check for updates: ${message}`);
      set({
        isChecking: false,
        lastChecked: new Date(),
        error: errorMessage(error),
      });
    }
  },

  downloadUpdate: async () => {
    if (get().androidUpdate) {
      return get().downloadAndroidUpdate({ thenInstall: true });
    }

    const { updateInfo } = get();
    if (!updateInfo) {
      return;
    }

    set({ isDownloading: true, downloadProgress: 0, error: null });
    let totalSize = 0;
    let downloadedSize = 0;
    try {
      await updateInfo.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalSize = event.data.contentLength;
          set({ downloadProgress: 0 });
        } else if (event.event === 'Progress') {
          downloadedSize += event.data.chunkLength;
          const percentage =
            totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
          set({ downloadProgress: percentage });
        } else if (event.event === 'Finished') {
          set({
            isDownloading: false,
            isInstalling: false,
            isReadyToRestart: true,
            downloadProgress: 100,
          });
        }
      });
    } catch (error) {
      const message = errorMessage(error);
      Logger.updates.error(`Failed to download/install update: ${message}`);
      set({
        isDownloading: false,
        isInstalling: false,
        error: message,
      });
    }
  },

  restartToUpdate: async () => {
    if (get().androidUpdate) {
      return get().installAndroidUpdate();
    }

    try {
      await relaunch();
    } catch (error) {
      await reportError('updates', {
        userMessage: 'Failed to restart for update',
        error,
      });
      set({ error: errorMessage(error) });
    }
  },

  checkForAndroidUpdate: async () => {
    set({ isChecking: true, error: null });
    try {
      const [release, currentVersion] = await Promise.all([
        androidReleaseApi.fetchLatest(),
        getVersion(),
      ]);
      const update =
        release !== null && gt(release.version, currentVersion)
          ? release
          : null;

      set({
        isUpdateAvailable: update !== null,
        androidUpdate: update,
        lastChecked: new Date(),
        isChecking: false,
        error: null,
      });

      if (update !== null && getSetting('core.updates.autoInstall') === true) {
        await get().downloadAndroidUpdate({ thenInstall: false });
      }
    } catch (error) {
      const message = errorMessage(error);
      Logger.updates.error(`Failed to check for Android updates: ${message}`);
      set({ isChecking: false, lastChecked: new Date(), error: message });
    }
  },

  downloadAndroidUpdate: async ({ thenInstall }) => {
    const { androidUpdate } = get();
    if (!androidUpdate) {
      return;
    }

    set({ isDownloading: true, downloadProgress: 0, error: null });
    try {
      const path = await downloadApk(androidUpdate.apkUrl);
      set({
        isDownloading: false,
        isReadyToRestart: true,
        androidApkPath: path,
        downloadProgress: 100,
      });
    } catch (error) {
      const message = errorMessage(error);
      Logger.updates.error(`Failed to download Android update: ${message}`);
      set({ isDownloading: false, error: message });
      return;
    }

    if (thenInstall) {
      await get().installAndroidUpdate();
    }
  },

  installAndroidUpdate: async () => {
    const { androidApkPath } = get();
    if (!androidApkPath) {
      return;
    }

    try {
      if (!(await canInstallApk())) {
        set({ needsInstallPermission: true });
        await openInstallSettings();
        return;
      }

      set({ needsInstallPermission: false, isInstalling: true });
      await installApk(androidApkPath);
    } catch (error) {
      await reportError('updates', {
        userMessage: 'Failed to install the update',
        error,
      });
      set({ error: errorMessage(error) });
    } finally {
      set({ isInstalling: false });
    }
  },
}));
