import React, { useState, useEffect, useCallback } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { AppointmentImporter } from './components/AppointmentImporter';
import { Consultation } from './components/Consultation';
import { QuotationBuilder } from './components/QuotationBuilder';
import { QuotationPrintView } from './components/QuotationPrintView';
import { QuotationHistory } from './components/QuotationHistory';
import { CatalogSettings } from './components/CatalogSettings';
import { UserManagement } from './components/UserManagement';
import { PatientModal } from './components/PatientModal';
import { LoginModal } from './components/LoginModal';
import { FloatingCalculatorDrawer } from './components/FloatingCalculatorDrawer';

import { Patient, InvoiceQuotation, CatalogItem, User } from './types';
import { 
  getActiveUser,
  setActiveUser,
  fetchInitApi,
  fetchPatientsApi,
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
  invalidateLocalCaches
} from './utils/storage';
import { matchPatient, matchSearchQuery } from './utils/searchHelper';

export default function App() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'consultation' | 'quotation' | 'history' | 'catalog' | 'users'>('appointments');
  
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

  // Global calculation view mode for Section 1 (Treatments) and Section 4 (Indoor Rooms)
  const [showFullTreatmentCalculation, setShowFullTreatmentCalculation] = useState<boolean>(false);
  const [showFullIndoorCalculation, setShowFullIndoorCalculation] = useState<boolean>(false);

  const isAllCalculationsFull = showFullTreatmentCalculation && showFullIndoorCalculation;

  const handleToggleAllCalculations = () => {
    const nextVal = !isAllCalculationsFull;
    setShowFullTreatmentCalculation(nextVal);
    setShowFullIndoorCalculation(nextVal);
  };

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Instant 1ms optimistic update handler for single patient:
  const handleUpdatePatient = useCallback((updatedPatient: Patient) => {
    setPatients(prev => {
      const idx = prev.findIndex(p => p.id === updatedPatient.id);
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

  const initializeAppData = useCallback(async (forceBypass = false) => {
    const savedUser = getActiveUser();
    if (savedUser && savedUser.token) {
      setCurrentUser(savedUser);
      // Only show full loader if local patients are completely empty
      const localP = getPatientsLocal();
      if (!localP || localP.length === 0) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }

      const initData = await fetchInitApi(forceBypass);
      if (initData) {
        setPatients(initData.patients);
        setQuotations(initData.quotations);
        setCatalog(initData.catalog);
        if (initData.professions) setProfessions(initData.professions);
        if (initData.comments) setComments(initData.comments);
      }
    } else {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    }
    setIsLoading(false);
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    initializeAppData();
  }, [initializeAppData]);

  // Periodic background sync so doctor & billing counter always have the latest appointments, quotations, and catalog rates without manual cache clearing
  useEffect(() => {
    if (!currentUser || !currentUser.token) return;

    let lastSummaryCount = 0;
    let lastSummaryLatestId = '';
    let lastQuotationsCount = 0;
    let lastCatalogLength = 0;
    let lastVersion = getStoredDataVersion();

    const checkAndSyncData = async () => {
      if (document.hidden) return;
      try {
        const summary = await fetchPatientsSummaryApi();
        if (summary) {
          const currentStoredVersion = getStoredDataVersion();
          const serverVer = summary.dataVersion || 0;

          // If server dataVersion differs from what this client stored, server had changes (e.g. import, rate update, deletion)
          const versionChanged = serverVer > 0 && currentStoredVersion > 0 && serverVer !== currentStoredVersion;
          const patientsChanged = summary.count !== lastSummaryCount || summary.latestId !== lastSummaryLatestId;
          const quotationsChanged = summary.quotationsCount !== undefined && lastQuotationsCount !== 0 && summary.quotationsCount !== lastQuotationsCount;
          const catalogChanged = summary.catalogLength !== undefined && lastCatalogLength !== 0 && summary.catalogLength !== lastCatalogLength;

          if (versionChanged || catalogChanged || quotationsChanged) {
            // Full refresh required: reload fresh init data so treatments, prices and patients all update synchronously
            setIsSyncing(true);
            const freshInit = await fetchInitApi(true);
            if (freshInit) {
              setPatients(freshInit.patients);
              setQuotations(freshInit.quotations);
              setCatalog(freshInit.catalog);
            }
            setIsSyncing(false);
          } else if (patientsChanged) {
            // Patient-only change
            const fresh = await fetchPatientsApi();
            if (Array.isArray(fresh)) {
              setPatients(fresh);
            }
          }

          // Update tracked checkpoints
          lastSummaryCount = summary.count;
          lastSummaryLatestId = summary.latestId;
          if (summary.quotationsCount !== undefined) lastQuotationsCount = summary.quotationsCount;
          if (summary.catalogLength !== undefined) lastCatalogLength = summary.catalogLength;
          if (serverVer > 0) {
            lastVersion = serverVer;
            setStoredDataVersion(serverVer);
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
  }, [currentUser]);

  // Guard tabs based on role
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    if (role === 'Call Center') {
      if (activeTab !== 'appointments' && activeTab !== 'consultation' && activeTab !== 'users') {
        setActiveTab('appointments');
      }
    } else if (role === 'Billing Counter') {
      if (activeTab !== 'consultation' && activeTab !== 'history' && activeTab !== 'users') {
        setActiveTab('history');
      }
    } else if (role === 'Doctor') {
      if (activeTab !== 'consultation' && activeTab !== 'quotation' && activeTab !== 'history' && activeTab !== 'users') {
        setActiveTab('consultation');
      }
    }
  }, [currentUser, activeTab]);

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

  const handleEditQuotation = (quotation: InvoiceQuotation) => {
    setEditingQuotation(quotation);
    setSelectedPatientForQuotation(null);
    setActiveTab('quotation');
  };

  const handleSavePatient = async (patient: Patient) => {
    if (currentUser?.role === 'Doctor') {
      return;
    }
    let patientToSave = { ...patient };
    // If registering from Consultation page or a fresh walk-in, automatically confirm for Pre Consultation
    if (!patientToSave.isConfirmed && (activeTab === 'consultation' || !patientToSave.id)) {
      const targetDate = patientToSave.appointmentDate || new Date().toISOString().split('T')[0];
      let maxSerial = 0;
      patients.forEach(p => {
        if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
          if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
        }
      });
      patientToSave.isConfirmed = true;
      patientToSave.confirmedAt = new Date().toISOString();
      patientToSave.consultationSerial = maxSerial + 1;
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
        id: `pat-hist-${foundQuotation.id}`,
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

  const handleSaveQuotation = async (quotation: InvoiceQuotation) => {
    const updated = await saveQuotationApi(quotation);
    setQuotations(updated);
    // Refresh patient list locally so patient status updates to "Quotation Created" without trigger loops
    const updatedPatients = getPatientsLocal();
    setPatients(updatedPatients);
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
                onRefreshPatients={initializeAppData}
                onUpdatePatient={handleUpdatePatient}
                onSelectPatientForQuotation={handleSelectPatientForQuotation}
                onOpenAddPatient={currentUser?.role !== 'Doctor' ? () => setIsAddPatientOpen(true) : undefined}
                onGoToConsultation={() => setActiveTab('consultation')}
                currentUser={currentUser}
              />
            </div>

            <div className={activeTab === 'consultation' ? 'block' : 'hidden'}>
              <Consultation
                patients={patients}
                quotations={quotations}
                professions={professions}
                comments={comments}
                onRefreshPatients={initializeAppData}
                onUpdatePatient={handleUpdatePatient}
                onSelectPatientForQuotation={handleSelectPatientForQuotation}
                onViewQuotation={handlePreviewPrint}
                currentUser={currentUser}
              />
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
              />
            </div>

            <div className={activeTab === 'history' ? 'block' : 'hidden'}>
              <QuotationHistory
                quotations={quotations}
                patients={patients}
                currentUser={currentUser}
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
                onSaveCatalog={handleSaveCatalog}
                onSaveProfessions={handleSaveProfessions}
                onSaveComments={handleSaveComments}
              />
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
