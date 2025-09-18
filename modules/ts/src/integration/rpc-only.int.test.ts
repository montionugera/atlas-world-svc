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

async function testRpc(token: string): Promise<any> {
  const res = await fetch(`${HTTP_HOST}/v2/rpc/test_rpc`, {
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

  test('test RPC works', async () => {
    const token = await authDevice('rpc-test-device-2');
    const result = await testRpc(token);
    
    expect(result).toBeDefined();
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Hello from Atlas World!');
  });

  test('create movement match RPC works', async () => {
    const token = await authDevice('rpc-test-device-3');
    const result = await createMovementMatchRpc(token);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.matchId).toBe('dummy-match-id');
  });

  test('multiple RPC calls work', async () => {
    const token = await authDevice('rpc-test-device-4');
    
    // Test both RPCs
    const testResult = await testRpc(token);
    const matchResult = await createMovementMatchRpc(token);
    
    expect(testResult.status).toBe('ok');
    expect(matchResult.success).toBe(true);
  });
});
