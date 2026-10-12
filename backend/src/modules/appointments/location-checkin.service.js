export const LOCATION_CHECKIN_RADIUS_METERS = 150;

export const isWithinLocationRadius = (customerCoordinates, locationCoordinates, radiusMeters = LOCATION_CHECKIN_RADIUS_METERS) => {
  const latitude = Number(customerCoordinates?.latitude);
  const longitude = Number(customerCoordinates?.longitude);
  const locationLatitude = Number(locationCoordinates?.latitude);
  const locationLongitude = Number(locationCoordinates?.longitude);
  if (![latitude, longitude, locationLatitude, locationLongitude].every(Number.isFinite) ||
      latitude < -90 || latitude > 90 || locationLatitude < -90 || locationLatitude > 90 ||
      longitude < -180 || longitude > 180 || locationLongitude < -180 || locationLongitude > 180) {
    return false;
  }

  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDifference = radians(locationLatitude - latitude);
  const longitudeDifference = radians(locationLongitude - longitude);
  const haversine = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(locationLatitude)) *
    Math.sin(longitudeDifference / 2) ** 2;
  const distanceMeters = 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return distanceMeters <= radiusMeters;
};
