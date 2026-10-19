import React, { useState, useMemo, useDeferredValue } from 'react';
import { 
  Patient, 
  InvoiceQuotation, 
  User as UserModel 
} from '../types';
import { 
  FlaskConical, 
  Leaf, 
  Apple, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Calendar, 
  RefreshCw, 
  Filter, 
  Shield, 
  Download, 
  Check, 
  X, 
  User, 
  Phone, 
  Stethoscope, 
  AlertCircle,
  HelpCircle,
  Lock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { updateDepartmentStatusApi } from '../utils/storage';

interface DepartmentClearanceProps {
  patients: Patient[];
  quotations: InvoiceQuotation[];
  currentUser: UserModel | null;
  onRefreshPatients?: () => void;
  onUpdatePatient: (patient: Patient) => void;
}

export const DepartmentClearance: React.FC<DepartmentClearanceProps> = ({
  patients,
  quotations,
  currentUser,
  onRefreshPatients,
  onUpdatePatient
}) => {
  const userRole = currentUser?.role;
  const isAdmin = userRole === 'System Admin';
  const isPathologyUser = userRole === 'Pathology' || isAdmin;
  const isOrganicUser = userRole === 'Organic' || isAdmin;
  const isNutritionUser = userRole === 'Nutrition' || isAdmin;

  // Date filter state
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayStr);

  // Search filter state
  const [filterText, setFilterText] = useState('');
  const deferredFilterText = useDeferredValue(filterText);

  // Status sub-tab filter
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'pending' | 'cleared' | 'pathology_pending' | 'organic_pending' | 'nutrition_pending'>('all');

  // Updating feedback state
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(prev => (prev?.text === text ? null : prev));
    }, 2800);
  };

  // Filter ONLY Post Consultation patients
  const isPostConsultation = (p: Patient): boolean => {
    return p.status === 'Post Consultation' || p.consultationStatus === 'Post Consultation' || Boolean(p.postConsultationConfirmed);
  };

  // Base list of Post Consultation patients
  const postPatients = useMemo(() => {
    return patients.filter(isPostConsultation);
  }, [patients]);

  // Unique list of dates present in post-consultation patients
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    dates.add(todayStr);
    postPatients.forEach(p => {
      if (p.appointmentDate) dates.add(p.appointmentDate);
    });
    return Array.from(dates).sort().reverse();
  }, [postPatients, todayStr]);

  // Filtered post-consultation patients
  const filteredPatients = useMemo(() => {
    let result = [...postPatients];

    // 1. Date Filter
    if (selectedDateFilter && selectedDateFilter !== 'all') {
      result = result.filter(p => p.appointmentDate === selectedDateFilter);
    }

    // 2. Sub-tab status filter
    if (activeFilterTab === 'pending') {
      result = result.filter(p => p.pathologyStatus !== 'Yes' || p.organicStatus !== 'Yes' || p.nutritionStatus !== 'Yes');
    } else if (activeFilterTab === 'cleared') {
      result = result.filter(p => p.pathologyStatus === 'Yes' && p.organicStatus === 'Yes' && p.nutritionStatus === 'Yes');
    } else if (activeFilterTab === 'pathology_pending') {
      result = result.filter(p => p.pathologyStatus !== 'Yes');
    } else if (activeFilterTab === 'organic_pending') {
      result = result.filter(p => p.organicStatus !== 'Yes');
    } else if (activeFilterTab === 'nutrition_pending') {
      result = result.filter(p => p.nutritionStatus !== 'Yes');
    }

    // 3. Search query
    if (deferredFilterText.trim()) {
      const q = deferredFilterText.trim().toLowerCase();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        String(p.consultationSerial || '').includes(q) ||
        p.serialNo?.toLowerCase().includes(q) ||
        p.doctorName?.toLowerCase().includes(q) ||
        p.postDoctorName?.toLowerCase().includes(q) ||
        p.consultationComment?.toLowerCase().includes(q) ||
        p.remark?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.profession?.toLowerCase().includes(q)
      );
    }

    // Sort by consultationSerial ascending (1, 2, 3...)
    result.sort((a, b) => {
      const sA = typeof a.consultationSerial === 'number' ? a.consultationSerial : 999999;
      const sB = typeof b.consultationSerial === 'number' ? b.consultationSerial : 999999;
      return sA - sB;
    });

    return result;
  }, [postPatients, selectedDateFilter, activeFilterTab, deferredFilterText]);

  // Pagination calculations
  const totalPatients = filteredPatients.length;
  const totalPages = Math.max(1, Math.ceil(totalPatients / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, startIndex, pageSize]);

  // Handle department status toggle
  const handleToggleStatus = async (
    patient: Patient,
    department: 'pathology' | 'organic' | 'nutrition',
    newStatus: 'Yes' | 'No' | ''
  ) => {
    const actionKey = `${patient.id}-${department}-${newStatus}`;
    setUpdatingKey(actionKey);

    const deptLabel = department === 'pathology' ? 'Pathology Test' : (department === 'organic' ? 'Organic Product' : 'Nutrition Consult');
    const updaterName = currentUser?.name || currentUser?.username || 'Staff';
    const now = new Date().toISOString();

    // Optimistic UI update in 1ms
    const optimisticPatient: Patient = {
      ...patient
    };
    if (department === 'pathology') {
      optimisticPatient.pathologyStatus = newStatus;
      optimisticPatient.pathologyUpdatedAt = newStatus ? now : undefined;
      optimisticPatient.pathologyUpdatedBy = newStatus ? updaterName : undefined;
    } else if (department === 'organic') {
      optimisticPatient.organicStatus = newStatus;
      optimisticPatient.organicUpdatedAt = newStatus ? now : undefined;
      optimisticPatient.organicUpdatedBy = newStatus ? updaterName : undefined;
    } else if (department === 'nutrition') {
      optimisticPatient.nutritionStatus = newStatus;
      optimisticPatient.nutritionUpdatedAt = newStatus ? now : undefined;
      optimisticPatient.nutritionUpdatedBy = newStatus ? updaterName : undefined;
    }

    onUpdatePatient(optimisticPatient);

    try {
      const result = await updateDepartmentStatusApi(patient.id, department, newStatus);
      if (result.patient) {
        onUpdatePatient(result.patient);
      }
      showToast(`${deptLabel} status updated to "${newStatus || 'Pending'}" for ${patient.name}`);
    } catch (err: any) {
      console.error('Failed to update department status:', err);
      // rollback
      onUpdatePatient(patient);
      showToast(`Failed to update ${deptLabel}: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setUpdatingKey(null);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredPatients.length === 0) {
      alert('No patient records to export in the current selection.');
      return;
    }

    const headers = [
      'Serial / Sl',
      'Patient ID',
      'Name',
      'Phone',
      'Age',
      'Gender',
      'Address',
      'Doctor Name',
      'Appointment Date',
      'Consultation Decision / Comment',
      'Pathology Status (Test Done?)',
      'Pathology Updated By',
      'Organic Status (Product Bought?)',
      'Organic Updated By',
      'Nutrition Status (Consulted?)',
      'Nutrition Updated By',
      'Overall Department Clearance'
    ];

    const rows = filteredPatients.map(p => {
      const overall = (p.pathologyStatus === 'Yes' && p.organicStatus === 'Yes' && p.nutritionStatus === 'Yes')
        ? 'Fully Cleared (3/3)'
        : `${[p.pathologyStatus === 'Yes' ? 'Pathology' : '', p.organicStatus === 'Yes' ? 'Organic' : '', p.nutritionStatus === 'Yes' ? 'Nutrition' : ''].filter(Boolean).length}/3 Cleared`;

      return [
        `"${p.consultationSerial || p.serialNo || ''}"`,
        `"${p.id || ''}"`,
        `"${p.name || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.age || ''}"`,
        `"${p.gender || ''}"`,
        `"${(p.address || '').replace(/"/g, '""')}"`,
        `"${p.postDoctorName || p.doctorName || ''}"`,
        `"${p.appointmentDate || ''}"`,
        `"${(p.consultationComment || p.remark || '').replace(/"/g, '""')}"`,
        `"${p.pathologyStatus || 'Pending'}"`,
        `"${p.pathologyUpdatedBy || ''}"`,
        `"${p.organicStatus || 'Pending'}"`,
        `"${p.organicUpdatedBy || ''}"`,
        `"${p.nutritionStatus || 'Pending'}"`,
        `"${p.nutritionUpdatedBy || ''}"`,
        `"${overall}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SUOXI_Department_Clearance_${selectedDateFilter || 'All'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 animate-in slide-in-from-top-3 duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-900 text-emerald-100 border-emerald-700' 
            : 'bg-rose-900 text-rose-100 border-rose-700'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Clean Header Bar */}
      <div className="bg-white rounded-xl px-5 py-3.5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Department Updates
              </h2>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md border border-indigo-100">
                Post Consultation ({postPatients.length})
              </span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md">
                Role: <strong className="text-slate-900">{userRole}</strong>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pathology Test, Organic Products & Nutrition Advice Status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-300 transition cursor-pointer"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>
          {onRefreshPatients && (
            <button
              onClick={onRefreshPatients}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              title="Refresh Patients"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Control Bar: Filters, Date Picker, and Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3.5">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Sub-tab Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            <button
              onClick={() => { setActiveFilterTab('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                activeFilterTab === 'all'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Post Patients ({postPatients.length})
            </button>

            <button
              onClick={() => { setActiveFilterTab('pending'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                activeFilterTab === 'pending'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Action</span>
            </button>

            <button
              onClick={() => { setActiveFilterTab('cleared'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                activeFilterTab === 'cleared'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Fully Cleared (3/3)</span>
            </button>

            <button
              onClick={() => { setActiveFilterTab('pathology_pending'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer ${
                activeFilterTab === 'pathology_pending'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              Pathology Needs Test
            </button>

            <button
              onClick={() => { setActiveFilterTab('organic_pending'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer ${
                activeFilterTab === 'organic_pending'
                  ? 'bg-emerald-700 text-white shadow'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Organic Needs Product
            </button>

            <button
              onClick={() => { setActiveFilterTab('nutrition_pending'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer ${
                activeFilterTab === 'nutrition_pending'
                  ? 'bg-amber-700 text-white shadow'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Nutrition Needs Advice
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date:</span>
            </span>
            <select
              value={selectedDateFilter}
              onChange={(e) => {
                setSelectedDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-50 border border-slate-300 text-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Dates ({postPatients.length})</option>
              {availableDates.map(d => (
                <option key={d} value={d}>
                  {d === todayStr ? `Today (${d})` : d}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Live Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by patient name, phone number, token / serial number, doctor, disease remark..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Table Top Bar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              Showing {filteredPatients.length} Post Consultation Patient(s)
            </span>
            {selectedDateFilter !== 'all' && (
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded-md text-[11px]">
                {selectedDateFilter === todayStr ? 'Today' : selectedDateFilter}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Yes (Done/Bought/Advised)
            </span>
            <span className="flex items-center gap-1 ml-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> No (Declined/Not Done)
            </span>
            <span className="flex items-center gap-1 ml-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Pending / None
            </span>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-3.5 text-center w-14">Serial</th>
                <th className="py-3 px-4 min-w-[190px]">Patient Information</th>
                <th className="py-3 px-4 min-w-[170px]">Post Consultation</th>
                
                {/* 3 Department Columns */}
                <th className="py-3 px-4 min-w-[210px] bg-purple-50/80 text-purple-950 border-x border-purple-100">
                  <div className="flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                    <span>1. Pathology Dept.</span>
                  </div>
                  <span className="text-[10px] normal-case font-normal text-purple-700 block">
                    Lab Test Conducted?
                  </span>
                </th>

                <th className="py-3 px-4 min-w-[210px] bg-emerald-50/80 text-emerald-950 border-r border-emerald-100">
                  <div className="flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Organic Product</span>
                  </div>
                  <span className="text-[10px] normal-case font-normal text-emerald-700 block">
                    Product Purchased?
                  </span>
                </th>

                <th className="py-3 px-4 min-w-[210px] bg-amber-50/80 text-amber-950 border-r border-amber-100">
                  <div className="flex items-center gap-1.5">
                    <Apple className="w-3.5 h-3.5 text-amber-600" />
                    <span>3. Nutrition Dept.</span>
                  </div>
                  <span className="text-[10px] normal-case font-normal text-amber-700 block">
                    Diet / Nutrition Consulted?
                  </span>
                </th>

                <th className="py-3 px-4 text-center min-w-[130px]">Overall Clearance</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Filter className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600 text-sm">No Post Consultation patients found</p>
                      <p className="text-xs text-slate-400">Try changing the date filter or search query</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((p, idx) => {
                  const serialDisplay = p.consultationSerial ? `#${p.consultationSerial}` : (p.serialNo || `${startIndex + idx + 1}`);
                  const isClearedAll = p.pathologyStatus === 'Yes' && p.organicStatus === 'Yes' && p.nutritionStatus === 'Yes';
                  
                  const yesCount = [
                    p.pathologyStatus === 'Yes',
                    p.organicStatus === 'Yes',
                    p.nutritionStatus === 'Yes'
                  ].filter(Boolean).length;

                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isClearedAll ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Serial */}
                      <td className="py-3 px-3.5 text-center">
                        <span className="inline-block px-2.5 py-1 bg-slate-900 text-emerald-400 font-mono font-bold text-xs rounded-lg shadow-sm">
                          {serialDisplay}
                        </span>
                      </td>

                      {/* Patient Information */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <p className="font-extrabold text-slate-900 text-xs sm:text-sm">
                            {p.name}
                          </p>
                          <p className="font-mono text-emerald-700 font-bold text-xs flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{p.phone}</span>
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            {p.gender && <span>{p.gender}</span>}
                            {p.age && <span>• {p.age} yrs</span>}
                            {p.profession && <span>• {p.profession}</span>}
                          </div>
                          {p.address && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[220px]" title={p.address}>
                              {p.address}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Post Consultation Info */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                            <Stethoscope className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{p.postDoctorName || p.doctorName || 'Doctor Assigned'}</span>
                          </p>
                          {p.consultationComment && (
                            <div className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[11px] font-medium">
                              {p.consultationComment}
                            </div>
                          )}
                          {p.remark && (
                            <p className="text-[11px] text-slate-500 line-clamp-2" title={p.remark}>
                              {p.remark}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400">
                            {p.appointmentDate || todayStr}
                          </p>
                        </div>
                      </td>

                      {/* COLUMN 1: Pathology Dept. */}
                      <td className="py-3 px-4 bg-purple-50/40 border-x border-purple-100/80">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleStatus(p, 'pathology', 'Yes')}
                              disabled={!isPathologyUser || updatingKey === `${p.id}-pathology-Yes`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.pathologyStatus === 'Yes'
                                  ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-300'
                                  : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300'
                              }`}
                              title={isPathologyUser ? 'Mark as Test Done (Yes)' : 'Only Pathology staff or Admin can change this'}
                            >
                              <Check className="w-3.5 h-3.5 font-black" />
                              <span>Yes</span>
                            </button>

                            <button
                              onClick={() => handleToggleStatus(p, 'pathology', 'No')}
                              disabled={!isPathologyUser || updatingKey === `${p.id}-pathology-No`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.pathologyStatus === 'No'
                                  ? 'bg-rose-600 text-white shadow ring-2 ring-rose-300'
                                  : 'bg-white hover:bg-rose-50 text-rose-800 border border-rose-300'
                              }`}
                              title={isPathologyUser ? 'Mark as Test NOT Done (No)' : 'Only Pathology staff or Admin can change this'}
                            >
                              <X className="w-3.5 h-3.5 font-black" />
                              <span>No</span>
                            </button>

                            {p.pathologyStatus && isPathologyUser && (
                              <button
                                onClick={() => handleToggleStatus(p, 'pathology', '')}
                                disabled={updatingKey === `${p.id}-pathology-`}
                                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
                                title="Reset / Clear status"
                              >
                                Clear
                              </button>
                            )}

                            {!isPathologyUser && (
                              <span className="text-[10px] text-slate-400 ml-1 flex items-center" title="Read-only: Restricted to Pathology Staff and System Admin">
                                <Lock className="w-3 h-3 text-slate-400" />
                              </span>
                            )}
                          </div>

                          {/* Status Details */}
                          <div className="text-[10px] text-slate-500 space-y-0.5">
                            {p.pathologyStatus ? (
                              <p className="font-semibold text-purple-900">
                                Status: <span className={p.pathologyStatus === 'Yes' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{p.pathologyStatus}</span>
                                {p.pathologyUpdatedBy && <span className="font-normal text-slate-500"> • by {p.pathologyUpdatedBy}</span>}
                              </p>
                            ) : (
                              <p className="text-slate-400 italic">Pending confirmation</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* COLUMN 2: Organic Product */}
                      <td className="py-3 px-4 bg-emerald-50/40 border-r border-emerald-100/80">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleStatus(p, 'organic', 'Yes')}
                              disabled={!isOrganicUser || updatingKey === `${p.id}-organic-Yes`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.organicStatus === 'Yes'
                                  ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-300'
                                  : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300'
                              }`}
                              title={isOrganicUser ? 'Mark as Product Purchased (Yes)' : 'Only Organic staff or Admin can change this'}
                            >
                              <Check className="w-3.5 h-3.5 font-black" />
                              <span>Yes</span>
                            </button>

                            <button
                              onClick={() => handleToggleStatus(p, 'organic', 'No')}
                              disabled={!isOrganicUser || updatingKey === `${p.id}-organic-No`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.organicStatus === 'No'
                                  ? 'bg-rose-600 text-white shadow ring-2 ring-rose-300'
                                  : 'bg-white hover:bg-rose-50 text-rose-800 border border-rose-300'
                              }`}
                              title={isOrganicUser ? 'Mark as NOT Purchased (No)' : 'Only Organic staff or Admin can change this'}
                            >
                              <X className="w-3.5 h-3.5 font-black" />
                              <span>No</span>
                            </button>

                            {p.organicStatus && isOrganicUser && (
                              <button
                                onClick={() => handleToggleStatus(p, 'organic', '')}
                                disabled={updatingKey === `${p.id}-organic-`}
                                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
                                title="Reset / Clear status"
                              >
                                Clear
                              </button>
                            )}

                            {!isOrganicUser && (
                              <span className="text-[10px] text-slate-400 ml-1 flex items-center" title="Read-only: Restricted to Organic Staff and System Admin">
                                <Lock className="w-3 h-3 text-slate-400" />
                              </span>
                            )}
                          </div>

                          {/* Status Details */}
                          <div className="text-[10px] text-slate-500 space-y-0.5">
                            {p.organicStatus ? (
                              <p className="font-semibold text-emerald-900">
                                Status: <span className={p.organicStatus === 'Yes' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{p.organicStatus}</span>
                                {p.organicUpdatedBy && <span className="font-normal text-slate-500"> • by {p.organicUpdatedBy}</span>}
                              </p>
                            ) : (
                              <p className="text-slate-400 italic">Pending purchase</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* COLUMN 3: Nutrition Dept. */}
                      <td className="py-3 px-4 bg-amber-50/40 border-r border-amber-100/80">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleStatus(p, 'nutrition', 'Yes')}
                              disabled={!isNutritionUser || updatingKey === `${p.id}-nutrition-Yes`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.nutritionStatus === 'Yes'
                                  ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-300'
                                  : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300'
                              }`}
                              title={isNutritionUser ? 'Mark as Nutrition Advised (Yes)' : 'Only Nutrition staff or Admin can change this'}
                            >
                              <Check className="w-3.5 h-3.5 font-black" />
                              <span>Yes</span>
                            </button>

                            <button
                              onClick={() => handleToggleStatus(p, 'nutrition', 'No')}
                              disabled={!isNutritionUser || updatingKey === `${p.id}-nutrition-No`}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                                p.nutritionStatus === 'No'
                                  ? 'bg-rose-600 text-white shadow ring-2 ring-rose-300'
                                  : 'bg-white hover:bg-rose-50 text-rose-800 border border-rose-300'
                              }`}
                              title={isNutritionUser ? 'Mark as NOT Advised (No)' : 'Only Nutrition staff or Admin can change this'}
                            >
                              <X className="w-3.5 h-3.5 font-black" />
                              <span>No</span>
                            </button>

                            {p.nutritionStatus && isNutritionUser && (
                              <button
                                onClick={() => handleToggleStatus(p, 'nutrition', '')}
                                disabled={updatingKey === `${p.id}-nutrition-`}
                                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
                                title="Reset / Clear status"
                              >
                                Clear
                              </button>
                            )}

                            {!isNutritionUser && (
                              <span className="text-[10px] text-slate-400 ml-1 flex items-center" title="Read-only: Restricted to Nutrition Staff and System Admin">
                                <Lock className="w-3 h-3 text-slate-400" />
                              </span>
                            )}
                          </div>

                          {/* Status Details */}
                          <div className="text-[10px] text-slate-500 space-y-0.5">
                            {p.nutritionStatus ? (
                              <p className="font-semibold text-amber-900">
                                Status: <span className={p.nutritionStatus === 'Yes' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{p.nutritionStatus}</span>
                                {p.nutritionUpdatedBy && <span className="font-normal text-slate-500"> • by {p.nutritionUpdatedBy}</span>}
                              </p>
                            ) : (
                              <p className="text-slate-400 italic">Pending consultation</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Overall Clearance Badge */}
                      <td className="py-3 px-4 text-center">
                        {isClearedAll ? (
                          <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>All Cleared (3/3)</span>
                          </div>
                        ) : yesCount > 0 ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 font-bold text-xs border border-blue-200">
                            <span>{yesCount}/3 Done</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 font-semibold text-xs border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Pending (0/3)</span>
                          </div>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPatients > pageSize && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500">
              Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(startIndex + pageSize, totalPatients)}</span> of{' '}
              <span className="font-bold text-slate-800">{totalPatients}</span> patients
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <span className="text-slate-600 font-bold px-2">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
