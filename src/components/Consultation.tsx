import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  Stethoscope,
  Search, 
  ArrowRight, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Users, 
  Clock, 
  AlertTriangle, 
  Activity, 
  CheckCircle, 
  Eye, 
  Undo2, 
  MessageSquare,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { Patient, InvoiceQuotation, User as UserModel } from '../types';
import { 
  addOrUpdatePatientApi, 
  getProfessionsLocal, 
  getConsultationCommentsLocal 
} from '../utils/storage';

interface ConsultationProps {
  patients: Patient[];
  quotations: InvoiceQuotation[];
  professions?: string[];
  comments?: string[];
  onRefreshPatients: () => void;
  onUpdatePatient?: (patient: Patient) => void;
  onSelectPatientForQuotation: (patient: Patient) => void;
  onViewQuotation?: (quotation: InvoiceQuotation) => void;
  currentUser: UserModel | null;
}

export const Consultation: React.FC<ConsultationProps> = ({
  patients,
  quotations = [],
  professions = [],
  comments = [],
  onRefreshPatients,
  onUpdatePatient,
  onSelectPatientForQuotation,
  onViewQuotation,
  currentUser
}) => {
  const activeProfessions = professions && professions.length > 0 ? professions : getProfessionsLocal();
  const activeComments = comments && comments.length > 0 ? comments : getConsultationCommentsLocal();

  const professionOptions = useMemo(() => {
    const list = [...activeProfessions];
    if (!list.some(p => p.toLowerCase() === 'other' || p.toLowerCase() === 'others')) {
      list.push('Other');
    }
    return list;
  }, [activeProfessions]);

  const commentOptions = useMemo(() => {
    const list = [...activeComments];
    if (!list.some(c => c.toLowerCase() === 'other' || c.toLowerCase() === 'others')) {
      list.push('Other');
    }
    return list;
  }, [activeComments]);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayStr);
  const [activeSubTab, setActiveSubTab] = useState<'pre' | 'post'>('pre');
  const [filterText, setFilterText] = useState('');
  const deferredFilterText = useDeferredValue(filterText);
  const [selectedCommentFilter, setSelectedCommentFilter] = useState<string>('all');
  const [isProcessingDone, setIsProcessingDone] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Disease editing state
  const [editingDiseaseId, setEditingDiseaseId] = useState<string | null>(null);
  const [editingDiseaseText, setEditingDiseaseText] = useState<string>('');
  const [isSavingDisease, setIsSavingDisease] = useState<boolean>(false);

  // Custom "Other" manual input state
  const [customProfessionPatientId, setCustomProfessionPatientId] = useState<string | null>(null);
  const [customProfessionText, setCustomProfessionText] = useState<string>('');
  const [customCommentPatientId, setCustomCommentPatientId] = useState<string | null>(null);
  const [customCommentText, setCustomCommentText] = useState<string>('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Helper to determine if a patient is confirmed for Consultation
  const isConfirmedForConsultation = (p: Patient): boolean => {
    return p.isConfirmed === true || (p.consultationSerial !== null && p.consultationSerial !== undefined && Number(p.consultationSerial) > 0);
  };

  // Helper to determine if a patient has completed consultation
  const isPostConsultation = (p: Patient): boolean => {
    return p.status === 'Post Consultation' || p.consultationStatus === 'Post Consultation';
  };

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, selectedDateFilter, activeSubTab, selectedCommentFilter]);

  // Map of patient phone/id to latest quotation for quick lookup
  const quotationsByPatient = useMemo(() => {
    const map = new Map<string, InvoiceQuotation>();
    quotations.forEach(q => {
      if (q.patientId && !map.has(q.patientId)) {
        map.set(q.patientId, q);
      }
      if (q.patientPhone && !map.has(q.patientPhone)) {
        map.set(q.patientPhone, q);
      }
    });
    return map;
  }, [quotations]);

  // Statistics calculation - based on confirmed consultation patients
  const stats = useMemo(() => {
    const confirmedList = patients.filter(isConfirmedForConsultation);
    const total = confirmedList.length;
    const today = confirmedList.filter(p => p.appointmentDate === todayStr).length;
    const postCount = confirmedList.filter(p => isPostConsultation(p)).length;
    const preCount = total - postCount;

    return { total, today, preCount, postCount };
  }, [patients, todayStr]);

  // Count for the current date filter
  const dateFilteredPatients = useMemo(() => {
    const confirmedList = patients.filter(isConfirmedForConsultation);
    if (!selectedDateFilter || selectedDateFilter === 'all') return confirmedList;
    return confirmedList.filter(p => p.appointmentDate === selectedDateFilter);
  }, [patients, selectedDateFilter]);

  const preTabCount = useMemo(() => {
    return dateFilteredPatients.filter(p => !isPostConsultation(p)).length;
  }, [dateFilteredPatients]);

  const postTabCount = useMemo(() => {
    return dateFilteredPatients.filter(p => isPostConsultation(p)).length;
  }, [dateFilteredPatients]);

  // Filter patients by SubTab, Date, Comment, and Search Query
  const filteredPatients = useMemo(() => {
    // Only confirmed patients enter Consultation desk
    let result = patients.filter(isConfirmedForConsultation);

    // Filter by Date
    if (selectedDateFilter && selectedDateFilter !== 'all') {
      result = result.filter(p => p.appointmentDate === selectedDateFilter);
    }

    // Filter by SubTab: 'pre' or 'post'
    if (activeSubTab === 'pre') {
      result = result.filter(p => !isPostConsultation(p));
      // Pre Consultation queue is ordered sequentially by consultationSerial (1, 2, 3...)
      result.sort((a, b) => {
        const sA = typeof a.consultationSerial === 'number' ? a.consultationSerial : 999999;
        const sB = typeof b.consultationSerial === 'number' ? b.consultationSerial : 999999;
        return sA - sB;
      });
    } else {
      result = result.filter(p => isPostConsultation(p));

      // Filter by patient decision comment if selected in Post Consultation
      if (selectedCommentFilter && selectedCommentFilter !== 'all') {
        result = result.filter(p => p.consultationComment === selectedCommentFilter);
      }

      // Post Consultation: ordered sequentially by SL NO. in ascending order (1, 2, 3...)
      result.sort((a, b) => {
        const sA = typeof a.consultationSerial === 'number' ? a.consultationSerial : 999999;
        const sB = typeof b.consultationSerial === 'number' ? b.consultationSerial : 999999;
        return sA - sB;
      });
    }

    // Filter by search query (deferred for silky-smooth typing)
    if (deferredFilterText.trim()) {
      const query = deferredFilterText.trim().toLowerCase();
      result = result.filter(p => {
        return (
          p.name?.toLowerCase().includes(query) ||
          p.phone?.toLowerCase().includes(query) ||
          String(p.consultationSerial || '').includes(query) ||
          p.serialNo?.toLowerCase().includes(query) ||
          p.address?.toLowerCase().includes(query) ||
          p.remark?.toLowerCase().includes(query) ||
          p.notes?.toLowerCase().includes(query) ||
          p.profession?.toLowerCase().includes(query) ||
          p.consultationComment?.toLowerCase().includes(query) ||
          p.preDoctorName?.toLowerCase().includes(query) ||
          p.postDoctorName?.toLowerCase().includes(query) ||
          p.doctorName?.toLowerCase().includes(query) ||
          p.department?.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [patients, selectedDateFilter, activeSubTab, selectedCommentFilter, deferredFilterText]);

  // Pagination calculation
  const totalPatientsCount = filteredPatients.length;
  const totalPages = Math.max(1, Math.ceil(totalPatientsCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, startIndex, pageSize]);

  // Action: Update single patient profession (Instant 1ms UI update + Silent background sync)
  const handleUpdateProfession = (patient: Patient, newProfession: string) => {
    const updated: Patient = {
      ...patient,
      profession: newProfession
    };

    // 1. Instant UI update in 1ms:
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }

    setActionMessage({
      type: 'success',
      text: `✓ Profession updated to "${newProfession}" for ${patient.name}.`
    });
    setTimeout(() => setActionMessage(null), 2500);

    // 2. Silent background database update:
    addOrUpdatePatientApi(updated).catch((err: any) => {
      console.error('Failed to update profession in background:', err);
      if (onUpdatePatient) {
        onUpdatePatient(patient); // rollback on error
      }
      setActionMessage({
        type: 'error',
        text: `⚠️ Could not save profession to database: ${err?.message || 'Network error'}`
      });
    });
  };

  // Custom Profession save
  const handleSaveCustomProfession = (patient: Patient) => {
    const clean = customProfessionText.trim();
    if (clean) {
      handleUpdateProfession(patient, clean);
    }
    setCustomProfessionPatientId(null);
  };

  // Action: Update single patient decision / comment (Instant 1ms UI update + Silent background sync)
  const handleUpdateComment = (patient: Patient, newComment: string) => {
    const updated: Patient = {
      ...patient,
      consultationComment: newComment
    };

    // 1. Instant UI update in 1ms:
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }

    setActionMessage({
      type: 'success',
      text: `✓ Decision comment "${newComment}" saved for ${patient.name}.`
    });
    setTimeout(() => setActionMessage(null), 2500);

    // 2. Silent background database update:
    addOrUpdatePatientApi(updated).catch((err: any) => {
      console.error('Failed to update comment in background:', err);
      if (onUpdatePatient) {
        onUpdatePatient(patient); // rollback on error
      }
      setActionMessage({
        type: 'error',
        text: `⚠️ Could not save comment to database: ${err?.message || 'Network error'}`
      });
    });
  };

  // Custom Comment save
  const handleSaveCustomComment = (patient: Patient) => {
    const clean = customCommentText.trim();
    if (clean) {
      handleUpdateComment(patient, clean);
    }
    setCustomCommentPatientId(null);
  };

  // Disease editing handlers
  const handleStartEditDisease = (patient: Patient) => {
    setEditingDiseaseId(patient.id);
    setEditingDiseaseText(patient.remark || patient.notes || '');
  };

  const handleSaveDisease = async (patient: Patient) => {
    if (isSavingDisease) return;
    setIsSavingDisease(true);
    const clean = editingDiseaseText.trim();
    const updated: Patient = {
      ...patient,
      notes: clean,
      remark: clean
    };

    // 1. Instant UI update
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }
    setEditingDiseaseId(null);
    setIsSavingDisease(false);

    // 2. Silent background update
    addOrUpdatePatientApi(updated).catch(err => {
      console.error('Failed to update disease in background:', err);
      if (onUpdatePatient) onUpdatePatient(patient);
    });
  };

  // Action: Mark single patient as Done in Pre Consultation -> moves to Post Consultation with Auto-Detected Doctor
  const handleMarkDone = async (patient: Patient) => {
    if (!patient.profession || !patient.profession.trim()) {
      setActionMessage({
        type: 'error',
        text: `⚠️ Please select a profession for ${patient.name} before marking Done.`
      });
      setTimeout(() => setActionMessage(null), 3500);
      return;
    }

    setIsProcessingDone(patient.id);
    const attendingDoctor = currentUser?.name || currentUser?.username || patient.doctorName || 'Doctor';
    const updated: Patient = {
      ...patient,
      status: 'Post Consultation',
      consultationStatus: 'Post Consultation',
      preDoctorName: patient.preDoctorName || attendingDoctor,
      preConsultationAt: new Date().toISOString()
    };

    // 1. Instant UI update in 1ms
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }
    setIsProcessingDone(null);
    setActionMessage({
      type: 'success',
      text: `✓ ${patient.name} marked as Done by Dr. ${patient.preDoctorName || attendingDoctor} and moved to Post Consultation.`
    });
    setTimeout(() => setActionMessage(null), 3500);

    // 2. Silent background sync
    addOrUpdatePatientApi(updated).catch((err: any) => {
      console.error('Failed to mark done in background:', err);
      if (onUpdatePatient) onUpdatePatient(patient);
      setActionMessage({
        type: 'error',
        text: `Failed to mark done: ${err?.message || 'Error occurred'}`
      });
    });
  };

  // Action: Create Quotation in Post Consultation -> auto-records doctor and opens Quotation Builder
  const handleCreateQuotation = async (patient: Patient) => {
    if (!patient.postConsultationConfirmed) {
      return;
    }
    setIsProcessingDone(patient.id);
    const attendingDoctor = currentUser?.name || currentUser?.username || patient.preDoctorName || 'Doctor';
    const updated: Patient = {
      ...patient,
      postDoctorName: patient.postDoctorName || attendingDoctor,
      postConsultationAt: patient.postConsultationAt || new Date().toISOString()
    };

    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }
    setIsProcessingDone(null);
    onSelectPatientForQuotation(updated);

    addOrUpdatePatientApi(updated).catch(err => {
      console.error('Failed to auto-record doctor on quotation create in background:', err);
    });
  };

  // Action: Mark single patient as Done / Confirmed in Post Consultation
  const handleConfirmPostConsultation = async (patient: Patient) => {
    if (!patient.consultationComment || !patient.consultationComment.trim() || patient.consultationComment === 'Other') {
      setActionMessage({
        type: 'error',
        text: `⚠️ Please select or enter a valid comment for ${patient.name} before confirming Done.`
      });
      setTimeout(() => setActionMessage(null), 3000);
      return;
    }

    setIsProcessingDone(patient.id);
    const attendingDoctor = currentUser?.name || currentUser?.username || 'Doctor';
    const updated: Patient = {
      ...patient,
      postDoctorName: patient.postDoctorName || attendingDoctor,
      postConsultationConfirmed: true,
      postConfirmedAt: new Date().toISOString()
    };

    // 1. Instant UI update
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }
    setIsProcessingDone(null);
    setActionMessage({
      type: 'success',
      text: `✓ Post Consultation confirmed for ${patient.name}.`
    });
    setTimeout(() => setActionMessage(null), 3000);

    // 2. Silent background sync
    addOrUpdatePatientApi(updated).catch((err: any) => {
      console.error('Failed to confirm post consultation in background:', err);
      if (onUpdatePatient) onUpdatePatient(patient);
      setActionMessage({
        type: 'error',
        text: `Failed to confirm: ${err?.message || 'Error occurred'}`
      });
    });
  };

  // Action: Revert patient from Post Consultation back to Pre Consultation
  const handleRevertToPre = async (patient: Patient) => {
    setIsProcessingDone(patient.id);
    const updated: Patient = {
      ...patient,
      status: 'Pending Counseling',
      consultationStatus: 'Pre Consultation',
      postConsultationConfirmed: false
    };

    // 1. Instant UI update
    if (onUpdatePatient) {
      onUpdatePatient(updated);
    }
    setIsProcessingDone(null);
    setActionMessage({
      type: 'success',
      text: `✓ ${patient.name} moved back to Pre Consultation tab.`
    });
    setTimeout(() => setActionMessage(null), 3500);

    // 2. Silent background sync
    addOrUpdatePatientApi(updated).catch((err: any) => {
      console.error('Failed to revert in background:', err);
      if (onUpdatePatient) onUpdatePatient(patient);
      setActionMessage({
        type: 'error',
        text: `Failed to move back: ${err?.message || 'Error occurred'}`
      });
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Consultation Header */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Patient Consultation
          </h2>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-emerald-800/40">
          <div className="bg-slate-900/60 border border-emerald-800/40 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-emerald-200/80 font-semibold uppercase tracking-wider">Total Patients</p>
              <p className="text-xl sm:text-2xl font-extrabold text-white">{stats.total}</p>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-800/40 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-blue-200/80 font-semibold uppercase tracking-wider">Today's Appts</p>
              <p className="text-xl sm:text-2xl font-extrabold text-white">{stats.today}</p>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-800/40 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-amber-200/80 font-semibold uppercase tracking-wider">Pre Consultation</p>
              <p className="text-xl sm:text-2xl font-extrabold text-amber-300">{stats.preCount}</p>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-800/40 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-emerald-200/80 font-semibold uppercase tracking-wider">Post Consultation</p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-300">{stats.postCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Patient List Table Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
        
        {/* Sub-Tabs: Pre Consultation vs Post Consultation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit flex-wrap">
            <button
              type="button"
              onClick={() => setActiveSubTab('pre')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2.5 ${
                activeSubTab === 'pre'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Pre Consultation</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                activeSubTab === 'pre' 
                  ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {preTabCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('post')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2.5 ${
                activeSubTab === 'post'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700'
                  : 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Post Consultation</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                activeSubTab === 'post' 
                  ? 'bg-emerald-700 text-white border border-emerald-500' 
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {postTabCount}
              </span>
            </button>
          </div>

          <div className="text-sm text-slate-600 font-medium">
            {activeSubTab === 'pre' ? (
              <span className="text-amber-900 font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Patients waiting for doctor's consultation. Click <strong>Done</strong> to record doctor and move to Post Consultation.</span>
              </span>
            ) : (
              <span className="text-emerald-900 font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Post-Consultation & Counseling desk. Select patient decision / comment and click <strong>Create Quotation</strong> to proceed.</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-emerald-600" />
              <span>
                {activeSubTab === 'pre' 
                  ? 'Pre Consultation Patient Queue' 
                  : 'Post Consultation Completed List'} ({filteredPatients.length} shown)
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Date Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-2 rounded-xl text-sm">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs text-slate-700 font-bold hidden sm:inline">Date:</span>
              <input
                type="date"
                value={selectedDateFilter === 'all' ? '' : selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value || 'all')}
                className="bg-transparent text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer"
              />
              {selectedDateFilter !== todayStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter(todayStr)}
                  className="text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-md ml-1 transition cursor-pointer"
                >
                  Today
                </button>
              )}
              {selectedDateFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter('all')}
                  className="text-xs font-bold text-slate-800 bg-slate-200 hover:bg-slate-300 px-2.5 py-1 rounded-md ml-1 transition cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>

            {/* Comment Filter (Only in Post Consultation) */}
            {activeSubTab === 'post' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 px-3 py-2 rounded-xl text-sm">
                <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs text-slate-700 font-bold hidden sm:inline">Comment:</span>
                <select
                  value={selectedCommentFilter}
                  onChange={(e) => setSelectedCommentFilter(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-900 focus:outline-none cursor-pointer max-w-[150px]"
                >
                  <option value="all">All Comments</option>
                  {activeComments.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search name, phone, comment..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-normal"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>
        </div>

        {/* Patient Table Content */}
        {filteredPatients.length === 0 ? (
          <div className="py-16 text-center text-slate-600 text-sm space-y-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
              {activeSubTab === 'pre' ? <Clock className="w-7 h-7 text-amber-500" /> : <CheckCircle className="w-7 h-7 text-emerald-500" />}
            </div>
            <p className="font-bold text-slate-800 text-base">
              {activeSubTab === 'pre' 
                ? 'No patients currently waiting in Pre Consultation queue for this date.'
                : 'No patients found in Post Consultation for the selected date or comment filter.'}
            </p>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              {activeSubTab === 'pre' 
                ? 'Confirmed patients from daily appointments are automatically transferred here in sequential order (1, 2, 3...).'
                : 'Patients will appear in Post Consultation as soon as the doctor marks them as "Done" from the Pre Consultation queue.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {selectedDateFilter !== 'all' && (
                <button
                  onClick={() => setSelectedDateFilter('all')}
                  className="text-emerald-700 font-bold underline hover:text-emerald-800 cursor-pointer text-sm"
                >
                  View All Dates
                </button>
              )}
              {selectedCommentFilter !== 'all' && (
                <button
                  onClick={() => setSelectedCommentFilter('all')}
                  className="text-blue-700 font-bold underline hover:text-blue-800 cursor-pointer text-sm"
                >
                  Clear Comment Filter
                </button>
              )}
              {activeSubTab === 'post' && (
                <button
                  onClick={() => setActiveSubTab('pre')}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition shadow-xs cursor-pointer text-sm"
                >
                  Go to Pre Consultation Tab
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">SL NO.</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">PATIENT NAME</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">PHONE NUMBER</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">GENDER / AGE</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ADDRESS</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Disease</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Profession</th>
                    {activeSubTab === 'post' && (
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-blue-950 bg-blue-50/70 border-l border-r border-blue-200">
                        Comment
                      </th>
                    )}
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Doctor</th>
                    <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">CONSULTATION ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedPatients.map((p, idx) => {
                    const phoneDuplicates = patients.filter(x => x.phone === p.phone && x.phone && x.phone !== '01700000000').length;
                    const itemDisplayIndex = startIndex + idx + 1;
                    const existingQuotation = quotationsByPatient.get(p.id) || quotationsByPatient.get(p.phone);
                    const isCurrentlyProcessing = isProcessingDone === p.id;

                    return (
                      <tr 
                        key={p.id ? `${p.id}-${itemDisplayIndex}` : `pat-row-${itemDisplayIndex}`} 
                        className="hover:bg-emerald-50/30 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-950 border border-emerald-300 rounded text-xs font-semibold inline-flex items-center">
                            #{p.consultationSerial || itemDisplayIndex}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-normal text-slate-800 text-sm">
                          {p.name}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap text-sm font-normal">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.phone}</span>
                            {phoneDuplicates > 1 && (
                              <span className="px-1.5 py-0.2 bg-purple-100 text-purple-900 text-[11px] font-normal rounded border border-purple-200" title={`${phoneDuplicates} appointments registered under this mobile number`}>
                                {phoneDuplicates} Appts
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap font-normal text-sm">
                          {p.gender || 'Male'} • {p.age ? `${p.age} Yrs` : 'N/A'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-sm max-w-[160px] truncate font-normal" title={p.address || ''}>
                          {p.address || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 text-sm max-w-[210px] font-normal">
                          {editingDiseaseId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingDiseaseText}
                                onChange={(e) => setEditingDiseaseText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveDisease(p);
                                  if (e.key === 'Escape') setEditingDiseaseId(null);
                                }}
                                autoFocus
                                placeholder="Enter disease..."
                                className="w-full px-2 py-1 text-xs border border-emerald-500 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveDisease(p)}
                                disabled={isSavingDisease}
                                className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDiseaseId(null)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 group">
                              <span className="line-clamp-2" title={p.remark || p.notes || ''}>
                                {p.remark || p.notes || 'General Assessment'}
                              </span>
                              {activeSubTab === 'pre' && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDisease(p)}
                                  className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded transition opacity-80 group-hover:opacity-100 cursor-pointer shrink-0"
                                  title="Edit Disease"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {activeSubTab === 'pre' ? (
                            customProfessionPatientId === p.id ? (
                              <div className="flex items-center gap-1 min-w-[155px]">
                                <input
                                  type="text"
                                  value={customProfessionText}
                                  onChange={(e) => setCustomProfessionText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveCustomProfession(p);
                                    if (e.key === 'Escape') setCustomProfessionPatientId(null);
                                  }}
                                  placeholder="Type profession..."
                                  autoFocus
                                  className="w-full px-2 py-1 text-xs border border-emerald-500 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCustomProfession(p)}
                                  className="p-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded cursor-pointer"
                                  title="Save Profession"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCustomProfessionPatientId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <select
                                value={professionOptions.includes(p.profession || '') ? (p.profession || '') : (p.profession ? 'Other' : '')}
                                onChange={(e) => {
                                  if (e.target.value === 'Other') {
                                    setCustomProfessionPatientId(p.id);
                                    setCustomProfessionText(p.profession && !professionOptions.includes(p.profession) ? p.profession : '');
                                  } else {
                                    handleUpdateProfession(p, e.target.value);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer min-w-[125px] transition"
                                title="Select patient profession (from Settings)"
                              >
                                <option value="">-- Select --</option>
                                {professionOptions.map(prof => (
                                  <option key={prof} value={prof}>
                                    {prof === 'Other' && p.profession && !professionOptions.includes(p.profession) 
                                      ? `Other: ${p.profession}` 
                                      : prof}
                                  </option>
                                ))}
                              </select>
                            )
                          ) : (
                            <span className="text-sm font-normal text-slate-800">
                              {p.profession ? (
                                <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-medium inline-block">
                                  {p.profession}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs italic">—</span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Comment Column: Only in Post Consultation */}
                        {activeSubTab === 'post' && (
                          <td className="px-3 py-2.5 whitespace-nowrap bg-blue-50/20 border-l border-r border-blue-100">
                            {p.postConsultationConfirmed ? (
                              p.consultationComment ? (
                                <span className={`px-2.5 py-1 rounded-md text-xs font-medium border inline-block ${
                                  p.consultationComment === 'Will take today'
                                    ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                                    : p.consultationComment === 'Will admit'
                                    ? 'bg-blue-50 text-blue-950 border-blue-300'
                                    : p.consultationComment === 'Costly'
                                    ? 'bg-rose-50 text-rose-950 border-rose-300'
                                    : p.consultationComment === 'Will take later'
                                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                                    : 'bg-slate-100 text-slate-800 border-slate-200'
                                }`} title="Comment locked after confirmation">
                                  {p.consultationComment}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs italic">—</span>
                              )
                            ) : customCommentPatientId === p.id ? (
                              <div className="flex items-center gap-1 min-w-[165px]">
                                <input
                                  type="text"
                                  value={customCommentText}
                                  onChange={(e) => setCustomCommentText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveCustomComment(p);
                                    if (e.key === 'Escape') setCustomCommentPatientId(null);
                                  }}
                                  placeholder="Type custom comment..."
                                  autoFocus
                                  className="w-full px-2 py-1 text-xs border border-blue-500 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCustomComment(p)}
                                  className="p-1 text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded cursor-pointer"
                                  title="Save Comment"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCustomCommentPatientId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <select
                                value={commentOptions.includes(p.consultationComment || '') ? (p.consultationComment || '') : (p.consultationComment ? 'Other' : '')}
                                onChange={(e) => {
                                  if (e.target.value === 'Other') {
                                    setCustomCommentPatientId(p.id);
                                    setCustomCommentText(p.consultationComment && !commentOptions.includes(p.consultationComment) ? p.consultationComment : '');
                                  } else {
                                    handleUpdateComment(p, e.target.value);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-sm font-normal border shadow-2xs cursor-pointer min-w-[145px] transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  p.consultationComment === 'Will take today'
                                    ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                                    : p.consultationComment === 'Will admit'
                                    ? 'bg-blue-50 text-blue-950 border-blue-300'
                                    : p.consultationComment === 'Costly'
                                    ? 'bg-rose-50 text-rose-950 border-rose-300'
                                    : p.consultationComment === 'Will take later'
                                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                                }`}
                                title="Select patient decision or counseling comment (managed from Settings)"
                              >
                                <option value="">-- Select Decision --</option>
                                {commentOptions.map(c => (
                                  <option key={c} value={c}>
                                    {c === 'Other' && p.consultationComment && !commentOptions.includes(p.consultationComment) 
                                      ? `Other: ${p.consultationComment}` 
                                      : c}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        )}

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {activeSubTab === 'pre' ? (
                            <div className="flex flex-col">
                              <span className="font-normal text-slate-800 text-sm">
                                {p.preDoctorName || currentUser?.name || currentUser?.username || p.doctorName || 'Attending Doctor'}
                              </span>
                              <span className="text-[11px] text-emerald-700">
                                {p.preDoctorName ? 'Recorded' : 'Active Doctor'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-normal text-slate-800 text-sm">
                                {p.postDoctorName || currentUser?.name || currentUser?.username || p.preDoctorName || 'Doctor'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">
                                Pre: {p.preDoctorName || p.doctorName || 'Doctor'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* In Pre Consultation: Display Done Button */}
                            {activeSubTab === 'pre' ? (
                              <button
                                onClick={() => handleMarkDone(p)}
                                disabled={isCurrentlyProcessing || !p.profession}
                                className={`px-4 py-1.5 font-semibold text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 ml-auto ${
                                  !p.profession 
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300' 
                                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white cursor-pointer'
                                }`}
                                title={!p.profession ? 'Please select patient profession first to mark Done' : 'Click Done to record doctor and move patient to Post Consultation'}
                              >
                                {isCurrentlyProcessing ? (
                                  <Activity className="w-4 h-4 animate-spin text-white" />
                                ) : (
                                  <CheckCircle className={`w-4 h-4 ${!p.profession ? 'text-slate-400' : 'text-emerald-200'}`} />
                                )}
                                <span>Done</span>
                              </button>
                            ) : (
                              /* In Post Consultation: Done button (changes to Confirmed), Create Quotation (no arrow), and Revert button */
                              <div className="flex items-center gap-1.5">
                                {existingQuotation && onViewQuotation && (
                                  <button
                                    onClick={() => onViewQuotation(existingQuotation)}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition border border-slate-300 cursor-pointer"
                                    title="View Quotation"
                                  >
                                    <Eye className="w-4 h-4 text-slate-600" />
                                  </button>
                                )}

                                {p.postConsultationConfirmed ? (
                                  <span className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold inline-flex items-center gap-1 shadow-2xs">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Confirmed</span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleConfirmPostConsultation(p)}
                                    disabled={isCurrentlyProcessing || !p.consultationComment || !p.consultationComment.trim() || p.consultationComment === 'Other'}
                                    className={`px-3 py-1.5 font-medium text-xs rounded-xl shadow-xs transition flex items-center gap-1 ${
                                      !p.consultationComment || !p.consultationComment.trim() || p.consultationComment === 'Other'
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                        : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white cursor-pointer'
                                    }`}
                                    title={
                                      !p.consultationComment || !p.consultationComment.trim() || p.consultationComment === 'Other'
                                        ? 'Please select or enter a comment before confirming Done'
                                        : 'Click Done to confirm Post Consultation'
                                    }
                                  >
                                    {isCurrentlyProcessing ? (
                                      <Activity className="w-3.5 h-3.5 animate-spin text-white" />
                                    ) : (
                                      <CheckCircle className={`w-3.5 h-3.5 ${!p.consultationComment || !p.consultationComment.trim() || p.consultationComment === 'Other' ? 'text-slate-400' : 'text-emerald-200'}`} />
                                    )}
                                    <span>Done</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleCreateQuotation(p)}
                                  disabled={isCurrentlyProcessing || !p.postConsultationConfirmed}
                                  className={`px-3 py-1.5 font-medium text-xs rounded-xl transition shadow-xs flex items-center whitespace-nowrap ${
                                    !p.postConsultationConfirmed
                                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white cursor-pointer disabled:opacity-50'
                                  }`}
                                  title={
                                    !p.postConsultationConfirmed
                                      ? 'Please click Done first to enable Quotation creation'
                                      : 'Click to open Quotation Builder for this patient'
                                  }
                                >
                                  <span>{existingQuotation ? 'Quotation' : 'Create Quotation'}</span>
                                </button>

                                <button
                                  onClick={() => handleRevertToPre(p)}
                                  disabled={isCurrentlyProcessing}
                                  className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-300 transition cursor-pointer"
                                  title="Revert back to Pre Consultation"
                                >
                                  <Undo2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3 text-slate-700 font-normal">
                <span>
                  Showing <strong className="text-slate-900 font-medium">{totalPatientsCount > 0 ? startIndex + 1 : 0}</strong> - <strong className="text-slate-900 font-medium">{Math.min(startIndex + pageSize, totalPatientsCount)}</strong> of <strong className="text-slate-900 font-medium">{totalPatientsCount}</strong> patients
                </span>
                <div className="flex items-center gap-2 border-l border-slate-300 pl-3">
                  <span className="text-xs text-slate-500">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <span className="px-3.5 py-1 bg-emerald-50 text-emerald-900 font-bold border border-emerald-300 rounded-lg text-xs">
                    Page {safeCurrentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
