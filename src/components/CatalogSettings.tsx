import React, { useState, useEffect } from 'react';
import { Settings, Plus, Save, Trash2, CheckCircle2, ArrowUp, ArrowDown, Hash } from 'lucide-react';
import { CatalogItem } from '../types';

interface CatalogSettingsProps {
  catalog: CatalogItem[];
  onSaveCatalog: (catalog: CatalogItem[]) => void;
}

export const CatalogSettings: React.FC<CatalogSettingsProps> = ({
  catalog,
  onSaveCatalog
}) => {
  const [items, setItems] = useState<CatalogItem[]>(catalog);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (catalog && catalog.length > 0) {
      setItems(catalog);
    }
  }, [catalog]);

  const handleAddItem = (category: 'treatment' | 'outdoor_package' | 'indoor_room' | 'consultation' | 'additional_treatment') => {
    const newItem: CatalogItem = {
      id: `cat-${Date.now()}`,
      name: category === 'additional_treatment' ? 'New Additional Therapy' : 'New Service or Treatment Item',
      category,
      defaultPrice: 1000,
      defaultDiscountPercent: 0,
      description: '',
      isRatioBased: category === 'additional_treatment' ? false : undefined,
      sessionsPer10Days: category === 'additional_treatment' ? 3 : undefined
    };
    setItems([...items, newItem]);
  };

  const updateItem = (index: number, fields: Partial<CatalogItem>) => {
    const updated = [...items];
    updated[index] = { ...updated[index], ...fields };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const moveItem = (itemId: string, direction: 'up' | 'down' | number) => {
    const target = items.find(i => i.id === itemId);
    if (!target) return;

    const isTreatment = target.category === 'treatment' || target.category === 'consultation';
    const group = items.filter(i => 
      isTreatment ? (i.category === 'treatment' || i.category === 'consultation') : i.category === target.category
    );

    const currentIdx = group.findIndex(i => i.id === itemId);
    if (currentIdx === -1) return;

    let targetIdx = currentIdx;
    if (direction === 'up') {
      targetIdx = Math.max(0, currentIdx - 1);
    } else if (direction === 'down') {
      targetIdx = Math.min(group.length - 1, currentIdx + 1);
    } else if (typeof direction === 'number') {
      targetIdx = Math.max(0, Math.min(group.length - 1, direction - 1));
    }

    if (targetIdx === currentIdx) return;

    const reorderedGroup = [...group];
    const [moved] = reorderedGroup.splice(currentIdx, 1);
    reorderedGroup.splice(targetIdx, 0, moved);

    let gIdx = 0;
    const newItems = items.map(item => {
      const belongs = isTreatment
        ? (item.category === 'treatment' || item.category === 'consultation')
        : item.category === target.category;
      if (belongs) {
        const replacement = reorderedGroup[gIdx];
        gIdx++;
        return replacement;
      }
      return item;
    });

    setItems(newItems);
  };

  const handleSave = () => {
    onSaveCatalog(items);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6 print:hidden">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <span>Service Catalog & Standard Pricing Rates</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure default prices and rates for Acupuncture Therapies, Outdoor Packages, and Accommodation Cabins.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaved ? 'Catalog Saved!' : 'Save Catalog Rates'}</span>
        </button>
      </div>

      {isSaved && (
        <div className="p-4 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-300 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Service catalog pricing updated successfully across all billing desks.</span>
        </div>
      )}

      {/* Catalog Grid by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Category 1: Treatments */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">1. Acupuncture & Individual Therapies</h3>
              <p className="text-[11px] text-slate-500">Use ↑ ↓ buttons or enter position number to re-order items.</p>
            </div>
            <button
              onClick={() => handleAddItem('treatment')}
              className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {(() => {
              const treatmentGroup = items.filter(i => i.category === 'treatment' || i.category === 'consultation');
              return treatmentGroup.map((item, catIdx) => {
                const itemIdxInAll = items.findIndex(i => i.id === item.id);
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 space-y-2 overflow-hidden shadow-xs">
                    {/* Item Order Top Bar */}
                    <div className="flex items-center justify-between bg-slate-200/70 px-3 py-1 border-b border-slate-300/80 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-emerald-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded font-mono">
                          #{catIdx + 1}
                        </span>
                        <span className="text-[11px] text-slate-600 font-semibold">Listing Serial</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={catIdx === 0}
                          onClick={() => moveItem(item.id, 'up')}
                          className="p-1 text-slate-700 hover:text-emerald-800 hover:bg-emerald-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={catIdx === treatmentGroup.length - 1}
                          onClick={() => moveItem(item.id, 'down')}
                          className="p-1 text-slate-700 hover:text-emerald-800 hover:bg-emerald-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 ml-1.5 pl-2 border-l border-slate-300">
                          <span className="text-[10px] text-slate-500 font-medium">Position:</span>
                          <input
                            type="number"
                            min={1}
                            max={treatmentGroup.length}
                            value={catIdx + 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val <= treatmentGroup.length) {
                                moveItem(item.id, val);
                              }
                            }}
                            className="w-11 px-1 py-0.5 bg-white border border-slate-300 rounded text-center text-[11px] font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(itemIdxInAll, { name: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                          placeholder="Treatment name..."
                        />
                        <div className="w-28 relative">
                          <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                          <input
                            type="number"
                            value={item.defaultPrice}
                            onChange={(e) => updateItem(itemIdxInAll, { defaultPrice: Number(e.target.value) })}
                            className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-800"
                          />
                        </div>
                        <button onClick={() => removeItem(itemIdxInAll)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { description: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-emerald-500"
                          placeholder="Description / Details..."
                        />
                        <input
                          type="text"
                          value={item.rateNote || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { rateNote: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-emerald-500"
                          placeholder="Rate Subtext / Note (under Rate)..."
                        />
                      </div>

                      {item.category === 'treatment' && (
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                          <div className="flex items-center gap-1.5 bg-emerald-50/70 px-2.5 py-1 rounded-lg border border-emerald-100">
                            <span className="text-[11px] font-bold text-emerald-800 shrink-0">Outdoor Session:</span>
                            <input
                              type="number"
                              min={0}
                              value={item.outdoorSessions ?? ''}
                              onChange={(e) => updateItem(itemIdxInAll, { outdoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-emerald-900 text-center focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g. 1"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100">
                            <span className="text-[11px] font-bold text-indigo-800 shrink-0">Indoor Session:</span>
                            <input
                              type="number"
                              min={0}
                              value={item.indoorSessions ?? ''}
                              onChange={(e) => updateItem(itemIdxInAll, { indoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-indigo-900 text-center focus:ring-1 focus:ring-indigo-500"
                              placeholder="e.g. 2"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Category 2: Outdoor Packages */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">2. Outdoor Treatment Packages</h3>
              <p className="text-[11px] text-slate-500">Use ↑ ↓ buttons or enter position number to re-order packages.</p>
            </div>
            <button
              onClick={() => handleAddItem('outdoor_package')}
              className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {(() => {
              const packageGroup = items.filter(i => i.category === 'outdoor_package');
              return packageGroup.map((item, catIdx) => {
                const itemIdxInAll = items.findIndex(i => i.id === item.id);
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 space-y-2 overflow-hidden shadow-xs">
                    {/* Item Order Top Bar */}
                    <div className="flex items-center justify-between bg-slate-200/70 px-3 py-1 border-b border-slate-300/80 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-teal-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded font-mono">
                          #{catIdx + 1}
                        </span>
                        <span className="text-[11px] text-slate-600 font-semibold">Listing Serial</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={catIdx === 0}
                          onClick={() => moveItem(item.id, 'up')}
                          className="p-1 text-slate-700 hover:text-teal-800 hover:bg-teal-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={catIdx === packageGroup.length - 1}
                          onClick={() => moveItem(item.id, 'down')}
                          className="p-1 text-slate-700 hover:text-teal-800 hover:bg-teal-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 ml-1.5 pl-2 border-l border-slate-300">
                          <span className="text-[10px] text-slate-500 font-medium">Position:</span>
                          <input
                            type="number"
                            min={1}
                            max={packageGroup.length}
                            value={catIdx + 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val <= packageGroup.length) {
                                moveItem(item.id, val);
                              }
                            }}
                            className="w-11 px-1 py-0.5 bg-white border border-slate-300 rounded text-center text-[11px] font-bold text-slate-900 focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(itemIdxInAll, { name: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                          placeholder="Package name..."
                        />
                        <div className="w-28 relative">
                          <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                          <input
                            type="number"
                            value={item.defaultPrice}
                            onChange={(e) => updateItem(itemIdxInAll, { defaultPrice: Number(e.target.value) })}
                            className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-teal-800"
                          />
                        </div>
                        <button onClick={() => removeItem(itemIdxInAll)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { description: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-teal-500"
                          placeholder="Package details / description..."
                        />
                        <input
                          type="text"
                          value={item.rateNote || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { rateNote: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-teal-500"
                          placeholder="Rate Subtext / Note (under Rate)..."
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Category 3: Indoor Rooms */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 col-span-full md:col-span-1">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">3. Indoor Rooms & Cabins</h3>
              <p className="text-[11px] text-slate-500">Use ↑ ↓ buttons or enter position number to re-order rooms.</p>
            </div>
            <button
              onClick={() => handleAddItem('indoor_room')}
              className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {(() => {
              const roomGroup = items.filter(i => i.category === 'indoor_room');
              return roomGroup.map((item, catIdx) => {
                const itemIdxInAll = items.findIndex(i => i.id === item.id);
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 space-y-2 overflow-hidden shadow-xs">
                    {/* Item Order Top Bar */}
                    <div className="flex items-center justify-between bg-slate-200/70 px-3 py-1 border-b border-slate-300/80 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-indigo-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded font-mono">
                          #{catIdx + 1}
                        </span>
                        <span className="text-[11px] text-slate-600 font-semibold">Listing Serial</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={catIdx === 0}
                          onClick={() => moveItem(item.id, 'up')}
                          className="p-1 text-slate-700 hover:text-indigo-800 hover:bg-indigo-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={catIdx === roomGroup.length - 1}
                          onClick={() => moveItem(item.id, 'down')}
                          className="p-1 text-slate-700 hover:text-indigo-800 hover:bg-indigo-100 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 ml-1.5 pl-2 border-l border-slate-300">
                          <span className="text-[10px] text-slate-500 font-medium">Position:</span>
                          <input
                            type="number"
                            min={1}
                            max={roomGroup.length}
                            value={catIdx + 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val <= roomGroup.length) {
                                moveItem(item.id, val);
                              }
                            }}
                            className="w-11 px-1 py-0.5 bg-white border border-slate-300 rounded text-center text-[11px] font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(itemIdxInAll, { name: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                          placeholder="Room / Cabin name..."
                        />
                        <div className="w-28 relative">
                          <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                          <input
                            type="number"
                            value={item.defaultPrice}
                            onChange={(e) => updateItem(itemIdxInAll, { defaultPrice: Number(e.target.value) })}
                            className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-indigo-800"
                          />
                        </div>
                        <button onClick={() => removeItem(itemIdxInAll)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { description: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                          placeholder="Cabin / Ward details..."
                        />
                        <input
                          type="text"
                          value={item.rateNote || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { rateNote: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                          placeholder="Rate Subtext / Note (under Rate)..."
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Category 4: Additional Treatments */}
        <div className="bg-white rounded-2xl p-5 border border-sky-200 shadow-sm space-y-4 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>4. Additional Treatments</span>
                <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full border border-sky-200">
                  Catalog & Rates
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">Configure default rates and 10-day ratio calculation settings for optional additional procedures (Ozon, ED, etc.).</p>
            </div>
            <button
              onClick={() => handleAddItem('additional_treatment')}
              className="text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200 cursor-pointer"
            >
              + Add Additional Treatment
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              const addGroup = items.filter(i => i.category === 'additional_treatment');
              if (addGroup.length === 0) {
                return (
                  <div className="col-span-2 text-center py-6 text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No additional treatments in catalog yet. Click "+ Add Additional Treatment" above to create one.
                  </div>
                );
              }
              return addGroup.map((item, catIdx) => {
                const itemIdxInAll = items.findIndex(i => i.id === item.id);
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 space-y-2 overflow-hidden shadow-xs">
                    {/* Item Order Top Bar */}
                    <div className="flex items-center justify-between bg-sky-100/70 px-3 py-1 border-b border-sky-200 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-sky-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded font-mono">
                          #{catIdx + 1}
                        </span>
                        <span className="text-[11px] text-sky-900 font-semibold">Additional Therapy</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={catIdx === 0}
                          onClick={() => moveItem(item.id, 'up')}
                          className="p-1 text-slate-700 hover:text-sky-800 hover:bg-sky-200 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={catIdx === addGroup.length - 1}
                          onClick={() => moveItem(item.id, 'down')}
                          className="p-1 text-slate-700 hover:text-sky-800 hover:bg-sky-200 rounded disabled:opacity-25 cursor-pointer transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 ml-1.5 pl-2 border-l border-sky-300">
                          <span className="text-[10px] text-slate-500 font-medium">Pos:</span>
                          <input
                            type="number"
                            min={1}
                            max={addGroup.length}
                            value={catIdx + 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val <= addGroup.length) {
                                moveItem(item.id, val);
                              }
                            }}
                            className="w-11 px-1 py-0.5 bg-white border border-slate-300 rounded text-center text-[11px] font-bold text-slate-900 focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(itemIdxInAll, { name: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-sky-500"
                          placeholder="Treatment or therapy name..."
                        />
                        <div className="w-28 relative shrink-0">
                          <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                          <input
                            type="number"
                            value={item.defaultPrice}
                            onChange={(e) => updateItem(itemIdxInAll, { defaultPrice: Number(e.target.value) })}
                            className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-sky-900 focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <button onClick={() => removeItem(itemIdxInAll)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateItem(itemIdxInAll, { description: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-sky-500"
                          placeholder="Treatment description or details..."
                        />

                        {/* Outdoor & Indoor Default Sessions */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                          <div className="flex items-center gap-1.5 bg-emerald-50/70 px-2.5 py-1 rounded-lg border border-emerald-100">
                            <span className="text-[11px] font-bold text-emerald-800 shrink-0">Outdoor Session:</span>
                            <input
                              type="number"
                              min={0}
                              value={item.outdoorSessions ?? ''}
                              onChange={(e) => updateItem(itemIdxInAll, { outdoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-emerald-900 text-center focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g. 1"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100">
                            <span className="text-[11px] font-bold text-indigo-800 shrink-0">Indoor Session:</span>
                            <input
                              type="number"
                              min={0}
                              value={item.indoorSessions ?? ''}
                              onChange={(e) => updateItem(itemIdxInAll, { indoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-indigo-900 text-center focus:ring-1 focus:ring-indigo-500"
                              placeholder="e.g. 2"
                            />
                          </div>
                          <div className="col-span-2 pt-0.5">
                            <label className="inline-flex items-center gap-2 text-[11px] font-bold text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-200/70 cursor-pointer select-none transition">
                              <input
                                type="checkbox"
                                checked={Boolean(item.isIndoorFree)}
                                onChange={(e) => updateItem(itemIdxInAll, { isIndoorFree: e.target.checked })}
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span>🎁 Free for Indoor Patient</span>
                            </label>
                          </div>
                        </div>

                        {/* Ratio Calculation Options */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-sky-50/60 rounded-lg border border-sky-100 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-sky-900">
                            <input
                              type="checkbox"
                              checked={!!item.isRatioBased}
                              onChange={(e) => updateItem(itemIdxInAll, { isRatioBased: e.target.checked })}
                              className="w-3.5 h-3.5 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                            />
                            <span>Auto ratio based on Package Days</span>
                          </label>

                          {item.isRatioBased && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-slate-600">Sessions per 10 Days:</span>
                              <input
                                type="number"
                                min={1}
                                value={item.sessionsPer10Days || 3}
                                onChange={(e) => updateItem(itemIdxInAll, { sessionsPer10Days: Number(e.target.value) || 1 })}
                                className="w-14 px-2 py-0.5 bg-white border border-slate-300 rounded text-center text-xs font-bold text-sky-900 focus:ring-1 focus:ring-sky-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

      </div>

    </div>
  );
};
