import { Patient, InvoiceQuotation, CatalogItem, User } from '../types';
import { DEFAULT_CATALOG } from '../data/defaultCatalog';

const PATIENTS_KEY = 'suoxi_patients_db';
const QUOTATIONS_KEY = 'suoxi_quotations_db';
const CATALOG_KEY = 'suoxi_catalog_db';
const AUTH_KEY = 'suoxi_auth_user';

// Initial sample patient data (development only)
const DEMO_PATIENTS_LIST: Patient[] = [
  {
    id: 'pat-101',
    name: 'MD. RAFIQUL ISLAM',
    phone: '01711223344',
    age: 52,
    gender: 'Male',
    address: 'Dhanmondi, Dhaka',
    doctorName: 'Prof. Dr. SM Shahidullah (Acupuncture Expert)',
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

const INITIAL_PATIENTS: Patient[] = import.meta.env.PROD ? [] : DEMO_PATIENTS_LIST;

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

export interface InitDataResponse {
  patients: Patient[];
  quotations: InvoiceQuotation[];
  catalog: CatalogItem[];
  users: User[];
  dbMode?: string;
}

export const fetchInitApi = async (): Promise<InitDataResponse | null> => {
  const user = getActiveUser();
  if (!user || !user.token) {
    return null;
  }
  try {
    const res = await fetch('/api/init', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (data) {
        if (Array.isArray(data.patients)) savePatientsLocal(data.patients);
        if (Array.isArray(data.quotations)) saveQuotationsLocal(data.quotations);
        if (Array.isArray(data.catalog)) saveCatalogLocal(data.catalog);
        if (Array.isArray(data.users)) saveUsersLocal(data.users);
        return {
          patients: data.patients || [],
          quotations: data.quotations || [],
          catalog: data.catalog || DEFAULT_CATALOG,
          users: data.users || [],
          dbMode: data.dbMode
        };
      }
    }
  } catch (err) {
    console.warn('Init API fetch failed, using local caches:', err);
  }
  return {
    patients: getPatientsLocal(),
    quotations: getQuotationsLocal(),
    catalog: getCatalogLocal(),
    users: getUsersLocal()
  };
};

// Patient APIs
export const fetchPatientsApi = async (): Promise<Patient[]> => {
  try {
    const res = await fetch('/api/patients', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      savePatientsLocal(data);
      return data;
    }
  } catch (err) {
    console.warn('API fetch failed, reading local cache:', err);
  }
  return getPatientsLocal();
};

export const getPatientsLocal = (): Patient[] => {
  try {
    const data = localStorage.getItem(PATIENTS_KEY);
    let patients: Patient[] = INITIAL_PATIENTS;
    if (data) {
      patients = JSON.parse(data);
    }
    // Ensure strictly unique IDs across loaded patients
    const seen = new Set<string>();
    const uniquePatients: Patient[] = [];
    patients.forEach((p, idx) => {
      let id = p.id;
      if (!id || seen.has(id)) {
        id = `pat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`;
      }
      seen.add(id);
      uniquePatients.push({ ...p, id });
    });
    return uniquePatients;
  } catch (err) {
    return INITIAL_PATIENTS;
  }
};

export const savePatientsLocal = (patients: Patient[]): void => {
  try {
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  } catch (err) {
    console.error('Error saving local patients', err);
  }
};

export const addOrUpdatePatientApi = async (patient: Patient): Promise<Patient[]> => {
  // Optimistic local update
  const current = getPatientsLocal();
  const existingIdx = current.findIndex(p => p.id === patient.id || (patient.phone && p.phone === patient.phone));
  if (existingIdx >= 0) {
    current[existingIdx] = { ...current[existingIdx], ...patient };
  } else {
    current.unshift(patient);
  }
  savePatientsLocal(current);

  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(patient)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.patients) {
        savePatientsLocal(data.patients);
        return data.patients;
      }
    }
  } catch (err) {
    console.warn('Error saving patient to backend:', err);
  }

  return current;
};

export const importPatientsFromExcelApi = async (newPatients: Partial<Patient>[]): Promise<{ added: number; updated: number; list: Patient[] }> => {
  try {
    const res = await fetch('/api/patients/import', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ patients: newPatients })
    });
    if (res.ok) {
      const data = await res.json();
      savePatientsLocal(data.patients);
      return { added: data.added, updated: data.updated, list: data.patients };
    } else {
      const errData = await res.json().catch(() => ({}));
      const errorMsg = errData.error || `Server import failed (Status ${res.status})`;
      console.error('Excel import error from server:', res.status, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (err: any) {
    console.warn('Backend Excel import error:', err?.message || err);
    // If backend threw an error response, rethrow to inform UI
    if (err?.message && !err.message.includes('fetch')) {
      throw err;
    }
  }

  // Fallback client-side logic
  const current = getPatientsLocal();
  let added = 0;
  let updated = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  newPatients.forEach((p, idx) => {
    if (!p.name && !p.phone) return;
    const rawPhone = p.phone ? String(p.phone).trim() : '';
    const cleanPhone = rawPhone || `01700${Math.floor(100000 + Math.random() * 900000)}`;
    const cleanName = p.name ? String(p.name).trim() : `Patient ${cleanPhone}`;

    const existingIdx = current.findIndex(x => x.phone === cleanPhone && cleanPhone !== '01700000000');

    const formattedPatient: Patient = {
      id: existingIdx >= 0 ? current[existingIdx].id : (p.id || `pat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`),
      serialNo: p.serialNo || '',
      name: cleanName,
      phone: cleanPhone,
      age: p.age || '',
      gender: p.gender || 'Other',
      address: p.address || '',
      doctorName: p.doctorName || 'Senior Counseling Doctor',
      appointmentDate: p.appointmentDate || todayStr,
      appointmentTime: p.appointmentTime || '09:00 AM',
      department: p.department || 'Acupuncture',
      status: p.status || 'Pending Counseling',
      createdAt: new Date().toISOString(),
      notes: p.remark || p.notes || '',
      remark: p.remark || ''
    };

    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...formattedPatient };
      updated++;
    } else {
      current.unshift(formattedPatient);
      added++;
    }
  });

  savePatientsLocal(current);
  return { added, updated, list: current };
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
  { id: 'usr-doc1', username: 'doctor', name: 'Prof. Dr. SM Shahidullah', role: 'Doctor', phone: '01711111111' },
  { id: 'usr-cc1', username: 'callcenter', name: 'Call Center Desk', role: 'Call Center', phone: '01722222222' }
];

const DEFAULT_USERS_LIST: User[] = import.meta.env.PROD ? ADMIN_ONLY_USER : ALL_DEV_USERS;

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
