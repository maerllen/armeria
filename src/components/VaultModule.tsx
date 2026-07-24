import React, { useState } from 'react';
import { User, VaultSpace, VaultSpaceType, Department, Unit } from '../types';
import { storage } from '../services/storage';
import { Vault, Plus, Trash2, AlertCircle, Check, Crosshair, Disc } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface VaultModuleProps {
  currentUser: User;
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const VaultModule: React.FC<VaultModuleProps> = ({
  currentUser,
  vaultSpaces,
  departments,
  units,
  onRefresh
}) => {
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<VaultSpaceType>('ARMAS');
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetVault, setDeleteTargetVault] = useState<VaultSpace | null>(null);

  const isGeral = currentUser.role === 'Geral';
  const isAdminOrArmeiro = currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const isPolicial = currentUser.role === 'Policial';

  // Available departments & units for modal
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const availableUnitsForModal = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  const handleOpenModal = () => {
    setErrorMsg('');
    setCode('');
    setType('ARMAS');
    const initialDept = isGeral ? (departments[0]?.id || '') : currentUser.departmentId;
    setDeptId(initialDept);
    const initialUnits = units.filter(u => u.departmentId === initialDept);
    setUnitId(initialUnits[0]?.id || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!code.trim()) {
      setErrorMsg('Informe a identificação/código do local.');
      return;
    }
    if (!unitId) {
      setErrorMsg('Selecione uma unidade para o local do cofre.');
      return;
    }

    try {
      storage.addVaultSpace({
        code: code.trim().toUpperCase(),
        type,
        departmentId: deptId,
        unitId
      });
      setSuccessMsg(`Local de guarda "${code.toUpperCase()}" cadastrado com sucesso.`);
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar local do cofre.');
    }
  };

  const handleDelete = (vault: VaultSpace) => {
    setDeleteTargetVault(vault);
  };

  const confirmExecuteDeleteVault = () => {
    if (!deleteTargetVault) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      storage.deleteVaultSpace(deleteTargetVault.id);
      setSuccessMsg(`Local do cofre "${deleteTargetVault.code}" excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir local do cofre.');
    } finally {
      setDeleteTargetVault(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Vault className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão de Locais no Cofre</h1>
            <p className="text-xs text-slate-400">
              Mapeamento físico do cofre da unidade (Espaços reservados para Armas e Munições)
            </p>
          </div>
        </div>

        {!isPolicial && (
          <button
            onClick={handleOpenModal}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Espaço no Cofre</span>
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

      {/* Grid of Vault Spaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vaultSpaces.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs italic">
            Nenhum local do cofre cadastrado para sua unidade/departamento.
          </div>
        ) : (
          vaultSpaces.map((v) => {
            const dept = departments.find(d => d.id === v.departmentId);
            const unit = units.find(u => u.id === v.unitId);

            // Stored content details
            const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === v.id && w.status === 'No Cofre');
            const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);

            return (
              <div
                key={v.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-black text-amber-400 font-mono tracking-wider">
                        {v.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center space-x-1 ${
                          v.type === 'ARMAS'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                        }`}
                      >
                        {v.type === 'ARMAS' ? <Crosshair className="w-3 h-3" /> : <Disc className="w-3 h-3" />}
                        <span>{v.type}</span>
                      </span>
                    </div>

                    {!isPolicial && (
                      <button
                        onClick={() => handleDelete(v)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                        title="Excluir Local"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-slate-300 space-y-0.5">
                    <p className="font-semibold text-slate-200">{unit ? unit.name : 'Unidade N/A'}</p>
                    <p className="text-[11px] text-slate-400">{dept ? dept.name : ''}</p>
                  </div>
                </div>

                {/* Vault Inventory Preview */}
                <div className="pt-3 border-t border-slate-800/80 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                    Conteúdo Atual:
                  </span>
                  {v.type === 'ARMAS' ? (
                    storedWeapons.length === 0 ? (
                      <span className="text-slate-500 italic text-[11px]">Livre / Vazio</span>
                    ) : (
                      <div className="space-y-1">
                        {storedWeapons.map(w => (
                          <div key={w.id} className="text-[11px] bg-slate-950 p-2 rounded border border-slate-800 font-mono text-slate-200 flex justify-between">
                            <span>{w.type} {w.model}</span>
                            <span className="text-amber-400">{w.serialNumber}</span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    storedAmmo.length === 0 ? (
                      <span className="text-slate-500 italic text-[11px]">Vazio</span>
                    ) : (
                      <div className="space-y-1">
                        {storedAmmo.map(s => {
                          const cal = storage.getCalibers().find(c => c.id === s.caliberId);
                          return (
                            <div key={s.id} className="text-[11px] bg-slate-950 p-2 rounded border border-slate-800 font-mono text-slate-200 flex justify-between">
                              <span>Cal. {cal?.name || s.caliberId}</span>
                              <span className="text-cyan-400 font-bold">{s.quantity} un</span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Add Vault Space Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              Novo Espaço de Armazenamento no Cofre
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Código do Local (Ex: A1-G1 ou C1-L1)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: A1-G1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Armazenamento
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as VaultSpaceType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  <option value="ARMAS">ARMAS</option>
                  <option value="MUNIÇÕES">MUNIÇÕES</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Departamento
                </label>
                <select
                  value={deptId}
                  onChange={(e) => {
                    setDeptId(e.target.value);
                    const depUnits = units.filter(u => u.departmentId === e.target.value);
                    setUnitId(depUnits[0]?.id || '');
                  }}
                  disabled={!isGeral}
                  className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                    !isGeral
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                >
                  {availableDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Unidade
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  {availableUnitsForModal.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Cadastrar Local
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetVault}
        title="Excluir Local do Cofre Definitivamente"
        message={`Deseja realmente apagar permanentemente o local do cofre "${deleteTargetVault?.code}"?`}
        onConfirm={confirmExecuteDeleteVault}
        onCancel={() => setDeleteTargetVault(null)}
      />

    </div>
  );
};
