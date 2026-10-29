import React, { useState } from 'react';
import { User, Department, Unit, DEFAULT_SYSTEM_LOGO, getSystemLogo } from '../types';
import { storage } from '../services/storage';
import { Building2, Plus, Edit2, Trash2, AlertCircle, Shield, Check, Search, ChevronDown, ChevronUp, Building, Image as ImageIcon, Upload, X as CloseIcon, Info } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';

interface UnitModuleProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const UnitModule: React.FC<UnitModuleProps> = ({
  currentUser,
  departments,
  units,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'dept' | 'unit'; item: any; name: string } | null>(null);

  // Form states
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptLogoUrl, setDeptLogoUrl] = useState('');
  const [unitName, setUnitName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [unitLogoUrl, setUnitLogoUrl] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isGeral = currentUser.role === 'Geral';
  const isAdminOrArmeiro = currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const isPolicial = currentUser.role === 'Policial';

  // Helper for reading image files as Base64 Data URL
  const handleImageUpload = (file: File, setter: (val: string) => void) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('A imagem deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setter(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Filter departments & units based on user profile
  const visibleDepts = isGeral
    ? departments
    : departments.filter(d => d.id === currentUser.departmentId);

  const visibleUnits = isGeral
    ? units
    : isAdminOrArmeiro
    ? units.filter(u => u.departmentId === currentUser.departmentId)
    : units.filter(u => u.id === currentUser.unitId);

  // Handlers for Department
  const handleOpenDeptModal = (dept?: Department) => {
    setErrorMsg('');
    if (dept) {
      setEditingDept(dept);
      setDeptName(dept.name);
      setDeptCode(dept.code);
      setDeptLogoUrl(dept.logoUrl || '');
    } else {
      setEditingDept(null);
      setDeptName('');
      setDeptCode('');
      setDeptLogoUrl('');
    }
    setShowDeptModal(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingDept) {
        await storage.updateDepartment(editingDept.id, deptName.trim(), deptCode.trim(), deptLogoUrl.trim() || undefined);
        setSuccessMsg('Departamento atualizado com sucesso.');
      } else {
        await storage.addDepartment({ name: deptName.trim(), code: deptCode.trim(), logoUrl: deptLogoUrl.trim() || undefined });
        setSuccessMsg('Novo departamento cadastrado com sucesso.');
      }
      setShowDeptModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar departamento.');
    }
  };

  const handleDeleteDept = (dept: Department) => {
    setDeleteTarget({ type: 'dept', item: dept, name: `departamento "${dept.name}"` });
  };

  const handleDeleteUnit = (unit: Unit) => {
    setDeleteTarget({ type: 'unit', item: unit, name: `unidade "${unit.name}"` });
  };

  // Handlers for Unit
  const handleOpenUnitModal = (unit?: Unit) => {
    setErrorMsg('');
    if (unit) {
      setEditingUnit(unit);
      setUnitName(unit.name);
      setSelectedDeptId(unit.departmentId);
      setUnitLogoUrl(unit.logoUrl || '');
    } else {
      setEditingUnit(null);
      setUnitName('');
      // If Admin or Armeiro, auto select their department
      setSelectedDeptId(isAdminOrArmeiro ? currentUser.departmentId : (departments[0]?.id || ''));
      setUnitLogoUrl('');
    }
    setShowUnitModal(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedDeptId) {
      setErrorMsg('Selecione um departamento para a unidade.');
      return;
    }

    try {
      if (editingUnit) {
        await storage.updateUnit(editingUnit.id, unitName.trim(), selectedDeptId, unitLogoUrl.trim() || undefined);
        setSuccessMsg('Unidade atualizada com sucesso.');
      } else {
        await storage.addUnit({ name: unitName.trim(), departmentId: selectedDeptId, logoUrl: unitLogoUrl.trim() || undefined });
        setSuccessMsg('Nova unidade cadastrada com sucesso.');
      }
      setShowUnitModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar unidade.');
    }
  };

  const confirmExecutionDelete = async () => {
    if (!deleteTarget) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTarget.type === 'dept') {
        await storage.deleteDepartment(deleteTarget.item.id);
        setSuccessMsg(`Departamento "${deleteTarget.item.name}" excluído com sucesso.`);
      } else {
        await storage.deleteUnit(deleteTarget.item.id);
        setSuccessMsg(`Unidade "${deleteTarget.item.name}" excluída com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível concluir a exclusão.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Toggle accordion expansion
  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  // Search filter for departments and units
  const term = searchTerm.toLowerCase().trim();
  const filteredDepts = visibleDepts.filter(dept => {
    if (!term) return true;
    const deptUnits = visibleUnits.filter(u => u.departmentId === dept.id);
    const matchesDept = dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term);
    const matchesUnit = deptUnits.some(u => u.name.toLowerCase().includes(term));
    return matchesDept || matchesUnit;
  });

  return (
    <div className="space-y-6">
      
      {/* Module Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Gestão de Unidades e Departamentos</h1>
              <p className="text-xs text-slate-400">
                Selecione um departamento para visualizar as unidades vinculadas.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {!isPolicial && (
          <div className="flex items-center space-x-3">
            {isGeral && (
              <button
                onClick={() => handleOpenDeptModal()}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Novo Departamento</span>
              </button>
            )}

            <button
              onClick={() => handleOpenUnitModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Unidade</span>
            </button>
          </div>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center space-x-3">
        <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por nome ou código do departamento ou nome da unidade..."
          className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded-lg"
          >
            Limpar
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Departments & Units List Accordion */}
      <div className="space-y-4">
        {filteredDepts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs italic">
            Nenhum departamento ou unidade encontrado para os critérios informados.
          </div>
        ) : (
          filteredDepts.map((dept) => {
            const deptUnits = visibleUnits.filter(u => u.departmentId === dept.id && (!term || u.name.toLowerCase().includes(term) || dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term)));
            const isExpanded = term !== '' || expandedDeptIds.includes(dept.id);

            return (
              <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
                
                {/* Department Header Clickable Row */}
                <div 
                  onClick={() => toggleDeptExpand(dept.id)}
                  className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="relative shrink-0">
                      <img
                        src={dept.logoUrl && dept.logoUrl.trim() ? dept.logoUrl.trim() : DEFAULT_SYSTEM_LOGO}
                        alt={`Logo ${dept.name}`}
                        className="w-11 h-11 object-contain rounded-xl bg-slate-950 p-1 border border-amber-500/30 shadow-md shadow-amber-500/5"
                        onError={(e) => {
                          if (e.currentTarget.src !== window.location.origin + DEFAULT_SYSTEM_LOGO) {
                            e.currentTarget.src = DEFAULT_SYSTEM_LOGO;
                          }
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                          {dept.code}
                        </span>
                        <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                        {dept.logoUrl && dept.logoUrl.trim() ? (
                          <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-medium">
                            Logo Própria
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-medium">
                            Logo Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {deptUnits.length} unidade(s) cadastrada(s)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {isGeral && (
                      <div className="flex items-center space-x-1 mr-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenDeptModal(dept)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700/80 rounded-lg transition"
                          title="Editar Departamento"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDept(dept)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/80 rounded-lg transition"
                          title="Excluir Departamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Units List (Shown when Expanded) */}
                {isExpanded && (
                  <div className="p-6 bg-slate-950/40 border-t border-slate-800/60">
                    {deptUnits.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">
                        Nenhuma unidade vinculada a este departamento.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {deptUnits.map((unit) => {
                          const unitUserCount = storage.getAllUsers().filter(u => u.unitId === unit.id).length;
                          const unitWeaponCount = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.unitId === unit.id).length;
                          const effectiveUnitLogo = getSystemLogo(unit, dept);

                          return (
                            <div
                              key={unit.id}
                              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition"
                            >
                              <div>
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center space-x-2.5">
                                    <img
                                      src={effectiveUnitLogo}
                                      alt={`Logo ${unit.name}`}
                                      className="w-9 h-9 object-contain rounded-lg bg-slate-950 p-1 border border-slate-700 shadow-sm shrink-0"
                                      onError={(e) => {
                                        if (e.currentTarget.src !== window.location.origin + DEFAULT_SYSTEM_LOGO) {
                                          e.currentTarget.src = DEFAULT_SYSTEM_LOGO;
                                        }
                                      }}
                                    />
                                    <div>
                                      <h3 className="font-bold text-slate-200 text-sm">{unit.name}</h3>
                                      <span className="text-[10px] text-slate-400 block">
                                        {unit.logoUrl && unit.logoUrl.trim()
                                          ? '★ Logo Exclusiva'
                                          : dept.logoUrl && dept.logoUrl.trim()
                                          ? '↳ Herdada do Depto'
                                          : '↳ Logo Padrão'}
                                      </span>
                                    </div>
                                  </div>
                                  {!isPolicial && (
                                    <div className="flex items-center space-x-1">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenUnitModal(unit); }}
                                        className="p-1 text-slate-400 hover:text-amber-400 rounded"
                                        title="Editar Unidade"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      {isGeral && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteUnit(unit); }}
                                          className="p-1 text-slate-400 hover:text-red-400 rounded"
                                          title="Excluir Unidade"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-2">
                                  Pertence a: <span className="text-slate-300 font-semibold">{dept.name}</span>
                                </p>
                              </div>

                              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                                <span>Policiais: <strong className="text-slate-200">{unitUserCount}</strong></span>
                                <span>Armas no acervo: <strong className="text-amber-400">{unitWeaponCount}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* Modal Department */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {editingDept ? 'Editar Departamento' : 'Novo Departamento'}
            </h3>
            <form onSubmit={handleSaveDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nome do Departamento
                </label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Ex: DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Código / Sigla
                </label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="Ex: DOE-COE"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Logo do Departamento */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Logo do Departamento (Opcional)
                </label>
                <p className="text-[11px] text-slate-400">
                  Caso não envie uma imagem, será utilizada a <strong>Logo Padrão</strong> (Distintivo PCMG).
                </p>

                <div className="flex items-center space-x-3 pt-1">
                  <div className="relative shrink-0">
                    <img
                      src={deptLogoUrl && deptLogoUrl.trim() ? deptLogoUrl.trim() : DEFAULT_SYSTEM_LOGO}
                      alt="Prévia Logo"
                      className="w-14 h-14 object-contain rounded-xl bg-slate-900 p-1 border border-amber-500/40 shadow-inner"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Selecionar Imagem...</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, setDeptLogoUrl);
                        }}
                      />
                    </label>

                    {deptLogoUrl && (
                      <button
                        type="button"
                        onClick={() => setDeptLogoUrl('')}
                        className="block text-[11px] text-red-400 hover:text-red-300 underline"
                      >
                        Remover Logo (Usar Logo Padrão)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Unit */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {editingUnit ? 'Editar Unidade' : 'Nova Unidade'}
            </h3>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Departamento Pertencente
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  disabled={!isGeral} // Admin & Armeiro can only create in their department
                  className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                    !isGeral
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                  required
                >
                  {visibleDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nome da Unidade
                </label>
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="Ex: INSPETORIA COE"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  required
                />
              </div>

              {/* Logo da Unidade */}
              {(() => {
                const currentDept = departments.find(d => d.id === selectedDeptId);
                const inheritedLogo = currentDept?.logoUrl && currentDept.logoUrl.trim()
                  ? currentDept.logoUrl.trim()
                  : DEFAULT_SYSTEM_LOGO;
                const activeUnitPreview = unitLogoUrl && unitLogoUrl.trim()
                  ? unitLogoUrl.trim()
                  : inheritedLogo;

                return (
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Logo da Unidade (Opcional)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Se não tiver logo própria, herdará a logo do <strong>{currentDept?.name || 'Departamento'}</strong>, ou a <strong>Logo Padrão</strong>.
                    </p>

                    <div className="flex items-center space-x-3 pt-1">
                      <div className="relative shrink-0">
                        <img
                          src={activeUnitPreview}
                          alt="Prévia Logo da Unidade"
                          className="w-14 h-14 object-contain rounded-xl bg-slate-900 p-1 border border-amber-500/40 shadow-inner"
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <label className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer transition">
                          <Upload className="w-3.5 h-3.5 text-amber-400" />
                          <span>Selecionar Imagem...</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file, setUnitLogoUrl);
                            }}
                          />
                        </label>

                        {unitLogoUrl ? (
                          <button
                            type="button"
                            onClick={() => setUnitLogoUrl('')}
                            className="block text-[11px] text-red-400 hover:text-red-300 underline"
                          >
                            Remover Logo (Herdar do Departamento)
                          </button>
                        ) : (
                          <span className="block text-[10px] text-slate-400 italic">
                            {currentDept?.logoUrl ? 'Atualmente herdando logo do departamento' : 'Atualmente usando logo padrão'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Confirmar Exclusão"
        message={`Deseja realmente excluir ${deleteTarget?.name || 'este item'}?`}
        onConfirm={confirmExecutionDelete}
        onCancel={() => setDeleteTarget(null)}
      />

    </div>
  );
};
