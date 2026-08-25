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

dotenv.config();

const app = express();

// Trust proxy for reverse proxy environments (e.g. Cloud Run, Nginx) so express-rate-limit reads X-Forwarded-For properly
app.set('trust proxy', 1);

// Security Headers (Helmet) - frameguard disabled so preview iframe can render in AI Studio
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://suoxigroup.com", "http://suoxigroup.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameAncestors: ["'self'", "*"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

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

app.use(express.json({ limit: '10mb' }));

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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.NODE_ENV === 'production' ? 3003 : 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'suoxi_hospital_secure_jwt_secret_key_2026_default_32char_long';

// Interface definitions
interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: 'System Admin' | 'Doctor' | 'Call Center' | 'Billing Counter';
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

// Local JSON DB Helper
let localData = {
  users: INITIAL_USERS,
  patients: INITIAL_PATIENTS,
  quotations: [] as any[],
  catalog: DEFAULT_CATALOG
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

      localData = {
        users,
        patients,
        quotations,
        catalog: Array.isArray(parsed.catalog) && parsed.catalog.length > 0 ? parsed.catalog : DEFAULT_CATALOG
      };
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.error('Error loading local DB file, using default seed:', err);
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving local DB file:', err);
  }
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
          INDEX idx_patients_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Exhaustive safe column migrations for existing MySQL tables
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
        "ALTER TABLE users ADD COLUMN is_active TINYINT DEFAULT 1"
      ];

      for (const mig of migrations) {
        try {
          await pool.query(mig);
        } catch {
          // column already exists
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
        CREATE TABLE IF NOT EXISTS catalog (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          category VARCHAR(64) NOT NULL,
          defaultPrice DOUBLE DEFAULT 0,
          defaultDiscountPercent DOUBLE DEFAULT 0,
          description TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

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

app.get('/api/init', authenticateToken, async (req: any, res) => {
  const user = req.user;
  let patients: any[] = [...localData.patients];
  let quotations: any[] = [...localData.quotations];
  let catalog: any[] = localData.catalog;
  let users: any[] = localData.users.map(({ password_hash, ...u }) => u);

  if (isMySqlActive && mysqlPool) {
    try {
      const [pRows]: any = await mysqlPool.execute('SELECT * FROM patients ORDER BY createdAt DESC, id DESC');
      if (Array.isArray(pRows) && pRows.length > 0) {
        const dbIds = new Set(pRows.map((r: any) => r.id));
        patients = [...pRows, ...localData.patients.filter((p: any) => p && p.id && !dbIds.has(p.id))];
      }

      const [qRows]: any = await mysqlPool.execute('SELECT * FROM quotations ORDER BY createdAt DESC');
      if (Array.isArray(qRows) && qRows.length > 0) {
        const dbQIds = new Set(qRows.map((r: any) => r.id));
        const parsedQRows = qRows.map((r: any) => ({
          ...r,
          items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
        }));
        quotations = [...parsedQRows, ...localData.quotations.filter((q: any) => q && q.id && !dbQIds.has(q.id))];
      }

      const [cRows]: any = await mysqlPool.execute('SELECT * FROM catalog ORDER BY id ASC');
      if (Array.isArray(cRows) && cRows.length > 0) catalog = cRows;

      const [uRows]: any = await mysqlPool.execute('SELECT id, username, name, role, phone, is_active FROM users ORDER BY id ASC');
      if (Array.isArray(uRows) && uRows.length > 0) users = uRows;
    } catch (err) {
      console.error('MySQL init fetch error:', err);
    }
  }

  res.json({
    user,
    patients,
    quotations,
    catalog,
    users,
    dbMode: isMySqlActive ? 'MySQL Central Database' : 'Local File Persistence'
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
      const [rows]: any = await mysqlPool.execute('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
      if (rows.length > 0) {
        user = rows[0];
      }
    } catch (err) {
      console.error('MySQL User login error:', err);
    }
  }

  if (!user) {
    user = localData.users.find(u => u.username === username);
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
  localData.users[existingIdx].password_hash = newHash;
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      await mysqlPool.execute(
        'UPDATE users SET password_hash = ? WHERE id = ? OR username = ?',
        [newHash, userId, username]
      );
    } catch (err) {
      console.error('MySQL update password error:', err);
    }
  }

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

  if (existingIdx >= 0) {
    localData.users[existingIdx] = newUser;
  } else {
    localData.users.push(newUser);
  }
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      await mysqlPool.execute(
        `INSERT INTO users (id, username, password_hash, name, role, phone, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE password_hash=?, name=?, role=?, phone=?, is_active=?`,
        [newUser.id, newUser.username, newUser.password_hash, newUser.name, newUser.role, newUser.phone, newUser.is_active,
         newUser.password_hash, newUser.name, newUser.role, newUser.phone, newUser.is_active]
      );
    } catch (err) {
      console.error('MySQL user save error:', err);
    }
  }

  res.json({ message: 'User account saved successfully', user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, phone: newUser.phone } });
});

app.delete('/api/users/:id', authenticateToken, requireRole('System Admin'), async (req: any, res) => {
  const { id } = req.params;
  localData.users = localData.users.filter(u => u.id !== id);
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      await mysqlPool.execute('DELETE FROM users WHERE id = ?', [id]);
    } catch (err) {
      console.error('MySQL user delete error:', err);
    }
  }

  res.json({ message: 'User account deleted successfully' });
});

// 4. Patients API & PDF Upload Parser
app.get('/api/patients', authenticateToken, requireRole('System Admin', 'Admin', 'Doctor', 'Call Center', 'Billing Counter'), async (req, res) => {
  let allPatients: any[] = [...localData.patients];
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM patients ORDER BY createdAt DESC, id DESC');
      if (Array.isArray(rows) && rows.length > 0) {
        const dbIds = new Set(rows.map((r: any) => r.id));
        allPatients = [...rows, ...localData.patients.filter((p: any) => p && p.id && !dbIds.has(p.id))];
      }
    } catch (err) {
      console.error('Error fetching patients from MySQL:', err);
    }
  }
  res.json(allPatients);
});

app.get('/api/patients/search', authenticateToken, requireRole('System Admin', 'Admin', 'Doctor', 'Call Center', 'Billing Counter'), async (req, res) => {
  const query = String(req.query.q || '').trim();
  let allPatients: any[] = [...localData.patients];

  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM patients ORDER BY createdAt DESC, id DESC');
      if (Array.isArray(rows) && rows.length > 0) {
        const dbIds = new Set(rows.map((r: any) => r.id));
        allPatients = [...rows, ...localData.patients.filter((p: any) => p && p.id && !dbIds.has(p.id))];
      }
    } catch (err) {
      console.error('Error searching patients MySQL:', err);
    }
  }

  if (!query) {
    return res.json(allPatients);
  }

  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  const convertBnToEn = (s: string) => s.replace(/[০-৯]/g, (char) => bnToEnMap[char] || char);

  const cleanQuery = convertBnToEn(query.toLowerCase());
  const queryDigits = convertBnToEn(query).replace(/\D/g, '');
  const queryNoZero = queryDigits.replace(/^0+/, '');

  const matched = allPatients.filter((p: any) => {
    if (!p) return false;
    const name = convertBnToEn(String(p.name || '').toLowerCase());
    const phone = convertBnToEn(String(p.phone || '').toLowerCase());
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneNoZero = phoneDigits.replace(/^0+/, '');
    const serial = String(p.serialNo || '').toLowerCase();
    const notes = convertBnToEn(String(p.notes || p.remark || '').toLowerCase());
    const doctor = convertBnToEn(String(p.doctorName || '').toLowerCase());

    if (name.includes(cleanQuery) || phone.includes(cleanQuery) || serial === cleanQuery || notes.includes(cleanQuery) || doctor.includes(cleanQuery)) {
      return true;
    }
    if (queryDigits.length >= 3) {
      if (phoneDigits.includes(queryDigits) || (queryNoZero.length >= 3 && phoneDigits.includes(queryNoZero))) return true;
      if (phoneNoZero.length >= 3 && queryDigits.includes(phoneNoZero)) return true;
      if (phoneNoZero.length >= 3 && queryNoZero.length >= 3 && (phoneNoZero.includes(queryNoZero) || queryNoZero.includes(phoneNoZero))) return true;
      if (notes.replace(/\D/g, '').includes(queryDigits)) return true;
    }
    return false;
  });

  res.json(matched);
});

app.post('/api/patients', authenticateToken, requireRole('System Admin', 'Call Center', 'Billing Counter', 'Doctor'), async (req, res) => {
  const p = req.body;
  if (!p.name || !p.phone) {
    return res.status(400).json({ error: 'Patient Name and Phone Number are required' });
  }

  const cleanPhone = String(p.phone).trim();
  // ONLY match by id, NEVER overwrite different appointments of the same phone number
  const existingIdx = p.id ? localData.patients.findIndex(x => x.id === p.id) : -1;

  let cleanSerial = '';
  if (p.serialNo) {
    const match = String(p.serialNo).match(/\b\d+\b/);
    if (match) cleanSerial = match[0];
  }
  if (!cleanSerial) {
    cleanSerial = String(localData.patients.length + 1);
  }

  const formattedPatient = {
    id: existingIdx >= 0 ? localData.patients[existingIdx].id : (p.id || `pat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
    serialNo: cleanSerial,
    name: String(p.name).trim(),
    phone: cleanPhone,
    age: p.age || '',
    gender: p.gender || 'Other',
    address: p.address || '',
    doctorName: p.doctorName || 'Senior Counseling Doctor',
    appointmentDate: p.appointmentDate || new Date().toISOString().split('T')[0],
    appointmentTime: p.appointmentTime || '09:00 AM',
    department: p.department || 'Acupuncture',
    status: p.status || 'Pending Counseling',
    notes: p.notes || p.remark || '',
    remark: p.remark || p.notes || '',
    createdAt: p.createdAt || new Date().toISOString()
  };

  if (existingIdx >= 0) {
    localData.patients[existingIdx] = { ...localData.patients[existingIdx], ...formattedPatient };
  } else {
    localData.patients.unshift(formattedPatient);
  }
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      await mysqlPool.execute(
        `INSERT INTO patients (id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE serialNo=?, name=?, phone=?, age=?, gender=?, address=?, doctorName=?, appointmentDate=?, appointmentTime=?, department=?, status=?, notes=?, remark=?`,
        [formattedPatient.id, formattedPatient.serialNo, formattedPatient.name, formattedPatient.phone, formattedPatient.age, formattedPatient.gender, formattedPatient.address, formattedPatient.doctorName, formattedPatient.appointmentDate, formattedPatient.appointmentTime, formattedPatient.department, formattedPatient.status, formattedPatient.notes, formattedPatient.remark, formattedPatient.createdAt,
         formattedPatient.serialNo, formattedPatient.name, formattedPatient.phone, formattedPatient.age, formattedPatient.gender, formattedPatient.address, formattedPatient.doctorName, formattedPatient.appointmentDate, formattedPatient.appointmentTime, formattedPatient.department, formattedPatient.status, formattedPatient.notes, formattedPatient.remark]
      );
    } catch (err) {
      console.error('MySQL patient save error:', err);
    }
  }

  res.json({ message: 'Patient saved successfully', patient: formattedPatient, patients: localData.patients });
});

app.post('/api/patients/delete', authenticateToken, requireRole('System Admin', 'Call Center'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No patient IDs provided for deletion' });
  }

  const idSet = new Set(ids);
  localData.patients = localData.patients.filter(p => !idSet.has(p.id));
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      await mysqlPool.execute(`DELETE FROM patients WHERE id IN (${placeholders})`, ids);
    } catch (err) {
      console.error('MySQL patient batch delete error:', err);
    }
  }

  res.json({ message: `${ids.length} patient(s) deleted successfully`, deletedCount: ids.length, patients: localData.patients });
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
    let remarkCol = -1;

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
        } else if (/(disease|remark|remarks|condition|problem|note|notes|symptom|illness|complain|রোগের\s*নাম|রোগ|সমস্যা|মন্তব্য|অভিযোগ)/i.test(str) && remarkCol === -1) {
          remarkCol = idx;
        } else if (/(age|yrs|years|y\.o|বয়স|বযস)/i.test(str) && ageCol === -1) {
          ageCol = idx;
        } else if (/(gender|sex|লিঙ্গ|জেন্ডার)/i.test(str) && genderCol === -1) {
          genderCol = idx;
        }
      });
    }

    const extractedPatients: Array<{ serialNo?: string; name: string; gender: string; age: string; phone: string; remark: string }> = [];
    const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let rawSerial = serialCol !== -1 ? String(row[serialCol] || '').trim() : '';
      let name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
      let phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() : '';
      let age = ageCol !== -1 ? String(row[ageCol] || '').trim() : '';
      let gender = genderCol !== -1 ? String(row[genderCol] || '').trim() : '';
      let remark = remarkCol !== -1 ? String(row[remarkCol] || '').trim() : '';

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

        if (!age && cIdx !== phoneCol && cIdx !== nameCol) {
          const aMatch = val.match(/\b(\d{1,3})\s*(?:yrs|years|y|y\.o|y\/o|y\.|বছর)?\b/i);
          if (aMatch) {
            const num = parseInt(aMatch[1], 10);
            if (num >= 1 && num <= 115) {
              age = String(num);
            }
          }
        }

        if (!name && cIdx !== phoneCol && cIdx !== ageCol && cIdx !== remarkCol && cIdx !== genderCol && cIdx !== serialCol) {
          const isNumeric = /^\d+$/.test(val);
          const isPhone = /(?:\+?880|880|0)?1[3-9]\d{8}/.test(cleanedCellStr);
          const isKeywords = /male|female|new patient|followup|robin|alamin|rakibul|completed|pending|cancel/i.test(val);
          if (val.length >= 2 && !isNumeric && !isPhone && !isKeywords) {
            name = val;
          }
        }

        if (!remark && cIdx !== phoneCol && cIdx !== nameCol && cIdx !== ageCol && cIdx !== genderCol) {
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
          remark: remark || 'General Assessment',
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
async function batchUpsertPatientsToMySQL(patientsList: any[]) {
  if (!isMySqlActive || !mysqlPool || !Array.isArray(patientsList) || patientsList.length === 0) {
    return;
  }

  const batchSize = 50;
  for (let i = 0; i < patientsList.length; i += batchSize) {
    const chunk = patientsList.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
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
        p.doctorName || 'Senior Counseling Doctor',
        p.appointmentDate || new Date().toISOString().split('T')[0],
        p.appointmentTime || '09:00 AM',
        p.department || 'Acupuncture',
        p.status || 'Pending Counseling',
        p.notes || '',
        p.remark || '',
        p.createdAt || new Date().toISOString()
      );
    }

    const sql = `
      INSERT INTO patients (id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt)
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
        status = VALUES(status),
        notes = VALUES(notes),
        remark = VALUES(remark)
    `;

    try {
      await mysqlPool.execute(sql, values);
    } catch (batchErr) {
      console.warn(`Batch upsert chunk failed, attempting single-row fallback:`, batchErr);
      for (const p of chunk) {
        try {
          await mysqlPool.execute(
            `INSERT INTO patients (id, serialNo, name, phone, age, gender, address, doctorName, appointmentDate, appointmentTime, department, status, notes, remark, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE serialNo=?, name=?, phone=?, age=?, gender=?, address=?, doctorName=?, appointmentDate=?, appointmentTime=?, department=?, status=?, notes=?, remark=?`,
            [
              p.id, p.serialNo, p.name, p.phone, p.age, p.gender, p.address, p.doctorName, p.appointmentDate, p.appointmentTime, p.department, p.status, p.notes, p.remark, p.createdAt,
              p.serialNo, p.name, p.phone, p.age, p.gender, p.address, p.doctorName, p.appointmentDate, p.appointmentTime, p.department, p.status, p.notes, p.remark
            ]
          );
        } catch (singleErr) {
          console.error('MySQL single row fallback save error:', singleErr);
        }
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

    const existingIdx = p.id ? localData.patients.findIndex(x => x.id === p.id) : -1;

    let cleanSerial = '';
    if (p.serialNo) {
      const enSerial = convertBnToEn(String(p.serialNo));
      const match = enSerial.match(/\b\d+\b/);
      if (match) cleanSerial = match[0];
    }
    if (!cleanSerial) {
      cleanSerial = String(idx + 1);
    }

    const uniqueId = existingIdx >= 0
      ? localData.patients[existingIdx].id
      : (p.id || `pat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`);

    const formattedPatient = {
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
      notes: p.notes || p.remark || '',
      remark: p.remark || p.notes || '',
      createdAt: p.createdAt || new Date().toISOString()
    };

    allFormattedForDb.push(formattedPatient);

    if (existingIdx >= 0) {
      localData.patients[existingIdx] = { ...localData.patients[existingIdx], ...formattedPatient };
      updated++;
    } else {
      newPatientsBatch.push(formattedPatient);
      added++;
    }
  }

  // Prepend newly imported batch in exact top-to-bottom sheet order
  localData.patients = [...newPatientsBatch, ...localData.patients];
  saveLocalDb();

  // Perform fast batch upsert to MySQL database
  if (isMySqlActive && mysqlPool) {
    try {
      await batchUpsertPatientsToMySQL(allFormattedForDb);
    } catch (err) {
      console.error('MySQL patient batch upsert top-level error:', err);
    }
  }

  res.json({
    success: true,
    message: `${added} new appointments imported, ${updated} updated.`,
    added,
    updated,
    patients: localData.patients
  });
});

// 5. Quotations API
app.get('/api/quotations', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM quotations ORDER BY createdAt DESC');
      const parsedRows = rows.map((r: any) => ({
        ...r,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
      }));
      return res.json(parsedRows);
    } catch (err) {
      console.error('MySQL get quotations error:', err);
    }
  }
  res.json(localData.quotations);
});

app.post('/api/quotations', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const quotation = req.body;
  if (!quotation || !quotation.id) {
    return res.status(400).json({ error: 'Invalid quotation payload' });
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

  const existingIdx = localData.quotations.findIndex(q => q.id === quotation.id);
  if (existingIdx >= 0) {
    localData.quotations[existingIdx] = quotation;
  } else {
    localData.quotations.unshift(quotation);
  }

  const pIdx = localData.patients.findIndex(p => p.phone === quotation.patientPhone);
  if (pIdx >= 0) {
    localData.patients[pIdx].status = 'Quotation Created';
  }

  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      const itemsJson = JSON.stringify(quotation.items || []);
      await mysqlPool.execute(
        `INSERT INTO quotations (id, patientName, patientPhone, patientAge, patientGender, doctorName, totalAmount, discountAmount, netPayable, paymentType, status, items, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE patientName=?, patientPhone=?, patientAge=?, patientGender=?, doctorName=?, totalAmount=?, discountAmount=?, netPayable=?, paymentType=?, status=?, items=?`,
        [quotation.id, quotation.patientName, quotation.patientPhone, quotation.patientAge, quotation.patientGender, quotation.doctorName, quotation.totalAmount, quotation.discountAmount, quotation.netPayable, quotation.paymentType, quotation.status, itemsJson, quotation.createdAt || new Date().toISOString(),
         quotation.patientName, quotation.patientPhone, quotation.patientAge, quotation.patientGender, quotation.doctorName, quotation.totalAmount, quotation.discountAmount, quotation.netPayable, quotation.paymentType, quotation.status, itemsJson]
      );
      if (quotation.patientPhone) {
        await mysqlPool.execute('UPDATE patients SET status = ? WHERE phone = ?', ['Quotation Created', quotation.patientPhone]);
      }
    } catch (err) {
      console.error('MySQL quotation save error:', err);
    }
  }

  res.json({ message: 'Quotation saved successfully', quotation, quotations: localData.quotations });
});

app.delete('/api/quotations/:id', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const { id } = req.params;
  localData.quotations = localData.quotations.filter(q => q.id !== id);
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      await mysqlPool.execute('DELETE FROM quotations WHERE id = ?', [id]);
    } catch (err) {
      console.error('MySQL quotation delete error:', err);
    }
  }

  res.json({ message: 'Quotation deleted successfully', quotations: localData.quotations });
});

app.post('/api/quotations/delete', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No quotation IDs provided for deletion' });
  }

  const idSet = new Set(ids);
  localData.quotations = localData.quotations.filter(q => !idSet.has(q.id));
  saveLocalDb();

  if (isMySqlActive && mysqlPool) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      await mysqlPool.execute(`DELETE FROM quotations WHERE id IN (${placeholders})`, ids);
    } catch (err) {
      console.error('MySQL quotation batch delete error:', err);
    }
  }

  res.json({ message: `${ids.length} quotation(s) deleted successfully`, deletedCount: ids.length, quotations: localData.quotations });
});

// 6. Catalog API
app.get('/api/catalog', authenticateToken, requireRole('System Admin', 'Doctor', 'Billing Counter', 'Call Center'), async (req, res) => {
  if (isMySqlActive && mysqlPool) {
    try {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM catalog ORDER BY id ASC');
      if (rows.length > 0) {
        return res.json(rows);
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
    localData.catalog = catalog;
    saveLocalDb();

    if (isMySqlActive && mysqlPool) {
      try {
        await mysqlPool.execute('DELETE FROM catalog');
        for (const item of catalog) {
          await mysqlPool.execute(
            `INSERT INTO catalog (id, name, category, defaultPrice, defaultDiscountPercent, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [item.id, item.name, item.category, item.defaultPrice || 0, item.defaultDiscountPercent || 0, item.description || '']
          );
        }
      } catch (err) {
        console.error('MySQL catalog save error:', err);
      }
    }

    return res.json({ message: 'Catalog price updated successfully', catalog: localData.catalog });
  }
  res.status(400).json({ error: 'Invalid catalog data' });
});

// 7. System Admin Clear Demo Data API
app.post('/api/admin/clear-demo-data', authenticateToken, requireRole('System Admin'), async (req, res) => {
  try {
    // Remove demo patients pat-101, pat-102
    localData.patients = localData.patients.filter(p => p.id !== 'pat-101' && p.id !== 'pat-102');

    // Remove demo staff accounts, retain admin
    localData.users = localData.users.filter(u => u.username === 'admin' || (u.id !== 'usr-doctor' && u.id !== 'usr-callcenter' && u.id !== 'usr-billing'));
    if (!localData.users.some(u => u.username === 'admin')) {
      localData.users.unshift(ADMIN_USER_RECORD);
    }

    saveLocalDb();

    if (isMySqlActive && mysqlPool) {
      try {
        await mysqlPool.execute("DELETE FROM patients WHERE id IN ('pat-101', 'pat-102')");
        await mysqlPool.execute("DELETE FROM users WHERE id IN ('usr-doctor', 'usr-callcenter', 'usr-billing')");
      } catch (err) {
        console.error('MySQL clear demo error:', err);
      }
    }

    return res.json({
      message: 'Demo data cleared successfully. Only admin login credentials remain.',
      users: localData.users,
      patients: localData.patients
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear demo data: ' + err.message });
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
  await initDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SUO XI Hospital Billing System Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
