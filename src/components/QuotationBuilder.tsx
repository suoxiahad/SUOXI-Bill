import React, { useState, useEffect } from 'react';
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
  Clock
} from 'lucide-react';
import { PackageComparisonModal } from './PackageComparisonModal';
import { 
  Patient, 
  IndividualTreatment, 
  OutdoorPackage, 
  IndoorService, 
  InvoiceQuotation, 
  PaymentPhase,
  CatalogItem,
  User 
} from '../types';

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
  onSaveQuotation: (quotation: InvoiceQuotation) => void;
  onPreviewPrint: (quotation: InvoiceQuotation) => void;
}

export const QuotationBuilder: React.FC<QuotationBuilderProps> = ({
  initialPatient,
  patients,
  quotations = [],
  catalog,
  currentUser,
  onSaveQuotation,
  onPreviewPrint
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
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      setPhoneSearch(initialPatient.phone);
    }
  }, [initialPatient]);

  useEffect(() => {
    if (currentUser?.name) {
      setBillingDoctor(currentUser.name);
    } else if (selectedPatient?.doctorName) {
      setBillingDoctor(selectedPatient.doctorName);
    }
  }, [currentUser, selectedPatient]);

  // Handle Phone Search
  const handlePhoneSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phoneSearch.trim().toLowerCase();
    const found = patients.find(p => p.phone.includes(clean) || p.name.toLowerCase().includes(clean));
    if (found) {
      setSelectedPatient(found);
    } else {
      alert('No patient found with this phone number. You can register a new patient manually.');
    }
  };

  // Section 1: Treatment List with Checkboxes
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [treatmentList, setTreatmentList] = useState<TreatmentListItem[]>([]);
  const [patientTreatmentMode, setPatientTreatmentMode] = useState<'outdoor' | 'indoor' | ''>('');
  const [treatmentPackage, setTreatmentPackage] = useState<'30 Days' | '15 Days' | 'Per Day' | ''>('');
  const [treatmentDays, setTreatmentDays] = useState<number | ''>('');
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number | ''>('');
  const [showFullTreatmentCalculation, setShowFullTreatmentCalculation] = useState<boolean>(false);
  const [showFullIndoorCalculation, setShowFullIndoorCalculation] = useState<boolean>(false);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

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
      const isIndoorFree = modeVal === 'indoor' && Boolean(item.isIndoorFree);
      const effectiveDiscPct = isIndoorFree ? 100 : (discVal !== '' ? Number(discVal) : (item.discountPercent !== '' ? Number(item.discountPercent) : 0));
      const discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        sessions: computedSessions,
        discountPercent: isIndoorFree ? 100 : (discVal !== '' ? discVal : item.discountPercent),
        discountAmount,
        totalCost
      };
    }));
  };

  const toggleTreatmentCalculationMode = () => {
    const nextMode = !showFullTreatmentCalculation;
    setShowFullTreatmentCalculation(nextMode);
    recalculateTreatmentList(nextMode);
  };

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
      const isIndoorFree = targetMode === 'indoor' && Boolean(item.isIndoorFree);
      const effectiveDiscPct = isIndoorFree ? 100 : discPct;
      const discountAmount = Math.round((gross * effectiveDiscPct) / 100);
      const totalCost = Math.max(0, gross - discountAmount);

      return {
        ...item,
        sessions: computedSessions,
        discountPercent: isIndoorFree ? 100 : newDiscount,
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
      const unitCost = Number(item.unitCost) || 0;
      const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
      const discPct = isIndoorFree ? 100 : (newVal === '' ? 0 : Number(newVal));
      const gross = unitCost * sessions;
      const discountAmount = Math.round((gross * discPct) / 100);
      const totalCost = Math.max(0, gross - discountAmount);
      return {
        ...item,
        discountPercent: isIndoorFree ? 100 : newVal,
        discountAmount,
        totalCost
      };
    }));
  };

  const handlePatientModeChange = (newMode: 'outdoor' | 'indoor' | '') => {
    setPatientTreatmentMode(newMode);

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
        const updatedPrev = prev.map(item => {
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
              discountAmount,
              totalCost
            };
          }
          return item;
        });

        const existingCatalogIds = new Set(prev.map(p => p.catalogId).filter(Boolean));
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

          if (item.discountPercent === '' && bulkDiscountPercent !== '') {
            newDiscountPercent = bulkDiscountPercent;
          }
        } else {
          newSessions = '';
          newDiscountPercent = '';
        }

        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const discountPctNum = isIndoorFree ? 100 : (newDiscountPercent === '' ? 0 : (Number(newDiscountPercent) || 0));
        const gross = unitCost * sessionsNum;
        const discountAmount = Math.round((gross * discountPctNum) / 100);
        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: newSelected,
          sessions: newSessions,
          discountPercent: isIndoorFree ? 100 : newDiscountPercent,
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
        const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(updated.isIndoorFree);
        const unitCost = Number(updated.unitCost) || 0;
        const sessions = updated.sessions === '' ? 0 : (Number(updated.sessions) || 0);
        const discountPercent = isIndoorFree ? 100 : (updated.discountPercent === '' ? 0 : (Number(updated.discountPercent) || 0));
        const gross = unitCost * sessions;
        const discountAmount = Math.round((gross * discountPercent) / 100);
        const totalCost = Math.max(0, gross - discountAmount);
        const selected = fields.sessions !== undefined && Number(fields.sessions) > 0 ? true : updated.selected;
        return {
          ...updated,
          selected,
          discountPercent: isIndoorFree ? 100 : updated.discountPercent,
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
    setOutdoorPackageList(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const updateOutdoorPackageItem = (id: string, fields: Partial<OutdoorPackageListItem>) => {
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
        const updatedPrev = prev.map(item => {
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

        const existingCatalogIds = new Set(prev.map(p => p.catalogId).filter(Boolean));
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
  const [paymentPlanMode, setPaymentPlanMode] = useState<'full' | '10_day_cycles' | '15_day_cycles' | 'custom_phases'>('10_day_cycles');
  const [paymentPhases, setPaymentPhases] = useState<PaymentPhase[]>([]);

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

        if (item.discountPercent === '' && bulkDiscountPercent !== '') {
          newDiscountPercent = bulkDiscountPercent;
        }

        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const discountPctNum = newDiscountPercent === '' ? 0 : (Number(newDiscountPercent) || 0);
        const gross = unitCost * sessionsNum;
        const discountAmount = Math.round((gross * discountPctNum) / 100);
        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: true,
          sessions: newSessions,
          discountPercent: newDiscountPercent,
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
    const isIndoorFree = patientTreatmentMode === 'indoor' && Boolean(item.isIndoorFree);
    const discPct = isIndoorFree ? 100 : (item.discountPercent !== '' ? Number(item.discountPercent) : (bulkDiscountPercent !== '' ? Number(bulkDiscountPercent) : 0));
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

  const indoorRoomPerDaySubtotal = activeIndoorServices.reduce((sum, item) => sum + (item.dailyRate || 0), 0);
  const foodChargePerDaySubtotal = foodChargeSelected ? (foodChargePerDay === '' ? 0 : Number(foodChargePerDay)) : 0;
  const indoorPerDaySubtotal = indoorRoomPerDaySubtotal + foodChargePerDaySubtotal;

  const effectiveOutdoorSubtotal = patientTreatmentMode === 'outdoor' ? 0 : outdoorSubtotal;
  const actualAdmissionFee = includeAdmissionFee ? Number(admissionFee || 0) : 0;
  const grossTotal = treatmentsSubtotal + effectiveOutdoorSubtotal + indoorSubtotal + actualAdmissionFee;

  const overallDiscountAmount = Math.round((grossTotal * Number(overallDiscountPercent || 0)) / 100);
  const grandTotal = Math.max(0, grossTotal - overallDiscountAmount);
  const dueAmount = Math.max(0, grandTotal - Number(advancePaid || 0));

  // Auto-recalculate Payment Phases when grandTotal, paymentPlanMode, or treatmentDays changes
  useEffect(() => {
    if (grandTotal <= 0) {
      setPaymentPhases([]);
      return;
    }

    const totalDays = (treatmentDays !== '' && Number(treatmentDays) > 0) ? Number(treatmentDays) : 30;

    if (paymentPlanMode === '10_day_cycles') {
      const numPhases = Math.max(1, Math.ceil(totalDays / 10));
      const baseAmount = Math.floor(grandTotal / numPhases);
      const remainder = grandTotal - (baseAmount * numPhases);

      const phases: PaymentPhase[] = [];
      for (let i = 0; i < numPhases; i++) {
        const startDay = (i * 10) + 1;
        const endDay = Math.min((i + 1) * 10, totalDays);
        const amt = i === 0 ? (baseAmount + remainder) : baseAmount;
        const pct = Math.round((amt / grandTotal) * 100);

        phases.push({
          id: `phase-10d-${i + 1}`,
          phaseName: i === 0 
            ? `1st 10-Days Payment (Day ${startDay}–${endDay})` 
            : `${i + 1}${i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} 10-Days Payment (Day ${startDay}–${endDay})`,
          daysOrSessions: endDay - startDay + 1,
          amount: amt,
          percentage: pct,
          notes: i === 0 ? 'Initial course starting installment' : `Cycle ${i + 1} treatment cycle payment`
        });
      }
      setPaymentPhases(phases);
    } else if (paymentPlanMode === '15_day_cycles') {
      const numPhases = Math.max(1, Math.ceil(totalDays / 15));
      const baseAmount = Math.floor(grandTotal / numPhases);
      const remainder = grandTotal - (baseAmount * numPhases);

      const phases: PaymentPhase[] = [];
      for (let i = 0; i < numPhases; i++) {
        const startDay = (i * 15) + 1;
        const endDay = Math.min((i + 1) * 15, totalDays);
        const amt = i === 0 ? (baseAmount + remainder) : baseAmount;
        const pct = Math.round((amt / grandTotal) * 100);

        phases.push({
          id: `phase-15d-${i + 1}`,
          phaseName: i === 0 
            ? `1st 15-Days Payment (Day ${startDay}–${endDay})` 
            : `${i + 1}${i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} 15-Days Payment (Day ${startDay}–${endDay})`,
          daysOrSessions: endDay - startDay + 1,
          amount: amt,
          percentage: pct,
          notes: i === 0 ? '1st half treatment installment' : '2nd half treatment installment'
        });
      }
      setPaymentPhases(phases);
    } else if (paymentPlanMode === 'full') {
      setPaymentPhases([{
        id: 'phase-full-1',
        phaseName: '1-Time Full Payment',
        daysOrSessions: totalDays,
        amount: grandTotal,
        percentage: 100,
        notes: 'Full payment upon enrollment'
      }]);
    } else if (paymentPlanMode === 'custom_phases' && paymentPhases.length === 0) {
      const half = Math.floor(grandTotal / 2);
      setPaymentPhases([
        {
          id: `phase-custom-1`,
          phaseName: '1st Cycle / Advance Payment',
          daysOrSessions: Math.ceil(totalDays / 2),
          amount: grandTotal - half,
          percentage: 50,
          notes: 'Advance at course start'
        },
        {
          id: `phase-custom-2`,
          phaseName: '2nd Cycle Payment',
          daysOrSessions: Math.floor(totalDays / 2),
          amount: half,
          percentage: 50,
          notes: 'Remaining balance midway'
        }
      ]);
    }
  }, [grandTotal, paymentPlanMode, treatmentDays]);

  const updatePaymentPhase = (id: string, fields: Partial<PaymentPhase>) => {
    setPaymentPhases(prev => {
      const targetIdx = prev.findIndex(p => p.id === id);
      if (targetIdx === -1) return prev;

      if (fields.amount !== undefined) {
        const newAmt = Math.max(0, fields.amount);
        const numCycles = prev.length;

        if (numCycles <= 1) {
          return prev.map(p => p.id === id ? {
            ...p,
            ...fields,
            amount: newAmt,
            percentage: grandTotal > 0 ? Math.round((newAmt / grandTotal) * 100) : 0
          } : p);
        }

        const updated = prev.map((p, idx) => {
          if (idx === targetIdx) {
            const pct = grandTotal > 0 ? Math.round((newAmt / grandTotal) * 100) : 0;
            return { ...p, ...fields, amount: newAmt, percentage: pct };
          }
          return { ...p };
        });

        if (targetIdx < numCycles - 1) {
          let sumFixed = 0;
          for (let i = 0; i <= targetIdx; i++) {
            sumFixed += updated[i].amount || 0;
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
          const remTotal = Math.max(0, grandTotal - newAmt);
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

  const addCustomPhase = () => {
    setPaymentPhases(prev => {
      const nextNum = prev.length + 1;
      const newPhase: PaymentPhase = {
        id: `phase-custom-${Date.now()}`,
        phaseName: `${nextNum}${nextNum === 1 ? 'st' : nextNum === 2 ? 'nd' : nextNum === 3 ? 'rd' : 'th'} Payment Cycle`,
        daysOrSessions: 10,
        amount: 0,
        percentage: 0,
        notes: 'Custom installment cycle'
      };
      const newList = [...prev, newPhase];
      const count = newList.length;
      const base = Math.floor(grandTotal / count);
      const rem = grandTotal - (base * count);

      return newList.map((p, idx) => {
        const amt = base + (idx === 0 ? rem : 0);
        const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
        return {
          ...p,
          amount: amt,
          percentage: pct
        };
      });
    });
  };

  const removeCustomPhase = (id: string) => {
    setPaymentPhases(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (filtered.length === 0) return filtered;
      const count = filtered.length;
      const base = Math.floor(grandTotal / count);
      const rem = grandTotal - (base * count);

      return filtered.map((p, idx) => {
        const amt = base + (idx === 0 ? rem : 0);
        const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
        return {
          ...p,
          amount: amt,
          percentage: pct
        };
      });
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

    const formattedIndoorServices: IndoorService[] = activeIndoorServices.map(i => ({
      id: i.id,
      roomType: i.roomType,
      dailyRate: i.dailyRate,
      days: i.days === '' ? 1 : Number(i.days),
      totalAmount: i.totalAmount,
      remarks: i.remarks || ''
    }));

    if (foodChargeSelected) {
      const fcDays = foodChargeDays === '' ? 1 : Number(foodChargeDays);
      const fcRate = foodChargePerDay === '' ? 0 : Number(foodChargePerDay);
      const fcTotal = fcRate * fcDays;
      if (fcTotal > 0) {
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

    const nextVisitNumber = existingCount + 1;
    const getOrdinalSuffix = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const visitLabel = `${getOrdinalSuffix(nextVisitNumber).toUpperCase()} INVOICE`;

    return {
      id: `quot-${Date.now()}`,
      quotationNumber: `SXH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: selectedPatient?.id || 'walkin',
      patientName: selectedPatient?.name || 'Walk-in Patient',
      patientPhone: pPhone,
      patientAge: selectedPatient?.age,
      patientGender: selectedPatient?.gender,
      doctorName: billingDoctor.trim() || currentUser?.name || selectedPatient?.doctorName || 'Senior Consultant',
      createdDate: dateStr,
      validUntil: validUntilDate.toISOString().split('T')[0],
      visitNumber: nextVisitNumber,
      visitLabel: visitLabel,
      patientTreatmentMode: patientTreatmentMode,

      treatments: formattedTreatments,
      treatmentsSubtotal,

      outdoorPackages: formattedOutdoorPackages,
      outdoorSubtotal,

      indoorServices: formattedIndoorServices,
      indoorSubtotal,

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
      createdBy: currentUser?.name ? `${currentUser.name} (${currentUser.role})` : 'Billing Counter Staff'
    };
  };

  const handleSave = () => {
    if (!selectedPatient) {
      alert('Please select or search a patient first!');
      return;
    }
    const quot = generateQuotationData();
    onSaveQuotation(quot);
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
  };

  return (
    <>
      <div className="space-y-8 print:hidden">
      
      {/* Patient Selection Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Step 1: Select Patient</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">
              Invoice Quotation Builder
            </h2>
          </div>

          {/* Quick Phone Search Form */}
          <form onSubmit={handlePhoneSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Search patient by mobile..."
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              />
              <UserSearch className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow transition-all cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Selected Patient Card */}
        {selectedPatient ? (
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-inner flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Active Patient Selected</p>
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
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs text-slate-300 font-medium">Consulting Doctor:</span>
                <span className="bg-slate-950 text-emerald-300 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-bold shadow-2xs">
                  {billingDoctor || 'Hospital System Admin'}
                </span>
              </div>
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
            {/* Quick Filter Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filter treatment name..."
                value={treatmentSearch}
                onChange={(e) => setTreatmentSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

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
                    value={bulkDiscountPercent}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                      handleBulkDiscountChange(val);
                    }}
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
                                {item.isIndoorFree && (
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
                              value={item.unitCost}
                              onChange={(e) => updateTreatmentItem(item.id, { unitCost: Number(e.target.value) })}
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
                          value={item.sessions === '' ? '' : item.sessions}
                          onChange={(e) => updateTreatmentItem(item.id, { sessions: e.target.value === '' ? '' : Number(e.target.value) })}
                          className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                            isChecked
                              ? 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-emerald-500'
                          }`}
                        />
                      </td>

                      {/* Discount (%) - Manual Entry */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {patientTreatmentMode === 'indoor' && item.isIndoorFree ? (
                          <div
                            className="bg-indigo-100/80 border border-indigo-300 text-indigo-900 rounded-lg py-1 px-1 text-[11px] font-black text-center shadow-xs"
                            title="Indoor patients get this treatment 100% free"
                          >
                            100% Free
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0"
                              value={item.discountPercent === '' ? '' : item.discountPercent}
                              onChange={(e) => updateTreatmentItem(item.id, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
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


      {/* SECTION 2: Outdoor Services & Packages */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs">
              2
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>2. Outdoor Packages</span>
                <span className="text-[11px] font-semibold bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Catalog List Mode
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                System admin catalog outdoor packages listed below. Select items and set discounts for invoice quotation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter outdoor package..."
                value={outdoorSearch}
                onChange={(e) => setOutdoorSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

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
                  return (
                    <tr 
                      key={item.id ? `${item.id}-${idx}` : `pkg-tr-${idx}`} 
                      onClick={() => toggleOutdoorPackageSelection(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked 
                          ? 'bg-teal-50/80 font-medium' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOutdoorPackageSelection(item.id)}
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer accent-teal-600"
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
                                  value={item.packageName}
                                  onChange={(e) => updateOutdoorPackageItem(item.id, { packageName: e.target.value })}
                                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-teal-500 w-full"
                                />
                                <button
                                  onClick={() => removeOutdoorPackageItem(item.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer shrink-0"
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
                              placeholder="Package details / description..."
                              value={item.description || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateOutdoorPackageItem(item.id, { description: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:border-teal-400"
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
                              placeholder="0"
                              value={item.totalBaseCost === '' ? '' : item.totalBaseCost}
                              onChange={(e) => updateOutdoorPackageItem(item.id, { totalBaseCost: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-full pl-8 pr-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500"
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
                            placeholder="0"
                            value={item.discountPercent === '' ? '' : item.discountPercent}
                            onChange={(e) => updateOutdoorPackageItem(item.id, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full pr-5 pl-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-amber-800 text-center focus:ring-2 focus:ring-teal-500 placeholder-slate-300"
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

      </div>


      {/* SECTION 3: Indoor Services */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>3. Indoor Room & Accommodation Services</span>
                <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  Catalog List Mode
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                System admin catalog room / cabin types listed below. Select items and enter stay duration (days) for invoice quotation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter room / cabin type..."
                value={indoorSearch}
                onChange={(e) => setIndoorSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
              />
            </div>
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
          </div>
        </div>

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
                className={`transition-colors ${
                  foodChargeSelected 
                    ? 'bg-amber-50/80 font-medium' 
                    : 'bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                {/* Checkbox */}
                <td className="p-3 text-center">
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
                <td className="p-3">
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
                <td className="p-3 text-center">
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

      </div>


      {/* PAYMENT CYCLE & COUNSELING SCHEDULE BREAKDOWN CARD */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-300 space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-2xs">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>4. Payment Cycle & Counseling Schedule</span>
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
                    {phase.percentage || (grandTotal > 0 ? Math.round((phase.amount / grandTotal) * 100) : 0)}% of Bill
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

                  {/* Editable Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Payment Amount (BDT)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">BDT</span>
                      <input
                        type="number"
                        min={0}
                        value={phase.amount}
                        onChange={(e) => {
                          const newAmt = e.target.value === '' ? 0 : Number(e.target.value);
                          updatePaymentPhase(phase.id, { amount: newAmt });
                        }}
                        className="w-full pl-10 pr-2.5 py-1 bg-white border border-slate-300 rounded-lg text-sm font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                      />
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
                Total Installments Sum: <strong className="text-emerald-900 font-bold">BDT {paymentPhases.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString()}</strong>
              </span>
              {paymentPhases.reduce((s, p) => s + (p.amount || 0), 0) !== grandTotal && (
                <span className="text-rose-700 font-bold bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200 text-[11px]">
                  ⚠️ Warning: Sum of installments (BDT {paymentPhases.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString()}) does not equal Grand Total (BDT {grandTotal.toLocaleString()})
                </span>
              )}
            </div>
          )}

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
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAdmissionFee}
                  onChange={(e) => setIncludeAdmissionFee(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                />
                <span>Admission Fee (One Time - Non Refundable)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">BDT</span>
                <input
                  type="number"
                  placeholder="1000"
                  disabled={!includeAdmissionFee}
                  value={admissionFee === '' ? '' : admissionFee}
                  onChange={(e) => setAdmissionFee(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full pl-10 pr-3 py-2 border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    includeAdmissionFee ? 'bg-slate-50 border-slate-300' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
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
                  value={advancePaid}
                  onChange={(e) => setAdvancePaid(Number(e.target.value))}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Final Calculation Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-5 flex flex-col justify-between">
          
          <div className="space-y-3">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>Billing Summary</span>
              <Calculator className="w-5 h-5 text-emerald-400" />
            </h3>

            <div className="space-y-3 text-xs text-slate-300">
              
              {/* Treatments Subtotal Section */}
              <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/80 space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-700 pb-1.5 flex items-center justify-between">
                  <span>
                    {patientTreatmentMode === 'outdoor' 
                      ? 'Treatments Subtotal - Outdoor Packages' 
                      : patientTreatmentMode === 'indoor'
                      ? 'Treatments Subtotal - Indoor'
                      : 'Treatments Subtotal'}
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span>Total Bill:</span>
                    <span className="font-bold text-white">BDT {treatmentsGrossSubtotal.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-rose-300">
                    <span>Discount Amount:</span>
                    <span className="font-bold">-BDT {treatmentsTotalDiscount.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between pt-1 border-t border-slate-700/70 font-bold text-emerald-300">
                    <span>After Discount Gross Total Bill:</span>
                    <span className="text-sm font-extrabold text-emerald-400">BDT {treatmentsSubtotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Additional Services */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                {activeIndoorServices.length > 0 ? (
                  <div className="space-y-1 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80">
                    <div className="flex justify-between items-center text-xs font-bold text-indigo-300">
                      <span>Indoor Rooms ({activeIndoorServices.length}):</span>
                      <span className="text-indigo-200">BDT {indoorRoomOnlySubtotal.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1 pt-1 border-t border-slate-700/60">
                      {activeIndoorServices.map((room) => (
                        <div key={room.id} className="flex justify-between items-center text-[11px] text-slate-300">
                          <span className="truncate pr-1 text-slate-300" title={room.roomType}>• {room.roomType} ({room.days}d)</span>
                          <span className="font-bold text-white shrink-0">BDT {(room.totalAmount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Indoor Accommodation:</span>
                    <span className="font-bold text-slate-400">BDT 0</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Food Charge:</span>
                  <span className="font-bold text-white">BDT {foodChargeTotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Admission Fee:</span>
                  <span className="font-bold text-white">BDT {actualAdmissionFee.toLocaleString()}</span>
                </div>
              </div>

              {/* Overall Special Discount */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs text-amber-300 mb-1">
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
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-amber-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Grand Total */}
              <div className="pt-3 border-t border-slate-800">
                <div className="flex justify-between items-end">
                  <span className="text-xs text-slate-300 uppercase font-bold tracking-wider">Grand Total Bill:</span>
                  <span className="text-2xl font-black text-emerald-400">
                    BDT {grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Advance & Due */}
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span>Advance Paid:</span>
                  <span className="font-bold text-emerald-300">BDT {advancePaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-rose-300">
                  <span>Net Due Balance:</span>
                  <span className="text-base font-black text-rose-300">BDT {dueAmount.toLocaleString()}</span>
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
        allIndoorServices={indoorServiceList}
        initialFoodChargeSelected={foodChargeSelected}
        initialFoodChargePerDay={foodChargePerDay === '' ? 500 : Number(foodChargePerDay)}
        initialIncludeAdmissionFee={includeAdmissionFee}
        initialAdmissionFee={admissionFee === '' ? 1000 : Number(admissionFee)}
        currentMode={patientTreatmentMode}
        currentPackage={treatmentPackage}
        patientName={selectedPatient?.name}
        patientMobile={selectedPatient?.mobile}
        consultingDoctor={billingDoctor}
        onApplyPackage={handleApplyPackageFromComparison}
      />
    </>
  );
};
