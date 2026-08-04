import React from 'react';
import { Printer, ArrowLeft, Building2, Phone, Mail, Globe, MapPin } from 'lucide-react';
import { InvoiceQuotation } from '../types';
import { SuoxiLogo } from './SuoxiLogo';

interface QuotationPrintViewProps {
  quotation: InvoiceQuotation;
  onBack: () => void;
}

export const QuotationPrintView: React.FC<QuotationPrintViewProps> = ({ quotation, onBack }) => {
  const handlePrint = () => {
    window.print();
  };

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
                    <td className="p-2.5 font-semibold text-slate-900">{tr.treatmentName}</td>
                    <td className="p-2.5 text-center">BDT {tr.unitCost.toLocaleString()}</td>
                    <td className="p-2.5 text-center font-bold">{tr.sessions}</td>
                    <td className="p-2.5 text-center text-amber-700">{tr.discountPercent}%</td>
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
                      <div>{pkg.packageName}</div>
                      {pkg.description && <div className="text-[11px] text-slate-500 font-normal">{pkg.description}</div>}
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
                      <div>{ind.roomType}</div>
                      {ind.remarks && <div className="text-[11px] text-slate-500 font-normal">{ind.remarks}</div>}
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

          {/* Totals Table */}
          <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl shadow border border-slate-800 text-xs space-y-2">
            {((quotation.admissionFee ?? quotation.consultationFee ?? 0) > 0) && (
              <div className="flex justify-between text-emerald-300">
                <span>Admission Fee (One Time):</span>
                <span className="font-semibold">BDT {((quotation.admissionFee ?? quotation.consultationFee ?? 0)).toLocaleString()}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-300">
              <span>Gross Total:</span>
              <span className="font-bold text-white">BDT {quotation.grossTotal.toLocaleString()}</span>
            </div>

            {quotation.overallDiscountAmount > 0 && (
              <div className="flex justify-between text-amber-300">
                <span>Overall Discount ({quotation.overallDiscountPercent}%):</span>
                <span>-BDT {quotation.overallDiscountAmount.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-between font-black text-sm text-white">
              <span>Grand Total:</span>
              <span className="text-emerald-400 text-base">BDT {quotation.grandTotal.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-emerald-300">
              <span>Advance Paid:</span>
              <span>BDT {quotation.advancePaid.toLocaleString()}</span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between font-black text-sm text-rose-300">
              <span>Due Balance:</span>
              <span>BDT {quotation.dueAmount.toLocaleString()}</span>
            </div>
          </div>

        </div>

        {/* Signature Area */}
        <div className="grid grid-cols-2 gap-8 pt-12 mt-12 border-t border-dashed border-slate-300 text-xs text-center font-bold">
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
          <p className="text-emerald-700 font-bold text-[10px]">Developed & Designed By SUOXI IT Department</p>
        </div>

      </div>

    </div>
  );
};
