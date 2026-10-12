import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { Check, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';

export default function RoleManagement() {
  const { user } = useContext(AuthContext);
  const [roles, setRoles] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [editRoleName, setEditRoleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users/role-permissions');
      setRoles(data.roles || []);
      setDefinitions(data.definitions || []);
      setSelectedRole(current => current || data.roles?.[0]?.role || '');
      return data.roles || [];
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load roles');
      return [];
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const selected = roles.find(role => role.role === selectedRole);
  useEffect(() => { setPermissions(selected?.permissions || []); }, [selectedRole, roles]);

  const groups = useMemo(() => [...new Set(definitions.map(item => item.category))]
    .map(category => ({ category, items: definitions.filter(item => item.category === category) })), [definitions]);

  const createRole = async event => {
    event.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/users/roles', { label: newRoleName });
      setNewRoleName('');
      const updatedRoles = await loadRoles();
      setSelectedRole(data.role);
      toast.success(`Role "${data.label}" created. Select its permissions and save.`);
      setPermissions([]);
      return updatedRoles;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create role');
      return [];
    } finally { setCreating(false); }
  };

  const startEditingRole = role => {
    setSelectedRole(role.role);
    setEditingRole(role.role);
    setEditRoleName(role.label);
  };

  const saveRoleName = async event => {
    event.preventDefault();
    setUpdatingRole(true);
    try {
      await api.patch(`/users/roles/${encodeURIComponent(editingRole)}`, { label: editRoleName });
      setEditingRole('');
      toast.success('Role updated');
      await loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update role');
    } finally { setUpdatingRole(false); }
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await api.put('/users/role-permissions', { role: selectedRole, permissions });
      toast.success('Role permissions saved');
      await loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save role permissions');
    } finally { setSaving(false); }
  };

  const removeRole = async role => {
    if (!window.confirm(`Delete the "${role.label}" role?`)) return;
    try {
      await api.delete(`/users/roles/${encodeURIComponent(role.role)}`);
      toast.success('Role deleted');
      setSelectedRole('');
      await loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete role');
    }
  };

  if (user?.role !== 'SUPER_ADMIN') {
    return <AdminLayout><div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Only a Super Admin can create roles or change role permissions.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-xl border border-slate-200 bg-white p-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><ShieldCheck className="text-teal-700" /> Role Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create user roles and configure their permissions independently from user accounts.</p>
        </header>

        <form onSubmit={createRole} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">New role name
            <input value={newRoleName} onChange={event => setNewRoleName(event.target.value)} minLength={2} maxLength={80} required placeholder="e.g. Reception Manager" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <button disabled={creating} className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> {creating ? 'Creating…' : 'Create role'}</button>
        </form>

        <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold text-slate-800">Roles</h2>
            {loading && <p className="text-sm text-slate-500">Loading roles…</p>}
            {roles.map(role => <div key={role.role} className={`flex items-center gap-2 rounded-lg border p-2 ${selectedRole === role.role ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
              <button type="button" onClick={() => { setSelectedRole(role.role); setEditingRole(''); }} className="min-w-0 flex-1 text-left">
                {editingRole === role.role ? (
                  <span className="block truncate text-sm font-semibold text-slate-800">Editing role name…</span>
                ) : (
                  <>
                    <span className="block truncate text-sm font-semibold text-slate-800">{role.label}</span>
                    <span className="text-xs text-slate-500">{role.permissions.length} permissions{role.systemRole ? ' · built-in' : ' · custom'}</span>
                  </>
                )}
              </button>
              {!role.systemRole && <>
                <button type="button" onClick={() => startEditingRole(role)} title={`Edit ${role.label}`} aria-label={`Edit ${role.label}`} className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil size={15} /></button>
                <button type="button" onClick={() => removeRole(role)} title={`Delete ${role.label}`} aria-label={`Delete ${role.label}`} className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
              </>}
            </div>)}
          </aside>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              {selected && editingRole === selected.role ? (
                <form onSubmit={saveRoleName} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="edit-role-name">Role name</label>
                  <input id="edit-role-name" value={editRoleName} onChange={event => setEditRoleName(event.target.value)} minLength={2} maxLength={80} required className="min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
                  <button type="submit" disabled={updatingRole} className="flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={15} /> Save name</button>
                  <button type="button" onClick={() => setEditingRole('')} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="Cancel role name edit"><X size={15} /></button>
                </form>
              ) : <h2 className="font-semibold text-slate-900">{selected?.label || 'Select a role'}</h2>}
              <p className="mt-1 text-sm text-slate-500">Toggle the areas this role can view or manage. Super Admin access is always unrestricted.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map(group => <fieldset key={group.category} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-700">{group.category}</legend>
                {group.items.map(permission => <label key={permission.key} className="flex items-start gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={permissions.includes(permission.key)} onChange={event => setPermissions(current => event.target.checked ? [...current, permission.key] : current.filter(item => item !== permission.key))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <span>{permission.label}</span>
                </label>)}
              </fieldset>)}
            </div>
            <button type="button" onClick={savePermissions} disabled={!selectedRole || saving || loading} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save role permissions'}</button>
          </section>
        </section>
      </div>
    </AdminLayout>
  );
}
