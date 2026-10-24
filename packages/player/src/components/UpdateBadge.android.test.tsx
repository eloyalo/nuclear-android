import { screen } from '@testing-library/react';

import { useUpdaterStore } from '../stores/updaterStore';
import {
  invokedCommands,
  UpdateBadgeWrapper,
} from './UpdateBadge.test-wrapper';

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => 'android',
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: async () => '1.51.2',
}));

vi.mock('@tauri-apps/api/path', () => ({
  appCacheDir: async () => '/data/cache',
  join: async (...parts: string[]) => parts.join('/'),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

beforeEach(() => {
  UpdateBadgeWrapper.reset();
});

describe('Android update badge', () => {
  it('shows nothing when the latest release is the installed version', async () => {
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.51.2');
    UpdateBadgeWrapper.mount();

    await useUpdaterStore.getState().checkForUpdate();

    expect(UpdateBadgeWrapper.badge).not.toBeInTheDocument();
  });

  it('offers the update when a newer release is out', async () => {
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0');
    UpdateBadgeWrapper.mount();

    await useUpdaterStore.getState().checkForUpdate();

    expect(await screen.findByText('Click to update')).toBeInTheDocument();
  });

  it('ignores a release that has no APK attached', async () => {
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0', {
      withApk: false,
    });
    UpdateBadgeWrapper.mount();

    await useUpdaterStore.getState().checkForUpdate();

    expect(UpdateBadgeWrapper.badge).not.toBeInTheDocument();
  });

  it('downloads the release APK and installs it with one tap', async () => {
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0');
    UpdateBadgeWrapper.mount();
    await useUpdaterStore.getState().checkForUpdate();

    await UpdateBadgeWrapper.clickBadge();

    expect(invokedCommands()).toEqual([
      'download_file',
      'app_update_can_install',
      'app_update_install',
    ]);
  });

  it('asks to allow installs first, then installs the APK it already has', async () => {
    UpdateBadgeWrapper.denyInstalls();
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0');
    UpdateBadgeWrapper.mount();
    await useUpdaterStore.getState().checkForUpdate();

    await UpdateBadgeWrapper.clickBadge();
    expect(
      await screen.findByText('Allow installs, then tap here'),
    ).toBeInTheDocument();
    expect(invokedCommands()).toContain('app_update_open_install_settings');

    UpdateBadgeWrapper.allowInstalls();
    await UpdateBadgeWrapper.clickBadge();

    expect(
      invokedCommands().filter((command) => command === 'download_file'),
    ).toHaveLength(1);
    expect(invokedCommands()).toContain('app_update_install');
  });

  it('with auto-install it downloads in the background and waits for a tap to install', async () => {
    UpdateBadgeWrapper.setAutoInstall(true);
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0');
    UpdateBadgeWrapper.mount();

    await useUpdaterStore.getState().checkForUpdate();

    expect(await screen.findByText('Click to install')).toBeInTheDocument();
    expect(invokedCommands()).not.toContain('app_update_install');
  });

  it('stays on "Click to update" when the download fails so it can be retried', async () => {
    UpdateBadgeWrapper.failDownloads();
    UpdateBadgeWrapper.fixtures.latestRelease('Nuclear for Android 1.52.0');
    UpdateBadgeWrapper.mount();
    await useUpdaterStore.getState().checkForUpdate();

    await UpdateBadgeWrapper.clickBadge();

    expect(await screen.findByText('Click to update')).toBeInTheDocument();
    expect(invokedCommands()).not.toContain('app_update_install');
  });
});
