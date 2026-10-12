import { isWithinLocationRadius, LOCATION_CHECKIN_RADIUS_METERS } from '../src/modules/appointments/location-checkin.service.js';

describe('appointment location check-in radius', () => {
  const branch = { latitude: 6.9271, longitude: 79.8612 };

  test('accepts coordinates inside the free default geofence', () => {
    expect(isWithinLocationRadius(branch, branch)).toBe(true);
    expect(LOCATION_CHECKIN_RADIUS_METERS).toBe(150);
  });

  test('rejects coordinates outside the geofence', () => {
    expect(isWithinLocationRadius(
      { latitude: branch.latitude + 0.01, longitude: branch.longitude },
      branch,
    )).toBe(false);
  });

  test('rejects missing or invalid coordinates', () => {
    expect(isWithinLocationRadius({}, branch)).toBe(false);
    expect(isWithinLocationRadius({ latitude: 91, longitude: 0 }, branch)).toBe(false);
  });
});
