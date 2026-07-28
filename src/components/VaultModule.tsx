import React, { useState } from 'react';
import { User, VaultSpace, VaultSpaceType, Department, Unit } from '../types';
import { storage } from '../services/storage';
import { Vault, Plus, Trash2, Edit2, AlertCircle, Check, Crosshair, Disc, Search, ChevronDown, ChevronUp, Building, Eye, Printer, X } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { printDocumentInPage } from '../utils/printHelper';

interface VaultModuleProps {
  currentUser: User;
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const VaultModule: React.FC<VaultModuleProps> = ({
  currentUser,
  vaultSpaces,
  departments,
  units,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);
  const [selectedVaultForDetails, setSelectedVaultForDetails] = useState<VaultSpace | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingVault, setEditingVault] = useState<VaultSpace | null>(null);
  const [code, setCode] = useState('');
  const [type, setType] = useState<VaultSpaceType>('ARMAS');
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetVault, setDeleteTargetVault] = useState<VaultSpace | null>(null);

  const isGeral = currentUser.role === 'Geral';
  const isAdminOrArmeiro = currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const isPolicial = currentUser.role === 'Policial';
  const canManageVault = isGeral || isAdminOrArmeiro;

  // Available departments & units for modal
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const availableUnitsForModal = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  const handleOpenModal = () => {
    setErrorMsg('');
    setEditingVault(null);
    setCode('');
    setType('ARMAS');
    const initialDept = isGeral ? (departments[0]?.id || '') : currentUser.departmentId;
    setDeptId(initialDept);
    const initialUnits = units.filter(u => u.departmentId === initialDept);
    setUnitId(initialUnits[0]?.id || '');
    setShowModal(true);
  };

  const handleOpenEditModal = (vault: VaultSpace) => {
    setErrorMsg('');
    setEditingVault(vault);
    setCode(vault.code);
    setType(vault.type);
    setDeptId(vault.departmentId);
    setUnitId(vault.unitId);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!code.trim()) {
      setErrorMsg('Informe a identificação/código do local.');
      return;
    }
    if (!unitId) {
      setErrorMsg('Selecione uma unidade para o local do cofre.');
      return;
    }

    try {
      if (editingVault) {
        await storage.updateVaultSpace(editingVault.id, {
          code: code.trim().toUpperCase(),
          type,
          departmentId: deptId,
          unitId
        });
        setSuccessMsg(`Local de guarda "${code.toUpperCase()}" atualizado com sucesso.`);
      } else {
        await storage.addVaultSpace({
          code: code.trim().toUpperCase(),
          type,
          departmentId: deptId,
          unitId
        });
        setSuccessMsg(`Local de guarda "${code.toUpperCase()}" cadastrado com sucesso.`);
      }
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar local do cofre.');
    }
  };

  const handleDelete = (vault: VaultSpace) => {
    setDeleteTargetVault(vault);
  };

  const confirmExecuteDeleteVault = async () => {
    if (!deleteTargetVault) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await storage.deleteVaultSpace(deleteTargetVault.id);
      setSuccessMsg(`Local do cofre "${deleteTargetVault.code}" excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir local do cofre.');
    } finally {
      setDeleteTargetVault(null);
    }
  };

  // Direct print PDF of vault content
  const handlePrintVaultContent = (vault: VaultSpace) => {
    const dept = departments.find(d => d.id === vault.departmentId);
    const unit = units.find(u => u.id === vault.unitId);
    const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === vault.id && w.status === 'No Cofre');
    const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === vault.id);

    let contentRowsHtml = '';
    if (vault.type === 'ARMAS') {
      if (storedWeapons.length === 0) {
        contentRowsHtml = `<tr><td colspan="5" style="text-align:center; padding: 15px; color: #6b7280; font-style: italic;">Espaço de guarda atualmente livre / sem armamentos armazenados.</td></tr>`;
      } else {
        contentRowsHtml = storedWeapons.map((w, idx) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; font-weight: bold;">${idx + 1}</td>
            <td style="padding: 8px;">${w.type} ${w.model}</td>
            <td style="padding: 8px; font-family: monospace; font-weight: bold; color: #b45309;">${w.serialNumber}</td>
            <td style="padding: 8px;">${w.caliber}</td>
            <td style="padding: 8px;">${w.condition || 'Bom'} (${w.situation || 'Ativa'})</td>
          </tr>
        `).join('');
      }
    } else {
      if (storedAmmo.length === 0) {
        contentRowsHtml = `<tr><td colspan="4" style="text-align:center; padding: 15px; color: #6b7280; font-style: italic;">Espaço de guarda atualmente sem munições armazenadas.</td></tr>`;
      } else {
        contentRowsHtml = storedAmmo.map((s, idx) => {
          const cal = storage.getCalibers().find(c => c.id === s.caliberId);
          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px; font-weight: bold;">${idx + 1}</td>
              <td style="padding: 8px; font-weight: bold;">Calibre ${cal?.name || s.caliberId}</td>
              <td style="padding: 8px; font-family: monospace;">${s.lotNumber || 'Padrão'}</td>
              <td style="padding: 8px; font-weight: bold; color: #0369a1;">${s.quantity} un</td>
            </tr>
          `;
        }).join('');
      }
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Inventário do Cofre - Espaço ${vault.code}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .badge { background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 12px; border-radius: 6px; font-family: monospace; text-align: right; }
          .meta-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-family: monospace; }
          .meta-item label { font-size: 9px; font-weight: bold; color: #6b7280; text-transform: uppercase; display: block; }
          .meta-item span { font-size: 12px; font-weight: bold; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 11px; }
          th { background: #111827; color: #fff; text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .signatures { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMERIA • INVENTÁRIO FÍSICO DE ESPAÇO NO COFRE</div>
          </div>
          <div class="badge">
            CÓDIGO COFRE<br>
            <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
          </div>
        </div>

        <div class="meta-box">
          <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
          <div class="meta-item"><label>Unidade:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
          <div class="meta-item"><label>Tipo de Guarda:</label> <span>${vault.type}</span></div>
          <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
        </div>

        <h3 style="font-size: 12px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #111827; padding-bottom: 4px;">
          CONTEÚDO ATUAL ARMAZENADO NO ESPAÇO (${vault.type})
        </h3>

        <table>
          <thead>
            ${vault.type === 'ARMAS' ? `
              <tr>
                <th style="width: 40px;">#</th>
                <th>Armamento / Modelo</th>
                <th>Nº de Série</th>
                <th>Calibre</th>
                <th>Estado / Situação</th>
              </tr>
            ` : `
              <tr>
                <th style="width: 40px;">#</th>
                <th>Calibre</th>
                <th>Lote</th>
                <th>Quantidade Armazenada</th>
              </tr>
            `}
          </thead>
          <tbody>
            ${contentRowsHtml}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-line">
            ${currentUser.name}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pelo Mapeamento</span>
          </div>
          <div class="sig-line">
            Chefia da Unidade Policial<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Polícia Civil - MG</span>
          </div>
        </div>

        <div class="footer">
          Relatório oficial emitido em ${new Date().toLocaleString('pt-BR')} através do Sistema de Armeria PCMG.
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Filtered Departments
  const visibleDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const term = searchTerm.toLowerCase().trim();

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Vault className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão de Locais e Cofres por Departamento</h1>
            <p className="text-xs text-slate-400">
              Mapeamento físico do cofre por departamento e unidade. Clique para ver os cofres e seus detalhes.
            </p>
          </div>
        </div>

        {!isPolicial && (
          <button
            onClick={handleOpenModal}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Espaço no Cofre</span>
          </button>
        )}
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

      {/* Search Input Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center space-x-3">
        <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por código do cofre, departamento, unidade, modelo, nº de série ou calibre..."
          className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded-lg"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Departments Accordion for Vault Spaces */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          const deptVaults = vaultSpaces.filter(v => {
            if (v.departmentId !== dept.id) return false;
            if (!term) return true;

            const unit = units.find(u => u.id === v.unitId);
            const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === v.id && w.status === 'No Cofre');
            const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);

            const matchesBasic = v.code.toLowerCase().includes(term) ||
              dept.name.toLowerCase().includes(term) ||
              dept.code.toLowerCase().includes(term) ||
              (unit && unit.name.toLowerCase().includes(term));

            const matchesWeapons = storedWeapons.some(w => 
              w.serialNumber.toLowerCase().includes(term) ||
              w.model.toLowerCase().includes(term) ||
              w.caliber.toLowerCase().includes(term)
            );

            const matchesAmmo = storedAmmo.some(s => {
              const cal = storage.getCalibers().find(c => c.id === s.caliberId);
              return cal?.name.toLowerCase().includes(term);
            });

            return matchesBasic || matchesWeapons || matchesAmmo;
          });

          // Auto expand if searching or explicitly toggled
          const isExpanded = term !== '' || expandedDeptIds.includes(dept.id);

          // Hide department if searching and no vaults match
          if (term !== '' && deptVaults.length === 0) return null;

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
              
              {/* Department Header Row */}
              <div
                onClick={() => toggleDeptExpand(dept.id)}
                className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {dept.code}
                      </span>
                      <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {deptVaults.length} espaço(s) de cofre cadastrado(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptVaults.length} Espaço(s)
                  </span>
                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Vault Cards for this Department (Shown when Expanded) */}
              {isExpanded && (
                <div className="p-6 bg-slate-950/40 border-t border-slate-800/60">
                  {deptVaults.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      Nenhum local do cofre cadastrado neste departamento.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deptVaults.map((v) => {
                        const unit = units.find(u => u.id === v.unitId);

                        return (
                          <div
                            key={v.id}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-slate-700 transition"
                          >
                            <div>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="text-lg font-black text-amber-400 font-mono tracking-wider">
                                    {v.code}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center space-x-1 ${
                                      v.type === 'ARMAS'
                                        ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                        : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                                    }`}
                                  >
                                    {v.type === 'ARMAS' ? <Crosshair className="w-3 h-3" /> : <Disc className="w-3 h-3" />}
                                    <span>{v.type}</span>
                                  </span>
                                </div>

                                {canManageVault && (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={() => handleOpenEditModal(v)}
                                      className="p-1 text-slate-500 hover:text-amber-400 rounded transition"
                                      title="Editar Local do Cofre"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(v)}
                                      className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                                      title="Excluir Local"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="mt-2 text-xs text-slate-300 space-y-0.5">
                                <p className="font-semibold text-slate-200">{unit ? unit.name : 'Unidade N/A'}</p>
                                <p className="text-[11px] text-slate-400">{dept ? dept.name : ''}</p>
                              </div>
                            </div>

                            {/* Actions: View Details and Print PDF */}
                            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                              <button
                                onClick={() => setSelectedVaultForDetails(v)}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs py-2 px-3 rounded-xl border border-slate-700 flex items-center justify-center space-x-1.5 transition shadow-sm"
                              >
                                <Eye className="w-4 h-4" />
                                <span>Ver Detalhes</span>
                              </button>

                              <button
                                onClick={() => handlePrintVaultContent(v)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition"
                                title="Imprimir Relatório do Cofre em PDF"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Details Modal (Ver Detalhes) */}
      {selectedVaultForDetails && (() => {
        const v = selectedVaultForDetails;
        const dept = departments.find(d => d.id === v.departmentId);
        const unit = units.find(u => u.id === v.unitId);
        const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === v.id && w.status === 'No Cofre');
        const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-5 my-8">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
                    <Vault className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl font-black text-amber-400 font-mono tracking-wider">{v.code}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded border flex items-center space-x-1 ${
                          v.type === 'ARMAS'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                        }`}
                      >
                        {v.type === 'ARMAS' ? <Crosshair className="w-3 h-3" /> : <Disc className="w-3 h-3" />}
                        <span>{v.type}</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {unit ? unit.name : 'Unidade N/A'} • {dept ? dept.name : ''}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVaultForDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content Details */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Conteúdo Armazenado no Espaço ({v.type})
                  </h4>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {v.type === 'ARMAS' ? `${storedWeapons.length} Armas` : `${storedAmmo.length} Lotes/Calibres`}
                  </span>
                </div>

                {v.type === 'ARMAS' ? (
                  storedWeapons.length === 0 ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                      Este espaço de cofre está atualmente livre / sem armas armazenadas.
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Armamento</th>
                            <th className="py-2.5 px-3">Nº de Série</th>
                            <th className="py-2.5 px-3">Calibre</th>
                            <th className="py-2.5 px-3">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {storedWeapons.map((w) => (
                            <tr key={w.id} className="hover:bg-slate-900/50">
                              <td className="py-2.5 px-3 font-semibold text-slate-100">{w.type} {w.model}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{w.serialNumber}</td>
                              <td className="py-2.5 px-3 text-slate-300">{w.caliber}</td>
                              <td className="py-2.5 px-3 text-slate-400">{w.condition || 'Bom'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  storedAmmo.length === 0 ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                      Este espaço de cofre está atualmente sem munições cadastradas.
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Calibre</th>
                            <th className="py-2.5 px-3">Lote</th>
                            <th className="py-2.5 px-3 text-right">Quantidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {storedAmmo.map((s) => {
                            const cal = storage.getCalibers().find(c => c.id === s.caliberId);
                            return (
                              <tr key={s.id} className="hover:bg-slate-900/50">
                                <td className="py-2.5 px-3 font-bold text-slate-100">Calibre {cal?.name || s.caliberId}</td>
                                <td className="py-2.5 px-3 font-mono text-slate-400">{s.lotNumber || 'Padrão'}</td>
                                <td className="py-2.5 px-3 text-right font-bold font-mono text-cyan-400">{s.quantity} un</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedVaultForDetails(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintVaultContent(v)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório (PDF)</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Add Vault Space Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              {editingVault ? 'Editar Local do Cofre' : 'Novo Espaço de Armazenamento no Cofre'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Código do Local (Ex: A1-G1 ou C1-L1)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: A1-G1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Armazenamento
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as VaultSpaceType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  <option value="ARMAS">ARMAS</option>
                  <option value="MUNIÇÕES">MUNIÇÕES</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Departamento
                </label>
                <select
                  value={deptId}
                  onChange={(e) => {
                    setDeptId(e.target.value);
                    const depUnits = units.filter(u => u.departmentId === e.target.value);
                    setUnitId(depUnits[0]?.id || '');
                  }}
                  disabled={!isGeral}
                  className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                    !isGeral
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                >
                  {availableDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Unidade
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  {availableUnitsForModal.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  {editingVault ? 'Salvar Alterações' : 'Cadastrar Local'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetVault}
        title="Excluir Local do Cofre Definitivamente"
        message={`Deseja realmente apagar permanentemente o local do cofre "${deleteTargetVault?.code}"?`}
        onConfirm={confirmExecuteDeleteVault}
        onCancel={() => setDeleteTargetVault(null)}
      />

    </div>
  );
};
