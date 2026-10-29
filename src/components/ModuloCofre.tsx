import React, { useState, useMemo } from 'react';
import { User, VaultSpace, VaultSpaceType, Department, Unit, Explosivo, MovimentacaoExplosivo } from '../types';
import { storage } from '../services/storage';
import { 
  Vault, Plus, Trash2, Edit2, AlertCircle, Check, Crosshair, Disc, 
  Search, ChevronDown, ChevronUp, Building, Eye, Printer, X, Filter,
  Shield, Layers, Package, Bomb, History, Flame
} from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
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
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ARMAS' | 'MUNIÇÕES' | 'EXPLOSIVOS'>('ALL');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('ALL');
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);
  const [selectedVaultForDetails, setSelectedVaultForDetails] = useState<VaultSpace | null>(null);
  const [vaultDetailsTab, setVaultDetailsTab] = useState<'ITEMS' | 'HISTORICO'>('ITEMS');
  const [selectedExplosivoHistory, setSelectedExplosivoHistory] = useState<Explosivo | null>(null);

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

  // Visible departments based on user scope
  const visibleDepts = useMemo(() => {
    return isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  }, [isGeral, departments, currentUser.departmentId]);

  // Scoped vault spaces for user
  const userScopedVaults = useMemo(() => {
    if (isGeral) return vaultSpaces;
    if (currentUser.role === 'Administrador' || (currentUser.role === 'Armeiro' && currentUser.managementScope !== 'unit')) {
      return vaultSpaces.filter(v => v.departmentId === currentUser.departmentId);
    }
    return vaultSpaces.filter(v => v.unitId === currentUser.unitId);
  }, [vaultSpaces, isGeral, currentUser]);

  // Global counts for filter badges
  const totalArmas = useMemo(() => userScopedVaults.filter(v => v.type === 'ARMAS').length, [userScopedVaults]);
  const totalMunicoes = useMemo(() => userScopedVaults.filter(v => v.type === 'MUNIÇÕES').length, [userScopedVaults]);
  const totalExplosivos = useMemo(() => userScopedVaults.filter(v => v.type === 'EXPLOSIVOS').length, [userScopedVaults]);
  const totalAll = userScopedVaults.length;

  // Available departments & units for modal
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const availableUnitsForModal = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  // Available units for quick filter dropdown
  const filterUnits = useMemo(() => {
    if (isGeral) return units;
    return units.filter(u => u.departmentId === currentUser.departmentId);
  }, [isGeral, units, currentUser.departmentId]);

  const toggleDeptExpand = (id: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenModal = (presetType?: VaultSpaceType) => {
    setErrorMsg('');
    setEditingVault(null);
    setCode('');
    
    // Default to the preset, or the current active filter, or ARMAS
    if (presetType) {
      setType(presetType);
    } else if (typeFilter === 'MUNIÇÕES') {
      setType('MUNIÇÕES');
    } else if (typeFilter === 'EXPLOSIVOS') {
      setType('EXPLOSIVOS');
    } else {
      setType('ARMAS');
    }

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
      setErrorMsg('Informe a identificação/código do local do cofre.');
      return;
    }
    if (!unitId) {
      setErrorMsg('Selecione uma unidade para o local do cofre.');
      return;
    }

    try {
      const typeLabel = type === 'ARMAS' ? 'Cofre para Armas' : type === 'MUNIÇÕES' ? 'Cofre para Munições' : 'Paiol / Cofre de Explosivos';
      if (editingVault) {
        await storage.updateVaultSpace(editingVault.id, {
          code: code.trim().toUpperCase(),
          type,
          departmentId: deptId,
          unitId
        });
        setSuccessMsg(`Local de cofre "${code.toUpperCase()}" (${typeLabel}) atualizado com sucesso.`);
      } else {
        await storage.addVaultSpace({
          code: code.trim().toUpperCase(),
          type,
          departmentId: deptId,
          unitId
        });
        setSuccessMsg(`Novo local "${code.toUpperCase()}" (${typeLabel}) cadastrado com sucesso.`);
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
    const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === vault.id || e.localArmazenamento === vault.code);

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
            <td style="padding: 8px;">${(w as any).condition || 'Bom'} (${(w as any).situation || 'Ativa'})</td>
          </tr>
        `).join('');
      }
    } else if (vault.type === 'MUNIÇÕES') {
      if (storedAmmo.length === 0) {
        contentRowsHtml = `<tr><td colspan="4" style="text-align:center; padding: 15px; color: #6b7280; font-style: italic;">Espaço de guarda atualmente sem munições armazenadas.</td></tr>`;
      } else {
        contentRowsHtml = storedAmmo.map((s, idx) => {
          const cal = storage.getCalibers().find(c => c.id === s.caliberId);
          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px; font-weight: bold;">${idx + 1}</td>
              <td style="padding: 8px; font-weight: bold;">Calibre ${cal?.name || s.caliberId}</td>
              <td style="padding: 8px; font-family: monospace;">${(s as any).lotNumber || 'Padrão'}</td>
              <td style="padding: 8px; font-weight: bold; color: #0369a1;">${s.quantity} un</td>
            </tr>
          `;
        }).join('');
      }
    } else {
      if (storedExplosives.length === 0) {
        contentRowsHtml = `<tr><td colspan="6" style="text-align:center; padding: 15px; color: #6b7280; font-style: italic;">Paiol de guarda atualmente livre / sem materiais explosivos armazenados.</td></tr>`;
      } else {
        contentRowsHtml = storedExplosives.map((e, idx) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; font-weight: bold;">${idx + 1}</td>
            <td style="padding: 8px; font-weight: bold;">${e.nome}</td>
            <td style="padding: 8px;">${e.tipo} ${e.subtipo ? `(${e.subtipo})` : ''}</td>
            <td style="padding: 8px; font-family: monospace;">${e.lote}</td>
            <td style="padding: 8px; font-weight: bold; color: #dc2626;">${e.quantidade} ${e.unidadeMedida}</td>
            <td style="padding: 8px;">${e.status}</td>
          </tr>
        `).join('');
      }
    }

    const typeLabel = vault.type === 'ARMAS' 
      ? 'COFRE PARA ARMAS' 
      : vault.type === 'MUNIÇÕES' 
      ? 'COFRE PARA MUNIÇÕES' 
      : 'PAIOL / COFRE PARA EXPLOSIVOS';

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
          <div class="meta-item"><label>Tipo de Cofre:</label> <span>${typeLabel}</span></div>
          <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
        </div>

        <h3 style="font-size: 12px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #111827; padding-bottom: 4px;">
          CONTEÚDO ATUAL ARMAZENADO NO ESPAÇO (${typeLabel})
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

  const term = searchTerm.toLowerCase().trim();

  // Helper to render an individual vault space card
  const renderVaultCard = (v: VaultSpace) => {
    const unit = units.find(u => u.id === v.unitId);
    const dept = departments.find(d => d.id === v.departmentId);
    const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === v.id && w.status === 'No Cofre');
    const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);
    const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);
    const isArmas = v.type === 'ARMAS';
    const isMunicoes = v.type === 'MUNIÇÕES';
    const isExplosivos = v.type === 'EXPLOSIVOS';

    return (
      <div
        key={v.id}
        className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm transition hover:border-slate-600 ${
          isArmas 
            ? 'border-amber-900/30 hover:border-amber-500/50' 
            : isMunicoes
            ? 'border-cyan-900/30 hover:border-cyan-500/50'
            : 'border-red-900/30 hover:border-red-500/50'
        }`}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-black text-slate-100 font-mono tracking-wider">
                  {v.code}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center space-x-1 ${
                    isArmas
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                      : isMunicoes
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                      : 'bg-red-950/80 text-red-300 border-red-800/80'
                  }`}
                >
                  {isArmas ? (
                    <Crosshair className="w-3 h-3 text-amber-400" />
                  ) : isMunicoes ? (
                    <Disc className="w-3 h-3 text-cyan-400" />
                  ) : (
                    <Bomb className="w-3 h-3 text-red-400" />
                  )}
                  <span>
                    {isArmas
                      ? 'Cofre para Armas'
                      : isMunicoes
                      ? 'Cofre para Munições'
                      : 'Paiol / Cofre de Explosivos'}
                  </span>
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-300">
                <p className="font-semibold text-slate-200">{unit ? unit.name : 'Unidade N/A'}</p>
                <p className="text-[11px] text-slate-400">{dept ? dept.name : ''}</p>
              </div>
            </div>

            {canManageVault && (
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => handleOpenEditModal(v)}
                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                  title="Editar Local do Cofre"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                  title="Excluir Local"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Quick status preview inside card */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            {isArmas ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Armamentos no espaço:
                </span>
                <span className={`font-mono font-bold ${storedWeapons.length > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {storedWeapons.length > 0 ? `${storedWeapons.length} arma(s)` : 'Livre / Vazio'}
                </span>
              </div>
            ) : isMunicoes ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-cyan-400" />
                  Munições armazenadas:
                </span>
                <span className={`font-mono font-bold ${storedAmmo.length > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>
                  {storedAmmo.length > 0 
                    ? `${storedAmmo.reduce((acc, s) => acc + s.quantity, 0)} un (${storedAmmo.length} lote/cal)`
                    : 'Sem munições'
                  }
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Bomb className="w-3.5 h-3.5 text-red-400" />
                  Explosivos armazenados:
                </span>
                <span className={`font-mono font-bold ${storedExplosives.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {storedExplosives.length > 0 
                    ? `${storedExplosives.length} material(is) (${storedExplosives.reduce((acc, e) => acc + Number(e.quantidade || 0), 0)} un/kg)`
                    : 'Paiol Livre'
                  }
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card Actions: View Details and Print PDF */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              setVaultDetailsTab('ITEMS');
              setSelectedVaultForDetails(v);
            }}
            className="w-full bg-slate-800/90 hover:bg-slate-800 text-slate-100 hover:text-amber-400 font-bold text-xs py-2 px-3 rounded-xl border border-slate-700/80 flex items-center justify-center space-x-1.5 transition shadow-sm"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Detalhes</span>
          </button>

          <button
            onClick={() => handlePrintVaultContent(v)}
            className="p-2 bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition"
            title="Imprimir Relatório do Cofre em PDF"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Vault className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão de Locais no Cofre</h1>
            <p className="text-xs text-slate-400">
              Separação física e controle de locais para armamentos, munições e explosivos por departamento e unidade.
            </p>
          </div>
        </div>

        {canManageVault && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenModal('ARMAS')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Cofre de Armas</span>
            </button>
            <button
              onClick={() => handleOpenModal('MUNIÇÕES')}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Cofre de Munições</span>
            </button>
            <button
              onClick={() => handleOpenModal('EXPLOSIVOS')}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Cofre de Explosivos</span>
            </button>
          </div>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3.5 rounded-xl flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3.5 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
        
        {/* Type Filter Tabs (Separated by Type & Filterable Visualization) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto overflow-x-auto max-w-full">
            
            {/* Filter: Todos */}
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                typeFilter === 'ALL'
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Todos os Locais</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                typeFilter === 'ALL' ? 'bg-slate-700 text-slate-200' : 'bg-slate-900 text-slate-500'
              }`}>
                {totalAll}
              </span>
            </button>

            {/* Filter: Cofre para Armas */}
            <button
              type="button"
              onClick={() => setTypeFilter('ARMAS')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                typeFilter === 'ARMAS'
                  ? 'bg-amber-950/90 text-amber-300 border border-amber-800 shadow-sm'
                  : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 text-amber-400" />
              <span>Cofre para Armas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                typeFilter === 'ARMAS' ? 'bg-amber-900/80 text-amber-200' : 'bg-slate-900 text-slate-500'
              }`}>
                {totalArmas}
              </span>
            </button>

            {/* Filter: Cofre para Munições */}
            <button
              type="button"
              onClick={() => setTypeFilter('MUNIÇÕES')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                typeFilter === 'MUNIÇÕES'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-800 shadow-sm'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-900'
              }`}
            >
              <Disc className="w-3.5 h-3.5 text-cyan-400" />
              <span>Cofre para Munições</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                typeFilter === 'MUNIÇÕES' ? 'bg-cyan-900/80 text-cyan-200' : 'bg-slate-900 text-slate-500'
              }`}>
                {totalMunicoes}
              </span>
            </button>

            {/* Filter: Paiol / Cofre para Explosivos */}
            <button
              type="button"
              onClick={() => setTypeFilter('EXPLOSIVOS')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                typeFilter === 'EXPLOSIVOS'
                  ? 'bg-red-950/90 text-red-300 border border-red-800 shadow-sm'
                  : 'text-slate-400 hover:text-red-300 hover:bg-slate-900'
              }`}
            >
              <Bomb className="w-3.5 h-3.5 text-red-400" />
              <span>Cofre de Explosivos</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                typeFilter === 'EXPLOSIVOS' ? 'bg-red-900/80 text-red-200' : 'bg-slate-900 text-slate-500'
              }`}>
                {totalExplosivos}
              </span>
            </button>

          </div>

          {/* Quick Unit Filter (Optional dropdown) */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400 hidden md:inline">Filtrar por Unidade:</span>
            <select
              value={selectedUnitFilter}
              onChange={(e) => setSelectedUnitFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
            >
              <option value="ALL">Todas as Unidades</option>
              {filterUnits.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="flex items-center space-x-3 bg-slate-950 rounded-xl px-3 py-2 border border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por código do cofre, departamento, unidade, modelo, nº de série, lote ou explosivo..."
            className="w-full bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
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
      </div>

      {/* Departments Accordion for Vault Spaces */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          // Filter vaults for this department matching active filters and search term
          const deptVaults = vaultSpaces.filter(v => {
            if (v.departmentId !== dept.id) return false;

            // Type filter
            if (typeFilter !== 'ALL' && v.type !== typeFilter) return false;

            // Unit filter
            if (selectedUnitFilter !== 'ALL' && v.unitId !== selectedUnitFilter) return false;

            // Search query filter
            if (!term) return true;

            const unit = units.find(u => u.id === v.unitId);
            const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === v.id && w.status === 'No Cofre');
            const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);
            const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);

            const matchesBasic = v.code.toLowerCase().includes(term) ||
              v.type.toLowerCase().includes(term) ||
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

            const matchesExplosives = storedExplosives.some(e =>
              e.nome.toLowerCase().includes(term) ||
              e.tipo.toLowerCase().includes(term) ||
              (e.subtipo && e.subtipo.toLowerCase().includes(term)) ||
              e.lote.toLowerCase().includes(term)
            );

            return matchesBasic || matchesWeapons || matchesAmmo || matchesExplosives;
          });

          // Separate by type within this department
          const armasVaults = deptVaults.filter(v => v.type === 'ARMAS');
          const municoesVaults = deptVaults.filter(v => v.type === 'MUNIÇÕES');
          const explosivosVaults = deptVaults.filter(v => v.type === 'EXPLOSIVOS');

          // Auto expand if searching or explicitly toggled
          const isExpanded = term !== '' || expandedDeptIds.includes(dept.id);

          // Hide department if filtering/searching and no vaults match
          if ((term !== '' || typeFilter !== 'ALL' || selectedUnitFilter !== 'ALL') && deptVaults.length === 0) {
            return null;
          }

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
                      {deptVaults.length} espaço(s) exibido(s) neste departamento
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Categorized badges in department header */}
                  <div className="hidden sm:flex items-center space-x-2">
                    <span className="text-xs bg-amber-950/60 text-amber-300 border border-amber-800/60 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5">
                      <Crosshair className="w-3 h-3 text-amber-400" />
                      <span>{armasVaults.length} Armas</span>
                    </span>
                    <span className="text-xs bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5">
                      <Disc className="w-3 h-3 text-cyan-400" />
                      <span>{municoesVaults.length} Munições</span>
                    </span>
                    <span className="text-xs bg-red-950/60 text-red-300 border border-red-800/60 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5">
                      <Bomb className="w-3 h-3 text-red-400" />
                      <span>{explosivosVaults.length} Explosivos</span>
                    </span>
                  </div>

                  <span className="text-xs bg-slate-950 text-slate-200 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptVaults.length} Total
                  </span>

                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Vault Cards for this Department (Separated by Type) */}
              {isExpanded && (
                <div className="p-6 bg-slate-950/40 border-t border-slate-800/60 space-y-8">
                  {deptVaults.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-slate-500 italic">
                        Nenhum local de cofre cadastrado neste departamento atendendo aos filtros selecionados.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* SECTION 1: COFRES PARA ARMAS */}
                      {(typeFilter === 'ALL' || typeFilter === 'ARMAS') && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-amber-900/30">
                            <div className="flex items-center space-x-2.5">
                              <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg">
                                <Crosshair className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                                  Cofres para Armas
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                  Locais e armários destinados à custódia de armamentos
                                </p>
                              </div>
                            </div>

                            <span className="text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 px-2.5 py-0.5 rounded-full">
                              {armasVaults.length} {armasVaults.length === 1 ? 'espaço' : 'espaços'}
                            </span>
                          </div>

                          {armasVaults.length === 0 ? (
                            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                              Nenhum cofre para armas cadastrado neste departamento.
                              {canManageVault && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenModal('ARMAS')}
                                  className="mt-2 block mx-auto text-amber-400 hover:text-amber-300 font-bold underline"
                                >
                                  + Cadastrar cofre para armas
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {armasVaults.map(renderVaultCard)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SECTION 2: COFRES PARA MUNIÇÕES */}
                      {(typeFilter === 'ALL' || typeFilter === 'MUNIÇÕES') && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-cyan-900/30">
                            <div className="flex items-center space-x-2.5">
                              <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg">
                                <Disc className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wide">
                                  Cofres para Munições
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                  Locais e prateleiras destinados à estocagem de munições e cartuchos
                                </p>
                              </div>
                            </div>

                            <span className="text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 px-2.5 py-0.5 rounded-full">
                              {municoesVaults.length} {municoesVaults.length === 1 ? 'espaço' : 'espaços'}
                            </span>
                          </div>

                          {municoesVaults.length === 0 ? (
                            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                              Nenhum cofre para munições cadastrado neste departamento.
                              {canManageVault && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenModal('MUNIÇÕES')}
                                  className="mt-2 block mx-auto text-cyan-400 hover:text-cyan-300 font-bold underline"
                                >
                                  + Cadastrar cofre para munições
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {municoesVaults.map(renderVaultCard)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SECTION 3: PAIÓIS / COFRES PARA EXPLOSIVOS */}
                      {(typeFilter === 'ALL' || typeFilter === 'EXPLOSIVOS') && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-red-900/30">
                            <div className="flex items-center space-x-2.5">
                              <div className="p-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
                                <Bomb className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-red-300 uppercase tracking-wide">
                                  Paióis / Cofres para Explosivos
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                  Locais e depósitos homologados para custódia de materiais explosivos, cordéis e espoletas
                                </p>
                              </div>
                            </div>

                            <span className="text-xs font-mono font-bold bg-red-950 text-red-300 border border-red-800 px-2.5 py-0.5 rounded-full">
                              {explosivosVaults.length} {explosivosVaults.length === 1 ? 'espaço' : 'espaços'}
                            </span>
                          </div>

                          {explosivosVaults.length === 0 ? (
                            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                              Nenhum paiol/cofre para explosivos cadastrado neste departamento.
                              {canManageVault && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenModal('EXPLOSIVOS')}
                                  className="mt-2 block mx-auto text-red-400 hover:text-red-300 font-bold underline"
                                >
                                  + Cadastrar cofre de explosivos
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {explosivosVaults.map(renderVaultCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </>
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
        const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);
        const vaultMovements = storage.getMovimentacoesExplosivosByVault(v.id || v.code);

        const isArmas = v.type === 'ARMAS';
        const isMunicoes = v.type === 'MUNIÇÕES';
        const isExplosivos = v.type === 'EXPLOSIVOS';

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-4xl shadow-2xl space-y-5 my-8 max-h-[92vh] flex flex-col">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-xl border ${
                    isArmas 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                      : isMunicoes
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {isArmas ? (
                      <Crosshair className="w-6 h-6 text-amber-400" />
                    ) : isMunicoes ? (
                      <Disc className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <Bomb className="w-6 h-6 text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl font-black text-slate-100 font-mono tracking-wider">{v.code}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-lg border flex items-center space-x-1 ${
                          isArmas
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : isMunicoes
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                            : 'bg-red-950/80 text-red-300 border-red-800'
                        }`}
                      >
                        {isArmas ? (
                          <Crosshair className="w-3 h-3 text-amber-400" />
                        ) : isMunicoes ? (
                          <Disc className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <Bomb className="w-3 h-3 text-red-400" />
                        )}
                        <span>
                          {isArmas
                            ? 'Cofre para Armas'
                            : isMunicoes
                            ? 'Cofre para Munições'
                            : 'Paiol / Cofre de Explosivos'}
                        </span>
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

              {/* Subtabs for Explosives Vault: Content vs Movement History */}
              {isExplosivos && (
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVaultDetailsTab('ITEMS')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                      vaultDetailsTab === 'ITEMS'
                        ? 'bg-red-950 text-red-300 border border-red-800 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 text-red-400" />
                    <span>Materiais no Paiol ({storedExplosives.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVaultDetailsTab('HISTORICO')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                      vaultDetailsTab === 'HISTORICO'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Histórico de Movimentações deste Local ({vaultMovements.length})</span>
                  </button>
                </div>
              )}

              {/* Modal Content Details */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {isArmas ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Conteúdo Armazenado no Espaço (Armas)
                      </h4>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {storedWeapons.length} Armas Cadastradas
                      </span>
                    </div>

                    {storedWeapons.length === 0 ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                        Este cofre de armas está atualmente livre / sem armas armazenadas.
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
                                <td className="py-2.5 px-3 text-slate-400">{(w as any).condition || 'Bom'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : isMunicoes ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Conteúdo Armazenado no Espaço (Munições)
                      </h4>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {storedAmmo.length} Lote(s) / Calibre(s)
                      </span>
                    </div>

                    {storedAmmo.length === 0 ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                        Este cofre de munições está atualmente sem munições cadastradas.
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
                                  <td className="py-2.5 px-3 font-mono text-slate-400">{(s as any).lotNumber || 'Padrão'}</td>
                                  <td className="py-2.5 px-3 text-right font-bold font-mono text-cyan-400">{s.quantity} un</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  /* EXPLOSIVOS SECTION */
                  vaultDetailsTab === 'ITEMS' ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Materiais Explosivos Armazenados no Paiol
                        </h4>
                        <span className="text-xs font-mono font-bold text-red-400">
                          {storedExplosives.length} Material(is) Cadastrado(s)
                        </span>
                      </div>

                      {storedExplosives.length === 0 ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                          Este paiol de explosivos está atualmente vazio / sem materiais cadastrados.
                        </div>
                      ) : (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                              <tr>
                                <th className="py-2.5 px-3">Material Explosivo</th>
                                <th className="py-2.5 px-3">Tipo / Subtipo</th>
                                <th className="py-2.5 px-3">Lote</th>
                                <th className="py-2.5 px-3">Saldo em Estoque</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3 text-center">Histórico</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80">
                              {storedExplosives.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-900/50">
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-100">{e.nome}</div>
                                    <div className="text-[10px] text-slate-400">{e.fabricante}</div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-slate-200">{e.tipo}</div>
                                    {e.subtipo && <div className="text-[10px] text-slate-400">{e.subtipo}</div>}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">{e.lote}</td>
                                  <td className="py-2.5 px-3 font-bold font-mono text-red-400">
                                    {e.quantidade} <span className="text-[11px] font-normal uppercase text-slate-300">{e.unidadeMedida}</span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                      e.status === 'Operacional'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : e.status === 'Instrução'
                                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                        : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                    }`}>
                                      {e.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedExplosivoHistory(e)}
                                      className="px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[11px] font-semibold flex items-center space-x-1 mx-auto transition"
                                      title="Visualizar histórico individual deste material"
                                    >
                                      <History className="w-3.5 h-3.5" />
                                      <span>Individual</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    /* HISTORICO GERAL DO LOCAL NO COFRE */
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <History className="w-4 h-4 text-cyan-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Histórico de Movimentações do Paiol ({v.code})
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {vaultMovements.length} Registros Encontrados
                        </span>
                      </div>

                      {vaultMovements.length === 0 ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                          Nenhuma movimentação registrada para este local de cofre até o momento.
                        </div>
                      ) : (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                              <tr>
                                <th className="py-2.5 px-3">Data / Hora</th>
                                <th className="py-2.5 px-3">Operação</th>
                                <th className="py-2.5 px-3">Material Explosivo</th>
                                <th className="py-2.5 px-3 text-center">Qtd</th>
                                <th className="py-2.5 px-3">Finalidade / Motivo</th>
                                <th className="py-2.5 px-3">Responsável</th>
                                <th className="py-2.5 px-3 text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 font-mono">
                              {vaultMovements.map((m) => {
                                const isEntry = m.tipoMovimentacao === 'Entrada';
                                const isConsumption = m.tipoMovimentacao === 'Consumo/Treinamento' || m.tipoMovimentacao === 'Consumo Operacional';
                                const isDestruction = m.tipoMovimentacao === 'Descarte/Destruição' || m.tipoMovimentacao === 'Destruição Técnica';
                                const linkedExp = storedExplosives.find(e => e.id === m.explosivoId) || storage.getExplosivos({ role: 'Geral' } as User).find(e => e.id === m.explosivoId);

                                return (
                                  <tr key={m.id} className="hover:bg-slate-900/50">
                                    <td className="py-2.5 px-3 text-slate-300 text-[11px] whitespace-nowrap">
                                      {new Date(m.dataMovimentacao).toLocaleString('pt-BR')}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                                          isEntry
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : isConsumption
                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                            : isDestruction
                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                                        }`}
                                      >
                                        {m.tipoMovimentacao}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-bold text-slate-100">
                                      {m.nomeExplosivo || m.explosivoNome}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-bold text-amber-400">
                                      {isEntry ? '+' : '-'}{m.quantidade} {m.unidadeMedida}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans text-slate-300">
                                      <div>{m.motivo}</div>
                                      {m.observacoes && (
                                        <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-xs" title={m.observacoes}>
                                          "{m.observacoes}"
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans text-slate-300">
                                      <div className="font-semibold text-slate-200">{m.responsavelNome}</div>
                                      {m.responsavelMasp && (
                                        <div className="text-[10px] text-slate-500 font-mono">MASP: {m.responsavelMasp}</div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      {linkedExp ? (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedExplosivoHistory(linkedExp)}
                                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-bold border border-slate-700 transition"
                                          title="Ver histórico individual completo deste material"
                                        >
                                          Histórico do Material
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-slate-500">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0">
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

      {/* Modal Histórico Individual de um Explosivo Aberto a Partir do Cofre */}
      {selectedExplosivoHistory && (() => {
        const item = selectedExplosivoHistory;
        const allItemMovs = storage.getMovimentacoesExplosivos(currentUser, item.id)
          .sort((a, b) => new Date(b.dataMovimentacao).getTime() - new Date(a.dataMovimentacao).getTime());

        const totalEntradas = allItemMovs
          .filter(m => m.tipoMovimentacao === 'Entrada')
          .reduce((acc, curr) => acc + curr.quantidade, 0);

        const totalSaidas = allItemMovs
          .filter(m => m.tipoMovimentacao !== 'Entrada')
          .reduce((acc, curr) => acc + curr.quantidade, 0);

        return (
          <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="glass-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl my-auto">
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100">
                      Histórico Individual: <span className="text-amber-400">{item.nome}</span>
                    </h2>
                    <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      <span>Lote: <strong className="text-slate-200 font-mono">{item.lote}</strong></span>
                      <span>•</span>
                      <span>Local no Cofre: <strong className="text-cyan-300 font-mono">{item.localArmazenamento}</strong></span>
                      <span>•</span>
                      <span>Saldo Atual: <strong className="text-amber-400 font-mono">{item.quantidade} {item.unidadeMedida}</strong></span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedExplosivoHistory(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPI stats bar */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/40 border-b border-slate-800/80 shrink-0 text-center">
                <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Estoque Atual</span>
                  <span className="text-base font-black font-mono text-amber-400">
                    {item.quantidade} <span className="text-xs text-slate-300">{item.unidadeMedida}</span>
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Entradas</span>
                  <span className="text-base font-black font-mono text-emerald-400">
                    +{totalEntradas} <span className="text-xs text-slate-300">{item.unidadeMedida}</span>
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Saídas / Consumo</span>
                  <span className="text-base font-black font-mono text-rose-400">
                    -{totalSaidas} <span className="text-xs text-slate-300">{item.unidadeMedida}</span>
                  </span>
                </div>
              </div>

              {/* Timeline list */}
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
                {allItemMovs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs italic">
                    Nenhum registro de movimentação encontrado para este explosivo.
                  </div>
                ) : (
                  allItemMovs.map((m) => {
                    const isEntry = m.tipoMovimentacao === 'Entrada';
                    const isConsumption = m.tipoMovimentacao === 'Consumo/Treinamento' || m.tipoMovimentacao === 'Consumo Operacional';
                    const isDestruction = m.tipoMovimentacao === 'Descarte/Destruição' || m.tipoMovimentacao === 'Destruição Técnica';

                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                          isEntry
                            ? 'bg-emerald-950/20 border-emerald-800/40'
                            : isConsumption
                            ? 'bg-amber-950/20 border-amber-800/40'
                            : isDestruction
                            ? 'bg-purple-950/20 border-purple-800/40'
                            : 'bg-rose-950/20 border-rose-800/40'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                                isEntry
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : isConsumption
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : isDestruction
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {m.tipoMovimentacao}
                            </span>
                            <span className="font-bold text-slate-200">{m.motivo}</span>
                          </div>

                          <div className="text-[11px] text-slate-400">
                            Responsável: <strong className="text-slate-200">{m.responsavelNome}</strong>
                            {m.responsavelMasp && ` (MASP: ${m.responsavelMasp})`}
                            {m.localOrigemDestino && ` • Destino/Origem: ${m.localOrigemDestino}`}
                          </div>

                          {m.observacoes && (
                            <div className="text-[11px] text-slate-400 italic">"{m.observacoes}"</div>
                          )}
                        </div>

                        <div className="text-right sm:shrink-0">
                          <div className={`text-sm font-black font-mono ${isEntry ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isEntry ? '+' : '-'}{m.quantidade} {m.unidadeMedida}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(m.dataMovimentacao).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-slate-800 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedExplosivoHistory(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl"
                >
                  Fechar Histórico Individual
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Vault Space Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* Type Selection as interactive cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Tipo de Local / Cofre
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setType('ARMAS')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      type === 'ARMAS'
                        ? 'bg-amber-950/70 border-amber-500 text-amber-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <Crosshair className={`w-4 h-4 ${type === 'ARMAS' ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-slate-100">Cofre de Armas</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Para custódia de pistolas e fuzis
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('MUNIÇÕES')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      type === 'MUNIÇÕES'
                        ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <Disc className={`w-4 h-4 ${type === 'MUNIÇÕES' ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-slate-100">Cofre de Munições</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Para estocagem de cartuchos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('EXPLOSIVOS')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      type === 'EXPLOSIVOS'
                        ? 'bg-red-950/70 border-red-500 text-red-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <Bomb className={`w-4 h-4 ${type === 'EXPLOSIVOS' ? 'text-red-400' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-slate-100">Paiol / Explosivos</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Para altos explosivos e espoletas
                    </span>
                  </button>
                </div>
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
                      : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-amber-500'
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-amber-500"
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
