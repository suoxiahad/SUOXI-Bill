import React, { useState, useMemo } from 'react';
import { 
  Patient, 
  InvoiceQuotation, 
  User as UserModel 
} from '../types';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  UserCheck, 
  Stethoscope, 
  FlaskConical, 
  Leaf, 
  Apple, 
  Calendar, 
  Download, 
  Printer, 
  Briefcase, 
  MessageSquare, 
  CheckCircle2, 
  Search, 
  Activity,
  Clock
} from 'lucide-react';

interface ReportingDashboardProps {
  patients: Patient[];
  quotations: InvoiceQuotation[];
  currentUser: UserModel | null;
  onSelectPatient?: (patient: Patient) => void;
}

type DatePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'all' | 'custom';
type DashboardTab = 'all' | 'funnel' | 'doctors' | 'departments' | 'professions' | 'comments';

export const ReportingDashboard: React.FC<ReportingDashboardProps> = ({
  patients,
  currentUser
}) => {
  // Current date helpers
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Default date preset is "today"
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<DashboardTab>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Detailed Activity Log sub-tabs: exactly 2 tabs: 'confirmed' & 'pending'
  const [patientLogTab, setPatientLogTab] = useState<'confirmed' | 'pending'>('confirmed');

  // Extract all distinct doctors from patient records
  const allDoctors = useMemo(() => {
    const docs = new Set<string>();
    patients.forEach(p => {
      if (p.doctorName && p.doctorName.trim()) docs.add(p.doctorName.trim());
      if (p.preDoctorName && p.preDoctorName.trim()) docs.add(p.preDoctorName.trim());
      if (p.postDoctorName && p.postDoctorName.trim()) docs.add(p.postDoctorName.trim());
    });
    return Array.from(docs).sort();
  }, [patients]);

  // Filter patients based on Date range and Doctor
  const filteredPatients = useMemo(() => {
    let result = [...patients];

    // 1. Date Range Filtering
    if (datePreset === 'today') {
      result = result.filter(p => p.appointmentDate === todayStr);
    } else if (datePreset === 'yesterday') {
      result = result.filter(p => p.appointmentDate === yesterdayStr);
    } else if (datePreset === 'last7') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const minDate = sevenDaysAgo.toISOString().split('T')[0];
      result = result.filter(p => p.appointmentDate && p.appointmentDate >= minDate && p.appointmentDate <= todayStr);
    } else if (datePreset === 'thisMonth') {
      const currentYearMonth = todayStr.substring(0, 7); // YYYY-MM
      result = result.filter(p => p.appointmentDate && p.appointmentDate.startsWith(currentYearMonth));
    } else if (datePreset === 'custom') {
      result = result.filter(p => {
        if (!p.appointmentDate) return false;
        return p.appointmentDate >= customStartDate && p.appointmentDate <= customEndDate;
      });
    }

    // 2. Doctor Filter
    if (selectedDoctorFilter !== 'all') {
      result = result.filter(p => 
        p.doctorName === selectedDoctorFilter ||
        p.preDoctorName === selectedDoctorFilter ||
        p.postDoctorName === selectedDoctorFilter
      );
    }

    // 3. Search query filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.profession?.toLowerCase().includes(q) ||
        p.consultationComment?.toLowerCase().includes(q) ||
        p.remark?.toLowerCase().includes(q) ||
        String(p.consultationSerial || '').includes(q)
      );
    }

    return result;
  }, [patients, datePreset, todayStr, yesterdayStr, customStartDate, customEndDate, selectedDoctorFilter, searchTerm]);

  // ==========================================
  // 1. APPOINTMENT & FUNNEL METRICS
  // ==========================================
  const funnelMetrics = useMemo(() => {
    const totalAppointments = filteredPatients.length;

    // Confirmed Patients
    const confirmedPatients = filteredPatients.filter(p => 
      Boolean(p.isConfirmed) || 
      typeof p.consultationSerial === 'number' || 
      Boolean(p.confirmedAt)
    );
    const confirmedCount = confirmedPatients.length;
    const unconfirmedCount = totalAppointments - confirmedCount;
    const confirmRate = totalAppointments > 0 ? ((confirmedCount / totalAppointments) * 100).toFixed(1) : '0';

    // On Hold Patients
    const onHoldPatients = filteredPatients.filter(p => Boolean(p.isOnHold));
    const onHoldCount = onHoldPatients.length;

    // Pre Consultation Patients
    const preConsultationPatients = filteredPatients.filter(p => 
      p.status === 'Pre Consultation' || 
      p.consultationStatus === 'Pre Consultation' || 
      p.status === 'Post Consultation' ||
      Boolean(p.preDoctorName) ||
      Boolean(p.preConsultationAt)
    );
    const preConsultationCount = preConsultationPatients.length;
    const preRate = confirmedCount > 0 ? ((preConsultationCount / confirmedCount) * 100).toFixed(1) : '0';

    // Post Consultation Patients
    const postConsultationPatients = filteredPatients.filter(p => 
      p.status === 'Post Consultation' || 
      p.consultationStatus === 'Post Consultation' || 
      Boolean(p.postConsultationConfirmed) ||
      Boolean(p.postDoctorName)
    );
    const postConsultationCount = postConsultationPatients.length;
    const postRate = preConsultationCount > 0 ? ((postConsultationCount / preConsultationCount) * 100).toFixed(1) : '0';

    return {
      totalAppointments,
      confirmedCount,
      unconfirmedCount,
      confirmRate,
      onHoldCount,
      preConsultationCount,
      preRate,
      postConsultationCount,
      postRate,
      postConsultationPatients
    };
  }, [filteredPatients]);

  // ==========================================
  // 2. DEPARTMENT CLEARANCE METRICS (Pathology, Organic, Nutrition)
  // ==========================================
  const departmentMetrics = useMemo(() => {
    const postPatients = funnelMetrics.postConsultationPatients;
    const totalPost = postPatients.length;

    // Pathology
    const pathYes = postPatients.filter(p => p.pathologyStatus === 'Yes').length;
    const pathNo = postPatients.filter(p => p.pathologyStatus === 'No').length;
    const pathPending = totalPost - pathYes - pathNo;
    const pathRate = totalPost > 0 ? ((pathYes / totalPost) * 100).toFixed(1) : '0';

    // Organic
    const orgYes = postPatients.filter(p => p.organicStatus === 'Yes').length;
    const orgNo = postPatients.filter(p => p.organicStatus === 'No').length;
    const orgPending = totalPost - orgYes - orgNo;
    const orgRate = totalPost > 0 ? ((orgYes / totalPost) * 100).toFixed(1) : '0';

    // Nutrition
    const nutYes = postPatients.filter(p => p.nutritionStatus === 'Yes').length;
    const nutNo = postPatients.filter(p => p.nutritionStatus === 'No').length;
    const nutPending = totalPost - nutYes - nutNo;
    const nutRate = totalPost > 0 ? ((nutYes / totalPost) * 100).toFixed(1) : '0';

    return {
      totalPost,
      pathYes,
      pathNo,
      pathPending,
      pathRate,
      orgYes,
      orgNo,
      orgPending,
      orgRate,
      nutYes,
      nutNo,
      nutPending,
      nutRate
    };
  }, [funnelMetrics.postConsultationPatients]);

  // ==========================================
  // 3. DOCTOR-WISE PERFORMANCE METRICS
  // ==========================================
  const doctorMetrics = useMemo(() => {
    const map = new Map<string, {
      doctorName: string;
      totalConsulted: number;
      preCount: number;
      postCount: number;
    }>();

    const getDocEntry = (name: string) => {
      const clean = name.trim();
      if (!map.has(clean)) {
        map.set(clean, {
          doctorName: clean,
          totalConsulted: 0,
          preCount: 0,
          postCount: 0
        });
      }
      return map.get(clean)!;
    };

    filteredPatients.forEach(p => {
      const isPre = (
        p.status === 'Pre Consultation' || 
        p.consultationStatus === 'Pre Consultation' || 
        p.status === 'Post Consultation' ||
        p.consultationStatus === 'Post Consultation' ||
        Boolean(p.preDoctorName) ||
        Boolean(p.preConsultationAt)
      );

      const isPost = (
        p.status === 'Post Consultation' || 
        p.consultationStatus === 'Post Consultation' || 
        Boolean(p.postConsultationConfirmed) ||
        Boolean(p.postDoctorName) ||
        Boolean(p.postConsultationAt)
      );

      if (isPre) {
        const preDoc = p.preDoctorName || p.doctorName || 'Doctor Not Assigned';
        getDocEntry(preDoc).preCount += 1;
      }

      if (isPost) {
        const postDoc = p.postDoctorName || p.doctorName || 'Doctor Not Assigned';
        getDocEntry(postDoc).postCount += 1;
      }

      // If doctor is assigned on appointment
      if (!isPre && !isPost && p.doctorName) {
        getDocEntry(p.doctorName);
      }
    });

    map.forEach(item => {
      item.totalConsulted = item.preCount + item.postCount;
    });

    const preList = Array.from(map.values())
      .filter(d => d.preCount > 0)
      .sort((a, b) => b.preCount - a.preCount);

    const postList = Array.from(map.values())
      .filter(d => d.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount);

    const allList = Array.from(map.values())
      .filter(d => d.totalConsulted > 0 || d.preCount > 0 || d.postCount > 0)
      .sort((a, b) => b.totalConsulted - a.totalConsulted);

    const maxPre = preList.length > 0 ? Math.max(...preList.map(d => d.preCount)) : 1;
    const maxPost = postList.length > 0 ? Math.max(...postList.map(d => d.postCount)) : 1;
    const maxConsulted = allList.length > 0 ? Math.max(...allList.map(d => d.totalConsulted)) : 1;

    const totalPre = preList.reduce((sum, d) => sum + d.preCount, 0);
    const totalPost = postList.reduce((sum, d) => sum + d.postCount, 0);
    const totalAll = allList.reduce((sum, d) => sum + d.totalConsulted, 0);

    return {
      allList,
      preList,
      postList,
      maxConsulted,
      maxPre,
      maxPost,
      totalPre,
      totalPost,
      totalAll
    };
  }, [filteredPatients]);

  // Confirmed vs Pending Patient lists for Detailed Activity Log
  const confirmedPatients = useMemo(() => {
    return filteredPatients.filter(p => 
      Boolean(p.isConfirmed) || 
      typeof p.consultationSerial === 'number' || 
      Boolean(p.confirmedAt)
    );
  }, [filteredPatients]);

  const pendingPatients = useMemo(() => {
    return filteredPatients.filter(p => 
      !Boolean(p.isConfirmed) && 
      p.consultationSerial == null && 
      !Boolean(p.confirmedAt)
    );
  }, [filteredPatients]);

  const displayedPatients = useMemo(() => {
    if (patientLogTab === 'confirmed') return confirmedPatients;
    if (patientLogTab === 'pending') return pendingPatients;
    return filteredPatients;
  }, [patientLogTab, confirmedPatients, pendingPatients, filteredPatients]);

  // ==========================================
  // 4. PATIENT PROFESSION DEMOGRAPHICS (Post Consultation Only)
  // ==========================================
  const professionMetrics = useMemo(() => {
    const postPatients = funnelMetrics.postConsultationPatients;
    const map = new Map<string, number>();

    postPatients.forEach(p => {
      const raw = p.profession?.trim();
      const prof = raw && raw.length > 0 ? raw : 'Not Specified';
      map.set(prof, (map.get(prof) || 0) + 1);
    });

    const list = Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        count,
        percent: postPatients.length > 0 ? ((count / postPatients.length) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.count - a.count);

    const maxCount = list.length > 0 ? Math.max(...list.map(i => i.count)) : 1;

    return {
      list,
      maxCount,
      uniqueCount: list.length,
      totalCount: postPatients.length
    };
  }, [funnelMetrics.postConsultationPatients]);

  // ==========================================
  // 5. CONSULTATION COMMENTS / CLINICAL DECISIONS
  // ==========================================
  const commentMetrics = useMemo(() => {
    const map = new Map<string, number>();
    const patientComments: { patientName: string; serial: string | number; comment: string; doctor: string; date: string }[] = [];

    filteredPatients.forEach(p => {
      const c = p.consultationComment?.trim();
      if (c && c.length > 0) {
        map.set(c, (map.get(c) || 0) + 1);
        patientComments.push({
          patientName: p.name,
          serial: p.consultationSerial || p.serialNo || '-',
          comment: c,
          doctor: p.postDoctorName || p.doctorName || 'Doctor',
          date: p.appointmentDate || todayStr
        });
      }
    });

    const list = Array.from(map.entries())
      .map(([comment, count]) => ({
        comment,
        count,
        percent: patientComments.length > 0 ? ((count / patientComments.length) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.count - a.count);

    const maxCount = list.length > 0 ? Math.max(...list.map(i => i.count)) : 1;

    return {
      list,
      maxCount,
      patientComments,
      totalCommentedPatients: patientComments.length
    };
  }, [filteredPatients, todayStr]);

  // ==========================================
  // 6. GENDER & AGE DEMOGRAPHICS (Post Consultation Only)
  // ==========================================
  const demographicMetrics = useMemo(() => {
    const postPatients = funnelMetrics.postConsultationPatients;
    let male = 0;
    let female = 0;
    let other = 0;

    const ageGroups = {
      under20: 0,
      age20to35: 0,
      age36to50: 0,
      age51to65: 0,
      above65: 0,
      unknown: 0
    };

    postPatients.forEach(p => {
      const g = p.gender?.toLowerCase() || '';
      if (g.includes('female') || g === 'f') female++;
      else if (g.includes('male') || g === 'm') male++;
      else other++;

      const a = typeof p.age === 'number' ? p.age : parseInt(String(p.age || ''), 10);
      if (isNaN(a)) {
        ageGroups.unknown++;
      } else if (a < 20) {
        ageGroups.under20++;
      } else if (a <= 35) {
        ageGroups.age20to35++;
      } else if (a <= 50) {
        ageGroups.age36to50++;
      } else if (a <= 65) {
        ageGroups.age51to65++;
      } else {
        ageGroups.above65++;
      }
    });

    const total = postPatients.length;

    return {
      total,
      male,
      female,
      other,
      malePercent: total > 0 ? ((male / total) * 100).toFixed(1) : '0',
      femalePercent: total > 0 ? ((female / total) * 100).toFixed(1) : '0',
      otherPercent: total > 0 ? ((other / total) * 100).toFixed(1) : '0',
      ageGroups
    };
  }, [funnelMetrics.postConsultationPatients]);

  // Export full report summary to CSV
  const handleExportCSV = () => {
    if (filteredPatients.length === 0) {
      alert('No patient data to export for the selected filter.');
      return;
    }

    const headers = [
      'Serial / Token',
      'Patient Name',
      'Phone Number',
      'Age',
      'Gender',
      'Profession',
      'Appointment Date',
      'Is Confirmed',
      'Doctor Name',
      'Pre Consultation',
      'Post Consultation',
      'Consultation Decision / Comment',
      'Pathology Test Done',
      'Organic Product Bought',
      'Nutrition Advice Taken',
      'Remark / Notes'
    ];

    const rows = filteredPatients.map(p => {
      const isConfirmed = Boolean(p.isConfirmed || p.consultationSerial) ? 'Yes' : 'No';
      const isPre = (p.status === 'Pre Consultation' || p.preConsultationAt) ? 'Yes' : 'No';
      const isPost = (p.status === 'Post Consultation' || p.postConsultationConfirmed) ? 'Yes' : 'No';

      return [
        `"${p.consultationSerial || p.serialNo || ''}"`,
        `"${p.name || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.age || ''}"`,
        `"${p.gender || ''}"`,
        `"${(p.profession || '').replace(/"/g, '""')}"`,
        `"${p.appointmentDate || ''}"`,
        `"${isConfirmed}"`,
        `"${p.postDoctorName || p.doctorName || ''}"`,
        `"${isPre}"`,
        `"${isPost}"`,
        `"${(p.consultationComment || '').replace(/"/g, '""')}"`,
        `"${p.pathologyStatus || 'Pending'}"`,
        `"${p.organicStatus || 'Pending'}"`,
        `"${p.nutritionStatus || 'Pending'}"`,
        `"${(p.remark || p.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SUOXI_Hospital_Report_${datePreset}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0">

      {/* Top Header & Filter Control Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 print:hidden">
        
        {/* Title & Quick Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Hospital Reporting & Analytics
                </h1>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full border border-emerald-200">
                  {filteredPatients.length} Records
                </span>
                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full">
                  User: {currentUser?.name || currentUser?.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Appointments, Doctor Performance, Department Clearance, Demographics & Clinical Insights
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-300 transition cursor-pointer shadow-sm"
              title="Download full CSV report"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-indigo-200 transition cursor-pointer shadow-sm"
              title="Print executive summary"
            >
              <Printer className="w-4 h-4 text-indigo-600" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Date Presets, Custom Range, and Doctor Selector */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Date Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Range:
            </span>
            <button
              onClick={() => setDatePreset('today')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => setDatePreset('yesterday')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'yesterday'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Yesterday
            </button>

            <button
              onClick={() => setDatePreset('last7')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'last7'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Last 7 Days
            </button>

            <button
              onClick={() => setDatePreset('thisMonth')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'thisMonth'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              This Month
            </button>

            <button
              onClick={() => setDatePreset('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'all'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Time ({patients.length})
            </button>

            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                datePreset === 'custom'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Doctor Filter & Search */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 p-1 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold"
                />
              </div>
            )}

            {/* Doctor Select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-500">Doctor:</span>
              <select
                value={selectedDoctorFilter}
                onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">All Doctors ({allDoctors.length})</option>
                {allDoctors.map(doc => (
                  <option key={doc} value={doc}>{doc}</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search report..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36 sm:w-44"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Section Navigation Tabs */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Full Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('funnel')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'funnel'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Patient Funnel</span>
          </button>

          <button
            onClick={() => setActiveTab('doctors')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'doctors'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Doctor Insights</span>
          </button>

          <button
            onClick={() => setActiveTab('departments')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'departments'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Department Conversions</span>
          </button>

          <button
            onClick={() => setActiveTab('professions')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'professions'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Patient Profession ({professionMetrics.uniqueCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('comments')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Patient Comments</span>
          </button>
        </div>

      </div>

      {/* If Today has 0 records banner */}
      {filteredPatients.length === 0 && datePreset === 'today' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-amber-950">
                Default Range: Today ({todayStr}) — 0 Records Scheduled
              </p>
              <p className="text-amber-700 text-[11px] mt-0.5">
                No appointments are logged for today yet. You can click to view all hospital records or pick another date.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDatePreset('all')}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition cursor-pointer text-xs whitespace-nowrap shadow-sm shrink-0"
          >
            Switch to All Time ({patients.length} Records)
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* PATIENT CONSULTATION & SERVICE FUNNEL (Unified Executive Overview) */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'funnel') && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Patient Funnel
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
              End-to-End Patient Flow
            </span>
          </div>

          {/* Stepped Visual Funnel Diagram */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
            
            {/* Step 1: Booking / Total Appointments */}
            <div className="bg-slate-50 hover:bg-slate-100/80 rounded-xl p-4 sm:p-5 border border-slate-200 relative group transition flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Step 1: Booking
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
                  {funnelMetrics.totalAppointments}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Total Appointments</div>

                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div className="bg-slate-700 h-full w-full rounded-full"></div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-400">100% Base</span>
                <span className="font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Unconfirmed: {funnelMetrics.unconfirmedCount}
                </span>
              </div>
            </div>

            {/* Step 2: Confirmed with Serial */}
            <div className="bg-emerald-50/50 hover:bg-emerald-50/80 rounded-xl p-4 sm:p-5 border border-emerald-200 relative group transition flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">
                    Step 2: Serial Confirm
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-black text-emerald-800 mt-2">
                  {funnelMetrics.confirmedCount}
                </div>
                <div className="text-xs text-emerald-600 mt-0.5">Patients Confirmed</div>

                <div className="w-full bg-emerald-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, Number(funnelMetrics.confirmRate)))}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-emerald-200/80 flex items-center justify-between text-[11px]">
                <span className="text-emerald-700 font-bold">
                  {funnelMetrics.confirmRate}% Confirmed
                </span>
                {funnelMetrics.onHoldCount > 0 ? (
                  <span className="text-amber-700 font-bold bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200">
                    Hold: {funnelMetrics.onHoldCount}
                  </span>
                ) : (
                  <span className="text-emerald-600 font-semibold text-[10px]">
                    Assigned Serial
                  </span>
                )}
              </div>
            </div>

            {/* Step 3: Pre Consultation Done */}
            <div className="bg-purple-50/50 hover:bg-purple-50/80 rounded-xl p-4 sm:p-5 border border-purple-200 relative group transition flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider">
                    Step 3: Pre Consultation
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    <Stethoscope className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-black text-purple-900 mt-2">
                  {funnelMetrics.preConsultationCount}
                </div>
                <div className="text-xs text-purple-600 mt-0.5">Doctor Pre-Assessed</div>

                <div className="w-full bg-purple-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, Number(funnelMetrics.preRate)))}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-purple-200/80 flex items-center justify-between text-[11px]">
                <span className="text-purple-700 font-bold">
                  {funnelMetrics.preRate}% of Confirmed
                </span>
                <span className="text-purple-600 font-semibold text-[10px] bg-white px-2 py-0.5 rounded border border-purple-200">
                  Initial Checkup
                </span>
              </div>
            </div>

            {/* Step 4: Post Consultation Finalized */}
            <div className="bg-indigo-50/50 hover:bg-indigo-50/80 rounded-xl p-4 sm:p-5 border border-indigo-200 relative group transition flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider">
                    Step 4: Post Consultation
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-black text-indigo-900 mt-2">
                  {funnelMetrics.postConsultationCount}
                </div>
                <div className="text-xs text-indigo-600 mt-0.5">Prescription Finalized</div>

                <div className="w-full bg-indigo-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, Number(funnelMetrics.postRate)))}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-indigo-200/80 flex items-center justify-between text-[11px]">
                <span className="text-indigo-700 font-bold">
                  {funnelMetrics.postRate}% of Pre
                </span>
                <span className="text-indigo-600 font-semibold text-[10px] bg-white px-2 py-0.5 rounded border border-indigo-200">
                  Treatment Advice
                </span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. DEPARTMENT CLEARANCE METRICS & CHARTS (Pathology, Organic, Nutrition) */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'departments') && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Department Conversions
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Service status of {departmentMetrics.totalPost} Post Consultation Patients in Pathology, Organic & Nutrition
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                Total Post Patients: <strong>{departmentMetrics.totalPost}</strong>
              </span>
            </div>
          </div>

          {/* 3 Main Department Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Pathology Department Card */}
            <div className="bg-gradient-to-b from-purple-50/50 to-white rounded-xl p-5 border border-purple-200 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <FlaskConical className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-purple-950">1. Pathology Dept.</h3>
                    <p className="text-[11px] text-purple-700">Medical Lab Tests</p>
                  </div>
                </div>
                <span className="text-base font-black text-purple-900">
                  {departmentMetrics.pathRate}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.pathYes / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Yes: ${departmentMetrics.pathYes}`}
                  ></div>
                  <div 
                    className="bg-rose-400 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.pathNo / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`No: ${departmentMetrics.pathNo}`}
                  ></div>
                  <div 
                    className="bg-slate-300 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.pathPending / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Pending: ${departmentMetrics.pathPending}`}
                  ></div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] pt-1">
                  <div className="text-center p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
                    <span className="block font-black text-sm">{departmentMetrics.pathYes}</span>
                    <span className="text-[10px] font-semibold">Test Done (Yes)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-rose-50 text-rose-800">
                    <span className="block font-black text-sm">{departmentMetrics.pathNo}</span>
                    <span className="text-[10px] font-semibold">Declined (No)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-slate-50 text-slate-700">
                    <span className="block font-black text-sm">{departmentMetrics.pathPending}</span>
                    <span className="text-[10px] font-semibold">Pending</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Organic Products Card */}
            <div className="bg-gradient-to-b from-emerald-50/50 to-white rounded-xl p-5 border border-emerald-200 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Leaf className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-emerald-950">2. Organic Dept.</h3>
                    <p className="text-[11px] text-emerald-700">Product Purchases</p>
                  </div>
                </div>
                <span className="text-base font-black text-emerald-900">
                  {departmentMetrics.orgRate}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.orgYes / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Yes: ${departmentMetrics.orgYes}`}
                  ></div>
                  <div 
                    className="bg-rose-400 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.orgNo / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`No: ${departmentMetrics.orgNo}`}
                  ></div>
                  <div 
                    className="bg-slate-300 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.orgPending / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Pending: ${departmentMetrics.orgPending}`}
                  ></div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] pt-1">
                  <div className="text-center p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
                    <span className="block font-black text-sm">{departmentMetrics.orgYes}</span>
                    <span className="text-[10px] font-semibold">Bought (Yes)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-rose-50 text-rose-800">
                    <span className="block font-black text-sm">{departmentMetrics.orgNo}</span>
                    <span className="text-[10px] font-semibold">Declined (No)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-slate-50 text-slate-700">
                    <span className="block font-black text-sm">{departmentMetrics.orgPending}</span>
                    <span className="text-[10px] font-semibold">Pending</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nutrition Consultation Card */}
            <div className="bg-gradient-to-b from-amber-50/50 to-white rounded-xl p-5 border border-amber-200 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Apple className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-950">3. Nutrition Dept.</h3>
                    <p className="text-[11px] text-amber-700">Dietary Counseling</p>
                  </div>
                </div>
                <span className="text-base font-black text-amber-900">
                  {departmentMetrics.nutRate}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.nutYes / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Yes: ${departmentMetrics.nutYes}`}
                  ></div>
                  <div 
                    className="bg-rose-400 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.nutNo / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`No: ${departmentMetrics.nutNo}`}
                  ></div>
                  <div 
                    className="bg-slate-300 h-full transition-all duration-500" 
                    style={{ width: `${departmentMetrics.totalPost > 0 ? (departmentMetrics.nutPending / departmentMetrics.totalPost) * 100 : 0}%` }}
                    title={`Pending: ${departmentMetrics.nutPending}`}
                  ></div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] pt-1">
                  <div className="text-center p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
                    <span className="block font-black text-sm">{departmentMetrics.nutYes}</span>
                    <span className="text-[10px] font-semibold">Advised (Yes)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-rose-50 text-rose-800">
                    <span className="block font-black text-sm">{departmentMetrics.nutNo}</span>
                    <span className="text-[10px] font-semibold">Declined (No)</span>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-slate-50 text-slate-700">
                    <span className="block font-black text-sm">{departmentMetrics.nutPending}</span>
                    <span className="text-[10px] font-semibold">Pending</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. DOCTOR-WISE PERFORMANCE & VOLUME (Bar chart & table) */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'doctors') && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-blue-600" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Doctor Insights
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparison of patient volume, pre-consultation and post-consultation counts by doctor
              </p>
            </div>

            {/* Total Doctor count pill */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                Total Doctors: <strong>{doctorMetrics.allList.length}</strong>
              </span>
            </div>
          </div>

          {/* Visual Doctor Volume Comparison Bar Chart */}
          <div className="space-y-3 pt-2">
            {doctorMetrics.allList.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center">
                No doctor consultation records found for the selected period.
              </p>
            ) : (
              doctorMetrics.allList.map((doc, idx) => {
                const count = doc.totalConsulted;
                const percentOfMax = doctorMetrics.maxConsulted > 0 ? (count / doctorMetrics.maxConsulted) * 100 : 0;
                const percentOfTotal = doctorMetrics.totalAll > 0 ? ((count / doctorMetrics.totalAll) * 100).toFixed(1) : '0';

                return (
                  <div key={doc.doctorName} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 hover:border-slate-300 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 bg-slate-900">
                          {idx + 1}
                        </span>
                        <span className="font-extrabold text-slate-900 text-sm">{doc.doctorName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-100 text-blue-900 border border-blue-200">
                          {count} Consultation{count > 1 ? 's' : ''}
                        </span>
                        <span className="text-slate-500 font-semibold text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                          {percentOfTotal}% share
                        </span>
                      </div>
                    </div>

                    {/* Comparative Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, percentOfMax)}%` }}
                      ></div>
                    </div>

                    {/* Pre & Post Breakdown Pill Indicators: Pre and Post doctor counts */}
                    <div className="text-[11px] flex items-center gap-2 pt-1 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md font-semibold flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200">
                        <span>Pre Consultation:</span>
                        <strong className="font-bold text-purple-900">{doc.preCount}</strong>
                      </span>

                      <span className="px-2.5 py-0.5 rounded-md font-semibold flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <span>Post Consultation:</span>
                        <strong className="font-bold text-indigo-900">{doc.postCount}</strong>
                      </span>

                      <span className="px-2.5 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-semibold flex items-center gap-1.5">
                        <span>Total:</span>
                        <strong className="font-bold text-slate-900">{doc.totalConsulted}</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. PATIENT DEMOGRAPHICS & PROFESSIONS (Charts & List) */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'professions') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* Left 2 Cols: Profession Distribution Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Patient Profession
                  </h2>
                  <span className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Post Consultation Only
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Occupational breakdown of {professionMetrics.totalCount} Post Consultation patients
                </p>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                {professionMetrics.uniqueCount} Distinct Professions ({professionMetrics.totalCount} Patients)
              </span>
            </div>

            {/* Profession Horizontal Bar Charts */}
            <div className="space-y-2.5 pt-2 max-h-[420px] overflow-y-auto pr-2">
              {professionMetrics.list.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">No post consultation records available for the selected filter.</p>
              ) : (
                professionMetrics.list.map((item, idx) => {
                  const barWidth = (item.count / professionMetrics.maxCount) * 100;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="text-slate-400 font-mono text-[11px] w-4">{idx + 1}.</span>
                          <span>{item.name}</span>
                        </span>
                        <span className="font-extrabold text-slate-700">
                          {item.count} <span className="text-slate-400 font-normal">({item.percent}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(4, barWidth)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Col: Age & Gender Demographics */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Patient Gender & Age
                </h3>
                <span className="text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Post Consultation Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Demographic breakdown of {demographicMetrics.total} Post Consultation patients
              </p>
            </div>

            {/* Gender Ratio */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Gender Breakdown
              </span>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                <div 
                  className="bg-blue-500 h-full" 
                  style={{ width: `${demographicMetrics.malePercent}%` }}
                  title={`Male: ${demographicMetrics.male}`}
                ></div>
                <div 
                  className="bg-rose-500 h-full" 
                  style={{ width: `${demographicMetrics.femalePercent}%` }}
                  title={`Female: ${demographicMetrics.female}`}
                ></div>
                <div 
                  className="bg-amber-400 h-full" 
                  style={{ width: `${demographicMetrics.otherPercent}%` }}
                  title={`Other: ${demographicMetrics.other}`}
                ></div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="flex items-center gap-1.5 text-blue-700 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  Male: {demographicMetrics.male} ({demographicMetrics.malePercent}%)
                </span>
                <span className="flex items-center gap-1.5 text-rose-700 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  Female: {demographicMetrics.female} ({demographicMetrics.femalePercent}%)
                </span>
              </div>
            </div>

            {/* Age Group Distribution */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Age Distribution
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Under 20 yrs:</span>
                  <span className="font-bold text-slate-800">{demographicMetrics.ageGroups.under20}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">20 - 35 yrs:</span>
                  <span className="font-bold text-slate-800">{demographicMetrics.ageGroups.age20to35}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">36 - 50 yrs:</span>
                  <span className="font-bold text-slate-800">{demographicMetrics.ageGroups.age36to50}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">51 - 65 yrs:</span>
                  <span className="font-bold text-slate-800">{demographicMetrics.ageGroups.age51to65}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Above 65 yrs:</span>
                  <span className="font-bold text-slate-800">{demographicMetrics.ageGroups.above65}</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* 6. CLINICAL DECISIONS & COMMENTS ANALYSIS */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'comments') && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Patient Comments
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Frequency analysis of doctor comments, treatment directives, and therapy advice
              </p>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
              {commentMetrics.totalCommentedPatients} Patients with Comments
            </span>
          </div>

          {/* Comment frequency breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Top Common Comment / Treatment Categories */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Most Frequent Consultation Comments
              </h3>
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                {commentMetrics.list.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No comments recorded yet.</p>
                ) : (
                  commentMetrics.list.map((item, idx) => (
                    <div key={item.comment} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          {idx + 1}. {item.comment}
                        </span>
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {item.count} ({item.percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full rounded-full"
                          style={{ width: `${(item.count / commentMetrics.maxCount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Patient Comments Log */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Recent Patient Consultation Directives
              </h3>
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                {commentMetrics.patientComments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No recent comments.</p>
                ) : (
                  commentMetrics.patientComments.slice(0, 15).map((pc, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">
                          {pc.patientName} <span className="font-mono text-emerald-700 font-bold">({pc.serial})</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{pc.date}</span>
                      </div>
                      <div className="text-indigo-900 font-semibold bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100">
                        "{pc.comment}"
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Doctor: <span className="font-medium text-slate-700">{pc.doctor}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. FULL DATA SUMMARY TABLE (Detailed Records) */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm">
                Patient Activity Log ({patientLogTab === 'confirmed' ? confirmedPatients.length : pendingPatients.length} Records)
              </h3>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                patientLogTab === 'confirmed'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {patientLogTab === 'confirmed' ? 'Confirmed Patients' : 'Pending Patients'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {patientLogTab === 'confirmed' 
                ? 'Showing confirmed patients with assigned serial numbers and consultation progress'
                : 'Showing unconfirmed appointments awaiting serial number assignment and patient verification'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 2 Tabs: Confirmed & Pending */}
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setPatientLogTab('confirmed')}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  patientLogTab === 'confirmed'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Confirmed ({confirmedPatients.length})</span>
              </button>

              <button
                onClick={() => setPatientLogTab('pending')}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  patientLogTab === 'pending'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pending ({pendingPatients.length})</span>
              </button>
            </div>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer shadow-sm"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-3 text-center w-12">Serial</th>
                <th className="py-3 px-4 min-w-[180px]">Patient Name & Phone</th>
                <th className="py-3 px-3 min-w-[110px]">Profession</th>
                <th className="py-3 px-3 min-w-[130px]">Doctor</th>
                <th className="py-3 px-3 text-center min-w-[100px]">Pre Consult</th>
                <th className="py-3 px-3 text-center min-w-[100px]">Post Consult</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Pathology</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Organic</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Nutrition</th>
                <th className="py-3 px-4 min-w-[160px]">
                  {patientLogTab === 'confirmed' ? 'Doctor Decision / Comment' : 'Notes / Disease / Hold Reason'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedPatients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold">
                      {patientLogTab === 'confirmed' 
                        ? 'No confirmed patients found for the selected period.' 
                        : 'No pending patients found for the selected period.'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {patientLogTab === 'confirmed' && pendingPatients.length > 0 && (
                        <span>
                          There are <strong>{pendingPatients.length}</strong> pending appointments. Check the Pending tab.
                        </span>
                      )}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedPatients.slice(0, 100).map((p, idx) => {
                  const serialDisplay = p.consultationSerial 
                    ? `#${p.consultationSerial}` 
                    : (p.serialNo || (patientLogTab === 'pending' ? 'Pending' : `${idx + 1}`));
                  const isPre = (p.status === 'Pre Consultation' || p.preConsultationAt || p.preDoctorName);
                  const isPost = (p.status === 'Post Consultation' || p.postConsultationConfirmed || p.postDoctorName);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Serial */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 font-mono font-bold text-xs rounded-md ${
                          p.consultationSerial 
                            ? 'bg-slate-900 text-emerald-400' 
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}>
                          {serialDisplay}
                        </span>
                      </td>

                      {/* Name & Phone */}
                      <td className="py-2.5 px-4">
                        <div>
                          <p className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.isOnHold && (
                              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                                Hold
                              </span>
                            )}
                          </p>
                          <p className="font-mono text-emerald-700 text-[11px]">{p.phone}</p>
                        </div>
                      </td>

                      {/* Profession */}
                      <td className="py-2.5 px-3 text-slate-700">
                        {p.profession || <span className="text-slate-400 italic">None</span>}
                      </td>

                      {/* Doctor */}
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        {p.postDoctorName || p.preDoctorName || p.doctorName || <span className="text-slate-400 italic">Not Assigned</span>}
                      </td>

                      {/* Pre Consult */}
                      <td className="py-2.5 px-3 text-center">
                        {isPre ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px]">
                            Done
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pending</span>
                        )}
                      </td>

                      {/* Post Consult */}
                      <td className="py-2.5 px-3 text-center">
                        {isPost ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                            Done
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pending</span>
                        )}
                      </td>

                      {/* Pathology */}
                      <td className="py-2.5 px-3 text-center">
                        {p.pathologyStatus === 'Yes' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px]">
                            Yes
                          </span>
                        ) : p.pathologyStatus === 'No' ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[10px]">
                            No
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Organic */}
                      <td className="py-2.5 px-3 text-center">
                        {p.organicStatus === 'Yes' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px]">
                            Yes
                          </span>
                        ) : p.organicStatus === 'No' ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[10px]">
                            No
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Nutrition */}
                      <td className="py-2.5 px-3 text-center">
                        {p.nutritionStatus === 'Yes' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px]">
                            Yes
                          </span>
                        ) : p.nutritionStatus === 'No' ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[10px]">
                            No
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Doctor Decision / Comment / Notes */}
                      <td className="py-2.5 px-4 text-slate-700">
                        {p.consultationComment ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[11px] font-medium">
                            {p.consultationComment}
                          </span>
                        ) : p.holdReason ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[11px] font-medium">
                            Hold: {p.holdReason}
                          </span>
                        ) : p.remark || p.notes ? (
                          <span className="text-slate-600 text-[11px]">
                            {p.remark || p.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            {patientLogTab === 'confirmed' ? 'No comment' : 'Awaiting confirmation'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
