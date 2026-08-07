import React, { useState } from 'react';
import { X, Check, ArrowRight, Sparkles, Scale, TrendingDown, Info, Printer } from 'lucide-react';
import { SuoxiLogo } from './SuoxiLogo';

export interface TreatmentItemForComparison {
  id: string;
  treatmentName: string;
  unitCost: number;
  outdoorSessions?: number;
  indoorSessions?: number;
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
  currentMode: 'outdoor' | 'indoor' | '';
  currentPackage: '30 Days' | '15 Days' | 'Per Day' | '';
  patientName?: string;
  patientMobile?: string;
  consultingDoctor?: string;
  quotationNo?: string;
  onApplyPackage: (
    patientType: 'outdoor' | 'indoor',
    packageType: '30 Days' | '15 Days' | 'Per Day',
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
  onApplyPackage,
}) => {
  const [benchmarkDays, setBenchmarkDays] = useState<number>(30);

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

  // Define the 6 scenarios
  interface Scenario {
    id: string;
    patientType: 'outdoor' | 'indoor';
    patientTypeLabel: string;
    packageType: '30 Days' | '15 Days' | 'Per Day';
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
      days: 30,
      discountPercent: 35,
      badgeText: 'Highest Savings (35% OFF)',
      badgeColor: 'bg-emerald-500 text-white',
    },
    {
      id: 'outdoor_15',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: '15 Days',
      days: 15,
      discountPercent: 25,
      badgeText: 'Popular Choice (25% OFF)',
      badgeColor: 'bg-teal-500 text-white',
    },
    {
      id: 'outdoor_perday',
      patientType: 'outdoor',
      patientTypeLabel: 'Outdoor Patient',
      packageType: 'Per Day',
      days: benchmarkDays,
      discountPercent: 0,
      badgeText: 'Standard Rate (0% OFF)',
      badgeColor: 'bg-slate-200 text-slate-700',
    },
    {
      id: 'indoor_30',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: '30 Days',
      days: 30,
      discountPercent: 30,
      badgeText: 'Indoor Full Care (30% OFF)',
      badgeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'indoor_15',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: '15 Days',
      days: 15,
      discountPercent: 30,
      badgeText: 'Indoor Half Month (30% OFF)',
      badgeColor: 'bg-indigo-500 text-white',
    },
    {
      id: 'indoor_perday',
      patientType: 'indoor',
      patientTypeLabel: 'Indoor Patient',
      packageType: 'Per Day',
      days: benchmarkDays,
      discountPercent: 30,
      badgeText: 'Indoor Daily Care (30% OFF)',
      badgeColor: 'bg-indigo-100 text-indigo-800',
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
      const treatmentGross = indoorDailyGross * sc.days;
      const treatmentDiscount = Math.round((treatmentGross * sc.discountPercent) / 100);
      const treatmentNet = Math.max(0, treatmentGross - treatmentDiscount);

      const roomTotal = totalRoomDailyRate * sc.days;
      const foodTotal = initialFoodChargeSelected ? ((initialFoodChargePerDay || 500) * sc.days) : 0;
      const admissionTotal = initialIncludeAdmissionFee ? (initialAdmissionFee || 1000) : 0;

      const grandTotal = treatmentNet + roomTotal + foodTotal + admissionTotal;
      const perDayNet = sc.days > 0 ? Math.round(grandTotal / sc.days) : 0;

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
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-6 overflow-hidden flex flex-col max-h-[92vh]">
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
                onClick={onClose}
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
              <Info className="w-4 h-4 text-emerald-700" />
              <span className="text-emerald-900 font-medium">
                {selectedTreatments.length > 0 ? (
                  <>Comparing based on <strong>{selectedTreatments.length} selected treatment(s)</strong></>
                ) : (
                  <span className="text-slate-600 font-medium">No treatments selected in Step 1</span>
                )}
              </span>
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
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Outdoor Patient Packages
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {scenarios.filter(s => s.patientType === 'outdoor').map(sc => {
                const details = calculateDetails(sc);
                const isCurrentActive = currentMode === 'outdoor' && currentPackage === sc.packageType;

                return (
                  <div
                    key={sc.id}
                    className={`rounded-2xl border p-4 transition-all relative flex flex-col justify-between ${
                      isCurrentActive
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 shadow-md'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                    }`}
                  >
                    {isCurrentActive && (
                      <span className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <Check className="w-3 h-3" /> Currently Active
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${sc.badgeColor}`}>
                          {sc.badgeText}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        {sc.packageType} {sc.packageType === 'Per Day' ? `(${sc.days} Days)` : ''}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mb-3">
                        Outdoor Patient • {sc.discountPercent}% Discount
                      </p>

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
                        onApplyPackage(
                          'outdoor',
                          sc.packageType,
                          sc.packageType === 'Per Day' ? sc.days : (sc.packageType === '30 Days' ? 30 : 15),
                          sc.discountPercent
                        );
                        onClose();
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

          {/* Section: Indoor Patient Packages */}
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
                    className={`rounded-2xl border p-4 transition-all relative flex flex-col justify-between ${
                      isCurrentActive
                        ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/30 shadow-md'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    {isCurrentActive && (
                      <span className="absolute -top-3 right-4 bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <Check className="w-3 h-3" /> Currently Active
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${sc.badgeColor}`}>
                          {sc.badgeText}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        {sc.packageType} {sc.packageType === 'Per Day' ? `(${sc.days} Days)` : ''}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mb-3">
                        Indoor Patient • {sc.discountPercent}% Treatment Discount
                      </p>

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

                        {/* Admission Fee */}
                        <div className="flex justify-between text-slate-600">
                          <span>Admission Fee (1-Time):</span>
                          <span className="font-semibold text-slate-800">
                            {details.admissionTotal > 0 ? `+ BDT ${details.admissionTotal.toLocaleString()}` : '0 BDT'}
                          </span>
                        </div>

                        {/* Total Net Payable */}
                        <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-200 pt-2">
                          <span>Total Net Estimate:</span>
                          <span className="text-indigo-700">BDT {details.grandTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[11px] pt-0.5">
                          <span>Effective Rate / Day:</span>
                          <span className="font-semibold text-slate-700">BDT {details.perDayNet.toLocaleString()} / Day</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onApplyPackage(
                          'indoor',
                          sc.packageType,
                          sc.packageType === 'Per Day' ? sc.days : (sc.packageType === '30 Days' ? 30 : 15),
                          sc.discountPercent
                        );
                        onClose();
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
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <span>
              Tip: Outdoor 30-Day offers <strong>35% OFF</strong> treatment cost, while Indoor 30-Day offers <strong>30% OFF</strong> treatment cost plus full room & board estimation.
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
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition cursor-pointer"
            >
              Close Comparison
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Printable Comparison Document Sheet (Visible ONLY during window.print()) */}
    <div className="hidden print:block font-sans text-slate-900 bg-white p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b-2 border-slate-800 pb-3 mb-4 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <SuoxiLogo size="md" />
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">SUO XI HOSPITAL (ACUPUNCTURE)</h1>
            <p className="text-xs text-slate-700 font-bold">Comprehensive Acupuncture & Rehabilitation Healthcare</p>
            <p className="text-[10px] text-slate-500">Shyamoli, Dhaka, Bangladesh • Helpline: +880 1711-223344</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 uppercase tracking-wider rounded">
            PACKAGE COST COMPARISON SHEET
          </span>
          <p className="text-[11px] text-slate-700 font-bold mt-1">Date: {new Date().toLocaleDateString('en-GB')}</p>
          {quotationNo && <p className="text-[10px] text-slate-500 font-semibold">Ref No: {quotationNo}</p>}
        </div>
      </div>

      {/* Patient & Doctor Details */}
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-xs grid grid-cols-3 gap-2 mb-4 font-semibold">
        <div><span className="text-slate-500">Patient Name:</span> <strong className="text-slate-900">{patientName || 'N/A'}</strong></div>
        <div><span className="text-slate-500">Mobile Number:</span> <strong className="text-slate-900">{patientMobile || 'N/A'}</strong></div>
        <div><span className="text-slate-500">Consulting Doctor:</span> <strong className="text-slate-900">{consultingDoctor || 'Hospital System Admin'}</strong></div>
      </div>

      {/* Selected Items Summary */}
      <div className="mb-4 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider mb-1.5 border-b border-emerald-200/80 pb-1">
          Base Treatment & Accommodation Selected
        </h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="font-bold text-slate-800">Selected Treatments ({selectedTreatments.length}):</span>
            {selectedTreatments.length > 0 ? (
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-slate-700">
                {selectedTreatments.map(t => (
                  <li key={t.id}>
                    {t.treatmentName} — <strong>BDT {t.unitCost.toLocaleString()}</strong> / session
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500 italic mt-0.5">No treatments selected</p>
            )}
          </div>
          <div>
            <span className="font-bold text-slate-800">Selected Accommodation & Additional Services:</span>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-slate-700">
              {selectedRooms.length > 0 ? (
                selectedRooms.map(r => (
                  <li key={r.id}>
                    Room: {r.roomType} — <strong>BDT {r.dailyRate.toLocaleString()}</strong> / day
                  </li>
                ))
              ) : (
                <li className="italic text-slate-400">No indoor room selected</li>
              )}
              {initialFoodChargeSelected && (
                <li>Food Charge (3x Daily) — <strong>BDT {initialFoodChargePerDay}/day</strong></li>
              )}
              {initialIncludeAdmissionFee && (
                <li>Admission Fee (One-Time) — <strong>BDT {initialAdmissionFee}</strong></li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Outdoor Packages Comparison Table */}
      <div className="mb-5">
        <h3 className="text-xs font-bold text-emerald-900 bg-emerald-100/80 px-2 py-1 uppercase tracking-wider rounded-t border border-emerald-300">
          1. Outdoor Patient Packages (Treatment Cost Only)
        </h3>
        <table className="w-full text-xs border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
              <th className="p-2 text-left border-r border-slate-300">Package Type</th>
              <th className="p-2 text-center border-r border-slate-300">Duration</th>
              <th className="p-2 text-right border-r border-slate-300">Gross Treatment</th>
              <th className="p-2 text-right border-r border-slate-300">Package Discount</th>
              <th className="p-2 text-right border-r border-slate-300">Net Total Payable</th>
              <th className="p-2 text-right">Effective Daily Rate</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.filter(s => s.patientType === 'outdoor').map(sc => {
              const details = calculateDetails(sc);
              return (
                <tr key={sc.id} className="border-b border-slate-200 text-[11px]">
                  <td className="p-2 font-bold border-r border-slate-200">{sc.packageType}</td>
                  <td className="p-2 text-center border-r border-slate-200">{sc.days} Days</td>
                  <td className="p-2 text-right border-r border-slate-200">BDT {details.treatmentGross.toLocaleString()}</td>
                  <td className="p-2 text-right text-emerald-800 font-bold border-r border-slate-200">
                    {sc.discountPercent}% (-BDT {details.treatmentDiscount.toLocaleString()})
                  </td>
                  <td className="p-2 text-right font-black text-slate-900 border-r border-slate-200">
                    BDT {details.grandTotal.toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-semibold text-slate-700">
                    BDT {details.perDayNet.toLocaleString()}/day
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Indoor Packages Comparison Table */}
      <div className="mb-6">
        <h3 className="text-xs font-bold text-indigo-900 bg-indigo-100/80 px-2 py-1 uppercase tracking-wider rounded-t border border-indigo-300">
          2. Indoor Patient Packages (Treatment + Room + Food + Admission)
        </h3>
        <table className="w-full text-xs border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
              <th className="p-2 text-left border-r border-slate-300">Package Type</th>
              <th className="p-2 text-right border-r border-slate-300">Treatment Net</th>
              <th className="p-2 text-right border-r border-slate-300">Room Total</th>
              <th className="p-2 text-right border-r border-slate-300">Food Charge</th>
              <th className="p-2 text-right border-r border-slate-300">Admission</th>
              <th className="p-2 text-right border-r border-slate-300">Grand Total Estimate</th>
              <th className="p-2 text-right">Effective Daily Rate</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.filter(s => s.patientType === 'indoor').map(sc => {
              const details = calculateDetails(sc);
              return (
                <tr key={sc.id} className="border-b border-slate-200 text-[11px]">
                  <td className="p-2 font-bold border-r border-slate-200">{sc.packageType} ({sc.days}d)</td>
                  <td className="p-2 text-right border-r border-slate-200">BDT {details.treatmentNet.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-slate-200">BDT {details.roomTotal.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-slate-200">BDT {details.foodTotal.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-slate-200">BDT {details.admissionTotal.toLocaleString()}</td>
                  <td className="p-2 text-right font-black text-indigo-950 border-r border-slate-200">
                    BDT {details.grandTotal.toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-semibold text-slate-700">
                    BDT {details.perDayNet.toLocaleString()}/day
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Notes & Signatures */}
      <div className="pt-8 mt-6 border-t border-slate-300">
        <p className="text-[10px] text-slate-500 mb-8 italic text-center">
          * This comparison sheet is generated for counseling and financial planning purposes only. Final charges depend on actual stay and prescribed therapies.
        </p>

        <div className="flex justify-between text-xs text-slate-800 font-bold pt-4">
          <div className="text-center w-48 border-t border-slate-400 pt-1">
            Prepared By
          </div>
          <div className="text-center w-48 border-t border-slate-400 pt-1">
            Patient / Guardian Signature
          </div>
          <div className="text-center w-48 border-t border-slate-400 pt-1">
            Authorized Hospital Signature
          </div>
        </div>
      </div>
    </div>
  </>
  );
};
