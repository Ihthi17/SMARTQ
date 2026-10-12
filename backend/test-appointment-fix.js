// Test script to verify appointment creation 400 error is fixed
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

async function runTest() {
  console.log('🧪 Testing Appointment Creation Fix\n');

  try {
    // Step 1: Get providers
    console.log('Step 1: Fetching providers...');
    const providersRes = await makeRequest('GET', '/api/providers');
    
    if (providersRes.status !== 200) {
      console.log(`❌ Failed to fetch providers (status ${providersRes.status})`);
      process.exit(1);
    }

    const providers = providersRes.data.data || providersRes.data;
    if (!providers || providers.length === 0) {
      console.log('❌ No providers found');
      process.exit(1);
    }

    const providerId = providers[0]._id;
    const providerName = providers[0].name;
    console.log(`✅ Found provider: ${providerName} (ID: ${providerId})\n`);

    // Step 2: Create appointment
    console.log('Step 2: Creating appointment...');
    const scheduledStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    const appointmentData = {
      providerId,
      serviceCode: 'OPD-0001',
      scheduledStart,
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '1234567890',
      bookingType: 'in_person',
    };

    console.log('  Request body:', JSON.stringify(appointmentData, null, 2));
    
    const appointmentRes = await makeRequest('POST', '/api/appointments', appointmentData);
    
    console.log(`  Response status: ${appointmentRes.status}`);

    if (appointmentRes.status === 400) {
      console.log('\n❌ TEST FAILED - Got 400 Error (BUG NOT FIXED)');
      console.log('Error details:', appointmentRes.data);
      process.exit(1);
    } else if (appointmentRes.status === 201) {
      const appointment = appointmentRes.data.appointment;
      console.log('✅ Appointment created successfully!');
      console.log(`  Appointment ID: ${appointment._id}`);
      console.log(`  Status: ${appointment.status}`);
      console.log(`  Customer: ${appointment.customerName}`);
      console.log(`  Token Number: ${appointment.tokenNumber || 'Not allocated yet (correct)'}`);
      console.log('\n✅ TEST PASSED - 400 Error is FIXED!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  Unexpected status code: ${appointmentRes.status}`);
      console.log('Response:', appointmentRes.data);
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Test error: ${error.message}`);
    console.log(error);
    process.exit(1);
  }
}

runTest();
