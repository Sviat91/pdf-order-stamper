import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL ?? '';

export default function UserManager({ token, onClose }) {
  const [users, setUsers]     = useState([]);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  async function fetchUsers() {
    const res = await fetch(`${API}/api/auth/users`, { headers });
    if (res.ok) setUsers(await res.json());
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/users`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Created: ${data.email}`);
      setEmail(''); setPassword('');
      fetchUsers();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id, userEmail) {
    if (!confirm(`Delete user ${userEmail}?`)) return;
    await fetch(`${API}/api/auth/users/${id}`, { method: 'DELETE', headers });
    fetchUsers();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-2xl flex flex-col gap-5"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">User Management</h2>
          <button onClick={onClose}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 transition-colors text-xl leading-none">
            ×
          </button>
        </div>

        {/* User list */}
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {users.length === 0 && <p className="text-gray-500 text-sm">No users yet</p>}
          {users.map(u => (
            <div key={u.id}
              className="flex items-center gap-3 bg-gray-700/60 rounded-lg px-3 py-2.5 border border-gray-600">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{u.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">{u.role}</p>
              </div>
              {u.role !== 'superadmin' && (
                <button onClick={() => handleDelete(u.id, u.email)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors shrink-0">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add user form */}
        <form onSubmit={handleAdd}
          className="border-t border-gray-700 pt-5 flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-200">Add new user</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder="email@example.com"
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required placeholder="Password"
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          {error   && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-emerald-400 text-xs">{success}</p>}
          <button type="submit" disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </div>
    </div>
  );
}
