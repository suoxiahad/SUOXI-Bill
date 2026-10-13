import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw, 
  Save, 
  LogOut, 
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Patient } from '../types';
import { 
  getSheetsConfig, 
  saveSheetsConfig, 
  GoogleSheetsConfig,
  googleSignIn, 
  logoutGoogle, 
  initAuth, 
  getAccessToken,
  syncPatientsToDailySheet,
  getMonthKeyAndTitle,
  formatDateTabName,
  PRE_CONSULTATION_HEADERS,
  POST_CONSULTATION_HEADERS
} from '../services/googleSheetsService';

interface GoogleSheetsSettingsProps {
  patients: Patient[];
}

export const GoogleSheetsSettings: React.FC<GoogleSheetsSettingsProps> = ({ patients }) => {
  const [config, setConfig] = useState<GoogleSheetsConfig>(getSheetsConfig);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isConfigSaved, setIsConfigSaved] = useState<boolean>(false);

  // Form states
  const [prefixInput, setPrefixInput] = useState<string>(config.spreadsheetTitlePrefix);
  const [dateFormatInput, setDateFormatInput] = useState<'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD MMM YYYY'>(config.dateFormat);
  const [autoSyncInput, setAutoSyncInput] = useState<boolean>(config.autoSyncEnabled);

  useEffect(() => {
    // Listen to Firebase Google Auth state
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setHasToken(Boolean(token));
      },
      () => {
        setGoogleUser(null);
        setHasToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const { monthKey, monthTitle } = getMonthKeyAndTitle();
  const currentMonthSheet = config.monthSpreadsheets[monthKey];
  const sampleTabName = formatDateTabName(new Date(), dateFormatInput);

  // Google Sign In handler
  const handleSignIn = async () => {
    setIsSigningIn(true);
    setSyncFeedback(null);
    try {
      const res = await googleSignIn();
      setGoogleUser(res.user);
      setHasToken(true);
      setSyncFeedback({
        type: 'success',
        message: `Successfully connected Google account: ${res.user.email}`
      });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setSyncFeedback({
        type: 'error',
        message: err?.message || 'Failed to connect Google account. Please try again.'
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  // Google Sign Out handler
  const handleSignOut = async () => {
    try {
      await logoutGoogle();
      setGoogleUser(null);
      setHasToken(false);
      setSyncFeedback({
        type: 'success',
        message: 'Google account disconnected.'
      });
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  // Save Settings handler
  const handleSaveConfig = () => {
    const updated = saveSheetsConfig({
      spreadsheetTitlePrefix: prefixInput.trim() || 'Suoxi Hospital',
      dateFormat: dateFormatInput,
      autoSyncEnabled: autoSyncInput
    });
    setConfig(updated);
    setIsConfigSaved(true);
    setTimeout(() => setIsConfigSaved(false), 3000);
  };

  // Manual Sync handler
  const handleManualSync = async () => {
    if (!hasToken) {
      setSyncFeedback({
        type: 'error',
        message: 'Please sign in with Google first before syncing.'
      });
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setSyncFeedback({
        type: 'error',
        message: 'Google session expired. Please sign in again.'
      });
      return;
    }

    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const result = await syncPatientsToDailySheet(token, patients, new Date());
      setConfig(getSheetsConfig());
      setSyncFeedback({
        type: 'success',
        message: `Successfully synced ${result.countPre} Pre-consultation and ${result.countPost} Post-consultation records to tab "${result.tabName}"!`
      });
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncFeedback({
        type: 'error',
        message: err?.message || 'Failed to sync data to Google Sheets.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Alert */}
      {syncFeedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${
          syncFeedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
            : 'bg-rose-50 text-rose-900 border-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{syncFeedback.message}</span>
          </div>
          <button 
            onClick={() => setSyncFeedback(null)} 
            className="text-slate-400 hover:text-slate-600 cursor-pointer font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {isConfigSaved && (
        <div className="p-4 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-300 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Google Sheets sync settings saved successfully!</span>
        </div>
      )}

      {/* 1. Google Account Connection Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Google Sheets API Authorization</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your Google account to enable live real-time saving to Google Sheets.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasToken && googleUser ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Connected
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Not Connected
              </span>
            )}
          </div>
        </div>

        {hasToken && googleUser ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {googleUser.photoURL ? (
                <img 
                  src={googleUser.photoURL} 
                  alt={googleUser.displayName || 'Google User'} 
                  className="w-10 h-10 rounded-full border border-slate-300"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center text-sm">
                  {googleUser.email ? googleUser.email.charAt(0).toUpperCase() : 'G'}
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-slate-900">{googleUser.displayName || 'Google User'}</p>
                <p className="text-xs text-slate-500">{googleUser.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Full read/write permissions active for Spreadsheets</span>
            </div>
          </div>
        ) : (
          <div className="p-5 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 rounded-xl border border-emerald-200/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Sign in with Google to grant Google Sheets API access
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Your monthly spreadsheets and daily tabs will be saved directly in your Google Drive.
              </p>
            </div>
            {/* Standard Styled Google Sign-In Button */}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSigningIn ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>{isSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Spreadsheet Filing & Daily Tab Configuration */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <span>Monthly Spreadsheets & Daily Date Tabs</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Each month gets 1 dedicated Google Spreadsheet file. Daily patient entries are grouped inside date tabs within that spreadsheet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Prefix Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Spreadsheet Title Prefix
            </label>
            <input
              type="text"
              value={prefixInput}
              onChange={(e) => setPrefixInput(e.target.value)}
              placeholder="e.g. Suoxi Hospital"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 focus:bg-white"
            />
            <p className="text-[11px] text-slate-500">
              Current Month File Title: <strong className="text-slate-800">{prefixInput.trim() || 'Suoxi Hospital'} - {monthTitle}</strong>
            </p>
          </div>

          {/* Date Format Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Daily Tab Name Format
            </label>
            <select
              value={dateFormatInput}
              onChange={(e) => setDateFormatInput(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 focus:bg-white cursor-pointer"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-13) - Recommended</option>
              <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 13-10-2026)</option>
              <option value="DD MMM YYYY">DD MMM YYYY (e.g. 13 Oct 2026)</option>
            </select>
            <p className="text-[11px] text-slate-500">
              Today's Tab Name Preview: <strong className="text-emerald-700 font-mono">{sampleTabName}</strong>
            </p>
          </div>
        </div>

        {/* Live Auto-Sync Switch */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              <label htmlFor="autoSyncSwitch" className="text-xs font-bold text-slate-800 cursor-pointer">
                Automatic Real-Time Sync (Live Updates)
              </label>
            </div>
            <p className="text-[11px] text-slate-500 pl-6">
              Silently synchronizes patient changes (Pre-Consultation Done, Post-Consultation comments, disease, profession) to Google Sheets in background.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="autoSyncSwitch"
              type="checkbox"
              checked={autoSyncInput}
              onChange={(e) => setAutoSyncInput(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Save Settings Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveConfig}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Sync Settings</span>
          </button>
        </div>
      </div>

      {/* 3. Current Month Spreadsheet Link & Manual Trigger */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              <span>Current Month Spreadsheet & Live Sync</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Active spreadsheet for <strong className="text-slate-800">{monthTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing || !hasToken}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={!hasToken ? 'Sign in with Google first' : "Sync today's records now"}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : "Sync Today's Data Now"}</span>
            </button>
          </div>
        </div>

        {/* Spreadsheet Status & Direct Link */}
        {currentMonthSheet?.url ? (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Active Monthly Spreadsheet
              </span>
              <p className="text-sm font-bold text-slate-900">{currentMonthSheet.title}</p>
              <p className="text-xs text-slate-500 font-mono">ID: {currentMonthSheet.id}</p>
            </div>
            <a
              href={currentMonthSheet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
            >
              <span>Open in Google Sheets</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700">No spreadsheet created yet for {monthTitle}</p>
              <p className="text-xs text-slate-500">
                Clicking "Sync Today's Data Now" or adding/updating a patient will automatically create <strong>{prefixInput} - {monthTitle}</strong> in your Google Drive.
              </p>
            </div>
            {hasToken && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Create & Sync
              </button>
            )}
          </div>
        )}

        {/* Sync Status Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Last Sync Status</span>
            <p className="text-xs font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
              {config.lastSyncStatus === 'success' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
              {config.lastSyncStatus === 'error' && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
              {config.lastSyncStatus === 'syncing' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
              {config.lastSyncStatus === 'idle' && <span className="w-2 h-2 rounded-full bg-slate-400"></span>}
              <span className="capitalize">{config.lastSyncStatus || 'Idle'}</span>
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Last Sync Time</span>
            <p className="text-xs font-semibold text-slate-800 mt-1 font-mono">
              {config.lastSyncTime || '—'}
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Current Patient Count</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">
              {patients.length} Registered Patients
            </p>
          </div>
        </div>

        {config.lastSyncMessage && (
          <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            Sync details: {config.lastSyncMessage}
          </p>
        )}
      </div>

      {/* 4. Column Mapping Specifications Preview */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-slate-900 text-base">Google Sheet Exact Column Structure</h3>
        </div>
        <p className="text-xs text-slate-500">
          The columns in your daily date tab are generated with the exact fields you specified (Pre-Consultation: 10 columns; Post-Consultation: 11 columns with comment and doctor in separate columns):
        </p>

        {/* Pre-consultation columns table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
              1. Pre-Consultation Table ({PRE_CONSULTATION_HEADERS.length} Columns)
            </span>
            <span className="text-[11px] text-slate-400">Recorded upon patient registration & arrival</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-emerald-50 text-emerald-900 font-bold border-b border-emerald-200">
                <tr>
                  {PRE_CONSULTATION_HEADERS.map((h, i) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] text-emerald-700 block font-mono">Col {String.fromCharCode(65 + i)}</span>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 font-normal text-slate-600">
                <tr>
                  <td className="px-3 py-2 font-mono">1</td>
                  <td className="px-3 py-2 font-medium text-slate-800">Rahim Ahmed</td>
                  <td className="px-3 py-2 font-mono">01711223344</td>
                  <td className="px-3 py-2">Male</td>
                  <td className="px-3 py-2 font-mono">45</td>
                  <td className="px-3 py-2">Dhaka</td>
                  <td className="px-3 py-2">Knee Osteoarthritis</td>
                  <td className="px-3 py-2">Business</td>
                  <td className="px-3 py-2">Dr. Shahnaz</td>
                  <td className="px-3 py-2 font-semibold text-emerald-700">Done</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Post-consultation columns table */}
        <div className="space-y-2 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-md">
              2. Post-Consultation Table ({POST_CONSULTATION_HEADERS.length} Columns)
            </span>
            <span className="text-[11px] text-slate-400">Recorded with doctor decision & counseling comment</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-blue-50 text-blue-900 font-bold border-b border-blue-200">
                <tr>
                  {POST_CONSULTATION_HEADERS.map((h, i) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] text-blue-700 block font-mono">Col {String.fromCharCode(65 + i)}</span>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 font-normal text-slate-600">
                <tr>
                  <td className="px-3 py-2 font-mono">1</td>
                  <td className="px-3 py-2 font-medium text-slate-800">Rahim Ahmed</td>
                  <td className="px-3 py-2 font-mono">01711223344</td>
                  <td className="px-3 py-2">Male</td>
                  <td className="px-3 py-2 font-mono">45</td>
                  <td className="px-3 py-2">Dhaka</td>
                  <td className="px-3 py-2">Knee Osteoarthritis</td>
                  <td className="px-3 py-2">Business</td>
                  <td className="px-3 py-2 text-slate-700">Will admit in IPD</td>
                  <td className="px-3 py-2 font-medium text-slate-800">Dr. Shahnaz</td>
                  <td className="px-3 py-2 font-semibold text-blue-700">Confirmed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
