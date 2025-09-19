import fetch from 'node-fetch';

const HTTP_HOST = 'http://localhost:7350';

async function authDevice(deviceId: string): Promise<string> {
  const res = await fetch(`${HTTP_HOST}/v2/account/authenticate/device?create=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from('defaultkey:').toString('base64')
    },
    body: JSON.stringify({ id: deviceId })
  });
  const body = await res.json() as any;
  return body.token;
}


async function createMovementMatchRpc(token: string): Promise<any> {
  const res = await fetch(`${HTTP_HOST}/v2/rpc/create_movement_match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: '"{}"'
  });
  const body = await res.json() as any;
  return JSON.parse(body.payload);
}

async function rpcCall(token: string, rpcName: string, payload: any): Promise<any> {
  const res = await fetch(`${HTTP_HOST}/v2/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(JSON.stringify(payload))
  });
  const body = await res.json() as any;
  if (!body.payload) {
    throw new Error(`RPC call failed: ${JSON.stringify(body)}`);
  }
  return JSON.parse(body.payload);
}

describe('RPC-Only Integration Tests (Docker Compose)', () => {
  test('server health check', async () => {
    const res = await fetch(`${HTTP_HOST}/healthcheck`);
    expect(res.status).toBe(200);
  });

  test('authentication works', async () => {
    const token = await authDevice('rpc-test-device-1');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });


  test('create movement match RPC works', async () => {
    const token = await authDevice('rpc-test-device-3');
    const result = await createMovementMatchRpc(token);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.matchId).toMatch(/^simulated-match-\d+$/);
    expect(result.type).toBe('simulated');
  });

  test('multiple RPC calls work', async () => {
    const token = await authDevice('rpc-test-device-4');
    
    // Test match creation
    const matchResult = await createMovementMatchRpc(token);
    
    expect(matchResult.success).toBe(true);
  });

  test('RPC-based match simulation works', async () => {
    const token = await authDevice('rpc-test-device-5');
    
    // Create a match
    const createResult = await createMovementMatchRpc(token);
    expect(createResult.success).toBe(true);
    const matchId = createResult.matchId;
    
    // Join the match
    const joinResult = await rpcCall(token, 'join_match', { matchId, playerId: 'test-player-1' });
    expect(joinResult.success).toBe(true);
    expect(joinResult.playerCount).toBe(1);
    
    // Update player position
    const updateResult = await rpcCall(token, 'update_player_position', {
      matchId,
      playerId: 'test-player-1',
      position: { x: 100, y: 200 }
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.tick).toBe(1);
    expect(updateResult.players).toHaveLength(1);
    expect(updateResult.players[0].position).toEqual({ x: 100, y: 200 });
    
    // Get match state
    const stateResult = await rpcCall(token, 'get_match_state', { matchId });
    expect(stateResult.success).toBe(true);
    expect(stateResult.matchId).toBe(matchId);
    expect(stateResult.playerCount).toBe(1);
  });
});
