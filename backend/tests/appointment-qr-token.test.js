import { issueAppointmentQrToken, validateQrToken } from '../src/modules/appointments/token.service.js';

describe('appointment QR tokens', () => {
  test('issues a verifiable opaque token and rejects a different token', () => {
    const { token, hash } = issueAppointmentQrToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hash).not.toBe(token);
    expect(validateQrToken(token, hash)).toBe(true);
    expect(validateQrToken(`${token}invalid`, hash)).toBe(false);
  });
});
