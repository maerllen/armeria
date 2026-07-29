import React, { useState } from 'react';
import { User, Movement, Weapon, VaultSpace, Course } from '../types';
import { formatTimestamp, isCourseExpired } from '../utils/masks';
import { storage } from '../services/storage';
import { ArrowRightLeft, Plus, CheckCircle, Clock, AlertTriangle, Shield, AlertCircle, ArrowUpRight, ArrowDownLeft, Lock, Trash2, FileText, Printer } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { MovementReceiptModal } from './MovementReceiptModal';

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
  const [deleteTargetMov, setDeleteTargetMov] = useState<Movement | null>(null);
  const [receiptTargetMov, setReceiptTargetMov] = useState<Movement | null>(null);

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
  const handleSaveWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedWeaponId) {
      setErrorMsg('Selecione uma arma disponível.');
      return;
    }

    try {
      await storage.requestWithdrawal({
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
  const handleApprove = async (mov: Movement) => {
    try {
      await storage.approveWithdrawal(mov.id);
      setSuccessMsg(`Retirada da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) aprovada com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao aprovar retirada.');
    }
  };

  const handleDeleteMovement = (mov: Movement) => {
    setDeleteTargetMov(mov);
  };

  const confirmExecuteDeleteMovement = async () => {
    if (!deleteTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await storage.deleteMovement(deleteTargetMov.id);
      setSuccessMsg(`Registro de movimentação da arma ${deleteTargetMov.weaponModel} (${deleteTargetMov.weaponSerialNumber}) excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir movimentação.');
    } finally {
      setDeleteTargetMov(null);
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
  const handleSaveReturn = async (e: React.FormEvent) => {
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
      await storage.requestReturn({
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
  const handleConfirmReceipt = async (mov: Movement) => {
    try {
      await storage.confirmReceipt(mov.id);
      setSuccessMsg(`Recibo da devolução da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) confirmado.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao confirmar recibo.');
    }
  };

  // Direct Print PDF function for Movement Receipt
  const handleDirectPrintMovement = (mov: Movement) => {
    const withdrawalVault = vaultSpaces.find(v => v.id === mov.withdrawalVaultSpaceId);
    const returnVault = vaultSpaces.find(v => v.id === mov.returnVaultSpaceId);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Cautela - ${mov.weaponSerialNumber} - PCMG</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMERIA • TERMO DE MOVIMENTAÇÃO DE CARGA</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${mov.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>STATUS:</strong> ${(mov.status || 'FINALIZADO').toUpperCase()}</div>
          <div><strong>Data:</strong> ${formatTimestamp(mov.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados do Policial (Cautelante)</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Nome Completo:</span> <span class="val">${mov.requesterName}</span></div>
            <div class="field"><span class="label">MASP:</span> <span class="val">${mov.requesterMasp}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Especificação do Armamento e Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Tipo / Modelo:</span> <span class="val">${mov.weaponType} ${mov.weaponModel}</span></div>
            <div class="field"><span class="label">Nº de Série:</span> <span class="val">${mov.weaponSerialNumber}</span></div>
            <div class="field"><span class="label">Calibre:</span> <span class="val">${mov.caliber}</span></div>
            <div class="field"><span class="label">Munição Cautelada:</span> <span class="val">${mov.ammunitionCount} un</span></div>
            <div class="field"><span class="label">Carregadores:</span> <span class="val">${mov.magazineCount} un</span></div>
            <div class="field"><span class="label">Cofre Retirada:</span> <span class="val">${withdrawalVault?.code || 'Cofre Principal'}</span></div>
            ${returnVault ? `<div class="field"><span class="label">Cofre Devolução:</span> <span class="val">${returnVault.code}</span></div>` : ''}
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">3. Auditoria e Armeiros Responsáveis</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Armeiro Aprovador:</span> <span class="val">${mov.approvedByUserName || 'Pendente'}</span></div>
            <div class="field"><span class="label">Confirmado Por (Devolução):</span> <span class="val">${mov.receiptConfirmedByUserName || 'Não Devolvido'}</span></div>
          </div>
          ${mov.divergenceJustification ? `<div class="field" style="margin-top: 6px;"><span class="label">Justificativa de Divergência:</span> <span class="val" style="font-weight: normal; color: #b91c1c;">${mov.divergenceJustification}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${mov.requesterName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Cautelante (MASP: ${mov.requesterMasp})</span>
          </div>
          <div class="sig-line">
            ${mov.receiptConfirmedByUserName || mov.approvedByUserName || 'Armeiro Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro da Unidade</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria da Polícia Civil em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
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

                          {/* Print Receipt Button */}
                          <button
                            onClick={() => handleDirectPrintMovement(m)}
                            className="bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-bold text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center space-x-1 shadow transition"
                            title="Gerar/Imprimir Recibo da Movimentação"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Recibo</span>
                          </button>

                          {/* Delete Movement (Armeiro, Administrador, Geral) */}
                          {canApproveOrConfirm && (
                            <button
                              onClick={() => handleDeleteMovement(m)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                              title="Excluir Registro de Movimentação"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetMov}
        title="Excluir Movimentação Definitivamente"
        message={`Deseja realmente apagar permanentemente este registro de movimentação da arma ${deleteTargetMov?.weaponModel} (${deleteTargetMov?.weaponSerialNumber})?`}
        onConfirm={confirmExecuteDeleteMovement}
        onCancel={() => setDeleteTargetMov(null)}
      />

      {/* Movement Printable Receipt Modal */}
      {receiptTargetMov && (
        <MovementReceiptModal
          movement={receiptTargetMov}
          weapon={weapons.find(w => w.id === receiptTargetMov.weaponId)}
          vaultSpaces={vaultSpaces}
          onClose={() => setReceiptTargetMov(null)}
        />
      )}

    </div>
  );
};
