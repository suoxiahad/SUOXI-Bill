export interface Patient {
  id: string;
  serialNo?: string;
  name: string;
  phone: string;
  age?: number | string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  address?: string;
  doctorName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  department?: string;
  status: 'Pending Counseling' | 'Quotation Created' | 'Treatment Ongoing' | 'Completed';
  createdAt: string;
  notes?: string; // Remark / Disease / Medical Condition
  remark?: string;
}

export interface IndividualTreatment {
  id: string;
  treatmentName: string;
  unitCost: number; // Cost per session
  sessions: number; // Number of sessions
  discountPercent: number; // Discount percentage (%)
  discountAmount: number; // Discount amount
  totalCost: number; // Total cost
  isIndoorFree?: boolean;
}

export interface AdditionalTreatment {
  id: string;
  treatmentName: string;
  unitCost: number; // Cost per session
  sessions: number; // Number of sessions
  discountPercent: number; // Discount percentage (%)
  discountAmount: number; // Discount amount
  totalCost: number; // Total cost
  isRatioBased?: boolean; // If true, auto-calculates sessions based on treatmentDays ratio (e.g. 3 sessions per 10 days)
  sessionsPer10Days?: number; // e.g. 3
  description?: string;
  rateNote?: string;
}

export interface OutdoorPackage {
  id: string;
  packageType: '30_day' | '15_day' | 'daily' | 'custom' | string;
  packageName: string; // e.g. 30 Days Comprehensive Package
  totalBaseCost: number;
  discountPercent: number;
  discountAmount: number;
  netCost: number;
  description?: string;
}

export interface IndoorService {
  id: string;
  roomType: 'Single Cabin' | 'Sharing Cabin' | 'AC Ward' | 'Non AC Ward' | 'VIP Suite' | string;
  dailyRate: number; // Daily room rate
  days: number; // Number of days
  totalAmount: number; // Total amount
  remarks?: string;
}

export interface PaymentPhase {
  id: string;
  phaseName: string; // e.g. "1st 10-Days Counseling Payment", "2nd 10-Days Payment", "3rd 10-Days Payment"
  daysOrSessions?: number;
  amount: number;
  percentage?: number;
  isPaid?: boolean;
  notes?: string;
}

export interface InvoiceQuotation {
  id: string;
  quotationNumber: string; // e.g. SXH-2026-0001
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientAge?: string | number;
  patientGender?: string;
  doctorName?: string;
  createdDate: string;
  validUntil: string;
  visitNumber?: number;
  visitLabel?: string;
  patientTreatmentMode?: 'outdoor' | 'indoor' | 'individual';
  
  // Section 1: Individual Treatments
  treatments: IndividualTreatment[];
  treatmentsSubtotal: number;
  
  // Section 2: Outdoor Service Packages
  outdoorPackages: OutdoorPackage[];
  outdoorSubtotal: number;
  
  // Section 3: Indoor Accommodation
  indoorServices: IndoorService[];
  indoorSubtotal: number;

  // Section 4: Additional Treatments & Therapies
  additionalTreatments?: AdditionalTreatment[];
  additionalTreatmentsSubtotal?: number;

  // Additional Fees & Discounts
  admissionFee?: number;
  consultationFee?: number;
  investigationFee?: number;
  overallDiscountPercent: number;
  overallDiscountAmount: number;
  
  // Grand Summary
  grossTotal: number;
  grandTotal: number;
  advancePaid: number;
  dueAmount: number;
  
  // Payment Cycle / Installment Schedule
  paymentPlanMode?: 'full' | '10_day_cycles' | '15_day_cycles' | 'custom_phases';
  paymentPhases?: PaymentPhase[];

  paymentStatus: 'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid';
  notes?: string;
  createdBy: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: 'treatment' | 'outdoor_package' | 'indoor_room' | 'consultation' | 'additional_treatment';
  defaultPrice: number;
  defaultDiscountPercent?: number;
  description?: string;
  rateNote?: string;
  outdoorSessions?: number;
  indoorSessions?: number;
  isIndoorFree?: boolean;
  isRatioBased?: boolean;
  sessionsPer10Days?: number;
}

export type UserRole = 'System Admin' | 'Doctor' | 'Call Center';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  phone?: string;
  token?: string;
}

