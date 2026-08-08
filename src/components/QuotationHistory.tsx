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
  ShieldAlert
} from 'lucide-react';
import { InvoiceQuotation, User } from '../types';

interface QuotationHistoryProps {
  quotations: InvoiceQuotation[];
  currentUser?: User | null;
  onViewPrintQuotation: (quotation: InvoiceQuotation) => void;
  onDeleteQuotations?: (ids: string[]) => void;
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

export const QuotationHistory: React.FC<QuotationHistoryProps> = ({
  quotations,
  currentUser,
  onViewPrintQuotation,
  onDeleteQuotations
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'patient_grouped' | 'flat_list'>('patient_grouped');
  const [expandedPatientKey, setExpandedPatientKey] = useState<string | null>(null);
  const [selectedPatientModal, setSelectedPatientModal] = useState<PatientHistoryGroup | null>(null);
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([]);
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

                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePatientGroup(group);
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                            title="Delete Entire Patient History (System Admin Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete History</span>
                          </button>
                        )}

                        <button
                          onClick={() => toggleExpand(group.patientKey)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition border border-emerald-200 cursor-pointer"
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
                        {group.quotations.map((q) => (
                          <div 
                            key={q.id}
                            className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-emerald-300 transition"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="bg-emerald-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-md shadow-xs">
                                  {q.visitLabel}
                                </span>
                                <span className="font-bold text-slate-800 text-xs">{q.quotationNumber}</span>
                                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" /> {q.createdDate}
                                </span>
                              </div>

                              <p className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">Services Included: </span>
                                {[
                                  q.treatments && q.treatments.length > 0 ? `${q.treatments.length} Individual Therapies` : null,
                                  q.outdoorPackages && q.outdoorPackages.length > 0 ? `${q.outdoorPackages.length} Outdoor Packages` : null,
                                  q.indoorServices && q.indoorServices.length > 0 ? `${q.indoorServices.length} Indoor Room Cabin` : null,
                                ].filter(Boolean).join(' • ') || 'General Consultation'}
                              </p>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
                              <div className="text-right mr-2">
                                <p className="font-black text-slate-900 text-sm">BDT {q.grandTotal.toLocaleString()}</p>
                                <p className="text-[11px] text-emerald-700 font-medium">
                                  Paid: BDT {q.advancePaid.toLocaleString()} | <span className="text-rose-600 font-bold">Due: BDT {q.dueAmount.toLocaleString()}</span>
                                </p>
                              </div>

                              <button
                                onClick={() => onViewPrintQuotation(q)}
                                className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer shrink-0"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print Invoice</span>
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteSingleQuotation(q)}
                                  className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-2.5 py-1.5 rounded-lg transition cursor-pointer shrink-0"
                                  title="Delete Invoice (System Admin Only)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Delete</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
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
                              <li key={idx}>• {t.treatmentName} ({t.sessions} sessions) - BDT {t.totalCost.toLocaleString()}</li>
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
                              <li key={idx}>• {pkg.packageName} - BDT {pkg.netCost.toLocaleString()}</li>
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
                              <li key={idx}>• {room.roomType} ({room.days} days) - BDT {room.totalAmount.toLocaleString()}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </div>

                    {/* Totals & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="text-xs">
                        <span className="font-bold text-slate-800">Grand Total: BDT {q.grandTotal.toLocaleString()}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span className="text-emerald-700 font-bold">Paid: BDT {q.advancePaid.toLocaleString()}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span className="text-rose-600 font-bold">Due: BDT {q.dueAmount.toLocaleString()}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedPatientModal(null);
                            onViewPrintQuotation(q);
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print This Invoice</span>
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteSingleQuotation(q)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                            title="Delete Invoice (System Admin Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Invoice</span>
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
              {isAdmin ? (
                <button
                  onClick={() => handleDeletePatientGroup(selectedPatientModal)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Entire Patient History</span>
                </button>
              ) : (
                <div />
              )}

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
