import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const linkClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`;

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: '/report', label: 'Report' },
    { to: '/follow-up', label: 'Follow-up' },
    ...(isAdmin
      ? [
          { to: '/admin/users', label: 'Users' },
          { to: '/admin/activities', label: 'Activities' },
          { to: '/admin/masters', label: 'Jamiat / Jamaat' },
        ]
      : []),
    { to: '/change-password', label: 'Change Password' },
  ];

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="rounded p-1 text-slate-600 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              ☰
            </button>
            <span className="text-lg font-semibold text-indigo-700">Report & Follow-up</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{isAdmin ? 'Super Admin' : 'JC'} · {user.mobile}</div>
            </div>
            <button className="btn-secondary" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-14 z-10 border-b bg-white p-4 md:static md:block md:w-52 md:shrink-0 md:border-0 md:bg-transparent md:p-0`}>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className={linkClass} onClick={() => setOpen(false)}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {!isAdmin && user.jamiats?.length > 0 && (
            <div className="mt-6 hidden md:block">
              <div className="mb-1 px-3 text-xs font-semibold uppercase text-slate-400">My Jamiats</div>
              <ul className="px-3 text-sm text-slate-600">
                {user.jamiats.map((j) => (
                  <li key={j._id}>{j.name}</li>
                ))}
              </ul>
            </div>
          )}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
