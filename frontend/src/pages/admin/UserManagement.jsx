import { useCallback, useContext, useEffect, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { Eye, LockKeyholeOpen, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';

const blankForm = { name: '', username: '', email: '', phone: '', password: '', role: 'staff', status: 'ACTIVE' };
const ROLE_LABELS = { SUPER_ADMIN: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer' };

export default function UserManagement() {
  const { user: currentUser, permissions } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState('');
  const [viewUser, setViewUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentRole = currentUser?.role;
  const canManageUsers = currentRole === 'SUPER_ADMIN' || permissions.includes('users.manage');

  const loadUsers = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/users', { params: { search, ...(roleFilter && { role: roleFilter }), ...(statusFilter && { status: statusFilter }) } });
      setUsers(data.users || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load users');
    } finally { setBusy(false); }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    api.get('/users/roles')
      .then(({ data }) => setRoles(data.roles || []))
      .catch(error => toast.error(error.response?.data?.message || 'Could not load roles'));
  }, []);

  const openCreate = () => {
    setEditingId('');
    setForm(blankForm);
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditingId(user._id);
    setForm({ ...blankForm, name: user.name || '', username: user.username, email: user.email, phone: user.phone || '', role: user.role, status: user.status });
    setShowForm(true);
  };

  const saveUser = async (event) => {
    event.preventDefault();
    const payload = { ...form };
    if (editingId && !payload.password) delete payload.password;
    setBusy(true);
    try {
      if (editingId) await api.patch(`/users/${editingId}`, payload);
      else await api.post('/users', payload);
      toast.success(editingId ? 'User updated' : 'User created');
      setShowForm(false);
      setEditingId('');
      setForm(blankForm);
      await loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save user');
    } finally { setBusy(false); }
  };

  const toggleStatus = async (user) => {
    const status = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/users/${user._id}`, { status });
      toast.success(`User ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      await loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update user');
    }
  };

  const unlockUser = async (user) => {
    try {
      await api.patch(`/users/${user._id}/unlock`);
      toast.success('User unlocked');
      await loadUsers();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not unlock user'); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.name || user.username}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${user._id}`);
      toast.success('User deleted');
      await loadUsers();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not delete user'); }
  };

  const roleLabel = role => roles.find(item => item.role === role)?.label || ROLE_LABELS[role] || role;

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><UserRound className="text-teal-700" /> User Management</h1><p className="mt-1 text-sm text-slate-500">Create, edit, and manage user accounts with role-based access.</p></div>
          {canManageUsers && <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Create user</button>}
        </header>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_160px_auto]">
            <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') loadUsers(); }} placeholder="Search users..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" /></div>
            <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">All roles</option><option value="SUPER_ADMIN">Super Admin</option>{roles.map(item => <option key={item.role} value={item.role}>{item.label}</option>)}</select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></select>
            <button onClick={loadUsers} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Search</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600"><tr>{['Name', 'Username', 'Email', 'Role', 'Status', 'Actions'].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => <tr key={user._id}>
                  <td className="px-3 py-3 font-medium text-slate-800">{user.name || '—'}</td><td className="px-3 py-3">{user.username}</td><td className="px-3 py-3">{user.email}</td>
                  <td className="px-3 py-3">{roleLabel(user.role)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{user.status}</span></td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setViewUser(user)} title="View user" className="rounded-md border border-slate-300 p-1.5 text-slate-600"><Eye size={15} /></button>
                    {canManageUsers && <button onClick={() => openEdit(user)} disabled={user.role === 'SUPER_ADMIN' && currentRole !== 'SUPER_ADMIN'} title="Edit user" className="rounded-md border border-blue-200 p-1.5 text-blue-700 disabled:opacity-40"><Pencil size={15} /></button>}
                    {canManageUsers && user.role !== 'SUPER_ADMIN' && <button onClick={() => user.failedLoginAttempts || user.lockUntil ? unlockUser(user) : toggleStatus(user)} title={user.failedLoginAttempts || user.lockUntil ? 'Unlock account' : user.status === 'ACTIVE' ? 'Deactivate user' : 'Activate user'} className="rounded-md border border-amber-200 p-1.5 text-amber-700">{user.failedLoginAttempts || user.lockUntil ? <LockKeyholeOpen size={15} /> : user.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>}
                    {canManageUsers && user.role !== 'SUPER_ADMIN' && <button onClick={() => deleteUser(user)} title="Delete user" className="rounded-md border border-red-200 p-1.5 text-red-700"><Trash2 size={15} /></button>}
                  </div></td>
                </tr>)}
                {!busy && users.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{users.length} user{users.length === 1 ? '' : 's'}</p>
        </section>
      </div>

      {(showForm || viewUser) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) { setShowForm(false); setViewUser(null); } }}>
        <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{viewUser ? 'User details' : editingId ? 'Edit user' : 'Create user'}</h2><button onClick={() => { setShowForm(false); setViewUser(null); }} aria-label="Close"><X size={20} /></button></header>
          {viewUser ? <dl className="grid gap-4 sm:grid-cols-2">{[['Name', viewUser.name], ['Username', viewUser.username], ['Email', viewUser.email], ['Phone', viewUser.phone], ['Role', roleLabel(viewUser.role)], ['Status', viewUser.status], ['Last login', viewUser.lastLoginAt ? new Date(viewUser.lastLoginAt).toLocaleString() : 'Never']].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value || '—'}</dd></div>)}</dl> :
            <form onSubmit={saveUser} className="grid gap-4 sm:grid-cols-2">
              {[['name', 'Name', 'text'], ['username', 'Username', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['password', editingId ? 'New temporary password (optional)' : 'Temporary password', 'password']].map(([key, label, type]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input type={type} required={!editingId && ['username', 'email', 'password'].includes(key)} disabled={editingId && key === 'username'} value={form[key]} onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>)}
              <label className="text-sm font-medium text-slate-700">Role<select value={form.role} disabled={editingId && form.role === 'SUPER_ADMIN' && currentRole !== 'SUPER_ADMIN'} onChange={event => setForm(old => ({ ...old, role: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{currentRole === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}{roles.map(item => <option key={item.role} value={item.role}>{item.label}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Create and configure roles separately in Role Management.</span></label>
              {editingId && <label className="text-sm font-medium text-slate-700">Status<select value={form.status} onChange={event => setForm(old => ({ ...old, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></select></label>}
              <footer className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create user'}</button></footer>
            </form>}
        </section>
      </div>}
    </AdminLayout>
  );
}
