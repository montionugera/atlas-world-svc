/**
 * healthcheck RPC — trivial liveness probe for the bundle + wiring, no auth
 * required. Returns a fixed JSON payload. Not part of contracts RPC ids
 * (contracts.RPC only lists gameplay RPCs); this is scaffold-only.
 */
const healthcheck: nkruntime.RpcFunction = function (
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _payload: string,
): string {
  return JSON.stringify({ ok: true });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerRpc('healthcheck', healthcheck);
  logger.info('atlas-nakama TS runtime module loaded');
}

// Keep InitModule reachable so esbuild's tree-shaking never drops the
// top-level declaration Nakama's goja runtime looks up by name.
!InitModule && InitModule.bind(null);
