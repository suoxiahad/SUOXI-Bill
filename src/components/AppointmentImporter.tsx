import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  UserPlus, 
  Search, 
  ArrowRight, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Activity,
  Sparkles,
  FileCheck,
  Table,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  CheckSquare,
  Square,
  ShieldCheck,
  FileX,
  Stethoscope,
  Undo2
} from 'lucide-react';
import { Patient, InvoiceQuotation, User as UserModel } from '../types';
import { parseExcelAppointmentFile, downloadSampleExcelTemplate, ParsedExcelPatient } from '../utils/excelHelper';
import { importPatientsFromExcelApi, deletePatientsApi, confirmPatientApi, confirmBatchPatientsApi } from '../utils/storage';
import { matchPatient, matchSearchQuery } from '../utils/searchHelper';

interface AppointmentImporterProps {
  patients: Patient[];
  quotations?: InvoiceQuotation[];
  onRefreshPatients: () => void;
  onUpdatePatient?: (patient: Patient) => void;
  onSelectPatientForQuotation: (patient: Patient) => void;
  onOpenAddPatient?: () => void;
  onGoToConsultation?: () => void;
  currentUser?: UserModel | null;
}

export const AppointmentImporter: React.FC<AppointmentImporterProps> = ({
  patients,
  quotations = [],
  onRefreshPatients,
  onUpdatePatient,
  onSelectPatientForQuotation,
  onOpenAddPatient,
  onGoToConsultation,
  currentUser
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayStr);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'confirmed'>('all');
  const [isConfirmingId, setIsConfirmingId] = useState<string | null>(null);
  const [patientToUndo, setPatientToUndo] = useState<Patient | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedExcelPatient[]>([]);
  const [filterText, setFilterText] = useState('');
  const deferredFilterText = useDeferredValue(filterText);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [selectedPreviewIndexes, setSelectedPreviewIndexes] = useState<number[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination state for high-volume patient lists (2000+ records)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page to 1 whenever search query, sub-tab or date filter changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedPatientIds([]);
  }, [filterText, selectedDateFilter, activeSubTab]);

  const handleConfirmPatient = (p: Patient) => {
    // 1. Instant optimistic update in 1ms
    const targetDate = p.appointmentDate || selectedDate || new Date().toISOString().split('T')[0];
    const sameDateSerials = patients
      .filter(x => x.appointmentDate === targetDate && typeof x.consultationSerial === 'number')
      .map(x => x.consultationSerial!);
    const optimisticSerial = sameDateSerials.length > 0 ? Math.max(...sameDateSerials) + 1 : 1;

    const optimisticPatient: Patient = {
      ...p,
      isConfirmed: true,
      confirmedAt: new Date().toISOString(),
      consultationSerial: optimisticSerial,
      consultationStatus: 'Pre Consultation',
      status: 'Pre Consultation'
    };

    if (onUpdatePatient) {
      onUpdatePatient(optimisticPatient);
    }

    setUploadMessage({
      type: 'success',
      text: `✓ ${p.name} confirmed for Pre Consultation (Serial #${optimisticSerial}).`
    });
    setTimeout(() => setUploadMessage(null), 3500);

    // 2. Silent background update
    confirmPatientApi(p.id, true).then(res => {
      if (res.patient && onUpdatePatient) {
        onUpdatePatient(res.patient);
      }
    }).catch(err => {
      console.error('Failed to confirm patient in background:', err);
      if (onUpdatePatient) {
        onUpdatePatient(p); // rollback on error
      }
      setUploadMessage({
        type: 'error',
        text: `Failed to confirm patient: ${err?.message || 'Error occurred'}`
      });
    });
  };

  const handleUnconfirmPatient = (p: Patient) => {
    // 1. Instant optimistic update in 1ms
    const revertedPatient: Patient = {
      ...p,
      isConfirmed: false,
      confirmedAt: '',
      consultationSerial: null,
      consultationStatus: undefined,
      status: 'Pending Counseling'
    };

    if (onUpdatePatient) {
      onUpdatePatient(revertedPatient);
    }

    setUploadMessage({
      type: 'info',
      text: `${p.name} removed from Pre Consultation and reverted to unconfirmed.`
    });
    setTimeout(() => setUploadMessage(null), 3000);

    // 2. Silent background update
    confirmPatientApi(p.id, false).then(res => {
      if (res.patient && onUpdatePatient) {
        onUpdatePatient(res.patient);
      }
    }).catch(err => {
      console.error('Failed to revert patient in background:', err);
      if (onUpdatePatient) {
        onUpdatePatient(p); // rollback on error
      }
      setUploadMessage({
        type: 'error',
        text: `Failed to revert: ${err?.message || 'Error occurred'}`
      });
    });
  };

  const handleBulkConfirmPatients = async () => {
    if (selectedPatientIds.length === 0) return;
    setIsDeleting(true);
    try {
      await confirmBatchPatientsApi(selectedPatientIds);
      setUploadMessage({
        type: 'success',
        text: `✓ Successfully confirmed ${selectedPatientIds.length} patient(s) in sequential order for Pre Consultation.`
      });
      setSelectedPatientIds([]);
      onRefreshPatients();
      setTimeout(() => setUploadMessage(null), 4000);
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: `Failed to bulk confirm: ${err?.message || 'Error occurred'}`
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedPatientIds.length === 0) return;
    setIsDeleting(true);
    try {
      await deletePatientsApi(selectedPatientIds);
      setUploadMessage({
        type: 'success',
        text: `Successfully deleted ${selectedPatientIds.length} patient(s).`
      });
      setSelectedPatientIds([]);
      setIsDeleteModalOpen(false);
      onRefreshPatients();
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: `Failed to delete patients: ${err?.message || 'Unknown error'}`
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const [uploadMessage, setUploadMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const processFileDirectly = async (file: File, targetDate: string = selectedDate) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setUploadMessage({
      type: 'info',
      text: `Reading & extracting patients from "${file.name}" for Appointment Date: ${targetDate}...`
    });

    const result = await parseExcelAppointmentFile(file);

    if (result.success && result.data.length > 0) {
      const recordsWithDate = result.data.map(p => ({
        ...p,
        appointmentDate: targetDate
      }));
      setParsedPreview(recordsWithDate);
      setSelectedPreviewIndexes(recordsWithDate.map((_, idx) => idx));
      setUploadMessage({
        type: 'info',
        text: `Extracted ${result.data.length} appointment records from "${file.name}" for Appointment Date: ${formatDateDisplay(targetDate)}. Please review the preview table below and click "Confirm & Import to Database" to save.`
      });
    } else {
      setParsedPreview([]);
      setUploadMessage({
        type: 'error',
        text: result.error || 'Failed to parse records from the file. Please download the sample Excel template for the required column format.'
      });
    }
    setIsProcessing(false);
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    if (parsedPreview.length > 0) {
      setParsedPreview(prev => prev.map(p => ({ ...p, appointmentDate: newDate })));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();
      if (
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.csv') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('excel') ||
        file.type.includes('csv')
      ) {
        processFileDirectly(file, selectedDate);
      } else {
        setUploadMessage({
          type: 'error',
          text: 'Please select a valid Excel (.xlsx, .xls, .csv) file.'
        });
      }
    }
  };

  const handleProcessFile = async () => {
    if (selectedFile) {
      await processFileDirectly(selectedFile, selectedDate);
    }
  };

  const handleCancelPreview = () => {
    setParsedPreview([]);
    setSelectedPreviewIndexes([]);
    setSelectedFile(null);
    setUploadMessage({
      type: 'info',
      text: 'Import preview cleared.'
    });
  };

  const handleSaveParsedRecords = async () => {
    if (parsedPreview.length === 0) return;

    const selectedRecords = parsedPreview.filter((_, idx) => selectedPreviewIndexes.includes(idx));
    if (selectedRecords.length === 0) {
      setUploadMessage({
        type: 'error',
        text: 'No patient records selected from preview to import. Please check at least one record.'
      });
      return;
    }

    setIsProcessing(true);
    setUploadMessage({
      type: 'info',
      text: `Directly writing ${selectedRecords.length} appointment records for date ${formatDateDisplay(selectedDate)} to database... (0/${selectedRecords.length})`
    });

    try {
      const recordsToSave = selectedRecords.map(p => ({
        ...p,
        appointmentDate: selectedDate
      }));

      const summary = await importPatientsFromExcelApi(recordsToSave, (processed, total) => {
        setUploadMessage({
          type: 'info',
          text: `Writing to database: ${processed} of ${total} records confirmed...`
        });
      });
      onRefreshPatients();

      setUploadMessage({
        type: 'success',
        text: `Successfully imported ${summary.added + summary.updated} appointment records directly into database for date (${formatDateDisplay(selectedDate)})! All connected doctors can now search them instantly.`
      });

      // Clear preview after saving to prevent accidental re-imports
      setParsedPreview([]);
      setSelectedPreviewIndexes([]);
      setSelectedFile(null);
    } catch (err: any) {
      console.error('Import error:', err);
      setUploadMessage({
        type: 'error',
        text: err?.message || 'Failed to import records to database. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const [year, month, day] = dateStr.split('-');
      if (year && month && day) {
        const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
        return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Create a fast lookup set of patient IDs and phone numbers that already have quotations
  const patientsWithQuotationsSet = useMemo(() => {
    const idSet = new Set<string>();
    const phoneSet = new Set<string>();
    quotations.forEach(q => {
      if (q.patientId) idSet.add(q.patientId);
      if (q.patientPhone) phoneSet.add(String(q.patientPhone).trim().replace(/\D/g, ''));
    });
    return { idSet, phoneSet };
  }, [quotations]);

  const isPatientWithoutQuotation = (p: Patient) => {
    if (p.status === 'Quotation Created' || p.status === 'Treatment Ongoing' || p.status === 'Completed') {
      return false;
    }
    if (patientsWithQuotationsSet.idSet.has(p.id)) return false;
    const cleanP = String(p.phone || '').trim().replace(/\D/g, '');
    if (cleanP && cleanP.length >= 7 && patientsWithQuotationsSet.phoneSet.has(cleanP)) return false;
    return true;
  };

  const getPatientDate = (p: Patient) => p.appointmentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');

  // Compute counts for the tabs respecting the selected date filter (or all if 'all' is selected)
  const isDateFiltering = selectedDateFilter !== 'all' && !!selectedDateFilter;

  const totalAppointmentsCount = useMemo(() => {
    if (isDateFiltering) {
      return patients.filter(p => getPatientDate(p) === selectedDateFilter).length;
    }
    return patients.length;
  }, [patients, isDateFiltering, selectedDateFilter]);

  const confirmedCountTotal = useMemo(() => {
    if (isDateFiltering) {
      return patients.filter(p => !!p.isConfirmed && getPatientDate(p) === selectedDateFilter).length;
    }
    return patients.filter(p => !!p.isConfirmed).length;
  }, [patients, isDateFiltering, selectedDateFilter]);

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (activeSubTab === 'confirmed') {
        if (!p.isConfirmed) return false;
      }

      const matchesText = matchPatient(deferredFilterText, p);

      const matchesDate = 
        selectedDateFilter === 'all' || 
        !selectedDateFilter || 
        getPatientDate(p) === selectedDateFilter;

      return matchesText && matchesDate;
    });
  }, [patients, activeSubTab, deferredFilterText, selectedDateFilter]);

  const totalPatientsCount = filteredPatients.length;
  const totalPages = Math.max(1, Math.ceil(totalPatientsCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, startIndex, pageSize]);

  return (
    <div className="space-y-6 print:hidden">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-800 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-800/80 text-emerald-200 text-xs px-3 py-1 rounded-full font-bold border border-emerald-700/60 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Call Center Daily Intake • Appointments Import</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Appointments Import & Excel Intake
            </h2>
            <p className="text-emerald-200/90 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Upload daily appointment Excel (.xlsx / .xls / .csv) files from Call Center to register patients and populate the Consultation desk queue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onGoToConsultation && (
              <button
                onClick={onGoToConsultation}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg transition cursor-pointer"
                title="View Patient List in Consultation Desk"
              >
                <Stethoscope className="w-4 h-4" />
                <span>Go to Consultation Tab</span>
              </button>
            )}

            <button
              onClick={downloadSampleExcelTemplate}
              className="flex items-center gap-2 bg-emerald-800/90 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-emerald-600/50 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Download Sample Excel</span>
            </button>

            {currentUser?.role !== 'Doctor' && onOpenAddPatient && (
              <button
                onClick={onOpenAddPatient}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-emerald-500/50 shadow transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>New Patient Entry</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Excel Upload Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Table className="w-4 h-4 text-emerald-600" />
            <span>Upload Daily Appointment Excel Sheet</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">
            Target Columns: Serial No., Patient Name, Age, Contact Number, Address, Disease Name
          </span>
        </div>

        {/* Appointment Sheet Date Selector */}
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <label htmlFor="import-date-picker" className="block text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                <span>Select Appointment Date:</span>
              </label>
              <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                Uploaded appointment sheet will be saved under: <span className="font-bold underline text-emerald-900">{formatDateDisplay(selectedDate)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              id="import-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleDateChange(todayStr)}
              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer shrink-0"
            >
              Today
            </button>
          </div>
        </div>

        {uploadMessage && (
          <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
            uploadMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
            uploadMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {uploadMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
            {uploadMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {uploadMessage.type === 'info' && <Activity className="w-4 h-4 text-blue-600 animate-spin shrink-0" />}
            <span className="font-medium">{uploadMessage.text}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <label className="w-full sm:flex-1 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 rounded-2xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5">
            <Upload className="w-6 h-6 text-emerald-600" />
            <span className="text-xs font-semibold text-slate-800">
              {selectedFile ? selectedFile.name : `Click or Drag Excel File for Date: ${formatDateDisplay(selectedDate)}`}
            </span>
            <span className="text-[11px] text-slate-500">Supported formats: .xlsx, .xls, .csv</span>
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleFileChange}
              className="hidden" 
            />
          </label>

          {selectedFile && (
            <button
              onClick={handleProcessFile}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl shadow transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isProcessing ? 'Processing File...' : `Extract Patients for ${formatDateDisplay(selectedDate)}`}</span>
            </button>
          )}
        </div>

        {/* Parsed Excel Preview Table */}
        {parsedPreview.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 text-xs text-emerald-800 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Preview Extracted Records ({selectedPreviewIndexes.length} of {parsedPreview.length} selected for Date: {formatDateDisplay(selectedDate)})
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelPreview}
                  disabled={isProcessing}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancel / Clear Preview
                </button>
                <button
                  onClick={handleSaveParsedRecords}
                  disabled={isProcessing || selectedPreviewIndexes.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isProcessing ? 'Importing...' : `Confirm & Import Selected (${selectedPreviewIndexes.length})`}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={parsedPreview.length > 0 && selectedPreviewIndexes.length === parsedPreview.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPreviewIndexes(parsedPreview.map((_, idx) => idx));
                          } else {
                            setSelectedPreviewIndexes([]);
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        title="Select All"
                      />
                    </th>
                    <th className="px-3 py-2">SL No.</th>
                    <th className="px-3 py-2">Appt Date</th>
                    <th className="px-3 py-2">Patient Name</th>
                    <th className="px-3 py-2">Phone Number</th>
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Remark (Disease / Condition)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {parsedPreview.map((p, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 ${selectedPreviewIndexes.includes(idx) ? 'bg-emerald-50/30' : ''}`}>
                      <td className="px-3 py-2 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedPreviewIndexes.includes(idx)}
                          onChange={() => {
                            setSelectedPreviewIndexes(prev =>
                              prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                            );
                          }}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-600">{p.serialNo || idx + 1}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-800 whitespace-nowrap">
                        {formatDateDisplay(p.appointmentDate || selectedDate)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{p.phone}</td>
                      <td className="px-3 py-2">{p.gender}</td>
                      <td className="px-3 py-2">{p.age || '—'}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={p.address || ''}>
                        {p.address || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{p.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Patient Database List */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        
        {/* Sub-Tabs: All Appointments & Confirmed */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
            <button
              type="button"
              onClick={() => setActiveSubTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>All Appointments</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {totalAppointmentsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('confirmed')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'confirmed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Confirmed</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'confirmed' ? 'bg-emerald-700 text-emerald-100' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {confirmedCountTotal}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {activeSubTab === 'confirmed' ? (
              <span className="text-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Confirmed patients transferred to the Pre Consultation queue in sequential serial.</span>
              </span>
            ) : (
              <span className="text-slate-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>All imported appointments. Click <strong>Confirm</strong> to assign sequential Pre Consultation serial.</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span>Patient List ({filteredPatients.length} shown)</span>
              {selectedPatientIds.length > 0 && (
                <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {selectedPatientIds.length} Selected
                </span>
              )}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Quick Bulk Select Button */}
            {filteredPatients.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (selectedPatientIds.length === filteredPatients.length) {
                    setSelectedPatientIds([]);
                  } else {
                    setSelectedPatientIds(filteredPatients.map(p => p.id));
                  }
                }}
                className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                {selectedPatientIds.length === filteredPatients.length ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Select All ({filteredPatients.length})</span>
                  </>
                )}
              </button>
            )}

            {/* Bulk Confirm Button */}
            {selectedPatientIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkConfirmPatients}
                disabled={isDeleting}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                title="Confirm all selected patients in sequential order for Pre Consultation"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Confirm Selected ({selectedPatientIds.length})</span>
              </button>
            )}

            {/* Bulk Delete Button */}
            {selectedPatientIds.length > 0 && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedPatientIds.length})</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[11px] text-slate-600 font-semibold hidden sm:inline">Date:</span>
              <input
                type="date"
                value={selectedDateFilter === 'all' ? '' : selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value || 'all')}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              />
              {selectedDateFilter !== todayStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter(todayStr)}
                  className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-md ml-1 transition cursor-pointer"
                >
                  Today
                </button>
              )}
              {selectedDateFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter('all')}
                  className="text-[10px] font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 px-2 py-0.5 rounded-md ml-1 transition cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>

            <div className="relative flex-1 sm:w-60">
              <input
                type="text"
                placeholder="Search by name, phone..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-2">
            <p>
              {activeSubTab === 'confirmed'
                ? 'No confirmed patients found for the selected date or search filter.'
                : 'No registered patients found for the selected date or search filter.'}
            </p>
            {selectedDateFilter !== 'all' && (
              <button
                onClick={() => setSelectedDateFilter('all')}
                className="text-emerald-700 font-bold underline hover:text-emerald-800"
              >
                Clear Date Filter to View All Records
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredPatients.length > 0 && filteredPatients.every(p => selectedPatientIds.includes(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPatientIds(filteredPatients.map(p => p.id));
                          } else {
                            setSelectedPatientIds([]);
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        title="Select All"
                      />
                    </th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">SL No.</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Appt Date</th>
                    <th className="px-3.5 py-3 font-semibold whitespace-nowrap">Patient Name</th>
                    <th className="px-3.5 py-3 font-semibold whitespace-nowrap">Phone Number</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Gender / Age</th>
                    <th className="px-3.5 py-3 font-semibold whitespace-nowrap">Address</th>
                    <th className="px-3.5 py-3 font-semibold whitespace-nowrap">Remark (Disease)</th>
                    <th className="px-3.5 py-3 font-semibold text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPatients.map((p, idx) => {
                    const isSelected = selectedPatientIds.includes(p.id);
                    const phoneDuplicates = patients.filter(x => x.phone === p.phone && x.phone && x.phone !== '01700000000').length;
                    const itemDisplayIndex = startIndex + idx + 1;
                    return (
                      <tr key={p.id ? `${p.id}-${itemDisplayIndex}` : `pat-row-${itemDisplayIndex}`} className={`hover:bg-emerald-50/40 transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                        <td className="px-3 py-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedPatientIds(prev => 
                                prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                              );
                            }}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-800 font-medium whitespace-nowrap text-sm">
                          {p.serialNo || itemDisplayIndex}
                        </td>
                        <td className="px-3 py-3 font-medium text-emerald-900 whitespace-nowrap text-sm">
                          <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-md font-semibold text-emerald-950 text-xs">
                            {p.appointmentDate ? formatDateDisplay(p.appointmentDate) : 'Today'}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 font-normal text-slate-800 text-sm whitespace-nowrap">
                          {p.name}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-slate-800 font-normal text-sm whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.phone}</span>
                            {phoneDuplicates > 1 && (
                              <span className="px-1.5 py-0.2 bg-purple-100 text-purple-900 text-[11px] font-normal rounded border border-purple-200" title={`${phoneDuplicates} appointments registered under this mobile number`}>
                                {phoneDuplicates} Appts
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap font-normal text-sm">
                          {p.gender || 'Male'} • {p.age ? `${p.age} Yrs` : 'N/A'}
                        </td>
                        <td className="px-3.5 py-3 text-slate-600 text-sm max-w-[180px] truncate font-normal" title={p.address || ''}>
                          {p.address || '—'}
                        </td>
                        <td className="px-3.5 py-3 text-slate-700 text-sm max-w-xs font-normal truncate">
                          {p.remark || p.notes || 'General Assessment'}
                        </td>
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          {!p.isConfirmed ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmPatient(p)}
                              disabled={isConfirmingId === p.id}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2 ml-auto disabled:opacity-50"
                              title="Confirm appointment and assign sequential Pre Consultation serial"
                            >
                              {isConfirmingId === p.id ? (
                                <Activity className="w-4 h-4 animate-spin text-white" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-emerald-200" />
                              )}
                              <span>Confirm</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPatientToUndo(p)}
                              disabled={isConfirmingId === p.id}
                              className="px-4 py-2 bg-emerald-50 hover:bg-rose-50 text-emerald-800 hover:text-rose-700 border border-emerald-300 hover:border-rose-300 font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 ml-auto disabled:opacity-50 group"
                              title="Click to Undo confirmation"
                            >
                              {isConfirmingId === p.id ? (
                                <Activity className="w-4 h-4 animate-spin text-emerald-700" />
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4 text-emerald-600 group-hover:hidden" />
                                  <Undo2 className="w-4 h-4 text-rose-600 hidden group-hover:inline" />
                                </>
                              )}
                              <span className="group-hover:hidden">Confirmed #{p.consultationSerial || 1}</span>
                              <span className="hidden group-hover:inline text-rose-700">Undo #{p.consultationSerial || 1}?</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 font-medium">
                <span>
                  Showing <strong className="text-slate-900">{totalPatientsCount > 0 ? startIndex + 1 : 0}</strong> - <strong className="text-slate-900">{Math.min(startIndex + pageSize, totalPatientsCount)}</strong> of <strong className="text-slate-900">{totalPatientsCount}</strong> patients
                </span>
                <div className="flex items-center gap-1.5 border-l border-slate-300 pl-3">
                  <span className="text-[11px] text-slate-500">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 rounded-lg text-xs">
                    Page {safeCurrentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
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

      {/* Undo Patient Confirmation Warning Modal */}
      {patientToUndo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  Undo Patient Confirmation?
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Are you sure you want to undo this patient's confirmation?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Patient:</span>
                <strong className="text-slate-900">{patientToUndo.name}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Current Status:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Confirmed #{patientToUndo.consultationSerial || 1}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Phone:</span>
                <span className="font-mono text-slate-800">{patientToUndo.phone}</span>
              </div>
              <p className="text-[11px] text-amber-800 pt-1.5 border-t border-amber-200/60 leading-relaxed">
                Clicking <strong>Yes</strong> will remove the patient from the <strong>Pre Consultation</strong> list and return them to the unconfirmed list.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isConfirmingId === patientToUndo.id}
                onClick={() => setPatientToUndo(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirmingId === patientToUndo.id}
                onClick={async () => {
                  const target = patientToUndo;
                  setPatientToUndo(null);
                  if (target) {
                    await handleUnconfirmPatient(target);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isConfirmingId === patientToUndo.id ? (
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Undo2 className="w-3.5 h-3.5" />
                )}
                <span>Yes, Undo Confirmation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  Confirm Patient Deletion
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Are you sure you want to delete <span className="font-bold text-rose-600 underline">{selectedPatientIds.length}</span> selected patient(s)? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="bg-rose-50/60 p-3.5 rounded-xl border border-rose-100 text-xs text-rose-800 space-y-1">
              <p className="font-bold">Total Selected: {selectedPatientIds.length} Patient(s)</p>
              <p className="text-[11px] text-rose-600">The selected patient records will be permanently removed from the hospital system database.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
