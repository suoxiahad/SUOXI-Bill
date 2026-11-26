import React, { useEffect } from 'react';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import { InvoiceQuotation, IndividualTreatment, AdditionalTreatment } from '../types';
import { toBengaliDigits } from '../utils/bengaliNumber';

interface QuotationPrintViewProps {
  quotation: InvoiceQuotation;
  onBack: () => void;
}

const HEADER_LOGO_URL = 'https://suoxigroup.com/wp-content/uploads/2026/10/Complain-Box-Logo.png';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')} ${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  }
  const ymd = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]) - 1;
    const d = String(Number(ymd[3])).padStart(2, '0');
    return `${d} ${MONTHS_SHORT[m] || ''} ${y}`;
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getDate()).padStart(2, '0')} ${MONTHS_SHORT[parsed.getMonth()]} ${parsed.getFullYear()}`;
  }
  return dateStr;
}

function formatAgeDisplay(age?: string | number): string {
  if (age === undefined || age === null || String(age).trim() === '') return '-';
  const s = String(age).trim();
  if (/^\d+$/.test(s)) return `${s}Y`;
  return s;
}

function formatMoneyCell(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  if (rounded === 0) return '0';
  return `${rounded.toLocaleString('en-US')}/-`;
}

function formatTotalCell(amount: number, hasRows: boolean): string {
  const rounded = Math.round(Number(amount) || 0);
  if (hasRows && rounded === 0) return 'FREE';
  return `${rounded.toLocaleString('en-US')}/-`;
}

function formatDiscountCell(row: {
  discountType?: 'percent' | 'fixed';
  fixedDiscountAmount?: number;
  discountPercent?: number;
  discountAmount?: number;
}): string {
  const discAmt = Math.round(Number(row.discountAmount) || 0);
  const discPct = Number(row.discountPercent || 0);
  if (row.discountType === 'fixed') {
    return discAmt === 0 ? '0%' : `${discAmt.toLocaleString('en-US')}/-`;
  }
  if (
    row.discountType !== 'percent' &&
    row.fixedDiscountAmount &&
    row.fixedDiscountAmount > 0 &&
    discAmt > 0 &&
    discPct < 100
  ) {
    return `${discAmt.toLocaleString('en-US')}/-`;
  }
  return `${discPct}%`;
}

export const QuotationPrintView: React.FC<QuotationPrintViewProps> = ({ quotation, onBack }) => {
  // Automatically open browser print dialog safely once view is rendered
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Auto print trigger failed:', err);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const snap = quotation.packageComparison;

  // Determine which pages to render (Outdoor only, Indoor only, or Both in 2 pages)
  const roomServices = (quotation.indoorServices || []).filter(
    (s) => s.id !== 'food-charge-3x' && !s.roomType.toLowerCase().includes('food charge')
  );
  const foodService = (quotation.indoorServices || []).find(
    (s) => s.id === 'food-charge-3x' || s.roomType.toLowerCase().includes('food charge')
  );

  let showOutdoor = false;
  let showIndoor = false;

  if (quotation.patientTreatmentMode === 'both') {
    showOutdoor = true;
    showIndoor = true;
  } else if (quotation.patientTreatmentMode === 'outdoor') {
    showOutdoor = true;
    showIndoor = false;
  } else if (quotation.patientTreatmentMode === 'indoor') {
    showOutdoor = false;
    showIndoor = true;
  } else if (snap && (snap.showOutdoor !== undefined || snap.showIndoor !== undefined)) {
    showOutdoor = Boolean(snap.showOutdoor);
    showIndoor = Boolean(snap.showIndoor);
  } else {
    showIndoor = roomServices.length > 0 || Boolean(foodService);
    showOutdoor = !showIndoor;
  }

  if (!showOutdoor && !showIndoor) {
    showOutdoor = true;
  }

  const advanceCourseDays = Math.max(
    1,
    Number(quotation.advanceCourseDays ?? snap?.advanceCourseDays ?? 10) || 10
  );

  const patientAddress =
    quotation.patientAddress ||
    snap?.patientAddress ||
    '';

  // Resolve Outdoor & Indoor Daily Treatments (always 1-day view)
  const baseTreatments: IndividualTreatment[] = quotation.treatments || [];
  const outdoorTreatments: IndividualTreatment[] =
    snap?.outdoorTreatments && snap.outdoorTreatments.length > 0
      ? snap.outdoorTreatments
      : baseTreatments.map((t) => {
          const unitCost = Number(t.unitCost) || 0;
          const qty = Number(t.sessions) || 1;
          const gross = unitCost * qty;
          if (t.discountType === 'fixed') {
            const discAmt = Math.min(gross, Math.round(Number(t.discountAmount) || 0));
            return {
              ...t,
              sessions: qty,
              discountType: 'fixed',
              discountPercent: gross > 0 ? Math.round((discAmt / gross) * 100) : 0,
              discountAmount: discAmt,
              totalCost: Math.max(0, gross - discAmt)
            };
          }
          const discPct =
            t.outdoorDiscountPercent !== undefined
              ? Number(t.outdoorDiscountPercent)
              : Number(quotation.outdoorDiscountPercent ?? snap?.outdoorDiscountPercent ?? t.discountPercent ?? 0);
          const discAmt = Math.round((gross * discPct) / 100);
          return {
            ...t,
            sessions: qty,
            discountPercent: discPct,
            discountAmount: discAmt,
            totalCost: Math.max(0, gross - discAmt)
          };
        });

  const indoorTreatments: IndividualTreatment[] =
    snap?.indoorTreatments && snap.indoorTreatments.length > 0
      ? snap.indoorTreatments
      : baseTreatments.map((t) => {
          const unitCost = Number(t.unitCost) || 0;
          const qty = Number(t.sessions) || 1;
          const gross = unitCost * qty;
          if (t.discountType === 'fixed') {
            const discAmt = Math.min(gross, Math.round(Number(t.discountAmount) || 0));
            return {
              ...t,
              sessions: qty,
              discountType: 'fixed',
              discountPercent: gross > 0 ? Math.round((discAmt / gross) * 100) : 0,
              discountAmount: discAmt,
              totalCost: Math.max(0, gross - discAmt)
            };
          }
          const discPct = t.isIndoorFree
            ? 100
            : Number(
                quotation.patientTreatmentMode === 'indoor'
                  ? t.discountPercent
                  : quotation.indoorDiscountPercent ?? snap?.indoorDiscountPercent ?? t.discountPercent ?? 0
              );
          const discAmt = Math.round((gross * discPct) / 100);
          return {
            ...t,
            sessions: qty,
            discountPercent: discPct,
            discountAmount: discAmt,
            totalCost: Math.max(0, gross - discAmt)
          };
        });

  // Resolve Outdoor & Indoor Weekly / Additional Treatments
  const baseAdditional: AdditionalTreatment[] = quotation.additionalTreatments || [];
  const outdoorAdditionalTreatments: AdditionalTreatment[] =
    snap?.outdoorAdditionalTreatments && snap.outdoorAdditionalTreatments.length > 0
      ? snap.outdoorAdditionalTreatments
      : baseAdditional.map((a) => {
          const unitCost = Number(a.unitCost) || 0;
          const qty = Number(a.sessions) || 1;
          const gross = unitCost * qty;
          if (a.discountType === 'fixed') {
            const discAmt = Math.min(gross, Math.round(Number(a.discountAmount) || 0));
            return {
              ...a,
              sessions: qty,
              discountType: 'fixed',
              discountPercent: gross > 0 ? Math.round((discAmt / gross) * 100) : 0,
              discountAmount: discAmt,
              totalCost: Math.max(0, gross - discAmt)
            };
          }
          const discPct =
            a.outdoorDiscountPercent !== undefined
              ? Number(a.outdoorDiscountPercent)
              : Number(a.discountPercent ?? 0);
          const discAmt = Math.round((gross * discPct) / 100);
          return {
            ...a,
            sessions: qty,
            discountPercent: discPct,
            discountAmount: discAmt,
            totalCost: Math.max(0, gross - discAmt)
          };
        });

  const indoorAdditionalTreatments: AdditionalTreatment[] =
    snap?.indoorAdditionalTreatments && snap.indoorAdditionalTreatments.length > 0
      ? snap.indoorAdditionalTreatments
      : baseAdditional.map((a) => {
          const unitCost = Number(a.unitCost) || 0;
          const qty = Number(a.sessions) || 1;
          const gross = unitCost * qty;
          const isOzone = a.treatmentName.toLowerCase().includes('ozon');
          const isFree = Boolean(a.isIndoorFree) || isOzone;
          if (isFree) {
            return {
              ...a,
              sessions: qty,
              discountType: 'percent',
              discountPercent: 100,
              discountAmount: gross,
              totalCost: 0
            };
          }
          if (a.discountType === 'fixed') {
            const discAmt = Math.min(gross, Math.round(Number(a.discountAmount) || 0));
            return {
              ...a,
              sessions: qty,
              discountType: 'fixed',
              discountPercent: gross > 0 ? Math.round((discAmt / gross) * 100) : 0,
              discountAmount: discAmt,
              totalCost: Math.max(0, gross - discAmt)
            };
          }
          const discPct = Number(a.discountPercent ?? 0);
          const discAmt = Math.round((gross * discPct) / 100);
          return {
            ...a,
            sessions: qty,
            discountPercent: discPct,
            discountAmount: discAmt,
            totalCost: Math.max(0, gross - discAmt)
          };
        });

  // Food charge & admission fee (1-day indoor)
  const foodChargeSelected =
    snap?.foodChargeSelected !== undefined
      ? Boolean(snap.foodChargeSelected)
      : Boolean(foodService && (foodService.dailyRate > 0 || foodService.totalAmount > 0));
  const foodChargePerDay = Number(
    snap?.foodChargePerDay ?? foodService?.dailyRate ?? 0
  );

  const includeAdmissionFee =
    snap?.includeAdmissionFee !== undefined
      ? Boolean(snap.includeAdmissionFee)
      : Number(quotation.admissionFee || 0) > 0;
  const admissionFeeAmount = Number(
    snap?.admissionFee ?? quotation.admissionFee ?? 0
  );

  const formattedDate = formatDisplayDate(quotation.createdDate);
  const formattedAge = formatAgeDisplay(quotation.patientAge);

  const renderPage = (
    pageMode: 'outdoor' | 'indoor',
    addPageBreakAfter: boolean
  ) => {
    const isIndoorPage = pageMode === 'indoor';
    const dailyRows = isIndoorPage ? indoorTreatments : outdoorTreatments;
    const weeklyRows = isIndoorPage ? indoorAdditionalTreatments : outdoorAdditionalTreatments;

    const dailyTotal = dailyRows.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
    const weeklyTotal = weeklyRows.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
    const roomDailyTotal = roomServices.reduce((sum, r) => sum + (Number(r.dailyRate) || 0), 0);
    const activeFoodAmount = isIndoorPage && foodChargeSelected && foodChargePerDay > 0 ? foodChargePerDay : 0;
    const accommodationTableTotal = roomDailyTotal + activeFoodAmount;
    const hasAccommodationRows = isIndoorPage && (roomServices.length > 0 || activeFoodAmount > 0);

    return (
      <div
        key={pageMode}
        className={`bg-white text-black mx-auto w-full max-w-[210mm] px-8 py-6 sm:px-10 sm:py-7 shadow-xl border border-slate-200 rounded-xl print:max-w-none print:w-full print:rounded-none print:shadow-none print:border-none print:px-0 print:py-0 ${
          addPageBreakAfter ? 'print-page-break mb-8 print:mb-0' : ''
        }`}
      >
        <div>
          {/* Top Hospital Letterhead */}
          <div className="grid grid-cols-[120px_1fr_120px] sm:grid-cols-[145px_1fr_145px] items-center gap-2 pb-2.5 border-b border-slate-500">
            <div className="flex items-center justify-start">
              <img
                src={HEADER_LOGO_URL}
                alt="SUO XI Hospital Logo"
                referrerPolicy="no-referrer"
                className="h-14 sm:h-16 w-auto object-contain shrink-0"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.fallback) {
                    img.dataset.fallback = '1';
                    img.src = '/api/logo';
                  }
                }}
              />
            </div>
            <div className="text-center">
              <h1 className="text-[21px] sm:text-[23px] font-black text-black tracking-tight leading-tight whitespace-nowrap">
                SUO XI Hospital (Acupuncture)
              </h1>
              <p className="text-[11.5px] font-medium text-black leading-snug mt-0.5">
                Phone: +8809613 100 600, www.suoxihospital.com
              </p>
              <p className="text-[11.5px] font-medium text-black leading-snug">
                24/1 Chamelibagh, Shantinagar, Dhaka 1217
              </p>
            </div>
            <div aria-hidden="true" />
          </div>

          {/* Patient Metadata Grid */}
          <div className="py-2.5 border-b border-slate-500 text-[12px] text-black space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <span className="font-normal">Name: </span>
                <span className="font-semibold">{quotation.patientName || '-'}</span>
              </div>
              <div>
                <span className="font-normal">Age: </span>
                <span className="font-semibold">{formattedAge}</span>
              </div>
              <div>
                <span className="font-normal">Sex: </span>
                <span className="font-semibold">{quotation.patientGender || '-'}</span>
              </div>
              <div>
                <span className="font-normal">Mobile: </span>
                <span className="font-semibold">{quotation.patientPhone || '-'}</span>
              </div>
              <div>
                <span className="font-normal">Date: </span>
                <span className="font-semibold">{formattedDate}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <div className="flex-1 min-w-[220px]">
                <span className="font-normal">Address: </span>
                <span className="font-semibold">{patientAddress || '-'}</span>
              </div>
              <div>
                <span className="font-normal">Consulting Doctor: </span>
                <span className="font-semibold">{quotation.doctorName || '-'}</span>
              </div>
            </div>
          </div>

          {/* Centered Mode Pill Heading */}
          <div className="flex justify-center mt-2.5 mb-3">
            <div className="border border-slate-700 rounded-[8px] px-7 py-1 text-[13.5px] font-bold text-black bg-white shadow-[0_0_0_0.2px_#334155]">
              {isIndoorPage ? 'Indoor Treatment Cost' : 'Outdoor Treatment Cost'}
            </div>
          </div>

          {/* Table 1: Daily Treatments */}
          <div className="mb-4">
            <table className="w-full border-collapse border border-slate-700 text-[12.5px] text-black">
              <thead>
                <tr className="bg-[#b3f5d1]">
                  <th className="border border-slate-700 py-2 px-3 text-center font-bold w-[42%]">Treatment</th>
                  <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Price</th>
                  <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Quantity</th>
                  <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Discount</th>
                  <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[16%]">Net Price</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border border-slate-700 py-4 px-3 text-center text-slate-500">
                      No daily treatments selected
                    </td>
                  </tr>
                ) : (
                  dailyRows.map((tr, idx) => (
                    <tr key={tr.id || idx}>
                      <td className="border border-slate-700 py-2 px-3 text-left font-normal">
                        {tr.treatmentName}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(tr.unitCost)}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {tr.sessions || 1}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatDiscountCell(tr)}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(tr.totalCost)}
                      </td>
                    </tr>
                  ))
                )}
                <tr>
                  <td colSpan={4} className="border border-slate-700 py-2 px-4 text-right font-bold">
                    <span className="mr-12">Total Amount</span>
                  </td>
                  <td className="border border-slate-700 py-2 px-2.5 text-center font-bold tabular-nums">
                    {formatTotalCell(dailyTotal, dailyRows.length > 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Table 2: Weekly / Special Treatments */}
          {weeklyRows.length > 0 && (
            <div className="mb-4">
              <table className="w-full border-collapse border border-slate-700 text-[12.5px] text-black">
                <thead>
                  <tr className="bg-[#b3f5d1]">
                    <th className="border border-slate-700 py-2 px-3 text-center font-bold w-[42%]">Treatment</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Price</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Quantity</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Discount</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[16%]">Net Price</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRows.map((tr, idx) => {
                    const isLongName = tr.treatmentName.length > 32 || tr.treatmentName.includes('\n');
                    return (
                      <tr key={tr.id || idx}>
                        <td
                          className={`border border-slate-700 py-2 px-3 font-normal leading-snug ${
                            isLongName ? 'text-left' : 'text-center'
                          }`}
                        >
                          {tr.treatmentName}
                        </td>
                        <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                          {formatMoneyCell(tr.unitCost)}
                        </td>
                        <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                          {tr.sessions || 1}
                        </td>
                        <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                          {formatDiscountCell(tr)}
                        </td>
                        <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                          {formatMoneyCell(tr.totalCost)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={4} className="border border-slate-700 py-2 px-4 text-right font-bold">
                      <span className="mr-12">Total Amount</span>
                    </td>
                    <td className="border border-slate-700 py-2 px-2.5 text-center font-bold tabular-nums">
                      {formatTotalCell(weeklyTotal, weeklyRows.length > 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Table 3: Indoor Room / Cabin & Food (Indoor Page Only) */}
          {hasAccommodationRows && (
            <div className="mb-3">
              <table className="w-full border-collapse border border-slate-700 text-[12.5px] text-black">
                <thead>
                  <tr className="bg-[#b3f5d1]">
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[20%]">Type</th>
                    <th className="border border-slate-700 py-2 px-3 text-center font-bold w-[36%]">Details</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Price</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[14%]">Day</th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center font-bold w-[16%]">Net Price</th>
                  </tr>
                </thead>
                <tbody>
                  {roomServices.map((room, idx) => (
                    <tr key={room.id || idx}>
                      <td className="border border-slate-700 py-2 px-2.5 text-center font-normal">
                        {room.roomType}
                      </td>
                      <td className="border border-slate-700 py-2 px-3 text-center text-[11px] leading-snug">
                        {room.remarks || '-'}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(room.dailyRate)}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        1
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(room.dailyRate)}
                      </td>
                    </tr>
                  ))}
                  {activeFoodAmount > 0 && (
                    <tr>
                      <td className="border border-slate-700 py-2 px-2.5 text-center font-normal">
                        Food
                      </td>
                      <td className="border border-slate-700 py-2 px-3 text-center text-[11px] leading-snug">
                        Breakfast, Lunch, Dinner
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(activeFoodAmount)}
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        1
                      </td>
                      <td className="border border-slate-700 py-2 px-2.5 text-center tabular-nums">
                        {formatMoneyCell(activeFoodAmount)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={4} className="border border-slate-700 py-2 px-4 text-right font-bold">
                      <span className="mr-12">Total Amount</span>
                    </td>
                    <td className="border border-slate-700 py-2 px-2.5 text-center font-bold tabular-nums">
                      {formatMoneyCell(accommodationTableTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Indoor Admission Fee Line (Asterisk format) */}
          {isIndoorPage && includeAdmissionFee && admissionFeeAmount > 0 && (
            <div className="font-bengali text-[14px] leading-relaxed text-black mt-2.5 mb-2">
              * ভর্তি ফি (Admission Fee) {toBengaliDigits(admissionFeeAmount)}/- টাকা।
            </div>
          )}

          {/* বিশেষ দ্রষ্টব্যঃ 2-Bullet Section */}
          <div className="font-bengali text-[14px] leading-relaxed text-black mt-4">
            <div className="font-medium mb-1">বিশেষ দ্রষ্টব্যঃ</div>
            <ul className="list-disc pl-6 space-y-0.5">
              <li>উপরে উল্লেখিত মূল্য ১ (এক) দিনের চিকিৎসার খরচ।</li>
              <li>
                ন্যূনতম {toBengaliDigits(advanceCourseDays)} দিনের চিকিৎসার সম্পূর্ণ অর্থ অগ্রিম পরিশোধ সাপেক্ষে চিকিৎসা শুরু করতে হবে।
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Boxed Bengali Reminder + Architects Daughter Footer Credit */}
        <div className="pt-6 pb-1 flex flex-col items-center gap-2.5 break-inside-avoid">
          <div className="font-bengali border border-slate-700 rounded-[10px] px-7 py-2.5 text-center text-[14.5px] text-black bg-white">
            প্রেসক্রিপশনে উল্লেখিত চিকিৎসার নির্ধারিত মেয়াদ সম্পূর্ণভাবে সম্পন্ন করার জন্য বলা হলো।
          </div>
          <div className="font-architects text-center text-[11px] text-black tracking-wide">
            Developed &amp; Designed By SUOXI IT
          </div>
        </div>
      </div>
    );
  };

  const totalPages = (showOutdoor ? 1 : 0) + (showIndoor ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Top Action Bar (Sticky & Matched to Invoice Width, Hidden on Print) */}
      <div
        className="sticky z-30 max-w-[210mm] w-full mx-auto print:hidden"
        style={{ top: 'calc(var(--navbar-height, 116px) + 8px)' }}
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-3.5 sm:p-4 shadow-md border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-xs px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold">
              <FileText className="w-3.5 h-3.5 text-emerald-700" />
              <span>
                {totalPages === 2
                  ? '2 Pages in 1 PDF (Page 1: Outdoor, Page 2: Indoor)'
                  : showIndoor
                  ? '1 Page PDF (Indoor Treatment Cost)'
                  : '1 Page PDF (Outdoor Treatment Cost)'}
              </span>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Printable A4 Sheet(s) */}
      <div>
        {showOutdoor && renderPage('outdoor', showIndoor)}
        {showIndoor && renderPage('indoor', false)}
      </div>
    </div>
  );
};
