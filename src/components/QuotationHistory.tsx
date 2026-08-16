import React, { useState } from 'react';
import { 
  Search, 
  Printer, 
  FileText, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  X, 
  Clock, 
  Users,
  Receipt,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Check,
  FilePlus
} from 'lucide-react';
import { InvoiceQuotation, User, Patient } from '../types';

interface QuotationHistoryProps {
  quotations: InvoiceQuotation[];
  patients?: Patient[];
  currentUser?: User | null;
  onViewPrintQuotation: (quotation: InvoiceQuotation) => void;
  onUpdateQuotation?: (quotation: InvoiceQuotation) => void;
  onDeleteQuotations?: (ids: string[]) => void;
  onSelectPatientForQuotation?: (patient: Patient) => void;
}

interface PatientHistoryGroup {
  patientKey: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  patientAge?: string | number;
  patientGender?: string;
  quotations: (InvoiceQuotation & { visitNumber: number; visitLabel: string })[];
  totalInvoices: number;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  lastVisitDate: string;
}

// English ordinal invoice label generator (1ST INVOICE, 2ND INVOICE, 3RD INVOICE...)
export function getVisitOrdinal(index: number): string {
  const n = index + 1;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  const ordinal = n + (s[(v - 20) % 10] || s[v] || s[0]);
  return `${ordinal.toUpperCase()} INVOICE`;
}

// Helper to compute daily treatment rate & total daily cost for an invoice quotation
export function getQuotationDailyRateBreakdown(quotation: InvoiceQuotation) {
  const treatmentSessions = quotation.treatments?.map(t => t.sessions || 0) || [];
  const indoorDays = quotation.indoorServices?.map(s => s.days || 0) || [];
  const allDays = [...treatmentSessions, ...indoorDays].filter(d => d > 0);
  const baseDays = allDays.length > 0 ? Math.max(...allDays) : 15;

  let treatmentDaily = 0;
  if (quotation.treatments && quotation.treatments.length > 0) {
    quotation.treatments.forEach(t => {
      const sess = t.sessions > 0 ? t.sessions : baseDays;
      treatmentDaily += (t.totalCost || 0) / sess;
    });
  }

  if (quotation.outdoorPackages && quotation.outdoorPackages.length > 0) {
    quotation.outdoorPackages.forEach(pkg => {
      const pDays = pkg.packageType === '30_day' ? 30 : pkg.packageType === '15_day' ? 15 : baseDays;
      treatmentDaily += (pkg.netCost || 0) / pDays;
    });
  }

  if (quotation.additionalTreatments && quotation.additionalTreatments.length > 0) {
    quotation.additionalTreatments.forEach(at => {
      const sess = (at.sessions && at.sessions > 0) ? at.sessions : baseDays;
      treatmentDaily += (at.totalCost || 0) / sess;
    });
  }

  let indoorDaily = 0;
  if (quotation.indoorServices && quotation.indoorServices.length > 0) {
    quotation.indoorServices.forEach(s => {
      indoorDaily += s.dailyRate || ((s.totalAmount || 0) / (s.days || 1));
    });
  }

  let totalDaily = Math.round(treatmentDaily + indoorDaily);
  if (totalDaily <= 0 && quotation.grandTotal > 0) {
    totalDaily = Math.round(quotation.grandTotal / (baseDays || 15));
  }

  return {
    baseDays,
    treatmentDaily: Math.round(treatmentDaily),
    indoorDaily: Math.round(indoorDaily),
    totalDaily: totalDaily || 0
  };
}

export const QuotationHistory: React.FC<QuotationHistoryProps> = ({
  quotations,
  patients,
  currentUser,
  onViewPrintQuotation,
  onUpdateQuotation,
  onDeleteQuotations,
  onSelectPatientForQuotation
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Payment state for inline billing calculation & updating in Full Details Modal
  const [paymentEditState, setPaymentEditState] = useState<{
    [quotationId: string]: {
      days: number | '';
      paidAmount: number | '';
      paymentStatus: 'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid';
      isSaving?: boolean;
      justSaved?: boolean;
    };
  }>({});

  const handleDaysInputChange = (q: InvoiceQuotation, daysVal: number | '') => {
    const rateInfo = getQuotationDailyRateBreakdown(q);
    if (daysVal === '') {
      setPaymentEditState(prev => ({
        ...prev,
        [q.id]: {
          ...(prev[q.id] || { paidAmount: q.advancePaid || 0, paymentStatus: q.paymentStatus }),
          days: ''
        }
      }));
      return;
    }

    const d = Math.max(1, Math.min(365, daysVal));
    // Auto-calculate treatment + accommodation cost for the selected days
    const autoCalculated = Math.min(q.grandTotal, Math.round(rateInfo.totalDaily * d));
    const autoStatus: 'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid' = 
      autoCalculated >= q.grandTotal ? 'Fully Paid' : autoCalculated > 0 ? 'Partial Paid' : 'Quotation';

    setPaymentEditState(prev => ({
      ...prev,
      [q.id]: {
        days: d,
        paidAmount: autoCalculated,
        paymentStatus: autoStatus
      }
    }));
  };

  const handlePaidAmountInputChange = (q: InvoiceQuotation, paidVal: number | '') => {
    const rateInfo = getQuotationDailyRateBreakdown(q);

    if (paidVal === '') {
      setPaymentEditState(prev => ({
        ...prev,
        [q.id]: {
          days: '',
          paidAmount: '',
          paymentStatus: 'Quotation'
        }
      }));
      return;
    }

    const p = Math.max(0, Math.min(q.grandTotal * 2, paidVal));
    const autoStatus: 'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid' = 
      p >= q.grandTotal ? 'Fully Paid' : p > 0 ? 'Partial Paid' : 'Quotation';

    // Calculate minimum days covered by the partial/full paid amount based on total daily rate
    let autoCalculatedDays: number = rateInfo.baseDays;
    if (rateInfo.totalDaily > 0) {
      if (p >= q.grandTotal) {
        autoCalculatedDays = rateInfo.baseDays;
      } else if (p > 0) {
        // Minimum days covered by this paid amount
        autoCalculatedDays = Math.min(rateInfo.baseDays, Math.max(1, Math.floor(p / rateInfo.totalDaily)));
      } else {
        autoCalculatedDays = 0;
      }
    } else {
      autoCalculatedDays = p >= q.grandTotal ? rateInfo.baseDays : 1;
    }

    setPaymentEditState(prev => ({
      ...prev,
      [q.id]: {
        days: autoCalculatedDays,
        paidAmount: p,
        paymentStatus: autoStatus
      }
    }));
  };

  const handleStatusSelectChange = (q: InvoiceQuotation, newStatus: 'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid') => {
    const rateInfo = getQuotationDailyRateBreakdown(q);
    const currentPaid = paymentEditState[q.id]?.paidAmount ?? (q.advancePaid || 0);

    let adjustedPaid = currentPaid;
    let adjustedDays: number | '' = paymentEditState[q.id]?.days ?? rateInfo.baseDays;

    if (newStatus === 'Fully Paid') {
      adjustedPaid = q.grandTotal;
      adjustedDays = rateInfo.baseDays;
    } else if (newStatus === 'Quotation') {
      adjustedPaid = 0;
      adjustedDays = 0;
    } else if (newStatus === 'Partial Paid') {
      if (typeof adjustedPaid !== 'number' || adjustedPaid <= 0 || adjustedPaid >= q.grandTotal) {
        adjustedPaid = Math.round(q.grandTotal / 2);
      }
      if (rateInfo.totalDaily > 0 && typeof adjustedPaid === 'number') {
        adjustedDays = Math.min(rateInfo.baseDays, Math.max(1, Math.floor(adjustedPaid / rateInfo.totalDaily)));
      }
    }

    setPaymentEditState(prev => ({
      ...prev,
      [q.id]: {
        days: adjustedDays,
        paidAmount: adjustedPaid,
        paymentStatus: newStatus
      }
    }));
  };

  const handleSaveInvoicePayment = (q: InvoiceQuotation) => {
    const rateInfo = getQuotationDailyRateBreakdown(q);
    const state = paymentEditState[q.id];
    const paidVal = typeof state?.paidAmount === 'number' ? state.paidAmount : (q.advancePaid || 0);
    const statusVal = state?.paymentStatus || (paidVal >= q.grandTotal ? 'Fully Paid' : paidVal > 0 ? 'Partial Paid' : 'Quotation');
    const dueVal = Math.max(0, q.grandTotal - paidVal);

    const updatedQuotation: InvoiceQuotation = {
      ...q,
      advancePaid: paidVal,
      dueAmount: dueVal,
      paymentStatus: statusVal
    };

    // Update in backend and App state
    if (onUpdateQuotation) {
      onUpdateQuotation(updatedQuotation);
    }

    // Update in selectedPatientModal so the modal reflects the changes immediately
    if (selectedPatientModal) {
      const updatedQuotations = selectedPatientModal.quotations.map(item => 
        item.id === q.id ? { ...item, ...updatedQuotation } : item
      );
      const totalBilled = updatedQuotations.reduce((sum, item) => sum + (item.grandTotal || 0), 0);
      const totalPaid = updatedQuotations.reduce((sum, item) => sum + (item.advancePaid || 0), 0);
      const totalDue = updatedQuotations.reduce((sum, item) => sum + (item.dueAmount || 0), 0);

      setSelectedPatientModal({
        ...selectedPatientModal,
        quotations: updatedQuotations,
        totalBilled,
        totalPaid,
        totalDue
      });
    }

    // Trigger feedback badge
    setPaymentEditState(prev => ({
      ...prev,
      [q.id]: {
        days: state?.days ?? rateInfo.baseDays,
        paidAmount: paidVal,
        paymentStatus: statusVal,
        justSaved: true
      }
    }));

    setTimeout(() => {
      setPaymentEditState(prev => ({
        ...prev,
        [q.id]: {
          ...(prev[q.id] || { days: rateInfo.baseDays, paidAmount: paidVal, paymentStatus: statusVal }),
          justSaved: false
        }
      }));
    }, 2200);
  };

  const handleCreateNewQuotationForPatient = (group: PatientHistoryGroup) => {
    const existingPatient = patients?.find(
      p => (p.phone && p.phone === group.patientPhone) || (p.name === group.patientName && p.phone === group.patientPhone)
    );

    const patientToSelect: Patient = existingPatient || {
      id: `patient-${Date.now()}`,
      name: group.patientName,
      phone: group.patientPhone || '',
      age: group.patientAge,
      gender: group.patientGender,
      doctorName: group.doctorName,
      status: 'Pending Counseling',
      createdAt: new Date().toISOString()
    };

    if (onSelectPatientForQuotation) {
      onSelectPatientForQuotation(patientToSelect);
    }
  };
  const [viewMode, setViewMode] = useState<'patient_grouped' | 'flat_list'>('patient_grouped');
  const [expandedPatientKey, setExpandedPatientKey] = useState<string | null>(null);
  const [selectedPatientModal, setSelectedPatientModal] = useState<PatientHistoryGroup | null>(null);
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1800);
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      console.error('Fallback copy failed', e);
    }
  };
  const [deleteWarningModal, setDeleteWarningModal] = useState<{
    type: 'single' | 'group' | 'bulk';
    title: string;
    subtitle: string;
    warningText: string;
    idsToDelete: string[];
    singleQuotation?: InvoiceQuotation | null;
    groupToDelete?: PatientHistoryGroup | null;
  } | null>(null);

  const isAdmin = currentUser?.role === 'System Admin';
  const canManageBilling = currentUser?.role === 'System Admin' || currentUser?.role === 'Billing Counter';

  const handleDeleteSingleQuotation = (q: InvoiceQuotation) => {
    if (!isAdmin) {
      alert('Delete permission is restricted to System Admin only.');
      return;
    }
    setDeleteWarningModal({
      type: 'single',
      title: 'Delete Quotation Invoice',
      subtitle: `Invoice #${q.quotationNumber} — ${q.patientName}`,
      warningText: `Are you sure you want to permanently delete Invoice / Quotation #${q.quotationNumber} for patient ${q.patientName} (${q.patientPhone || 'No Phone'})? This action cannot be undone.`,
      idsToDelete: [q.id],
      singleQuotation: q
    });
  };

  const handleDeletePatientGroup = (group: PatientHistoryGroup) => {
    if (!isAdmin) {
      alert('Delete permission is restricted to System Admin only.');
      return;
    }
    const ids = group.quotations.map(q => q.id);
    setDeleteWarningModal({
      type: 'group',
      title: 'Delete Entire Patient Visit History',
      subtitle: `${group.patientName} (${group.patientPhone}) — ${group.totalInvoices} Invoice Records`,
      warningText: `CRITICAL WARNING: You are about to delete ALL ${group.totalInvoices} quotation & visit invoice history records for patient "${group.patientName}" (Total Billed: BDT ${group.totalBilled.toLocaleString()}). This will completely erase their history records from the system and cannot be restored.`,
      idsToDelete: ids,
      groupToDelete: group
    });
  };

  const handleDeleteSelectedQuotations = () => {
    if (!isAdmin) {
      alert('Delete permission is restricted to System Admin only.');
      return;
    }
    if (selectedQuotationIds.length === 0) return;
    setDeleteWarningModal({
      type: 'bulk',
      title: 'Delete Selected Quotation Records',
      subtitle: `${selectedQuotationIds.length} Selected Quotations`,
      warningText: `WARNING: You are about to permanently delete ${selectedQuotationIds.length} selected quotation invoice record(s). Are you sure you want to proceed with permanent deletion?`,
      idsToDelete: [...selectedQuotationIds]
    });
  };

  const confirmAndExecuteDeletion = () => {
    if (!deleteWarningModal) return;

    const { idsToDelete, type, singleQuotation, groupToDelete } = deleteWarningModal;

    onDeleteQuotations?.(idsToDelete);

    if (type === 'single' && singleQuotation) {
      setSelectedQuotationIds(prev => prev.filter(id => id !== singleQuotation.id));
      if (selectedPatientModal) {
        const remaining = selectedPatientModal.quotations.filter(item => item.id !== singleQuotation.id);
        if (remaining.length === 0) {
          setSelectedPatientModal(null);
        } else {
          const totalBilled = remaining.reduce((sum, item) => sum + (item.grandTotal || 0), 0);
          const totalPaid = remaining.reduce((sum, item) => sum + (item.advancePaid || 0), 0);
          const totalDue = remaining.reduce((sum, item) => sum + (item.dueAmount || 0), 0);
          setSelectedPatientModal({
            ...selectedPatientModal,
            quotations: remaining,
            totalInvoices: remaining.length,
            totalBilled,
            totalPaid,
            totalDue
          });
        }
      }
    } else if (type === 'group' && groupToDelete) {
      setSelectedQuotationIds(prev => prev.filter(id => !idsToDelete.includes(id)));
      if (selectedPatientModal?.patientKey === groupToDelete.patientKey) {
        setSelectedPatientModal(null);
      }
    } else if (type === 'bulk') {
      setSelectedQuotationIds([]);
    }

    setDeleteWarningModal(null);
  };

  // Group quotations by Patient (using Phone or Patient Name)
  const patientGroupsMap = new Map<string, InvoiceQuotation[]>();

  // Sort all quotations chronologically first (oldest first to accurately compute 1st, 2nd, 3rd visit order)
  const sortedQuotations = [...quotations].sort((a, b) => 
    new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime() || a.id.localeCompare(b.id)
  );

  sortedQuotations.forEach((q) => {
    const key = (q.patientPhone && q.patientPhone !== '01700000000') 
      ? q.patientPhone.trim() 
      : `${q.patientName.trim().toLowerCase()}-${q.patientId}`;

    if (!patientGroupsMap.has(key)) {
      patientGroupsMap.set(key, []);
    }
    patientGroupsMap.get(key)!.push(q);
  });

  // Construct PatientHistoryGroup objects
  const patientGroups: PatientHistoryGroup[] = Array.from(patientGroupsMap.entries()).map(([key, groupQuotations]) => {
    // Add visit ordinal index
    const enrichedQuotations = groupQuotations.map((q, idx) => {
      const rawLabel = q.visitLabel || getVisitOrdinal(idx);
      const visitLabel = rawLabel.replace(/visit invoice/i, 'INVOICE').replace(/visit/i, '').trim();
      return {
        ...q,
        visitNumber: q.visitNumber || (idx + 1),
        visitLabel
      };
    });

    // Newest first inside patient record list display
    const newestFirst = [...enrichedQuotations].reverse();

    const totalBilled = groupQuotations.reduce((sum, item) => sum + (item.grandTotal || 0), 0);
    const totalPaid = groupQuotations.reduce((sum, item) => sum + (item.advancePaid || 0), 0);
    const totalDue = groupQuotations.reduce((sum, item) => sum + (item.dueAmount || 0), 0);
    
    const firstQuot = groupQuotations[groupQuotations.length - 1] || groupQuotations[0];

    return {
      patientKey: key,
      patientName: firstQuot.patientName,
      patientPhone: firstQuot.patientPhone,
      doctorName: firstQuot.doctorName || 'Senior Consultant',
      patientAge: firstQuot.patientAge,
      patientGender: firstQuot.patientGender,
      quotations: newestFirst,
      totalInvoices: groupQuotations.length,
      totalBilled,
      totalPaid,
      totalDue,
      lastVisitDate: newestFirst[0]?.createdDate || firstQuot.createdDate
    };
  });

  // Filter groups according to search term
  const filteredGroups = patientGroups.filter(g => 
    g.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.patientPhone.includes(searchTerm) ||
    g.doctorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.quotations.some(q => q.quotationNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Flat list enriched with visit ordinal labels
  const flatEnrichedQuotations = patientGroups.flatMap(g => g.quotations);
  const filteredFlatQuotations = flatEnrichedQuotations.filter(q =>
    q.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.patientPhone.includes(searchTerm) ||
    q.quotationNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleExpand = (key: string) => {
    setExpandedPatientKey(prev => prev === key ? null : key);
  };

  return (
    <div className="space-y-6 print:hidden">
      
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-600" />
              <span>Quotation & Patient Visit History</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive patient billing and medical visit history archive (1st Visit, 2nd Visit, 3rd Visit records)
            </p>
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-stretch md:self-auto">
            <button
              onClick={() => setViewMode('patient_grouped')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'patient_grouped' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>By Patient ({patientGroups.length})</span>
            </button>
            <button
              onClick={() => setViewMode('flat_list')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'flat_list' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>All Invoices ({quotations.length})</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-5 relative">
          <input
            type="text"
            placeholder="Search by patient name, mobile number, doctor, or invoice # (e.g. SXH-2026-1700)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        </div>
      </div>

      {/* VIEW 1: PATIENT GROUPED HISTORY */}
      {viewMode === 'patient_grouped' && (
        <div className="space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-500 space-y-3 border border-slate-200 shadow-sm">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-700">No Patient History Found</p>
              <p className="text-xs text-slate-500">No matching billing or quotation records created yet.</p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isExpanded = expandedPatientKey === group.patientKey;

              return (
                <div 
                  key={group.patientKey} 
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
                >
                  {/* Patient Header Summary Bar */}
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50/50">
                    
                    {/* Patient Info */}
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 font-black text-sm flex items-center justify-center border border-emerald-200 shrink-0 mt-0.5">
                        {group.patientName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">
                            {group.patientName}
                          </h3>
                          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {group.totalInvoices} {group.totalInvoices === 1 ? 'Invoice' : 'Invoices'} ({group.totalInvoices} {group.totalInvoices === 1 ? 'Visit' : 'Visits'})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                          <span className="font-semibold text-emerald-700">{group.patientPhone}</span>
                          <span>•</span>
                          <span>Doctor: {group.doctorName}</span>
                          {group.patientAge && <span>• Age: {group.patientAge} Yrs</span>}
                        </div>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-200 text-xs">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Billed</span>
                        <span className="font-extrabold text-slate-900 text-sm">BDT {group.totalBilled.toLocaleString()}</span>
                      </div>
                      <div className="text-right pl-3 border-l border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Paid / Advance</span>
                        <span className="font-bold text-emerald-700">BDT {group.totalPaid.toLocaleString()}</span>
                      </div>
                      <div className="text-right pl-3 border-l border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Due</span>
                        <span className="font-bold text-rose-600">BDT {group.totalDue.toLocaleString()}</span>
                      </div>

                      {/* Expand / Details Actions */}
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={() => setSelectedPatientModal(group)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                          title="View Complete Printable History Report"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span className="hidden sm:inline">Full Details</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateNewQuotationForPatient(group);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                          title="Create New Quotation for this patient"
                        >
                          <FilePlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">New Quotation</span>
                        </button>

                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePatientGroup(group);
                            }}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition flex items-center justify-center cursor-pointer shrink-0"
                            title="Delete Entire Patient History (System Admin Only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => toggleExpand(group.patientKey)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition border border-emerald-200 cursor-pointer"
                          title={isExpanded ? "Collapse Details" : "Expand Details"}
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Expanded Visit Invoices List */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-white p-4 sm:p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          Patient Visit & Invoice Timeline ({group.totalInvoices} Records)
                        </h4>
                        <span className="text-xs text-slate-400">Oldest to Newest recorded</span>
                      </div>

                      <div className="space-y-3">
                        {group.quotations.map((q) => {
                          const rateInfo = getQuotationDailyRateBreakdown(q);
                          const editState = paymentEditState[q.id];
                          const inputPaid = editState?.paidAmount ?? (q.advancePaid || 0);
                          const currentPaidNum = typeof inputPaid === 'number' ? inputPaid : 0;
                          const currentDue = Math.max(0, q.grandTotal - currentPaidNum);
                          const currentStatus = editState?.paymentStatus ?? (q.paymentStatus || (currentPaidNum >= q.grandTotal ? 'Fully Paid' : currentPaidNum > 0 ? 'Partial Paid' : 'Quotation'));
                          const isSaved = editState?.justSaved;

                          let defaultDays: number = rateInfo.baseDays;
                          if (currentPaidNum >= q.grandTotal) {
                            defaultDays = rateInfo.baseDays;
                          } else if (currentPaidNum > 0 && rateInfo.totalDaily > 0) {
                            defaultDays = Math.min(rateInfo.baseDays, Math.max(1, Math.floor(currentPaidNum / rateInfo.totalDaily)));
                          }
                          const inputDays = editState?.days !== undefined ? editState.days : defaultDays;

                          return (
                            <div 
                              key={q.id}
                              className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 hover:border-emerald-300 transition"
                            >
                              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="bg-emerald-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-md shadow-xs">
                                      {q.visitLabel}
                                    </span>
                                    <span className="font-bold text-slate-800 text-xs">{q.quotationNumber}</span>
                                    <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-slate-400" /> {q.createdDate}
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                      currentStatus === 'Fully Paid'
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : currentStatus === 'Partial Paid'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}>
                                      {currentStatus}
                                    </span>
                                  </div>

                                  <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-700">Services: </span>
                                    {[
                                      q.treatments && q.treatments.length > 0 ? `${q.treatments.length} Therapies` : null,
                                      q.outdoorPackages && q.outdoorPackages.length > 0 ? `${q.outdoorPackages.length} Packages` : null,
                                      q.indoorServices && q.indoorServices.length > 0 ? `${q.indoorServices.length} Cabin/Room` : null,
                                    ].filter(Boolean).join(' • ') || 'Consultation'}
                                  </p>
                                </div>

                                <div className="text-right">
                                  <p className="font-black text-slate-900 text-sm">BDT {q.grandTotal.toLocaleString()}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">
                                    Paid: <span className="font-bold text-emerald-700">BDT {currentPaidNum.toLocaleString()}</span> | Due: <span className="font-bold text-rose-600">BDT {currentDue.toLocaleString()}</span>
                                  </p>
                                </div>
                              </div>

                              {/* Billing Adjustment Row (Restricted to Admin & Billing Counter) */}
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                {canManageBilling ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {/* Days Input */}
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                                      <span className="text-[10px] font-black text-slate-600 uppercase">Day:</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={inputDays}
                                        placeholder="Days"
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                          handleDaysInputChange(q, val);
                                        }}
                                        className="w-12 px-1 text-center font-bold text-slate-900 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 text-xs"
                                        title="Enter days to auto-calculate treatment cost for those days"
                                      />
                                      <span className="text-[10px] font-bold text-emerald-700">
                                        (= BDT {Math.min(q.grandTotal, Math.round(rateInfo.totalDaily * (typeof inputDays === 'number' ? inputDays : 1))).toLocaleString()})
                                      </span>
                                    </div>

                                    {/* Paid Input */}
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                                      <span className="text-[10px] font-black text-slate-600 uppercase">Paid:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max={q.grandTotal * 2}
                                        value={inputPaid}
                                        placeholder="Paid BDT"
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                          handlePaidAmountInputChange(q, val);
                                        }}
                                        className="w-20 px-1 text-right font-bold text-emerald-800 bg-white border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-500 text-xs"
                                        title="Enter payment received amount in BDT"
                                      />
                                      <span className="text-[10px] font-bold text-slate-500">BDT</span>
                                    </div>

                                    {/* Status Select */}
                                    <select
                                      value={currentStatus}
                                      onChange={(e) => handleStatusSelectChange(q, e.target.value as any)}
                                      className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-300 bg-white cursor-pointer"
                                    >
                                      <option value="Quotation">Quotation</option>
                                      <option value="Partial Paid">Partial Paid</option>
                                      <option value="Fully Paid">Fully Paid</option>
                                    </select>

                                    {/* Save / Update Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleSaveInvoicePayment(q)}
                                      className={`px-3 py-1 rounded-lg font-bold text-xs transition shadow-xs flex items-center gap-1 cursor-pointer ${
                                        isSaved
                                          ? 'bg-emerald-700 text-white'
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      }`}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{isSaved ? 'Saved!' : 'Update'}</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-700">Payment Status:</span>
                                    <span className={`font-bold px-2 py-0.5 rounded-md border ${
                                      q.paymentStatus === 'Fully Paid'
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : q.paymentStatus === 'Partial Paid'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}>
                                      {q.paymentStatus || 'Quotation'}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 ml-auto">
                                  <button
                                    onClick={() => onViewPrintQuotation(q)}
                                    className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-1 rounded-lg shadow-xs transition cursor-pointer shrink-0"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Print</span>
                                  </button>

                                  {isAdmin && (
                                    <button
                                      onClick={() => handleDeleteSingleQuotation(q)}
                                      className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg transition cursor-pointer shrink-0"
                                      title="Delete Invoice (System Admin Only)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: FLAT ALL INVOICES LIST */}
      {viewMode === 'flat_list' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {selectedQuotationIds.length > 0 && isAdmin && (
            <div className="bg-rose-50 border-b border-rose-200 p-3 px-4 flex items-center justify-between animate-in fade-in duration-150">
              <span className="text-xs font-extrabold text-rose-900">
                {selectedQuotationIds.length} quotation invoice record(s) selected
              </span>
              <button
                onClick={handleDeleteSelectedQuotations}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedQuotationIds.length})</span>
              </button>
            </div>
          )}

          {filteredFlatQuotations.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-700">No Quotations Found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-xs uppercase">
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredFlatQuotations.length > 0 && selectedQuotationIds.length === filteredFlatQuotations.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuotationIds(filteredFlatQuotations.map(q => q.id));
                          } else {
                            setSelectedQuotationIds([]);
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        title="Select All"
                      />
                    </th>
                    <th className="p-3.5">Visit Order</th>
                    <th className="p-3.5">Quotation #</th>
                    <th className="p-3.5">Patient Name & Mobile</th>
                    <th className="p-3.5">Created Date</th>
                    <th className="p-3.5">Grand Total</th>
                    <th className="p-3.5">Paid / Due</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFlatQuotations.map((q) => {
                    const isSelected = selectedQuotationIds.includes(q.id);
                    return (
                      <tr key={q.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-emerald-50/40' : ''}`}>
                        <td className="p-3.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedQuotationIds(prev =>
                                prev.includes(q.id) ? prev.filter(id => id !== q.id) : [...prev, q.id]
                              );
                            }}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                          />
                        </td>
                        <td className="p-3.5">
                          <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">
                            {q.visitLabel}
                          </span>
                        </td>

                      <td className="p-3.5 font-bold text-emerald-900">
                        {q.quotationNumber}
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{q.patientName}</div>
                        <div className="text-xs font-semibold text-emerald-700">{q.patientPhone}</div>
                      </td>

                      <td className="p-3.5 text-xs text-slate-600">
                        <div className="font-medium">{q.createdDate}</div>
                        <div className="text-[11px] text-slate-400">Valid: {q.validUntil}</div>
                      </td>

                      <td className="p-3.5 font-black text-slate-900 text-sm">
                        BDT {q.grandTotal.toLocaleString()}
                      </td>

                      <td className="p-3.5 text-xs">
                        <div className="text-emerald-700 font-medium">Paid: BDT {q.advancePaid.toLocaleString()}</div>
                        <div className="text-rose-600 font-bold">Due: BDT {q.dueAmount.toLocaleString()}</div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          q.paymentStatus === 'Fully Paid' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : q.paymentStatus === 'Partial Paid'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {q.paymentStatus}
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => onViewPrintQuotation(q)}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print Invoice</span>
                          </button>

                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSingleQuotation(q)}
                              className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs p-1.5 sm:px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                              title="Delete Invoice (System Admin Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FULL PATIENT HISTORY DETAIL MODAL */}
      {selectedPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
              <div>
                <span className="text-emerald-400 font-extrabold text-xs uppercase tracking-wider block">
                  Complete Patient Medical & Billing History Report
                </span>
                <h3 className="text-2xl font-black mt-0.5 flex items-center gap-2">
                  <span>{selectedPatientModal.patientName}</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    {selectedPatientModal.totalInvoices} Visits Record
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Mobile: {selectedPatientModal.patientPhone} • Doctor: {selectedPatientModal.doctorName}
                </p>
              </div>

              <button
                onClick={() => setSelectedPatientModal(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Financial Lifetime Summary Box */}
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 grid grid-cols-3 gap-4 text-center">
                <div>
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Lifetime Total Billed</span>
                  <p className="text-xl font-black text-emerald-950 mt-0.5">BDT {selectedPatientModal.totalBilled.toLocaleString()}</p>
                </div>
                <div className="border-x border-emerald-200">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Total Paid</span>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">BDT {selectedPatientModal.totalPaid.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider block">Total Due Amount</span>
                  <p className="text-xl font-black text-rose-600 mt-0.5">BDT {selectedPatientModal.totalDue.toLocaleString()}</p>
                </div>
              </div>

              {/* Sequential Visits Timeline */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Sequential Invoices Breakdown ({selectedPatientModal.totalInvoices} Invoices)</span>
                </h4>

                {selectedPatientModal.quotations.map((q) => (
                  <div key={q.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-600 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-lg">
                          {q.visitLabel}
                        </span>
                        <span className="font-black text-slate-900 text-sm">{q.quotationNumber}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        Date: <span className="font-bold text-slate-800">{q.createdDate}</span> (Valid: {q.validUntil})
                      </div>
                    </div>

                    {/* Breakdown of items */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {/* Individual Treatments */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="font-bold text-emerald-800 block mb-1">Individual Treatments:</span>
                        {q.treatments && q.treatments.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-slate-600">
                            {q.treatments.map((t, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-1 group">
                                <span className="truncate">• {t.treatmentName} ({t.sessions} sessions) - BDT {t.totalCost.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyText(t.treatmentName, `modal-tr-${q.id}-${idx}`);
                                  }}
                                  title="Copy treatment name"
                                  className="print:hidden text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                                >
                                  {copiedKey === `modal-tr-${q.id}-${idx}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>

                      {/* Outdoor Packages */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="font-bold text-emerald-800 block mb-1">Outdoor Packages:</span>
                        {q.outdoorPackages && q.outdoorPackages.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-slate-600">
                            {q.outdoorPackages.map((pkg, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-1 group">
                                <span className="truncate">• {pkg.packageName} - BDT {pkg.netCost.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyText(pkg.packageName, `modal-pkg-${q.id}-${idx}`);
                                  }}
                                  title="Copy package name"
                                  className="print:hidden text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                                >
                                  {copiedKey === `modal-pkg-${q.id}-${idx}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>

                      {/* Indoor Services */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="font-bold text-emerald-800 block mb-1">Indoor Room Accommodation:</span>
                        {q.indoorServices && q.indoorServices.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-slate-600">
                            {q.indoorServices.map((room, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-1 group">
                                <span className="truncate">• {room.roomType} ({room.days} days) - BDT {room.totalAmount.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyText(room.roomType, `modal-room-${q.id}-${idx}`);
                                  }}
                                  title="Copy room name"
                                  className="print:hidden text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                                >
                                  {copiedKey === `modal-room-${q.id}-${idx}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </div>

                    {/* Billing Counter Payment Entry & Status Update Bar (Restricted to Admin & Billing Counter) */}
                    {(() => {
                      const rateInfo = getQuotationDailyRateBreakdown(q);
                      const editState = paymentEditState[q.id];
                      const inputPaid = editState?.paidAmount ?? (q.advancePaid || 0);
                      const currentPaidNum = typeof inputPaid === 'number' ? inputPaid : 0;
                      const currentDue = Math.max(0, q.grandTotal - currentPaidNum);
                      const currentStatus = editState?.paymentStatus ?? (q.paymentStatus || (currentPaidNum >= q.grandTotal ? 'Fully Paid' : currentPaidNum > 0 ? 'Partial Paid' : 'Quotation'));
                      const isSaved = editState?.justSaved;

                      let defaultDays: number = rateInfo.baseDays;
                      if (currentPaidNum >= q.grandTotal) {
                        defaultDays = rateInfo.baseDays;
                      } else if (currentPaidNum > 0 && rateInfo.totalDaily > 0) {
                        defaultDays = Math.min(rateInfo.baseDays, Math.max(1, Math.floor(currentPaidNum / rateInfo.totalDaily)));
                      }
                      const inputDays = editState?.days !== undefined ? editState.days : defaultDays;

                      if (!canManageBilling) {
                        // Read-only View for Doctors, Call Center, etc.
                        return (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 mt-3 shadow-2xs">
                            <div className="text-xs flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-900">Grand Total: BDT {q.grandTotal.toLocaleString()}</span>
                              <span className="text-slate-300">•</span>
                              <span className="font-bold text-emerald-800">
                                Paid: BDT {q.advancePaid.toLocaleString()}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className={`font-bold ${q.dueAmount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                Due: BDT {q.dueAmount.toLocaleString()}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                q.paymentStatus === 'Fully Paid'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : q.paymentStatus === 'Partial Paid'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}>
                                {q.paymentStatus || 'Quotation'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedPatientModal(null);
                                  onViewPrintQuotation(q);
                                }}
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print Invoice</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Interactive Billing Management View for Admin & Billing Counter
                      return (
                        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2.5 mt-3 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            
                            {/* Financial Summary & Dynamic Due Calculation */}
                            <div className="text-xs flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-900">Grand Total: BDT {q.grandTotal.toLocaleString()}</span>
                              <span className="text-slate-300">•</span>
                              <span className="font-bold text-emerald-800">
                                Paid: BDT {currentPaidNum.toLocaleString()}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className={`font-bold ${currentDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                Due: BDT {currentDue.toLocaleString()}
                              </span>
                              <span className="text-slate-300 hidden sm:inline">•</span>
                              <span className="text-[10.5px] text-slate-600 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                Day Rate: ~BDT {rateInfo.totalDaily.toLocaleString()}/day
                              </span>
                            </div>

                            {/* Status Pill Selector */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-extrabold text-slate-500 uppercase">Paid Status:</span>
                              <select
                                value={currentStatus}
                                onChange={(e) => handleStatusSelectChange(q, e.target.value as any)}
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs cursor-pointer ${
                                  currentStatus === 'Fully Paid'
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : currentStatus === 'Partial Paid'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                <option value="Quotation">Quotation (Unpaid)</option>
                                <option value="Partial Paid">Partial Paid</option>
                                <option value="Fully Paid">Fully Paid</option>
                              </select>
                            </div>
                          </div>

                          {/* Interactive Input Controls: Days + Paid Amount + Quick Shortcuts + Save Button + Print Button */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-emerald-100">
                            <div className="flex flex-wrap items-center gap-2">
                              
                              {/* Day Input with Treatment Auto-Count */}
                              <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-1 rounded-xl shadow-2xs">
                                <span className="text-[11px] font-black text-slate-600 uppercase">Day:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={inputDays}
                                  placeholder="Days"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                    handleDaysInputChange(q, val);
                                  }}
                                  className="w-13 px-1.5 py-0.5 text-center text-xs font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  title="Enter days to auto-calculate treatment cost for those days"
                                />
                                <span className="text-[10px] font-bold text-emerald-700">
                                  (= BDT {Math.min(q.grandTotal, Math.round(rateInfo.totalDaily * (typeof inputDays === 'number' ? inputDays : 1))).toLocaleString()})
                                </span>
                              </div>

                              {/* Paid Payment Input */}
                              <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-1 rounded-xl shadow-2xs">
                                <span className="text-[11px] font-black text-slate-600 uppercase">Paid:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={q.grandTotal * 2}
                                  value={inputPaid}
                                  placeholder="Paid BDT"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                    handlePaidAmountInputChange(q, val);
                                  }}
                                  className="w-24 px-2 py-0.5 text-right text-xs font-black text-emerald-800 bg-emerald-50/50 border border-emerald-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  title="Enter payment received amount in BDT"
                                />
                                <span className="text-[10px] font-extrabold text-slate-500">BDT</span>
                              </div>

                              {/* Quick Shortcuts */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handlePaidAmountInputChange(q, q.grandTotal)}
                                  className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-lg border border-emerald-300 shadow-2xs transition cursor-pointer"
                                  title="Mark as Full Paid"
                                >
                                  Full Pay
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePaidAmountInputChange(q, 0)}
                                  className="px-1.5 py-1 bg-white hover:bg-slate-100 text-slate-600 font-bold text-[10px] rounded-lg border border-slate-300 shadow-2xs transition cursor-pointer"
                                  title="Reset paid to 0"
                                >
                                  Reset 0
                                </button>
                              </div>

                              {/* Save & Update Status Button */}
                              <button
                                type="button"
                                onClick={() => handleSaveInvoicePayment(q)}
                                className={`px-3.5 py-1 rounded-xl font-black text-xs transition shadow-xs flex items-center gap-1 cursor-pointer ${
                                  isSaved
                                    ? 'bg-emerald-700 text-white animate-in zoom-in-95'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                }`}
                                title="Save payment and update paid status"
                              >
                                {isSaved ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Updated!</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Update Status</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Actions: Print Invoice & Delete */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setSelectedPatientModal(null);
                                  onViewPrintQuotation(q);
                                }}
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print Invoice</span>
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteSingleQuotation(q)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition cursor-pointer"
                                  title="Delete Invoice (System Admin Only)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                ))}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => handleDeletePatientGroup(selectedPatientModal)}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition flex items-center justify-center cursor-pointer"
                    title="Delete Entire Patient History"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    const modal = selectedPatientModal;
                    setSelectedPatientModal(null);
                    handleCreateNewQuotationForPatient(modal);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="Create New Quotation for this patient"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>New Quotation</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedPatientModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Report
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION POPUP WARNING MODAL */}
      {deleteWarningModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-rose-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-600 to-red-700 text-white p-4 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  <AlertTriangle className="w-6 h-6 text-amber-200" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">{deleteWarningModal.title}</h3>
                  <p className="text-xs text-rose-100 font-medium">{deleteWarningModal.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteWarningModal(null)}
                className="p-1 rounded-lg hover:bg-white/20 transition text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 text-rose-900">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-extrabold uppercase tracking-wider text-rose-700">Permanent Deletion Warning</p>
                  <p className="text-rose-800 leading-relaxed font-medium">{deleteWarningModal.warningText}</p>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">Admin Permission Authorized:</span> <span className="font-semibold text-slate-900">{currentUser?.name || 'System Admin'}</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteWarningModal(null)}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndExecuteDeletion}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm & Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
