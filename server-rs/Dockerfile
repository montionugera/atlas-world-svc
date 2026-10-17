# Multi-stage production Dockerfile for server-rs
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /usr/src/server-rs

# Copy manifests
COPY server-rs/Cargo.toml server-rs/Cargo.lock ./

# Create dummy source to build dependencies
RUN mkdir src \
    && echo "fn main() {}" > src/main.rs \
    && echo "" > src/lib.rs \
    && cargo build --release || true \
    && rm -rf src

# Copy real sources
COPY schemas /usr/src/schemas
COPY server-rs/src ./src
COPY server-rs/benches ./benches
COPY server-rs/tests ./tests

# Build release binary
RUN touch src/main.rs src/lib.rs \
    && cargo build --release --bin server-rs

# Runtime image
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /usr/src/server-rs/target/release/server-rs /app/server-rs

# Run as non-root user
RUN useradd -m -u 1000 -U appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 2567

ENV BIND_ADDR=0.0.0.0:2567 \
    AGONES_ENABLED=false \
    NAKAMA_SERVER_KEY=defaultkey \
    RUST_LOG=info

CMD ["/app/server-rs"]
