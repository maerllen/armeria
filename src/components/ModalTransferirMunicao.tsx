import React, { useState, useMemo, useEffect } from 'react';
import { AmmunitionStock, Caliber, Department, Unit, VaultSpace, User, AmmoTransfer, AmmoTransferItem, formatCaliberDisplay } from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { TopLayerAlert } from './TopLayerAlert';
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
  Disc
} from 'lucide-react';

interface TransferAmmoModalProps {
  initialStock?: AmmunitionStock | null;
  selectedUnitId?: string;
  stocks: AmmunitionStock[];
  calibers: Caliber[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  currentUser: User;
  onClose: () => void;
  onTransferSuccess?: (transfer: AmmoTransfer) => void;
}

interface TransferItemDraft {
  stockId: string;
  quantity: number;
}

export const ModalTransferirMunicao: React.FC<TransferAmmoModalProps> = ({
  initialStock,
  selectedUnitId,
  stocks,
  calibers,
  departments,
  units,
  vaultSpaces,
  currentUser,
  onClose,
  onTransferSuccess
}) => {
  const allDepartments = useMemo(() => {
    const fromStorage = storage.getAllDepartments();
    return fromStorage && fromStorage.length > 0 ? fromStorage : departments;
  }, [departments]);

  const allUnits = useMemo(() => {
    const fromStorage = storage.getAllUnits();
    return fromStorage && fromStorage.length > 0 ? fromStorage : units;
  }, [units]);

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const hasDeptWideScope =
    isGeral ||
    effectiveRole === 'Administrador' ||
    (effectiveRole === 'Armeiro' && currentUser.managementScope === 'department');

  const allowedOriginUnits = useMemo(() => {
    if (isGeral) return allUnits;
    if (hasDeptWideScope) {
      return allUnits.filter(u => u.departmentId === currentUser.departmentId);
    }
    return allUnits.filter(u => u.id === currentUser.unitId);
  }, [allUnits, isGeral, hasDeptWideScope, currentUser.departmentId, currentUser.unitId]);

  const canSelectOriginUnit = isGeral || (hasDeptWideScope && allowedOriginUnits.length > 1);

  const defaultOriginUnitId = (() => {
    if (initialStock?.unitId && allowedOriginUnits.some(u => u.id === initialStock.unitId)) {
      return initialStock.unitId;
    }
    if (selectedUnitId && allowedOriginUnits.some(u => u.id === selectedUnitId)) {
      return selectedUnitId;
    }
    if (currentUser.unitId && allowedOriginUnits.some(u => u.id === currentUser.unitId)) {
      return currentUser.unitId;
    }
    return allowedOriginUnits[0]?.id || currentUser.unitId || allUnits[0]?.id || '';
  })();

  const [originUnitId, setOriginUnitId] = useState<string>(defaultOriginUnitId);
  const originUnit = allUnits.find(u => u.id === originUnitId);
  const originDept = allDepartments.find(d => d.id === (originUnit?.departmentId || initialStock?.departmentId || currentUser.departmentId));

  // Destination selections
  const [destDeptId, setDestDeptId] = useState<string>('');

  const availableDestUnits = useMemo(() => {
    return allUnits.filter(u => (!destDeptId || u.departmentId === destDeptId) && u.id !== originUnitId);
  }, [allUnits, destDeptId, originUnitId]);

  const [destUnitId, setDestUnitId] = useState<string>(() => {
    const firstOther = allUnits.find(u => u.id !== defaultOriginUnitId);
    return firstOther?.id || '';
  });

  // Destination Armorer: lista todos os usuários com perfil de Armeiro da unidade selecionada
  const availableDestArmorers = useMemo(() => {
    if (!destUnitId) return [];
    const allUsers = storage.getAllUsersForLookup();
    return allUsers.filter(u =>
      u.unitId === destUnitId &&
      u.hasSystemAccess !== false &&
      (u.role === 'Armeiro' ||
        u.activeRole === 'Armeiro' ||
        (Array.isArray(u.roles) && u.roles.includes('Armeiro')))
    );
  }, [destUnitId]);

  const [destArmorerId, setDestArmorerId] = useState<string>('');

  useEffect(() => {
    if (availableDestArmorers.length > 0) {
      const armorer =
        availableDestArmorers.find(u => u.activeRole === 'Armeiro' || u.role === 'Armeiro') ||
        availableDestArmorers[0];
      setDestArmorerId(armorer?.id || '');
    } else {
      setDestArmorerId('');
    }
  }, [availableDestArmorers]);

  // Available stocks at the origin unit
  const availableOriginStocks = useMemo(() => {
    return stocks.filter(s => s.unitId === originUnitId && s.quantity > 0);
  }, [stocks, originUnitId]);

  // Selected ammo items drafts
  const [draftItems, setDraftItems] = useState<TransferItemDraft[]>(() => {
    if (initialStock && initialStock.unitId === defaultOriginUnitId && initialStock.quantity > 0) {
      return [{ stockId: initialStock.id, quantity: Math.min(50, initialStock.quantity) }];
    }
    return [];
  });

  // Transporter selection: Default is destination armorer; can be any officer from origin or destination unit
  const availableTransporters = useMemo(() => {
    const allUsers = storage.getAllUsersForLookup();
    return allUsers.filter(u =>
      (u.unitId === originUnitId || (destUnitId && u.unitId === destUnitId)) &&
      u.hasSystemAccess !== false
    );
  }, [originUnitId, destUnitId]);

  const [selectedTransporterUserId, setSelectedTransporterUserId] = useState<string>('');

  // Transporter and transfer details
  const [transporterName, setTransporterName] = useState('');
  const [transporterMasp, setTransporterMasp] = useState('');
  const [transporterCargo, setTransporterCargo] = useState('Investigador de Polícia');
  const [reason, setReason] = useState('Remanejamento de Estoque Operacional');
  const [observation, setObservation] = useState('');

  // Sync transporter with destination armorer by default
  useEffect(() => {
    if (destArmorerId) {
      const arm = availableDestArmorers.find(u => u.id === destArmorerId);
      if (arm) {
        setSelectedTransporterUserId(arm.id);
        setTransporterName(arm.name);
        setTransporterMasp(arm.masp);
        setTransporterCargo(arm.cargo || arm.role || 'Armeiro');
        return;
      }
    }
    const stillValid = availableTransporters.some(u => u.id === selectedTransporterUserId);
    if (!stillValid) {
      if (availableTransporters.length > 0) {
        const first = availableTransporters[0];
        setSelectedTransporterUserId(first.id);
        setTransporterName(first.name);
        setTransporterMasp(first.masp);
        setTransporterCargo(first.cargo || first.role || 'Policial');
      } else {
        setSelectedTransporterUserId('');
      }
    }
  }, [destArmorerId, availableDestArmorers, availableTransporters, selectedTransporterUserId]);

  // Selection form helpers (Cascata: Fabricante -> Calibre -> Locais no cofre com lote, ano e saldo -> Quantidade)
  const availableOriginFabricantes = useMemo(() => {
    const fabs = availableOriginStocks.map(s => {
      const cal = calibers.find(c => c.id === s.caliberId);
      return (s.fabricante || cal?.fabricante || 'CBC').trim();
    });
    return Array.from(new Set(fabs.filter(Boolean)));
  }, [availableOriginStocks, calibers]);

  const [selectedAddFabricante, setSelectedAddFabricante] = useState<string>('');

  useEffect(() => {
    if (availableOriginFabricantes.length > 0) {
      if (!selectedAddFabricante || !availableOriginFabricantes.includes(selectedAddFabricante)) {
        setSelectedAddFabricante(availableOriginFabricantes[0]);
      }
    } else {
      setSelectedAddFabricante('');
    }
  }, [availableOriginFabricantes, selectedAddFabricante]);

  // Calibres disponíveis do fabricante selecionado
  const availableOriginCalibers = useMemo(() => {
    if (!selectedAddFabricante) return [];
    const matching = availableOriginStocks.filter(s => {
      const cal = calibers.find(c => c.id === s.caliberId);
      const fab = (s.fabricante || cal?.fabricante || 'CBC').trim();
      return fab.toLowerCase() === selectedAddFabricante.toLowerCase();
    });
    const cIds = Array.from(new Set(matching.map(s => s.caliberId)));
    return calibers.filter(c => cIds.includes(c.id));
  }, [availableOriginStocks, selectedAddFabricante, calibers]);

  const [selectedAddCaliberId, setSelectedAddCaliberId] = useState<string>('');

  useEffect(() => {
    if (availableOriginCalibers.length > 0) {
      if (!selectedAddCaliberId || !availableOriginCalibers.some(c => c.id === selectedAddCaliberId)) {
        setSelectedAddCaliberId(availableOriginCalibers[0].id);
      }
    } else {
      setSelectedAddCaliberId('');
    }
  }, [availableOriginCalibers, selectedAddCaliberId]);

  // Locais no cofre onde o calibre selecionado está cadastrado
  const availableVaultStocksForSelection = useMemo(() => {
    if (!selectedAddFabricante || !selectedAddCaliberId) return [];
    return availableOriginStocks.filter(s => {
      const cal = calibers.find(c => c.id === s.caliberId);
      const fab = (s.fabricante || cal?.fabricante || 'CBC').trim();
      const matchFab = fab.toLowerCase() === selectedAddFabricante.toLowerCase();
      const matchCal = s.caliberId === selectedAddCaliberId;
      return matchFab && matchCal && s.quantity > 0;
    });
  }, [availableOriginStocks, selectedAddFabricante, selectedAddCaliberId, calibers]);

  const [addingStockId, setAddingStockId] = useState<string>('');
  const [addingQuantity, setAddingQuantity] = useState<number>(50);

  useEffect(() => {
    if (availableVaultStocksForSelection.length > 0) {
      const unselected = availableVaultStocksForSelection.filter(s => !draftItems.some(d => d.stockId === s.id));
      const target = unselected[0] || availableVaultStocksForSelection[0];
      setAddingStockId(target.id);
      setAddingQuantity(Math.min(50, target.quantity));
    } else {
      setAddingStockId('');
    }
  }, [availableVaultStocksForSelection, draftItems]);

  // Confirmation Alert Dialog State
  const [showConfirmAlert, setShowConfirmAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddDraftItem = () => {
    if (!addingStockId) return;
    const stock = availableOriginStocks.find(s => s.id === addingStockId);
    if (!stock) return;
    if (addingQuantity <= 0 || addingQuantity > stock.quantity) {
      setError(`Quantidade deve ser entre 1 e ${stock.quantity} unidades.`);
      return;
    }
    setError(null);
    setDraftItems(prev => [...prev, { stockId: addingStockId, quantity: addingQuantity }]);
  };

  const handleRemoveDraftItem = (stockId: string) => {
    setDraftItems(prev => prev.filter(d => d.stockId !== stockId));
  };

  const handleUpdateDraftQuantity = (stockId: string, newQty: number) => {
    const stock = availableOriginStocks.find(s => s.id === stockId);
    if (!stock) return;
    const clamped = Math.max(1, Math.min(stock.quantity, newQty));
    setDraftItems(prev => prev.map(d => d.stockId === stockId ? { ...d, quantity: clamped } : d));
  };

  const handleDestDeptChange = (newDeptId: string) => {
    setDestDeptId(newDeptId);
    const newAvailableUnits = allUnits.filter(u => (!newDeptId || u.departmentId === newDeptId) && u.id !== originUnitId);
    const firstUnit = newAvailableUnits[0]?.id || '';
    setDestUnitId(firstUnit);
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isGeral && !allowedOriginUnits.some(u => u.id === originUnitId)) {
      setError(
        hasDeptWideScope
          ? 'Você só possui permissão para transferir munições pertencentes às unidades do seu departamento.'
          : 'Você só possui permissão para transferir munições pertencentes à sua própria unidade.'
      );
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

    if (draftItems.length === 0) {
      setError('Selecione pelo menos um lote de munição para transferir.');
      return;
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

    setShowConfirmAlert(true);
  };

  const handleExecuteTransfer = async () => {
    setError(null);

    const destUnitObj = allUnits.find(u => u.id === destUnitId);
    const destDeptObj = allDepartments.find(d => d.id === (destUnitObj?.departmentId || destDeptId));
    const selectedArmorer = availableDestArmorers.find(u => u.id === destArmorerId);

    const itemsToTransfer = draftItems.map(d => {
      const st = availableOriginStocks.find(s => s.id === d.stockId)!;
      const cal = calibers.find(c => c.id === st.caliberId);
      const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);

      return {
        caliberId: st.caliberId,
        caliberName: cal?.name || st.caliberId,
        fabricante: st.fabricante || cal?.fabricante || undefined,
        tipoMunicao: st.tipoMunicao || cal?.tipo || undefined,
        pesoMunicao: st.pesoMunicao || cal?.peso || undefined,
        loteMunicao: st.loteMunicao || undefined,
        anoFabricacao: st.anoFabricacao || undefined,
        destinacao: st.destinacao || undefined,
        quantity: d.quantity,
        originVaultSpaceId: st.vaultSpaceId,
        originVaultCode: vault?.code || ''
      };
    });

    try {
      setLoading(true);
      const createdTransfer = await storage.transferAmmo({
        originDepartmentId: originDept?.id,
        originDepartmentName: originDept?.name,
        originUnitId: originUnit?.id,
        originUnitName: originUnit?.name,
        destinationDepartmentId: destDeptObj?.id || destDeptId,
        destinationDepartmentName: destDeptObj?.name || '',
        destinationUnitId: destUnitId,
        destinationUnitName: destUnitObj?.name || '',
        destinationArmorerId: selectedArmorer?.id,
        destinationArmorerName: selectedArmorer?.name,
        destinationArmorerMasp: selectedArmorer?.masp,
        receiverOrTransporterName: transporterName.trim(),
        receiverOrTransporterMasp: transporterMasp.trim(),
        receiverOrTransporterCargo: transporterCargo.trim(),
        reason: reason.trim(),
        items: itemsToTransfer,
        observation: observation.trim()
      });

      setShowConfirmAlert(false);
      if (onTransferSuccess) onTransferSuccess(createdTransfer);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao realizar transferência de munições.');
      setShowConfirmAlert(false);
    } finally {
      setLoading(false);
    }
  };

  const totalTransferUnits = draftItems.reduce((sum, d) => sum + d.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Transferência de Munições entre Unidades</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Envio formal de munições com custódia e recebimento pendente pelo Armeiro de destino
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handlePreSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <TopLayerAlert type="error" message={error} onClose={() => setError('')} />

          {/* Section: Unidade de Origem e Destino */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Origem */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                <span>1. Unidade de Origem (Remetente)</span>
              </div>

              {canSelectOriginUnit ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Selecionar Unidade de Origem {hasDeptWideScope && !isGeral ? `(${originDept?.code || originDept?.name || 'Seu Departamento'})` : ''}
                  </label>
                  <select
                    value={originUnitId}
                    onChange={(e) => {
                      const nextOrigin = e.target.value;
                      setOriginUnitId(nextOrigin);
                      setDraftItems([]);
                      if (destUnitId === nextOrigin) {
                        const altDest = allUnits.find(u => (!destDeptId || u.departmentId === destDeptId) && u.id !== nextOrigin);
                        setDestUnitId(altDest?.id || '');
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {allowedOriginUnits.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-1">
                  <div className="text-xs font-bold text-slate-200">{originUnit?.name || 'Sua Unidade'}</div>
                  <div className="text-[11px] text-slate-400">Departamento: {originDept?.name || originDept?.code || 'N/A'}</div>
                  <div className="text-[10px] text-amber-400/90 font-medium">Origem vinculada à sua lotação</div>
                </div>
              )}

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Lotes disponíveis no cofre da origem:</span>
                <span className="font-mono font-bold text-slate-200">{availableOriginStocks.length}</span>
              </div>
            </div>

            {/* Destino */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                <span>2. Destino (Departamento, Unidade e Armeiro)</span>
              </div>

              {/* Departamento */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Departamento de Destino
                </label>
                <select
                  value={destDeptId}
                  onChange={(e) => handleDestDeptChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Todos os Departamentos</option>
                  {allDepartments.map(d => (
                    <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                  ))}
                </select>
              </div>

              {/* Unidade */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Unidade Policial de Destino <span className="text-sky-400">*</span>
                </label>
                <select
                  value={destUnitId}
                  onChange={(e) => setDestUnitId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-medium"
                  required
                >
                  {availableDestUnits.length === 0 ? (
                    <option value="">Nenhuma outra unidade disponível neste departamento</option>
                  ) : !destDeptId ? (
                    <>
                      {allDepartments.map(dept => {
                        const deptUnits = availableDestUnits.filter(u => u.departmentId === dept.id);
                        if (deptUnits.length === 0) return null;
                        return (
                          <optgroup key={dept.id} label={dept.code ? `${dept.code} - ${dept.name}` : dept.name}>
                            {deptUnits.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {availableDestUnits
                        .filter(u => !allDepartments.some(d => d.id === u.departmentId))
                        .map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </>
                  ) : (
                    availableDestUnits.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))
                  )}
                </select>
              </div>

              {/* Armeiro que irá receber */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Armeiro que irá Receber</span>
                  <span className="text-[10px] text-sky-400 font-mono">(Sinalizado no sistema)</span>
                </label>
                <select
                  value={destArmorerId}
                  onChange={(e) => setDestArmorerId(e.target.value)}
                  className="w-full bg-slate-900 border border-sky-600/70 focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-sky-200 font-medium"
                >
                  {availableDestArmorers.length === 0 ? (
                    <option value="">Nenhum usuário com perfil de Armeiro cadastrado nesta unidade</option>
                  ) : (
                    availableDestArmorers.map(arm => (
                      <option key={arm.id} value={arm.id}>
                        {arm.name} (MASP: {arm.masp}) - Armeiro
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  O armeiro selecionado receberá notificação no sistema e escolherá o cofre da unidade ao dar o recibo.
                </p>
              </div>
            </div>
          </div>

          {/* Section: Seleção de Munições */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Disc className="w-4 h-4" />
                <span>3. Munições a Transferir (Lotes e Quantidades)</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                Total a Enviar: <span className="text-emerald-400 text-sm">{totalTransferUnits}</span> un. ({draftItems.length} lote(s))
              </span>
            </div>

            {/* Adicionar Munição à Transferência */}
            {availableOriginStocks.length === 0 ? (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                Nenhum lote com saldo disponível no cofre da unidade remetente.
              </div>
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-slate-200">
                  Adicionar Lote à Lista de Envio (Cascata Técnica):
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* 1. Fabricante */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      1. Fabricante
                    </label>
                    <select
                      value={selectedAddFabricante}
                      onChange={(e) => setSelectedAddFabricante(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-semibold focus:border-amber-500"
                    >
                      {availableOriginFabricantes.length === 0 ? (
                        <option value="">Sem fabricantes</option>
                      ) : (
                        availableOriginFabricantes.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* 2. Calibre */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      2. Calibre daquele Fabricante
                    </label>
                    <select
                      value={selectedAddCaliberId}
                      onChange={(e) => setSelectedAddCaliberId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:border-amber-500"
                    >
                      {availableOriginCalibers.length === 0 ? (
                        <option value="">Nenhum calibre</option>
                      ) : (
                        availableOriginCalibers.map(c => (
                          <option key={c.id} value={c.id}>{formatCaliberDisplay(c)}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* 3. Locais no cofre onde está cadastrado */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      3. Local no Cofre • Lote • Ano • Saldo Disponível
                    </label>
                    <select
                      value={addingStockId}
                      onChange={(e) => {
                        const sId = e.target.value;
                        setAddingStockId(sId);
                        const found = availableVaultStocksForSelection.find(s => s.id === sId);
                        if (found) setAddingQuantity(Math.min(50, found.quantity));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-sky-500"
                    >
                      {availableVaultStocksForSelection.length === 0 ? (
                        <option value="">Nenhum cofre com este calibre no momento</option>
                      ) : (
                        availableVaultStocksForSelection.map(st => {
                          const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                          const isAlreadyAdded = draftItems.some(d => d.stockId === st.id);
                          return (
                            <option key={st.id} value={st.id} disabled={isAlreadyAdded}>
                              Cofre: {vault?.code || 'Padrão'} | Lote: {st.loteMunicao || 'S/L'} | Ano: {st.anoFabricacao || 'N/A'} (Saldo: {st.quantity} un.) {isAlreadyAdded ? '✓ Já Adicionado' : ''}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1 border-t border-slate-800/60">
                  <div className="md:col-span-9">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Quantidade a Transferir
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={availableVaultStocksForSelection.find(s => s.id === addingStockId)?.quantity || 999999}
                      value={addingQuantity}
                      onChange={(e) => setAddingQuantity(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={handleAddDraftItem}
                      disabled={!addingStockId || draftItems.some(d => d.stockId === addingStockId)}
                      className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center space-x-1 shadow"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Incluir Lote</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Items Table / List */}
            {draftItems.length > 0 && (
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="px-3 py-2.5">Calibre</th>
                      <th className="px-3 py-2.5">Fabricante / Lote / Ano</th>
                      <th className="px-3 py-2.5">Tipo / Peso</th>
                      <th className="px-3 py-2.5">Cofre Origem</th>
                      <th className="px-3 py-2.5 text-center">Qtd. a Transferir</th>
                      <th className="px-3 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {draftItems.map((draft) => {
                      const st = availableOriginStocks.find(s => s.id === draft.stockId)!;
                      const cal = calibers.find(c => c.id === st.caliberId);
                      const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);

                      return (
                        <tr key={draft.stockId} className="bg-slate-900/50 hover:bg-slate-800/40 transition">
                          <td className="px-3 py-2.5 font-bold text-amber-400">
                            {cal?.name || st.caliberId}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">
                            <span>{st.fabricante || cal?.fabricante || 'N/I'}</span>
                            <span className="text-slate-500 mx-1">•</span>
                            <span className="text-amber-300 font-semibold">{st.loteMunicao || 'S/L'}</span>
                            {st.anoFabricacao && <span className="text-slate-500 ml-1">({st.anoFabricacao})</span>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">
                            <span>{st.tipoMunicao || cal?.tipo || 'Operacional'}</span>
                            {(st.pesoMunicao || cal?.peso) && (
                              <span className="text-slate-400 ml-1">({st.pesoMunicao || cal?.peso})</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400">
                            {vault?.code || 'N/A'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="inline-flex items-center space-x-1.5">
                              <input
                                type="number"
                                min="1"
                                max={st.quantity}
                                value={draft.quantity}
                                onChange={(e) => handleUpdateDraftQuantity(draft.stockId, parseInt(e.target.value) || 1)}
                                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-emerald-400 text-xs font-mono"
                              />
                              <span className="text-[10px] text-slate-500">/ {st.quantity}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftItem(draft.stockId)}
                              className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
                              title="Remover este item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section: Responsável pelo Transporte e Justificativa */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>4. Responsável pelo Transporte e Justificativa</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Selecionar Policial Responsável pelo Transporte (Unidades Remetente / Destinatária)</span>
                <span className="text-[10px] text-sky-400 font-mono font-normal">Padrão: Armeiro que irá receber</span>
              </label>
              <select
                value={selectedTransporterUserId}
                onChange={(e) => {
                  const uId = e.target.value;
                  setSelectedTransporterUserId(uId);
                  const found = availableTransporters.find(u => u.id === uId);
                  if (found) {
                    setTransporterName(found.name);
                    setTransporterMasp(found.masp);
                    setTransporterCargo(found.cargo || found.role || 'Policial');
                  }
                }}
                className="w-full bg-slate-900 border border-sky-600/60 rounded-xl px-3 py-2 text-xs text-sky-200 font-medium focus:border-sky-400"
              >
                {availableTransporters.map(u => {
                  const isDest = u.unitId === destUnitId;
                  const isArm = u.id === destArmorerId;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} (MASP: {u.masp}) - {u.cargo || u.role} [{isDest ? 'Destino' : 'Origem'}]{isArm ? ' ★ Armeiro que irá receber (Padrão)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Nome do Policial Transportador <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="Nome completo do policial"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  MASP <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={transporterMasp}
                  onChange={(e) => setTransporterMasp(formatMasp(e.target.value))}
                  placeholder="Ex: 1.255.748-0 ou 125.574-8"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  CARGO
                </label>
                <input
                  type="text"
                  value={transporterCargo}
                  onChange={(e) => setTransporterCargo(e.target.value)}
                  placeholder="DELEGADO, PERITO, INVESTIGADOR, ESCRIVÃO..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Motivo / Justificativa da Transferência <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Reforço de munição para operação, remanejamento de suprimentos..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Observações Técnicas / Guia de Trânsito
              </label>
              <textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Número de ofício, portaria, lacres de transporte, caixas invioláveis..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Ao emitir, a munição constará como em trânsito até o recebimento pelo Armeiro de destino.</span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={draftItems.length === 0}
                className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg transition flex items-center space-x-1.5"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Emitir Transferência ({totalTransferUnits} un.)</span>
              </button>
            </div>
          </div>
        </form>

        {/* Confirmation Dialog Box */}
        {showConfirmAlert && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                  <AlertTriangle className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Confirmar Envio de Transferência</h3>
                  <p className="text-xs text-slate-400">Verifique os dados da tramitação antes de prosseguir</p>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Origem:</span>
                  <strong className="text-slate-200">{originUnit?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Destino:</span>
                  <strong className="text-sky-300">{allUnits.find(u => u.id === destUnitId)?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Armeiro Recebedor:</span>
                  <strong className="text-slate-200">{availableDestArmorers.find(u => u.id === destArmorerId)?.name || 'Responsável Local'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transportador:</span>
                  <strong className="text-slate-200">{transporterName} (MASP: {transporterMasp})</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Munições:</span>
                  <strong className="text-emerald-400 font-mono font-black">{totalTransferUnits} un. em {draftItems.length} lote(s)</strong>
                </div>
              </div>

              <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                O saldo será deduzido do cofre de origem. A munição herdará todas as especificações técnicas (fabricante, lote, calibre, tipo, peso, ano e destinação). O armeiro de destino escolherá apenas o cofre em sua unidade ao dar o recibo.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmAlert(false)}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
                >
                  Voltar e Revisar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTransfer}
                  disabled={loading}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processando Envio...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar e Despachar</span>
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
