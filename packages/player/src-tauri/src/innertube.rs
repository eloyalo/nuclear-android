//! YouTube search and stream extraction for mobile, where the yt-dlp binary
//! can't run. Keeps the `ytdlp_*` command contract; see ANDROID_PLAYBACK.md §4.
//!
//! Search goes through rustypipe. Streams don't: every rustypipe client either
//! fails to deobfuscate today's player JS or (iOS) returns URLs without a PO
//! token that YouTube cuts off after the first megabyte. The VISIONOS client,
//! which yt-dlp also uses, needs neither, so the player request is made here.

use std::sync::OnceLock;
use std::time::Duration;

use log::{debug, error, warn};
use rustypipe::client::RustyPipe;
use rustypipe::model::{TrackItem, VideoItem};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::youtube_query::{
    best_audio_from_player, clean_search_query, extract_visitor_data, is_bot_check,
    video_id_from_url,
};
use crate::ytdlp::{YtdlpSearchResult, YtdlpStreamInfo};

const HOME_URL: &str = "https://www.youtube.com/?hl=en";
const PLAYER_URL: &str = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ORIGIN: &str = "https://www.youtube.com";

const CLIENT_NAME: &str = "VISIONOS";
const CLIENT_NAME_ID: &str = "101";
const CLIENT_VERSION: &str = "1.02";
const CLIENT_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const DEVICE_MAKE: &str = "Apple";
const DEVICE_MODEL: &str = "RealityDevice17,1";
const OS_NAME: &str = "visionOS";
const OS_VERSION: &str = "26.5.23O471";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const PLAYER_ATTEMPTS: usize = 2;

static SEARCH_CLIENT: OnceLock<RustyPipe> = OnceLock::new();
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static VISITOR_DATA: Mutex<Option<String>> = Mutex::const_new(None);

pub fn init_innertube(app_handle: AppHandle) {
    init_search_client(&app_handle);

    match crate::tls::client_builder()
        .user_agent(CLIENT_USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
    {
        Ok(client) => {
            let _ = HTTP_CLIENT.set(client);
        }
        Err(error) => error!("[innertube] Failed to build HTTP client: {}", error),
    }
}

fn init_search_client(app_handle: &AppHandle) {
    let builder = RustyPipe::builder().no_reporter().no_botguard();

    let builder = match app_handle.path().app_cache_dir() {
        Ok(dir) => match std::fs::create_dir_all(&dir) {
            Ok(()) => builder.storage_dir(dir),
            Err(error) => {
                warn!("[innertube] Can't create cache dir, running without cache: {}", error);
                builder.no_storage()
            }
        },
        Err(error) => {
            warn!("[innertube] No cache dir, running without cache: {}", error);
            builder.no_storage()
        }
    };

    match builder.build() {
        Ok(client) => {
            let _ = SEARCH_CLIENT.set(client);
        }
        Err(error) => error!("[innertube] Failed to build search client: {}", error),
    }
}

fn search_client() -> Result<&'static RustyPipe, String> {
    SEARCH_CLIENT
        .get()
        .ok_or_else(|| "YouTube search client failed to initialize.".to_string())
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    HTTP_CLIENT
        .get()
        .ok_or_else(|| "YouTube HTTP client failed to initialize.".to_string())
}

fn from_track(track: TrackItem) -> YtdlpSearchResult {
    let artists: Vec<String> = track.artists.into_iter().map(|artist| artist.name).collect();
    let artist_line = artists.join(", ");

    YtdlpSearchResult {
        id: track.id,
        title: if artists.is_empty() {
            track.name
        } else {
            format!("{} - {}", artist_line, track.name)
        },
        duration: track.duration.map(f64::from),
        thumbnail: track.cover.last().map(|thumbnail| thumbnail.url.clone()),
        channel: if artists.is_empty() {
            None
        } else {
            Some(artist_line)
        },
    }
}

fn from_video(video: VideoItem) -> YtdlpSearchResult {
    YtdlpSearchResult {
        id: video.id,
        title: video.name,
        duration: video.duration.map(f64::from),
        thumbnail: video.thumbnail.last().map(|thumbnail| thumbnail.url.clone()),
        channel: video.channel.map(|channel| channel.name),
    }
}

fn interleave<T>(first: Vec<T>, second: Vec<T>) -> Vec<T> {
    let mut merged = Vec::with_capacity(first.len() + second.len());
    let mut first = first.into_iter();
    let mut second = second.into_iter();

    loop {
        let from_first = first.next();
        let from_second = second.next();
        if from_first.is_none() && from_second.is_none() {
            return merged;
        }
        merged.extend(from_first);
        merged.extend(from_second);
    }
}

pub async fn search(query: &str, limit: usize) -> Result<Vec<YtdlpSearchResult>, String> {
    let rp = search_client()?;
    let cleaned = clean_search_query(query);
    debug!("[innertube] Searching: {}", cleaned);

    let query_builder = rp.query();
    let (tracks, videos) = tokio::join!(
        query_builder.music_search_tracks(&cleaned),
        query_builder.search::<VideoItem, _>(&cleaned),
    );

    if let (Err(tracks_error), Err(videos_error)) = (&tracks, &videos) {
        error!(
            "[innertube] Search failed: tracks: {}; videos: {}",
            tracks_error, videos_error
        );
        return Err(format!("YouTube search failed: {}", tracks_error));
    }

    let official_tracks: Vec<YtdlpSearchResult> = tracks
        .map(|result| result.items.items)
        .unwrap_or_default()
        .into_iter()
        .filter(|track| !track.unavailable)
        .map(from_track)
        .collect();

    let plain_videos: Vec<YtdlpSearchResult> = videos
        .map(|result| result.items.items)
        .unwrap_or_default()
        .into_iter()
        .map(from_video)
        .collect();

    let mut seen = std::collections::HashSet::new();
    let results: Vec<YtdlpSearchResult> = interleave(official_tracks, plain_videos)
        .into_iter()
        .filter(|result| seen.insert(result.id.clone()))
        .take(limit)
        .collect();

    debug!("[innertube] Found {} results", results.len());
    Ok(results)
}

const BLOCK_COOLDOWN: Duration = Duration::from_secs(120);

static BLOCKED_UNTIL: Mutex<Option<std::time::Instant>> = Mutex::const_new(None);

async fn ensure_not_blocked() -> Result<(), String> {
    let blocked_until = *BLOCKED_UNTIL.lock().await;
    match blocked_until {
        Some(until) if until > std::time::Instant::now() => Err(format!(
            "YouTube is rate limiting this network; not asking again for {}s",
            until
                .saturating_duration_since(std::time::Instant::now())
                .as_secs()
        )),
        _ => Ok(()),
    }
}

async fn mark_blocked(reason: &str) {
    warn!(
        "[innertube] YouTube is blocking requests, pausing stream lookups for {}s: {}",
        BLOCK_COOLDOWN.as_secs(),
        reason
    );
    *BLOCKED_UNTIL.lock().await = Some(std::time::Instant::now() + BLOCK_COOLDOWN);
}

async fn fetch_visitor_data(http: &reqwest::Client) -> Result<String, String> {
    let response = match http
        .get(HOME_URL)
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = format!("Failed to reach YouTube: {}", error);
            if crate::youtube_query::is_rate_limit_block(&message) {
                mark_blocked(&message).await;
            }
            return Err(message);
        }
    };

    if crate::youtube_query::is_rate_limit_block(response.url().as_str()) {
        let message = format!("YouTube redirected to {}", response.url());
        mark_blocked(&message).await;
        return Err(message);
    }

    let html = response
        .text()
        .await
        .map_err(|error| format!("Failed to read YouTube home page: {}", error))?;

    extract_visitor_data(&html).ok_or_else(|| "YouTube returned no visitor data".to_string())
}

async fn visitor_data(http: &reqwest::Client) -> Result<String, String> {
    let mut cached = VISITOR_DATA.lock().await;
    if let Some(value) = cached.as_ref() {
        return Ok(value.clone());
    }
    let fresh = fetch_visitor_data(http).await?;
    *cached = Some(fresh.clone());
    Ok(fresh)
}

async fn forget_visitor_data() {
    *VISITOR_DATA.lock().await = None;
}

async fn request_player(
    http: &reqwest::Client,
    video_id: &str,
    visitor_data: &str,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": CLIENT_NAME,
                "clientVersion": CLIENT_VERSION,
                "deviceMake": DEVICE_MAKE,
                "deviceModel": DEVICE_MODEL,
                "osName": OS_NAME,
                "osVersion": OS_VERSION,
                "hl": "en",
                "visitorData": visitor_data,
            }
        },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
    });

    http.post(PLAYER_URL)
        .header("X-YouTube-Client-Name", CLIENT_NAME_ID)
        .header("X-YouTube-Client-Version", CLIENT_VERSION)
        .header("X-Goog-Visitor-Id", visitor_data)
        .header(reqwest::header::ORIGIN, ORIGIN)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("YouTube player request failed: {}", error))?
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("Invalid YouTube player response: {}", error))
}

pub async fn get_stream(url: &str) -> Result<YtdlpStreamInfo, String> {
    let video_id = video_id_from_url(url);
    let http = http_client()?;
    ensure_not_blocked().await?;
    debug!("[innertube] Getting stream for: {}", video_id);

    let mut last_error = String::new();
    for attempt in 1..=PLAYER_ATTEMPTS {
        let visitor = visitor_data(http).await?;
        let player = request_player(http, &video_id, &visitor).await?;

        match best_audio_from_player(&player) {
            Ok(audio) => {
                debug!(
                    "[innertube] Got {} at {} bps for {}",
                    audio.mime_type, audio.bitrate, video_id
                );
                return Ok(YtdlpStreamInfo {
                    stream_url: audio.url,
                    duration: audio.duration_seconds,
                    title: audio.title,
                    container: audio.container,
                    codec: audio.codec,
                    album: None,
                    artists: Vec::new(),
                    album_artists: Vec::new(),
                    upload_date: None,
                });
            }
            Err(error) => {
                warn!(
                    "[innertube] Attempt {}/{} for {} failed: {}",
                    attempt, PLAYER_ATTEMPTS, video_id, error
                );
                if !is_bot_check(&player) {
                    return Err(error);
                }
                forget_visitor_data().await;
                last_error = error;
            }
        }
    }

    error!("[innertube] Giving up on {}: {}", video_id, last_error);
    mark_blocked(&last_error).await;
    Err(last_error)
}
