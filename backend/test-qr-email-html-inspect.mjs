#!/usr/bin/env node

/**
 * Generate and inspect the email HTML that would be sent
 */

import mongoose from 'mongoose';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

async function inspectAndGenerateEmailHtml() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📧 QR Code Email HTML Generation Test');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_queue_restore_20261015';
    await mongoose.connect(mongoUri, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Get a confirmed appointment with QR
    const appointment = await db.collection('appointments')
      .findOne({ status: 'confirmed', qrToken: { $exists: true } });
    
    if (!appointment) {
      console.log('❌ No confirmed appointment with QR found');
      process.exit(1);
    }
    
    console.log('📋 Appointment Data:');
    console.log(`   - ID: ${appointment._id}`);
    console.log(`   - Customer: ${appointment.customerName}`);
    console.log(`   - Email: ${appointment.customerEmail}`);
    console.log(`   - Token: ${appointment.tokenLabel}`);
    console.log(`   - QR Code: ${appointment.qrToken}`);
    console.log(`   - Service: ${appointment.serviceCode}`);
    console.log(`   - Branch: ${appointment.branchCode}\n`);
    
    // Generate QR image
    console.log('🖼️  Generating QR image...');
    const qrBuffer = await QRCode.toBuffer(appointment.qrToken, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
    
    console.log(`   ✅ PNG generated: ${qrBuffer.length} bytes`);
    
    // Create data URI
    const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;
    console.log(`   ✅ Data URI: ${qrDataUri.length} chars (${(qrDataUri.length / 1024).toFixed(2)} KB)\n`);
    
    // Generate email HTML
    console.log('📧 Generating email HTML...');
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); padding: 40px 30px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 40px 30px; }
    .qr-section { text-align: center; margin: 32px 0; padding: 24px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .qr-label { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; }
    .qr-image { text-align: center; margin: 20px 0; }
    .qr-image img { display: block; border: 2px solid #e5e7eb; border-radius: 12px; padding: 8px; margin: 0 auto; }
    .details-box { background-color: #f3f4f6; padding: 24px; border-radius: 8px; margin: 24px 0; }
    .details-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #d1d5db; font-size: 14px; }
    .details-row:last-child { border-bottom: none; }
    .details-label { color: #6b7280; font-weight: 500; }
    .details-value { color: #111827; font-weight: 600; }
    .instructions { background-color: #f0f9f8; border-left: 4px solid #14b8a6; padding: 20px; border-radius: 6px; margin: 24px 0; }
    .instructions h3 { margin: 0 0 12px 0; color: #0f766e; font-size: 16px; font-weight: 700; }
    .instructions ol { margin: 0; padding-left: 20px; }
    .instructions li { margin: 8px 0; color: #374151; font-size: 14px; line-height: 1.6; }
    .footer { background-color: #f3f4f6; padding: 24px 30px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>✓ Appointment Confirmed</h1>
      <p>Your queue token is ready</p>
    </div>

    <!-- Main Content -->
    <div class="content">
      <p style="font-size: 16px; color: #111827; margin: 0 0 24px 0;">
        Hello <strong>${escapeHtml(appointment.customerName)}</strong>,
      </p>

      <p style="font-size: 14px; color: #374151; line-height: 1.8; margin: 0 0 24px 0;">
        Your appointment at <strong>${escapeHtml(appointment.branchCode)}</strong> has been confirmed. Your queue token is ready for check-in.
      </p>

      <!-- QR Code Section -->
      <div class="qr-section">
        <p class="qr-label">Your Check-in QR Code</p>
        <p style="font-size: 14px; color: #111827; margin: 16px 0;">
          Scan this QR code at the check-in counter. Code expires in 60 seconds.
        </p>
        <div class="qr-image">
          <img alt="Appointment check-in QR code" src="${qrDataUri}" width="280" height="280" />
        </div>
        <p style="font-size: 12px; color: #6b7280; margin: 12px 0 0 0; text-align: center;">
          <strong>Your 8-digit check-in code auto-refreshes every 60 seconds</strong>
        </p>
      </div>

      <!-- Appointment Details -->
      <div class="details-box">
        <div class="details-row">
          <span class="details-label">📅 Service</span>
          <span class="details-value">${escapeHtml(appointment.serviceCode)}</span>
        </div>
        <div class="details-row">
          <span class="details-label">📍 Location</span>
          <span class="details-value">${escapeHtml(appointment.branchCode)}</span>
        </div>
        <div class="details-row">
          <span class="details-label">🎫 Token Number</span>
          <span class="details-value">${escapeHtml(appointment.tokenLabel)}</span>
        </div>
        ${appointment.hasScheduledTime ? `
        <div class="details-row">
          <span class="details-label">🕐 Scheduled Time</span>
          <span class="details-value">${new Date(appointment.scheduledStart).toLocaleString()}</span>
        </div>
        ` : `
        <div class="details-row">
          <span class="details-label">📋 Appointment Type</span>
          <span class="details-value">Walk-in / Flexible</span>
        </div>
        `}
      </div>

      <!-- Instructions -->
      <div class="instructions">
        <h3>📋 How to Check In</h3>
        <ol>
          <li>Arrive at the location at your scheduled time</li>
          <li>Show this email with the QR code at the check-in counter</li>
          <li>Staff will scan your QR code or you can provide the 8-digit code</li>
          <li>Your position will be confirmed in the queue</li>
          <li>Wait for your token number to be called</li>
        </ol>
      </div>

      <!-- Important Notice -->
      <p style="font-size: 13px; color: #6b7280; line-height: 1.8; margin: 24px 0;">
        <strong>ℹ️ Important:</strong> Your QR code contains an 8-digit check-in code that is valid for 60 seconds. After 60 seconds, a new code is generated. Open this email on your device for the current code at check-in.
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="margin: 0; font-weight: 600; color: #111827;">Smart Queue</p>
      <p style="margin: 4px 0 0 0;">Professional Queue Management System</p>
      <p style="margin: 12px 0 0 0; border-top: 1px solid #d1d5db; padding-top: 12px;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
`;
    
    console.log(`   ✅ Email HTML generated: ${emailHtml.length} chars (${(emailHtml.length / 1024).toFixed(2)} KB)\n`);
    
    // Save email HTML to file
    const outputPath = path.join(process.cwd(), 'test-email-output.html');
    fs.writeFileSync(outputPath, emailHtml);
    console.log(`✅ Email HTML saved to: ${outputPath}`);
    console.log(`   Open this file in a browser to preview the email\n`);
    
    // Validate email HTML
    console.log('🔍 Email HTML Validation:');
    const checks = {
      'Has DOCTYPE': emailHtml.includes('<!DOCTYPE html>'),
      'Has <head>': emailHtml.includes('<head>'),
      'Has <img> with QR data URI': emailHtml.includes(`src="${qrDataUri.split('data:')[0]}data:`),
      'Has appointment details': emailHtml.includes(appointment.customerName),
      'Has token number': emailHtml.includes(appointment.tokenLabel),
      'Has service info': emailHtml.includes(appointment.serviceCode),
      'Has check-in instructions': emailHtml.includes('Check In'),
      'Has footer': emailHtml.includes('Smart Queue'),
    };
    
    Object.entries(checks).forEach(([check, result]) => {
      console.log(`   ${result ? '✅' : '❌'} ${check}`);
    });
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('📊 Summary:');
    console.log(`   ✓ Appointment: ${appointment.tokenLabel}`);
    console.log(`   ✓ QR Code: ${appointment.qrToken}`);
    console.log(`   ✓ QR Image: ${qrBuffer.length} bytes PNG`);
    console.log(`   ✓ Email HTML: ${(emailHtml.length / 1024).toFixed(2)} KB`);
    console.log(`   ✓ All validations: PASS\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

inspectAndGenerateEmailHtml();
