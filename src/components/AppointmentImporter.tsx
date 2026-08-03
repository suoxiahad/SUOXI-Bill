import React, { useState } from 'react';
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
  Table
} from 'lucide-react';
import { Patient } from '../types';
import { parseExcelAppointmentFile, downloadSampleExcelTemplate, ParsedExcelPatient } from '../utils/excelHelper';
import { importPatientsFromExcelApi } from '../utils/storage';

interface AppointmentImporterProps {
  patients: Patient[];
  onRefreshPatients: () => void;
  onSelectPatientForQuotation: (patient: Patient) => void;
  onOpenAddPatient: () => void;
}

export const AppointmentImporter: React.FC<AppointmentImporterProps> = ({
  patients,
  onRefreshPatients,
  onSelectPatientForQuotation,
  onOpenAddPatient
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedExcelPatient[]>([]);
  const [filterText, setFilterText] = useState('');
  
  const [uploadMessage, setUploadMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const processFileDirectly = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setUploadMessage({
      type: 'info',
      text: `Reading & extracting patients from "${file.name}"...`
    });

    const result = await parseExcelAppointmentFile(file);

    if (result.success && result.data.length > 0) {
      setParsedPreview(result.data);
      setUploadMessage({
        type: 'success',
        text: `Extracted ${result.data.length} patient records from ${file.name}. Review the preview below and click "Confirm & Import to Database".`
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
        processFileDirectly(file);
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
      await processFileDirectly(selectedFile);
    }
  };

  const handleSaveParsedRecords = async () => {
    if (parsedPreview.length === 0) return;

    setIsProcessing(true);
    const summary = await importPatientsFromExcelApi(parsedPreview);
    onRefreshPatients();

    setUploadMessage({
      type: 'success',
      text: `Successfully imported ${summary.added} new patients and updated ${summary.updated} existing records into the database.`
    });

    setParsedPreview([]);
    setSelectedFile(null);
    setIsProcessing(false);
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(filterText.toLowerCase()) ||
    p.phone.includes(filterText) ||
    (p.notes && p.notes.toLowerCase().includes(filterText.toLowerCase())) ||
    (p.remark && p.remark.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
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
              {selectedFile ? selectedFile.name : 'Click or Drag Excel (.xlsx / .xls / .csv) File Here'}
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
              <span>{isProcessing ? 'Processing File...' : 'Extract Patients from File'}</span>
            </button>
          )}
        </div>

        {/* Parsed Excel Preview Table */}
        {parsedPreview.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs text-emerald-800 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Preview Extracted Records ({parsedPreview.length} Patients)
              </h4>
              <button
                onClick={handleSaveParsedRecords}
                disabled={isProcessing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
              >
                Confirm & Import to Database
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">SL No.</th>
                    <th className="px-3 py-2">Patient Name</th>
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">Phone Number</th>
                    <th className="px-3 py-2">Remark (Disease / Condition)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {parsedPreview.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold text-slate-600">{p.serialNo || idx + 1}</td>
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
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              <span>Registered Patients ({patients.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500">Select any patient below to open the Quotation Builder</p>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search by name, phone, or disease..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No registered patients found. Upload an appointment sheet or click "New Patient Entry".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-bold">SL No.</th>
                  <th className="px-4 py-3 font-bold">Patient Name</th>
                  <th className="px-4 py-3 font-bold">Phone</th>
                  <th className="px-4 py-3 font-bold">Gender / Age</th>
                  <th className="px-4 py-3 font-bold">Remark (Disease)</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.map((p, idx) => (
                  <tr key={p.id ? `${p.id}-${idx}` : `pat-row-${idx}`} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-500 font-bold">
                      {p.serialNo || idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-700">
                      {p.phone}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {p.gender || 'Male'} • {p.age ? `${p.age} Yrs` : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                      {p.remark || p.notes || 'General Assessment'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        p.status === 'Quotation Created' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => onSelectPatientForQuotation(p)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer flex items-center gap-1 ml-auto"
                      >
                        <span>Create Quotation</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
