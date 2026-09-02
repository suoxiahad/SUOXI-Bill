import React, { useState, useEffect, useMemo } from 'react';
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
  FileX
} from 'lucide-react';
import { Patient, InvoiceQuotation } from '../types';
import { parseExcelAppointmentFile, downloadSampleExcelTemplate, ParsedExcelPatient } from '../utils/excelHelper';
import { importPatientsFromExcelApi, deletePatientsApi } from '../utils/storage';
import { matchPatient, matchSearchQuery } from '../utils/searchHelper';

interface AppointmentImporterProps {
  patients: Patient[];
  quotations?: InvoiceQuotation[];
  onRefreshPatients: () => void;
  onSelectPatientForQuotation: (patient: Patient) => void;
  onOpenAddPatient: () => void;
}

export const AppointmentImporter: React.FC<AppointmentImporterProps> = ({
  patients,
  quotations = [],
  onRefreshPatients,
  onSelectPatientForQuotation,
  onOpenAddPatient
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'no-quotation'>('all');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedExcelPatient[]>([]);
  const [filterText, setFilterText] = useState('');
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

  // Compute counts for the tabs
  const noQuotationCountTotal = useMemo(() => {
    return patients.filter(isPatientWithoutQuotation).length;
  }, [patients, patientsWithQuotationsSet]);

  const filteredPatients = patients.filter(p => {
    if (activeSubTab === 'no-quotation') {
      if (!isPatientWithoutQuotation(p)) return false;
    }

    const matchesText = matchPatient(filterText, p);

    const matchesDate = 
      selectedDateFilter === 'all' || 
      !selectedDateFilter || 
      p.appointmentDate === selectedDateFilter;

    return matchesText && matchesDate;
  });

  const totalPatientsCount = filteredPatients.length;
  const totalPages = Math.max(1, Math.ceil(totalPatientsCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-6 print:hidden">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-800 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-800/80 text-emerald-200 text-xs px-3 py-1 rounded-full font-bold border border-emerald-700/60 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Call Center Daily Intake • Excel & CSV Appointment Importer</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Daily Appointment List & Excel Importer
            </h2>
            <p className="text-emerald-200/90 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Upload daily appointment Excel (.xlsx / .xls / .csv) files from Call Center or manually register patients to generate billing quotations instantly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadSampleExcelTemplate}
              className="flex items-center gap-2 bg-emerald-800/90 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-emerald-600/50 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Download Sample Excel</span>
            </button>

            <button
              onClick={onOpenAddPatient}
              className="flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Patient Entry</span>
            </button>
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
            Target Columns: Serial No., Patient Name, Age, Contact Number, Disease Name
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
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">Phone Number</th>
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
                      <td className="px-3 py-2">{p.gender}</td>
                      <td className="px-3 py-2">{p.age || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{p.phone}</td>
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
        
        {/* Sub-Tabs: All Patients vs No Quotation Created */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
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
              <span>All Registered Patients</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {patients.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('no-quotation')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'no-quotation'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50'
              }`}
            >
              <FileX className="w-3.5 h-3.5" />
              <span>No Quotation Created</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'no-quotation'
                  ? 'bg-amber-700 text-amber-100'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {noQuotationCountTotal}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {activeSubTab === 'no-quotation' ? (
              <span className="text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Unused appointment entries that have no financial/treatment quotation.</span>
              </span>
            ) : (
              <span>Select any patient below to generate quotation or manage records.</span>
            )}
          </div>
        </div>

        {/* Action Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span>
                {activeSubTab === 'no-quotation' ? 'Unused Appointments List' : 'Patient List'} ({filteredPatients.length} shown)
              </span>
              {selectedPatientIds.length > 0 && (
                <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {selectedPatientIds.length} Selected
                </span>
              )}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Quick Bulk Select Button for No Quotation Tab */}
            {activeSubTab === 'no-quotation' && filteredPatients.length > 0 && (
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
                    <span>Select All in this View ({filteredPatients.length})</span>
                  </>
                )}
              </button>
            )}

            {selectedPatientIds.length > 0 && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {activeSubTab === 'no-quotation' ? 'Clean / Delete Selected' : 'Delete Selected'} ({selectedPatientIds.length})
                </span>
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
              {selectedDateFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter('all')}
                  className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-md ml-1 transition"
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

        {/* Helpful Info Alert for No Quotation Tab */}
        {activeSubTab === 'no-quotation' && (
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Safe Database Clean-up:</strong> Only patients without any quotation are listed here. Deleting from this tab will keep all generated quotations and medical records 100% safe.
              </span>
            </div>
            {filteredPatients.length > 0 && selectedPatientIds.length === 0 && (
              <button
                type="button"
                onClick={() => setSelectedPatientIds(filteredPatients.map(p => p.id))}
                className="shrink-0 text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Select all {filteredPatients.length} to clean
              </button>
            )}
          </div>
        )}

        {filteredPatients.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-2">
            <p>
              {activeSubTab === 'no-quotation' 
                ? 'All patients in this view already have quotations created! No unused entries found.'
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
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
                    <th className="px-3 py-3 font-bold">SL No.</th>
                    <th className="px-3 py-3 font-bold">Appt Date</th>
                    <th className="px-4 py-3 font-bold">Patient Name</th>
                    <th className="px-4 py-3 font-bold">Phone Number</th>
                    <th className="px-3 py-3 font-bold">Gender / Age</th>
                    <th className="px-4 py-3 font-bold">Remark (Disease)</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPatients.map((p, idx) => {
                    const isSelected = selectedPatientIds.includes(p.id);
                    const phoneDuplicates = patients.filter(x => x.phone === p.phone && x.phone && x.phone !== '01700000000').length;
                    const itemDisplayIndex = startIndex + idx + 1;
                    return (
                      <tr key={p.id ? `${p.id}-${itemDisplayIndex}` : `pat-row-${itemDisplayIndex}`} className={`hover:bg-emerald-50/40 transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                        <td className="px-3 py-3.5 w-10 text-center">
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
                        <td className="px-3 py-3.5 font-mono text-slate-500 font-bold">
                          {p.serialNo || itemDisplayIndex}
                        </td>
                        <td className="px-3 py-3.5 font-medium text-emerald-800 whitespace-nowrap text-[11px]">
                          <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md font-semibold text-emerald-900">
                            {p.appointmentDate ? formatDateDisplay(p.appointmentDate) : 'Today'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-900">
                          {p.name}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.phone}</span>
                            {phoneDuplicates > 1 && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded-md border border-purple-200" title={`${phoneDuplicates} appointments registered under this mobile number`}>
                                {phoneDuplicates} Appts
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">
                          {p.gender || 'Male'} • {p.age ? `${p.age} Yrs` : 'N/A'}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                          {p.remark || p.notes || 'General Assessment'}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                            p.status === 'Quotation Created' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => onSelectPatientForQuotation(p)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer flex items-center gap-1 ml-auto whitespace-nowrap"
                          >
                            <span>Create Quotation</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
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
