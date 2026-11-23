import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api';
import Alert from '../../components/Alert';
import Modal from '../../components/Modal';

/** Small modal form to add or rename a Jamiat/Jamaat. */
function NameForm({ label, initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(name);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert>{error}</Alert>
      <div>
        <label className="label">{label} name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy}>Save</button>
      </div>
    </form>
  );
}

const StatusToggle = ({ active, onClick }) => (
  <button
    onClick={onClick}
    className={`badge ${active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
    title="Click to toggle"
  >
    {active ? 'Active' : 'Inactive'}
  </button>
);

export default function Masters() {
  const [jamiats, setJamiats] = useState([]);
  const [selected, setSelected] = useState(null);
  const [jamaats, setJamaats] = useState([]);
  const [jamiatSearch, setJamiatSearch] = useState('');
  const [jamaatSearch, setJamaatSearch] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { type: 'jamiat'|'jamaat', item? }

  const loadJamiats = useCallback(
    () =>
      api
        .get('/masters/jamiats?withCounts=true')
        .then((d) => setJamiats(d.jamiats))
        .catch((e) => setError(e.message)),
    []
  );

  const loadJamaats = useCallback(() => {
    if (!selected) return setJamaats([]);
    api
      .get(`/masters/jamaats${qs({ jamiat: selected._id })}`)
      .then((d) => setJamaats(d.jamaats))
      .catch((e) => setError(e.message));
  }, [selected]);

  useEffect(() => {
    loadJamiats();
  }, [loadJamiats]);
  useEffect(() => {
    loadJamaats();
  }, [loadJamaats]);

  const toggle = async (type, item) => {
    setError('');
    try {
      await api.put(`/masters/${type}s/${item._id}`, { isActive: !item.isActive });
      if (type === 'jamiat') {
        await loadJamiats();
        if (selected?._id === item._id) setSelected({ ...selected, isActive: !item.isActive });
      } else loadJamaats();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveName = async (name) => {
    const { type, item } = modal;
    if (item) await api.put(`/masters/${type}s/${item._id}`, { name });
    else await api.post(`/masters/${type}s`, type === 'jamaat' ? { name, jamiat: selected._id } : { name });
    setModal(null);
    await loadJamiats();
    if (type === 'jamiat' && item && selected?._id === item._id) setSelected({ ...selected, name: name.trim().toUpperCase() });
    if (type === 'jamaat') loadJamaats();
  };

  const shownJamiats = jamiats.filter((j) => j.name.toLowerCase().includes(jamiatSearch.toLowerCase()));
  const shownJamaats = jamaats.filter((j) => j.name.toLowerCase().includes(jamaatSearch.toLowerCase()));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Jamiat / Jamaat</h1>
        <p className="text-sm text-slate-500">Master list. Inactive items are hidden from JCs when entering data.</p>
      </div>
      <Alert>{error}</Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
            <h2 className="font-semibold">Jamiats ({jamiats.length})</h2>
            <div className="flex gap-2">
              <input className="input w-40 py-1" placeholder="Search…" value={jamiatSearch} onChange={(e) => setJamiatSearch(e.target.value)} />
              <button className="btn-primary py-1" onClick={() => setModal({ type: 'jamiat' })}>+ Add</button>
            </div>
          </div>
          <ul className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
            {shownJamiats.map((j) => (
              <li
                key={j._id}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${selected?._id === j._id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                onClick={() => setSelected(j)}
              >
                <span>
                  <span className="font-medium">{j.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{j.jamaatCount} jamaats</span>
                </span>
                <span className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <button className="text-xs text-indigo-600 hover:underline" onClick={() => setModal({ type: 'jamiat', item: j })}>Rename</button>
                  <StatusToggle active={j.isActive} onClick={() => toggle('jamiat', j)} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
            <h2 className="font-semibold">{selected ? `Jamaats in ${selected.name} (${jamaats.length})` : 'Jamaats'}</h2>
            {selected && (
              <div className="flex gap-2">
                <input className="input w-40 py-1" placeholder="Search…" value={jamaatSearch} onChange={(e) => setJamaatSearch(e.target.value)} />
                <button className="btn-primary py-1" onClick={() => setModal({ type: 'jamaat' })}>+ Add</button>
              </div>
            )}
          </div>
          {!selected ? (
            <div className="p-8 text-center text-sm text-slate-400">Select a Jamiat to see its Jamaats</div>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
              {shownJamaats.map((j) => (
                <li key={j._id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{j.name}</span>
                  <span className="flex items-center gap-3">
                    <button className="text-xs text-indigo-600 hover:underline" onClick={() => setModal({ type: 'jamaat', item: j })}>Rename</button>
                    <StatusToggle active={j.isActive} onClick={() => toggle('jamaat', j)} />
                  </span>
                </li>
              ))}
              {shownJamaats.length === 0 && <li className="p-6 text-center text-sm text-slate-400">No Jamaats</li>}
            </ul>
          )}
        </div>
      </div>

      {modal && (
        <Modal
          title={`${modal.item ? 'Rename' : 'Add'} ${modal.type === 'jamiat' ? 'Jamiat' : 'Jamaat'}`}
          onClose={() => setModal(null)}
        >
          <NameForm
            label={modal.type === 'jamiat' ? 'Jamiat' : 'Jamaat'}
            initial={modal.item?.name}
            onSubmit={saveName}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
