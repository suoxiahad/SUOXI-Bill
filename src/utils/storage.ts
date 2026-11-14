import { Patient, InvoiceQuotation, CatalogItem, User } from '../types';
import { DEFAULT_CATALOG } from '../data/defaultCatalog';
import { idbGet, idbSet, idbDel, idbClear, migrateFromLocalStorageToIndexedDb } from './indexedDb';
import { makeUniqueId } from './id';

// Automatically migrate heavy browser data from localStorage to IndexedDB once (0 data loss)
if (typeof window !== 'undefined') {
  migrateFromLocalStorageToIndexedDb().catch(console.warn);
}

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

// In-memory runtime cache for high-volume patient support (bypasses 5MB localStorage limit and provides 0ms access)
let inMemoryPatients: Patient[] = [];
let inMemoryQuotations: InvoiceQuotation[] = [];
let inMemoryCatalog: CatalogItem[] = [];

const IDB_DEBOUNCE_MS = 5000;
let patientsIdbTimer: ReturnType<typeof setTimeout> | null = null;
let quotationsIdbTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdbDebounceTimers(): void {
  if (patientsIdbTimer) {
    clearTimeout(patientsIdbTimer);
    patientsIdbTimer = null;
  }
  if (quotationsIdbTimer) {
    clearTimeout(quotationsIdbTimer);
    quotationsIdbTimer = null;
  }
}

function schedulePatientsIdbWrite(): void {
  if (patientsIdbTimer) return;
  patientsIdbTimer = setTimeout(() => {
    patientsIdbTimer = null;
    idbSet(PATIENTS_KEY, inMemoryPatients).catch(() => {});
  }, IDB_DEBOUNCE_MS);
}

function scheduleQuotationsIdbWrite(): void {
  if (quotationsIdbTimer) return;
  quotationsIdbTimer = setTimeout(() => {
    quotationsIdbTimer = null;
    idbSet(QUOTATIONS_KEY, inMemoryQuotations).catch(() => {});
  }, IDB_DEBOUNCE_MS);
}

function writePatientsLightSlice(): void {
  try {
    const lightSlice = inMemoryPatients.slice(0, 50);
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(lightSlice));
  } catch {
    try {
      localStorage.removeItem(PATIENTS_KEY);
    } catch {}
  }
}

function writeQuotationsLightSlice(): void {
  try {
    const lightSlice = inMemoryQuotations.slice(0, 10);
    localStorage.setItem(QUOTATIONS_KEY, JSON.stringify(lightSlice));
  } catch {
    try {
      localStorage.removeItem(QUOTATIONS_KEY);
    } catch {}
  }
}

export const patchPatientsDeltaLocal = (changedPatients: Patient[]): void => {
  if (!Array.isArray(changedPatients) || changedPatients.length === 0) return;
  if (inMemoryPatients.length === 0) {
    inMemoryPatients = [...getPatientsLocal()];
  }
  const indexById = new Map<string, number>();
  for (let i = 0; i < inMemoryPatients.length; i++) {
    const p = inMemoryPatients[i];
    if (p && p.id) indexById.set(String(p.id), i);
  }
  const newItems: Patient[] = [];
  for (const item of changedPatients) {
    if (!item || !item.id) continue;
    const key = String(item.id);
    const existingIdx = indexById.get(key);
    if (existingIdx !== undefined) {
      inMemoryPatients[existingIdx] = item;
    } else {
      newItems.push(item);
    }
  }
  if (newItems.length > 0) {
    inMemoryPatients.unshift(...newItems);
  }
  writePatientsLightSlice();
  schedulePatientsIdbWrite();
};

export const patchQuotationsDeltaLocal = (changedQuotations: InvoiceQuotation[]): void => {
  if (!Array.isArray(changedQuotations) || changedQuotations.length === 0) return;
  if (inMemoryQuotations.length === 0) {
    inMemoryQuotations = [...getQuotationsLocal()];
  }
  const indexById = new Map<string, number>();
  for (let i = 0; i < inMemoryQuotations.length; i++) {
    const q = inMemoryQuotations[i];
    if (q && q.id) indexById.set(String(q.id), i);
  }
  const newItems: InvoiceQuotation[] = [];
  for (const item of changedQuotations) {
    if (!item || !item.id) continue;
    const key = String(item.id);
    const existingIdx = indexById.get(key);
    if (existingIdx !== undefined) {
      inMemoryQuotations[existingIdx] = item;
    } else {
      newItems.push(item);
    }
  }
  if (newItems.length > 0) {
    inMemoryQuotations.unshift(...newItems);
  }
  writeQuotationsLightSlice();
  scheduleQuotationsIdbWrite();
};

export const invalidateLocalCaches = (): void => {
  clearIdbDebounceTimers();
  inMemoryPatients = [];
  inMemoryQuotations = [];
  inMemoryCatalog = [];
  try {
    localStorage.removeItem(PATIENTS_KEY);
    localStorage.removeItem(QUOTATIONS_KEY);
    localStorage.removeItem(CATALOG_KEY);
    localStorage.removeItem(DATA_VERSION_KEY);
  } catch (err) {
    console.warn('Failed clearing cached storage items:', err);
  }
  idbDel(PATIENTS_KEY).catch(() => {});
  idbDel(QUOTATIONS_KEY).catch(() => {});
  idbDel(CATALOG_KEY).catch(() => {});
};

export const hydrateStorageFromIndexedDb = async (): Promise<{
  patients: Patient[];
  quotations: InvoiceQuotation[];
  catalog: CatalogItem[];
}> => {
  try {
    const [idbPatients, idbQuotations, idbCatalog] = await Promise.all([
      idbGet<Patient[]>(PATIENTS_KEY),
      idbGet<InvoiceQuotation[]>(QUOTATIONS_KEY),
      idbGet<CatalogItem[]>(CATALOG_KEY)
    ]);

    if (Array.isArray(idbPatients) && idbPatients.length > 0) {
      inMemoryPatients = idbPatients;
    }
    if (Array.isArray(idbQuotations) && idbQuotations.length > 0) {
      inMemoryQuotations = idbQuotations;
    }
    if (Array.isArray(idbCatalog) && idbCatalog.length > 0) {
      inMemoryCatalog = idbCatalog;
    }
  } catch (err) {
    console.warn('Hydrating from IndexedDB encountered an issue:', err);
  }

  return {
    patients: inMemoryPatients.length > 0 ? inMemoryPatients : getPatientsLocal(),
    quotations: inMemoryQuotations.length > 0 ? inMemoryQuotations : getQuotationsLocal(),
    catalog: inMemoryCatalog.length > 0 ? inMemoryCatalog : getCatalogLocal()
  };
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

let inMemoryActiveUser: User | null = null;

// Active user authentication session
export const getActiveUser = (): User | null => {
  if (inMemoryActiveUser) return inMemoryActiveUser;
  try {
    const data = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
    if (data) {
      inMemoryActiveUser = JSON.parse(data);
      return inMemoryActiveUser;
    }
  } catch {
    // fallback
  }
  return null;
};

export const setActiveUser = (user: User | null): void => {
  inMemoryActiveUser = user;
  if (user) {
    const serialized = JSON.stringify(user);
    try {
      localStorage.setItem(AUTH_KEY, serialized);
    } catch (err: any) {
      console.warn('LocalStorage quota reached when setting auth user. Purging cached patient data and falling back to sessionStorage.', err);
      try {
        // Free quota by trimming cached patient list
        localStorage.removeItem(PATIENTS_KEY);
        localStorage.setItem(AUTH_KEY, serialized);
      } catch {
        // If still failing, store in sessionStorage
        try {
          sessionStorage.setItem(AUTH_KEY, serialized);
        } catch {}
      }
    }
  } else {
    try {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    } catch {}
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
  patientsTruncated?: boolean;
  quotationsTruncated?: boolean;
}

export const fetchInitApi = async (
  forceBypassCache = false,
  options?: { skipSavePatients?: boolean }
): Promise<InitDataResponse | null> => {
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

        if (!options?.skipSavePatients) {
          savePatientsLocal(serverPatients);
        }
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
          dataVersion: data.dataVersion,
          patientsTruncated: Boolean(data.patientsTruncated),
          quotationsTruncated: Boolean(data.quotationsTruncated)
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


export interface ChangesDataResponse {
  dataVersion: number;
  patients: Patient[];
  quotations: InvoiceQuotation[];
  catalog: CatalogItem[];
  truncated: boolean;
  fullInit?: InitDataResponse;
}

export const fetchChangesApi = async (since: number): Promise<ChangesDataResponse | null> => {
  const user = getActiveUser();
  if (!user || !user.token) return null;

  if (!Number.isFinite(since) || since <= 0) {
    const fullInit = await fetchInitApi(true);
    if (!fullInit) return null;
    return {
      dataVersion: Number(fullInit.dataVersion || 1),
      patients: fullInit.patients,
      quotations: fullInit.quotations,
      catalog: fullInit.catalog,
      truncated: true,
      fullInit
    };
  }

  try {
    const res = await fetch(`/api/changes?since=${encodeURIComponent(String(since))}&t=${Date.now()}`, {
      headers: getAuthHeader()
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data) return null;

    if (data.truncated) {
      const fullInit = await fetchInitApi(true);
      if (!fullInit) return null;
      return {
        dataVersion: Number(fullInit.dataVersion || data.dataVersion || since),
        patients: fullInit.patients,
        quotations: fullInit.quotations,
        catalog: fullInit.catalog,
        truncated: true,
        fullInit
      };
    }

    const changedPatients: Patient[] = Array.isArray(data.patients) ? data.patients : [];
    const changedQuotations: InvoiceQuotation[] = Array.isArray(data.quotations) ? data.quotations : [];
    const changedCatalog: CatalogItem[] = Array.isArray(data.catalog) ? data.catalog : [];

    // Mutate only changed entries in inMemoryPatients / inMemoryQuotations with debounced IndexedDB writes
    if (changedPatients.length > 0) {
      patchPatientsDeltaLocal(changedPatients);
    }

    if (changedQuotations.length > 0) {
      patchQuotationsDeltaLocal(changedQuotations);
    }

    if (changedCatalog.length > 0) {
      saveCatalogLocal(changedCatalog);
    }

    const nextVersion = Number(data.dataVersion || since);
    if (nextVersion > 0) {
      setStoredDataVersion(nextVersion);
    }

    return {
      dataVersion: nextVersion,
      patients: changedPatients,
      quotations: changedQuotations,
      catalog: changedCatalog,
      truncated: false
    };
  } catch (err) {
    console.warn('Delta changes API fetch failed:', err);
    return null;
  }
};

export interface PatientSummary {
  dataVersion: number;
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

export interface ReportsSummaryResponse {
  allTimeTotalPatients: number;
  allDoctors: string[];
  funnel: {
    totalAppointments: number;
    confirmedCount: number;
    unconfirmedCount: number;
    preConsultationCount: number;
    postConsultationCount: number;
  };
  instant: {
    instantCount: number;
    instantRevenue: number;
  };
  ed: {
    edCount: number;
  };
  departments: {
    totalPost: number;
    pathYes: number;
    pathNo: number;
    pathPending: number;
    orgYes: number;
    orgNo: number;
    orgPending: number;
    nutYes: number;
    nutNo: number;
    nutPending: number;
  };
  doctors: Array<{
    doctorName: string;
    preCount: number;
    postCount: number;
    totalConsulted: number;
  }>;
  professions: Array<{
    name: string;
    count: number;
  }>;
  comments: Array<{
    comment: string;
    count: number;
  }>;
  demographics: {
    total: number;
    male: number;
    female: number;
    other: number;
    ageGroups: {
      under20: number;
      age20to35: number;
      age36to50: number;
      age51to65: number;
      above65: number;
      unknown: number;
    };
  };
  quotations: {
    count: number;
    grandTotal: number;
    advancePaid: number;
    dueAmount: number;
  };
}

export const fetchReportsSummaryApi = async (options?: {
  dateFrom?: string;
  dateTo?: string;
  doctor?: string;
  q?: string;
}): Promise<ReportsSummaryResponse | null> => {
  try {
    const params = new URLSearchParams();
    if (options?.dateFrom) params.set('dateFrom', options.dateFrom);
    if (options?.dateTo) params.set('dateTo', options.dateTo);
    if (options?.doctor && options.doctor !== 'all') params.set('doctor', options.doctor);
    if (options?.q && options.q.trim()) params.set('q', options.q.trim());
    params.set('t', String(Date.now()));

    const res = await fetch(`/api/reports/summary?${params.toString()}`, {
      headers: getAuthHeader()
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Reports summary API fetch failed:', err);
  }
  return null;
};

export interface PatientsFetchResponse {
  patients: Patient[];
  truncated: boolean;
  fromServer: boolean;
}

// Patient APIs
export const fetchPatientsWithMetaApi = async (options?: {
  limit?: number;
  offset?: number;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  saveLocal?: boolean;
}): Promise<PatientsFetchResponse> => {
  try {
    let url = '/api/patients';
    if (options) {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.date) params.set('date', options.date);
      if (options.dateFrom) params.set('dateFrom', options.dateFrom);
      if (options.dateTo) params.set('dateTo', options.dateTo);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.patients) ? data.patients : null);
      const truncated = Array.isArray(data) ? false : Boolean(data?.truncated);
      if (rows) {
        if (options?.saveLocal !== false) {
          savePatientsLocal(rows);
        }
        return { patients: rows, truncated, fromServer: true };
      }
    }
  } catch (err) {
    console.warn('API fetch failed, reading local cache:', err);
  }

  let localList = getPatientsLocal();
  if (options?.date && options.date !== 'all') {
    localList = localList.filter(p => p.appointmentDate === options.date);
  } else if (options?.dateFrom || options?.dateTo) {
    localList = localList.filter(p => {
      const d = p.appointmentDate || '';
      if (!d) return false;
      if (options.dateFrom && d < options.dateFrom) return false;
      if (options.dateTo && d > options.dateTo) return false;
      return true;
    });
  }
  return { patients: localList, truncated: false, fromServer: false };
};

export const fetchPatientsApi = async (options?: {
  limit?: number;
  offset?: number;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Patient[]> => {
  const result = await fetchPatientsWithMetaApi(options);
  return result.patients;
};

export const searchPatientsLiveApi = async (
  query: string,
  limit = 50,
  date?: string,
  signal?: AbortSignal
): Promise<Patient[]> => {
  if (!query || !query.trim()) return [];
  try {
    let url = `/api/patients/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
    if (date && date !== 'all') {
      url += `&date=${encodeURIComponent(date)}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeader(),
      signal
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
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
        id = makeUniqueId();
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
  if (patientsIdbTimer) {
    clearTimeout(patientsIdbTimer);
    patientsIdbTimer = null;
  }
  // Always keep all patients intact in active memory (0ms access)
  inMemoryPatients = patients;
  // Persist full list to IndexedDB asynchronously without blocking the UI
  idbSet(PATIENTS_KEY, patients).catch(() => {});
  writePatientsLightSlice();
};

export const updatePatientLocal = (patient: Patient): void => {
  if (!patient || !patient.id) return;
  const pIdStr = String(patient.id).trim();
  const pSerialStr = patient.serialNo ? String(patient.serialNo).trim() : '';

  // 1. Update in-memory cache instantly (0ms)
  const mIdx = inMemoryPatients.findIndex(p => 
    String(p.id).trim() === pIdStr || 
    (pSerialStr && p.serialNo && String(p.serialNo).trim() === pSerialStr)
  );
  if (mIdx >= 0) {
    inMemoryPatients[mIdx] = { ...inMemoryPatients[mIdx], ...patient };
  } else {
    inMemoryPatients.unshift(patient);
  }

  // 2. Persist to IndexedDB asynchronously
  idbSet(PATIENTS_KEY, inMemoryPatients).catch(() => {});

  // 3. Update light localStorage cache safely
  try {
    const lightSlice = inMemoryPatients.slice(0, 50);
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(lightSlice));
  } catch {
    try {
      localStorage.removeItem(PATIENTS_KEY);
    } catch {}
  }
};

export const patchPatientsLocal = (updatedPatients: Patient[]): Patient[] => {
  if (!Array.isArray(updatedPatients) || updatedPatients.length === 0) {
    return getPatientsLocal();
  }
  const current = [...getPatientsLocal()];
  for (const patient of updatedPatients) {
    if (!patient) continue;
    const pIdStr = patient.id ? String(patient.id).trim() : '';
    const pSerialStr = patient.serialNo ? String(patient.serialNo).trim() : '';
    const pDateStr = patient.appointmentDate ? String(patient.appointmentDate).trim() : '';
    const pPhoneStr = patient.phone ? String(patient.phone).trim() : '';

    const idx = current.findIndex(p => {
      if (pIdStr && p.id && String(p.id).trim() === pIdStr) return true;
      if (pDateStr && pSerialStr && p.serialNo && String(p.serialNo).trim() === pSerialStr && p.appointmentDate === pDateStr) return true;
      if (pDateStr && pPhoneStr && pPhoneStr !== '01700000000' && p.phone && String(p.phone).trim() === pPhoneStr && p.appointmentDate === pDateStr) return true;
      return false;
    });

    if (idx >= 0) {
      current[idx] = { ...current[idx], ...patient };
    } else {
      current.unshift(patient);
    }
  }
  savePatientsLocal(current);
  return current;
};

export const addOrUpdatePatientApi = async (patient: Patient): Promise<{ success: boolean; patient: Patient }> => {
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
      return { success: true, patient: savedPatient };
    }
  } catch (err) {
    console.warn('Error saving patient to backend:', err);
  }

  return { success: false, patient };
};

export const confirmPatientApi = async (patientOrId: string | Patient, isConfirmed: boolean = true): Promise<{ patient?: Patient; patients: Patient[] }> => {
  const current = getPatientsLocal();
  const isObj = typeof patientOrId === 'object' && patientOrId !== null;
  const idStr = String(isObj ? patientOrId.id : patientOrId || '').trim();
  const serialStr = isObj && patientOrId.serialNo ? String(patientOrId.serialNo).trim() : '';
  const dateStr = isObj && patientOrId.appointmentDate ? String(patientOrId.appointmentDate).trim() : '';
  const phoneStr = isObj && patientOrId.phone ? String(patientOrId.phone).trim() : '';

  const idx = current.findIndex(p => {
    if (idStr && String(p.id).trim() === idStr) return true;
    if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
    if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
    if (!isObj && idStr && p.serialNo && String(p.serialNo).trim() === idStr) return true;
    return false;
  });

  const resolvedSerial = serialStr || (idx !== -1 ? current[idx].serialNo : undefined);
  const resolvedDate = dateStr || (idx !== -1 ? current[idx].appointmentDate : undefined);
  const resolvedPhone = phoneStr || (idx !== -1 ? current[idx].phone : undefined);
  const previousPatient = idx !== -1 ? { ...current[idx] } : null;

  if (idx !== -1) {
    if (isConfirmed) {
      current[idx] = {
        ...current[idx],
        isConfirmed: true,
        confirmedAt: current[idx].confirmedAt || new Date().toISOString(),
        consultationSerial: current[idx].consultationSerial ?? null,
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
      body: JSON.stringify({
        id: idStr,
        serialNo: resolvedSerial,
        appointmentDate: resolvedDate,
        phone: resolvedPhone,
        isConfirmed
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patient) {
        updatePatientLocal(data.patient);
      }
      return { patient: data.patient, patients: inMemoryPatients };
    } else {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || errData.message || `Server returned error (${res.status}) while confirming appointment`);
    }
  } catch (err) {
    if (previousPatient) {
      updatePatientLocal(previousPatient);
    }
    console.warn('Backend confirm error:', err);
    throw err;
  }
};

export const holdPatientApi = async (patientOrId: string | Patient, isOnHold: boolean = true, holdReason?: string): Promise<{ patient?: Patient; patients: Patient[] }> => {
  const current = getPatientsLocal();
  const isObj = typeof patientOrId === 'object' && patientOrId !== null;
  const idStr = String(isObj ? patientOrId.id : patientOrId || '').trim();
  const serialStr = isObj && patientOrId.serialNo ? String(patientOrId.serialNo).trim() : '';
  const dateStr = isObj && patientOrId.appointmentDate ? String(patientOrId.appointmentDate).trim() : '';
  const phoneStr = isObj && patientOrId.phone ? String(patientOrId.phone).trim() : '';

  const idx = current.findIndex(p => {
    if (idStr && String(p.id).trim() === idStr) return true;
    if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
    if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
    if (!isObj && idStr && p.serialNo && String(p.serialNo).trim() === idStr) return true;
    return false;
  });

  const resolvedSerial = serialStr || (idx !== -1 ? current[idx].serialNo : undefined);
  const resolvedDate = dateStr || (idx !== -1 ? current[idx].appointmentDate : undefined);
  const resolvedPhone = phoneStr || (idx !== -1 ? current[idx].phone : undefined);
  const previousPatient = idx !== -1 ? { ...current[idx] } : null;

  if (idx !== -1) {
    current[idx] = {
      ...current[idx],
      isConfirmed: isOnHold ? false : true,
      confirmedAt: isOnHold ? (current[idx].confirmedAt || '') : (current[idx].confirmedAt || new Date().toISOString()),
      consultationSerial: current[idx].consultationSerial ?? null,
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
      body: JSON.stringify({
        id: idStr,
        serialNo: resolvedSerial,
        appointmentDate: resolvedDate,
        phone: resolvedPhone,
        isOnHold,
        holdReason
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patient) {
        updatePatientLocal(data.patient);
      }
      return { patient: data.patient, patients: inMemoryPatients };
    } else {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || errData.message || `Server returned error (${res.status}) while updating hold status`);
    }
  } catch (err) {
    if (previousPatient) {
      updatePatientLocal(previousPatient);
    }
    console.warn('Backend hold error:', err);
    throw err;
  }
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
      return { patient: data.patient, patients: inMemoryPatients };
    }
  } catch (err) {
    console.warn('Backend updateDepartmentStatusApi error:', err);
  }

  return { patient: current[idx], patients: current };
};

export const confirmBatchPatientsApi = async (patientsOrIds: (string | Patient)[]): Promise<Patient[]> => {
  const current = getPatientsLocal();
  const payloadPatients: Array<{ id: string; serialNo?: string; appointmentDate?: string; phone?: string }> = [];
  const ids: string[] = [];

  const previousPatients: Patient[] = [];
  const optimisticUpdated: Patient[] = [];
  for (const item of patientsOrIds) {
    const isObj = typeof item === 'object' && item !== null;
    const idStr = String(isObj ? item.id : item || '').trim();
    const serialStr = isObj && item.serialNo ? String(item.serialNo).trim() : '';
    const dateStr = isObj && item.appointmentDate ? String(item.appointmentDate).trim() : '';
    const phoneStr = isObj && item.phone ? String(item.phone).trim() : '';

    const idx = current.findIndex(p => {
      if (idStr && String(p.id).trim() === idStr) return true;
      if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
      if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
      if (!isObj && idStr && p.serialNo && String(p.serialNo).trim() === idStr) return true;
      return false;
    });

    if (idx !== -1 && !current[idx].isConfirmed) {
      previousPatients.push({ ...current[idx] });
      current[idx] = {
        ...current[idx],
        isConfirmed: true,
        confirmedAt: current[idx].confirmedAt || new Date().toISOString(),
        consultationSerial: current[idx].consultationSerial ?? null,
        consultationStatus: 'Pre Consultation',
        status: 'Pre Consultation'
      };
      optimisticUpdated.push(current[idx]);
    }

    ids.push(idStr);
    payloadPatients.push({
      id: idStr,
      serialNo: serialStr || (idx !== -1 ? current[idx].serialNo : undefined),
      appointmentDate: dateStr || (idx !== -1 ? current[idx].appointmentDate : undefined),
      phone: phoneStr || (idx !== -1 ? current[idx].phone : undefined)
    });
  }
  savePatientsLocal([...current]);

  try {
    const res = await fetch('/api/patients/confirm-batch', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ ids, patients: payloadPatients })
    });
    if (res.ok) {
      const data = await res.json();
      const updatedRows: Patient[] = Array.isArray(data.updated) ? data.updated : optimisticUpdated;
      patchPatientsLocal(updatedRows);
      return updatedRows;
    } else {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || errData.message || `Server returned error (${res.status}) while confirming batch`);
    }
  } catch (err) {
    if (previousPatients.length > 0) {
      patchPatientsLocal(previousPatients);
    }
    console.warn('Backend confirm batch error:', err);
    throw err;
  }
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
      const deletedSet = new Set(Array.isArray(data.deletedIds) ? data.deletedIds : ids);
      const next = getPatientsLocal().filter(p => !deletedSet.has(p.id));
      savePatientsLocal(next);
      return next;
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

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, newPatients.length), newPatients.length);
      }
    } catch (err: any) {
      console.error(`Database import failed at batch ${i / chunkSize + 1}:`, err);
      throw new Error(`Direct database import failed: ${err?.message || 'Network or Database Server Error'}. Data was not stored to prevent cache discrepancies.`);
    }
  }

  // Refetch fresh data once after all batches succeed
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
  if (inMemoryQuotations.length > 0) {
    return inMemoryQuotations;
  }
  try {
    const data = localStorage.getItem(QUOTATIONS_KEY);
    if (data) {
      inMemoryQuotations = JSON.parse(data);
      return inMemoryQuotations;
    }
  } catch {
    // fallback
  }
  return [];
};

export const saveQuotationsLocal = (quotations: InvoiceQuotation[]): void => {
  if (!Array.isArray(quotations)) return;
  if (quotationsIdbTimer) {
    clearTimeout(quotationsIdbTimer);
    quotationsIdbTimer = null;
  }
  // Instant in-memory update (0ms)
  inMemoryQuotations = quotations;
  // Non-blocking async persist to IndexedDB (virtually unlimited quota)
  idbSet(QUOTATIONS_KEY, quotations).catch(() => {});
  writeQuotationsLightSlice();
};

export const saveQuotationApi = async (quotation: InvoiceQuotation): Promise<{ quotation: InvoiceQuotation; quotations: InvoiceQuotation[] }> => {
  const res = await fetch('/api/quotations', {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(quotation)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || errData.message || `Server returned error (${res.status}) while saving quotation`);
  }

  const data = await res.json();
  const savedQuotation: InvoiceQuotation = data?.quotation || quotation;
  let updatedQuotations: InvoiceQuotation[];

  if (Array.isArray(data?.quotations)) {
    updatedQuotations = data.quotations;
  } else {
    const current = getQuotationsLocal();
    const index = current.findIndex(q => q.id === savedQuotation.id);
    if (index >= 0) {
      current[index] = savedQuotation;
    } else {
      current.unshift(savedQuotation);
    }
    updatedQuotations = current;
  }

  saveQuotationsLocal(updatedQuotations);

  // Update exact patient status locally by patientId
  if (savedQuotation.patientId && savedQuotation.patientId !== 'walkin') {
    const patients = getPatientsLocal();
    const pIdx = patients.findIndex(p => p.id === savedQuotation.patientId);
    if (pIdx >= 0) {
      patients[pIdx].status = 'Quotation Created';
      savePatientsLocal(patients);
    }
  }

  return { quotation: savedQuotation, quotations: updatedQuotations };
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
  if (inMemoryCatalog.length > 0) {
    return inMemoryCatalog;
  }
  try {
    const data = localStorage.getItem(CATALOG_KEY);
    if (!data) {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(DEFAULT_CATALOG));
      inMemoryCatalog = DEFAULT_CATALOG;
      return DEFAULT_CATALOG;
    }
    inMemoryCatalog = JSON.parse(data);
    return inMemoryCatalog;
  } catch {
    return DEFAULT_CATALOG;
  }
};

export const saveCatalogLocal = (catalog: CatalogItem[]): void => {
  inMemoryCatalog = catalog;
  idbSet(CATALOG_KEY, catalog).catch(() => {});
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
