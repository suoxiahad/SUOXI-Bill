import React, { useState } from 'react';
import { User } from '../types';
import { setActiveUser } from '../utils/storage';
import { Lock, UserCheck, AlertCircle, X, Shield, Stethoscope, PhoneCall } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  canClose?: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, canClose = true, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const performLogin = async (u: string, p: string) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials or login failed');
      }

      const loggedInUser: User = {
        id: data.user.id,
        username: data.user.username,
        name: data.user.name,
        role: data.user.role,
        token: data.token
      };

      setActiveUser(loggedInUser);
      onLoginSuccess(loggedInUser);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid username or password!');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(username, password);
  };

  const handleDemoLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    performLogin(u, p);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden transition-all duration-200 ease-out">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 text-center relative">
          {canClose && (
            <button 
              onClick={onClose}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-emerald-500/20">
            <Lock className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold">SUO XI Hospital System</h2>
          <p className="text-slate-300 text-xs mt-1">
            Please sign in to access Billing, Quotations & Intake System
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                User ID / Username:
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin, doctor, or callcenter"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password:
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-md transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Developer / Demo Quick Login Presets */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                {import.meta.env.PROD ? 'Default Admin Credential:' : 'Developer / Demo Accounts:'}
              </span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                1-Click Auto Login
              </span>
            </div>

            <div className={`grid ${import.meta.env.PROD ? 'grid-cols-1' : 'grid-cols-3'} gap-2`}>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin', 'admin123')}
                disabled={loading}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/80 text-slate-700 flex flex-col items-center gap-1 text-center transition cursor-pointer group"
              >
                <Shield className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-[11px] text-slate-800">System Admin</span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">admin</span>
              </button>

              {!import.meta.env.PROD && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('doctor', 'doctor123')}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/80 text-slate-700 flex flex-col items-center gap-1 text-center transition cursor-pointer group"
                  >
                    <Stethoscope className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold text-[11px] text-slate-800">Doctor</span>
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">doctor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDemoLogin('callcenter', 'cc123')}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/80 text-slate-700 flex flex-col items-center gap-1 text-center transition cursor-pointer group"
                  >
                    <PhoneCall className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold text-[11px] text-slate-800">Call Center</span>
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">callcenter</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
          SUO XI Hospital Billing & Patient Management System
        </div>
      </div>
    </div>
  );
};

