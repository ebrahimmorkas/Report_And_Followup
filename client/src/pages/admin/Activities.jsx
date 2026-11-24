import { useEffect, useState } from 'react';
import { api } from '../../api';
import Alert from '../../components/Alert';
import Modal from '../../components/Modal';
import BulkUpload from '../../components/BulkUpload';
import { CATEGORIES, CATEGORY_STYLE } from '../../categories';

function ActivityForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    category: initial?.category || '',
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
    if (!form.category) return setError('Select a category');
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
        <label className="label">Category *</label>
        <select className="input" value={form.category} onChange={set('category')} required>
          <option value="">Select category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
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
  const [category, setCategory] = useState('');
  const order = (a) => (CATEGORIES.includes(a.category) ? CATEGORIES.indexOf(a.category) : 99);
  const shown = activities
    .filter((a) => !category || a.category === category)
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

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
          <p className="text-sm text-slate-500">Each activity has a category (Tibb, Riyadah, Nazafat) and appears in Report, Follow-up, or both</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn-secondary whitespace-nowrap" onClick={() => setEditing('bulk')}>Bulk upload</button>
          <button className="btn-primary whitespace-nowrap" onClick={() => setEditing('new')}>+ Add Activity</button>
        </div>
      </div>
      <Alert>{error}</Alert>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Activity</th>
              <th className="th">Category</th>
              <th className="th text-center">Report</th>
              <th className="th text-center">Follow-up</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((a) => (
              <tr key={a._id} className="hover:bg-slate-50">
                <td className="td font-medium">{a.name}</td>
                <td className="td">
                  {a.category ? (
                    <span className={`badge ${CATEGORY_STYLE[a.category]}`}>{a.category}</span>
                  ) : (
                    <span className="text-xs text-amber-600">Not set</span>
                  )}
                </td>
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
            {shown.length === 0 && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={6}>No activities</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing === 'bulk' && (
        <Modal title="Bulk upload activities (Excel)" onClose={() => setEditing(null)} wide>
          <BulkUpload
            endpoint="/activities"
            templateName="Activities_upload_format.xlsx"
            columnsHint="Name | Category | Report | Follow-up"
            notes={[
              'Category: Tibb, Riyadah or Nazafat.',
              'Report and Follow-up: Yes or No (at least one must be Yes).',
              'Activities that already exist are not added again and are listed at the end.',
            ]}
            failedColumns={[
              { key: 'name', label: 'Name' },
              { key: 'category', label: 'Category' },
              { key: 'report', label: 'Report' },
              { key: 'followUp', label: 'Follow-up' },
            ]}
            onDone={load}
          />
        </Modal>
      )}

      {editing && editing !== 'bulk' && (
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
