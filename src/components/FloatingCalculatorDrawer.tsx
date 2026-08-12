import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  X, 
  Delete, 
  Copy, 
  Check, 
  Calendar, 
  Percent, 
  Building2, 
  Bed, 
  Utensils, 
  ChevronRight,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type CalcMode = 'standard' | 'package' | 'installment' | 'discount';

export const FloatingCalculatorDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<CalcMode>('standard');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // ----------------------------------------------------
  // 1. STANDARD CALCULATOR STATE & LOGIC
  // ----------------------------------------------------
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcEquation, setCalcEquation] = useState('');
  const [isNewInput, setIsNewInput] = useState(true);

  const handleNumClick = (val: string) => {
    if (isNewInput || calcDisplay === '0') {
      setCalcDisplay(val);
      setIsNewInput(false);
    } else {
      if (calcDisplay.length < 14) {
        setCalcDisplay(calcDisplay + val);
      }
    }
  };

  const handleDecimalClick = () => {
    if (isNewInput) {
      setCalcDisplay('0.');
      setIsNewInput(false);
    } else if (!calcDisplay.includes('.')) {
      setCalcDisplay(calcDisplay + '.');
    }
  };

  const handleOpClick = (op: string) => {
    setCalcEquation(`${calcDisplay} ${op} `);
    setIsNewInput(true);
  };

  const handleClear = () => {
    setCalcDisplay('0');
    setCalcEquation('');
    setIsNewInput(true);
  };

  const handleBackspace = () => {
    if (isNewInput) return;
    if (calcDisplay.length > 1) {
      setCalcDisplay(calcDisplay.slice(0, -1));
    } else {
      setCalcDisplay('0');
      setIsNewInput(true);
    }
  };

  const handleCalculateEqual = () => {
    if (!calcEquation) return;
    const fullExpr = calcEquation + calcDisplay;
    try {
      // Safe evaluation of basic math operations
      const sanitized = fullExpr
        ? fullExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
        : '0';
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      const formattedResult = Number.isFinite(result) ? String(Math.round(result * 100) / 100) : 'Error';
      setCalcEquation(`${fullExpr} =`);
      setCalcDisplay(formattedResult);
      setIsNewInput(true);
    } catch {
      setCalcDisplay('Error');
      setIsNewInput(true);
    }
  };

  const handlePercentageClick = () => {
    try {
      const val = parseFloat(calcDisplay);
      if (!isNaN(val)) {
        setCalcDisplay(String(val / 100));
      }
    } catch {
      setCalcDisplay('0');
    }
  };

  const handleToggleSign = () => {
    try {
      const val = parseFloat(calcDisplay);
      if (!isNaN(val)) {
        setCalcDisplay(String(-val));
      }
    } catch {
      setCalcDisplay('0');
    }
  };

  // ----------------------------------------------------
  // 2. PACKAGE & DAILY RATE CALCULATOR STATE
  // ----------------------------------------------------
  const [pkgTreatmentCost, setPkgTreatmentCost] = useState<number | ''>('');
  const [pkgDays, setPkgDays] = useState<number | ''>('');
  const [pkgDiscountPct, setPkgDiscountPct] = useState<number | ''>('');
  const [pkgRoomRate, setPkgRoomRate] = useState<number | ''>('');
  const [pkgFoodRate, setPkgFoodRate] = useState<number | ''>('');
  const [pkgAdmissionFee, setPkgAdmissionFee] = useState<number | ''>('');

  // Calculations for Package Mode
  const pkgGrossTreatment = (Number(pkgTreatmentCost) || 0) * (Number(pkgDays) || 0);
  const pkgDiscAmount = Math.round(pkgGrossTreatment * ((Number(pkgDiscountPct) || 0) / 100));
  const pkgNetTreatment = pkgGrossTreatment - pkgDiscAmount;
  const pkgTotalRoom = (Number(pkgRoomRate) || 0) * (Number(pkgDays) || 0);
  const pkgTotalFood = (Number(pkgFoodRate) || 0) * (Number(pkgDays) || 0);
  const pkgAdmission = Number(pkgAdmissionFee) || 0;

  const pkgRecurringTotal = pkgNetTreatment + pkgTotalRoom + pkgTotalFood;
  const pkgGrandTotal = pkgRecurringTotal + pkgAdmission;
  const pkgEffectiveRatePerDay = (Number(pkgDays) || 0) > 0 ? Math.round(pkgRecurringTotal / (Number(pkgDays) || 1)) : 0;

  // ----------------------------------------------------
  // 3. INSTALLMENT SPLITTER STATE
  // ----------------------------------------------------
  const [instTotalBill, setInstTotalBill] = useState<number | ''>('');
  const [instDiscountPct, setInstDiscountPct] = useState<number | ''>('');
  const [instDays, setInstDays] = useState<number | ''>('');
  const [instCyclesCount, setInstCyclesCount] = useState<number>(3);

  const instGross = Number(instTotalBill) || 0;
  const instDiscAmount = Math.round(instGross * ((Number(instDiscountPct) || 0) / 100));
  const instNet = instGross - instDiscAmount;

  const calculateInstallments = () => {
    const total = instNet;
    const grossTotal = instGross;
    const count = Math.max(1, instCyclesCount || 1);

    const netBase = Math.floor(total / count);
    const netRem = total - (netBase * count);

    const grossBase = Math.floor(grossTotal / count);
    const grossRem = grossTotal - (grossBase * count);

    const daysPerCycle = Math.ceil((Number(instDays) || 30) / count);

    const list = [];
    for (let i = 0; i < count; i++) {
      const amt = netBase + (i === 0 ? netRem : 0);
      const grossAmt = grossBase + (i === 0 ? grossRem : 0);
      const discAmt = grossAmt - amt;
      const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
      list.push({
        cycle: i + 1,
        title: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} Payment Cycle`,
        days: daysPerCycle,
        amount: amt,
        grossAmount: grossAmt,
        discountAmount: discAmt,
        percentage: pct
      });
    }
    return list;
  };

  const installmentsList = calculateInstallments();

  // ----------------------------------------------------
  // 4. QUICK DISCOUNT CALCULATOR STATE
  // ----------------------------------------------------
  const [discPrice, setDiscPrice] = useState<number | ''>('');
  const [discPct, setDiscPct] = useState<number | ''>('');

  const discAmt = Math.round((Number(discPrice) || 0) * ((Number(discPct) || 0) / 100));
  const discNetPayable = (Number(discPrice) || 0) - discAmt;

  // Copy Helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <>
      {/* FLOATING TRIGGER BUTTON ATTACHED TO RIGHT EDGE */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-gradient-to-l from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white pl-3 pr-2 py-3 rounded-l-2xl shadow-2xl border-l-2 border-t-2 border-b-2 border-emerald-300 flex flex-col items-center gap-1.5 cursor-pointer group transition-all print:hidden"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Open Hospital Calculator"
      >
        <div className="relative">
          <Calculator className="w-5 h-5 text-emerald-100 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 [writing-mode:vertical-lr] rotate-180">
          CALCULATOR
        </span>
      </motion.button>

      {/* SLIDE-OUT DRAWER PANEL */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for easy closing */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] z-40 sm:hidden print:hidden"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="fixed right-0 top-14 bottom-4 sm:top-16 sm:bottom-6 w-[360px] sm:w-[420px] max-w-[95vw] bg-white rounded-l-3xl shadow-2xl border-l-2 border-y-2 border-emerald-300 z-50 flex flex-col overflow-hidden font-sans print:hidden"
            >
              {/* DRAWER HEADER */}
              <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white p-3.5 sm:p-4 flex items-center justify-between border-b border-emerald-700/60 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-700/80 border border-emerald-500/50 flex items-center justify-center text-amber-300 shadow-inner">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                      <span>SUO XI Calculator</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    </h3>
                    <p className="text-[10px] text-emerald-200/90 font-medium">
                      Multi-Functional Hospital Calculator Tool
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-emerald-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Close Calculator"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* MODE SELECTOR TABS */}
              <div className="bg-slate-100 p-1.5 border-b border-slate-200 grid grid-cols-4 gap-1 text-[11px] font-bold">
                <button
                  onClick={() => setActiveMode('standard')}
                  className={`py-1.5 px-1 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all ${
                    activeMode === 'standard'
                      ? 'bg-emerald-600 text-white shadow-sm font-black'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Standard</span>
                </button>

                <button
                  onClick={() => setActiveMode('package')}
                  className={`py-1.5 px-1 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all ${
                    activeMode === 'package'
                      ? 'bg-emerald-600 text-white shadow-sm font-black'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Package</span>
                </button>

                <button
                  onClick={() => setActiveMode('installment')}
                  className={`py-1.5 px-1 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all ${
                    activeMode === 'installment'
                      ? 'bg-emerald-600 text-white shadow-sm font-black'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Installment</span>
                </button>

                <button
                  onClick={() => setActiveMode('discount')}
                  className={`py-1.5 px-1 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer transition-all ${
                    activeMode === 'discount'
                      ? 'bg-emerald-600 text-white shadow-sm font-black'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Discount %</span>
                </button>
              </div>

              {/* MODE CONTENT BODY */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 bg-slate-50">
                
                {/* 1. STANDARD CALCULATOR MODE */}
                {activeMode === 'standard' && (
                  <div className="space-y-3">
                    {/* Display Screen */}
                    <div className="bg-slate-900 rounded-2xl p-3.5 text-right border border-slate-800 shadow-inner space-y-1">
                      <div className="text-xs text-emerald-400/80 font-mono h-4 overflow-x-auto whitespace-nowrap">
                        {calcEquation || '\u00A0'}
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight overflow-x-auto whitespace-nowrap">
                        {calcDisplay}
                      </div>
                    </div>

                    {/* Keypad Buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={handleClear}
                        className="py-3 bg-rose-100 hover:bg-rose-200 text-rose-800 font-black rounded-xl text-sm transition-colors cursor-pointer"
                      >
                        AC
                      </button>
                      <button
                        onClick={handleBackspace}
                        className="py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Delete className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handlePercentageClick}
                        className="py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                      >
                        %
                      </button>
                      <button
                        onClick={() => handleOpClick('÷')}
                        className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
                      >
                        ÷
                      </button>

                      <button
                        onClick={() => handleNumClick('7')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        7
                      </button>
                      <button
                        onClick={() => handleNumClick('8')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        8
                      </button>
                      <button
                        onClick={() => handleNumClick('9')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        9
                      </button>
                      <button
                        onClick={() => handleOpClick('×')}
                        className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
                      >
                        ×
                      </button>

                      <button
                        onClick={() => handleNumClick('4')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        4
                      </button>
                      <button
                        onClick={() => handleNumClick('5')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        5
                      </button>
                      <button
                        onClick={() => handleNumClick('6')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        6
                      </button>
                      <button
                        onClick={() => handleOpClick('−')}
                        className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
                      >
                        −
                      </button>

                      <button
                        onClick={() => handleNumClick('1')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        1
                      </button>
                      <button
                        onClick={() => handleNumClick('2')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        2
                      </button>
                      <button
                        onClick={() => handleNumClick('3')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        3
                      </button>
                      <button
                        onClick={() => handleOpClick('+')}
                        className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
                      >
                        +
                      </button>

                      <button
                        onClick={handleToggleSign}
                        className="py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        ±
                      </button>
                      <button
                        onClick={() => handleNumClick('0')}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        0
                      </button>
                      <button
                        onClick={handleDecimalClick}
                        className="py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-base border border-slate-200 shadow-sm transition-colors cursor-pointer"
                      >
                        .
                      </button>
                      <button
                        onClick={handleCalculateEqual}
                        className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-lg shadow-md transition-colors cursor-pointer"
                      >
                        =
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-medium">Quick copy result:</span>
                      <button
                        onClick={() => copyToClipboard(calcDisplay)}
                        className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                      >
                        {copiedText === calcDisplay ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedText === calcDisplay ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. PACKAGE & DAILY RATE CALCULATOR MODE */}
                {activeMode === 'package' && (
                  <div className="space-y-3 text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-950 font-bold flex items-center justify-between">
                      <span>🏥 Package Cost Calculator</span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-black">
                        Day & Cost Model
                      </span>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Treatment Per Day (BDT)</label>
                        <input
                          type="number"
                          value={pkgTreatmentCost === 0 || pkgTreatmentCost === '' ? '' : pkgTreatmentCost}
                          onChange={(e) => setPkgTreatmentCost(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Duration (Days)</label>
                        <input
                          type="number"
                          value={pkgDays === 0 || pkgDays === '' ? '' : pkgDays}
                          onChange={(e) => setPkgDays(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Discount (%)</label>
                        <input
                          type="number"
                          value={pkgDiscountPct === 0 || pkgDiscountPct === '' ? '' : pkgDiscountPct}
                          onChange={(e) => setPkgDiscountPct(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0%"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Room Rent / Day (BDT)</label>
                        <input
                          type="number"
                          value={pkgRoomRate === 0 || pkgRoomRate === '' ? '' : pkgRoomRate}
                          onChange={(e) => setPkgRoomRate(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Food Charge / Day (BDT)</label>
                        <input
                          type="number"
                          value={pkgFoodRate === 0 || pkgFoodRate === '' ? '' : pkgFoodRate}
                          onChange={(e) => setPkgFoodRate(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Admission Fee (1-Time BDT)</label>
                        <input
                          type="number"
                          value={pkgAdmissionFee === 0 || pkgAdmissionFee === '' ? '' : pkgAdmissionFee}
                          onChange={(e) => setPkgAdmissionFee(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Breakdown Results */}
                    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm space-y-2 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Treatment Gross ({pkgDays}d):</span>
                        <span className="font-bold text-slate-800">BDT {pkgGrossTreatment.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount ({pkgDiscountPct}%):</span>
                        <span className="font-bold">- BDT {pkgDiscAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-700 font-bold border-t border-slate-100 pt-1">
                        <span>Treatment Net:</span>
                        <span>BDT {pkgNetTreatment.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Room Total ({pkgDays}d):</span>
                        <span className="font-bold text-slate-800">+ BDT {pkgTotalRoom.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Food Total ({pkgDays}d):</span>
                        <span className="font-bold text-slate-800">+ BDT {pkgTotalFood.toLocaleString()}</span>
                      </div>

                      {/* Effective Rate Highlight */}
                      <div className="bg-amber-50 p-2 rounded-lg border border-amber-200/80 my-1 flex justify-between font-bold text-amber-950">
                        <span>Effective Rate / Day:</span>
                        <span className="text-amber-900 font-black">BDT {pkgEffectiveRatePerDay.toLocaleString()} / Day</span>
                      </div>

                      <div className="flex justify-between text-slate-600 pt-0.5">
                        <span>Admission Fee (1-Time):</span>
                        <span className="font-bold text-slate-800">+ BDT {pkgAdmission.toLocaleString()}</span>
                      </div>

                      <div className="flex justify-between text-slate-900 font-black text-sm border-t border-slate-300 pt-2">
                        <span>Total Net Estimate:</span>
                        <span className="text-emerald-700">BDT {pkgGrandTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(`Package Summary (${pkgDays} Days):\nEffective Rate: BDT ${pkgEffectiveRatePerDay}/Day\nGrand Total: BDT ${pkgGrandTotal.toLocaleString()}`)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs shadow-sm"
                    >
                      {copiedText?.includes('Package Summary') ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedText?.includes('Package Summary') ? 'Copied Summary' : 'Copy Package Summary'}</span>
                    </button>
                  </div>
                )}

                {/* 3. INSTALLMENT SPLITTER MODE */}
                {activeMode === 'installment' && (
                  <div className="space-y-3 text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-950 font-bold flex items-center justify-between">
                      <span>💳 Installment & Cycle Splitter</span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-black">
                        Splitter
                      </span>
                    </div>

                    {/* Inputs Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Total Bill Amount (BDT)</label>
                        <input
                          type="number"
                          value={instTotalBill === 0 || instTotalBill === '' ? '' : instTotalBill}
                          onChange={(e) => setInstTotalBill(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Number of Cycles</label>
                        <select
                          value={instCyclesCount}
                          onChange={(e) => setInstCyclesCount(Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value={2}>2 Cycles (50/50)</option>
                          <option value={3}>3 Cycles</option>
                          <option value={4}>4 Cycles</option>
                          <option value={5}>5 Cycles</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Total Duration (Days)</label>
                        <input
                          type="number"
                          value={instDays === 0 || instDays === '' ? '' : instDays}
                          onChange={(e) => setInstDays(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="30"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Discount (%)</label>
                        <input
                          type="number"
                          value={instDiscountPct === 0 || instDiscountPct === '' ? '' : instDiscountPct}
                          onChange={(e) => setInstDiscountPct(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0%"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Quick Preset Days selector */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] font-bold text-slate-500">Preset Days:</span>
                      {[10, 15, 30, 45, 60].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setInstDays(d)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            instDays === d
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {d} Days
                        </button>
                      ))}
                    </div>

                    {/* Bill Breakdown Summary Card */}
                    <div className="bg-white rounded-xl p-2.5 border border-slate-200 shadow-sm space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Gross Bill Amount:</span>
                        <span className="font-bold text-slate-800">BDT {instGross.toLocaleString()}</span>
                      </div>

                      {instDiscountPct > 0 && (
                        <div className="flex justify-between text-rose-600 font-bold">
                          <span>Discount ({instDiscountPct}%):</span>
                          <span>- BDT {instDiscAmount.toLocaleString()}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-900 font-black text-xs border-t border-slate-100 pt-1">
                        <span>Net Payable Bill:</span>
                        <span className="text-emerald-700">BDT {instNet.toLocaleString()}</span>
                      </div>

                      <div className="flex justify-between text-slate-500 text-[10px] pt-0.5">
                        <span>Duration & Split:</span>
                        <span className="font-semibold text-slate-700">
                          {instDays} Days • {instCyclesCount} Cycles (~{Math.ceil((instDays || 30) / Math.max(1, instCyclesCount))} days/cycle)
                        </span>
                      </div>
                    </div>

                    {/* Cycle Cards */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Installment Cycle Breakup (Exact)</label>
                      {installmentsList.map((item) => (
                        <div key={item.cycle} className="bg-white rounded-xl p-2.5 border border-slate-200 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="font-black text-slate-800 text-xs">{item.title}</span>
                            <span className="text-[10px] text-slate-500 block">
                              Approx {item.days} days duration
                              {item.discountAmount > 0 && (
                                <span className="text-emerald-600 font-medium ml-1">
                                  (Saved BDT {item.discountAmount.toLocaleString()})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-emerald-800 block">
                              BDT {item.amount.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {item.percentage}% Share
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const summary = installmentsList.map(i => `${i.title}: BDT ${i.amount.toLocaleString()} (~${i.days} days, ${i.percentage}%)`).join('\n');
                        copyToClipboard(`Installment Plan (${instDays} Days, ${instCyclesCount} Cycles):\nGross Total: BDT ${instGross.toLocaleString()}\nDiscount: ${instDiscountPct}% (-BDT ${instDiscAmount.toLocaleString()})\nNet Payable: BDT ${instNet.toLocaleString()}\n\nBreakup:\n${summary}`);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs shadow-sm"
                    >
                      {copiedText?.includes('Installment Plan') ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedText?.includes('Installment Plan') ? 'Copied Plan' : 'Copy Installment Plan'}</span>
                    </button>
                  </div>
                )}

                {/* 4. QUICK DISCOUNT CALCULATOR MODE */}
                {activeMode === 'discount' && (
                  <div className="space-y-3 text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-950 font-bold flex items-center justify-between">
                      <span>🏷️ Quick Discount Calculator</span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-black">
                        Quick Discount
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Original Price (BDT)</label>
                        <input
                          type="number"
                          value={discPrice === 0 || discPrice === '' ? '' : discPrice}
                          onChange={(e) => setDiscPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Discount (%)</label>
                        <input
                          type="number"
                          value={discPct === 0 || discPct === '' ? '' : discPct}
                          onChange={(e) => setDiscPct(e.target.value === '' ? '' : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0%"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Quick Discount Presets */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quick Discount Presets</label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[10, 15, 20, 25, 30, 35, 50].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => setDiscPct(pct)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              discPct === pct
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Result */}
                    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm space-y-2">
                      <div className="flex justify-between text-slate-600">
                        <span>Original Price:</span>
                        <span className="font-bold text-slate-800">BDT {(discPrice || 0).toLocaleString()}</span>
                      </div>

                      <div className="flex justify-between text-rose-600 font-bold">
                        <span>Discount Amount ({discPct}%):</span>
                        <span>- BDT {discAmt.toLocaleString()}</span>
                      </div>

                      <div className="flex justify-between text-slate-900 font-black text-base border-t border-slate-200 pt-2">
                        <span>Final Price / Payable:</span>
                        <span className="text-emerald-700">BDT {discNetPayable.toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(`Price BDT ${discPrice.toLocaleString()} - ${discPct}% Discount = BDT ${discNetPayable.toLocaleString()} (Saved: BDT ${discAmt.toLocaleString()})`)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs shadow-sm"
                    >
                      {copiedText?.includes('Saved:') ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedText?.includes('Saved:') ? 'Copied Discount Calculation' : 'Copy Discount Result'}</span>
                    </button>
                  </div>
                )}

              </div>

              {/* DRAWER FOOTER */}
              <div className="bg-slate-100 p-2.5 border-t border-slate-200 text-center text-[10px] text-slate-500 font-medium">
                SUO XI Billing System • Quick Floating Calculator
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
