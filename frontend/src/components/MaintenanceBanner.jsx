import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../api/axiosInstance';

export default function MaintenanceBanner() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkMaintenanceMode = async () => {
      try {
        const { data } = await api.get('/settings/branding');
        // Check if maintenance mode is enabled via settings
        const systemSettings = await api.get('/settings?group=system');
        const maintenanceSetting = Array.isArray(systemSettings.data) 
          ? systemSettings.data.find(s => s.key === 'system_maintenance_mode')
          : null;
        setMaintenanceMode(maintenanceSetting?.value === true || maintenanceSetting?.value === 'true');
      } catch (error) {
        console.error('Failed to check maintenance mode:', error);
      } finally {
        setLoading(false);
      }
    };

    checkMaintenanceMode();

    // Listen for settings updates
    const handleSettingsUpdate = () => {
      checkMaintenanceMode();
    };

    window.addEventListener('smartqueue:system-settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:settings-updated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('smartqueue:system-settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    };
  }, []);

  if (!maintenanceMode || loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-900 px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
        <AlertTriangle size={20} className="flex-shrink-0" />
        <p className="text-sm font-semibold">
          The system is under maintenance. Some services may be temporarily unavailable.
        </p>
      </div>
    </div>
  );
}
