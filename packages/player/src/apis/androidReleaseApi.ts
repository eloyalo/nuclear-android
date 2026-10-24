import { z } from 'zod';

import { Logger } from '../services/logger';
import { ApiClient } from './ApiClient';

const RELEASES_URL = 'https://api.github.com/repos/eloyalo/nuclear-android';
export const ANDROID_APK_ASSET = 'nuclear-android.apk';

const ReleaseSchema = z.object({
  name: z.string().nullable(),
  body: z.string().nullable(),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.string(),
    }),
  ),
});

export type AndroidRelease = {
  version: string;
  notes: string;
  apkUrl: string;
};

// Releases are named "Nuclear for Android 1.51.2": the version at the end is the
// Nuclear version the build is based on, which is also the app's versionName.
const VERSION_AT_END = /(\d+\.\d+\.\d+)\s*$/;

class AndroidReleaseApi extends ApiClient {
  async fetchLatest(): Promise<AndroidRelease | null> {
    const release = await this.fetch('/releases/latest', ReleaseSchema);

    const version = release.name?.match(VERSION_AT_END)?.[1];
    const apk = release.assets.find(
      (asset) => asset.name === ANDROID_APK_ASSET,
    );
    if (!version || !apk) {
      Logger.updates.warn(
        `Latest Android release "${release.name}" has no version or no ${ANDROID_APK_ASSET}`,
      );
      return null;
    }

    return {
      version,
      notes: release.body ?? '',
      apkUrl: apk.browser_download_url,
    };
  }
}

export const androidReleaseApi = new AndroidReleaseApi(RELEASES_URL);
