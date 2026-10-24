import { platform } from '@tauri-apps/plugin-os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CORE_SETTINGS, getCoreSettingsForPlatform } from './coreSettings';

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn(() => 'linux'),
}));

const mockedPlatform = vi.mocked(platform);

const idsOf = (definitions: typeof CORE_SETTINGS) =>
  definitions.map((definition) => definition.id);

describe('getCoreSettingsForPlatform', () => {
  beforeEach(() => {
    mockedPlatform.mockReturnValue('linux');
  });

  it('registers every setting on desktop', () => {
    expect(getCoreSettingsForPlatform()).toEqual(CORE_SETTINGS);
  });

  it('drops settings whose module is not in the mobile binary', () => {
    mockedPlatform.mockReturnValue('android');

    const ids = idsOf(getCoreSettingsForPlatform());

    expect(ids).not.toContain('integrations.mcp.enabled');
    expect(ids).not.toContain('integrations.mpd.enabled');
    expect(ids).not.toContain('integrations.jam.enabled');
    expect(ids).not.toContain('integrations.discord.enabled');
  });

  it('keeps the update settings, since Android updates itself from its releases', () => {
    mockedPlatform.mockReturnValue('android');

    const ids = idsOf(getCoreSettingsForPlatform());

    expect(ids).toContain('updates.checkForUpdates');
    expect(ids).toContain('updates.autoInstall');
  });

  it('drops window chrome settings that have no window on mobile', () => {
    mockedPlatform.mockReturnValue('android');

    const ids = idsOf(getCoreSettingsForPlatform());

    expect(ids).not.toContain('appearance.framelessWindow');
    expect(ids).not.toContain('appearance.customTitleBar');
    expect(ids).not.toContain('appearance.titleBarStyle');
  });

  it('keeps the settings that work everywhere', () => {
    mockedPlatform.mockReturnValue('android');

    const ids = idsOf(getCoreSettingsForPlatform());

    expect(ids).toContain('general.language');
    expect(ids).toContain('history.enabled');
    expect(ids).toContain('plugins.autoUpdate');
    expect(ids).toContain('playback.crossfadeMs');
    expect(ids).toContain('theme.dark');
  });

  it('only ever removes settings, never invents them', () => {
    mockedPlatform.mockReturnValue('android');

    const ids = new Set(idsOf(CORE_SETTINGS));

    expect(idsOf(getCoreSettingsForPlatform()).every((id) => ids.has(id))).toBe(
      true,
    );
  });
});
