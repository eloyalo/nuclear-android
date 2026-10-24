import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  ArtistSocialStats,
  PlaylistRef,
  SearchCategory,
  SearchParams,
  SearchResults,
  TrackRef,
} from '@nuclearplayer/model';
import {
  MissingCapabilityError,
  type ArtistMetadataCapability,
  type MetadataHost,
  type MetadataProvider,
} from '@nuclearplayer/plugin-sdk';

import { errorMessage } from '../utils/errorMessage';
import { decodeHtmlEntities } from '../utils/html';
import { Logger } from './logger';
import { providersHost } from './providersHost';

const ALL_CATEGORIES: SearchCategory[] = [
  'artists',
  'albums',
  'tracks',
  'playlists',
];

const onlyCategories = (values: string[] | undefined): SearchCategory[] => {
  if (!values) {
    return [];
  }

  // Dedupe categories and filter out junk
  const set = new Set<SearchCategory>(ALL_CATEGORIES);
  return values.filter((v): v is SearchCategory =>
    set.has(v as SearchCategory),
  );
};

const resolveTypes = (
  provider: MetadataProvider,
  requested: SearchCategory[] | undefined,
): SearchCategory[] => {
  return requested ?? onlyCategories(provider.searchCapabilities);
};

const settledValue = <Value>(outcome: PromiseSettledResult<Value>) =>
  outcome.status === 'fulfilled' ? outcome.value : undefined;

const executeMetadataSearch = async (
  provider: MetadataProvider,
  params: SearchParams,
): Promise<SearchResults> => {
  const unified =
    provider.searchCapabilities?.includes('unified') && provider.search;
  if (unified) {
    return provider.search!(params);
  }

  const types = resolveTypes(provider, params.types);
  const want = new Set(types);

  const artistsPromise =
    want.has('artists') && provider.searchArtists
      ? provider.searchArtists({ query: params.query, limit: params.limit })
      : undefined;
  const albumsPromise =
    want.has('albums') && provider.searchAlbums
      ? provider.searchAlbums({ query: params.query, limit: params.limit })
      : undefined;
  const tracksPromise =
    want.has('tracks') && provider.searchTracks
      ? provider.searchTracks({ query: params.query, limit: params.limit })
      : undefined;
  const playlistsPromise =
    want.has('playlists') && provider.searchPlaylists
      ? provider.searchPlaylists({ query: params.query, limit: params.limit })
      : undefined;

  // A provider can choke on one category (a playlist that was deleted, say)
  // while the rest of the search is fine, so one failure shouldn't hide them all.
  const [artistsOutcome, albumsOutcome, tracksOutcome, playlistsOutcome] =
    await Promise.allSettled([
      artistsPromise,
      albumsPromise,
      tracksPromise,
      playlistsPromise,
    ]);

  const outcomes = {
    artists: artistsOutcome,
    albums: albumsOutcome,
    tracks: tracksOutcome,
    playlists: playlistsOutcome,
  };
  const failures = Object.entries(outcomes).flatMap(([category, outcome]) =>
    outcome.status === 'rejected' ? [{ category, reason: outcome.reason }] : [],
  );
  const requestedCount = [
    artistsPromise,
    albumsPromise,
    tracksPromise,
    playlistsPromise,
  ].filter(Boolean).length;
  if (failures.length > 0 && failures.length === requestedCount) {
    throw failures[0].reason;
  }
  failures.forEach(({ category, reason }) =>
    Logger.metadata.warn(
      `Searching ${category} on '${provider.id}' failed: ${errorMessage(reason)}`,
    ),
  );

  const artists = settledValue(artistsOutcome);
  const albums = settledValue(albumsOutcome);
  const tracks = settledValue(tracksOutcome);
  const playlists = settledValue(playlistsOutcome);

  const result: SearchResults = {};
  if (artists) {
    result.artists = artists;
  }
  if (albums) {
    result.albums = albums;
  }
  if (tracks) {
    result.tracks = tracks;
  }
  if (playlists) {
    result.playlists = playlists;
  }
  return result;
};

export const createMetadataHost = (): MetadataHost => {
  const getProvider = (providerId?: string): MetadataProvider | undefined =>
    providersHost.get<MetadataProvider>(
      providerId ?? providersHost.getActive('metadata'),
      'metadata',
    );

  const withArtistCapability =
    <TResult>(
      capability: ArtistMetadataCapability,
      method: keyof MetadataProvider,
    ) =>
    async (entityId: string, providerId?: string): Promise<TResult> => {
      const provider = getProvider(providerId);
      if (!provider) {
        throw new Error('No metadata provider available');
      }
      if (!provider.artistMetadataCapabilities?.includes(capability)) {
        throw new MissingCapabilityError(capability, provider.name);
      }
      return (provider[method] as (id: string) => Promise<TResult>)!(entityId);
    };

  return {
    search: async (
      params: SearchParams,
      providerId?: string,
    ): Promise<SearchResults> => {
      const provider = getProvider(providerId);
      if (!provider) {
        throw new Error('No metadata provider available');
      }
      return executeMetadataSearch(provider, params);
    },

    fetchArtistBio: async (
      artistId: string,
      providerId?: string,
    ): Promise<ArtistBio> => {
      const bio = await withArtistCapability<ArtistBio>(
        'artistBio',
        'fetchArtistBio',
      )(artistId, providerId);
      return {
        ...bio,
        name: decodeHtmlEntities(bio.name),
        disambiguation:
          bio.disambiguation && decodeHtmlEntities(bio.disambiguation),
        bio: bio.bio && decodeHtmlEntities(bio.bio),
      };
    },
    fetchArtistSocialStats: withArtistCapability<ArtistSocialStats>(
      'artistSocialStats',
      'fetchArtistSocialStats',
    ),
    fetchArtistAlbums: withArtistCapability<AlbumRef[]>(
      'artistAlbums',
      'fetchArtistAlbums',
    ),
    fetchArtistTopTracks: withArtistCapability<TrackRef[]>(
      'artistTopTracks',
      'fetchArtistTopTracks',
    ),
    fetchArtistPlaylists: withArtistCapability<PlaylistRef[]>(
      'artistPlaylists',
      'fetchArtistPlaylists',
    ),
    fetchArtistRelatedArtists: withArtistCapability<ArtistRef[]>(
      'artistRelatedArtists',
      'fetchArtistRelatedArtists',
    ),

    fetchAlbumDetails: async (
      albumId: string,
      providerId?: string,
    ): Promise<Album> => {
      const provider = getProvider(providerId);
      if (!provider) {
        throw new Error('No metadata provider available');
      }
      if (!provider.albumMetadataCapabilities?.includes('albumDetails')) {
        throw new MissingCapabilityError('albumDetails', provider.name);
      }
      return provider.fetchAlbumDetails!(albumId)!;
    },
  };
};

export const metadataHost = createMetadataHost();
