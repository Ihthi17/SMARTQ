import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle2, Eye, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const emptyForm = {
  name: '',
  code: '',
  providerId: '',
  description: '',
  channels: ['appointments', 'queue'],
  durationMinutes: 15,
  requiresDateTime: true,
  isActive: true,
};
const emptyRequirement = { label: '', type: 'text', required: false, options: '' };
const pageSize = 10;

export default function ProviderManagement() {
  const { user, permissions } = useContext(AuthContext);
  const canManage = user?.role === 'SUPER_ADMIN' || permissions.includes('providers.manage');
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [requirementDraft, setRequirementDraft] = useState(emptyRequirement);
  const [requirements, setRequirements] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/services');
      setServices(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Services are assigned to Locations. Load active locations for the dropdown.
    api.get('/locations')
      .then(({ data }) => setLocations(Array.isArray(data) ? data.filter(loc => loc.isActive) : []))
      .catch(error => toast.error(error.response?.data?.message || 'Could not load service locations'));
    // Still load providers for legacy display mapping (optional).
    api.get('/providers')
      .then(({ data }) => setProviders(Array.isArray(data) ? data : []))
      .catch(() => setProviders([]));
  }, []);

  // Listen for service settings changes
  useEffect(() => {
    const handleSettingsUpdate = () => {
      load();
    };
    
    window.addEventListener('smartqueue:service-settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('smartqueue:service-settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    };
  }, [load]);

  const filtered = useMemo(() => services.filter(service => {
    const matchesSearch = `${service.name} ${service.code} ${service.description || ''}`
      .toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (statusFilter === 'all' || service.isActive === (statusFilter === 'active'));
  }), [services, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setDialog('form');
  };

  const openEdit = service => {
    setSelected(service);
    setForm({
      name: service.name,
      code: service.code,
      // The dropdown is bound to form.providerId but holds a Location _id (backend treats it as location)
      providerId: service.location || service.providerId || '',
      description: service.description || '',
      channels: service.channels || ['appointments', 'queue'],
      durationMinutes: service.durationMinutes || 15,
      requiresDateTime: service.requiresDateTime !== false,
      isActive: service.isActive,
    });
    setDialog('form');
  };

  const saveService = async event => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      durationMinutes: Number(form.durationMinutes),
    };
    try {
      if (selected) {
        await api.patch(`/services/${encodeURIComponent(selected.code)}`, payload);
        toast.success('Service updated');
      } else {
        await api.post('/services', payload);
        toast.success('Service created');
      }
      setDialog('');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save service');
    } finally {
      setBusy(false);
    }
  };

  const toggleChannel = channel => setForm(current => ({
    ...current,
    channels: current.channels.includes(channel)
      ? current.channels.filter(item => item !== channel)
      : [...current.channels, channel],
  }));

  const openRequirements = service => {
    setSelected(service);
    setRequirements(service.requirements || []);
    setRequirementDraft(emptyRequirement);
    setDialog('requirements');
  };

  const addRequirement = () => {
    const label = requirementDraft.label.trim();
    if (!label) return toast.error('Enter a requirement label.');
    const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name)) return toast.error('Requirement label must produce a valid field name.');
    if (requirements.some(field => field.name === name)) return toast.error('A requirement with this label already exists.');
    const options = requirementDraft.options.split(',').map(option => option.trim()).filter(Boolean);
    if (requirementDraft.type === 'select' && options.length === 0) return toast.error('Add at least one dropdown option.');
    setRequirements(current => [...current, {
      name,
      label,
      type: requirementDraft.type,
      required: requirementDraft.required,
      options,
    }]);
    setRequirementDraft(emptyRequirement);
  };

  const saveRequirements = async () => {
    setBusy(true);
    try {
      await api.patch(`/services/${encodeURIComponent(selected.code)}`, {
        name: selected.name,
        location: selected.location || selected.providerId || '',
        description: selected.description || '',
        channels: selected.channels || ['appointments', 'queue'],
        durationMinutes: selected.durationMinutes || 15,
        requiresDateTime: selected.requiresDateTime !== false,
        isActive: selected.isActive,
        requirements,
      });
      toast.success('Service requirements saved');
      setDialog('');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save service requirements');
    } finally {
      setBusy(false);
    }
  };

  const setServiceStatus = async service => {
    const isActive = !service.isActive;
    
    // When deactivating, ensure location is set
    if (!isActive && !service.location && !service.providerId) {
      toast.error('Service must be assigned to a location before it can be deactivated. Please edit the service to assign it to a location.');
      return;
    }
    
    try {
      await api.patch(`/services/${encodeURIComponent(service.code)}`, {
        name: service.name,
        // Send the Location id so the backend's location validation passes.
        location: service.location || service.providerId || '',
        description: service.description || '',
        channels: service.channels || ['appointments', 'queue'],
        durationMinutes: service.durationMinutes || 15,
        requiresDateTime: service.requiresDateTime !== false,
        isActive,
        requirements: service.requirements || [],
      });
      toast.success(isActive ? 'Service activated' : 'Service deactivated');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update service status');
    }
  };

  const deleteServiceHandler = async service => {
    if (!window.confirm(`Delete service "${service.name}"? This action cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/services/${encodeURIComponent(service.code)}`);
      toast.success('Service deleted successfully');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete service');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Service management</h1>
            <p className="mt-1 text-sm text-slate-500">Manage services, assign each service to its location, and configure customer intake requirements.</p>
          </div>
          {canManage && <button type="button" onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"><Plus size={16} /> Create service</button>}
        </header>

        <form onSubmit={event => { event.preventDefault(); setSearch(searchInput); }} className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="relative min-w-48 flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Search services</span>
            <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search by name, code, or description" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
        </form>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-800">Services</h2>
            <span className="text-sm text-slate-500">{filtered.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{['Service', 'Location', 'Channels', 'Duration', 'Status', 'Actions'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan="6" className="p-8 text-center text-slate-500">Loading services…</td></tr>
                  : pageRows.map(service => <tr key={service.code}>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-900">{service.name}</span>
                      <span className="mt-1 block text-xs text-slate-500">{service.code}</span>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{locations.find(location => location._id === String(service.location))?.name || service.locationName || service.providerName || 'Location required'}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(service.channels || []).map(channel => <span key={channel} className={`rounded-full px-2.5 py-1 text-xs ${channel === 'appointments' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{channel === 'appointments' ? 'Appointments' : 'Queue'}</span>)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{service.durationMinutes} min</td>
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${service.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><CheckCircle2 size={13} />{service.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setSelected(service); setDialog('view'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Eye size={14} /> View</button>
                        {canManage && <>
                          <button type="button" onClick={() => openEdit(service)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Edit</button>
                          <button type="button" onClick={() => openRequirements(service)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><FileText size={14} /> Requirements</button>
                          <button type="button" onClick={() => setServiceStatus(service)} className={`rounded-lg border px-2.5 py-1.5 text-xs ${service.isActive ? 'border-amber-300 text-amber-800 hover:bg-amber-50' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}>{service.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button type="button" onClick={() => deleteServiceHandler(service)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14} /> Delete</button>
                        </>}
                      </div>
                    </td>
                  </tr>)}
                {!loading && pageRows.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">No services found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)} aria-label="Previous page" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40">‹</button>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(current => current + 1)} aria-label="Next page" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40">›</button>
            </div>
          </div>
        </section>
      </div>

      {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(''); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="service-dialog-title" className="text-xl font-bold text-slate-900">
                {dialog === 'view' ? 'Service details' : dialog === 'requirements' ? `Requirements · ${selected?.name}` : selected ? 'Edit service' : 'Create service'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{dialog === 'requirements' ? 'Manage the fields customers complete when booking this service.' : 'Configure the service details and available customer channels.'}</p>
            </div>
            <button type="button" onClick={() => setDialog('')} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>

          {dialog === 'form' && <form onSubmit={saveService} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Service name
                <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={100} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Service code
                <input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={40} pattern="[A-Z0-9][A-Z0-9_-]{1,39}" required disabled={Boolean(selected)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Service location
                <select value={form.providerId} onChange={event => setForm(current => ({ ...current, providerId: event.target.value }))} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  <option value="">Choose the location that provides this service</option>
                  {locations.map(location => <option key={location._id} value={location._id}>{location.name} ({location.code})</option>)}
                </select>
                {locations.length === 0 && <span className="mt-1 block text-xs text-amber-600">No active locations found. Create one in Location Management first.</span>}
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
                <textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Duration (minutes)
                <input type="number" min="1" max="1440" value={form.durationMinutes} onChange={event => setForm(current => ({ ...current, durationMinutes: event.target.value }))} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={form.requiresDateTime} onChange={event => setForm(current => ({ ...current, requiresDateTime: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-700" />
                Require date and time during booking
              </label>
              <fieldset className="text-sm font-medium text-slate-700">
                <legend>Customer channels</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {[['appointments', 'Appointments'], ['queue', 'Queue']].map(([channel, label]) => <label key={channel} className="flex items-center gap-2 font-normal">
                    <input type="checkbox" checked={form.channels.includes(channel)} onChange={() => toggleChannel(channel)} className="h-4 w-4 rounded border-slate-300 text-teal-700" />
                    {label}
                  </label>)}
                </div>
              </fieldset>
              {selected && <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-700" />Active</label>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setDialog('')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : selected ? 'Save changes' : 'Create service'}</button>
            </div>
          </form>}

          {dialog === 'view' && selected && <div className="space-y-3 text-sm">
            <p><span className="font-medium text-slate-500">Name</span><span className="ml-3 text-slate-900">{selected.name}</span></p>
            <p><span className="font-medium text-slate-500">Code</span><span className="ml-3 text-slate-900">{selected.code}</span></p>
            <p><span className="font-medium text-slate-500">Location</span><span className="ml-3 text-slate-900">{locations.find(location => location._id === String(selected.location))?.name || selected.locationName || selected.providerName || 'Not assigned'}</span></p>
            <p><span className="font-medium text-slate-500">Description</span><span className="ml-3 text-slate-900">{selected.description || '—'}</span></p>
            <p><span className="font-medium text-slate-500">Duration</span><span className="ml-3 text-slate-900">{selected.durationMinutes} minutes</span></p>
            <p><span className="font-medium text-slate-500">Requires Date/Time</span><span className="ml-3 text-slate-900">{selected.requiresDateTime !== false ? 'Yes' : 'No (walk-in/flexible)'}</span></p>
            <p><span className="font-medium text-slate-500">Channels</span><span className="ml-3 text-slate-900">{(selected.channels || []).map(channel => channel === 'appointments' ? 'Appointments' : 'Queue').join(', ')}</span></p>
            <p><span className="font-medium text-slate-500">Status</span><span className="ml-3 text-slate-900">{selected.isActive ? 'Active' : 'Inactive'}</span></p>
          </div>}

          {dialog === 'requirements' && selected && <div className="space-y-4">
            {requirements.length > 0 && <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
              {requirements.map(field => <li key={field.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="text-slate-800">{field.label}<span className="ml-2 text-xs text-slate-500">({field.type}{field.required ? ', required' : ''})</span></span>
                <button type="button" onClick={() => setRequirements(current => current.filter(item => item.name !== field.name))} className="text-xs font-medium text-red-700 hover:underline">Remove</button>
              </li>)}
            </ul>}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm text-slate-700">Requirement label
                <input value={requirementDraft.label} onChange={event => setRequirementDraft(current => ({ ...current, label: event.target.value }))} placeholder="e.g. Visit reason" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Field type
                <select value={requirementDraft.type} onChange={event => setRequirementDraft(current => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox', 'file'].map(type => <option key={type} value={type}>{type}</option>)}</select>
              </label>
              {requirementDraft.type === 'select' && <label className="text-sm text-slate-700 sm:col-span-2">Dropdown options
                <input value={requirementDraft.options} onChange={event => setRequirementDraft(current => ({ ...current, options: event.target.value }))} placeholder="Option 1, Option 2" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>}
              {requirementDraft.type === 'file' && <p className="text-xs text-slate-500 sm:col-span-2">Accepts PDF, JPG, PNG, or WebP files up to 5 MB.</p>}
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={requirementDraft.required} onChange={event => setRequirementDraft(current => ({ ...current, required: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-700" />Required</label>
              <button type="button" onClick={addRequirement} className="rounded-lg border border-teal-300 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50">Add requirement</button>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setDialog('')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={saveRequirements} disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save requirements'}</button>
            </div>
          </div>}
        </section>
      </div>}
    </AdminLayout>
  );
}
