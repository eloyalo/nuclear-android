import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Badge } from '@nuclearplayer/ui';

import { getSetting } from '../stores/settingsStore';
import { useUpdaterStore } from '../stores/updaterStore';

export const UpdateBadge: FC = () => {
  const { t } = useTranslation('updater');
  const isUpdateAvailable = useUpdaterStore((state) => state.isUpdateAvailable);
  const isDownloading = useUpdaterStore((state) => state.isDownloading);
  const isReadyToRestart = useUpdaterStore((state) => state.isReadyToRestart);
  const downloadProgress = useUpdaterStore((state) => state.downloadProgress);
  const downloadUpdate = useUpdaterStore((state) => state.downloadUpdate);
  const restartToUpdate = useUpdaterStore((state) => state.restartToUpdate);
  const isAndroidUpdate = useUpdaterStore(
    (state) => state.androidUpdate !== null,
  );
  const needsInstallPermission = useUpdaterStore(
    (state) => state.needsInstallPermission,
  );

  if (isReadyToRestart) {
    const label = needsInstallPermission
      ? t('allowInstalls')
      : t(isAndroidUpdate ? 'clickToInstall' : 'clickToRestart');

    return (
      <Badge
        data-testid="update-badge"
        variant="pill"
        color="green"
        animated
        className="ml-2 cursor-pointer"
        onClick={restartToUpdate}
      >
        {label}
      </Badge>
    );
  }

  if (isDownloading) {
    return (
      <Badge
        data-testid="update-badge"
        variant="pill"
        color="green"
        className="ml-2"
      >
        {isAndroidUpdate
          ? t('downloadingNoProgress')
          : t('downloading', { progress: downloadProgress })}
      </Badge>
    );
  }

  if (isUpdateAvailable) {
    const autoInstall = getSetting('core.updates.autoInstall');

    if (autoInstall) {
      return (
        <Badge
          data-testid="update-badge"
          variant="pill"
          color="green"
          animated
          className="ml-2"
        >
          {t('updateAvailable')}
        </Badge>
      );
    }

    return (
      <Badge
        data-testid="update-badge"
        variant="pill"
        color="green"
        className="ml-2 cursor-pointer"
        onClick={downloadUpdate}
      >
        {t('clickToUpdate')}
      </Badge>
    );
  }

  return null;
};
