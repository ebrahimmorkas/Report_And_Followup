import { useCallback, useEffect, useState } from 'react';
import { api, download, fmtDate, qs } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useActivities, useJamaats, useJamiats } from '../hooks';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import EntryForm from './EntryForm';
import { KINDS } from './entryKinds';

const emptyFilters = { jamiat: '', jamaat: '', activity: '', from: '', to: '' };

export default function EntriesPage({ kind }) {
  const cfg = KINDS[kind];
  const { isAdmin } = useAuth();

  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [exporting, setExporting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false); // Super Admin: view soft-deleted entries

  const hasActions = !isAdmin || showDeleted;
  const colCount = 6 + cfg.textFields.length + (hasActions ? 1 : 0);
  const jamiats = useJamiats();
  const jamaats = useJamaats(filters.jamiat);
  const activities = useActivities(cfg.activityType);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get(`${cfg.endpoint}${qs({ ...filters, page, limit: 20, deleted: showDeleted ? 'true' : '' })}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint, filters, page, showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (e) => {
    const value = e.target.value;
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value, ...(key === 'jamiat' ? { jamaat: '' } : {}) }));
  };

  const onRestore = async (item) => {
    setError('');
    try {
      await api.post(`${cfg.endpoint}/${item._id}/restore`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (item) => {
    if (!window.confirm(`Delete this ${cfg.title.toLowerCase()} entry for ${item.jamaat?.name}? The Super Admin can restore it.`)) return;
    try {
      await api.del(`${cfg.endpoint}/${item._id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await download(`${cfg.endpoint}/export${qs(filters)}`, cfg.exportName);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const onSaved = () => {
    setEditing(null);
    load();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{cfg.title}</h1>
          <p className="text-sm text-slate-500">{cfg.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                }}
              />
              Show deleted entries
            </label>
          )}
          {isAdmin && !showDeleted && (
            <button className="btn-secondary" onClick={onExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </button>
          )}
          {!isAdmin && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              + Add {cfg.title}
            </button>
          )}
        </div>
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select className="input" value={filters.jamiat} onChange={setFilter('jamiat')}>
          <option value="">All Jamiats</option>
          {jamiats.map((j) => (
            <option key={j._id} value={j._id}>{j.name}</option>
          ))}
        </select>
        <select className="input" value={filters.jamaat} onChange={setFilter('jamaat')} disabled={!filters.jamiat}>
          <option value="">All Jamaats</option>
          {jamaats.map((j) => (
            <option key={j._id} value={j._id}>{j.name}</option>
          ))}
        </select>
        <select className="input" value={filters.activity} onChange={setFilter('activity')}>
          <option value="">All Activities</option>
          {activities.map((a) => (
            <option key={a._id} value={a._id}>{a.name}</option>
          ))}
        </select>
        <input type="date" className="input" title="From date" value={filters.from} onChange={setFilter('from')} />
        <input type="date" className="input" title="To date" value={filters.to} onChange={setFilter('to')} />
        <button
          className="btn-secondary"
          onClick={() => {
            setFilters(emptyFilters);
            setPage(1);
          }}
        >
          Reset
        </button>
      </div>

      <Alert>{error}</Alert>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Jamiat</th>
              <th className="th">Jamaat</th>
              <th className="th">Activity</th>
              <th className="th">{kind === 'report' ? 'Conducted' : 'Planned'}</th>
              <th className="th">Extra activities</th>
              {cfg.textFields.map((f) => (
                <th key={f.key} className="th">{f.label}</th>
              ))}
              <th className="th">{showDeleted ? 'Deleted by' : 'Entered by'}</th>
              {hasActions && <th className="th text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={colCount}>Loading…</td></tr>
            )}
            {!loading && data.items.length === 0 && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={colCount}>No entries found</td></tr>
            )}
            {!loading &&
              data.items.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="td">{item.jamiat?.name}</td>
                  <td className="td font-medium">{item.jamaat?.name}</td>
                  <td className="td">
                    {item.customActivity ? (
                      <>
                        {item.customActivity}
                        <span className="badge ml-1 bg-indigo-50 text-indigo-600">new</span>
                        {item.inPlaceOf && <div className="text-xs text-slate-500">in place of {item.inPlaceOf.name}</div>}
                      </>
                    ) : (
                      item.activity?.name
                    )}
                  </td>
                  <td className="td whitespace-nowrap">{fmtDate(item[cfg.dateField])}</td>
                  <td className="td">
                    {item.extraActivities.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {item.extraActivities.map((e, i) => (
                          <li key={i}>
                            {e.name}
                            {e.date && <span className="text-xs text-slate-500"> ({fmtDate(e.date)})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  {cfg.textFields.map((f) => (
                    <td key={f.key} className="td max-w-xs whitespace-pre-wrap break-words">
                      {item[f.key] || <span className="text-slate-400">—</span>}
                    </td>
                  ))}
                  <td className="td text-xs text-slate-500">
                    {showDeleted ? (
                      <>
                        <span className="text-red-600">{item.deletedBy?.name}</span>
                        <div>{fmtDate(item.deletedAt)}</div>
                        <div className="mt-1">Entered by {item.createdBy?.name}</div>
                      </>
                    ) : (
                      <>
                        {item.createdBy?.name}
                        <div>{fmtDate(item.createdAt)}</div>
                      </>
                    )}
                  </td>
                  {isAdmin && showDeleted && (
                    <td className="td whitespace-nowrap text-right">
                      <button className="text-indigo-600 hover:underline" onClick={() => onRestore(item)}>Restore</button>
                    </td>
                  )}
                  {!isAdmin && (
                    <td className="td whitespace-nowrap text-right">
                      <button className="mr-3 text-indigo-600 hover:underline" onClick={() => setEditing(item)}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => onDelete(item)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>{data.total} entr{data.total === 1 ? 'y' : 'ies'}</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {data.page || page} of {data.pages}</span>
          <button className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {editing && (
        <Modal title={`${editing === 'new' ? 'Add' : 'Edit'} ${cfg.title}`} onClose={() => setEditing(null)} wide>
          <EntryForm kind={kind} initial={editing === 'new' ? null : editing} onSaved={onSaved} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
