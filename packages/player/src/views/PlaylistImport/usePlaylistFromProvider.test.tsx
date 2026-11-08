import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';

import { providersHost } from '../../services/providersHost';
import { PlaylistBuilder } from '../../test/builders/PlaylistBuilder';
import { PlaylistProviderBuilder } from '../../test/builders/PlaylistProviderBuilder';
import { usePlaylistFromProvider } from './usePlaylistFromProvider';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const URL_TO_IMPORT = 'spotify:playlist:abc';

const Wrapper: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('usePlaylistFromProvider', () => {
  beforeEach(() => providersHost.clear());

  it('loads the playlist when the provider registers after mount', async () => {
    const provider = new PlaylistProviderBuilder()
      .withFetchPlaylistByUrl(async () =>
        new PlaylistBuilder().withName('Late playlist').build(),
      )
      .build();

    const { result } = renderHook(
      () => usePlaylistFromProvider(provider.id, URL_TO_IMPORT),
      { wrapper: Wrapper },
    );
    expect(result.current.playlist).toBeNull();

    act(() => {
      providersHost.register(provider);
    });

    await waitFor(() =>
      expect(result.current.playlist?.name).toBe('Late playlist'),
    );
  });
});
