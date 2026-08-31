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
  Plus,
  Inbox,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface TransferHistoryModalProps {
  transfers: WeaponTransfer[];
  currentUser: User;
  onClose: () => void;
  onSelectTransfer: (transfer: WeaponTransfer) => void;
  onOpenNewTransfer?: () => void;
  onReceiveTransfer?: (transfer: WeaponTransfer) => void;
}

export const TransferHistoryModal: React.FC<TransferHistoryModalProps> = ({
  transfers,
  currentUser,
  onClose,
  onSelectTransfer,
  onOpenNewTransfer,
  onReceiveTransfer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Recebido'>('all');

  const filteredTransfers = useMemo(() => {
    let result = transfers;
    if (statusFilter !== 'all') {
      result = result.filter(t => (t.status || (t.receivedAt ? 'Recebido' : 'Pendente')) === statusFilter);
    }

    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();

    return result.filter(t => {
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
  }, [transfers, searchTerm, statusFilter]);

  const canReceiveTransfer = (trf: WeaponTransfer) => {
    if (trf.status === 'Recebido') return false;
    if (currentUser.role === 'Geral') return true;
    if (currentUser.role === 'Administrador') {
      return trf.destinationDepartmentId === currentUser.departmentId || !currentUser.departmentId;
    }
    if (currentUser.role === 'Armeiro') {
      if (currentUser.managementScope !== 'unit') {
        return trf.destinationDepartmentId === currentUser.departmentId;
      }
      return trf.destinationUnitId === currentUser.unitId;
    }
    return trf.destinationUnitId === currentUser.unitId;
  };

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
          
          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por protocolo, série de arma, unidade de origem/destino, policial transportador..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas ({transfers.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Pendente')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'Pendente' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pendentes ({transfers.filter(t => (t.status || 'Pendente') === 'Pendente').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Recebido')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'Recebido' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Recebidas ({transfers.filter(t => t.status === 'Recebido').length})</span>
              </button>
            </div>
          </div>

          {/* Transfers List */}
          {filteredTransfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80">
              <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">Nenhum registro de transferência encontrado</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm || statusFilter !== 'all' ? 'Tente ajustar os filtros da sua pesquisa.' : 'Nenhuma arma foi transferida entre unidades ainda.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransfers.map(trf => {
                const isPending = (trf.status || 'Pendente') === 'Pendente';
                const userCanReceive = isPending && canReceiveTransfer(trf);

                return (
                  <div
                    key={trf.id}
                    className={`bg-slate-950/60 border rounded-xl p-4 transition-all space-y-3 ${
                      isPending ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-slate-800/90 hover:border-slate-700/80'
                    }`}
                  >
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold">
                          {trf.protocolNumber || trf.id}
                        </span>

                        {isPending ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pendente de Recibo
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Recebido no Cofre
                          </span>
                        )}

                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatTimestamp(trf.transferDate || trf.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {userCanReceive && onReceiveTransfer && (
                          <button
                            onClick={() => {
                              onClose();
                              onReceiveTransfer(trf);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-md shadow-emerald-950/40"
                          >
                            <Inbox className="w-3.5 h-3.5" />
                            <span>Receber Armamento</span>
                          </button>
                        )}

                        <button
                          onClick={() => onSelectTransfer(trf)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors w-fit"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                          <span>Ver Recibo / PDF</span>
                        </button>
                      </div>
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
                        <p className="font-semibold text-emerald-300">{trf.destinationUnitName}</p>
                        <p className="text-[11px] text-slate-400">
                          {isPending 
                            ? 'Aguardando confirmação de entrada no cofre'
                            : `Local: ${trf.destinationVaultSpaceCode || 'Cofre Principal'}`}
                        </p>
                        {trf.receivedByUserName && (
                          <p className="text-[11px] text-emerald-400/80">
                            Recebido por: {trf.receivedByUserName} ({formatTimestamp(trf.receivedAt || '')})
                          </p>
                        )}
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

                    {/* Reason */}
                    {trf.reason && (
                      <div className="text-[11px] text-slate-400 bg-slate-900/40 rounded p-2 border border-slate-800/40">
                        <span className="text-slate-500 font-medium">Motivo: </span>
                        {trf.reason}
                      </div>
                    )}

                  </div>
                );
              })}
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
