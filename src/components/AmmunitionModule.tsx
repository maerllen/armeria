import React, { useState } from 'react';
import { User, Caliber, AmmunitionStock, AmmunitionMovement, VaultSpace, Department, Unit, AmmoMovementType } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Disc, Plus, ArrowUpRight, ArrowDownLeft, AlertCircle, Check, Shield, Search, Trash2, Printer, RotateCcw, UserX, UserCheck, Building, ChevronDown, ChevronUp, Edit2, Filter, Eye, X } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { printDocumentInPage } from '../utils/printHelper';

interface AmmunitionModuleProps {
  currentUser: User;
  calibers: Caliber[];
  stocks: AmmunitionStock[];
  movements: AmmunitionMovement[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  users?: User[];
  onRefresh: () => void;
}

export const AmmunitionModule: React.FC<AmmunitionModuleProps> = ({
  currentUser,
  calibers,
  stocks,
  movements,
  vaultSpaces,
  departments,
  units,
  users = [],
  onRefresh
}) => {
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Caliber Form & Edit State (Inside Caliber Modal)
  const [caliberName, setCaliberName] = useState('');
  const [editingCaliber, setEditingCaliber] = useState<Caliber | null>(null);

  // Ammo Movement Form
  const [movementType, setMovementType] = useState<AmmoMovementType>('Saída');
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('Curso ou Teste');

  // Responsible Officer Form State
  const [responsibleType, setResponsibleType] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState('');
  const [customResponsibleName, setCustomResponsibleName] = useState('');
  const [customResponsibleMasp, setCustomResponsibleMasp] = useState('');

  // Observation (max 500 chars)
  const [observation, setObservation] = useState('');

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQuantity, setReturnQuantity] = useState<number>(0);

  // General Filters
  const [filterCaliberId, setFilterCaliberId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterUnitId, setFilterUnitId] = useState('');

  // Expanded departments accordion
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);

  // Movement Log Column Filters
  const [colFilterData, setColFilterData] = useState('');
  const [colFilterTipo, setColFilterTipo] = useState('');
  const [colFilterCalibre, setColFilterCalibre] = useState('');
  const [colFilterQtd, setColFilterQtd] = useState('');
  const [colFilterLocal, setColFilterLocal] = useState('');
  const [colFilterMotivo, setColFilterMotivo] = useState('');
  const [colFilterPolicial, setColFilterPolicial] = useState('');
  const [colFilterDevolucao, setColFilterDevolucao] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetAmmo, setDeleteTargetAmmo] = useState<{ type: 'caliber' | 'stock' | 'movement'; id: string; label: string } | null>(null);

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const canManageStock = isGeral || isArmeiro || isAdmin || (currentUser.role === 'Policial' && currentUser.canMoveAmmunition);

  // Available vault spaces for ammo: MUST BE TYPE MUNIÇÕES
  const ammoVaultSpaces = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  // Open Movement Modal specifically for ENTRADA or SAÍDA
  const handleOpenMovementModal = (type: AmmoMovementType, initialDeptId?: string, initialUnitId?: string) => {
    setErrorMsg('');
    setMovementType(type);
    setSelectedCaliberId(calibers[0]?.id || '');
    setQuantity(100);

    let matchingVaults = ammoVaultSpaces;
    if (initialUnitId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.unitId === initialUnitId);
    } else if (initialDeptId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.departmentId === initialDeptId);
    }

    setSelectedVaultId(matchingVaults[0]?.id || ammoVaultSpaces[0]?.id || '');
    setRecipientOrReason(type === 'Entrada' ? 'Abastecimento do Cofre' : 'Curso ou Teste');
    
    setResponsibleType('SISTEMA');
    setSelectedResponsibleUserId(users[0]?.id || '');
    setCustomResponsibleName('');
    setCustomResponsibleMasp('');
    setObservation('');

    setShowMovementModal(true);
  };

  // Save Caliber (Only available for Geral inside modal)
  const handleSaveCaliber = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!caliberName.trim()) {
      setErrorMsg('Informe o nome do calibre.');
      return;
    }

    try {
      if (editingCaliber) {
        await storage.updateCaliber(editingCaliber.id, caliberName.trim());
        setSuccessMsg(`Calibre "${caliberName.trim()}" atualizado com sucesso.`);
      } else {
        await storage.addCaliber(caliberName.trim());
        setSuccessMsg(`Calibre "${caliberName.trim()}" cadastrado com sucesso.`);
      }
      setCaliberName('');
      setEditingCaliber(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar calibre.');
    }
  };

  const handleDeleteCaliber = (cal: Caliber) => {
    setDeleteTargetAmmo({ type: 'caliber', id: cal.id, label: `o calibre "${cal.name}"` });
  };

  const handleDeleteStock = (st: AmmunitionStock) => {
    setDeleteTargetAmmo({ type: 'stock', id: st.id, label: `o registro de estoque` });
  };

  const handleDeleteAmmoMovement = (m: AmmunitionMovement) => {
    setDeleteTargetAmmo({ type: 'movement', id: m.id, label: `o histórico de movimentação de munição` });
  };

  const confirmExecuteDeleteAmmo = async () => {
    if (!deleteTargetAmmo) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetAmmo.type === 'caliber') {
        await storage.deleteCaliber(deleteTargetAmmo.id);
        setSuccessMsg(`Calibre excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'stock') {
        await storage.deleteAmmoStock(deleteTargetAmmo.id);
        setSuccessMsg(`Registro de estoque excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'movement') {
        await storage.deleteAmmoMovement(deleteTargetAmmo.id);
        setSuccessMsg(`Histórico de movimentação excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetAmmo(null);
    }
  };

  // Save Movement (Entrada / Saída)
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCaliberId) {
      setErrorMsg('Selecione o calibre.');
      return;
    }
    if (!selectedVaultId) {
      setErrorMsg('Selecione um local do cofre para munições.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }

    let respName = '';
    let respMasp = '';
    let respUserId = '';

    if (responsibleType === 'SISTEMA') {
      const foundUser = users.find(u => u.id === selectedResponsibleUserId);
      if (!foundUser) {
        setErrorMsg('Selecione o policial responsável no sistema.');
        return;
      }
      respName = foundUser.name;
      respMasp = foundUser.masp;
      respUserId = foundUser.id;
    } else {
      if (!customResponsibleName.trim()) {
        setErrorMsg('Informe o nome do policial responsável (fora do sistema).');
        return;
      }
      respName = customResponsibleName.trim();
      respMasp = customResponsibleMasp.trim();
    }

    try {
      await storage.recordAmmoMovement({
        type: movementType,
        caliberId: selectedCaliberId,
        quantity,
        vaultSpaceId: selectedVaultId,
        recipientOrReason,
        responsibleType,
        responsibleUserId: respUserId,
        responsibleName: respName,
        responsibleMasp: respMasp,
        observation: observation.slice(0, 500)
      });

      setSuccessMsg(`Movimentação de ${movementType} de munição registrada com sucesso!`);
      setShowMovementModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
    }
  };

  // Direct Print Receipt PDF function (In-page browser print, no popup modal, no extra tab)
  const handlePrintDirectReceipt = (m: AmmunitionMovement, isReturn: boolean = false, returnAmt?: number) => {
    const caliber = calibers.find(c => c.id === m.caliberId);
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);

    const responsibleText = m.responsibleName 
      ? `${m.responsibleName}${m.responsibleMasp ? ` (MASP/Doc: ${m.responsibleMasp})` : ''}`
      : m.recipientOrReason;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Munição - ${caliber?.name || 'Munição'}</title>
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
            <div class="subtitle">SISTEMA DE ARMERIA • COMPROVANTE DE MOVIMENTAÇÃO DE MUNIÇÃO</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${m.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>TIPO:</strong> ${isReturn ? 'DEVOLUÇÃO DE MUNIÇÃO' : (m.type === 'Saída' ? 'SAÍDA / FORNECIMENTO' : 'ENTRADA / REPOSIÇÃO')}</div>
          <div><strong>Data:</strong> ${formatTimestamp(m.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados da Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Calibre:</span> <span class="val">${caliber?.name || m.caliberId}</span></div>
            <div class="field"><span class="label">Quantidade:</span> <span class="val">${isReturn ? (returnAmt || m.returnedQuantity || 0) : m.quantity} unidades</span></div>
            <div class="field"><span class="label">Cofre:</span> <span class="val">${vault?.code || 'Cofre Principal'}</span></div>
            <div class="field"><span class="label">Operador:</span> <span class="val">${m.userName}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Responsável e Motivo</div>
          <div class="field"><span class="label">Responsável:</span> <span class="val">${responsibleText}</span></div>
          <div class="field"><span class="label">Motivo / Destino:</span> <span class="val">${m.recipientOrReason}</span></div>
          ${m.observation ? `<div class="field" style="margin-top: 6px;"><span class="label">Observações:</span> <span class="val" style="font-weight: normal;">${m.observation}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${m.responsibleName || 'Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Responsável</span>
          </div>
          <div class="sig-line">
            ${m.userName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Operador</span>
          </div>
        </div>

        <div class="footer">
          Documento impresso eletronicamente pelo Sistema de Armeria em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Submit Unused Ammo Return
  const handleConfirmReturnAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');

    const maxReturnable = returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0);
    if (returnQuantity <= 0 || returnQuantity > maxReturnable) {
      setErrorMsg(`A quantidade de devolução deve estar entre 1 e ${maxReturnable}.`);
      return;
    }

    try {
      await storage.returnUnusedAmmo(returnTargetMov.id, returnQuantity);
      setSuccessMsg(`Devolução de ${returnQuantity} munições registrada com sucesso.`);
      
      const updatedMov = {
        ...returnTargetMov,
        returnedQuantity: (returnTargetMov.returnedQuantity || 0) + returnQuantity,
        returnedAt: new Date().toISOString(),
        returnedByUserName: currentUser.name
      };

      setReturnTargetMov(null);
      onRefresh();

      // Directly call print browser helper
      handlePrintDirectReceipt(updatedMov, true, returnQuantity);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    }
  };

  // Filtered Departments to display
  const visibleDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);

  // Available units filtered by department filter
  const availableUnitsForFilter = filterDepartmentId
    ? units.filter(u => u.departmentId === filterDepartmentId)
    : units;

  // Filtered stocks according to global filters
  const filteredStocks = stocks.filter(s => {
    if (filterCaliberId && s.caliberId !== filterCaliberId) return false;
    if (filterDepartmentId && s.departmentId !== filterDepartmentId) return false;
    if (filterUnitId && s.unitId !== filterUnitId) return false;
    return true;
  });

  // Filtered movements according to column filters
  const filteredMovements = movements.filter(m => {
    // Global dropdown filters
    if (filterCaliberId && m.caliberId !== filterCaliberId) return false;
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
    if (filterDepartmentId && vault && vault.departmentId !== filterDepartmentId) return false;
    if (filterUnitId && vault && vault.unitId !== filterUnitId) return false;

    // Column text/dropdown filters
    if (colFilterData && !formatTimestamp(m.createdAt).toLowerCase().includes(colFilterData.toLowerCase())) return false;
    if (colFilterTipo && m.type !== colFilterTipo) return false;

    const cal = calibers.find(c => c.id === m.caliberId);
    if (colFilterCalibre && cal && !cal.name.toLowerCase().includes(colFilterCalibre.toLowerCase())) return false;

    if (colFilterQtd && !m.quantity.toString().includes(colFilterQtd)) return false;

    const unit = vault ? units.find(u => u.id === vault.unitId) : null;
    const dept = vault ? departments.find(d => d.id === vault.departmentId) : null;
    const localText = `${vault ? vault.code : ''} ${unit ? unit.name : ''} ${dept ? dept.name : ''}`.toLowerCase();
    if (colFilterLocal && !localText.includes(colFilterLocal.toLowerCase())) return false;

    if (colFilterMotivo && !m.recipientOrReason.toLowerCase().includes(colFilterMotivo.toLowerCase()) && !(m.observation || '').toLowerCase().includes(colFilterMotivo.toLowerCase())) return false;

    const respText = `${m.responsibleName || ''} ${m.responsibleMasp || ''}`.toLowerCase();
    if (colFilterPolicial && !respText.includes(colFilterPolicial.toLowerCase())) return false;

    if (colFilterDevolucao) {
      const devText = `${m.returnedQuantity || 0}`.toLowerCase();
      if (!devText.includes(colFilterDevolucao.toLowerCase())) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner with Separate Entrance & Exit Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão e Estoque de Munições por Departamento</h1>
            <p className="text-xs text-slate-400">
              Selecione o departamento para visualizar e registrar entrada ou saída de munição
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Button Cadastrar Calibre - Opens Caliber Management Modal (Visible ONLY for Geral & Armeiro) */}
          {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
            <button
              onClick={() => {
                setErrorMsg('');
                setCaliberName('');
                setEditingCaliber(null);
                setShowCaliberModal(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Cadastrar Calibre</span>
            </button>
          )}

          {/* Separate ENTRADA Button */}
          {canManageStock && (
            <button
              onClick={() => handleOpenMovementModal('Entrada')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <ArrowDownLeft className="w-4 h-4 text-white" />
              <span>Entrada de Munição</span>
            </button>
          )}

          {/* Separate SAÍDA Button */}
          {canManageStock && (
            <button
              onClick={() => handleOpenMovementModal('Saída')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <ArrowUpRight className="w-4 h-4 text-slate-950" />
              <span>Saída de Munição</span>
            </button>
          )}
        </div>
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

      {/* Global Filter Bar (Calibre, Departamento, Unidade) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
          <Filter className="w-4 h-4" />
          <span>Filtros Globais de Pesquisa</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Calibre Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Filtrar por Calibre</label>
            <select
              value={filterCaliberId}
              onChange={(e) => setFilterCaliberId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos os Calibres</option>
              {calibers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Departamento Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Filtrar por Departamento</label>
            <select
              value={filterDepartmentId}
              onChange={(e) => {
                setFilterDepartmentId(e.target.value);
                setFilterUnitId('');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos os Departamentos</option>
              {visibleDepts.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>

          {/* Unidade Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Filtrar por Unidade</label>
            <select
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todas as Unidades</option>
              {availableUnitsForFilter.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Departments Accordion for Ammunition Stock */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          if (filterDepartmentId && dept.id !== filterDepartmentId) return null;

          const deptStocks = filteredStocks.filter(s => s.departmentId === dept.id);
          const isExpanded = filterDepartmentId === dept.id || expandedDeptIds.includes(dept.id);

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
              
              {/* Department Accordion Header */}
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
                      {deptStocks.length} registro(s) de estoque neste departamento
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptStocks.reduce((sum, s) => sum + s.quantity, 0)} un. Totais
                  </span>

                  {/* Direct Entrada / Saída buttons inside department header */}
                  {canManageStock && (
                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenMovementModal('Entrada', dept.id)}
                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                        title="Registrar Entrada neste departamento"
                      >
                        + Entrada
                      </button>
                      <button
                        onClick={() => handleOpenMovementModal('Saída', dept.id)}
                        className="bg-amber-950 hover:bg-amber-900 text-amber-400 border border-amber-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                        title="Registrar Saída neste departamento"
                      >
                        - Saída
                      </button>
                    </div>
                  )}

                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Department Stock Cards */}
              {isExpanded && (
                <div className="p-6 bg-slate-950/40 border-t border-slate-800/60">
                  {deptStocks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      Nenhum estoque de munição registrado para este departamento.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deptStocks.map((st) => {
                        const cal = calibers.find(c => c.id === st.caliberId);
                        const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                        const unit = units.find(u => u.id === st.unitId);

                        return (
                          <div
                            key={st.id}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between shadow-sm"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-amber-400 text-base">
                                  {cal ? cal.name : st.caliberId}
                                </span>
                                <span className="text-xs font-mono font-bold text-slate-200 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                                  Cofre: {vault ? vault.code : 'N/A'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Unidade: <strong className="text-slate-200">{unit ? unit.name : ''}</strong>
                              </p>
                            </div>

                            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                              <span className="text-xs text-slate-400">Estoque Atual:</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-base font-mono font-black text-emerald-400">
                                  {st.quantity} un
                                </span>
                                {isGeral && (
                                  <button
                                    onClick={() => handleDeleteStock(st)}
                                    className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                                    title="Excluir Estoque"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
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

      {/* Movement Log Table with Column Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-3 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <span>Histórico de Movimentação de Munições</span>
            <span className="text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded font-mono">
              {filteredMovements.length}
            </span>
          </h2>
          {(colFilterData || colFilterTipo || colFilterCalibre || colFilterQtd || colFilterLocal || colFilterMotivo || colFilterPolicial || colFilterDevolucao) && (
            <button
              onClick={() => {
                setColFilterData('');
                setColFilterTipo('');
                setColFilterCalibre('');
                setColFilterQtd('');
                setColFilterLocal('');
                setColFilterMotivo('');
                setColFilterPolicial('');
                setColFilterDevolucao('');
              }}
              className="text-xs text-amber-400 hover:underline font-medium"
            >
              Limpar Filtros de Coluna
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-2 px-3 min-w-[110px]">Data / Hora</th>
                <th className="py-2 px-3 min-w-[90px]">Tipo</th>
                <th className="py-2 px-3 min-w-[100px]">Calibre</th>
                <th className="py-2 px-3 min-w-[80px]">Quantidade</th>
                <th className="py-2 px-3 min-w-[120px]">Local / Unidade</th>
                <th className="py-2 px-3 min-w-[130px]">Motivo / Destino</th>
                <th className="py-2 px-3 min-w-[140px]">Policial Responsável</th>
                <th className="py-2 px-3 min-w-[110px]">Devolução</th>
                <th className="py-2 px-3 text-right min-w-[80px]">Ações</th>
              </tr>

              {/* Column Filter Inputs Header Row */}
              <tr className="bg-slate-950/60 border-b border-slate-800">
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterData}
                    onChange={(e) => setColFilterData(e.target.value)}
                    placeholder="Filtrar data..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <select
                    value={colFilterTipo}
                    onChange={(e) => setColFilterTipo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  >
                    <option value="">Todos</option>
                    <option value="Entrada">Entrada</option>
                    <option value="Saída">Saída</option>
                  </select>
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterCalibre}
                    onChange={(e) => setColFilterCalibre(e.target.value)}
                    placeholder="Filtrar calibre..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterQtd}
                    onChange={(e) => setColFilterQtd(e.target.value)}
                    placeholder="Qtd..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterLocal}
                    onChange={(e) => setColFilterLocal(e.target.value)}
                    placeholder="Local/Unidade..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterMotivo}
                    onChange={(e) => setColFilterMotivo(e.target.value)}
                    placeholder="Motivo/Destino..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterPolicial}
                    onChange={(e) => setColFilterPolicial(e.target.value)}
                    placeholder="Policial/MASP..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterDevolucao}
                    onChange={(e) => setColFilterDevolucao(e.target.value)}
                    placeholder="Devolução..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const cal = calibers.find(c => c.id === m.caliberId);
                  const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
                  const unit = vault ? units.find(u => u.id === vault.unitId) : null;

                  const reasonStr = (m.recipientOrReason || '').toLowerCase();
                  const isCourseOrTest = reasonStr.includes('curso') || reasonStr.includes('teste');
                  const returnedQty = m.returnedQuantity || 0;
                  const canReturnMore = m.type === 'Saída' && isCourseOrTest && returnedQty < m.quantity;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {formatTimestamp(m.createdAt)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center space-x-1 w-fit ${
                            m.type === 'Entrada'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {m.type === 'Entrada' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{m.type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-100">
                        {cal ? cal.name : m.caliberId}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        {m.quantity} un
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-200">
                        <div className="font-bold">{vault ? vault.code : 'N/A'}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{unit ? unit.name : ''}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        <div>
                          <span>{m.recipientOrReason}</span>
                          {m.observation && (
                            <p className="text-[10px] text-slate-400 font-normal italic truncate max-w-xs" title={m.observation}>
                              Obs: {m.observation}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <div>
                          <span className="font-bold block text-slate-100">
                            {m.responsibleName || m.recipientOrReason}
                          </span>
                          {m.responsibleMasp && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              MASP: {m.responsibleMasp}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Devolução Column */}
                      <td className="py-3 px-3 text-xs font-mono">
                        {m.type === 'Saída' && isCourseOrTest ? (
                          <div className="space-y-1">
                            <span className={`font-bold block ${returnedQty > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {returnedQty} / {m.quantity} dev.
                            </span>
                            {canReturnMore && (
                              <button
                                onClick={() => {
                                  setReturnTargetMov(m);
                                  setReturnQuantity(m.quantity - returnedQty);
                                }}
                                className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded transition flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3 text-emerald-400" />
                                <span>Devolver</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">N/A</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right space-x-1">
                        <button
                          onClick={() => handlePrintDirectReceipt(m)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition inline-flex items-center space-x-1"
                          title="Imprimir PDF do Recibo (Via Navegador)"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="text-[10px] font-bold">PDF</span>
                        </button>

                        {canManageStock && (
                          <button
                            onClick={() => handleDeleteAmmoMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir Registro de Movimentação"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Calibres (Exibe Calibres, com opções de edição/cadastro apenas para perfil Geral) */}
      {showCaliberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Disc className="w-5 h-5 text-amber-400" />
                <span>Calibres Cadastrados no Sistema</span>
              </h3>
              <button
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberName('');
                }}
                className="text-slate-400 hover:text-slate-100 font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form de Cadastro / Edição: VISÍVEL APENAS PARA PERFIL GERAL E ARMEIRO */}
            {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') ? (
              <form onSubmit={handleSaveCaliber} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {editingCaliber ? 'Editar Calibre' : 'Cadastrar Novo Calibre'}
                </h4>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={caliberName}
                    onChange={(e) => setCaliberName(e.target.value)}
                    placeholder="Ex: 5,56x45mm, .40 S&W, 9x19mm"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shrink-0 shadow"
                  >
                    {editingCaliber ? 'Salvar' : 'Adicionar'}
                  </button>
                  {editingCaliber && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCaliber(null);
                        setCaliberName('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <p className="text-[11px] text-slate-500 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                Apenas usuários dos perfis <strong>Geral</strong> e <strong>Armeiro</strong> possuem permissão para cadastrar, editar ou excluir calibres.
              </p>
            )}

            {/* Lista de Calibres */}
            <div className="space-y-2 max-h-60 overflow-y-auto pt-1">
              {calibers.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">Nenhum calibre cadastrado.</p>
              ) : (
                calibers.map((c) => (
                  <div
                    key={c.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                  >
                    <span className="font-mono font-bold text-slate-100 text-sm">{c.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500 uppercase font-mono">Calibre</span>
                      {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
                        <>
                          <button
                            onClick={() => {
                              setEditingCaliber(c);
                              setCaliberName(c.name);
                            }}
                            className="p-1 text-slate-500 hover:text-amber-400 rounded transition"
                            title="Editar Calibre"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCaliber(c)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                            title="Excluir Calibre"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberName('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Movement (Entrada / Saída) */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <Disc className="w-5 h-5 text-amber-400" />
              <span>{movementType === 'Entrada' ? 'Registrar Entrada / Reabastecimento' : 'Registrar Saída de Munição'}</span>
            </h3>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              
              {/* Type Selection Tabs */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ENTRADA / REABASTECIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('Saída')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Saída'
                        ? 'bg-red-950 text-red-400 border-red-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    SAÍDA DE MUNIÇÃO
                  </button>
                </div>
              </div>

              {/* Caliber & Quantity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre
                  </label>
                  <select
                    value={selectedCaliberId}
                    onChange={(e) => setSelectedCaliberId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade (unidades)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Vault Location */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre (Apenas cofres de MUNIÇÕES)
                </label>
                <select
                  value={selectedVaultId}
                  onChange={(e) => setSelectedVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {ammoVaultSpaces.map((v) => {
                    const u = units.find(unit => unit.id === v.unitId);
                    const d = departments.find(dep => dep.id === v.departmentId);
                    return (
                      <option key={v.id} value={v.id}>
                        {v.code} - {u ? u.name : 'Unidade'} ({d ? d.code : ''})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Destino da Munição
                </label>
                <select
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                >
                  <option value="Curso ou Teste">Curso ou Teste (Permite retorno de sobras)</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Substituição">Substituição</option>
                  <option value="Abastecimento do Cofre">Abastecimento do Cofre</option>
                  <option value="Operacional">Operacional / Diligência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Policial Responsável pela Retirada */}
              <div className="border border-slate-800 bg-slate-950/60 p-3.5 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Policial Responsável pela Movimentação
                </label>

                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'SISTEMA'}
                      onChange={() => setResponsibleType('SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Policial Cadastrado no Sistema</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'FORA_DO_SISTEMA'}
                      onChange={() => setResponsibleType('FORA_DO_SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Fora do Sistema</span>
                  </label>
                </div>

                {responsibleType === 'SISTEMA' ? (
                  <div>
                    <select
                      value={selectedResponsibleUserId}
                      onChange={(e) => setSelectedResponsibleUserId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      required
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - {u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Nome do Policial</label>
                      <input
                        type="text"
                        value={customResponsibleName}
                        onChange={(e) => setCustomResponsibleName(e.target.value)}
                        placeholder="Nome Completo..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">MASP / Documento</label>
                      <input
                        type="text"
                        value={customResponsibleMasp}
                        onChange={(e) => setCustomResponsibleMasp(e.target.value)}
                        placeholder="Ex: 123.456-7"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Observação (até 500 caracteres) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Observação da Movimentação
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {observation.length} / 500
                  </span>
                </div>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Descreva observações específicas da movimentação (máximo 500 caracteres)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Movimentação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Devolução de Sobras de Munição */}
      {returnTargetMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
              <span>Devolução de Munições Não Utilizadas</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Policial: <strong className="text-slate-200">{returnTargetMov.responsibleName || returnTargetMov.recipientOrReason}</strong>
              <br />
              Retirada inicial: <strong className="text-amber-400">{returnTargetMov.quantity} un</strong>
              {returnTargetMov.returnedQuantity ? ` (Já devolvidos: ${returnTargetMov.returnedQuantity} un)` : ''}
            </p>

            <form onSubmit={handleConfirmReturnAmmo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade a Devolver (Restante max: {returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)} un)
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReturnTargetMov(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
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
        isOpen={!!deleteTargetAmmo}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetAmmo?.label || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteAmmo}
        onCancel={() => setDeleteTargetAmmo(null)}
      />

    </div>
  );
};
