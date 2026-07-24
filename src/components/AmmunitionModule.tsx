import React, { useState } from 'react';
import { User, Caliber, AmmunitionStock, AmmunitionMovement, VaultSpace, Department, Unit, AmmoMovementType } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Disc, Plus, ArrowUpRight, ArrowDownLeft, AlertCircle, Check, Shield, Search, Trash2 } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface AmmunitionModuleProps {
  currentUser: User;
  calibers: Caliber[];
  stocks: AmmunitionStock[];
  movements: AmmunitionMovement[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
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
  onRefresh
}) => {
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Caliber Form
  const [caliberName, setCaliberName] = useState('');

  // Ammo Movement Form
  const [movementType, setMovementType] = useState<AmmoMovementType>('Entrada');
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('Treinamento');
  const [customRecipientName, setCustomRecipientName] = useState('');

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
    setMovementType('Entrada');
    setSelectedCaliberId(calibers[0]?.id || '');
    setQuantity(100);
    setSelectedVaultId(ammoVaultSpaces[0]?.id || '');
    setRecipientOrReason('Treinamento');
    setCustomRecipientName('');
    setShowMovementModal(true);
  };

  // Save Caliber
  const handleSaveCaliber = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!caliberName.trim()) {
      setErrorMsg('Informe o nome do calibre.');
      return;
    }

    try {
      storage.addCaliber(caliberName.trim());
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

  const confirmExecuteDeleteAmmo = () => {
    if (!deleteTargetAmmo) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetAmmo.type === 'caliber') {
        storage.deleteCaliber(deleteTargetAmmo.id);
        setSuccessMsg(`Calibre excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'stock') {
        storage.deleteAmmoStock(deleteTargetAmmo.id);
        setSuccessMsg(`Registro de estoque excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'movement') {
        storage.deleteAmmoMovement(deleteTargetAmmo.id);
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
  const handleSaveMovement = (e: React.FormEvent) => {
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

    let finalReason = recipientOrReason;
    if (recipientOrReason === 'outros_pessoa') {
      if (!customRecipientName.trim()) {
        setErrorMsg('Informe o nome do policial recebedor.');
        return;
      }
      finalReason = customRecipientName.trim();
    }

    try {
      storage.recordAmmoMovement({
        type: movementType,
        caliberId: selectedCaliberId,
        quantity,
        vaultSpaceId: selectedVaultId,
        recipientOrReason: finalReason
      });

      setSuccessMsg(`Movimentação de ${movementType} registrada com sucesso.`);
      setShowMovementModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
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
              Controle de calibres, movimentação de entrada/saída e balanço dos cofres
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
              <Plus className="w-4 h-4" />
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
                  {canManageCalibers && (
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
                        {canManageStock && (
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
                <th className="py-3 px-4">Responsável</th>
                {canManageStock && <th className="py-3 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={canManageStock ? 8 : 7} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação de munição registrada.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const cal = calibers.find(c => c.id === m.caliberId);
                  const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);

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
                        {m.recipientOrReason}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {m.userName}
                      </td>
                      {canManageStock && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteAmmoMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir Registro de Movimentação"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              Registrar Entrada ou Saída de Munição
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
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ENTRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('Saída')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Saída'
                        ? 'bg-red-950 text-red-400 border-red-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    SAÍDA
                  </button>
                </div>
              </div>

              {/* Caliber */}
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

              {/* Quantity */}
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

              {/* Recipient or Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Destinatário / Motivo da Retirada/Entrada
                </label>
                <select
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 mb-2"
                >
                  <option value="Curso">Curso</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Substituição">Substituição</option>
                  <option value="Abastecimento do Cofre">Abastecimento do Cofre</option>
                  <option value="outros_pessoa">Retirada para Policial Específico</option>
                </select>

                {recipientOrReason === 'outros_pessoa' && (
                  <input
                    type="text"
                    value={customRecipientName}
                    onChange={(e) => setCustomRecipientName(e.target.value)}
                    placeholder="Nome do Policial recebedor..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                    required
                  />
                )}
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
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Registrar Movimentação
                </button>
              </div>
            </form>
          </div>
        </div>
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
