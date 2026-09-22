import { createRootRoute } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CableIcon,
  DiscIcon,
  GaugeIcon,
  HistoryIcon,
  ListMusicIcon,
  MusicIcon,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import { useEffect } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import {
  PlayerShell,
  PlayerWorkspace,
  RouteTransition,
  SidebarNavigation,
  SidebarNavigationItem,
  Toaster,
} from '@nuclearplayer/ui';

import { ConnectedPlayerBar } from '../components/ConnectedPlayerBar';
import {
  ConnectedQueuePanel,
  QueueHeaderActions,
} from '../components/ConnectedQueuePanel';
import { ConnectedSettingsModal } from '../components/ConnectedSettingsModal';
import { ConnectedThemeController } from '../components/ConnectedThemeController';
import { ConnectedTitleBar } from '../components/ConnectedTitleBar';
import { ConnectedTopBar } from '../components/ConnectedTopBar';
import { DevTools } from '../components/DevTools';
import { FlatpakWarningBanner } from '../components/FlatpakWarningBanner';
import { SoundProvider } from '../components/SoundProvider';
import { StreamResolver } from '../components/StreamResolver';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout';
import { GlobalShortcuts } from '../shortcuts';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { useStartupStore } from '../stores/startupStore';
import { isMobile } from '../utils/platform';

const RootComponent = () => {
  const { t } = useTranslation('navigation');
  const { t: tPrefs } = useTranslation('preferences');
  const { isCompact, openDrawer, closeDrawer, left, right } =
    useWorkspaceLayout();
  const openSettings = useSettingsModalStore((state) => state.open);
  const isSettingsOpen = useSettingsModalStore((state) => state.isOpen);
  const closeSettings = useSettingsModalStore((state) => state.close);
  const isSettingsNavOpen = useSettingsModalStore((state) => state.isNavOpen);
  const setSettingsNavOpen = useSettingsModalStore((state) => state.setNavOpen);
  const isStartingUp = useStartupStore((state) => state.isStartingUp);

  // Android's back button peels off whatever overlay is on top before it starts
  // unwinding the route history.
  useAndroidBackHandler(() => {
    if (isSettingsNavOpen) {
      setSettingsNavOpen(false);
      return true;
    }
    if (isSettingsOpen) {
      closeSettings();
      return true;
    }
    if (openDrawer !== null) {
      closeDrawer();
      return true;
    }
    return false;
  });

  const closeDrawerOnNavigate = isCompact ? closeDrawer : undefined;

  useEffect(() => {
    // The window starts hidden to avoid a flash of unstyled content; Android
    // has no such window and lacks the core:window:* mobile capability.
    if (isMobile()) {
      return;
    }
    const window = getCurrentWindow();
    window.show().then(() => window.setFocus());
  }, []);

  return (
    <PlayerShell onContextMenu={(e) => e.preventDefault()}>
      <GlobalShortcuts />
      <div>
        <ConnectedTitleBar />
        <FlatpakWarningBanner />
        <ConnectedTopBar />
      </div>
      {!isStartingUp && <StreamResolver />}
      <SoundProvider>
        <PlayerWorkspace>
          <PlayerWorkspace.LeftSidebar
            {...left}
            persistentFooter={isCompact ? <ConnectedThemeController /> : null}
          >
            <SidebarNavigation isCompact={!isCompact && left.isCollapsed}>
              <div
                className="flex flex-1 flex-col gap-2 overflow-y-auto"
                onClick={closeDrawerOnNavigate}
              >
                <SidebarNavigationItem
                  to="/dashboard"
                  icon={<GaugeIcon />}
                  label={t('dashboard')}
                />
                <SidebarNavigationItem
                  to="/favorites/albums"
                  icon={<DiscIcon />}
                  label={t('favoriteAlbums')}
                />
                <SidebarNavigationItem
                  to="/favorites/tracks"
                  icon={<MusicIcon />}
                  label={t('favoriteTracks')}
                />
                <SidebarNavigationItem
                  to="/favorites/artists"
                  icon={<UserIcon />}
                  label={t('favoriteArtists')}
                />
                <SidebarNavigationItem
                  to="/playlists"
                  icon={<ListMusicIcon />}
                  label={t('playlists')}
                />
                <SidebarNavigationItem
                  to="/history"
                  icon={<HistoryIcon />}
                  label={t('history')}
                />
                <SidebarNavigationItem
                  to="/sources"
                  icon={<CableIcon />}
                  label={t('sources')}
                />
              </div>
              <SidebarNavigationItem
                icon={<SettingsIcon />}
                label={tPrefs('title')}
                onClick={() => {
                  closeDrawerOnNavigate?.();
                  openSettings();
                }}
              />
            </SidebarNavigation>
          </PlayerWorkspace.LeftSidebar>

          <PlayerWorkspace.Main>
            <RouteTransition />
          </PlayerWorkspace.Main>

          <PlayerWorkspace.RightSidebar
            {...right}
            headerActions={<QueueHeaderActions />}
          >
            <ConnectedQueuePanel
              isCollapsed={!isCompact && right.isCollapsed}
            />
          </PlayerWorkspace.RightSidebar>
        </PlayerWorkspace>
      </SoundProvider>

      <ConnectedPlayerBar />
      <Toaster />
      <ConnectedSettingsModal />
      <DevTools />
    </PlayerShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
