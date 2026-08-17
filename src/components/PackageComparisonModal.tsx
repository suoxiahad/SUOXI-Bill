import React, { useState, useEffect } from 'react';
import { X, Check, ArrowRight, Sparkles, Scale, TrendingDown, Info, Printer } from 'lucide-react';
import { SuoxiLogo } from './SuoxiLogo';

export interface TreatmentItemForComparison {
  id: string;
  treatmentName: string;
  unitCost: number;
  outdoorSessions?: number;
  indoorSessions?: number;
  isIndoorFree?: boolean;
}

export interface IndoorServiceItemForComparison {
  id: string;
  roomType: string;
  dailyRate: number;
  selected: boolean;
}

interface PackageComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTreatments: TreatmentItemForComparison[];
  allIndoorServices?: IndoorServiceItemForComparison[];
  initialFoodChargeSelected?: boolean;
  initialFoodChargePerDay?: number;
  initialIncludeAdmissionFee?: boolean;
  initialAdmissionFee?: number;
  currentMode: 'outdoor' | 'indoor' | '' | 'individual';
  currentPackage: '30 Days' | '15 Days' | '10 Days' | '7 Days' | 'Per Day' | string;
  patientName?: string;
  patientMobile?: string;
  consultingDoctor?: string;
  quotationNo?: string;
  initialSavedComparison?: {
    showOutdoor?: boolean;
    showIndoor?: boolean;
    customDays?: Record<string, number>;
    customDiscounts?: Record<string, number>;
    foodChargeSelected?: boolean;
    foodChargePerDay?: number;
    includeAdmissionFee?: boolean;
    admissionFee?: number;
    comparedAt?: string;
  } | null;
  onSaveComparison?: (comparisonData: {
    showOutdoor: boolean;
    showIndoor: boolean;
    customDays: Record<string, number>;
    customDiscounts: Record<string, number>;
    foodChargeSelected: boolean;
    foodChargePerDay: number;
    includeAdmissionFee: boolean;
    admissionFee: number;
    comparedAt: string;
  }) => void;
  onApplyPackage?: (
    patientType: 'outdoor' | 'indoor',
    packageType: '30 Days' | '15 Days' | '10 Days' | '7 Days' | 'Per Day' | string,
    days: number | '',
    discount: number
  ) => void;
}

export const PackageComparisonModal: React.FC<PackageComparisonModalProps> = ({
  isOpen,
  onClose,
  selectedTreatments,
  allIndoorServices = [],
  initialFoodChargeSelected = false,
  initialFoodChargePerDay = 500,
  initialIncludeAdmissionFee = false,
  initialAdmissionFee = 1000,
  currentMode,
  currentPackage,
  patientName,
  patientMobile,
  consultingDoctor,
  quotationNo,
  initialSavedComparison,
  onSaveComparison,
  onApplyPackage,
}) => {
  const [benchmarkDays, setBenchmarkDays] = useState<number>(30);
  const [showOutdoor, setShowOutdoor] = useState<boolean>(true);
  const [showIndoor, setShowIndoor] = useState<boolean>(true);

  // Editable Days and Discount Percent for each scenario
  const [customDays, setCustomDays] = useState<Record<string, number>>({
    outdoor_30: 30,
    outdoor_15: 15,
    outdoor_10: 10,
    outdoor_perday: 30,
    indoor_10: 10,
    indoor_15: 15,
    indoor_7: 7,
  });

  const [customDiscounts, setCustomDiscounts] = useState<Record<string, number>>({
    outdoor_30: 35,
    outdoor_15: 25,
    outdoor_10: 15,
    outdoor_perday: 0,
    indoor_10: 30,
    indoor_15: 30,
    indoor_7: 30,
  });

  // Load saved comparison configuration when modal opens if available
  useEffect(() => {
    if (isOpen) {
      if (initialSavedComparison) {
        if (initialSavedComparison.showOutdoor !== undefined) {
          setShowOutdoor(initialSavedComparison.showOutdoor);
        }
        if (initialSavedComparison.showIndoor !== undefined) {
          setShowIndoor(initialSavedComparison.showIndoor);
        }
        if (initialSavedComparison.customDays) {
          setCustomDays(prev => ({ ...prev, ...initialSavedComparison.customDays }));
        }
        if (initialSavedComparison.customDiscounts) {
          setCustomDiscounts(prev => ({ ...prev, ...initialSavedComparison.customDiscounts }));
        }
      } else {
        if (currentMode === 'outdoor') {
          setShowOutdoor(true);
          setShowIndoor(false);
        } else if (currentMode === 'indoor') {
          setShowOutdoor(false);
          setShowIndoor(true);
        } else {
          setShowOutdoor(true);
          setShowIndoor(true);
        }
      }
    }
  }, [isOpen]);

  const handleCloseModal = () => {
    if (onSaveComparison) {
      onSaveComparison({
        showOutdoor,
        showIndoor,
        customDays,
        customDiscounts,
        foodChargeSelected: initialFoodChargeSelected,
        foodChargePerDay: initialFoodChargePerDay,
        includeAdmissionFee: initialIncludeAdmissionFee,
        admissionFee: initialAdmissionFee,
        comparedAt: new Date().toISOString()
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Compute daily gross cost per day for Outdoor and Indoor treatments
  const outdoorDailyGross = selectedTreatments.reduce((sum, item) => {
    const dailySessions = item.outdoorSessions !== undefined ? item.outdoorSessions : 1;
    return sum + (item.unitCost * dailySessions);
  }, 0);

  const indoorDailyGross = selectedTreatments.reduce((sum, item) => {
    const dailySessions = item.indoorSessions !== undefined ? item.indoorSessions : 1;
    return sum + (item.unitCost * dailySessions);
  }, 0);

  const selectedRooms = allIndoorServices.filter(r => r.selected);
  const totalRoomDailyRate = selectedRooms.reduce((sum, r) => sum + (Number(r.dailyRate) || 0), 0);

  // Define the scenarios
  interface Scenario {
    id: string;
    patientType: 'outdoor' | 'indoor';
    patientTypeLabel: string;
    packageType: '30 Days' | '15 Days' | '10 Days' | '7 Days' | 'Per Day' | string;
    days: number;
    discountPercent: number;
    badgeText: string;
    badgeColor: string;
  }

  const scenarios: Scenario[] = [
    {
      id: 'outdoor_30',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: '30 Days',
      days: customDays['outdoor_30'] ?? 30,
      discountPercent: customDiscounts['outdoor_30'] ?? 35,
      badgeText: 'Highest Savings',
      badgeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'outdoor_15',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: '15 Days',
      days: customDays['outdoor_15'] ?? 15,
      discountPercent: customDiscounts['outdoor_15'] ?? 25,
      badgeText: 'Popular Choice',
      badgeColor: 'bg-teal-600 text-white',
    },
    {
      id: 'outdoor_10',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: '10 Days',
      days: customDays['outdoor_10'] ?? 10,
      discountPercent: customDiscounts['outdoor_10'] ?? 15,
      badgeText: 'Value Choice',
      badgeColor: 'bg-cyan-700 text-white',
    },
    {
      id: 'outdoor_perday',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: 'Per Day',
      days: customDays['outdoor_perday'] ?? benchmarkDays,
      discountPercent: customDiscounts['outdoor_perday'] ?? 0,
      badgeText: 'Standard Rate',
      badgeColor: 'bg-slate-600 text-white',
    },
    {
      id: 'indoor_10',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: '10 Days',
      days: customDays['indoor_10'] ?? 10,
      discountPercent: customDiscounts['indoor_10'] ?? 30,
      badgeText: 'Indoor 10 Days',
      badgeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'indoor_15',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: '15 Days',
      days: customDays['indoor_15'] ?? 15,
      discountPercent: customDiscounts['indoor_15'] ?? 30,
      badgeText: 'Indoor 15 Days',
      badgeColor: 'bg-indigo-500 text-white',
    },
    {
      id: 'indoor_7',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: '7 Days',
      days: customDays['indoor_7'] ?? 7,
      discountPercent: customDiscounts['indoor_7'] ?? 30,
      badgeText: 'Indoor 7 Days',
      badgeColor: 'bg-indigo-400 text-white',
    },
  ];

  const calculateDetails = (sc: Scenario) => {
    if (sc.patientType === 'outdoor') {
      const treatmentGross = outdoorDailyGross * sc.days;
      const treatmentDiscount = Math.round((treatmentGross * sc.discountPercent) / 100);
      const treatmentNet = Math.max(0, treatmentGross - treatmentDiscount);
      const perDayNet = sc.days > 0 ? Math.round(treatmentNet / sc.days) : 0;

      return {
        treatmentGross,
        treatmentDiscount,
        treatmentNet,
        roomTotal: 0,
        foodTotal: 0,
        admissionTotal: 0,
        grandTotal: treatmentNet,
        perDayNet,
      };
    } else {
      let treatmentGross = 0;
      let treatmentDiscount = 0;

      selectedTreatments.forEach(item => {
        const dailySessions = item.indoorSessions !== undefined ? item.indoorSessions : 1;
        const itemGross = item.unitCost * dailySessions * sc.days;
        treatmentGross += itemGross;
        treatmentDiscount += Math.round((itemGross * sc.discountPercent) / 100);
      });

      const treatmentNet = Math.max(0, treatmentGross - treatmentDiscount);

      const roomTotal = totalRoomDailyRate * sc.days;
      const foodTotal = initialFoodChargeSelected ? ((initialFoodChargePerDay || 500) * sc.days) : 0;
      const admissionTotal = initialIncludeAdmissionFee ? (initialAdmissionFee || 1000) : 0;

      const recurringTotal = treatmentNet + roomTotal + foodTotal;
      const grandTotal = recurringTotal + admissionTotal;
      const perDayNet = sc.days > 0 ? Math.round(recurringTotal / sc.days) : 0;

      return {
        treatmentGross,
        treatmentDiscount,
        treatmentNet,
        roomTotal,
        foodTotal,
        admissionTotal,
        grandTotal,
        perDayNet,
      };
    }
  };

  return (
    <>
      {/* Screen Interactive Modal (Hidden during printing) */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:hidden">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl my-6 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  Treatment Package & Patient Type Cost Comparison
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </h2>
                <p className="text-xs text-slate-300">
                  Compare Outdoor vs. Indoor pricing models including Treatment, Room, Food & Admission fees
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition cursor-pointer shadow-xs"
                title="Print Comparison Sheet"
              >
                <Printer className="w-4 h-4" />
                <span>Print Comparison</span>
              </button>
              <button
                onClick={handleCloseModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

        {/* Selected Treatments Summary Bar */}
        <div className="bg-emerald-50/80 px-6 py-3 border-b border-emerald-100 flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-emerald-900 font-medium">
                {selectedTreatments.length > 0 ? (
                  <>Comparing based on <strong>{selectedTreatments.length} selected treatment(s)</strong></>
                ) : (
                  <span className="text-slate-600 font-medium">No treatments selected in Step 1</span>
                )}
              </span>
            </div>

            {/* Check Mark Boxes for Outdoor, Indoor */}
            <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-slate-700 font-bold text-xs">Show Comparison:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-emerald-800 hover:text-emerald-950 select-none">
                <input
                  type="checkbox"
                  checked={showOutdoor}
                  onChange={(e) => setShowOutdoor(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span>Outdoor</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-indigo-800 hover:text-indigo-950 select-none">
                <input
                  type="checkbox"
                  checked={showIndoor}
                  onChange={(e) => setShowIndoor(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
                <span>Indoor</span>
              </label>
            </div>

            {selectedTreatments.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-semibold">Per Day Benchmark for 'Per Day' packages:</span>
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-300 shadow-2xs">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={benchmarkDays}
                    onChange={(e) => setBenchmarkDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-12 text-center font-bold text-slate-800 text-xs outline-none"
                  />
                  <span className="text-slate-500 text-[11px] font-semibold">Days</span>
                </div>
              </div>
            )}
          </div>

          {/* List of selected treatment names and selected rooms */}
          {(selectedTreatments.length > 0 || selectedRooms.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-100/80">
              {selectedTreatments.map(t => (
                <span key={t.id} className="bg-white text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px] font-medium shadow-2xs">
                  ✓ {t.treatmentName} ({t.unitCost} BDT)
                </span>
              ))}
              {selectedRooms.map(r => (
                <span key={r.id} className="bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded-md text-[11px] font-bold shadow-2xs">
                  🏠 {r.roomType} (BDT {r.dailyRate}/day)
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content - Comparison Grid */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section: Outdoor Patient Packages */}
          {showOutdoor && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Outdoor Patient Packages
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {scenarios.filter(s => s.patientType === 'outdoor').map(sc => {
                  const details = calculateDetails(sc);
                  const isCurrentActive = currentMode === 'outdoor' && currentPackage === sc.packageType;

                  return (
                    <div
                      key={sc.id}
                      className={`rounded-2xl border p-4 pt-5 transition-all relative flex flex-col justify-between ${
                        isCurrentActive
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 shadow-md'
                          : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Badge on Top Border Line (Left Side) */}
                      <span className={`absolute -top-3 left-4 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs ${sc.badgeColor}`}>
                        {sc.badgeText}
                      </span>

                      {/* Currently Active Badge on Top Border Line (Right Side) */}
                      {isCurrentActive && (
                        <span className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <Check className="w-3 h-3" /> Currently Active
                        </span>
                      )}

                      <div>
                        {/* Line 1: Days & Discount Input Fields */}
                        <div className="flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs mb-2.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight">Days:</span>
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={sc.days}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setCustomDays(prev => ({ ...prev, [sc.id]: val }));
                              }}
                              className="w-12 px-1.5 py-0.5 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                            />
                          </div>
                          <div className="h-3.5 w-px bg-slate-300"></div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight">Disc:</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={sc.discountPercent}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                setCustomDiscounts(prev => ({ ...prev, [sc.id]: val }));
                              }}
                              className="w-12 px-1.5 py-0.5 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                            />
                            <span className="text-[10px] font-extrabold text-slate-500">%</span>
                          </div>
                        </div>

                        {/* Line 2: Package Title & Highlighted Discount Title */}
                        <div className="mb-2">
                          <h4 className="text-base font-extrabold text-slate-900 leading-tight">
                            {sc.days} Days
                          </h4>
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span>Outdoor</span>
                            <span className="text-slate-300">•</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300/80 shadow-2xs">
                              {sc.discountPercent}% Discount
                            </span>
                          </p>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Gross Treatment ({sc.days} Days):</span>
                            <span className="font-semibold text-slate-800">BDT {details.treatmentGross.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 font-semibold">
                            <span>Package Discount ({sc.discountPercent}%):</span>
                            <span>- BDT {details.treatmentDiscount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-200 pt-2">
                            <span>Net Payable Total:</span>
                            <span className="text-emerald-700">BDT {details.grandTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-slate-500 text-[11px] pt-1">
                            <span>Effective Rate / Day:</span>
                            <span className="font-semibold text-slate-700">BDT {details.perDayNet.toLocaleString()} / Day</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onApplyPackage) {
                            onApplyPackage(
                              'outdoor',
                              sc.packageType,
                              sc.days,
                              sc.discountPercent
                            );
                          }
                          handleCloseModal();
                        }}
                        className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          isCurrentActive
                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        }`}
                      >
                        {isCurrentActive ? 'Already Applied' : 'Apply Outdoor Package'}
                        {!isCurrentActive && <ArrowRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Indoor Patient Packages */}
          {showIndoor && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Indoor Patient Packages (With Room, Food & Admission)
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scenarios.filter(s => s.patientType === 'indoor').map(sc => {
                  const details = calculateDetails(sc);
                  const isCurrentActive = currentMode === 'indoor' && currentPackage === sc.packageType;

                  return (
                    <div
                      key={sc.id}
                      className={`rounded-2xl border p-4 pt-5 transition-all relative flex flex-col justify-between ${
                        isCurrentActive
                          ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/30 shadow-md'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Badge on Top Border Line (Left Side) */}
                      <span className={`absolute -top-3 left-4 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs ${sc.badgeColor}`}>
                        Indoor {sc.days} Days
                      </span>

                      {/* Currently Active Badge on Top Border Line (Right Side) */}
                      {isCurrentActive && (
                        <span className="absolute -top-3 right-4 bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <Check className="w-3 h-3" /> Currently Active
                        </span>
                      )}

                      <div>
                        {/* Line 1: Days & Discount Input Fields */}
                        <div className="flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs mb-2.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight">Days:</span>
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={sc.days}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setCustomDays(prev => ({ ...prev, [sc.id]: val }));
                              }}
                              className="w-12 px-1.5 py-0.5 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                            />
                          </div>
                          <div className="h-3.5 w-px bg-slate-300"></div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight">Disc:</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={sc.discountPercent}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                setCustomDiscounts(prev => ({ ...prev, [sc.id]: val }));
                              }}
                              className="w-12 px-1.5 py-0.5 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                            />
                            <span className="text-[10px] font-extrabold text-slate-500">%</span>
                          </div>
                        </div>

                        {/* Line 2: Package Title & Highlighted Discount Title */}
                        <div className="mb-2">
                          <h4 className="text-base font-extrabold text-slate-900 leading-tight">
                            {sc.days} Days
                          </h4>
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span>Indoor</span>
                            <span className="text-slate-300">•</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[11px] bg-indigo-100 text-indigo-800 border border-indigo-300/80 shadow-2xs">
                              {sc.discountPercent}% Treatment Disc
                            </span>
                          </p>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-100 pt-2 text-[11px]">
                          {/* Treatment Breakdown */}
                          <div className="flex justify-between text-slate-600">
                            <span>Treatment Gross ({sc.days}d):</span>
                            <span className="font-semibold text-slate-800">BDT {details.treatmentGross.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-indigo-700 font-semibold">
                            <span>Treatment Disc ({sc.discountPercent}%):</span>
                            <span>- BDT {details.treatmentDiscount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-slate-800 font-semibold border-b border-slate-100 pb-1">
                            <span>Treatment Net:</span>
                            <span>BDT {details.treatmentNet.toLocaleString()}</span>
                          </div>

                          {/* Room Charge & Accommodation Breakdown */}
                          {selectedRooms.length > 0 ? (
                            <div className="space-y-1 my-1 p-2 bg-indigo-50/80 rounded-xl border border-indigo-100/80">
                              <div className="flex justify-between items-center text-slate-800 font-bold text-[11px] border-b border-indigo-200/80 pb-1">
                                <span>Room Accommodation ({sc.days}d):</span>
                                <span className="text-indigo-900 font-extrabold">+ BDT {details.roomTotal.toLocaleString()}</span>
                              </div>
                              <div className="space-y-0.5 pt-0.5">
                                {selectedRooms.map(r => {
                                  const cost = (Number(r.dailyRate) || 0) * sc.days;
                                  return (
                                    <div key={r.id} className="flex justify-between items-center text-[10px] text-slate-700">
                                      <span className="truncate pr-1 font-semibold text-slate-800" title={r.roomType}>
                                        • {r.roomType} <span className="text-slate-500 font-normal">({r.dailyRate}/d)</span>
                                      </span>
                                      <span className="font-bold text-indigo-950 shrink-0">+ BDT {cost.toLocaleString()}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between text-slate-600">
                              <span>Room/Cabin ({sc.days}d):</span>
                              <span className="font-semibold text-slate-400 italic">No room selected (0 BDT)</span>
                            </div>
                          )}

                          {/* Food Charge */}
                          <div className="flex justify-between text-slate-600">
                            <span>Food Charge ({sc.days}d):</span>
                            <span className="font-semibold text-slate-800">
                              {details.foodTotal > 0 ? `+ BDT ${details.foodTotal.toLocaleString()}` : '0 BDT'}
                            </span>
                          </div>

                          {/* Effective Rate / Day (Excluding Admission Fee) */}
                          <div className="flex justify-between text-slate-700 bg-slate-50 p-1.5 rounded-lg border border-slate-200/80 my-1 font-semibold text-[11px]">
                            <span>Effective Rate / Day:</span>
                            <span className="font-extrabold text-slate-900">BDT {details.perDayNet.toLocaleString()} / Day</span>
                          </div>

                          {/* Admission Fee (1-Time, added below Effective Rate) */}
                          <div className="flex justify-between text-slate-600 text-[11px] pt-0.5">
                            <span>Admission Fee (1-Time):</span>
                            <span className="font-semibold text-slate-800">
                              {details.admissionTotal > 0 ? `+ BDT ${details.admissionTotal.toLocaleString()}` : '0 BDT'}
                            </span>
                          </div>

                          {/* Total Net Payable */}
                          <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-200 pt-2 mt-1">
                            <span>Total Net Estimate:</span>
                            <span className="text-indigo-700 font-black">BDT {details.grandTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onApplyPackage) {
                            onApplyPackage(
                              'indoor',
                              sc.packageType,
                              sc.days,
                              sc.discountPercent
                            );
                          }
                          handleCloseModal();
                        }}
                        className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          isCurrentActive
                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        {isCurrentActive ? 'Already Applied' : 'Apply Indoor Package'}
                        {!isCurrentActive && <ArrowRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state if all unchecked */}
          {!showOutdoor && !showIndoor && (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500 text-sm">
              Please check at least one comparison option above (Outdoor or Indoor) to view cost packages.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <span>
              Tip: Outdoor 30-Day offers <strong>35% OFF</strong> treatment cost, while Indoor packages (10, 15, 7 Days) offer <strong>30% OFF</strong> treatment cost plus full room & board estimation.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print Comparison</span>
            </button>
            <button
              onClick={handleCloseModal}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition cursor-pointer"
            >
              Close Comparison
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Printable Comparison Document Sheet (Visible ONLY during window.print()) */}
    <div className="hidden print:block font-sans text-slate-900 bg-white p-0 m-0 w-full max-w-none">
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 7mm 6mm 7mm 6mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background-color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `
      }} />

      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-2.5 mb-2.5 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <SuoxiLogo size="md" />
          <div>
            <h1 className="text-[17px] font-black text-slate-900 uppercase tracking-tight leading-tight whitespace-nowrap">
              SUO XI HOSPITAL (ACUPUNCTURE)
            </h1>
            <p className="text-[9.5px] text-slate-600 font-semibold whitespace-nowrap mt-0.5">
              Shaan Tower, 24/1, Chamelibagh, Shantinagar, Dhaka 1217 • Helpline: +88 09613 100 600
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-black text-[10px] px-2.5 py-0.5 uppercase tracking-wider rounded shadow-xs">
            PACKAGE COST COMPARISON SHEET
          </span>
          <p className="text-[10.5px] text-slate-700 font-bold mt-0.5">Date: {new Date().toLocaleDateString('en-GB')}</p>
          {quotationNo && <p className="text-[9.5px] text-slate-500 font-semibold">Ref No: {quotationNo}</p>}
        </div>
      </div>

      {/* Patient & Doctor Details */}
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-xs grid grid-cols-3 gap-2 mb-2.5 font-semibold">
        <div><span className="text-slate-500">Patient Name:</span> <strong className="text-slate-900">{patientName || 'Walk-in Patient'}</strong></div>
        <div><span className="text-slate-500">Mobile Number:</span> <strong className="text-slate-900">{patientMobile || 'N/A'}</strong></div>
        <div><span className="text-slate-500">Consulting Doctor:</span> <strong className="text-slate-900">{consultingDoctor || 'Hospital System Admin'}</strong></div>
      </div>

      {/* Selected Items Summary */}
      <div className="mb-2.5 bg-emerald-50/60 p-2 rounded-lg border border-emerald-200 text-xs">
        <span className="font-bold text-emerald-950 uppercase tracking-wider block mb-1 text-[11px]">
          Base Selected Treatments & Room Accommodation:
        </span>
        <div className="flex flex-wrap gap-1.5 text-[10.5px]">
          {selectedTreatments.length > 0 ? (
            selectedTreatments.map(t => (
              <span key={t.id} className="bg-white text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-medium">
                ✓ {t.treatmentName} ({t.unitCost} BDT/session)
              </span>
            ))
          ) : (
            <span className="text-slate-500 italic">No treatments selected</span>
          )}
          {selectedRooms.map(r => (
            <span key={r.id} className="bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded font-bold">
              🏠 {r.roomType} (BDT {r.dailyRate}/day)
            </span>
          ))}
        </div>
      </div>

      {/* SECTION 1: OUTDOOR PATIENT PACKAGES (3 COMPARISON CARDS) */}
      {showOutdoor && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-emerald-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
            <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wider">
              OUTDOOR PATIENT PACKAGES (TREATMENT COST ONLY)
            </h3>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {scenarios.filter(s => s.patientType === 'outdoor').map(sc => {
              const details = calculateDetails(sc);
              return (
                <div key={sc.id} className="border border-slate-300 rounded-xl p-3 bg-white flex flex-col justify-between">
                  <div>
                    <div className="mb-1">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                        {sc.badgeText}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900">
                      {sc.days} Days
                    </h4>
                    <p className="text-[10px] text-slate-500 font-semibold mb-2">
                      Outdoor • {sc.discountPercent}% Discount
                    </p>

                    <div className="space-y-1 border-t border-slate-200 pt-2 text-[10px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Gross ({sc.days}d):</span>
                        <span className="font-semibold text-slate-900">BDT {details.treatmentGross.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>Discount ({sc.discountPercent}%):</span>
                        <span>- BDT {details.treatmentDiscount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-900 font-black text-xs border-t border-slate-200 pt-1">
                        <span>Net Payable:</span>
                        <span className="text-emerald-800">BDT {details.grandTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[9px] pt-0.5">
                        <span>Rate / Day:</span>
                        <span className="font-bold text-slate-700">BDT {details.perDayNet.toLocaleString()}/d</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: INDOOR PATIENT PACKAGES (3 COMPARISON CARDS) */}
      {showIndoor && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-indigo-200">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
            <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
              INDOOR PATIENT PACKAGES (WITH ROOM, FOOD & ADMISSION)
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {scenarios.filter(s => s.patientType === 'indoor').map(sc => {
              const details = calculateDetails(sc);
              return (
                <div key={sc.id} className="border border-slate-300 rounded-xl p-3 bg-white flex flex-col justify-between">
                  <div>
                    <div className="mb-1">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200">
                        Indoor {sc.days} Days
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900">
                      {sc.days} Days
                    </h4>
                    <p className="text-[10px] text-slate-500 font-semibold mb-2">
                      Indoor • {sc.discountPercent}% Treatment Disc
                    </p>

                    <div className="space-y-1 border-t border-slate-200 pt-1.5 text-[10px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Treatment Gross ({sc.days}d):</span>
                        <span className="font-semibold text-slate-900">BDT {details.treatmentGross.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-indigo-700 font-semibold">
                        <span>Treatment Disc ({sc.discountPercent}%):</span>
                        <span>- BDT {details.treatmentDiscount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-800 font-bold border-b border-slate-100 pb-0.5">
                        <span>Treatment Net:</span>
                        <span>BDT {details.treatmentNet.toLocaleString()}</span>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>Room/Cabin ({sc.days}d):</span>
                        <span className="font-bold text-indigo-900">
                          {details.roomTotal > 0 ? `+ BDT ${details.roomTotal.toLocaleString()}` : '0 BDT'}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>Food Charge ({sc.days}d):</span>
                        <span className="font-semibold text-slate-800">
                          {details.foodTotal > 0 ? `+ BDT ${details.foodTotal.toLocaleString()}` : '0 BDT'}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-700 font-bold border-t border-slate-100 pt-1">
                        <span>Effective Rate / Day:</span>
                        <span className="text-slate-900">BDT {details.perDayNet.toLocaleString()}/d</span>
                      </div>

                      <div className="flex justify-between text-slate-600 pt-0.5">
                        <span>Admission (1-Time):</span>
                        <span className="font-semibold text-slate-800">
                          {details.admissionTotal > 0 ? `+ BDT ${details.admissionTotal.toLocaleString()}` : '0 BDT'}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-900 font-black text-xs border-t border-slate-200 pt-1">
                        <span>Total Net Estimate:</span>
                        <span className="text-indigo-900">BDT {details.grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Notes & Signatures */}
      <div className="pt-3 mt-3 border-t border-slate-300">
        <p className="text-[9px] text-slate-500 mb-8 italic text-center">
          * This comparison sheet is generated for counseling and financial planning purposes only. Final charges depend on actual stay and prescribed therapies.
        </p>

        <div className="flex justify-between text-[11px] text-slate-800 font-bold pt-10 mb-5">
          <div className="text-center w-44 border-t-2 border-slate-700 pt-1.5">
            Prepared By
          </div>
          <div className="text-center w-48 border-t-2 border-slate-700 pt-1.5">
            Patient / Guardian Signature
          </div>
          <div className="text-center w-48 border-t-2 border-slate-700 pt-1.5">
            Authorized Hospital Signature
          </div>
        </div>

        {/* System & Developer Footer */}
        <div className="border-t border-slate-200 pt-2 text-center text-[8.5px] text-slate-500 space-y-0.5">
          <p className="font-semibold text-slate-600">
            Computer generated invoice comparison • SUO XI Hospital (Acupuncture) Billing System
          </p>
          <p className="text-slate-400 font-medium">
            Developed &amp; Designed By SUOXI IT
          </p>
        </div>
      </div>
    </div>
  </>
  );
};
