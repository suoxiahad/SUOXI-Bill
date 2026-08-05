import * as XLSX from 'xlsx';
import { getActiveUser } from './storage';

export interface ParsedExcelPatient {
  serialNo?: string;
  name: string;
  gender: string;
  age: string;
  phone: string;
  remark: string;
  notes?: string;
  doctorName?: string;
  appointmentDate?: string;
}

export interface ParseExcelResult {
  success: boolean;
  data: ParsedExcelPatient[];
  error?: string;
  totalFound: number;
}

/**
 * Parses an uploaded Excel (.xlsx, .xls, .csv) appointment file.
 */
export async function parseExcelAppointmentFile(file: File): Promise<ParseExcelResult> {
  try {
    const dataBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(dataBuffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        success: false,
        data: [],
        error: 'The uploaded Excel file contains no readable sheets.',
        totalFound: 0,
      };
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to 2D Array matrix for flexible header & row detection
    const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

    if (!matrix || matrix.length === 0) {
      return {
        success: false,
        data: [],
        error: 'The uploaded Excel sheet appears to be empty.',
        totalFound: 0,
      };
    }

    const patients = parseExcelMatrixData(matrix);

    if (patients.length === 0) {
      // Backend API fallback check
      return await parseExcelViaBackend(file);
    }

    return {
      success: true,
      data: patients,
      totalFound: patients.length,
    };
  } catch (err: any) {
    console.warn('Local Excel parse error, attempting backend API fallback:', err);
    return await parseExcelViaBackend(file);
  }
}

/**
 * Universal 2D Matrix parser for hospital call-center spreadsheets.
 * Handles title banners, merged headers, Bengali/English column titles, and varying column positions.
 */
export function parseExcelMatrixData(matrix: any[][]): ParsedExcelPatient[] {
  let headerRowIdx = -1;
  let maxScore = 0;

  // Scan the top 25 rows to detect the Header Row dynamically
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

  const extracted: ParsedExcelPatient[] = [];
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
    let doctorName = '';
    let appointmentDate = '';

    // Cell-level heuristic scan if any essential column was missed
    row.forEach((cell, cIdx) => {
      const val = String(cell || '').trim();
      if (!val) return;

      // Detect Phone Number
      const cleanedCellStr = val.replace(/[\s\-\(\)\.]/g, '');
      const pMatch = val.match(/(?:\+?880|880|0)?1[3-9]\d{8}\b/) || cleanedCellStr.match(/(?:\+?880|880|0)?1[3-9]\d{8}\b/);
      if (pMatch && !phone) {
        phone = pMatch[0];
      }

      // Detect Gender
      if (!gender) {
        const gMatch = val.match(/\b(FEMALE|MALE|Female|Male|F|M|নারী|পুরুষ)\b/i);
        if (gMatch && !/patient|doctor|department/i.test(val)) {
          const gUpper = gMatch[1].toUpperCase();
          if (gUpper.startsWith('F') || gUpper.includes('নারী')) gender = 'Female';
          else if (gUpper.startsWith('M') || gUpper.includes('পুরুষ')) gender = 'Male';
        }
      }

      // Detect Age (1-115)
      if (!age && cIdx !== phoneCol && cIdx !== nameCol) {
        const aMatch = val.match(/\b(\d{1,3})\s*(?:yrs|years|y|y\.o|y\/o|y\.|বছর)?\b/i);
        if (aMatch) {
          const num = parseInt(aMatch[1], 10);
          if (num >= 1 && num <= 115) {
            age = String(num);
          }
        }
      }

      // Detect Patient Name fallback
      if (!name && cIdx !== phoneCol && cIdx !== ageCol && cIdx !== remarkCol && cIdx !== genderCol && cIdx !== serialCol) {
        const isNumeric = /^\d+$/.test(val);
        const isPhone = /(?:\+?880|880|0)?1[3-9]\d{8}/.test(cleanedCellStr);
        const isKeywords = /male|female|new patient|followup|robin|alamin|rakibul|completed|pending|cancel/i.test(val);
        if (val.length >= 2 && !isNumeric && !isPhone && !isKeywords) {
          name = val;
        }
      }

      // Detect Disease / Remark fallback
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

    // Clean and normalize extracted phone number
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        if (digits.startsWith('8801')) phone = '0' + digits.substring(3);
        else if (digits.startsWith('1') && digits.length === 10) phone = '0' + digits;
        else if (digits.startsWith('01')) phone = digits.substring(0, 11);
      }
    }

    // Clean patient name
    if (name) {
      name = name
        .replace(/^\d+[\.\-\s]*/, '') // remove leading serial number e.g. '1. ', '1 '
        .replace(/\b(female|male|f|m)\b/gi, '') // remove trailing or embedded gender keyword
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Smart Gender Inference from Name if missing
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

    // Normalize age
    if (age) {
      const aMatch = age.match(/(\d{1,3})/);
      age = aMatch ? aMatch[1] : age;
    }

    if (name || phone) {
      const finalName = name || (phone ? `Patient ${phone}` : `Patient #${extracted.length + 1}`);
      const finalPhone = phone || '01700000000';

      let cleanSerial = '';
      if (rawSerial) {
        const match = rawSerial.match(/\b\d+\b/);
        if (match) cleanSerial = match[0];
      }
      if (!cleanSerial) {
        cleanSerial = String(extracted.length + 1);
      }

      extracted.push({
        serialNo: cleanSerial,
        name: finalName,
        gender: gender || 'Male',
        age: age || '',
        phone: finalPhone,
        remark: remark || 'General Assessment',
        doctorName: doctorName || 'Senior Counseling Doctor',
        appointmentDate: appointmentDate || new Date().toISOString().split('T')[0],
      });
    }
  }

  return extracted;
}

async function parseExcelViaBackend(file: File): Promise<ParseExcelResult> {
  try {
    const formData = new FormData();
    formData.append('excelFile', file);

    const user = getActiveUser();
    const headers: Record<string, string> = {};
    if (user && user.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }

    const response = await fetch('/api/patients/upload-excel', {
      method: 'POST',
      headers,
      body: formData,
    });

    const responseText = await response.text();
    let result: any = {};
    try {
      result = JSON.parse(responseText);
    } catch {
      return {
        success: false,
        data: [],
        error: `Server response error (${response.status}). Please verify the Excel file format.`,
        totalFound: 0,
      };
    }

    if (response.ok && result.success && Array.isArray(result.patients)) {
      return {
        success: true,
        data: result.patients,
        totalFound: result.patients.length,
      };
    }

    return {
      success: false,
      data: [],
      error: result.error || 'Failed to parse Excel records. Please check the file format or download the sample Excel template.',
      totalFound: 0,
    };
  } catch (err: any) {
    return {
      success: false,
      data: [],
      error: err.message || 'Error processing Excel file upload.',
      totalFound: 0,
    };
  }
}

/**
 * Generates and downloads a clean Sample Excel (.xlsx) file for testing upload.
 */
export function downloadSampleExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  const samplePatients = [
    {
      'Serial No.': 1,
      'Patient Name': 'Md. Rafiqul Islam',
      'Age': 52,
      'Contact Number': '01711223344',
      'Disease Name': 'Severe L4-L5 Back Pain & Sciatica',
    },
    {
      'Serial No.': 2,
      'Patient Name': 'Nazmun Nahar',
      'Age': 44,
      'Contact Number': '01819876543',
      'Disease Name': 'Stroke Rehab & Facial Palsy',
    },
    {
      'Serial No.': 3,
      'Patient Name': 'Kabir Hossain',
      'Age': 60,
      'Contact Number': '01912345678',
      'Disease Name': 'Cervical Spondylosis & Neck Pain',
    },
    {
      'Serial No.': 4,
      'Patient Name': 'Sultana Razia',
      'Age': 38,
      'Contact Number': '01678901234',
      'Disease Name': 'Knee Osteoarthritis & Joint Stiffness',
    },
    {
      'Serial No.': 5,
      'Patient Name': 'Tariqul Alam',
      'Age': 49,
      'Contact Number': '01555667788',
      'Disease Name': 'Frozen Shoulder & Paralysis Care',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(samplePatients);

  // Auto-fit column widths
  ws['!cols'] = [
    { wch: 12 }, // Serial No.
    { wch: 26 }, // Patient Name
    { wch: 8 },  // Age
    { wch: 18 }, // Contact Number
    { wch: 40 }, // Disease Name
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Daily Appointments');

  // Trigger browser file download
  XLSX.writeFile(wb, 'SUO_XI_Hospital_Daily_Appointments_Sample.xlsx');
}
