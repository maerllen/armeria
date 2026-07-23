import React, { useState } from 'react';
import { User, Movement, Weapon, VaultSpace, Course } from '../types';
import { formatTimestamp, isCourseExpired } from '../utils/masks';
import { storage } from '../services/storage';
import { ArrowRightLeft, Plus, CheckCircle, Clock, AlertTriangle, Shield, AlertCircle, ArrowUpRight, ArrowDownLeft, Lock } from 'lucide-react';

interface MovementModuleProps {
  currentUser: User;
  movements: Movement[];
  weapons: Weapon[];
  vaultSpaces: VaultSpace[];
  courses: Course[];
  onRefresh: () => void;
}

export const MovementModule: React.FC<MovementModuleProps> = ({
  currentUser,
  movements,
  weapons,
  vaultSpaces,
  courses,
  onRefresh
}) => {
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

  // Withdrawal Form
  const [selectedWeaponId, setSelectedWeaponId] = useState('');
  const [ammoCount, setAmmoCount] = useState(50);
  const [magazineCount, setMagazineCount] = useState(3);

  // Return Form
  const [returnVaultId, setReturnVaultId] = useState('');
  const [returningAmmoCount, setReturningAmmoCount] = useState(50);
  const [returningMagCount, setReturningMagCount] = useState(3);
  const [divergenceJustification, setDivergenceJustification] = useState('');
  const [confirmDivergence, setConfirmDivergence] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isPolicial = currentUser.role === 'Policial';

  const canApproveOrConfirm = isGeral || isArmeiro || isAdmin || (isPolicial && currentUser.canMoveWeapons);

  // Available weapons for officer (Filter: MUST BE QUALIFIED by active course < 2 years old!)
  const availableWeapons = storage.getWeapons(currentUser).filter(w => w.status === 'No Cofre');

  // Open Withdrawal Modal
  const handleOpenWithdrawalModal = () => {
    setErrorMsg('');
    if (availableWeapons.length === 0) {
      setErrorMsg('Não há armas disponíveis no cofre da sua unidade para as quais você esteja habilitado por curso ativo (< 2 anos).');
      return;
    }
    setSelectedWeaponId(availableWeapons[0]?.id || '');
    setAmmoCount(50);
    setMagazineCount(availableWeapons[0]?.magazineQuantity || 3);
    setShowWithdrawalModal(true);
  };

  // Submit Withdrawal Request
  const handleSaveWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedWeaponId) {
      setErrorMsg('Selecione uma arma disponível.');
      return;
    }

    try {
      storage.requestWithdrawal({
        weaponId: selectedWeaponId,
        ammunitionCount: ammoCount,
        magazineCount
      });

      setSuccessMsg('Solicitação de retirada registrada com sucesso. Aguardando aprovação do responsável.');
      setShowWithdrawalModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao solicitar retirada.');
    }
  };

  // Approve Withdrawal
  const handleApprove = (mov: Movement) => {
    try {
      storage.approveWithdrawal(mov.id);
      setSuccessMsg(`Retirada da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) aprovada com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao aprovar retirada.');
    }
  };

  // Open Return Modal
  const handleOpenReturnModal = (mov: Movement) => {
    setErrorMsg('');
    setSelectedMovement(mov);
    const weap = weapons.find(w => w.id === mov.weaponId);

    // Suggest previous vault space if available
    const availableArmasVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === mov.unitId);
    const prevVault = availableArmasVaults.find(v => v.id === mov.withdrawalVaultSpaceId);
    setReturnVaultId(prevVault ? prevVault.id : (availableArmasVaults[0]?.id || ''));

    setReturningAmmoCount(mov.ammunitionCount);
    setReturningMagCount(mov.magazineCount);
    setDivergenceJustification('');
    setConfirmDivergence(false);
    setShowReturnModal(true);
  };

  // Submit Return Request
  const handleSaveReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedMovement) return;

    const ammoDivergent = returningAmmoCount !== selectedMovement.ammunitionCount;
    const magDivergent = returningMagCount !== selectedMovement.magazineCount;

    if (ammoDivergent || magDivergent) {
      if (!confirmDivergence) {
        setErrorMsg('Há divergência na quantidade devolvida. Marque a caixa de confirmação e apresente a justificativa.');
        return;
      }
      if (!divergenceJustification.trim()) {
        setErrorMsg('Por favor, digite a justificativa para a divergência na devolução.');
        return;
      }
    }

    try {
      storage.requestReturn({
        movementId: selectedMovement.id,
        returnVaultSpaceId: returnVaultId,
        returningAmmunitionCount: returningAmmoCount,
        returningMagazineCount: returningMagCount,
        divergenceJustification
      });

      setSuccessMsg('Solicitação de devolução encaminhada com sucesso. Aguardando confirmação de recibo no cofre.');
      setShowReturnModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao solicitar devolução.');
    }
  };

  // Confirm Receipt
  const handleConfirmReceipt = (mov: Movement) => {
    try {
      storage.confirmReceipt(mov.id);
      setSuccessMsg(`Recibo da devolução da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) confirmado.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao confirmar recibo.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Movimentações de Armamento</h1>
            <p className="text-xs text-slate-400">
              Fluxo completo de solicitação, aprovação, armas em trânsito, devolução e confirmação de recibo
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenWithdrawalModal}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Solicitar Retirada de Arma</span>
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Movements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Painel Geral de Movimentações</h2>
          <span className="text-xs bg-slate-800 text-amber-400 px-2.5 py-1 rounded-full font-mono font-bold">
            Total: {movements.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-3 px-4">Data Solicitação</th>
                <th className="py-3 px-4">Policial / MASP</th>
                <th className="py-3 px-4">Arma / Série</th>
                <th className="py-3 px-4">Munição / Carregadores</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Aprovador / Responsável</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação de arma registrada.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isRequester = currentUser.id === m.requesterId;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      
                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {formatTimestamp(m.createdAt)}
                      </td>

                      {/* Requester */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-100">{m.requesterName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">MASP: {m.requesterMasp}</div>
                      </td>

                      {/* Weapon */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200">{m.weaponType} {m.weaponModel}</div>
                        <div className="text-[10px] font-mono text-amber-400">Série: {m.weaponSerialNumber}</div>
                      </td>

                      {/* Ammo & Mag */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div>{m.ammunitionCount} un (Cal. {m.caliber})</div>
                        <div className="text-[10px] text-slate-400">{m.magazineCount} carregadores</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded font-bold text-[10px] border inline-block ${
                            m.status === 'Pendente Aprovação'
                              ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                              : m.status === 'Em Trânsito'
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                              : m.status === 'Pendente Recibo'
                              ? 'bg-purple-950 text-purple-300 border-purple-800'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>

                      {/* Approved By */}
                      <td className="py-3 px-4 text-slate-300">
                        {m.approvedByUserName ? (
                          <div>
                            <span className="font-semibold">{m.approvedByUserName}</span>
                            {m.approvalDate && <p className="text-[10px] text-slate-500 font-mono">{formatTimestamp(m.approvalDate)}</p>}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Pendente</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          
                          {/* Approve Withdrawal */}
                          {m.status === 'Pendente Aprovação' && canApproveOrConfirm && (
                            <button
                              onClick={() => handleApprove(m)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Aprovar
                            </button>
                          )}

                          {/* Request Return (Available if Em Trânsito) */}
                          {m.status === 'Em Trânsito' && (isRequester || canApproveOrConfirm) && (
                            <button
                              onClick={() => handleOpenReturnModal(m)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Devolver
                            </button>
                          )}

                          {/* Confirm Receipt (Available if Pendente Recibo) */}
                          {m.status === 'Pendente Recibo' && canApproveOrConfirm && (
                            <button
                              onClick={() => handleConfirmReceipt(m)}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Confirmar Recibo
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdrawal Request Modal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <ArrowUpRight className="w-5 h-5 text-amber-400" />
              <span>Solicitação de Retirada de Armamento</span>
            </h3>

            <form onSubmit={handleSaveWithdrawal} className="space-y-4">
              
              {/* Select Qualified Weapon */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Arma Disponível (Restrita aos cursos ativos &lt; 2 anos)
                </label>
                <select
                  value={selectedWeaponId}
                  onChange={(e) => {
                    setSelectedWeaponId(e.target.value);
                    const w = weapons.find(weap => weap.id === e.target.value);
                    if (w) setMagazineCount(w.magazineQuantity);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {availableWeapons.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.type} {w.model} (Série: {w.serialNumber}, Cal: {w.caliber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ammo Count */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Munições
                </label>
                <input
                  type="number"
                  min="0"
                  value={ammoCount}
                  onChange={(e) => setAmmoCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Magazine Count */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Carregadores
                </label>
                <input
                  type="number"
                  min="0"
                  value={magazineCount}
                  onChange={(e) => setMagazineCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawalModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Enviar Solicitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Request Modal */}
      {showReturnModal && selectedMovement && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <ArrowDownLeft className="w-5 h-5 text-amber-400" />
              <span>Solicitação de Devolução de Arma</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Devolução da arma <strong className="text-amber-400 font-mono">{selectedMovement.weaponModel} ({selectedMovement.weaponSerialNumber})</strong>
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-4">
              
              {/* Vault Location Suggestion */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre para Guarda
                </label>
                <select
                  value={returnVaultId}
                  onChange={(e) => setReturnVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === selectedMovement.unitId).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} (Cofre da Unidade)
                    </option>
                  ))}
                </select>
              </div>

              {/* Returning Ammo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Munições Devolvidas (Sugestão: {selectedMovement.ammunitionCount})
                </label>
                <input
                  type="number"
                  min="0"
                  value={returningAmmoCount}
                  onChange={(e) => setReturningAmmoCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Returning Magazines */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Carregadores Devolvidos (Sugestão: {selectedMovement.magazineCount})
                </label>
                <input
                  type="number"
                  min="0"
                  value={returningMagCount}
                  onChange={(e) => setReturningMagCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Divergence Check */}
              {(returningAmmoCount !== selectedMovement.ammunitionCount || returningMagCount !== selectedMovement.magazineCount) && (
                <div className="bg-amber-950/40 border border-amber-800/80 p-3 rounded-xl space-y-3">
                  <div className="flex items-start space-x-2 text-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Divergência detectada em relação à quantidade retirada. Informe o motivo.</span>
                  </div>

                  <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmDivergence}
                      onChange={(e) => setConfirmDivergence(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500"
                    />
                    <span>Confirmo a alteração da quantidade devolvida</span>
                  </label>

                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 uppercase mb-1">
                      Justificativa Obrigatória da Divergência:
                    </label>
                    <textarea
                      value={divergenceJustification}
                      onChange={(e) => setDivergenceJustification(e.target.value)}
                      placeholder="Ex: Munições deflagradas em serviço / treinamento..."
                      rows={2}
                      className="w-full bg-slate-950 border border-amber-800 rounded-xl p-2.5 text-xs text-slate-100"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
