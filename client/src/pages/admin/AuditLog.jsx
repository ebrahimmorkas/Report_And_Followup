import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api';
import Alert from '../../components/Alert';

const emptyFilters = { entity: '', action: '', from: '', to: '', q: '' };

const ACTION_LABEL = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  RESTORE: 'Restored',
  TRANSFER: 'Transferred',
  LOGIN: 'Login',
  LOGIN_FAILED: 'Login failed',
  LOGOUT: 'Logout',
  PASSWORD_CHANGE: 'Password changed',
};

const ACTION_STYLE = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  RESTORE: 'bg-teal-100 text-teal-700',
  TRANSFER: 'bg-amber-100 text-amber-700',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
};

const fmtTime = (v) =>
  new Date(v).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const show = (v) => (v === null || v === undefined || v === '' ? <span className="text-slate-400">—</span> : String(v));

/** Before/after detail for one log entry. */
function Details({ item }) {
  if (item.changes?.length) {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Previous value</th>
            <th className="py-1 font-medium">New value</th>
          </tr>
        </thead>
        <tbody>
          {item.changes.map((c) => (
            <tr key={c.field} className="border-t border-slate-200 align-top">
              <td className="py-1 pr-3 font-medium">{c.field}</td>
              <td className="py-1 pr-3 whitespace-pre-wrap text-red-700">{show(c.from)}</td>
              <td className="py-1 whitespace-pre-wrap text-green-700">{show(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const snap = item.after || item.before;
  if (!snap) return <div className="text-xs text-slate-500">No further details.</div>;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{item.after ? 'Saved data' : 'Data at the time of deletion'}</div>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
        {Object.entries(snap).map(([k, v]) => (
          <Fragment key={k}>
            <dt className="font-medium">{k}</dt>
            <dd className="whitespace-pre-wrap">{show(v)}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export default function AuditLog() {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1, entities: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get(`/audit${qs({ ...filters, page, limit: 50 })}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-slate-500">Every change in the system: who did it, when, and the previous and new values</p>
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select className="input" value={filters.entity} onChange={setFilter('entity')}>
          <option value="">All types</option>
          {data.entities.map((e) => (
            <option key={e} value={e}>{e === 'Auth' ? 'Login / Password' : e}</option>
          ))}
        </select>
        <select className="input" value={filters.action} onChange={setFilter('action')}>
          <option value="">All actions</option>
          {data.actions.map((a) => (
            <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
          ))}
        </select>
        <input type="date" className="input" title="From date" value={filters.from} onChange={setFilter('from')} />
        <input type="date" className="input" title="To date" value={filters.to} onChange={setFilter('to')} />
        <input className="input" placeholder="Search user or text" value={filters.q} onChange={setFilter('q')} />
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
              <th className="th">Date & time</th>
              <th className="th">User</th>
              <th className="th">Action</th>
              <th className="th">Type</th>
              <th className="th">What happened</th>
              <th className="th text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={6}>Loading…</td></tr>
            )}
            {!loading && data.items.length === 0 && (
              <tr><td className="td py-8 text-center text-slate-400" colSpan={6}>No log entries</td></tr>
            )}
            {!loading &&
              data.items.map((item) => (
                <Fragment key={item._id}>
                  <tr className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap text-xs">{fmtTime(item.at)}</td>
                    <td className="td text-sm">
                      {item.actorName || <span className="text-slate-400">—</span>}
                      {item.actorMobile && <div className="text-xs text-slate-500">{item.actorMobile}</div>}
                    </td>
                    <td className="td">
                      <span className={`badge ${ACTION_STYLE[item.action] || 'bg-slate-100 text-slate-600'}`}>
                        {ACTION_LABEL[item.action] || item.action}
                      </span>
                    </td>
                    <td className="td text-sm">{item.entity === 'Auth' ? 'Login' : item.entity}</td>
                    <td className="td text-sm">{item.summary}</td>
                    <td className="td text-right">
                      {(item.changes?.length || item.before || item.after) && (
                        <button className="text-indigo-600 hover:underline" onClick={() => setOpen(open === item._id ? null : item._id)}>
                          {open === item._id ? 'Hide' : 'View'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === item._id && (
                    <tr className="bg-slate-50">
                      <td className="td" colSpan={6}>
                        <Details item={item} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>{data.total} entries</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {data.page || page} of {data.pages}</span>
          <button className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
