import { useEffect, useRef } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';
import { useGoogleMaps } from '../hooks/useGoogleMaps';

/**
 * LocationPicker component (fully controlled)
 * - Reads values directly from `value` prop (single source of truth = parent form)
 * - Pushes every change immediately to parent via onChange
 * - Simple fallback UI (manual lat/lng) if Google Maps fails
 * - Places Autocomplete + draggable map marker when Maps loads
 */
export function LocationPicker({
  value = {},
  onChange,
  disabled = false,
}) {
  const { isLoaded, error: mapsError, maps } = useGoogleMaps();

  const address = value?.address ?? '';
  const lat = value?.lat !== undefined && value?.lat !== null ? String(value.lat) : '';
  const lng = value?.lng !== undefined && value?.lng !== null ? String(value.lng) : '';
  const placeId = value?.placeId ?? '';

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const autocompleteRef = useRef(null);
  const addressInputRef = useRef(null);

  // Keep latest values in a ref so map/autocomplete listeners never use stale closures
  const latestRef = useRef({ address, lat, lng, placeId });
  latestRef.current = { address, lat, lng, placeId };

  // Initialize map when it's loaded
  useEffect(() => {
    if (!isLoaded || !maps || !mapRef.current) return undefined;

    try {
      const current = latestRef.current;
      const initialLat = current.lat ? Number(current.lat) : -33.8688;
      const initialLng = current.lng ? Number(current.lng) : 151.2093;

      const map = new maps.Map(mapRef.current, {
        zoom: 15,
        center: { lat: initialLat, lng: initialLng },
        mapTypeControl: true,
        streetViewControl: false,
      });
      mapInstanceRef.current = map;

      const marker = new maps.Marker({
        map,
        position: { lat: initialLat, lng: initialLng },
        draggable: true,
      });
      markerRef.current = marker;

      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        onChange({
          ...latestRef.current,
          lat: pos.lat(),
          lng: pos.lng(),
        });
      });

      map.addListener('click', (e) => {
        marker.setPosition(e.latLng);
        onChange({
          ...latestRef.current,
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
        });
      });

      return () => {
        if (markerRef.current) markerRef.current.setMap(null);
      };
    } catch (err) {
      console.error('Map init error:', err);
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, maps]);

  // Keep marker/map in sync when parent updates coordinates
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    if (lat && lng) {
      const pos = { lat: Number(lat), lng: Number(lng) };
      markerRef.current.setPosition(pos);
      mapInstanceRef.current.setCenter(pos);
    }
  }, [lat, lng]);

  // Initialize autocomplete
  useEffect(() => {
    if (!isLoaded || !maps || !addressInputRef.current) return;

    try {
      const autocomplete = new maps.places.Autocomplete(addressInputRef.current, {
        fields: ['formatted_address', 'geometry', 'name', 'place_id'],
        types: ['establishment', 'geocode'],
      });
      autocompleteRef.current = autocomplete;

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;

        onChange({
          address: place.formatted_address || latestRef.current.address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          placeId: place.place_id || '',
        });
      });
    } catch (err) {
      console.error('Autocomplete init error:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, maps]);

  const emitAddress = (newAddress) => {
    onChange({
      address: newAddress,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      placeId,
    });
  };

  const emitLat = (newLat) => {
    onChange({
      address,
      lat: newLat ? Number(newLat) : undefined,
      lng: lng ? Number(lng) : undefined,
      placeId,
    });
  };

  const emitLng = (newLng) => {
    onChange({
      address,
      lat: lat ? Number(lat) : undefined,
      lng: newLng ? Number(newLng) : undefined,
      placeId,
    });
  };

  // Fallback UI when Maps fails to load — manual entry
  if (mapsError) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-900">Map unavailable — enter details manually</p>
            <p className="mt-1 text-xs text-amber-800">{mapsError}</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => emitAddress(e.target.value)}
            placeholder="Enter the full address"
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Latitude</label>
            <input
              type="number" min="-90" max="90" step="any"
              value={lat}
              onChange={(e) => emitLat(e.target.value)}
              placeholder="-90 to 90"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Longitude</label>
            <input
              type="number" min="-180" max="180" step="any"
              value={lng}
              onChange={(e) => emitLng(e.target.value)}
              placeholder="-180 to 180"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          <MapPin className="inline-block h-4 w-4 mr-1" /> Search address
        </label>
        <input
          ref={addressInputRef}
          type="text"
          value={address}
          onChange={(e) => emitAddress(e.target.value)}
          placeholder="Search for a place or type the address"
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Map</label>
        {!isLoaded && (
          <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-8">
            <p className="text-sm text-slate-500">Loading map…</p>
          </div>
        )}
        <div
          ref={mapRef}
          style={{ width: '100%', height: '300px', display: isLoaded ? 'block' : 'none' }}
          className="rounded-lg border border-slate-300"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Latitude</label>
          <input
            type="number" min="-90" max="90" step="any"
            value={lat}
            onChange={(e) => emitLat(e.target.value)}
            placeholder="-90 to 90"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Longitude</label>
          <input
            type="number" min="-180" max="180" step="any"
            value={lng}
            onChange={(e) => emitLng(e.target.value)}
            placeholder="-180 to 180"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </div>
      </div>
    </div>
  );
}
