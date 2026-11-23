import React, { useState } from 'react';
import { User, Department, Unit, ViaturaUnidade, AeronaveUnidade, TipoAeronave, isCatUnitName, DEFAULT_SYSTEM_LOGO, getSystemLogo } from '../types';
import { storage } from '../services/storage';
import { formatPlacaViatura, isValidPlacaViatura } from '../utils/masks';
import { Building2, Plus, Edit2, Trash2, AlertCircle, Shield, Check, Search, ChevronDown, ChevronUp, Building, Image as ImageIcon, Upload, X as CloseIcon, Info, Car, Plane } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { TopLayerAlert } from './TopLayerAlert';

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
  const [showViaturaModal, setShowViaturaModal] = useState(false);
  const [showAeronaveModal, setShowAeronaveModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editingViatura, setEditingViatura] = useState<ViaturaUnidade | null>(null);
  const [editingAeronave, setEditingAeronave] = useState<AeronaveUnidade | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'dept' | 'unit' | 'viatura' | 'aeronave'; item: any; name: string } | null>(null);

  // Form states
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptLogoUrl, setDeptLogoUrl] = useState('');
  const [unitName, setUnitName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [unitLogoUrl, setUnitLogoUrl] = useState('');

  // Viatura form & unit selection states
  const [viaturaPlaca, setViaturaPlaca] = useState('');
  const [viaturaDescricao, setViaturaDescricao] = useState('');
  const [viaturaUnitId, setViaturaUnitId] = useState('');
  const [selectedUnitIdForViaturas, setSelectedUnitIdForViaturas] = useState<string | null>(null);
  const [savingViatura, setSavingViatura] = useState(false);

  // Aeronave form states (exclusivo unidade CAT)
  const [aeronaveTipo, setAeronaveTipo] = useState<'' | TipoAeronave>('');
  const [aeronavePrefixo, setAeronavePrefixo] = useState('');
  const [aeronaveDescricao, setAeronaveDescricao] = useState('');
  const [aeronaveUnitId, setAeronaveUnitId] = useState('');
  const [savingAeronave, setSavingAeronave] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const isAdmin = effectiveRole === 'Administrador';
  const isArmeiro = effectiveRole === 'Armeiro';
  const isAdminOrArmeiro = isAdmin || isArmeiro;
  const isPolicial = effectiveRole === 'Policial';
  const canManageViaturas = isGeral || isAdmin || isArmeiro;
  const canDeleteViaturas = isGeral || isAdmin;

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

  const handleOpenViaturaModal = (viatura?: ViaturaUnidade, presetUnitId?: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (viatura) {
      setEditingViatura(viatura);
      setViaturaPlaca(formatPlacaViatura(viatura.placa));
      setViaturaDescricao(viatura.descricao || '');
      setViaturaUnitId(viatura.unitId || '');
    } else {
      setEditingViatura(null);
      setViaturaPlaca('');
      setViaturaDescricao('');
      setViaturaUnitId(presetUnitId || currentUser.unitId || visibleUnits[0]?.id || '');
    }
    setShowViaturaModal(true);
  };

  const handleSaveViatura = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const formattedPlaca = formatPlacaViatura(viaturaPlaca);
    if (!isValidPlacaViatura(formattedPlaca)) {
      setErrorMsg('Placa inválida. Utilize o padrão AAA-XAXX (ex.: ABC-1D23), com letras maiúsculas e números.');
      return;
    }
    const cleanDesc = viaturaDescricao.trim();
    if (!cleanDesc) {
      setErrorMsg('Informe a descrição (marca e modelo) da viatura.');
      return;
    }
    if (!viaturaUnitId) {
      setErrorMsg('Selecione a unidade à qual a viatura pertence.');
      return;
    }

    const targetUnit = units.find(u => u.id === viaturaUnitId);
    setSavingViatura(true);
    try {
      const payload: Partial<ViaturaUnidade> = {
        placa: formattedPlaca,
        descricao: cleanDesc.slice(0, 160),
        unitId: viaturaUnitId,
        departmentId: targetUnit?.departmentId || currentUser.departmentId
      };
      const res = editingViatura
        ? await storage.updateViatura(editingViatura.id, payload)
        : await storage.saveViatura(payload);

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao salvar viatura.');
        return;
      }
      setShowViaturaModal(false);
      setSuccessMsg(editingViatura ? 'Viatura atualizada com sucesso.' : 'Viatura cadastrada com sucesso.');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar viatura.');
    } finally {
      setSavingViatura(false);
    }
  };

  const handleDeleteViatura = (viatura: ViaturaUnidade) => {
    setDeleteTarget({
      type: 'viatura',
      item: viatura,
      name: `viatura "${viatura.placa} — ${viatura.descricao}"`
    });
  };

  const handleOpenAeronaveModal = (aeronave?: AeronaveUnidade, presetUnitId?: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (aeronave) {
      setEditingAeronave(aeronave);
      setAeronaveTipo(aeronave.tipo);
      setAeronavePrefixo(aeronave.prefixo || '');
      setAeronaveDescricao(aeronave.descricao || '');
      setAeronaveUnitId(aeronave.unitId || '');
    } else {
      setEditingAeronave(null);
      setAeronaveTipo('');
      setAeronavePrefixo('');
      setAeronaveDescricao('');
      setAeronaveUnitId(presetUnitId || selectedUnitIdForViaturas || '');
    }
    setShowAeronaveModal(true);
  };

  const handleSaveAeronave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!aeronaveTipo) {
      setErrorMsg('Selecione o tipo da aeronave (AVIÃO ou HELICÓPTERO).');
      return;
    }
    const cleanPrefixo = aeronavePrefixo
      .toUpperCase()
      .replace(/[^A-Z0-9\- ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
    if (!cleanPrefixo || cleanPrefixo.length < 2) {
      setErrorMsg('Informe o prefixo da aeronave (ex.: PT-PCG).');
      return;
    }
    const cleanDesc = aeronaveDescricao.trim().slice(0, 200);
    if (!cleanDesc) {
      setErrorMsg('Informe a descrição da aeronave.');
      return;
    }
    const targetUnit = units.find(u => u.id === aeronaveUnitId);
    if (!targetUnit || !isCatUnitName(targetUnit.name)) {
      setErrorMsg('O cadastro de aeronaves é permitido exclusivamente para a unidade CAT.');
      return;
    }

    setSavingAeronave(true);
    try {
      const payload: Partial<AeronaveUnidade> = {
        tipo: aeronaveTipo,
        prefixo: cleanPrefixo,
        descricao: cleanDesc,
        unitId: targetUnit.id,
        departmentId: targetUnit.departmentId || currentUser.departmentId
      };
      const res = editingAeronave
        ? await storage.updateAeronave(editingAeronave.id, payload)
        : await storage.saveAeronave(payload);

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao salvar aeronave.');
        return;
      }
      setShowAeronaveModal(false);
      setSuccessMsg(editingAeronave ? 'Aeronave atualizada com sucesso.' : 'Aeronave cadastrada com sucesso.');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar aeronave.');
    } finally {
      setSavingAeronave(false);
    }
  };

  const handleDeleteAeronave = (aeronave: AeronaveUnidade) => {
    setDeleteTarget({
      type: 'aeronave',
      item: aeronave,
      name: `aeronave "${aeronave.tipo} ${aeronave.prefixo} — ${aeronave.descricao}"`
    });
  };

  const confirmExecutionDelete = async () => {
    if (!deleteTarget) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTarget.type === 'dept') {
        await storage.deleteDepartment(deleteTarget.item.id);
        setSuccessMsg(`Departamento "${deleteTarget.item.name}" excluído com sucesso.`);
      } else if (deleteTarget.type === 'unit') {
        await storage.deleteUnit(deleteTarget.item.id);
        setSuccessMsg(`Unidade "${deleteTarget.item.name}" excluída com sucesso.`);
      } else if (deleteTarget.type === 'aeronave') {
        const res = await storage.deleteAeronave(deleteTarget.item.id);
        if (!res.success) {
          setErrorMsg(res.error || 'Não foi possível excluir a aeronave.');
          return;
        }
        setSuccessMsg(`Aeronave "${deleteTarget.item.prefixo}" excluída com sucesso.`);
      } else {
        const res = await storage.deleteViatura(deleteTarget.item.id);
        if (!res.success) {
          setErrorMsg(res.error || 'Não foi possível excluir a viatura.');
          return;
        }
        setSuccessMsg(`Viatura "${deleteTarget.item.placa}" excluída com sucesso.`);
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
          <div className="flex flex-wrap items-center gap-2.5">
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

      <TopLayerAlert type="success" message={successMsg} onClose={() => setSuccessMsg('')} />
      <TopLayerAlert type="error" message={errorMsg} onClose={() => setErrorMsg('')} />

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
                          const unitViaturaCount = storage.getViaturas().filter(v => v.unitId === unit.id).length;
                          const unitIsCat = isCatUnitName(unit.name);
                          const unitAeronaveCount = unitIsCat
                            ? storage.getAeronaves().filter(a => a.unitId === unit.id).length
                            : 0;
                          const effectiveUnitLogo = getSystemLogo(unit, dept);
                          const isSelectedUnit = selectedUnitIdForViaturas === unit.id;

                          return (
                            <div
                              key={unit.id}
                              onClick={() => {
                                if (!canManageViaturas) return;
                                setSelectedUnitIdForViaturas(prev => (prev === unit.id ? null : unit.id));
                              }}
                              className={`bg-slate-900 border rounded-xl p-4 flex flex-col justify-between space-y-3 transition ${
                                canManageViaturas ? 'cursor-pointer' : ''
                              } ${
                                isSelectedUnit
                                  ? 'border-cyan-400 ring-1 ring-cyan-400/40 shadow-md shadow-cyan-500/10'
                                  : 'border-slate-800 hover:border-slate-700'
                              }`}
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

                              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
                                  <span>Policiais: <strong className="text-slate-200">{unitUserCount}</strong></span>
                                  <span>Armas: <strong className="text-amber-400">{unitWeaponCount}</strong></span>
                                  <span>
                                    Viaturas: <strong className="text-cyan-400">{unitViaturaCount}</strong>
                                  </span>
                                  {unitIsCat && (
                                    <span>
                                      Aeronaves: <strong className="text-sky-400">{unitAeronaveCount}</strong>
                                    </span>
                                  )}
                                </div>
                                {canManageViaturas && (
                                  <div className="flex items-center justify-between text-[10px] pt-1">
                                    <span className={isSelectedUnit ? 'text-cyan-300 font-bold' : 'text-slate-500'}>
                                      {isSelectedUnit
                                        ? unitIsCat
                                          ? '✓ Unidade selecionada — Viaturas e Aeronaves abaixo'
                                          : '✓ Unidade selecionada — Viaturas abaixo'
                                        : unitIsCat
                                        ? 'Clique para gerenciar viaturas e aeronaves'
                                        : 'Clique para gerenciar viaturas'}
                                    </span>
                                  </div>
                                )}
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

      {/* Gestão de Viaturas (e Aeronaves exclusivamente para CAT) — Visível APENAS quando uma unidade é selecionada */}
      {canManageViaturas && (() => {
        const selectedUnitForViaturas = visibleUnits.find(u => u.id === selectedUnitIdForViaturas) || null;
        if (!selectedUnitForViaturas) return null;

        const unitViaturas = storage
          .getViaturas()
          .filter(v => v.unitId === selectedUnitForViaturas.id);
        const isSelectedUnitCat = isCatUnitName(selectedUnitForViaturas.name);
        const unitAeronaves = isSelectedUnitCat
          ? storage.getAeronaves().filter(a => a.unitId === selectedUnitForViaturas.id)
          : [];

        return (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl overflow-hidden shadow-md">
              <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">
                      Viaturas — {selectedUnitForViaturas.name} ({unitViaturas.length})
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Acrescente ou edite as viaturas vinculadas à unidade selecionada para uso nos relatórios de operações.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleOpenViaturaModal(undefined, selectedUnitForViaturas.id)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Viatura</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUnitIdForViaturas(null)}
                    className="text-slate-400 hover:text-slate-200 bg-slate-950/60 p-2 rounded-xl border border-slate-800 transition"
                    title="Fechar painel da unidade"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 bg-slate-950/40">
                {unitViaturas.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-4">
                    Nenhuma viatura cadastrada nesta unidade. Clique em &ldquo;Adicionar Viatura&rdquo; para cadastrar.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {unitViaturas.map(v => (
                      <div
                        key={v.id}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-start justify-between gap-2 hover:border-slate-700 transition"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                              {v.placa}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold truncate max-w-[180px]">
                              {selectedUnitForViaturas.name}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-200 truncate" title={v.descricao}>
                            {v.descricao}
                          </p>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenViaturaModal(v)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition"
                            title="Editar Viatura"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {canDeleteViaturas && (
                            <button
                              type="button"
                              onClick={() => handleDeleteViatura(v)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                              title="Excluir Viatura"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Gestão de Aeronaves — Disponível EXCLUSIVAMENTE ao selecionar a unidade CAT */}
            {isSelectedUnitCat && (
              <div className="bg-slate-900 border border-sky-500/40 rounded-2xl overflow-hidden shadow-md">
                <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl">
                      <Plane className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-100">
                        Aeronaves — {selectedUnitForViaturas.name} ({unitAeronaves.length})
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Cadastro exclusivo da unidade CAT (Aviões e Helicópteros) para vinculação de tripulantes e relatórios operacionais.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenAeronaveModal(undefined, selectedUnitForViaturas.id)}
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Aeronave</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 bg-slate-950/40">
                  {unitAeronaves.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">
                      Nenhuma aeronave cadastrada na unidade CAT. Clique em &ldquo;Adicionar Aeronave&rdquo; para cadastrar.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {unitAeronaves.map(a => (
                        <div
                          key={a.id}
                          className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-start justify-between gap-2 hover:border-slate-700 transition"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">
                                {a.prefixo}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                                {a.tipo}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-200 truncate" title={a.descricao}>
                              {a.descricao}
                            </p>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenAeronaveModal(a)}
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition"
                              title="Editar Aeronave"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {canDeleteViaturas && (
                              <button
                                type="button"
                                onClick={() => handleDeleteAeronave(a)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                                title="Excluir Aeronave"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

      {/* Modal Viatura */}
      {showViaturaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Car className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-slate-100">
                  {editingViatura ? 'Editar Viatura' : 'Cadastrar Nova Viatura'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowViaturaModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveViatura} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Unidade Pertencente *
                </label>
                <select
                  value={viaturaUnitId}
                  onChange={(e) => setViaturaUnitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                >
                  <option value="">Selecione a unidade...</option>
                  {visibleUnits
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                    .map(u => {
                      const d = departments.find(dep => dep.id === u.departmentId);
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name}{d ? ` (${d.code || d.name})` : ''}
                        </option>
                      );
                    })}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  A viatura ficará disponível para seleção nos relatórios de operações da unidade informada.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Placa da Viatura (Padrão Mercosul AAA-XAXX) *
                </label>
                <input
                  type="text"
                  value={viaturaPlaca}
                  onChange={(e) => setViaturaPlaca(formatPlacaViatura(e.target.value))}
                  maxLength={8}
                  placeholder="Ex.: ABC-1D23"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Descrição (Marca e Modelo) *
                </label>
                <input
                  type="text"
                  value={viaturaDescricao}
                  onChange={(e) => setViaturaDescricao(e.target.value.slice(0, 160))}
                  maxLength={160}
                  placeholder="Ex.: GM Trailblazer 4x4 Caracterizada"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowViaturaModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingViatura}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl disabled:opacity-50"
                >
                  {savingViatura ? 'Salvando...' : editingViatura ? 'Salvar Alterações' : 'Cadastrar Viatura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Aeronave (Exclusivo Unidade CAT) */}
      {showAeronaveModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Plane className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-slate-100">
                  {editingAeronave ? 'Editar Aeronave' : 'Cadastrar Nova Aeronave'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAeronaveModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAeronave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Unidade Pertencente
                </label>
                <div className="w-full bg-slate-950/70 border border-sky-500/30 rounded-xl px-3.5 py-2 text-sm text-sky-300 font-bold">
                  {units.find(u => u.id === aeronaveUnitId)?.name || 'CAT'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo da Aeronave *
                </label>
                <select
                  value={aeronaveTipo}
                  onChange={(e) => setAeronaveTipo(e.target.value as '' | TipoAeronave)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  required
                >
                  <option value="">Selecione o tipo...</option>
                  <option value="AVIÃO">AVIÃO</option>
                  <option value="HELICÓPTERO">HELICÓPTERO</option>
                </select>
              </div>

              {aeronaveTipo && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Prefixo da Aeronave *
                    </label>
                    <input
                      type="text"
                      value={aeronavePrefixo}
                      onChange={(e) =>
                        setAeronavePrefixo(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9\- ]/g, '').slice(0, 24)
                        )
                      }
                      maxLength={24}
                      placeholder={aeronaveTipo === 'HELICÓPTERO' ? 'Ex.: PP-EIM / PR-PCG' : 'Ex.: PT-PCG'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Descrição da Aeronave *
                    </label>
                    <input
                      type="text"
                      value={aeronaveDescricao}
                      onChange={(e) => setAeronaveDescricao(e.target.value.slice(0, 200))}
                      maxLength={200}
                      placeholder={
                        aeronaveTipo === 'HELICÓPTERO'
                          ? 'Ex.: Airbus H125 Esquilo B3e — Carcará 01'
                          : 'Ex.: Cessna 208B Grand Caravan'
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAeronaveModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAeronave || !aeronaveTipo}
                  className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl disabled:opacity-50"
                >
                  {savingAeronave ? 'Salvando...' : editingAeronave ? 'Salvar Alterações' : 'Cadastrar Aeronave'}
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
