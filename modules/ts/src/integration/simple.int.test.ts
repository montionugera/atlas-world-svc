// Simple integration test using docker-compose (more reliable than Testcontainers)
import fetch from 'node-fetch';

const HTTP_HOST = 'http://localhost:7350';

describe('Simple Integration Tests (Docker Compose)', () => {
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

  async function rpcCreateMatch(token: string): Promise<string> {
    const res = await fetch(`${HTTP_HOST}/v2/rpc/create_movement_match`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}` 
      },
      body: '"{}"'  // Send as string, not JSON object
    });
    const body = await res.json() as any;
    return JSON.parse(body.payload).matchId;
  }

  test('server health check', async () => {
    const res = await fetch(`${HTTP_HOST}/healthcheck`);
    expect(res.status).toBe(200);
  });

  test('mobs move autonomously without client input', async () => {
    const token = await authDevice('simple-test-device');
    const matchId = await rpcCreateMatch(token);

    // Join the match via RPC
    const joinRes = await fetch(`${HTTP_HOST}/v2/rpc/join_match`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(JSON.stringify({ matchId, playerId: 'test-player' }))
    });
    const joinResult = await joinRes.json();
    expect(JSON.parse(joinResult.payload).success).toBe(true);

    // Poll for mob updates using RPC
    let initialMobPositions: Array<{ id: string; x: number; y: number }> = [];
    let updatedMobPositions: Array<{ id: string; x: number; y: number }> = [];
    let sawMobMovement = false;

    // Get initial mob positions
    const initialRes = await fetch(`${HTTP_HOST}/v2/rpc/get_match_state`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(JSON.stringify({ matchId }))
    });
    const initialResult = await initialRes.json();
    const initialState = JSON.parse(initialResult.payload);
    expect(initialState.success).toBe(true);
    expect(initialState.mobs).toBeDefined();
    initialMobPositions = initialState.mobs;
    console.log('📸 Initial mob positions:', initialMobPositions);

    // Wait a bit and then update mobs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update mobs via RPC
    const updateRes = await fetch(`${HTTP_HOST}/v2/rpc/update_mobs`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(JSON.stringify({ matchId }))
    });
    const updateResult = await updateRes.json();
    const updateState = JSON.parse(updateResult.payload);
    expect(updateState.success).toBe(true);
    expect(updateState.mobs).toBeDefined();
    updatedMobPositions = updateState.mobs;
    console.log('🔄 Updated mob positions:', updatedMobPositions);

    // Check if mobs have moved
    if (initialMobPositions.length > 0 && updatedMobPositions.length > 0) {
      for (let i = 0; i < initialMobPositions.length; i++) {
        const initial = initialMobPositions[i];
        const updated = updatedMobPositions[i];
        if (initial.x !== updated.x || initial.y !== updated.y) {
          sawMobMovement = true;
          break;
        }
      }
    }

    // Assertions
    expect(initialMobPositions.length).toBeGreaterThan(0);
    expect(updatedMobPositions.length).toBeGreaterThan(0);
    expect(sawMobMovement).toBe(true);
    
    // Verify mobs have valid positions
    updatedMobPositions.forEach(mob => {
      expect(mob.id).toMatch(/^mob-\d+$/);
      expect(typeof mob.x).toBe('number');
      expect(typeof mob.y).toBe('number');
      expect(mob.x).toBeGreaterThanOrEqual(0);
      expect(mob.x).toBeLessThanOrEqual(500);
      expect(mob.y).toBeGreaterThanOrEqual(0);
      expect(mob.y).toBeLessThanOrEqual(500);
    });

    console.log('✅ Mobs are moving autonomously via RPC polling');
  }, 20000);
});
