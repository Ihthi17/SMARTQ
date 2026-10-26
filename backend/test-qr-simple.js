#!/usr/bin/env node

/**
 * Simple test for QR code generation with embedded images
 * Tests the core QR image generation logic without database dependencies
 */

import QRCode from 'qrcode';

async function testQrGeneration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 SmartQ QR Code Image Generation Test');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Simulate a check-in code
  const checkInCode = '12345678';
  
  console.log('📝 Test Configuration:');
  console.log(`   - Check-in code: ${checkInCode}`);
  console.log(`   - Code length: ${checkInCode.length} digits`);
  console.log(`   - QR Error Correction: M (medium)`);
  console.log(`   - QR Image size: 320x320px\n`);
  
  try {
    // Test 1: PNG Buffer generation
    console.log('🧪 Test 1: Generate QR as PNG buffer...');
    const pngBuffer = await QRCode.toBuffer(checkInCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
    
    console.log(`✅ PNG buffer generated: ${pngBuffer.length} bytes`);
    
    // Verify PNG signature
    const pngHeader = pngBuffer.slice(0, 4);
    const isPng = pngHeader[0] === 0x89 && 
                  pngHeader[1] === 0x50 && 
                  pngHeader[2] === 0x4E && 
                  pngHeader[3] === 0x47;
    console.log(`✅ PNG signature valid: ${isPng ? 'YES ✓' : 'NO ✗'}\n`);
    
    if (!isPng) {
      throw new Error('Invalid PNG signature');
    }
    
    // Test 2: Data URI creation
    console.log('🧪 Test 2: Create base64 data URI...');
    const base64 = pngBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;
    
    console.log(`✅ Base64 encoded: ${base64.length} chars`);
    console.log(`✅ Data URI length: ${dataUri.length} chars (${(dataUri.length / 1024).toFixed(2)} KB)`);
    console.log(`✅ Data URI preview: ${dataUri.slice(0, 60)}...\n`);
    
    // Test 3: Email HTML with embedded image
    console.log('🧪 Test 3: Generate email HTML with embedded QR...');
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .qr-image { text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Appointment Confirmed</h1>
    <p>Your check-in QR code:</p>
    <div class="qr-image">
      <img alt="Check-in QR code" src="${dataUri}" width="280" height="280" />
    </div>
    <p>Show this QR code at check-in.</p>
  </div>
</body>
</html>
    `.trim();
    
    console.log(`✅ Email HTML generated: ${emailHtml.length} chars (${(emailHtml.length / 1024).toFixed(2)} KB)`);
    console.log(`✅ HTML validation:`);
    console.log(`   - Contains <img>: ${emailHtml.includes('<img') ? 'YES ✓' : 'NO ✗'}`);
    console.log(`   - Contains src: ${emailHtml.includes('src=') ? 'YES ✓' : 'NO ✗'}`);
    console.log(`   - Contains data URI: ${emailHtml.includes('data:image/png;base64,') ? 'YES ✓' : 'NO ✗'}\n`);
    
    // Test 4: Attachment format (for email clients that don't support data URIs)
    console.log('🧪 Test 4: Create email attachment format...');
    const attachment = {
      filename: 'checkin-qr.png',
      content: pngBuffer,
      contentType: 'image/png',
      cid: 'checkin-qr-image',
    };
    
    console.log(`✅ Attachment created:`);
    console.log(`   - Filename: ${attachment.filename}`);
    console.log(`   - Content size: ${attachment.content.length} bytes`);
    console.log(`   - Content-Type: ${attachment.contentType}`);
    console.log(`   - Content-ID: ${attachment.cid}\n`);
    
    // Test 5: HTML with cid: reference
    console.log('🧪 Test 5: Generate email HTML with cid: reference...');
    const emailHtmlWithCid = `
<!DOCTYPE html>
<html>
<body>
  <h1>Appointment Confirmed</h1>
  <p>Your check-in QR code:</p>
  <img alt="Check-in QR code" src="cid:${attachment.cid}" width="280" height="280" />
  <p>Show this QR code at check-in.</p>
</body>
</html>
    `.trim();
    
    console.log(`✅ Email HTML with cid: reference generated`);
    console.log(`✅ HTML validation:`);
    console.log(`   - Contains cid: reference: ${emailHtmlWithCid.includes(`cid:${attachment.cid}`) ? 'YES ✓' : 'NO ✗'}\n`);
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED\n');
    console.log('📊 Summary:');
    console.log(`   ✓ QR PNG buffer: ${pngBuffer.length} bytes`);
    console.log(`   ✓ Base64 data URI: ${(dataUri.length / 1024).toFixed(2)} KB`);
    console.log(`   ✓ Email with embedded image: ${(emailHtml.length / 1024).toFixed(2)} KB`);
    console.log(`   ✓ Email with cid: attachment: ${(emailHtmlWithCid.length / 1024).toFixed(2)} KB`);
    console.log('\n💡 Recommended approach for emails:');
    console.log('   1. Use cid: reference format (better email client compatibility)');
    console.log('   2. Include PNG as inline attachment');
    console.log('   3. Fallback: Use base64 data URI for clients that support it\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testQrGeneration();
