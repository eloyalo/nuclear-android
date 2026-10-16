import { omit } from 'lodash-es';

import type { QueueItem, StreamCandidate } from '@nuclearplayer/model';
import { stripResolutionState } from '@nuclearplayer/model';

import { useQueueStore } from '../../stores/queueStore';
import { useSoundStore } from '../../stores/soundStore';
import { errorMessage } from '../../utils/errorMessage';
import { Logger } from '../logger';
import { playbackManager } from '../playback';
import { hasActiveStreamingProvider, streamingHost } from '../streamingHost';
import { AudioSourceFactory } from './audioSource';
import { candidatesForTrack } from './candidateSource';

export type ResolveOptions = {
  autoPlay: boolean;
  startPositionSeconds?: number;
};

export class StreamResolution {
  private activeController: AbortController | null = null;
  private activeItemId: string | null = null;
  private readonly preparations = new Map<string, Promise<void>>();

  constructor(private readonly audioSourceFactory = new AudioSourceFactory()) {}

  async resolve(item: QueueItem, options: ResolveOptions): Promise<void> {
    const signal = this.supersedeActiveResolution(item.id);
    const { updateItemState } = useQueueStore.getState();

    if (options.autoPlay) {
      useSoundStore.getState().stop();
    }
    updateItemState(item.id, { status: 'loading', error: undefined });

    await this.preparations.get(item.id);
    if (signal.aborted) {
      return;
    }
    const latest = useQueueStore.getState().getItemById(item.id) ?? item;

    if (!hasActiveStreamingProvider()) {
      this.failItem(item.id, 'streaming:errors.noProviderAvailable');
      return;
    }

    const candidates = await candidatesForTrack(latest.track);
    if (signal.aborted) {
      return;
    }
    if (!candidates) {
      this.failItem(item.id, 'streaming:errors.noCandidatesFound');
      return;
    }

    updateItemState(item.id, {
      track: { ...latest.track, streamCandidates: candidates },
    });
    await this.tryCandidatesInOrder(latest, candidates, signal, options);
  }

  prepare(item: QueueItem): Promise<void> {
    const pending = this.preparations.get(item.id);
    if (pending) {
      return pending;
    }

    const preparation = this.prepareStream(item)
      .catch((error) =>
        Logger.streaming.warn(
          `Could not prepare '${item.track.title}': ${errorMessage(error)}`,
        ),
      )
      .finally(() => this.preparations.delete(item.id));
    this.preparations.set(item.id, preparation);
    return preparation;
  }

  async resolveWithFreshStreams(
    item: QueueItem,
    options: ResolveOptions,
  ): Promise<void> {
    const track = {
      ...item.track,
      streamCandidates: item.track.streamCandidates?.map((candidate) =>
        omit(candidate, ['stream', 'lastResolvedAtIso']),
      ),
    };
    useQueueStore.getState().updateItemState(item.id, { track });
    return this.resolve({ ...item, track }, options);
  }

  private async prepareStream(item: QueueItem): Promise<void> {
    if (item.status === 'loading' || !hasActiveStreamingProvider()) {
      return;
    }

    const candidates = await candidatesForTrack(item.track);
    const latest = useQueueStore.getState().getItemById(item.id);
    if (!candidates || !latest) {
      return;
    }
    useQueueStore.getState().updateItemState(item.id, {
      track: { ...latest.track, streamCandidates: candidates },
    });

    const candidate = candidates.find((current) => !current.failed);
    if (!candidate) {
      return;
    }

    const resolved = await streamingHost.resolveStreamForCandidate(candidate);
    if (
      !resolved ||
      resolved.failed ||
      !useQueueStore.getState().getItemById(item.id)
    ) {
      return;
    }
    useQueueStore.getState().updateCandidate(item.id, resolved);
    Logger.streaming.debug(`Prepared stream for '${item.track.title}'`);
  }

  private async tryCandidatesInOrder(
    item: QueueItem,
    candidates: StreamCandidate[],
    signal: AbortSignal,
    options: ResolveOptions,
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    const candidate = candidates.find((current) => !current.failed);
    if (!candidate) {
      this.failItem(item.id, 'streaming:errors.allCandidatesFailed');
      return;
    }

    const resolved = await streamingHost.resolveStreamForCandidate(candidate);
    if (signal.aborted) {
      return;
    }
    if (!resolved) {
      this.failItem(item.id, 'streaming:errors.noProviderAvailable');
      return;
    }

    if (resolved.failed) {
      useQueueStore.getState().removeCandidate(item.id, candidate.id);
      const remaining = candidates.filter(
        (current) => current.id !== candidate.id,
      );
      await this.tryCandidatesInOrder(item, remaining, signal, options);
      return;
    }

    useQueueStore.getState().updateCandidate(item.id, resolved);
    await this.startPlayback(item, resolved, signal, options);
  }

  private async startPlayback(
    item: QueueItem,
    candidate: StreamCandidate,
    signal: AbortSignal,
    options: ResolveOptions,
  ): Promise<void> {
    const audioSource = await this.audioSourceFactory.fromCandidate(candidate);
    if (signal.aborted) {
      return;
    }

    if (options.startPositionSeconds !== undefined) {
      audioSource.startPositionSeconds = options.startPositionSeconds;
    }

    useQueueStore.getState().updateItemState(item.id, { status: 'success' });
    this.activeItemId = null;
    playbackManager.startTrack(item, audioSource, {
      autoPlay: options.autoPlay,
    });
  }

  private failItem(itemId: string, errorKey: string): void {
    useQueueStore.getState().updateItemState(itemId, {
      status: 'error',
      error: errorKey,
    });
  }

  private supersedeActiveResolution(itemId: string): AbortSignal {
    const previousController = this.activeController;
    const previousItemId = this.activeItemId;
    const controller = new AbortController();
    this.activeController = controller;
    this.activeItemId = itemId;

    previousController?.abort();
    if (previousItemId && previousItemId !== itemId) {
      this.resetAbandonedItem(previousItemId);
    }
    return controller.signal;
  }

  private resetAbandonedItem(itemId: string): void {
    const { getItemById, updateItemState } = useQueueStore.getState();
    const item = getItemById(itemId);
    if (item) {
      updateItemState(itemId, {
        status: undefined,
        error: undefined,
        track: stripResolutionState(item.track),
      });
    }
  }
}

export const streamResolution = new StreamResolution();
