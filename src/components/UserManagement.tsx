import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { UserPlus, Shield, Stethoscope, PhoneCall, Trash2, Key, Edit3, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { getUsersLocal, fetchUsersApi, saveUserApi, deleteUserApi, clearDemoDataApi } from '../utils/storage';

interface UserManagementProps {
  currentUser: User | null;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>(getUsersLocal());
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Doctor');
  const [phone, setPhone] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const u = await fetchUsersApi();
      setUsers(u);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!window.confirm('Are you sure you want to purge all demo patients and demo staff accounts? Only the System Admin account will remain.')) {
      return;
    }
    setLoading(true);
    try {
      const result = await clearDemoDataApi();
      setUsers(result.users);
      setStatusMessage({
        type: 'success',
        text: 'All demo patients and non-admin demo staff accounts purged! Only admin credentials remain active.'
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: 'Failed to purge demo data: ' + (err.message || 'Error occurred')
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !name.trim()) {
      setStatusMessage({ type: 'error', text: 'Please fill in all required fields (Username & Full Name)' });
      return;
    }

    try {
      const updatedList = await saveUserApi({
        id: editingUserId || undefined,
        username: username.trim(),
        password,
        name: name.trim(),
        role,
        phone: phone.trim()
      });

      setUsers(updatedList);
      setStatusMessage({ type: 'success', text: `User account "${username}" saved successfully!` });
      resetForm();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save user account' });
    }
  };

  const handleDeleteUser = async (id: string, uname: string) => {
    if (!confirm(`Are you sure you want to delete user account "${uname}"?`)) return;

    try {
      const updatedList = await deleteUserApi(id);
      setUsers(updatedList);
      setStatusMessage({ type: 'success', text: `User "${uname}" deleted successfully` });
    } catch (err) {
      console.error('Delete user error:', err);
    }
  };

  const handleEditClick = (u: User) => {
    setEditingUserId(u.id);
    setUsername(u.username);
    setName(u.name);
    setRole(u.role);
    setPhone(u.phone || '');
    setPassword(''); // leave blank if password unchanged
  };

  const resetForm = () => {
    setEditingUserId(null);
    setUsername('');
    setPassword('');
    setName('');
    setRole('Doctor');
    setPhone('');
  };

  const getRoleBadge = (uRole: UserRole) => {
    if (uRole === 'Doctor') {
      return (
        <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 w-fit">
          <Stethoscope className="w-3.5 h-3.5 text-blue-600" /> Doctor
        </span>
      );
    }
    if (uRole === 'Call Center') {
      return (
        <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 w-fit">
          <PhoneCall className="w-3.5 h-3.5 text-amber-600" /> Call Center
        </span>
      );
    }
    return (
      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 w-fit">
        <Shield className="w-3.5 h-3.5 text-emerald-600" /> System Admin
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-emerald-800/60 text-emerald-300 text-xs px-3 py-1 rounded-full font-semibold mb-2">
            <Shield className="w-3.5 h-3.5" /> System Administration
          </div>
          <h2 className="text-2xl font-bold">User Account Management</h2>
          <p className="text-emerald-200/90 text-xs mt-1">
            Create and manage login accounts & permissions for Doctors, Call Center, and System Administrators.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearDemoData}
          disabled={loading}
          className="px-4 py-2.5 bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold rounded-xl border border-rose-500 shadow-md transition flex items-center gap-2 cursor-pointer shrink-0"
          title="Purge demo patients and non-admin demo staff accounts for live deployment"
        >
          <Trash2 className="w-4 h-4" />
          Purge Demo Data (Keep Admin Only)
        </button>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Create / Edit Form */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>{editingUserId ? 'Edit User Account' : 'Create New User Account'}</span>
            </h3>
            {editingUserId && (
              <button
                onClick={resetForm}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Role / Access Level:
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none font-semibold text-slate-800"
              >
                <option value="Doctor">Doctor (Quotation & Patient History)</option>
                <option value="Call Center">Call Center (Appointment Import & Intake)</option>
                <option value="System Admin">System Admin (Full System Access)</option>
              </select>
            </div>

            {/* Role Permissions Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                Assigned Module Permissions:
              </span>
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${role === 'System Admin' || role === 'Call Center' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span>Appointments & Excel Import ({role === 'System Admin' || role === 'Call Center' ? 'Granted' : 'Denied'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${role === 'System Admin' || role === 'Doctor' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span>Quotation Builder ({role === 'System Admin' || role === 'Doctor' ? 'Granted' : 'Denied'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${role === 'System Admin' || role === 'Doctor' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span>Quotation History ({role === 'System Admin' || role === 'Doctor' ? 'Granted' : 'Denied'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${role === 'System Admin' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span>Catalog & Rates ({role === 'System Admin' ? 'Granted' : 'Denied'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${role === 'System Admin' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span>User Accounts & Admin ({role === 'System Admin' ? 'Granted' : 'Denied'})</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Full Name / Doctor Name:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Sharmin Akter"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Username / User ID:
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. dr_sharmin or callcenter_desk"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Password {editingUserId ? '(Leave blank to keep unchanged)' : ''}:
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required={!editingUserId}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Phone Number (Optional):
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="017xxxxxxxx"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition duration-150 shadow cursor-pointer flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>{editingUserId ? 'Update User Account' : 'Create User Account'}</span>
            </button>
          </form>
        </div>

        {/* Existing Users Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center justify-between">
            <span>System User Accounts ({users.length})</span>
            <button onClick={loadUsers} className="text-xs text-emerald-600 hover:underline">Refresh List</button>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-bold">User</th>
                  <th className="px-3 py-2.5 font-bold">Username</th>
                  <th className="px-3 py-2.5 font-bold">Role</th>
                  <th className="px-3 py-2.5 font-bold">Phone</th>
                  <th className="px-3 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {u.name}
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600">
                      {u.username}
                    </td>
                    <td className="px-3 py-3">
                      {getRoleBadge(u.role)}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {u.phone || '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEditClick(u)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit User"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {u.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};
