import { invoke } from '@tauri-apps/api/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useSettingsStore } from '../stores/settingsStore';
import { useUpdaterStore } from '../stores/updaterStore';
import { FetchMock } from '../test/mocks/fetch';
import { UpdateBadge } from './UpdateBadge';

const RELEASES_URL =
  'api.github.com/repos/eloyalo/nuclear-android/releases/latest';

type InstallerState = {
  canInstall: boolean;
  downloadFails: boolean;
};

const installer: InstallerState = { canInstall: true, downloadFails: false };

export const invokedCommands = () =>
  vi.mocked(invoke).mock.calls.map(([command]) => command);

export const UpdateBadgeWrapper = {
  reset() {
    installer.canInstall = true;
    installer.downloadFails = false;
    FetchMock.reset();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command) => {
      switch (command) {
        case 'app_update_can_install':
          return installer.canInstall;
        case 'download_file':
          if (installer.downloadFails) {
            throw new Error('network down');
          }
          return null;
        default:
          return null;
      }
    });

    useUpdaterStore.setState({
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
    });
    useSettingsStore.setState({ values: {}, definitions: {}, loaded: true });
  },

  mount() {
    return render(<UpdateBadge />);
  },

  get badge() {
    return screen.queryByTestId('update-badge');
  },

  async clickBadge() {
    await userEvent.click(await screen.findByTestId('update-badge'));
  },

  setAutoInstall(enabled: boolean) {
    useSettingsStore.setState({
      values: {
        ...useSettingsStore.getState().values,
        'core.updates.autoInstall': enabled,
      },
    });
  },

  denyInstalls() {
    installer.canInstall = false;
  },

  allowInstalls() {
    installer.canInstall = true;
  },

  failDownloads() {
    installer.downloadFails = true;
  },

  fixtures: {
    latestRelease(name: string, options?: { withApk?: boolean }) {
      const withApk = options?.withApk ?? true;
      FetchMock.set(RELEASES_URL, {
        name,
        body: 'Playlists can be reordered.',
        assets: withApk
          ? [
              {
                name: 'nuclear-debug-arm64.apk',
                browser_download_url: 'https://example.test/debug.apk',
              },
              {
                name: 'nuclear-android.apk',
                browser_download_url:
                  'https://example.test/nuclear-android.apk',
              },
            ]
          : [],
      });
    },
  },
};
