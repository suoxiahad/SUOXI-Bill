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
  dbMode?: string;
}

export const fetchInitApi = async (): Promise<InitDataResponse | null> => {
  const user = getActiveUser();
  const localPatients = getPatientsLocal();
  const localQuotations = getQuotationsLocal();
  const localCatalog = getCatalogLocal();
  const localUsers = getUsersLocal();

  if (!user || !user.token) {
    return {
      patients: localPatients,
      quotations: localQuotations,
      catalog: localCatalog,
      users: localUsers
    };
  }

  try {
    const res = await fetch('/api/init', { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const serverPatients = Array.isArray(data.patients) ? data.patients : [];
        const serverQuotations = Array.isArray(data.quotations) ? data.quotations : [];
        const serverCatalog = Array.isArray(data.catalog) && data.catalog.length > 0 ? data.catalog : localCatalog;
        const serverUsers = Array.isArray(data.users) && data.users.length > 0 ? data.users : localUsers;

        savePatientsLocal(serverPatients);
        saveQuotationsLocal(serverQuotations);
        saveCatalogLocal(serverCatalog);
        saveUsersLocal(serverUsers);

        return {
          patients: serverPatients,
          quotations: serverQuotations,
          catalog: serverCatalog,
          users: serverUsers,
          dbMode: data.dbMode
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
    users: localUsers
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

export const searchPatientsLiveApi = async (query: string): Promise<Patient[]> => {
  if (!query || !query.trim()) return [];
  try {
    const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query.trim())}`, {
      headers: getAuthHeader()
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const current = getPatientsLocal();
        const merged = mergePatientsList(data, current);
        savePatientsLocal(merged);
        return data;
      }
    }
  } catch (err) {
    console.warn('Live patient search API error:', err);
  }
  return [];
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
  const existingIdx = patient.id ? current.findIndex(p => p.id === patient.id) : -1;
  if (existingIdx >= 0) {
    current[existingIdx] = { ...current[existingIdx], ...patient };
  } else {
    const newRecord: Patient = {
      ...patient,
      id: patient.id || `pat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    };
    current.unshift(newRecord);
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
      console.warn('Excel import notice from server:', res.status, errorMsg);
    }
  } catch (err: any) {
    console.warn('Backend Excel import network issue, saving locally:', err?.message || err);
  }

  // Fallback client-side logic
  const current = getPatientsLocal();
  let added = 0;
  let updated = 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const newPatientsBatch: Patient[] = [];

  newPatients.forEach((p, idx) => {
    if (!p.name && !p.phone) return;
    const rawPhone = p.phone ? String(p.phone).trim() : '';
    const cleanPhone = rawPhone || `01700${Math.floor(100000 + Math.random() * 900000)}`;
    const cleanName = p.name ? String(p.name).trim() : `Patient ${cleanPhone}`;

    // Only update if explicit p.id matches an existing record.
    // Every row in the uploaded Excel represents an appointment entry - duplicate phone numbers must ALL be saved as separate appointments!
    const existingIdx = p.id ? current.findIndex(x => x.id === p.id) : -1;

    let cleanSerial = '';
    if (p.serialNo) {
      const match = String(p.serialNo).match(/\b\d+\b/);
      if (match) cleanSerial = match[0];
    }
    if (!cleanSerial) {
      cleanSerial = String(idx + 1);
    }

    const uniqueId = existingIdx >= 0
      ? current[existingIdx].id
      : (p.id || `pat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`);

    const formattedPatient: Patient = {
      id: uniqueId,
      serialNo: cleanSerial,
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
      newPatientsBatch.push(formattedPatient);
      added++;
    }
  });

  const updatedCurrent = [...newPatientsBatch, ...current];
  savePatientsLocal(updatedCurrent);
  return { added, updated, list: updatedCurrent };
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
  { id: 'usr-bc1', username: 'billing', name: 'Billing Counter Desk', role: 'Billing Counter', phone: '01733333333' }
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
