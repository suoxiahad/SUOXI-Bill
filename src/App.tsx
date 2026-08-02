import React, { useState, useEffect } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { AppointmentImporter } from './components/AppointmentImporter';
import { QuotationBuilder } from './components/QuotationBuilder';
import { QuotationPrintView } from './components/QuotationPrintView';
import { QuotationHistory } from './components/QuotationHistory';
import { CatalogSettings } from './components/CatalogSettings';
import { UserManagement } from './components/UserManagement';
import { PatientModal } from './components/PatientModal';
import { VpsGuideModal } from './components/VpsGuideModal';
import { LoginModal } from './components/LoginModal';

import { Patient, InvoiceQuotation, CatalogItem, User } from './types';
import { 
  getActiveUser,
  setActiveUser,
  fetchPatientsApi,
  getPatientsLocal,
  addOrUpdatePatientApi,
  fetchQuotationsApi,
  getQuotationsLocal,
  saveQuotationApi,
  fetchCatalogApi,
  getCatalogLocal,
  saveCatalogApi,
  fetchUsersApi,
  getUsersLocal
} from './utils/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'quotation' | 'history' | 'catalog' | 'vps_guide' | 'users'>('appointments');
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [quotations, setQuotations] = useState<InvoiceQuotation[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  const [selectedPatientForQuotation, setSelectedPatientForQuotation] = useState<Patient | null>(null);
  const [printQuotation, setPrintQuotation] = useState<InvoiceQuotation | null>(null);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);

  // Initial Load
  useEffect(() => {
    // Load local cache immediately
    setPatients(getPatientsLocal());
    setQuotations(getQuotationsLocal());
    setCatalog(getCatalogLocal());

    // Check saved user session
    const savedUser = getActiveUser();
    if (savedUser) {
      setCurrentUser(savedUser);
    } else {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    }

    // Async sync from API backend
    refreshAllDataFromApi();
  }, []);

  const refreshAllDataFromApi = async () => {
    const p = await fetchPatientsApi();
    setPatients(p);

    const q = await fetchQuotationsApi();
    setQuotations(q);

    const c = await fetchCatalogApi();
    setCatalog(c);

    await fetchUsersApi();
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'Call Center') {
      setActiveTab('appointments');
    } else if (user.role === 'Doctor') {
      setActiveTab('quotation');
    }
  };

  const handleLogout = () => {
    setActiveUser(null);
    setCurrentUser(null);
    setIsLoginModalOpen(true);
  };

  // Handlers
  const handleSelectPatientForQuotation = (patient: Patient) => {
    setSelectedPatientForQuotation(patient);
    setActiveTab('quotation');
  };

  const handleSavePatient = async (patient: Patient) => {
    const updated = await addOrUpdatePatientApi(patient);
    setPatients(updated);
  };

  const handleSearchPhoneInNavbar = (phone: string) => {
    const cleanPhone = phone.trim().toLowerCase();
    const found = patients.find(p => p.phone.includes(cleanPhone) || p.name.toLowerCase().includes(cleanPhone));
    if (found) {
      setSelectedPatientForQuotation(found);
      setActiveTab('quotation');
    } else {
      alert(`No patient found matching "${phone}". Please register the patient manually.`);
    }
  };

  const handleSaveQuotation = async (quotation: InvoiceQuotation) => {
    const updated = await saveQuotationApi(quotation);
    setQuotations(updated);
    refreshAllDataFromApi();
  };

  const handlePreviewPrint = (quotation: InvoiceQuotation) => {
    setPrintQuotation(quotation);
  };

  const handleSaveCatalog = async (newCatalog: CatalogItem[]) => {
    const updated = await saveCatalogApi(newCatalog);
    setCatalog(updated);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddPatient={() => setIsAddPatientOpen(true)}
        onSearchPhone={handleSearchPhoneInNavbar}
        patientCount={patients.length}
        quotationCount={quotations.length}
        currentUser={currentUser}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
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
            {activeTab === 'appointments' && (
              <AppointmentImporter
                patients={patients}
                onRefreshPatients={refreshAllDataFromApi}
                onSelectPatientForQuotation={handleSelectPatientForQuotation}
                onOpenAddPatient={() => setIsAddPatientOpen(true)}
              />
            )}

            {activeTab === 'quotation' && (
              <QuotationBuilder
                initialPatient={selectedPatientForQuotation}
                patients={patients}
                quotations={quotations}
                catalog={catalog}
                onSaveQuotation={handleSaveQuotation}
                onPreviewPrint={handlePreviewPrint}
              />
            )}

            {activeTab === 'history' && (
              <QuotationHistory
                quotations={quotations}
                onViewPrintQuotation={(q) => setPrintQuotation(q)}
              />
            )}

            {activeTab === 'catalog' && (
              <CatalogSettings
                catalog={catalog}
                onSaveCatalog={handleSaveCatalog}
              />
            )}

            {activeTab === 'users' && (
              <UserManagement currentUser={currentUser} />
            )}

            {activeTab === 'vps_guide' && (
              <VpsGuideModal />
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 text-xs text-center print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} SUO XI Hospital (Acupuncture) • All Rights Reserved.</p>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-semibold">SUO XI Billing System v2.0 (Central Database & Port 3002 Ready)</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PatientModal
        isOpen={isAddPatientOpen}
        onClose={() => setIsAddPatientOpen(false)}
        onSave={handleSavePatient}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        canClose={currentUser !== null}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

    </div>
  );
}
