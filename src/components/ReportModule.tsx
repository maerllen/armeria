import React, { useState } from 'react';
import { User, Movement, AmmunitionMovement, Department, Unit, Caliber, Weapon, VaultSpace } from '../types';
import { formatTimestamp } from '../utils/masks';
import { FileText, Printer, Download, Filter, Search, Calendar, Shield, Disc, Crosshair, UserX, UserCheck } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface ReportModuleProps {
  currentUser: User;
  movements: Movement[];
  ammoMovements?: AmmunitionMovement[];
  departments: Department[];
  units: Unit[];
  calibers: Caliber[];
  weapons: Weapon[];
  users: User[];
  vaultSpaces?: VaultSpace[];
}

export const ReportModule: React.FC<ReportModuleProps> = ({
  currentUser,
  movements = [],
  ammoMovements = [],
  departments = [],
  units = [],
  calibers = [],
  weapons = [],
  users = [],
  vaultSpaces = []
}) => {
  const [activeTab, setActiveTab] = useState<'ARMAS' | 'MUNICIONAL' | 'TODOS'>('TODOS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedCaliber, setSelectedCaliber] = useState('ALL');
  const [selectedVaultSpace, setSelectedVaultSpace] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [recipientScope, setRecipientScope] = useState<'ALL' | 'SISTEMA' | 'FORA_DO_SISTEMA'>('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');

  // Permission Scope Filter
  const userRole = currentUser.role;

  const isMovementAllowed = (deptId?: string | null, unitId?: string | null) => {
    if (userRole === 'Geral') return true;
    if (userRole === 'Administrador' || (userRole === 'Armeiro' && currentUser.managementScope !== 'unit')) {
      return deptId === currentUser.departmentId;
    }
    return unitId === currentUser.unitId;
  };

  // Filter Weapon Movements
  const filteredWeaponMovements = movements.filter((m) => {
    if (!isMovementAllowed(m.departmentId, m.unitId)) return false;

    // Date
    if (startDate) {
      const mDate = new Date(m.createdAt).getTime();
      const sDate = new Date(startDate + 'T00:00:00').getTime();
      if (mDate < sDate) return false;
    }
    if (endDate) {
      const mDate = new Date(m.createdAt).getTime();
      const eDate = new Date(endDate + 'T23:59:59').getTime();
      if (mDate > eDate) return false;
    }

    // User / Recipient
    if (selectedUser !== 'ALL' && m.requesterId !== selectedUser) return false;

    // Caliber
    if (selectedCaliber !== 'ALL' && (m.caliber || '').toLowerCase() !== selectedCaliber.toLowerCase()) return false;

    // Vault Space
    if (selectedVaultSpace !== 'ALL' && m.withdrawalVaultSpaceId !== selectedVaultSpace && m.returnVaultSpaceId !== selectedVaultSpace) return false;

    // Dept & Unit
    if (selectedDept !== 'ALL' && m.departmentId !== selectedDept) return false;
    if (selectedUnit !== 'ALL' && m.unitId !== selectedUnit) return false;

    // Reason
    if (reasonFilter !== 'ALL' && !('Cautela'.toLowerCase().includes(reasonFilter.toLowerCase()))) return false;

    return true;
  });

  // Filter Ammo Movements
  const filteredAmmoMovements = ammoMovements.filter((m) => {
    if (!isMovementAllowed(m.departmentId, m.unitId)) return false;

    // Date
    if (startDate) {
      const mDate = new Date(m.createdAt).getTime();
      const sDate = new Date(startDate + 'T00:00:00').getTime();
      if (mDate < sDate) return false;
    }
    if (endDate) {
      const mDate = new Date(m.createdAt).getTime();
      const eDate = new Date(endDate + 'T23:59:59').getTime();
      if (mDate > eDate) return false;
    }

    // Caliber
    if (selectedCaliber !== 'ALL') {
      const cal = calibers.find(c => c.id === m.caliberId);
      const calName = cal ? cal.name : m.caliberId;
      if ((calName || '').toLowerCase() !== selectedCaliber.toLowerCase()) return false;
    }

    // Vault Space
    if (selectedVaultSpace !== 'ALL' && m.vaultSpaceId !== selectedVaultSpace) return false;

    // Dept & Unit
    if (selectedDept !== 'ALL' && m.departmentId !== selectedDept) return false;
    if (selectedUnit !== 'ALL' && m.unitId !== selectedUnit) return false;

    // Recipient Scope (Sistema / Fora do Sistema)
    if (recipientScope === 'SISTEMA' && m.responsibleType === 'FORA_DO_SISTEMA') return false;
    if (recipientScope === 'FORA_DO_SISTEMA' && m.responsibleType !== 'FORA_DO_SISTEMA') return false;

    // Specific User
    if (selectedUser !== 'ALL' && m.responsibleUserId !== selectedUser && m.userId !== selectedUser) return false;

    // Reason Filter
    if (reasonFilter !== 'ALL' && !(m.recipientOrReason || '').toLowerCase().includes(reasonFilter.toLowerCase())) return false;

    return true;
  });

  // Export CSV
  const handleExportCSV = () => {
    let csvRows: string[][] = [];

    if (activeTab === 'ARMAS' || activeTab === 'TODOS') {
      csvRows.push(['--- MOVIMENTAÇÕES DE ARMAMENTO ---']);
      csvRows.push(['Data/Hora', 'Policial', 'MASP', 'Tipo Arma', 'Modelo', 'Nº Serie', 'Calibre', 'Munições', 'Status']);
      filteredWeaponMovements.forEach(m => {
        csvRows.push([
          formatTimestamp(m.createdAt),
          `"${m.requesterName}"`,
          m.requesterMasp,
          m.weaponType,
          m.weaponModel,
          m.weaponSerialNumber,
          m.caliber,
          `${m.ammunitionCount} un`,
          m.status
        ]);
      });
    }

    if (activeTab === 'MUNICIONAL' || activeTab === 'TODOS') {
      if (csvRows.length > 0) csvRows.push([]);
      csvRows.push(['--- MOVIMENTAÇÕES DE MUNIÇÃO ---']);
      csvRows.push(['Data/Hora', 'Tipo', 'Calibre', 'Quantidade', 'Devolvidos', 'Destino/Motivo', 'Responsavel', 'MASP', 'Vinculo', 'Observacao', 'Armeiro']);
      filteredAmmoMovements.forEach(m => {
        const cal = calibers.find(c => c.id === m.caliberId);
        csvRows.push([
          formatTimestamp(m.createdAt),
          m.type,
          cal ? cal.name : m.caliberId,
          `${m.quantity} un`,
          `${m.returnedQuantity || 0} un`,
          `"${m.recipientOrReason}"`,
          `"${m.responsibleName || m.recipientOrReason}"`,
          m.responsibleMasp || '',
          m.responsibleType === 'FORA_DO_SISTEMA' ? 'Fora do Sistema' : 'No Sistema',
          `"${m.observation || ''}"`,
          `"${m.userName}"`
        ]);
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_pcmg_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório Operacional - PCMG</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 15px; font-size: 11px; line-height: 1.3; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
          .title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; }
          .subtitle { font-size: 10px; font-weight: 700; color: #374151; margin-top: 2px; }
          .meta { font-family: monospace; font-size: 10px; text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; font-family: monospace; }
          th { background: #f3f4f6; border: 1px solid #9ca3af; padding: 6px; text-align: left; font-weight: bold; text-transform: uppercase; }
          td { border: 1px solid #d1d5db; padding: 6px; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 25px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">RELATÓRIO DE MOVIMENTAÇÕES DE ARMAMENTO E MUNIÇÕES</div>
          </div>
          <div class="meta">
            Gerado em: ${new Date().toLocaleString('pt-BR')}<br>
            Filtros Ativos: ${reportType.toUpperCase()}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Solicitante / MASP</th>
              <th>Armamento / Material</th>
              <th>Série / Qtd</th>
              <th>Status</th>
              <th>Aprovador / Armeiro</th>
            </tr>
          </thead>
          <tbody>
            ${filteredMovements.slice(0, 100).map(m => `
              <tr>
                <td>#${m.id}</td>
                <td>${formatTimestamp(m.createdAt)}</td>
                <td>${m.requesterName} (${m.requesterMasp})</td>
                <td>${m.weaponType} ${m.weaponModel}</td>
                <td>${m.weaponSerialNumber}</td>
                <td><strong>${m.status}</strong></td>
                <td>${m.approvedByUserName || m.userName || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Documento extraído do Sistema de Armeria da Polícia Civil do Estado de Minas Gerais.
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Relatórios Gerenciais e Operacionais</h1>
            <p className="text-xs text-slate-400">
              Visualização e filtro completo de movimentações dentro do nível de permissão do usuário
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportCSV}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl print:hidden">
        <button
          onClick={() => setActiveTab('TODOS')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'TODOS'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Visão Geral Unificada</span>
        </button>

        <button
          onClick={() => setActiveTab('ARMAS')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'ARMAS'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>Cautelas de Armamento ({filteredWeaponMovements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MUNICIONAL')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'MUNICIONAL'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Disc className="w-4 h-4" />
          <span>Saídas e Sobras de Munição ({filteredAmmoMovements.length})</span>
        </button>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 print:hidden">
        <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Filter className="w-4 h-4" />
          <span>Filtros do Relatório (Calibre, Cofre, Departamento, Destinatário e Motivo)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          
          {/* Start Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          {/* Caliber Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Calibre</label>
            <select
              value={selectedCaliber}
              onChange={(e) => setSelectedCaliber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            >
              <option value="ALL">Todos os Calibres</option>
              {calibers.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Vault Space Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Cofre / Espaço</label>
            <select
              value={selectedVaultSpace}
              onChange={(e) => setSelectedVaultSpace(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            >
              <option value="ALL">Todos os Espaços do Cofre</option>
              {vaultSpaces.map(v => (
                <option key={v.id} value={v.id}>{v.code} ({v.type})</option>
              ))}
            </select>
          </div>

          {/* Destinatário Scope Filter (Sistema / Fora do Sistema) */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Destinatário (Vínculo)</label>
            <select
              value={recipientScope}
              onChange={(e) => setRecipientScope(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos (Sistema e Fora do Sistema)</option>
              <option value="SISTEMA">Apenas Cadastrados no Sistema</option>
              <option value="FORA_DO_SISTEMA">Apenas Fora do Sistema</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Policial / Usuário</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Policiais</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.masp})</option>
              ))}
            </select>
          </div>

          {/* Motivo da Retirada */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Motivo da Retirada</label>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Motivos</option>
              <option value="Curso">Curso ou Teste</option>
              <option value="Treinamento">Treinamento</option>
              <option value="Substituição">Substituição</option>
              <option value="Abastecimento do Cofre">Abastecimento do Cofre</option>
              <option value="Operacional">Operacional / Diligência</option>
            </select>
          </div>

          {/* Dept Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Departamento</label>
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedUnit('ALL');
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Departamentos</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Reset Filters */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSelectedUser('ALL');
              setSelectedCaliber('ALL');
              setSelectedVaultSpace('ALL');
              setSelectedDept('ALL');
              setSelectedUnit('ALL');
              setRecipientScope('ALL');
              setReasonFilter('ALL');
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* Printable Report Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 print:bg-white print:text-black print:p-0 print:border-none">
        
        {/* Printable Header */}
        <div className="border-b border-slate-800 pb-4 flex justify-between items-center print:border-black">
          <div>
            <h2 className="text-lg font-bold text-slate-100 print:text-black font-mono uppercase">
              POLÍCIA CIVIL • ESTADO DE MINAS GERAIS
            </h2>
            <p className="text-xs text-amber-400 print:text-black font-semibold font-mono">
              RELATÓRIO OFICIAL DE MOVIMENTAÇÃO DE ARMAMENTO E MUNIÇÕES
            </p>
          </div>
          <div className="text-right text-xs text-slate-400 print:text-gray-700 font-mono">
            <p>Emissor: <strong className="text-slate-200 print:text-black">{currentUser.name}</strong></p>
            <p>{formatTimestamp(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Section 1: Weapons Movements */}
        {(activeTab === 'ARMAS' || activeTab === 'TODOS') && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider font-mono flex items-center space-x-1">
              <Crosshair className="w-4 h-4 print:hidden" />
              <span>1. Movimentações e Cautelas de Armamento ({filteredWeaponMovements.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 print:text-black">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700 print:bg-gray-200 print:text-black">
                  <tr>
                    <th className="py-2.5 px-3">Data/Hora</th>
                    <th className="py-2.5 px-3">Policial Solicitante</th>
                    <th className="py-2.5 px-3">MASP</th>
                    <th className="py-2.5 px-3">Arma / Série</th>
                    <th className="py-2.5 px-3">Calibre</th>
                    <th className="py-2.5 px-3">Munições / Mags</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                  {filteredWeaponMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 print:text-gray-600 italic">
                        Nenhuma movimentação de arma encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredWeaponMovements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 print:text-black">
                          {formatTimestamp(m.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-200 print:text-black">
                          {m.requesterName}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{m.requesterMasp}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold block text-slate-200 print:text-black">{m.weaponType} {m.weaponModel}</span>
                          <span className="text-[10px] text-amber-400 font-mono print:text-gray-800">Série: {m.weaponSerialNumber}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{m.caliber}</td>
                        <td className="py-2.5 px-3 font-mono">{m.ammunitionCount} un / {m.magazineCount} mag</td>
                        <td className="py-2.5 px-3 font-bold">{m.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 2: Ammunition Movements */}
        {(activeTab === 'MUNICIONAL' || activeTab === 'TODOS') && (
          <div className="space-y-3 pt-4 border-t border-slate-800 print:border-gray-400">
            <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider font-mono flex items-center space-x-1">
              <Disc className="w-4 h-4 print:hidden" />
              <span>2. Saídas e Devolução de Munição ({filteredAmmoMovements.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 print:text-black">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700 print:bg-gray-200 print:text-black">
                  <tr>
                    <th className="py-2.5 px-3">Data/Hora</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Calibre</th>
                    <th className="py-2.5 px-3">Qtd / Sobra Devolvida</th>
                    <th className="py-2.5 px-3">Motivo / Destino</th>
                    <th className="py-2.5 px-3">Policial Responsável</th>
                    <th className="py-2.5 px-3">Vínculo</th>
                    <th className="py-2.5 px-3">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                  {filteredAmmoMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500 print:text-gray-600 italic">
                        Nenhuma movimentação de munição encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredAmmoMovements.map((m) => {
                      const cal = calibers.find(c => c.id === m.caliberId);
                      return (
                        <tr key={m.id}>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 print:text-black">
                            {formatTimestamp(m.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 font-bold">{m.type}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-400 print:text-black">
                            {cal ? cal.name : m.caliberId}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="font-bold block">{m.quantity} un</span>
                            {m.returnedQuantity !== undefined && m.returnedQuantity > 0 && (
                              <span className="text-[10px] text-emerald-400 print:text-black block">
                                Devolvidos: {m.returnedQuantity} un
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">{m.recipientOrReason}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold block">{m.responsibleName || m.recipientOrReason}</span>
                            {m.responsibleMasp && <span className="text-[10px] text-slate-400 font-mono block print:text-gray-700">MASP: {m.responsibleMasp}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-[11px]">
                            {m.responsibleType === 'FORA_DO_SISTEMA' ? (
                              <span className="text-amber-400 font-bold print:text-black">Fora do Sistema</span>
                            ) : (
                              <span className="text-slate-400 print:text-black">No Sistema</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-400 print:text-black max-w-xs truncate" title={m.observation}>
                            {m.observation || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between print:text-gray-600 font-mono">
          <span>Relatório gerado em conformidade com o Nível de Acesso: <strong>{currentUser.role}</strong></span>
          <span>Armeria PCMG v2.0</span>
        </div>

      </div>

    </div>
  );
};
