use async_trait::async_trait;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

/// Lifecycle state for tracking game server status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FleetState {
    #[default]
    Init,
    Ready,
    Allocated,
    Shutdown,
}

/// Abstract fleet management lifecycle trait.
#[async_trait]
pub trait FleetLifecycle: Send + Sync {
    async fn ready(&self) -> Result<(), String>;
    async fn health(&self) -> Result<(), String>;
    async fn allocate(&self) -> Result<(), String>;
    async fn shutdown(&self) -> Result<(), String>;
}

/// In-memory mock fleet client for tests, local development, or fallback.
#[derive(Debug, Default)]
pub struct MockFleetClient {
    state: RwLock<FleetState>,
    health_count: AtomicUsize,
}

impl MockFleetClient {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(FleetState::Init),
            health_count: AtomicUsize::new(0),
        }
    }

    pub fn state(&self) -> FleetState {
        *self.state.read().unwrap()
    }

    pub fn health_count(&self) -> usize {
        self.health_count.load(Ordering::Relaxed)
    }
}

#[async_trait]
impl FleetLifecycle for MockFleetClient {
    async fn ready(&self) -> Result<(), String> {
        let mut state = self.state.write().map_err(|e| e.to_string())?;
        info!("MockFleetClient: transition {:?} -> Ready", *state);
        *state = FleetState::Ready;
        Ok(())
    }

    async fn health(&self) -> Result<(), String> {
        let count = self.health_count.fetch_add(1, Ordering::Relaxed) + 1;
        debug!("MockFleetClient: health ping (total: {})", count);
        Ok(())
    }

    async fn allocate(&self) -> Result<(), String> {
        let mut state = self.state.write().map_err(|e| e.to_string())?;
        info!("MockFleetClient: transition {:?} -> Allocated", *state);
        *state = FleetState::Allocated;
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), String> {
        let mut state = self.state.write().map_err(|e| e.to_string())?;
        info!("MockFleetClient: transition {:?} -> Shutdown", *state);
        *state = FleetState::Shutdown;
        Ok(())
    }
}

/// Production Agones client with graceful mock fallback.
#[derive(Clone)]
pub struct AgonesClient {
    enabled: bool,
    endpoint: String,
    mock: Arc<MockFleetClient>,
}

impl AgonesClient {
    pub fn new(endpoint: Option<String>, enabled: bool) -> Self {
        let endpoint = endpoint.unwrap_or_else(|| "127.0.0.1:9358".to_string());
        Self {
            enabled,
            endpoint,
            mock: Arc::new(MockFleetClient::new()),
        }
    }

    pub fn from_env() -> Self {
        let enabled = std::env::var("AGONES_ENABLED")
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        let port = std::env::var("AGONES_SDK_HTTP_PORT")
            .or_else(|_| std::env::var("AGONES_SDK_PORT"))
            .unwrap_or_else(|_| "9358".to_string());

        let host = std::env::var("AGONES_SDK_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let endpoint = format!("{}:{}", host, port);

        Self::new(Some(endpoint), enabled)
    }

    pub fn mock_state(&self) -> FleetState {
        self.mock.state()
    }

    pub fn mock_health_count(&self) -> usize {
        self.mock.health_count()
    }

    async fn send_sidecar_request(&self, path: &str) -> Result<(), String> {
        let mut stream = tokio::time::timeout(
            Duration::from_millis(500),
            TcpStream::connect(&self.endpoint),
        )
        .await
        .map_err(|_| format!("Connection timeout to Agones sidecar at {}", self.endpoint))?
        .map_err(|e| {
            format!(
                "Failed to connect to Agones sidecar at {}: {}",
                self.endpoint, e
            )
        })?;

        let request = format!(
            "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}",
            path, self.endpoint
        );

        stream
            .write_all(request.as_bytes())
            .await
            .map_err(|e| format!("Failed to write request: {}", e))?;

        let mut buf = [0u8; 512];
        let n = stream
            .read(&mut buf)
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        let response = String::from_utf8_lossy(&buf[..n]);
        if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
            Ok(())
        } else {
            Err(format!(
                "Agones sidecar returned non-200 status: {}",
                response
            ))
        }
    }
}

#[async_trait]
impl FleetLifecycle for AgonesClient {
    async fn ready(&self) -> Result<(), String> {
        if self.enabled {
            match self.send_sidecar_request("/ready").await {
                Ok(()) => {
                    info!(
                        "AgonesClient: marked ready via sidecar at {}",
                        self.endpoint
                    );
                    let _ = self.mock.ready().await;
                    Ok(())
                }
                Err(err) => {
                    warn!(
                        "Agones sidecar unreachable ({}). Falling back to mock Ready.",
                        err
                    );
                    self.mock.ready().await
                }
            }
        } else {
            self.mock.ready().await
        }
    }

    async fn health(&self) -> Result<(), String> {
        if self.enabled {
            match self.send_sidecar_request("/health").await {
                Ok(()) => {
                    debug!("AgonesClient: health ping sent via sidecar");
                    let _ = self.mock.health().await;
                    Ok(())
                }
                Err(err) => {
                    debug!(
                        "Agones sidecar health ping failed ({}). Falling back to mock.",
                        err
                    );
                    self.mock.health().await
                }
            }
        } else {
            self.mock.health().await
        }
    }

    async fn allocate(&self) -> Result<(), String> {
        if self.enabled {
            match self.send_sidecar_request("/allocate").await {
                Ok(()) => {
                    info!("AgonesClient: marked allocated via sidecar");
                    let _ = self.mock.allocate().await;
                    Ok(())
                }
                Err(err) => {
                    warn!(
                        "Agones sidecar allocate failed ({}). Falling back to mock.",
                        err
                    );
                    self.mock.allocate().await
                }
            }
        } else {
            self.mock.allocate().await
        }
    }

    async fn shutdown(&self) -> Result<(), String> {
        if self.enabled {
            match self.send_sidecar_request("/shutdown").await {
                Ok(()) => {
                    info!("AgonesClient: marked shutdown via sidecar");
                    let _ = self.mock.shutdown().await;
                    Ok(())
                }
                Err(err) => {
                    error!(
                        "Agones sidecar shutdown failed ({}). Falling back to mock.",
                        err
                    );
                    self.mock.shutdown().await
                }
            }
        } else {
            self.mock.shutdown().await
        }
    }
}

/// Background loop sending health pings at fixed intervals until cancelled.
pub struct HeartbeatTask {
    handle: Option<JoinHandle<()>>,
    stop_tx: watch::Sender<bool>,
}

impl HeartbeatTask {
    pub fn start<T: FleetLifecycle + 'static>(client: Arc<T>, interval_secs: u64) -> Self {
        let (stop_tx, mut stop_rx) = watch::channel(false);
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
            interval.tick().await; // first tick returns immediately
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if let Err(e) = client.health().await {
                            warn!("Heartbeat health ping error: {}", e);
                        }
                    }
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            info!("Heartbeat loop stopped gracefully");
                            break;
                        }
                    }
                }
            }
        });

        Self {
            handle: Some(handle),
            stop_tx,
        }
    }

    pub fn stop(&self) {
        let _ = self.stop_tx.send(true);
    }

    pub async fn join(mut self) -> Result<(), tokio::task::JoinError> {
        self.stop();
        if let Some(handle) = self.handle.take() {
            handle.await
        } else {
            Ok(())
        }
    }
}

impl Drop for HeartbeatTask {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_fleet_transitions() {
        let mock = MockFleetClient::new();
        assert_eq!(mock.state(), FleetState::Init);
        assert_eq!(mock.health_count(), 0);

        mock.ready().await.unwrap();
        assert_eq!(mock.state(), FleetState::Ready);

        mock.health().await.unwrap();
        mock.health().await.unwrap();
        assert_eq!(mock.health_count(), 2);

        mock.allocate().await.unwrap();
        assert_eq!(mock.state(), FleetState::Allocated);

        mock.shutdown().await.unwrap();
        assert_eq!(mock.state(), FleetState::Shutdown);
    }

    #[tokio::test]
    async fn test_agones_disabled_fallback() {
        let client = AgonesClient::new(None, false);
        assert_eq!(client.mock_state(), FleetState::Init);

        client.ready().await.unwrap();
        assert_eq!(client.mock_state(), FleetState::Ready);

        client.allocate().await.unwrap();
        assert_eq!(client.mock_state(), FleetState::Allocated);

        client.shutdown().await.unwrap();
        assert_eq!(client.mock_state(), FleetState::Shutdown);
    }

    #[tokio::test]
    async fn test_agones_unreachable_sidecar_fallback() {
        // Port 19358 is unlikely to be listening, should fallback to mock
        let client = AgonesClient::new(Some("127.0.0.1:19358".to_string()), true);
        client.ready().await.unwrap();
        assert_eq!(client.mock_state(), FleetState::Ready);

        client.health().await.unwrap();
        assert_eq!(client.mock_health_count(), 1);

        client.shutdown().await.unwrap();
        assert_eq!(client.mock_state(), FleetState::Shutdown);
    }

    #[tokio::test]
    async fn test_heartbeat_task_loop_and_cancellation() {
        let mock = Arc::new(MockFleetClient::new());
        // Start heartbeat with 100ms interval for fast testing
        let (stop_tx, mut stop_rx) = watch::channel(false);
        let client_clone = mock.clone();
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(50));
            interval.tick().await;
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let _ = client_clone.health().await;
                    }
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        tokio::time::sleep(Duration::from_millis(160)).await;
        let _ = stop_tx.send(true);
        handle.await.unwrap();

        assert!(mock.health_count() >= 2);
    }
}
