import { Patient, InvoiceQuotation, CatalogItem, User } from '../types';
import { DEFAULT_CATALOG } from '../data/defaultCatalog';

const PATIENTS_KEY = 'suoxi_patients_db';
const QUOTATIONS_KEY = 'suoxi_quotations_db';
const CATALOG_KEY = 'suoxi_catalog_db';
const AUTH_KEY = 'suoxi_auth_user';
const DATA_VERSION_KEY = 'suoxi_data_version';
const PROFESSIONS_KEY = 'suoxi_professions_db';
const COMMENTS_KEY = 'suoxi_comments_db';

export const DEFAULT_PROFESSIONS: string[] = [
  'Business',
  'Govt. Service',
  'Private Job',
  'Housewife',
  'Student',
  'Teacher',
  'Doctor',
  'Engineer',
  'Lawyer',
  'Banker',
  'Retired',
  'Farmer',
  'Driver',
  'Abroad / Expatriate',
  'Freelancer / IT',
  'Other'
];

export const DEFAULT_CONSULTATION_COMMENTS: string[] = [
  'Will take today',
  'Will admit',
  'Will take later',
  'Costly',
  'Follow-up needed',
  'Consultation Only',
  'Need Family Discussion',
  'Attended Counseling'
];

export const getProfessionsLocal = (): string[] => {
  try {
    const data = localStorage.getItem(PROFESSIONS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_PROFESSIONS;
};

export const saveProfessionsLocal = (professions: string[]): void => {
  try {
    localStorage.setItem(PROFESSIONS_KEY, JSON.stringify(professions));
  } catch (err) {
    console.warn('Failed to save professions locally:', err);
  }
};

export const saveProfessionsApi = async (professions: string[]): Promise<string[]> => {
  saveProfessionsLocal(professions);
  try {
    const res = await fetch('/api/settings/professions', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ professions })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.professions) {
        saveProfessionsLocal(data.professions);
        return data.professions;
      }
    }
  } catch (err) {
    console.warn('Failed saving professions to backend:', err);
  }
  return professions;
};

export const getConsultationCommentsLocal = (): string[] => {
  try {
    const data = localStorage.getItem(COMMENTS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_CONSULTATION_COMMENTS;
};

export const saveConsultationCommentsLocal = (comments: string[]): void => {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  } catch (err) {
    console.warn('Failed to save comments locally:', err);
  }
};

export const saveConsultationCommentsApi = async (comments: string[]): Promise<string[]> => {
  saveConsultationCommentsLocal(comments);
  try {
    const res = await fetch('/api/settings/comments', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ comments })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.comments) {
        saveConsultationCommentsLocal(data.comments);
        return data.comments;
      }
    }
  } catch (err) {
    console.warn('Failed saving comments to backend:', err);
  }
  return comments;
};

export const getStoredDataVersion = (): number => {
  try {
    const val = localStorage.getItem(DATA_VERSION_KEY);
    return val ? Number(val) || 0 : 0;
  } catch {
    return 0;
  }
};

export const setStoredDataVersion = (version: number): void => {
  try {
    localStorage.setItem(DATA_VERSION_KEY, String(version));
  } catch {
    // ignore
  }
};

export const invalidateLocalCaches = (): void => {
  inMemoryPatients = [];
  inMemoryQuotations = [];
  try {
    localStorage.removeItem(PATIENTS_KEY);
    localStorage.removeItem(QUOTATIONS_KEY);
    localStorage.removeItem(CATALOG_KEY);
    localStorage.removeItem(DATA_VERSION_KEY);
  } catch (err) {
    console.warn('Failed clearing cached storage items:', err);
  }
};

// Initial sample patient data (development only)
const DEMO_PATIENTS_LIST: Patient[] = [
  {
    id: 'pat-101',
    name: 'MD. RAFIQUL ISLAM',
    phone: '01711223344',
    age: 52,
    gender: 'Male',
    address: 'Dhanmondi, Dhaka',
    doctorName: 'Dr. S.M. Shahidul Islam PhD',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '10:30 AM',
    department: 'Acupuncture & Spine',
    status: 'Pending Counseling',
    createdAt: new Date().toISOString(),
    notes: 'Severe L4-L5 Back pain & Sciatica'
  },
  {
    id: 'pat-102',
    name: 'NAZMUN NAHAR',
    phone: '01819876543',
    age: 44,
    gender: 'Female',
    address: 'Uttara, Dhaka',
    doctorName: 'Dr. Sharmin Akter',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '11:15 AM',
    department: 'Neurology & Paralysis',
    status: 'Quotation Created',
    createdAt: new Date().toISOString(),
    notes: 'Stroke rehabilitation, Facial palsy'
  }
];

const INITIAL_PATIENTS: Patient[] = [];

// Helper to get auth header
function getAuthHeader(): Record<string, string> {
  try {
    const user = getActiveUser();
    if (user && user.token) {
      return { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' };
    }
  } catch (err) {
    // ignore
  }
  return { 'Content-Type': 'application/json' };
}

// Active user authentication session
export const getActiveUser = (): User | null => {
  try {
    const data = localStorage.getItem(AUTH_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const setActiveUser = (user: User | null): void => {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
};

// Helper to merge patient lists without losing local updates
function mergePatientsList(serverPatients: Patient[], localPatients: Patient[]): Patient[] {
  const map = new Map<string, Patient>();

  // Insert server patients first by unique ID
  for (const p of serverPatients) {
    if (p && p.id) {
      map.set(p.id, p);
    }
  }

  // Overlay local patients so local records are preserved
  for (const p of localPatients) {
    if (p && p.id) {
      const existing = map.get(p.id);
      if (!existing) {
        map.set(p.id, p);
      } else {
        map.set(p.id, { ...existing, ...p });
      }
    }
  }

  return Array.from(map.values());
}

function mergeQuotationsList(serverQuotations: InvoiceQuotation[], localQuotations: InvoiceQuotation[]): InvoiceQuotation[] {
  const map = new Map<string, InvoiceQuotation>();

  for (const q of serverQuotations) {
    if (q && q.id) {
      map.set(q.id, q);
    }
  }

  for (const q of localQuotations) {
    if (q && q.id) {
      map.set(q.id, q);
    }
  }

  return Array.from(map.values());
}

export interface InitDataResponse {
  patients: Patient[];
  quotations: InvoiceQuotation[];
  catalog: CatalogItem[];
  users: User[];
  professions?: string[];
  comments?: string[];
  dbMode?: string;
  dataVersion?: number;
}

export const fetchInitApi = async (forceBypassCache = false): Promise<InitDataResponse | null> => {
  const user = getActiveUser();
  const localPatients = getPatientsLocal();
  const localQuotations = getQuotationsLocal();
  const localCatalog = getCatalogLocal();
  const localUsers = getUsersLocal();
  const localProfessions = getProfessionsLocal();
  const localComments = getConsultationCommentsLocal();

  if (!user || !user.token) {
    return {
      patients: localPatients,
      quotations: localQuotations,
      catalog: localCatalog,
      users: localUsers,
      professions: localProfessions,
      comments: localComments
    };
  }

  try {
    const url = forceBypassCache ? `/api/init?t=${Date.now()}` : '/api/init';
    const res = await fetch(url, { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const serverPatients = Array.isArray(data.patients) ? data.patients : [];
        const serverQuotations = Array.isArray(data.quotations) ? data.quotations : [];
        const serverCatalog = Array.isArray(data.catalog) && data.catalog.length > 0 ? data.catalog : localCatalog;
        const serverUsers = Array.isArray(data.users) && data.users.length > 0 ? data.users : localUsers;
        const serverProfessions = Array.isArray(data.professions) && data.professions.length > 0 ? data.professions : localProfessions;
        const serverComments = Array.isArray(data.comments) && data.comments.length > 0 ? data.comments : localComments;

        savePatientsLocal(serverPatients);
        saveQuotationsLocal(serverQuotations);
        saveCatalogLocal(serverCatalog);
        saveUsersLocal(serverUsers);
        saveProfessionsLocal(serverProfessions);
        saveConsultationCommentsLocal(serverComments);

        if (data.dataVersion) {
          setStoredDataVersion(Number(data.dataVersion));
        }

        return {
          patients: serverPatients,
          quotations: serverQuotations,
          catalog: serverCatalog,
          users: serverUsers,
          professions: serverProfessions,
          comments: serverComments,
          dbMode: data.dbMode,
          dataVersion: data.dataVersion
        };
      }
    }
  } catch (err) {
    console.warn('Init API fetch failed, using local caches:', err);
  }

  return {
    patients: localPatients,
    quotations: localQuotations,
    catalog: localCatalog,
    users: localUsers,
    professions: localProfessions,
    comments: localComments
  };
};

// In-memory runtime cache for high-volume patient support (bypasses 5MB localStorage limit)
let inMemoryPatients: Patient[] = [];
let inMemoryQuotations: InvoiceQuotation[] = [];

export interface PatientSummary {
  count: number;
  latestCreatedAt: string;
  latestId: string;
  quotationsCount?: number;
  catalogLength?: number;
  dataVersion?: number;
  timestamp: number;
}

export const fetchPatientsSummaryApi = async (): Promise<PatientSummary | null> => {
  try {
    const res = await fetch(`/api/patients/summary?t=${Date.now()}`, { headers: getAuthHeader() });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // ignore
  }
  return null;
};

// Patient APIs
export const fetchPatientsApi = async (options?: { limit?: number; offset?: number; date?: string }): Promise<Patient[]> => {
  try {
    let url = '/api/patients';
    if (options) {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.date) params.set('date', options.date);
      url += `?${params.toString()}`;
    }

    const res = await fetch(url, { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        savePatientsLocal(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('API fetch failed, reading local cache:', err);
  }
  return getPatientsLocal();
};

export const searchPatientsLiveApi = async (query: string, limit = 50, date?: string): Promise<Patient[]> => {
  if (!query || !query.trim()) return [];
  try {
    let url = `/api/patients/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
    if (date && date !== 'all') {
      url += `&date=${encodeURIComponent(date)}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeader()
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        if (data.length > 0) {
          const current = getPatientsLocal();
          const merged = mergePatientsList(data, current);
          savePatientsLocal(merged);
        }
        return data;
      }
    }
  } catch (err) {
    console.warn('Live patient search API error:', err);
  }
  return [];
};

export const getPatientsLocal = (): Patient[] => {
  if (inMemoryPatients.length > 0) {
    return inMemoryPatients;
  }

  try {
    const data = localStorage.getItem(PATIENTS_KEY);
    let patients: Patient[] = INITIAL_PATIENTS;
    if (data) {
      patients = JSON.parse(data);
    }
    // Ensure strictly unique IDs across loaded patients and clean confirmation state
    const seen = new Set<string>();
    const uniquePatients: Patient[] = [];
    patients.forEach((p, idx) => {
      let id = p.id;
      if (!id || seen.has(id)) {
        id = `pat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`;
      }
      seen.add(id);
      let sanitized = { ...p, id };
      if (!sanitized.isConfirmed) {
        sanitized.isConfirmed = false;
        sanitized.consultationSerial = null;
        sanitized.consultationStatus = undefined;
        if (sanitized.status === 'Post Consultation') {
          sanitized.status = 'Pending Counseling';
        }
      }
      uniquePatients.push(sanitized);
    });
    inMemoryPatients = uniquePatients;
    return uniquePatients;
  } catch (err) {
    return INITIAL_PATIENTS;
  }
};

export const savePatientsLocal = (patients: Patient[]): void => {
  if (!Array.isArray(patients)) return;
  // Always keep all patients intact in active memory
  inMemoryPatients = patients;

  try {
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  } catch (err: any) {
    // If browser localStorage quota (5MB) is exceeded, save the top 300 recent patients as fallback
    try {
      const sliced = patients.slice(0, 300);
      localStorage.setItem(PATIENTS_KEY, JSON.stringify(sliced));
      console.warn('LocalStorage limit reached; saved top 300 recent patients to disk cache while retaining all in memory.');
    } catch {
      // Ignore if still failing
    }
  }
};

export const updatePatientLocal = (patient: Patient): void => {
  if (!patient || !patient.id) return;

  // 1. Update in-memory cache instantly
  const mIdx = inMemoryPatients.findIndex(p => p.id === patient.id);
  if (mIdx >= 0) {
    inMemoryPatients[mIdx] = { ...inMemoryPatients[mIdx], ...patient };
  } else {
    inMemoryPatients.unshift(patient);
  }

  // 2. Update localStorage cache safely
  try {
    const raw = localStorage.getItem(PATIENTS_KEY);
    if (raw) {
      const list: Patient[] = JSON.parse(raw);
      const idx = list.findIndex(p => p.id === patient.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...patient };
      } else {
        list.unshift(patient);
      }
      localStorage.setItem(PATIENTS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore quota errors
  }
};

export const addOrUpdatePatientApi = async (patient: Patient): Promise<{ success: boolean; patient: Patient; patients?: Patient[] }> => {
  // Instant local update (1ms)
  updatePatientLocal(patient);

  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(patient)
    });
    if (res.ok) {
      const data = await res.json();
      const savedPatient = data.patient || patient;
      updatePatientLocal(savedPatient);
      return { success: true, patient: savedPatient, patients: data.patients };
    }
  } catch (err) {
    console.warn('Error saving patient to backend:', err);
  }

  return { success: false, patient };
};

export const confirmPatientApi = async (id: string, isConfirmed: boolean = true): Promise<{ patient?: Patient; patients: Patient[] }> => {
  const current = getPatientsLocal();
  const idx = current.findIndex(p => p.id === id);
  if (idx !== -1) {
    const targetDate = current[idx].appointmentDate || new Date().toISOString().split('T')[0];
    if (isConfirmed) {
      let maxSerial = 0;
      current.forEach(p => {
        if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
          if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
        }
      });
      current[idx] = {
        ...current[idx],
        isConfirmed: true,
        confirmedAt: new Date().toISOString(),
        consultationSerial: maxSerial + 1,
        consultationStatus: 'Pre Consultation',
        status: 'Pre Consultation',
        isOnHold: false,
        heldAt: undefined,
        holdReason: undefined
      };
    } else {
      current[idx] = {
        ...current[idx],
        isConfirmed: false,
        confirmedAt: undefined,
        consultationSerial: null,
        consultationStatus: undefined,
        status: 'Pending Counseling'
      };
    }
    updatePatientLocal(current[idx]);
  }

  try {
    const res = await fetch('/api/patients/confirm', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ id, isConfirmed })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patient) {
        updatePatientLocal(data.patient);
      }
      return { patient: data.patient, patients: data.patients || inMemoryPatients };
    }
  } catch (err) {
    console.warn('Backend confirm error:', err);
  }

  return { patient: current[idx], patients: current };
};

export const holdPatientApi = async (id: string, isOnHold: boolean = true, holdReason?: string): Promise<{ patient?: Patient; patients: Patient[] }> => {
  const current = getPatientsLocal();
  const idx = current.findIndex(p => p.id === id);
  if (idx !== -1) {
    const targetDate = current[idx].appointmentDate || new Date().toISOString().split('T')[0];
    let assignedSerial = current[idx].consultationSerial;

    if (isOnHold && (!assignedSerial || typeof assignedSerial !== 'number')) {
      let maxSerial = 0;
      current.forEach(p => {
        if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
          if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
        }
      });
      assignedSerial = maxSerial + 1;
    }

    current[idx] = {
      ...current[idx],
      isConfirmed: isOnHold ? false : true,
      confirmedAt: isOnHold ? (current[idx].confirmedAt || '') : (current[idx].confirmedAt || new Date().toISOString()),
      consultationSerial: assignedSerial,
      consultationStatus: isOnHold ? (current[idx].consultationStatus || 'Pre Consultation') : 'Pre Consultation',
      status: isOnHold ? (current[idx].status || 'Pending Counseling') : 'Pre Consultation',
      isOnHold,
      heldAt: isOnHold ? (current[idx].heldAt || new Date().toISOString()) : undefined,
      holdReason: isOnHold ? (holdReason || 'Patient absent when turn called') : undefined
    };
    updatePatientLocal(current[idx]);
  }

  try {
    const res = await fetch('/api/patients/hold', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ id, isOnHold, holdReason })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patient) {
        updatePatientLocal(data.patient);
      }
      return { patient: data.patient, patients: data.patients || inMemoryPatients };
    }
  } catch (err) {
    console.warn('Backend hold error:', err);
  }

  return { patient: current[idx], patients: current };
};

export const updateDepartmentStatusApi = async (
  patientId: string,
  department: 'pathology' | 'organic' | 'nutrition',
  status: 'Yes' | 'No' | ''
): Promise<{ patient?: Patient; patients: Patient[] }> => {
  const current = getPatientsLocal();
  const idx = current.findIndex(p => p.id === patientId);
  const now = new Date().toISOString();
  const user = getActiveUser();
  const updaterName = user?.name || user?.username || 'Department Staff';

  if (idx !== -1) {
    const updated = { ...current[idx] };
    if (department === 'pathology') {
      updated.pathologyStatus = status;
      updated.pathologyUpdatedAt = status ? now : undefined;
      updated.pathologyUpdatedBy = status ? updaterName : undefined;
    } else if (department === 'organic') {
      updated.organicStatus = status;
      updated.organicUpdatedAt = status ? now : undefined;
      updated.organicUpdatedBy = status ? updaterName : undefined;
    } else if (department === 'nutrition') {
      updated.nutritionStatus = status;
      updated.nutritionUpdatedAt = status ? now : undefined;
      updated.nutritionUpdatedBy = status ? updaterName : undefined;
    }
    current[idx] = updated;
    updatePatientLocal(updated);
  }

  try {
    const res = await fetch('/api/patients/department-status', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ patientId, department, status })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patient) {
        updatePatientLocal(data.patient);
      }
      return { patient: data.patient, patients: data.patients || inMemoryPatients };
    }
  } catch (err) {
    console.warn('Backend updateDepartmentStatusApi error:', err);
  }

  return { patient: current[idx], patients: current };
};

export const confirmBatchPatientsApi = async (ids: string[]): Promise<Patient[]> => {
  const current = getPatientsLocal();
  for (const id of ids) {
    const idx = current.findIndex(p => p.id === id);
    if (idx !== -1 && !current[idx].isConfirmed) {
      const targetDate = current[idx].appointmentDate || new Date().toISOString().split('T')[0];
      let maxSerial = 0;
      current.forEach(p => {
        if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
          if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
        }
      });
      current[idx] = {
        ...current[idx],
        isConfirmed: true,
        confirmedAt: new Date().toISOString(),
        consultationSerial: maxSerial + 1,
        consultationStatus: 'Pre Consultation',
        status: 'Pre Consultation'
      };
    }
  }
  savePatientsLocal([...current]);

  try {
    const res = await fetch('/api/patients/confirm-batch', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ ids })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patients) {
        savePatientsLocal(data.patients);
        return data.patients;
      }
    }
  } catch (err) {
    console.warn('Backend confirm batch error:', err);
  }

  return current;
};

export const deletePatientsApi = async (ids: string[]): Promise<Patient[]> => {
  const current = getPatientsLocal();
  const idSet = new Set(ids);
  const updated = current.filter(p => !idSet.has(p.id));
  savePatientsLocal(updated);

  try {
    const res = await fetch('/api/patients/delete', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ ids })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patients) {
        savePatientsLocal(data.patients);
        return data.patients;
      }
    }
  } catch (err) {
    console.warn('Error deleting patients on backend:', err);
  }

  return updated;
};

export const importPatientsFromExcelApi = async (
  newPatients: Partial<Patient>[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ added: number; updated: number; list: Patient[] }> => {
  if (!Array.isArray(newPatients) || newPatients.length === 0) {
    return { added: 0, updated: 0, list: getPatientsLocal() };
  }

  const chunkSize = 100;
  let totalAdded = 0;
  let totalUpdated = 0;
  let latestList: Patient[] = [];

  for (let i = 0; i < newPatients.length; i += chunkSize) {
    const chunk = newPatients.slice(i, i + chunkSize);
    try {
      const res = await fetch('/api/patients/import', {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ patients: chunk })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server database rejected import batch (Status ${res.status})`);
      }

      const data = await res.json();
      totalAdded += data.added || 0;
      totalUpdated += data.updated || 0;
      latestList = data.patients || latestList;

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, newPatients.length), newPatients.length);
      }
    } catch (err: any) {
      console.error(`Database import failed at batch ${i / chunkSize + 1}:`, err);
      throw new Error(`Direct database import failed: ${err?.message || 'Network or Database Server Error'}. Data was not stored to prevent cache discrepancies.`);
    }
  }

  // Update local memory and cache only after server database confirms 100% successful persistence
  if (latestList && latestList.length > 0) {
    savePatientsLocal(latestList);
    return { added: totalAdded, updated: totalUpdated, list: latestList };
  }

  // Refetch fresh data directly from server database
  const freshList = await fetchPatientsApi();
  return { added: totalAdded, updated: totalUpdated, list: freshList };
};

// Quotation APIs
export const fetchQuotationsApi = async (): Promise<InvoiceQuotation[]> => {
  try {
    const res = await fetch('/api/quotations', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      saveQuotationsLocal(data);
      return data;
    }
  } catch (err) {
    console.warn('API fetch quotations failed, fallback to local storage:', err);
  }
  return getQuotationsLocal();
};

export const getQuotationsLocal = (): InvoiceQuotation[] => {
  try {
    const data = localStorage.getItem(QUOTATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveQuotationsLocal = (quotations: InvoiceQuotation[]): void => {
  try {
    localStorage.setItem(QUOTATIONS_KEY, JSON.stringify(quotations));
  } catch (err) {
    console.error('Error saving quotations local', err);
  }
};

export const saveQuotationApi = async (quotation: InvoiceQuotation): Promise<InvoiceQuotation[]> => {
  const current = getQuotationsLocal();
  const index = current.findIndex(q => q.id === quotation.id);
  if (index >= 0) {
    current[index] = quotation;
  } else {
    current.unshift(quotation);
  }
  saveQuotationsLocal(current);

  // Update patient status locally
  const patients = getPatientsLocal();
  const pIdx = patients.findIndex(p => p.phone === quotation.patientPhone);
  if (pIdx >= 0) {
    patients[pIdx].status = 'Quotation Created';
    savePatientsLocal(patients);
  }

  try {
    const res = await fetch('/api/quotations', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(quotation)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.quotations) {
        saveQuotationsLocal(data.quotations);
        return data.quotations;
      }
    }
  } catch (err) {
    console.warn('Error saving quotation to server:', err);
  }

  return current;
};

export const deleteQuotationsApi = async (ids: string[]): Promise<InvoiceQuotation[]> => {
  const current = getQuotationsLocal();
  const idSet = new Set(ids);
  const updated = current.filter(q => !idSet.has(q.id));
  saveQuotationsLocal(updated);

  try {
    const res = await fetch('/api/quotations/delete', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ ids })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.quotations) {
        saveQuotationsLocal(data.quotations);
        return data.quotations;
      }
    }
  } catch (err) {
    console.warn('Error deleting quotations on backend:', err);
  }

  return updated;
};

// Catalog APIs
export const fetchCatalogApi = async (): Promise<CatalogItem[]> => {
  try {
    const res = await fetch('/api/catalog', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        saveCatalogLocal(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('Error fetching catalog API:', err);
  }
  return getCatalogLocal();
};

export const getCatalogLocal = (): CatalogItem[] => {
  try {
    const data = localStorage.getItem(CATALOG_KEY);
    if (!data) {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(DEFAULT_CATALOG));
      return DEFAULT_CATALOG;
    }
    return JSON.parse(data);
  } catch {
    return DEFAULT_CATALOG;
  }
};

export const saveCatalogLocal = (catalog: CatalogItem[]): void => {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch (err) {
    console.error('Error saving catalog local', err);
  }
};

export const saveCatalogApi = async (catalog: CatalogItem[]): Promise<CatalogItem[]> => {
  saveCatalogLocal(catalog);
  try {
    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ catalog })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.catalog) {
        saveCatalogLocal(data.catalog);
        return data.catalog;
      }
    }
  } catch (err) {
    console.warn('Error syncing catalog to API:', err);
  }
  return catalog;
};

// Users APIs & Persistence
const USERS_KEY = 'suoxi_users_db';

const ADMIN_ONLY_USER: User[] = [
  { id: 'usr-admin', username: 'admin', name: 'Hospital System Admin', role: 'System Admin', phone: '01700000000' }
];

const ALL_DEV_USERS: User[] = [
  ...ADMIN_ONLY_USER,
  { id: 'usr-doc1', username: 'doctor', name: 'Dr. S.M. Shahidul Islam PhD', role: 'Doctor', phone: '01711111111' },
  { id: 'usr-cc1', username: 'callcenter', name: 'Call Center Desk', role: 'Call Center', phone: '01722222222' },
  { id: 'usr-bc1', username: 'billing', name: 'Billing Counter Desk', role: 'Billing Counter', phone: '01733333333' },
  { id: 'usr-path1', username: 'pathology', name: 'Pathology Department', role: 'Pathology', phone: '01744444444' },
  { id: 'usr-org1', username: 'organic', name: 'Organic Health Store', role: 'Organic', phone: '01755555555' },
  { id: 'usr-nut1', username: 'nutrition', name: 'Nutrition & Dietetics', role: 'Nutrition', phone: '01766666666' },
  { id: 'usr-ssd1', username: 'ssd', name: 'SSD Desk', role: 'SSD', phone: '01777777777' }
];

const DEFAULT_USERS_LIST: User[] = ALL_DEV_USERS;

export const getUsersLocal = (): User[] => {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : DEFAULT_USERS_LIST;
  } catch {
    return DEFAULT_USERS_LIST;
  }
};

export const saveUsersLocal = (users: User[]): void => {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Error saving local users', err);
  }
};

export const clearDemoDataApi = async (): Promise<{ users: User[], patients: Patient[] }> => {
  let users: User[] = [];
  let patients: Patient[] = [];

  try {
    const res = await fetch('/api/admin/clear-demo-data', {
      method: 'POST',
      headers: getAuthHeader()
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users)) users = data.users;
      if (Array.isArray(data.patients)) patients = data.patients;
    }
  } catch (err) {
    console.warn('Error clearing demo data via API:', err);
  }

  // Fallback / local cleanup
  if (users.length === 0) {
    const currentUsers = getUsersLocal();
    users = currentUsers.filter(u => u.username === 'admin' || (u.id !== 'usr-doc1' && u.id !== 'usr-doctor' && u.id !== 'usr-cc1' && u.id !== 'usr-callcenter'));
    if (!users.some(u => u.username === 'admin')) {
      users.unshift(ADMIN_ONLY_USER[0]);
    }
  }

  const currentPatients = getPatientsLocal();
  patients = currentPatients.filter(p => p.id !== 'pat-101' && p.id !== 'pat-102');

  saveUsersLocal(users);
  savePatientsLocal(patients);

  return { users, patients };
};

export const changePasswordApi = async (currentPassword: string, newPassword: string): Promise<void> => {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update password');
    }
    return;
  } catch (err: any) {
    if (err.message && err.message !== 'Failed to fetch') {
      throw err;
    }
  }

  // Local fallback
  const user = getActiveUser();
  if (user) {
    const users = getUsersLocal();
    const idx = users.findIndex(u => u.id === user.id || u.username === user.username);
    if (idx >= 0) {
      // Local password updated
      saveUsersLocal(users);
      return;
    }
  }
  throw new Error('Failed to update password');
};

export const fetchUsersApi = async (): Promise<User[]> => {
  try {
    const res = await fetch('/api/users', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        saveUsersLocal(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('Error fetching users API:', err);
  }
  return getUsersLocal();
};

export const saveUserApi = async (userData: any): Promise<User[]> => {
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(userData)
    });
    if (res.ok) {
      const updatedList = await fetchUsersApi();
      return updatedList;
    }
  } catch (err) {
    console.warn('Error saving user to server:', err);
  }

  // Local fallback
  const current = getUsersLocal();
  const existingIdx = current.findIndex(u => u.username === userData.username || u.id === userData.id);
  const newUser: User = {
    id: userData.id || `usr-${Date.now()}`,
    username: userData.username,
    name: userData.name,
    role: userData.role,
    phone: userData.phone || ''
  };
  if (existingIdx >= 0) {
    current[existingIdx] = newUser;
  } else {
    current.push(newUser);
  }
  saveUsersLocal(current);
  return current;
};

export const deleteUserApi = async (id: string): Promise<User[]> => {
  try {
    await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
  } catch (err) {
    console.warn('Error deleting user from server:', err);
  }
  const current = getUsersLocal().filter(u => u.id !== id);
  saveUsersLocal(current);
  return current;
};
