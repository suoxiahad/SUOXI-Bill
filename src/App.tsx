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
  fetchPatientsCountsApi,
  fetchPatientsSummaryApi,
  PatientCountsResponse,
  PatientQueryFilterOptions,
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

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedWorkingDate, setSelectedWorkingDate] = useState<string>(todayStr);
  const selectedWorkingDateRef = useRef<string>(todayStr);
  const workingDateRequestIdRef = useRef<number>(0);
  const [patientsPage, setPatientsPage] = useState<number>(1);
  const [patientsPageSize, setPatientsPageSize] = useState<number>(50);
  const [patientsTotal, setPatientsTotal] = useState<number>(0);
  const [serverPatientCounts, setServerPatientCounts] = useState<PatientCountsResponse | null>(null);
  const patientsPageRef = useRef<number>(1);
  const patientsPageSizeRef = useRef<number>(50);
  const [quotationsTruncated, setQuotationsTruncated] = useState<boolean>(false);

  const [appointmentsFilter, setAppointmentsFilter] = useState<{
    status: 'all' | 'confirmed' | 'pending';
    q: string;
  }>({ status: 'all', q: '' });
  const [consultationFilter, setConsultationFilter] = useState<{
    comment: string;
    q: string;
  }>({ comment: 'all', q: '' });
  const [departmentsFilter, setDepartmentsFilter] = useState<{
    deptStatus: 'all' | 'pending' | 'cleared' | 'pathology_pending' | 'organic_pending' | 'nutrition_pending';
    q: string;
  }>({ deptStatus: 'all', q: '' });

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const appointmentsFilterRef = useRef(appointmentsFilter);
  appointmentsFilterRef.current = appointmentsFilter;
  const consultationSubTabRef = useRef(consultationSubTab);
  consultationSubTabRef.current = consultationSubTab;
  const consultationFilterRef = useRef(consultationFilter);
  consultationFilterRef.current = consultationFilter;
  const departmentsFilterRef = useRef(departmentsFilter);
  departmentsFilterRef.current = departmentsFilter;

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [dataVersion, setDataVersion] = useState<number>(() => getStoredDataVersion());

  const getTabServerFilter = useCallback((
    tab: typeof activeTab,
    overrides?: {
      appt?: { status: 'all' | 'confirmed' | 'pending'; q: string };
      consultStage?: 'pre' | 'post';
      consult?: { comment: string; q: string };
      dept?: { deptStatus: string; q: string };
    }
  ): Partial<PatientQueryFilterOptions> => {
    if (tab === 'consultation') {
      const stage = overrides?.consultStage ?? consultationSubTabRef.current;
      const cf = overrides?.consult ?? consultationFilterRef.current;
      return {
        status: 'confirmed',
        consultationStage: stage,
        comment: stage === 'post' ? cf.comment : undefined,
        q: cf.q
      };
    }
    if (tab === 'departments') {
      const df = overrides?.dept ?? departmentsFilterRef.current;
      return {
        consultationStage: 'post',
        deptStatus: df.deptStatus,
        q: df.q
      };
    }
    const af = overrides?.appt ?? appointmentsFilterRef.current;
    return {
      status: af.status,
      q: af.q
    };
  }, []);

  const loadServerPatientCounts = useCallback(async (targetDate?: string) => {
    const activeDate = targetDate ?? selectedWorkingDateRef.current;
    if (activeDate !== 'all') return null;
    const counts = await fetchPatientsCountsApi({ date: 'all' });
    if (selectedWorkingDateRef.current === 'all') {
      setServerPatientCounts(counts);
    }
    return counts;
  }, []);

  const loadWorkingDatePatients = useCallback(async (
    targetDate: string,
    pageOverride?: number,
    pageSizeOverride?: number,
    filterOverride?: Partial<PatientQueryFilterOptions>
  ) => {
    const normalized = targetDate || 'all';
    const targetPage = Math.max(1, pageOverride ?? patientsPageRef.current);
    const targetPageSize = Math.min(500, Math.max(1, pageSizeOverride ?? patientsPageSizeRef.current));
    const reqId = ++workingDateRequestIdRef.current;
    const activeFilters = normalized === 'all'
      ? (filterOverride ?? getTabServerFilter(activeTabRef.current))
      : undefined;
    const res = await fetchPatientsWithMetaApi(
      normalized === 'all'
        ? {
            date: 'all',
            page: targetPage,
            pageSize: targetPageSize,
            saveLocal: false,
            ...activeFilters
          }
        : { date: normalized, limit: 2000 }
    );
    if (reqId !== workingDateRequestIdRef.current) return null;
    if (res.fromServer) {
      setPatients(res.patients);
      setPatientsTotal(res.total);
      setPatientsPage(res.page);
      patientsPageRef.current = res.page;
    }
    return res;
  }, [getTabServerFilter]);

  const handleWorkingDateChange = useCallback(async (newDate: string) => {
    const normalized = newDate || 'all';
    setSelectedWorkingDate(normalized);
    selectedWorkingDateRef.current = normalized;
    setPatientsPage(1);
    patientsPageRef.current = 1;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setIsSyncing(true);
    try {
      const [res] = await Promise.all([
        loadWorkingDatePatients(normalized, 1, patientsPageSizeRef.current),
        normalized === 'all' ? loadServerPatientCounts('all') : Promise.resolve(null)
      ]);
      if (res && !res.fromServer) {
        setPatients(res.patients);
        setPatientsTotal(res.total);
      }
      if (normalized !== 'all') {
        setServerPatientCounts(null);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [loadWorkingDatePatients, loadServerPatientCounts]);

  const handlePatientsPageChange = useCallback(async (nextPage: number) => {
    const safeNext = Math.max(1, nextPage);
    setPatientsPage(safeNext);
    patientsPageRef.current = safeNext;
    if (selectedWorkingDateRef.current !== 'all') return;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setIsSyncing(true);
    try {
      const res = await loadWorkingDatePatients('all', safeNext, patientsPageSizeRef.current);
      if (res && !res.fromServer) {
        setPatients(res.patients);
        setPatientsTotal(res.total);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [loadWorkingDatePatients]);

  const handlePatientsPageSizeChange = useCallback(async (nextPageSize: number) => {
    const safeSize = Math.min(500, Math.max(1, nextPageSize));
    setPatientsPageSize(safeSize);
    patientsPageSizeRef.current = safeSize;
    setPatientsPage(1);
    patientsPageRef.current = 1;
    if (selectedWorkingDateRef.current !== 'all') return;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setIsSyncing(true);
    try {
      const res = await loadWorkingDatePatients('all', 1, safeSize);
      if (res && !res.fromServer) {
        setPatients(res.patients);
        setPatientsTotal(res.total);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [loadWorkingDatePatients]);

  const refreshServerPageForFilter = useCallback(async (
    filterOverride: Partial<PatientQueryFilterOptions>
  ) => {
    setPatientsPage(1);
    patientsPageRef.current = 1;
    if (selectedWorkingDateRef.current !== 'all') return;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setIsSyncing(true);
    try {
      const res = await loadWorkingDatePatients('all', 1, patientsPageSizeRef.current, filterOverride);
      if (res && !res.fromServer) {
        setPatients(res.patients);
        setPatientsTotal(res.total);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [loadWorkingDatePatients]);

  const handleAppointmentsFilterChange = useCallback((next: { status: 'all' | 'confirmed' | 'pending'; q: string }) => {
    const prev = appointmentsFilterRef.current;
    if (prev.status === next.status && prev.q === next.q) return;
    appointmentsFilterRef.current = next;
    setAppointmentsFilter(next);
    if (selectedWorkingDateRef.current === 'all' && activeTabRef.current === 'appointments') {
      refreshServerPageForFilter({ status: next.status, q: next.q });
    }
  }, [refreshServerPageForFilter]);

  const handleConsultationFilterChange = useCallback((next: { comment: string; q: string }) => {
    const prev = consultationFilterRef.current;
    if (prev.comment === next.comment && prev.q === next.q) return;
    consultationFilterRef.current = next;
    setConsultationFilter(next);
    if (selectedWorkingDateRef.current === 'all' && activeTabRef.current === 'consultation') {
      const stage = consultationSubTabRef.current;
      refreshServerPageForFilter({
        status: 'confirmed',
        consultationStage: stage,
        comment: stage === 'post' ? next.comment : undefined,
        q: next.q
      });
    }
  }, [refreshServerPageForFilter]);

  const handleConsultationSubTabChange = useCallback((nextStage: 'pre' | 'post') => {
    if (consultationSubTabRef.current === nextStage) return;
    consultationSubTabRef.current = nextStage;
    setConsultationSubTab(nextStage);
    if (selectedWorkingDateRef.current === 'all' && activeTabRef.current === 'consultation') {
      const cf = consultationFilterRef.current;
      refreshServerPageForFilter({
        status: 'confirmed',
        consultationStage: nextStage,
        comment: nextStage === 'post' ? cf.comment : undefined,
        q: cf.q
      });
    }
  }, [refreshServerPageForFilter]);

  const handleDepartmentsFilterChange = useCallback((next: {
    deptStatus: 'all' | 'pending' | 'cleared' | 'pathology_pending' | 'organic_pending' | 'nutrition_pending';
    q: string;
  }) => {
    const prev = departmentsFilterRef.current;
    if (prev.deptStatus === next.deptStatus && prev.q === next.q) return;
    departmentsFilterRef.current = next;
    setDepartmentsFilter(next);
    if (selectedWorkingDateRef.current === 'all' && activeTabRef.current === 'departments') {
      refreshServerPageForFilter({
        consultationStage: 'post',
        deptStatus: next.deptStatus,
        q: next.q
      });
    }
  }, [refreshServerPageForFilter]);

  const prevServerTabRef = useRef<string>(activeTab);
  useEffect(() => {
    const prevTab = prevServerTabRef.current;
    prevServerTabRef.current = activeTab;
    if (prevTab === activeTab) return;
    if (selectedWorkingDateRef.current !== 'all') return;
    if (activeTab !== 'appointments' && activeTab !== 'consultation' && activeTab !== 'departments') return;

    const user = getActiveUser();
    if (!user || !user.token) return;

    setPatients([]);
    setPatientsPage(1);
    patientsPageRef.current = 1;
    setIsSyncing(true);
    Promise.all([
      loadWorkingDatePatients('all', 1, patientsPageSizeRef.current, getTabServerFilter(activeTab)),
      loadServerPatientCounts('all')
    ]).finally(() => {
      setIsSyncing(false);
    });
  }, [activeTab, loadWorkingDatePatients, loadServerPatientCounts, getTabServerFilter]);

  // Instant 1ms optimistic update handler for single patient:
  const handleUpdatePatient = useCallback((updatedPatient: Patient) => {
    setPatients(prev => {
      const idx = prev.findIndex(p => Boolean(p.id && updatedPatient.id && p.id === updatedPatient.id));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedPatient;
        return copy;
      }
      return [updatedPatient, ...prev];
    });
    // Silently sync into local memory & disk cache without freezing UI
    updatePatientLocal(updatedPatient);
    if (selectedWorkingDateRef.current === 'all') {
      loadServerPatientCounts('all');
    }
  }, [loadServerPatientCounts]);

  const handleUpdatePatients = useCallback((updatedRows: Patient[]) => {
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return;
    setPatients(prev => {
      const copy = [...prev];
      for (const updatedPatient of updatedRows) {
        if (!updatedPatient) continue;
        const idx = copy.findIndex(p => Boolean(p.id && updatedPatient.id && p.id === updatedPatient.id));
        if (idx >= 0) {
          copy[idx] = { ...copy[idx], ...updatedPatient };
        } else {
          copy.unshift(updatedPatient);
        }
      }
      return copy;
    });
    if (selectedWorkingDateRef.current === 'all') {
      loadServerPatientCounts('all');
    }
  }, [loadServerPatientCounts]);

  const handleRemovePatients = useCallback((ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const idSet = new Set(ids);
    setPatients(prev => prev.filter(p => !idSet.has(p.id)));
    if (selectedWorkingDateRef.current === 'all') {
      setPatientsTotal(prev => Math.max(0, prev - ids.length));
      loadServerPatientCounts('all');
    }
  }, [loadServerPatientCounts]);

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
      const activeDate = selectedWorkingDateRef.current;
      const [initData, workingDateRes] = await Promise.all([
        fetchInitApi(forceBypass, { skipSavePatients: true }),
        loadWorkingDatePatients(activeDate),
        activeDate === 'all' ? loadServerPatientCounts('all') : Promise.resolve(null)
      ]);
      if (initData) {
        setDataVersion(initData.dataVersion !== undefined ? Number(initData.dataVersion) : getStoredDataVersion());
        setQuotations(initData.quotations);
        setQuotationsTruncated(Boolean(initData.quotationsTruncated));
        setCatalog(initData.catalog);
        if (initData.professions) setProfessions(initData.professions);
        if (initData.comments) setComments(initData.comments);
        if (!workingDateRes || !workingDateRes.fromServer) {
          const fallbackPatients = activeDate && activeDate !== 'all'
            ? initData.patients.filter(p => p.appointmentDate === activeDate)
            : initData.patients;
          setPatients(fallbackPatients);
          setPatientsTotal(fallbackPatients.length);
        }
      }
    } else {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    }
    setIsLoading(false);
    setIsSyncing(false);
  }, [loadWorkingDatePatients, loadServerPatientCounts]);

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
                  await Promise.all([
                    loadWorkingDatePatients(selectedWorkingDateRef.current),
                    selectedWorkingDateRef.current === 'all' ? loadServerPatientCounts('all') : Promise.resolve(null)
                  ]);
                } else if (!changes.truncated) {
                  if (changes.patients.length > 0) {
                    const activeDate = selectedWorkingDateRef.current;
                    if (activeDate === 'all') {
                      await Promise.all([
                        loadWorkingDatePatients('all', patientsPageRef.current, patientsPageSizeRef.current),
                        loadServerPatientCounts('all')
                      ]);
                    } else {
                      setPatients(prev => {
                        const patchMap = new Map(changes.patients.filter(p => p && p.id).map(p => [p.id, p]));
                        const existingIds = new Set(prev.map(p => p.id));
                        const newItems = changes.patients.filter(p =>
                          p && p.id && !existingIds.has(p.id) && p.appointmentDate === activeDate
                        );
                        const updatedPrev = prev
                          .map(p => patchMap.get(p.id) ?? p)
                          .filter(p => p.appointmentDate === activeDate);
                        return [...newItems, ...updatedPrev];
                      });
                    }
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
  }, [currentUser, loadWorkingDatePatients, loadServerPatientCounts]);

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
                serverTotalPatients={selectedWorkingDate === 'all' ? patientsTotal : undefined}
                serverPage={patientsPage}
                serverPageSize={patientsPageSize}
                serverCounts={selectedWorkingDate === 'all' ? serverPatientCounts : undefined}
                onServerPageChange={handlePatientsPageChange}
                onServerPageSizeChange={handlePatientsPageSizeChange}
                onServerFilterChange={handleAppointmentsFilterChange}
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
                  serverTotalPatients={selectedWorkingDate === 'all' ? patientsTotal : undefined}
                  serverPage={patientsPage}
                  serverPageSize={patientsPageSize}
                  serverCounts={selectedWorkingDate === 'all' ? serverPatientCounts : undefined}
                  onServerPageChange={handlePatientsPageChange}
                  onServerPageSizeChange={handlePatientsPageSizeChange}
                  onServerFilterChange={handleConsultationFilterChange}
                  onRefreshPatients={() => initializeAppData(true)}
                  onUpdatePatient={handleUpdatePatient}
                  onSelectPatientForQuotation={handleSelectPatientForQuotation}
                  onViewQuotation={handlePreviewPrint}
                  currentUser={currentUser}
                  initialSubTab={consultationSubTab}
                  onSubTabChange={handleConsultationSubTabChange}
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
                  serverTotalPatients={selectedWorkingDate === 'all' ? patientsTotal : undefined}
                  serverPage={patientsPage}
                  serverPageSize={patientsPageSize}
                  serverCounts={selectedWorkingDate === 'all' ? serverPatientCounts : undefined}
                  onServerPageChange={handlePatientsPageChange}
                  onServerPageSizeChange={handlePatientsPageSizeChange}
                  onServerFilterChange={handleDepartmentsFilterChange}
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
            <span className="text-emerald-400 font-semibold">SUO XI Billing System v3</span>
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
