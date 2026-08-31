import React, { useState, useMemo } from 'react';
import { WeaponTransfer, User } from '../types';
import { formatTimestamp } from '../utils/masks';
import {
  ArrowRightLeft,
  Search,
  Printer,
  X,
  FileText,
  Building2,
  Calendar,
  UserCheck,
  Shield,
  Plus
} from 'lucide-react';

interface TransferHistoryModalProps {
  transfers: WeaponTransfer[];
  currentUser: User;
  onClose: () => void;
  onSelectTransfer: (transfer: WeaponTransfer) => void;
  onOpenNewTransfer?: () => void;
}

export const TransferHistoryModal: React.FC<TransferHistoryModalProps> = ({
  transfers,
  currentUser,
  onClose,
  onSelectTransfer,
  onOpenNewTransfer
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTransfers = useMemo(() => {
    if (!searchTerm.trim()) return transfers;
    const term = searchTerm.toLowerCase();

    return transfers.filter(t => {
      const protocolMatch = (t.protocolNumber || t.id).toLowerCase().includes(term);
      const originMatch = (t.originUnitName || '').toLowerCase().includes(term);
      const destMatch = (t.destinationUnitName || '').toLowerCase().includes(term);
      const transporterMatch = (t.receiverOrTransporterName || '').toLowerCase().includes(term) || (t.receiverOrTransporterMasp || '').includes(term);
      const userMatch = (t.transferredByUserName || '').toLowerCase().includes(term);
      const reasonMatch = (t.reason || '').toLowerCase().includes(term);
      const weaponMatch = (t.weapons || []).some(w => 
        w.serialNumber.toLowerCase().includes(term) || 
        w.model.toLowerCase().includes(term) ||
        w.type.toLowerCase().includes(term)
      );

      return protocolMatch || originMatch || destMatch || transporterMatch || userMatch || reasonMatch || weaponMatch;
    });
  }, [transfers, searchTerm]);

  return (
    <div id="transfer-history-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl my-8 overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Histórico de Transferências entre Unidades</h2>
              <p className="text-xs text-slate-400">
                Visualização exclusiva para Armeiro, Administrador e perfil Geral
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenNewTransfer && (
              <button
                id="new-transfer-from-history-btn"
                onClick={() => {
                  onClose();
                  onOpenNewTransfer();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Transferência</span>
              </button>
            )}
            <button
              id="close-transfer-history-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por protocolo, série de arma, unidade de origem/destino, policial transportador..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Transfers List */}
          {filteredTransfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80">
              <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">Nenhum registro de transferência encontrado</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm ? 'Tente ajustar os termos da sua pesquisa.' : 'Nenhuma arma foi transferida entre unidades ainda.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransfers.map(trf => (
                <div
                  key={trf.id}
                  className="bg-slate-950/60 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 transition-all space-y-3"
                >
                  {/* Top row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold">
                        {trf.protocolNumber || trf.id}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatTimestamp(trf.transferDate || trf.createdAt)}
                      </span>
                    </div>

                    <button
                      onClick={() => onSelectTransfer(trf)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors w-fit"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ver Recibo / Imprimir PDF</span>
                    </button>
                  </div>

                  {/* Middle row: Origin -> Destination */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" /> Origem:
                      </span>
                      <p className="font-semibold text-slate-200">{trf.originUnitName || 'Geral'}</p>
                      <p className="text-[11px] text-slate-400">Por: {trf.transferredByUserName} (MASP: {trf.transferredByUserMasp})</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Destino:
                      </span>
                      <p className="font-semibold text-slate-200">{trf.destinationUnitName}</p>
                      <p className="text-[11px] text-slate-400">Local: {trf.destinationVaultSpaceCode || 'Cofre Principal'}</p>
                    </div>
                  </div>

                  {/* Bottom row: Transporter & Weapons summary */}
                  <div className="pt-2 border-t border-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Transportador: <strong className="text-slate-300">{trf.receiverOrTransporterName}</strong> (MASP: {trf.receiverOrTransporterMasp})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px]">
                        {trf.totalWeapons || trf.weapons?.length || 1} arma(s)
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Séries: {(trf.weapons || []).map(w => w.serialNumber).join(', ')}
                      </span>
                    </div>
                  </div>

                  {/* Motive */}
                  <div className="text-[11px] text-slate-400 bg-slate-900/40 rounded p-2 border border-slate-800/40">
                    <span className="text-slate-500 font-medium">Motivo: </span>
                    {trf.reason}
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
