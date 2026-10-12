import { useCallback, useContext, useEffect, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { MapPin, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { LocationPicker } from '../../components/LocationPicker';

const emptyForm = {
  name: '',
  code: '',
  address: '',
  placeId: '',
  lat: '',
  lng: '',
};

export default function LocationManagement() {
  const { user, permissions } = useContext(AuthContext);
  const canManage = user?.role === 'SUPER_ADMIN' || (Array.isArray(permissions) && permissions.includes('providers.manage'));
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const { data } = await api.get('/locations');
      setLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Could not load locations';
      console.error('Load locations error:', error);
      setApiError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    loadLocations(); 
  }, [loadLocations]);

  // Listen for location settings changes
  useEffect(() => {
    const handleSettingsUpdate = () => {
      loadLocations();
    };
    
    window.addEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:general-settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:location-settings-updated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('smartqueue:settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:general-settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:location-settings-updated', handleSettingsUpdate);
    };
  }, [loadLocations]);

  useEffect(() => {
    if (!dialog) return undefined;
    let cancelled = false;
    
    // Cleanup old approach - we don't need it anymore since LocationPicker handles it
    return () => {
      cancelled = true;
    };
  }, [dialog]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialog(true);
  };

  const openEdit = location => {
    setEditing(location);
    setForm({
      name: location.name || '',
      code: location.code || '',
      address: location.address || '',
      placeId: location.placeId || '',
      lat: location.lat ?? '',
      lng: location.lng ?? '',
    });
    setDialog(true);
  };

  const saveLocation = async event => {
    event.preventDefault();
    setBusy(true);
    
    const hasLat = form.lat !== '';
    const hasLng = form.lng !== '';
    
    if (hasLat !== hasLng) {
      toast.error('Enter both coordinates or use the location picker.');
      setBusy(false);
      return;
    }

    if (!form.name.trim() || !form.address.trim()) {
      toast.error('Location name and address are required.');
      setBusy(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      // Code is optional — the server auto-generates a unique code if left blank
      // or appends a suffix when a shared city/postal code is reused.
      code: form.code.trim() ? form.code.trim().toUpperCase() : undefined,
      address: form.address.trim(),
      placeId: form.placeId || null,
      lat: hasLat ? Number(form.lat) : undefined,
      lng: hasLng ? Number(form.lng) : undefined,
    };

    // Drop undefined fields so the backend can apply its defaults
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    // Remove undefined fields
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    try {
      if (editing) {
        await api.patch(`/locations/${editing._id}`, payload);
        toast.success('Location updated');
      } else {
        await api.post('/locations', payload);
        toast.success('Location created');
      }
      setDialog(false);
      await loadLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save location');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async location => {
    if (!window.confirm(`Deactivate ${location.name}? Services assigned here will remain saved but unavailable for new bookings.`)) return;
    try {
      await api.patch(`/locations/${location._id}/deactivate`);
      toast.success('Location deactivated');
      await loadLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not deactivate location');
    }
  };

  const removeLocation = async location => {
    if (!window.confirm(`Permanently delete ${location.name}? Any services assigned to it will be deactivated. This cannot be undone.`)) return;
    try {
      const { data } = await api.delete(`/locations/${location._id}`);
      toast.success(data?.message || 'Location deleted');
      await loadLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete location');
    }
  };

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="space-y-5">
        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            Error loading locations: {apiError}
            <button 
              onClick={loadLocations} 
              className="ml-4 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MapPin className="text-teal-700" /> Location management</h1>
            <p className="mt-1 text-sm text-slate-500">Manage service locations and their verified map coordinates.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadLocations} disabled={loading} aria-label="Refresh locations" className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 disabled:opacity-50"><RefreshCw size={16} /></button>
            {canManage && <button type="button" onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add location</button>}
          </div>
        </header>

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Location', 'Address', 'Coordinates', 'Status', 'Actions'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="5" className="p-8 text-center text-slate-500">Loading locations…</td></tr> : locations.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-slate-500">No locations configured.</td></tr> : locations.map(location => {
                const mapUrl = location.lat && location.lng ? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}` : '';
                return <tr key={location._id}>
                  <td className="px-5 py-4"><span className="font-semibold text-slate-900">{location.name}</span><span className="mt-1 block text-xs text-slate-500">{location.code}</span></td>
                  <td className="max-w-sm px-5 py-4 text-slate-700">{location.address || 'Address not set'}</td>
                  <td className="px-5 py-4 text-slate-600">{location.lat && location.lng ? <a className="text-teal-800 hover:underline" href={mapUrl} target="_blank" rel="noreferrer">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</a> : 'Not set'}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${location.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{location.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-5 py-4"><div className="flex gap-2">
                    {canManage && <button type="button" onClick={() => openEdit(location)} aria-label={`Edit ${location.name}`} title="Edit location" className="rounded-md border border-slate-300 p-1.5 text-slate-700"><Pencil size={15} /></button>}
                    {canManage && location.isActive && <button type="button" onClick={() => deactivate(location)} className="rounded-md border border-amber-200 px-2.5 py-1.5 text-xs text-amber-700 hover:bg-amber-50">Deactivate</button>}
                    {canManage && <button type="button" onClick={() => removeLocation(location)} aria-label={`Delete ${location.name}`} title="Delete location permanently" className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"><Trash2 size={15} /></button>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </section>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="location-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
            <header className="mb-5 flex items-start justify-between gap-4">
              <div><h2 id="location-dialog-title" className="text-xl font-bold text-slate-900">{editing ? 'Edit location' : 'Add location'}</h2><p className="mt-1 text-sm text-slate-500">Search Google Maps to fill the address and coordinates.</p></div>
              <button type="button" onClick={() => setDialog(false)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </header>
            <form onSubmit={saveLocation} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Location name<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={150} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                <label className="text-sm font-medium text-slate-700">Location code <span className="font-normal text-slate-400">(optional)</span><input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={60} pattern="[A-Z0-9][A-Z0-9_-]{0,59}" placeholder="Auto-generated if blank" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /><span className="mt-1 block text-xs text-slate-500">If two locations share a city/postal code, a unique suffix is added automatically.</span></label>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Location details</label>
                <LocationPicker
                  value={form}
                  onChange={(pickerValue) => setForm(current => ({
                    ...current,
                    address: pickerValue.address !== undefined ? pickerValue.address : current.address,
                    lat: pickerValue.lat !== undefined && pickerValue.lat !== null ? String(pickerValue.lat) : '',
                    lng: pickerValue.lng !== undefined && pickerValue.lng !== null ? String(pickerValue.lng) : '',
                    placeId: pickerValue.placeId !== undefined ? pickerValue.placeId : current.placeId,
                  }))}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setDialog(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : editing ? 'Save location' : 'Add location'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}