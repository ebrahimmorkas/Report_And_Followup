import { useEffect, useState } from 'react';
import { api } from '../../api';
import Alert from '../../components/Alert';
import Modal from '../../components/Modal';

function ActivityForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    showInReport: initial?.showInReport ?? false,
    showInFollowUp: initial?.showInFollowUp ?? false,
    isActive: initial?.isActive ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.showInReport && !form.showInFollowUp) return setError('Select Report, Follow-up, or both');
    setBusy(true);
    try {
      const d = initial ? await api.put(`/activities/${initial._id}`, form) : await api.post('/activities', form);
      onSaved(d.activity);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Alert>{error}</Alert>
      <div>
        <label className="label">Activity name *</label>
        <input className="input" value={form.name} onChange={set('name')} required />
      </div>
      <div>
        <div className="label">Show in *</div>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.showInReport} onChange={set('showInReport')} /> Report
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.showInFollowUp} onChange={set('showInFollowUp')} /> Follow-up
          </label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active
      </label>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Update' : 'Create'}</button>
      </div>
    </form>
  );
}

const Tick = ({ on }) => (on ? <span className="font-bold text-green-600">✓</span> : <span className="text-slate-300">—</span>);

export default function Activities() {
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () =>
    api
      .get('/activities')
      .then((d) => setActivities(d.activities))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Activities</h1>
          <p className="text-sm text-slate-500">Choose where each activity appears: Report, Follow-up, or both</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>+ Add Activity</button>
      </div>
      <Alert>{error}</Alert>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Activity</th>
              <th className="th text-center">Report</th>
              <th className="th text-center">Follow-up</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activities.map((a) => (
              <tr key={a._id} className="hover:bg-slate-50">
                <td className="td font-medium">{a.name}</td>
                <td className="td text-center"><Tick on={a.showInReport} /></td>
                <td className="td text-center"><Tick on={a.showInFollowUp} /></td>
                <td className="td">
                  <span className={`badge ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {a.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="td text-right">
                  <button className="text-indigo-600 hover:underline" onClick={() => setEditing(a)}>Edit</button>
                </td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={5}>No activities</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={editing === 'new' ? 'Add Activity' : 'Edit Activity'} onClose={() => setEditing(null)}>
          <ActivityForm
            initial={editing === 'new' ? null : editing}
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
