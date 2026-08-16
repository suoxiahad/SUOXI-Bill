import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  UserPlus, 
  Search, 
  FileText, 
  History, 
  Settings, 
  Server, 
  Stethoscope,
  Activity,
  Shield,
  PhoneCall,
  LogOut,
  LogIn,
  Users,
  Receipt,
  Eye,
  EyeOff
} from 'lucide-react';
import { User } from '../types';
import { SuoxiLogo } from './SuoxiLogo';

interface NavbarProps {
  activeTab: 'appointments' | 'quotation' | 'history' | 'catalog' | 'users';
  setActiveTab: (tab: 'appointments' | 'quotation' | 'history' | 'catalog' | 'users') => void;
  onOpenAddPatient: () => void;
  onSearchPhone: (phone: string) => void;
  patientCount: number;
  quotationCount: number;
  currentUser: User | null;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  isAllCalculationsFull?: boolean;
  onToggleAllCalculations?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenAddPatient,
  onSearchPhone,
  patientCount,
  quotationCount,
  currentUser,
  onOpenLoginModal,
  onLogout,
  isAllCalculationsFull,
  onToggleAllCalculations
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearchPhone(searchQuery.trim());
    }
  };

  const userRole = currentUser?.role;

  const canAccessAppointments = userRole === 'System Admin' || userRole === 'Call Center';
  const canAccessQuotation = userRole === 'System Admin' || userRole === 'Doctor';
  const canAccessHistory = userRole === 'System Admin' || userRole === 'Doctor' || userRole === 'Billing Counter';
  const canAccessCatalog = userRole === 'System Admin';
  const canAccessUsers = !!currentUser;
  const canAccessCalculationToggle = userRole === 'System Admin' || userRole === 'Doctor';

  const getRoleBadge = () => {
    if (!currentUser) {
      return (
        <span className="bg-slate-700/60 text-slate-300 border border-slate-600 px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
          Logged Out
        </span>
      );
    }
    if (userRole === 'Doctor') {
      return (
        <span className="bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
          <Stethoscope className="w-3 h-3 text-blue-300" /> Doctor
        </span>
      );
    }
    if (userRole === 'Call Center') {
      return (
        <span className="bg-amber-500/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
          <PhoneCall className="w-3 h-3 text-amber-300" /> Call Center
        </span>
      );
    }
    if (userRole === 'Billing Counter') {
      return (
        <span className="bg-purple-500/20 text-purple-200 border border-purple-400/30 px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
          <Receipt className="w-3 h-3 text-purple-300" /> Billing Counter
        </span>
      );
    }
    return (
      <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
        <Shield className="w-3 h-3 text-emerald-300" /> System Admin
      </span>
    );
  };

  return (
    <header className="bg-slate-900 text-white shadow-xl sticky top-0 z-40 print:hidden">
      {/* Top Banner / Hospital Branding */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab(canAccessAppointments ? 'appointments' : (canAccessQuotation ? 'quotation' : 'history'))}>
            <div className="bg-white/95 p-1.5 rounded-xl shadow border border-slate-700/50 flex items-center justify-center">
              <SuoxiLogo size="sm" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                  SUO XI Hospital <span className="text-emerald-400 font-normal text-base sm:text-lg">(Acupuncture)</span>
                </h1>
                <span className="hidden sm:inline-block bg-slate-800 text-emerald-300 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border border-slate-700">
                  Billing Counter
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
                Hospital Billing & Patient Intake Management System
              </p>
            </div>
          </div>

          {/* Quick Search Patient by Phone */}
          <form onSubmit={handleSearchSubmit} className="w-full md:w-72 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 text-emerald-100 placeholder-slate-400 text-xs sm:text-sm rounded-xl pl-9 pr-16 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-slate-950 transition-all"
              />
              <Search className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
              <button
                type="submit"
                className="absolute right-1 top-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-2.5 py-1 rounded-lg transition-colors shadow cursor-pointer"
              >
                Search
              </button>
            </div>
          </form>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-2">
            
            {/* User Profile Card */}
            <div className="bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-1.5 flex items-center gap-2.5 text-xs">
              <div className="text-right hidden sm:block">
                <p className="font-semibold text-white leading-tight">{currentUser?.name || 'Guest User'}</p>
                <div className="mt-0.5">{getRoleBadge()}</div>
              </div>

              {currentUser ? (
                <button
                  onClick={onLogout}
                  title="Logout Account"
                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg transition border border-rose-500/30 flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span className="text-[11px] font-semibold hidden md:inline">Logout</span>
                </button>
              ) : (
                <button
                  onClick={onOpenLoginModal}
                  title="Login to Account"
                  className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg transition border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <LogIn className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-semibold hidden md:inline">Login</span>
                </button>
              )}
            </div>

            {/* Patient Entry Button */}
            <button
              onClick={onOpenAddPatient}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Patient</span>
            </button>
          </div>

        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-950 border-t border-slate-800 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm">
          
          {canAccessAppointments && (
            <button
              onClick={() => setActiveTab('appointments')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'appointments'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Appointments & Excel Import</span>
              {patientCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'appointments' ? 'bg-slate-900 text-emerald-300' : 'bg-slate-800 text-emerald-400'}`}>
                  {patientCount}
                </span>
              )}
            </button>
          )}

          {canAccessQuotation && (
            <button
              onClick={() => setActiveTab('quotation')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'quotation'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Quotation Builder</span>
            </button>
          )}

          {canAccessHistory && (
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Quotation History</span>
              {quotationCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'history' ? 'bg-slate-900 text-emerald-300' : 'bg-slate-800 text-emerald-400'}`}>
                  {quotationCount}
                </span>
              )}
            </button>
          )}

          {canAccessCatalog && (
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Catalog & Rates</span>
            </button>
          )}

          {canAccessUsers && (
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{userRole === 'System Admin' ? 'User Accounts' : 'My Account'}</span>
            </button>
          )}

          {/* Eye Icon Global Toggle Button beside User Account Tab for Sections 1 & 4 Calculation View (Only for Doctor & System Admin) */}
          {canAccessCalculationToggle && onToggleAllCalculations && (
            <button
              type="button"
              onClick={onToggleAllCalculations}
              title={
                isAllCalculationsFull
                  ? 'Toggle All Calculations (1. Treatments & 4. Indoor Rooms): Click to Switch to Per Day View (1-Day Cost Focus)'
                  : 'Toggle All Calculations (1. Treatments & 4. Indoor Rooms): Click to Switch to Full Course Calculation View'
              }
              aria-label={isAllCalculationsFull ? "Switch to Per Day Calculation View" : "Switch to Full Course Calculation View"}
              className={`p-2 rounded-lg transition-all cursor-pointer border ml-auto sm:ml-2 shrink-0 flex items-center justify-center ${
                isAllCalculationsFull
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              }`}
            >
              {isAllCalculationsFull ? (
                <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
              )}
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
