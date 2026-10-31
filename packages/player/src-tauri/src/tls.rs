//! Shared reqwest client construction.
//!
//! reqwest 0.13 verifies server certificates with `rustls-platform-verifier`,
//! which on Android doesn't use webpki at all: it calls the system's
//! `X509TrustManager` over JNI and panics ("Expect rustls-platform-verifier to
//! be initialized") unless the app hands it a JVM `Context` before the first
//! handshake. Initializing it would also mean shipping the verifier's Kotlin
//! component inside the APK, so on Android we skip the platform verifier
//! entirely and hand reqwest a rustls config with the webpki roots compiled in.
//! See ANDROID_PLAYBACK.md §2.
//!
//! Everything that talks HTTPS from Rust should start from here.

/// A `reqwest::ClientBuilder` with a TLS backend that works on the current
/// platform. Callers add their own timeouts, user agent, etc.
pub fn client_builder() -> reqwest::ClientBuilder {
    // YouTube pages now send ~19 KB of response headers; hyper's 16 KB default
    // resets the HTTP/2 stream with PROTOCOL_ERROR.
    let builder = reqwest::Client::builder().http2_max_header_list_size(256 * 1024);

    #[cfg(target_os = "android")]
    let builder = builder.tls_backend_preconfigured(android::tls_config());

    builder
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::{Arc, OnceLock};

    static CONFIG: OnceLock<rustls::ClientConfig> = OnceLock::new();

    pub(super) fn tls_config() -> rustls::ClientConfig {
        CONFIG.get_or_init(build).clone()
    }

    fn build() -> rustls::ClientConfig {
        // Match whatever provider reqwest would have picked, so the two agree
        // on cipher suites and signature algorithms.
        let provider = rustls::crypto::CryptoProvider::get_default()
            .cloned()
            .unwrap_or_else(|| Arc::new(rustls::crypto::aws_lc_rs::default_provider()));

        let roots = rustls::RootCertStore {
            roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
        };

        let mut config = rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .expect("aws-lc-rs supports the default TLS versions")
            .with_root_certificates(roots)
            .with_no_client_auth();

        // reqwest only negotiates ALPN for the backends it builds itself; a
        // preconfigured config has to advertise h2 on its own or every request
        // falls back to HTTP/1.1.
        config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

        config
    }
}
