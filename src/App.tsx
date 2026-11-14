import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { AppointmentImporter } from './components/AppointmentImporter';
import { Consultation } from './components/Consultation';
import { QuotationBuilder } from './components/QuotationBuilder';
import { QuotationPrintView } from './components/QuotationPrintView';
import { QuotationHistory } from './components/QuotationHistory';
import { CatalogSettings } from './components/CatalogSettings';
import { UserManagement } from './components/UserManagement';
import { DepartmentClearance } from './components/DepartmentClearance';
import { ReportingDashboard } from './components/ReportingDashboard';
import { PatientModal } from './components/PatientModal';
import { LoginModal } from './components/LoginModal';
import { FloatingCalculatorDrawer } from './components/FloatingCalculatorDrawer';

import { Patient, InvoiceQuotation, CatalogItem, User } from './types';
import { 
  getActiveUser,
  setActiveUser,
  fetchInitApi,
  fetchChangesApi,
  fetchPatientsWithMetaApi,
  fetchPatientsSummaryApi,
  searchPatientsLiveApi,
  getPatientsLocal,
  updatePatientLocal,
  addOrUpdatePatientApi,
  getQuotationsLocal,
  saveQuotationApi,
  deleteQuotationsApi,
  getCatalogLocal,
  saveCatalogApi,
  getProfessionsLocal,
  saveProfessionsApi,
  getConsultationCommentsLocal,
  saveConsultationCommentsApi,
  getStoredDataVersion,
  setStoredDataVersion,
  invalidateLocalCaches,
  hydrateStorageFromIndexedDb
} from './utils/storage';
import { makeUniqueId } from './utils/id';
import { matchPatient, matchSearchQuery } from './utils/searchHelper';
import { 
  getSheetsConfig, 
  getAccessToken, 
  syncPatientsToDailySheet 
} from './services/googleSheetsService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'consultation' | 'quotation' | 'history' | 'catalog' | 'users' | 'departments' | 'reports'>('appointments');
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => getActiveUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => !getActiveUser());

  // Instant 0ms cache loading on initial mount/reload:
  const [patients, setPatients] = useState<Patient[]>(() => getPatientsLocal());
  const [quotations, setQuotations] = useState<InvoiceQuotation[]>(() => getQuotationsLocal());
  const [catalog, setCatalog] = useState<CatalogItem[]>(() => getCatalogLocal());
  const [professions, setProfessions] = useState<string[]>(() => getProfessionsLocal());
  const [comments, setComments] = useState<string[]>(() => getConsultationCommentsLocal());

  const [selectedPatientForQuotation, setSelectedPatientForQuotation] = useState<Patient | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<InvoiceQuotation | null>(null);
  const [printQuotation, setPrintQuotation] = useState<InvoiceQuotation | null>(null);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [consultationSubTab, setConsultationSubTab] = useState<'pre' | 'post'>('pre');

  // Global calculation view mode for Section 1 (Treatments) and Section 4 (Indoor Rooms)
  const [showFullTreatmentCalculation, setShowFullTreatmentCalculation] = useState<boolean>(false);
  const [showFullIndoorCalculation, setShowFullIndoorCalculation] = useState<boolean>(false);

  const isAllCalculationsFull = showFullTreatmentCalculation && showFullIndoorCalculation;

  const handleToggleAllCalculations = () => {
    const nextVal = !isAllCalculationsFull;
    setShowFullTreatmentCalculation(nextVal);
    setShowFullIndoorCalculation(nextVal);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedWorkingDate, setSelectedWorkingDate] = useState<string>(todayStr);
  const selectedWorkingDateRef = useRef<string>(todayStr);
  const workingDateRequestIdRef = useRef<number>(0);
  const [patientsTruncated, setPatientsTruncated] = useState<boolean>(false);
  const [quotationsTruncated, setQuotationsTruncated] = useState<boolean>(false);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [dataVersion, setDataVersion] = useState<number>(() => getStoredDataVersion());

  const loadWorkingDatePatients = useCallback(async (targetDate: string) => {
    const normalized = targetDate || 'all';
    const reqId = ++workingDateRequestIdRef.current;
    const res = await fetchPatientsWithMetaApi({
      date: normalized,
      limit: 2000
    });
    if (reqId !== workingDateRequestIdRef.current) return null;
    if (res.fromServer) {
      setPatients(res.patients);
      setPatientsTruncated(res.truncated);
    }
    return res;
  }, []);

  const handleWorkingDateChange = useCallback(async (newDate: string) => {
    const normalized = newDate || 'all';
    setSelectedWorkingDate(normalized);
    selectedWorkingDateRef.current = normalized;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setIsSyncing(true);
    try {
      const res = await loadWorkingDatePatients(normalized);
      if (res && !res.fromServer) {
        setPatients(res.patients);
        setPatientsTruncated(false);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [loadWorkingDatePatients]);

  // Instant 1ms optimistic update handler for single patient:
  const handleUpdatePatient = useCallback((updatedPatient: Patient) => {
    setPatients(prev => {
      const idx = prev.findIndex(p =>
        (p.id && updatedPatient.id && p.id === updatedPatient.id) ||
        (p.serialNo && updatedPatient.serialNo && p.serialNo === updatedPatient.serialNo && p.appointmentDate && p.appointmentDate === updatedPatient.appointmentDate) ||
        (p.phone && updatedPatient.phone && p.phone !== '01700000000' && p.phone === updatedPatient.phone && p.appointmentDate && p.appointmentDate === updatedPatient.appointmentDate)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedPatient;
        return copy;
      }
      return [updatedPatient, ...prev];
    });
    // Silently sync into local memory & disk cache without freezing UI
    updatePatientLocal(updatedPatient);
  }, []);

  const handleUpdatePatients = useCallback((updatedRows: Patient[]) => {
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return;
    setPatients(prev => {
      const copy = [...prev];
      for (const updatedPatient of updatedRows) {
        if (!updatedPatient) continue;
        const idx = copy.findIndex(p =>
          (p.id && updatedPatient.id && p.id === updatedPatient.id) ||
          (p.serialNo && updatedPatient.serialNo && p.serialNo === updatedPatient.serialNo && p.appointmentDate && p.appointmentDate === updatedPatient.appointmentDate) ||
          (p.phone && updatedPatient.phone && p.phone !== '01700000000' && p.phone === updatedPatient.phone && p.appointmentDate && p.appointmentDate === updatedPatient.appointmentDate)
        );
        if (idx >= 0) {
          copy[idx] = { ...copy[idx], ...updatedPatient };
        } else {
          copy.unshift(updatedPatient);
        }
      }
      return copy;
    });
  }, []);

  const handleRemovePatients = useCallback((ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const idSet = new Set(ids);
    setPatients(prev => prev.filter(p => !idSet.has(p.id)));
  }, []);

  const initializeAppData = useCallback(async (forceBypass = false) => {
    const savedUser = getActiveUser();
    if (savedUser && savedUser.token) {
      setCurrentUser(savedUser);

      // 1. Instantly hydrate from IndexedDB if in-memory caches are initializing
      const hydrated = await hydrateStorageFromIndexedDb();
      if (hydrated.patients.length > 0) setPatients(hydrated.patients);
      if (hydrated.quotations.length > 0) setQuotations(hydrated.quotations);
      if (hydrated.catalog.length > 0) setCatalog(hydrated.catalog);

      // Only show full loader if local patients are completely empty
      if (hydrated.patients.length === 0) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }

      // 2. Fetch quotations/catalog/settings AND working-date patients from server
      const [initData, workingDateRes] = await Promise.all([
        fetchInitApi(forceBypass, { skipSavePatients: true }),
        loadWorkingDatePatients(selectedWorkingDateRef.current)
      ]);
      if (initData) {
        setDataVersion(initData.dataVersion !== undefined ? Number(initData.dataVersion) : getStoredDataVersion());
        setQuotations(initData.quotations);
        setQuotationsTruncated(Boolean(initData.quotationsTruncated));
        setCatalog(initData.catalog);
        if (initData.professions) setProfessions(initData.professions);
        if (initData.comments) setComments(initData.comments);
        if (!workingDateRes || !workingDateRes.fromServer) {
          const activeDate = selectedWorkingDateRef.current;
          const fallbackPatients = activeDate && activeDate !== 'all'
            ? initData.patients.filter(p => p.appointmentDate === activeDate)
            : initData.patients;
          setPatients(fallbackPatients);
          setPatientsTruncated(Boolean(initData.patientsTruncated));
        }
      }
    } else {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    }
    setIsLoading(false);
    setIsSyncing(false);
  }, [loadWorkingDatePatients]);

  useEffect(() => {
    initializeAppData();
  }, [initializeAppData]);

  // Periodic background sync so doctor & billing counter always have the latest appointments, quotations, and catalog rates without manual cache clearing
  useEffect(() => {
    if (!currentUser || !currentUser.token) return;

    const checkAndSyncData = async () => {
      if (document.hidden) return;
      try {
        const summary = await fetchPatientsSummaryApi();
        if (summary) {
          const storedDataVersion = getStoredDataVersion();
          if (summary.dataVersion !== storedDataVersion) {
            setIsSyncing(true);
            try {
              const changes = await fetchChangesApi(storedDataVersion);
              if (changes) {
                if (changes.truncated && changes.fullInit) {
                  setQuotations(changes.fullInit.quotations);
                  setQuotationsTruncated(Boolean(changes.fullInit.quotationsTruncated));
                  setCatalog(changes.fullInit.catalog);
                  if (changes.fullInit.professions) setProfessions(changes.fullInit.professions);
                  if (changes.fullInit.comments) setComments(changes.fullInit.comments);
                  const nextVersion = changes.fullInit.dataVersion ?? summary.dataVersion;
                  setStoredDataVersion(nextVersion);
                  setDataVersion(nextVersion);
                  await loadWorkingDatePatients(selectedWorkingDateRef.current);
                } else if (!changes.truncated) {
                  if (changes.patients.length > 0) {
                    const activeDate = selectedWorkingDateRef.current;
                    setPatients(prev => {
                      const patchMap = new Map(changes.patients.filter(p => p && p.id).map(p => [p.id, p]));
                      const existingIds = new Set(prev.map(p => p.id));
                      const newItems = changes.patients.filter(p =>
                        p && p.id && !existingIds.has(p.id) && (activeDate === 'all' || p.appointmentDate === activeDate)
                      );
                      const updatedPrev = prev
                        .map(p => patchMap.get(p.id) ?? p)
                        .filter(p => activeDate === 'all' || p.appointmentDate === activeDate);
                      return [...newItems, ...updatedPrev];
                    });
                  }
                  if (changes.quotations.length > 0) {
                    setQuotations(prev => {
                      const patchMap = new Map(changes.quotations.filter(q => q && q.id).map(q => [q.id, q]));
                      const existingIds = new Set(prev.map(q => q.id));
                      const newItems = changes.quotations.filter(q => q && q.id && !existingIds.has(q.id));
                      return [
                        ...newItems,
                        ...prev.map(q => patchMap.get(q.id) ?? q)
                      ];
                    });
                  }
                  if (changes.catalog.length > 0) {
                    setCatalog(changes.catalog);
                  }
                  const nextVersion = changes.dataVersion ?? summary.dataVersion;
                  setStoredDataVersion(nextVersion);
                  setDataVersion(nextVersion);
                }
              }
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch (err) {
        // silent background sync
      }
    };

    const interval = setInterval(checkAndSyncData, 4000);
    window.addEventListener('focus', checkAndSyncData);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkAndSyncData);
    };
  }, [currentUser, loadWorkingDatePatients]);

  // Guard tabs based on role
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    const isDoctorOrAdmin = role === 'System Admin' || role === 'Doctor';

    // Strictly protect Consultation tab for Doctor & System Admin only
    if (activeTab === 'consultation' && !isDoctorOrAdmin) {
      if (role === 'Call Center') {
        setActiveTab('appointments');
      } else if (role === 'Pathology' || role === 'Organic' || role === 'Nutrition') {
        setActiveTab('departments');
      } else {
        setActiveTab('history');
      }
      return;
    }

    // Strictly protect Department Updates tab for Pathology, Organic, Nutrition, and System Admin
    const isDeptOrAdmin = role === 'System Admin' || role === 'Pathology' || role === 'Organic' || role === 'Nutrition';
    if (activeTab === 'departments' && !isDeptOrAdmin) {
      if (role === 'Call Center') {
        setActiveTab('appointments');
      } else if (role === 'Doctor') {
        setActiveTab('consultation');
      } else {
        setActiveTab('history');
      }
      return;
    }

    // Strictly protect SSD user to reports and my profile & password (users tab) only
    if (role === 'SSD') {
      if (activeTab !== 'reports' && activeTab !== 'users') {
        setActiveTab('reports');
      }
      return;
    }

    // Restrict all other roles from reports tab (only System Admin and SSD have access to reports)
    if (role === 'Pathology' || role === 'Organic' || role === 'Nutrition') {
      if (activeTab !== 'departments' && activeTab !== 'users') {
        setActiveTab('departments');
      }
    } else if (role === 'Call Center') {
      if (activeTab !== 'appointments' && activeTab !== 'users') {
        setActiveTab('appointments');
      }
    } else if (role === 'Billing Counter') {
      if (activeTab !== 'history' && activeTab !== 'users') {
        setActiveTab('history');
      }
    } else if (role === 'Doctor') {
      if (activeTab !== 'consultation' && activeTab !== 'quotation' && activeTab !== 'history' && activeTab !== 'users') {
        setActiveTab('consultation');
      }
    }
  }, [currentUser, activeTab]);

  // Silent debounced background auto-sync to Google Sheets whenever patients change
  useEffect(() => {
    const config = getSheetsConfig();
    if (!config.autoSyncEnabled || patients.length === 0) return;

    const timer = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return; // Google account not connected yet, silently skip
      try {
        await syncPatientsToDailySheet(token, patients, new Date());
      } catch (err) {
        console.warn('Silent Google Sheets sync skipped:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [patients]);

  // Set initial default tab on login without strictly trapping the user
  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsLoginModalOpen(false);
    if (user.role === 'Call Center') {
      setActiveTab('appointments');
    } else if (user.role === 'Doctor') {
      setActiveTab('consultation');
    } else if (user.role === 'Billing Counter') {
      setActiveTab('history');
    } else if (user.role === 'Pathology' || user.role === 'Organic' || user.role === 'Nutrition') {
      setActiveTab('departments');
    } else if (user.role === 'SSD') {
      setActiveTab('reports');
    } else {
      setActiveTab('consultation');
    }
    await initializeAppData();
  };

  const handleLogout = () => {
    setActiveUser(null);
    setCurrentUser(null);
    setIsLoginModalOpen(true);
  };

  const handleSelectPatientForQuotation = (patient: Patient) => {
    setEditingQuotation(null);
    setSelectedPatientForQuotation(patient);
    setActiveTab('quotation');
  };

  const handleBackToPostConsultation = () => {
    setConsultationSubTab('post');
    setActiveTab('consultation');
  };

  const handleEditQuotation = (quotation: InvoiceQuotation) => {
    setEditingQuotation(quotation);
    setSelectedPatientForQuotation(null);
    setActiveTab('quotation');
  };

  const handleSavePatient = async (patient: Patient) => {
    if (currentUser?.role === 'Doctor' || currentUser?.role === 'SSD') {
      return;
    }
    const patientToSave = { ...patient };
    const hadNoId = !patientToSave.id;
    if (hadNoId) {
      patientToSave.id = makeUniqueId();
    }
    // If registering from Consultation page or a fresh walk-in, automatically confirm for Pre Consultation (serial assigned by server)
    if (!patientToSave.isConfirmed && (activeTab === 'consultation' || hadNoId)) {
      patientToSave.isConfirmed = true;
      patientToSave.confirmedAt = new Date().toISOString();
      patientToSave.consultationStatus = 'Pre Consultation';
      patientToSave.status = 'Pre Consultation';
    }
    const result = await addOrUpdatePatientApi(patientToSave);
    if (result.patient) {
      handleUpdatePatient(result.patient);
    }
  };

  const handleSearchPhoneInNavbar = async (query: string) => {
    if (!query || !query.trim()) return;

    // 1. Search in Patients list
    let foundPatient = patients.find(p => matchPatient(query, p));

    // If not found locally, query live backend immediately
    if (!foundPatient) {
      const serverMatches = await searchPatientsLiveApi(query);
      if (serverMatches.length > 0) {
        foundPatient = serverMatches[0];
        setPatients(prev => {
          const map = new Map(prev.map(p => [p.id, p]));
          serverMatches.forEach(p => map.set(p.id, p));
          return Array.from(map.values());
        });
      }
    }

    if (foundPatient) {
      setEditingQuotation(null);
      setSelectedPatientForQuotation(foundPatient);
      setActiveTab('quotation');
      return;
    }

    // 2. Search in Quotation History if not found in active patients
    const foundQuotation = quotations.find(q =>
      matchSearchQuery(query, [q.patientPhone, q.patientName, q.quotationNumber, q.doctorName])
    );

    if (foundQuotation) {
      const synchedPatient: Patient = {
        id: foundQuotation.patientId && foundQuotation.patientId !== 'walkin' ? foundQuotation.patientId : makeUniqueId(),
        name: foundQuotation.patientName,
        phone: foundQuotation.patientPhone,
        age: String(foundQuotation.patientAge || ''),
        gender: (foundQuotation.patientGender as any) || 'Other',
        address: foundQuotation.patientAddress || '',
        doctorName: foundQuotation.doctorName,
        appointmentDate: foundQuotation.createdDate || new Date().toISOString().split('T')[0],
        appointmentTime: '09:00 AM',
        department: 'Acupuncture',
        status: 'Quotation Created',
        createdAt: foundQuotation.createdAt || new Date().toISOString()
      };

      setEditingQuotation(null);
      setSelectedPatientForQuotation(synchedPatient);
      setActiveTab('quotation');
      return;
    }

    alert(`No patient record found matching "${query}". You can register or import the patient.`);
  };

  const handleSaveQuotation = async (quotation: InvoiceQuotation): Promise<InvoiceQuotation> => {
    const result = await saveQuotationApi(quotation);
    if (Array.isArray(result.quotations) && result.quotations.length > 0) {
      setQuotations(result.quotations);
    } else {
      setQuotations(prev => {
        const idx = prev.findIndex(q => q.id === result.quotation.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = result.quotation;
          return copy;
        }
        return [result.quotation, ...prev];
      });
    }
    // Refresh patient list locally so patient status updates to "Quotation Created"
    const updatedPatients = getPatientsLocal();
    setPatients(updatedPatients);
    return result.quotation;
  };

  const handleDeleteQuotations = async (ids: string[]) => {
    const updated = await deleteQuotationsApi(ids);
    setQuotations(updated);
  };

  const handlePreviewPrint = (quotation: InvoiceQuotation) => {
    setPrintQuotation(quotation);
  };

  const handleSaveCatalog = async (newCatalog: CatalogItem[]) => {
    const updated = await saveCatalogApi(newCatalog);
    setCatalog(updated);
  };

  const handleSaveProfessions = async (newProfessions: string[]) => {
    const updated = await saveProfessionsApi(newProfessions);
    setProfessions(updated);
  };

  const handleSaveComments = async (newComments: string[]) => {
    const updated = await saveConsultationCommentsApi(newComments);
    setComments(updated);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddPatient={() => {
          if (currentUser?.role === 'Doctor') return;
          setIsAddPatientOpen(true);
        }}
        onSearchPhone={handleSearchPhoneInNavbar}
        patientCount={patients.length}
        quotationCount={quotations.length}
        currentUser={currentUser}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        isAllCalculationsFull={isAllCalculationsFull}
        onToggleAllCalculations={handleToggleAllCalculations}
        isSyncing={isSyncing}
        onRefreshData={() => initializeAppData(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {!currentUser ? (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto my-12 space-y-6">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto ring-4 ring-emerald-50 border border-emerald-100">
              <Lock className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">System Logged Out</h2>
              <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                You are currently logged out of the SUO XI Hospital System. Please sign in with your User Account to access Appointments, Quotations, and Billing.
              </p>
            </div>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 mx-auto cursor-pointer text-xs sm:text-sm"
            >
              <LogIn className="w-4 h-4" />
              Sign In / Login Now
            </button>
          </div>
        ) : printQuotation ? (
          <QuotationPrintView
            quotation={printQuotation}
            onBack={() => setPrintQuotation(null)}
          />
        ) : (
          <>
            <div className={activeTab === 'appointments' ? 'block' : 'hidden'}>
              <AppointmentImporter
                patients={patients}
                quotations={quotations}
                selectedDateFilter={selectedWorkingDate}
                onDateFilterChange={handleWorkingDateChange}
                isPatientsTruncated={patientsTruncated}
                onRefreshPatients={() => initializeAppData(true)}
                onUpdatePatient={handleUpdatePatient}
                onUpdatePatients={handleUpdatePatients}
                onRemovePatients={handleRemovePatients}
                onSyncPatientsList={setPatients}
                onSelectPatientForQuotation={handleSelectPatientForQuotation}
                onOpenAddPatient={currentUser?.role !== 'Doctor' ? () => setIsAddPatientOpen(true) : undefined}
                currentUser={currentUser}
              />
            </div>

            <div className={activeTab === 'consultation' ? 'block' : 'hidden'}>
              {(currentUser?.role === 'System Admin' || currentUser?.role === 'Doctor') ? (
                <Consultation
                  patients={patients}
                  quotations={quotations}
                  professions={professions}
                  comments={comments}
                  selectedDateFilter={selectedWorkingDate}
                  onDateFilterChange={handleWorkingDateChange}
                  isPatientsTruncated={patientsTruncated}
                  onRefreshPatients={() => initializeAppData(true)}
                  onUpdatePatient={handleUpdatePatient}
                  onSelectPatientForQuotation={handleSelectPatientForQuotation}
                  onViewQuotation={handlePreviewPrint}
                  currentUser={currentUser}
                  initialSubTab={consultationSubTab}
                  onSubTabChange={setConsultationSubTab}
                />
              ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 max-w-md mx-auto my-12 space-y-4 shadow-sm">
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
                    <Lock className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Access Restricted</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Consultation tab is accessible only by Doctor and System Admin accounts.
                  </p>
                </div>
              )}
            </div>

            <div className={activeTab === 'quotation' ? 'block max-w-7xl mx-auto w-full' : 'hidden'}>
              <QuotationBuilder
                initialPatient={selectedPatientForQuotation}
                patients={patients}
                quotations={quotations}
                catalog={catalog}
                currentUser={currentUser}
                editingQuotation={editingQuotation}
                onCancelEdit={() => setEditingQuotation(null)}
                onSaveQuotation={handleSaveQuotation}
                onPreviewPrint={handlePreviewPrint}
                showFullTreatmentCalculation={showFullTreatmentCalculation}
                setShowFullTreatmentCalculation={setShowFullTreatmentCalculation}
                showFullIndoorCalculation={showFullIndoorCalculation}
                setShowFullIndoorCalculation={setShowFullIndoorCalculation}
                onBackToPostConsultation={handleBackToPostConsultation}
                onUpdatePatient={handleUpdatePatient}
              />
            </div>

            <div className={activeTab === 'history' ? 'block' : 'hidden'}>
              <QuotationHistory
                quotations={quotations}
                patients={patients}
                currentUser={currentUser}
                isQuotationsTruncated={quotationsTruncated}
                onViewPrintQuotation={(q) => setPrintQuotation(q)}
                onUpdateQuotation={handleSaveQuotation}
                onEditQuotation={handleEditQuotation}
                onDeleteQuotations={handleDeleteQuotations}
                onSelectPatientForQuotation={handleSelectPatientForQuotation}
              />
            </div>

            <div className={activeTab === 'catalog' ? 'block' : 'hidden'}>
              <CatalogSettings
                catalog={catalog}
                professions={professions}
                comments={comments}
                patients={patients}
                onSaveCatalog={handleSaveCatalog}
                onSaveProfessions={handleSaveProfessions}
                onSaveComments={handleSaveComments}
              />
            </div>

            <div className={activeTab === 'departments' ? 'block' : 'hidden'}>
              {(currentUser?.role === 'System Admin' || currentUser?.role === 'Pathology' || currentUser?.role === 'Organic' || currentUser?.role === 'Nutrition') ? (
                <DepartmentClearance
                  patients={patients}
                  quotations={quotations}
                  currentUser={currentUser}
                  selectedDateFilter={selectedWorkingDate}
                  onDateFilterChange={handleWorkingDateChange}
                  isPatientsTruncated={patientsTruncated}
                  onRefreshPatients={() => initializeAppData(true)}
                  onUpdatePatient={handleUpdatePatient}
                />
              ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 max-w-md mx-auto my-12 space-y-4 shadow-sm">
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
                    <Lock className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Access Restricted</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Department Updates tab is accessible only by Pathology, Organic, Nutrition, and System Admin accounts.
                  </p>
                </div>
              )}
            </div>

            <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
              {currentUser?.role === 'System Admin' || currentUser?.role === 'SSD' ? (
                <ReportingDashboard
                  patients={patients}
                  quotations={quotations}
                  currentUser={currentUser}
                  isActive={activeTab === 'reports'}
                  dataVersion={dataVersion}
                  onSelectPatient={(p) => {
                    if (currentUser?.role === 'SSD') return;
                    setSelectedPatientForQuotation(p);
                    setActiveTab('quotation');
                  }}
                />
              ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 max-w-md mx-auto my-12 space-y-4 shadow-sm">
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
                    <Lock className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Access Restricted</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Reporting page is accessible only by System Admin and SSD accounts.
                  </p>
                </div>
              )}
            </div>

            <div className={activeTab === 'users' ? 'block' : 'hidden'}>
              <UserManagement currentUser={currentUser} />
            </div>
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 text-xs text-center print:hidden">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} SUO XI Hospital (Acupuncture) • All Rights Reserved.</p>
          <p className="text-emerald-400 font-medium">Developed & Designed By SUOXI IT</p>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-semibold">SUO XI Billing System v2.1</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PatientModal
        isOpen={isAddPatientOpen && currentUser?.role !== 'Doctor'}
        onClose={() => setIsAddPatientOpen(false)}
        onSave={handleSavePatient}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        canClose={currentUser !== null}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Slide-out Floating Hospital Calculator */}
      <FloatingCalculatorDrawer />

    </div>
  );
}
