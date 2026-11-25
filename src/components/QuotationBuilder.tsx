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
  Activity,
  Lock,
  Users,
  X,
  ArrowLeft,
  Calendar
} from 'lucide-react';
import {
  Patient,
  IndividualTreatment,
  AdditionalTreatment,
  IndoorService,
  InvoiceQuotation,
  CatalogItem,
  User
} from '../types';
import { DEFAULT_CATALOG } from '../data/defaultCatalog';
import { searchPatientsLiveApi, addOrUpdatePatientApi } from '../utils/storage';
import { idbGet, idbSet, idbDel } from '../utils/indexedDb';
import { matchPatient, matchSearchQuery, normalizePhoneDigits, normalizeSearchText } from '../utils/searchHelper';
import { makeUniqueId } from '../utils/id';

interface TreatmentRowState {
  id: string;
  catalogId?: string;
  selected: boolean;
  treatmentName: string;
  unitCost: number;
  outdoorQty: number | '';
  indoorQty: number | '';
  outdoorDiscountPct: number | '';
  indoorDiscountPct: number | '';
  outdoorDiscountType?: 'percent' | 'fixed';
  indoorDiscountType?: 'percent' | 'fixed';
  outdoorDiscountFixed?: number | '';
  indoorDiscountFixed?: number | '';
  outdoorSessions?: number;
  indoorSessions?: number;
  description?: string;
  rateNote?: string;
  isCustom?: boolean;
  isIndoorFree?: boolean;
  fixedDiscountAmount?: number;
  outdoorDiscountPercent?: number;
  outdoorDiscountAmount?: number;
  defaultDiscountPercent?: number;
}

interface WeeklyTreatmentRowState {
  id: string;
  catalogId?: string;
  selected: boolean;
  treatmentName: string;
  unitCost: number;
  outdoorQty: number | '';
  indoorQty: number | '';
  outdoorDiscountPct: number | '';
  indoorDiscountPct: number | '';
  outdoorDiscountType?: 'percent' | 'fixed';
  indoorDiscountType?: 'percent' | 'fixed';
  outdoorDiscountFixed?: number | '';
  indoorDiscountFixed?: number | '';
  outdoorSessions?: number;
  indoorSessions?: number;
  description?: string;
  rateNote?: string;
  isCustom?: boolean;
  isIndoorFree?: boolean;
  fixedDiscountAmount?: number;
  outdoorDiscountPercent?: number;
  outdoorDiscountAmount?: number;
  defaultDiscountPercent?: number;
}

interface IndoorServiceRowState {
  id: string;
  catalogId?: string;
  selected: boolean;
  roomType: string;
  dailyRate: number;
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
  onSaveQuotation: (quotation: InvoiceQuotation) => Promise<InvoiceQuotation | void> | InvoiceQuotation | void;
  onPreviewPrint: (quotation: InvoiceQuotation) => void;
  onBackToPostConsultation?: () => void;
  onUpdatePatient?: (patient: Patient) => void;
}

function isItemIndoorFreeByDefault(item: { catalogId?: string; id?: string; treatmentName?: string; isIndoorFree?: boolean }): boolean {
  if (item.catalogId === 'add-ed' || item.id === 'add-ed') return false;
  return Boolean(item.isIndoorFree);
}

function computeRowPricing(
  item: {
    selected: boolean;
    unitCost: number;
    catalogId?: string;
    fixedDiscountAmount?: number;
    outdoorDiscountPercent?: number;
    outdoorDiscountAmount?: number;
    defaultDiscountPercent?: number;
    isIndoorFree?: boolean;
  },
  qtyVal: number | '',
  manualDiscPct: number | '',
  mode: 'outdoor' | 'indoor',
  bulkPct: number | '',
  discountType?: 'percent' | 'fixed',
  manualFixedAmt?: number | ''
): { qty: number; discountPercent: number; discountAmount: number; netCost: number; discountType: 'percent' | 'fixed'; isLockedDiscount: boolean; lockReason?: string } {
  if (!item.selected) {
    return { qty: 0, discountPercent: 0, discountAmount: 0, netCost: 0, discountType: 'percent', isLockedDiscount: false };
  }
  const unitCost = Math.max(0, Number(item.unitCost) || 0);
  const qty = qtyVal === '' ? 1 : Math.max(0, Number(qtyVal) || 0);
  const gross = unitCost * qty;

  const effectiveType: 'percent' | 'fixed' =
    discountType ||
    (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0 && (manualDiscPct === '' || manualDiscPct === undefined)
      ? 'fixed'
      : 'percent');

  if (effectiveType === 'fixed') {
    const rawFixed =
      manualFixedAmt !== undefined && manualFixedAmt !== ''
        ? Math.max(0, Number(manualFixedAmt) || 0)
        : item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0
        ? Number(item.fixedDiscountAmount)
        : 0;
    const discAmt = Math.min(gross, Math.round(rawFixed));
    const pct = gross > 0 ? Math.round((discAmt / gross) * 100) : 0;
    return {
      qty,
      discountPercent: pct,
      discountAmount: discAmt,
      netCost: Math.max(0, gross - discAmt),
      discountType: 'fixed',
      isLockedDiscount: false
    };
  }

  if (manualDiscPct !== '' && manualDiscPct !== undefined) {
    const pct = Math.min(100, Math.max(0, Number(manualDiscPct) || 0));
    const discAmt = Math.round((gross * pct) / 100);
    return {
      qty,
      discountPercent: pct,
      discountAmount: discAmt,
      netCost: Math.max(0, gross - discAmt),
      discountType: 'percent',
      isLockedDiscount: false
    };
  }

  if (mode === 'indoor' && isItemIndoorFreeByDefault(item)) {
    return {
      qty,
      discountPercent: 100,
      discountAmount: gross,
      netCost: 0,
      discountType: 'percent',
      isLockedDiscount: false
    };
  }

  if (mode === 'outdoor' && item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) {
    const pct = Number(item.outdoorDiscountPercent);
    const discAmt = Math.round((gross * pct) / 100);
    return {
      qty,
      discountPercent: pct,
      discountAmount: discAmt,
      netCost: Math.max(0, gross - discAmt),
      discountType: 'percent',
      isLockedDiscount: false
    };
  }

  if (mode === 'outdoor' && item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) {
    const discAmt = Math.min(gross, Number(item.outdoorDiscountAmount) * qty);
    const pct = gross > 0 ? Math.round((discAmt / gross) * 100) : 0;
    return {
      qty,
      discountPercent: pct,
      discountAmount: discAmt,
      netCost: Math.max(0, gross - discAmt),
      discountType: 'fixed',
      isLockedDiscount: false
    };
  }

  const fallbackBulk = bulkPct === '' ? 0 : Math.min(100, Math.max(0, Number(bulkPct) || 0));
  const pct =
    item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
      ? Number(item.defaultDiscountPercent)
      : fallbackBulk;

  const discAmt = Math.round((gross * pct) / 100);
  return {
    qty,
    discountPercent: pct,
    discountAmount: discAmt,
    netCost: Math.max(0, gross - discAmt),
    discountType: 'percent',
    isLockedDiscount: false
  };
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
  onBackToPostConsultation,
  onUpdatePatient
}) => {
  const [phoneSearch, setPhoneSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatient || null);
  const [patientAddress, setPatientAddress] = useState<string>(initialPatient?.address || '');
  const draftInvoiceIdRef = useRef<string>(makeUniqueId());

  const [billingDoctor, setBillingDoctor] = useState(
    currentUser?.name || initialPatient?.doctorName || 'Dr. S.M. Shahidul Islam PhD'
  );

  useEffect(() => {
    if (initialPatient && !editingQuotation) {
      setSelectedPatient(initialPatient);
      setPhoneSearch(initialPatient.phone);
      setPatientAddress(initialPatient.address || '');
    }
  }, [initialPatient, editingQuotation]);

  useEffect(() => {
    if (currentUser?.name && !editingQuotation) {
      setBillingDoctor(currentUser.name);
    } else if (selectedPatient?.doctorName && !editingQuotation) {
      setBillingDoctor(selectedPatient.doctorName);
    }
  }, [currentUser, selectedPatient, editingQuotation]);

  // Independent Outdoor / Indoor Mode Checkboxes + Separate Discounts + Configurable Advance Days
  const [includeOutdoor, setIncludeOutdoor] = useState<boolean>(true);
  const [includeIndoor, setIncludeIndoor] = useState<boolean>(false);
  const [outdoorDiscountPercent, setOutdoorDiscountPercent] = useState<number | ''>(30);
  const [indoorDiscountPercent, setIndoorDiscountPercent] = useState<number | ''>(30);
  const [advanceCourseDays, setAdvanceCourseDays] = useState<number | ''>(10);

  // Section Lists
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [treatmentList, setTreatmentList] = useState<TreatmentRowState[]>([]);

  const [indoorSearch, setIndoorSearch] = useState('');
  const [indoorServiceList, setIndoorServiceList] = useState<IndoorServiceRowState[]>([]);

  const [additionalTreatmentSearch, setAdditionalTreatmentSearch] = useState('');
  const [additionalTreatmentList, setAdditionalTreatmentList] = useState<WeeklyTreatmentRowState[]>([]);

  // Indoor Food & Admission Fee (1 Day / One-time)
  const [foodChargeSelected, setFoodChargeSelected] = useState<boolean>(false);
  const [foodChargePerDay, setFoodChargePerDay] = useState<number | ''>(500);
  const [includeAdmissionFee, setIncludeAdmissionFee] = useState<boolean>(false);
  const [admissionFee, setAdmissionFee] = useState<number | ''>(1000);

  // Overall discount & billing status
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>(0);
  const [paymentStatus, setPaymentStatus] = useState<'Quotation' | 'Estimate' | 'Partial Paid' | 'Fully Paid'>('Quotation');
  const [notes, setNotes] = useState<string>('Quotation validity is 7 days from the date of issue.');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState<boolean>(false);

  const effectiveCatalog = useMemo<CatalogItem[]>(() => {
    if (Array.isArray(catalog) && catalog.length > 0) {
      return catalog;
    }
    return DEFAULT_CATALOG;
  }, [catalog]);

  // Initialize Section 1 Treatments from catalog
  useEffect(() => {
    const treatmentCatalog = effectiveCatalog.filter(c => c.category === 'treatment' || c.category === 'consultation');
    const catalogOrderMap = new Map<string, number>(treatmentCatalog.map((c, i) => [c.id, i]));

    setTreatmentList(prev => {
      const catalogMap = new Map<string, CatalogItem>(treatmentCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        const filteredPrev = prev.filter(item => item.isCustom || (item.catalogId && catalogMap.has(item.catalogId)));
        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            return {
              ...item,
              treatmentName: catItem.name,
              unitCost: catItem.defaultPrice || 1000,
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent
            };
          }
          return item;
        });

        const existingIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: TreatmentRowState[] = [];
        treatmentCatalog.forEach(catItem => {
          if (!existingIds.has(catItem.id)) {
            newItems.push({
              id: `tr-list-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              treatmentName: catItem.name,
              unitCost: catItem.defaultPrice || 1000,
              outdoorQty: '',
              indoorQty: '',
              outdoorDiscountPct: '',
              indoorDiscountPct: '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent
            });
          }
        });

        return [...updatedPrev, ...newItems].sort((a, b) => {
          const iA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const iB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return iA - iB;
        });
      }

      return treatmentCatalog.map(catItem => ({
        id: `tr-list-${catItem.id}`,
        catalogId: catItem.id,
        selected: false,
        treatmentName: catItem.name,
        unitCost: catItem.defaultPrice || 1000,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: '',
        outdoorSessions: catItem.outdoorSessions,
        indoorSessions: catItem.indoorSessions,
        description: catItem.description || '',
        rateNote: catItem.rateNote || '',
        isIndoorFree: catItem.isIndoorFree,
        fixedDiscountAmount: catItem.fixedDiscountAmount,
        outdoorDiscountPercent: catItem.outdoorDiscountPercent,
        outdoorDiscountAmount: catItem.outdoorDiscountAmount,
        defaultDiscountPercent: catItem.defaultDiscountPercent
      }));
    });
  }, [effectiveCatalog]);

  // Initialize Indoor Rooms from catalog
  useEffect(() => {
    const roomCatalog = effectiveCatalog.filter(c => c.category === 'indoor_room');
    const catalogOrderMap = new Map<string, number>(roomCatalog.map((c, i) => [c.id, i]));

    setIndoorServiceList(prev => {
      const catalogMap = new Map<string, CatalogItem>(roomCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        const filteredPrev = prev.filter(item => item.isCustom || (item.catalogId && catalogMap.has(item.catalogId)));
        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            return {
              ...item,
              roomType: catItem.name,
              dailyRate: catItem.defaultPrice || 1000,
              remarks: catItem.description || '',
              rateNote: catItem.rateNote || ''
            };
          }
          return item;
        });

        const existingIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: IndoorServiceRowState[] = [];
        roomCatalog.forEach(catItem => {
          if (!existingIds.has(catItem.id)) {
            newItems.push({
              id: `ind-list-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              roomType: catItem.name,
              dailyRate: catItem.defaultPrice || 1000,
              remarks: catItem.description || '',
              rateNote: catItem.rateNote || ''
            });
          }
        });

        return [...updatedPrev, ...newItems].sort((a, b) => {
          const iA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const iB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return iA - iB;
        });
      }

      return roomCatalog.map(catItem => ({
        id: `ind-list-${catItem.id}`,
        catalogId: catItem.id,
        selected: false,
        roomType: catItem.name,
        dailyRate: catItem.defaultPrice || 1000,
        remarks: catItem.description || '',
        rateNote: catItem.rateNote || ''
      }));
    });
  }, [effectiveCatalog]);

  // Initialize Weekly Treatments from catalog
  useEffect(() => {
    const addCatalog = effectiveCatalog.filter(c => c.category === 'additional_treatment');
    const catalogOrderMap = new Map<string, number>(addCatalog.map((c, i) => [c.id, i]));

    setAdditionalTreatmentList(prev => {
      const catalogMap = new Map<string, CatalogItem>(addCatalog.map(c => [c.id, c]));

      if (prev.length > 0) {
        const filteredPrev = prev.filter(item => item.isCustom || (item.catalogId && catalogMap.has(item.catalogId)));
        const updatedPrev = filteredPrev.map(item => {
          if (!item.isCustom && item.catalogId && catalogMap.has(item.catalogId)) {
            const catItem = catalogMap.get(item.catalogId)!;
            return {
              ...item,
              treatmentName: catItem.name,
              unitCost: catItem.defaultPrice || 1000,
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent
            };
          }
          return item;
        });

        const existingIds = new Set(filteredPrev.map(p => p.catalogId).filter(Boolean));
        const newItems: WeeklyTreatmentRowState[] = [];
        addCatalog.forEach(catItem => {
          if (!existingIds.has(catItem.id)) {
            newItems.push({
              id: `add-tr-${catItem.id}`,
              catalogId: catItem.id,
              selected: false,
              treatmentName: catItem.name,
              unitCost: catItem.defaultPrice || 1000,
              outdoorQty: '',
              indoorQty: '',
              outdoorDiscountPct: '',
              indoorDiscountPct: '',
              outdoorSessions: catItem.outdoorSessions,
              indoorSessions: catItem.indoorSessions,
              description: catItem.description || '',
              rateNote: catItem.rateNote || '',
              isIndoorFree: catItem.isIndoorFree,
              fixedDiscountAmount: catItem.fixedDiscountAmount,
              outdoorDiscountPercent: catItem.outdoorDiscountPercent,
              outdoorDiscountAmount: catItem.outdoorDiscountAmount,
              defaultDiscountPercent: catItem.defaultDiscountPercent
            });
          }
        });

        return [...updatedPrev, ...newItems].sort((a, b) => {
          const iA = a.catalogId ? (catalogOrderMap.get(a.catalogId) ?? 9999) : 9999;
          const iB = b.catalogId ? (catalogOrderMap.get(b.catalogId) ?? 9999) : 9999;
          return iA - iB;
        });
      }

      return addCatalog.map(catItem => ({
        id: `add-tr-${catItem.id}`,
        catalogId: catItem.id,
        selected: false,
        treatmentName: catItem.name,
        unitCost: catItem.defaultPrice || 1000,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: '',
        outdoorSessions: catItem.outdoorSessions,
        indoorSessions: catItem.indoorSessions,
        description: catItem.description || '',
        rateNote: catItem.rateNote || '',
        isIndoorFree: catItem.isIndoorFree,
        fixedDiscountAmount: catItem.fixedDiscountAmount,
        outdoorDiscountPercent: catItem.outdoorDiscountPercent,
        outdoorDiscountAmount: catItem.outdoorDiscountAmount,
        defaultDiscountPercent: catItem.defaultDiscountPercent
      }));
    });
  }, [effectiveCatalog]);

  // Load editingQuotation when passed
  useEffect(() => {
    if (!editingQuotation) return;

    const foundPatient = (editingQuotation.patientId && editingQuotation.patientId !== 'walkin'
      ? patients.find(p => p.id === editingQuotation.patientId)
      : undefined) || {
      id: editingQuotation.patientId || makeUniqueId(),
      name: editingQuotation.patientName || 'Walk-in Patient',
      phone: editingQuotation.patientPhone || '01700000000',
      age: editingQuotation.patientAge || '',
      gender: editingQuotation.patientGender || 'Male',
      address: editingQuotation.patientAddress || editingQuotation.packageComparison?.patientAddress || '',
      doctorName: editingQuotation.doctorName || 'Dr. S.M. Shahidul Islam PhD',
      status: 'Consulted',
      createdAt: editingQuotation.createdAt || new Date().toISOString()
    };

    setSelectedPatient(foundPatient);
    setPhoneSearch(foundPatient.phone || '');
    setPatientAddress(editingQuotation.patientAddress || editingQuotation.packageComparison?.patientAddress || foundPatient.address || '');
    if (editingQuotation.doctorName) {
      setBillingDoctor(editingQuotation.doctorName);
    }

    const snap = editingQuotation.packageComparison;
    const mode = editingQuotation.patientTreatmentMode;
    let nextOutdoor = true;
    let nextIndoor = false;
    if (mode === 'both') {
      nextOutdoor = true;
      nextIndoor = true;
    } else if (mode === 'indoor') {
      nextOutdoor = false;
      nextIndoor = true;
    } else if (mode === 'outdoor') {
      nextOutdoor = true;
      nextIndoor = false;
    } else if (snap && (snap.showOutdoor !== undefined || snap.showIndoor !== undefined)) {
      nextOutdoor = Boolean(snap.showOutdoor);
      nextIndoor = Boolean(snap.showIndoor);
    } else {
      const hasIndoorRooms = (editingQuotation.indoorServices || []).some(
        s => s.id !== 'food-charge-3x' && !s.roomType.toLowerCase().includes('food charge')
      );
      nextIndoor = hasIndoorRooms;
      nextOutdoor = !hasIndoorRooms;
    }

    setIncludeOutdoor(nextOutdoor);
    setIncludeIndoor(nextIndoor);

    const outDisc = editingQuotation.outdoorDiscountPercent ?? snap?.outdoorDiscountPercent ?? 30;
    const inDisc = editingQuotation.indoorDiscountPercent ?? snap?.indoorDiscountPercent ?? 30;
    setOutdoorDiscountPercent(outDisc);
    setIndoorDiscountPercent(inDisc);

    const advDays = editingQuotation.advanceCourseDays ?? snap?.advanceCourseDays ?? 10;
    setAdvanceCourseDays(advDays);

    setIncludeAdmissionFee((editingQuotation.admissionFee || 0) > 0 || Boolean(snap?.includeAdmissionFee));
    setAdmissionFee(snap?.admissionFee ?? editingQuotation.admissionFee ?? 1000);
    setOverallDiscountPercent(editingQuotation.overallDiscountPercent || '');
    setAdvancePaid(editingQuotation.advancePaid || 0);
    setPaymentStatus(editingQuotation.paymentStatus || 'Quotation');
    setNotes(editingQuotation.notes || '');

    // Treatments hydration
    const outTrMap = new Map<string, IndividualTreatment>(
      (snap?.outdoorTreatments || editingQuotation.treatments || []).map((t): [string, IndividualTreatment] => [t.treatmentName.toLowerCase().trim(), t])
    );
    const inTrMap = new Map<string, IndividualTreatment>(
      (snap?.indoorTreatments || editingQuotation.treatments || []).map((t): [string, IndividualTreatment] => [t.treatmentName.toLowerCase().trim(), t])
    );
    const baseTrMap = new Map<string, IndividualTreatment>(
      (editingQuotation.treatments || []).map((t): [string, IndividualTreatment] => [t.treatmentName.toLowerCase().trim(), t])
    );

    setTreatmentList(prev => prev.map(item => {
      const key = item.treatmentName.toLowerCase().trim();
      const baseMatch = baseTrMap.get(key);
      const outMatch = outTrMap.get(key);
      const inMatch = inTrMap.get(key);
      if (baseMatch || outMatch || inMatch) {
        return {
          ...item,
          selected: true,
          unitCost: baseMatch?.unitCost || outMatch?.unitCost || inMatch?.unitCost || item.unitCost,
          outdoorQty: outMatch?.sessions || baseMatch?.sessions || 1,
          indoorQty: inMatch?.sessions || baseMatch?.sessions || 1,
          outdoorDiscountPct: outMatch?.discountPercent ?? outDisc,
          indoorDiscountPct: isItemIndoorFreeByDefault(item) ? 100 : (inMatch?.discountPercent ?? inDisc),
          outdoorDiscountType: outMatch?.discountType || 'percent',
          indoorDiscountType: inMatch?.discountType || 'percent',
          outdoorDiscountFixed: outMatch?.discountType === 'fixed' ? (outMatch?.discountAmount ?? '') : '',
          indoorDiscountFixed: inMatch?.discountType === 'fixed' ? (inMatch?.discountAmount ?? '') : ''
        };
      }
      return {
        ...item,
        selected: false,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: '',
        outdoorDiscountType: 'percent',
        indoorDiscountType: 'percent',
        outdoorDiscountFixed: '',
        indoorDiscountFixed: ''
      };
    }));

    // Indoor rooms & food hydration
    const invoiceIndoor = editingQuotation.indoorServices || [];
    const foodItem = invoiceIndoor.find(i => i.id === 'food-charge-3x' || i.roomType.toLowerCase().includes('food charge'));
    if (foodItem || snap?.foodChargeSelected) {
      setFoodChargeSelected(true);
      setFoodChargePerDay(foodItem?.dailyRate || snap?.foodChargePerDay || 500);
    } else {
      setFoodChargeSelected(false);
    }

    const nonFoodIndoor = invoiceIndoor.filter(i => i.id !== 'food-charge-3x' && !i.roomType.toLowerCase().includes('food charge'));
    const indoorMap = new Map<string, IndoorService>(
      nonFoodIndoor.map((i): [string, IndoorService] => [i.roomType.toLowerCase().trim(), i])
    );
    setIndoorServiceList(prev => prev.map(item => {
      const match = indoorMap.get(item.roomType.toLowerCase().trim());
      if (match) {
        return {
          ...item,
          selected: true,
          dailyRate: match.dailyRate || item.dailyRate,
          remarks: match.remarks || item.remarks
        };
      }
      return { ...item, selected: false };
    }));

    // Weekly treatments hydration
    const outAddMap = new Map<string, AdditionalTreatment>(
      (snap?.outdoorAdditionalTreatments || editingQuotation.additionalTreatments || []).map((a): [string, AdditionalTreatment] => [a.treatmentName.toLowerCase().trim(), a])
    );
    const inAddMap = new Map<string, AdditionalTreatment>(
      (snap?.indoorAdditionalTreatments || editingQuotation.additionalTreatments || []).map((a): [string, AdditionalTreatment] => [a.treatmentName.toLowerCase().trim(), a])
    );
    const baseAddMap = new Map<string, AdditionalTreatment>(
      (editingQuotation.additionalTreatments || []).map((a): [string, AdditionalTreatment] => [a.treatmentName.toLowerCase().trim(), a])
    );

    setAdditionalTreatmentList(prev => prev.map(item => {
      const key = item.treatmentName.toLowerCase().trim();
      const baseMatch = baseAddMap.get(key);
      const outMatch = outAddMap.get(key);
      const inMatch = inAddMap.get(key);
      if (baseMatch || outMatch || inMatch) {
        const outIsFixed = outMatch?.discountType === 'fixed' || (!outMatch && baseMatch?.discountType === 'fixed');
        const inIsFixed = inMatch?.discountType === 'fixed' || (!inMatch && baseMatch?.discountType === 'fixed');
        return {
          ...item,
          selected: true,
          unitCost: baseMatch?.unitCost || outMatch?.unitCost || inMatch?.unitCost || item.unitCost,
          outdoorQty: outMatch?.sessions || baseMatch?.sessions || 1,
          indoorQty: inMatch?.sessions || baseMatch?.sessions || 1,
          outdoorDiscountType: outIsFixed ? 'fixed' : 'percent',
          indoorDiscountType: inIsFixed ? 'fixed' : 'percent',
          outdoorDiscountFixed: outIsFixed ? (outMatch?.discountAmount ?? baseMatch?.discountAmount ?? '') : '',
          indoorDiscountFixed: inIsFixed ? (inMatch?.discountAmount ?? baseMatch?.discountAmount ?? '') : '',
          outdoorDiscountPct: outIsFixed ? '' : (outMatch?.discountPercent ?? (item.outdoorDiscountPercent ?? 0)),
          indoorDiscountPct: inIsFixed ? '' : (isItemIndoorFreeByDefault(item) ? 100 : (inMatch?.discountPercent ?? 0))
        };
      }
      return {
        ...item,
        selected: false,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: '',
        outdoorDiscountType: 'percent',
        indoorDiscountType: 'percent',
        outdoorDiscountFixed: '',
        indoorDiscountFixed: ''
      };
    }));
  }, [editingQuotation]);

  // Unified list of known patients for search
  const allKnownPatients = useMemo<Patient[]>(() => {
    const result: Patient[] = [];
    const seenIds = new Set<string>();
    const seenNamePhones = new Set<string>();

    (patients || []).forEach(p => {
      if (!p) return;
      const pid = p.id ? String(p.id).trim() : '';
      const npKey = `${normalizeSearchText(p.name)}__${normalizePhoneDigits(p.phone)}`;
      if (pid && seenIds.has(pid)) return;
      if (!pid && seenNamePhones.has(npKey)) return;
      if (pid) seenIds.add(pid);
      if (npKey !== '__') seenNamePhones.add(npKey);
      result.push(p);
    });

    (quotations || []).forEach(q => {
      if (!q || (!q.patientName && !q.patientPhone)) return;
      const qPatId = q.patientId && q.patientId !== 'walkin' ? String(q.patientId).trim() : '';
      const npKey = `${normalizeSearchText(q.patientName)}__${normalizePhoneDigits(q.patientPhone)}`;
      if ((qPatId && seenIds.has(qPatId)) || (npKey !== '__' && seenNamePhones.has(npKey))) {
        return;
      }
      const syntheticId = qPatId || makeUniqueId();
      seenIds.add(syntheticId);
      if (npKey !== '__') seenNamePhones.add(npKey);
      result.push({
        id: syntheticId,
        name: q.patientName,
        phone: q.patientPhone || '',
        age: q.patientAge,
        gender: q.patientGender,
        address: q.patientAddress || q.packageComparison?.patientAddress || '',
        doctorName: q.doctorName,
        status: 'Quotation Created',
        createdAt: q.createdDate || new Date().toISOString(),
        notes: q.notes || ''
      });
    });

    return result;
  }, [patients, quotations]);

  // Patient Search state
  const [matchingPatients, setMatchingPatients] = useState<Patient[]>([]);
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState<boolean>(false);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [searchDateScope, setSearchDateScope] = useState<'today' | 'all'>('today');
  const searchDebounceTimer = useRef<any>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
      if (searchAbortControllerRef.current) searchAbortControllerRef.current.abort();
    };
  }, []);

  const getTodayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handlePatientSearchChange = (val: string, scopeOverride?: 'today' | 'all') => {
    const currentScope = scopeOverride || searchDateScope;
    setPhoneSearch(val);
    const trimmedVal = val ? val.trim() : '';
    if (!trimmedVal) {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
      setMatchingPatients([]);
      setIsPatientDropdownOpen(false);
      return;
    }

    const todayStr = getTodayDateStr();
    const localMatches = allKnownPatients.filter(p => {
      if (!matchPatient(val, p)) return false;
      if (currentScope === 'today') {
        const pDate = p.appointmentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
        return pDate === todayStr;
      }
      return true;
    });

    setMatchingPatients(localMatches);
    setIsPatientDropdownOpen(localMatches.length > 0 || trimmedVal.length >= 1);

    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }

    const isShortDigitSerial = /^[0-9০-৯]{1,2}$/.test(trimmedVal);
    if (trimmedVal.length >= 3 || isShortDigitSerial) {
      searchDebounceTimer.current = setTimeout(async () => {
        if (searchAbortControllerRef.current) searchAbortControllerRef.current.abort();
        const controller = new AbortController();
        searchAbortControllerRef.current = controller;
        try {
          const dateParam = currentScope === 'today' ? todayStr : undefined;
          const liveResults = await searchPatientsLiveApi(val, 50, dateParam, controller.signal);
          if (controller.signal.aborted) return;
          if (Array.isArray(liveResults)) {
            setMatchingPatients(prev => {
              const map = new Map<string, Patient>();
              prev.forEach(p => map.set(p.id || `${p.name}__${p.phone}`, p));
              liveResults.forEach(p => map.set(p.id || `${p.name}__${p.phone}`, p));
              const combined = Array.from(map.values()).filter(p => {
                if (!matchPatient(val, p)) return false;
                if (currentScope === 'today') {
                  const pDate = p.appointmentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
                  return pDate === todayStr;
                }
                return true;
              });
              setIsPatientDropdownOpen(combined.length > 0 || (currentScope === 'today' && trimmedVal.length >= 1));
              return combined;
            });
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        } finally {
          if (searchAbortControllerRef.current === controller) {
            searchAbortControllerRef.current = null;
          }
        }
      }, 300);
    }
  };

  const handleSelectPatient = (pat: Patient) => {
    setSelectedPatient(pat);
    setPhoneSearch(pat.phone);
    setPatientAddress(pat.address || '');
    if (pat.doctorName) setBillingDoctor(pat.doctorName);
    setIsPatientDropdownOpen(false);
  };

  const handlePhoneSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneSearch || !phoneSearch.trim()) {
      alert('Please enter a mobile number, patient name, or serial number.');
      return;
    }

    setIsSearchingLive(true);
    const todayStr = getTodayDateStr();

    let matched = allKnownPatients.filter(p => {
      if (!matchPatient(phoneSearch, p)) return false;
      if (searchDateScope === 'today') {
        const pDate = p.appointmentDate || (p.createdAt ? p.createdAt.split('T')[0] : '');
        return pDate === todayStr;
      }
      return true;
    });

    if (matched.length === 0) {
      try {
        const dateParam = searchDateScope === 'today' ? todayStr : undefined;
        const liveResults = await searchPatientsLiveApi(phoneSearch, 50, dateParam);
        if (Array.isArray(liveResults) && liveResults.length > 0) matched = liveResults;
      } catch (err) {
        console.warn('Live search error:', err);
      }
    }

    if (matched.length === 0 && searchDateScope === 'today') {
      try {
        const allDatesLive = await searchPatientsLiveApi(phoneSearch, 50);
        if (Array.isArray(allDatesLive) && allDatesLive.length > 0) {
          matched = allDatesLive;
          setSearchDateScope('all');
        }
      } catch {}
    }

    setIsSearchingLive(false);
    setMatchingPatients(matched);

    if (matched.length === 1) {
      handleSelectPatient(matched[0]);
    } else if (matched.length > 1) {
      setIsPatientDropdownOpen(true);
    } else {
      alert(`No registered patient found matching "${phoneSearch.trim()}". Please verify that the patient is registered in the Daily Appointment List.`);
      setIsPatientDropdownOpen(false);
    }
  };

  // Mode toggle handlers (independent checkboxes)
  const handleToggleOutdoorMode = (checked: boolean) => {
    setIncludeOutdoor(checked);
  };

  const handleToggleIndoorMode = (checked: boolean) => {
    setIncludeIndoor(checked);
    if (!checked) {
      setIncludeAdmissionFee(false);
      setFoodChargeSelected(false);
      setIndoorServiceList(prev => prev.map(item => ({ ...item, selected: false })));
    }
  };

  // Bulk Discount handlers (update global discount % and sync active rows that don't have fixed catalog discount)
  const handleOutdoorDiscountChange = (val: number | '') => {
    setOutdoorDiscountPercent(val);
    setTreatmentList(prev =>
      prev.map(item => {
        if (!item.selected) return item;
        if (item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0) return item;
        if (item.outdoorDiscountAmount !== undefined && Number(item.outdoorDiscountAmount) > 0) return item;
        if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) return item;
        if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) return item;
        return { ...item, outdoorDiscountPct: val };
      })
    );
  };

  const handleIndoorDiscountChange = (val: number | '') => {
    setIndoorDiscountPercent(val);
    setTreatmentList(prev =>
      prev.map(item => {
        if (!item.selected) return item;
        if (item.isIndoorFree) return { ...item, indoorDiscountPct: 100 };
        if (item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0) return item;
        if (item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0) return item;
        return { ...item, indoorDiscountPct: val };
      })
    );
  };

  // Daily Treatment Selection & Update
  const toggleTreatmentSelection = (id: string) => {
    setTreatmentList(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const nextSelected = !item.selected;
        if (!nextSelected) {
          return {
            ...item,
            selected: false,
            outdoorQty: '',
            indoorQty: '',
            outdoorDiscountPct: '',
            indoorDiscountPct: ''
          };
        }
        const catMatch = item.catalogId ? effectiveCatalog.find(c => c.id === item.catalogId) : undefined;
        const resolvedOutSessions = catMatch?.outdoorSessions ?? item.outdoorSessions;
        const resolvedInSessions = catMatch?.indoorSessions ?? item.indoorSessions;
        const defaultOutQty = resolvedOutSessions !== undefined && Number(resolvedOutSessions) > 0 ? Number(resolvedOutSessions) : 1;
        const defaultInQty = resolvedInSessions !== undefined && Number(resolvedInSessions) > 0 ? Number(resolvedInSessions) : 1;

        const defaultOutDisc =
          item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0
            ? Number(item.outdoorDiscountPercent)
            : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
            ? Number(item.defaultDiscountPercent)
            : outdoorDiscountPercent;
        const defaultInDisc = item.isIndoorFree
          ? 100
          : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
          ? Number(item.defaultDiscountPercent)
          : indoorDiscountPercent;

        return {
          ...item,
          selected: true,
          outdoorSessions: resolvedOutSessions,
          indoorSessions: resolvedInSessions,
          outdoorQty: item.outdoorQty === '' ? defaultOutQty : item.outdoorQty,
          indoorQty: item.indoorQty === '' ? defaultInQty : item.indoorQty,
          outdoorDiscountPct: defaultOutDisc,
          indoorDiscountPct: defaultInDisc
        };
      })
    );
  };

  const updateTreatmentItem = (id: string, fields: Partial<TreatmentRowState>) => {
    setTreatmentList(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...fields };
        if (
          (fields.outdoorQty !== undefined && Number(fields.outdoorQty) > 0) ||
          (fields.indoorQty !== undefined && Number(fields.indoorQty) > 0)
        ) {
          updated.selected = true;
        }
        return updated;
      })
    );
  };

  const addCustomTreatmentItem = () => {
    setTreatmentList(prev => [
      ...prev,
      {
        id: `tr-custom-${Date.now()}`,
        selected: true,
        treatmentName: 'Custom Therapy / Acupuncture',
        unitCost: 1000,
        outdoorQty: 1,
        indoorQty: 1,
        outdoorDiscountPct: outdoorDiscountPercent,
        indoorDiscountPct: indoorDiscountPercent,
        isCustom: true
      }
    ]);
  };

  const removeCustomTreatmentItem = (id: string) => {
    setTreatmentList(prev => prev.filter(item => item.id !== id));
  };

  const filteredTreatmentList = treatmentList.filter(item =>
    item.treatmentName.toLowerCase().includes(treatmentSearch.toLowerCase().trim())
  );
  const isAllTreatmentsSelected = filteredTreatmentList.length > 0 && filteredTreatmentList.every(t => t.selected);

  const toggleSelectAllTreatments = () => {
    const targetIds = new Set(filteredTreatmentList.map(t => t.id));
    const shouldSelect = !isAllTreatmentsSelected;
    setTreatmentList(prev =>
      prev.map(item => {
        if (!targetIds.has(item.id)) return item;
        if (!shouldSelect) {
          return {
            ...item,
            selected: false,
            outdoorQty: '',
            indoorQty: '',
            outdoorDiscountPct: '',
            indoorDiscountPct: ''
          };
        }
        const catMatch = item.catalogId ? effectiveCatalog.find(c => c.id === item.catalogId) : undefined;
        const resolvedOutSessions = catMatch?.outdoorSessions ?? item.outdoorSessions;
        const resolvedInSessions = catMatch?.indoorSessions ?? item.indoorSessions;
        const defaultOutQty = resolvedOutSessions !== undefined && Number(resolvedOutSessions) > 0 ? Number(resolvedOutSessions) : 1;
        const defaultInQty = resolvedInSessions !== undefined && Number(resolvedInSessions) > 0 ? Number(resolvedInSessions) : 1;

        const defaultOutDisc =
          item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0
            ? Number(item.outdoorDiscountPercent)
            : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
            ? Number(item.defaultDiscountPercent)
            : outdoorDiscountPercent;
        const defaultInDisc = item.isIndoorFree
          ? 100
          : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
          ? Number(item.defaultDiscountPercent)
          : indoorDiscountPercent;
        return {
          ...item,
          selected: true,
          outdoorSessions: resolvedOutSessions,
          indoorSessions: resolvedInSessions,
          outdoorQty: item.outdoorQty === '' ? defaultOutQty : item.outdoorQty,
          indoorQty: item.indoorQty === '' ? defaultInQty : item.indoorQty,
          outdoorDiscountPct: defaultOutDisc,
          indoorDiscountPct: defaultInDisc
        };
      })
    );
  };

  // Indoor Service Selection & Update (1 Day fixed)
  const toggleIndoorServiceSelection = (id: string) => {
    if (!includeIndoor) return;
    setIndoorServiceList(prev =>
      prev.map(item => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateIndoorServiceItem = (id: string, fields: Partial<IndoorServiceRowState>) => {
    setIndoorServiceList(prev =>
      prev.map(item => (item.id === id ? { ...item, ...fields } : item))
    );
  };

  const addCustomIndoorService = () => {
    if (!includeIndoor) return;
    setIndoorServiceList(prev => [
      ...prev,
      {
        id: `ind-custom-${Date.now()}`,
        selected: true,
        roomType: 'Custom Room / Cabin',
        dailyRate: 2000,
        remarks: 'Custom room details',
        isCustom: true
      }
    ]);
  };

  const removeIndoorServiceItem = (id: string) => {
    setIndoorServiceList(prev => prev.filter(item => item.id !== id));
  };

  const filteredIndoorServiceList = indoorServiceList.filter(item =>
    item.roomType.toLowerCase().includes(indoorSearch.toLowerCase().trim())
  );
  const isAllIndoorServicesSelected = filteredIndoorServiceList.length > 0 && filteredIndoorServiceList.every(i => i.selected);

  const toggleSelectAllIndoorServices = () => {
    if (!includeIndoor) return;
    const targetIds = new Set(filteredIndoorServiceList.map(i => i.id));
    const shouldSelect = !isAllIndoorServicesSelected;
    setIndoorServiceList(prev =>
      prev.map(item => (targetIds.has(item.id) ? { ...item, selected: shouldSelect } : item))
    );
  };

  // Weekly Treatments Selection & Update
  const toggleAdditionalTreatmentSelection = (id: string) => {
    setAdditionalTreatmentList(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const nextSelected = !item.selected;
        if (!nextSelected) {
          return {
            ...item,
            selected: false,
            outdoorQty: '',
            indoorQty: '',
            outdoorDiscountPct: '',
            indoorDiscountPct: '',
            outdoorDiscountFixed: '',
            indoorDiscountFixed: ''
          };
        }
        const catMatch = item.catalogId ? effectiveCatalog.find(c => c.id === item.catalogId) : undefined;
        const resolvedOutSessions = catMatch?.outdoorSessions ?? item.outdoorSessions;
        const resolvedInSessions = catMatch?.indoorSessions ?? item.indoorSessions;
        const defaultOutQty = resolvedOutSessions !== undefined && Number(resolvedOutSessions) > 0 ? Number(resolvedOutSessions) : 1;
        const defaultInQty = resolvedInSessions !== undefined && Number(resolvedInSessions) > 0 ? Number(resolvedInSessions) : 1;

        const hasFixed = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;
        const indoorFree = isItemIndoorFreeByDefault(item);
        const defaultOutDisc =
          item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0
            ? Number(item.outdoorDiscountPercent)
            : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
            ? Number(item.defaultDiscountPercent)
            : 0;
        const defaultInDisc = indoorFree
          ? 100
          : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
          ? Number(item.defaultDiscountPercent)
          : 0;
        return {
          ...item,
          selected: true,
          outdoorSessions: resolvedOutSessions,
          indoorSessions: resolvedInSessions,
          outdoorQty: item.outdoorQty === '' ? defaultOutQty : item.outdoorQty,
          indoorQty: item.indoorQty === '' ? defaultInQty : item.indoorQty,
          outdoorDiscountType: hasFixed ? 'fixed' : 'percent',
          indoorDiscountType: indoorFree ? 'percent' : (hasFixed ? 'fixed' : 'percent'),
          outdoorDiscountFixed: hasFixed ? Number(item.fixedDiscountAmount) : '',
          indoorDiscountFixed: !indoorFree && hasFixed ? Number(item.fixedDiscountAmount) : '',
          outdoorDiscountPct: hasFixed ? '' : defaultOutDisc,
          indoorDiscountPct: indoorFree ? 100 : (hasFixed ? '' : defaultInDisc)
        };
      })
    );
  };

  const updateAdditionalTreatmentItem = (id: string, fields: Partial<WeeklyTreatmentRowState>) => {
    setAdditionalTreatmentList(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...fields };
        if (
          (fields.outdoorQty !== undefined && Number(fields.outdoorQty) > 0) ||
          (fields.indoorQty !== undefined && Number(fields.indoorQty) > 0)
        ) {
          updated.selected = true;
        }
        return updated;
      })
    );
  };

  const addCustomAdditionalTreatment = () => {
    setAdditionalTreatmentList(prev => [
      ...prev,
      {
        id: `add-tr-custom-${Date.now()}`,
        selected: true,
        treatmentName: 'Custom Weekly Therapy',
        unitCost: 1000,
        outdoorQty: 1,
        indoorQty: 1,
        outdoorDiscountType: 'percent',
        indoorDiscountType: 'percent',
        outdoorDiscountPct: 0,
        indoorDiscountPct: 0,
        isCustom: true
      }
    ]);
  };

  const removeCustomAdditionalTreatment = (id: string) => {
    setAdditionalTreatmentList(prev => prev.filter(item => item.id !== id));
  };

  const filteredAdditionalTreatmentList = additionalTreatmentList.filter(item =>
    item.treatmentName.toLowerCase().includes(additionalTreatmentSearch.toLowerCase().trim())
  );
  const isAllAdditionalTreatmentsSelected =
    filteredAdditionalTreatmentList.length > 0 && filteredAdditionalTreatmentList.every(i => i.selected);

  const toggleSelectAllAdditionalTreatments = () => {
    const targetIds = new Set(filteredAdditionalTreatmentList.map(i => i.id));
    const shouldSelect = !isAllAdditionalTreatmentsSelected;
    setAdditionalTreatmentList(prev =>
      prev.map(item => {
        if (!targetIds.has(item.id)) return item;
        if (!shouldSelect) {
          return {
            ...item,
            selected: false,
            outdoorQty: '',
            indoorQty: '',
            outdoorDiscountPct: '',
            indoorDiscountPct: '',
            outdoorDiscountFixed: '',
            indoorDiscountFixed: ''
          };
        }
        const catMatch = item.catalogId ? effectiveCatalog.find(c => c.id === item.catalogId) : undefined;
        const resolvedOutSessions = catMatch?.outdoorSessions ?? item.outdoorSessions;
        const resolvedInSessions = catMatch?.indoorSessions ?? item.indoorSessions;
        const defaultOutQty = resolvedOutSessions !== undefined && Number(resolvedOutSessions) > 0 ? Number(resolvedOutSessions) : 1;
        const defaultInQty = resolvedInSessions !== undefined && Number(resolvedInSessions) > 0 ? Number(resolvedInSessions) : 1;

        const hasFixed = item.fixedDiscountAmount !== undefined && Number(item.fixedDiscountAmount) > 0;
        const indoorFree = isItemIndoorFreeByDefault(item);
        const defaultOutDisc =
          item.outdoorDiscountPercent !== undefined && Number(item.outdoorDiscountPercent) > 0
            ? Number(item.outdoorDiscountPercent)
            : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
            ? Number(item.defaultDiscountPercent)
            : 0;
        const defaultInDisc = indoorFree
          ? 100
          : item.defaultDiscountPercent !== undefined && Number(item.defaultDiscountPercent) > 0
          ? Number(item.defaultDiscountPercent)
          : 0;
        return {
          ...item,
          selected: true,
          outdoorSessions: resolvedOutSessions,
          indoorSessions: resolvedInSessions,
          outdoorQty: item.outdoorQty === '' ? defaultOutQty : item.outdoorQty,
          indoorQty: item.indoorQty === '' ? defaultInQty : item.indoorQty,
          outdoorDiscountType: hasFixed ? 'fixed' : 'percent',
          indoorDiscountType: indoorFree ? 'percent' : (hasFixed ? 'fixed' : 'percent'),
          outdoorDiscountFixed: hasFixed ? Number(item.fixedDiscountAmount) : '',
          indoorDiscountFixed: !indoorFree && hasFixed ? Number(item.fixedDiscountAmount) : '',
          outdoorDiscountPct: hasFixed ? '' : defaultOutDisc,
          indoorDiscountPct: indoorFree ? 100 : (hasFixed ? '' : defaultInDisc)
        };
      })
    );
  };

  // Draft Persistence (v4 - 1-Day Model)
  const userId = currentUser?.id || currentUser?.username || 'guest';
  const DRAFT_STORAGE_KEY = `suo_xi_quotation_builder_draft_${userId}_v4`;
  const isClearingDraftRef = useRef<boolean>(false);

  useEffect(() => {
    if (editingQuotation) return;
    let isCancelled = false;
    const restoreDraft = async () => {
      try {
        const parsed: any = await idbGet(DRAFT_STORAGE_KEY);
        if (isCancelled || !parsed) return;
        if (parsed.selectedPatient && !initialPatient) setSelectedPatient(parsed.selectedPatient);
        if (parsed.phoneSearch) setPhoneSearch(parsed.phoneSearch);
        if (parsed.patientAddress !== undefined) setPatientAddress(parsed.patientAddress);
        if (parsed.billingDoctor) setBillingDoctor(parsed.billingDoctor);
        if (parsed.includeOutdoor !== undefined) setIncludeOutdoor(Boolean(parsed.includeOutdoor));
        if (parsed.includeIndoor !== undefined) setIncludeIndoor(Boolean(parsed.includeIndoor));
        if (parsed.outdoorDiscountPercent !== undefined) setOutdoorDiscountPercent(parsed.outdoorDiscountPercent);
        if (parsed.indoorDiscountPercent !== undefined) setIndoorDiscountPercent(parsed.indoorDiscountPercent);
        if (parsed.advanceCourseDays !== undefined) setAdvanceCourseDays(parsed.advanceCourseDays);
        if (Array.isArray(parsed.treatmentList) && parsed.treatmentList.length > 0) setTreatmentList(parsed.treatmentList);
        if (Array.isArray(parsed.indoorServiceList) && parsed.indoorServiceList.length > 0) setIndoorServiceList(parsed.indoorServiceList);
        if (Array.isArray(parsed.additionalTreatmentList) && parsed.additionalTreatmentList.length > 0) setAdditionalTreatmentList(parsed.additionalTreatmentList);
        if (parsed.foodChargeSelected !== undefined) setFoodChargeSelected(parsed.foodChargeSelected);
        if (parsed.foodChargePerDay !== undefined) setFoodChargePerDay(parsed.foodChargePerDay);
        if (parsed.includeAdmissionFee !== undefined) setIncludeAdmissionFee(parsed.includeAdmissionFee);
        if (parsed.admissionFee !== undefined) setAdmissionFee(parsed.admissionFee);
        if (parsed.overallDiscountPercent !== undefined) setOverallDiscountPercent(parsed.overallDiscountPercent);
        if (parsed.advancePaid !== undefined) setAdvancePaid(parsed.advancePaid);
        if (parsed.paymentStatus) setPaymentStatus(parsed.paymentStatus);
        if (parsed.notes) setNotes(parsed.notes);
        setIsDraftRestored(true);
      } catch (e) {
        console.error('Failed to load quotation draft:', e);
      }
    };
    restoreDraft();
    return () => { isCancelled = true; };
  }, [DRAFT_STORAGE_KEY, editingQuotation]);

  useEffect(() => {
    if (editingQuotation) return;
    if (isClearingDraftRef.current) {
      idbDel(DRAFT_STORAGE_KEY).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      if (isClearingDraftRef.current) return;
      const hasAnySelection =
        treatmentList.some(t => t.selected) ||
        additionalTreatmentList.some(a => a.selected) ||
        indoorServiceList.some(i => i.selected) ||
        Boolean(selectedPatient) ||
        Boolean(phoneSearch.trim());

      if (!hasAnySelection) {
        idbDel(DRAFT_STORAGE_KEY).catch(() => {});
        return;
      }

      const draftData = {
        selectedPatient,
        phoneSearch,
        patientAddress,
        billingDoctor,
        includeOutdoor,
        includeIndoor,
        outdoorDiscountPercent,
        indoorDiscountPercent,
        advanceCourseDays,
        treatmentList,
        indoorServiceList,
        additionalTreatmentList,
        foodChargeSelected,
        foodChargePerDay,
        includeAdmissionFee,
        admissionFee,
        overallDiscountPercent,
        advancePaid,
        paymentStatus,
        notes
      };
      idbSet(DRAFT_STORAGE_KEY, draftData).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [
    selectedPatient, phoneSearch, patientAddress, billingDoctor,
    includeOutdoor, includeIndoor, outdoorDiscountPercent, indoorDiscountPercent, advanceCourseDays,
    treatmentList, indoorServiceList, additionalTreatmentList,
    foodChargeSelected, foodChargePerDay, includeAdmissionFee, admissionFee,
    overallDiscountPercent, advancePaid, paymentStatus, notes, DRAFT_STORAGE_KEY, editingQuotation
  ]);

  const clearFormAndDraftState = () => {
    isClearingDraftRef.current = true;
    idbDel(DRAFT_STORAGE_KEY).catch(() => {});
    setSelectedPatient(null);
    setPhoneSearch('');
    setPatientAddress('');
    setBillingDoctor(currentUser?.name || '');
    setTreatmentSearch('');
    setIndoorSearch('');
    setAdditionalTreatmentSearch('');
    setIncludeOutdoor(true);
    setIncludeIndoor(false);
    setOutdoorDiscountPercent(30);
    setIndoorDiscountPercent(30);
    setAdvanceCourseDays(10);
    setFoodChargeSelected(false);
    setFoodChargePerDay(500);
    setIncludeAdmissionFee(false);
    setAdmissionFee(1000);
    setOverallDiscountPercent('');
    setAdvancePaid(0);
    setPaymentStatus('Quotation');
    setNotes('Quotation validity is 7 days from the date of issue.');
    draftInvoiceIdRef.current = makeUniqueId();
    setIsSaved(false);
    setSaveError(null);
    setIsDraftRestored(false);

    setTreatmentList(prev =>
      prev.filter(i => !i.isCustom).map(i => ({
        ...i,
        selected: false,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: ''
      }))
    );
    setIndoorServiceList(prev => prev.filter(i => !i.isCustom).map(i => ({ ...i, selected: false })));
    setAdditionalTreatmentList(prev =>
      prev.filter(i => !i.isCustom).map(i => ({
        ...i,
        selected: false,
        outdoorQty: '',
        indoorQty: '',
        outdoorDiscountPct: '',
        indoorDiscountPct: ''
      }))
    );

    setTimeout(() => {
      isClearingDraftRef.current = false;
    }, 600);
  };

  const handleResetDraft = () => {
    if (confirm('Are you sure you want to clear all form inputs and start a new quotation?')) {
      clearFormAndDraftState();
    }
  };

  // Active calculations (strictly 1-day)
  const activeTreatments = treatmentList.filter(i => i.selected);
  const activeIndoorServices = includeIndoor ? indoorServiceList.filter(i => i.selected) : [];
  const activeAdditionalTreatments = additionalTreatmentList.filter(i => i.selected);

  const outdoorDailyRows: IndividualTreatment[] = activeTreatments.map(t => {
    const p = computeRowPricing(t, t.outdoorQty, t.outdoorDiscountPct, 'outdoor', outdoorDiscountPercent, t.outdoorDiscountType, t.outdoorDiscountFixed);
    return {
      id: t.id,
      treatmentName: t.treatmentName,
      unitCost: t.unitCost,
      sessions: p.qty,
      discountPercent: p.discountPercent,
      discountAmount: p.discountAmount,
      totalCost: p.netCost,
      discountType: p.discountType,
      isIndoorFree: t.isIndoorFree,
      fixedDiscountAmount: t.fixedDiscountAmount,
      outdoorDiscountPercent: t.outdoorDiscountPercent
    };
  });

  const indoorDailyRows: IndividualTreatment[] = activeTreatments.map(t => {
    const p = computeRowPricing(t, t.indoorQty, t.indoorDiscountPct, 'indoor', indoorDiscountPercent, t.indoorDiscountType, t.indoorDiscountFixed);
    return {
      id: t.id,
      treatmentName: t.treatmentName,
      unitCost: t.unitCost,
      sessions: p.qty,
      discountPercent: p.discountPercent,
      discountAmount: p.discountAmount,
      totalCost: p.netCost,
      discountType: p.discountType,
      isIndoorFree: t.isIndoorFree,
      fixedDiscountAmount: t.fixedDiscountAmount,
      outdoorDiscountPercent: t.outdoorDiscountPercent
    };
  });

  const outdoorWeeklyRows: AdditionalTreatment[] = activeAdditionalTreatments.map(a => {
    const p = computeRowPricing(a, a.outdoorQty, a.outdoorDiscountPct, 'outdoor', 0, a.outdoorDiscountType, a.outdoorDiscountFixed);
    return {
      id: a.id,
      treatmentName: a.treatmentName,
      unitCost: a.unitCost,
      sessions: p.qty,
      discountPercent: p.discountPercent,
      discountAmount: p.discountAmount,
      totalCost: p.netCost,
      discountType: p.discountType,
      description: a.description || '',
      isIndoorFree: isItemIndoorFreeByDefault(a),
      fixedDiscountAmount: p.discountType === 'fixed' ? p.discountAmount : a.fixedDiscountAmount,
      outdoorDiscountPercent: a.outdoorDiscountPercent
    };
  });

  const indoorWeeklyRows: AdditionalTreatment[] = activeAdditionalTreatments.map(a => {
    const p = computeRowPricing(a, a.indoorQty, a.indoorDiscountPct, 'indoor', 0, a.indoorDiscountType, a.indoorDiscountFixed);
    return {
      id: a.id,
      treatmentName: a.treatmentName,
      unitCost: a.unitCost,
      sessions: p.qty,
      discountPercent: p.discountPercent,
      discountAmount: p.discountAmount,
      totalCost: p.netCost,
      discountType: p.discountType,
      description: a.description || '',
      isIndoorFree: isItemIndoorFreeByDefault(a),
      fixedDiscountAmount: p.discountType === 'fixed' ? p.discountAmount : a.fixedDiscountAmount,
      outdoorDiscountPercent: a.outdoorDiscountPercent
    };
  });

  const outdoorDailyGross = outdoorDailyRows.reduce((s, r) => s + r.unitCost * r.sessions, 0);
  const outdoorDailyDiscount = outdoorDailyRows.reduce((s, r) => s + r.discountAmount, 0);
  const outdoorDailyNet = outdoorDailyRows.reduce((s, r) => s + r.totalCost, 0);
  const outdoorWeeklyNet = outdoorWeeklyRows.reduce((s, r) => s + r.totalCost, 0);

  const indoorDailyGross = indoorDailyRows.reduce((s, r) => s + r.unitCost * r.sessions, 0);
  const indoorDailyDiscount = indoorDailyRows.reduce((s, r) => s + r.discountAmount, 0);
  const indoorDailyNet = indoorDailyRows.reduce((s, r) => s + r.totalCost, 0);
  const indoorWeeklyNet = indoorWeeklyRows.reduce((s, r) => s + r.totalCost, 0);

  const indoorRoomDailySubtotal = activeIndoorServices.reduce((s, r) => s + (Number(r.dailyRate) || 0), 0);
  const foodCharge1DayTotal = includeIndoor && foodChargeSelected ? Number(foodChargePerDay || 0) : 0;
  const indoorAccommodationSubtotal = indoorRoomDailySubtotal + foodCharge1DayTotal;
  const actualAdmissionFee = includeIndoor && includeAdmissionFee ? Number(admissionFee || 0) : 0;

  // Primary billing numbers for InvoiceQuotation summary & reporting (avoid double counting when both selected)
  const primaryIsIndoor = includeIndoor && !includeOutdoor;
  const primaryTreatments = primaryIsIndoor ? indoorDailyRows : outdoorDailyRows;
  const primaryTreatmentsSubtotal = primaryIsIndoor ? indoorDailyNet : outdoorDailyNet;
  const primaryAdditional = primaryIsIndoor ? indoorWeeklyRows : outdoorWeeklyRows;
  const primaryAdditionalSubtotal = primaryIsIndoor ? indoorWeeklyNet : outdoorWeeklyNet;

  const indoorGross1Day = indoorDailyNet + indoorAccommodationSubtotal + actualAdmissionFee;
  const outdoorGross1Day = outdoorDailyNet;
  const grossTotal = includeIndoor
    ? (includeOutdoor ? Math.max(indoorGross1Day, outdoorGross1Day) : indoorGross1Day)
    : outdoorGross1Day;

  const overallDiscountAmount = Math.round((grossTotal * Number(overallDiscountPercent || 0)) / 100);
  const grandTotal = Math.max(0, grossTotal - overallDiscountAmount);
  const dueAmount = Math.max(0, grandTotal - Number(advancePaid || 0));

  const generateQuotationData = (): InvoiceQuotation => {
    const dateStr = new Date().toISOString().split('T')[0];
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + 7);

    const formattedIndoorServices: IndoorService[] = includeIndoor
      ? activeIndoorServices.map(i => ({
          id: i.id,
          roomType: i.roomType,
          dailyRate: i.dailyRate,
          days: 1,
          totalAmount: i.dailyRate,
          remarks: i.remarks || ''
        }))
      : [];

    if (includeIndoor && foodChargeSelected && foodCharge1DayTotal > 0) {
      formattedIndoorServices.push({
        id: 'food-charge-3x',
        roomType: 'Food Charge 3 Times',
        dailyRate: foodCharge1DayTotal,
        days: 1,
        totalAmount: foodCharge1DayTotal,
        remarks: '3 Times Daily Meals'
      });
    }

    const pPhone = selectedPatient?.phone || '01700000000';
    const existingCount = quotations.filter(
      q =>
        (q.patientPhone && q.patientPhone !== '01700000000' && q.patientPhone === pPhone) ||
        q.patientName.toLowerCase() === (selectedPatient?.name || '').toLowerCase()
    ).length;

    const nextVisitNumber = editingQuotation ? (editingQuotation.visitNumber || 1) : existingCount + 1;
    const getOrdinalSuffix = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const visitLabel = editingQuotation
      ? editingQuotation.visitLabel || `${getOrdinalSuffix(nextVisitNumber).toUpperCase()} INVOICE`
      : `${getOrdinalSuffix(nextVisitNumber).toUpperCase()} INVOICE`;

    const patientTreatmentMode: 'outdoor' | 'indoor' | 'both' =
      includeOutdoor && includeIndoor ? 'both' : includeIndoor ? 'indoor' : 'outdoor';

    const safeAdvanceDays = Math.max(1, Number(advanceCourseDays || 10) || 10);
    const outDiscNum = outdoorDiscountPercent === '' ? 0 : Number(outdoorDiscountPercent);
    const inDiscNum = indoorDiscountPercent === '' ? 0 : Number(indoorDiscountPercent);

    return {
      id: editingQuotation ? editingQuotation.id : draftInvoiceIdRef.current,
      quotationNumber: editingQuotation ? editingQuotation.quotationNumber : '',
      patientId: selectedPatient?.id || 'walkin',
      patientName: selectedPatient?.name || 'Walk-in Patient',
      patientPhone: pPhone,
      patientAge: selectedPatient?.age,
      patientGender: selectedPatient?.gender,
      patientAddress: patientAddress.trim(),
      doctorName: billingDoctor.trim() || currentUser?.name || selectedPatient?.doctorName || 'Senior Consultant',
      createdDate: editingQuotation ? editingQuotation.createdDate : dateStr,
      validUntil: validUntilDate.toISOString().split('T')[0],
      visitNumber: nextVisitNumber,
      visitLabel,
      patientTreatmentMode,
      advanceCourseDays: safeAdvanceDays,
      outdoorDiscountPercent: outDiscNum,
      indoorDiscountPercent: inDiscNum,

      treatments: primaryTreatments,
      treatmentsSubtotal: primaryTreatmentsSubtotal,

      outdoorPackages: [],
      outdoorSubtotal: 0,

      indoorServices: formattedIndoorServices,
      indoorSubtotal: indoorAccommodationSubtotal,

      additionalTreatments: primaryAdditional,
      additionalTreatmentsSubtotal: primaryAdditionalSubtotal,

      admissionFee: actualAdmissionFee,
      consultationFee: 0,
      investigationFee: 0,
      overallDiscountPercent: Number(overallDiscountPercent || 0),
      overallDiscountAmount,

      grossTotal,
      grandTotal,
      advancePaid: Number(advancePaid || 0),
      dueAmount,

      paymentPlanMode: 'full',
      paymentPhases: [],
      paymentStatus,
      notes,
      createdBy: currentUser?.name ? `${currentUser.name} (${currentUser.role})` : 'Billing Counter Staff',
      packageComparison: {
        showOutdoor: includeOutdoor,
        showIndoor: includeIndoor,
        patientAddress: patientAddress.trim(),
        advanceCourseDays: safeAdvanceDays,
        outdoorDiscountPercent: outDiscNum,
        indoorDiscountPercent: inDiscNum,
        foodChargeSelected: includeIndoor && foodChargeSelected,
        foodChargePerDay: Number(foodChargePerDay || 500),
        includeAdmissionFee: includeIndoor && includeAdmissionFee,
        admissionFee: Number(admissionFee || 1000),
        outdoorTreatments: includeOutdoor ? outdoorDailyRows : [],
        indoorTreatments: includeIndoor ? indoorDailyRows : [],
        outdoorAdditionalTreatments: includeOutdoor ? outdoorWeeklyRows : [],
        indoorAdditionalTreatments: includeIndoor ? indoorWeeklyRows : [],
        comparedAt: new Date().toISOString()
      }
    };
  };

  const validateBeforeSaveOrPrint = (): boolean => {
    if (!selectedPatient) {
      alert('Please select or search a patient first!');
      return false;
    }
    if (!includeOutdoor && !includeIndoor) {
      alert('Please select Outdoor and/or Indoor mode first!');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (isSaving || !validateBeforeSaveOrPrint()) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const quot = generateQuotationData();
      await onSaveQuotation(quot);
      if (editingQuotation && onCancelEdit) onCancelEdit();
      clearFormAndDraftState();
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save quotation to server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async () => {
    if (isSaving || !validateBeforeSaveOrPrint()) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const quot = generateQuotationData();
      const savedQuotation = (await onSaveQuotation(quot)) || quot;
      if (editingQuotation && onCancelEdit) onCancelEdit();
      clearFormAndDraftState();
      onPreviewPrint(savedQuotation);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save quotation before printing.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToPostConsultation = async () => {
    if (selectedPatient) {
      const updated: Patient = {
        ...selectedPatient,
        quotationCreated: true,
        status: selectedPatient.status === 'Completed' ? 'Completed' : 'Quotation Created'
      };
      if (onUpdatePatient) onUpdatePatient(updated);
      addOrUpdatePatientApi(updated).catch(() => {});
    }
    try {
      if (treatmentList.some(t => t.selected) && (includeOutdoor || includeIndoor)) {
        const quot = generateQuotationData();
        await onSaveQuotation(quot);
      }
    } catch {}
    if (onBackToPostConsultation) onBackToPostConsultation();
  };

  const bothModesActive = includeOutdoor && includeIndoor;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6 print:hidden">
      {/* Editing Notification Banner */}
      {editingQuotation && (
        <div className="bg-amber-600 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-amber-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider bg-black/25 px-2.5 py-0.5 rounded-md">
                Editing Mode
              </span>
              <span className="font-mono text-xs font-bold text-amber-100">{editingQuotation.quotationNumber}</span>
            </div>
            <h3 className="text-base font-extrabold text-white mt-1">
              Editing Invoice for {editingQuotation.patientName} ({editingQuotation.patientPhone})
            </h3>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="bg-white text-slate-900 text-xs font-bold px-3.5 py-2 rounded-xl shadow cursor-pointer shrink-0"
            >
              Cancel Edit
            </button>
          )}
        </div>
      )}

      {/* Step 1: Patient Selection */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Step 1: Select Patient (1-Day Quotation Counseling)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h2 className="text-2xl font-black text-slate-900">
                {editingQuotation ? 'Update 1-Day Quotation' : 'Invoice Quotation Builder'}
              </h2>
              {isDraftRestored && !editingQuotation && (
                <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                  Draft Restored
                </span>
              )}
              <button
                type="button"
                onClick={handleResetDraft}
                className="text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                {editingQuotation ? 'Reset Form' : 'Clear Form'}
              </button>
              {onBackToPostConsultation && (
                <button
                  type="button"
                  onClick={handleBackToPostConsultation}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Post Consultation</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Form */}
          <div className="relative w-full md:w-auto flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setSearchDateScope('today');
                  if (phoneSearch.trim()) handlePatientSearchChange(phoneSearch, 'today');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  searchDateScope === 'today' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchDateScope('all');
                  if (phoneSearch.trim()) handlePatientSearchChange(phoneSearch, 'all');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  searchDateScope === 'all' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Dates
              </button>
            </div>

            <form onSubmit={handlePhoneSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <input
                  type="text"
                  placeholder={searchDateScope === 'today' ? "Search today's patient..." : 'Search all patients...'}
                  value={phoneSearch}
                  onChange={(e) => handlePatientSearchChange(e.target.value)}
                  onFocus={() => {
                    if (phoneSearch.trim().length > 0 && matchingPatients.length > 0) setIsPatientDropdownOpen(true);
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
                <Search className="w-3.5 h-3.5" />
                <span>{isSearchingLive ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {isPatientDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-full md:w-96 bg-white border border-slate-300 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold">{matchingPatients.length} Patient(s) Found</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPatientDropdownOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {matchingPatients.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">No matching patients found.</div>
                  ) : (
                    matchingPatients.map((pat, idx) => (
                      <div
                        key={pat.id ? `${pat.id}-${idx}` : `pat-${idx}`}
                        onClick={() => handleSelectPatient(pat)}
                        className={`p-3 cursor-pointer hover:bg-emerald-50 flex items-center justify-between gap-2 ${
                          selectedPatient?.id === pat.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''
                        }`}
                      >
                        <div className="text-xs">
                          <div className="font-bold text-slate-900">
                            {pat.name} {pat.serialNo ? <span className="font-mono text-slate-500">#{pat.serialNo}</span> : null}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {pat.phone} • {pat.doctorName || 'Doctor'} {pat.appointmentDate ? `• ${pat.appointmentDate}` : ''}
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-700">Select</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Patient Card */}
        {selectedPatient ? (
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
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
                  <span className="text-slate-400">• Appt: {selectedPatient.appointmentDate}</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-slate-300">Consulting Doctor:</span>
                  <span className="bg-slate-950 text-emerald-300 border border-slate-700 rounded-lg px-2.5 py-0.5 text-xs font-bold">
                    {billingDoctor || 'Senior Consultant'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                  <span className="text-xs text-slate-300 shrink-0">Address:</span>
                  <input
                    type="text"
                    placeholder="Enter patient address for print..."
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    className="flex-1 bg-slate-950 text-white border border-slate-700 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-xl border border-slate-700 font-semibold">
                Status: {selectedPatient.status}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium px-2 py-1 cursor-pointer"
              >
                Change Patient
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs flex items-center gap-3">
            <UserSearch className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">No Patient Selected Yet</p>
              <p className="text-amber-700">
                Search by mobile number/name above or click "Create Quotation" from Appointments / Consultation.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: Daily Treatments & Therapies (1-Day Basis + Independent Outdoor / Indoor Selection) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs">
              1
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                1. Daily Treatments & Therapies (1-Day Counseling Cost)
              </h3>
              <p className="text-xs text-slate-500">
                Select Outdoor, Indoor, or both simultaneously. Each prints as its own clean 1-Day A4 page.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <input
                type="text"
                placeholder="Filter treatments..."
                value={treatmentSearch}
                onChange={(e) => setTreatmentSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
            <button
              type="button"
              onClick={addCustomTreatmentItem}
              className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom</span>
            </button>
          </div>
        </div>

        {/* Independent Outdoor / Indoor Mode + Separate Discounts + Configurable Advance Days Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Treatment Type (Select One or Both):</span>
            </span>

            {/* Independent Outdoor Checkbox */}
            <label
              className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border text-xs font-bold transition ${
                includeOutdoor
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
              }`}
            >
              <input
                type="checkbox"
                checked={includeOutdoor}
                onChange={(e) => handleToggleOutdoorMode(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
              />
              <span>Outdoor</span>
            </label>

            {/* Independent Indoor Checkbox */}
            <label
              className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border text-xs font-bold transition ${
                includeIndoor
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
              }`}
            >
              <input
                type="checkbox"
                checked={includeIndoor}
                onChange={(e) => handleToggleIndoorMode(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
              <span>Indoor</span>
            </label>

            {/* Separate Outdoor Discount (%) */}
            <div className="flex items-center gap-2 border-l border-slate-300 pl-4">
              <label className={`text-xs font-bold whitespace-nowrap ${includeOutdoor ? 'text-emerald-900' : 'text-slate-400'}`}>
                Outdoor Discount (%):
              </label>
              <div className="relative w-20">
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!includeOutdoor}
                  placeholder="0"
                  value={outdoorDiscountPercent === '' ? '' : outdoorDiscountPercent}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                    handleOutdoorDiscountChange(val);
                  }}
                  onFocus={(e) => e.target.select()}
                  className={`w-full pl-2 pr-6 py-1.5 border rounded-xl text-xs font-bold text-center tabular-nums ${
                    includeOutdoor
                      ? 'bg-white border-emerald-300 text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
                <span className="absolute right-2 top-2 text-[10px] font-bold text-emerald-700">%</span>
              </div>
            </div>

            {/* Separate Indoor Discount (%) */}
            <div className="flex items-center gap-2 border-l border-slate-300 pl-4">
              <label className={`text-xs font-bold whitespace-nowrap ${includeIndoor ? 'text-indigo-900' : 'text-slate-400'}`}>
                Indoor Discount (%):
              </label>
              <div className="relative w-20">
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!includeIndoor}
                  placeholder="0"
                  value={indoorDiscountPercent === '' ? '' : indoorDiscountPercent}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                    handleIndoorDiscountChange(val);
                  }}
                  onFocus={(e) => e.target.select()}
                  className={`w-full pl-2 pr-6 py-1.5 border rounded-xl text-xs font-bold text-center tabular-nums ${
                    includeIndoor
                      ? 'bg-white border-indigo-300 text-indigo-900 focus:ring-2 focus:ring-indigo-500'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
                <span className="absolute right-2 top-2 text-[10px] font-bold text-indigo-700">%</span>
              </div>
            </div>

            {/* Configurable Advance Payment Days for Bengali Note */}
            <div className="flex items-center gap-2 border-l border-slate-300 pl-4">
              <label className="text-xs font-bold text-slate-800 whitespace-nowrap flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>Advance Note Days:</span>
              </label>
              <div className="relative w-20">
                <input
                  type="number"
                  min={1}
                  max={365}
                  placeholder="10"
                  value={advanceCourseDays === '' ? '' : advanceCourseDays}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.min(365, Math.max(1, Number(e.target.value)));
                    setAdvanceCourseDays(val);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-1.5 border border-amber-300 bg-white text-slate-900 font-bold text-xs text-center rounded-xl focus:ring-2 focus:ring-amber-500 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <span>
              Print Output:{' '}
              <strong className="text-slate-900">
                {bothModesActive
                  ? '2 Pages in 1 PDF (Page 1: Outdoor Treatment Cost, Page 2: Indoor Treatment Cost)'
                  : includeIndoor
                  ? '1 Page PDF (Indoor Treatment Cost only)'
                  : includeOutdoor
                  ? '1 Page PDF (Outdoor Treatment Cost only)'
                  : 'Select Outdoor and/or Indoor above'}
              </strong>
            </span>
            <span className="text-emerald-800 font-bold">1-Day Counseling Basis</span>
          </div>
        </div>

        {/* Daily Treatments Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-3 w-14 text-center">
                  <input
                    type="checkbox"
                    checked={isAllTreatmentsSelected}
                    onChange={toggleSelectAllTreatments}
                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                    title="Select / Deselect All"
                  />
                </th>
                <th className="p-3">SL & Treatment Name</th>
                <th className="p-3 w-32">Price (1 Session)</th>
                <th className="p-3 w-36 text-center">Quantity (1 Day)</th>
                <th className="p-3 w-44 text-center">Discount (%)</th>
                <th className="p-3 w-40 text-right">Net Price (1 Day)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTreatmentList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-xs">
                    No treatment matching "{treatmentSearch}".
                  </td>
                </tr>
              ) : (
                filteredTreatmentList.map((item, idx) => {
                  const isChecked = item.selected;
                  const outP = computeRowPricing(item, item.outdoorQty, item.outdoorDiscountPct, 'outdoor', outdoorDiscountPercent);
                  const inP = computeRowPricing(item, item.indoorQty, item.indoorDiscountPct, 'indoor', indoorDiscountPercent);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleTreatmentSelection(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked ? 'bg-emerald-50/70 font-medium' : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTreatmentSelection(item.id)}
                          className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 text-xs w-6">{idx + 1}.</span>
                            {item.isCustom ? (
                              <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={item.treatmentName}
                                  onChange={(e) => updateTreatmentItem(item.id, { treatmentName: e.target.value })}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeCustomTreatmentItem(item.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold ${isChecked ? 'text-slate-900' : 'text-slate-800'}`}>
                                {item.treatmentName}
                              </span>
                            )}
                          </div>
                          {item.description && !item.isCustom && (
                            <p className="text-[11px] text-slate-500 pl-8">{item.description}</p>
                          )}
                        </div>
                      </td>

                      <td className="p-3" onClick={(e) => item.isCustom && e.stopPropagation()}>
                        {item.isCustom ? (
                          <input
                            type="number"
                            value={item.unitCost || ''}
                            onChange={(e) => updateTreatmentItem(item.id, { unitCost: Number(e.target.value) || 0 })}
                            className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums"
                          />
                        ) : (
                          <span className="font-bold text-slate-800 tabular-nums">BDT {item.unitCost.toLocaleString()}</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {bothModesActive ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] font-bold text-emerald-700 w-7 text-right">Out:</span>
                              <input
                                type="number"
                                min={1}
                                placeholder="1"
                                value={item.outdoorQty === '' ? '' : item.outdoorQty}
                                onChange={(e) => updateTreatmentItem(item.id, { outdoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-14 px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-xs font-bold text-center tabular-nums"
                              />
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] font-bold text-indigo-700 w-7 text-right">In:</span>
                              <input
                                type="number"
                                min={1}
                                placeholder="1"
                                value={item.indoorQty === '' ? '' : item.indoorQty}
                                onChange={(e) => updateTreatmentItem(item.id, { indoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-14 px-1.5 py-0.5 bg-white border border-indigo-300 rounded text-xs font-bold text-center tabular-nums"
                              />
                            </div>
                          </div>
                        ) : includeIndoor ? (
                          <input
                            type="number"
                            min={1}
                            placeholder="1"
                            value={item.indoorQty === '' ? '' : item.indoorQty}
                            onChange={(e) => updateTreatmentItem(item.id, { indoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                          />
                        ) : (
                          <input
                            type="number"
                            min={1}
                            placeholder="1"
                            value={item.outdoorQty === '' ? '' : item.outdoorQty}
                            onChange={(e) => updateTreatmentItem(item.id, { outdoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                          />
                        )}
                      </td>

                      {/* Discount (%) */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {bothModesActive ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] font-bold text-emerald-700 w-7 text-right">Out:</span>
                              {isChecked && outP.isLockedDiscount ? (
                                <span className="text-[10px] font-bold text-emerald-800">{outP.lockReason}</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  placeholder="0"
                                  value={item.outdoorDiscountPct === '' ? '' : item.outdoorDiscountPct}
                                  onChange={(e) => updateTreatmentItem(item.id, { outdoorDiscountPct: e.target.value === '' ? '' : Number(e.target.value) })}
                                  className="w-16 px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-xs font-bold text-center tabular-nums"
                                />
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] font-bold text-indigo-700 w-7 text-right">In:</span>
                              {isChecked && inP.isLockedDiscount ? (
                                <span className="text-[10px] font-bold text-indigo-800">{inP.lockReason}</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  placeholder="0"
                                  value={item.indoorDiscountPct === '' ? '' : item.indoorDiscountPct}
                                  onChange={(e) => updateTreatmentItem(item.id, { indoorDiscountPct: e.target.value === '' ? '' : Number(e.target.value) })}
                                  className="w-16 px-1.5 py-0.5 bg-white border border-indigo-300 rounded text-xs font-bold text-center tabular-nums"
                                />
                              )}
                            </div>
                          </div>
                        ) : includeIndoor ? (
                          isChecked && inP.isLockedDiscount ? (
                            <span className="text-[11px] font-bold text-indigo-800">{inP.lockReason}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0"
                              value={item.indoorDiscountPct === '' ? '' : item.indoorDiscountPct}
                              onChange={(e) => updateTreatmentItem(item.id, { indoorDiscountPct: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                            />
                          )
                        ) : isChecked && outP.isLockedDiscount ? (
                          <span className="text-[11px] font-bold text-emerald-800">{outP.lockReason}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="0"
                            value={item.outdoorDiscountPct === '' ? '' : item.outdoorDiscountPct}
                            onChange={(e) => updateTreatmentItem(item.id, { outdoorDiscountPct: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                          />
                        )}
                      </td>

                      {/* Net Price */}
                      <td className="p-3 text-right tabular-nums">
                        {bothModesActive ? (
                          <div className="space-y-0.5 text-xs font-bold">
                            <div className={isChecked ? 'text-emerald-700' : 'text-slate-400'}>
                              Out: BDT {outP.netCost.toLocaleString()}
                            </div>
                            <div className={isChecked ? 'text-indigo-700' : 'text-slate-400'}>
                              In: BDT {inP.netCost.toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <span className={`text-sm font-black ${isChecked ? 'text-emerald-700' : 'text-slate-400'}`}>
                            BDT {(includeIndoor ? inP.netCost : outP.netCost).toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Section 1 Subtotal Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 font-medium">
            Selected daily treatments: <strong className="text-emerald-800">{activeTreatments.length}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-4">
            {includeOutdoor && (
              <div className="font-bold text-emerald-800 tabular-nums">
                Outdoor Daily Total: BDT {outdoorDailyNet.toLocaleString()}
              </div>
            )}
            {includeIndoor && (
              <div className="font-bold text-indigo-800 tabular-nums">
                Indoor Daily Total: BDT {indoorDailyNet.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Indoor Room & Food Charges (1 Day Only) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              2
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  2. Indoor Room & Food Charges (1 Day)
                </h3>
                {!includeIndoor && (
                  <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Check "Indoor" above to enable</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Select cabin/ward and 3-time daily meal charge for the 1-Day Indoor quotation sheet.
              </p>
            </div>
          </div>

          {includeIndoor && (
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <input
                  type="text"
                  placeholder="Filter rooms..."
                  value={indoorSearch}
                  onChange={(e) => setIndoorSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
              <button
                type="button"
                onClick={addCustomIndoorService}
                className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Room</span>
              </button>
            </div>
          )}
        </div>

        <div className={!includeIndoor ? 'opacity-50 pointer-events-none select-none space-y-4' : 'space-y-4'}>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                  <th className="p-3 w-14 text-center">
                    <input
                      type="checkbox"
                      checked={isAllIndoorServicesSelected}
                      onChange={toggleSelectAllIndoorServices}
                      disabled={!includeIndoor}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Type & Details</th>
                  <th className="p-3 w-36">Price (Per Day)</th>
                  <th className="p-3 w-24 text-center">Day</th>
                  <th className="p-3 w-36 text-right">Net Price (1 Day)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIndoorServiceList.map((item, idx) => {
                  const isChecked = includeIndoor && item.selected;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleIndoorServiceSelection(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isChecked ? 'bg-indigo-50/80 font-medium' : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!includeIndoor}
                          onChange={() => toggleIndoorServiceSelection(item.id)}
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-500 w-6">{idx + 1}.</span>
                            {item.isCustom ? (
                              <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={item.roomType}
                                  onChange={(e) => updateIndoorServiceItem(item.id, { roomType: e.target.value })}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeIndoorServiceItem(item.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer"
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
                              value={item.remarks || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateIndoorServiceItem(item.id, { remarks: e.target.value })}
                              placeholder="Room details..."
                              className="w-full px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px]"
                            />
                          ) : (
                            item.remarks && <p className="text-[11px] text-slate-500 pl-8">{item.remarks}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-3" onClick={(e) => item.isCustom && e.stopPropagation()}>
                        {item.isCustom ? (
                          <input
                            type="number"
                            value={item.dailyRate || ''}
                            onChange={(e) => updateIndoorServiceItem(item.id, { dailyRate: Number(e.target.value) || 0 })}
                            className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums"
                          />
                        ) : (
                          <span className="font-bold text-slate-800 tabular-nums">BDT {item.dailyRate.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700 tabular-nums">1</td>
                      <td className="p-3 text-right font-black tabular-nums">
                        <span className={isChecked ? 'text-indigo-700 text-sm' : 'text-slate-400'}>
                          BDT {(isChecked ? item.dailyRate : 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Food Charge 3 Times (1 Day) */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <tbody>
                <tr
                  onClick={() => includeIndoor && setFoodChargeSelected(prev => !prev)}
                  className={`cursor-pointer transition-colors ${
                    includeIndoor && foodChargeSelected ? 'bg-amber-50/80' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <td className="p-3 w-14 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      disabled={!includeIndoor}
                      checked={includeIndoor && foodChargeSelected}
                      onChange={(e) => setFoodChargeSelected(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">Food (Breakfast, Lunch, Dinner)</div>
                    <div className="text-[11px] text-slate-500">Printed inside Indoor Room &amp; Food table (1 Day)</div>
                  </td>
                  <td className="p-3 w-36" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px] font-bold">BDT</span>
                      <input
                        type="number"
                        min={0}
                        disabled={!includeIndoor}
                        value={foodChargePerDay === '' ? '' : foodChargePerDay}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFoodChargePerDay(val);
                          if (val !== '' && !foodChargeSelected) setFoodChargeSelected(true);
                        }}
                        className="w-full pl-8 pr-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums"
                      />
                    </div>
                  </td>
                  <td className="p-3 w-24 text-center font-bold text-slate-700 tabular-nums">1 Day</td>
                  <td className="p-3 w-36 text-right font-black tabular-nums">
                    <span className={includeIndoor && foodChargeSelected ? 'text-amber-700 text-sm' : 'text-slate-400'}>
                      BDT {foodCharge1DayTotal.toLocaleString()}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 3: Weekly Treatments (Per Session) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                3. Weekly / Special Treatments (Per Session)
              </h3>
              <p className="text-xs text-slate-500">
                Shown as a separate table below Daily Treatments (e.g., Ozone Therapy: Outdoor 40% Off / Indoor 100% Free).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <input
                type="text"
                placeholder="Filter weekly..."
                value={additionalTreatmentSearch}
                onChange={(e) => setAdditionalTreatmentSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
            <button
              type="button"
              onClick={addCustomAdditionalTreatment}
              className="flex items-center gap-1 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-3 w-14 text-center">
                  <input
                    type="checkbox"
                    checked={isAllAdditionalTreatmentsSelected}
                    onChange={toggleSelectAllAdditionalTreatments}
                    className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                  />
                </th>
                <th className="p-3">SL & Treatment Name</th>
                <th className="p-3 w-32">Price</th>
                <th className="p-3 w-36 text-center">Quantity</th>
                <th className="p-3 w-48 text-center">Discount (% / ৳)</th>
                <th className="p-3 w-40 text-right">Net Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdditionalTreatmentList.map((item, idx) => {
                const isChecked = item.selected;
                const outP = computeRowPricing(item, item.outdoorQty, item.outdoorDiscountPct, 'outdoor', 0, item.outdoorDiscountType, item.outdoorDiscountFixed);
                const inP = computeRowPricing(item, item.indoorQty, item.indoorDiscountPct, 'indoor', 0, item.indoorDiscountType, item.indoorDiscountFixed);
                const outType = item.outdoorDiscountType || (item.fixedDiscountAmount && item.fixedDiscountAmount > 0 && item.outdoorDiscountPct === '' ? 'fixed' : 'percent');
                const inType = item.indoorDiscountType || (item.fixedDiscountAmount && item.fixedDiscountAmount > 0 && !isItemIndoorFreeByDefault(item) && item.indoorDiscountPct === '' ? 'fixed' : 'percent');

                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleAdditionalTreatmentSelection(item.id)}
                    className={`transition-colors cursor-pointer ${
                      isChecked ? 'bg-sky-50/80 font-medium' : 'bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAdditionalTreatmentSelection(item.id)}
                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-500 w-6">{idx + 1}.</span>
                        {item.isCustom ? (
                          <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={item.treatmentName}
                              onChange={(e) => updateAdditionalTreatmentItem(item.id, { treatmentName: e.target.value })}
                              className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold w-full"
                            />
                            <button
                              type="button"
                              onClick={() => removeCustomAdditionalTreatment(item.id)}
                              className="p-1 text-rose-500 hover:bg-rose-100 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className={`text-xs font-bold ${isChecked ? 'text-sky-950' : 'text-slate-800'}`}>
                            {item.treatmentName}
                          </span>
                        )}
                      </div>
                      {item.description && !item.isCustom && (
                        <p className="text-[11px] text-slate-500 pl-8">{item.description}</p>
                      )}
                    </td>

                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        value={item.unitCost || ''}
                        onChange={(e) => updateAdditionalTreatmentItem(item.id, { unitCost: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums"
                      />
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {bothModesActive ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-emerald-700 w-7 text-right">Out:</span>
                            <input
                              type="number"
                              min={1}
                              placeholder="1"
                              value={item.outdoorQty === '' ? '' : item.outdoorQty}
                              onChange={(e) => updateAdditionalTreatmentItem(item.id, { outdoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-14 px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-xs font-bold text-center tabular-nums"
                            />
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-indigo-700 w-7 text-right">In:</span>
                            <input
                              type="number"
                              min={1}
                              placeholder="1"
                              value={item.indoorQty === '' ? '' : item.indoorQty}
                              onChange={(e) => updateAdditionalTreatmentItem(item.id, { indoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-14 px-1.5 py-0.5 bg-white border border-indigo-300 rounded text-xs font-bold text-center tabular-nums"
                            />
                          </div>
                        </div>
                      ) : includeIndoor ? (
                        <input
                          type="number"
                          min={1}
                          placeholder="1"
                          value={item.indoorQty === '' ? '' : item.indoorQty}
                          onChange={(e) => updateAdditionalTreatmentItem(item.id, { indoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                        />
                      ) : (
                        <input
                          type="number"
                          min={1}
                          placeholder="1"
                          value={item.outdoorQty === '' ? '' : item.outdoorQty}
                          onChange={(e) => updateAdditionalTreatmentItem(item.id, { outdoorQty: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                        />
                      )}
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {bothModesActive ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-emerald-700 w-7 text-right">Out:</span>
                            <input
                              type="number"
                              min={0}
                              max={outType === 'percent' ? 100 : undefined}
                              placeholder="0"
                              value={
                                outType === 'fixed'
                                  ? item.outdoorDiscountFixed === '' || item.outdoorDiscountFixed === undefined
                                    ? ''
                                    : item.outdoorDiscountFixed
                                  : item.outdoorDiscountPct === ''
                                  ? ''
                                  : item.outdoorDiscountPct
                              }
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : Number(e.target.value);
                                if (outType === 'fixed') {
                                  updateAdditionalTreatmentItem(item.id, { outdoorDiscountType: 'fixed', outdoorDiscountFixed: val });
                                } else {
                                  updateAdditionalTreatmentItem(item.id, { outdoorDiscountType: 'percent', outdoorDiscountPct: val });
                                }
                              }}
                              className="w-16 px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-xs font-bold text-center tabular-nums"
                            />
                            <button
                              type="button"
                              title="Switch between % and Fixed Taka (৳)"
                              onClick={() =>
                                updateAdditionalTreatmentItem(item.id, {
                                  outdoorDiscountType: outType === 'fixed' ? 'percent' : 'fixed'
                                })
                              }
                              className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                            >
                              {outType === 'fixed' ? '৳' : '%'}
                            </button>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-indigo-700 w-7 text-right">In:</span>
                            <input
                              type="number"
                              min={0}
                              max={inType === 'percent' ? 100 : undefined}
                              placeholder="0"
                              value={
                                inType === 'fixed'
                                  ? item.indoorDiscountFixed === '' || item.indoorDiscountFixed === undefined
                                    ? ''
                                    : item.indoorDiscountFixed
                                  : item.indoorDiscountPct === ''
                                  ? ''
                                  : item.indoorDiscountPct
                              }
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : Number(e.target.value);
                                if (inType === 'fixed') {
                                  updateAdditionalTreatmentItem(item.id, { indoorDiscountType: 'fixed', indoorDiscountFixed: val });
                                } else {
                                  updateAdditionalTreatmentItem(item.id, { indoorDiscountType: 'percent', indoorDiscountPct: val });
                                }
                              }}
                              className="w-16 px-1.5 py-0.5 bg-white border border-indigo-300 rounded text-xs font-bold text-center tabular-nums"
                            />
                            <button
                              type="button"
                              title="Switch between % and Fixed Taka (৳)"
                              onClick={() =>
                                updateAdditionalTreatmentItem(item.id, {
                                  indoorDiscountType: inType === 'fixed' ? 'percent' : 'fixed'
                                })
                              }
                              className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                            >
                              {inType === 'fixed' ? '৳' : '%'}
                            </button>
                          </div>
                        </div>
                      ) : includeIndoor ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={inType === 'percent' ? 100 : undefined}
                            placeholder="0"
                            value={
                              inType === 'fixed'
                                ? item.indoorDiscountFixed === '' || item.indoorDiscountFixed === undefined
                                  ? ''
                                  : item.indoorDiscountFixed
                                : item.indoorDiscountPct === ''
                                ? ''
                                : item.indoorDiscountPct
                            }
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              if (inType === 'fixed') {
                                updateAdditionalTreatmentItem(item.id, { indoorDiscountType: 'fixed', indoorDiscountFixed: val });
                              } else {
                                updateAdditionalTreatmentItem(item.id, { indoorDiscountType: 'percent', indoorDiscountPct: val });
                              }
                            }}
                            className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                          />
                          <button
                            type="button"
                            title="Switch between % and Fixed Taka (৳)"
                            onClick={() =>
                              updateAdditionalTreatmentItem(item.id, {
                                indoorDiscountType: inType === 'fixed' ? 'percent' : 'fixed'
                              })
                            }
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                          >
                            {inType === 'fixed' ? '৳' : '%'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={outType === 'percent' ? 100 : undefined}
                            placeholder="0"
                            value={
                              outType === 'fixed'
                                ? item.outdoorDiscountFixed === '' || item.outdoorDiscountFixed === undefined
                                  ? ''
                                  : item.outdoorDiscountFixed
                                : item.outdoorDiscountPct === ''
                                ? ''
                                : item.outdoorDiscountPct
                            }
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              if (outType === 'fixed') {
                                updateAdditionalTreatmentItem(item.id, { outdoorDiscountType: 'fixed', outdoorDiscountFixed: val });
                              } else {
                                updateAdditionalTreatmentItem(item.id, { outdoorDiscountType: 'percent', outdoorDiscountPct: val });
                              }
                            }}
                            className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center tabular-nums"
                          />
                          <button
                            type="button"
                            title="Switch between % and Fixed Taka (৳)"
                            onClick={() =>
                              updateAdditionalTreatmentItem(item.id, {
                                outdoorDiscountType: outType === 'fixed' ? 'percent' : 'fixed'
                              })
                            }
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                          >
                            {outType === 'fixed' ? '৳' : '%'}
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      {bothModesActive ? (
                        <div className="space-y-0.5 text-xs font-bold">
                          <div className={isChecked ? 'text-emerald-700' : 'text-slate-400'}>
                            Out: BDT {outP.netCost.toLocaleString()}
                          </div>
                          <div className={isChecked ? 'text-indigo-700' : 'text-slate-400'}>
                            In: {inP.netCost === 0 && isChecked ? 'FREE' : `BDT ${inP.netCost.toLocaleString()}`}
                          </div>
                        </div>
                      ) : (
                        <span className={`text-sm font-black ${isChecked ? 'text-sky-700' : 'text-slate-400'}`}>
                          {includeIndoor && isChecked && inP.netCost === 0
                            ? 'FREE'
                            : `BDT ${(includeIndoor ? inP.netCost : outP.netCost).toLocaleString()}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Additional Fees, Notes & Billing Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>Additional Fees & Bengali Counseling Note</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Admission Fee (Indoor) */}
            <div>
              <label className={`flex items-center gap-2 text-xs font-bold uppercase mb-1 ${!includeIndoor ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={!includeIndoor}
                  checked={includeIndoor && includeAdmissionFee}
                  onChange={(e) => includeIndoor && setIncludeAdmissionFee(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                />
                <span>Admission Fee</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">BDT</span>
                <input
                  type="number"
                  placeholder="1000"
                  disabled={!includeIndoor || !includeAdmissionFee}
                  value={admissionFee === '' ? '' : admissionFee}
                  onChange={(e) => setAdmissionFee(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full pl-10 pr-3 py-2 border rounded-xl text-xs font-bold tabular-nums ${
                    includeIndoor && includeAdmissionFee
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
              </div>
            </div>

            {/* Configurable Advance Payment Days */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Advance Payment Days
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={advanceCourseDays === '' ? '' : advanceCourseDays}
                onChange={(e) => setAdvanceCourseDays(e.target.value === '' ? '' : Math.min(365, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Clinical / Internal Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Billing Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                <option value="Quotation">Quotation / Estimate</option>
                <option value="Partial Paid">Partial Paid</option>
                <option value="Fully Paid">Fully Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Advance Payment Received</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">BDT</span>
                <input
                  type="number"
                  value={advancePaid === 0 || advancePaid === '' ? '' : advancePaid}
                  onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-emerald-800 tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Billing Summary Card */}
        <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-md border border-slate-200 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
              <span>1-Day Counseling Summary</span>
              <Calculator className="w-5 h-5 text-emerald-600" />
            </h3>

            {includeOutdoor && (
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 space-y-1 text-xs">
                <div className="font-bold text-emerald-900 uppercase">Outdoor (1 Day)</div>
                <div className="flex justify-between">
                  <span>Daily Gross:</span>
                  <span className="font-bold tabular-nums">BDT {outdoorDailyGross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Discount:</span>
                  <span className="font-bold tabular-nums">-BDT {outdoorDailyDiscount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-emerald-200 font-extrabold text-emerald-900">
                  <span>Daily Net:</span>
                  <span className="tabular-nums">BDT {outdoorDailyNet.toLocaleString()}</span>
                </div>
                {outdoorWeeklyRows.length > 0 && (
                  <div className="flex justify-between text-sky-800 font-bold pt-1">
                    <span>Weekly Therapies:</span>
                    <span className="tabular-nums">BDT {outdoorWeeklyNet.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {includeIndoor && (
              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 space-y-1 text-xs">
                <div className="font-bold text-indigo-900 uppercase">Indoor (1 Day)</div>
                <div className="flex justify-between">
                  <span>Daily Gross:</span>
                  <span className="font-bold tabular-nums">BDT {indoorDailyGross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Discount:</span>
                  <span className="font-bold tabular-nums">-BDT {indoorDailyDiscount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-indigo-200 font-extrabold text-indigo-900">
                  <span>Daily Treatment Net:</span>
                  <span className="tabular-nums">BDT {indoorDailyNet.toLocaleString()}</span>
                </div>
                {indoorWeeklyRows.length > 0 && (
                  <div className="flex justify-between text-sky-800 font-bold">
                    <span>Weekly Therapies:</span>
                    <span className="tabular-nums">{indoorWeeklyNet === 0 ? 'FREE' : `BDT ${indoorWeeklyNet.toLocaleString()}`}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Room (1 Day):</span>
                  <span className="font-bold tabular-nums">BDT {indoorRoomDailySubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Food (1 Day):</span>
                  <span className="font-bold tabular-nums">BDT {foodCharge1DayTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Admission Fee (1-Time):</span>
                  <span className="font-bold tabular-nums">BDT {actualAdmissionFee.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200">
              <div className="flex justify-between items-center text-xs text-amber-800 font-semibold mb-1">
                <span>Additional Special Discount (%):</span>
                <span className="tabular-nums">-BDT {overallDiscountAmount.toLocaleString()}</span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={overallDiscountPercent === '' ? '' : overallDiscountPercent}
                onChange={(e) => setOverallDiscountPercent(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold tabular-nums"
              />
            </div>

            <div className="pt-2 border-t-2 border-slate-300 flex justify-between items-end">
              <span className="text-xs text-slate-800 uppercase font-extrabold">Recorded Quotation Total:</span>
              <span className="text-xl font-black text-emerald-700 tabular-nums">BDT {grandTotal.toLocaleString()}</span>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Advance Paid:</span>
                <span className="font-bold tabular-nums">BDT {Number(advancePaid || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>Net Due Balance:</span>
                <span className="tabular-nums">BDT {dueAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {saveError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl">
                {saveError}
              </div>
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Print A4 Invoice Quotation'}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-300 font-bold text-xs py-2.5 px-4 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : isSaved ? 'Quotation Saved!' : 'Save Quotation Record'}</span>
            </button>

            {onBackToPostConsultation && (
              <button
                type="button"
                onClick={handleBackToPostConsultation}
                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs py-2.5 px-4 rounded-xl border border-blue-200 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Post Consultation</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
