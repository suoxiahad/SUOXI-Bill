import React, { useState, useEffect } from 'react';
import { Settings, Plus, Save, Trash2, CheckCircle2 } from 'lucide-react';
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

  const handleAddItem = (category: 'treatment' | 'outdoor_package' | 'indoor_room' | 'consultation') => {
    const newItem: CatalogItem = {
      id: `cat-${Date.now()}`,
      name: 'New Service or Treatment Item',
      category,
      defaultPrice: 1000,
      defaultDiscountPercent: 0,
      description: ''
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

  const handleSave = () => {
    onSaveCatalog(items);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      
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
            <h3 className="font-bold text-slate-900 text-sm">1. Acupuncture & Individual Therapies</h3>
            <button
              onClick={() => handleAddItem('treatment')}
              className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              if (item.category !== 'treatment' && item.category !== 'consultation') return null;
              return (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                      placeholder="Treatment name..."
                    />
                    <div className="w-28 relative">
                      <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                      <input
                        type="number"
                        value={item.defaultPrice}
                        onChange={(e) => updateItem(idx, { defaultPrice: Number(e.target.value) })}
                        className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-800"
                      />
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="Description / Details..."
                    />
                    <input
                      type="text"
                      value={item.rateNote || ''}
                      onChange={(e) => updateItem(idx, { rateNote: e.target.value })}
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
                          onChange={(e) => updateItem(idx, { outdoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-emerald-900 text-center focus:ring-1 focus:ring-emerald-500"
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100">
                        <span className="text-[11px] font-bold text-indigo-800 shrink-0">Indoor Session:</span>
                        <input
                          type="number"
                          min={0}
                          value={item.indoorSessions ?? ''}
                          onChange={(e) => updateItem(idx, { indoorSessions: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-indigo-900 text-center focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 15"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Category 2: Outdoor Packages */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">2. Outdoor Treatment Packages</h3>
            <button
              onClick={() => handleAddItem('outdoor_package')}
              className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              if (item.category !== 'outdoor_package') return null;
              return (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                      placeholder="Package name..."
                    />
                    <div className="w-28 relative">
                      <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                      <input
                        type="number"
                        value={item.defaultPrice}
                        onChange={(e) => updateItem(idx, { defaultPrice: Number(e.target.value) })}
                        className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-teal-800"
                      />
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-teal-500"
                      placeholder="Package details / description..."
                    />
                    <input
                      type="text"
                      value={item.rateNote || ''}
                      onChange={(e) => updateItem(idx, { rateNote: e.target.value })}
                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-teal-500"
                      placeholder="Rate Subtext / Note (under Rate)..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category 3: Indoor Rooms */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 col-span-full md:col-span-1">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">3. Indoor Rooms & Cabins</h3>
            <button
              onClick={() => handleAddItem('indoor_room')}
              className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              if (item.category !== 'indoor_room') return null;
              return (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                      placeholder="Room / Cabin name..."
                    />
                    <div className="w-28 relative">
                      <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">BDT</span>
                      <input
                        type="number"
                        value={item.defaultPrice}
                        onChange={(e) => updateItem(idx, { defaultPrice: Number(e.target.value) })}
                        className="w-full pl-9 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-indigo-800"
                      />
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                      placeholder="Cabin / Ward details..."
                    />
                    <input
                      type="text"
                      value={item.rateNote || ''}
                      onChange={(e) => updateItem(idx, { rateNote: e.target.value })}
                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                      placeholder="Rate Subtext / Note (under Rate)..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
