import React, { useState, useMemo } from 'react';
import { AmmoTransfer, User, AmmoTransferItem } from '../types';
import { storage } from '../services/storage';
import { formatTimestamp } from '../utils/masks';
import { printDocumentInPage, buildStandardDocumentTitle, escapeHtmlText } from '../utils/printHelper';
import {
  ArrowRightLeft,
  Search,
  Printer,
  X,
  FileText,
  Building2,
  Calendar,
  UserCheck,
  Plus,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Ban,
  Eye,
  Disc
} from 'lucide-react';

interface TransferAmmoHistoryModalProps {
  transfers: AmmoTransfer[];
  currentUser: User;
  selectedUnitId?: string;
  onClose: () => void;
  onOpenNewTransfer?: () => void;
  onReceiveTransfer?: (transfer: AmmoTransfer) => void;
  onRefresh?: () => void;
}

export function printAmmoTransferReceipt(trf: AmmoTransfer) {
  const isPending = (trf.status || 'Pendente') === 'Pendente';
  const isReceived = trf.status === 'Recebido';
  const isCancelled = trf.status === 'Cancelado';

  const itemsRowsHtml = (trf.items || []).map((it, idx) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
      <td style="padding: 8px; font-weight: bold;">${it.fabricante || 'CBC'}</td>
      <td style="padding: 8px; font-weight: bold; font-family: monospace;">${it.caliberName}</td>
      <td style="padding: 8px;">${it.tipoMunicao || 'COMUM'} ${it.pesoMunicao ? `(${it.pesoMunicao})` : ''}</td>
      <td style="padding: 8px; font-family: monospace;">${it.loteMunicao || 'S/L'}</td>
      <td style="padding: 8px; text-align: center;">${it.destinacao || 'Treinamento'}</td>
      <td style="padding: 8px; text-align: center;">${it.anoFabricacao || '-'}</td>
      <td style="padding: 8px; text-align: center; font-weight: bold; font-family: monospace;">${it.quantity} un.</td>
    </tr>
  `).join('');

  const statusTitle = isPending
    ? 'EM TRÂNSITO / AGUARDANDO RECIBO NO DESTINO'
    : isCancelled
    ? 'TRANSFERÊNCIA DESFEITA / CANCELADA'
    : 'TRANSFERÊNCIA CONCLUÍDA E RECEBIDA NO COFRE';

  const documentType = isPending
    ? 'GUIA DE TRÂNSITO E REMANEJAMENTO DE MUNIÇÕES'
    : 'TERMO OFICIAL DE TRANSFERÊNCIA DE MUNIÇÕES';

  const totalQuantity = (trf.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0) || trf.totalQuantity || 0;

  const docTitle = buildStandardDocumentTitle(
    isPending ? 'Guia de Transferência (Munições)' : 'Termo de Transferência (Munições)',
    trf.protocolNumber || trf.id,
    trf.receivedByUserName || trf.transferredByUserName || trf.receiverOrTransporterName
  );

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtmlText(docTitle)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #111827;
          background: #fff;
          margin: 0;
          padding: 16px;
          font-size: 11px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .title {
          font-size: 15px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
        }
        .subtitle {
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          margin-top: 2px;
        }
        .reg-id {
          font-family: monospace;
          font-size: 11px;
          font-weight: bold;
          text-align: right;
        }
        .status-bar {
          background-color: #f3f4f6;
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          font-weight: bold;
          text-align: center;
          margin-bottom: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .section-title {
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          border-bottom: 1px solid #9ca3af;
          padding-bottom: 4px;
          margin-top: 14px;
          margin-bottom: 8px;
          color: #1f2937;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .info-card {
          border: 1px solid #e5e7eb;
          padding: 8px 10px;
          background-color: #f9fafb;
          border-radius: 4px;
        }
        .field {
          margin-bottom: 4px;
        }
        .label {
          color: #6b7280;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
        }
        .val {
          color: #111827;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 10px;
        }
        th {
          background-color: #f3f4f6;
          border-top: 1px solid #d1d5db;
          border-bottom: 1px solid #d1d5db;
          padding: 6px;
          text-align: left;
          font-weight: bold;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-top: 40px;
          page-break-inside: avoid;
        }
        .sig-line {
          border-top: 1px solid #000;
          padding-top: 6px;
          text-align: center;
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
          <div class="subtitle">${documentType}</div>
          <div style="font-size: 10px; color: #4b5563; margin-top: 2px;">Sistema Integrado de Armaria, Munições e Logística Policial</div>
        </div>
        <div class="reg-id">
          <div>PROTOCOLO: <strong>${trf.protocolNumber || trf.id}</strong></div>
          <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">Data: ${formatTimestamp(trf.transferDate || trf.createdAt)}</div>
        </div>
      </div>

      <div class="status-bar">${statusTitle}</div>

      <div class="section-title">1. UNIDADES ENVOLVIDAS NA MOVIMENTAÇÃO</div>
      <div class="grid-2">
        <div class="info-card">
          <div class="label">Origem (Remetente):</div>
          <div class="val" style="font-size: 12px; margin-bottom: 4px;">${trf.originUnitName}</div>
          <div class="field"><span class="label">Departamento:</span> <span class="val">${trf.originDepartmentName}</span></div>
          <div class="field"><span class="label">Responsável:</span> <span class="val">${trf.transferredByUserName} (MASP: ${trf.transferredByUserMasp})</span></div>
        </div>
        <div class="info-card">
          <div class="label">Destino (Destinatário):</div>
          <div class="val" style="font-size: 12px; margin-bottom: 4px;">${trf.destinationUnitName}</div>
          <div class="field"><span class="label">Departamento:</span> <span class="val">${trf.destinationDepartmentName}</span></div>
          <div class="field"><span class="label">Armeiro / Destinatário:</span> <span class="val">${trf.destinationArmorerName || 'Armeiro da Unidade'} ${trf.destinationArmorerMasp ? `(MASP: ${trf.destinationArmorerMasp})` : ''}</span></div>
        </div>
      </div>

      <div class="section-title">2. TRANSPORTE E JUSTIFICATIVA</div>
      <div class="info-card">
        <div class="field"><span class="label">Policial Transportador:</span> <span class="val">${trf.receiverOrTransporterName} (MASP: ${trf.receiverOrTransporterMasp}) - Cargo: ${trf.receiverOrTransporterCargo || 'POLICIAL CIVIL'}</span></div>
        <div class="field"><span class="label">Motivo da Transferência:</span> <span class="val">${trf.reason}</span></div>
        ${trf.observation ? `<div class="field"><span class="label">Observações:</span> <span class="val">${trf.observation}</span></div>` : ''}
      </div>

      <div class="section-title">3. RELAÇÃO DE MUNIÇÕES TRANSFERIDAS (TOTAL: ${totalQuantity} UNIDADES)</div>
      <table>
        <thead>
          <tr>
            <th style="width: 30px; text-align: center;">Item</th>
            <th>Fabricante</th>
            <th>Calibre</th>
            <th>Tipo / Especificação</th>
            <th>Lote</th>
            <th style="text-align: center;">Destinação</th>
            <th style="text-align: center;">Ano</th>
            <th style="text-align: center;">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      ${isReceived ? `
        <div class="section-title">4. RECIBO DE ENTRADA NO COFRE DE DESTINO</div>
        <div class="info-card">
          <div class="field"><span class="label">Recebido por:</span> <span class="val">${trf.receivedByUserName} (MASP: ${trf.receivedByUserMasp})</span></div>
          <div class="field"><span class="label">Data/Hora do Recibo:</span> <span class="val">${formatTimestamp(trf.receivedAt || '')}</span></div>
          <div class="field"><span class="label">Local de Guarda Destino:</span> <span class="val">${trf.destinationVaultSpaceCode || 'Cofre Principal'}</span></div>
        </div>
      ` : ''}

      <div class="signatures">
        <div class="sig-line">
          <strong>${trf.transferredByUserName}</strong><br/>
          MASP: ${trf.transferredByUserMasp}<br/>
          Armaria de Origem - ${trf.originUnitName}
        </div>
        <div class="sig-line">
          <strong>${trf.receiverOrTransporterName}</strong><br/>
          MASP: ${trf.receiverOrTransporterMasp}<br/>
          Policial Transportador / Condutor
        </div>
      </div>
    </body>
    </html>
  `;

  printDocumentInPage(html);
}

export const ModalHistoricoTransferenciasMunicao: React.FC<TransferAmmoHistoryModalProps> = ({
  transfers,
  currentUser,
  selectedUnitId,
  onClose,
  onOpenNewTransfer,
  onReceiveTransfer,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Recebido' | 'Cancelado'>('all');
  
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const isAdmin = effectiveRole === 'Administrador';
  const isArmeiro = effectiveRole === 'Armeiro';
  const isDeptArmeiro = isArmeiro && currentUser.managementScope === 'department';
  const hasDeptWideScope = isGeral || isAdmin || isDeptArmeiro;

  const allUnits = useMemo(() => storage.getAllUnits(), []);
  const filterableUnits = useMemo(() => {
    if (isGeral) return allUnits;
    return allUnits.filter(u => u.departmentId === currentUser.departmentId);
  }, [allUnits, isGeral, currentUser.departmentId]);
  const deptUnitIds = useMemo(() => new Set(filterableUnits.map(u => u.id)), [filterableUnits]);

  const isLockedToSingleUnit = !hasDeptWideScope && Boolean(currentUser.unitId);

  const [activeUnitFilter, setActiveUnitFilter] = useState<string>(() => {
    if (isLockedToSingleUnit) return currentUser.unitId;
    if (selectedUnitId && selectedUnitId !== 'ALL') return selectedUnitId;
    return 'ALL';
  });

  // Selected transfer for detailed view
  const [selectedTransfer, setSelectedTransfer] = useState<AmmoTransfer | null>(null);

  // Undo transfer states
  const [transferToUndo, setTransferToUndo] = useState<AmmoTransfer | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const unitScopedTransfers = useMemo(() => {
    let result = transfers;
    if (isLockedToSingleUnit) {
      result = result.filter(
        t => t.originUnitId === currentUser.unitId || t.destinationUnitId === currentUser.unitId
      );
    } else {
      if (!isGeral && currentUser.departmentId) {
        result = result.filter(
          t =>
            t.originDepartmentId === currentUser.departmentId ||
            t.destinationDepartmentId === currentUser.departmentId ||
            (t.originUnitId ? deptUnitIds.has(t.originUnitId) : false) ||
            (t.destinationUnitId ? deptUnitIds.has(t.destinationUnitId) : false)
        );
      }
      if (activeUnitFilter && activeUnitFilter !== 'ALL') {
        result = result.filter(
          t => t.originUnitId === activeUnitFilter || t.destinationUnitId === activeUnitFilter
        );
      }
    }
    return result;
  }, [transfers, isLockedToSingleUnit, isGeral, currentUser.unitId, currentUser.departmentId, deptUnitIds, activeUnitFilter]);

  const filteredTransfers = useMemo(() => {
    let result = unitScopedTransfers;
    if (statusFilter !== 'all') {
      result = result.filter(t => (t.status || 'Pendente') === statusFilter);
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
      const itemMatch = (t.items || []).some(it =>
        it.caliberName.toLowerCase().includes(term) ||
        (it.tipoMunicao || '').toLowerCase().includes(term) ||
        (it.loteMunicao || '').toLowerCase().includes(term) ||
        (it.fabricante || '').toLowerCase().includes(term)
      );

      return protocolMatch || originMatch || destMatch || transporterMatch || userMatch || reasonMatch || itemMatch;
    });
  }, [unitScopedTransfers, searchTerm, statusFilter]);

  const canUndoTransfer = (trf: AmmoTransfer) => {
    if (trf.status !== 'Pendente') return false;
    if (isGeral) return true;
    if (trf.transferredByUserId === currentUser.id) return true;
    if (isAdmin) {
      return !currentUser.departmentId || trf.originDepartmentId === currentUser.departmentId || (trf.originUnitId ? deptUnitIds.has(trf.originUnitId) : false);
    }
    if (isArmeiro) {
      if (isDeptArmeiro) {
        return trf.originDepartmentId === currentUser.departmentId || (trf.originUnitId ? deptUnitIds.has(trf.originUnitId) : false);
      }
      return currentUser.unitId === trf.originUnitId;
    }
    return false;
  };

  const handleExecuteUndo = async () => {
    if (!transferToUndo) return;
    try {
      setUndoLoading(true);
      setUndoError(null);
      await storage.undoAmmoTransfer(transferToUndo.id);
      setSuccessMessage(`Transferência ${transferToUndo.protocolNumber || transferToUndo.id} desfeita com sucesso! O estoque foi estornado para a unidade ${transferToUndo.originUnitName}.`);
      setTransferToUndo(null);
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (err: any) {
      setUndoError(err.message || 'Erro ao desfazer transferência de munição.');
    } finally {
      setUndoLoading(false);
    }
  };

  return (
    <div id="ammo-transfer-history-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl my-8 overflow-hidden relative">
        
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Histórico de Transferências de Munições</h2>
              <p className="text-xs text-slate-400">
                Guias de trânsito, remanejamentos e histórico de envio e recebimento entre unidades
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenNewTransfer && (
              <button
                id="new-ammo-transfer-from-history-btn"
                onClick={() => {
                  onClose();
                  onOpenNewTransfer();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Transferência</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {successMessage && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Unit Isolation Info Banner or Selector */}
          {isLockedToSingleUnit ? (
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-slate-300">
                  Unidade: <strong className="text-sky-300">{currentUser.unitName || allUnits.find(u => u.id === currentUser.unitId)?.name || 'Sua Unidade'}</strong>
                </span>
              </div>
              <span className="text-[11px] text-sky-300/90 font-medium bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 w-fit">
                Exibindo estritamente transferências de Origem ou Destino desta unidade
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-slate-300 font-medium">Filtrar por Unidade Envolvida (Origem ou Destino):</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={activeUnitFilter}
                  onChange={e => setActiveUnitFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-sky-500"
                >
                  <option value="ALL">
                    {isGeral ? 'Todas as Unidades (Visão Geral)' : 'Todas as Unidades do Departamento'}
                  </option>
                  {filterableUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {activeUnitFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setActiveUnitFilter('ALL')}
                    className="text-[11px] text-slate-400 hover:text-white underline shrink-0"
                  >
                    Ver Todas
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por protocolo, calibre, lote, fabricante, unidade de origem/destino..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas ({unitScopedTransfers.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Pendente')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'Pendente' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pendentes ({unitScopedTransfers.filter(t => (t.status || 'Pendente') === 'Pendente').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Recebido')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'Recebido' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Recebidas ({unitScopedTransfers.filter(t => t.status === 'Recebido').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Cancelado')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'Cancelado' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Desfeitas ({unitScopedTransfers.filter(t => t.status === 'Cancelado').length})</span>
              </button>
            </div>
          </div>

          {/* Transfers List */}
          {filteredTransfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80">
              <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">Nenhum registro de transferência de munições encontrado</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm || statusFilter !== 'all' ? 'Tente ajustar os filtros da sua pesquisa.' : 'Nenhuma transferência de munições registrada para esta unidade.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransfers.map(trf => {
                const isPending = (trf.status || 'Pendente') === 'Pendente';
                const isReceived = trf.status === 'Recebido';
                const isCancelled = trf.status === 'Cancelado';
                const userCanUndo = isPending && canUndoTransfer(trf);
                const totalQtd = (trf.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0) || trf.totalQuantity || 0;

                return (
                  <div
                    key={trf.id}
                    className={`bg-slate-950/60 border rounded-xl p-4 transition-all space-y-3 ${
                      isPending 
                        ? 'border-amber-500/30 hover:border-amber-500/50' 
                        : isCancelled 
                        ? 'border-rose-900/40 opacity-75' 
                        : 'border-slate-800/90 hover:border-slate-700/80'
                    }`}
                  >
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono text-xs font-bold">
                          {trf.protocolNumber || trf.id}
                        </span>

                        {isPending && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pendente de Recibo
                          </span>
                        )}

                        {isReceived && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Recebido no Cofre
                          </span>
                        )}

                        {isCancelled && (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-semibold flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            Transferência Desfeita / Cancelada
                          </span>
                        )}

                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatTimestamp(trf.transferDate || trf.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {userCanUndo && (
                          <button
                            type="button"
                            onClick={() => {
                              setUndoError(null);
                              setTransferToUndo(trf);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                            title="Desfazer envio e estornar estoque para a unidade de origem"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                            <span>Desfazer Envio</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => printAmmoTransferReceipt(trf)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-md shadow-sky-950/40"
                          title="Imprimir Guia de Trânsito ou Termo de Recibo Oficial em PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{isPending ? 'Imprimir Guia / PDF' : 'Imprimir Recibo / PDF'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedTransfer(trf)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          <span>Detalhes</span>
                        </button>
                      </div>
                    </div>

                    {/* Middle row: Origin -> Destination */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-sky-400" /> Origem:
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
                            ? 'Aguardando conferência e entrada no cofre'
                            : isCancelled
                            ? 'Transferência cancelada'
                            : `Local: ${trf.destinationVaultSpaceCode || 'Cofre Principal'}`}
                        </p>
                        {trf.receivedByUserName && (
                          <p className="text-[11px] text-emerald-400/80">
                            Recebido por: {trf.receivedByUserName} ({formatTimestamp(trf.receivedAt || '')})
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ammo summary badge */}
                    <div className="bg-slate-900/60 border border-slate-800/70 rounded-lg p-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                          <Disc className="w-3.5 h-3.5 text-sky-400" /> Lotes de Munições:
                        </span>
                        <span className="font-mono font-bold text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded text-[11px]">
                          Total: {totalQtd} munições ({trf.items?.length || 1} lote(s))
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {(trf.items || []).map((it, idx) => (
                          <div key={idx} className="bg-slate-950/80 border border-slate-800 p-2 rounded flex justify-between items-center">
                            <div>
                              <span className="font-bold text-slate-200">{it.caliberName}</span>
                              <span className="text-slate-400 text-[10px] ml-1.5">({it.tipoMunicao || 'COMUM'} • {it.fabricante || 'CBC'})</span>
                              <div className="text-[10px] text-slate-500">Lote: {it.loteMunicao || 'S/L'} • Ano: {it.anoFabricacao || '-'}</div>
                            </div>
                            <span className="font-mono font-bold text-emerald-400">{it.quantity} un.</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom row: Transporter & Motivo */}
                    <div className="pt-2 border-t border-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Transportador: <strong className="text-slate-300">{trf.receiverOrTransporterName}</strong> (MASP: {trf.receiverOrTransporterMasp})</span>
                      </div>

                      {trf.reason && (
                        <div className="text-[11px] text-slate-400 truncate max-w-sm">
                          <span className="text-slate-500 font-medium">Motivo: </span>{trf.reason}
                        </div>
                      )}
                    </div>

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

        {/* UNDO CONFIRMATION MODAL */}
        {transferToUndo && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[60] overflow-y-auto">
            <div className="bg-slate-900 border-2 border-rose-500/50 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs text-slate-300 my-auto">
              <div className="flex items-center gap-3 border-b border-rose-500/30 pb-3">
                <div className="p-2 bg-rose-500 text-white rounded-xl shrink-0">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Desfazer Transferência de Munições</h3>
                  <p className="text-xs text-rose-200/90 font-mono">
                    Protocolo: {transferToUndo.protocolNumber || transferToUndo.id}
                  </p>
                </div>
              </div>

              {undoError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-200 text-xs">
                  {undoError}
                </div>
              )}

              <p className="text-slate-200">
                Tem certeza de que deseja desfazer esta transferência? As munições retornarão imediatamente ao estoque da unidade de origem ({transferToUndo.originUnitName}).
              </p>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Esta ação cancelará a guia de trânsito e restaurará a quantidade nos cofres de origem.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransferToUndo(null);
                    setUndoError(null);
                  }}
                  disabled={undoLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Manter Transferência
                </button>
                <button
                  type="button"
                  onClick={handleExecuteUndo}
                  disabled={undoLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-rose-600/30"
                >
                  {undoLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Desfazendo...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Sim, Desfazer Transferência</span>
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
