import { useEffect, useRef, useState } from 'react';
import api from '../api/axiosInstance';

let googleMapsInstance = null;
let loadingPromise = null;

/**
 * Hook to load Google Maps API with Places library
 * Singleton pattern: loads the script only once, reuses for subsequent calls
 * Direct script loading (bypassing @googlemaps/js-api-loader for better compatibility)
 * @returns {Object} { isLoaded: boolean, error: string|null, maps: google.maps|null }
 */
export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(!!googleMapsInstance);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (googleMapsInstance) {
      setIsLoaded(true);
      return () => {
        isMountedRef.current = false;
      };
    }

    if (!loadingPromise) {
      loadingPromise = (async () => {
        try {
          // Fetch the API key from backend
          const { data } = await api.get('/settings/maps-key');
          const apiKey = data?.key;

          if (!apiKey) {
            throw new Error('Google Maps API key not configured. Please set it in System Settings > Location.');
          }

          // Load Google Maps directly via script tag (more reliable)
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,maps&loading=async`;
            script.async = true;
            script.defer = true;
            
            script.onload = () => {
              // Wait a tick for window.google to be available
              setTimeout(() => {
                if (window.google?.maps) {
                  googleMapsInstance = window.google.maps;
                  if (isMountedRef.current) {
                    setIsLoaded(true);
                    setError(null);
                  }
                  resolve(googleMapsInstance);
                } else {
                  const err = new Error('Google Maps loaded but window.google.maps is undefined');
                  if (isMountedRef.current) {
                    setError(err.message);
                    setIsLoaded(false);
                  }
                  reject(err);
                }
              }, 0);
            };
            
            script.onerror = () => {
              const err = new Error('Failed to load Google Maps script. Check your API key and network connection.');
              if (isMountedRef.current) {
                setError(err.message);
                setIsLoaded(false);
              }
              reject(err);
            };

            // Prevent multiple script tags
            const existing = document.querySelector('script[src*="maps.googleapis.com"]');
            if (existing) {
              existing.remove();
            }
            
            document.head.appendChild(script);
          });
        } catch (err) {
          const errorMessage = err.message || 'Failed to load Google Maps API';
          console.error('Google Maps loading error:', err);

          if (isMountedRef.current) {
            setError(errorMessage);
            setIsLoaded(false);
          }

          // Clear the loading promise on error so it can be retried
          loadingPromise = null;
          throw err;
        }
      })();
    }

    loadingPromise
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load Google Maps');
        }
      });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    isLoaded,
    error,
    maps: googleMapsInstance,
  };
}
