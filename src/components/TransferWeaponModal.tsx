import React, { useState, useMemo } from 'react';
import { Weapon, Department, Unit, VaultSpace, User, WeaponTransfer, WeaponTransferItem } from '../types';
import { storage } from '../services/storage';
import {
  ArrowRightLeft,
  Building2,
  Shield,
  UserCheck,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Loader2,
  Info,
  Check
} from 'lucide-react';

interface TransferWeaponModalProps {
  initialWeapon?: Weapon | null;
  weapons: Weapon[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  currentUser: User;
  onClose: () => void;
  onTransferSuccess?: (transfer: WeaponTransfer) => void;
  onSuccess?: (transfer: WeaponTransfer) => void;
}

export const TransferWeaponModal: React.FC<TransferWeaponModalProps> = ({
  initialWeapon,
  weapons,
  departments,
  units,
  vaultSpaces,
  currentUser,
  onClose,
  onTransferSuccess,
  onSuccess
}) => {
  // Determine origin unit - Armeiro and Administrador are locked to their own unit
  const isGeral = currentUser.role === 'Geral';
  const defaultOriginUnitId = (!isGeral && currentUser.unitId)
    ? currentUser.unitId
    : (initialWeapon?.unitId || currentUser.unitId || (units[0]?.id || ''));

  const [originUnitId, setOriginUnitId] = useState<string>(defaultOriginUnitId);
  const originUnit = units.find(u => u.id === originUnitId);
  const originDept = departments.find(d => d.id === (originUnit?.departmentId || initialWeapon?.departmentId || currentUser.departmentId));

  // Destination selections
  const [destDeptId, setDestDeptId] = useState<string>(originDept?.id || (departments[0]?.id || ''));
  
  // Units filtered by destination department, excluding origin unit
  const availableDestUnits = useMemo(() => {
    return units.filter(u => (!destDeptId || u.departmentId === destDeptId) && u.id !== originUnitId);
  }, [units, destDeptId, originUnitId]);

  const [destUnitId, setDestUnitId] = useState<string>(availableDestUnits[0]?.id || '');

  // Vault spaces filtered by destination unit
  const destVaultSpaces = useMemo(() => {
    return vaultSpaces.filter(v => v.unitId === destUnitId);
  }, [vaultSpaces, destUnitId]);

  const [destVaultSpaceId, setDestVaultSpaceId] = useState<string>(destVaultSpaces[0]?.id || '');

  // Selected weapons to transfer (must belong to originUnitId)
  const [selectedWeaponIds, setSelectedWeaponIds] = useState<string[]>(() => {
    if (initialWeapon && initialWeapon.unitId === defaultOriginUnitId && initialWeapon.status !== 'Em Trânsito' && initialWeapon.status !== 'Em Aula' && initialWeapon.status !== 'Pendente de Recibo') {
      return [initialWeapon.id];
    }
    return [];
  });

  // Transporter and transfer details
  const [transporterName, setTransporterName] = useState('');
  const [transporterMasp, setTransporterMasp] = useState('');
  const [transporterCargo, setTransporterCargo] = useState('Investigador de Polícia');
  const [reason, setReason] = useState('');
  const [observation, setObservation] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available weapons at the origin unit that can be transferred (status 'No Cofre' or 'Disponível')
  const availableOriginWeapons = useMemo(() => {
    return weapons.filter(w => {
      if (w.unitId !== originUnitId) return false;
      // Cannot transfer if in transit or in class
      if (w.status === 'Em Trânsito' || w.status === 'Em Aula') return false;
      return true;
    });
  }, [weapons, originUnitId]);

  // Handle department change for destination
  const handleDestDeptChange = (newDeptId: string) => {
    setDestDeptId(newDeptId);
    const newAvailableUnits = units.filter(u => (!newDeptId || u.departmentId === newDeptId) && u.id !== originUnitId);
    const firstUnit = newAvailableUnits[0]?.id || '';
    setDestUnitId(firstUnit);
    const firstVault = vaultSpaces.find(v => v.unitId === firstUnit)?.id || '';
    setDestVaultSpaceId(firstVault);
  };

  // Handle destination unit change
  const handleDestUnitChange = (newUnitId: string) => {
    setDestUnitId(newUnitId);
    const firstVault = vaultSpaces.find(v => v.unitId === newUnitId)?.id || '';
    setDestVaultSpaceId(firstVault);
  };

  // Handle origin unit change
  const handleOriginUnitChange = (newOriginId: string) => {
    setOriginUnitId(newOriginId);
    setSelectedWeaponIds([]);
    // Update dest units
    const newAvailableDestUnits = units.filter(u => (!destDeptId || u.departmentId === destDeptId) && u.id !== newOriginId);
    if (destUnitId === newOriginId && newAvailableDestUnits.length > 0) {
      const nextDest = newAvailableDestUnits[0].id;
      setDestUnitId(nextDest);
      const firstVault = vaultSpaces.find(v => v.unitId === nextDest)?.id || '';
      setDestVaultSpaceId(firstVault);
    }
  };

  const toggleSelectWeapon = (weaponId: string) => {
    if (selectedWeaponIds.includes(weaponId)) {
      setSelectedWeaponIds(prev => prev.filter(id => id !== weaponId));
    } else {
      setSelectedWeaponIds(prev => [...prev, weaponId]);
    }
  };

  const handleSelectAllAvailable = () => {
    if (selectedWeaponIds.length === availableOriginWeapons.length) {
      setSelectedWeaponIds([]);
    } else {
      setSelectedWeaponIds(availableOriginWeapons.map(w => w.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isGeral && currentUser.unitId && originUnitId !== currentUser.unitId) {
      setError('Você só possui permissão para transferir armas pertencentes à sua própria unidade.');
      return;
    }

    if (!destUnitId) {
      setError('Por favor, selecione a unidade de destino.');
      return;
    }

    if (originUnitId === destUnitId) {
      setError('A unidade de destino deve ser diferente da unidade de origem.');
      return;
    }

    if (!destVaultSpaceId) {
      setError('A unidade de destino não possui cofre/local de guarda cadastrado. Cadastre um cofre primeiro na aba Cofre.');
      return;
    }

    if (selectedWeaponIds.length === 0) {
      setError('Selecione pelo menos uma arma para realizar a transferência.');
      return;
    }

    // Verify all selected weapons belong to originUnitId and actor's unit
    for (const wId of selectedWeaponIds) {
      const w = weapons.find(item => item.id === wId);
      if (!w) continue;
      if (!isGeral && currentUser.unitId && w.unitId !== currentUser.unitId) {
        setError(`A arma ${w.serialNumber} não pertence à sua unidade.`);
        return;
      }
    }

    if (!transporterName.trim()) {
      setError('Informe o nome do policial responsável pelo transporte/recebimento.');
      return;
    }

    if (!transporterMasp.trim()) {
      setError('Informe o MASP do policial transportador/recebedor.');
      return;
    }

    if (!reason.trim()) {
      setError('Informe o motivo/justificativa da transferência.');
      return;
    }

    const destUnitObj = units.find(u => u.id === destUnitId);
    const destDeptObj = departments.find(d => d.id === (destUnitObj?.departmentId || destDeptId));
    const destVaultObj = vaultSpaces.find(v => v.id === destVaultSpaceId);

    const itemsToTransfer: WeaponTransferItem[] = selectedWeaponIds.map(wId => {
      const w = weapons.find(item => item.id === wId)!;
      const v = vaultSpaces.find(vault => vault.id === w.vaultSpaceId);
      return {
        weaponId: w.id,
        serialNumber: w.serialNumber,
        type: w.type,
        model: w.model,
        manufacturer: w.manufacturer,
        caliber: w.caliber,
        magazineQuantity: w.magazineQuantity || 0,
        originVaultCode: v?.code || ''
      };
    });

    try {
      setLoading(true);
      const createdTransfer = await storage.transferWeapons({
        originDepartmentId: originDept?.id,
        originDepartmentName: originDept?.name,
        originUnitId: originUnit?.id,
        originUnitName: originUnit?.name,
        destinationDepartmentId: destDeptObj?.id || destDeptId,
        destinationDepartmentName: destDeptObj?.name || '',
        destinationUnitId: destUnitId,
        destinationUnitName: destUnitObj?.name || '',
        destinationVaultSpaceId: destVaultSpaceId,
        destinationVaultSpaceCode: destVaultObj?.code || 'Cofre Principal',
        receiverOrTransporterName: transporterName.trim(),
        receiverOrTransporterMasp: transporterMasp.trim(),
        receiverOrTransporterCargo: transporterCargo.trim(),
        reason: reason.trim(),
        weapons: itemsToTransfer,
        observation: observation.trim()
      });

      if (typeof onTransferSuccess === 'function') {
        onTransferSuccess(createdTransfer);
      }
      if (typeof onSuccess === 'function') {
        onSuccess(createdTransfer);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar a transferência de armas.');
    } finally {
      setLoading(false);
    }
  };

  const isGeralOrAdmin = currentUser.role === 'Geral' || currentUser.role === 'Administrador';

  return (
    <div id="transfer-weapon-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl my-8 overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Transferir Armas entre Unidades</h2>
              <p className="text-xs text-slate-400">
                Geração automática de guia/recibo em PDF com protocolo oficial
              </p>
            </div>
          </div>
          <button
            id="close-transfer-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-xs text-rose-300">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Origin & Destination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Origin Unit Card */}
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <Building2 className="w-4 h-4" /> 1. Unidade de Origem
                </div>
                {!isGeral && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Unidade Fixa
                  </span>
                )}
              </div>

              {!isGeral && currentUser.unitId ? (
                <div className="space-y-1.5 text-xs bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Unidade do seu perfil:</span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase">{currentUser.role}</span>
                  </div>
                  <p className="font-bold text-white text-sm">{originUnit?.name || 'Sua Unidade'}</p>
                  <p className="text-[11px] text-slate-400">{originDept?.name || 'Departamento'}</p>
                  <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800/60">
                    * Armeiros e Administradores só podem transferir armamento pertencente à sua própria unidade.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Selecionar Unidade de Origem (Acesso Geral)</label>
                  <select
                    id="transfer-origin-unit-select"
                    value={originUnitId}
                    onChange={e => handleOriginUnitChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
                <span>Armas disponíveis no cofre:</span>
                <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {availableOriginWeapons.length} arma(s)
                </span>
              </div>
            </div>

            {/* Destination Unit Card */}
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Building2 className="w-4 h-4" /> 2. Unidade de Destino
              </div>

              <div className="space-y-2.5">
                {departments.length > 1 && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Departamento de Destino</label>
                    <select
                      id="transfer-dest-dept-select"
                      value={destDeptId}
                      onChange={e => handleDestDeptChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    >
                      <option value="">Todos os Departamentos</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Unidade / Delegacia Destino *</label>
                  <select
                    id="transfer-dest-unit-select"
                    value={destUnitId}
                    onChange={e => handleDestUnitChange(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    {availableDestUnits.length === 0 ? (
                      <option value="">Nenhuma outra unidade disponível</option>
                    ) : (
                      availableDestUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Local de Guarda no Cofre Destino *</label>
                  <select
                    id="transfer-dest-vault-select"
                    value={destVaultSpaceId}
                    onChange={e => setDestVaultSpaceId(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    {destVaultSpaces.length === 0 ? (
                      <option value="">Sem cofre cadastrado nesta unidade</option>
                    ) : (
                      destVaultSpaces.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.code} ({v.type || 'Espaço de Guarda'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* Section 2: Weapons Selection Table */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-amber-400" /> 3. Seleção de Armamento ({selectedWeaponIds.length} selecionada(s))
              </div>
              {availableOriginWeapons.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllAvailable}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors underline cursor-pointer"
                >
                  {selectedWeaponIds.length === availableOriginWeapons.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </button>
              )}
            </div>

            {availableOriginWeapons.length === 0 ? (
              <div className="p-4 bg-slate-900/60 rounded-lg text-center text-xs text-slate-400">
                Não há armas com status &quot;No Cofre&quot; disponíveis para transferência nesta unidade de origem.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 sticky top-0 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2 w-10 text-center">Sel.</th>
                      <th className="p-2">Nº Série</th>
                      <th className="p-2">Tipo / Modelo</th>
                      <th className="p-2">Calibre</th>
                      <th className="p-2 text-center">Carregadores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {availableOriginWeapons.map(w => {
                      const isSelected = selectedWeaponIds.includes(w.id);
                      return (
                        <tr
                          key={w.id}
                          onClick={() => toggleSelectWeapon(w.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-500/15 text-white' : 'hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <td className="p-2 text-center">
                            <div className={`w-4 h-4 mx-auto rounded flex items-center justify-center border ${
                              isSelected ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-600'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </td>
                          <td className="p-2 font-mono font-bold text-amber-400">{w.serialNumber}</td>
                          <td className="p-2">{w.type} {w.model} ({w.manufacturer})</td>
                          <td className="p-2 font-mono">{w.caliber}</td>
                          <td className="p-2 text-center font-mono">{w.magazineQuantity || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3: Transporter & Reason */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <UserCheck className="w-4 h-4 text-amber-400" /> 4. Policial Transportador / Recebedor & Justificativa
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome do Policial Responsável *</label>
                <input
                  id="transporter-name-input"
                  type="text"
                  value={transporterName}
                  onChange={e => setTransporterName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo Silva"
                  required
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">MASP do Policial *</label>
                <input
                  id="transporter-masp-input"
                  type="text"
                  value={transporterMasp}
                  onChange={e => setTransporterMasp(e.target.value)}
                  placeholder="Ex: 123456-7"
                  required
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Cargo / Função</label>
                <input
                  id="transporter-cargo-input"
                  type="text"
                  value={transporterCargo}
                  onChange={e => setTransporterCargo(e.target.value)}
                  placeholder="Ex: Investigador de Polícia"
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Motivo / Justificativa da Transferência *</label>
              <input
                id="transfer-reason-input"
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Remanejamento de efetivo operacional / Suprimento de carga bélica"
                required
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Observações Adicionais (Opcional)</label>
              <textarea
                id="transfer-obs-input"
                rows={2}
                value={observation}
                onChange={e => setObservation(e.target.value)}
                placeholder="Informações adicionais, ordens de serviço ou detalhes pertinentes..."
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Ao confirmar, o status das armas será transferido e a guia oficial será gerada.</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                id="confirm-transfer-btn"
                type="submit"
                disabled={loading || selectedWeaponIds.length === 0 || !destUnitId}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-amber-600/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Confirmar Transferência</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
