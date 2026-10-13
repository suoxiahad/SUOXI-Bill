import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Patient } from '../types';

// Initialize Firebase App instance
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Google Auth Provider with Google Sheets & Drive scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline'
});

// In-memory token management (per security guidelines: never in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface GoogleSheetsConfig {
  autoSyncEnabled: boolean;
  spreadsheetTitlePrefix: string;
  dateFormat: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD MMM YYYY';
  monthSpreadsheets: Record<string, { id: string; url: string; title: string }>;
  lastSyncTime?: string;
  lastSyncStatus?: 'idle' | 'success' | 'error' | 'syncing';
  lastSyncMessage?: string;
}

const SHEETS_CONFIG_KEY = 'suoxi_googlesheets_config';

export const DEFAULT_SHEETS_CONFIG: GoogleSheetsConfig = {
  autoSyncEnabled: true,
  spreadsheetTitlePrefix: 'Suoxi Hospital',
  dateFormat: 'YYYY-MM-DD',
  monthSpreadsheets: {},
  lastSyncStatus: 'idle',
  lastSyncMessage: 'Not synced yet'
};

export const getSheetsConfig = (): GoogleSheetsConfig => {
  try {
    const raw = localStorage.getItem(SHEETS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SHEETS_CONFIG, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to read sheets config from localStorage:', err);
  }
  return DEFAULT_SHEETS_CONFIG;
};

export const saveSheetsConfig = (config: Partial<GoogleSheetsConfig>): GoogleSheetsConfig => {
  const current = getSheetsConfig();
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save sheets config to localStorage:', err);
  }
  return updated;
};

/**
 * Initialize Auth listener for Google OAuth state
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token expired or not in memory; trigger need for re-auth if called
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Perform Google Sign-in to acquire Google Sheets OAuth access token
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to acquire OAuth access token for Google Sheets.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Helper: Format date string according to config
 */
export const formatDateTabName = (date: Date = new Date(), format: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD MMM YYYY' = 'YYYY-MM-DD'): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (format === 'DD-MM-YYYY') {
    return `${day}-${month}-${year}`;
  }
  if (format === 'DD MMM YYYY') {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${monthNames[date.getMonth()]} ${year}`;
  }
  return `${year}-${month}-${day}`;
};

/**
 * Helper: Get current month key & display title (e.g. key: "2026-10", title: "October 2026")
 */
export const getMonthKeyAndTitle = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthTitle = `${monthNames[monthIndex]} ${year}`;
  return { monthKey, monthTitle };
};

/**
 * Get or create the monthly spreadsheet for the current month
 */
export const getOrCreateMonthlySpreadsheet = async (
  token: string,
  date: Date = new Date()
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> => {
  const config = getSheetsConfig();
  const { monthKey, monthTitle } = getMonthKeyAndTitle(date);
  const prefix = config.spreadsheetTitlePrefix.trim() || 'Suoxi Hospital';
  const expectedTitle = `${prefix} - ${monthTitle}`;

  // Check if we already have an active spreadsheetId cached for this month
  const cachedSheet = config.monthSpreadsheets[monthKey];
  if (cachedSheet?.id) {
    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cachedSheet.id}?fields=spreadsheetId,properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        return {
          spreadsheetId: cachedSheet.id,
          spreadsheetUrl: cachedSheet.url,
          title: cachedSheet.title
        };
      }
    } catch {
      // If fetching fails, we'll proceed to create a new one
    }
  }

  // Create a new monthly spreadsheet via Google Sheets API
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: expectedTitle
      }
    })
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to create monthly Google Spreadsheet (${createRes.status})`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Update cached configuration
  const updatedMonthSheets = {
    ...config.monthSpreadsheets,
    [monthKey]: {
      id: spreadsheetId,
      url: spreadsheetUrl,
      title: expectedTitle
    }
  };
  saveSheetsConfig({ monthSpreadsheets: updatedMonthSheets });

  return { spreadsheetId, spreadsheetUrl, title: expectedTitle };
};

/**
 * Ensure the daily date tab exists in the monthly spreadsheet
 */
export const ensureDailyTabExists = async (
  token: string,
  spreadsheetId: string,
  tabName: string
): Promise<number | undefined> => {
  // 1. Fetch metadata to check if tab already exists
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!metaRes.ok) {
    const errBody = await metaRes.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to fetch spreadsheet structure (${metaRes.status})`);
  }

  const metaData = await metaRes.json();
  const sheets: Array<{ properties: { sheetId: number; title: string } }> = metaData.sheets || [];
  
  const existingTab = sheets.find(s => s.properties.title === tabName);
  if (existingTab) {
    return existingTab.properties.sheetId;
  }

  // 2. Add the sheet tab if it doesn't exist
  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: {
                rowCount: 300,
                columnCount: 15
              }
            }
          }
        }
      ]
    })
  });

  if (!batchRes.ok) {
    const errBody = await batchRes.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to create daily tab '${tabName}' (${batchRes.status})`);
  }

  const batchData = await batchRes.json();
  const newSheetId = batchData.replies?.[0]?.addSheet?.properties?.sheetId;
  return newSheetId;
};

/**
 * Pre-consultation columns as explicitly specified by user:
 * SL NO., Patient Name, Phone Number, Gender, Age, Address, disease, profession, doctor, Consultation Action
 */
export const PRE_CONSULTATION_HEADERS = [
  'SL NO.',
  'Patient Name',
  'Phone Number',
  'Gender',
  'Age',
  'Address',
  'disease',
  'profession',
  'doctor',
  'Consultation Action'
];

/**
 * Post-consultation columns as explicitly specified by user:
 * SL NO., Patient Name, Phone Number, Gender, Age, Address, disease, profession, comment, doctor, Consultation Action
 */
export const POST_CONSULTATION_HEADERS = [
  'SL NO.',
  'Patient Name',
  'Phone Number',
  'Gender',
  'Age',
  'Address',
  'disease',
  'profession',
  'comment',
  'doctor',
  'Consultation Action'
];

/**
 * Core Live Synchronization: Syncs Pre-consultation and Post-consultation patient records to daily sheet
 */
export const syncPatientsToDailySheet = async (
  token: string,
  patients: Patient[],
  targetDate: Date = new Date()
): Promise<{ success: boolean; spreadsheetUrl: string; tabName: string; countPre: number; countPost: number }> => {
  const config = getSheetsConfig();
  const tabName = formatDateTabName(targetDate, config.dateFormat);

  // 1. Get or create current month spreadsheet
  const { spreadsheetId, spreadsheetUrl } = await getOrCreateMonthlySpreadsheet(token, targetDate);

  // 2. Ensure daily tab exists
  const sheetId = await ensureDailyTabExists(token, spreadsheetId, tabName);

  // 3. Partition patients into Pre-Consultation and Post-Consultation lists
  // Pre-Consultation: All patients registered/arrived for today's consultation
  // Post-Consultation: Patients who moved to Post Consultation or have doctor counseling completed
  const prePatients = patients.filter(p => {
    // Patients currently in Pre Consultation or completed pre-consultation today
    return p.consultationStatus === 'Pre Consultation' || p.status === 'Pre Consultation' || !p.consultationStatus;
  });

  const postPatients = patients.filter(p => {
    return (
      p.consultationStatus === 'Post Consultation' ||
      p.status === 'Post Consultation' ||
      Boolean(p.postConsultationConfirmed) ||
      Boolean(p.preDoctorName && p.preConsultationAt)
    );
  });

  // Fallback: If prePatients is empty but patients exist, treat all current patients as pre list
  const activePrePatients = prePatients.length > 0 ? prePatients : patients;
  const activePostPatients = postPatients;

  // 4. Build Table Rows for Pre-Consultation (10 columns)
  const preRows: string[][] = activePrePatients.map((p, idx) => {
    const slNo = p.consultationSerial != null ? String(p.consultationSerial) : (p.serialNo || String(idx + 1));
    const name = p.name || '';
    const phone = p.phone || '';
    const gender = p.gender || '';
    const age = p.age != null ? String(p.age) : '';
    const address = p.address || '';
    const disease = p.remark || p.notes || '';
    const profession = p.profession || '';
    const doctor = p.preDoctorName || p.doctorName || '';
    
    // Consultation Action for Pre:
    const isDone = p.consultationStatus === 'Post Consultation' || p.status === 'Post Consultation' || Boolean(p.preDoctorName);
    const action = isDone ? 'Done' : 'Waiting';

    return [
      slNo,
      name,
      phone,
      gender,
      age,
      address,
      disease,
      profession,
      doctor,
      action
    ];
  });

  // 5. Build Table Rows for Post-Consultation (11 columns: comment & doctor separated)
  const postRows: string[][] = activePostPatients.map((p, idx) => {
    const slNo = p.consultationSerial != null ? String(p.consultationSerial) : (p.serialNo || String(idx + 1));
    const name = p.name || '';
    const phone = p.phone || '';
    const gender = p.gender || '';
    const age = p.age != null ? String(p.age) : '';
    const address = p.address || '';
    const disease = p.remark || p.notes || '';
    const profession = p.profession || '';
    const comment = p.consultationComment || '';
    const doctor = p.postDoctorName || p.preDoctorName || p.doctorName || '';

    // Consultation Action for Post:
    const action = p.postConsultationConfirmed 
      ? 'Confirmed' 
      : (p.status === 'Quotation Created' ? 'Quotation Created' : 'In Consultation');

    return [
      slNo,
      name,
      phone,
      gender,
      age,
      address,
      disease,
      profession,
      comment,
      doctor,
      action
    ];
  });

  // 6. Assemble complete matrix with distinct sections
  const matrix: string[][] = [];

  // Section 1: Pre-Consultation (10 columns)
  matrix.push([`📋 PRE-CONSULTATION RECORDS (${tabName})`, '', '', '', '', '', '', '', '', '']);
  matrix.push(PRE_CONSULTATION_HEADERS);
  if (preRows.length > 0) {
    matrix.push(...preRows);
  } else {
    matrix.push(['—', 'No pre-consultation patients recorded yet', '', '', '', '', '', '', '', '']);
  }

  // Spacing
  matrix.push(['', '', '', '', '', '', '', '', '', '', '']);
  matrix.push(['', '', '', '', '', '', '', '', '', '', '']);

  // Section 2: Post-Consultation (11 columns)
  matrix.push([`🩺 POST-CONSULTATION RECORDS (${tabName})`, '', '', '', '', '', '', '', '', '', '']);
  matrix.push(POST_CONSULTATION_HEADERS);
  if (postRows.length > 0) {
    matrix.push(...postRows);
  } else {
    matrix.push(['—', 'No post-consultation patients recorded yet', '', '', '', '', '', '', '', '', '']);
  }

  // 7. Clear old values in the daily tab to prevent orphaned rows
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A1:Z500:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    console.warn('Failed clearing previous range before sync:', err);
  }

  // 8. Write values using Google Sheets API (up to column K = 11 columns)
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A1:K${matrix.length}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: matrix
      })
    }
  );

  if (!writeRes.ok) {
    const errBody = await writeRes.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to update sheet values (${writeRes.status})`);
  }

  // 9. Format headers with professional hospital styling if sheetId is available
  if (sheetId != null) {
    try {
      await formatSheetHeaders(token, spreadsheetId, sheetId, preRows.length);
    } catch (fmtErr) {
      console.warn('Non-critical: Failed to format sheet styles:', fmtErr);
    }
  }

  // Record successful sync
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  saveSheetsConfig({
    lastSyncTime: now,
    lastSyncStatus: 'success',
    lastSyncMessage: `Synced ${preRows.length} Pre & ${postRows.length} Post records at ${now}`
  });

  return {
    success: true,
    spreadsheetUrl,
    tabName,
    countPre: preRows.length,
    countPost: postRows.length
  };
};

/**
 * Format sheet headers with distinct colors for Pre and Post consultation
 */
async function formatSheetHeaders(
  token: string, 
  spreadsheetId: string, 
  sheetId: number,
  preRowCount: number
) {
  const preSectionRows = preRowCount > 0 ? preRowCount : 1;
  const postTitleRowIndex = 4 + preSectionRows;
  const postHeaderRowIndex = 5 + preSectionRows;

  const requests: any[] = [
    // Pre-consultation Section Title (Row 1): Emerald background
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 10
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.02, green: 0.44, blue: 0.35 }, // Emerald #05705A
            textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'LEFT'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Pre-consultation Columns (Row 2): Light Mint background
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 10
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.86, green: 0.96, blue: 0.91 }, // #DCF5E8
            textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.05, green: 0.25, blue: 0.2 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Post-consultation Section Title: Deep Blue background
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: postTitleRowIndex,
          endRowIndex: postTitleRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: 11
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.12, green: 0.23, blue: 0.54 }, // Deep Blue #1E3A8A
            textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'LEFT'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Post-consultation Columns: Soft Blue background
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: postHeaderRowIndex,
          endRowIndex: postHeaderRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: 11
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.86, green: 0.92, blue: 1.0 }, // #DBEAFE
            textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.1, green: 0.2, blue: 0.45 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Auto resize columns A to K (columns 0 to 11)
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 11
        }
      }
    }
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });
}
