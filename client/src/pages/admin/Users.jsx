import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useJamiats } from '../../hooks';
import Alert from '../../components/Alert';
import Modal from '../../components/Modal';
import PasswordInput from '../../components/PasswordInput';

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', JC: 'JC' };

function UserForm({ initial, users, onSaved, onCancel }) {
  const { user: me } = useAuth();
  const allJamiats = useJamiats();
  const isSelf = initial?._id === me._id;

  // Jamiat id -> name of the other active JC currently holding it.
  const owners = useMemo(() => {
    const map = new Map();
    users
      .filter((u) => u.role === 'JC' && u.isActive && u._id !== initial?._id)
      .forEach((u) => u.jamiats.forEach((j) => map.set(j._id, u.name)));
    return map;
  }, [users, initial]);
  const [conflicts, setConflicts] = useState(null);

  const [form, setForm] = useState({
    name: initial?.name || '',
    mobile: initial?.mobile || '',
    password: '',
    role: initial?.role || 'JC',
    isActive: initial?.isActive ?? true,
  });
  const [jamiats, setJamiats] = useState(new Set((initial?.jamiats || []).map((j) => j._id)));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const toggleJamiat = (id) =>
    setJamiats((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const visible = allJamiats.filter((j) => j.name.toLowerCase().includes(search.toLowerCase()));

  const save = async (transfer) => {
    setError('');
    if (form.role === 'JC' && jamiats.size === 0) return setError('Assign at least one Jamiat');
    setBusy(true);
    const body = { ...form, jamiats: form.role === 'JC' ? [...jamiats] : [], transfer };
    if (initial && !body.password) delete body.password;
    try {
      const d = initial ? await api.put(`/users/${initial._id}`, body) : await api.post('/users', body);
      onSaved(d.user);
    } catch (err) {
      if (err.data?.code === 'JAMIAT_CONFLICT') setConflicts(err.data.conflicts);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setConflicts(null);
    save(false);
  };

  if (conflicts) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2 font-semibold">These Jamiats are already assigned to another JC:</p>
          <ul className="mb-3 list-disc space-y-1 pl-5">
            {conflicts.map((c) => (
              <li key={`${c.jamiatId}-${c.userId}`}>
                <b>{c.jamiatName}</b> is assigned to <b>{c.userName}</b> ({c.userMobile})
              </li>
            ))}
          </ul>
          <p>
            Transfer them to <b>{form.name || 'this user'}</b>? They will be removed from the current JC. Report and
            Follow-up entries already made for these Jamiats move with them and can be viewed and edited by the new JC.
          </p>
        </div>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setConflicts(null)} disabled={busy}>
            No, go back
          </button>
          <button type="button" className="btn-primary bg-amber-600 hover:bg-amber-700" onClick={() => save(true)} disabled={busy}>
            {busy ? 'Transferring…' : 'Yes, transfer'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={form.name} onChange={set('name')} required />
        </div>
        <div>
          <label className="label">Mobile *</label>
          <input className="input" inputMode="tel" placeholder="10 digits, +91 is removed" value={form.mobile} onChange={set('mobile')} required />
        </div>
        <div>
          <label className="label">{initial ? 'Reset password' : 'Password *'}</label>
          <PasswordInput
            autoComplete="new-password"
            placeholder={initial ? 'Leave blank to keep current' : 'Min 6 characters'}
            value={form.password}
            onChange={set('password')}
            required={!initial}
            minLength={6}
          />
        </div>
        <div>
          <label className="label">Role *</label>
          <select className="input" value={form.role} onChange={set('role')} disabled={isSelf}>
            <option value="JC">JC</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
      </div>

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={isSelf} />
          Active
        </label>
      )}

      {form.role === 'JC' && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0">Jamiats * <span className="font-normal text-slate-500">({jamiats.size} selected)</span></label>
            <input className="input max-w-48 py-1" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
            {visible.map((j) => {
              const owner = owners.get(j._id);
              return (
                <label key={j._id} className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="mt-1" checked={jamiats.has(j._id)} onChange={() => toggleJamiat(j._id)} />
                  <span>
                    <span className={owner ? 'text-slate-500' : ''}>{j.name}</span>
                    {!j.isActive && <span className="badge ml-1 bg-slate-100 text-slate-500">inactive</span>}
                    {owner && <span className="block text-xs text-amber-700">Assigned to {owner}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            All Jamaats of the selected Jamiats are assigned automatically. A Jamiat can belong to only one active JC;
            picking one marked “Assigned to …” will ask to transfer it.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Update' : 'Create user'}</button>
      </div>
    </form>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const load = () =>
    api
      .get('/users')
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.mobile.includes(q) || u.jamiats.some((j) => j.name.toLowerCase().includes(q))
    );
  }, [users, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-slate-500">Create users and assign Jamiats</p>
        </div>
        <div className="flex gap-2">
          <input className="input w-56" placeholder="Search name, mobile, Jamiat" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Add User</button>
        </div>
      </div>
      <Alert>{error}</Alert>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Mobile</th>
              <th className="th">Role</th>
              <th className="th">Jamiats</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((u) => (
              <tr key={u._id} className="hover:bg-slate-50">
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.mobile}</td>
                <td className="td">
                  <span className={`badge ${u.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="td">
                  {u.role === 'SUPER_ADMIN' ? (
                    <span className="text-slate-400">All</span>
                  ) : u.jamiats.length ? (
                    u.jamiats.map((j) => j.name).join(', ')
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">No Jamiat assigned</span>
                  )}
                </td>
                <td className="td">
                  <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="td text-right">
                  <button className="text-indigo-600 hover:underline" onClick={() => setEditing(u)}>Edit</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={6}>No users</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add User' : 'Edit User'} onClose={() => setEditing(null)} wide>
          <UserForm
            initial={editing === 'new' ? null : editing}
            users={users}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
