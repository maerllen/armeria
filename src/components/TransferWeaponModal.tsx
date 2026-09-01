import React, { useState, useMemo } from 'react';
import { Weapon, Department, Unit, VaultSpace, User, WeaponTransfer, WeaponTransferItem } from '../types';
import { storage } from '../services/storage';
import {
  ArrowRightLeft,
  Building2,
  Shield,
  UserCheck,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  X,
  Loader2,
  Info,
  Check,
  RotateCcw
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
  // Determine origin unit - Armeiro and Administrador are locked to their own privileged unit
  const isGeral = currentUser.role === 'Geral';
  const defaultOriginUnitId = (!isGeral && currentUser.unitId)
    ? currentUser.unitId
    : (initialWeapon?.unitId || currentUser.unitId || (units[0]?.id || ''));

  const [originUnitId, setOriginUnitId] = useState<string>(defaultOriginUnitId);
  const originUnit = units.find(u => u.id === originUnitId);
  const originDept = departments.find(d => d.id === (originUnit?.departmentId || initialWeapon?.departmentId || currentUser.departmentId));

  // Destination selections - can be ANY department and ANY unit
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

  // Selected weapons to transfer (must belong strictly to originUnitId)
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

  // Confirmation Alert Dialog State
  const [showConfirmAlert, setShowConfirmAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available weapons at the origin unit that can be transferred (status 'No Cofre' or 'Disponível')
  // Armeiros and Administradores only see weapons from their privileged unit
  const availableOriginWeapons = useMemo(() => {
    return weapons.filter(w => {
      if (w.unitId !== originUnitId) return false;
      // Cannot transfer if in transit, in class or already pending receipt
      if (w.status === 'Em Trânsito' || w.status === 'Em Aula' || w.status === 'Pendente de Recibo') return false;
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

  // Handle origin unit change (Geral only)
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

  // Pre-submit validation and trigger confirmation alert box
  const handlePreSubmit = (e: React.FormEvent) => {
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

    // Open confirmation alert dialog
    setShowConfirmAlert(true);
  };

  // Confirmed execution of weapon transfer
  const handleExecuteTransfer = async () => {
    setError(null);

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

      setShowConfirmAlert(false);

      if (typeof onTransferSuccess === 'function') {
        onTransferSuccess(createdTransfer);
      }
      if (typeof onSuccess === 'function') {
        onSuccess(createdTransfer);
      }
    } catch (err: any) {
      setShowConfirmAlert(false);
      setError(err.message || 'Erro ao realizar a transferência de armas.');
    } finally {
      setLoading(false);
    }
  };

  const selectedWeaponsList = useMemo(() => {
    return selectedWeaponIds.map(id => weapons.find(w => w.id === id)).filter(Boolean) as Weapon[];
  }, [selectedWeaponIds, weapons]);

  const destUnitObj = units.find(u => u.id === destUnitId);

  return (
    <div id="transfer-weapon-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl my-8 overflow-hidden relative">
        
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Transferência de Armas entre Unidades</h2>
              <p className="text-xs text-slate-400">
                {!isGeral 
                  ? `Armeiro / Administrador vinculado à unidade: ${originUnit?.name || 'Sua Unidade'}`
                  : 'Transferência e remanejamento de acervo bélico'}
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

        {/* Form Body */}
        <form onSubmit={handlePreSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Origin and Destination Units */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Origin Unit Card */}
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Building2 className="w-4 h-4" /> 1. Unidade de Origem (Remetente)
              </div>

              {!isGeral ? (
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-xs font-semibold text-white">
                    {originUnit?.name || 'Unidade não identificada'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {originDept?.name || 'Departamento'}
                  </div>
                  <div className="text-[10px] text-amber-400/90 font-mono mt-1">
                    * Você só possui privilégios para transferir armas desta unidade.
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Selecione a Unidade de Origem</label>
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
                <span>Armas disponíveis no cofre da sua unidade:</span>
                <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {availableOriginWeapons.length} arma(s)
                </span>
              </div>
            </div>

            {/* Destination Unit Card */}
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Building2 className="w-4 h-4" /> 2. Unidade de Destino (Recebedora)
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
              </div>

              <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>O armeiro do destino alocará o espaço no cofre ao receber.</span>
              </div>
            </div>

          </div>

          {/* Section 2: Weapons Selection */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>3. Seleção de Armamento ({selectedWeaponIds.length} selecionada(s))</span>
              </div>

              {availableOriginWeapons.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllAvailable}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                >
                  {selectedWeaponIds.length === availableOriginWeapons.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </button>
              )}
            </div>

            {availableOriginWeapons.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/60 rounded-lg border border-slate-800">
                Nenhuma arma disponível no cofre desta unidade para transferência no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
                {availableOriginWeapons.map(w => {
                  const isSelected = selectedWeaponIds.includes(w.id);
                  const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);

                  return (
                    <div
                      key={w.id}
                      onClick={() => toggleSelectWeapon(w.id)}
                      className={`cursor-pointer p-3 rounded-lg border text-xs transition-all flex items-start justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-amber-400 text-xs">
                            {w.serialNumber}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {w.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-medium">
                          {w.manufacturer} {w.model} ({w.caliber})
                        </p>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>Carregadores: {w.magazineQuantity || 0}</span>
                          {vault && <span>Local: {vault.code}</span>}
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-amber-500 text-slate-950 font-bold' : 'border border-slate-700 bg-slate-950'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Transporter & Justification */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <UserCheck className="w-4 h-4 text-amber-400" />
              <span>4. Policial Transportador / Responsável & Motivo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome do Policial Transportador *</label>
                <input
                  id="transfer-transporter-name-input"
                  type="text"
                  value={transporterName}
                  onChange={e => setTransporterName(e.target.value)}
                  placeholder="Nome completo do policial"
                  required
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">MASP do Policial *</label>
                <input
                  id="transfer-transporter-masp-input"
                  type="text"
                  value={transporterMasp}
                  onChange={e => setTransporterMasp(e.target.value)}
                  placeholder="Ex: 1234567-8"
                  required
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Cargo / Função</label>
                <input
                  id="transfer-transporter-cargo-input"
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
              <span>A transferência pode ser desfeita até que a unidade de destino receba no cofre.</span>
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
                <ArrowRightLeft className="w-4 h-4" />
                <span>Confirmar Transferência</span>
              </button>
            </div>
          </div>

        </form>

        {/* CONFIRMATION ALERTBOX MODAL */}
        {showConfirmAlert && (
          <div
            id="transfer-confirmation-alertbox"
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[60]"
          >
            <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              
              {/* Alert Header */}
              <div className="p-5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
                <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Confirmar Transferência de Armas?</h3>
                  <p className="text-xs text-amber-200/90">
                    Confirme os dados antes de despachar o armamento
                  </p>
                </div>
              </div>

              {/* Alert Body */}
              <div className="p-6 space-y-4 text-xs text-slate-300">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Origem:</span>
                    <strong className="text-slate-200">{originUnit?.name}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Destino:</span>
                    <strong className="text-emerald-300">{destUnitObj?.name}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Policial Transportador:</span>
                    <strong className="text-slate-200">{transporterName} (MASP: {transporterMasp})</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Motivo:</span>
                    <span className="text-slate-300">{reason}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400">Total de Armas:</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold">
                      {selectedWeaponsList.length} arma(s)
                    </span>
                  </div>
                </div>

                {/* Weapons List summary */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    Armas a serem transferidas:
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                    {selectedWeaponsList.map((w, idx) => (
                      <div key={w.id} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-900 last:border-none">
                        <span className="font-mono font-bold text-amber-400">{idx + 1}. {w.serialNumber}</span>
                        <span className="text-slate-300">{w.type} {w.model} ({w.caliber})</span>
                        <span className="text-slate-500 font-mono text-[10px]">{w.magazineQuantity || 0} carreg.</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Undo notice */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regra de Trânsito & Cancelamento:</span>
                  </div>
                  <p>
                    As armas entrarão no status <strong>"Pendente de Recibo"</strong>. A transferência poderá ser <strong>desfeita a qualquer momento</strong> até que o armamento seja recebido e conferido no cofre da unidade de destino.
                  </p>
                </div>

              </div>

              {/* Alert Actions */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmAlert(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                >
                  Voltar e Revisar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTransfer}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-amber-600/30"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Despachando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Sim, Confirmar e Despachar</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
