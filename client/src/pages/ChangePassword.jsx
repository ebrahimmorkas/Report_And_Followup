import { useState } from 'react';
import { api } from '../api';
import Alert from '../components/Alert';

const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePassword() {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (form.newPassword.length < 6) return setError('New password must be at least 6 characters');
    if (form.newPassword !== form.confirmPassword) return setError('New passwords do not match');
    setBusy(true);
    try {
      const d = await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(d.message);
      setForm(empty);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Change Password</h1>
      <form onSubmit={onSubmit} className="card space-y-4 p-5">
        <Alert>{error}</Alert>
        <Alert type="success">{success}</Alert>
        {[
          ['currentPassword', 'Current password', 'current-password'],
          ['newPassword', 'New password', 'new-password'],
          ['confirmPassword', 'Confirm new password', 'new-password'],
        ].map(([key, label, ac]) => (
          <div key={key}>
            <label className="label" htmlFor={key}>{label}</label>
            <input id={key} type="password" className="input" autoComplete={ac} value={form[key]} onChange={set(key)} required />
          </div>
        ))}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
