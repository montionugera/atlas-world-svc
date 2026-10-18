/**
 * Wire protocol version exchanged during the WebSocket handshake (`?proto=<u32>`).
 * Must match `PROTOCOL_VERSION` in `server-rs/src/protocol/mod.rs`.
 */
export const PROTOCOL_VERSION = 1;

/** WebSocket close code sent by `server-rs` when `proto` does not match `PROTOCOL_VERSION`. */
export const PROTOCOL_MISMATCH_CLOSE_CODE = 4001;

/**
 * WebSocket close code sent by `server-rs` when a newer connection for the same account
 * supersedes an existing connection (`DUPLICATE_SESSION_CLOSE_CODE` in `server-rs/src/protocol/mod.rs`).
 */
export const DUPLICATE_SESSION_CLOSE_CODE = 4002;

/**
 * WebSocket close code sent by `server-rs` when a region room has reached its player capacity
 * (`REGION_FULL_CLOSE_CODE` in `server-rs/src/protocol/mod.rs`).
 */
export const REGION_FULL_CLOSE_CODE = 4003;

/**
 * Formats the player-facing message for a 4001 protocol mismatch close reason.
 * Expected server reason format: `protocol version mismatch: server=<S> client=<C>`
 */
export function formatProtocolMismatchMessage(reason?: string): string {
  const match = reason?.match(
    /protocol version mismatch:\s*server=(\d+)\s+client=(\d+)/i,
  );
  if (match) {
    const serverVer = Number(match[1]);
    const clientVer = Number(match[2]);
    if (clientVer > serverVer) {
      return `The server is older than this client (client protocol ${clientVer}, server protocol ${serverVer}). Try again in a minute.`;
    }
    return `This game client is out of date (client protocol ${clientVer}, server protocol ${serverVer}). Reload the page to update.`;
  }
  return "This game client is out of date. Reload the page to update.";
}

/**
 * Formats the player-facing message for a 4002 duplicate session close reason.
 */
export function formatDuplicateSessionMessage(_reason?: string): string {
  return "Disconnected: this account connected in another window or tab.";
}

/**
 * Formats the player-facing message for a 4003 region full close reason.
 */
export function formatRegionFullMessage(reason?: string): string {
  const match = reason?.match(
    /region full:\s*([^\s]+)\s+is at capacity\s*\((\d+)\/(\d+)\)/i,
  );
  if (match) {
    return `Region ${match[1]} is full (${match[2]}/${match[3]} players). Try another region or wait a moment.`;
  }
  return "This region is full. Try another region or wait a moment.";
}
