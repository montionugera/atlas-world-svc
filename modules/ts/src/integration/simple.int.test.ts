// Simple integration test using docker-compose (more reliable than Testcontainers)
import WebSocket from 'ws';
import fetch from 'node-fetch';

const HTTP_HOST = 'http://localhost:7350';
const WS_HOST = 'ws://localhost:7350';

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

    const ws = new WebSocket(`${WS_HOST}/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Join match
    ws.send(JSON.stringify({ match_join: { match_id: matchId } }));

    let sawSnapshot = false;
    let sawMobUpdate = false;
    let mobPositions: Array<{ id: string; x: number; y: number }> = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for mob updates')), 15000);

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as any;

          // World snapshot (op_code 11)
          if (msg.match_data && msg.match_data.op_code === 11) {
            const snapshot = JSON.parse(msg.match_data.data);
            if (snapshot?.mobs?.length > 0) {
              sawSnapshot = true;
              mobPositions = snapshot.mobs;
              console.log('📸 World snapshot received with', snapshot.mobs.length, 'mobs');
            }
          }

          // Position updates (op_code 10)
          if (msg.match_data && msg.match_data.op_code === 10) {
            const update = JSON.parse(msg.match_data.data);
            if (update?.mobs?.length > 0) {
              sawMobUpdate = true;
              mobPositions = update.mobs;
              console.log('🔄 Position update received with', update.mobs.length, 'mobs');
            }
          }

          if (sawSnapshot && sawMobUpdate) {
            clearTimeout(timeout);
            resolve();
          }
        } catch (error) {
          console.warn('Failed to parse message:', error);
        }
      });
    });

    ws.close();

    // Assertions
    expect(sawSnapshot).toBe(true);
    expect(sawMobUpdate).toBe(true);
    expect(mobPositions.length).toBeGreaterThan(0);
    
    // Verify mobs have valid positions
    mobPositions.forEach(mob => {
      expect(mob.id).toMatch(/^mob-\d+$/);
      expect(typeof mob.x).toBe('number');
      expect(typeof mob.y).toBe('number');
      expect(mob.x).toBeGreaterThanOrEqual(-500);
      expect(mob.x).toBeLessThanOrEqual(500);
      expect(mob.y).toBeGreaterThanOrEqual(-500);
      expect(mob.y).toBeLessThanOrEqual(500);
    });

    console.log('✅ Mobs are moving autonomously:', mobPositions);
  }, 20000);
});
