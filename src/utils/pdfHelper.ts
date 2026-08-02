import { jsPDF } from 'jspdf';
import { Patient } from '../types';
import { getActiveUser } from './storage';

export interface ParsedPdfPatient {
  name: string;
  gender: string;
  age: string;
  phone: string;
  remark: string;
  notes?: string;
}

export interface ParsePdfResult {
  success: boolean;
  data: ParsedPdfPatient[];
  error?: string;
  totalFound: number;
}

/**
 * Uploads a PDF file to the backend API or parses it to extract:
 * Patient Name, Gender, Age, Phone Number, Remark (Disease)
 */
export async function parsePdfAppointmentFile(file: File): Promise<ParsePdfResult> {
  try {
    const formData = new FormData();
    formData.append('pdfFile', file);

    const user = getActiveUser();
    const headers: Record<string, string> = {};
    if (user && user.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }

    const response = await fetch('/api/patients/upload-pdf', {
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
        error: `Server response error (${response.status}). Please verify the PDF file format and size.`,
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
      error: result.error || 'Failed to process PDF file. Please ensure the PDF contains tabular text.',
      totalFound: 0,
    };
  } catch (err: any) {
    return {
      success: false,
      data: [],
      error: err.message || 'An error occurred while parsing the PDF file.',
      totalFound: 0,
    };
  }
}

/**
 * Generates a clean Sample Appointment PDF document for testing PDF upload.
 */
export function downloadSamplePdfTemplate(): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(6, 78, 59); // Emerald 900
  doc.rect(0, 0, 297, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SUO XI HOSPITAL - DAILY APPOINTMENT LIST', 14, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated for Daily Counseling & Patient Intake • Format: Name | Gender | Age | Phone | Remark (Disease)', 14, 22);

  // Table Headers
  const startY = 38;
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.rect(14, startY - 6, 269, 10, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // Slate 900

  doc.text('SL', 16, startY);
  doc.text('Patient Name', 30, startY);
  doc.text('Gender', 95, startY);
  doc.text('Age', 125, startY);
  doc.text('Phone Number', 150, startY);
  doc.text('Remark (Disease / Condition)', 200, startY);

  // Sample Rows Data
  const samplePatients = [
    { sl: '1', name: 'Md. Rafiqul Islam', gender: 'Male', age: '52', phone: '01711223344', remark: 'Severe L4-L5 Back Pain & Sciatica' },
    { sl: '2', name: 'Nazmun Nahar', gender: 'Female', age: '44', phone: '01819876543', remark: 'Stroke Rehab & Facial Palsy' },
    { sl: '3', name: 'Kabir Hossain', gender: 'Male', age: '60', phone: '01912345678', remark: 'Cervical Spondylosis & Neck Pain' },
    { sl: '4', name: 'Sultana Razia', gender: 'Female', age: '38', phone: '01678901234', remark: 'Knee Osteoarthritis & Joint Stiffness' },
    { sl: '5', name: 'Tariqul Alam', gender: 'Male', age: '49', phone: '01555667788', remark: 'Frozen Shoulder & Paralysis' },
    { sl: '6', name: 'Shirin Akter', gender: 'Female', age: '55', phone: '01300112233', remark: 'Lumbar Disc Herniation' }
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  let currentY = startY + 10;
  samplePatients.forEach((p, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, currentY - 5, 269, 9, 'F');
    }

    doc.setTextColor(30, 41, 59);
    doc.text(p.sl, 16, currentY);
    doc.text(p.name, 30, currentY);
    doc.text(p.gender, 95, currentY);
    doc.text(p.age, 125, currentY);
    doc.text(p.phone, 150, currentY);
    doc.text(p.remark, 200, currentY);

    currentY += 9;
  });

  // Footer Note
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('* Import this PDF into SUO XI Hospital Billing System under Appointments tab.', 14, currentY + 12);

  doc.save('SUO_XI_Hospital_Daily_Appointments_Sample.pdf');
}
