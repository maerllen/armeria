import React, { useState } from 'react';
import { User, Movement, Department, Unit, Caliber, Weapon } from '../types';
import { formatTimestamp } from '../utils/masks';
import { FileText, Printer, Download, Filter, Search, Calendar, Shield } from 'lucide-react';

interface ReportModuleProps {
  currentUser: User;
  movements: Movement[];
  departments: Department[];
  units: Unit[];
  calibers: Caliber[];
  weapons: Weapon[];
  users: User[];
}

export const ReportModule: React.FC<ReportModuleProps> = ({
  currentUser,
  movements,
  departments,
  units,
  calibers,
  weapons,
  users
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedCaliber, setSelectedCaliber] = useState('ALL');
  const [selectedWeaponType, setSelectedWeaponType] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');

  // Filter logic
  const filteredMovements = movements.filter((m) => {
    // Date filter
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

    // User filter
    if (selectedUser !== 'ALL' && m.requesterId !== selectedUser) return false;

    // Caliber filter
    if (selectedCaliber !== 'ALL' && m.caliber.toLowerCase() !== selectedCaliber.toLowerCase()) return false;

    // Weapon Type filter
    if (selectedWeaponType !== 'ALL' && m.weaponType.toLowerCase() !== selectedWeaponType.toLowerCase()) return false;

    // Dept filter
    if (selectedDept !== 'ALL' && m.departmentId !== selectedDept) return false;

    // Unit filter
    if (selectedUnit !== 'ALL' && m.unitId !== selectedUnit) return false;

    return true;
  });

  // Unique weapon types in system
  const weaponTypes = Array.from(new Set(['Fuzil', 'Pistola', 'Submetralhadora', 'Espingarda', 'Carabina']));

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = [
      'Data/Hora',
      'Policial',
      'MASP',
      'Arma Tipo',
      'Modelo',
      'Nº Serie',
      'Calibre',
      'Munições Levadas',
      'Carregadores',
      'Status',
      'Aprovador'
    ];

    const rows = filteredMovements.map(m => [
      formatTimestamp(m.createdAt),
      `"${m.requesterName}"`,
      m.requesterMasp,
      m.weaponType,
      m.weaponModel,
      m.weaponSerialNumber,
      m.caliber,
      m.ammunitionCount,
      m.magazineCount,
      m.status,
      `"${m.approvedByUserName || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_armeria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
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
              Geração de relatórios analíticos de movimentações por período, módulo, usuário e unidade
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

      {/* Filter Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 print:hidden">
        <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Filter className="w-4 h-4" />
          <span>Filtros do Relatório</span>
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

          {/* User */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Policial</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Policiais</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Caliber */}
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

          {/* Weapon Type */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Tipo de Arma</label>
            <select
              value={selectedWeaponType}
              onChange={(e) => setSelectedWeaponType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Tipos</option>
              {weaponTypes.map(wt => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>
          </div>

          {/* Dept */}
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

          {/* Unit */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Unidade</label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todas as Unidades</option>
              {units
                .filter(u => selectedDept === 'ALL' || u.departmentId === selectedDept)
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedUser('ALL');
                setSelectedCaliber('ALL');
                setSelectedWeaponType('ALL');
                setSelectedDept('ALL');
                setSelectedUnit('ALL');
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 rounded-xl text-xs"
            >
              Limpar Filtros
            </button>
          </div>

        </div>
      </div>

      {/* Printable Report View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4 print:bg-white print:text-black print:p-0 print:border-none">
        
        {/* Printable Header */}
        <div className="border-b border-slate-800 pb-4 flex justify-between items-center print:border-black">
          <div>
            <h2 className="text-lg font-bold text-slate-100 print:text-black font-mono">
              POLÍCIA CIVIL • ARMERIA
            </h2>
            <p className="text-xs text-slate-400 print:text-gray-700">
              Relatório de Movimentações e Controle de Armamento e Munições
            </p>
          </div>
          <div className="text-right text-xs text-slate-400 print:text-gray-700">
            <p>Gerado por: <strong className="text-slate-200 print:text-black">{currentUser.name}</strong></p>
            <p className="font-mono">{formatTimestamp(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 print:text-black">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700 print:bg-gray-200 print:text-black">
              <tr>
                <th className="py-2.5 px-3">Data/Hora</th>
                <th className="py-2.5 px-3">Policial / MASP</th>
                <th className="py-2.5 px-3">Arma / Série</th>
                <th className="py-2.5 px-3">Calibre</th>
                <th className="py-2.5 px-3">Munição / Mags</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Aprovador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-gray-300">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 print:text-gray-600 italic">
                    Nenhum registro encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 print:text-black">
                      {formatTimestamp(m.createdAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-200 print:text-black">{m.requesterName}</div>
                      <div className="text-[10px] text-slate-400 font-mono print:text-gray-600">MASP: {m.requesterMasp}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-200 print:text-black">{m.weaponType} {m.weaponModel}</div>
                      <div className="text-[10px] text-amber-400 font-mono print:text-gray-800">Série: {m.weaponSerialNumber}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">{m.caliber}</td>
                    <td className="py-2.5 px-3 font-mono">{m.ammunitionCount} un / {m.magazineCount} carreg.</td>
                    <td className="py-2.5 px-3 font-bold">{m.status}</td>
                    <td className="py-2.5 px-3 text-slate-300 print:text-black">{m.approvedByUserName || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between print:text-gray-600">
          <span>Total de registros listados: <strong className="text-slate-300 print:text-black">{filteredMovements.length}</strong></span>
          <span>Armeria • Sistema Auditável da Polícia Civil</span>
        </div>
      </div>

    </div>
  );
};
