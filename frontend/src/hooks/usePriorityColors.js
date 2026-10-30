import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axiosInstance';

/**
 * usePriorityColors Hook
 * 
 * Manages priority-based token colors across the application.
 * Provides methods to:
 * - Fetch and cache priority colors from backend
 * - Get color for a given priority level
 * - Calculate readable contrast text color (white or dark)
 * - Refresh colors when settings are updated
 * 
 * Usage:
 *   const { colors, getColorForPriority, getContrastText, refreshColors } = usePriorityColors();
 *   const bgColor = getColorForPriority('vip'); // e.g., '#f59e0b'
 *   const textColor = getContrastText(bgColor); // e.g., '#000000'
 */
export function usePriorityColors() {
  const [colors, setColors] = useState({
    standard: '#64748b',
    vip: '#f59e0b',
    emergency: '#ef4444',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initialLoadDone = useRef(false);

  // Fetch priority colors from backend
  const refreshColors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/settings/branding', { params: { includeLogo: false } });
      if (data?.priorityColors) {
        setColors(prev => ({ ...prev, ...data.priorityColors }));
      }
    } catch (err) {
      console.error('Failed to load priority colors:', err);
      setError(err?.message || 'Unknown error');
      // Keep using current colors on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Load colors on component mount (only once)
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      refreshColors().catch(err => console.error('Error in refreshColors:', err));
    }
  }, []);

  // Get color for a specific priority (case-insensitive, with fallback)
  const getColorForPriority = useCallback((priority) => {
    if (!priority) return colors.standard;
    const normalized = String(priority).toLowerCase();
    return colors[normalized] || colors.standard;
  }, [colors]);

  // Calculate readable text color based on background luminance
  // Uses relative luminance formula from WCAG 2.0
  const getContrastText = useCallback((backgroundColor) => {
    if (!backgroundColor || typeof backgroundColor !== 'string') {
      return '#ffffff';
    }

    try {
      // Convert hex to RGB
      const hex = backgroundColor.replace('#', '');
      if (hex.length !== 6) return '#ffffff';
      
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';

      // Calculate relative luminance (WCAG 2.0 formula)
      const luminance =
        0.299 * (r > 0.03928 ? Math.pow(r / 12.92, 2.4) : r / 12.92) +
        0.587 * (g > 0.03928 ? Math.pow(g / 12.92, 2.4) : g / 12.92) +
        0.114 * (b > 0.03928 ? Math.pow(b / 12.92, 2.4) : b / 12.92);

      // Return white text for dark backgrounds, dark text for light backgrounds
      return luminance > 0.5 ? '#000000' : '#ffffff';
    } catch (err) {
      console.error('Error calculating contrast text:', err);
      return '#ffffff';
    }
  }, []);

  return {
    colors,
    loading,
    error,
    getColorForPriority,
    getContrastText,
    refreshColors,
  };
}
