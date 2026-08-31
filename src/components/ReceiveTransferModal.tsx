import React, { useState } from 'react';
import { WeaponTransfer, VaultSpace, User } from '../types';
import { storage } from '../services/storage';
import { formatTimestamp } from '../utils/masks';
import {
  Inbox,
  ShieldCheck,
  Building2,
  Calendar,
  UserCheck,
  Package,
  Layers,
  AlertCircle,
  X,
  Check,
  FileText
} from 'lucide-react';

interface ReceiveTransferModalProps {
  transfer: WeaponTransfer;
  vaultSpaces: VaultSpace[];
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  transfer,
  vaultSpaces,
  currentUser,
  onClose,
  onSuccess
}) => {
  // Filter destination unit vault spaces
  const destVaultSpaces = vaultSpaces.filter(
    vs => vs.unitId === transfer.destinationUnitId && vs.type === 'ARMAS'
  );

  const defaultVaultSpaceId = 
    destVaultSpaces.find(vs => vs.id === transfer.destinationVaultSpaceId)?.id ||
    (destVaultSpaces.length > 0 ? destVaultSpaces[0].id : '');

  const [selectedVaultSpaceId, setSelectedVaultSpaceId] = useState<string>(defaultVaultSpaceId);
  const [observation, setObservation] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedVaultSpaceId && destVaultSpaces.length > 0) {
      setError('Por favor, selecione o local de guarda no cofre da unidade de destino.');
      return;
    }

    setLoading(true);
    try {
      await storage.receiveWeaponTransfer(
        transfer.id,
        selectedVaultSpaceId,
        observation.trim()
      );
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro ao confirmar o recebimento da transferência.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="receive-transfer-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl my-8 overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Confirmar Recebimento de Armamento</h2>
              <p className="text-xs text-slate-400">
                Protocolo: <span className="font-mono text-amber-400 font-bold">{transfer.protocolNumber || transfer.id}</span>
              </p>
            </div>
          </div>
          <button
            id="close-receive-transfer-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Transfer Info Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-800/60">
              <div>
                <span className="text-[11px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" /> Origem:
                </span>
                <p className="font-semibold text-slate-200">{transfer.originUnitName || 'Geral'}</p>
                <p className="text-[11px] text-slate-400">{transfer.originDepartmentName}</p>
                <p className="text-[11px] text-slate-500 mt-1">Enviado por: {transfer.transferredByUserName}</p>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Unidade de Destino:
                </span>
                <p className="font-semibold text-emerald-300">{transfer.destinationUnitName}</p>
                <p className="text-[11px] text-slate-400">{transfer.destinationDepartmentName}</p>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Data: {formatTimestamp(transfer.transferDate || transfer.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">
                  Transportador: <strong>{transfer.receiverOrTransporterName}</strong> (MASP: {transfer.receiverOrTransporterMasp})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono font-bold">
                  {transfer.totalWeapons || transfer.weapons?.length || 1} arma(s)
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {transfer.totalMagazines || 0} carregador(es)
                </span>
              </div>
            </div>

            {transfer.reason && (
              <div className="pt-2 border-t border-slate-800/40 text-slate-400 text-[11px]">
                <strong className="text-slate-300">Motivo da Transferência:</strong> {transfer.reason}
              </div>
            )}
          </div>

          {/* List of Weapons to be Received */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-400" />
              <span>Armas a serem incorporadas ao cofre:</span>
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Nº Série</th>
                    <th className="py-2 px-3">Tipo / Modelo</th>
                    <th className="py-2 px-3">Calibre</th>
                    <th className="py-2 px-3 text-center">Carregadores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(transfer.weapons || []).map((w, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-bold text-white">{w.serialNumber}</td>
                      <td className="py-2 px-3 text-slate-300">{w.type} - {w.model}</td>
                      <td className="py-2 px-3 text-slate-300">{w.caliber}</td>
                      <td className="py-2 px-3 text-center text-slate-400 font-mono">{w.magazineQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Destination Vault Space Selection */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <label className="block text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Local de Guarda no Cofre de Destino *</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Selecione o compartimento ou espaço do cofre da unidade onde os armamentos serão guardados e exibidos no Mapa do Cofre.
            </p>
            {destVaultSpaces.length > 0 ? (
              <select
                id="destination-vault-space-select"
                value={selectedVaultSpaceId}
                onChange={e => setSelectedVaultSpaceId(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {destVaultSpaces.map(vs => (
                  <option key={vs.id} value={vs.id}>
                    {vs.code} (Cofre de Armas)
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs">
                Nenhum compartimento de armas específico cadastrado para esta unidade. O sistema associará ao Cofre Principal da unidade.
              </div>
            )}
          </div>

          {/* Observations */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Observação de Recebimento (Opcional)
            </label>
            <textarea
              rows={2}
              value={observation}
              onChange={e => setObservation(e.target.value)}
              placeholder="Ex: Armas conferidas fisicamente sem avarias, numeração conferida, manuais e carregadores íntegros."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Confirmation Notice */}
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold text-emerald-200">Entrada Oficial no Cofre da Unidade</p>
              <p className="text-[11px] text-emerald-400/90 mt-0.5">
                Ao confirmar, o status das armas mudará para <strong>"No Cofre"</strong> e elas constarão imediatamente disponíveis no <strong>Mapa do Cofre</strong> desta unidade.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              id="confirm-receive-transfer-btn"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-emerald-950/50 disabled:opacity-50"
            >
              {loading ? (
                <span>Confirmando Recebimento...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar Entrada no Cofre</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
