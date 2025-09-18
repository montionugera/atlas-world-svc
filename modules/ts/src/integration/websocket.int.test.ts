// @ts-ignore
import WebSocket from 'ws';
import fetch from 'node-fetch';

const HTTP_HOST = 'http://localhost:7350';
const WS_HOST = 'ws://localhost:7350';

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

describe('WebSocket Integration Tests (Docker Compose)', () => {
  test('server health check', async () => {
    const res = await fetch(`${HTTP_HOST}/healthcheck`);
    expect(res.status).toBe(200);
  });

  test('WebSocket connection works', async () => {
    const token = await authDevice('ws-test-device-1');
    
    const ws = new WebSocket(`${WS_HOST}/ws?token=${token}`);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve();
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('WebSocket can send and receive messages', async () => {
    const token = await authDevice('ws-test-device-2');
    
    const ws = new WebSocket(`${WS_HOST}/ws?token=${token}`);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket message timeout')), 5000);
      
      ws.on('open', () => {
        // Send a ping message
        ws.send(JSON.stringify({ ping: 'hello' }));
      });
      
      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.pong) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (error) {
          // Ignore parsing errors for now
        }
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('RPC works after WebSocket connection', async () => {
    const token = await authDevice('ws-test-device-3');
    
    // First establish WebSocket connection
    const ws = new WebSocket(`${WS_HOST}/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve();
      });
      ws.on('error', reject);
    });
    
    // Then test RPC
    const res = await fetch(`${HTTP_HOST}/v2/rpc/test_rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: '"{}"'
    });
    const body = await res.json() as any;
    const result = JSON.parse(body.payload);
    
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Hello from Atlas World!');
  });
});
