import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { ListMusicIcon, MenuIcon } from 'lucide-react';
import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import {
  Button,
  Tooltip,
  TopBar,
  TopBarLogo,
  TopBarNavigation,
} from '@nuclearplayer/ui';

import { useAppVersion } from '../hooks/useAppVersion';
import { useCanGoForward } from '../hooks/useCanGoForward';
import { useCoreSetting } from '../hooks/useCoreSetting';
import { useFramelessWindow } from '../hooks/useFramelessWindow';
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout';
import { ConnectedThemeController } from './ConnectedThemeController';
import { JamQrCodeButton } from './JamQrCodeButton';
import { SearchBox } from './SearchBox';
import { UpdateBadge } from './UpdateBadge';

const CompactTopBar: FC = () => {
  const { t } = useTranslation('navigation');
  const { t: tQueue } = useTranslation('queue');
  const { toggleDrawer } = useWorkspaceLayout();

  return (
    <>
      <TopBar>
        <Button
          size="icon"
          variant="text"
          aria-label={t('menu')}
          data-testid="mobile-navigation-toggle"
          onClick={() => toggleDrawer('navigation')}
        >
          <MenuIcon size={20} />
        </Button>
        <SearchBox />
        <Button
          size="icon"
          variant="text"
          aria-label={tQueue('title')}
          data-testid="mobile-queue-toggle"
          onClick={() => toggleDrawer('queue')}
        >
          <ListMusicIcon size={20} />
        </Button>
      </TopBar>
      <div className="flex justify-center py-1 empty:hidden">
        <UpdateBadge />
      </div>
    </>
  );
};

export const ConnectedTopBar: FC = () => {
  const router = useRouter();
  const { version } = useAppVersion();
  const canGoBack = useCanGoBack();
  const canGoForward = useCanGoForward();
  const frameless = useFramelessWindow();
  const { isCompact } = useWorkspaceLayout();
  const [isTitleBarEnabled] = useCoreSetting<boolean>(
    'appearance.customTitleBar',
  );

  // A phone has no room for window chrome, history arrows or the logo, and it
  // already has a system back button. It gets the drawer triggers instead.
  if (isCompact) {
    return <CompactTopBar />;
  }

  return (
    <TopBar draggable={frameless}>
      <div className="flex flex-row items-center gap-4">
        {!isTitleBarEnabled && (
          <Tooltip
            content={`Nuclear ${version}`}
            side="bottom"
            wrapperClassName="flex items-center"
          >
            <TopBarLogo />
          </Tooltip>
        )}
        <TopBarNavigation
          onBack={() => router.history.back()}
          onForward={() => router.history.forward()}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
        <UpdateBadge />
      </div>
      <SearchBox />
      <div className="flex flex-row items-center justify-end gap-2">
        <JamQrCodeButton />
        <ConnectedThemeController />
      </div>
    </TopBar>
  );
};
