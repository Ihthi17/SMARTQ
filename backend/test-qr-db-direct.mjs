#!/usr/bin/env node

/**
 * Direct database test - bypasses auth to inspect QR emails
 */

import mongoose from 'mongoose';

async function testQrEmails() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 QR Code Email Database Inspection');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_queue_restore_20261015';
    await mongoose.connect(mongoUri, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Get collections
    const db = mongoose.connection.db;
    
    // Check users
    console.log('👤 Users in database:');
    const users = await db.collection('users').find({}).limit(3).toArray();
    users.forEach(u => {
      console.log(`   - ${u.username} (${u.email}) - Role: ${u.role} - Status: ${u.status}`);
    });
    
    // Check appointments with QR data
    console.log('\n📋 Appointments with QR codes:');
    const appointments = await db.collection('appointments')
      .find({ status: 'confirmed', qrToken: { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    if (appointments.length === 0) {
      console.log('   ❌ No confirmed appointments with QR codes found');
      console.log('\n   Creating test data by checking regular appointments...');
      const allAppts = await db.collection('appointments')
        .find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();
      
      console.log(`   Found ${allAppts.length} total appointments:\n`);
      allAppts.forEach(appt => {
        console.log(`   - ${appt._id}`);
        console.log(`     Status: ${appt.status}`);
        console.log(`     Customer: ${appt.customerName} (${appt.customerEmail})`);
        console.log(`     Has QR: ${appt.qrToken ? 'YES' : 'NO'}`);
        console.log(`     Token Label: ${appt.tokenLabel || 'N/A'}\n`);
      });
    } else {
      appointments.forEach((appt, idx) => {
        console.log(`\n   [${idx + 1}] ${appt._id}`);
        console.log(`       Customer: ${appt.customerName} (${appt.customerEmail})`);
        console.log(`       Status: ${appt.status}`);
        console.log(`       Token: ${appt.tokenLabel}`);
        console.log(`       QR Code: ${appt.qrToken}`);
        console.log(`       QR Generated: ${appt.qrGeneratedAt}`);
        console.log(`       QR Expires: ${appt.qrExpiresAt}`);
        console.log(`       Access Token: ${appt.qrAccessToken?.slice(0, 20)}...`);
        console.log(`       Used Codes: ${appt.usedQrCodes?.length || 0}`);
      });
    }
    
    // Check notifications
    console.log('\n📧 Email notifications:');
    const notifications = await db.collection('notifications')
      .find({ channel: 'email', category: 'booking_confirmation' })
      .sort({ sentAt: -1 })
      .limit(5)
      .toArray();
    
    if (notifications.length === 0) {
      console.log('   ❌ No booking confirmation emails found\n');
    } else {
      notifications.forEach((notif, idx) => {
        console.log(`\n   [${idx + 1}] ${notif._id}`);
        console.log(`       To: ${notif.recipient}`);
        console.log(`       Subject: ${notif.subject}`);
        console.log(`       Status: ${notif.status}`);
        console.log(`       Sent: ${notif.sentAt}`);
        console.log(`       Message: ${notif.message.substring(0, 80)}...`);
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.name === 'MongoServerSelectionError') {
      console.error('   MongoDB is not running or not accessible at configured URI');
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testQrEmails();
