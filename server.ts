import express from 'express';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { PDFParse } from 'pdf-parse';
import compression from 'compression';
import http from 'http';
import { makeUniqueId } from './src/utils/id';

dotenv.config();

const app = express();

// High-speed HTTP response gzip/brotli compression for fast JSON payloads
app.use(compression());

// Trust proxy for reverse proxy environments (e.g. Cloud Run, Nginx) so express-rate-limit reads X-Forwarded-For properly
app.set('trust proxy', 1);

// Security Headers (Helmet) - frameguard disabled so preview iframe can render in AI Studio
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://suoxigroup.com", "http://suoxigroup.com", "https://*.googleusercontent.com"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://sheets.googleapis.com",
          "https://www.googleapis.com",
          "https://*.firebaseapp.com"
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"],
        frameAncestors: ["'self'", "*"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

// Health Check Endpoint (For Cloud Run / Ingress Readiness)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve logo asset directly
app.get('/api/logo', (_req, res) => {
  const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
  if (fs.existsSync(logoPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(logoPath).pipe(res);
  } else {
    res.redirect('https://suoxigroup.com/wp-content/uploads/2026/08/AI-Logo.png');
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiters - Relaxed for hospital intranet multi-device usage & real-time polling
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 500, // Generous limit for multi-device logins behind office/clinic NAT
  message: { error: 'Too many login attempts from this IP, please try again after a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10000, // High threshold so live polling and multi-device data sync never get blocked
  skip: (req) => {
    // Never block authenticated staff members or internal polling
    return Boolean(req.headers.authorization);
  },
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// Multer memory storage for PDF & Excel processing with fileFilter validation
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.mimetype === 'application/pdf';
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') ||
      file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') || file.mimetype.includes('csv');

    if (isPdf || isExcel) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Excel (.xlsx, .xls, .csv) documents are allowed.'));
    }
  }
});

function resolveServerPort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const portEqArg = process.argv.find(arg => arg.startsWith('--port='));
  if (portEqArg) {
    const parsed = Number(portEqArg.split('=')[1]);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (process.env.NODE_ENV !== 'production' && nginxPort && envPort === nginxPort) {
    return Number(process.env.DEFAULT_APP_PORT) || 3000;
  }
  return envPort || 3000;
}

const PORT = resolveServerPort();
const JWT_SECRET = process.env.JWT_SECRET || 'suoxi_hospital_secure_jwt_secret_key_2026_default_32char_long';

// Interface definitions
interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: 'System Admin' | 'Doctor' | 'Call Center' | 'Billing Counter' | 'Pathology' | 'Organic' | 'Nutrition' | 'SSD';
  phone?: string;
  is_active: number;
}

// Fallback JSON file path for when MySQL is unavailable
const LOCAL_DB_FILE = path.join(process.cwd(), 'local_hospital_db.json');

// Default initial catalog data in pure English
const DEFAULT_CATALOG = [
  { id: 'tr-scalp', name: 'Scalp Acupuncture', category: 'treatment', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Neurological scalp acupuncture therapy', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-tongue', name: 'Tongue Acupuncture', category: 'treatment', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Specialized tongue acupuncture session', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-ear', name: 'Ear Acupuncture', category: 'treatment', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Auricular acupuncture therapy', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-1', name: 'Traditional Body Acupuncture', category: 'treatment', defaultPrice: 1200, defaultDiscountPercent: 0, description: 'Acupuncture session with sterile needles', outdoorSessions: 10, indoorSessions: 20 },
  { id: 'tr-2', name: 'Electro-Acupuncture Therapy', category: 'treatment', defaultPrice: 1500, defaultDiscountPercent: 0, description: 'Targeted nerve stimulation with micro-current', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-3', name: 'Cupping / Hijama Therapy', category: 'treatment', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Dry/Wet cupping for blood circulation and detoxification', outdoorSessions: 3, indoorSessions: 5 },
  { id: 'tr-4', name: 'Moxibustion Heat Therapy', category: 'treatment', defaultPrice: 800, defaultDiscountPercent: 0, description: 'Heat therapy using moxa wool', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-5', name: 'Physiotherapy & Rehabilitation', category: 'treatment', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Manual rehabilitation and joint mobilization', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-6', name: 'Laser Acupuncture Therapy', category: 'treatment', defaultPrice: 1800, defaultDiscountPercent: 0, description: 'Non-invasive laser stimulation', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'tr-7', name: 'Infrared & TENS Pain Therapy', category: 'treatment', defaultPrice: 700, defaultDiscountPercent: 0, description: 'Pain management thermal therapy', outdoorSessions: 10, indoorSessions: 15 },
  { id: 'pkg-30', name: '30-Day Comprehensive Outdoor Package', category: 'outdoor_package', defaultPrice: 36000, defaultDiscountPercent: 20, description: 'Comprehensive 30 days daily acupuncture & rehab sessions' },
  { id: 'pkg-15', name: '15-Day Intensive Outdoor Package', category: 'outdoor_package', defaultPrice: 18000, defaultDiscountPercent: 15, description: 'Intensive 15 days acupuncture regimen' },
  { id: 'pkg-1', name: 'Daily Special Combination Package', category: 'outdoor_package', defaultPrice: 2500, defaultDiscountPercent: 10, description: 'Combined multi-therapy day package' },
  { id: 'room-single', name: 'Single Premium AC Cabin', category: 'indoor_room', defaultPrice: 3500, defaultDiscountPercent: 0, description: 'Attached bath, LED TV, attendant couch, AC' },
  { id: 'room-sharing', name: 'Sharing Deluxe AC Cabin', category: 'indoor_room', defaultPrice: 2000, defaultDiscountPercent: 0, description: 'Two patient bed sharing cabin' },
  { id: 'room-ac-ward', name: 'General AC Ward Bed', category: 'indoor_room', defaultPrice: 1200, defaultDiscountPercent: 0, description: 'Air conditioned general ward bed' },
  { id: 'room-non-ac', name: 'General Non-AC Ward Bed', category: 'indoor_room', defaultPrice: 800, defaultDiscountPercent: 0, description: 'General ward bed with fan' },
  { id: 'doc-consult', name: 'Doctor Counseling & Assessment Fee', category: 'consultation', defaultPrice: 1000, defaultDiscountPercent: 0, description: 'Senior acupuncture doctor consultation' },
  { id: 'add-ozon', name: 'Ozon Therapy', category: 'additional_treatment', defaultPrice: 1500, defaultDiscountPercent: 0, description: 'Medical ozone oxygen therapy session', isIndoorFree: true, isRatioBased: true, sessionsPer10Days: 3 },
  { id: 'add-ed', name: 'Erectile Dysfunction (ED) Therapy', category: 'additional_treatment', defaultPrice: 2000, defaultDiscountPercent: 0, description: 'Specialized shockwave & ED therapy session', isIndoorFree: true, isRatioBased: true, sessionsPer10Days: 3 }
];

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FORCE_CLEAR_DEMO = process.env.CLEAR_DEMO_DATA === 'true';

// Permanent Admin Credential
const ADMIN_USER_RECORD: UserRecord = {
  id: 'usr-admin',
  username: 'admin',
  password_hash: bcrypt.hashSync('admin123', 10),
  name: 'Hospital System Admin',
  role: 'System Admin',
  phone: '01700000000',
  is_active: 1
};

// Demo accounts (only active in development)
const DEMO_STAFF_USERS: UserRecord[] = [
  {
    id: 'usr-doctor',
    username: 'doctor',
    password_hash: bcrypt.hashSync('doctor123', 10),
    name: 'Prof. Dr. SM Shahidullah',
    role: 'Doctor',
    phone: '01711111111',
    is_active: 1
  },
  {
    id: 'usr-callcenter',
    username: 'callcenter',
    password_hash: bcrypt.hashSync('cc123', 10),
    name: 'Call Center Desk',
    role: 'Call Center',
    phone: '01722222222',
    is_active: 1
  },
  {
    id: 'usr-billing',
    username: 'billing',
    password_hash: bcrypt.hashSync('billing123', 10),
    name: 'Billing Counter Desk',
    role: 'Billing Counter',
    phone: '01733333333',
    is_active: 1
  },
  {
    id: 'usr-pathology',
    username: 'pathology',
    password_hash: bcrypt.hashSync('pathology123', 10),
    name: 'Pathology Department',
    role: 'Pathology',
    phone: '01744444444',
    is_active: 1
  },
  {
    id: 'usr-organic',
    username: 'organic',
    password_hash: bcrypt.hashSync('organic123', 10),
    name: 'Organic Health Store',
    role: 'Organic',
    phone: '01755555555',
    is_active: 1
  },
  {
    id: 'usr-nutrition',
    username: 'nutrition',
    password_hash: bcrypt.hashSync('nutrition123', 10),
    name: 'Nutrition & Dietetics',
    role: 'Nutrition',
    phone: '01766666666',
    is_active: 1
  },
  {
    id: 'usr-ssd',
    username: 'ssd',
    password_hash: bcrypt.hashSync('ssd123', 10),
    name: 'SSD Desk',
    role: 'SSD',
    phone: '01777777777',
    is_active: 1
  }
];

const INITIAL_USERS: UserRecord[] = [ADMIN_USER_RECORD, ...DEMO_STAFF_USERS];

const DEMO_PATIENTS = [
  {
    id: 'pat-101',
    name: 'Md. Rafiqul Islam',
    phone: '01711223344',
    age: '52',
    gender: 'Male',
    address: 'Dhanmondi, Dhaka',
    doctorName: 'Prof. Dr. SM Shahidullah',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '10:30 AM',
    department: 'Acupuncture & Spine',
    status: 'Pending Counseling',
    createdAt: new Date().toISOString(),
    notes: 'Severe L4-L5 Back Pain & Sciatica',
    remark: 'Severe L4-L5 Back Pain & Sciatica'
  },
  {
    id: 'pat-102',
    name: 'Nazmun Nahar',
    phone: '01819876543',
    age: '44',
    gender: 'Female',
    address: 'Uttara, Dhaka',
    doctorName: 'Dr. Sharmin Akter',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '11:15 AM',
    department: 'Neurology & Paralysis',
    status: 'Quotation Created',
    createdAt: new Date().toISOString(),
    notes: 'Stroke Rehabilitation & Facial Palsy',
    remark: 'Stroke Rehabilitation & Facial Palsy'
  }
];

const INITIAL_PATIENTS: any[] = [];

// Local JSON DB Helper & Persistent Data Version (in-memory copy synced with app_settings.data_version)
let serverDataVersion = 1;
function bumpLocalDataVersion(): number {
  serverDataVersion = (Number.isFinite(serverDataVersion) ? serverDataVersion : 0) + 1;
  (localData as any).dataVersion = serverDataVersion;
  return serverDataVersion;
}

const DEFAULT_PROFESSIONS = [
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

const DEFAULT_CONSULTATION_COMMENTS = [
  'Will take today',
  'Will admit',
  'Will take later',
  'Costly',
  'Follow-up needed',
  'Consultation Only',
  'Need Family Discussion',
  'Attended Counseling'
];

let localData = {
  users: INITIAL_USERS,
  patients: INITIAL_PATIENTS,
  quotations: [] as any[],
  catalog: DEFAULT_CATALOG,
  professions: DEFAULT_PROFESSIONS,
  comments: DEFAULT_CONSULTATION_COMMENTS
};

function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      
      let users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : INITIAL_USERS;
      let patients = Array.isArray(parsed.patients) ? parsed.patients : INITIAL_PATIENTS;
      let quotations = Array.isArray(parsed.quotations) ? parsed.quotations : [];

      // Ensure admin and default staff users always exist if not already present
      for (const defUser of [ADMIN_USER_RECORD, ...DEMO_STAFF_USERS]) {
        if (!users.some((u: any) => u.username === defUser.username)) {
          users.push(defUser);
        }
      }

      // Ensure unconfirmed patients start clean in Appointments Import queue & migrate doctorName if placeholder
      patients = patients.map((p: any) => {
        const doctor = (!p.doctorName || p.doctorName === 'Senior Counseling Doctor') ? 'Dr. S.M. Shahidul Islam PhD' : p.doctorName;
        if (!p.isConfirmed) {
          return {
            ...p,
            doctorName: doctor,
            isConfirmed: false,
            consultationSerial: null,
            consultationStatus: undefined,
            status: p.status === 'Post Consultation' ? 'Pending Counseling' : (p.status || 'Pending Counseling')
          };
        }
        return {
          ...p,
          doctorName: doctor
        };
      });

      if (typeof parsed.dataVersion === 'number' && parsed.dataVersion > 0) {
        serverDataVersion = parsed.dataVersion;
      }

      localData = {
        users,
        patients,
        quotations,
        catalog: Array.isArray(parsed.catalog) && parsed.catalog.length > 0 ? parsed.catalog : DEFAULT_CATALOG,
        professions: Array.isArray(parsed.professions) && parsed.professions.length > 0 ? parsed.professions : DEFAULT_PROFESSIONS,
        comments: Array.isArray(parsed.comments) && parsed.comments.length > 0 ? parsed.comments : DEFAULT_CONSULTATION_COMMENTS,
        dataVersion: serverDataVersion
      } as any;
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.error('Error loading local DB file, using default seed:', err);
  }
}

let saveLocalDbTimer: NodeJS.Timeout | null = null;
let saveLocalDbInFlight: Promise<void> | null = null;
let saveLocalDbDirty = false;

async function flushLocalDb(): Promise<void> {
  if (saveLocalDbTimer) {
    clearTimeout(saveLocalDbTimer);
    saveLocalDbTimer = null;
  }
  if (saveLocalDbInFlight) {
    saveLocalDbDirty = true;
    await saveLocalDbInFlight;
    if (!saveLocalDbDirty) return;
  }
  saveLocalDbDirty = false;
  const payload = JSON.stringify(localData);
  const tmpFile = `${LOCAL_DB_FILE}.tmp`;
  const runWrite = async () => {
    try {
      await fs.promises.writeFile(tmpFile, payload, 'utf-8');
      await fs.promises.rename(tmpFile, LOCAL_DB_FILE);
    } catch (err) {
      console.error('Error saving local DB file:', err);
    }
  };
  saveLocalDbInFlight = runWrite().finally(() => {
    saveLocalDbInFlight = null;
  });
  await saveLocalDbInFlight;
  if (saveLocalDbDirty) {
    await flushLocalDb();
  }
}

function saveLocalDb() {
  if (saveLocalDbTimer) {
    clearTimeout(saveLocalDbTimer);
  }
  saveLocalDbTimer = setTimeout(() => {
    saveLocalDbTimer = null;
    flushLocalDb().catch((err) => {
      console.error('Debounced local DB flush error:', err);
    });
  }, 5000);
}

// MySQL Pool setup
let mysqlPool: mysql.Pool | null = null;
let isMySqlActive = false;

async function initDatabase() {
  loadLocalDb();

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE || 'suoxi_hospital_db';
  const dbPort = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306;

  if (host && user) {
    try {
      console.log(`Connecting to MySQL database at ${host}:${dbPort}...`);
      const pool = mysql.createPool({
        host,
        port: dbPort,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 3000
      });

      const connection = await pool.getConnection();
      console.log('✅ Successfully connected to MySQL Database!');
      connection.release();
      mysqlPool = pool;
      isMySqlActive = true;

      // Ensure MySQL database tables exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(64) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(128) NOT NULL,
          role VARCHAR(64) NOT NULL,
          phone VARCHAR(32) DEFAULT '',
          is_active TINYINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS patients (
          id VARCHAR(64) PRIMARY KEY,
          serialNo VARCHAR(32) DEFAULT '',
          name VARCHAR(128) NOT NULL,
          phone VARCHAR(32) NOT NULL,
          age VARCHAR(16) DEFAULT '',
          gender VARCHAR(16) DEFAULT 'Other',
          address TEXT,
          doctorName VARCHAR(128) DEFAULT '',
          appointmentDate VARCHAR(32) DEFAULT '',
          appointmentTime VARCHAR(32) DEFAULT '',
          department VARCHAR(64) DEFAULT '',
          status VARCHAR(64) DEFAULT 'Pending Counseling',
          notes TEXT,
          remark TEXT,
          createdAt VARCHAR(64),
          isConfirmed TINYINT DEFAULT 0,
          confirmedAt VARCHAR(64) DEFAULT '',
          consultationSerial INT DEFAULT NULL,
          consultationStatus VARCHAR(64) DEFAULT '',
          profession VARCHAR(128) DEFAULT '',
          preDoctorName VARCHAR(128) DEFAULT '',
          postDoctorName VARCHAR(128) DEFAULT '',
          preConsultationAt VARCHAR(64) DEFAULT '',
          postConsultationAt VARCHAR(64) DEFAULT '',
          consultationComment TEXT,
          postConsultationConfirmed TINYINT DEFAULT 0,
          postConfirmedAt VARCHAR(64) DEFAULT '',
          isOnHold TINYINT DEFAULT 0,
          heldAt VARCHAR(64) DEFAULT '',
          holdReason VARCHAR(255) DEFAULT '',
          pathologyStatus VARCHAR(16) DEFAULT '',
          pathologyUpdatedAt VARCHAR(64) DEFAULT '',
          pathologyUpdatedBy VARCHAR(128) DEFAULT '',
          organicStatus VARCHAR(16) DEFAULT '',
          organicUpdatedAt VARCHAR(64) DEFAULT '',
          organicUpdatedBy VARCHAR(128) DEFAULT '',
          nutritionStatus VARCHAR(16) DEFAULT '',
          nutritionUpdatedAt VARCHAR(64) DEFAULT '',
          nutritionUpdatedBy VARCHAR(128) DEFAULT '',
          INDEX idx_patients_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key VARCHAR(64) PRIMARY KEY,
          setting_value LONGTEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Add database indexes for high-volume patient performance
      const patientIndexes = [
        "ALTER TABLE patients ADD INDEX idx_patients_name (name)",
        "ALTER TABLE patients ADD INDEX idx_patients_serial (serialNo)",
        "ALTER TABLE patients ADD INDEX idx_patients_date (appointmentDate)",
        "ALTER TABLE patients ADD INDEX idx_patients_doc (doctorName)",
        "ALTER TABLE patients ADD INDEX idx_patients_confirmed (isConfirmed)"
      ];
      for (const idxQuery of patientIndexes) {
        try {
          await pool.query(idxQuery);
        } catch {
          // index already exists
        }
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS quotations (
          id VARCHAR(64) PRIMARY KEY,
          patientName VARCHAR(128),
          patientPhone VARCHAR(32),
          patientAge VARCHAR(16),
          patientGender VARCHAR(16),
          doctorName VARCHAR(128),
          totalAmount DOUBLE DEFAULT 0,
          discountAmount DOUBLE DEFAULT 0,
          netPayable DOUBLE DEFAULT 0,
          paymentType VARCHAR(64) DEFAULT 'Cash',
          status VARCHAR(64) DEFAULT 'Saved',
          items JSON,
          createdAt VARCHAR(64),
          INDEX idx_quotations_phone (patientPhone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS quotations_v2 (
          id VARCHAR(64) PRIMARY KEY,
          quotationNumber VARCHAR(64) NOT NULL,
          patientId VARCHAR(64) DEFAULT '',
          patientName VARCHAR(128) DEFAULT '',
          patientPhone VARCHAR(32) DEFAULT '',
          patientAge VARCHAR(16) DEFAULT '',
          patientGender VARCHAR(16) DEFAULT '',
          doctorName VARCHAR(128) DEFAULT '',
          createdDate VARCHAR(64) DEFAULT '',
          createdAt VARCHAR(64) DEFAULT '',
          validUntil VARCHAR(64) DEFAULT '',
          visitNumber INT DEFAULT 1,
          visitLabel VARCHAR(64) DEFAULT '',
          patientTreatmentMode VARCHAR(32) DEFAULT '',
          treatments LONGTEXT,
          treatmentsSubtotal DECIMAL(12,2) DEFAULT 0.00,
          outdoorPackages LONGTEXT,
          outdoorSubtotal DECIMAL(12,2) DEFAULT 0.00,
          indoorServices LONGTEXT,
          indoorSubtotal DECIMAL(12,2) DEFAULT 0.00,
          additionalTreatments LONGTEXT,
          additionalTreatmentsSubtotal DECIMAL(12,2) DEFAULT 0.00,
          admissionFee DECIMAL(12,2) DEFAULT 0.00,
          consultationFee DECIMAL(12,2) DEFAULT 0.00,
          investigationFee DECIMAL(12,2) DEFAULT 0.00,
          overallDiscountPercent DECIMAL(12,2) DEFAULT 0.00,
          overallDiscountAmount DECIMAL(12,2) DEFAULT 0.00,
          grossTotal DECIMAL(12,2) DEFAULT 0.00,
          grandTotal DECIMAL(12,2) DEFAULT 0.00,
          advancePaid DECIMAL(12,2) DEFAULT 0.00,
          dueAmount DECIMAL(12,2) DEFAULT 0.00,
          paymentPlanMode VARCHAR(32) DEFAULT '',
          paymentPhases LONGTEXT,
          paymentStatus VARCHAR(32) DEFAULT 'Quotation',
          notes TEXT,
          createdBy VARCHAR(128) DEFAULT '',
          packageComparison LONGTEXT,
          UNIQUE KEY uniq_quotations_v2_number (quotationNumber),
          INDEX idx_quotations_v2_patient_id (patientId),
          INDEX idx_quotations_v2_phone (patientPhone),
          INDEX idx_quotations_v2_created_at (createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS invoice_counters (
          year INT PRIMARY KEY,
          last_value INT NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_serial_counters (
          appointmentDate VARCHAR(32) PRIMARY KEY,
          last_serial INT NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS catalog (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          category VARCHAR(64) NOT NULL,
          defaultPrice DOUBLE DEFAULT 0,
          defaultDiscountPercent DOUBLE DEFAULT 0,
          fixedDiscountAmount DOUBLE DEFAULT NULL,
          outdoorDiscountPercent DOUBLE DEFAULT NULL,
          outdoorDiscountAmount DOUBLE DEFAULT NULL,
          description TEXT,
          rateNote TEXT,
          outdoorSessions INT DEFAULT NULL,
          indoorSessions INT DEFAULT NULL,
          isIndoorFree TINYINT DEFAULT 0,
          isRatioBased TINYINT DEFAULT 0,
          sessionsPer10Days INT DEFAULT NULL,
          orderIndex INT DEFAULT 0,
          details_json LONGTEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Exhaustive safe column migrations for existing MySQL tables (run AFTER CREATE TABLE statements)
      const migrations = [
        "ALTER TABLE patients ADD COLUMN serialNo VARCHAR(32) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN phone VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN age VARCHAR(16) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN gender VARCHAR(16) DEFAULT 'Other'",
        "ALTER TABLE patients ADD COLUMN address TEXT",
        "ALTER TABLE patients ADD COLUMN doctorName VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN appointmentDate VARCHAR(32) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN appointmentTime VARCHAR(32) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN department VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN status VARCHAR(64) DEFAULT 'Pending Counseling'",
        "ALTER TABLE patients ADD COLUMN notes TEXT",
        "ALTER TABLE patients ADD COLUMN remark TEXT",
        "ALTER TABLE patients ADD COLUMN createdAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN isConfirmed TINYINT DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN confirmedAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN consultationSerial INT DEFAULT NULL",
        "ALTER TABLE patients ADD COLUMN consultationStatus VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN profession VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN preDoctorName VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN postDoctorName VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN preConsultationAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN postConsultationAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN consultationComment TEXT",
        "ALTER TABLE patients ADD COLUMN postConsultationConfirmed TINYINT DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN postConfirmedAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN isOnHold TINYINT DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN heldAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN holdReason VARCHAR(255) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN pathologyStatus VARCHAR(16) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN pathologyUpdatedAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN pathologyUpdatedBy VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN organicStatus VARCHAR(16) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN organicUpdatedAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN organicUpdatedBy VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN nutritionStatus VARCHAR(16) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN nutritionUpdatedAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN nutritionUpdatedBy VARCHAR(128) DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN isInstant TINYINT DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN instantFee DOUBLE DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN isEd TINYINT DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN patientId VARCHAR(64) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN patientName VARCHAR(128) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN patientPhone VARCHAR(32) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN patientAge VARCHAR(16) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN patientGender VARCHAR(16) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN doctorName VARCHAR(128) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN totalAmount DOUBLE DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN discountAmount DOUBLE DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN netPayable DOUBLE DEFAULT 0",
        "ALTER TABLE quotations ADD COLUMN paymentType VARCHAR(64) DEFAULT 'Cash'",
        "ALTER TABLE quotations ADD COLUMN status VARCHAR(64) DEFAULT 'Saved'",
        "ALTER TABLE quotations ADD COLUMN items JSON",
        "ALTER TABLE quotations ADD COLUMN createdAt VARCHAR(64) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN createdDate VARCHAR(64) DEFAULT ''",
        "ALTER TABLE quotations ADD COLUMN notes TEXT",
        "ALTER TABLE users ADD COLUMN phone VARCHAR(32) DEFAULT ''",
        "ALTER TABLE users ADD COLUMN is_active TINYINT DEFAULT 1",
        "ALTER TABLE catalog ADD COLUMN fixedDiscountAmount DOUBLE DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN outdoorDiscountPercent DOUBLE DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN outdoorDiscountAmount DOUBLE DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN rateNote TEXT",
        "ALTER TABLE catalog ADD COLUMN outdoorSessions INT DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN indoorSessions INT DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN isIndoorFree TINYINT DEFAULT 0",
        "ALTER TABLE catalog ADD COLUMN isRatioBased TINYINT DEFAULT 0",
        "ALTER TABLE catalog ADD COLUMN sessionsPer10Days INT DEFAULT NULL",
        "ALTER TABLE catalog ADD COLUMN orderIndex INT DEFAULT 0",
        "ALTER TABLE catalog ADD COLUMN details_json LONGTEXT",
        "ALTER TABLE patients ADD COLUMN lastModifiedVersion BIGINT DEFAULT 0",
        "ALTER TABLE patients ADD INDEX idx_patients_lmv (lastModifiedVersion)",
        "ALTER TABLE quotations_v2 ADD COLUMN lastModifiedVersion BIGINT DEFAULT 0",
        "ALTER TABLE quotations_v2 ADD INDEX idx_quotations_v2_lmv (lastModifiedVersion)",
        "ALTER TABLE catalog ADD COLUMN lastModifiedVersion BIGINT DEFAULT 0",
        "ALTER TABLE catalog ADD INDEX idx_catalog_lmv (lastModifiedVersion)"
      ];

      for (const mig of migrations) {
        try {
          await pool.query(mig);
        } catch {
          // column already exists
        }
      }

      // Seed initial users if empty
      const [uRows]: any = await pool.query('SELECT COUNT(*) as count FROM users');
      if (uRows[0]?.count === 0) {
        for (const u of localData.users) {
          await pool.query(
            'INSERT INTO users (id, username, password_hash, name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [u.id, u.username, u.password_hash, u.name, u.role, u.phone || '', u.is_active ?? 1]
          );
        }
      }

      // Ensure persistent data_version counter exists in app_settings and hydrate in-memory copy
      await pool.query(
        "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('data_version', '1')"
      );
      const [verRows]: any = await pool.query(
        "SELECT CAST(setting_value AS UNSIGNED) AS ver FROM app_settings WHERE setting_key = 'data_version' LIMIT 1"
      );
      if (Array.isArray(verRows) && verRows.length > 0) {
        serverDataVersion = Math.max(1, Number(verRows[0].ver || 1));
      }

      // Update existing database patient records with placeholder doctorName to Dr. S.M. Shahidul Islam PhD
      try {
        await pool.query(
          "UPDATE patients SET doctorName = 'Dr. S.M. Shahidul Islam PhD' WHERE doctorName = 'Senior Counseling Doctor' OR doctorName IS NULL OR doctorName = ''"
        );
      } catch (err) {
        // ignore if not applicable
      }

      // Synchronize in-memory cache with central MySQL records so localData is never empty or desynced
      try {
        const [pRows]: any = await pool.query('SELECT * FROM patients ORDER BY createdAt DESC, id DESC LIMIT 5000');
        if (Array.isArray(pRows) && pRows.length > 0) {
          const dbPatients = pRows.map(formatPatientRow);
          const dbIdSet = new Set(dbPatients.map((p: any) => String(p.id)));
          localData.patients = [
            ...dbPatients,
            ...localData.patients.filter((p: any) => p && p.id && !dbIdSet.has(String(p.id)))
          ];
          saveLocalDb();
          console.log(`✅ Loaded and synchronized ${dbPatients.length} patient records from MySQL database.`);
        }
      } catch (pErr) {
        console.warn('Initial MySQL patients cache sync warning:', pErr);
      }
    } catch (err: any) {
      console.log(`ℹ️ MySQL connection at ${host}:${dbPort} skipped (${err.code || err.message}).`);
      console.log('⚡ Operating in Central Local File Persistence Mode. Data persists across restarts!');
    }
  } else {
    console.log('ℹ️ No MYSQL_HOST configured in environment. Using Local File Storage.');
  }
}

// Middleware: Verify JWT Token
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Middleware: Role-Based Access Control (RBAC)
function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = String(req.user.role || '').toLowerCase().trim();
    const isAllowed = roles.some(r => {
      const target = r.toLowerCase().trim();
      if (target === userRole) return true;
      if ((target === 'system admin' || target === 'admin') && (userRole === 'system admin' || userRole === 'admin')) return true;
      if ((target === 'call center' || target === 'callcenter') && (userRole === 'call center' || userRole === 'callcenter')) return true;
      return false;
    });

    if (!isAllowed) {
      return res.status(403).json({ error: `Forbidden: Access restricted to ${roles.join(', ')}` });
    }
    next();
  };
}

// API Routes

// 1. System Status & Init Endpoints
app.get('/api/logo', (req, res) => {
  const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
  if (fs.existsSync(logoPath)) {
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(logoPath);
  }
  res.status(404).send('Logo not found');
});

app.get('/api/system/status', (req, res) => {
  res.json({
    status: 'online',
    port: PORT,
    databaseType: isMySqlActive ? 'MySQL Central Database' : 'Local File Persistence',
    isMySqlConnected: isMySqlActive,
    userCount: localData.users.length,
    patientCount: localData.patients.length,
    quotationCount: localData.quotations.length
  });
});

function formatCatalogRow(r: any): any {
  let parsedDetails: any = {};
  if (r.details_json) {
    try {
      parsedDetails = typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json;
    } catch {}
  }
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    defaultPrice: r.defaultPrice !== null && r.defaultPrice !== undefined ? Number(r.defaultPrice) : (r.default_price !== null && r.default_price !== undefined ? Number(r.default_price) : 0),
    defaultDiscountPercent: r.defaultDiscountPercent !== null && r.defaultDiscountPercent !== undefined ? Number(r.defaultDiscountPercent) : (r.default_discount_percent !== null && r.default_discount_percent !== undefined ? Number(r.default_discount_percent) : 0),
    fixedDiscountAmount: r.fixedDiscountAmount !== null && r.fixedDiscountAmount !== undefined ? Number(r.fixedDiscountAmount) : (parsedDetails.fixedDiscountAmount !== undefined ? Number(parsedDetails.fixedDiscountAmount) : undefined),
    outdoorDiscountPercent: r.outdoorDiscountPercent !== null && r.outdoorDiscountPercent !== undefined ? Number(r.outdoorDiscountPercent) : (parsedDetails.outdoorDiscountPercent !== undefined ? Number(parsedDetails.outdoorDiscountPercent) : undefined),
    outdoorDiscountAmount: r.outdoorDiscountAmount !== null && r.outdoorDiscountAmount !== undefined ? Number(r.outdoorDiscountAmount) : (parsedDetails.outdoorDiscountAmount !== undefined ? Number(parsedDetails.outdoorDiscountAmount) : undefined),
    description: r.description || parsedDetails.description || '',
    rateNote: r.rateNote || parsedDetails.rateNote || '',
    outdoorSessions: r.outdoorSessions !== null && r.outdoorSessions !== undefined ? Number(r.outdoorSessions) : (parsedDetails.outdoorSessions !== undefined ? Number(parsedDetails.outdoorSessions) : undefined),
    indoorSessions: r.indoorSessions !== null && r.indoorSessions !== undefined ? Number(r.indoorSessions) : (parsedDetails.indoorSessions !== undefined ? Number(parsedDetails.indoorSessions) : undefined),
    isIndoorFree: Boolean(r.isIndoorFree ?? parsedDetails.isIndoorFree),
    isRatioBased: Boolean(r.isRatioBased ?? parsedDetails.isRatioBased),
    sessionsPer10Days: r.sessionsPer10Days !== null && r.sessionsPer10Days !== undefined ? Number(r.sessionsPer10Days) : (parsedDetails.sessionsPer10Days !== undefined ? Number(parsedDetails.sessionsPer10Days) : undefined),
    orderIndex: r.orderIndex !== null && r.orderIndex !== undefined ? Number(r.orderIndex) : (parsedDetails.orderIndex !== undefined ? Number(parsedDetails.orderIndex) : 0),
    ...parsedDetails
  };
}

function formatPatientRow(r: any): any {
  if (!r) return r;
  return {
    ...r,
    age: r.age !== null && r.age !== undefined ? String(r.age) : '',
    gender: r.gender || 'Other',
    isConfirmed: r.isConfirmed === 1 || r.isConfirmed === true || r.isConfirmed === '1' || r.isConfirmed === 'true',
    confirmedAt: r.confirmedAt || '',
    consultationSerial: (r.consultationSerial !== null && r.consultationSerial !== undefined && r.consultationSerial !== '') ? Number(r.consultationSerial) : null,
    consultationStatus: r.consultationStatus || '',
    profession: r.profession || '',
    preDoctorName: r.preDoctorName || '',
    postDoctorName: r.postDoctorName || '',
    preConsultationAt: r.preConsultationAt || '',
    postConsultationAt: r.postConsultationAt || '',
    notes: r.notes || r.remark || '',
    remark: r.remark || r.notes || '',
    consultationComment: r.consultationComment || '',
    postConsultationConfirmed: r.postConsultationConfirmed === 1 || r.postConsultationConfirmed === true || r.postConsultationConfirmed === '1',
    postConfirmedAt: r.postConfirmedAt || '',
    isInstant: r.isInstant === 1 || r.isInstant === true || r.isInstant === '1' || r.isInstant === 'true',
    instantFee: r.instantFee !== null && r.instantFee !== undefined ? Number(r.instantFee) : ((r.isInstant === 1 || r.isInstant === true || r.isInstant === '1' || r.isInstant === 'true') ? 2000 : 0),
    isEd: r.isEd === 1 || r.isEd === true || r.isEd === '1' || r.isEd === 'true',
    status: r.status || 'Pending Counseling',
    createdAt: r.createdAt || ''
  };
}

function parseJsonColumn<T>(val: any, fallback: T): T {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val !== 'string') return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function toFiniteMoney(val: any): number {
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatQuotationRow(r: any): any {
  if (!r) return r;
  const packageComparison = parseJsonColumn(r.packageComparison, undefined);
  return {
    id: r.id,
    quotationNumber: r.quotationNumber || r.id,
    patientId: r.patientId || '',
    patientName: r.patientName || '',
    patientPhone: r.patientPhone || '',
    patientAge: r.patientAge ?? '',
    patientGender: r.patientGender ?? '',
    doctorName: r.doctorName ?? '',
    createdDate: r.createdDate || '',
    createdAt: r.createdAt || '',
    validUntil: r.validUntil || '',
    visitNumber: r.visitNumber !== null && r.visitNumber !== undefined ? Number(r.visitNumber) : 1,
    visitLabel: r.visitLabel || '',
    patientTreatmentMode: r.patientTreatmentMode || undefined,
    treatments: parseJsonColumn(r.treatments, []),
    treatmentsSubtotal: toFiniteMoney(r.treatmentsSubtotal),
    outdoorPackages: parseJsonColumn(r.outdoorPackages, []),
    outdoorSubtotal: toFiniteMoney(r.outdoorSubtotal),
    indoorServices: parseJsonColumn(r.indoorServices, []),
    indoorSubtotal: toFiniteMoney(r.indoorSubtotal),
    additionalTreatments: parseJsonColumn(r.additionalTreatments, []),
    additionalTreatmentsSubtotal: toFiniteMoney(r.additionalTreatmentsSubtotal),
    admissionFee: toFiniteMoney(r.admissionFee),
    consultationFee: toFiniteMoney(r.consultationFee),
    investigationFee: toFiniteMoney(r.investigationFee),
    overallDiscountPercent: toFiniteMoney(r.overallDiscountPercent),
    overallDiscountAmount: toFiniteMoney(r.overallDiscountAmount),
    grossTotal: toFiniteMoney(r.grossTotal),
    grandTotal: toFiniteMoney(r.grandTotal),
    advancePaid: toFiniteMoney(r.advancePaid),
    dueAmount: toFiniteMoney(r.dueAmount),
    paymentPlanMode: r.paymentPlanMode || undefined,
    paymentPhases: parseJsonColumn(r.paymentPhases, []),
    paymentStatus: r.paymentStatus || 'Quotation',
    notes: r.notes ?? '',
    createdBy: r.createdBy || '',
    ...(packageComparison !== undefined ? { packageComparison } : {})
  };
}

const QUOTATION_UPSERT_SQL = `INSERT INTO quotations_v2 (
  id, quotationNumber, patientId, patientName, patientPhone, patientAge, patientGender, doctorName,
  createdDate, createdAt, validUntil, visitNumber, visitLabel, patientTreatmentMode,
  treatments, treatmentsSubtotal, outdoorPackages, outdoorSubtotal, indoorServices, indoorSubtotal,
  additionalTreatments, additionalTreatmentsSubtotal, admissionFee, consultationFee, investigationFee,
  overallDiscountPercent, overallDiscountAmount, grossTotal, grandTotal, advancePaid, dueAmount,
  paymentPlanMode, paymentPhases, paymentStatus, notes, createdBy, packageComparison
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  quotationNumber = VALUES(quotationNumber),
  patientId = VALUES(patientId),
  patientName = VALUES(patientName),
  patientPhone = VALUES(patientPhone),
  patientAge = VALUES(patientAge),
  patientGender = VALUES(patientGender),
  doctorName = VALUES(doctorName),
  createdDate = VALUES(createdDate),
  createdAt = VALUES(createdAt),
  validUntil = VALUES(validUntil),
  visitNumber = VALUES(visitNumber),
  visitLabel = VALUES(visitLabel),
  patientTreatmentMode = VALUES(patientTreatmentMode),
  treatments = VALUES(treatments),
  treatmentsSubtotal = VALUES(treatmentsSubtotal),
  outdoorPackages = VALUES(outdoorPackages),
  outdoorSubtotal = VALUES(outdoorSubtotal),
  indoorServices = VALUES(indoorServices),
  indoorSubtotal = VALUES(indoorSubtotal),
  additionalTreatments = VALUES(additionalTreatments),
  additionalTreatmentsSubtotal = VALUES(additionalTreatmentsSubtotal),
  admissionFee = VALUES(admissionFee),
  consultationFee = VALUES(consultationFee),
  investigationFee = VALUES(investigationFee),
  overallDiscountPercent = VALUES(overallDiscountPercent),
  overallDiscountAmount = VALUES(overallDiscountAmount),
  grossTotal = VALUES(grossTotal),
  grandTotal = VALUES(grandTotal),
  advancePaid = VALUES(advancePaid),
  dueAmount = VALUES(dueAmount),
  paymentPlanMode = VALUES(paymentPlanMode),
  paymentPhases = VALUES(paymentPhases),
  paymentStatus = VALUES(paymentStatus),
  notes = VALUES(notes),
  createdBy = VALUES(createdBy),
  packageComparison = VALUES(packageComparison)`;

const QUOTATION_INSERT_IGNORE_SQL = `INSERT IGNORE INTO quotations_v2 (
  id, quotationNumber, patientId, patientName, patientPhone, patientAge, patientGender, doctorName,
  createdDate, createdAt, validUntil, visitNumber, visitLabel, patientTreatmentMode,
  treatments, treatmentsSubtotal, outdoorPackages, outdoorSubtotal, indoorServices, indoorSubtotal,
  additionalTreatments, additionalTreatmentsSubtotal, admissionFee, consultationFee, investigationFee,
  overallDiscountPercent, overallDiscountAmount, grossTotal, grandTotal, advancePaid, dueAmount,
  paymentPlanMode, paymentPhases, paymentStatus, notes, createdBy, packageComparison
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function buildQuotationDbParams(q: any): any[] {
  const visitNum = q.visitNumber !== null && q.visitNumber !== undefined && q.visitNumber !== '' && Number.isFinite(Number(q.visitNumber))
    ? Number(q.visitNumber)
    : 1;
  return [
    q.id ?? null,
    (q.quotationNumber ?? q.id) ?? null,
    q.patientId ?? null,
    q.patientName ?? null,
    q.patientPhone ?? null,
    q.patientAge !== undefined && q.patientAge !== null ? String(q.patientAge) : null,
    q.patientGender ?? null,
    q.doctorName ?? null,
    q.createdDate ?? null,
    (q.createdAt ?? q.createdDate ?? new Date().toISOString()) ?? null,
    q.validUntil ?? null,
    visitNum ?? null,
    q.visitLabel ?? null,
    q.patientTreatmentMode ?? null,
    JSON.stringify(Array.isArray(q.treatments) ? q.treatments : []) ?? null,
    toFiniteMoney(q.treatmentsSubtotal) ?? null,
    JSON.stringify(Array.isArray(q.outdoorPackages) ? q.outdoorPackages : []) ?? null,
    toFiniteMoney(q.outdoorSubtotal) ?? null,
    JSON.stringify(Array.isArray(q.indoorServices) ? q.indoorServices : []) ?? null,
    toFiniteMoney(q.indoorSubtotal) ?? null,
    JSON.stringify(Array.isArray(q.additionalTreatments) ? q.additionalTreatments : []) ?? null,
    toFiniteMoney(q.additionalTreatmentsSubtotal) ?? null,
    toFiniteMoney(q.admissionFee) ?? null,
    toFiniteMoney(q.consultationFee) ?? null,
    toFiniteMoney(q.investigationFee) ?? null,
    toFiniteMoney(q.overallDiscountPercent) ?? null,
    toFiniteMoney(q.overallDiscountAmount) ?? null,
    toFiniteMoney(q.grossTotal) ?? null,
    toFiniteMoney(q.grandTotal) ?? null,
    toFiniteMoney(q.advancePaid) ?? null,
    toFiniteMoney(q.dueAmount) ?? null,
    q.paymentPlanMode ?? null,
    JSON.stringify(Array.isArray(q.paymentPhases) ? q.paymentPhases : []) ?? null,
    (q.paymentStatus ?? 'Quotation') ?? null,
    q.notes ?? null,
    q.createdBy ?? null,
    (q.packageComparison ? JSON.stringify(q.packageComparison) : null) ?? null
  ];
}

async function allocateNextInvoiceNumber(conn: mysql.PoolConnection, year: number): Promise<string> {
  while (true) {
    await conn.execute(
      `INSERT INTO invoice_counters (year, last_value) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_value = last_value + 1`,
      [year]
    );
    const [counterRows]: any = await conn.execute(
      'SELECT last_value FROM invoice_counters WHERE year = ? FOR UPDATE',
      [year]
    );
    const value = Number(counterRows?.[0]?.last_value ?? 1);
    const candidate = `SXH-${year}-${String(value).padStart(5, '0')}`;
    const [collision]: any = await conn.execute(
      'SELECT id FROM quotations_v2 WHERE quotationNumber = ? LIMIT 1',
      [candidate]
    );
    if (!Array.isArray(collision) || collision.length === 0) {
      return candidate;
    }
  }
}

async function allocateDailySerialInTx(conn: mysql.PoolConnection, appointmentDate: string): Promise<number> {
  const dateKey = (appointmentDate && String(appointmentDate).trim()) || new Date().toISOString().split('T')[0];
  await conn.execute(
    `INSERT INTO daily_serial_counters (appointmentDate, last_serial)
     SELECT ?, COALESCE(MAX(consultationSerial), 0) FROM patients WHERE appointmentDate = ?
     ON DUPLICATE KEY UPDATE last_serial = last_serial`,
    [dateKey, dateKey]
  );
  await conn.execute(
    'UPDATE daily_serial_counters SET last_serial = last_serial + 1 WHERE appointmentDate = ?',
    [dateKey]
  );
  const [rows]: any = await conn.execute(
    'SELECT last_serial FROM daily_serial_counters WHERE appointmentDate = ? FOR UPDATE',
    [dateKey]
  );
  return Number(rows?.[0]?.last_serial ?? 1);
}

async function bumpDataVersionInTx(conn: mysql.PoolConnection): Promise<number> {
  await conn.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ('data_version', '1')
     ON DUPLICATE KEY UPDATE setting_value = CAST(CAST(COALESCE(NULLIF(setting_value, ''), '0') AS UNSIGNED) + 1 AS CHAR)`
  );
  const [rows]: any = await conn.execute(
    `SELECT CAST(setting_value AS UNSIGNED) AS ver FROM app_settings WHERE setting_key = 'data_version' FOR UPDATE`
  );
  return Math.max(1, Number(rows?.[0]?.ver || 1));
}

app.get('/api/init', authenticateToken, async (req: any, res) => {
  const user = req.user;
  let patientsTruncated = localData.patients.length > 1000;
  let quotationsTruncated = localData.quotations.length > 1000;
  let patients: any[] = localData.patients.slice(0, 1000);
  let quotations: any[] = localData.quotations.slice(0, 1000);
  let catalog: any[] = localData.catalog;
  let users: any[] = localData.users.map(({ password_hash, ...u }) => u);
  let professions: string[] = (localData as any).professions || DEFAULT_PROFESSIONS;
  let comments: string[] = (localData as any).comments || DEFAULT_CONSULTATION_COMMENTS;

  if (isMySqlActive && mysqlPool) {
    try {
      const [pRows]: any = await mysqlPool.execute('SELECT * FROM patients ORDER BY createdAt DESC, id DESC LIMIT 1001');
      if (Array.isArray(pRows) && pRows.length > 0) {
        patientsTruncated = pRows.length > 1000;
        const cappedPRows = patientsTruncated ? pRows.slice(0, 1000) : pRows;
        patients = cappedPRows.map(formatPatientRow);
      }

      const [qRows]: any = await mysqlPool.execute('SELECT * FROM quotations_v2 ORDER BY createdAt DESC LIMIT 1001');
      if (Array.isArray(qRows) && qRows.length > 0) {
        quotationsTruncated = qRows.length > 1000;
        const cappedQRows = quotationsTruncated ? qRows.slice(0, 1000) : qRows;
        quotations = cappedQRows.map(formatQuotationRow);
      }

      const [cRows]: any = await mysqlPool.execute('SELECT * FROM catalog ORDER BY orderIndex ASC, id ASC');
      if (Array.isArray(cRows) && cRows.length > 0) {
        catalog = cRows.map(formatCatalogRow);
      }

      const [uRows]: any = await mysqlPool.execute('SELECT id, username, name, role, phone, is_active FROM users ORDER BY id ASC');
      if (Array.isArray(uRows) && uRows.length > 0) users = uRows;

      const [sRows]: any = await mysqlPool.execute('SELECT setting_key, setting_value FROM app_settings');
      if (Array.isArray(sRows)) {
        for (const row of sRows) {
          if (row.setting_key === 'professions' && row.setting_value) {
            try { professions = JSON.parse(row.setting_value); } catch {}
          } else if (row.setting_key === 'comments' && row.setting_value) {
            try { comments = JSON.parse(row.setting_value); } catch {}
          } else if (row.setting_key === 'data_version' && row.setting_value) {
            const parsedVer = parseInt(String(row.setting_value), 10);
            if (Number.isFinite(parsedVer) && parsedVer > 0) {
              serverDataVersion = parsedVer;
            }
          }
        }
      }
    } catch (err) {
      console.error('MySQL init fetch error:', err);
    }
  }

  res.json({
    user,
    patients,
    quotations,
    catalog,
    professions,
    comments,
    users,
    dbMode: isMySqlActive ? 'MySQL Central Database' : 'Local File Persistence',
    dataVersion: serverDataVersion,
    patientsTruncated,
    quotationsTruncated
  });
});

app.get('/api/changes', authenticateToken, async (req: any, res) => {
  const sinceRaw = req.query.since;
  const since = sinceRaw !== undefined && sinceRaw !== '' ? Number(sinceRaw) : 0;

  let currentVersion = serverDataVersion;
  if (isMySqlActive && mysqlPool) {
    try {
      const [verRows]: any = await mysqlPool.execute(
        "SELECT CAST(setting_value AS UNSIGNED) AS ver FROM app_settings WHERE setting_key = 'data_version' LIMIT 1"
      );
      if (Array.isArray(verRows) && verRows.length > 0) {
        const parsedVer = Number(verRows[0].ver);
        if (Number.isFinite(parsedVer) && parsedVer > 0) {
          currentVersion = parsedVer;
          serverDataVersion = parsedVer;
        }
      }
    } catch {}
  }

  if (sinceRaw === undefined || sinceRaw === '' || !Number.isFinite(since) || since <= 0) {
    return res.json({
      dataVersion: currentVersion,
      patients: [],
      quotations: [],
      catalog: [],
      truncated: true
    });
  }

  if (isMySqlActive && mysqlPool) {
    try {
      const [pRows]: any = await mysqlPool.execute(
        'SELECT * FROM patients WHERE lastModifiedVersion > ? ORDER BY createdAt DESC, id DESC LIMIT 501',
        [since]
      );
      if (Array.isArray(pRows) && pRows.length > 500) {
        return res.json({
          dataVersion: currentVersion,
          patients: [],
          quotations: [],
          catalog: [],
          truncated: true
        });
      }

      const [qRows]: any = await mysqlPool.execute(
        'SELECT * FROM quotations_v2 WHERE lastModifiedVersion > ? ORDER BY createdAt DESC LIMIT 501',
        [since]
      );
      if (Array.isArray(qRows) && qRows.length > 500) {
        return res.json({
          dataVersion: currentVersion,
          patients: [],
          quotations: [],
          catalog: [],
          truncated: true
        });
      }

      const [cChanged]: any = await mysqlPool.execute(
        'SELECT id FROM catalog WHERE lastModifiedVersion > ? LIMIT 1',
        [since]
      );
      let catalog: any[] = [];
      if (Array.isArray(cChanged) && cChanged.length > 0) {
        const [cRows]: any = await mysqlPool.execute(
          'SELECT * FROM catalog ORDER BY orderIndex ASC, id ASC LIMIT 501'
        );
        if (Array.isArray(cRows) && cRows.length > 500) {
          return res.json({
            dataVersion: currentVersion,
            patients: [],
            quotations: [],
            catalog: [],
            truncated: true
          });
        }
        catalog = Array.isArray(cRows) ? cRows.map(formatCatalogRow) : [];
      }

      return res.json({
        dataVersion: currentVersion,
        patients: Array.isArray(pRows) ? pRows.map(formatPatientRow) : [],
        quotations: Array.isArray(qRows) ? qRows.map(formatQuotationRow) : [],
        catalog,
        truncated: false
      });
    } catch (err: any) {
      console.error('MySQL delta changes fetch error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch incremental changes' });
    }
  }

  // Local File Persistence Mode
  const changedPatients = localData.patients.filter((p: any) => p && Number(p.lastModifiedVersion || 0) > since);
  if (changedPatients.length > 500) {
    return res.json({ dataVersion: currentVersion, patients: [], quotations: [], catalog: [], truncated: true });
  }

  const changedQuotations = localData.quotations.filter((q: any) => q && Number(q.lastModifiedVersion || 0) > since);
  if (changedQuotations.length > 500) {
    return res.json({ dataVersion: currentVersion, patients: [], quotations: [], catalog: [], truncated: true });
  }

  const anyCatalogChanged = localData.catalog.some((c: any) => c && Number(c.lastModifiedVersion || 0) > since);
  let changedCatalog: any[] = [];
  if (anyCatalogChanged) {
    if (localData.catalog.length > 500) {
      return res.json({ dataVersion: currentVersion, patients: [], quotations: [], catalog: [], truncated: true });
    }
    changedCatalog = localData.catalog;
  }

  res.json({
    dataVersion: currentVersion,
    patients: changedPatients,
    quotations: changedQuotations,
    catalog: changedCatalog,
    truncated: false
  });
});

// 2. Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  let user: UserRecord | undefined;

  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND is_active = 1', [(username || '').trim()]);
      if (rows.length > 0) {
        user = rows[0];
      }
    } catch (err) {
      console.error('MySQL User login error:', err);
    }
  }

  if (!user) {
    const cleanUsername = (username || '').trim().toLowerCase();
    user = localData.users.find(u => u.username.toLowerCase() === cleanUsername);
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const tokenPayload = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    message: 'Login successful',
    token,
    user: tokenPayload
  });
});

app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', authenticateToken, async (req: any, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }

  const userId = req.user?.id;
  const username = req.user?.username;

  const existingIdx = localData.users.findIndex(u => u.id === userId || u.username === username);
  if (existingIdx < 0) {
    return res.status(404).json({ error: 'User account not found' });
  }

  const targetUser = localData.users[existingIdx];
  if (currentPassword) {
    const isMatch = bcrypt.compareSync(currentPassword, targetUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
  }

  const newHash = bcrypt.hashSync(newPassword, 10);

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE users SET password_hash = ? WHERE id = ? OR username = ?',
        [newHash, userId, username]
      );
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL update password error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to update password in database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  localData.users[existingIdx].password_hash = newHash;
  saveLocalDb();

  res.json({ message: 'Password updated successfully' });
});

// 3. User Management Endpoints (System Admin can Create, Edit, Delete Users)
app.get('/api/users', authenticateToken, requireRole('System Admin'), async (req: any, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT id, username, name, role, phone, is_active FROM users ORDER BY created_at ASC');
      return res.json(rows);
    } catch (err) {
      console.error('MySQL fetch users error:', err);
    }
  }
  res.json(localData.users.map(({ password_hash, ...u }) => u));
});

app.post('/api/users', authenticateToken, requireRole('System Admin'), async (req: any, res) => {
  const { username, password, name, role, phone } = req.body;
  if (!username || !name || !role) {
    return res.status(400).json({ error: 'Username, Name, and Role are required' });
  }

  const existingIdx = localData.users.findIndex(u => u.username === username);
  const password_hash = password ? bcrypt.hashSync(password, 10) : (existingIdx >= 0 ? localData.users[existingIdx].password_hash : bcrypt.hashSync('123456', 10));

  const newUser: UserRecord = {
    id: existingIdx >= 0 ? localData.users[existingIdx].id : `usr-${Date.now()}`,
    username: String(username).trim(),
    password_hash,
    name: String(name).trim(),
    role,
    phone: phone || '',
    is_active: 1
  };

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO users (id, username, password_hash, name, role, phone, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE password_hash=?, name=?, role=?, phone=?, is_active=?`,
        [newUser.id, newUser.username, newUser.password_hash, newUser.name, newUser.role, newUser.phone, newUser.is_active,
         newUser.password_hash, newUser.name, newUser.role, newUser.phone, newUser.is_active]
      );
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL user save error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to save user in database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  if (existingIdx >= 0) {
    localData.users[existingIdx] = newUser;
  } else {
    localData.users.push(newUser);
  }
  saveLocalDb();

  res.json({ message: 'User account saved successfully', user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, phone: newUser.phone } });
});

app.delete('/api/users/:id', authenticateToken, requireRole('System Admin'), async (req: any, res) => {
  const { id } = req.params;

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM users WHERE id = ?', [id]);
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL user delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete user in database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  localData.users = localData.users.filter(u => u.id !== id);
  saveLocalDb();

  res.json({ message: 'User account deleted successfully' });
});

// 4. Patients API & PDF Upload Parser
app.get('/api/patients/summary', authenticateToken, requireRole('System Admin', 'Admin', 'Doctor', 'Call Center', 'Billing Counter', 'SSD'), async (req, res) => {
  res.json({
    dataVersion: serverDataVersion,
    timestamp: Date.now()
  });
});

const REPORTS_META_CACHE_TTL_MS = 60_000;
let reportsMetaCache: {
  allTimeTotalPatients: number;
  allDoctors: string[];
  expiresAt: number;
  mode: 'mysql' | 'local';
} | null = null;

app.get('/api/reports/summary', authenticateToken, requireRole('System Admin', 'Admin', 'SSD'), async (req, res) => {
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : '';
  const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : '';
  const doctorFilter = req.query.doctor ? String(req.query.doctor).trim() : 'all';
  const searchTerm = req.query.q ? String(req.query.q).trim().toLowerCase() : '';

  const COND_CONFIRMED = `(isConfirmed = 1 OR consultationSerial IS NOT NULL OR (confirmedAt IS NOT NULL AND confirmedAt != ''))`;
  const COND_PRE = `(status = 'Pre Consultation' OR consultationStatus = 'Pre Consultation' OR status = 'Post Consultation' OR (preDoctorName IS NOT NULL AND preDoctorName != '') OR (preConsultationAt IS NOT NULL AND preConsultationAt != ''))`;
  const COND_POST = `(status = 'Post Consultation' OR consultationStatus = 'Post Consultation' OR postConsultationConfirmed = 1 OR (postDoctorName IS NOT NULL AND postDoctorName != ''))`;
  const COND_DOCTOR_PRE = `(status = 'Pre Consultation' OR consultationStatus = 'Pre Consultation' OR status = 'Post Consultation' OR consultationStatus = 'Post Consultation' OR (preDoctorName IS NOT NULL AND preDoctorName != '') OR (preConsultationAt IS NOT NULL AND preConsultationAt != ''))`;
  const COND_DOCTOR_POST = `(status = 'Post Consultation' OR consultationStatus = 'Post Consultation' OR postConsultationConfirmed = 1 OR (postDoctorName IS NOT NULL AND postDoctorName != '') OR (postConsultationAt IS NOT NULL AND postConsultationAt != ''))`;

  if (isMySqlActive && mysqlPool) {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (dateFrom || dateTo) {
        conditions.push(`(appointmentDate IS NOT NULL AND appointmentDate != '')`);
        if (dateFrom) {
          conditions.push(`appointmentDate >= ?`);
          params.push(dateFrom);
        }
        if (dateTo) {
          conditions.push(`appointmentDate <= ?`);
          params.push(dateTo);
        }
      }

      if (doctorFilter && doctorFilter !== 'all') {
        conditions.push(`(doctorName = ? OR preDoctorName = ? OR postDoctorName = ?)`);
        params.push(doctorFilter, doctorFilter, doctorFilter);
      }

      if (searchTerm) {
        const likeParam = `%${searchTerm}%`;
        conditions.push(`(
          LOWER(COALESCE(name, '')) LIKE ? OR
          LOWER(COALESCE(phone, '')) LIKE ? OR
          LOWER(COALESCE(profession, '')) LIKE ? OR
          LOWER(COALESCE(consultationComment, '')) LIKE ? OR
          LOWER(COALESCE(remark, '')) LIKE ? OR
          CAST(COALESCE(consultationSerial, '') AS CHAR) LIKE ?
        )`);
        params.push(likeParam, likeParam, likeParam, likeParam, likeParam, likeParam);
      }

      const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const ageExpr = `CASE WHEN TRIM(COALESCE(age, '')) REGEXP '^-?[0-9]+' THEN CAST(TRIM(age) AS SIGNED) ELSE NULL END`;
      const isFemaleExpr = `(LOWER(COALESCE(gender, '')) LIKE '%female%' OR LOWER(COALESCE(gender, '')) = 'f')`;
      const isMaleExpr = `(NOT ${isFemaleExpr} AND (LOWER(COALESCE(gender, '')) LIKE '%male%' OR LOWER(COALESCE(gender, '')) = 'm'))`;

      const [summaryRows]: any = await mysqlPool.execute(
        `SELECT
          COUNT(*) AS totalAppointments,
          COALESCE(SUM(CASE WHEN ${COND_CONFIRMED} THEN 1 ELSE 0 END), 0) AS confirmedCount,
          COALESCE(SUM(CASE WHEN ${COND_PRE} THEN 1 ELSE 0 END), 0) AS preConsultationCount,
          COALESCE(SUM(CASE WHEN ${COND_POST} THEN 1 ELSE 0 END), 0) AS postConsultationCount,
          COALESCE(SUM(CASE WHEN isInstant = 1 THEN 1 ELSE 0 END), 0) AS instantCount,
          COALESCE(SUM(CASE WHEN isInstant = 1 THEN COALESCE(instantFee, 2000) ELSE 0 END), 0) AS instantRevenue,
          COALESCE(SUM(CASE WHEN isEd = 1 THEN 1 ELSE 0 END), 0) AS edCount,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND pathologyStatus = 'Yes' THEN 1 ELSE 0 END), 0) AS pathYes,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND pathologyStatus = 'No' THEN 1 ELSE 0 END), 0) AS pathNo,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND organicStatus = 'Yes' THEN 1 ELSE 0 END), 0) AS orgYes,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND organicStatus = 'No' THEN 1 ELSE 0 END), 0) AS orgNo,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND nutritionStatus = 'Yes' THEN 1 ELSE 0 END), 0) AS nutYes,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND nutritionStatus = 'No' THEN 1 ELSE 0 END), 0) AS nutNo,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND ${isFemaleExpr} THEN 1 ELSE 0 END), 0) AS femaleCount,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND ${isMaleExpr} THEN 1 ELSE 0 END), 0) AS maleCount,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND (${ageExpr}) IS NOT NULL AND (${ageExpr}) < 20 THEN 1 ELSE 0 END), 0) AS under20,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND (${ageExpr}) >= 20 AND (${ageExpr}) <= 35 THEN 1 ELSE 0 END), 0) AS age20to35,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND (${ageExpr}) >= 36 AND (${ageExpr}) <= 50 THEN 1 ELSE 0 END), 0) AS age36to50,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND (${ageExpr}) >= 51 AND (${ageExpr}) <= 65 THEN 1 ELSE 0 END), 0) AS age51to65,
          COALESCE(SUM(CASE WHEN (${COND_POST}) AND (${ageExpr}) > 65 THEN 1 ELSE 0 END), 0) AS above65
        FROM patients ${whereSql}`,
        params
      );

      const s = summaryRows?.[0] || {};
      const totalAppointments = Number(s.totalAppointments || 0);
      const confirmedCount = Number(s.confirmedCount || 0);
      const unconfirmedCount = Math.max(0, totalAppointments - confirmedCount);
      const preConsultationCount = Number(s.preConsultationCount || 0);
      const postConsultationCount = Number(s.postConsultationCount || 0);
      const instantCount = Number(s.instantCount || 0);
      const instantRevenue = Number(s.instantRevenue || 0);
      const edCount = Number(s.edCount || 0);

      const pathYes = Number(s.pathYes || 0);
      const pathNo = Number(s.pathNo || 0);
      const pathPending = Math.max(0, postConsultationCount - pathYes - pathNo);
      const orgYes = Number(s.orgYes || 0);
      const orgNo = Number(s.orgNo || 0);
      const orgPending = Math.max(0, postConsultationCount - orgYes - orgNo);
      const nutYes = Number(s.nutYes || 0);
      const nutNo = Number(s.nutNo || 0);
      const nutPending = Math.max(0, postConsultationCount - nutYes - nutNo);

      const male = Number(s.maleCount || 0);
      const female = Number(s.femaleCount || 0);
      const other = Math.max(0, postConsultationCount - male - female);
      const under20 = Number(s.under20 || 0);
      const age20to35 = Number(s.age20to35 || 0);
      const age36to50 = Number(s.age36to50 || 0);
      const age51to65 = Number(s.age51to65 || 0);
      const above65 = Number(s.above65 || 0);
      const unknownAge = Math.max(0, postConsultationCount - under20 - age20to35 - age36to50 - age51to65 - above65);

      const andJoin = whereSql ? `${whereSql} AND` : 'WHERE';

      const [preDocRows]: any = await mysqlPool.execute(
        `SELECT TRIM(COALESCE(NULLIF(TRIM(preDoctorName), ''), NULLIF(TRIM(doctorName), ''), 'Doctor Not Assigned')) AS doctorName,
                COUNT(*) AS cnt
         FROM patients ${andJoin} ${COND_DOCTOR_PRE}
         GROUP BY doctorName`,
        params
      );

      const [postDocRows]: any = await mysqlPool.execute(
        `SELECT TRIM(COALESCE(NULLIF(TRIM(postDoctorName), ''), NULLIF(TRIM(doctorName), ''), 'Doctor Not Assigned')) AS doctorName,
                COUNT(*) AS cnt
         FROM patients ${andJoin} ${COND_DOCTOR_POST}
         GROUP BY doctorName`,
        params
      );

      const [assignedOnlyDocRows]: any = await mysqlPool.execute(
        `SELECT DISTINCT TRIM(doctorName) AS doctorName
         FROM patients ${andJoin} NOT (${COND_DOCTOR_PRE}) AND NOT (${COND_DOCTOR_POST})
         AND doctorName IS NOT NULL AND TRIM(doctorName) != ''`,
        params
      );

      const doctorMap = new Map<string, { doctorName: string; preCount: number; postCount: number; totalConsulted: number }>();
      const ensureDoc = (docName: string) => {
        const clean = String(docName || 'Doctor Not Assigned').trim();
        if (!doctorMap.has(clean)) {
          doctorMap.set(clean, { doctorName: clean, preCount: 0, postCount: 0, totalConsulted: 0 });
        }
        return doctorMap.get(clean)!;
      };
      for (const r of preDocRows || []) {
        ensureDoc(r.doctorName).preCount += Number(r.cnt || 0);
      }
      for (const r of postDocRows || []) {
        ensureDoc(r.doctorName).postCount += Number(r.cnt || 0);
      }
      for (const r of assignedOnlyDocRows || []) {
        ensureDoc(r.doctorName);
      }
      const doctors = Array.from(doctorMap.values())
        .map(d => ({ ...d, totalConsulted: d.preCount + d.postCount }))
        .filter(d => d.totalConsulted > 0 || d.preCount > 0 || d.postCount > 0)
        .sort((a, b) => b.totalConsulted - a.totalConsulted);

      const [profRows]: any = await mysqlPool.execute(
        `SELECT COALESCE(NULLIF(TRIM(profession), ''), 'Not Specified') AS name, COUNT(*) AS count
         FROM patients ${andJoin} ${COND_POST}
         GROUP BY name
         ORDER BY count DESC`,
        params
      );
      const professions = (profRows || []).map((r: any) => ({
        name: String(r.name || 'Not Specified'),
        count: Number(r.count || 0)
      }));

      const [commentRows]: any = await mysqlPool.execute(
        `SELECT TRIM(consultationComment) AS comment, COUNT(*) AS count
         FROM patients ${andJoin} (consultationComment IS NOT NULL AND TRIM(consultationComment) != '')
         GROUP BY comment
         ORDER BY count DESC`,
        params
      );
      const comments = (commentRows || []).map((r: any) => ({
        comment: String(r.comment || ''),
        count: Number(r.count || 0)
      }));

      const now = Date.now();
      let allTimeTotalPatients: number;
      let allDoctors: string[];
      if (reportsMetaCache && reportsMetaCache.mode === 'mysql' && now < reportsMetaCache.expiresAt) {
        allTimeTotalPatients = reportsMetaCache.allTimeTotalPatients;
        allDoctors = reportsMetaCache.allDoctors;
      } else {
        const [allTimeRows]: any = await mysqlPool.execute('SELECT COUNT(*) AS cnt FROM patients');
        allTimeTotalPatients = Number(allTimeRows?.[0]?.cnt || 0);

        const [distinctDocRows]: any = await mysqlPool.execute(
          `SELECT DISTINCT doc FROM (
            SELECT TRIM(doctorName) AS doc FROM patients WHERE doctorName IS NOT NULL AND TRIM(doctorName) != ''
            UNION
            SELECT TRIM(preDoctorName) AS doc FROM patients WHERE preDoctorName IS NOT NULL AND TRIM(preDoctorName) != ''
            UNION
            SELECT TRIM(postDoctorName) AS doc FROM patients WHERE postDoctorName IS NOT NULL AND TRIM(postDoctorName) != ''
          ) t ORDER BY doc ASC`
        );
        allDoctors = (distinctDocRows || []).map((r: any) => String(r.doc)).filter(Boolean);
        reportsMetaCache = {
          allTimeTotalPatients,
          allDoctors,
          expiresAt: now + REPORTS_META_CACHE_TTL_MS,
          mode: 'mysql'
        };
      }

      const qConditions: string[] = [];
      const qParams: any[] = [];
      const qDateExpr = `COALESCE(NULLIF(LEFT(createdDate, 10), ''), LEFT(createdAt, 10))`;
      if (dateFrom || dateTo) {
        qConditions.push(`(${qDateExpr} IS NOT NULL AND ${qDateExpr} != '')`);
        if (dateFrom) {
          qConditions.push(`${qDateExpr} >= ?`);
          qParams.push(dateFrom);
        }
        if (dateTo) {
          qConditions.push(`${qDateExpr} <= ?`);
          qParams.push(dateTo);
        }
      }
      if (doctorFilter && doctorFilter !== 'all') {
        qConditions.push(`doctorName = ?`);
        qParams.push(doctorFilter);
      }
      if (searchTerm) {
        const qLike = `%${searchTerm}%`;
        qConditions.push(`(LOWER(COALESCE(patientName, '')) LIKE ? OR LOWER(COALESCE(patientPhone, '')) LIKE ? OR LOWER(COALESCE(quotationNumber, '')) LIKE ?)`);
        qParams.push(qLike, qLike, qLike);
      }
      const qWhereSql = qConditions.length > 0 ? `WHERE ${qConditions.join(' AND ')}` : '';
      const [qSumRows]: any = await mysqlPool.execute(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(grandTotal), 0) AS grandTotal,
                COALESCE(SUM(advancePaid), 0) AS advancePaid,
                COALESCE(SUM(dueAmount), 0) AS dueAmount
         FROM quotations_v2 ${qWhereSql}`,
        qParams
      );
      const qRow = qSumRows?.[0] || {};

      return res.json({
        allTimeTotalPatients,
        allDoctors,
        funnel: {
          totalAppointments,
          confirmedCount,
          unconfirmedCount,
          preConsultationCount,
          postConsultationCount
        },
        instant: {
          instantCount,
          instantRevenue
        },
        ed: {
          edCount
        },
        departments: {
          totalPost: postConsultationCount,
          pathYes,
          pathNo,
          pathPending,
          orgYes,
          orgNo,
          orgPending,
          nutYes,
          nutNo,
          nutPending
        },
        doctors,
        professions,
        comments,
        demographics: {
          total: postConsultationCount,
          male,
          female,
          other,
          ageGroups: {
            under20,
            age20to35,
            age36to50,
            age51to65,
            above65,
            unknown: unknownAge
          }
        },
        quotations: {
          count: Number(qRow.count || 0),
          grandTotal: Number(qRow.grandTotal || 0),
          advancePaid: Number(qRow.advancePaid || 0),
          dueAmount: Number(qRow.dueAmount || 0)
        }
      });
    } catch (err: any) {
      console.error('MySQL reports summary error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to compute report summary' });
    }
  }

  // Local File Persistence Mode
  const now = Date.now();
  let allTimeTotalPatients: number;
  let allDoctors: string[];
  if (reportsMetaCache && reportsMetaCache.mode === 'local' && now < reportsMetaCache.expiresAt) {
    allTimeTotalPatients = reportsMetaCache.allTimeTotalPatients;
    allDoctors = reportsMetaCache.allDoctors;
  } else {
    const allDocsSet = new Set<string>();
    localData.patients.forEach((p: any) => {
      if (p?.doctorName && String(p.doctorName).trim()) allDocsSet.add(String(p.doctorName).trim());
      if (p?.preDoctorName && String(p.preDoctorName).trim()) allDocsSet.add(String(p.preDoctorName).trim());
      if (p?.postDoctorName && String(p.postDoctorName).trim()) allDocsSet.add(String(p.postDoctorName).trim());
    });
    allDoctors = Array.from(allDocsSet).sort();
    allTimeTotalPatients = localData.patients.length;
    reportsMetaCache = {
      allTimeTotalPatients,
      allDoctors,
      expiresAt: now + REPORTS_META_CACHE_TTL_MS,
      mode: 'local'
    };
  }

  const filtered = localData.patients.filter((p: any) => {
    if (!p) return false;
    if (dateFrom || dateTo) {
      const d = p.appointmentDate ? String(p.appointmentDate).trim() : '';
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
    }
    if (doctorFilter && doctorFilter !== 'all') {
      if (p.doctorName !== doctorFilter && p.preDoctorName !== doctorFilter && p.postDoctorName !== doctorFilter) {
        return false;
      }
    }
    if (searchTerm) {
      const matched =
        p.name?.toLowerCase().includes(searchTerm) ||
        p.phone?.toLowerCase().includes(searchTerm) ||
        p.profession?.toLowerCase().includes(searchTerm) ||
        p.consultationComment?.toLowerCase().includes(searchTerm) ||
        p.remark?.toLowerCase().includes(searchTerm) ||
        String(p.consultationSerial || '').includes(searchTerm);
      if (!matched) return false;
    }
    return true;
  });

  const totalAppointments = filtered.length;
  const confirmedCount = filtered.filter((p: any) =>
    Boolean(p.isConfirmed) || typeof p.consultationSerial === 'number' || Boolean(p.confirmedAt)
  ).length;
  const unconfirmedCount = totalAppointments - confirmedCount;
  const preConsultationCount = filtered.filter((p: any) =>
    p.status === 'Pre Consultation' ||
    p.consultationStatus === 'Pre Consultation' ||
    p.status === 'Post Consultation' ||
    Boolean(p.preDoctorName) ||
    Boolean(p.preConsultationAt)
  ).length;
  const postPatients = filtered.filter((p: any) =>
    p.status === 'Post Consultation' ||
    p.consultationStatus === 'Post Consultation' ||
    Boolean(p.postConsultationConfirmed) ||
    Boolean(p.postDoctorName)
  );
  const postConsultationCount = postPatients.length;

  const instantPatients = filtered.filter((p: any) => Boolean(p.isInstant));
  const instantCount = instantPatients.length;
  const instantRevenue = instantPatients.reduce((sum: number, p: any) => sum + (p.instantFee != null ? Number(p.instantFee) : 2000), 0);
  const edCount = filtered.filter((p: any) => Boolean(p.isEd)).length;

  const pathYes = postPatients.filter((p: any) => p.pathologyStatus === 'Yes').length;
  const pathNo = postPatients.filter((p: any) => p.pathologyStatus === 'No').length;
  const orgYes = postPatients.filter((p: any) => p.organicStatus === 'Yes').length;
  const orgNo = postPatients.filter((p: any) => p.organicStatus === 'No').length;
  const nutYes = postPatients.filter((p: any) => p.nutritionStatus === 'Yes').length;
  const nutNo = postPatients.filter((p: any) => p.nutritionStatus === 'No').length;

  const docMap = new Map<string, { doctorName: string; preCount: number; postCount: number; totalConsulted: number }>();
  const getDoc = (name: string) => {
    const clean = name.trim();
    if (!docMap.has(clean)) docMap.set(clean, { doctorName: clean, preCount: 0, postCount: 0, totalConsulted: 0 });
    return docMap.get(clean)!;
  };
  filtered.forEach((p: any) => {
    const isPre =
      p.status === 'Pre Consultation' ||
      p.consultationStatus === 'Pre Consultation' ||
      p.status === 'Post Consultation' ||
      p.consultationStatus === 'Post Consultation' ||
      Boolean(p.preDoctorName) ||
      Boolean(p.preConsultationAt);
    const isPost =
      p.status === 'Post Consultation' ||
      p.consultationStatus === 'Post Consultation' ||
      Boolean(p.postConsultationConfirmed) ||
      Boolean(p.postDoctorName) ||
      Boolean(p.postConsultationAt);
    if (isPre) getDoc(p.preDoctorName || p.doctorName || 'Doctor Not Assigned').preCount += 1;
    if (isPost) getDoc(p.postDoctorName || p.doctorName || 'Doctor Not Assigned').postCount += 1;
    if (!isPre && !isPost && p.doctorName) getDoc(p.doctorName);
  });
  const doctors = Array.from(docMap.values())
    .map(d => ({ ...d, totalConsulted: d.preCount + d.postCount }))
    .filter(d => d.totalConsulted > 0 || d.preCount > 0 || d.postCount > 0)
    .sort((a, b) => b.totalConsulted - a.totalConsulted);

  const profMap = new Map<string, number>();
  postPatients.forEach((p: any) => {
    const raw = p.profession?.trim();
    const prof = raw && raw.length > 0 ? raw : 'Not Specified';
    profMap.set(prof, (profMap.get(prof) || 0) + 1);
  });
  const professions = Array.from(profMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const commentMap = new Map<string, number>();
  filtered.forEach((p: any) => {
    const c = p.consultationComment?.trim();
    if (c && c.length > 0) {
      commentMap.set(c, (commentMap.get(c) || 0) + 1);
    }
  });
  const comments = Array.from(commentMap.entries())
    .map(([comment, count]) => ({ comment, count }))
    .sort((a, b) => b.count - a.count);

  let male = 0;
  let female = 0;
  let other = 0;
  const ageGroups = { under20: 0, age20to35: 0, age36to50: 0, age51to65: 0, above65: 0, unknown: 0 };
  postPatients.forEach((p: any) => {
    const g = p.gender?.toLowerCase() || '';
    if (g.includes('female') || g === 'f') female++;
    else if (g.includes('male') || g === 'm') male++;
    else other++;

    const a = typeof p.age === 'number' ? p.age : parseInt(String(p.age || ''), 10);
    if (isNaN(a)) ageGroups.unknown++;
    else if (a < 20) ageGroups.under20++;
    else if (a <= 35) ageGroups.age20to35++;
    else if (a <= 50) ageGroups.age36to50++;
    else if (a <= 65) ageGroups.age51to65++;
    else ageGroups.above65++;
  });

  const filteredQuotations = localData.quotations.filter((q: any) => {
    if (!q) return false;
    if (dateFrom || dateTo) {
      const qDate = (q.createdDate ? String(q.createdDate).slice(0, 10) : '') || (q.createdAt ? String(q.createdAt).slice(0, 10) : '');
      if (!qDate) return false;
      if (dateFrom && qDate < dateFrom) return false;
      if (dateTo && qDate > dateTo) return false;
    }
    if (doctorFilter && doctorFilter !== 'all' && q.doctorName !== doctorFilter) {
      return false;
    }
    if (searchTerm) {
      const matched =
        q.patientName?.toLowerCase().includes(searchTerm) ||
        q.patientPhone?.toLowerCase().includes(searchTerm) ||
        q.quotationNumber?.toLowerCase().includes(searchTerm);
      if (!matched) return false;
    }
    return true;
  });

  res.json({
    allTimeTotalPatients,
    allDoctors,
    funnel: {
      totalAppointments,
      confirmedCount,
      unconfirmedCount,
      preConsultationCount,
      postConsultationCount
    },
    instant: {
      instantCount,
      instantRevenue
    },
    ed: {
      edCount
    },
    departments: {
      totalPost: postConsultationCount,
      pathYes,
      pathNo,
      pathPending: Math.max(0, postConsultationCount - pathYes - pathNo),
      orgYes,
      orgNo,
      orgPending: Math.max(0, postConsultationCount - orgYes - orgNo),
      nutYes,
      nutNo,
      nutPending: Math.max(0, postConsultationCount - nutYes - nutNo)
    },
    doctors,
    professions,
    comments,
    demographics: {
      total: postConsultationCount,
      male,
      female,
      other,
      ageGroups
    },
    quotations: {
      count: filteredQuotations.length,
      grandTotal: filteredQuotations.reduce((sum: number, q: any) => sum + Number(q.grandTotal || 0), 0),
      advancePaid: filteredQuotations.reduce((sum: number, q: any) => sum + Number(q.advancePaid || 0), 0),
      dueAmount: filteredQuotations.reduce((sum: number, q: any) => sum + Number(q.dueAmount || 0), 0)
    }
  });
});

app.get('/api/patients', authenticateToken, requireRole('System Admin', 'Admin', 'Doctor', 'Call Center', 'Billing Counter', 'SSD', 'Pathology', 'Organic', 'Nutrition'), async (req, res) => {
  const parsedLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 2000;
  const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 2000) : 2000;
  const parsedOffset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
  const dateFilter = req.query.date ? String(req.query.date).trim() : '';
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : '';
  const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : '';

  if (isMySqlActive && mysqlPool) {
    try {
      const conditions: string[] = [];
      const queryParams: any[] = [];

      if (dateFilter && dateFilter !== 'all') {
        conditions.push('appointmentDate = ?');
        queryParams.push(dateFilter);
      } else if (dateFrom || dateTo) {
        conditions.push("(appointmentDate IS NOT NULL AND appointmentDate != '')");
        if (dateFrom) {
          conditions.push('appointmentDate >= ?');
          queryParams.push(dateFrom);
        }
        if (dateTo) {
          conditions.push('appointmentDate <= ?');
          queryParams.push(dateTo);
        }
      }

      const whereSql = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const queryStr = `SELECT * FROM patients${whereSql} ORDER BY createdAt DESC, id DESC LIMIT ${effectiveLimit + 1} OFFSET ${offset}`;

      const [rows]: any = await mysqlPool.execute(queryStr, queryParams);
      if (Array.isArray(rows)) {
        const truncated = rows.length > effectiveLimit;
        const capped = truncated ? rows.slice(0, effectiveLimit) : rows;
        return res.json({
          patients: capped.map(formatPatientRow),
          truncated
        });
      }
    } catch (err) {
      console.error('Error fetching patients from MySQL:', err);
    }
  }

  let filteredPatients: any[] = [...localData.patients];
  if (dateFilter && dateFilter !== 'all') {
    filteredPatients = filteredPatients.filter(p => p && p.appointmentDate === dateFilter);
  } else if (dateFrom || dateTo) {
    filteredPatients = filteredPatients.filter(p => {
      const d = p?.appointmentDate ? String(p.appointmentDate).trim() : '';
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }

  const sliced = filteredPatients.slice(offset, offset + effectiveLimit);
  const truncated = filteredPatients.length > offset + effectiveLimit;

  res.json({
    patients: sliced,
    truncated
  });
});

app.get('/api/patients/search', authenticateToken, requireRole('System Admin', 'Admin', 'Doctor', 'Call Center', 'Billing Counter', 'SSD'), async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const dateFilter = req.query.date ? String(req.query.date).trim() : '';

  if (!query) {
    // If no query, return recent patients with limit (and optional date filter)
    if (isMySqlActive && mysqlPool) {
      try {
        let queryStr = 'SELECT * FROM patients';
        const queryParams: any[] = [];
        if (dateFilter && dateFilter !== 'all') {
          queryStr += ' WHERE appointmentDate = ?';
          queryParams.push(dateFilter);
        }
        queryStr += ' ORDER BY createdAt DESC, id DESC LIMIT ?';
        queryParams.push(String(limit));
        const [rows]: any = await mysqlPool.execute(queryStr, queryParams);
        return res.json((rows || []).map(formatPatientRow));
      } catch (err) {
        console.error('MySQL recent patients error:', err);
      }
    }
    let fallback = localData.patients;
    if (dateFilter && dateFilter !== 'all') {
      fallback = fallback.filter(p => p.appointmentDate === dateFilter);
    }
    return res.json(fallback.slice(0, limit));
  }

  // Bengali to English digit mapping
  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  const convertBnToEn = (s: string) => s.replace(/[০-৯]/g, (char) => bnToEnMap[char] || char);

  const cleanQuery = convertBnToEn(query.toLowerCase());
  const queryDigits = convertBnToEn(query).replace(/\D/g, '');
  const queryDigitsNoZero = queryDigits.replace(/^0+/, '');

  let results: any[] = [];
  const seenIds = new Set<string>();

  // 1. Direct MySQL Search if active
  if (isMySqlActive && mysqlPool) {
    try {
      const searchParam = `%${cleanQuery}%`;
      const digitParam = queryDigits.length >= 3 ? `%${queryDigits}%` : searchParam;

      let whereClause = `(name LIKE ? 
            OR phone LIKE ? 
            OR serialNo = ? 
            OR serialNo = ?
            OR serialNo LIKE ? 
            OR doctorName LIKE ? 
            OR notes LIKE ? 
            OR remark LIKE ?)`;
      
      const queryParams = [
        searchParam, 
        digitParam, 
        cleanQuery, 
        queryDigitsNoZero || cleanQuery,
        `%${cleanQuery}%`, 
        searchParam, 
        searchParam, 
        searchParam
      ];

      if (dateFilter && dateFilter !== 'all') {
        whereClause = `appointmentDate = ? AND ${whereClause}`;
        queryParams.unshift(dateFilter);
      }

      queryParams.push(String(limit));

      const [rows]: any = await mysqlPool.execute(
        `SELECT * FROM patients 
         WHERE ${whereClause}
         ORDER BY createdAt DESC 
         LIMIT ?`,
        queryParams
      );

      if (Array.isArray(rows)) {
        rows.forEach((r: any) => {
          if (r && r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            results.push(formatPatientRow(r));
          }
        });
      }
    } catch (err) {
      console.error('Error executing fast MySQL patient search:', err);
    }
  }

  // 2. Also search in-memory/localData for any unsynced or local items
  const queryNoZero = queryDigits.replace(/^0+/, '');
  for (const p of localData.patients) {
    if (!p || seenIds.has(p.id)) continue;
    if (dateFilter && dateFilter !== 'all' && p.appointmentDate && p.appointmentDate !== dateFilter) {
      continue;
    }

    const name = convertBnToEn(String(p.name || '').toLowerCase());
    const phone = convertBnToEn(String(p.phone || '').toLowerCase());
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneNoZero = phoneDigits.replace(/^0+/, '');
    const serial = String(p.serialNo || '').trim().toLowerCase();
    const serialNoZero = serial.replace(/^0+/, '');
    const notes = convertBnToEn(String(p.notes || p.remark || '').toLowerCase());
    const doctor = convertBnToEn(String(p.doctorName || '').toLowerCase());

    let isMatch = false;
    if (
      name.includes(cleanQuery) || 
      phone.includes(cleanQuery) || 
      serial === cleanQuery || 
      (queryNoZero && serialNoZero === queryNoZero) ||
      notes.includes(cleanQuery) || 
      doctor.includes(cleanQuery)
    ) {
      isMatch = true;
    } else if (queryDigits.length >= 3) {
      if (phoneDigits.includes(queryDigits) || (queryNoZero.length >= 3 && phoneDigits.includes(queryNoZero))) isMatch = true;
      if (phoneNoZero.length >= 3 && queryDigits.includes(phoneNoZero)) isMatch = true;
    }

    if (isMatch) {
      seenIds.add(p.id);
      results.push(p);
      if (results.length >= limit) break;
    }
  }

  res.json(results);
});

app.post('/api/patients', authenticateToken, requireRole('System Admin', 'Call Center', 'Billing Counter', 'Doctor'), async (req, res) => {
  const p = req.body;
  if (!p.name || !p.phone) {
    return res.status(400).json({ error: 'Patient Name and Phone Number are required' });
  }

  const cleanPhone = String(p.phone).trim();
  // ONLY match by id, NEVER overwrite different appointments of the same phone number
  const existingIdx = p.id ? localData.patients.findIndex(x => x.id === p.id) : -1;

  // Doctor role cannot create new patients
  if ((req as any).user?.role === 'Doctor') {
    let existsInDb = false;
    if (existingIdx === -1 && p.id && isMySqlActive && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.execute('SELECT id FROM patients WHERE id = ?', [p.id]);
        if (Array.isArray(rows) && rows.length > 0) existsInDb = true;
      } catch {}
    }
    if (existingIdx === -1 && !existsInDb) {
      return res.status(403).json({ error: 'Doctors are not permitted to add new patients. Only System Admin and Call Center can register new patients.' });
    }
  }

  let cleanSerial = '';
  if (p.serialNo) {
    const match = String(p.serialNo).match(/\b\d+\b/);
    if (match) cleanSerial = match[0];
  }
  if (!cleanSerial) {
    cleanSerial = String(localData.patients.length + 1);
  }

  const formattedPatient = {
    id: existingIdx >= 0 ? localData.patients[existingIdx].id : (p.id || makeUniqueId()),
    serialNo: cleanSerial,
    name: String(p.name).trim(),
    phone: cleanPhone,
    age: p.age || '',
    gender: p.gender || 'Other',
    address: p.address || '',
    doctorName: p.doctorName || 'Dr. S.M. Shahidul Islam PhD',
    appointmentDate: p.appointmentDate || new Date().toISOString().split('T')[0],
    appointmentTime: p.appointmentTime || '09:00 AM',
    department: p.department || 'Acupuncture',
    status: p.status || (existingIdx >= 0 ? localData.patients[existingIdx].status : 'Pending Counseling'),
    isConfirmed: p.isConfirmed !== undefined ? Boolean(p.isConfirmed) : (existingIdx >= 0 ? Boolean(localData.patients[existingIdx].isConfirmed) : false),
    confirmedAt: p.confirmedAt !== undefined ? p.confirmedAt : (existingIdx >= 0 ? localData.patients[existingIdx].confirmedAt : ''),
    consultationSerial: p.consultationSerial !== undefined ? (p.consultationSerial !== null ? Number(p.consultationSerial) : null) : (existingIdx >= 0 ? localData.patients[existingIdx].consultationSerial : null),
    consultationStatus: p.consultationStatus !== undefined ? p.consultationStatus : (existingIdx >= 0 ? localData.patients[existingIdx].consultationStatus : ''),
    profession: p.profession !== undefined ? p.profession : (existingIdx >= 0 ? localData.patients[existingIdx].profession : ''),
    preDoctorName: p.preDoctorName !== undefined ? p.preDoctorName : (existingIdx >= 0 ? localData.patients[existingIdx].preDoctorName : ''),
    postDoctorName: p.postDoctorName !== undefined ? p.postDoctorName : (existingIdx >= 0 ? localData.patients[existingIdx].postDoctorName : ''),
    preConsultationAt: p.preConsultationAt !== undefined ? p.preConsultationAt : (existingIdx >= 0 ? localData.patients[existingIdx].preConsultationAt : ''),
    postConsultationAt: p.postConsultationAt !== undefined ? p.postConsultationAt : (existingIdx >= 0 ? localData.patients[existingIdx].postConsultationAt : ''),
    notes: p.notes !== undefined ? p.notes : (p.remark !== undefined ? p.remark : (existingIdx >= 0 ? localData.patients[existingIdx].notes : '')),
    remark: p.remark !== undefined ? p.remark : (p.notes !== undefined ? p.notes : (existingIdx >= 0 ? localData.patients[existingIdx].remark : '')),
    consultationComment: p.consultationComment !== undefined ? p.consultationComment : (existingIdx >= 0 ? localData.patients[existingIdx].consultationComment : ''),
    postConsultationConfirmed: p.postConsultationConfirmed !== undefined ? Boolean(p.postConsultationConfirmed) : (existingIdx >= 0 ? Boolean(localData.patients[existingIdx].postConsultationConfirmed) : false),
    postConfirmedAt: p.postConfirmedAt !== undefined ? p.postConfirmedAt : (existingIdx >= 0 ? localData.patients[existingIdx].postConfirmedAt : ''),
    isOnHold: p.isOnHold !== undefined ? Boolean(p.isOnHold) : (existingIdx >= 0 ? Boolean(localData.patients[existingIdx].isOnHold) : false),
    heldAt: p.heldAt !== undefined ? p.heldAt : (existingIdx >= 0 ? localData.patients[existingIdx].heldAt : ''),
    holdReason: p.holdReason !== undefined ? p.holdReason : (existingIdx >= 0 ? localData.patients[existingIdx].holdReason : ''),
    isInstant: p.isInstant !== undefined ? Boolean(p.isInstant) : (existingIdx >= 0 ? Boolean(localData.patients[existingIdx].isInstant) : false),
    instantFee: p.instantFee !== undefined ? Number(p.instantFee) : (p.isInstant ? 2000 : (existingIdx >= 0 ? (localData.patients[existingIdx].instantFee || 0) : 0)),
    isEd: p.isEd !== undefined ? Boolean(p.isEd) : (existingIdx >= 0 ? Boolean(localData.patients[existingIdx].isEd) : false),
    pathologyStatus: p.pathologyStatus !== undefined ? p.pathologyStatus : (existingIdx >= 0 ? localData.patients[existingIdx].pathologyStatus : ''),
    pathologyUpdatedAt: p.pathologyUpdatedAt !== undefined ? p.pathologyUpdatedAt : (existingIdx >= 0 ? localData.patients[existingIdx].pathologyUpdatedAt : ''),
    pathologyUpdatedBy: p.pathologyUpdatedBy !== undefined ? p.pathologyUpdatedBy : (existingIdx >= 0 ? localData.patients[existingIdx].pathologyUpdatedBy : ''),
    organicStatus: p.organicStatus !== undefined ? p.organicStatus : (existingIdx >= 0 ? localData.patients[existingIdx].organicStatus : ''),
    organicUpdatedAt: p.organicUpdatedAt !== undefined ? p.organicUpdatedAt : (existingIdx >= 0 ? localData.patients[existingIdx].organicUpdatedAt : ''),
    organicUpdatedBy: p.organicUpdatedBy !== undefined ? p.organicUpdatedBy : (existingIdx >= 0 ? localData.patients[existingIdx].organicUpdatedBy : ''),
    nutritionStatus: p.nutritionStatus !== undefined ? p.nutritionStatus : (existingIdx >= 0 ? localData.patients[existingIdx].nutritionStatus : ''),
    nutritionUpdatedAt: p.nutritionUpdatedAt !== undefined ? p.nutritionUpdatedAt : (existingIdx >= 0 ? localData.patients[existingIdx].nutritionUpdatedAt : ''),
    nutritionUpdatedBy: p.nutritionUpdatedBy !== undefined ? p.nutritionUpdatedBy : (existingIdx >= 0 ? localData.patients[existingIdx].nutritionUpdatedBy : ''),
    createdAt: p.createdAt || (existingIdx >= 0 ? localData.patients[existingIdx].createdAt : new Date().toISOString())
  };

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      if ((formattedPatient.isConfirmed || formattedPatient.isOnHold) && (formattedPatient.consultationSerial === null || formattedPatient.consultationSerial === undefined)) {
        const [existingDbRows]: any = await conn.execute(
          'SELECT isConfirmed, isOnHold, consultationSerial FROM patients WHERE id = ? LIMIT 1 FOR UPDATE',
          [formattedPatient.id]
        );
        const existingDb = Array.isArray(existingDbRows) && existingDbRows.length > 0 ? existingDbRows[0] : null;
        if (existingDb && (existingDb.isConfirmed || existingDb.isOnHold) && existingDb.consultationSerial !== null && existingDb.consultationSerial !== undefined && Number(existingDb.consultationSerial) > 0) {
          formattedPatient.consultationSerial = Number(existingDb.consultationSerial);
        } else {
          formattedPatient.consultationSerial = await allocateDailySerialInTx(conn, formattedPatient.appointmentDate);
        }
      }

      await conn.execute(
        `INSERT INTO patients (
          id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt,
          isConfirmed, confirmedAt, consultationSerial, consultationStatus, profession, preDoctorName, postDoctorName, preConsultationAt, postConsultationAt,
          consultationComment, postConsultationConfirmed, postConfirmedAt, isOnHold, heldAt, holdReason,
          pathologyStatus, pathologyUpdatedAt, pathologyUpdatedBy, organicStatus, organicUpdatedAt, organicUpdatedBy, nutritionStatus, nutritionUpdatedAt, nutritionUpdatedBy,
          isInstant, instantFee, isEd
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          serialNo = VALUES(serialNo),
          name = VALUES(name),
          phone = VALUES(phone),
          age = VALUES(age),
          gender = VALUES(gender),
          address = VALUES(address),
          doctorName = VALUES(doctorName),
          appointmentDate = VALUES(appointmentDate),
          appointmentTime = VALUES(appointmentTime),
          department = VALUES(department),
          status = VALUES(status),
          notes = VALUES(notes),
          remark = VALUES(remark),
          isConfirmed = VALUES(isConfirmed),
          confirmedAt = VALUES(confirmedAt),
          consultationSerial = VALUES(consultationSerial),
          consultationStatus = VALUES(consultationStatus),
          profession = VALUES(profession),
          preDoctorName = VALUES(preDoctorName),
          postDoctorName = VALUES(postDoctorName),
          preConsultationAt = VALUES(preConsultationAt),
          postConsultationAt = VALUES(postConsultationAt),
          consultationComment = VALUES(consultationComment),
          postConsultationConfirmed = VALUES(postConsultationConfirmed),
          postConfirmedAt = VALUES(postConfirmedAt),
          isOnHold = VALUES(isOnHold),
          heldAt = VALUES(heldAt),
          holdReason = VALUES(holdReason),
          pathologyStatus = VALUES(pathologyStatus),
          pathologyUpdatedAt = VALUES(pathologyUpdatedAt),
          pathologyUpdatedBy = VALUES(pathologyUpdatedBy),
          organicStatus = VALUES(organicStatus),
          organicUpdatedAt = VALUES(organicUpdatedAt),
          organicUpdatedBy = VALUES(organicUpdatedBy),
          nutritionStatus = VALUES(nutritionStatus),
          nutritionUpdatedAt = VALUES(nutritionUpdatedAt),
          nutritionUpdatedBy = VALUES(nutritionUpdatedBy),
          isInstant = VALUES(isInstant),
          instantFee = VALUES(instantFee),
          isEd = VALUES(isEd)`,
        [
          formattedPatient.id ?? null,
          formattedPatient.serialNo ?? null,
          formattedPatient.name ?? null,
          formattedPatient.phone ?? null,
          formattedPatient.age ?? null,
          formattedPatient.gender ?? null,
          formattedPatient.address ?? null,
          formattedPatient.doctorName ?? null,
          formattedPatient.appointmentDate ?? null,
          formattedPatient.appointmentTime ?? null,
          formattedPatient.department ?? null,
          formattedPatient.status ?? null,
          formattedPatient.notes ?? null,
          formattedPatient.remark ?? null,
          formattedPatient.createdAt ?? null,
          formattedPatient.isConfirmed ? 1 : 0,
          formattedPatient.confirmedAt || '',
          formattedPatient.consultationSerial !== null && formattedPatient.consultationSerial !== undefined ? formattedPatient.consultationSerial : null,
          formattedPatient.consultationStatus || '',
          formattedPatient.profession || '',
          formattedPatient.preDoctorName || '',
          formattedPatient.postDoctorName || '',
          formattedPatient.preConsultationAt || '',
          formattedPatient.postConsultationAt || '',
          formattedPatient.consultationComment || '',
          formattedPatient.postConsultationConfirmed ? 1 : 0,
          formattedPatient.postConfirmedAt || '',
          formattedPatient.isOnHold ? 1 : 0,
          formattedPatient.heldAt || '',
          formattedPatient.holdReason || '',
          formattedPatient.pathologyStatus || '',
          formattedPatient.pathologyUpdatedAt || '',
          formattedPatient.pathologyUpdatedBy || '',
          formattedPatient.organicStatus || '',
          formattedPatient.organicUpdatedAt || '',
          formattedPatient.organicUpdatedBy || '',
          formattedPatient.nutritionStatus || '',
          formattedPatient.nutritionUpdatedAt || '',
          formattedPatient.nutritionUpdatedBy || '',
          formattedPatient.isInstant ? 1 : 0,
          formattedPatient.instantFee ?? (formattedPatient.isInstant ? 2000 : 0),
          formattedPatient.isEd ? 1 : 0
        ]
      );

      const nextVer = await bumpDataVersionInTx(conn);
      await conn.execute('UPDATE patients SET lastModifiedVersion = ? WHERE id = ?', [nextVer, formattedPatient.id]);
      await conn.commit();
      serverDataVersion = nextVer;
      (formattedPatient as any).lastModifiedVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL patient save error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to save patient to database' });
    } finally {
      conn.release();
    }
  } else {
    if ((formattedPatient.isConfirmed || formattedPatient.isOnHold) && (formattedPatient.consultationSerial === null || formattedPatient.consultationSerial === undefined)) {
      let maxSerial = 0;
      localData.patients.forEach(item => {
        if (item.appointmentDate === formattedPatient.appointmentDate && item.consultationSerial && typeof item.consultationSerial === 'number') {
          if (item.consultationSerial > maxSerial) maxSerial = item.consultationSerial;
        }
      });
      formattedPatient.consultationSerial = maxSerial + 1;
    }
    const nextLocalVer = bumpLocalDataVersion();
    (formattedPatient as any).lastModifiedVersion = nextLocalVer;
  }

  const savedObj = { ...(existingIdx >= 0 ? localData.patients[existingIdx] : {}), ...p, ...formattedPatient };
  if (existingIdx >= 0) {
    localData.patients[existingIdx] = savedObj;
  } else {
    localData.patients.unshift(savedObj);
  }
  saveLocalDb();

  res.json({ success: true, message: 'Patient saved successfully', patient: localData.patients[existingIdx >= 0 ? existingIdx : 0] });
});

// Single patient confirm / un-confirm endpoint with atomic daily consultation serial allocation
app.post('/api/patients/confirm', authenticateToken, requireRole('System Admin', 'Call Center', 'Doctor', 'Billing Counter'), async (req, res) => {
  const { id, isConfirmed = true, serialNo, appointmentDate, phone } = req.body;
  if (!id && id !== 0 && !serialNo && !phone) {
    return res.status(400).json({ error: 'Patient ID or identification is required' });
  }

  const idStr = id != null ? String(id).trim() : '';
  const serialStr = serialNo != null ? String(serialNo).trim() : '';
  const dateStr = appointmentDate != null ? String(appointmentDate).trim() : '';
  const phoneStr = phone != null ? String(phone).trim() : '';

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      const [dbRows]: any = await conn.execute(
        `SELECT * FROM patients
         WHERE (id = ? AND id != '')
            OR (serialNo = ? AND appointmentDate = ? AND serialNo != '')
            OR (phone = ? AND appointmentDate = ? AND phone != '' AND phone != '01700000000')
            OR (serialNo = ? AND serialNo != '' AND (? = '' OR appointmentDate = ?))
         LIMIT 1 FOR UPDATE`,
        [
          idStr || '__none__',
          serialStr || '__none__', dateStr || '__none__',
          phoneStr || '__none__', dateStr || '__none__',
          idStr || '__none__', dateStr, dateStr
        ]
      );

      if (!Array.isArray(dbRows) || dbRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Patient not found' });
      }

      const patient = formatPatientRow(dbRows[0]);
      const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];

      let updatedP: any;
      if (isConfirmed === false) {
        updatedP = {
          ...patient,
          isConfirmed: false,
          confirmedAt: '',
          consultationSerial: null,
          consultationStatus: '',
          status: 'Pending Counseling'
        };
      } else {
        const existingSerial = (patient.isConfirmed || patient.isOnHold) &&
          patient.consultationSerial !== null &&
          patient.consultationSerial !== undefined &&
          Number(patient.consultationSerial) > 0
          ? Number(patient.consultationSerial)
          : null;
        const nextSerial = existingSerial ?? await allocateDailySerialInTx(conn, targetDate);

        updatedP = {
          ...patient,
          isConfirmed: true,
          confirmedAt: patient.confirmedAt || new Date().toISOString(),
          consultationSerial: nextSerial,
          consultationStatus: 'Pre Consultation',
          status: 'Pre Consultation',
          isOnHold: false,
          heldAt: '',
          holdReason: ''
        };
      }

      await conn.execute(
        `UPDATE patients
         SET isConfirmed = ?, confirmedAt = ?, consultationSerial = ?, consultationStatus = ?, status = ?, isOnHold = ?, heldAt = ?, holdReason = ?
         WHERE id = ?`,
        [
          updatedP.isConfirmed ? 1 : 0,
          updatedP.confirmedAt || '',
          updatedP.consultationSerial !== null && updatedP.consultationSerial !== undefined ? updatedP.consultationSerial : null,
          updatedP.consultationStatus || '',
          updatedP.status || 'Pending Counseling',
          updatedP.isOnHold ? 1 : 0,
          updatedP.heldAt || '',
          updatedP.holdReason || '',
          String(updatedP.id)
        ]
      );

      const nextVer = await bumpDataVersionInTx(conn);
      await conn.execute('UPDATE patients SET lastModifiedVersion = ? WHERE id = ?', [nextVer, String(updatedP.id)]);
      await conn.commit();
      serverDataVersion = nextVer;
      updatedP.lastModifiedVersion = nextVer;

      const localIdx = localData.patients.findIndex(p => String(p.id).trim() === String(updatedP.id).trim());
      if (localIdx >= 0) {
        localData.patients[localIdx] = { ...localData.patients[localIdx], ...updatedP };
      } else {
        localData.patients.unshift(updatedP);
      }
      saveLocalDb();

      return res.json({ success: true, patient: updatedP });
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL patient confirm transaction error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to confirm patient in database' });
    } finally {
      conn.release();
    }
  }

  // Local File Persistence Mode
  const idx = localData.patients.findIndex(p => {
    if (idStr && String(p.id).trim() === idStr) return true;
    if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
    if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
    if (idStr && p.serialNo && String(p.serialNo).trim() === idStr && (!dateStr || p.appointmentDate === dateStr)) return true;
    return false;
  });

  if (idx === -1) return res.status(404).json({ error: 'Patient not found' });

  const patient = localData.patients[idx];
  const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];

  if (isConfirmed === false) {
    localData.patients[idx] = {
      ...patient,
      isConfirmed: false,
      confirmedAt: '',
      consultationSerial: null,
      consultationStatus: '',
      status: 'Pending Counseling'
    };
  } else {
    let nextSerial: number;
    if ((patient.isConfirmed || patient.isOnHold) && patient.consultationSerial && typeof patient.consultationSerial === 'number') {
      nextSerial = patient.consultationSerial;
    } else {
      let maxSerial = 0;
      localData.patients.forEach(p => {
        if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
          if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
        }
      });
      nextSerial = maxSerial + 1;
    }
    localData.patients[idx] = {
      ...patient,
      isConfirmed: true,
      confirmedAt: patient.confirmedAt || new Date().toISOString(),
      consultationSerial: nextSerial,
      consultationStatus: 'Pre Consultation',
      status: 'Pre Consultation',
      isOnHold: false,
      heldAt: '',
      holdReason: ''
    };
  }

  const nextLocalVer = bumpLocalDataVersion();
  localData.patients[idx].lastModifiedVersion = nextLocalVer;
  saveLocalDb();

  res.json({ success: true, patient: localData.patients[idx] });
});

// Single patient Hold / Un-Hold endpoint with atomic sequential serial reservation
app.post('/api/patients/hold', authenticateToken, requireRole('System Admin', 'Call Center', 'Doctor', 'Billing Counter'), async (req, res) => {
  const { id, isOnHold = true, holdReason = '', serialNo, appointmentDate, phone } = req.body;
  if (!id && id !== 0 && !serialNo && !phone) return res.status(400).json({ error: 'Patient ID is required' });

  const idStr = id != null ? String(id).trim() : '';
  const serialStr = serialNo != null ? String(serialNo).trim() : '';
  const dateStr = appointmentDate != null ? String(appointmentDate).trim() : '';
  const phoneStr = phone != null ? String(phone).trim() : '';
  const willHold = Boolean(isOnHold);

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      const [dbRows]: any = await conn.execute(
        `SELECT * FROM patients
         WHERE (id = ? AND id != '')
            OR (serialNo = ? AND appointmentDate = ? AND serialNo != '')
            OR (phone = ? AND appointmentDate = ? AND phone != '' AND phone != '01700000000')
            OR (serialNo = ? AND serialNo != '' AND (? = '' OR appointmentDate = ?))
         LIMIT 1 FOR UPDATE`,
        [
          idStr || '__none__',
          serialStr || '__none__', dateStr || '__none__',
          phoneStr || '__none__', dateStr || '__none__',
          idStr || '__none__', dateStr, dateStr
        ]
      );

      if (!Array.isArray(dbRows) || dbRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Patient not found' });
      }

      const patient = formatPatientRow(dbRows[0]);
      const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];
      let assignedSerial = patient.consultationSerial;

      if (willHold && (!assignedSerial || typeof assignedSerial !== 'number')) {
        assignedSerial = await allocateDailySerialInTx(conn, targetDate);
      }

      const updatedP = {
        ...patient,
        isConfirmed: willHold ? false : true,
        confirmedAt: willHold ? (patient.confirmedAt || '') : (patient.confirmedAt || new Date().toISOString()),
        consultationSerial: assignedSerial,
        consultationStatus: willHold ? (patient.consultationStatus || 'Pre Consultation') : 'Pre Consultation',
        status: willHold ? (patient.status || 'Pending Counseling') : 'Pre Consultation',
        isOnHold: willHold,
        heldAt: willHold ? (patient.heldAt || new Date().toISOString()) : '',
        holdReason: willHold ? (holdReason || 'Patient absent when turn called') : ''
      };

      await conn.execute(
        `UPDATE patients
         SET isOnHold = ?, heldAt = ?, holdReason = ?, isConfirmed = ?, confirmedAt = ?, consultationSerial = ?, consultationStatus = ?, status = ?
         WHERE id = ?`,
        [
          willHold ? 1 : 0,
          updatedP.heldAt || '',
          updatedP.holdReason || '',
          updatedP.isConfirmed ? 1 : 0,
          updatedP.confirmedAt || '',
          updatedP.consultationSerial !== null && updatedP.consultationSerial !== undefined ? updatedP.consultationSerial : null,
          updatedP.consultationStatus || '',
          updatedP.status || 'Pre Consultation',
          String(updatedP.id)
        ]
      );

      const nextVer = await bumpDataVersionInTx(conn);
      await conn.execute('UPDATE patients SET lastModifiedVersion = ? WHERE id = ?', [nextVer, String(updatedP.id)]);
      await conn.commit();
      serverDataVersion = nextVer;
      (updatedP as any).lastModifiedVersion = nextVer;

      const localIdx = localData.patients.findIndex(p => String(p.id).trim() === String(updatedP.id).trim());
      if (localIdx >= 0) {
        localData.patients[localIdx] = { ...localData.patients[localIdx], ...updatedP };
      } else {
        localData.patients.unshift(updatedP);
      }
      saveLocalDb();

      return res.json({ success: true, patient: updatedP });
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL patient hold transaction error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to update hold status in database' });
    } finally {
      conn.release();
    }
  }

  // Local File Persistence Mode
  const idx = localData.patients.findIndex(p => {
    if (idStr && String(p.id).trim() === idStr) return true;
    if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
    if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
    if (idStr && p.serialNo && String(p.serialNo).trim() === idStr && (!dateStr || p.appointmentDate === dateStr)) return true;
    return false;
  });

  if (idx === -1) return res.status(404).json({ error: 'Patient not found' });

  const patient = localData.patients[idx];
  const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];
  let assignedSerial = patient.consultationSerial;

  if (willHold && (!assignedSerial || typeof assignedSerial !== 'number')) {
    let maxSerial = 0;
    localData.patients.forEach(p => {
      if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
        if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
      }
    });
    assignedSerial = maxSerial + 1;
  }

  localData.patients[idx] = {
    ...patient,
    isConfirmed: willHold ? false : true,
    confirmedAt: willHold ? (patient.confirmedAt || '') : (patient.confirmedAt || new Date().toISOString()),
    consultationSerial: assignedSerial,
    consultationStatus: willHold ? (patient.consultationStatus || 'Pre Consultation') : 'Pre Consultation',
    status: willHold ? (patient.status || 'Pending Counseling') : 'Pre Consultation',
    isOnHold: willHold,
    heldAt: willHold ? (patient.heldAt || new Date().toISOString()) : '',
    holdReason: willHold ? (holdReason || 'Patient absent when turn called') : ''
  };

  const nextLocalVer = bumpLocalDataVersion();
  localData.patients[idx].lastModifiedVersion = nextLocalVer;
  saveLocalDb();

  res.json({ success: true, patient: localData.patients[idx] });
});

// Update Department Clearance / Service Tracking (Pathology, Organic, Nutrition)
app.post('/api/patients/department-status', authenticateToken, requireRole('System Admin', 'Pathology', 'Organic', 'Nutrition'), async (req: any, res: any) => {
  const { patientId, department, status } = req.body;
  if (!patientId || !department) {
    return res.status(400).json({ error: 'Patient ID and department are required' });
  }

  const idx = localData.patients.findIndex(p => p.id === patientId);
  if (idx === -1 && (!isMySqlActive || !mysqlPool)) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const normalizedStatus = status === 'Yes' || status === 'No' ? status : '';
  const now = new Date().toISOString();
  const updaterName = req.user?.name || req.user?.username || 'Department Staff';

  const applyDepartmentUpdate = (target: any) => {
    const updated = { ...target };
    if (department === 'pathology') {
      updated.pathologyStatus = normalizedStatus;
      updated.pathologyUpdatedAt = normalizedStatus ? now : '';
      updated.pathologyUpdatedBy = normalizedStatus ? updaterName : '';
    } else if (department === 'organic') {
      updated.organicStatus = normalizedStatus;
      updated.organicUpdatedAt = normalizedStatus ? now : '';
      updated.organicUpdatedBy = normalizedStatus ? updaterName : '';
    } else if (department === 'nutrition') {
      updated.nutritionStatus = normalizedStatus;
      updated.nutritionUpdatedAt = normalizedStatus ? now : '';
      updated.nutritionUpdatedBy = normalizedStatus ? updaterName : '';
    }
    return updated;
  };

  if (department !== 'pathology' && department !== 'organic' && department !== 'nutrition') {
    return res.status(400).json({ error: 'Invalid department specified. Allowed: pathology, organic, nutrition' });
  }

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const [dbRows]: any = await conn.execute('SELECT * FROM patients WHERE id = ? LIMIT 1 FOR UPDATE', [patientId]);
      if (!Array.isArray(dbRows) || dbRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Patient not found' });
      }
      const patient = applyDepartmentUpdate(formatPatientRow(dbRows[0]));
      await conn.execute(
        `UPDATE patients 
         SET pathologyStatus = ?, pathologyUpdatedAt = ?, pathologyUpdatedBy = ?,
             organicStatus = ?, organicUpdatedAt = ?, organicUpdatedBy = ?,
             nutritionStatus = ?, nutritionUpdatedAt = ?, nutritionUpdatedBy = ?
         WHERE id = ?`,
        [
          patient.pathologyStatus || '',
          patient.pathologyUpdatedAt || '',
          patient.pathologyUpdatedBy || '',
          patient.organicStatus || '',
          patient.organicUpdatedAt || '',
          patient.organicUpdatedBy || '',
          patient.nutritionStatus || '',
          patient.nutritionUpdatedAt || '',
          patient.nutritionUpdatedBy || '',
          patient.id
        ]
      );
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.execute('UPDATE patients SET lastModifiedVersion = ? WHERE id = ?', [nextVer, patient.id]);
      await conn.commit();
      serverDataVersion = nextVer;
      patient.lastModifiedVersion = nextVer;

      if (idx >= 0) {
        localData.patients[idx] = { ...localData.patients[idx], ...patient };
      } else {
        localData.patients.unshift(patient);
      }
      saveLocalDb();

      return res.json({ success: true, patient });
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL update department status error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to update department status' });
    } finally {
      conn.release();
    }
  }

  const patient = applyDepartmentUpdate(localData.patients[idx]);
  localData.patients[idx] = patient;
  const nextLocalVer = bumpLocalDataVersion();
  localData.patients[idx].lastModifiedVersion = nextLocalVer;
  saveLocalDb();

  res.json({ success: true, patient: localData.patients[idx] });
});

// Batch confirm endpoint with atomic daily serial allocation
app.post('/api/patients/confirm-batch', authenticateToken, requireRole('System Admin', 'Call Center', 'Doctor'), async (req, res) => {
  const { ids, patients: reqPatients } = req.body;
  const targetItems: any[] = Array.isArray(reqPatients) && reqPatients.length > 0 
    ? reqPatients 
    : (Array.isArray(ids) ? ids.map(id => (typeof id === 'object' ? id : { id })) : []);

  if (targetItems.length === 0) return res.status(400).json({ error: 'No patient IDs provided' });

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const updated: any[] = [];

      for (const item of targetItems) {
        const idStr = item.id != null ? String(item.id).trim() : '';
        const serialStr = item.serialNo != null ? String(item.serialNo).trim() : '';
        const dateStr = item.appointmentDate != null ? String(item.appointmentDate).trim() : '';
        const phoneStr = item.phone != null ? String(item.phone).trim() : '';

        const [dbRows]: any = await conn.execute(
          `SELECT * FROM patients
           WHERE (id = ? AND id != '')
              OR (serialNo = ? AND appointmentDate = ? AND serialNo != '')
              OR (phone = ? AND appointmentDate = ? AND phone != '' AND phone != '01700000000')
              OR (serialNo = ? AND serialNo != '' AND (? = '' OR appointmentDate = ?))
           LIMIT 1 FOR UPDATE`,
          [
            idStr || '__none__',
            serialStr || '__none__', dateStr || '__none__',
            phoneStr || '__none__', dateStr || '__none__',
            idStr || '__none__', dateStr, dateStr
          ]
        );

        if (Array.isArray(dbRows) && dbRows.length > 0) {
          const patient = formatPatientRow(dbRows[0]);
          if (!patient.isConfirmed) {
            const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];
            const existingSerial = patient.isOnHold &&
              patient.consultationSerial !== null &&
              patient.consultationSerial !== undefined &&
              Number(patient.consultationSerial) > 0
              ? Number(patient.consultationSerial)
              : null;
            const nextSerial = existingSerial ?? await allocateDailySerialInTx(conn, targetDate);

            const updatedP = {
              ...patient,
              isConfirmed: true,
              confirmedAt: patient.confirmedAt || new Date().toISOString(),
              consultationSerial: nextSerial,
              consultationStatus: 'Pre Consultation',
              status: 'Pre Consultation'
            };

            await conn.execute(
              `UPDATE patients
               SET isConfirmed = ?, confirmedAt = ?, consultationSerial = ?, consultationStatus = ?, status = ?
               WHERE id = ?`,
              [
                1,
                updatedP.confirmedAt,
                updatedP.consultationSerial,
                'Pre Consultation',
                'Pre Consultation',
                String(updatedP.id)
              ]
            );
            updated.push(updatedP);
          }
        }
      }

      if (updated.length > 0) {
        const nextVer = await bumpDataVersionInTx(conn);
        for (let i = 0; i < updated.length; i += 500) {
          const chunkIds = updated.slice(i, i + 500).map((u: any) => String(u.id));
          const placeholders = chunkIds.map(() => '?').join(',');
          await conn.execute(
            `UPDATE patients SET lastModifiedVersion = ? WHERE id IN (${placeholders})`,
            [nextVer, ...chunkIds]
          );
        }
        await conn.commit();
        serverDataVersion = nextVer;

        for (const p of updated) {
          p.lastModifiedVersion = nextVer;
          const localIdx = localData.patients.findIndex(lp => String(lp.id).trim() === String(p.id).trim());
          if (localIdx >= 0) {
            localData.patients[localIdx] = { ...localData.patients[localIdx], ...p };
          } else {
            localData.patients.unshift(p);
          }
        }
        saveLocalDb();
      } else {
        await conn.commit();
      }

      return res.json({ success: true, count: updated.length, updated });
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL batch confirm transaction error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to batch confirm patients in database' });
    } finally {
      conn.release();
    }
  }

  // Local File Persistence Mode
  const updated: any[] = [];
  for (const item of targetItems) {
    const idStr = item.id != null ? String(item.id).trim() : '';
    const serialStr = item.serialNo != null ? String(item.serialNo).trim() : '';
    const dateStr = item.appointmentDate != null ? String(item.appointmentDate).trim() : '';
    const phoneStr = item.phone != null ? String(item.phone).trim() : '';

    const idx = localData.patients.findIndex(p => {
      if (idStr && String(p.id).trim() === idStr) return true;
      if (dateStr && serialStr && String(p.serialNo).trim() === serialStr && p.appointmentDate === dateStr) return true;
      if (dateStr && phoneStr && phoneStr !== '01700000000' && String(p.phone).trim() === phoneStr && p.appointmentDate === dateStr) return true;
      if (idStr && p.serialNo && String(p.serialNo).trim() === idStr && (!dateStr || p.appointmentDate === dateStr)) return true;
      return false;
    });

    if (idx !== -1) {
      const patient = localData.patients[idx];
      if (!patient.isConfirmed) {
        const targetDate = dateStr || patient.appointmentDate || new Date().toISOString().split('T')[0];
        let nextSerial: number;
        if (patient.isOnHold && patient.consultationSerial && typeof patient.consultationSerial === 'number') {
          nextSerial = patient.consultationSerial;
        } else {
          let maxSerial = 0;
          localData.patients.forEach(p => {
            if (p.appointmentDate === targetDate && p.consultationSerial && typeof p.consultationSerial === 'number') {
              if (p.consultationSerial > maxSerial) maxSerial = p.consultationSerial;
            }
          });
          nextSerial = maxSerial + 1;
        }
        localData.patients[idx] = {
          ...patient,
          isConfirmed: true,
          confirmedAt: patient.confirmedAt || new Date().toISOString(),
          consultationSerial: nextSerial,
          consultationStatus: 'Pre Consultation',
          status: 'Pre Consultation'
        };
        updated.push(localData.patients[idx]);
      }
    }
  }

  const nextLocalVer = bumpLocalDataVersion();
  for (const u of updated) {
    u.lastModifiedVersion = nextLocalVer;
  }
  saveLocalDb();

  res.json({ success: true, count: updated.length, updated });
});

app.post('/api/patients/delete', authenticateToken, requireRole('System Admin', 'Call Center'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No patient IDs provided for deletion' });
  }

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const placeholders = ids.map(() => '?').join(',');
      await conn.execute(`DELETE FROM patients WHERE id IN (${placeholders})`, ids);
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL patient batch delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete patients from database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  const idSet = new Set(ids);
  localData.patients = localData.patients.filter(p => !idSet.has(p.id));
  saveLocalDb();

  res.json({ success: true, message: `${ids.length} patient(s) deleted successfully`, deletedCount: ids.length, deletedIds: ids });
});

// PDF Upload Endpoint to parse Patient Name, Gender, Age, Phone Number, Remark (Disease)
app.post('/api/patients/upload-pdf', authenticateToken, requireRole('System Admin', 'Admin', 'Call Center', 'Doctor'), upload.single('pdfFile'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  try {
    const dataBuffer = req.file.buffer;
    let text = '';

    try {
      const uint8Data = new Uint8Array(dataBuffer);
      const parser = new PDFParse({ data: uint8Data });
      const textResult = await parser.getText();
      text = textResult?.text || (Array.isArray(textResult?.pages) ? textResult.pages.map((p: any) => p.text || '').join('\n') : '');
      await parser.destroy().catch(() => {});
    } catch (parseErr) {
      console.error('PDF parsing error:', parseErr);
      return res.status(500).json({ error: 'Failed to parse PDF document structure.' });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No extractable text found in uploaded PDF.' });
    }

    // Process line by line, accumulating multi-line table rows for full multi-page PDFs
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recordBuffers: string[] = [];
    let currentBuffer = '';

    for (const line of rawLines) {
      // Ignore header rows and page numbers
      if (/^Sl\.?\s*No/i.test(line) || /^Patient\s+Name/i.test(line) || /^Page\s+\d+/i.test(line)) {
        continue;
      }

      const hasPhone = /(?:\+880|880|0)?1[3-9]\d{8}\b/.test(line);

      if (hasPhone) {
        if (currentBuffer) {
          recordBuffers.push(currentBuffer);
        }
        currentBuffer = line;
      } else {
        if (currentBuffer) {
          currentBuffer += ' ' + line;
        }
      }
    }
    if (currentBuffer) {
      recordBuffers.push(currentBuffer);
    }

    const extractedPatients: Array<{ name: string; gender: string; age: string; phone: string; remark: string }> = [];

    for (const record of recordBuffers) {
      const phoneMatches = [...record.matchAll(/(?:\+880|880|0)?1[3-9]\d{8}\b/g)];
      if (phoneMatches.length === 0) continue;

      for (let i = 0; i < phoneMatches.length; i++) {
        const pMatch = phoneMatches[i];
        const phone = pMatch[0];
        const pIdx = pMatch.index;

        if (pIdx === undefined) continue;

        // Extract slice around phone
        let chunk = '';
        if (i < phoneMatches.length - 1) {
          chunk = record.substring(pIdx - 120 > 0 ? pIdx - 120 : 0, phoneMatches[i + 1].index);
        } else {
          chunk = record.substring(pIdx - 120 > 0 ? pIdx - 120 : 0);
        }

        const chunkPhoneIdx = chunk.indexOf(phone);
        if (chunkPhoneIdx === -1) continue;

        const beforePhone = chunk.substring(0, chunkPhoneIdx).trim();
        const afterPhone = chunk.substring(chunkPhoneIdx + phone.length).trim();

        // 1. Gender Extraction
        const genderMatch = beforePhone.match(/\b(FEMALE|MALE|Female|Male|OTHER|Other)\b/i);
        let gender = 'Male';
        let name = '';
        let age = '';

        if (genderMatch) {
          const gUpper = genderMatch[1].toUpperCase();
          if (gUpper === 'FEMALE') gender = 'Female';
          else if (gUpper === 'MALE') gender = 'Male';
          else if (gUpper === 'OTHER') gender = 'Other';

          const gIdx = beforePhone.indexOf(genderMatch[0]);
          let rawName = beforePhone.substring(0, gIdx).trim();
          // Remove serial numbers or leading noise cleanly
          rawName = rawName.replace(/^\s*\d+[\.\-\s]*/, '').replace(/\b(female|male)\b/gi, '').trim();
          name = rawName;

          // Extract age between Gender and Phone
          const afterGender = beforePhone.substring(gIdx + genderMatch[0].length).trim();
          const ageMatch = afterGender.match(/(\d{1,3})/);
          if (ageMatch) {
            age = ageMatch[1];
          }
        } else {
          // Fallback if no explicit Gender word
          let rawName = beforePhone.replace(/^\s*\d+[\.\-\s]*/, '').replace(/\b(female|male)\b/gi, '').trim();
          name = rawName || 'Unknown Patient';

          if (/begum|akter|ara|urmi|nahar|sultana|razia|shirin|khatun|bibi/i.test(name)) {
            gender = 'Female';
          }
        }

        // Clean name of any lingering header noise
        name = name
          .replace(/^(?:Sl|Sl\.\s*No|No|Patient\s+Name)\s+/i, '')
          .replace(/[\/\\\|]+/g, '')
          .trim();

        if (!name || name.length < 2) name = 'Unknown Patient';

        // 2. Age Fallback if missing
        if (!age) {
          const explicitAgeMatch = chunk.match(/\b(\d{1,3})\s*(?:Y|y|yrs|years|yr)\b/);
          if (explicitAgeMatch) {
            age = explicitAgeMatch[1];
          }
        }

        // 3. Remark / Disease Extraction
        let remark = '';
        const dateTimeMatch = afterPhone.match(/\d{1,4}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i);
        if (dateTimeMatch) {
          const dtIdx = afterPhone.indexOf(dateTimeMatch[0]);
          let afterDt = afterPhone.substring(dtIdx + dateTimeMatch[0].length).trim();
          afterDt = afterDt.replace(/^(?:AM|PM)\s*/i, '').trim();
          if (afterDt) {
            remark = afterDt;
          }
        }

        if (!remark) {
          let cleaned = afterPhone
            .replace(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)/gi, '')
            .replace(/\b(?:New Patient|Old Patient|Follow-up|Follow up|Patient)\b/gi, '')
            .replace(/\b(?:Robin|Alamin|Rakibul|User|Admin)\b/gi, '')
            .replace(/[\/\\\|]+/g, ' ')
            .replace(/\b\d+\b/g, '')
            .trim();
          remark = cleaned || 'General Assessment';
        }

        extractedPatients.push({ name, gender, age, phone, remark });
      }
    }

    if (extractedPatients.length === 0) {
      return res.status(400).json({
        error: 'Could not detect patient table structure in PDF. Please verify the PDF contains tabular appointment data with phone numbers.'
      });
    }

    res.json({
      success: true,
      patients: extractedPatients,
      total: extractedPatients.length
    });

  } catch (err: any) {
    console.error('PDF parsing error:', err);
    res.status(500).json({ error: 'Failed to extract text from PDF file. ' + (err.message || '') });
  }
});

// Upload and parse Excel Appointment File (.xlsx, .xls, .csv)
app.post('/api/patients/upload-excel', authenticateToken, requireRole('System Admin', 'Admin', 'Call Center', 'Doctor'), upload.single('excelFile'), (req: any, res: any) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No Excel file provided for upload.' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in the uploaded Excel file.' });
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: '' });

    if (!matrix || matrix.length === 0) {
      return res.status(400).json({ error: 'The uploaded Excel sheet is empty.' });
    }

    let headerRowIdx = -1;
    let maxScore = 0;

    for (let r = 0; r < Math.min(matrix.length, 25); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      let score = 0;

      row.forEach((cell) => {
        const str = String(cell || '').trim().toLowerCase();
        if (/(patient\s*name|patient|customer|client|full\s*name|rogir?\s*nam|রোগীর\s*নাম|রোগী|^name$|^নাম$)/i.test(str) && !/doctor|agent|user|disease/i.test(str)) score += 3;
        if (/(contact|phone|mobile|cell|কন্টাক্ট|মোবাইল|ফোন|যোগাযোগ|নাম্বার|number|num)/i.test(str)) score += 3;
        if (/(age|yrs|years|y\.o|বয়স|বযস)/i.test(str)) score += 1;
        if (/(gender|sex|লিঙ্গ|জেন্ডার)/i.test(str)) score += 1;
        if (/(disease|remark|remarks|condition|problem|note|notes|symptom|illness|complain|রোগের\s*নাম|রোগ|সমস্যা|মন্তব্য|অভিযোগ)/i.test(str)) score += 2;
        if (/(address|location|thana|district|city|addr|ঠিকানা|বাসা|এলাকা|লোকেশন|জেলা|থানা)/i.test(str)) score += 2;
      });

      if (score > maxScore && score >= 2) {
        maxScore = score;
        headerRowIdx = r;
      }
    }

    let serialCol = -1;
    let nameCol = -1;
    let phoneCol = -1;
    let ageCol = -1;
    let genderCol = -1;
    let addressCol = -1;
    let remarkCol = -1;
    let instantCol = -1;
    let edCol = -1;

    if (headerRowIdx !== -1) {
      const hRow = matrix[headerRowIdx];
      hRow.forEach((cell, idx) => {
        const str = String(cell || '').trim().toLowerCase();
        if (!str) return;

        if (/(serial\s*no|serial|sl\s*no|sl\.?\s*no|sl|ক্রমিক\s*নং|ক্রমিক|s\/n|sl\.|s\/l)/i.test(str) && serialCol === -1) {
          serialCol = idx;
        } else if (/(contact|phone|mobile|cell|কন্টাক্ট|মোবাইল|ফোন|যোগাযোগ|নাম্বার|number)/i.test(str) && phoneCol === -1) {
          phoneCol = idx;
        } else if (/(patient\s*name|patient|customer|client|full\s*name|rogir?\s*nam|রোগীর\s*নাম|রোগী|^name$|^নাম$)/i.test(str) && !/doctor|agent|user|disease|remark|problem/i.test(str) && nameCol === -1) {
          nameCol = idx;
        } else if (/(instant|ইন্সট্যান্ট|instant\s*fee|visit\s*fee|ভিজিট\s*ফি|fee|2000)/i.test(str) && instantCol === -1) {
          instantCol = idx;
        } else if (/(\bed\b|^ed$|ed\s*patient|erectile|ইরেক্টাইল|ইডি)/i.test(str) && edCol === -1) {
          edCol = idx;
        } else if (/(disease|remark|remarks|condition|problem|note|notes|symptom|illness|complain|রোগের\s*নাম|রোগ|সমস্যা|মন্তব্য|অভিযোগ)/i.test(str) && remarkCol === -1) {
          remarkCol = idx;
        } else if (/(age|yrs|years|y\.o|বয়স|বযস)/i.test(str) && ageCol === -1) {
          ageCol = idx;
        } else if (/(gender|sex|লিঙ্গ|জেন্ডার)/i.test(str) && genderCol === -1) {
          genderCol = idx;
        } else if (/(address|location|thana|district|city|addr|ঠিকানা|বাসা|এলাকা|লোকেশন|জেলা|থানা)/i.test(str) && addressCol === -1) {
          addressCol = idx;
        }
      });
    }

    const extractedPatients: Array<{ serialNo?: string; name: string; gender: string; age: string; phone: string; address?: string; remark: string; isInstant?: boolean; instantFee?: number; isEd?: boolean }> = [];
    const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let rawSerial = serialCol !== -1 ? String(row[serialCol] || '').trim() : '';
      let name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
      let phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() : '';
      let age = ageCol !== -1 ? String(row[ageCol] || '').trim() : '';
      let gender = genderCol !== -1 ? String(row[genderCol] || '').trim() : '';
      let address = addressCol !== -1 ? String(row[addressCol] || '').trim() : '';
      let remark = remarkCol !== -1 ? String(row[remarkCol] || '').trim() : '';
      let rawInstant = instantCol !== -1 ? String(row[instantCol] || '').trim() : '';
      let rawEd = edCol !== -1 ? String(row[edCol] || '').trim() : '';

      row.forEach((cell, cIdx) => {
        const val = String(cell || '').trim();
        if (!val) return;

        const cleanedCellStr = val.replace(/[\s\-\(\)\.]/g, '');
        const pMatch = val.match(/(?:\+?880|880|0)?1[3-9]\d{8}\b/) || cleanedCellStr.match(/(?:\+?880|880|0)?1[3-9]\d{8}\b/);
        if (pMatch && !phone) {
          phone = pMatch[0];
        }

        if (!gender) {
          const gMatch = val.match(/\b(FEMALE|MALE|Female|Male|F|M|নারী|পুরুষ)\b/i);
          if (gMatch && !/patient|doctor|department/i.test(val)) {
            const gUpper = gMatch[1].toUpperCase();
            if (gUpper.startsWith('F') || gUpper.includes('নারী')) gender = 'Female';
            else if (gUpper.startsWith('M') || gUpper.includes('পুরুষ')) gender = 'Male';
          }
        }

        if (!age && cIdx !== phoneCol && cIdx !== nameCol && cIdx !== instantCol && cIdx !== edCol) {
          const aMatch = val.match(/\b(\d{1,3})\s*(?:yrs|years|y|y\.o|y\/o|y\.|বছর)?\b/i);
          if (aMatch) {
            const num = parseInt(aMatch[1], 10);
            if (num >= 1 && num <= 115) {
              age = String(num);
            }
          }
        }

        if (instantCol === -1 && !rawInstant) {
          if (/^(?:2000|2,000|২০০০|2000\/=)$/i.test(val)) {
            rawInstant = val;
          }
        }

        if (edCol === -1 && !rawEd) {
          if (/^(?:ed|ইডি)$/i.test(val)) {
            rawEd = val;
          }
        }

        if (!name && cIdx !== phoneCol && cIdx !== ageCol && cIdx !== remarkCol && cIdx !== genderCol && cIdx !== serialCol && cIdx !== instantCol && cIdx !== edCol) {
          const isNumeric = /^\d+$/.test(val);
          const isPhone = /(?:\+?880|880|0)?1[3-9]\d{8}/.test(cleanedCellStr);
          const isKeywords = /male|female|new patient|followup|robin|alamin|rakibul|completed|pending|cancel/i.test(val);
          if (val.length >= 2 && !isNumeric && !isPhone && !isKeywords) {
            name = val;
          }
        }

        if (!remark && cIdx !== phoneCol && cIdx !== nameCol && cIdx !== ageCol && cIdx !== genderCol && cIdx !== instantCol && cIdx !== edCol) {
          const isNumeric = /^\d+$/.test(val);
          const isPhone = /(?:\+?880|880|0)?1[3-9]\d{8}/.test(cleanedCellStr);
          if (
            val.length >= 3 &&
            !isNumeric &&
            !isPhone &&
            !/male|female|new patient|completed|robin|alamin|pending|cancel/i.test(val)
          ) {
            remark = val;
          }
        }

        // Detect Address fallback
        if (!address && cIdx !== phoneCol && cIdx !== nameCol && cIdx !== ageCol && cIdx !== genderCol && cIdx !== remarkCol && cIdx !== serialCol && cIdx !== instantCol && cIdx !== edCol) {
          const isNumeric = /^\d+$/.test(val);
          const isPhone = /(?:\+?880|880|0)?1[3-9]\d{8}/.test(cleanedCellStr);
          if (
            val.length >= 3 &&
            !isNumeric &&
            !isPhone &&
            /(dhaka|chittagong|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh|uttara|dhanmondi|mirpur|gulshan|banani|mohammadpur|badda|rampura|motijheel|savar|gazipur|narayanganj|road|sector|block|house|flat|thana|district|ঠিকানা|বাসা|এলাকা|লোকেশন|জেলা|থানা|রোড|বাড়ি)/i.test(val)
          ) {
            address = val;
          }
        }
      });

      if (phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10) {
          if (digits.startsWith('8801')) phone = '0' + digits.substring(3);
          else if (digits.startsWith('1') && digits.length === 10) phone = '0' + digits;
          else if (digits.startsWith('01')) phone = digits.substring(0, 11);
        }
      }

      if (name) {
        name = name
          .replace(/^\d+[\.\-\s]*/, '')
          .replace(/\b(female|male|f|m)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (!gender && name) {
        if (/begum|akter|ara|urmi|nahar|sultana|razia|shirin|khatun|bibi|fahmida|farhana|mrs|ms|miss/i.test(name)) {
          gender = 'Female';
        } else {
          gender = 'Male';
        }
      } else if (gender) {
        const gUpper = gender.toUpperCase();
        if (gUpper.includes('FEMALE') || gUpper === 'F' || gUpper.includes('নারী')) gender = 'Female';
        else if (gUpper.includes('MALE') || gUpper === 'M' || gUpper.includes('পুরুষ')) gender = 'Male';
        else gender = 'Other';
      }

      if (age) {
        const ageMatch = age.match(/(\d{1,3})/);
        age = ageMatch ? ageMatch[1] : age;
      }

      // Determine Instant status
      let isInstant = false;
      let instantFee = 0;
      if (rawInstant) {
        if (/2000|2,000|২০০০|yes|true|instant|ইন্সট্যান্ট/i.test(rawInstant) && !/no|free|রেগুলার|regular/i.test(rawInstant)) {
          isInstant = true;
          instantFee = 2000;
        }
      } else if (/instant|2000\s*(?:tk|bdt|টাকা|fee)?|ইন্সট্যান্ট/i.test(remark)) {
        isInstant = true;
        instantFee = 2000;
      }

      // Determine ED status
      let isEd = false;
      if (rawEd) {
        if (/^ed$|\bed\b|yes|true|erectile|ইরেক্টাইল|ইডি/i.test(rawEd) && !/no|none|regular|false/i.test(rawEd)) {
          isEd = true;
        }
      } else if (/\b(ed|erectile\s*dysfunction|ইডি)\b/i.test(remark)) {
        isEd = true;
      }

      if (name || phone) {
        const finalName = name || (phone ? `Patient ${phone}` : `Patient #${extractedPatients.length + 1}`);
        const finalPhone = phone || '01700000000';

        let cleanSerial = '';
        if (rawSerial) {
          const match = rawSerial.match(/\b\d+\b/);
          if (match) cleanSerial = match[0];
        }
        if (!cleanSerial) {
          cleanSerial = String(extractedPatients.length + 1);
        }

        extractedPatients.push({
          serialNo: cleanSerial,
          name: finalName,
          gender: gender || 'Male',
          age: age || '',
          phone: finalPhone,
          address: address || '',
          remark: remark || 'General Assessment',
          isInstant,
          instantFee,
          isEd
        });
      }
    }

    if (extractedPatients.length === 0) {
      return res.status(400).json({ error: 'No valid patient rows found in the uploaded Excel file.' });
    }

    res.json({
      success: true,
      patients: extractedPatients,
      total: extractedPatients.length
    });
  } catch (err: any) {
    console.error('Excel parse error:', err);
    res.status(500).json({ error: 'Failed to process Excel file: ' + (err.message || '') });
  }
});

// Helper for high-performance MySQL batch upsert
async function batchUpsertPatientsToMySQL(patientsList: any[], conn?: mysql.PoolConnection) {
  const execTarget: mysql.PoolConnection | mysql.Pool | null = conn || mysqlPool;
  if (!isMySqlActive || !execTarget || !Array.isArray(patientsList) || patientsList.length === 0) {
    return;
  }

  const batchSize = 50;
  for (let i = 0; i < patientsList.length; i += batchSize) {
    const chunk = patientsList.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values: any[] = [];

    for (const p of chunk) {
      values.push(
        p.id,
        p.serialNo || '',
        p.name || '',
        p.phone || '',
        p.age || '',
        p.gender || 'Other',
        p.address || '',
        p.doctorName || 'Dr. S.M. Shahidul Islam PhD',
        p.appointmentDate || new Date().toISOString().split('T')[0],
        p.appointmentTime || '09:00 AM',
        p.department || 'Acupuncture',
        p.status || 'Pending Counseling',
        p.notes || '',
        p.remark || '',
        p.createdAt || new Date().toISOString(),
        p.isConfirmed ? 1 : 0,
        p.confirmedAt || '',
        p.consultationSerial !== null && p.consultationSerial !== undefined ? p.consultationSerial : null,
        p.consultationStatus || '',
        p.profession || '',
        p.preDoctorName || '',
        p.postDoctorName || '',
        p.preConsultationAt || '',
        p.postConsultationAt || '',
        p.consultationComment || '',
        p.postConsultationConfirmed ? 1 : 0,
        p.postConfirmedAt || '',
        p.isInstant ? 1 : 0,
        p.instantFee != null ? p.instantFee : (p.isInstant ? 2000 : 0),
        p.isEd ? 1 : 0
      );
    }

    const sql = `
      INSERT INTO patients (
        id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt,
        isConfirmed, confirmedAt, consultationSerial, consultationStatus, profession, preDoctorName, postDoctorName, preConsultationAt, postConsultationAt,
        consultationComment, postConsultationConfirmed, postConfirmedAt, isInstant, instantFee, isEd
      )
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        serialNo = VALUES(serialNo),
        name = VALUES(name),
        phone = VALUES(phone),
        age = VALUES(age),
        gender = VALUES(gender),
        address = VALUES(address),
        doctorName = VALUES(doctorName),
        appointmentDate = VALUES(appointmentDate),
        appointmentTime = VALUES(appointmentTime),
        department = VALUES(department),
        status = IF(patients.isConfirmed = 1 OR patients.status = 'Pre Consultation' OR patients.status = 'Post Consultation', patients.status, VALUES(status)),
        notes = VALUES(notes),
        remark = VALUES(remark),
        isConfirmed = IF(patients.isConfirmed = 1, 1, VALUES(isConfirmed)),
        confirmedAt = IF(patients.isConfirmed = 1 AND patients.confirmedAt IS NOT NULL AND patients.confirmedAt != '', patients.confirmedAt, VALUES(confirmedAt)),
        consultationSerial = IF(patients.consultationSerial IS NOT NULL AND patients.consultationSerial > 0, patients.consultationSerial, VALUES(consultationSerial)),
        consultationStatus = IF(patients.consultationStatus IS NOT NULL AND patients.consultationStatus != '', patients.consultationStatus, VALUES(consultationStatus)),
        profession = IF(patients.profession IS NOT NULL AND patients.profession != '', patients.profession, VALUES(profession)),
        preDoctorName = IF(patients.preDoctorName IS NOT NULL AND patients.preDoctorName != '', patients.preDoctorName, VALUES(preDoctorName)),
        postDoctorName = IF(patients.postDoctorName IS NOT NULL AND patients.postDoctorName != '', patients.postDoctorName, VALUES(postDoctorName)),
        preConsultationAt = IF(patients.preConsultationAt IS NOT NULL AND patients.preConsultationAt != '', patients.preConsultationAt, VALUES(preConsultationAt)),
        postConsultationAt = IF(patients.postConsultationAt IS NOT NULL AND patients.postConsultationAt != '', patients.postConsultationAt, VALUES(postConsultationAt)),
        consultationComment = IF(patients.consultationComment IS NOT NULL AND patients.consultationComment != '', patients.consultationComment, VALUES(consultationComment)),
        postConsultationConfirmed = IF(patients.postConsultationConfirmed = 1, 1, VALUES(postConsultationConfirmed)),
        postConfirmedAt = IF(patients.postConfirmedAt IS NOT NULL AND patients.postConfirmedAt != '', patients.postConfirmedAt, VALUES(postConfirmedAt)),
        isInstant = VALUES(isInstant),
        instantFee = VALUES(instantFee),
        isEd = VALUES(isEd)
    `;

    try {
      await execTarget.execute(sql, values);
    } catch (batchErr) {
      console.warn(`Batch upsert chunk failed, attempting single-row fallback:`, batchErr);
      for (const p of chunk) {
        await execTarget.execute(
          `INSERT INTO patients (
            id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt,
            isConfirmed, confirmedAt, consultationSerial, consultationStatus, profession, preDoctorName, postDoctorName, preConsultationAt, postConsultationAt,
            consultationComment, postConsultationConfirmed, postConfirmedAt, isInstant, instantFee, isEd
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            serialNo = VALUES(serialNo),
            name = VALUES(name),
            phone = VALUES(phone),
            age = VALUES(age),
            gender = VALUES(gender),
            address = VALUES(address),
            doctorName = VALUES(doctorName),
            appointmentDate = VALUES(appointmentDate),
            appointmentTime = VALUES(appointmentTime),
            department = VALUES(department),
            status = IF(patients.isConfirmed = 1 OR patients.status = 'Pre Consultation' OR patients.status = 'Post Consultation', patients.status, VALUES(status)),
            notes = VALUES(notes),
            remark = VALUES(remark),
            isConfirmed = IF(patients.isConfirmed = 1, 1, VALUES(isConfirmed)),
            confirmedAt = IF(patients.isConfirmed = 1 AND patients.confirmedAt IS NOT NULL AND patients.confirmedAt != '', patients.confirmedAt, VALUES(confirmedAt)),
            consultationSerial = IF(patients.consultationSerial IS NOT NULL AND patients.consultationSerial > 0, patients.consultationSerial, VALUES(consultationSerial)),
            consultationStatus = IF(patients.consultationStatus IS NOT NULL AND patients.consultationStatus != '', patients.consultationStatus, VALUES(consultationStatus)),
            profession = IF(patients.profession IS NOT NULL AND patients.profession != '', patients.profession, VALUES(profession)),
            preDoctorName = IF(patients.preDoctorName IS NOT NULL AND patients.preDoctorName != '', patients.preDoctorName, VALUES(preDoctorName)),
            postDoctorName = IF(patients.postDoctorName IS NOT NULL AND patients.postDoctorName != '', patients.postDoctorName, VALUES(postDoctorName)),
            preConsultationAt = IF(patients.preConsultationAt IS NOT NULL AND patients.preConsultationAt != '', patients.preConsultationAt, VALUES(preConsultationAt)),
            postConsultationAt = IF(patients.postConsultationAt IS NOT NULL AND patients.postConsultationAt != '', patients.postConsultationAt, VALUES(postConsultationAt)),
            consultationComment = IF(patients.consultationComment IS NOT NULL AND patients.consultationComment != '', patients.consultationComment, VALUES(consultationComment)),
            postConsultationConfirmed = IF(patients.postConsultationConfirmed = 1, 1, VALUES(postConsultationConfirmed)),
            postConfirmedAt = IF(patients.postConfirmedAt IS NOT NULL AND patients.postConfirmedAt != '', patients.postConfirmedAt, VALUES(postConfirmedAt)),
            isInstant = VALUES(isInstant),
            instantFee = VALUES(instantFee),
            isEd = VALUES(isEd)`,
          [
            p.id, p.serialNo || '', p.name || '', p.phone || '', p.age || '', p.gender || 'Other', p.address || '', p.doctorName || '', p.appointmentDate || '', p.appointmentTime || '', p.department || '', p.status || '', p.notes || '', p.remark || '', p.createdAt || '',
            p.isConfirmed ? 1 : 0, p.confirmedAt || '', p.consultationSerial !== null && p.consultationSerial !== undefined ? p.consultationSerial : null, p.consultationStatus || '', p.profession || '', p.preDoctorName || '', p.postDoctorName || '', p.preConsultationAt || '', p.postConsultationAt || '',
            p.consultationComment || '', p.postConsultationConfirmed ? 1 : 0, p.postConfirmedAt || '',
            p.isInstant ? 1 : 0, p.instantFee != null ? p.instantFee : (p.isInstant ? 2000 : 0), p.isEd ? 1 : 0
          ]
        );
      }
    }
  }
}

app.post('/api/patients/import', authenticateToken, requireRole('System Admin', 'Admin', 'Call Center', 'Doctor'), async (req, res) => {
  const { patients } = req.body;
  if (!Array.isArray(patients)) {
    return res.status(400).json({ error: 'Invalid patient list' });
  }

  let added = 0;
  let updated = 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const newPatientsBatch: any[] = [];
  const updatedEntries: Array<{ idx: number; data: any }> = [];
  const allFormattedForDb: any[] = [];

  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  const convertBnToEn = (s: string) => String(s || '').replace(/[০-৯]/g, (char) => bnToEnMap[char] || char);

  for (let idx = 0; idx < patients.length; idx++) {
    const p = patients[idx];
    if (!p.name && !p.phone) continue;

    const rawPhone = p.phone ? String(p.phone).trim() : '';
    const cleanPhone = rawPhone || `01700${Math.floor(100000 + Math.random() * 900000)}`;
    const cleanName = p.name ? String(p.name).trim() : `Patient ${cleanPhone}`;

    let cleanSerial = '';
    if (p.serialNo) {
      const enSerial = convertBnToEn(String(p.serialNo));
      const match = enSerial.match(/\b\d+\b/);
      if (match) cleanSerial = match[0];
    }
    if (!cleanSerial) {
      cleanSerial = String(idx + 1);
    }

    const apptDate = p.appointmentDate || todayStr;
    const existingIdx = localData.patients.findIndex(x => {
      if (p.id && String(x.id).trim() === String(p.id).trim()) return true;
      if (cleanSerial && x.serialNo === cleanSerial && x.appointmentDate === apptDate) return true;
      if (cleanPhone && cleanPhone !== '01700000000' && x.phone === cleanPhone && x.appointmentDate === apptDate) return true;
      return false;
    });

    const existingPatient = existingIdx >= 0 ? localData.patients[existingIdx] : null;
    const uniqueId = existingPatient ? existingPatient.id : (p.id || makeUniqueId());

    const formattedPatient = {
      id: uniqueId,
      serialNo: cleanSerial,
      name: cleanName,
      phone: cleanPhone,
      age: p.age || (existingPatient?.age || ''),
      gender: p.gender || (existingPatient?.gender || 'Other'),
      address: p.address || (existingPatient?.address || ''),
      doctorName: p.doctorName || (existingPatient?.doctorName || 'Dr. S.M. Shahidul Islam PhD'),
      appointmentDate: apptDate,
      appointmentTime: p.appointmentTime || (existingPatient?.appointmentTime || '09:00 AM'),
      department: p.department || (existingPatient?.department || 'Acupuncture'),
      status: existingPatient ? existingPatient.status : (p.status || 'Pending Counseling'),
      isConfirmed: existingPatient ? existingPatient.isConfirmed : false,
      confirmedAt: existingPatient ? existingPatient.confirmedAt : '',
      consultationSerial: existingPatient ? existingPatient.consultationSerial : null,
      consultationStatus: existingPatient ? existingPatient.consultationStatus : '',
      notes: p.notes || p.remark || (existingPatient?.notes || ''),
      remark: p.remark || p.notes || (existingPatient?.remark || ''),
      isInstant: p.isInstant !== undefined ? Boolean(p.isInstant) : Boolean(existingPatient?.isInstant),
      instantFee: p.instantFee !== undefined ? Number(p.instantFee) : (existingPatient?.instantFee || 0),
      isEd: p.isEd !== undefined ? Boolean(p.isEd) : Boolean(existingPatient?.isEd),
      createdAt: existingPatient?.createdAt || p.createdAt || new Date().toISOString()
    };

    allFormattedForDb.push(formattedPatient);

    if (existingIdx >= 0) {
      updatedEntries.push({ idx: existingIdx, data: formattedPatient });
      updated++;
    } else {
      newPatientsBatch.push(formattedPatient);
      added++;
    }
  }

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      if (allFormattedForDb.length > 0) {
        await batchUpsertPatientsToMySQL(allFormattedForDb, conn);
      }
      const nextVer = await bumpDataVersionInTx(conn);
      for (let i = 0; i < allFormattedForDb.length; i += 500) {
        const chunkIds = allFormattedForDb.slice(i, i + 500).map((p: any) => String(p.id));
        const placeholders = chunkIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE patients SET lastModifiedVersion = ? WHERE id IN (${placeholders})`,
          [nextVer, ...chunkIds]
        );
      }
      await conn.commit();
      serverDataVersion = nextVer;
      for (const p of allFormattedForDb) {
        p.lastModifiedVersion = nextVer;
      }
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL patient batch import transaction error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to import patients into database' });
    } finally {
      conn.release();
    }
  } else {
    const nextLocalVer = bumpLocalDataVersion();
    for (const p of allFormattedForDb) {
      p.lastModifiedVersion = nextLocalVer;
    }
  }

  for (const entry of updatedEntries) {
    localData.patients[entry.idx] = { ...localData.patients[entry.idx], ...entry.data };
  }
  localData.patients = [...newPatientsBatch, ...localData.patients];
  saveLocalDb();

  res.json({
    success: true,
    message: `${added} new appointments imported, ${updated} updated.`,
    added,
    updated,
    totalPatients: localData.patients.length
  });
});

// 5. Quotations API
app.get('/api/quotations', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center', 'SSD'), async (req, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM quotations_v2 ORDER BY createdAt DESC');
      const parsedRows = Array.isArray(rows) ? rows.map(formatQuotationRow) : [];
      return res.json(parsedRows);
    } catch (err: any) {
      console.error('MySQL get quotations error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch quotations from database' });
    }
  }
  res.json(localData.quotations);
});

app.post('/api/quotations', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const quotation = req.body;
  if (!quotation || typeof quotation !== 'object') {
    return res.status(400).json({ error: 'Invalid quotation payload' });
  }
  if (!quotation.id) {
    quotation.id = makeUniqueId();
  }

  // Server-side calculation verification
  let computedTotal = 0;
  if (Array.isArray(quotation.items)) {
    for (const item of quotation.items) {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const disc = Number(item.discountPercent) || 0;
      const lineTotal = qty * unitPrice * (1 - disc / 100);
      computedTotal += lineTotal;
    }
  }
  const submittedNet = Number(quotation.netPayable) || 0;
  if (Math.abs(computedTotal - submittedNet) > 1 && computedTotal > 0) {
    quotation.totalAmount = Math.round(computedTotal);
    quotation.netPayable = Math.round(computedTotal);
  }

  if (!quotation.createdAt) {
    quotation.createdAt = quotation.createdDate || new Date().toISOString();
  }

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      const [existingIdRows]: any = await conn.execute(
        'SELECT id, quotationNumber FROM quotations_v2 WHERE id = ? FOR UPDATE',
        [quotation.id ?? null]
      );
      const existingRow = Array.isArray(existingIdRows) && existingIdRows.length > 0 ? existingIdRows[0] : null;

      if (existingRow) {
        if (existingRow.quotationNumber) {
          quotation.quotationNumber = existingRow.quotationNumber;
        } else if (!quotation.quotationNumber) {
          quotation.quotationNumber = await allocateNextInvoiceNumber(conn, new Date().getFullYear());
        }
      } else {
        quotation.quotationNumber = await allocateNextInvoiceNumber(conn, new Date().getFullYear());
      }

      const [clashRows]: any = await conn.execute(
        'SELECT id FROM quotations_v2 WHERE quotationNumber = ? AND id <> ?',
        [quotation.quotationNumber ?? null, quotation.id ?? null]
      );
      if (Array.isArray(clashRows) && clashRows.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: `Quotation number "${quotation.quotationNumber}" already exists on another invoice (${clashRows[0].id}).`
        });
      }

      await conn.execute(QUOTATION_UPSERT_SQL, buildQuotationDbParams(quotation));
      const hasLinkedPatient = Boolean(quotation.patientId && quotation.patientId !== 'walkin');
      if (hasLinkedPatient) {
        await conn.execute('UPDATE patients SET status = ? WHERE id = ?', ['Quotation Created', quotation.patientId ?? null]);
      }
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.execute('UPDATE quotations_v2 SET lastModifiedVersion = ? WHERE id = ?', [nextVer, quotation.id]);
      if (hasLinkedPatient) {
        await conn.execute('UPDATE patients SET lastModifiedVersion = ? WHERE id = ?', [nextVer, quotation.patientId]);
      }
      await conn.commit();
      serverDataVersion = nextVer;
      quotation.lastModifiedVersion = nextVer;
    } catch (err: any) {
      try {
        await conn.rollback();
      } catch {}
      console.error('MySQL quotation save error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to save quotation to MySQL database' });
    } finally {
      conn.release();
    }
  } else {
    if (!quotation.quotationNumber) {
      const existingLocal = localData.quotations.find(q => q.id === quotation.id);
      if (existingLocal && existingLocal.quotationNumber) {
        quotation.quotationNumber = existingLocal.quotationNumber;
      } else {
        const year = new Date().getFullYear();
        const prefix = `SXH-${year}-`;
        let maxSeq = 0;
        for (const q of localData.quotations) {
          if (typeof q?.quotationNumber === 'string' && q.quotationNumber.startsWith(prefix)) {
            const num = Number(q.quotationNumber.slice(prefix.length));
            if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
          }
        }
        quotation.quotationNumber = `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;
      }
    }
    const nextLocalVer = bumpLocalDataVersion();
    quotation.lastModifiedVersion = nextLocalVer;
  }

  const existingIdx = localData.quotations.findIndex(q => q.id === quotation.id);
  if (existingIdx >= 0) {
    localData.quotations[existingIdx] = quotation;
  } else {
    localData.quotations.unshift(quotation);
  }

  const pIdx = quotation.patientId && quotation.patientId !== 'walkin'
    ? localData.patients.findIndex(p => p.id === quotation.patientId)
    : -1;
  if (pIdx >= 0) {
    localData.patients[pIdx].status = 'Quotation Created';
    localData.patients[pIdx].lastModifiedVersion = serverDataVersion;
  }

  saveLocalDb();

  res.json({ message: 'Quotation saved successfully', quotation, quotations: localData.quotations });
});

app.delete('/api/quotations/:id', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const { id } = req.params;

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM quotations_v2 WHERE id = ?', [id ?? null]);
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL quotation delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete quotation from database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  localData.quotations = localData.quotations.filter(q => q.id !== id);
  saveLocalDb();

  res.json({ message: 'Quotation deleted successfully', quotations: localData.quotations });
});

app.post('/api/quotations/delete', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No quotation IDs provided for deletion' });
  }

  if (isMySqlActive && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const placeholders = ids.map(() => '?').join(',');
      await conn.execute(`DELETE FROM quotations_v2 WHERE id IN (${placeholders})`, ids);
      const nextVer = await bumpDataVersionInTx(conn);
      await conn.commit();
      serverDataVersion = nextVer;
    } catch (err: any) {
      try { await conn.rollback(); } catch {}
      console.error('MySQL quotation batch delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete quotations from database' });
    } finally {
      conn.release();
    }
  } else {
    bumpLocalDataVersion();
  }

  const idSet = new Set(ids);
  localData.quotations = localData.quotations.filter(q => !idSet.has(q.id));
  saveLocalDb();

  res.json({ message: `${ids.length} quotation(s) deleted successfully`, deletedCount: ids.length, quotations: localData.quotations });
});

// 6. Catalog API
app.get('/api/catalog', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center', 'SSD'), async (req, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM catalog ORDER BY orderIndex ASC, id ASC');
      if (rows.length > 0) {
        return res.json(rows.map(formatCatalogRow));
      }
    } catch (err) {
      console.error('MySQL catalog fetch error:', err);
    }
  }
  res.json(localData.catalog);
});

app.post('/api/catalog', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const { catalog } = req.body;
  if (Array.isArray(catalog)) {
    const enrichedCatalog = catalog.map((item: any, idx: number) => ({
      ...item,
      orderIndex: typeof item.orderIndex === 'number' ? item.orderIndex : idx
    }));

    if (isMySqlActive && mysqlPool) {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute('DELETE FROM catalog');
        for (let idx = 0; idx < enrichedCatalog.length; idx++) {
          const item = enrichedCatalog[idx];
          const orderIdx = typeof item.orderIndex === 'number' ? item.orderIndex : idx;
          const detailsJson = JSON.stringify(item);
          await conn.execute(
            `INSERT INTO catalog (
              id, name, category, defaultPrice, defaultDiscountPercent,
              fixedDiscountAmount, outdoorDiscountPercent, outdoorDiscountAmount,
              description, rateNote, outdoorSessions, indoorSessions,
              isIndoorFree, isRatioBased, sessionsPer10Days, orderIndex, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.name || '',
              item.category || 'treatment',
              item.defaultPrice || 0,
              item.defaultDiscountPercent || 0,
              item.fixedDiscountAmount ?? null,
              item.outdoorDiscountPercent ?? null,
              item.outdoorDiscountAmount ?? null,
              item.description || '',
              item.rateNote || '',
              item.outdoorSessions ?? null,
              item.indoorSessions ?? null,
              item.isIndoorFree ? 1 : 0,
              item.isRatioBased ? 1 : 0,
              item.sessionsPer10Days ?? null,
              orderIdx,
              detailsJson
            ]
          );
        }
        const nextVer = await bumpDataVersionInTx(conn);
        await conn.execute('UPDATE catalog SET lastModifiedVersion = ?', [nextVer]);
        await conn.commit();
        serverDataVersion = nextVer;
        for (const item of enrichedCatalog) {
          item.lastModifiedVersion = nextVer;
        }
      } catch (err: any) {
        try { await conn.rollback(); } catch {}
        console.error('MySQL catalog save error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to save catalog to database' });
      } finally {
        conn.release();
      }
    } else {
      const nextLocalVer = bumpLocalDataVersion();
      for (const item of enrichedCatalog) {
        item.lastModifiedVersion = nextLocalVer;
      }
    }

    localData.catalog = enrichedCatalog;
    saveLocalDb();

    return res.json({ message: 'Catalog price updated successfully', catalog: localData.catalog });
  }
  res.status(400).json({ error: 'Invalid catalog data' });
});

// Professions Settings API
app.get('/api/settings/professions', authenticateToken, async (req, res) => {
  let list = (localData as any).professions || DEFAULT_PROFESSIONS;
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['professions']);
      if (rows && rows[0] && rows[0].setting_value) {
        list = JSON.parse(rows[0].setting_value);
      }
    } catch {}
  }
  res.json({ professions: list });
});

app.post('/api/settings/professions', authenticateToken, requireRole('System Admin', 'Doctor'), async (req, res) => {
  const { professions } = req.body;
  if (Array.isArray(professions) && professions.length > 0) {
    const cleaned = professions.map((p: string) => String(p).trim()).filter(Boolean);
    if (isMySqlActive && mysqlPool) {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          ['professions', JSON.stringify(cleaned)]
        );
        const nextVer = await bumpDataVersionInTx(conn);
        await conn.commit();
        serverDataVersion = nextVer;
      } catch (err: any) {
        try { await conn.rollback(); } catch {}
        console.error('MySQL save professions error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to save professions setting' });
      } finally {
        conn.release();
      }
    } else {
      bumpLocalDataVersion();
    }
    (localData as any).professions = cleaned;
    saveLocalDb();
    return res.json({ success: true, professions: (localData as any).professions });
  }
  res.status(400).json({ error: 'Invalid professions data' });
});

// Consultation Comments / Decisions Settings API
app.get('/api/settings/comments', authenticateToken, async (req, res) => {
  let list = (localData as any).comments || DEFAULT_CONSULTATION_COMMENTS;
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['comments']);
      if (rows && rows[0] && rows[0].setting_value) {
        list = JSON.parse(rows[0].setting_value);
      }
    } catch {}
  }
  res.json({ comments: list });
});

app.post('/api/settings/comments', authenticateToken, requireRole('System Admin', 'Doctor'), async (req, res) => {
  const { comments } = req.body;
  if (Array.isArray(comments) && comments.length > 0) {
    const cleaned = comments.map((c: string) => String(c).trim()).filter(Boolean);
    if (isMySqlActive && mysqlPool) {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          ['comments', JSON.stringify(cleaned)]
        );
        const nextVer = await bumpDataVersionInTx(conn);
        await conn.commit();
        serverDataVersion = nextVer;
      } catch (err: any) {
        try { await conn.rollback(); } catch {}
        console.error('MySQL save comments error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to save comments setting' });
      } finally {
        conn.release();
      }
    } else {
      bumpLocalDataVersion();
    }
    (localData as any).comments = cleaned;
    saveLocalDb();
    return res.json({ success: true, comments: (localData as any).comments });
  }
  res.status(400).json({ error: 'Invalid comments data' });
});

// 7. System Admin Clear Demo Data API
app.post('/api/admin/clear-demo-data', authenticateToken, requireRole('System Admin'), async (req, res) => {
  try {
    if (isMySqlActive && mysqlPool) {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute("DELETE FROM patients WHERE id IN ('pat-101', 'pat-102')");
        await conn.execute("DELETE FROM users WHERE id IN ('usr-doctor', 'usr-callcenter', 'usr-billing')");
        const nextVer = await bumpDataVersionInTx(conn);
        await conn.commit();
        serverDataVersion = nextVer;
      } catch (err) {
        try { await conn.rollback(); } catch {}
        throw err;
      } finally {
        conn.release();
      }
    } else {
      bumpLocalDataVersion();
    }

    // Remove demo patients pat-101, pat-102
    localData.patients = localData.patients.filter(p => p.id !== 'pat-101' && p.id !== 'pat-102');

    // Remove demo staff accounts, retain admin
    localData.users = localData.users.filter(u => u.username === 'admin' || (u.id !== 'usr-doctor' && u.id !== 'usr-callcenter' && u.id !== 'usr-billing'));
    if (!localData.users.some(u => u.username === 'admin')) {
      localData.users.unshift(ADMIN_USER_RECORD);
    }

    saveLocalDb();

    return res.json({
      message: 'Demo data cleared successfully. Only admin login credentials remain.',
      users: localData.users,
      patients: localData.patients
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear demo data: ' + err.message });
  }
});

// Read-only Admin Diagnostic: Detect duplicate consultation serial numbers per appointmentDate
app.get('/api/admin/duplicate-serials', authenticateToken, requireRole('System Admin'), async (req, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute(
        `SELECT appointmentDate, consultationSerial, COUNT(*) c, GROUP_CONCAT(id) ids
         FROM patients WHERE consultationSerial IS NOT NULL
         GROUP BY appointmentDate, consultationSerial HAVING c > 1`
      );
      const duplicates = Array.isArray(rows) ? rows : [];
      return res.json({ duplicates, count: duplicates.length });
    } catch (err: any) {
      console.error('MySQL duplicate-serials query error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to query duplicate consultation serials' });
    }
  }

  const groups = new Map<string, { appointmentDate: string; consultationSerial: number; ids: string[] }>();
  for (const p of localData.patients) {
    if (p && p.consultationSerial !== null && p.consultationSerial !== undefined) {
      const apptDate = p.appointmentDate || '';
      const serial = Number(p.consultationSerial);
      const key = `${apptDate}__${serial}`;
      const existing = groups.get(key);
      if (existing) {
        existing.ids.push(String(p.id));
      } else {
        groups.set(key, { appointmentDate: apptDate, consultationSerial: serial, ids: [String(p.id)] });
      }
    }
  }
  const duplicates = Array.from(groups.values())
    .filter(g => g.ids.length > 1)
    .map(g => ({
      appointmentDate: g.appointmentDate,
      consultationSerial: g.consultationSerial,
      c: g.ids.length,
      ids: g.ids.join(',')
    }));
  res.json({ duplicates, count: duplicates.length });
});

// One-time Backfill Endpoint: Recover quotations from localData into MySQL quotations_v2
app.post('/api/admin/backfill-quotations', authenticateToken, requireRole('System Admin'), async (req, res) => {
  if (!isMySqlActive || !mysqlPool) {
    return res.status(503).json({ error: 'MySQL database is not connected' });
  }

  const sourceQuotations = Array.isArray(localData.quotations) ? localData.quotations : [];
  if (sourceQuotations.length === 0) {
    return res.json({
      message: 'No local quotations to backfill.',
      totalLocal: 0,
      inserted: 0,
      reassigned: 0,
      skipped: 0,
      skippedIds: []
    });
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();
    let inserted = 0;
    let reassigned = 0;
    let skipped = 0;
    const insertedIds: string[] = [];
    const skippedIds: Array<{ id: string; quotationNumber: string; reason: 'already existed' | 'quotationNumber collision' | 'invalid payload' }> = [];

    for (const q of sourceQuotations) {
      if (!q || !q.id) {
        skipped++;
        skippedIds.push({
          id: String(q?.id || ''),
          quotationNumber: String(q?.quotationNumber || ''),
          reason: 'invalid payload'
        });
        continue;
      }

      const [result]: any = await conn.execute(QUOTATION_INSERT_IGNORE_SQL, buildQuotationDbParams(q));
      if (result && result.affectedRows > 0) {
        inserted++;
        insertedIds.push(String(q.id));
        continue;
      }

      // INSERT IGNORE skipped this row — check why
      const [idCheckRows]: any = await conn.execute('SELECT id FROM quotations_v2 WHERE id = ? LIMIT 1', [q.id]);
      if (Array.isArray(idCheckRows) && idCheckRows.length > 0) {
        skipped++;
        skippedIds.push({
          id: String(q.id),
          quotationNumber: String(q.quotationNumber || ''),
          reason: 'already existed'
        });
        continue;
      }

      // Skipped due to quotationNumber collision: record collision and re-assign fresh number from invoice_counters
      const collidingNumber = String(q.quotationNumber || '');
      const freshYear = new Date(q.createdAt || q.createdDate || Date.now()).getFullYear() || new Date().getFullYear();
      const freshNumber = await allocateNextInvoiceNumber(conn, freshYear);
      const reassignedQuotation = { ...q, quotationNumber: freshNumber };

      const [retryResult]: any = await conn.execute(QUOTATION_INSERT_IGNORE_SQL, buildQuotationDbParams(reassignedQuotation));
      if (retryResult && retryResult.affectedRows > 0) {
        q.quotationNumber = freshNumber;
        inserted++;
        reassigned++;
        insertedIds.push(String(q.id));
        skippedIds.push({
          id: String(q.id),
          quotationNumber: collidingNumber,
          reason: 'quotationNumber collision'
        });
      } else {
        skipped++;
        skippedIds.push({
          id: String(q.id),
          quotationNumber: collidingNumber,
          reason: 'quotationNumber collision'
        });
      }
    }

    let nextVer: number | null = null;
    if (inserted > 0 || reassigned > 0) {
      nextVer = await bumpDataVersionInTx(conn);
      for (let i = 0; i < insertedIds.length; i += 500) {
        const chunkIds = insertedIds.slice(i, i + 500);
        const placeholders = chunkIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE quotations_v2 SET lastModifiedVersion = ? WHERE id IN (${placeholders})`,
          [nextVer, ...chunkIds]
        );
      }
      const insertedIdSet = new Set(insertedIds);
      for (const q of sourceQuotations) {
        if (q && q.id && insertedIdSet.has(String(q.id))) {
          q.lastModifiedVersion = nextVer;
        }
      }
    }
    await conn.commit();
    if (nextVer !== null) {
      serverDataVersion = nextVer;
    }
    if (reassigned > 0 || inserted > 0) {
      saveLocalDb();
    }

    return res.json({
      message: 'Quotation backfill completed',
      totalLocal: sourceQuotations.length,
      inserted,
      reassigned,
      skipped,
      skippedIds
    });
  } catch (err: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error('MySQL quotation backfill error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to backfill quotations to MySQL' });
  } finally {
    conn.release();
  }
});


// Global JSON Error Handler for API routes to prevent default Express HTML error responses
app.use((err: any, req: any, res: any, next: any) => {
  console.error('API Middleware Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'An unexpected server error occurred during processing.'
  });
});

// Start Server & Integrate Vite Middleware
async function startServer() {
  // Always load local DB synchronously first so routes are immediately ready
  loadLocalDb();

  // Initialize MySQL in background (with 2s grace period) so slow/offline MySQL never blocks port binding
  const dbInitPromise = initDatabase().catch((dbErr) => {
    console.error('Database initialization warning (falling back to local DB):', dbErr);
  });
  await Promise.race([
    dbInitPromise,
    new Promise(resolve => setTimeout(resolve, 2000))
  ]);

  const httpServer = http.createServer(app);
  let viteServer: any = null;

  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    viteServer = await createViteServer({
      server: { 
        middlewareMode: true,
        ws: isHmrDisabled ? false : undefined,
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SUO XI Hospital Billing System Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down server cleanly...`);
    try {
      if (saveLocalDbTimer || saveLocalDbInFlight || saveLocalDbDirty) {
        await flushLocalDb();
      }
    } catch (err) {
      console.error('Error flushing local DB on shutdown:', err);
    }
    try {
      if (viteServer) await viteServer.close();
    } catch {}
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
