import React, { useState, useEffect, useMemo } from 'react';
import { User, Weapon, WeaponMaintenance, Department, Unit, VaultSpace } from '../types';
import { storage } from '../services/storage';
import { formatTimestamp } from '../utils/masks';
import { printDocumentInPage } from '../utils/printHelper';
import {
  Wrench,
  X,
  Printer,
  Search,
  Filter,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Crosshair,
  UserCheck,
  FileText,
  Shield
} from 'lucide-react';

interface ModalHistoricoManutencoesProps {
  weapon?: Weapon | null; // If provided, shows history for this weapon only
  weapons: Weapon[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  currentUser: User;
  onClose: () => void;
}

export const ModalHistoricoManutencoes: React.FC<ModalHistoricoManutencoesProps> = ({
  weapon,
  weapons,
  departments,
  units,
  vaultSpaces,
  currentUser,
  onClose
}) => {
  const [maintenances, setMaintenances] = useState<WeaponMaintenance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'EM_ANDAMENTO' | 'CONCLUIDA'>('TODOS');
  const [filterType, setFilterType] = useState<'TODOS' | 'Interna' | 'Externa'>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isWeaponSpecific = Boolean(weapon);

  useEffect(() => {
    loadMaintenances();
  }, [weapon?.id]);

  const loadMaintenances = async () => {
    try {
      setLoading(true);
      const data = await storage.getMaintenances(weapon?.id);
      setMaintenances(data || []);
      if (data && data.length > 0 && isWeaponSpecific) {
        setExpandedId(data[0].id);
      }
    } catch (err: any) {
      console.error('Erro ao carregar histórico de manutenções:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredList = useMemo(() => {
    return maintenances.filter(m => {
      if (filterStatus !== 'TODOS' && m.status !== filterStatus) return false;
      if (filterType !== 'TODOS' && m.type !== filterType) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const serialMatch = (m.serialNumber || '').toLowerCase().includes(term);
        const modelMatch = ((m as any).weaponModel || '').toLowerCase().includes(term);
        const shopMatch = (m.workshopName || '').toLowerCase().includes(term);
        const armorerMatch = (m.sentArmorerName || '').toLowerCase().includes(term) || (m.returnArmorerName || '').toLowerCase().includes(term);
        const descMatch = (m.sentDescription || '').toLowerCase().includes(term) || (m.returnServiceDescription || '').toLowerCase().includes(term);
        if (!serialMatch && !modelMatch && !shopMatch && !armorerMatch && !descMatch) return false;
      }

      return true;
    });
  }, [maintenances, filterStatus, filterType, searchTerm]);

  // Statistics counters
  const totalCount = maintenances.length;
  const ongoingCount = maintenances.filter(m => m.status === 'EM_ANDAMENTO').length;
  const completedCount = maintenances.filter(m => m.status === 'CONCLUIDA').length;
  const internalCount = maintenances.filter(m => m.type === 'Interna').length;
  const externalCount = maintenances.filter(m => m.type === 'Externa').length;

  // Print Report Handler
  const handlePrintReport = () => {
    const nowStr = new Date().toLocaleString('pt-BR');
    const title = isWeaponSpecific
      ? `RELATÓRIO DE MANUTENÇÕES - ARMA ${weapon?.model} (SÉRIE: ${weapon?.serialNumber})`
      : 'RELATÓRIO GERAL DE MANUTENÇÕES DE ARMAMENTOS';

    const rowsHtml = filteredList.map((m, idx) => {
      const wep = weapons.find(w => w.id === m.weaponId);
      const modelStr = (m as any).weaponModel || wep?.model || 'N/A';
      const caliberStr = (m as any).caliber || wep?.caliber || '';
      const isCompleted = m.status === 'CONCLUIDA';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 8px 6px; font-family: monospace; font-weight: bold;">#${idx + 1}</td>
          <td style="padding: 8px 6px; font-weight: bold;">${modelStr}<br/><span style="font-family: monospace; color: #b45309;">${m.serialNumber}</span> ${caliberStr ? `(${caliberStr})` : ''}</td>
          <td style="padding: 8px 6px; text-align: center;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${m.type === 'Interna' ? '#e0f2fe; color: #0369a1;' : '#fef3c7; color: #b45309;'}">
              ${m.type}
            </span>
          </td>
          <td style="padding: 8px 6px;">
            <strong>Envio:</strong> ${m.sentDate ? formatTimestamp(m.sentDate) : 'N/A'}<br/>
            <strong>Armeiro:</strong> ${m.sentArmorerName || 'N/A'}<br/>
            ${m.type === 'Externa' && m.workshopName ? `<strong>Armeria:</strong> ${m.workshopName}${m.workshopArmorerName ? ` | <strong>Armeiro Resp.:</strong> ${m.workshopArmorerName}` : ''}${m.workshopCredenciamentoPf ? ` | <strong>Cred. PF:</strong> ${m.workshopCredenciamentoPf}` : ''}<br/>` : ''}
            <span style="font-style: italic; color: #475569;">${m.sentDescription || ''}</span>
          </td>
          <td style="padding: 8px 6px;">
            ${isCompleted ? `
              <strong>Retorno:</strong> ${m.returnDate ? formatTimestamp(m.returnDate) : 'N/A'}<br/>
              <strong>Armeiro Recebedor:</strong> ${m.returnArmorerName || 'N/A'}<br/>
              <strong>Serviço Realizado:</strong> <span style="font-style: italic; color: #15803d;">${m.returnServiceDescription || 'Serviço concluído'}</span>
            ` : `
              <span style="color: #b45309; font-weight: bold;">EM ANDAMENTO</span>
            `}
          </td>
          <td style="padding: 8px 6px; text-align: center; font-family: monospace;">
            ${m.shotCountAtMaintenance !== undefined ? `${m.shotCountAtMaintenance} tiros` : '-'}
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .subtitle { font-size: 10px; color: #475569; margin-top: 2px; }
          .meta { font-size: 10px; text-align: right; color: #475569; font-family: monospace; }
          .stats-bar { display: flex; gap: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; font-size: 10px; margin-bottom: 12px; }
          .stats-item strong { color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #f1f5f9; padding: 8px 6px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .signature-box { width: 220px; text-align: center; border-top: 1px solid #0f172a; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${title}</div>
            <div class="subtitle">SISTEMA INTEGRADO DE GESTÃO DE ARMAMENTO E MUNIÇÕES - SISARM</div>
          </div>
          <div class="meta">
            Gerado em: ${nowStr}<br/>
            Operador: ${currentUser.name} (MASP: ${currentUser.masp})
          </div>
        </div>

        <div class="stats-bar">
          <div class="stats-item">Total de Registros: <strong>${filteredList.length}</strong></div>
          <div class="stats-item">Internas: <strong>${internalCount}</strong></div>
          <div class="stats-item">Externas: <strong>${externalCount}</strong></div>
          <div class="stats-item">Em Andamento: <strong style="color: #b45309;">${ongoingCount}</strong></div>
          <div class="stats-item">Concluídas: <strong style="color: #15803d;">${completedCount}</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="width: 140px;">Armamento</th>
              <th style="width: 80px; text-align: center;">Tipo</th>
              <th>Envio / Diagnóstico</th>
              <th>Retorno / Serviço Realizado</th>
              <th style="width: 70px; text-align: center;">Tiros</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #64748b;">Nenhuma manutenção encontrada com os filtros selecionados.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <div class="signature-box">
            <strong>${currentUser.name}</strong><br/>
            <span>Armeiro / Responsável</span>
          </div>
          <div class="signature-box">
            <strong>Comando / Chefia da Unidade</strong><br/>
            <span>Visto / Homologação</span>
          </div>
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {isWeaponSpecific
                  ? `Histórico de Manutenções da Arma: ${weapon?.model} (${weapon?.serialNumber})`
                  : 'Histórico Geral de Manutenções de Armas'}
              </h3>
              <p className="text-xs text-slate-400">
                {isWeaponSpecific
                  ? `${totalCount} manutenção(ões) registrada(s) para este armamento.`
                  : 'Visualização completa de todas as manutenções internas e externas da frota.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrintReport}
              disabled={filteredList.length === 0}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-500/30 transition flex items-center space-x-1.5 shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Relatório</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Counters Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total</span>
            <span className="text-base font-bold font-mono text-slate-100">{totalCount}</span>
          </div>
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-[10px] text-amber-400 block font-semibold uppercase">Em Andamento</span>
            <span className="text-base font-bold font-mono text-amber-400">{ongoingCount}</span>
          </div>
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-[10px] text-emerald-400 block font-semibold uppercase">Concluídas</span>
            <span className="text-base font-bold font-mono text-emerald-400">{completedCount}</span>
          </div>
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-[10px] text-sky-400 block font-semibold uppercase">Internas</span>
            <span className="text-base font-bold font-mono text-sky-400">{internalCount}</span>
          </div>
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-[10px] text-purple-400 block font-semibold uppercase">Externas</span>
            <span className="text-base font-bold font-mono text-purple-400">{externalCount}</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Status Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-semibold text-[11px]">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="EM_ANDAMENTO">Em Andamento (Na Oficina/Armeria)</option>
                <option value="CONCLUIDA">Concluídas (No Cofre)</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-semibold text-[11px]">Tipo:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value="TODOS">Todos os Tipos</option>
                <option value="Interna">Interna (Própria)</option>
                <option value="Externa">Externa (Oficina/Armeria)</option>
              </select>
            </div>

          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar série, modelo, armeiro..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-100 focus:border-amber-500 focus:outline-none placeholder-slate-500"
            />
          </div>
        </div>

        {/* Maintenance Items List */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Carregando histórico de manutenções...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl italic">
            Nenhum registro de manutenção encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
            {filteredList.map((m) => {
              const isExpanded = expandedId === m.id;
              const isCompleted = m.status === 'CONCLUIDA';
              const wep = weapons.find(w => w.id === m.weaponId);
              const modelName = (m as any).weaponModel || wep?.model || 'Arma';
              const caliberName = (m as any).caliber || wep?.caliber || '';
              const vaultName = vaultSpaces.find(v => v.id === m.originalVaultSpaceId)?.code || m.originalVaultSpaceId || 'Cofre';

              return (
                <div
                  key={m.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition"
                >
                  {/* Clickable Header */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/60 select-none"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-xl border ${
                        m.type === 'Interna'
                          ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                          : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                      }`}>
                        <Wrench className="w-4 h-4" />
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-100 text-xs">
                            {modelName} {caliberName ? `(${caliberName})` : ''}
                          </span>
                          <span className="font-mono text-amber-400 font-bold text-xs">
                            Série: {m.serialNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'Interna'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          }`}>
                            {m.type}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 mt-1 text-[11px] text-slate-400">
                          <span>Envio: <strong className="text-slate-300 font-mono">{formatTimestamp(m.sentDate)}</strong></span>
                          <span>•</span>
                          <span>Armeiro: <strong className="text-slate-300">{m.sentArmorerName}</strong></span>
                          {m.type === 'Externa' && m.workshopName && (
                            <>
                              <span>•</span>
                              <span className="text-amber-400 font-medium">Oficina: {m.workshopName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isCompleted
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {isCompleted ? 'Concluída' : 'Em Manutenção'}
                      </span>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details Body */}
                  {isExpanded && (
                    <div className="p-4 pt-2 border-t border-slate-800 bg-slate-900/40 space-y-3 text-xs">
                      
                      {/* Shot Count & Vault Info Banner */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg font-mono text-[11px]">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">TIROS NO MOMENTO DO ENVIO:</span>
                          <span className="text-amber-400 font-bold">{m.shotCountAtMaintenance || 0} disparos</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">LOCAL DE ORIGEM NO COFRE:</span>
                          <span className="text-slate-200 font-bold">{vaultName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">STATUS ATUAL:</span>
                          <span className={isCompleted ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                            {isCompleted ? 'Concluída (No Cofre)' : 'Em Manutenção'}
                          </span>
                        </div>
                      </div>

                      {/* External Workshop Address & Armorer/PF info (if Externa) */}
                      {m.type === 'Externa' && (
                        <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between border-b border-purple-900/30 pb-1">
                            <div className="flex items-center space-x-1.5 font-bold text-purple-300 text-[11px]">
                              <Building className="w-3.5 h-3.5" />
                              <span>Armeria Externa: {m.workshopName}</span>
                            </div>
                            {m.workshopCredenciamentoPf && (
                              <div className="flex items-center space-x-1 text-[10px] text-purple-300 font-mono bg-purple-900/40 px-2 py-0.5 rounded border border-purple-700/50">
                                <Shield className="w-3 h-3 text-purple-400" />
                                <span>Cred. PF: {m.workshopCredenciamentoPf}</span>
                              </div>
                            )}
                          </div>

                          {m.workshopArmorerName && (
                            <div className="flex items-center space-x-1.5 text-[11px] text-slate-300">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Armeiro Responsável: <strong className="text-slate-100">{m.workshopArmorerName}</strong></span>
                            </div>
                          )}

                          <div className="text-[11px] text-slate-300 flex items-start space-x-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>
                              {m.workshopStreet ? `${m.workshopStreet}, ` : ''}
                              {m.workshopNumber ? `Nº ${m.workshopNumber}, ` : ''}
                              {m.workshopComplement ? `${m.workshopComplement}, ` : ''}
                              {m.workshopNeighborhood ? `${m.workshopNeighborhood}, ` : ''}
                              {m.workshopCity ? `${m.workshopCity} - ` : ''}
                              {m.workshopState || ''}
                              {m.workshopCep ? ` (CEP: ${m.workshopCep})` : ''}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Descrição do Envio */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                          Descrição / Motivo do Envio:
                        </span>
                        <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {m.sentDescription || 'Sem observações adicionais informadas.'}
                        </p>
                      </div>

                      {/* Retorno da Manutenção (se concluída) */}
                      {isCompleted ? (
                        <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg space-y-2">
                          <div className="flex items-center justify-between border-b border-emerald-900/30 pb-1.5">
                            <div className="flex items-center space-x-1.5 font-bold text-emerald-400 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Recebimento e Conclusão dos Serviços</span>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400">
                              Data: {m.returnDate ? formatTimestamp(m.returnDate) : 'N/A'}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-300">
                            Armeiro que recebeu: <strong className="text-slate-100">{m.returnArmorerName || 'N/A'}</strong>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90 block mb-0.5">
                              Tipo de Serviço Realizado / Laudo Técnico:
                            </span>
                            <p className="text-slate-100 leading-relaxed whitespace-pre-wrap italic">
                              {m.returnServiceDescription || 'Serviço concluído e homologado pelo armeiro.'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-[11px] flex items-center justify-between">
                          <span>Armamento ainda se encontra em manutenção.</span>
                          <span className="font-bold uppercase tracking-wider text-[10px]">Pendente de Recebimento</span>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Total filtrado: <strong className="text-slate-200 font-mono">{filteredList.length}</strong> de <strong className="text-slate-200 font-mono">{totalCount}</strong>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition shadow"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
