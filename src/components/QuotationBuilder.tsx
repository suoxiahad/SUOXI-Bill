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
  Activity
} from 'lucide-react';
import { 
  Patient, 
  IndividualTreatment, 
  OutdoorPackage, 
  IndoorService, 
  InvoiceQuotation, 
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
    currentUser?.name || initialPatient?.doctorName || 'Prof. Dr. SM Shahidullah'
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
  const [treatmentDays, setTreatmentDays] = useState<number | ''>('');
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number | ''>('');

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
      const unitCost = Number(item.unitCost) || 0;
      const sessions = item.sessions === '' ? 0 : (Number(item.sessions) || 0);
      const discPct = newVal === '' ? 0 : Number(newVal);
      const gross = unitCost * sessions;
      const discountAmount = Math.round((gross * discPct) / 100);
      const totalCost = Math.max(0, gross - discountAmount);
      return {
        ...item,
        discountPercent: newVal,
        discountAmount,
        totalCost
      };
    }));
  };

  const handlePatientModeChange = (newMode: 'outdoor' | 'indoor' | '') => {
    setPatientTreatmentMode(newMode);
    setTreatmentDays('');
    setBulkDiscountPercent('');
    setOverallDiscountPercent('');
    setIncludeAdmissionFee(false);
    setAdvancePaid(0);

    setFoodChargeSelected(false);
    setFoodChargePerDay(500);
    setFoodChargeDays('');

    setTreatmentList(prev => prev.map(item => ({
      ...item,
      selected: false,
      sessions: '',
      discountPercent: '',
      discountAmount: 0,
      totalCost: 0
    })));

    setIndoorServiceList(prev => prev.map(item => ({
      ...item,
      selected: false,
      days: '',
      totalAmount: 0
    })));

    setOutdoorPackageList(prev => prev.map(item => ({
      ...item,
      selected: false,
      packageName: item.catalogId === 'outdoor_package_single' ? '...-Day Package' : item.packageName,
      totalBaseCost: '',
      discountPercent: '',
      discountAmount: 0,
      netCost: 0
    })));
  };

  const handleTreatmentDaysInputChange = (newDays: number | '') => {
    setTreatmentDays(newDays);

    if (newDays !== '' && Number(newDays) > 0) {
      const numDays = Number(newDays);
      if (foodChargeSelected) {
        setFoodChargeDays(numDays);
      }
      setTreatmentList(prev => prev.map(item => {
        if (!item.selected) {
          return {
            ...item,
            sessions: '',
            discountPercent: '',
            discountAmount: 0,
            totalCost: 0
          };
        }
        const dailySessions = patientTreatmentMode === 'outdoor'
          ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
          : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
        const computedSessions = dailySessions * numDays;
        const unitCost = Number(item.unitCost) || 0;
        const discountPercent = item.discountPercent === '' 
          ? (bulkDiscountPercent === '' ? 0 : Number(bulkDiscountPercent)) 
          : (Number(item.discountPercent) || 0);
        const gross = unitCost * computedSessions;
        const discountAmount = Math.round((gross * discountPercent) / 100);
        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          sessions: computedSessions,
          discountPercent: item.discountPercent === '' ? bulkDiscountPercent : item.discountPercent,
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
          days: numDays,
          totalAmount: dailyRate * numDays
        };
      }));

      setOutdoorPackageList(prev => prev.map(item => {
        if (item.catalogId === 'outdoor_package_single') {
          if (patientTreatmentMode === 'outdoor') {
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
    } else {
      if (foodChargeSelected) {
        setFoodChargeDays('');
      }
      setTreatmentList(prev => prev.map(item => ({
        ...item,
        sessions: '',
        discountAmount: 0,
        totalCost: 0
      })));
      setIndoorServiceList(prev => prev.map(item => ({
        ...item,
        days: '',
        totalAmount: 0
      })));
      setOutdoorPackageList(prev => prev.map(item => ({
        ...item,
        selected: false,
        packageName: item.catalogId === 'outdoor_package_single' ? '...-Day Package' : item.packageName,
        totalBaseCost: '',
        discountPercent: '',
        discountAmount: 0,
        netCost: 0
      })));
    }
  };

  // Initialize treatment list from catalog setup (Admin entry)
  useEffect(() => {
    const treatmentCatalog = catalog.filter(c => c.category === 'treatment' || c.category === 'consultation');
    
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
              sessions: '',
              discountPercent: '',
              discountAmount: 0,
              totalCost: 0
            });
          }
        });
        return [...updatedPrev, ...newItems];
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
          if ((item.sessions === '' || item.sessions === 0) && treatmentDays !== '' && Number(treatmentDays) > 0) {
            const numDays = Number(treatmentDays);
            const dailySessions = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
              ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
              : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
            newSessions = dailySessions * numDays;
          }

          if (item.discountPercent === '' && bulkDiscountPercent !== '') {
            newDiscountPercent = bulkDiscountPercent;
          }
        } else {
          newSessions = '';
          newDiscountPercent = '';
        }

        const unitCost = Number(item.unitCost) || 0;
        const sessionsNum = newSessions === '' ? 0 : (Number(newSessions) || 0);
        const discountPctNum = newDiscountPercent === '' ? 0 : (Number(newDiscountPercent) || 0);
        const gross = unitCost * sessionsNum;
        const discountAmount = Math.round((gross * discountPctNum) / 100);
        const totalCost = Math.max(0, gross - discountAmount);

        return {
          ...item,
          selected: newSelected,
          sessions: newSessions,
          discountPercent: newDiscountPercent,
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
        const discountPercent = updated.discountPercent === '' ? 0 : (Number(updated.discountPercent) || 0);
        const gross = unitCost * sessions;
        const discountAmount = Math.round((gross * discountPercent) / 100);
        const totalCost = Math.max(0, gross - discountAmount);
        const selected = fields.sessions !== undefined && Number(fields.sessions) > 0 ? true : updated.selected;
        return {
          ...updated,
          selected,
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
        return [...updatedPrev, ...newItems];
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

        if ((item.sessions === '' || item.sessions === 0) && treatmentDays !== '' && Number(treatmentDays) > 0) {
          const numDays = Number(treatmentDays);
          const dailySessions = (patientTreatmentMode === 'outdoor' || patientTreatmentMode === '')
            ? (item.outdoorSessions !== undefined ? item.outdoorSessions : 1)
            : (item.indoorSessions !== undefined ? item.indoorSessions : 1);
          newSessions = dailySessions * numDays;
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

  const effectiveOutdoorSubtotal = patientTreatmentMode === 'outdoor' ? 0 : outdoorSubtotal;
  const actualAdmissionFee = includeAdmissionFee ? Number(admissionFee || 0) : 0;
  const grossTotal = treatmentsSubtotal + effectiveOutdoorSubtotal + indoorSubtotal + actualAdmissionFee;

  const overallDiscountAmount = Math.round((grossTotal * Number(overallDiscountPercent || 0)) / 100);
  const grandTotal = Math.max(0, grossTotal - overallDiscountAmount);
  const dueAmount = Math.max(0, grandTotal - Number(advancePaid || 0));

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
    <div className="space-y-8">
      
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
                <input
                  type="text"
                  value={billingDoctor}
                  onChange={(e) => setBillingDoctor(e.target.value)}
                  placeholder="Doctor Name..."
                  className="bg-slate-950 text-emerald-300 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-400 w-56 sm:w-64"
                />
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

            <button
              onClick={addCustomTreatmentItem}
              className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom</span>
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

            {/* Treatment Duration (Days) & Bulk Discount Input Fields */}
            <div className="flex flex-wrap items-center gap-3.5 border-l border-slate-200/80 pl-3.5">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-800 whitespace-nowrap">
                  Treatment Days:
                </label>
                <div className="relative w-28" title={!patientTreatmentMode ? "Please select Outdoor or Indoor Patient type first" : ""}>
                  <input
                    type="number"
                    min={1}
                    disabled={!patientTreatmentMode}
                    placeholder="e.g. 10"
                    value={treatmentDays}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                      handleTreatmentDaysInputChange(val);
                    }}
                    className={`w-full pl-3 pr-9 py-1.5 border rounded-xl text-xs font-bold text-center shadow-2xs transition-colors ${
                      patientTreatmentMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                    }`}
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-bold">Days</span>
                </div>
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
            </div>

          </div>

          {/* Active Auto-Calculation Notice */}
          {patientTreatmentMode && treatmentDays !== '' && Number(treatmentDays) > 0 && (
            <div className="text-[11px] text-emerald-900 font-semibold bg-emerald-100/90 px-3 py-1.5 rounded-lg border border-emerald-300/80 flex items-center justify-between">
              <span>
                ✨ Sessions auto-calculated for <strong className="uppercase underline text-emerald-950">{patientTreatmentMode}</strong> patient for <strong>{treatmentDays} Days</strong>.
              </span>
              <span className="text-[10px] bg-white text-emerald-800 px-2 py-0.5 rounded-md font-mono font-bold shadow-2xs">
                Auto Fill Active
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
                <th className="p-3 w-24 text-center">Sessions</th>
                <th className="p-3 w-24 text-center">Discount (%)</th>
                <th className="p-3 w-28 text-center">Discount (BDT)</th>
                <th className="p-3 w-32 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTreatmentList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-xs font-medium">
                    No treatment matching "{treatmentSearch}". Click "+ Custom" to add a new treatment.
                  </td>
                </tr>
              ) : (
                filteredTreatmentList.map((item, idx) => {
                  const isChecked = item.selected;
                  return (
                    <tr 
                      key={item.id ? `${item.id}-${idx}` : `tr-${idx}`} 
                      className={`transition-colors ${
                        isChecked 
                          ? 'bg-emerald-50/80 font-medium' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
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
                              <div className="flex items-center gap-2 w-full">
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
                              <span className={`text-xs font-bold ${isChecked ? 'text-emerald-950' : 'text-slate-800'}`}>
                                {item.treatmentName}
                              </span>
                            )}
                          </div>
                          {item.isCustom ? (
                            <input
                              type="text"
                              placeholder="Treatment details..."
                              value={item.description || ''}
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
                          <div className="relative">
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
                      <td className="p-3 text-center">
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
                      <td className="p-3 text-center">
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

        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs">
          <div className="text-slate-500 font-medium">
            Selected treatments: <span className="font-bold text-emerald-800">{activeTreatments.length}</span> of {treatmentList.length} items
          </div>

          <div className="text-right">
            <span className="text-slate-700 font-bold">Treatments Subtotal: </span>
            <span className="text-emerald-700 font-black text-base ml-2">
              BDT {treatmentsSubtotal.toLocaleString()}
            </span>
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
            <button
              onClick={addCustomOutdoorPackage}
              className="flex items-center gap-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs px-3 py-1.5 rounded-xl border border-teal-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom Package</span>
            </button>
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
                    No outdoor package matching "{outdoorSearch}". Click "+ Custom Package" to add one manually.
                  </td>
                </tr>
              ) : (
                filteredOutdoorPackageList.map((item, idx) => {
                  const isChecked = item.selected;
                  return (
                    <tr 
                      key={item.id ? `${item.id}-${idx}` : `pkg-tr-${idx}`} 
                      className={`transition-colors ${
                        isChecked 
                          ? 'bg-teal-50/80 font-medium' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
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
                              <div className="flex items-center gap-2 w-full">
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
                      <td className="p-3">
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
                      <td className="p-3">
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

          <div className="text-right">
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
              onClick={addCustomIndoorService}
              className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom Cabin</span>
            </button>
          </div>
        </div>

        {/* Indoor Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-3 w-16 text-center">SELECT</th>
                <th className="p-3">SL & Room / Cabin Type</th>
                <th className="p-3 w-36">Daily Rate (BDT)</th>
                <th className="p-3 w-28 text-center">Days Stay</th>
                <th className="p-3 w-36 text-right">Total Amount (BDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIndoorServiceList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400 text-xs font-medium">
                    No room / cabin type matching "{indoorSearch}". Click "+ Custom Cabin" to add one manually.
                  </td>
                </tr>
              ) : (
                filteredIndoorServiceList.map((item, idx) => {
                  const isChecked = item.selected;
                  return (
                    <tr 
                      key={item.id ? `${item.id}-${idx}` : `ind-tr-${idx}`} 
                      className={`transition-colors ${
                        isChecked 
                          ? 'bg-indigo-50/80 font-medium' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
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
                              <div className="flex items-center gap-2 w-full">
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
                          <div className="relative">
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
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min={1}
                          placeholder="0"
                          value={item.days === '' ? '' : item.days}
                          onChange={(e) => updateIndoorServiceItem(item.id, { days: e.target.value === '' ? '' : Number(e.target.value) })}
                          className={`w-full px-1.5 py-1 border rounded-lg text-xs font-bold text-center placeholder-slate-300 transition-colors ${
                            isChecked
                              ? 'bg-white border-slate-300 text-indigo-900 focus:ring-2 focus:ring-indigo-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-indigo-500'
                          }`}
                        />
                      </td>

                      {/* Total Amount */}
                      <td className="p-3 text-right">
                        <span className={`text-xs font-black ${isChecked ? 'text-indigo-700 text-sm' : 'text-slate-400'}`}>
                          BDT {(item.totalAmount || 0).toLocaleString()}
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
                <th className="p-3 w-36 text-right">TOTAL AMOUNT (BDT)</th>
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
                    value={foodChargeDays === '' ? '' : foodChargeDays}
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
                      foodChargeSelected
                        ? 'bg-white border-slate-300 text-amber-900 focus:ring-2 focus:ring-amber-500'
                        : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-amber-500'
                    }`}
                  />
                </td>

                {/* Total Amount */}
                <td className="p-3 text-right">
                  <span className={`text-xs font-black ${foodChargeSelected ? 'text-amber-700 text-sm' : 'text-slate-400'}`}>
                    BDT {foodChargeTotal.toLocaleString()}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs">
          <div className="text-slate-500 font-medium">
            Selected room / accommodation: <span className="font-bold text-indigo-800">{activeIndoorServices.length + (foodChargeSelected ? 1 : 0)}</span> of {indoorServiceList.length + 1} items
          </div>

          <div className="text-right">
            <span className="text-slate-700 font-bold">Indoor Accommodation Subtotal: </span>
            <span className="text-indigo-700 font-black text-base ml-2">
              BDT {indoorSubtotal.toLocaleString()}
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
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Indoor Accommodation:</span>
                  <span className="font-bold text-white">BDT {indoorRoomOnlySubtotal.toLocaleString()}</span>
                </div>

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
  );
};
