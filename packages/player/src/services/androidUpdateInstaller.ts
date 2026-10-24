import { invoke } from '@tauri-apps/api/core';
import { appCacheDir, join } from '@tauri-apps/api/path';

import { downloadFile } from './tauri/commands';

export const canInstallApk = (): Promise<boolean> =>
  invoke<boolean>('app_update_can_install');

export const openInstallSettings = (): Promise<void> =>
  invoke('app_update_open_install_settings');

export const installApk = (path: string): Promise<void> =>
  invoke('app_update_install', { path });

export const downloadApk = async (url: string): Promise<string> => {
  const path = await join(await appCacheDir(), 'update', 'nuclear-android.apk');
  await downloadFile(url, path);
  return path;
};
