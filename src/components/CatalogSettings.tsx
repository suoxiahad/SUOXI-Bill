import React, { useState, useEffect } from 'react';
import { Settings, Plus, Save, Trash2, CheckCircle2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Hash, Briefcase, RotateCcw, Check, Sparkles, MessageSquare, Pencil, X, FileSpreadsheet } from 'lucide-react';
import { CatalogItem, Patient } from '../types';
import { DEFAULT_PROFESSIONS, getProfessionsLocal, saveProfessionsApi, DEFAULT_CONSULTATION_COMMENTS, getConsultationCommentsLocal, saveConsultationCommentsApi } from '../utils/storage';
import { GoogleSheetsSettings } from './GoogleSheetsSettings';

interface ItemPositionControllerProps {
  currentPosition: number;
  totalCount: number;
  onMove: (direction: 'up' | 'down' | 'top' | 'bottom' | number) => void;
  accentColor?: string;
}

const ItemPositionController: React.FC<ItemPositionControllerProps> = ({
  currentPosition,
  totalCount,
  onMove,
  accentColor = 'emerald'
}) => {
  const [posInput, setPosInput] = useState(String(currentPosition));

  useEffect(() => {
    setPosInput(String(currentPosition));
  }, [currentPosition]);

  const commitPosition = () => {
    const val = parseInt(posInput, 10);
    if (!isNaN(val) && val >= 1 && val <= totalCount && val !== currentPosition) {
      onMove(val);
    } else {
      setPosInput(String(currentPosition));
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={currentPosition === 1}
        onClick={() => onMove('top')}
        className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded disabled:opacity-25 cursor-pointer transition-colors"
        title="Move to Top (#1)"
      >
        <ChevronsUp className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        disabled={currentPosition === 1}
        onClick={() => onMove('up')}
        className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded disabled:opacity-25 cursor-pointer transition-colors"
        title="Move Up (1 step)"
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        disabled={currentPosition === totalCount}
        onClick={() => onMove('down')}
        className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded disabled:opacity-25 cursor-pointer transition-colors"
        title="Move Down (1 step)"
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        disabled={currentPosition === totalCount}
        onClick={() => onMove('bottom')}
        className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded disabled:opacity-25 cursor-pointer transition-colors"
        title={`Move to Bottom (#${totalCount})`}
      >
        <ChevronsDown className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-slate-300">
        <span className="text-[10px] text-slate-500 font-medium">Serial/Pos:</span>
        <input
          type="number"
          min={1}
          max={totalCount}
          value={posInput}
          onChange={(e) => setPosInput(e.target.value)}
          onBlur={commitPosition}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitPosition();
            }
          }}
          className="w-12 px-1 py-0.5 bg-white border border-slate-300 rounded text-center text-[11px] font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500"
          title="Type serial/position number & press Enter"
        />
        <span className="text-[10px] text-slate-400">/{totalCount}</span>
      </div>
    </div>
  );
};

interface CatalogSettingsProps {
  catalog: CatalogItem[];
  professions?: string[];
  comments?: string[];
  patients?: Patient[];
  onSaveCatalog: (catalog: CatalogItem[]) => void;
  onSaveProfessions?: (professions: string[]) => void;
  onSaveComments?: (comments: string[]) => void;
}

export const CatalogSettings: React.FC<CatalogSettingsProps> = ({
  catalog,
  professions = [],
  comments = [],
  patients = [],
  onSaveCatalog,
  onSaveProfessions,
  onSaveComments
}) => {
  const [items, setItems] = useState<CatalogItem[]>(catalog);
  const [isSaved, setIsSaved] = useState(false);
  const [activeSettingTab, setActiveSettingTab] = useState<'catalog' | 'professions' | 'comments' | 'google-sheets'>('catalog');
  
  const [professionList, setProfessionList] = useState<string[]>(() => {
    return professions && professions.length > 0 ? professions : getProfessionsLocal();
  });
  const [newProfessionInput, setNewProfessionInput] = useState('');
  const [isProfessionSaved, setIsProfessionSaved] = useState(false);
  const [editingProfession, setEditingProfession] = useState<string | null>(null);
  const [editingProfessionValue, setEditingProfessionValue] = useState<string>('');

  const [commentList, setCommentList] = useState<string[]>(() => {
    return comments && comments.length > 0 ? comments : getConsultationCommentsLocal();
  });
  const [newCommentInput, setNewCommentInput] = useState('');
  const [isCommentSaved, setIsCommentSaved] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState<string>('');

  useEffect(() => {
    if (Array.isArray(professions) && professions.length > 0) {
      setProfessionList(professions);
    }
  }, [professions]);

  useEffect(() => {
    if (Array.isArray(comments) && comments.length > 0) {
      setCommentList(comments);
    }
  }, [comments]);

  const handleAddProfession = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newProfessionInput.trim();
    if (!clean) return;
    if (professionList.some(p => p.toLowerCase() === clean.toLowerCase())) {
      setNewProfessionInput('');
      return;
    }
    const updated = [...professionList, clean];
    setProfessionList(updated);
    setNewProfessionInput('');
    if (onSaveProfessions) {
      onSaveProfessions(updated);
    } else {
      saveProfessionsApi(updated);
    }
    setIsProfessionSaved(true);
    setTimeout(() => setIsProfessionSaved(false), 2500);
  };

  const handleRemoveProfession = (profToRemove: string) => {
    const updated = professionList.filter(p => p !== profToRemove);
    setProfessionList(updated);
    if (editingProfession === profToRemove) {
      setEditingProfession(null);
    }
    if (onSaveProfessions) {
      onSaveProfessions(updated);
    } else {
      saveProfessionsApi(updated);
    }
    setIsProfessionSaved(true);
    setTimeout(() => setIsProfessionSaved(false), 2500);
  };

  const handleStartEditProfession = (prof: string) => {
    setEditingProfession(prof);
    setEditingProfessionValue(prof);
  };

  const handleSaveEditedProfession = (oldProf: string) => {
    const clean = editingProfessionValue.trim();
    if (!clean || clean === oldProf) {
      setEditingProfession(null);
      return;
    }
    if (professionList.some(p => p.toLowerCase() === clean.toLowerCase() && p.toLowerCase() !== oldProf.toLowerCase())) {
      setEditingProfession(null);
      return;
    }
    const updated = professionList.map(p => p === oldProf ? clean : p);
    setProfessionList(updated);
    setEditingProfession(null);
    if (onSaveProfessions) {
      onSaveProfessions(updated);
    } else {
      saveProfessionsApi(updated);
    }
    setIsProfessionSaved(true);
    setTimeout(() => setIsProfessionSaved(false), 2500);
  };

  const handleCancelEditProfession = () => {
    setEditingProfession(null);
    setEditingProfessionValue('');
  };

  const handleResetProfessions = () => {
    setProfessionList(DEFAULT_PROFESSIONS);
    if (onSaveProfessions) {
      onSaveProfessions(DEFAULT_PROFESSIONS);
    } else {
      saveProfessionsApi(DEFAULT_PROFESSIONS);
    }
    setIsProfessionSaved(true);
    setTimeout(() => setIsProfessionSaved(false), 2500);
  };

  const handleSaveProfessionsManual = async () => {
    if (onSaveProfessions) {
      onSaveProfessions(professionList);
    } else {
      await saveProfessionsApi(professionList);
    }
    setIsProfessionSaved(true);
    setTimeout(() => setIsProfessionSaved(false), 3000);
  };

  // Comment Handlers
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCommentInput.trim();
    if (!clean) return;
    if (commentList.some(c => c.toLowerCase() === clean.toLowerCase())) {
      setNewCommentInput('');
      return;
    }
    const updated = [...commentList, clean];
    setCommentList(updated);
    setNewCommentInput('');
    if (onSaveComments) {
      onSaveComments(updated);
    } else {
      saveConsultationCommentsApi(updated);
    }
    setIsCommentSaved(true);
    setTimeout(() => setIsCommentSaved(false), 2500);
  };

  const handleRemoveComment = (commentToRemove: string) => {
    const updated = commentList.filter(c => c !== commentToRemove);
    setCommentList(updated);
    if (editingComment === commentToRemove) {
      setEditingComment(null);
    }
    if (onSaveComments) {
      onSaveComments(updated);
    } else {
      saveConsultationCommentsApi(updated);
    }
    setIsCommentSaved(true);
    setTimeout(() => setIsCommentSaved(false), 2500);
  };

  const handleStartEditComment = (comm: string) => {
    setEditingComment(comm);
    setEditingCommentValue(comm);
  };

  const handleSaveEditedComment = (oldComment: string) => {
    const clean = editingCommentValue.trim();
    if (!clean || clean === oldComment) {
      setEditingComment(null);
      return;
    }
    if (commentList.some(c => c.toLowerCase() === clean.toLowerCase() && c.toLowerCase() !== oldComment.toLowerCase())) {
      setEditingComment(null);
      return;
    }
    const updated = commentList.map(c => c === oldComment ? clean : c);
    setCommentList(updated);
    setEditingComment(null);
    if (onSaveComments) {
      onSaveComments(updated);
    } else {
      saveConsultationCommentsApi(updated);
    }
    setIsCommentSaved(true);
    setTimeout(() => setIsCommentSaved(false), 2500);
  };

  const handleCancelEditComment = () => {
    setEditingComment(null);
    setEditingCommentValue('');
  };

  const handleResetComments = () => {
    setCommentList(DEFAULT_CONSULTATION_COMMENTS);
    if (onSaveComments) {
      onSaveComments(DEFAULT_CONSULTATION_COMMENTS);
    } else {
      saveConsultationCommentsApi(DEFAULT_CONSULTATION_COMMENTS);
    }
    setIsCommentSaved(true);
    setTimeout(() => setIsCommentSaved(false), 2500);
  };

  const handleSaveCommentsManual = async () => {
    if (onSaveComments) {
      onSaveComments(commentList);
    } else {
      await saveConsultationCommentsApi(commentList);
    }
    setIsCommentSaved(true);
    setTimeout(() => setIsCommentSaved(false), 3000);
  };

  useEffect(() => {
    if (Array.isArray(catalog)) {
      setItems(catalog);
    }
  }, [catalog]);

  const handleAddItem = (category: 'treatment' | 'outdoor_package' | 'indoor_room' | 'consultation' | 'additional_treatment') => {
    const newItem: CatalogItem = {
      id: `cat-${Date.now()}`,
      name: category === 'additional_treatment' ? 'New Weekly Treatment' : 'New Service or Treatment Item',
      category,
      defaultPrice: 1000,
      defaultDiscountPercent: 0,
      fixedDiscountAmount: undefined,
      outdoorDiscountPercent: undefined,
      outdoorDiscountAmount: undefined,
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

  const moveItem = (itemId: string, direction: 'up' | 'down' | 'top' | 'bottom' | number) => {
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
    } else if (direction === 'top') {
      targetIdx = 0;
    } else if (direction === 'bottom') {
      targetIdx = group.length - 1;
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
    const enriched = items.map((item, idx) => ({
      ...item,
      orderIndex: idx
    }));
    onSaveCatalog(enriched);
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
            <span>Hospital Settings & Rates</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure Service Pricing, Treatment Packages, and Patient Profession Categories for the Consultation Desk.
          </p>
        </div>

        {activeSettingTab === 'catalog' ? (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaved ? 'Catalog Saved!' : 'Save Catalog Rates'}</span>
          </button>
        ) : activeSettingTab === 'professions' ? (
          <button
            onClick={handleSaveProfessionsManual}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isProfessionSaved ? 'Professions Saved!' : 'Save Professions'}</span>
          </button>
        ) : activeSettingTab === 'comments' ? (
          <button
            onClick={handleSaveCommentsManual}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isCommentSaved ? 'Comments Saved!' : 'Save Comments'}</span>
          </button>
        ) : null}
      </div>

      {/* Sub-Tabs: Service Catalog vs. Profession Settings vs. Patient Comments vs. Google Sheets */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200 w-fit">
        <button
          type="button"
          onClick={() => setActiveSettingTab('catalog')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSettingTab === 'catalog'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Settings className="w-4 h-4 text-emerald-600" />
          <span>Treatment & Service Catalog ({items.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingTab('professions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSettingTab === 'professions'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Briefcase className="w-4 h-4 text-emerald-600" />
          <span>Profession Settings ({professionList.length})</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            Dropdown
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingTab('comments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSettingTab === 'comments'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <span>Patient Comments / Decisions ({commentList.length})</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
            Post-Consult Dropdown
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingTab('google-sheets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSettingTab === 'google-sheets'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Google Sheets Sync</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            Live API
          </span>
        </button>
      </div>

      {isSaved && (
        <div className="p-4 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-300 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Service catalog pricing updated successfully across all billing desks.</span>
        </div>
      )}

      {isProfessionSaved && (
        <div className="p-4 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-300 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Professions list updated successfully! Consultation dropdown is now in sync.</span>
        </div>
      )}

      {isCommentSaved && (
        <div className="p-4 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-300 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Patient comments and decisions list updated successfully! Post Consultation dropdown is now in sync.</span>
        </div>
      )}

      {activeSettingTab === 'professions' ? (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-emerald-600" />
                <span>Patient Profession Categories</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure the list of patient professions that appear in the Consultation Table (Pre & Post Consultation) dropdown selector.
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetProfessions}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>

          {/* Add New Profession Form */}
          <form onSubmit={handleAddProfession} className="flex gap-2 max-w-lg">
            <input
              type="text"
              value={newProfessionInput}
              onChange={(e) => setNewProfessionInput(e.target.value)}
              placeholder="Type new profession name (e.g. Banker, Advocate)..."
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!newProfessionInput.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Profession</span>
            </button>
          </form>

          {/* Professions Badges / Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Active Professions in Consultation Dropdown ({professionList.length}):</span>
              <span className="text-[11px]">Click edit or ✕ to update or remove</span>
            </div>

            <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200 min-h-[120px]">
              {professionList.map((prof) => {
                const isEditing = editingProfession === prof;
                if (isEditing) {
                  return (
                    <div
                      key={prof}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border-2 border-emerald-500 shadow-sm"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={editingProfessionValue}
                        onChange={(e) => setEditingProfessionValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEditedProfession(prof);
                          } else if (e.key === 'Escape') {
                            handleCancelEditProfession();
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditedProfession(prof)}
                        className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
                        title="Save Changes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditProfession}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={prof}
                    className="group flex items-center gap-2 px-3.5 py-2 bg-white rounded-xl border border-slate-200/90 text-slate-800 text-xs font-bold shadow-2xs hover:border-emerald-300 hover:shadow-xs transition"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{prof}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEditProfession(prof)}
                      className="ml-1 text-slate-400 hover:text-emerald-600 rounded-full hover:bg-emerald-50 p-1 transition cursor-pointer"
                      title={`Edit "${prof}"`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveProfession(prof)}
                      className="text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 p-1 transition cursor-pointer"
                      title={`Delete "${prof}"`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeSettingTab === 'comments' ? (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <span>Patient Decision & Consultation Comments</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure patient feedback, decisions, and counseling remarks that appear in the Post Consultation Table "Comment" dropdown (e.g. Will take today, Will admit, Will take later, Costly).
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetComments}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>

          {/* Add New Comment Form */}
          <form onSubmit={handleAddComment} className="flex gap-2 max-w-lg">
            <input
              type="text"
              value={newCommentInput}
              onChange={(e) => setNewCommentInput(e.target.value)}
              placeholder="Type new decision or comment (e.g. Financial issue, Ready for outdoor)..."
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!newCommentInput.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Comment</span>
            </button>
          </form>

          {/* Comments Badges / Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Active Decisions / Comments in Post Consultation ({commentList.length}):</span>
              <span className="text-[11px]">Click edit or ✕ to update or remove</span>
            </div>

            <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200 min-h-[120px]">
              {commentList.map((comm) => {
                const isEditing = editingComment === comm;
                if (isEditing) {
                  return (
                    <div
                      key={comm}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border-2 border-blue-500 shadow-sm"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={editingCommentValue}
                        onChange={(e) => setEditingCommentValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEditedComment(comm);
                          } else if (e.key === 'Escape') {
                            handleCancelEditComment();
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditedComment(comm)}
                        className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition cursor-pointer"
                        title="Save Changes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditComment}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={comm}
                    className="group flex items-center gap-2 px-3.5 py-2 bg-white rounded-xl border border-slate-200/90 text-slate-800 text-xs font-bold shadow-2xs hover:border-emerald-300 hover:shadow-xs transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{comm}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEditComment(comm)}
                      className="ml-1 text-slate-400 hover:text-blue-600 rounded-full hover:bg-blue-50 p-1 transition cursor-pointer"
                      title={`Edit "${comm}"`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveComment(comm)}
                      className="text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 p-1 transition cursor-pointer"
                      title={`Delete "${comm}"`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeSettingTab === 'google-sheets' ? (
        <GoogleSheetsSettings patients={patients} />
      ) : (
        /* Catalog Grid by Category */
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

                      <ItemPositionController
                        currentPosition={catIdx + 1}
                        totalCount={treatmentGroup.length}
                        onMove={(dir) => moveItem(item.id, dir)}
                        accentColor="emerald"
                      />
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
                        <>
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

                          {/* Discount Settings Block */}
                          <div className="bg-slate-100/90 p-2 rounded-lg border border-slate-200/80 space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-700 block">🏷️ Discounts & Rates Rules:</span>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-500 block font-medium">Fixed Discount (%):</span>
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={item.defaultDiscountPercent ?? ''}
                                    onChange={(e) => updateItem(itemIdxInAll, { defaultDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full pl-2 pr-5 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800"
                                    placeholder="0"
                                  />
                                  <span className="absolute right-1.5 top-1 text-slate-400 font-bold text-[11px]">%</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block font-medium">Fixed Discount (BDT):</span>
                                <div className="relative">
                                  <span className="absolute left-1.5 top-1 text-slate-400 font-bold text-[10px]">BDT</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.fixedDiscountAmount ?? ''}
                                    onChange={(e) => updateItem(itemIdxInAll, { fixedDiscountAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full pl-8 pr-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-emerald-800"
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-amber-700 block font-medium">Outdoor Discount (%):</span>
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={item.outdoorDiscountPercent ?? ''}
                                    onChange={(e) => updateItem(itemIdxInAll, { outdoorDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full pl-2 pr-5 py-1 bg-amber-50/50 border border-amber-300 rounded text-xs font-bold text-amber-900"
                                    placeholder="0"
                                  />
                                  <span className="absolute right-1.5 top-1 text-amber-500 font-bold text-[11px]">%</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-amber-700 block font-medium">Outdoor Fixed Disc. (BDT):</span>
                                <div className="relative">
                                  <span className="absolute left-1.5 top-1 text-amber-500 font-bold text-[10px]">BDT</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.outdoorDiscountAmount ?? ''}
                                    onChange={(e) => updateItem(itemIdxInAll, { outdoorDiscountAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full pl-8 pr-2 py-1 bg-amber-50/50 border border-amber-300 rounded text-xs font-bold text-amber-900"
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
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

                      <ItemPositionController
                        currentPosition={catIdx + 1}
                        totalCount={packageGroup.length}
                        onMove={(dir) => moveItem(item.id, dir)}
                        accentColor="teal"
                      />
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

                      <ItemPositionController
                        currentPosition={catIdx + 1}
                        totalCount={roomGroup.length}
                        onMove={(dir) => moveItem(item.id, dir)}
                        accentColor="indigo"
                      />
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

        {/* Category 4: Weekly Treatments */}
        <div className="bg-white rounded-2xl p-5 border border-sky-200 shadow-sm space-y-4 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>4. Weekly Treatments</span>
                <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full border border-sky-200">
                  Settings & Rates
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">Configure default rates, fixed discounts, outdoor discounts, and 10-day ratio calculation settings for Weekly Treatments (Ozon, ED, etc.).</p>
            </div>
            <button
              onClick={() => handleAddItem('additional_treatment')}
              className="text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200 cursor-pointer"
            >
              + Add Weekly Treatment
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              const addGroup = items.filter(i => i.category === 'additional_treatment');
              if (addGroup.length === 0) {
                return (
                  <div className="col-span-2 text-center py-6 text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No weekly treatments in catalog yet. Click "+ Add Weekly Treatment" above to create one.
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
                        <span className="text-[11px] text-sky-900 font-semibold">Weekly Treatment</span>
                      </div>

                      <ItemPositionController
                        currentPosition={catIdx + 1}
                        totalCount={addGroup.length}
                        onMove={(dir) => moveItem(item.id, dir)}
                        accentColor="sky"
                      />
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

                        {/* Discount Settings Block */}
                        <div className="bg-slate-100/90 p-2 rounded-lg border border-slate-200/80 space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-700 block">🏷️ Discounts & Rates Rules:</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">Fixed Discount (%):</span>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={item.defaultDiscountPercent ?? ''}
                                  onChange={(e) => updateItem(itemIdxInAll, { defaultDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                                  className="w-full pl-2 pr-5 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800"
                                  placeholder="0"
                                />
                                <span className="absolute right-1.5 top-1 text-slate-400 font-bold text-[11px]">%</span>
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">Fixed Discount (BDT):</span>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-slate-400 font-bold text-[10px]">BDT</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.fixedDiscountAmount ?? ''}
                                  onChange={(e) => updateItem(itemIdxInAll, { fixedDiscountAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                                  className="w-full pl-8 pr-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-emerald-800"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] text-amber-700 block font-medium">Outdoor Discount (%):</span>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={item.outdoorDiscountPercent ?? ''}
                                  onChange={(e) => updateItem(itemIdxInAll, { outdoorDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                                  className="w-full pl-2 pr-5 py-1 bg-amber-50/50 border border-amber-300 rounded text-xs font-bold text-amber-900"
                                  placeholder="0"
                                />
                                <span className="absolute right-1.5 top-1 text-amber-500 font-bold text-[11px]">%</span>
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] text-amber-700 block font-medium">Outdoor Fixed Disc. (BDT):</span>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-amber-500 font-bold text-[10px]">BDT</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.outdoorDiscountAmount ?? ''}
                                  onChange={(e) => updateItem(itemIdxInAll, { outdoorDiscountAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                                  className="w-full pl-8 pr-2 py-1 bg-amber-50/50 border border-amber-300 rounded text-xs font-bold text-amber-900"
                                  placeholder="0"
                                />
                              </div>
                            </div>
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
                                className="w-14 px-2 py-0.5 bg-white border border-slate-300 rounded text-center text-xs font-xs font-bold text-sky-900 focus:ring-1 focus:ring-sky-500"
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
      )}

    </div>
  );
};
