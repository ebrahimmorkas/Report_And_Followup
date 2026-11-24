import { useState } from 'react';
import { api, download } from '../api';
import Alert from './Alert';

/** Saves a base64 .xlsx returned by the server. */
function saveBase64(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

/**
 * Excel bulk upload: pick a file, upload, then see what was added and which rows failed (with reasons).
 * @param {{ endpoint: string, templateName: string, columnsHint: string, failedColumns: {key:string,label:string}[], onDone: ()=>void }} props
 */
export default function BulkUpload({ endpoint, templateName, columnsHint, notes, failedColumns, onDone }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onUpload = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose an Excel file');
    setError('');
    setBusy(true);
    try {
      const data = await api.upload(`${endpoint}/bulk`, file);
      setResult(data);
      if (data.created.length) onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onTemplate = async () => {
    try {
      await download(`${endpoint}/bulk/template`, templateName);
    } catch (err) {
      setError(err.message);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-2xl font-semibold">{result.total}</div>
            <div className="text-xs text-slate-500">Rows in file</div>
          </div>
          <div className="rounded-md bg-green-50 p-3">
            <div className="text-2xl font-semibold text-green-700">{result.created.length}</div>
            <div className="text-xs text-green-700">Added</div>
          </div>
          <div className={`rounded-md p-3 ${result.failed.length ? 'bg-red-50' : 'bg-slate-50'}`}>
            <div className={`text-2xl font-semibold ${result.failed.length ? 'text-red-700' : ''}`}>{result.failed.length}</div>
            <div className={`text-xs ${result.failed.length ? 'text-red-700' : 'text-slate-500'}`}>Failed</div>
          </div>
        </div>

        {result.failed.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-red-700">Failed rows (not saved)</div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveBase64(result.failedFile, `Failed_rows_${templateName}`)}
              >
                Download failed rows
              </button>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="th">Row</th>
                    {failedColumns.map((c) => (
                      <th key={c.key} className="th">{c.label}</th>
                    ))}
                    <th className="th">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.failed.map((f) => (
                    <tr key={f.row} className="align-top">
                      <td className="td">{f.row}</td>
                      {failedColumns.map((c) => (
                        <td key={c.key} className="td">{f[c.key] || <span className="text-slate-400">—</span>}</td>
                      ))}
                      <td className="td text-red-700">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Fix these rows in the downloaded file (the Error column is ignored) and upload it again.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
          >
            Upload another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onUpload} className="space-y-4">
      <Alert>{error}</Alert>
      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
        <div>
          Columns: <span className="font-medium text-slate-800">{columnsHint}</span>
        </div>
        {notes && <ul className="mt-1 list-disc pl-5 text-xs">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <button type="button" className="mt-2 text-indigo-600 hover:underline" onClick={onTemplate}>
          Download Excel format
        </button>
      </div>
      <div>
        <label className="label">Excel file (.xlsx) *</label>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="input"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button className="btn-primary" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
    </form>
  );
}
