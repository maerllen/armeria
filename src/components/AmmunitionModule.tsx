import React, { useState } from 'react';
import { User, Caliber, AmmunitionStock, AmmunitionMovement, VaultSpace, Department, Unit, AmmoMovementType } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Disc, Plus, ArrowUpRight, ArrowDownLeft, AlertCircle, Check, Shield, Search, Trash2, Printer, RotateCcw, FileText, UserX, UserCheck } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { AmmunitionReceiptModal } from './AmmunitionReceiptModal';

interface AmmunitionModuleProps {
  currentUser: User;
  calibers: Caliber[];
  stocks: AmmunitionStock[];
  movements: AmmunitionMovement[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  users?: User[];
  onRefresh: () => void;
}

export const AmmunitionModule: React.FC<AmmunitionModuleProps> = ({
  currentUser,
  calibers,
  stocks,
  movements,
  vaultSpaces,
  departments,
  units,
  users = [],
  onRefresh
}) => {
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Caliber Form
  const [caliberName, setCaliberName] = useState('');

  // Ammo Movement Form
  const [movementType, setMovementType] = useState<AmmoMovementType>('Saída');
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('Curso ou Teste');

  // Responsible Officer Form State
  const [responsibleType, setResponsibleType] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState('');
  const [customResponsibleName, setCustomResponsibleName] = useState('');
  const [customResponsibleMasp, setCustomResponsibleMasp] = useState('');

  // Observation (max 500 chars)
  const [observation, setObservation] = useState('');

  // Receipt Modal State
  const [selectedReceiptMov, setSelectedReceiptMov] = useState<AmmunitionMovement | null>(null);
  const [isReturnReceiptMode, setIsReturnReceiptMode] = useState(false);
  const [lastReturnedAmount, setLastReturnedAmount] = useState<number | undefined>(undefined);

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQuantity, setReturnQuantity] = useState<number>(0);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetAmmo, setDeleteTargetAmmo] = useState<{ type: 'caliber' | 'stock' | 'movement'; id: string; label: string } | null>(null);

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const canManageCalibers = isGeral || isArmeiro;
  const canManageStock = isGeral || isArmeiro || isAdmin || (currentUser.role === 'Policial' && currentUser.canMoveAmmunition);

  // Available vault spaces for ammo: MUST BE TYPE MUNIÇÕES
  const ammoVaultSpaces = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');

  // Open Movement Modal
  const handleOpenMovementModal = () => {
    setErrorMsg('');
    setMovementType('Saída');
    setSelectedCaliberId(calibers[0]?.id || '');
    setQuantity(100);
    setSelectedVaultId(ammoVaultSpaces[0]?.id || '');
    setRecipientOrReason('Curso ou Teste');
    
    setResponsibleType('SISTEMA');
    setSelectedResponsibleUserId(users[0]?.id || '');
    setCustomResponsibleName('');
    setCustomResponsibleMasp('');
    setObservation('');

    setShowMovementModal(true);
  };

  // Save Caliber
  const handleSaveCaliber = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!caliberName.trim()) {
      setErrorMsg('Informe o nome do calibre.');
      return;
    }

    try {
      await storage.addCaliber(caliberName.trim());
      setSuccessMsg(`Calibre "${caliberName.trim()}" cadastrado com sucesso.`);
      setCaliberName('');
      setShowCaliberModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar calibre.');
    }
  };

  const handleDeleteCaliber = (cal: Caliber) => {
    setDeleteTargetAmmo({ type: 'caliber', id: cal.id, label: `o calibre "${cal.name}"` });
  };

  const handleDeleteStock = (st: AmmunitionStock) => {
    setDeleteTargetAmmo({ type: 'stock', id: st.id, label: `o registro de estoque` });
  };

  const handleDeleteAmmoMovement = (m: AmmunitionMovement) => {
    setDeleteTargetAmmo({ type: 'movement', id: m.id, label: `o histórico de movimentação de munição` });
  };

  const confirmExecuteDeleteAmmo = async () => {
    if (!deleteTargetAmmo) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetAmmo.type === 'caliber') {
        await storage.deleteCaliber(deleteTargetAmmo.id);
        setSuccessMsg(`Calibre excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'stock') {
        await storage.deleteAmmoStock(deleteTargetAmmo.id);
        setSuccessMsg(`Registro de estoque excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'movement') {
        await storage.deleteAmmoMovement(deleteTargetAmmo.id);
        setSuccessMsg(`Histórico de movimentação excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetAmmo(null);
    }
  };

  // Save Movement (Entrada / Saída)
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCaliberId) {
      setErrorMsg('Selecione o calibre.');
      return;
    }
    if (!selectedVaultId) {
      setErrorMsg('Selecione um local do cofre para munições.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }

    let respName = '';
    let respMasp = '';
    let respUserId = '';

    if (responsibleType === 'SISTEMA') {
      const foundUser = users.find(u => u.id === selectedResponsibleUserId);
      if (!foundUser) {
        setErrorMsg('Selecione o policial responsável no sistema.');
        return;
      }
      respName = foundUser.name;
      respMasp = foundUser.masp;
      respUserId = foundUser.id;
    } else {
      if (!customResponsibleName.trim()) {
        setErrorMsg('Informe o nome do policial responsável (fora do sistema).');
        return;
      }
      respName = customResponsibleName.trim();
      respMasp = customResponsibleMasp.trim();
    }

    try {
      const createdMov = await storage.recordAmmoMovement({
        type: movementType,
        caliberId: selectedCaliberId,
        quantity,
        vaultSpaceId: selectedVaultId,
        recipientOrReason,
        responsibleType,
        responsibleUserId: respUserId,
        responsibleName: respName,
        responsibleMasp: respMasp,
        observation: observation.slice(0, 500)
      });

      setSuccessMsg(`Movimentação de ${movementType} registrada com sucesso.`);
      setShowMovementModal(false);
      onRefresh();

      // Automatically offer to print receipt
      setSelectedReceiptMov(createdMov);
      setIsReturnReceiptMode(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
    }
  };

  // Submit Unused Ammo Return
  const handleConfirmReturnAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');

    const maxReturnable = returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0);
    if (returnQuantity <= 0 || returnQuantity > maxReturnable) {
      setErrorMsg(`A quantidade de devolução deve estar entre 1 e ${maxReturnable}.`);
      return;
    }

    try {
      await storage.returnUnusedAmmo(returnTargetMov.id, returnQuantity);
      setSuccessMsg(`Devolução de ${returnQuantity} munições registrada com sucesso.`);
      
      const updatedMov = {
        ...returnTargetMov,
        returnedQuantity: (returnTargetMov.returnedQuantity || 0) + returnQuantity,
        returnedAt: new Date().toISOString(),
        returnedByUserName: currentUser.name
      };

      setReturnTargetMov(null);
      onRefresh();

      // Show Return Receipt Modal
      setSelectedReceiptMov(updatedMov);
      setIsReturnReceiptMode(true);
      setLastReturnedAmount(returnQuantity);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão e Estoque de Munições</h1>
            <p className="text-xs text-slate-400">
              Controle de calibres, movimentação de entrada/saída, devoluções de sobra e recibos
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {canManageCalibers && (
            <button
              onClick={() => {
                setErrorMsg('');
                setCaliberName('');
                setShowCaliberModal(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Cadastrar Calibre</span>
            </button>
          )}

          {canManageStock && (
            <button
              onClick={handleOpenMovementModal}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>Entrada / Saída de Munição</span>
            </button>
          )}
        </div>
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

      {/* Catalog of Calibers & Stock Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Registered Calibers */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-100 flex items-center justify-between border-b border-slate-800 pb-2">
            <span>Calibres Cadastrados no Sistema</span>
            <span className="text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded font-mono">
              {calibers.length}
            </span>
          </h2>

          <div className="space-y-2">
            {calibers.map((c) => (
              <div
                key={c.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
              >
                <span className="font-mono font-bold text-slate-100 text-sm">{c.name}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-500 uppercase">Calibre Padrão</span>
                  {isGeral && (
                    <button
                      onClick={() => handleDeleteCaliber(c)}
                      className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                      title="Excluir Calibre"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Stock per Vault Space */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
            Estoque de Munições por Cofre
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stocks.length === 0 ? (
              <p className="col-span-full text-xs text-slate-500 italic py-4 text-center">
                Nenhum estoque registrado nos cofres.
              </p>
            ) : (
              stocks.map((st) => {
                const cal = calibers.find(c => c.id === st.caliberId);
                const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                const unit = units.find(u => u.id === st.unitId);

                return (
                  <div
                    key={st.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-400 text-base">
                          {cal ? cal.name : st.caliberId}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-200 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                          Cofre: {vault ? vault.code : 'N/A'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Unidade: <strong className="text-slate-200">{unit ? unit.name : ''}</strong>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Quantidade em estoque:</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-lg font-mono font-black text-emerald-400">
                          {st.quantity} un
                        </span>
                        {isGeral && (
                          <button
                            onClick={() => handleDeleteStock(st)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                            title="Excluir Estoque"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Movement Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-3 p-5">
        <h2 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
          Histórico de Movimentação de Munições
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Calibre</th>
                <th className="py-3 px-4">Quantidade</th>
                <th className="py-3 px-4">Local no Cofre</th>
                <th className="py-3 px-4">Destino / Motivo</th>
                <th className="py-3 px-4">Policial Responsável</th>
                <th className="py-3 px-4">Devolução (Curso/Teste)</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação de munição registrada.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const cal = calibers.find(c => c.id === m.caliberId);
                  const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);

                  const reasonStr = (m.recipientOrReason || '').toLowerCase();
                  const isCourseOrTest = reasonStr.includes('curso') || reasonStr.includes('teste');
                  const returnedQty = m.returnedQuantity || 0;
                  const canReturnMore = m.type === 'Saída' && isCourseOrTest && returnedQty < m.quantity;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {formatTimestamp(m.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center space-x-1 w-fit ${
                            m.type === 'Entrada'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {m.type === 'Entrada' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{m.type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-100">
                        {cal ? cal.name : m.caliberId}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        {m.quantity} un
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200">
                        {vault ? vault.code : 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-200">
                        <div>
                          <span>{m.recipientOrReason}</span>
                          {m.observation && (
                            <p className="text-[10px] text-slate-400 font-normal italic truncate max-w-xs" title={m.observation}>
                              Obs: {m.observation}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <div>
                          <span className="font-bold block text-slate-100">
                            {m.responsibleName || m.recipientOrReason}
                          </span>
                          {m.responsibleMasp && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              MASP: {m.responsibleMasp}
                            </span>
                          )}
                          {m.responsibleType === 'FORA_DO_SISTEMA' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] bg-slate-800 text-amber-400 border border-amber-500/30 rounded">
                              Fora do Sistema
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Devolução Column */}
                      <td className="py-3 px-4 text-xs font-mono">
                        {m.type === 'Saída' && isCourseOrTest ? (
                          <div className="space-y-1">
                            <span className={`font-bold block ${returnedQty > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {returnedQty} / {m.quantity} devolvidos
                            </span>
                            {canReturnMore && (
                              <button
                                onClick={() => {
                                  setReturnTargetMov(m);
                                  setReturnQuantity(m.quantity - returnedQty);
                                }}
                                className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold text-[10px] px-2 py-1 rounded-lg transition flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3 text-emerald-400" />
                                <span>Devolver Sobra</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">N/A</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => {
                            setSelectedReceiptMov(m);
                            setIsReturnReceiptMode(false);
                          }}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition inline-flex items-center space-x-1"
                          title="Imprimir Recibo de Movimentação"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="text-[10px] font-bold">Recibo</span>
                        </button>

                        {canManageStock && (
                          <button
                            onClick={() => handleDeleteAmmoMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir Registro de Movimentação"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Caliber */}
      {showCaliberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              Cadastrar Novo Calibre de Munição
            </h3>

            <form onSubmit={handleSaveCaliber} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nome do Calibre (Ex: 5,56x45mm)
                </label>
                <input
                  type="text"
                  value={caliberName}
                  onChange={(e) => setCaliberName(e.target.value)}
                  placeholder="Ex: 5,56x45mm, .40 S&W, 9x19mm"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCaliberModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Salvar Calibre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Movement (Entrada / Saída) */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <Disc className="w-5 h-5 text-amber-400" />
              <span>Registrar Entrada ou Saída de Munição</span>
            </h3>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMovementType('Saída')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Saída'
                        ? 'bg-red-950 text-red-400 border-red-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    SAÍDA DE MUNIÇÃO
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ENTRADA / REABASTECIMENTO
                  </button>
                </div>
              </div>

              {/* Caliber & Quantity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre
                  </label>
                  <select
                    value={selectedCaliberId}
                    onChange={(e) => setSelectedCaliberId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade (unidades)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Vault Location */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre (Apenas cofres de MUNIÇÕES)
                </label>
                <select
                  value={selectedVaultId}
                  onChange={(e) => setSelectedVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {ammoVaultSpaces.map((v) => {
                    const u = units.find(unit => unit.id === v.unitId);
                    return (
                      <option key={v.id} value={v.id}>
                        {v.code} - {u ? u.name : 'Unidade'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Destino da Munição
                </label>
                <select
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  <option value="Curso ou Teste">Curso ou Teste (Permite retorno de sobras)</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Substituição">Substituição</option>
                  <option value="Abastecimento do Cofre">Abastecimento do Cofre</option>
                  <option value="Operacional">Operacional / Diligência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Policial Responsável pela Retirada */}
              <div className="border border-slate-800 bg-slate-950/60 p-3.5 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Policial Responsável pela Retirada
                </label>

                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'SISTEMA'}
                      onChange={() => setResponsibleType('SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Policial Cadastrado no Sistema</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'FORA_DO_SISTEMA'}
                      onChange={() => setResponsibleType('FORA_DO_SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Fora do Sistema</span>
                  </label>
                </div>

                {responsibleType === 'SISTEMA' ? (
                  <div>
                    <select
                      value={selectedResponsibleUserId}
                      onChange={(e) => setSelectedResponsibleUserId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      required
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - {u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Nome do Policial</label>
                      <input
                        type="text"
                        value={customResponsibleName}
                        onChange={(e) => setCustomResponsibleName(e.target.value)}
                        placeholder="Nome Completo..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">MASP / Documento</label>
                      <input
                        type="text"
                        value={customResponsibleMasp}
                        onChange={(e) => setCustomResponsibleMasp(e.target.value)}
                        placeholder="Ex: 123.456-7"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Observação (até 500 caracteres) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Observação da Saída / Movimentação
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {observation.length} / 500
                  </span>
                </div>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Descreva observações específicas da saída (máximo 500 caracteres)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Registrar e Gerar Recibo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Devolução de Sobras de Munição */}
      {returnTargetMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
              <span>Devolução de Munições Não Utilizadas</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Policial: <strong className="text-slate-200">{returnTargetMov.responsibleName || returnTargetMov.recipientOrReason}</strong>
              <br />
              Retirada inicial: <strong className="text-amber-400">{returnTargetMov.quantity} un</strong>
              {returnTargetMov.returnedQuantity ? ` (Já devolvidos: ${returnTargetMov.returnedQuantity} un)` : ''}
            </p>

            <form onSubmit={handleConfirmReturnAmmo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade a Devolver (Restante max: {returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)} un)
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReturnTargetMov(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Confirmar Devolução e Gerar Recibo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ammunition Receipt Modal */}
      {selectedReceiptMov && (
        <AmmunitionReceiptModal
          movement={selectedReceiptMov}
          calibers={calibers}
          vaultSpaces={vaultSpaces}
          onClose={() => setSelectedReceiptMov(null)}
          isReturnReceipt={isReturnReceiptMode}
          returnAmountPrinted={lastReturnedAmount}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetAmmo}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetAmmo?.label || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteAmmo}
        onCancel={() => setDeleteTargetAmmo(null)}
      />

    </div>
  );
};
