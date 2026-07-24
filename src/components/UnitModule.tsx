import React, { useState } from 'react';
import { User, Department, Unit } from '../types';
import { storage } from '../services/storage';
import { Building2, Plus, Edit2, Trash2, AlertCircle, Shield, Check } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

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
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'dept' | 'unit'; item: any; name: string } | null>(null);

  // Form states
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isGeral = currentUser.role === 'Geral';
  const isAdminOrArmeiro = currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const isPolicial = currentUser.role === 'Policial';

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
    } else {
      setEditingDept(null);
      setDeptName('');
      setDeptCode('');
    }
    setShowDeptModal(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingDept) {
        await storage.updateDepartment(editingDept.id, deptName.trim(), deptCode.trim());
        setSuccessMsg('Departamento atualizado com sucesso.');
      } else {
        await storage.addDepartment({ name: deptName.trim(), code: deptCode.trim() });
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
    } else {
      setEditingUnit(null);
      setUnitName('');
      // If Admin or Armeiro, auto select their department
      setSelectedDeptId(isAdminOrArmeiro ? currentUser.departmentId : (departments[0]?.id || ''));
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
        await storage.updateUnit(editingUnit.id, unitName.trim(), selectedDeptId);
        setSuccessMsg('Unidade atualizada com sucesso.');
      } else {
        await storage.addUnit({ name: unitName.trim(), departmentId: selectedDeptId });
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
                Estrutura organizacional da Polícia Civil (Cada unidade pertence a um único departamento)
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

      {/* Departments & Units List Cards */}
      <div className="space-y-6">
        {visibleDepts.map((dept) => {
          const deptUnits = visibleUnits.filter(u => u.departmentId === dept.id);

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              
              {/* Department Header */}
              <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                      {dept.code}
                    </span>
                    <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {deptUnits.length} unidade(s) cadastrada(s) neste departamento
                  </p>
                </div>

                {isGeral && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenDeptModal(dept)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded-lg transition"
                      title="Editar Departamento"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDept(dept)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                      title="Excluir Departamento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Units Table / Grid */}
              <div className="p-6">
                {deptUnits.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    Nenhuma unidade vinculada a este departamento.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {deptUnits.map((unit) => {
                      const unitUserCount = storage.getAllUsers().filter(u => u.unitId === unit.id).length;
                      const unitWeaponCount = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.unitId === unit.id).length;

                      return (
                        <div
                          key={unit.id}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <h3 className="font-bold text-slate-200 text-sm">{unit.name}</h3>
                              {!isPolicial && (
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleOpenUnitModal(unit)}
                                    className="p-1 text-slate-400 hover:text-amber-400 rounded"
                                    title="Editar Unidade"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {isGeral && (
                                    <button
                                      onClick={() => handleDeleteUnit(unit)}
                                      className="p-1 text-slate-400 hover:text-red-400 rounded"
                                      title="Excluir Unidade"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
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

            </div>
          );
        })}
      </div>

      {/* Modal Department */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
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
