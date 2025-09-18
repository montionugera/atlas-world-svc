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

async function rpcTest(token: string): Promise<any> {
  const res = await fetch(`${HTTP_HOST}/v2/rpc/test_rpc`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${token}` 
    },
    body: '"{}"'  // Send as string, not JSON object
  });
  const body = await res.json() as any;
  console.log('RPC response body:', body);
  console.log('RPC response payload:', body.payload);
  return JSON.parse(body.payload);
}

async function testServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${HTTP_HOST}/healthcheck`);
    return res.status === 200;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

async function testRpcCall(): Promise<boolean> {
  try {
    const token = await authDevice('smoke-test-device');
    const result = await rpcTest(token);
    
    console.log('📞 RPC test result:', result);
    
    return result.status === 'ok' && result.message === 'Hello from Atlas World!';
  } catch (error) {
    console.error('RPC test failed:', error);
    return false;
  }
}

async function main() {
  console.log('🧪 Starting Atlas World Server Smoke Tests...');
  
  console.log('1️⃣ Testing server health...');
  const healthOk = await testServerHealth();
  if (!healthOk) {
    console.error('❌ Server health check failed');
    process.exit(1);
  }
  console.log('✅ Server health check passed');

  console.log('2️⃣ Testing RPC call...');
  const rpcOk = await testRpcCall();
  if (!rpcOk) {
    console.error('❌ RPC test failed');
    process.exit(1);
  }
  console.log('✅ RPC test passed');

  console.log('🎉 All smoke tests passed!');
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Smoke test failed:', error);
    process.exit(1);
  });
}

export { testServerHealth, testRpcCall };
