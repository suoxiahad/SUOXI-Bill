import React, { useState } from 'react';
import { Printer, ArrowLeft, Building2, Phone, Mail, Globe, MapPin, Copy, Check } from 'lucide-react';
import { InvoiceQuotation } from '../types';
import { SuoxiLogo } from './SuoxiLogo';

interface QuotationPrintViewProps {
  quotation: InvoiceQuotation;
  onBack: () => void;
}

export const QuotationPrintView: React.FC<QuotationPrintViewProps> = ({ quotation, onBack }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1800);
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      console.error('Fallback copy failed', e);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate breakdown items for the Billing Summary
  const treatmentsGrossSubtotal = (quotation.treatments && quotation.treatments.length > 0)
    ? quotation.treatments.reduce((sum, tr) => sum + ((tr.unitCost || 0) * (tr.sessions || 1)), 0)
    : (quotation.outdoorPackages || []).reduce((sum, pkg) => sum + (pkg.totalBaseCost || 0), 0);

  const treatmentsTotalDiscount = (quotation.treatments && quotation.treatments.length > 0)
    ? quotation.treatments.reduce((sum, tr) => sum + (tr.discountAmount || 0), 0)
    : (quotation.outdoorPackages || []).reduce((sum, pkg) => sum + (pkg.discountAmount || 0), 0);

  const treatmentsSubtotal = quotation.treatmentsSubtotal || (treatmentsGrossSubtotal - treatmentsTotalDiscount);

  const roomServices = (quotation.indoorServices || [])
    .filter(s => s.id !== 'food-charge-3x' && s.roomType !== 'Food Charge 3 Times');

  const indoorRoomOnlySubtotal = roomServices
    .reduce((sum, s) => sum + (s.totalAmount || 0), 0);

  const foodChargeTotal = (quotation.indoorServices || [])
    .filter(s => s.id === 'food-charge-3x' || s.roomType === 'Food Charge 3 Times')
    .reduce((sum, s) => sum + (s.totalAmount || 0), 0);

  const actualAdmissionFee = quotation.admissionFee ?? quotation.consultationFee ?? 0;
  const overallDiscountAmount = quotation.overallDiscountAmount || 0;

  const mode = quotation.patientTreatmentMode || 
    (quotation.outdoorPackages && quotation.outdoorPackages.length > 0 ? 'outdoor' : 
     quotation.indoorServices && quotation.indoorServices.some(s => s.id !== 'food-charge-3x' && s.roomType !== 'Food Charge 3 Times') ? 'indoor' : 'individual');

  return (
    <div className="space-y-6">
      
      {/* Top Action Bar (Hidden on Print) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between print:hidden">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-xs px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500 hidden sm:block">
            Click print button below or press Ctrl + P to print invoice
          </p>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Document Sheet */}
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-4xl mx-auto border border-slate-200 text-slate-800 print:shadow-none print:border-none print:p-0 font-sans">
        
        {/* Hospital Header / Letterhead */}
        <div className="border-b-2 border-emerald-800 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Logo & Hospital Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 text-center sm:text-left">
              <SuoxiLogo size="lg" />
              <div className="sm:border-l sm:border-slate-300 sm:pl-4 pt-1 sm:pt-0 space-y-1">
                <h3 className="text-sm font-extrabold text-emerald-950 flex items-center justify-center sm:justify-start">
                  SUO XI Hospital (Acupuncture)
                </h3>
                <p className="text-xs text-slate-700 font-bold flex items-center justify-center sm:justify-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Shaan Tower, 24/1, Chamelibagh, Shantinagar, Dhaka 1217</span>
                </p>
                <p className="text-xs text-slate-700 font-bold flex items-center justify-center sm:justify-start gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>+88 09613 100 600</span>
                </p>
              </div>
            </div>

            {/* Quotation Badge */}
            <div className="text-center sm:text-right bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block flex items-center justify-center sm:justify-end gap-1.5">
                <span>INVOICE QUOTATION</span>
                {quotation.visitLabel && (
                  <span className="bg-emerald-700 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {quotation.visitLabel}
                  </span>
                )}
              </span>
              <p className="text-lg font-black text-emerald-900 mt-0.5">
                {quotation.quotationNumber}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Date: <span className="font-semibold text-slate-700">{quotation.createdDate}</span>
              </p>
            </div>

          </div>
        </div>

        {/* Patient & Doctor Information Box */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-xs sm:text-sm">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase">Patient Name</p>
            <p className="font-bold text-slate-900 text-base">{quotation.patientName}</p>
            {quotation.patientAge && <p className="text-slate-600">Age: {quotation.patientAge} Yrs</p>}
          </div>

          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase">Mobile Number</p>
            <p className="font-bold text-slate-900 text-base">{quotation.patientPhone}</p>
            {quotation.patientGender && <p className="text-slate-600">Gender: {quotation.patientGender}</p>}
          </div>

          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase">Chief Consultant</p>
            <p className="font-bold text-emerald-900">Dr. S.M. Shahidul Islam PhD.</p>
            <p className="text-slate-500 text-[11px] font-semibold uppercase mt-1">Consulting Doctor</p>
            <p className="font-bold text-slate-900">{quotation.doctorName || 'Senior Consultant'}</p>
          </div>

          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase">Validity & Status</p>
            <p className="font-bold text-emerald-800">{quotation.validUntil}</p>
            <p className="text-slate-500 text-xs font-semibold">Status: {quotation.paymentStatus}</p>
          </div>
        </div>

        {/* TABLE 1: Individual Treatments */}
        {quotation.treatments && quotation.treatments.length > 0 && (
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider border-b border-emerald-800 pb-1">
              1. Individual Treatments & Therapies
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-900 text-white font-bold">
                  <th className="p-2.5">Treatment Name</th>
                  <th className="p-2.5 text-center">Unit Price</th>
                  <th className="p-2.5 text-center">Sessions</th>
                  <th className="p-2.5 text-center">Discount (%)</th>
                  <th className="p-2.5 text-center">Discount (BDT)</th>
                  <th className="p-2.5 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {quotation.treatments.map((tr, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <span>{tr.treatmentName}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(tr.treatmentName, `tr-${i}`)}
                          title="Copy treatment name"
                          className="print:hidden inline-flex items-center gap-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 p-1 rounded-md transition-all cursor-pointer shrink-0"
                        >
                          {copiedKey === `tr-${i}` ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3 text-emerald-700" />
                              <span>Copied</span>
                            </span>
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-700" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">BDT {tr.unitCost.toLocaleString()}</td>
                    <td className="p-2.5 text-center font-bold">{tr.sessions}</td>
                    <td className="p-2.5 text-center font-bold text-amber-800">
                      {tr.discountPercent === 100 ? '100% (Free)' : `${tr.discountPercent}%`}
                    </td>
                    <td className="p-2.5 text-center text-rose-600">-BDT {(tr.discountAmount || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-right font-bold text-emerald-900">BDT {(tr.totalCost || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 2: Outdoor Service Packages */}
        {quotation.outdoorPackages && quotation.outdoorPackages.length > 0 && (
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-extrabold text-teal-900 uppercase tracking-wider border-b border-teal-800 pb-1">
              2. Outdoor Packages
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-teal-900 text-white font-bold">
                  <th className="p-2.5">Package Details</th>
                  <th className="p-2.5 text-center">Base Price</th>
                  <th className="p-2.5 text-center">Discount (%)</th>
                  <th className="p-2.5 text-center">Discount (BDT)</th>
                  <th className="p-2.5 text-right">Net Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {quotation.outdoorPackages.map((pkg, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div>{pkg.packageName}</div>
                          {pkg.description && <div className="text-[11px] text-slate-500 font-normal">{pkg.description}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(pkg.packageName, `pkg-${i}`)}
                          title="Copy package name"
                          className="print:hidden inline-flex items-center gap-1 text-slate-400 hover:text-teal-700 hover:bg-teal-50 p-1 rounded-md transition-all cursor-pointer shrink-0"
                        >
                          {copiedKey === `pkg-${i}` ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3 text-teal-700" />
                              <span>Copied</span>
                            </span>
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-teal-700" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">BDT {pkg.totalBaseCost.toLocaleString()}</td>
                    <td className="p-2.5 text-center text-amber-700 font-bold">{pkg.discountPercent}%</td>
                    <td className="p-2.5 text-center text-rose-600">-BDT {(pkg.discountAmount || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-right font-bold text-teal-900">BDT {(pkg.netCost || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 3: Indoor Accommodation Services */}
        {quotation.indoorServices && quotation.indoorServices.length > 0 && (
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider border-b border-indigo-800 pb-1">
              3. Indoor Room & Accommodation
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-indigo-900 text-white font-bold">
                  <th className="p-2.5">Cabin / Ward Category</th>
                  <th className="p-2.5 text-center">Daily Rate</th>
                  <th className="p-2.5 text-center">Days</th>
                  <th className="p-2.5 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {quotation.indoorServices.map((ind, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div>{ind.roomType}</div>
                          {ind.remarks && <div className="text-[11px] text-slate-500 font-normal">{ind.remarks}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(ind.roomType, `ind-${i}`)}
                          title="Copy room name"
                          className="print:hidden inline-flex items-center gap-1 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 p-1 rounded-md transition-all cursor-pointer shrink-0"
                        >
                          {copiedKey === `ind-${i}` ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3 text-indigo-700" />
                              <span>Copied</span>
                            </span>
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-700" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">BDT {ind.dailyRate.toLocaleString()}</td>
                    <td className="p-2.5 text-center font-bold">{ind.days} Days</td>
                    <td className="p-2.5 text-right font-bold text-indigo-900">BDT {(ind.totalAmount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 4: Additional Treatments */}
        {quotation.additionalTreatments && quotation.additionalTreatments.length > 0 && (
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-extrabold text-sky-900 uppercase tracking-wider border-b border-sky-800 pb-1">
              4. Additional Treatments
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-sky-900 text-white font-bold">
                  <th className="p-2.5">Treatment / Therapy Name</th>
                  <th className="p-2.5 text-center">Unit Cost</th>
                  <th className="p-2.5 text-center">Sessions</th>
                  <th className="p-2.5 text-center">Discount (%)</th>
                  <th className="p-2.5 text-center">Discount (BDT)</th>
                  <th className="p-2.5 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {quotation.additionalTreatments.map((tr, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div>{tr.treatmentName}</div>
                          {tr.description && <div className="text-[11px] text-slate-500 font-normal">{tr.description}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(tr.treatmentName, `add-${i}`)}
                          title="Copy treatment name"
                          className="print:hidden inline-flex items-center gap-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 p-1 rounded-md transition-all cursor-pointer shrink-0"
                        >
                          {copiedKey === `add-${i}` ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3 text-sky-700" />
                              <span>Copied</span>
                            </span>
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-sky-700" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">BDT {tr.unitCost.toLocaleString()}</td>
                    <td className="p-2.5 text-center font-bold">{tr.sessions}</td>
                    <td className="p-2.5 text-center font-bold text-amber-800">{tr.discountPercent}%</td>
                    <td className="p-2.5 text-center text-rose-600">-BDT {(tr.discountAmount || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-right font-bold text-sky-900">BDT {(tr.totalCost || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Calculation Summary Table */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6 mb-8 pt-2">
          
          {/* Terms & Conditions */}
          <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <p className="font-bold text-slate-800 uppercase text-[11px]">Terms & Conditions:</p>
            <p className="text-slate-600 leading-relaxed">
              {quotation.notes || 'This quotation is valid for 7 days from issue date. All treatments are prescribed as per consulting physician assessment.'}
            </p>
            <div className="pt-2 text-[11px] text-slate-500 space-y-0.5">
              <p>• Regular attendance for acupuncture sessions is strongly advised.</p>
              <p>• All financial transactions must be completed strictly at the billing counter.</p>
            </div>
          </div>

          {/* Billing Summary Box */}
          <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl shadow border border-slate-800 text-xs space-y-3">
            
            {/* Treatments Subtotal Section */}
            <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/80 space-y-2">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-700 pb-1.5 flex items-center justify-between">
                <span>
                  {mode === 'outdoor' 
                    ? 'Treatments Subtotal - Outdoor Packages' 
                    : mode === 'indoor'
                    ? 'Treatments Subtotal - Indoor'
                    : 'Treatments Subtotal'}
                </span>
              </div>

              <div className="space-y-1 text-slate-300 text-[11px]">
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
                  <span className="font-extrabold text-emerald-400">BDT {treatmentsSubtotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Additional Services */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800 text-[11px]">
              {roomServices.length > 0 ? (
                <div className="space-y-1 bg-slate-800/80 p-2 rounded-xl border border-slate-700/80">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-300">
                    <span>Indoor Rooms ({roomServices.length}):</span>
                    <span className="text-indigo-200">BDT {indoorRoomOnlySubtotal.toLocaleString()}</span>
                  </div>
                  <div className="space-y-0.5 pt-1 border-t border-slate-700/60">
                    {roomServices.map((room, rIdx) => (
                      <div key={room.id || rIdx} className="flex justify-between items-center text-[10px] text-slate-300">
                        <span className="truncate pr-1 text-slate-300" title={room.roomType}>• {room.roomType} ({room.days}d)</span>
                        <span className="font-bold text-white shrink-0">BDT {(room.totalAmount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center text-slate-300">
                  <span>Indoor Accommodation:</span>
                  <span className="font-bold text-slate-400">BDT 0</span>
                </div>
              )}

              {quotation.additionalTreatments && quotation.additionalTreatments.length > 0 && (
                <div className="flex justify-between items-center text-slate-300">
                  <span>Additional Treatments:</span>
                  <span className="font-bold text-white">BDT {(quotation.additionalTreatmentsSubtotal || 0).toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-300">
                <span>Food Charge:</span>
                <span className="font-bold text-white">BDT {foodChargeTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>Admission Fee:</span>
                <span className="font-bold text-white">BDT {actualAdmissionFee.toLocaleString()}</span>
              </div>
            </div>

            {/* Additional Special Discount */}
            {overallDiscountAmount > 0 && (
              <div className="pt-1.5 border-t border-slate-800 flex justify-between items-center text-[11px] text-amber-300 font-medium">
                <span>Additional Special Discount ({quotation.overallDiscountPercent || 0}%):</span>
                <span>-BDT {overallDiscountAmount.toLocaleString()}</span>
              </div>
            )}

            {/* Grand Total */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex justify-between items-end font-extrabold">
                <span className="text-[11px] text-slate-300 uppercase tracking-wider">Grand Total Bill:</span>
                <span className="text-xl text-emerald-400">
                  BDT {quotation.grandTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Advance Paid & Net Due */}
            <div className="p-2.5 bg-slate-800/80 rounded-xl space-y-1 text-[11px] font-semibold border border-slate-700/50">
              <div className="flex justify-between text-slate-300">
                <span>Advance Paid:</span>
                <span className="font-bold text-white">BDT {(quotation.advancePaid || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-300 font-bold">
                <span>Net Due Balance:</span>
                <span className="font-black text-rose-400 text-xs">BDT {(quotation.dueAmount || 0).toLocaleString()}</span>
              </div>
            </div>

          </div>

        </div>

        {/* PAYMENT CYCLE & SCHEDULE BREAKDOWN TABLE (FOR PATIENT COUNSELING) */}
        {quotation.paymentPhases && quotation.paymentPhases.length > 0 && (
          <div className="mt-6 bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>Payment Schedule & Counseling Breakdown</span>
              </h4>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 uppercase">
                {quotation.paymentPlanMode === '10_day_cycles' 
                  ? '10-Day Cycle Plan' 
                  : quotation.paymentPlanMode === '15_day_cycles'
                  ? '15-Day Cycle Plan'
                  : quotation.paymentPlanMode === 'full'
                  ? '1-Time Full Payment'
                  : 'Custom Installment Plan'}
              </span>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-200/80 text-slate-800 text-[10px] uppercase font-bold">
                  <th className="p-2 border border-slate-300">Cycle / Title</th>
                  <th className="p-2 border border-slate-300 text-center">% Share</th>
                  <th className="p-2 border border-slate-300 text-right">Payment Amount</th>
                  <th className="p-2 border border-slate-300">Counseling Notes / Remark</th>
                </tr>
              </thead>
              <tbody>
                {quotation.paymentPhases.map((phase, pIdx) => (
                  <tr key={phase.id || pIdx} className="bg-white hover:bg-slate-50 text-[11px]">
                    <td className="p-2 border border-slate-300 font-bold text-slate-900">
                      {phase.phaseName}
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-bold text-slate-700">
                      {phase.percentage || Math.round((phase.amount / (quotation.grandTotal || 1)) * 100)}%
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-black text-emerald-800">
                      BDT {(phase.amount || 0).toLocaleString()}
                    </td>
                    <td className="p-2 border border-slate-300 text-slate-600 font-medium">
                      {phase.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature Area */}
        <div className="grid grid-cols-2 gap-8 pt-12 mt-8 border-t border-dashed border-slate-300 text-xs text-center font-bold">
          <div>
            <div className="w-48 mx-auto border-t border-slate-800 mb-1" />
            <p className="text-slate-800">Patient / Guardian Signature</p>
          </div>

          <div>
            <div className="w-48 mx-auto border-t border-slate-800 mb-1" />
            <p className="text-slate-800">Authorized Billing Officer</p>
            <p className="text-[10px] text-slate-500 font-normal">SUO XI Hospital Billing Counter</p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3 space-y-0.5">
          <p>Computer generated invoice quotation • SUO XI Hospital Acupuncture Billing System</p>
          <p className="text-emerald-700 font-bold text-[10px]">Developed & Designed By SUOXI IT</p>
        </div>

      </div>

    </div>
  );
};
