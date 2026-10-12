// Comprehensive test for appointment creation fix
import http from 'http';

const baseUrl = 'http://localhost:5001';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Comprehensive Appointment Creation Tests\n');
  let passCount = 0;
  let failCount = 0;

  try {
    // Get provider
    const providersRes = await makeRequest('GET', '/api/providers');
    const providers = providersRes.data.data || providersRes.data;
    const providerId = providers[0]._id;
    console.log(`Provider: ${providers[0].name}\n`);

    // Test 1: Basic appointment creation
    console.log('Test 1: Basic appointment creation');
    const scheduledStart1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res1 = await makeRequest('POST', '/api/appointments', {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart: scheduledStart1,
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '1234567890',
      bookingType: 'in_person',
    });

    if (res1.status === 201 && res1.data.appointment._id) {
      console.log('  ✅ PASS - Appointment created (ID: ' + res1.data.appointment._id + ')');
      passCount++;
    } else {
      console.log('  ❌ FAIL - Status: ' + res1.status + ', Error: ' + (res1.data.message || 'Unknown'));
      failCount++;
    }

    // Test 2: Appointment with notes
    console.log('\nTest 2: Appointment with notes');
    const scheduledStart2 = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const res2 = await makeRequest('POST', '/api/appointments', {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart: scheduledStart2,
      customerName: 'Jane Smith',
      customerEmail: 'jane@example.com',
      customerPhone: '9876543210',
      bookingType: 'in_person',
      notes: 'Please call before arrival',
    });

    if (res2.status === 201) {
      console.log('  ✅ PASS - Appointment with notes created');
      passCount++;
    } else {
      console.log('  ❌ FAIL - Status: ' + res2.status);
      failCount++;
    }

    // Test 3: Virtual appointment
    console.log('\nTest 3: Virtual appointment');
    const scheduledStart3 = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const res3 = await makeRequest('POST', '/api/appointments', {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart: scheduledStart3,
      customerName: 'Bob Wilson',
      customerEmail: 'bob@example.com',
      customerPhone: '5555555555',
      bookingType: 'virtual',
    });

    if (res3.status === 201) {
      console.log('  ✅ PASS - Virtual appointment created');
      passCount++;
    } else {
      console.log('  ❌ FAIL - Status: ' + res3.status);
      failCount++;
    }

    // Test 4: Missing required field (should still return 400 but for correct reason)
    console.log('\nTest 4: Missing email (validation error - expected 400)');
    const scheduledStart4 = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
    const res4 = await makeRequest('POST', '/api/appointments', {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart: scheduledStart4,
      customerName: 'Alice Brown',
      customerEmail: '', // Empty email
      customerPhone: '4444444444',
      bookingType: 'in_person',
    });

    if (res4.status === 400 && res4.data.message && res4.data.message.includes('email')) {
      console.log('  ✅ PASS - Correctly rejected with validation error for missing email');
      passCount++;
    } else {
      console.log('  ❌ FAIL - Status: ' + res4.status + ', Message: ' + (res4.data.message || 'N/A'));
      failCount++;
    }

    // Test 5: Verify token is NOT allocated during creation
    console.log('\nTest 5: Verify token NOT allocated during creation');
    const scheduledStart5 = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
    const res5 = await makeRequest('POST', '/api/appointments', {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart: scheduledStart5,
      customerName: 'Charlie Davis',
      customerEmail: 'charlie@example.com',
      customerPhone: '3333333333',
      bookingType: 'in_person',
    });

    if (res5.status === 201 && !res5.data.appointment.tokenNumber) {
      console.log('  ✅ PASS - Token correctly NOT allocated during creation');
      passCount++;
    } else if (res5.status === 201 && res5.data.appointment.tokenNumber) {
      console.log('  ⚠️  WARNING - Token was allocated during creation (should be on confirmation)');
      failCount++;
    } else {
      console.log('  ❌ FAIL - Status: ' + res5.status);
      failCount++;
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`📊 TEST RESULTS: ${passCount} passed, ${failCount} failed`);
    console.log('='.repeat(50));

    if (failCount === 0) {
      console.log('\n✅ ALL TESTS PASSED - APPOINTMENT CREATION BUG IS FIXED!');
      process.exit(0);
    } else {
      console.log('\n❌ SOME TESTS FAILED');
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Test error: ${error.message}`);
    process.exit(1);
  }
}

runTests();
