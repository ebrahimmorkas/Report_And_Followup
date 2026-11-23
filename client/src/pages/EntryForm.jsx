import { useEffect, useState } from 'react';
import { api, toInputDate, todayInput } from '../api';
import { useActivities, useJamaats, useJamiats } from '../hooks';
import Alert from '../components/Alert';
import { KINDS } from './entryKinds';

const emptyExtra = (withDate) => (withDate ? { name: '', date: '' } : { name: '' });

export default function EntryForm({ kind, initial, onSaved, onCancel }) {
  const cfg = KINDS[kind];
  const jamiats = useJamiats({ activeOnly: true });
  const activities = useActivities(cfg.activityType, { activeOnly: true });

  const [jamiat, setJamiat] = useState(initial?.jamiat?._id || '');
  const [jamaat, setJamaat] = useState(initial?.jamaat?._id || '');
  const [activity, setActivity] = useState(initial?.activity?._id || '');
  const [date, setDate] = useState(toInputDate(initial?.[cfg.dateField]));
  const [text, setText] = useState(initial?.[cfg.textField] || '');
  const [extras, setExtras] = useState(
    (initial?.extraActivities || []).map((e) => (cfg.extrasHaveDate ? { name: e.name, date: toInputDate(e.date) } : { name: e.name }))
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const jamaats = useJamaats(jamiat, { activeOnly: true });
  const maxDate = cfg.noFutureDate ? todayInput() : undefined;

  // Auto-select when the JC has only one Jamiat.
  useEffect(() => {
    if (!jamiat && jamiats.length === 1) setJamiat(jamiats[0]._id);
  }, [jamiats, jamiat]);

  const updateExtra = (i, key, value) => setExtras((list) => list.map((e, idx) => (idx === i ? { ...e, [key]: value } : e)));
  const removeExtra = (i) => setExtras((list) => list.filter((_, idx) => idx !== i));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const body = {
      jamaat,
      activity,
      [cfg.dateField]: date,
      [cfg.textField]: text,
      extraActivities: extras,
    };
    try {
      const d = initial ? await api.put(`${cfg.endpoint}/${initial._id}`, body) : await api.post(cfg.endpoint, body);
      onSaved(d.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Alert>{error}</Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Jamiat *</label>
          <select
            className="input"
            value={jamiat}
            onChange={(e) => {
              setJamiat(e.target.value);
              setJamaat('');
            }}
            required
          >
            <option value="">Select Jamiat</option>
            {jamiats.map((j) => (
              <option key={j._id} value={j._id}>{j.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Jamaat *</label>
          <select className="input" value={jamaat} onChange={(e) => setJamaat(e.target.value)} disabled={!jamiat} required>
            <option value="">Select Jamaat</option>
            {jamaats.map((j) => (
              <option key={j._id} value={j._id}>{j.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Activity *</label>
          <select className="input" value={activity} onChange={(e) => setActivity(e.target.value)} required>
            <option value="">Select Activity</option>
            {activities.map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{cfg.dateLabel} *</label>
          <input type="date" className="input" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <div>
        <label className="label">{cfg.textLabel}</label>
        <textarea className="input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">Extra activities</div>
            <div className="text-xs text-slate-500">{cfg.extrasHint}</div>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setExtras((l) => [...l, emptyExtra(cfg.extrasHaveDate)])}>
            + Add
          </button>
        </div>
        {extras.length === 0 && <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">None added</div>}
        <div className="space-y-2">
          {extras.map((ex, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input"
                placeholder="Activity name"
                value={ex.name}
                onChange={(e) => updateExtra(i, 'name', e.target.value)}
                required
              />
              {cfg.extrasHaveDate && (
                <input
                  type="date"
                  className="input max-w-44"
                  value={ex.date}
                  max={maxDate}
                  onChange={(e) => updateExtra(i, 'date', e.target.value)}
                  required
                />
              )}
              <button type="button" className="btn-secondary text-red-600" onClick={() => removeExtra(i)} aria-label="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Update' : 'Save'}</button>
      </div>
    </form>
  );
}
