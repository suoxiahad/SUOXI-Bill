import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Calculator, 
  Printer, 
  Save, 
  UserSearch, 
  Stethoscope, 
  FileCheck,
  Sparkles,
  Search,
  CheckSquare,
  Activity,
  Scale,
  Eye,
  EyeOff,
  Calendar,
  CreditCard,
  Clock,
  ChevronDown,
  ChevronUp,
  Lock,
  Users,
  PhoneCall,
  X,
  Check
} from 'lucide-react';
import { PackageComparisonModal } from './PackageComparisonModal';
import { 
  Patient, 
  IndividualTreatment, 
  AdditionalTreatment,
  OutdoorPackage, 
  IndoorService, 
  InvoiceQuotation, 
  PaymentPhase,
  CatalogItem,
  User 
} from '../types';
import { searchPatientsLiveApi, fetchPatientsApi } from '../utils/storage';
import { matchPatient, matchSearchQuery, normalizePhoneDigits, normalizeSearchText } from '../utils/searchHelper';

interface TreatmentListItem {
  id: string;
  catalogId?: string;
  selected: boolean;
  treatmentName: string;
  unitCost: number;
  sessions: number | '';
  outdoorSessions?: number;
  indoorSessions?: number;
  discountPercent: number | '';
  discountAmount: number;
  totalCost: number;
  description?: string;
  rateNote?: string;
  isCustom?: boolean;
  isIndoorFree?: boolean;
  fixedDiscountAmount?: number;
  outdoorDiscountPercent?: number;
  outdoorDiscountAmount?: number;
  defaultDiscountPercent?: number;
}

interface AdditionalTreatmentListItem {
  id: string;
  catalogId?: string;
  selected: boolean;
  treatmentName: string;
  unitCost: number;
  sessions: number | '';
  outdoorSessions?: number;
  indoorSessions?: number;
  discountPercent: number | '';
  discountAmount: number;
  totalCost: number;
  description?: string;
  rateNote?: string;
  isCustom?: boolean;
  isIndoorFree?: boolean;
  isRatioBased?: boolean;
  sessionsPer10Days?: number;
  fixedDiscountAmount?: number;
  outdoorDiscountPercent?: number;
  outdoorDiscountAmount?: number;
  defaultDiscountPercent?: number;
}

interface OutdoorPackageListItem {
  id: string;
  catalogId?: string;
  selected: boolean;
  packageName: string;
  packageType: string;
  totalBaseCost: number | '';
  discountPercent: number | '';
  discountAmount: number;
  netCost: number;
  description?: string;
  rateNote?: string;
  isCustom?: boolean;
}

interface IndoorServiceListItem {
  id: string;
  catalogId?: string;
  selected: boolean;
  roomType: string;
  dailyRate: number;
  days: number | '';
  totalAmount: number;
  remarks?: string;
  rateNote?: string;
  isCustom?: boolean;
}

interface QuotationBuilderProps {
  initialPatient?: Patient | null;
  patients: Patient[];
  quotations?: InvoiceQuotation[];
  catalog: CatalogItem[];
  currentUser?: User | null;
  editingQuotation?: InvoiceQuotation | null;
  onCancelEdit?: () => void;
  onSaveQuotation: (quotation: InvoiceQuotation) => void;
  onPreviewPrint: (quotation: InvoiceQuotation) => void;
  showFullTreatmentCalculation?: boolean;
  setShowFullTreatmentCalculation?: React.Dispatch<React.SetStateAction<boolean>>;
  showFullIndoorCalculation?: boolean;
  setShowFullIndoorCalculation?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const QuotationBuilder: React.FC<QuotationBuilderProps> = ({
  initialPatient,
  patients,
  quotations = [],
  catalog,
  currentUser,
  editingQuotation,
  onCancelEdit,
  onSaveQuotation,
  onPreviewPrint,
  showFullTreatmentCalculation: externalShowFullTreatmentCalculation,
  setShowFullTreatmentCalculation: externalSetShowFullTreatmentCalculation,
  showFullIndoorCalculation: externalShowFullIndoorCalculation,
  setShowFullIndoorCalculation: externalSetShowFullIndoorCalculation,
}) => {
  // Search patient by phone inside builder
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatient || null);

  // Consulting / Billing Doctor Name
  const [billingDoctor, setBillingDoctor] = useState(
    currentUser?.name || initialPatient?.doctorName || 'Dr. S.M. Shahidul Islam PhD'
  );

  // Sync if initialPatient or currentUser changes
  useEffect(() => {
    if (initialPatient && !editingQuotation) {
      setSelectedPatient(initialPatient);
      setPhoneSearch(initialPatient.phone);
    }
  }, [initialPatient, editingQuotation]);

  useEffect(() => {
    if (currentUser?.name && !editingQuotation) {
      setBillingDoctor(currentUser.name);
    } else if (selectedPatient?.doctorName && !editingQuotation) {
      setBillingDoctor(selectedPatient.doctorName);
    }
  }, [currentUser, selectedPatient, editingQuotation]);

  // Load editing quotation when passed
  useEffect(() => {
    if (!editingQuotation) return;

    // Find or reconstruct patient
    const foundPatient = patients.find(
      p => (editingQuotation.patientPhone && p.phone === editingQuotation.patientPhone) ||
           (editingQuotation.patientId && p.id === editingQuotation.patientId)
    ) || {
      id: editingQuotation.patientId || `patient-${Date.now()}`,
      name: editingQuotation.patientName || 'Walk-in Patient',
      phone: editingQuotation.patientPhone || '01700000000',
      age: editingQuotation.patientAge || 0,
      gender: editingQuotation.patientGender || 'Male',
      doctorName: editingQuotation.doctorName || 'Dr. S.M. Shahidul Islam PhD',
      status: 'Consulted',
      serialNumber: 1,
      appointmentTime: '',
      department: 'Acupuncture'
    };

    setSelectedPatient(foundPatient);
    setPhoneSearch(foundPatient.phone || '');
    if (editingQuotation.doctorName) {
      setBillingDoctor(editingQuotation.doctorName);
    }

    const mode = editingQuotation.patientTreatmentMode || (editingQuotation.indoorServices && editingQuotation.indoorServices.length > 0 ? 'indoor' : (editingQuotation.outdoorPackages && editingQuotation.outdoorPackages.length > 0 ? 'outdoor' : ''));
    setPatientTreatmentMode(mode);
    if (mode === 'indoor') {
      setIsIndoorSectionOpen(true);
      setIsOutdoorSectionOpen(false);
    } else if (mode === 'outdoor') {
      setIsIndoorSectionOpen(false);
      setIsOutdoorSectionOpen(true);
    }

    // Set fees & discounts
    setIncludeAdmissionFee((editingQuotation.admissionFee || 0) > 0);
    setAdmissionFee(editingQuotation.admissionFee || 1000);
    setOverallDiscountPercent(editingQuotation.overallDiscountPercent || '');
    setAdvancePaid(editingQuotation.advancePaid || '');
    setNotes(editingQuotation.notes || '');
    if (editingQuotation.paymentPlanMode) {
      setPaymentPlanMode(editingQuotation.paymentPlanMode);
    }
    if (editingQuotation.paymentPhases && editingQuotation.paymentPhases.length > 0) {
      setPaymentPhases(editingQuotation.paymentPhases);
    }
    if (editingQuotation.packageComparison) {
      setSavedComparisonSnapshot(editingQuotation.packageComparison);
    }

    // Populate Section 1: Treatments
    const invoiceTreatmentsMap = new Map((editingQuotation.treatments || []).map(t => [t.treatmentName.toLowerCase().trim(), t]));
    setTreatmentList(prev => prev.map(item => {
      const match = invoiceTreatmentsMap.get(item.treatmentName.toLowerCase().trim()) ||
                    (item.catalogId ? (editingQuotation.treatments || []).find(t => t.id === item.id || t.id === item.catalogId) : undefined);
      if (match) {
        return {
          ...item,
          selected: true,
          unitCost: match.unitCost || item.unitCost,
          sessions: match.sessions,
          discountPercent: match.discountPercent,
          discountAmount: match.discountAmount,
          totalCost: match.totalCost
        };
      }
      return {
        ...item,
        selected: false,
        sessions: '',
        discountPercent: '',
        discountAmount: 0,
        totalCost: 0
      };
    }));

    // Populate Section 3: Outdoor Packages
    const invoiceOutdoorMap = new Map((editingQuotation.outdoorPackages || []).map(p => [p.packageName.toLowerCase().trim(), p]));
    setOutdoorPackageList(prev => prev.map(item => {
      const match = invoiceOutdoorMap.get(item.packageName.toLowerCase().trim()) ||
                    (item.catalogId ? (editingQuotation.outdoorPackages || []).find(p => p.id === item.id || p.id === item.catalogId) : undefined);
      if (match) {
        return {
          ...item,
          selected: true,
          totalBaseCost: match.totalBaseCost,
          discountPercent: match.discountPercent,
          discountAmount: match.discountAmount,
          netCost: match.netCost
        };
      }
      return {
        ...item,
        selected: false,
        discountPercent: '',
        discountAmount: 0,
        netCost: 0
      };
    }));

    // Populate Section 4: Indoor Services & Food Charge
    const invoiceIndoor = editingQuotation.indoorServices || [];
    const foodItem = invoiceIndoor.find(i => i.id === 'food-charge-3x' || i.roomType.toLowerCase().includes('food charge'));
    if (foodItem) {
      setFoodChargeSelected(true);
      setFoodChargePerDay(foodItem.dailyRate || 500);
      setFoodChargeDays(foodItem.days || 30);
    } else {
      setFoodChargeSelected(false);
      setFoodChargeDays('');
    }

    const nonFoodIndoor = invoiceIndoor.filter(i => i.id !== 'food-charge-3x' && !i.roomType.toLowerCase().includes('food charge'));
    const indoorMap = new Map(nonFoodIndoor.map(i => [i.roomType.toLowerCase().trim(), i]));
    setIndoorServiceList(prev => prev.map(item => {
      const match = indoorMap.get(item.roomType.toLowerCase().trim()) ||
                    (item.catalogId ? nonFoodIndoor.find(i => i.id === item.id || i.id === item.catalogId) : undefined);
      if (match) {
        return {
          ...item,
          selected: true,
          dailyRate: match.dailyRate || item.dailyRate,
          days: match.days,
          totalAmount: match.totalAmount
        };
      }
      return {
        ...item,
        selected: false,
        days: '',
        totalAmount: 0
      };
    }));

    // Populate Section 5: Weekly Treatments
    const invoiceAddlMap = new Map((editingQuotation.additionalTreatments || []).map(a => [a.treatmentName.toLowerCase().trim(), a]));
    setAdditionalTreatmentList(prev => prev.map(item => {
      const match = invoiceAddlMap.get(item.treatmentName.toLowerCase().trim()) ||
                    (item.catalogId ? (editingQuotation.additionalTreatments || []).find(a => a.id === item.id || a.id === item.catalogId) : undefined);
      if (match) {
        return {
          ...item,
          selected: true,
          unitCost: match.unitCost || item.unitCost,
          sessions: match.sessions,
          discountPercent: match.discountPercent,
          discountAmount: match.discountAmount,
          totalCost: match.totalCost
        };
      }
      return {
        ...item,
        selected: false,
        sessions: '',
        discountPercent: '',
        discountAmount: 0,
        totalCost: 0
      };
    }));
  }, [editingQuotation]);

  // Unified list of all known patients (combining Intake Appointments + Quotation History)
  const allKnownPatients = useMemo<Patient[]>(() => {
    const map = new Map<string, Patient>();

    (patients || []).forEach(p => {
      if (p) {
        const phoneNorm = normalizePhoneDigits(p.phone);
        const nameNorm = normalizeSearchText(p.name);
        const key = p.id || `${nameNorm}__${phoneNorm}`;
        map.set(key, p);
      }
    });

    (quotations || []).forEach(q => {
      if (q && (q.patientName || q.patientPhone)) {
        const phoneNorm = normalizePhoneDigits(q.patientPhone);
        const nameNorm = normalizeSearchText(q.patientName);
        const key = `${nameNorm}__${phoneNorm}`;
        if (!map.has(key)) {
          map.set(key, {
            id: q.patientId || `pat-history-${q.id}`,
            name: q.patientName,
            phone: q.patientPhone || '',
            age: q.patientAge,
            gender: q.patientGender,
            doctorName: q.doctorName,
            status: 'Quotation Created',
            createdAt: q.createdDate || new Date().toISOString(),
            notes: q.notes || ''
          });
        }
      }
    });

    return Array.from(map.values());
  }, [patients, quotations]);

  // Handle Patient Phone/Name Search & Dropdown State
  const [matchingPatients, setMatchingPatients] = useState<Patient[]>([]);
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState<boolean>(false);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const searchDebounceTimer = useRef<any>(null);

  const handlePatientSearchChange = (val: string) => {
    setPhoneSearch(val);
    if (!val || !val.trim()) {
      setMatchingPatients([]);
      setIsPatientDropdownOpen(false);
      return;
    }

    // 1. Instant local search
    const localMatches = allKnownPatients.filter(p => matchPatient(val, p));
    setMatchingPatients(localMatches);
    setIsPatientDropdownOpen(localMatches.length > 0);

    // 2. Debounced background live server search for newly imported patients
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    if (val.trim().length >= 3) {
      searchDebounceTimer.current = setTimeout(async () => {
        try {
          const liveResults = await searchPatientsLiveApi(val);
          if (Array.isArray(liveResults) && liveResults.length > 0) {
            setMatchingPatients(prev => {
              const map = new Map<string, Patient>();
              prev.forEach(p => map.set(p.id || p.phone, p));
              liveResults.forEach(p => map.set(p.id || p.phone, p));
              const combined = Array.from(map.values()).filter(p => matchPatient(val, p));
              setIsPatientDropdownOpen(combined.length > 0);
              return combined;
            });
          }
        } catch {
          // ignore
        }
      }, 300);
    }
  };

  const handleSelectPatient = (pat: Patient) => {
    setSelectedPatient(pat);
    setPhoneSearch(pat.phone);
    if (pat.doctorName) {
      setBillingDoctor(pat.doctorName);
    }
    setIsPatientDropdownOpen(false);
  };

  const handlePhoneSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneSearch || !phoneSearch.trim()) {
      alert('Please enter a mobile number or patient name.');
      return;
    }

    setIsSearchingLive(true);

    // 1. Check local known list
    let matched = allKnownPatients.filter(p => matchPatient(phoneSearch, p));

    // 2. If not found or if user explicitly clicked search, query live backend
    if (matched.length === 0) {
      try {
        const liveResults = await searchPatientsLiveApi(phoneSearch);
        if (Array.isArray(liveResults) && liveResults.length > 0) {
          matched = liveResults;
        } else {
          // Try fetching fresh full list
          const fullList = await fetchPatientsApi();
          matched = (fullList || []).filter(p => matchPatient(phoneSearch, p));
        }
      } catch (err) {
        console.warn('Live search error:', err);
      }
    }

    setIsSearchingLive(false);
    setMatchingPatients(matched);

    if (matched.length === 1) {
      handleSelectPatient(matched[0]);
    } else if (matched.length > 1) {
      setIsPatientDropdownOpen(true);
    } else {
      setIsPatientDropdownOpen(false);
      alert(`No patient record found matching "${phoneSearch}". Please check the phone number or ask Call Center / Admin to register the patient.`);
    }
  };

  // Section 1: Treatment List with Checkboxes
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [treatmentList, setTreatmentList] = useState<TreatmentListItem[]>([]);
  const [patientTreatmentMode, setPatientTreatmentMode] = useState<'outdoor' | 'indoor' | ''>('');
  const [treatmentPackage, setTreatmentPackage] = useState<'30 Days' | '15 Days' | 'Per Day' | ''>('');
  const [treatmentDays, setTreatmentDays] = useState<number | ''>('');
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number | ''>('');
  const [internalShowFullTreatmentCalculation, internalSetShowFullTreatmentCalculation] = useState<boolean>(false);
  const [internalShowFullIndoorCalculation, internalSetShowFullIndoorCalculation] = useState<boolean>(false);

  const showFullTreatmentCalculation = externalShowFullTreatmentCalculation !== undefined ? externalShowFullTreatmentCalculation : internalShowFullTreatmentCalculation;
  const setShowFullTreatmentCalculation = externalSetShowFullTreatmentCalculation || internalSetShowFullTreatmentCalculation;

  const showFullIndoorCalculation = externalShowFullIndoorCalculation !== undefined ? externalShowFullIndoorCalculation : internalShowFullIndoorCalculation;
  const setShowFullIndoorCalculation = externalSetShowFullIndoorCalculation || internalSetShowFullIndoorCalculation;

  const [isIndoorSectionOpen, setIsIndoorSectionOpen] = useState<boolean>(true);
  const [isOutdoorSectionOpen, setIsOutdoorSectionOpen] = useState<boolean>(true);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [savedComparisonSnapshot, setSavedComparisonSnapshot] = useState<{
    showOutdoor?: boolean;
    showIndoor?: boolean;
    customDays?: Record<string, number>;
    customDiscounts?: Record<string, number>;
    foodChargeSelected?: boolean;
    foodChargePerDay?: number;
    includeAdmissionFee?: boolean;
    admissionFee?: number;
    comparedAt?: string;
  } | null>(null);

  const toggleIndoorCalculationMode = () => {
    setShowFullIndoorCalculation(prev => !prev);
  };

  const recalculateTreatmentList = (
    fullCourseMode: boolean,
    daysVal: number | '' = treatmentDays,
    discVal: number | '' = bulkDiscountPercent,
    modeVal: 'outdoor' | 'indoor' | '' = patientTreatmentMode
  ) => {
    const numDays = (daysVal !== '' && Number(daysVal) > 0) ? Number(daysVal) : 0;
    const discPct = (discVal !== '' && !isNaN(Number(discVal))) ? Number(discVal) : 0;
    const calcDays = fullCourseMode ? (numDays > 0 ? numDays : 1) : 1;

    setTreatmentList(prev => prev.map(item => {
      if (!item.selected || modeVal === '') {
        return {
          ...item,
          sessions: '',
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      }

      const dailySessions = modeVal === 'outdoor'
        ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
        : (item.indoorSessions !== undefined ? item.indoorSessions : 1);

      const computedSessions = dailySessions * calcDays;
      const unitCost = Number(item.unitCost) || 0;
      const sessionsNum = Number(computedSessions) || 0;
      const gross = unitCost * sessionsNum;

      let effectiveDiscPct: number | '' = discVal !== '' ? discVal : item.discountPercent;
      let discountAmount = 0;

      if (modeVal === 'indoor' && item.isIndoorFree) {
        effectiveDiscPct = 100;
        discountAmount = gross;
      } else if (modeVal === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
        effectiveDiscPct = Number(item.outdoorDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else if (modeVal === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
        discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
        const fixedVal = Number(item.fixedDiscountAmount);
        discountAmount = Math.min(gross, fixedVal * sessionsNum);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
        effectiveDiscPct = Number(item.defaultDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else {
        const pctNum = effectiveDiscPct !== '' ? Number(effectiveDiscPct) : 0;
        discountAmount = Math.round((gross * pctNum) / 100);
      }

      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        sessions: computedSessions,
        discountPercent: effectiveDiscPct,
        discountAmount,
        totalCost
      };
    }));
  };

  const toggleTreatmentCalculationMode = () => {
    setShowFullTreatmentCalculation(prev => !prev);
  };

  useEffect(() => {
    recalculateTreatmentList(showFullTreatmentCalculation);
  }, [showFullTreatmentCalculation]);

  const handleApplyPackageFromComparison = (
    patientType: 'outdoor' | 'indoor',
    packageType: '30 Days' | '15 Days' | 'Per Day',
    days: number | '',
    discount: number,
    indoorOptions?: {
      selectedRoomId?: string;
      foodSelected?: boolean;
      foodPerDay?: number;
      admissionSelected?: boolean;
      admissionFee?: number;
    }
  ) => {
    setPatientTreatmentMode(patientType);
    updateDaysAndDiscount(days, discount, packageType, patientType);

    if (patientType === 'indoor' && indoorOptions) {
      if (indoorOptions.selectedRoomId !== undefined) {
        setIndoorServiceList(prev => prev.map(item => {
          if (item.id === indoorOptions.selectedRoomId) {
            const dailyRate = Number(item.dailyRate) || 0;
            const numDays = (days !== '' && Number(days) > 0) ? Number(days) : 0;
            return {
              ...item,
              selected: true,
              days: numDays > 0 ? numDays : '',
              totalAmount: numDays * dailyRate
            };
          } else {
            return {
              ...item,
              selected: false,
              days: '',
              totalAmount: 0
            };
          }
        }));
      }

      if (indoorOptions.foodSelected !== undefined) {
        setFoodChargeSelected(indoorOptions.foodSelected);
        if (indoorOptions.foodSelected) {
          setFoodChargePerDay(indoorOptions.foodPerDay || 500);
          setFoodChargeDays(days);
        } else {
          setFoodChargeDays('');
        }
      }

      if (indoorOptions.admissionSelected !== undefined) {
        setIncludeAdmissionFee(indoorOptions.admissionSelected);
        if (indoorOptions.admissionFee !== undefined) {
          setAdmissionFee(indoorOptions.admissionFee);
        }
      }
    }
  };

  const updateDaysAndDiscount = (
    newDays: number | '',
    newDiscount: number | '',
    newPackage?: '30 Days' | '15 Days' | 'Per Day' | '',
    targetMode: 'outdoor' | 'indoor' | '' = patientTreatmentMode
  ) => {
    setTreatmentDays(newDays);
    setBulkDiscountPercent(newDiscount);
    if (newPackage !== undefined) {
      setTreatmentPackage(newPackage);
    }

    const numDays = (newDays !== '' && Number(newDays) > 0) ? Number(newDays) : 0;
    const discPct = (newDiscount !== '' && !isNaN(Number(newDiscount))) ? Number(newDiscount) : 0;

    if (foodChargeSelected) {
      setFoodChargeDays(numDays > 0 ? numDays : '');
    }

    const calcDays = showFullTreatmentCalculation ? (numDays > 0 ? numDays : 1) : 1;

    setTreatmentList(prev => prev.map(item => {
      if (!item.selected || targetMode === '') {
        return {
          ...item,
          sessions: '',
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      }

      const dailySessions = targetMode === 'outdoor'
        ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
        : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
      
      const computedSessions = dailySessions * calcDays;
      const unitCost = Number(item.unitCost) || 0;
      const sessionsNum = Number(computedSessions) || 0;
      const gross = unitCost * sessionsNum;

      let effectiveDiscPct = discPct;
      let discountAmount = 0;

      if (targetMode === 'indoor' && item.isIndoorFree) {
        effectiveDiscPct = 100;
        discountAmount = gross;
      } else if (targetMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
        effectiveDiscPct = Number(item.outdoorDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else if (targetMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
        discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
        const fixedVal = Number(item.fixedDiscountAmount);
        discountAmount = Math.min(gross, fixedVal * sessionsNum);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
        effectiveDiscPct = Number(item.defaultDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else {
        const pctNum = Number(effectiveDiscPct) || 0;
        discountAmount = Math.round((gross * pctNum) / 100);
      }

      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        sessions: computedSessions,
        discountPercent: effectiveDiscPct,
        discountAmount,
        totalCost
      };
    }));

    setIndoorServiceList(prev => prev.map(item => {
      if (!item.selected) {
        return {
          ...item,
          days: '',
          totalAmount: 0
        };
      }
      const dailyRate = Number(item.dailyRate) || 0;
      return {
        ...item,
        days: numDays > 0 ? numDays : '',
        totalAmount: numDays > 0 ? dailyRate * numDays : 0
      };
    }));

    setOutdoorPackageList(prev => prev.map(item => {
      if (item.catalogId === 'outdoor_package_single') {
        if (targetMode === 'outdoor' && numDays > 0) {
          return {
            ...item,
            packageName: `${numDays} Day Package`
          };
        } else {
          return {
            ...item,
            packageName: '...-Day Package',
            selected: false,
            totalBaseCost: '',
            discountPercent: '',
            discountAmount: 0,
            netCost: 0
          };
        }
      }
      return item;
    }));
  };

  const handlePackageSelect = (pkg: '30 Days' | '15 Days' | 'Per Day') => {
    let daysVal: number | '' = '';
    let discountVal: number | '' = bulkDiscountPercent;

    if (pkg === '30 Days') {
      daysVal = 30;
      if (patientTreatmentMode === 'outdoor') {
        discountVal = 35;
      } else if (patientTreatmentMode === 'indoor') {
        discountVal = 30;
      }
    } else if (pkg === '15 Days') {
      daysVal = 15;
      if (patientTreatmentMode === 'outdoor') {
        discountVal = 25;
      } else if (patientTreatmentMode === 'indoor') {
        discountVal = 30;
      }
    } else if (pkg === 'Per Day') {
      daysVal = ''; // Default empty for Per Day package
      if (patientTreatmentMode === 'outdoor') {
        discountVal = 0;
      } else if (patientTreatmentMode === 'indoor') {
        discountVal = 30;
      }
    }

    updateDaysAndDiscount(daysVal, discountVal, pkg);
  };

  const handlePerDayDaysInputChange = (newDays: number | '') => {
    let discountVal: number | '' = bulkDiscountPercent;
    if (patientTreatmentMode === 'outdoor') {
      discountVal = 0;
    } else if (patientTreatmentMode === 'indoor') {
      discountVal = 30;
    }
    updateDaysAndDiscount(newDays, discountVal, 'Per Day');
  };

  const handleBulkDiscountChange = (newVal: number | '') => {
    setBulkDiscountPercent(newVal);
    setTreatmentList(prev => prev.map(item => {
      if (!item.selected) {
        return {
          ...item,
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      }

      const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
      const isOutdoorDisc = patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0;
      const isOutdoorAmt = patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0;
      const isFixedAmt = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;
      const isFixedPct = item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0;

      const unitCost = Number(item.unitCost) || 0;
      const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
      const gross = unitCost * sessions;

      let effectiveDiscPct = newVal;
      let discountAmount = 0;

      if (isIndoorFree) {
        effectiveDiscPct = 100;
        discountAmount = gross;
      } else if (isOutdoorDisc) {
        effectiveDiscPct = Number(item.outdoorDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else if (isOutdoorAmt) {
        discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessions);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (isFixedAmt) {
        const fixedVal = Number(item.fixedDiscountAmount);
        discountAmount = Math.min(gross, fixedVal * sessions);
        effectiveDiscPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else if (isFixedPct) {
        effectiveDiscPct = Number(item.defaultDiscountPercent);
        discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      } else {
        const discPct = newVal === '' ? 0 : Number(newVal);
        discountAmount = Math.round((gross * discPct) / 100);
      }

      const totalCost = Math.max(0, gross - discountAmount);
      return {
        ...item,
        discountPercent: effectiveDiscPct,
        discountAmount,
        totalCost
      };
    }));
  };

  const handlePatientModeChange = (newMode: 'outdoor' | 'indoor' | '') => {
    setPatientTreatmentMode(newMode);

    if (newMode === 'outdoor') {
      setIsIndoorSectionOpen(false);
      setIsOutdoorSectionOpen(true);
      setIncludeAdmissionFee(false);
      setFoodChargeSelected(false);
      setFoodChargeDays('');
      setIndoorServiceList(prev => prev.map(item => ({
        ...item,
        selected: false,
        days: '',
        totalAmount: 0
      })));
    } else if (newMode === 'indoor') {
      setIsIndoorSectionOpen(true);
      setIsOutdoorSectionOpen(false);
      setOutdoorPackageList(prev => prev.map(item => ({
        ...item,
        selected: false
      })));
    } else {
      setIsOutdoorSectionOpen(true);
      setIsIndoorSectionOpen(true);
    }

    if (newMode === '') {
      setTreatmentPackage('');
      setTreatmentDays('');
      setBulkDiscountPercent('');
      setOverallDiscountPercent('');
      updateDaysAndDiscount('', '', '', '');
      return;
    }

    let newDiscountVal: number | '' = bulkDiscountPercent;
    if (treatmentPackage === '30 Days') {
      if (newMode === 'outdoor') newDiscountVal = 35;
      else if (newMode === 'indoor') newDiscountVal = 30;
    } else if (treatmentPackage === '15 Days') {
      if (newMode === 'outdoor') newDiscountVal = 25;
      else if (newMode === 'indoor') newDiscountVal = 30;
    } else if (treatmentPackage === 'Per Day') {
      if (newMode === 'outdoor') newDiscountVal = 0;
      else if (newMode === 'indoor') newDiscountVal = 30;
    }

    updateDaysAndDiscount(treatmentDays, newDiscountVal, treatmentPackage, newMode);

    if (newMode === 'indoor') {
      const numDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 0;
      setIndoorServiceList(prev => prev.map(item => {
        if (!item.selected) return item;
        return {
          ...item,
          days: numDays > 0 ? numDays : '',
          totalAmount: numDays > 0 ? (Number(item.dailyRate) || 0) * numDays : 0
        };
      }));
    }
  };

  // Initialize treatment list from catalog setup (Admin entry)
  useEffect(() => {
    const treatmentCatalog = catalog.filter(c => c.category === 'treatment' || c.category === 'consultation');
    const catalogOrderMap = new Map<string, number>(treatmentCatalog.map((c, i) => [c.id, i]));
    
    setTreatmentList(prev => {
      const catalogMap = new Map<string, CatalogItem>(treatmentCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        // Filter out non-custom items that no longer exist in current catalog
        const filteredPrev = prev.filter(item => item.isCustom || (item.catalogId && catalogMap.has(item.catalogId)));

        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            const unitCost = catItem.defaultPrice || 1000;
            const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
            const discountPercent = item.discountPercent === '' ? 0 : (Number(item.discountPercent) || 0);
            const gross = unitCost * sessions;
            const discountAmount = Math.round((gross * discountPercent) / 100);
            const totalCost = Math.max(0, gross - discountAmount);
            return {
              ...item,
              treatmentName: catItem.name,
              unitCost,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent,
              discountAmount,
              totalCost
            };
          }
          return item;
        });

        const existingCatalogIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: TreatmentListItem[] = [];
        treatmentCatalog.forEach(catItem => {
          if (!existingCatalogIds.has(catItem.id)) {
            const unitCost = catItem.defaultPrice || 1000;
            newItems.push({
              id: `tr-list-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              treatmentName: catItem.name,
              unitCost,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent,
              sessions: '',
              discountPercent: '',
              discountAmount: 0,
              totalCost: 0
            });
          }
        });

        const combined = [...updatedPrev, ...newItems];

        // Sort standard items based on catalog order
        return combined.sort((a, b) => {
          const indexA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const indexB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return indexA - indexB;
        });
      }

      // First time initialization: list all items with empty sessions & discount for manual entry
      return treatmentCatalog.map((catItem) => {
        const unitCost = catItem.defaultPrice || 1000;
        return {
          id: `tr-list-${catItem.id}`,
          catalogId: catItem.id,
          selected: false,
          treatmentName: catItem.name,
          unitCost,
          description: catItem.description || '',
          rateNote: catItem.rateNote || '',
          outdoorSessions: catItem.outdoorSessions,
          indoorSessions: catItem.indoorSessions,
          isIndoorFree: catItem.isIndoorFree,
          fixedDiscountAmount: catItem.fixedDiscountAmount,
          outdoorDiscountPercent: catItem.outdoorDiscountPercent,
          outdoorDiscountAmount: catItem.outdoorDiscountAmount,
          defaultDiscountPercent: catItem.defaultDiscountPercent,
          sessions: '',
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      });
    });
  }, [catalog]);

  const toggleTreatmentSelection = (id: string) => {
    setTreatmentList(prev => prev.map(item => {
      if (item.id === id) {
        const newSelected = !item.selected;
        let newSessions = item.sessions;
        let newDiscountPercent = item.discountPercent;

        if (newSelected) {
          if (item.sessions === '' || item.sessions === 0) {
            const numDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 0;
            const calcDays = showFullTreatmentCalculation ? (numDays > 0 ? numDays : 1) : 1;
            const dailySessions = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
              ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
              : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
            newSessions = dailySessions * calcDays;
          }

          if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
            newDiscountPercent = Number(item.outdoorDiscountPercent);
          } else if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
            newDiscountPercent = 100;
          } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
            // Handled via fixed calculation
          } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
            newDiscountPercent = Number(item.defaultDiscountPercent);
          } else if (item.discountPercent === '' && bulkDiscountPercent !== '') {
            newDiscountPercent = bulkDiscountPercent;
          }
        } else {
          newSessions = '';
          newDiscountPercent = '';
        }

        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const gross = unitCost * sessionsNum;

        let discountAmount = 0;
        let discountPctNum: number | '' = newDiscountPercent;

        if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
          discountPctNum = 100;
          discountAmount = gross;
        } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
          discountPctNum = Number(item.outdoorDiscountPercent);
          discountAmount = Math.round((gross * discountPctNum) / 100);
        } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
          discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
          discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 && (newDiscountPercent === '' || newDiscountPercent === 0)) {
          const fixedVal = Number(item.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal * sessionsNum);
          discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0 && (newDiscountPercent === '' || newDiscountPercent === 0)) {
          discountPctNum = Number(item.defaultDiscountPercent);
          discountAmount = Math.round((gross * discountPctNum) / 100);
        } else {
          const pctNum = discountPctNum === '' ? 0 : Number(discountPctNum);
          discountAmount = Math.round((gross * pctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: newSelected,
          sessions: newSessions,
          discountPercent: discountPctNum,
          discountAmount,
          totalCost
        };
      }
      return item;
    }));
  };

  const updateTreatmentItem = (id: string, fields: Partial<TreatmentListItem>) => {
    setTreatmentList(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...fields };
        const unitCost = Number(updated.unitCost) || 0;
        const sessions = updated.sessions === '' ? 0 : (Number(updated.sessions) || 0);
        const gross = unitCost * sessions;

        let discountPercent = updated.discountPercent;
        let discountAmount = 0;

        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(updated.isIndoorFree);
        const isOutdoorDisc = patientTreatmentMode === 'outdoor' && updated.outdoorDiscountPercent !== undefined && Number(updated.outdoorDiscountPercent) > 0;
        const isOutdoorAmt = patientTreatmentMode === 'outdoor' && updated.outdoorDiscountAmount !== undefined && Number(updated.outdoorDiscountAmount) > 0;
        const isFixedAmt = updated.fixedDiscountAmount !== undefined && Number(updated.fixedDiscountAmount) > 0;

        if (isIndoorFree) {
          discountPercent = 100;
          discountAmount = gross;
        } else if (isOutdoorDisc && fields.discountPercent === undefined) {
          discountPercent = Number(updated.outdoorDiscountPercent);
          discountAmount = Math.round((gross * discountPercent) / 100);
        } else if (isOutdoorAmt && fields.discountPercent === undefined) {
          discountAmount = Math.min(gross, Number(updated.outdoorDiscountAmount) * sessions);
          discountPercent = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (isFixedAmt && fields.discountPercent === undefined) {
          const fixedVal = Number(updated.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal * sessions);
          discountPercent = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (updated.defaultDiscountPercent !== undefined && Number(updated.defaultDiscountPercent) > 0 && fields.discountPercent === undefined) {
          discountPercent = Number(updated.defaultDiscountPercent);
          discountAmount = Math.round((gross * discountPercent) / 100);
        } else {
          const discPctNum = discountPercent === '' ? 0 : Number(discountPercent);
          discountAmount = Math.round((gross * discPctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);
        const selected = fields.sessions !== undefined && Number(fields.sessions) > 0 ? true : updated.selected;
        return {
          ...updated,
          selected,
          discountPercent,
          discountAmount,
          totalCost
        };
      }
      return item;
    }));
  };

  const addCustomTreatmentItem = () => {
    const newId = `tr-custom-${Date.now()}`;
    const unitCost = 1000;
    
    setTreatmentList(prev => [
      ...prev,
      {
        id: newId,
        selected: true,
        treatmentName: 'Custom Therapy / Acupuncture',
        unitCost,
        sessions: '',
        discountPercent: '',
        discountAmount: 0,
        totalCost: 0,
        isCustom: true
      }
    ]);
  };

  const removeCustomTreatmentItem = (id: string) => {
    setTreatmentList(prev => prev.filter(item => item.id !== id));
  };

  // Section 2: Outdoor Packages List with Checkboxes (Single Package)
  const [outdoorSearch, setOutdoorSearch] = useState('');
  const [outdoorPackageList, setOutdoorPackageList] = useState<OutdoorPackageListItem[]>([]);

  useEffect(() => {
    setOutdoorPackageList(prev => {
      if (prev.length > 0) return prev;
      const daysText = patientTreatmentMode === 'outdoor' && treatmentDays !== '' && Number(treatmentDays) > 0 ? `${treatmentDays}-Day Package` : '...-Day Package';
      return [
        {
          id: 'pkg-list-single',
          catalogId: 'outdoor_package_single',
          selected: patientTreatmentMode === 'outdoor',
          packageName: daysText,
          packageType: 'outdoor_package',
          totalBaseCost: '',
          discountPercent: '',
          discountAmount: 0,
          netCost: 0,
          description: 'Outdoor Acupuncture & Therapy Package',
          rateNote: ''
        }
      ];
    });
  }, [catalog]);

  const toggleOutdoorPackageSelection = (id: string) => {
    if (patientTreatmentMode === 'indoor') return;
    setOutdoorPackageList(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const updateOutdoorPackageItem = (id: string, fields: Partial<OutdoorPackageListItem>) => {
    if (patientTreatmentMode === 'indoor') return;
    setOutdoorPackageList(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...fields };
        const totalBaseCost = Number(updated.totalBaseCost) || 0;
        const discountPercent = updated.discountPercent === '' ? 0 : (Number(updated.discountPercent) || 0);
        const discountAmount = Math.round((totalBaseCost * discountPercent) / 100);
        const netCost = Math.max(0, totalBaseCost - discountAmount);
        return {
          ...updated,
          discountAmount,
          netCost
        };
      }
      return item;
    }));
  };

  const addCustomOutdoorPackage = () => {
    const newId = `pkg-custom-${Date.now()}`;
    setOutdoorPackageList(prev => [
      ...prev,
      {
        id: newId,
        selected: true,
        packageName: 'Custom Outdoor Package',
        packageType: 'custom',
        totalBaseCost: '',
        discountPercent: '',
        discountAmount: 0,
        netCost: 0,
        description: 'Custom package details',
        isCustom: true
      }
    ]);
  };

  const removeOutdoorPackageItem = (id: string) => {
    setOutdoorPackageList(prev => prev.filter(item => item.id !== id));
  };

  // Section 3: Indoor Services List with Checkboxes
  const [indoorSearch, setIndoorSearch] = useState('');
  const [indoorServiceList, setIndoorServiceList] = useState<IndoorServiceListItem[]>([]);

  useEffect(() => {
    const roomCatalog = catalog.filter(c => c.category === 'indoor_room');
    const catalogOrderMap = new Map<string, number>(roomCatalog.map((c, i) => [c.id, i]));

    setIndoorServiceList(prev => {
      const catalogMap = new Map<string, CatalogItem>(roomCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        // Filter out non-custom items that no longer exist in current roomCatalog
        const filteredPrev = prev.filter(item => item.isCustom || (item.catalogId && catalogMap.has(item.catalogId)));

        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            const dailyRate = catItem.defaultPrice || 1000;
            const days = item.days === '' ? 0 : Number(item.days);
            return {
              ...item,
              roomType: catItem.name,
              dailyRate,
              remarks: catItem.description || '',
              rateNote: catItem.rateNote || '',
              totalAmount: dailyRate * days
            };
          }
          return item;
        });

        const existingCatalogIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: IndoorServiceListItem[] = [];
        roomCatalog.forEach(catItem => {
          if (!existingCatalogIds.has(catItem.id)) {
            const dailyRate = catItem.defaultPrice || 1000;
            newItems.push({
              id: `ind-list-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              roomType: catItem.name,
              dailyRate,
              days: '',
              totalAmount: 0,
              remarks: catItem.description || '',
              rateNote: catItem.rateNote || ''
            });
          }
        });

        const combined = [...updatedPrev, ...newItems];

        // Sort standard items based on catalog order
        return combined.sort((a, b) => {
          const indexA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const indexB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return indexA - indexB;
        });
      }

      return roomCatalog.map(catItem => {
        const dailyRate = catItem.defaultPrice || 1000;
        return {
          id: `ind-list-${catItem.id}`,
          catalogId: catItem.id,
          selected: false,
          roomType: catItem.name,
          dailyRate,
          days: '',
          totalAmount: 0,
          remarks: catItem.description || '',
          rateNote: catItem.rateNote || ''
        };
      });
    });
  }, [catalog]);

  const toggleIndoorServiceSelection = (id: string) => {
    setIndoorServiceList(prev => prev.map(item => {
      if (item.id === id) {
        const newSelected = !item.selected;
        if (newSelected) {
          const autoDays = treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 1;
          const dailyRate = Number(item.dailyRate) || 0;
          return {
            ...item,
            selected: true,
            days: autoDays,
            totalAmount: dailyRate * autoDays
          };
        } else {
          return {
            ...item,
            selected: false,
            days: '',
            totalAmount: 0
          };
        }
      }
      return item;
    }));
  };

  const updateIndoorServiceItem = (id: string, fields: Partial<IndoorServiceListItem>) => {
    setIndoorServiceList(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...fields };
        const isSelectedNow = updated.days !== '' && Number(updated.days) > 0;
        const dailyRate = Number(updated.dailyRate) || 0;
        const daysNum = updated.days === '' ? 0 : (Number(updated.days) || 0);
        const totalAmount = dailyRate * daysNum;
        return {
          ...updated,
          selected: isSelectedNow ? true : (fields.days === '' ? false : updated.selected),
          totalAmount
        };
      } else if (fields.days !== undefined && fields.days !== '' && Number(fields.days) > 0) {
        return {
          ...item,
          selected: false,
          days: '',
          totalAmount: 0
        };
      }
      return item;
    }));
  };

  const addCustomIndoorService = () => {
    const newId = `ind-custom-${Date.now()}`;
    setIndoorServiceList(prev => [
      ...prev,
      {
        id: newId,
        selected: true,
        roomType: 'Custom Room / Cabin',
        dailyRate: 2000,
        days: treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 1,
        totalAmount: 2000 * (treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 1),
        remarks: 'Custom room details',
        isCustom: true
      }
    ]);
  };

  const removeIndoorServiceItem = (id: string) => {
    setIndoorServiceList(prev => prev.filter(item => item.id !== id));
  };

  // Section 4: Additional Treatments & Therapies State
  const [additionalTreatmentSearch, setAdditionalTreatmentSearch] = useState('');
  const [additionalTreatmentList, setAdditionalTreatmentList] = useState<AdditionalTreatmentListItem[]>([]);

  // Initialize and Sync Additional Treatments from Catalog (Admin Catalog & Rates)
  useEffect(() => {
    const addCatalog = catalog.filter(c => c.category === 'additional_treatment');
    const catalogOrderMap = new Map<string, number>(addCatalog.map((c, i) => [c.id, i]));

    setAdditionalTreatmentList(prev => {
      const catalogMap = new Map<string, CatalogItem>(addCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        // Filter out non-custom items that no longer exist in catalog, but keep selected items
        const filteredPrev = prev.filter(item => item.isCustom || item.isSelected || (item.catalogId && catalogMap.has(item.catalogId)));

        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            const unitCost = catItem.defaultPrice || 1000;
            const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
            const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(catItem.isIndoorFree);
            let discountPercent = item.discountPercent;
            if (!item.selected) {
              discountPercent = '';
            } else if (isIndoorFree) {
              discountPercent = 100;
            }
            const gross = unitCost * sessions;
            const discPctNum = discountPercent === '' ? 0 : Number(discountPercent);
            const discountAmount = Math.round((gross * discPctNum) / 100);
            const totalCost = Math.max(0, gross - discountAmount);
            return {
              ...item,
              treatmentName: catItem.name,
              unitCost,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              isIndoorFree: catItem.isIndoorFree,
              isRatioBased: catItem.isRatioBased ?? false,
              sessionsPer10Days: catItem.sessionsPer10Days ?? 3,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent,
              discountAmount,
              totalCost
            };
          }
          return item;
        });

        const existingCatalogIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: AdditionalTreatmentListItem[] = [];
        addCatalog.forEach(catItem => {
          if (!existingCatalogIds.has(catItem.id)) {
            const unitCost = catItem.defaultPrice || 1000;
            newItems.push({
              id: `add-tr-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              treatmentName: catItem.name,
              unitCost,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              isIndoorFree: catItem.isIndoorFree,
              isRatioBased: catItem.isRatioBased ?? false,
              sessionsPer10Days: catItem.sessionsPer10Days ?? 3,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent,
              sessions: '',
              discountPercent: '',
              discountAmount: 0,
              totalCost: 0
            });
          }
        });

        const combined = [...updatedPrev, ...newItems];

        return combined.sort((a, b) => {
          const indexA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const indexB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return indexA - indexB;
        });
      }

      // First time initialization from catalog
      return addCatalog.map(catItem => {
        const unitCost = catItem.defaultPrice || 1000;
        return {
          id: `add-tr-${catItem.id}`,
          catalogId: catItem.id,
          selected: false,
          treatmentName: catItem.name,
          unitCost,
          description: catItem.description || '',
          rateNote: catItem.rateNote || '',
          outdoorSessions: catItem.outdoorSessions,
          indoorSessions: catItem.indoorSessions,
          isIndoorFree: catItem.isIndoorFree,
          isRatioBased: catItem.isRatioBased ?? false,
          sessionsPer10Days: catItem.sessionsPer10Days ?? 3,
          fixedDiscountAmount: catItem.fixedDiscountAmount,
          outdoorDiscountPercent: catItem.outdoorDiscountPercent,
          outdoorDiscountAmount: catItem.outdoorDiscountAmount,
          defaultDiscountPercent: catItem.defaultDiscountPercent,
          sessions: '',
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      });
    });
  }, [catalog, patientTreatmentMode]);

  // Recalculate indoor free and outdoor discount for additional treatments when patientTreatmentMode changes
  useEffect(() => {
    setAdditionalTreatmentList(prev => prev.map(item => {
      const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
      const isOutdoorDisc = patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0;
      const isOutdoorAmt = patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0;
      const isFixedAmt = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;

      const unitCost = Number(item.unitCost) || 0;
      const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
      const gross = unitCost * sessions;

      let discPct: number | '' = item.discountPercent;

      if (isIndoorFree) {
        discPct = 100;
      } else if (isOutdoorDisc) {
        discPct = Number(item.outdoorDiscountPercent);
      } else if (isFixedAmt && (discPct === '' || discPct === 0)) {
        const fixedVal = Number(item.fixedDiscountAmount);
        const tempAmt = Math.min(gross, fixedVal * sessions);
        discPct = gross > 0 ? Math.round((tempAmt / gross) * 100) : 0;
      } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
        if (discPct === '' || discPct === 0) {
          discPct = Number(item.defaultDiscountPercent);
        }
      }

      let discountAmount = 0;
      if (isIndoorFree) {
        discountAmount = gross;
      } else if (isOutdoorAmt) {
        discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessions);
        if (gross > 0) discPct = Math.round((discountAmount / gross) * 100);
      } else if (isOutdoorDisc) {
        discPct = Number(item.outdoorDiscountPercent);
        discountAmount = Math.round((gross * discPct) / 100);
      } else if (isFixedAmt && (item.discountPercent === '' || item.discountPercent === 0 || discPct !== '')) {
        const fixedVal = Number(item.fixedDiscountAmount);
        discountAmount = Math.min(gross, fixedVal * sessions);
        discPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else {
        const pctNum = discPct === '' ? 0 : Number(discPct);
        discountAmount = Math.round((gross * pctNum) / 100);
      }

      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        discountPercent: discPct,
        discountAmount,
        totalCost
      };
    }));
  }, [patientTreatmentMode]);

  // Auto-update sessions for ratio-based additional treatments when package treatmentDays changes
  useEffect(() => {
    const daysNum = treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 0;
    
    setAdditionalTreatmentList(prev => prev.map(item => {
      if (item.selected && item.isRatioBased) {
        const per10 = item.sessionsPer10Days || 3;
        // Only calculate ratio if a package with valid days > 0 is selected. Otherwise default to 1 session.
        const calcSessions = daysNum > 0 ? Math.round((daysNum / 10) * per10) : 1;
        const unitCost = Number(item.unitCost) || 0;

        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
        const isOutdoorDisc = patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0;
        const isOutdoorAmt = patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0;
        const isFixedAmt = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;

        const gross = unitCost * calcSessions;

        let discountPct: number | '' = item.discountPercent;
        if (isIndoorFree) {
          discountPct = 100;
        } else if (isOutdoorDisc) {
          discountPct = Number(item.outdoorDiscountPercent);
        } else if (isFixedAmt && (discountPct === '' || discountPct === 0)) {
          const fixedVal = Number(item.fixedDiscountAmount);
          const tempAmt = Math.min(gross, fixedVal);
          discountPct = gross > 0 ? Math.round((tempAmt / gross) * 100) : 0;
        } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
          if (discountPct === '' || discountPct === 0) discountPct = Number(item.defaultDiscountPercent);
        }

        let discountAmount = 0;
        if (isIndoorFree) {
          discountAmount = gross;
        } else if (isOutdoorAmt) {
          discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * calcSessions);
          if (gross > 0) discountPct = Math.round((discountAmount / gross) * 100);
        } else if (isFixedAmt && (item.discountPercent === '' || item.discountPercent === 0 || discountPct !== '')) {
          const fixedVal = Number(item.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal);
          discountPct = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else {
          const discPctNum = discountPct === '' ? 0 : Number(discountPct);
          discountAmount = Math.round((gross * discPctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          sessions: calcSessions,
          discountPercent: discountPct,
          discountAmount,
          totalCost
        };
      }
      return item;
    }));
  }, [treatmentDays, patientTreatmentMode]);

  const toggleAdditionalTreatmentSelection = (id: string) => {
    setAdditionalTreatmentList(prev => prev.map(item => {
      if (item.id === id) {
        const newSelected = !item.selected;
        let newSessions = item.sessions;
        let newDiscountPercent = item.discountPercent;

        if (newSelected) {
          const hasPackageDays = treatmentDays !== '' && Number(treatmentDays) > 0;
          if (item.isRatioBased && hasPackageDays) {
            const daysNum = Number(treatmentDays);
            const per10 = item.sessionsPer10Days || 3;
            newSessions = Math.round((daysNum / 10) * per10);
          } else if (item.sessions === '' || item.sessions === 0) {
            newSessions = 1;
          }

          if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
            newDiscountPercent = 100;
          } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
            newDiscountPercent = Number(item.outdoorDiscountPercent);
          } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
            // Handled in calculation
          } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
            newDiscountPercent = Number(item.defaultDiscountPercent);
          }
        } else {
          newSessions = '';
          newDiscountPercent = '';
        }

        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
        const isOutdoorDisc = patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0;
        const isOutdoorAmt = patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0;
        const isFixedAmt = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;

        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const gross = unitCost * sessionsNum;

        let discountPctNum: number | '' = newDiscountPercent;
        let discountAmount = 0;

        if (!newSelected) {
          discountPctNum = '';
          discountAmount = 0;
        } else if (isIndoorFree) {
          discountPctNum = 100;
          discountAmount = gross;
        } else if (isOutdoorAmt) {
          discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
          if (gross > 0) discountPctNum = Math.round((discountAmount / gross) * 100);
        } else if (isOutdoorDisc) {
          discountPctNum = Number(item.outdoorDiscountPercent);
          discountAmount = Math.round((gross * discountPctNum) / 100);
        } else if (isFixedAmt && (newDiscountPercent === '' || newDiscountPercent === 0)) {
          const fixedVal = Number(item.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal * sessionsNum);
          discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else {
          const pctNum = discountPctNum === '' ? 0 : Number(discountPctNum);
          discountAmount = Math.round((gross * pctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: newSelected,
          sessions: newSessions,
          discountPercent: discountPctNum,
          discountAmount,
          totalCost
        };
      }
      return item;
    }));
  };

  const updateAdditionalTreatmentItem = (id: string, fields: Partial<AdditionalTreatmentListItem>) => {
    setAdditionalTreatmentList(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...fields };
        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(updated.isIndoorFree);
        const isOutdoorDisc = patientTreatmentMode === 'outdoor' && updated.outdoorDiscountPercent !== undefined && Number(updated.outdoorDiscountPercent) > 0;
        const isOutdoorAmt = patientTreatmentMode === 'outdoor' && updated.outdoorDiscountAmount !== undefined && Number(updated.outdoorDiscountAmount) > 0;
        const isFixedAmt = updated.fixedDiscountAmount !== undefined && Number(updated.fixedDiscountAmount) > 0;

        const unitCost = Number(updated.unitCost) || 0;
        const sessions = updated.sessions === '' ? 0 : (Number(updated.sessions) || 0);
        const gross = unitCost * sessions;

        let discountPercent = updated.discountPercent;
        if (fields.discountPercent === undefined) {
          if (isIndoorFree) {
            discountPercent = 100;
          } else if (isOutdoorDisc) {
            discountPercent = Number(updated.outdoorDiscountPercent);
          } else if (isFixedAmt) {
            const fixedVal = Number(updated.fixedDiscountAmount);
            const tempAmt = Math.min(gross, fixedVal * sessions);
            discountPercent = gross > 0 ? Math.round((tempAmt / gross) * 100) : 0;
          } else if (updated.defaultDiscountPercent !== undefined && Number(updated.defaultDiscountPercent) > 0 && (discountPercent === '' || discountPercent === 0)) {
            discountPercent = Number(updated.defaultDiscountPercent);
          }
        }

        let discountAmount = 0;
        if (!updated.selected) {
          discountPercent = '';
          discountAmount = 0;
        } else if (isIndoorFree) {
          discountAmount = gross;
        } else if (isOutdoorAmt && fields.discountPercent === undefined) {
          discountAmount = Math.min(gross, Number(updated.outdoorDiscountAmount) * sessions);
          if (gross > 0) discountPercent = Math.round((discountAmount / gross) * 100);
        } else if (isFixedAmt && fields.discountPercent === undefined) {
          const fixedVal = Number(updated.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal * sessions);
          discountPercent = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else {
          const discPctNum = discountPercent === '' ? 0 : Number(discountPercent);
          discountAmount = Math.round((gross * discPctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);
        const selected = fields.sessions !== undefined && Number(fields.sessions) > 0 ? true : updated.selected;

        return {
          ...updated,
          selected,
          discountPercent,
          discountAmount,
          totalCost
        };
      }
      return item;
    }));
  };

  const addCustomAdditionalTreatment = () => {
    const newId = `add-tr-custom-${Date.now()}`;
    setAdditionalTreatmentList(prev => [
      ...prev,
      {
        id: newId,
        selected: true,
        treatmentName: 'Custom Additional Therapy',
        unitCost: 1000,
        sessions: 1,
        discountPercent: '',
        discountAmount: 0,
        totalCost: 1000,
        isCustom: true,
        isRatioBased: false
      }
    ]);
  };

  const removeCustomAdditionalTreatment = (id: string) => {
    setAdditionalTreatmentList(prev => prev.filter(item => item.id !== id));
  };

  // Food Charge 3 Times State
  const [foodChargeSelected, setFoodChargeSelected] = useState<boolean>(false);
  const [foodChargePerDay, setFoodChargePerDay] = useState<number | ''>(500);
  const [foodChargeDays, setFoodChargeDays] = useState<number | ''>('');

  const toggleFoodChargeSelection = () => {
    setFoodChargeSelected(prev => {
      const next = !prev;
      if (next) {
        const autoDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 1;
        setFoodChargeDays(autoDays);
        if (foodChargePerDay === '') {
          setFoodChargePerDay(500);
        }
      } else {
        setFoodChargeDays('');
      }
      return next;
    });
  };

  // Additional Fees & Discounts
  const [includeAdmissionFee, setIncludeAdmissionFee] = useState<boolean>(false);
  const [admissionFee, setAdmissionFee] = useState<number | ''>(1000);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid'>('Quotation');
  const [notes, setNotes] = useState<string>('Quotation validity is 7 days from the date of issue.');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Payment Cycle / Installment Schedule State
  const [paymentPlanMode, setPaymentPlanMode] = useState<'full' | '4_cycles' | '10_day_cycles' | '15_day_cycles' | 'custom_phases'>('4_cycles');
  const [paymentPhases, setPaymentPhases] = useState<PaymentPhase[]>([]);
  const [isDraftRestored, setIsDraftRestored] = useState<boolean>(false);

  const userId = currentUser?.id || currentUser?.username || 'guest';
  const DRAFT_STORAGE_KEY = `suo_xi_quotation_builder_draft_${userId}_v3`;
  const isClearingDraftRef = useRef<boolean>(false);

  // Restore draft from localStorage on initial component mount or when user changes
  useEffect(() => {
    try {
      // Clean up old legacy non-user-specific draft if present
      localStorage.removeItem('suo_xi_quotation_builder_draft_v2');

      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedPatient && !initialPatient) {
          setSelectedPatient(parsed.selectedPatient);
        }
        if (parsed.phoneSearch) setPhoneSearch(parsed.phoneSearch);
        if (parsed.billingDoctor) setBillingDoctor(parsed.billingDoctor);
        if (parsed.treatmentList && Array.isArray(parsed.treatmentList) && parsed.treatmentList.length > 0) {
          setTreatmentList(parsed.treatmentList);
        }
        if (parsed.additionalTreatmentList && Array.isArray(parsed.additionalTreatmentList) && parsed.additionalTreatmentList.length > 0) {
          setAdditionalTreatmentList(parsed.additionalTreatmentList);
        }
        if (parsed.patientTreatmentMode !== undefined) setPatientTreatmentMode(parsed.patientTreatmentMode);
        if (parsed.treatmentPackage !== undefined) setTreatmentPackage(parsed.treatmentPackage);
        if (parsed.treatmentDays !== undefined) setTreatmentDays(parsed.treatmentDays);
        if (parsed.bulkDiscountPercent !== undefined) setBulkDiscountPercent(parsed.bulkDiscountPercent);
        if (parsed.showFullTreatmentCalculation !== undefined) setShowFullTreatmentCalculation(parsed.showFullTreatmentCalculation);
        if (parsed.showFullIndoorCalculation !== undefined) setShowFullIndoorCalculation(parsed.showFullIndoorCalculation);
        if (parsed.outdoorPackageList && Array.isArray(parsed.outdoorPackageList) && parsed.outdoorPackageList.length > 0) {
          setOutdoorPackageList(parsed.outdoorPackageList);
        }
        if (parsed.indoorServiceList && Array.isArray(parsed.indoorServiceList) && parsed.indoorServiceList.length > 0) {
          setIndoorServiceList(parsed.indoorServiceList);
        }
        if (parsed.foodChargeSelected !== undefined) setFoodChargeSelected(parsed.foodChargeSelected);
        if (parsed.foodChargePerDay !== undefined) setFoodChargePerDay(parsed.foodChargePerDay);
        if (parsed.foodChargeDays !== undefined) setFoodChargeDays(parsed.foodChargeDays);
        if (parsed.includeAdmissionFee !== undefined) setIncludeAdmissionFee(parsed.includeAdmissionFee);
        if (parsed.admissionFee !== undefined) setAdmissionFee(parsed.admissionFee);
        if (parsed.overallDiscountPercent !== undefined) setOverallDiscountPercent(parsed.overallDiscountPercent);
        if (parsed.advancePaid !== undefined) setAdvancePaid(parsed.advancePaid);
        if (parsed.paymentStatus) setPaymentStatus(parsed.paymentStatus);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.paymentPlanMode) setPaymentPlanMode(parsed.paymentPlanMode);
        if (parsed.paymentPhases && Array.isArray(parsed.paymentPhases)) setPaymentPhases(parsed.paymentPhases);
        if (parsed.savedComparisonSnapshot) setSavedComparisonSnapshot(parsed.savedComparisonSnapshot);

        setIsDraftRestored(true);
      } else {
        // Reset state for new user if no draft exists
        clearFormAndDraftState();
      }
    } catch (e) {
      console.error('Failed to load quotation draft:', e);
    }
  }, [DRAFT_STORAGE_KEY]);

  // Auto-save draft to localStorage on any state modification
  useEffect(() => {
    if (isClearingDraftRef.current) {
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    const timer = setTimeout(() => {
      try {
        if (isClearingDraftRef.current) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          return;
        }

        const hasSelectedTreatments = treatmentList.some(item => item.selected);
        const hasSelectedAdditional = additionalTreatmentList.some(item => item.selected);
        const hasSelectedIndoor = indoorServiceList.some(item => item.selected);
        const hasSelectedOutdoor = outdoorPackageList.some(item => item.selected);

        // If no patient selected and no items checked and no search query, do not store draft
        if (!selectedPatient && !hasSelectedTreatments && !hasSelectedAdditional && !hasSelectedIndoor && !hasSelectedOutdoor && !phoneSearch.trim()) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          return;
        }

        const draftData = {
          selectedPatient,
          phoneSearch,
          billingDoctor,
          treatmentList,
          additionalTreatmentList,
          patientTreatmentMode,
          treatmentPackage,
          treatmentDays,
          bulkDiscountPercent,
          showFullTreatmentCalculation,
          showFullIndoorCalculation,
          outdoorPackageList,
          indoorServiceList,
          foodChargeSelected,
          foodChargePerDay,
          foodChargeDays,
          includeAdmissionFee,
          admissionFee,
          overallDiscountPercent,
          advancePaid,
          paymentStatus,
          notes,
          paymentPlanMode,
          paymentPhases,
          savedComparisonSnapshot
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      } catch (err) {
        console.error('Error saving quotation draft:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    selectedPatient,
    phoneSearch,
    billingDoctor,
    treatmentList,
    additionalTreatmentList,
    patientTreatmentMode,
    treatmentPackage,
    treatmentDays,
    bulkDiscountPercent,
    showFullTreatmentCalculation,
    showFullIndoorCalculation,
    outdoorPackageList,
    indoorServiceList,
    foodChargeSelected,
    foodChargePerDay,
    foodChargeDays,
    includeAdmissionFee,
    admissionFee,
    overallDiscountPercent,
    advancePaid,
    paymentStatus,
    notes,
    paymentPlanMode,
    paymentPhases,
    savedComparisonSnapshot
  ]);

  const clearFormAndDraftState = () => {
    isClearingDraftRef.current = true;
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (e) {
      console.error('Error removing draft key', e);
    }
    setSelectedPatient(null);
    setPhoneSearch('');
    setBillingDoctor('');
    setTreatmentSearch('');
    setOutdoorSearch('');
    setIndoorSearch('');
    setAdditionalTreatmentSearch('');
    setPatientTreatmentMode('');
    setTreatmentPackage('');
    setTreatmentDays('');
    setBulkDiscountPercent('');
    setShowFullTreatmentCalculation(false);
    setShowFullIndoorCalculation(false);
    setFoodChargeSelected(false);
    setFoodChargePerDay(500);
    setFoodChargeDays('');
    setIncludeAdmissionFee(false);
    setAdmissionFee(1000);
    setOverallDiscountPercent('');
    setAdvancePaid(0);
    setPaymentStatus('Quotation');
    setNotes('Quotation validity is 7 days from the date of issue.');
    setPaymentPlanMode('10_day_cycles');
    setPaymentPhases([]);
    setSavedComparisonSnapshot(null);
    setIsSaved(false);
    setIsDraftRestored(false);

    setTreatmentList(prev => prev.filter(item => !item.isCustom).map(item => ({
      ...item,
      selected: false,
      sessions: '',
      discountPercent: '',
      discountAmount: 0,
      totalCost: 0
    })));

    setIndoorServiceList(prev => prev.filter(item => !item.isCustom).map(item => ({
      ...item,
      selected: false,
      days: '',
      totalAmount: 0
    })));

    setOutdoorPackageList(prev => prev.filter(item => !item.isCustom).map(item => ({
      ...item,
      selected: false,
      totalBaseCost: '',
      discountPercent: '',
      discountAmount: 0,
      netCost: 0
    })));

    setAdditionalTreatmentList(prev => prev.filter(item => !item.isCustom).map(item => ({
      ...item,
      selected: false,
      sessions: '',
      discountPercent: '',
      discountAmount: 0,
      totalCost: 0
    })));

    // Reset the ref after state batching completes and ensure draft is cleared
    setTimeout(() => {
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (e) {
        console.error(e);
      }
      isClearingDraftRef.current = false;
    }, 600);
  };

  const handleResetDraft = () => {
    if (confirm('Are you sure you want to clear all form inputs and start a new quotation?')) {
      clearFormAndDraftState();
    }
  };

  // Filtered lists for search
  const filteredTreatmentList = treatmentList.filter(item => 
    item.treatmentName.toLowerCase().includes(treatmentSearch.toLowerCase().trim())
  );

  const isAllTreatmentsSelected = filteredTreatmentList.length > 0 && filteredTreatmentList.every(t => t.selected);

  const toggleSelectAllTreatments = () => {
    const targetIds = new Set(filteredTreatmentList.map(t => t.id));
    const shouldSelectAll = !isAllTreatmentsSelected;

    setTreatmentList(prev => prev.map(item => {
      if (!targetIds.has(item.id)) return item;

      if (shouldSelectAll) {
        let newSessions = item.sessions;
        let newDiscountPercent = item.discountPercent;

        if (item.sessions === '' || item.sessions === 0) {
          const numDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 0;
          const calcDays = showFullTreatmentCalculation ? (numDays > 0 ? numDays : 1) : 1;
          const dailySessions = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
            ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
            : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
          newSessions = dailySessions * calcDays;
        }

        if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
          newDiscountPercent = 100;
        } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
          newDiscountPercent = Number(item.outdoorDiscountPercent);
        } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
          newDiscountPercent = Number(item.defaultDiscountPercent);
        } else if (item.discountPercent === '' && bulkDiscountPercent !== '') {
          newDiscountPercent = bulkDiscountPercent;
        }

        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const gross = unitCost * sessionsNum;

        let discountPctNum: number | '' = newDiscountPercent;
        let discountAmount = 0;

        if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
          discountPctNum = 100;
          discountAmount = gross;
        } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
          discountPctNum = Number(item.outdoorDiscountPercent);
          discountAmount = Math.round((gross * discountPctNum) / 100);
        } else if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
          discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
          discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
          const fixedVal = Number(item.fixedDiscountAmount);
          discountAmount = Math.min(gross, fixedVal * sessionsNum);
          discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
        } else if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
          discountPctNum = Number(item.defaultDiscountPercent);
          discountAmount = Math.round((gross * discountPctNum) / 100);
        } else {
          const pctNum = discountPctNum === '' ? 0 : Number(discountPctNum);
          discountAmount = Math.round((gross * pctNum) / 100);
        }

        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: true,
          sessions: newSessions,
          discountPercent: discountPctNum,
          discountAmount,
          totalCost
        };
      } else {
        return {
          ...item,
          selected: false,
          sessions: '',
          discountPercent: '',
          discountAmount: 0,
          totalCost: 0
        };
      }
    }));
  };

  const filteredOutdoorPackageList = outdoorPackageList.filter(item =>
    item.packageName.toLowerCase().includes(outdoorSearch.toLowerCase().trim())
  );

  const filteredIndoorServiceList = indoorServiceList.filter(item =>
    item.roomType.toLowerCase().includes(indoorSearch.toLowerCase().trim())
  );

  const isAllIndoorServicesSelected = filteredIndoorServiceList.length > 0 && filteredIndoorServiceList.every(i => i.selected);

  const toggleSelectAllIndoorServices = () => {
    const targetIds = new Set(filteredIndoorServiceList.map(i => i.id));
    const shouldSelectAll = !isAllIndoorServicesSelected;

    setIndoorServiceList(prev => prev.map(item => {
      if (!targetIds.has(item.id)) return item;

      if (shouldSelectAll) {
        const autoDays = treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 1;
        const dailyRate = Number(item.dailyRate) || 0;
        return {
          ...item,
          selected: true,
          days: autoDays,
          totalAmount: dailyRate * autoDays
        };
      } else {
        return {
          ...item,
          selected: false,
          days: '',
          totalAmount: 0
        };
      }
    }));
  };

  // Active selected items with tick
  const activeTreatments = treatmentList.filter(item => item.selected);
  const activeOutdoorPackages = outdoorPackageList.filter(item => item.selected);
  const activeIndoorServices = indoorServiceList.filter(item => item.selected);

  // Calculations
  const treatmentsGrossSubtotal = activeTreatments.reduce((sum, item) => {
    const u = Number(item.unitCost) || 0;
    const s = item.sessions === '' ? 0 : Number(item.sessions);
    return sum + (u * s);
  }, 0);
  const treatmentsTotalDiscount = activeTreatments.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
  const treatmentsSubtotal = activeTreatments.reduce((sum, item) => sum + (item.totalCost || 0), 0);

  // Per Day & Full Course Detailed Calculations for Treatments
  const numTreatmentDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 1;

  const treatmentsPerDayGross = activeTreatments.reduce((sum, item) => {
    const u = Number(item.unitCost) || 0;
    const dailyS = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
      ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
      : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
    return sum + (u * dailyS);
  }, 0);

  const treatmentsPerDayDiscountAmount = activeTreatments.reduce((sum, item) => {
    const u = Number(item.unitCost) || 0;
    const dailyS = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
      ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
      : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
    const perDayGross = u * dailyS;

    if (patientTreatmentMode === 'indoor' && item.isIndoorFree) {
      return sum + perDayGross;
    }
    if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
      return sum + Math.round((perDayGross * Number(item.outdoorDiscountPercent)) / 100);
    }
    if (patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
      return sum + Math.min(perDayGross, Number(item.outdoorDiscountAmount) * dailyS);
    }
    if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) {
      return sum + Math.min(perDayGross, Number(item.fixedDiscountAmount) * dailyS);
    }
    if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) {
      return sum + Math.round((perDayGross * Number(item.defaultDiscountPercent)) / 100);
    }
    const discPct = item.discountPercent !== '' ? Number(item.discountPercent) : (bulkDiscountPercent !== '' ? Number(bulkDiscountPercent) : 0);
    return sum + Math.round((perDayGross * discPct) / 100);
  }, 0);

  const treatmentsPerDaySubtotal = Math.max(0, treatmentsPerDayGross - treatmentsPerDayDiscountAmount);

  const treatmentsFullTotalDiscount = showFullTreatmentCalculation
    ? treatmentsTotalDiscount
    : (treatmentsPerDayDiscountAmount * numTreatmentDays);

  const treatmentsFullSubtotal = showFullTreatmentCalculation
    ? treatmentsSubtotal
    : (treatmentsPerDaySubtotal * numTreatmentDays);

  // Sync outdoor package dynamic row with Individual Treatments
  useEffect(() => {
    const isOutdoorActive = patientTreatmentMode === 'outdoor';
    const daysText = isOutdoorActive && treatmentDays !== '' && Number(treatmentDays) > 0 ? `${treatmentDays}-Day Package` : '...-Day Package';
    const discountPct = treatmentsGrossSubtotal > 0 
      ? Math.round((treatmentsTotalDiscount / treatmentsGrossSubtotal) * 100) 
      : (bulkDiscountPercent !== '' ? Number(bulkDiscountPercent) : 0);

    setOutdoorPackageList(prev => {
      if (prev.length === 0) {
        return [{
          id: 'pkg-list-single',
          catalogId: 'outdoor_package_single',
          selected: isOutdoorActive,
          packageName: daysText,
          packageType: 'outdoor_package',
          totalBaseCost: isOutdoorActive ? (treatmentsGrossSubtotal > 0 ? treatmentsGrossSubtotal : '') : '',
          discountPercent: isOutdoorActive ? (discountPct > 0 ? discountPct : (bulkDiscountPercent !== '' ? Number(bulkDiscountPercent) : '')) : '',
          discountAmount: isOutdoorActive ? treatmentsTotalDiscount : 0,
          netCost: isOutdoorActive ? treatmentsSubtotal : 0,
          description: 'Outdoor Acupuncture & Therapy Package',
          rateNote: ''
        }];
      }
      return prev.map((item, idx) => {
        if (idx === 0 && !item.isCustom) {
          if (isOutdoorActive) {
            return {
              ...item,
              packageName: daysText,
              totalBaseCost: treatmentsGrossSubtotal > 0 ? treatmentsGrossSubtotal : '',
              discountPercent: discountPct > 0 ? discountPct : (bulkDiscountPercent !== '' ? bulkDiscountPercent : ''),
              discountAmount: treatmentsTotalDiscount,
              netCost: treatmentsSubtotal,
              selected: true
            };
          } else {
            return {
              ...item,
              packageName: '...-Day Package',
              totalBaseCost: '',
              discountPercent: '',
              discountAmount: 0,
              netCost: 0,
              selected: false
            };
          }
        }
        return item;
      });
    });
  }, [patientTreatmentMode, treatmentDays, treatmentsGrossSubtotal, treatmentsTotalDiscount, treatmentsSubtotal, bulkDiscountPercent]);

  const foodChargeTotal = foodChargeSelected
    ? ((foodChargePerDay === '' ? 0 : Number(foodChargePerDay)) * (foodChargeDays === '' ? 0 : Number(foodChargeDays)))
    : 0;

  const outdoorSubtotal = activeOutdoorPackages.reduce((sum, item) => sum + (item.netCost || 0), 0);
  const indoorRoomOnlySubtotal = activeIndoorServices.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  const indoorSubtotal = indoorRoomOnlySubtotal + foodChargeTotal;

  const activeAdditionalTreatments = additionalTreatmentList.filter(item => item.selected);
  const additionalTreatmentsSubtotal = activeAdditionalTreatments.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const isAllAdditionalTreatmentsSelected = additionalTreatmentList.length > 0 && additionalTreatmentList.every(i => i.selected);

  const filteredAdditionalTreatmentList = additionalTreatmentList.filter(item =>
    item.treatmentName.toLowerCase().includes(additionalTreatmentSearch.toLowerCase().trim())
  );

  const toggleSelectAllAdditionalTreatments = () => {
    const shouldSelect = !isAllAdditionalTreatmentsSelected;
    setAdditionalTreatmentList(prev => prev.map(item => {
      let newSessions = item.sessions;
      let newDiscountPercent = item.discountPercent;

      if (shouldSelect) {
        const hasPackageDays = treatmentDays !== '' && Number(treatmentDays) > 0;
        if (item.isRatioBased && hasPackageDays) {
          const daysNum = Number(treatmentDays);
          const per10 = item.sessionsPer10Days || 3;
          newSessions = Math.round((daysNum / 10) * per10);
        } else if (item.sessions === '' || item.sessions === 0) {
          newSessions = 1;
        }
      } else {
        newSessions = '';
        newDiscountPercent = '';
      }

      const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
      const isOutdoorDisc = patientTreatmentMode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0;
      const isOutdoorAmt = patientTreatmentMode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0;
      const isFixedAmt = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;

      const unitCost = Number(item.unitCost) || 0;
      const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
      const gross = unitCost * sessionsNum;

      let discountPctNum: number | '' = newDiscountPercent;
      let discountAmount = 0;

      if (!shouldSelect) {
        discountPctNum = '';
        discountAmount = 0;
      } else if (isIndoorFree) {
        discountPctNum = 100;
        discountAmount = gross;
      } else if (isOutdoorAmt) {
        discountAmount = Math.min(gross, Number(item.outdoorDiscountAmount) * sessionsNum);
        if (gross > 0) discountPctNum = Math.round((discountAmount / gross) * 100);
      } else if (isOutdoorDisc) {
        discountPctNum = Number(item.outdoorDiscountPercent);
        discountAmount = Math.round((gross * discountPctNum) / 100);
      } else if (isFixedAmt) {
        const fixedVal = Number(item.fixedDiscountAmount);
        discountAmount = Math.min(gross, fixedVal * sessionsNum);
        discountPctNum = gross > 0 ? Math.round((discountAmount / gross) * 100) : 0;
      } else {
        const pctNum = discountPctNum === '' ? 0 : Number(discountPctNum);
        discountAmount = Math.round((gross * pctNum) / 100);
      }

      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        selected: shouldSelect,
        sessions: newSessions,
        discountPercent: discountPctNum,
        discountAmount,
        totalCost
      };
    }));
  };

  const indoorRoomPerDaySubtotal = activeIndoorServices.reduce((sum, item) => sum + (item.dailyRate || 0), 0);
  const foodChargePerDaySubtotal = foodChargeSelected ? (foodChargePerDay === '' ? 0 : Number(foodChargePerDay)) : 0;
  const indoorPerDaySubtotal = indoorRoomPerDaySubtotal + foodChargePerDaySubtotal;

  const effectiveIndoorRoomSubtotal = showFullIndoorCalculation
    ? indoorRoomOnlySubtotal
    : indoorRoomPerDaySubtotal;

  const effectiveFoodChargeTotal = showFullIndoorCalculation
    ? foodChargeTotal
    : foodChargePerDaySubtotal;

  const effectiveIndoorSubtotal = showFullIndoorCalculation
    ? indoorSubtotal
    : indoorPerDaySubtotal;

  const effectiveOutdoorSubtotal = patientTreatmentMode === 'outdoor' ? 0 : outdoorSubtotal;
  const actualAdmissionFee = (patientTreatmentMode !== 'outdoor' && includeAdmissionFee) ? Number(admissionFee || 0) : 0;
  const grossTotal = treatmentsSubtotal + effectiveOutdoorSubtotal + effectiveIndoorSubtotal + actualAdmissionFee;

  const overallDiscountAmount = Math.round((grossTotal * Number(overallDiscountPercent || 0)) / 100);
  const grandTotal = Math.max(0, grossTotal - overallDiscountAmount);
  const dueAmount = Math.max(0, grandTotal - Number(advancePaid || 0));

  // Helper function to recalculate cycle payment amounts and day ranges based on cycle days ratio
  const recalculatePhasesByDays = (phases: PaymentPhase[], totalGrand: number): PaymentPhase[] => {
    const totalDaysSum = phases.reduce((sum, p) => sum + (p.daysOrSessions || 0), 0);
    if (totalDaysSum <= 0 || totalGrand <= 0) {
      return phases.map((p, idx) => ({
        ...p,
        amount: totalGrand > 0 ? Math.round(totalGrand / Math.max(1, phases.length)) : 0,
        percentage: Math.round(100 / Math.max(1, phases.length))
      }));
    }

    let runningDay = 1;
    let accumulatedAmt = 0;

    return phases.map((p, idx) => {
      const pDays = Math.max(0, p.daysOrSessions || 0);
      let amt = 0;

      if (idx === phases.length - 1) {
        amt = Math.max(0, totalGrand - accumulatedAmt);
      } else {
        amt = Math.round(totalGrand * (pDays / totalDaysSum));
        accumulatedAmt += amt;
      }

      const startDay = runningDay;
      const endDay = startDay + Math.max(0, pDays - 1);
      runningDay = endDay + 1;

      const pct = Math.round((amt / totalGrand) * 100);
      const ordinal = `${idx + 1}${idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th'}`;

      const updatedTitle = pDays > 0 
        ? `${ordinal} ${pDays}-Days Payment (Day ${startDay}–${endDay})` 
        : p.phaseName;

      return {
        ...p,
        phaseName: updatedTitle,
        daysOrSessions: pDays,
        amount: amt,
        percentage: pct
      };
    });
  };

  const get4CycleDays = (totalDays: number): number[] => {
    if (totalDays <= 0) return [7, 8, 7, 8];
    if (totalDays < 4) {
      const res = [1, 0, 0, 0];
      for (let i = 0; i < totalDays; i++) res[i] = 1;
      return res;
    }
    const base = Math.floor(totalDays / 4);
    const rem = totalDays % 4;
    const cycleDays = [base, base, base, base];
    if (rem === 1) {
      cycleDays[3] += 1;
    } else if (rem === 2) {
      cycleDays[1] += 1;
      cycleDays[3] += 1;
    } else if (rem === 3) {
      cycleDays[1] += 1;
      cycleDays[2] += 1;
      cycleDays[3] += 1;
    }
    return cycleDays;
  };

  // Auto-recalculate Payment Phases when grandTotal, paymentPlanMode, or treatmentDays changes
  useEffect(() => {
    if (grandTotal <= 0) {
      setPaymentPhases([]);
      return;
    }

    const totalDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 30;

    if (paymentPlanMode === '4_cycles') {
      const cycleDaysArr = get4CycleDays(totalDays);
      const phases: PaymentPhase[] = [];
      let runningDay = 1;

      for (let i = 0; i < cycleDaysArr.length; i++) {
        const cDays = cycleDaysArr[i];
        const startDay = runningDay;
        const endDay = startDay + Math.max(0, cDays - 1);
        runningDay = endDay + 1;

        const ordinal = `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`;
        phases.push({
          id: `phase-4c-${i + 1}`,
          phaseName: `${ordinal} ${cDays}-Days Payment (Day ${startDay}–${endDay})`,
          daysOrSessions: cDays,
          amount: 0,
          percentage: 0,
          notes: i === 0 ? 'Initial course starting installment' : `Cycle ${i + 1} treatment cycle payment`
        });
      }
      setPaymentPhases(recalculatePhasesByDays(phases, grandTotal));
    } else if (paymentPlanMode === '10_day_cycles') {
      const numPhases = Math.max(1, Math.ceil(totalDays / 10));
      const phases: PaymentPhase[] = [];
      for (let i = 0; i < numPhases; i++) {
        const startDay = (i * 10) + 1;
        const endDay = Math.min((i + 1) * 10, totalDays);
        const cycleDays = endDay - startDay + 1;

        phases.push({
          id: `phase-10d-${i + 1}`,
          phaseName: i === 0 
            ? `1st ${cycleDays}-Days Payment (Day ${startDay}–${endDay})` 
            : `${i + 1}${i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} ${cycleDays}-Days Payment (Day ${startDay}–${endDay})`,
          daysOrSessions: cycleDays,
          amount: 0,
          percentage: 0,
          notes: i === 0 ? 'Initial course starting installment' : `Cycle ${i + 1} treatment cycle payment`
        });
      }
      setPaymentPhases(recalculatePhasesByDays(phases, grandTotal));
    } else if (paymentPlanMode === '15_day_cycles') {
      const numPhases = Math.max(1, Math.ceil(totalDays / 15));
      const phases: PaymentPhase[] = [];
      for (let i = 0; i < numPhases; i++) {
        const startDay = (i * 15) + 1;
        const endDay = Math.min((i + 1) * 15, totalDays);
        const cycleDays = endDay - startDay + 1;

        phases.push({
          id: `phase-15d-${i + 1}`,
          phaseName: i === 0 
            ? `1st ${cycleDays}-Days Payment (Day ${startDay}–${endDay})` 
            : `${i + 1}${i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} ${cycleDays}-Days Payment (Day ${startDay}–${endDay})`,
          daysOrSessions: cycleDays,
          amount: 0,
          percentage: 0,
          notes: i === 0 ? '1st half treatment installment' : '2nd half treatment installment'
        });
      }
      setPaymentPhases(recalculatePhasesByDays(phases, grandTotal));
    } else if (paymentPlanMode === 'full') {
      setPaymentPhases([{
        id: 'phase-full-1',
        phaseName: '1-Time Full Payment',
        daysOrSessions: totalDays,
        amount: grandTotal,
        percentage: 100,
        notes: 'Full payment upon enrollment'
      }]);
    } else if (paymentPlanMode === 'custom_phases') {
      if (paymentPhases.length === 0) {
        const initialPhases: PaymentPhase[] = [
          {
            id: `phase-custom-1`,
            phaseName: '1st Cycle Payment',
            daysOrSessions: Math.ceil(totalDays / 2),
            amount: 0,
            percentage: 50,
            notes: 'Advance at course start'
          },
          {
            id: `phase-custom-2`,
            phaseName: '2nd Cycle Payment',
            daysOrSessions: Math.floor(totalDays / 2),
            amount: 0,
            percentage: 50,
            notes: 'Remaining balance midway'
          }
        ];
        setPaymentPhases(recalculatePhasesByDays(initialPhases, grandTotal));
      } else {
        setPaymentPhases(prev => recalculatePhasesByDays(prev, grandTotal));
      }
    }
  }, [grandTotal, paymentPlanMode, treatmentDays]);

  const updatePaymentPhase = (id: string, fields: Partial<PaymentPhase>) => {
    setPaymentPhases(prev => {
      const targetIdx = prev.findIndex(p => p.id === id);
      if (targetIdx === -1) return prev;

      // When daysOrSessions is changed, auto-distribute remaining course days among other cycles
      if (fields.daysOrSessions !== undefined) {
        const numCycles = prev.length;
        const totalCourseDays = (treatmentDays !== '' && Number(treatmentDays) > 0)
          ? Number(treatmentDays)
          : (prev.reduce((s, p) => s + (p.daysOrSessions || 0), 0) || 30);

        if (numCycles <= 1) {
          const updated = prev.map(p => p.id === id ? { ...p, ...fields, daysOrSessions: totalCourseDays } : p);
          return recalculatePhasesByDays(updated, grandTotal);
        }

        const newDaysForTarget = Math.max(0, Math.min(totalCourseDays, fields.daysOrSessions));
        const remainingDays = Math.max(0, totalCourseDays - newDaysForTarget);
        const otherCyclesCount = numCycles - 1;

        const baseOtherDays = Math.floor(remainingDays / otherCyclesCount);
        let remOtherDays = remainingDays % otherCyclesCount;

        const updatedWithDays = prev.map((p) => {
          if (p.id === id) {
            return { ...p, ...fields, daysOrSessions: newDaysForTarget };
          } else {
            let bonus = 0;
            if (remOtherDays > 0) {
              bonus = 1;
              remOtherDays--;
            }
            return {
              ...p,
              daysOrSessions: baseOtherDays + bonus
            };
          }
        });

        return recalculatePhasesByDays(updatedWithDays, grandTotal);
      }

      if (fields.amount !== undefined) {
        const isCleared = fields.amount === '';
        const newAmt = isCleared ? '' : Math.max(0, Number(fields.amount));
        const numericAmt = isCleared ? 0 : Number(newAmt);
        const numCycles = prev.length;

        if (numCycles <= 1) {
          return prev.map(p => p.id === id ? {
            ...p,
            ...fields,
            amount: newAmt,
            percentage: grandTotal > 0 ? Math.round((numericAmt / grandTotal) * 100) : 0
          } : p);
        }

        const updated = prev.map((p, idx) => {
          if (idx === targetIdx) {
            const pct = grandTotal > 0 ? Math.round((numericAmt / grandTotal) * 100) : 0;
            return { ...p, ...fields, amount: newAmt, percentage: pct };
          }
          return { ...p };
        });

        if (targetIdx < numCycles - 1) {
          let sumFixed = 0;
          for (let i = 0; i <= targetIdx; i++) {
            const a = updated[i].amount;
            sumFixed += (a === '' ? 0 : Number(a));
          }
          const remTotal = Math.max(0, grandTotal - sumFixed);
          const subsequentCount = numCycles - 1 - targetIdx;
          const base = Math.floor(remTotal / subsequentCount);
          const rem = remTotal - (base * subsequentCount);

          for (let i = targetIdx + 1; i < numCycles; i++) {
            const amt = base + (i === targetIdx + 1 ? rem : 0);
            const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
            updated[i] = {
              ...updated[i],
              amount: amt,
              percentage: pct
            };
          }
        } else {
          const remTotal = Math.max(0, grandTotal - numericAmt);
          const priorCount = numCycles - 1;
          const base = Math.floor(remTotal / priorCount);
          const rem = remTotal - (base * priorCount);

          for (let i = 0; i < targetIdx; i++) {
            const amt = base + (i === 0 ? rem : 0);
            const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
            updated[i] = {
              ...updated[i],
              amount: amt,
              percentage: pct
            };
          }
        }

        return updated;
      } else {
        return prev.map(p => p.id === id ? { ...p, ...fields } : p);
      }
    });
  };

  const distributeDaysEqually = (totalDays: number, count: number): number[] => {
    if (count <= 0) return [];
    if (totalDays <= 0) return new Array(count).fill(0);
    const base = Math.floor(totalDays / count);
    const rem = totalDays % count;
    const daysArr = new Array(count).fill(base);
    for (let i = 0; i < rem; i++) {
      daysArr[count - 1 - i] += 1;
    }
    return daysArr;
  };

  const addCustomPhase = () => {
    setPaymentPhases(prev => {
      const newCount = prev.length + 1;
      const totalCourseDays = (treatmentDays !== '' && Number(treatmentDays) > 0)
        ? Number(treatmentDays)
        : (prev.reduce((s, p) => s + (p.daysOrSessions || 0), 0) || 30);

      const splitDaysArr = distributeDaysEqually(totalCourseDays, newCount);

      const updatedPhases: PaymentPhase[] = [];
      for (let i = 0; i < newCount; i++) {
        const nextNum = i + 1;
        const days = splitDaysArr[i];
        if (i < prev.length) {
          updatedPhases.push({
            ...prev[i],
            daysOrSessions: days,
          });
        } else {
          updatedPhases.push({
            id: `phase-custom-${Date.now()}`,
            phaseName: `${nextNum}${nextNum === 1 ? 'st' : nextNum === 2 ? 'nd' : nextNum === 3 ? 'rd' : 'th'} Payment Cycle`,
            daysOrSessions: days,
            amount: 0,
            percentage: 0,
            notes: 'Custom installment cycle'
          });
        }
      }

      return recalculatePhasesByDays(updatedPhases, grandTotal);
    });
  };

  const removeCustomPhase = (id: string) => {
    setPaymentPhases(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (filtered.length === 0) return [];

      const totalCourseDays = (treatmentDays !== '' && Number(treatmentDays) > 0)
        ? Number(treatmentDays)
        : (prev.reduce((s, p) => s + (p.daysOrSessions || 0), 0) || 30);

      const splitDaysArr = distributeDaysEqually(totalCourseDays, filtered.length);

      const updatedPhases = filtered.map((p, idx) => ({
        ...p,
        daysOrSessions: splitDaysArr[idx]
      }));

      return recalculatePhasesByDays(updatedPhases, grandTotal);
    });
  };

  // Build Invoice Object
  const generateQuotationData = (): InvoiceQuotation => {
    const dateStr = new Date().toISOString().split('T')[0];
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + 7);

    const formattedTreatments: IndividualTreatment[] = activeTreatments.map(t => ({
      id: t.id,
      treatmentName: t.treatmentName,
      unitCost: t.unitCost,
      sessions: t.sessions === '' ? 1 : Number(t.sessions),
      discountPercent: t.discountPercent === '' ? 0 : Number(t.discountPercent),
      discountAmount: t.discountAmount,
      totalCost: t.totalCost
    }));

    const formattedOutdoorPackages: OutdoorPackage[] = activeOutdoorPackages.map(p => ({
      id: p.id,
      packageType: p.packageType || 'custom',
      packageName: p.packageName,
      totalBaseCost: p.totalBaseCost,
      discountPercent: p.discountPercent === '' ? 0 : Number(p.discountPercent),
      discountAmount: p.discountAmount,
      netCost: p.netCost,
      description: p.description || ''
    }));

    const formattedIndoorServices: IndoorService[] = activeIndoorServices.map(i => {
      const iDays = showFullIndoorCalculation ? (i.days === '' ? 1 : Number(i.days)) : 1;
      const iTotal = showFullIndoorCalculation ? (i.totalAmount || 0) : (i.dailyRate || 0);
      return {
        id: i.id,
        roomType: i.roomType,
        dailyRate: i.dailyRate,
        days: iDays,
        totalAmount: iTotal,
        remarks: i.remarks || ''
      };
    });

    const formattedAdditionalTreatments: AdditionalTreatment[] = activeAdditionalTreatments.map(a => ({
      id: a.id,
      treatmentName: a.treatmentName,
      unitCost: a.unitCost,
      sessions: a.sessions === '' ? 1 : Number(a.sessions),
      discountPercent: a.discountPercent === '' ? 0 : Number(a.discountPercent),
      discountAmount: a.discountAmount,
      totalCost: a.totalCost,
      isRatioBased: a.isRatioBased,
      sessionsPer10Days: a.sessionsPer10Days,
      description: a.description || ''
    }));

    if (foodChargeSelected) {
      const fcDays = showFullIndoorCalculation ? (foodChargeDays === '' ? 1 : Number(foodChargeDays)) : 1;
      const fcRate = foodChargePerDay === '' ? 0 : Number(foodChargePerDay);
      const fcTotal = showFullIndoorCalculation ? (foodChargeTotal || 0) : fcRate;
      if (fcTotal > 0 || fcRate > 0) {
        formattedIndoorServices.push({
          id: 'food-charge-3x',
          roomType: 'Food Charge 3 Times',
          dailyRate: fcRate,
          days: fcDays,
          totalAmount: fcTotal,
          remarks: '3 Times Daily Meals'
        });
      }
    }

    // Calculate existing visit count for this patient
    const pPhone = selectedPatient?.phone || '01700000000';
    const existingCount = quotations.filter(q => 
      (q.patientPhone && q.patientPhone !== '01700000000' && q.patientPhone === pPhone) || 
      (q.patientName.toLowerCase() === selectedPatient?.name.toLowerCase())
    ).length;

    const nextVisitNumber = editingQuotation ? (editingQuotation.visitNumber || 1) : (existingCount + 1);
    const getOrdinalSuffix = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const visitLabel = editingQuotation ? (editingQuotation.visitLabel || `${getOrdinalSuffix(nextVisitNumber).toUpperCase()} INVOICE`) : `${getOrdinalSuffix(nextVisitNumber).toUpperCase()} INVOICE`;

    return {
      id: editingQuotation ? editingQuotation.id : `quot-${Date.now()}`,
      quotationNumber: editingQuotation ? editingQuotation.quotationNumber : `SXH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: selectedPatient?.id || 'walkin',
      patientName: selectedPatient?.name || 'Walk-in Patient',
      patientPhone: pPhone,
      patientAge: selectedPatient?.age,
      patientGender: selectedPatient?.gender,
      doctorName: billingDoctor.trim() || currentUser?.name || selectedPatient?.doctorName || 'Senior Consultant',
      createdDate: editingQuotation ? editingQuotation.createdDate : dateStr,
      validUntil: validUntilDate.toISOString().split('T')[0],
      visitNumber: nextVisitNumber,
      visitLabel: visitLabel,
      patientTreatmentMode: patientTreatmentMode,

      treatments: formattedTreatments,
      treatmentsSubtotal,

      outdoorPackages: formattedOutdoorPackages,
      outdoorSubtotal,

      indoorServices: formattedIndoorServices,
      indoorSubtotal: effectiveIndoorSubtotal,

      additionalTreatments: formattedAdditionalTreatments,
      additionalTreatmentsSubtotal,

      admissionFee: Number(admissionFee || 0),
      consultationFee: 0,
      investigationFee: 0,
      overallDiscountPercent: Number(overallDiscountPercent || 0),
      overallDiscountAmount,

      grossTotal,
      grandTotal,
      advancePaid: Number(advancePaid || 0),
      dueAmount,

      paymentPlanMode,
      paymentPhases,

      paymentStatus,
      notes,
      createdBy: currentUser?.name ? `${currentUser.name} (${currentUser.role})` : 'Billing Counter Staff',
      packageComparison: savedComparisonSnapshot || {
        showOutdoor: patientTreatmentMode === 'outdoor' || patientTreatmentMode === '',
        showIndoor: patientTreatmentMode === 'indoor' || patientTreatmentMode === '',
        foodChargeSelected,
        foodChargePerDay: Number(foodChargePerDay || 500),
        includeAdmissionFee,
        admissionFee: Number(admissionFee || 1000),
        comparedAt: new Date().toISOString()
      }
    };
  };

  const handleSave = () => {
    if (!selectedPatient) {
      alert('Please select or search a patient first!');
      return;
    }
    const quot = generateQuotationData();
    onSaveQuotation(quot);
    if (editingQuotation && onCancelEdit) {
      onCancelEdit();
    }
    clearFormAndDraftState();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handlePrint = () => {
    if (!selectedPatient) {
      alert('Please select a patient first!');
      return;
    }
    const quot = generateQuotationData();
    onSaveQuotation(quot);
    onPreviewPrint(quot);
    if (editingQuotation && onCancelEdit) {
      onCancelEdit();
    }
    clearFormAndDraftState();
  };

  return (
    <>
      <div className="space-y-8 print:hidden">

      {/* Editing Quotation Notification Banner */}
      {editingQuotation && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-amber-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-white shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider bg-black/25 px-2.5 py-0.5 rounded-full">
                  Editing Mode
                </span>
                <span className="font-mono text-xs font-bold text-amber-100">
                  {editingQuotation.quotationNumber}
                </span>
                {editingQuotation.visitLabel && (
                  <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                    {editingQuotation.visitLabel}
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                Editing Invoice for {editingQuotation.patientName} ({editingQuotation.patientPhone})
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                Make your modifications below. Clicking "Save Quotation" or "Preview & Print" will update this invoice.
              </p>
            </div>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="bg-white/90 hover:bg-white text-slate-900 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
            >
              Cancel Edit
            </button>
          )}
        </div>
      )}
      
      {/* Patient Selection Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Step 1: Select Patient</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h2 className="text-2xl font-black text-slate-900">
                {editingQuotation ? 'Update Invoice & Quotation' : 'Invoice Quotation Builder'}
              </h2>
              {isDraftRestored && !editingQuotation && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  Draft Restored
                </span>
              )}
              <button
                type="button"
                onClick={handleResetDraft}
                title="Clear form inputs"
                className="text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors ml-1 cursor-pointer"
              >
                {editingQuotation ? 'Reset Form' : 'Clear Form'}
              </button>
            </div>
          </div>

          {/* Quick Phone Search Form with Multi-Patient Dropdown */}
          <div className="relative w-full md:w-auto">
            <form onSubmit={handlePhoneSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <input
                  type="text"
                  placeholder="Search patient by mobile or name..."
                  value={phoneSearch}
                  onChange={(e) => handlePatientSearchChange(e.target.value)}
                  onFocus={() => {
                    if (phoneSearch.trim().length > 0 && matchingPatients.length > 0) {
                      setIsPatientDropdownOpen(true);
                    }
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
                <UserSearch className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                {phoneSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneSearch('');
                      setMatchingPatients([]);
                      setIsPatientDropdownOpen(false);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isSearchingLive}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 text-white text-xs font-bold px-4 py-2 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                {isSearchingLive ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{isSearchingLive ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {/* Patient Selection Dropdown if multiple or matching appointments found */}
            {isPatientDropdownOpen && matchingPatients.length > 0 && (
              <div className="absolute right-0 top-full mt-2 w-full md:w-96 bg-white border border-slate-300 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold">
                      {matchingPatients.length} Patient Appointment{matchingPatients.length > 1 ? 's' : ''} Found
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPatientDropdownOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2 text-[11px] text-slate-600 bg-slate-50 border-b border-slate-200">
                  Select the specific patient/appointment to generate invoice quotation:
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {matchingPatients.map((pat, idx) => {
                    const isSelected = selectedPatient?.id === pat.id;
                    return (
                      <div
                        key={pat.id || `pat-${idx}`}
                        onClick={() => handleSelectPatient(pat)}
                        className={`p-3 transition-colors cursor-pointer hover:bg-emerald-50/80 flex items-start justify-between gap-3 ${isSelected ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''}`}
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{pat.name}</span>
                            {pat.serialNo && (
                              <span className="bg-slate-200 text-slate-700 text-[10px] font-mono px-1.5 py-0.2 rounded font-bold">
                                #{pat.serialNo}
                              </span>
                            )}
                            {pat.gender && (
                              <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.2 rounded">
                                {pat.gender}{pat.age ? `, ${pat.age}y` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="font-semibold text-emerald-700">📱 {pat.phone}</span>
                            {pat.doctorName && <span className="text-slate-600">🩺 {pat.doctorName}</span>}
                            {pat.appointmentDate && (
                              <span className="text-slate-500">📅 {pat.appointmentDate} {pat.appointmentTime || ''}</span>
                            )}
                          </div>
                          {(pat.notes || pat.remark) && (
                            <p className="text-[10px] text-slate-500 italic line-clamp-1">
                              📝 {pat.notes || pat.remark}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPatient(pat);
                          }}
                          className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white hover:bg-emerald-600 hover:text-white text-emerald-700 border-emerald-300'
                          }`}
                        >
                          {isSelected ? '✓ Selected' : 'Select'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Patient Card */}
        {selectedPatient ? (
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-inner flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Active Patient Selected</p>
                {selectedPatient.serialNo && (
                  <span className="text-[10px] bg-slate-800 text-emerald-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                    Serial #{selectedPatient.serialNo}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>{selectedPatient.name}</span>
                {selectedPatient.gender && (
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-normal">
                    {selectedPatient.gender}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-300 flex flex-wrap items-center gap-3">
                <span className="font-bold text-emerald-300">Mobile: {selectedPatient.phone}</span>
                {selectedPatient.age && <span>• Age: {selectedPatient.age} Yrs</span>}
                {selectedPatient.appointmentDate && (
                  <span className="text-slate-400">• Appt: {selectedPatient.appointmentDate} {selectedPatient.appointmentTime || ''}</span>
                )}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs text-slate-300 font-medium">Consulting Doctor:</span>
                <span className="bg-slate-950 text-emerald-300 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-bold shadow-2xs">
                  {billingDoctor || 'Hospital System Admin'}
                </span>
              </div>

              {/* Show multiple appointments badge if same phone has multiple appointments */}
              {patients.filter(p => p.phone === selectedPatient.phone).length > 1 && (
                <div className="pt-2 flex items-center gap-2">
                  <span className="text-[11px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                    <Users className="w-3 h-3 text-amber-400" />
                    {patients.filter(p => p.phone === selectedPatient.phone).length} appointments registered with this mobile
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allForPhone = patients.filter(p => p.phone === selectedPatient.phone);
                      setMatchingPatients(allForPhone);
                      setIsPatientDropdownOpen(true);
                    }}
                    className="text-[11px] text-emerald-300 hover:text-emerald-200 underline font-bold cursor-pointer"
                  >
                    Switch Patient / Appointment
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-xl border border-slate-700 font-semibold">
                Status: {selectedPatient.status}
              </span>
              <button
                onClick={() => setSelectedPatient(null)}
                className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium px-2 py-1 cursor-pointer"
              >
                Change Patient
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs flex items-center gap-3">
            <UserSearch className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold">No Patient Selected Yet</p>
              <p className="text-xs text-amber-700">
                Search by phone number in the search box above or click "Create Quotation" on any patient in the Appointments list.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* THREE CORE SECTIONS */}

      {/* SECTION 1: Individual Treatments & Therapies List */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs">
              1
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>1. Individual Treatments & Therapies</span>
                <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Catalog List Mode
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                System admin catalog treatments listed below. Select items and manually enter sessions and discounts for invoice quotation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Eye Icon Toggle Button for Full Package vs Per Day Cost mode */}
            <button
              type="button"
              onClick={toggleTreatmentCalculationMode}
              className={`p-2 rounded-xl border transition-all cursor-pointer shadow-2xs flex items-center justify-center ${
                showFullTreatmentCalculation
                  ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border-slate-300'
              }`}
              title={showFullTreatmentCalculation ? 'Toggle Day View' : 'Toggle Full View'}
            >
              {showFullTreatmentCalculation ? (
                <Eye className="w-4 h-4 text-slate-600 shrink-0" />
              ) : (
                <EyeOff className="w-4 h-4 text-amber-600 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Patient Type & Treatment Duration Control Bar for Auto Sessions */}
        <div className="bg-gradient-to-r from-emerald-50/80 via-slate-50 to-indigo-50/80 border border-emerald-200/80 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-3.5">
            
            {/* Patient Type Checkboxes: Outdoor & Indoor */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Patient Type:</span>
              </span>

              <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${
                patientTreatmentMode === 'outdoor'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
              }`}>
                <input
                  type="checkbox"
                  checked={patientTreatmentMode === 'outdoor'}
                  onChange={() => {
                    const nextMode = patientTreatmentMode === 'outdoor' ? '' : 'outdoor';
                    handlePatientModeChange(nextMode);
                  }}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span>Outdoor Patient</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${
                patientTreatmentMode === 'indoor'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
              }`}>
                <input
                  type="checkbox"
                  checked={patientTreatmentMode === 'indoor'}
                  onChange={() => {
                    const nextMode = patientTreatmentMode === 'indoor' ? '' : 'indoor';
                    handlePatientModeChange(nextMode);
                  }}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
                <span>Indoor Patient</span>
              </label>
            </div>

            {/* Treatment Package & Bulk Discount Input Fields */}
            <div className="flex flex-wrap items-center gap-3.5 border-l border-slate-200/80 pl-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-800 whitespace-nowrap">
                  Treatment Package:
                </label>
                <div className="flex items-center gap-1.5" title={!patientTreatmentMode ? "Please select Outdoor or Indoor Patient type first" : ""}>
                  {(['30 Days', '15 Days', 'Per Day'] as const).map((pkg) => {
                    const isSelected = treatmentPackage === pkg;
                    return (
                      <button
                        key={pkg}
                        type="button"
                        disabled={!patientTreatmentMode}
                        onClick={() => handlePackageSelect(pkg)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : patientTreatmentMode
                            ? 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50'
                            : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                        }`}
                      >
                        {pkg}
                      </button>
                    );
                  })}
                </div>

                {/* Day Input Field - opens when 'Per Day' package is selected */}
                {treatmentPackage === 'Per Day' && (
                  <div className="relative w-28 ml-1 animate-fadeIn" title={!patientTreatmentMode ? "Please select Outdoor or Indoor Patient type first" : ""}>
                    <input
                      type="number"
                      min={1}
                      disabled={!patientTreatmentMode}
                      placeholder="Days"
                      value={treatmentDays}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                        handlePerDayDaysInputChange(val);
                      }}
                      className="w-full pl-3 pr-9 py-1.5 border border-emerald-400 bg-white text-slate-900 font-bold text-xs text-center rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                    <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-bold">Days</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 border-l border-slate-200/80 pl-3.5">
                <label className="text-xs font-bold text-slate-800 whitespace-nowrap">
                  Discount (%):
                </label>
                <div className="relative w-24" title={!patientTreatmentMode ? "Please select Outdoor or Indoor Patient type first" : ""}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!patientTreatmentMode}
                    placeholder="0"
                    value={bulkDiscountPercent === 0 || bulkDiscountPercent === '' ? '' : bulkDiscountPercent}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                      handleBulkDiscountChange(val);
                    }}
                    onFocus={(e) => e.target.select()}
                    className={`w-full pl-3 pr-6 py-1.5 border rounded-xl text-xs font-bold text-center shadow-2xs transition-colors ${
                      patientTreatmentMode
                        ? 'bg-white border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-500'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                    }`}
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-amber-600 font-bold">%</span>
                </div>
              </div>

              {/* Compare Packages Button */}
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer border border-amber-400/30 ml-auto"
                title="Compare costs and savings across Outdoor/Indoor and 30-Day/15-Day/Per-Day packages"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Compare Package Costs</span>
              </button>
            </div>

          </div>

          {/* Active Auto-Calculation Notice */}
          {patientTreatmentMode && (
            <div className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border flex items-center justify-between flex-wrap gap-2 transition-all ${
              showFullTreatmentCalculation
                ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300/80'
                : 'bg-amber-100/90 text-amber-950 border-amber-300/80'
            }`}>
              <span>
                {showFullTreatmentCalculation ? (
                  <>
                    ✨ Sessions auto-calculated for <strong className="uppercase underline text-emerald-950">{patientTreatmentMode}</strong> patient for <strong>{treatmentDays || 1} Days</strong>
                    {treatmentPackage ? ` (Package: ${treatmentPackage}${bulkDiscountPercent !== '' ? ` | Discount: ${bulkDiscountPercent}%` : ''})` : ''}.
                  </>
                ) : (
                  <>
                    👁️ <strong>Daily Cost Focus Mode Active:</strong> Displaying <strong>Per Day (1-Day)</strong> sessions & cost for initial patient counseling
                    {treatmentPackage ? ` (Active Package Context: ${treatmentPackage} | ${patientTreatmentMode.toUpperCase()})` : ''}.
                  </>
                )}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold shadow-2xs ${
                showFullTreatmentCalculation
                  ? 'bg-white text-emerald-800'
                  : 'bg-amber-500 text-white'
              }`}>
                {showFullTreatmentCalculation ? 'Full Course Active' : '1-Day View Active'}
              </span>
            </div>
          )}
        </div>

        {/* Treatment List Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-3 w-16 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      checked={isAllTreatmentsSelected}
                      onChange={toggleSelectAllTreatments}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                      title="Select / Deselect All Treatments"
                    />
                  </div>
                </th>
                <th className="p-3">SL & Treatment Name</th>
                <th className="p-3 w-32">Unit Price (BDT)</th>
                <th className="p-3 w-36 text-center">{showFullTreatmentCalculation ? 'Total Sessions' : 'Per Day Session'}</th>
                <th className="p-3 w-24 text-center">Discount (%)</th>
                <th className="p-3 w-28 text-center">Discount (BDT)</th>
                <th className="p-3 w-32 text-right">{showFullTreatmentCalculation ? 'Total Cost' : 'Per Day Cost'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTreatmentList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-xs font-medium">
                    No treatment matching "{treatmentSearch}".
                  </td>
                </tr>
              ) : (
                filteredTreatmentList.map((item, idx) => {
                  const isChecked = item.selected;
                  return (
                    <tr 
                      key={item.id ? `${item.id}-${idx}` : `tr-${idx}`} 
                      onClick={() => toggleTreatmentSelection(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked 
                          ? 'bg-emerald-50/80 font-medium' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTreatmentSelection(item.id)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        />
                      </td>

                      {/* SL & Name */}
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 text-xs w-6">
                              {idx + 1}.
                            </span>
                            {item.isCustom ? (
                              <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={item.treatmentName}
                                  onChange={(e) => updateTreatmentItem(item.id, { treatmentName: e.target.value })}
                                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 w-full"
                                />
                                <button
                                  onClick={() => removeCustomTreatmentItem(item.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer shrink-0"
                                  title="Remove custom item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-xs font-bold ${isChecked ? 'text-emerald-950' : 'text-slate-800'}`}>
                                  {item.treatmentName}
                                </span>
                                {isChecked && item.isIndoorFree && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                      patientTreatmentMode === 'indoor'
                                        ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                    title={patientTreatmentMode === 'indoor' ? 'Indoor Patient - 100% Free Treatment' : 'Free for Indoor Patients'}
                                  >
                                    🎁 {patientTreatmentMode === 'indoor' ? 'Indoor 100% Free' : 'Free for Indoor'}
                                  </span>
                                )}
                                {isChecked && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0 && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                      patientTreatmentMode === 'outdoor'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                    title={`Outdoor Discount: ${item.outdoorDiscountPercent}% Off`}
                                  >
                                    🏷️ Outdoor {item.outdoorDiscountPercent}% Off
                                  </span>
                                )}
                                {isChecked && item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 bg-emerald-100 text-emerald-900 border-emerald-300"
                                    title={`Fixed Discount: BDT ${item.fixedDiscountAmount}`}
                                  >
                                    🏷️ Fixed BDT {item.fixedDiscountAmount.toLocaleString()} Off
                                  </span>
                                )}
                                {isChecked && item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0 && (!item.fixedDiscountAmount || Number(item.fixedDiscountAmount) === 0) && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 bg-emerald-100 text-emerald-900 border-emerald-300"
                                    title={`Fixed Discount: ${item.defaultDiscountPercent}% Off`}
                                  >
                                    🏷️ Fixed {item.defaultDiscountPercent}% Off
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {item.isCustom ? (
                            <input
                              type="text"
                              placeholder="Treatment details..."
                              value={item.description || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateTreatmentItem(item.id, { description: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:border-emerald-400"
                            />
                          ) : (
                            item.description && (
                              <p className="text-[11px] text-slate-500 font-medium pl-8">
                                {item.description}
                              </p>
                            )
                          )}
                        </div>
                      </td>

                      {/* Unit Price - Read-only from catalog for standard items */}
                      <td className="p-3">
                        {item.isCustom ? (
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                            <input
                              type="number"
                              value={item.unitCost === 0 || item.unitCost === '' ? '' : item.unitCost}
                              onChange={(e) => updateTreatmentItem(item.id, { unitCost: Number(e.target.value) })}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="w-full pl-8 pr-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 inline-flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 font-semibold">BDT</span>
                              <span>{(item.unitCost || 0).toLocaleString()}</span>
                            </div>
                            {item.rateNote && (
                              <p className="text-[10px] text-slate-500 font-medium px-0.5">
                                {item.rateNote}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Sessions - Manual Entry */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          placeholder="0"
                          value={item.sessions === 0 || item.sessions === '' ? '' : item.sessions}
                          onChange={(e) => updateTreatmentItem(item.id, { sessions: e.target.value === '' ? '' : Number(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                            isChecked
                              ? 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-emerald-500'
                          }`}
                        />
                      </td>

                      {/* Discount (%) - Manual Entry */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {isChecked && patientTreatmentMode === 'indoor' && item.isIndoorFree ? (
                          <div
                            className="bg-indigo-100/80 border border-indigo-300 text-indigo-900 rounded-lg py-1 px-1 text-[11px] font-black text-center shadow-2xs"
                            title="Indoor patients get this treatment 100% free"
                          >
                            100% Free
                          </div>
                        ) : isChecked && item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 ? (
                          <div
                            className="bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg py-1 px-1 text-[10px] font-black text-center shadow-2xs cursor-default flex items-center justify-center gap-0.5 whitespace-nowrap"
                            title={`Fixed Discount Tag: BDT ${Number(item.fixedDiscountAmount).toLocaleString()}`}
                          >
                            <span>🏷️</span>
                            <span>Fixed BDT {Number(item.fixedDiscountAmount).toLocaleString()}</span>
                          </div>
                        ) : isChecked && item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0 ? (
                          <div
                            className="bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg py-1 px-1 text-[10px] font-black text-center shadow-2xs cursor-default flex items-center justify-center gap-0.5 whitespace-nowrap"
                            title={`Fixed Discount Tag: ${Number(item.defaultDiscountPercent)}%`}
                          >
                            <span>🏷️</span>
                            <span>Fixed {Number(item.defaultDiscountPercent)}%</span>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0"
                              value={item.discountPercent === 0 || item.discountPercent === '' ? '' : item.discountPercent}
                              onChange={(e) => updateTreatmentItem(item.id, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
                              onFocus={(e) => e.target.select()}
                              className={`w-full pr-5 pl-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                                isChecked
                                  ? 'bg-white border-slate-300 text-amber-900 focus:ring-2 focus:ring-emerald-500'
                                  : 'bg-slate-50 border-slate-200 text-amber-800 focus:ring-2 focus:ring-emerald-500'
                              }`}
                            />
                            <span className="absolute right-1.5 top-1.5 text-amber-600 text-[10px] font-bold">%</span>
                          </div>
                        )}
                      </td>

                      {/* Discount Amount */}
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold ${item.discountAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          -BDT {(item.discountAmount || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Total Cost */}
                      <td className="p-3 text-right">
                        <span className={`text-xs font-black ${isChecked ? 'text-emerald-700 text-sm' : 'text-slate-400'}`}>
                          BDT {(item.totalCost || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detailed Breakdown Bar (Per Day Discount, Per Day Subtotal, Total Discount, Treatments Subtotal) */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-medium pb-2.5 border-b border-slate-200">
            <div>
              Selected treatments: <span className="font-bold text-emerald-800">{activeTreatments.length}</span> of {treatmentList.length} items
            </div>
            <div className="text-[11px] bg-emerald-100/80 text-emerald-900 font-bold px-2.5 py-0.5 rounded-md border border-emerald-300">
              Package Duration: {numTreatmentDays} Days ({patientTreatmentMode ? patientTreatmentMode.toUpperCase() : 'NO TYPE'})
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end items-stretch gap-3">
            {/* 1. Dynamic Discount Card (Highlighted) */}
            <div className="bg-amber-50 p-3 px-4 rounded-xl border border-amber-200/90 shadow-2xs flex flex-col justify-between min-w-[200px] sm:min-w-[220px]">
              <div className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">
                {showFullTreatmentCalculation ? `Total Discount (${numTreatmentDays} Days)` : 'Per Day Discount Amount'}
              </div>
              <div className="text-sm sm:text-base font-black text-rose-600 mt-1">
                -BDT {(showFullTreatmentCalculation ? treatmentsFullTotalDiscount : treatmentsPerDayDiscountAmount).toLocaleString()}
              </div>
            </div>

            {/* 2. Dynamic Subtotal Card (White Background) */}
            <div className="bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between min-w-[200px] sm:min-w-[220px]">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {showFullTreatmentCalculation ? `Treatments Subtotal (${numTreatmentDays} Days)` : 'Per Day Subtotal'}
              </div>
              <div className="text-sm sm:text-base font-black text-slate-900 mt-1">
                BDT {(showFullTreatmentCalculation ? treatmentsFullSubtotal : treatmentsPerDaySubtotal).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

      </div>


      {/* SECTION 2: PAYMENT CYCLE & COUNSELING SCHEDULE BREAKDOWN CARD */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-300 space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-2xs">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>2. Payment Cycle & Counseling Schedule</span>
                <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full border border-emerald-300 uppercase tracking-wider">
                  Counseling Tool
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Select an automatic or custom installment schedule to present manageable payment steps during patient counseling.
              </p>
            </div>
          </div>

          {/* Cycle Mode Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setPaymentPlanMode('4_cycles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                paymentPlanMode === '4_cycles'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              4 Cycles Schedule
            </button>

            <button
              type="button"
              onClick={() => setPaymentPlanMode('10_day_cycles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                paymentPlanMode === '10_day_cycles'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              10-Day Cycles
            </button>

            <button
              type="button"
              onClick={() => setPaymentPlanMode('15_day_cycles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                paymentPlanMode === '15_day_cycles'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              15-Day Cycles
            </button>

            <button
              type="button"
              onClick={() => setPaymentPlanMode('full')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                paymentPlanMode === 'full'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Payment
            </button>

            <button
              type="button"
              onClick={() => setPaymentPlanMode('custom_phases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                paymentPlanMode === 'custom_phases'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Custom Installments
            </button>
          </div>
        </div>

        {/* Payment Cycle Breakdown Cards */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium gap-2">
            <span className="flex items-center gap-1.5">
              <span>Total Course Payable Bill:</span>
              <strong className="text-emerald-800 font-extrabold text-sm">BDT {grandTotal.toLocaleString()}</strong>
              {treatmentDays !== '' && Number(treatmentDays) > 0 && (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-[11px]">
                  {treatmentDays}-Day Course
                </span>
              )}
            </span>

            {paymentPlanMode === 'custom_phases' && (
              <button
                type="button"
                onClick={addCustomPhase}
                className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-bold text-xs bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-300 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Installment Cycle</span>
              </button>
            )}
          </div>

          {/* Cycle Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {paymentPhases.map((phase, idx) => (
              <div 
                key={phase.id || idx}
                className="bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 rounded-xl p-4 border border-emerald-200 shadow-2xs space-y-2.5 relative group"
              >
                <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                  <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Cycle {idx + 1}</span>
                  </span>
                  <span className="text-[10px] font-black bg-emerald-100/90 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-200">
                    {phase.percentage || (grandTotal > 0 ? Math.round(((phase.amount === '' ? 0 : Number(phase.amount)) / grandTotal) * 100) : 0)}% of Bill
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Editable Title */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Cycle Title</label>
                    <input
                      type="text"
                      value={phase.phaseName}
                      onChange={(e) => updatePaymentPhase(phase.id, { phaseName: e.target.value })}
                      className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {/* Editable Cycle Days */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-emerald-800 uppercase mb-0.5">
                        Cycle Days
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          value={phase.daysOrSessions !== undefined ? (phase.daysOrSessions || '') : ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            updatePaymentPhase(phase.id, { daysOrSessions: val });
                          }}
                          placeholder="Days"
                          className="w-full pr-8 pl-2.5 py-1 bg-emerald-50/70 border border-emerald-300 rounded-lg text-xs font-black text-emerald-950 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-1.5 top-1 text-slate-400 font-bold text-[10px] pointer-events-none">Days</span>
                      </div>
                    </div>

                    {/* Editable Amount */}
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Payment Amount (BDT)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">BDT</span>
                        <input
                          type="number"
                          min={0}
                          value={phase.amount === '' ? '' : phase.amount}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePaymentPhase(phase.id, { amount: val === '' ? '' : Number(val) });
                          }}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full pl-10 pr-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Counseling Note</label>
                    <input
                      type="text"
                      placeholder="e.g. 1st 10 days treatment fee..."
                      value={phase.notes || ''}
                      onChange={(e) => updatePaymentPhase(phase.id, { notes: e.target.value })}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {paymentPlanMode === 'custom_phases' && paymentPhases.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomPhase(phase.id)}
                    className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove this installment cycle"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Phase Sum Verification Bar */}
          {paymentPhases.length > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <span className="font-medium">
                Total Installments Sum: <strong className="text-emerald-900 font-bold">BDT {paymentPhases.reduce((s, p) => s + (p.amount === '' ? 0 : Number(p.amount) || 0), 0).toLocaleString()}</strong>
              </span>
              {paymentPhases.reduce((s, p) => s + (p.amount === '' ? 0 : Number(p.amount) || 0), 0) !== grandTotal && (
                <span className="text-rose-700 font-bold bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200 text-[11px]">
                  ⚠️ Warning: Sum of installments (BDT {paymentPhases.reduce((s, p) => s + (p.amount === '' ? 0 : Number(p.amount) || 0), 0).toLocaleString()}) does not equal Grand Total (BDT {grandTotal.toLocaleString()})
                </span>
              )}
            </div>
          )}

        </div>

      </div>


      {/* SECTION 3: Outdoor Services & Packages */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs">
              3
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>3. Outdoor Packages</span>
                  <span className="text-[11px] font-semibold bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200">
                    Catalog List Mode
                  </span>
                </h3>
                {patientTreatmentMode === 'indoor' && (
                  <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>Indoor Mode (Locked)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                System admin catalog outdoor packages listed below. Select items and set discounts for invoice quotation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsOutdoorSectionOpen(prev => !prev)}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-bold shrink-0"
              title={isOutdoorSectionOpen ? 'Collapse Outdoor Section' : 'Expand Outdoor Section'}
            >
              {isOutdoorSectionOpen ? (
                <>
                  <span>Collapse</span>
                  <ChevronUp className="w-4 h-4 text-slate-600" />
                </>
              ) : (
                <>
                  <span>Expand Section</span>
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                </>
              )}
            </button>
          </div>
        </div>

        {isOutdoorSectionOpen && (
          <>
            {/* Package Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                    <th className="p-3 w-16 text-center">SELECT</th>
                    <th className="p-3">SL & Package Name</th>
                    <th className="p-3 w-32">Base Fee (BDT)</th>
                    <th className="p-3 w-28 text-center">Discount (%)</th>
                    <th className="p-3 w-32 text-center">Discount (BDT)</th>
                    <th className="p-3 w-36 text-right">Net Price (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOutdoorPackageList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 text-xs font-medium">
                        No outdoor package matching "{outdoorSearch}".
                      </td>
                    </tr>
                  ) : (
                    filteredOutdoorPackageList.map((item, idx) => {
                      const isChecked = item.selected;
                      const isLocked = patientTreatmentMode === 'indoor';
                      return (
                        <tr 
                          key={item.id ? `${item.id}-${idx}` : `pkg-tr-${idx}`} 
                          onClick={() => {
                            if (!isLocked) toggleOutdoorPackageSelection(item.id);
                          }}
                          className={`transition-colors ${
                            isLocked 
                              ? 'bg-slate-50/70 text-slate-400 cursor-not-allowed opacity-75' 
                              : isChecked 
                                ? 'bg-teal-50/80 font-medium cursor-pointer' 
                                : 'bg-white hover:bg-slate-50 text-slate-600 cursor-pointer'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isLocked}
                              onChange={() => toggleOutdoorPackageSelection(item.id)}
                              className={`w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 accent-teal-600 ${
                                isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                              }`}
                            />
                          </td>

                          {/* SL & Package Name */}
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-500 text-xs w-6">
                                  {idx + 1}.
                                </span>
                                {item.isCustom ? (
                                  <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      disabled={isLocked}
                                      value={item.packageName}
                                      onChange={(e) => updateOutdoorPackageItem(item.id, { packageName: e.target.value })}
                                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-teal-500 w-full disabled:bg-slate-100 disabled:cursor-not-allowed"
                                    />
                                    <button
                                      disabled={isLocked}
                                      onClick={() => removeOutdoorPackageItem(item.id)}
                                      className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                      title="Remove custom package"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`text-xs font-bold ${isChecked ? 'text-teal-950' : 'text-slate-800'}`}>
                                    {item.packageName}
                                  </span>
                                )}
                              </div>
                              {item.isCustom ? (
                                <input
                                  type="text"
                                  disabled={isLocked}
                                  placeholder="Package details / description..."
                                  value={item.description || ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateOutdoorPackageItem(item.id, { description: e.target.value })}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:border-teal-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                />
                              ) : (
                                item.description && (
                                  <p className="text-[11px] text-slate-500 font-medium pl-8">
                                    {item.description}
                                  </p>
                                )
                              )}
                            </div>
                          </td>

                          {/* Base Fee */}
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-0.5">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                                <input
                                  type="number"
                                  disabled={isLocked}
                                  placeholder="0"
                                  value={item.totalBaseCost === '' ? '' : item.totalBaseCost}
                                  onChange={(e) => updateOutdoorPackageItem(item.id, { totalBaseCost: e.target.value === '' ? '' : Number(e.target.value) })}
                                  className="w-full pl-8 pr-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                />
                              </div>
                              {item.rateNote && (
                                <p className="text-[10px] text-slate-500 font-medium px-0.5">
                                  {item.rateNote}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Discount (%) */}
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                disabled={isLocked}
                                placeholder="0"
                                value={item.discountPercent === '' ? '' : item.discountPercent}
                                onChange={(e) => updateOutdoorPackageItem(item.id, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full pr-5 pl-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-amber-800 text-center focus:ring-2 focus:ring-teal-500 placeholder-slate-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                              />
                              <span className="absolute right-1.5 top-1.5 text-amber-600 text-[10px] font-bold">%</span>
                            </div>
                          </td>

                          {/* Discount Amount */}
                          <td className="p-3 text-center">
                            <span className={`text-xs font-semibold ${item.discountAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              -BDT {(item.discountAmount || 0).toLocaleString()}
                            </span>
                          </td>

                          {/* Net Price */}
                          <td className="p-3 text-right">
                            <span className={`text-xs font-black ${isChecked ? 'text-teal-700 text-sm' : 'text-slate-400'}`}>
                              BDT {(item.netCost || 0).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <div className="text-slate-500 font-medium">
                Selected outdoor packages: <span className="font-bold text-teal-800">{activeOutdoorPackages.length}</span> of {outdoorPackageList.length} items
              </div>

              <div className="text-right flex items-center gap-2">
                <span className="text-slate-700 font-bold">Outdoor Packages Subtotal: </span>
                <span className="text-teal-700 font-black text-base ml-2">
                  BDT {outdoorSubtotal.toLocaleString()}
                </span>
              </div>
            </div>
          </>
        )}

      </div>


      {/* SECTION 4: Indoor Services */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              4
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>4. Indoor Room & Accommodation Services</span>
                  <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Catalog List Mode
                  </span>
                </h3>
                {patientTreatmentMode === 'outdoor' && (
                  <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>Outdoor Mode (Closed)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                System admin catalog room / cabin types listed below. Select items and enter stay duration (days) for invoice quotation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isIndoorSectionOpen && (
              <button
                type="button"
                onClick={toggleIndoorCalculationMode}
                className={`p-2 rounded-xl border transition-all cursor-pointer shadow-2xs flex items-center justify-center ${
                  showFullIndoorCalculation
                    ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border-slate-300'
                }`}
                title={showFullIndoorCalculation ? 'Toggle Day View' : 'Toggle Full View'}
              >
                {showFullIndoorCalculation ? (
                  <Eye className="w-4 h-4 text-slate-600 shrink-0" />
                ) : (
                  <EyeOff className="w-4 h-4 text-indigo-600 shrink-0" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsIndoorSectionOpen(prev => !prev)}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-bold"
              title={isIndoorSectionOpen ? 'Collapse Indoor Section' : 'Expand Indoor Section'}
            >
              {isIndoorSectionOpen ? (
                <>
                  <span>Collapse</span>
                  <ChevronUp className="w-4 h-4 text-slate-600" />
                </>
              ) : (
                <>
                  <span>Expand Section</span>
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                </>
              )}
            </button>
          </div>
        </div>

        {isIndoorSectionOpen && (
          <>
            {/* Indoor Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                    <th className="p-3 w-16 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={isAllIndoorServicesSelected}
                          onChange={toggleSelectAllIndoorServices}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                          title="Select / Deselect All Indoor Rooms"
                        />
                      </div>
                    </th>
                    <th className="p-3">SL & Room / Cabin Type</th>
                    <th className="p-3 w-36">Daily Rate (BDT)</th>
                    <th className="p-3 w-28 text-center">Days Stay</th>
                    <th className="p-3 w-36 text-right">
                      {showFullIndoorCalculation ? 'Total Amount (BDT)' : 'Per Day Amount (BDT)'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIndoorServiceList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 text-xs font-medium">
                        No room / cabin type matching "{indoorSearch}".
                      </td>
                    </tr>
                  ) : (
                    filteredIndoorServiceList.map((item, idx) => {
                      const isChecked = item.selected;
                      return (
                        <tr 
                          key={item.id ? `${item.id}-${idx}` : `ind-tr-${idx}`} 
                          onClick={() => toggleIndoorServiceSelection(item.id)}
                          className={`transition-colors cursor-pointer ${
                            isChecked 
                              ? 'bg-indigo-50/80 font-medium' 
                              : 'bg-white hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleIndoorServiceSelection(item.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                            />
                          </td>

                          {/* SL & Room Type */}
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-500 text-xs w-6">
                                  {idx + 1}.
                                </span>
                                {item.isCustom ? (
                                  <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={item.roomType}
                                      onChange={(e) => updateIndoorServiceItem(item.id, { roomType: e.target.value })}
                                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 w-full"
                                    />
                                    <button
                                      onClick={() => removeIndoorServiceItem(item.id)}
                                      className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer shrink-0"
                                      title="Remove custom room"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`text-xs font-bold ${isChecked ? 'text-indigo-950' : 'text-slate-800'}`}>
                                    {item.roomType}
                                  </span>
                                )}
                              </div>
                              {item.isCustom ? (
                                <input
                                  type="text"
                                  placeholder="Room number / clinical remarks..."
                                  value={item.remarks || ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateIndoorServiceItem(item.id, { remarks: e.target.value })}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:border-indigo-400"
                                />
                              ) : (
                                item.remarks && (
                                  <p className="text-[11px] text-slate-500 font-medium pl-8">
                                    {item.remarks}
                                  </p>
                                )
                              )}
                            </div>
                          </td>

                          {/* Daily Rate */}
                          <td className="p-3">
                            {item.isCustom ? (
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                                <input
                                  type="number"
                                  value={item.dailyRate}
                                  onChange={(e) => updateIndoorServiceItem(item.id, { dailyRate: Number(e.target.value) })}
                                  className="w-full pl-8 pr-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 inline-flex items-center gap-1">
                                  <span className="text-[10px] text-slate-500 font-semibold">BDT</span>
                                  <span>{(item.dailyRate || 0).toLocaleString()} / day</span>
                                </div>
                                {item.rateNote && (
                                  <p className="text-[10px] text-slate-500 font-medium px-0.5">
                                    {item.rateNote}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Days Stay */}
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={1}
                              placeholder="0"
                              value={
                                showFullIndoorCalculation
                                  ? (item.days === '' ? '' : item.days)
                                  : 1
                              }
                              onChange={(e) => updateIndoorServiceItem(item.id, { days: e.target.value === '' ? '' : Number(e.target.value) })}
                              className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                                !showFullIndoorCalculation
                                  ? 'bg-slate-100 border-slate-200 text-indigo-900 font-extrabold'
                                  : isChecked
                                    ? 'bg-white border-slate-300 text-indigo-900 focus:ring-2 focus:ring-indigo-500'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-indigo-500'
                              }`}
                            />
                          </td>

                          {/* Amount (Per Day vs Total) */}
                          <td className="p-3 text-right">
                            <span className={`text-xs font-black ${isChecked ? 'text-indigo-700 text-sm' : 'text-slate-400'}`}>
                              BDT {(showFullIndoorCalculation ? (item.totalAmount || 0) : (item.dailyRate || 0)).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Additional Food Charge Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                    <th className="p-3 w-16 text-center">SELECT</th>
                    <th className="p-3">SL & SERVICE NAME</th>
                    <th className="p-3 w-36">PER DAY CHARGE (BDT)</th>
                    <th className="p-3 w-28 text-center">DAY STAY</th>
                    <th className="p-3 w-36 text-right">
                      {showFullIndoorCalculation ? 'TOTAL AMOUNT (BDT)' : 'PER DAY AMOUNT (BDT)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    onClick={toggleFoodChargeSelection}
                    className={`transition-colors cursor-pointer ${
                      foodChargeSelected 
                        ? 'bg-amber-50/80 font-medium' 
                        : 'bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={foodChargeSelected}
                        onChange={toggleFoodChargeSelection}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer accent-amber-600"
                      />
                    </td>

                    {/* Service Name */}
                    <td className="p-3">
                      <div className="space-y-0.5">
                        <span className={`text-xs font-bold ${foodChargeSelected ? 'text-amber-950' : 'text-slate-800'}`}>
                          Food Charge 3 Times
                        </span>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Food & Meal Charges (3 Times Daily)
                        </p>
                      </div>
                    </td>

                    {/* Per Day Charge */}
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="500"
                          value={foodChargePerDay === '' ? '' : foodChargePerDay}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setFoodChargePerDay(val);
                            if (val !== '' && !foodChargeSelected) {
                              setFoodChargeSelected(true);
                              if (foodChargeDays === '') {
                                setFoodChargeDays(treatmentDays !== '' && Number(treatmentDays) > 0 ? Number(treatmentDays) : 1);
                              }
                            }
                          }}
                          className={`w-full pl-8 pr-1.5 py-1 border rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 ${
                            foodChargeSelected ? 'bg-white border-slate-300' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>
                    </td>

                    {/* Day Stay */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={1}
                        placeholder="0"
                        value={
                          showFullIndoorCalculation
                            ? (foodChargeDays === '' ? '' : foodChargeDays)
                            : 1
                        }
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFoodChargeDays(val);
                          if (val !== '' && Number(val) > 0) {
                            setFoodChargeSelected(true);
                          } else if (val === '') {
                            setFoodChargeSelected(false);
                          }
                        }}
                        className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                          !showFullIndoorCalculation
                            ? 'bg-slate-100 border-slate-200 text-amber-900 font-extrabold'
                            : foodChargeSelected
                              ? 'bg-white border-slate-300 text-amber-900 focus:ring-2 focus:ring-amber-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-amber-500'
                        }`}
                      />
                    </td>

                    {/* Amount (Per Day vs Total) */}
                    <td className="p-3 text-right">
                      <span className={`text-xs font-black ${foodChargeSelected ? 'text-amber-700 text-sm' : 'text-slate-400'}`}>
                        BDT {(showFullIndoorCalculation ? foodChargeTotal : (foodChargeSelected ? (foodChargePerDay === '' ? 0 : Number(foodChargePerDay)) : 0)).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs gap-3">
              <div className="text-slate-500 font-medium">
                Selected room / accommodation: <span className="font-bold text-indigo-800">{activeIndoorServices.length + (foodChargeSelected ? 1 : 0)}</span> of {indoorServiceList.length + 1} items
              </div>

              <div className="flex flex-col sm:flex-row justify-end items-stretch gap-3">
                <div className="bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between min-w-[200px] sm:min-w-[220px]">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {showFullIndoorCalculation ? `Indoor Accommodation Subtotal (${numTreatmentDays} Days)` : 'Per Day Subtotal'}
                  </div>
                  <div className="text-sm sm:text-base font-black text-indigo-900 mt-1">
                    BDT {(showFullIndoorCalculation ? indoorSubtotal : indoorPerDaySubtotal).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </div>


      {/* SECTION 5: Weekly Treatments */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-xs">
              5
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>5. Weekly Treatments</span>
              </h3>
              <p className="text-xs text-slate-500">
                Weekly procedures (Ozon, ED, etc.). Supports automatic 10-day cycle ratio session calculation (3 sessions per 10 days).
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Treatments Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-3 w-16 text-center">
                  <input
                    type="checkbox"
                    checked={isAllAdditionalTreatmentsSelected}
                    onChange={toggleSelectAllAdditionalTreatments}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                    title="Select / Deselect All Weekly Treatments"
                  />
                </th>
                <th className="p-3">SL & Treatment Name</th>
                <th className="p-3 w-28 text-center">Unit Price (BDT)</th>
                <th className="p-3 w-28 text-center">Sessions</th>
                <th className="p-3 w-24 text-center">Discount (%)</th>
                <th className="p-3 w-28 text-center">Discount (BDT)</th>
                <th className="p-3 w-32 text-right">Total Price (BDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdditionalTreatmentList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-xs font-medium">
                    No weekly treatments found.
                  </td>
                </tr>
              ) : (
                filteredAdditionalTreatmentList.map((item, idx) => {
                  const isChecked = item.selected;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleAdditionalTreatmentSelection(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-sky-50/80 font-medium'
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAdditionalTreatmentSelection(item.id)}
                          className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                        />
                      </td>

                      {/* SL & Treatment Name */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 text-xs w-6">
                              {idx + 1}.
                            </span>
                            {item.isCustom ? (
                              <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={item.treatmentName}
                                  onChange={(e) => updateAdditionalTreatmentItem(item.id, { treatmentName: e.target.value })}
                                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeCustomAdditionalTreatment(item.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer shrink-0"
                                  title="Remove custom treatment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold ${isChecked ? 'text-sky-950' : 'text-slate-800'}`}>
                                  {item.treatmentName}
                                </span>
                                {isChecked && item.isIndoorFree && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                      patientTreatmentMode === 'indoor'
                                        ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                    title={patientTreatmentMode === 'indoor' ? 'Indoor Patient - 100% Free Treatment' : 'Free for Indoor Patients'}
                                  >
                                    🎁 {patientTreatmentMode === 'indoor' ? 'Indoor 100% Free' : 'Free for Indoor'}
                                  </span>
                                )}
                                {isChecked && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0 && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                      patientTreatmentMode === 'outdoor'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                    title={`Outdoor Discount: ${item.outdoorDiscountPercent}% Off`}
                                  >
                                    🏷️ Outdoor {item.outdoorDiscountPercent}% Off
                                  </span>
                                )}
                                {isChecked && item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 bg-emerald-100 text-emerald-900 border-emerald-300"
                                    title={`Fixed Discount: BDT ${item.fixedDiscountAmount}`}
                                  >
                                    🏷️ Fixed BDT {item.fixedDiscountAmount.toLocaleString()} Off
                                  </span>
                                )}
                                {isChecked && item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0 && (!item.fixedDiscountAmount || Number(item.fixedDiscountAmount) === 0) && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 bg-emerald-100 text-emerald-900 border-emerald-300"
                                    title={`Fixed Discount: ${item.defaultDiscountPercent}% Off`}
                                  >
                                    🏷️ Fixed {item.defaultDiscountPercent}% Off
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {item.description && !item.isCustom && (
                            <p className="text-[11px] text-slate-500 font-medium pl-8">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                          <input
                            type="number"
                            min={0}
                            value={item.unitCost === 0 ? '' : item.unitCost}
                            onChange={(e) => updateAdditionalTreatmentItem(item.id, { unitCost: e.target.value === '' ? 0 : Number(e.target.value) })}
                            className="w-full pl-8 pr-1 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </td>

                      {/* Sessions */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          <input
                            type="number"
                            min={1}
                            placeholder="0"
                            value={item.sessions === '' ? '' : item.sessions}
                            onChange={(e) => updateAdditionalTreatmentItem(item.id, { sessions: e.target.value === '' ? '' : Number(e.target.value) })}
                            className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                              isChecked
                                ? 'bg-white border-slate-300 text-sky-900 focus:ring-2 focus:ring-sky-500'
                                : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-sky-500'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Discount (%) */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {isChecked && patientTreatmentMode === 'indoor' && item.isIndoorFree ? (
                          <div
                            className="bg-indigo-100/80 border border-indigo-300 text-indigo-900 rounded-lg py-1 px-1 text-[11px] font-black text-center shadow-2xs"
                            title="Indoor patients get this treatment 100% free"
                          >
                            100% Free
                          </div>
                        ) : isChecked && item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 ? (
                          <div
                            className="bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg py-1 px-1 text-[10px] font-black text-center shadow-2xs cursor-default flex items-center justify-center gap-0.5 whitespace-nowrap"
                            title={`Fixed Discount Tag: BDT ${Number(item.fixedDiscountAmount).toLocaleString()}`}
                          >
                            <span>🏷️</span>
                            <span>Fixed BDT {Number(item.fixedDiscountAmount).toLocaleString()}</span>
                          </div>
                        ) : isChecked && item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0 ? (
                          <div
                            className="bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg py-1 px-1 text-[10px] font-black text-center shadow-2xs cursor-default flex items-center justify-center gap-0.5 whitespace-nowrap"
                            title={`Fixed Discount Tag: ${Number(item.defaultDiscountPercent)}%`}
                          >
                            <span>🏷️</span>
                            <span>Fixed {Number(item.defaultDiscountPercent)}%</span>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0"
                              value={item.discountPercent === 0 || item.discountPercent === '' ? '' : item.discountPercent}
                              onChange={(e) => updateAdditionalTreatmentItem(item.id, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
                              onFocus={(e) => e.target.select()}
                              className="w-full pr-5 pl-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-amber-800 text-center focus:ring-2 focus:ring-sky-500 placeholder-slate-300"
                            />
                            <span className="absolute right-1.5 top-1.5 text-amber-600 text-[10px] font-bold">%</span>
                          </div>
                        )}
                      </td>

                      {/* Discount Amount */}
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold ${item.discountAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          -BDT {(item.discountAmount || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Total Cost */}
                      <td className="p-3 text-right">
                        <span className={`text-xs font-black ${isChecked ? 'text-sky-700 text-sm' : 'text-slate-400'}`}>
                          BDT {(item.totalCost || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Subtotal */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs">
          <div className="text-slate-500 font-medium">
            Selected weekly treatments: <span className="font-bold text-sky-800">{activeAdditionalTreatments.length}</span> of {additionalTreatmentList.length} items
          </div>

          <div className="text-right flex items-center gap-2">
            <span className="text-slate-700 font-bold">Weekly Treatments Subtotal: </span>
            <span className="text-sky-700 font-black text-base ml-2">
              BDT {additionalTreatmentsSubtotal.toLocaleString()}
            </span>
          </div>
        </div>

      </div>


      {/* SUMMARY, DISCOUNTS, PAYMENTS & GRAND TOTAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Notes & Terms */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>Additional Fees & Quotation Notes</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`flex items-center gap-2 text-xs font-bold uppercase mb-1 ${patientTreatmentMode === 'outdoor' ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={patientTreatmentMode === 'outdoor'}
                  checked={patientTreatmentMode === 'outdoor' ? false : includeAdmissionFee}
                  onChange={(e) => {
                    if (patientTreatmentMode !== 'outdoor') {
                      setIncludeAdmissionFee(e.target.checked);
                    }
                  }}
                  className={`w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 accent-emerald-600 ${patientTreatmentMode === 'outdoor' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                />
                <span>Admission Fee (One Time - Non Refundable)</span>
                {patientTreatmentMode === 'outdoor' && (
                  <span className="text-[10px] lowercase text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    (Indoor only - locked)
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">BDT</span>
                <input
                  type="number"
                  placeholder="1000"
                  disabled={patientTreatmentMode === 'outdoor' || !includeAdmissionFee}
                  value={admissionFee === '' ? '' : admissionFee}
                  onChange={(e) => setAdmissionFee(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full pl-10 pr-3 py-2 border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    patientTreatmentMode !== 'outdoor' && includeAdmissionFee ? 'bg-slate-50 border-slate-300' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Terms & Clinical Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Billing Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Quotation">Quotation / Estimate</option>
                <option value="Partial Paid">Partial Paid</option>
                <option value="Fully Paid">Fully Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Advance Payment Received
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">BDT</span>
                <input
                  type="number"
                  value={advancePaid === 0 || advancePaid === '' ? '' : advancePaid}
                  onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Final Calculation Card */}
        <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-md border-2 border-slate-200 space-y-5 flex flex-col justify-between">
          
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
              <span>Billing Summary</span>
              <Calculator className="w-5 h-5 text-emerald-600" />
            </h3>

            <div className="space-y-3 text-xs text-slate-700">
              
              {/* Treatments Subtotal Section */}
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/90 space-y-2">
                <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider border-b border-emerald-200/80 pb-1.5 flex items-center justify-between">
                  <span>
                    {patientTreatmentMode === 'outdoor' 
                      ? 'Treatments Subtotal - Outdoor Packages' 
                      : patientTreatmentMode === 'indoor'
                      ? 'Treatments Subtotal - Indoor'
                      : 'Treatments Subtotal'}
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>Total Bill:</span>
                    <span className="font-bold text-slate-900">BDT {treatmentsGrossSubtotal.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-rose-700 font-medium">
                    <span>Discount Amount:</span>
                    <span className="font-bold text-rose-700">-BDT {treatmentsTotalDiscount.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between pt-1 border-t border-emerald-200/80 font-bold text-emerald-900">
                    <span>After Discount Gross Total Bill:</span>
                    <span className="text-sm font-extrabold text-emerald-800">BDT {treatmentsSubtotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Additional Services */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                {activeIndoorServices.length > 0 ? (
                  <div className="space-y-1 bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-200/80">
                    <div className="flex justify-between items-center text-xs font-bold text-indigo-900">
                      <span>
                        Indoor Rooms ({activeIndoorServices.length})
                        {!showFullIndoorCalculation && <span className="text-[10px] font-normal text-indigo-600 ml-1">(Per Day)</span>}:
                      </span>
                      <span className="text-indigo-800">BDT {effectiveIndoorRoomSubtotal.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1 pt-1 border-t border-indigo-200/60">
                      {activeIndoorServices.map((room) => {
                        const roomDays = showFullIndoorCalculation ? (room.days === '' ? 1 : Number(room.days)) : 1;
                        const roomAmt = showFullIndoorCalculation ? (room.totalAmount || 0) : (room.dailyRate || 0);
                        return (
                          <div key={room.id} className="flex justify-between items-center text-[11px] text-slate-700">
                            <span className="truncate pr-1 text-slate-700" title={room.roomType}>• {room.roomType} ({roomDays}d)</span>
                            <span className="font-bold text-slate-900 shrink-0">BDT {roomAmt.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-700">Indoor Accommodation:</span>
                    <span className="font-bold text-slate-500">BDT 0</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-slate-700">
                    Food Charge
                    {!showFullIndoorCalculation && foodChargeSelected && <span className="text-[10px] text-slate-500 ml-1">(Per Day)</span>}:
                  </span>
                  <span className="font-bold text-slate-900">BDT {effectiveFoodChargeTotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-700">Admission Fee:</span>
                  <span className="font-bold text-slate-900">BDT {actualAdmissionFee.toLocaleString()}</span>
                </div>
              </div>

              {/* Overall Special Discount */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center text-xs text-amber-800 font-semibold mb-1">
                  <span>Additional Special Discount (%):</span>
                  <span>-BDT {overallDiscountAmount.toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={overallDiscountPercent === '' ? '' : overallDiscountPercent}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                    setOverallDiscountPercent(val);
                  }}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Grand Total */}
              <div className="pt-3 border-t-2 border-slate-300">
                <div className="flex justify-between items-end">
                  <span className="text-xs text-slate-800 uppercase font-extrabold tracking-wider">Grand Total Bill:</span>
                  <span className="text-2xl font-black text-emerald-700">
                    BDT {grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Weekly Treatments (Separated Below Grand Total) */}
              {activeAdditionalTreatments.length > 0 && (
                <div className="space-y-1.5 bg-sky-50/80 p-3 rounded-xl border border-sky-200">
                  <div className="flex justify-between items-center text-xs font-bold text-sky-950">
                    <span>Weekly Treatments ({activeAdditionalTreatments.length}):</span>
                    <span className="text-sky-900 font-extrabold">BDT {additionalTreatmentsSubtotal.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1 pt-1.5 border-t border-sky-200/80">
                    {activeAdditionalTreatments.map((tr) => (
                      <div key={tr.id} className="flex justify-between items-center text-[11px] text-slate-700">
                        <span className="truncate pr-1 text-slate-700" title={tr.treatmentName}>• {tr.treatmentName} ({tr.sessions}s)</span>
                        <span className="font-bold text-slate-900 shrink-0">BDT {(tr.totalCost || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-sky-800 pt-1 border-t border-sky-200/60 italic">
                    * Billed separately per session/week (Excluded from Grand Total)
                  </div>
                </div>
              )}

              {/* Advance & Due */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Advance Paid:</span>
                  <span className="font-bold text-slate-900">BDT {advancePaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-rose-700">
                  <span>Net Due Balance:</span>
                  <span className="text-base font-black text-rose-700">BDT {dueAmount.toLocaleString()}</span>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom Actions */}
          <div className="space-y-2.5 pt-4">
            <button
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Invoice Quotation</span>
            </button>

            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs py-2.5 px-4 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaved ? 'Quotation Saved!' : 'Save Quotation Record'}</span>
            </button>
          </div>

        </div>

      </div>

      </div>

      {/* Package Comparison Modal */}
      <PackageComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedTreatments={treatmentList.filter(t => t.selected)}
        selectedAdditionalTreatments={additionalTreatmentList.filter(t => t.selected)}
        allIndoorServices={indoorServiceList}
        initialFoodChargeSelected={foodChargeSelected}
        initialFoodChargePerDay={foodChargePerDay === '' ? 500 : Number(foodChargePerDay)}
        initialIncludeAdmissionFee={includeAdmissionFee}
        initialAdmissionFee={admissionFee === '' ? 1000 : Number(admissionFee)}
        currentMode={patientTreatmentMode}
        currentPackage={treatmentPackage}
        patientName={selectedPatient?.name || (phoneSearch ? `Patient (${phoneSearch})` : 'Walk-in Patient')}
        patientMobile={selectedPatient?.phone || (selectedPatient as any)?.mobile || (selectedPatient as any)?.mobileNumber || (selectedPatient as any)?.patientPhone || (selectedPatient as any)?.patientMobile || phoneSearch || ''}
        consultingDoctor={billingDoctor}
        initialSavedComparison={savedComparisonSnapshot}
        onSaveComparison={(comp) => {
          setSavedComparisonSnapshot(comp);
        }}
        onApplyPackage={handleApplyPackageFromComparison}
      />
    </>
  );
};
