import crypto from 'crypto';

const PRODUCTION_URL = 'https://waocbngkeujyejpfnahg.supabase.co/functions/v1/verify-dlc';

console.log('Testing Security Hardening\n');

// Test 1: Valid request
console.log('Test 1: Valid request');
const clientEcdh = crypto.createECDH('prime256v1');
clientEcdh.generateKeys();
const clientPublicKeyRaw = clientEcdh.getPublicKey();
const algorithmId = Buffer.from('301306072a8648ce3d020106082a8648ce3d030107', 'hex');
const bitStringHeader = Buffer.from('034200', 'hex');
const clientPublicKeySpki = Buffer.concat([
  Buffer.from([0x30, 0x59]),
  algorithmId,
  bitStringHeader,
  clientPublicKeyRaw
]);
const clientPublicKeyBase64 = clientPublicKeySpki.toString('base64');

const validRequest = {
  steamAppId: 480,
  dlcId: 123456,
  ticketHex: 'A'.repeat(64),
  identity: 'dlc-protection-sdk-v1',
  clientPublicKey: clientPublicKeyBase64
};

try {
  const response = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validRequest)
  });
  console.log('Status:', response.status);
  console.log('✅ Valid request accepted\n');
} catch (error) {
  console.log('❌ Valid request failed:', error.message, '\n');
}

// Test 2: Invalid Steam App ID (too large)
console.log('Test 2: Invalid Steam App ID (too large)');
const invalidAppIdRequest = { ...validRequest, steamAppId: 9999999999 };
try {
  const response = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidAppIdRequest)
  });
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Error:', data.error);
  console.log(response.status === 400 ? '✅ Invalid App ID rejected\n' : '❌ Invalid App ID not rejected\n');
} catch (error) {
  console.log('❌ Test failed:', error.message, '\n');
}

// Test 3: Invalid DLC ID (negative)
console.log('Test 3: Invalid DLC ID (negative)');
const invalidDlcIdRequest = { ...validRequest, dlcId: -1 };
try {
  const response = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidDlcIdRequest)
  });
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Error:', data.error);
  console.log(response.status === 400 ? '✅ Invalid DLC ID rejected\n' : '❌ Invalid DLC ID not rejected\n');
} catch (error) {
  console.log('❌ Test failed:', error.message, '\n');
}

// Test 4: Missing required field
console.log('Test 4: Missing required field');
const missingFieldRequest = { steamAppId: 480, dlcId: 123456 };
try {
  const response = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(missingFieldRequest)
  });
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Error:', data.error);
  console.log(response.status === 400 ? '✅ Missing field rejected\n' : '❌ Missing field not rejected\n');
} catch (error) {
  console.log('❌ Test failed:', error.message, '\n');
}

// Test 5: Invalid ticket hex format
console.log('Test 5: Invalid ticket hex format');
const invalidTicketRequest = { ...validRequest, ticketHex: 'XYZ' };
try {
  const response = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidTicketRequest)
  });
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Error:', data.error);
  console.log(response.status === 400 ? '✅ Invalid ticket rejected\n' : '❌ Invalid ticket not rejected\n');
} catch (error) {
  console.log('❌ Test failed:', error.message, '\n');
}

console.log('Security Tests Complete');
