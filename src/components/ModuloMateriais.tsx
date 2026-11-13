import React, { useState, useMemo, useEffect } from 'react';
import {
  Material,
  TipoMaterial,
  CautelaMaterial,
  MaterialTransfer,
  VaultSpace,
  User,
  Department,
  Unit,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { printDocumentInPage } from '../utils/printHelper';
import {
  Package,
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Printer,
  Edit2,
  Trash2,
  ArrowRightLeft,
  Shield,
  Layers,
  Building2,
  Tag,
  AlertCircle,
  UserCheck,
  UserX,
  X,
  ExternalLink,
  Flame,
  Info,
  Eye,
  Vault,
  Send,
  List,
  SlidersHorizontal,
  CheckSquare,
  Square
} from 'lucide-react';
import { formatMasp } from '../utils/masks';
import { MaterialReceiptModal } from './ModalReciboMaterial';

interface MaterialModuleProps {
  currentUser: User | null;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  vaultSpaces?: VaultSpace[];
  onRefresh: () => void;
}

export const MaterialModule: React.FC<MaterialModuleProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  vaultSpaces: vaultSpacesProp,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'estoque' | 'todos' | 'cautelas' | 'tipos'>('estoque');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('');
  const [selectedVaultFilter, setSelectedVaultFilter] = useState('');
  const [selectedDepositFilter, setSelectedDepositFilter] = useState<'all' | 'SIM' | 'NAO'>('all');
  const [selectedStockStatusFilter, setSelectedStockStatusFilter] = useState<'all' | 'disponivel' | 'em_uso' | 'consumido' | 'vencido' | 'vencendo'>('all');
  const [cautelaStatusFilter, setCautelaStatusFilter] = useState<string>('todas');
  const [selectedCautelaMaterialId, setSelectedCautelaMaterialId] = useState<string>('');
  const [selectedVaultDetailsId, setSelectedVaultDetailsId] = useState<string | null>(null);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  const [showPrintConfigPanel, setShowPrintConfigPanel] = useState(false);
  const [printFields, setPrintFields] = useState({
    tipoCategoria: true,
    seriePatrimonio: true,
    cofreLocal: true,
    deptUnidade: true,
    estoqueDetalhado: true,
    situacaoAcautelado: true,
    passivoDeposito: true,
    validade: true,
    auditoriaCadastro: true,
    observacoes: true
  });

  // Modals
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const [showTipoModal, setShowTipoModal] = useState(false);
  const [newTipoNome, setNewTipoNome] = useState('');
  const [newTipoDescricao, setNewTipoDescricao] = useState('');
  const [newTipoCategoria, setNewTipoCategoria] = useState('Equipamentos');
  const [newTipoEhConsumivel, setNewTipoEhConsumivel] = useState(false);

  const [showCautelaModal, setShowCautelaModal] = useState(false);
  const [cautelaMaterialTarget, setCautelaMaterialTarget] = useState<Material | null>(null);

  const [showDevolucaoModal, setShowDevolucaoModal] = useState(false);
  const [selectedCautelaForReturn, setSelectedCautelaForReturn] = useState<CautelaMaterial | null>(null);

  const [receiptCautela, setReceiptCautela] = useState<CautelaMaterial | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for Material Modal
  const [formTipoMaterialId, setFormTipoMaterialId] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formQuantidade, setFormQuantidade] = useState<number>(1);
  const [formDepartamentoId, setFormDepartamentoId] = useState('');
  const [formUnidadeId, setFormUnidadeId] = useState('');
  const [formValidade, setFormValidade] = useState('');
  const [formVaultSpaceId, setFormVaultSpaceId] = useState('');
  const [formLocalGuarda, setFormLocalGuarda] = useState('');
  const [formPassivoDeposito, setFormPassivoDeposito] = useState<'SIM' | 'NAO'>('SIM');
  const [formNumeroSerie, setFormNumeroSerie] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');

  // Form states for Cautela Modal
  const [cautelaQtd, setCautelaQtd] = useState<number>(1);
  const [cautelaDestinatarioTipo, setCautelaDestinatarioTipo] = useState<'interno' | 'externo'>('interno');
  const [cautelaUsuarioInternoId, setCautelaUsuarioInternoId] = useState('');
  const [cautelaUsuarioExternoNome, setCautelaUsuarioExternoNome] = useState('');
  const [cautelaUsuarioExternoDoc, setCautelaUsuarioExternoDoc] = useState('');
  const [cautelaUsuarioExternoOrgao, setCautelaUsuarioExternoOrgao] = useState('');
  const [cautelaUsuarioExternoTelefone, setCautelaUsuarioExternoTelefone] = useState('');
  const [cautelaDataRetirada, setCautelaDataRetirada] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [cautelaDataPrevistaDevolucao, setCautelaDataPrevistaDevolucao] = useState('');
  const [cautelaFinalidade, setCautelaFinalidade] = useState('');

  // Form states for Devolucao/Baixa Modal
  const [returnStatus, setReturnStatus] = useState<'Devolvido' | 'Consumido' | 'Devolvido com Anomalia'>('Devolvido');
  const [returnFoiConsumido, setReturnFoiConsumido] = useState(false);
  const [returnRelato, setReturnRelato] = useState('');
  const [returnData, setReturnData] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  // Form states for Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMaterialTarget, setTransferMaterialTarget] = useState<Material | null>(null);
  const [transferQtd, setTransferQtd] = useState<number>(1);
  const [transferDestDeptId, setTransferDestDeptId] = useState('');
  const [transferDestUnitId, setTransferDestUnitId] = useState('');
  const [transferDestArmorerId, setTransferDestArmorerId] = useState('');
  const [transferTransporterId, setTransferTransporterId] = useState('');
  const [transferReason, setTransferReason] = useState('Abastecimento de material na unidade');
  const [transferObs, setTransferObs] = useState('');

  // Permission logic
  const effectiveRole = currentUser?.activeRole || currentUser?.role;
  const isGeral = effectiveRole === 'Geral';
  const isAdmin = effectiveRole === 'Administrador';
  const isArmeiro = effectiveRole === 'Armeiro';
  const isDeptArmeiro = isArmeiro && currentUser?.managementScope === 'department';

  // "novos materiais so podem ser inseridos por usuarios administradores, armeiros e geral"
  const canInsertMaterial = isGeral || isAdmin || isArmeiro;

  // Department and Unit lock rules:
  // Geral chooses any department and unit.
  // Admin and Armeiro with department scope have their department fixed and can choose any unit of that department.
  // Unit-scoped users have both department and unit fixed.
  const userDeptId = currentUser?.departmentId || '';
  const userUnitId = currentUser?.unitId || '';
  const isOnlyUnitAccess = !isGeral && !isAdmin && !isDeptArmeiro;

  // Available data from storage with active state synchronization
  const [tiposMateriais, setTiposMateriais] = useState<TipoMaterial[]>(() => storage.getTiposMateriais());
  const [materiaisList, setMateriaisList] = useState<Material[]>(() => storage.getMateriais(currentUser));
  const [cautelasList, setCautelasList] = useState<CautelaMaterial[]>(() => storage.getCautelasMateriais(currentUser));
  const [transfersList, setTransfersList] = useState<MaterialTransfer[]>(() => storage.getMaterialTransfers(currentUser));
  const vaultsListInitial = (vaultSpacesProp && vaultSpacesProp.length > 0) ? vaultSpacesProp : storage.getVaultSpaces(currentUser);
  const [vaultsList, setVaultsList] = useState<VaultSpace[]>(vaultsListInitial);
  const [receiveTransferTarget, setReceiveTransferTarget] = useState<MaterialTransfer | null>(null);
  const [receiveVaultId, setReceiveVaultId] = useState('');
  const [receiveObs, setReceiveObs] = useState('');

  // Full lookup lists so Armeiros/Admins can transfer materials to other departments or other units in their department
  const allDepartmentsList = useMemo(() => {
    const full = storage.getAllDepartments();
    return full.length > 0 ? full : departments;
  }, [departments, materiaisList, transfersList]);

  const allUnitsList = useMemo(() => {
    const full = storage.getAllUnits();
    return full.length > 0 ? full : units;
  }, [units, materiaisList, transfersList]);

  const allUsersLookupList = useMemo(() => {
    const full = storage.getAllUsersForLookup();
    return full.length > 0 ? full : allUsers;
  }, [allUsers, materiaisList, transfersList]);

  const availableTransferDestUnits = useMemo(() => {
    const originUnitId = transferMaterialTarget?.unidadeId || '';
    return allUnitsList.filter(
      u => (!transferDestDeptId || u.departmentId === transferDestDeptId) && u.id !== originUnitId
    );
  }, [allUnitsList, transferDestDeptId, transferMaterialTarget]);

  const availableTransferDestArmorers = useMemo(() => {
    if (!transferDestUnitId) return [];
    return allUsersLookupList.filter(
      u =>
        u.unitId === transferDestUnitId &&
        u.hasSystemAccess !== false &&
        (u.role === 'Armeiro' ||
          u.activeRole === 'Armeiro' ||
          (Array.isArray(u.roles) && u.roles.includes('Armeiro')))
    );
  }, [allUsersLookupList, transferDestUnitId]);

  useEffect(() => {
    if (!showTransferModal) return;
    if (availableTransferDestArmorers.length > 0) {
      if (!availableTransferDestArmorers.some(u => u.id === transferDestArmorerId)) {
        const preferred =
          availableTransferDestArmorers.find(u => u.activeRole === 'Armeiro' || u.role === 'Armeiro') ||
          availableTransferDestArmorers[0];
        setTransferDestArmorerId(preferred.id);
        if (!transferTransporterId) {
          setTransferTransporterId(preferred.id);
        }
      }
    } else if (transferDestArmorerId) {
      setTransferDestArmorerId('');
    }
  }, [showTransferModal, availableTransferDestArmorers, transferDestArmorerId, transferTransporterId]);

  const materiais = materiaisList;
  const cautelas = cautelasList;

  const reloadMateriais = async () => {
    try {
      await storage.refreshFromServer();
    } catch {
      // fallback to storage
    }
    setTiposMateriais(storage.getTiposMateriais());
    setMateriaisList(storage.getMateriais(currentUser));
    setCautelasList(storage.getCautelasMateriais(currentUser));
    setTransfersList(storage.getMaterialTransfers(currentUser));
    setVaultsList(storage.getVaultSpaces(currentUser));
  };

  useEffect(() => {
    reloadMateriais();
  }, [currentUser]);

  useEffect(() => {
    if (vaultSpacesProp && vaultSpacesProp.length > 0) {
      setVaultsList(vaultSpacesProp);
    }
  }, [vaultSpacesProp]);

  const materialVaults = useMemo(() => {
    return (vaultsList || []).filter(v => v.type === 'MATERIAIS');
  }, [vaultsList]);

  const materialVaultsForForm = useMemo(() => {
    return materialVaults.filter(v => {
      if (formUnidadeId) return v.unitId === formUnidadeId;
      if (formDepartamentoId) return v.departmentId === formDepartamentoId;
      return true;
    });
  }, [materialVaults, formUnidadeId, formDepartamentoId]);

  // Filtered materials
  const filteredMateriais = useMemo(() => {
    const search = (searchTerm || '').trim().toLowerCase();
    return (materiaisList || []).filter(m => {
      if (!m) return false;
      const matchSearch = !search || (
        (m.nome || '').toLowerCase().includes(search) ||
        (m.tipoMaterialNome || '').toLowerCase().includes(search) ||
        (m.localGuarda && m.localGuarda.toLowerCase().includes(search)) ||
        (m.numeroSerie && m.numeroSerie.toLowerCase().includes(search)) ||
        (m.unidadeNome && m.unidadeNome.toLowerCase().includes(search))
      );

      const matchType = selectedTypeFilter ? m.tipoMaterialId === selectedTypeFilter : true;
      const matchDept = selectedDeptFilter ? m.departamentoId === selectedDeptFilter : true;
      const matchUnit = selectedUnitFilter ? m.unidadeId === selectedUnitFilter : true;

      return matchSearch && matchType && matchDept && matchUnit;
    });
  }, [materiaisList, searchTerm, selectedTypeFilter, selectedDeptFilter, selectedUnitFilter]);

  const getVaultForMaterial = (m: Material): VaultSpace | undefined => {
    if (m.vaultSpaceId) {
      const byId = materialVaults.find(v => v.id === m.vaultSpaceId);
      if (byId) return byId;
    }
    return materialVaults.find(
      v => v.code === m.localGuarda && (!m.unidadeId || v.unitId === m.unidadeId)
    );
  };

  const getValidityStatusKey = (validadeStr?: string | null): 'nao_perecivel' | 'vencido' | 'vencendo' | 'valido' => {
    if (!validadeStr) return 'nao_perecivel';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validDate = new Date(validadeStr);
    const diffDays = Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'vencido';
    if (diffDays <= 90) return 'vencendo';
    return 'valido';
  };

  const getValidityText = (validadeStr?: string | null): string => {
    if (!validadeStr) return 'Não perecível';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validDate = new Date(validadeStr);
    const diffDays = Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const datePt = new Date(validadeStr).toLocaleDateString('pt-BR');
    if (diffDays < 0) return `Vencido em ${datePt}`;
    if (diffDays <= 90) return `Vence em ${diffDays}d (${datePt})`;
    return datePt;
  };

  const activeCautelasByMaterialId = useMemo(() => {
    const map = new Map<string, CautelaMaterial[]>();
    const activeStatuses = new Set(['AUTORIZADA', 'Em Uso', 'DEVOLUCAO_PENDENTE']);
    for (const c of cautelasList || []) {
      if (!activeStatuses.has(c.status)) continue;
      const list = map.get(c.materialId) || [];
      list.push(c);
      map.set(c.materialId, list);
    }
    return map;
  }, [cautelasList]);

  const filteredAllMateriais = useMemo(() => {
    const search = (searchTerm || '').trim().toLowerCase();
    return (materiaisList || []).filter(m => {
      if (!m) return false;
      const activeForMat = activeCautelasByMaterialId.get(m.id) || [];
      const matchSearch =
        !search ||
        (m.nome || '').toLowerCase().includes(search) ||
        (m.tipoMaterialNome || '').toLowerCase().includes(search) ||
        (m.localGuarda && m.localGuarda.toLowerCase().includes(search)) ||
        (m.numeroSerie && m.numeroSerie.toLowerCase().includes(search)) ||
        (m.unidadeNome && m.unidadeNome.toLowerCase().includes(search)) ||
        activeForMat.some(c =>
          (c.usuarioInternoNome || '').toLowerCase().includes(search) ||
          (c.usuarioInternoMasp || '').toLowerCase().includes(search) ||
          (c.usuarioExternoNome || '').toLowerCase().includes(search) ||
          (c.protocolo || '').toLowerCase().includes(search)
        );
      if (!matchSearch) return false;
      if (selectedTypeFilter && m.tipoMaterialId !== selectedTypeFilter) return false;
      if (selectedDeptFilter && m.departamentoId !== selectedDeptFilter) return false;
      if (selectedUnitFilter && m.unidadeId !== selectedUnitFilter) return false;

      if (selectedVaultFilter === '__LEGACY__') {
        if (getVaultForMaterial(m)) return false;
      } else if (selectedVaultFilter) {
        const matchedVault = getVaultForMaterial(m);
        if (m.vaultSpaceId !== selectedVaultFilter && matchedVault?.id !== selectedVaultFilter) {
          return false;
        }
      }

      if (selectedDepositFilter === 'SIM' && m.passivoDepositoPoliciais === false) return false;
      if (selectedDepositFilter === 'NAO' && m.passivoDepositoPoliciais !== false) return false;

      if (selectedStockStatusFilter === 'disponivel' && Number(m.quantidadeDisponivel || 0) <= 0) return false;
      if (
        selectedStockStatusFilter === 'em_uso' &&
        Number(m.quantidadeEmUso || 0) <= 0 &&
        activeForMat.length === 0
      ) {
        return false;
      }
      if (selectedStockStatusFilter === 'consumido' && Number(m.quantidadeConsumida || 0) <= 0) return false;
      if (selectedStockStatusFilter === 'vencido' && getValidityStatusKey(m.validade) !== 'vencido') return false;
      if (selectedStockStatusFilter === 'vencendo' && getValidityStatusKey(m.validade) !== 'vencendo') return false;

      return true;
    });
  }, [
    materiaisList,
    searchTerm,
    selectedTypeFilter,
    selectedDeptFilter,
    selectedUnitFilter,
    selectedVaultFilter,
    selectedDepositFilter,
    selectedStockStatusFilter,
    materialVaults,
    activeCautelasByMaterialId
  ]);

  const escapeHtml = (value?: string | number | null): string => {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const handlePrintMaterialVault = (vaultObj: VaultSpace | null, isLegacy = false) => {
    const vaultItems = isLegacy
      ? (materiaisList || []).filter(m => !getVaultForMaterial(m))
      : vaultObj
      ? (materiaisList || []).filter(m =>
          m.vaultSpaceId
            ? m.vaultSpaceId === vaultObj.id
            : (m.localGuarda === vaultObj.code && (!m.unidadeId || m.unidadeId === vaultObj.unitId))
        )
      : [];

    const vaultUnit = vaultObj
      ? allUnitsList.find(u => u.id === vaultObj.unitId) || units.find(u => u.id === vaultObj.unitId)
      : allUnitsList.find(u => u.id === currentUser?.unitId) || units.find(u => u.id === currentUser?.unitId);
    const vaultDept = vaultObj
      ? allDepartmentsList.find(d => d.id === vaultObj.departmentId) || departments.find(d => d.id === vaultObj.departmentId)
      : allDepartmentsList.find(d => d.id === currentUser?.departmentId) || departments.find(d => d.id === currentUser?.departmentId);

    const logoSrc = getSystemLogo(vaultUnit, vaultDept);
    const vaultCode = isLegacy ? 'OUTROS LOCAIS (Legado)' : (vaultObj?.code || 'N/I');
    const vaultDesc = isLegacy
      ? 'Materiais sem cofre vinculado'
      : (vaultObj?.descricaoCurta || 'Cofre destinado à guarda de materiais operacionais');

    const totalQtd = vaultItems.reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
    const totalDisp = vaultItems.reduce((acc, m) => acc + Number(m.quantidadeDisponivel || 0), 0);
    const totalUso = vaultItems.reduce((acc, m) => acc + Number(m.quantidadeEmUso || 0), 0);
    const totalCons = vaultItems.reduce((acc, m) => acc + Number(m.quantidadeConsumida || 0), 0);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatório de Cofre de Materiais - ${escapeHtml(vaultCode)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; padding: 14px; font-size: 10.5px; line-height: 1.35; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; gap: 12px; }
          .header-left { display: flex; align-items: center; gap: 12px; }
          .logo { height: 52px; width: auto; object-fit: contain; }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; color: #111827; }
          .subtitle { font-size: 10px; font-weight: 700; color: #b45309; text-transform: uppercase; margin-top: 2px; }
          .badge { border: 2px solid #111827; padding: 6px 12px; border-radius: 6px; text-align: center; font-family: monospace; background: #f8fafc; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
          .meta-item label { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; }
          .meta-item span { font-size: 10.5px; font-weight: 700; color: #0f172a; }
          .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; background: #fff; }
          .kpi-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .kpi-val { font-size: 14px; font-weight: 900; font-family: monospace; color: #0f172a; margin-top: 2px; }
          .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #111827; border-left: 4px solid #d97706; padding-left: 8px; margin: 10px 0 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
          th { background: #1e293b; color: #fff; border: 1px solid #334155; padding: 6px 5px; text-align: left; text-transform: uppercase; font-size: 8.5px; }
          td { border: 1px solid #cbd5e1; padding: 6px 5px; vertical-align: top; }
          tr:nth-child(even) { background: #f8fafc; }
          .mono { font-family: monospace; }
          .tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-weight: 700; border: 1px solid #cbd5e1; background: #f1f5f9; }
          .signatures { display: flex; justify-content: center; margin-top: 28px; }
          .sig-line { width: 280px; border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-weight: 700; font-size: 10px; }
          .footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 8.5px; color: #64748b; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <img src="${escapeHtml(logoSrc)}" alt="Brasão PCMG" class="logo" />
            <div>
              <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
              <div class="subtitle">SISTEMA DE ARMARIA • INVENTÁRIO COMPLETO DO COFRE DE MATERIAIS</div>
            </div>
          </div>
          <div class="badge">
            <div style="font-size: 8px; color: #475569; font-weight: 700;">COFRE DE MATERIAIS</div>
            <div style="font-size: 15px; font-weight: 900; color: #0f172a;">${escapeHtml(vaultCode)}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><label>Departamento</label><span>${escapeHtml(vaultDept?.name || 'N/A')} ${vaultDept?.code ? `(${escapeHtml(vaultDept.code)})` : ''}</span></div>
          <div class="meta-item"><label>Unidade Policial</label><span>${escapeHtml(vaultUnit?.name || 'N/A')}</span></div>
          <div class="meta-item"><label>Descrição Curta do Cofre</label><span>${escapeHtml(vaultDesc)}</span></div>
          <div class="meta-item"><label>Código do Local</label><span class="mono">${escapeHtml(vaultCode)}</span></div>
          <div class="meta-item"><label>Responsável pela Emissão</label><span>${escapeHtml(currentUser?.name || 'Armeiro')} (MASP: ${escapeHtml(currentUser?.masp || 'N/I')})</span></div>
          <div class="meta-item"><label>Data / Hora de Emissão</label><span class="mono">${new Date().toLocaleString('pt-BR')}</span></div>
        </div>

        <div class="kpi-row">
          <div class="kpi"><div class="kpi-label">Registros no Cofre</div><div class="kpi-val">${vaultItems.length}</div></div>
          <div class="kpi"><div class="kpi-label">Quantidade Total</div><div class="kpi-val">${totalQtd} un</div></div>
          <div class="kpi"><div class="kpi-label">Disponível</div><div class="kpi-val" style="color:#047857;">${totalDisp} un</div></div>
          <div class="kpi"><div class="kpi-label">Em Uso (Acautelado)</div><div class="kpi-val" style="color:#b45309;">${totalUso} un</div></div>
          <div class="kpi"><div class="kpi-label">Baixa p/ Consumo</div><div class="kpi-val" style="color:#6d28d9;">${totalCons} un</div></div>
        </div>

        <div class="section-title">RELAÇÃO DETALHADA DE TODOS OS MATERIAIS ARMAZENADOS NO COFRE</div>

        ${vaultItems.length === 0 ? `
          <div style="padding: 24px; border: 1px dashed #94a3b8; border-radius: 6px; text-align: center; color: #64748b; font-style: italic;">
            Nenhum material cadastrado dentro deste cofre até o momento.
          </div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Material & Identificação</th>
                <th>Tipo / Categoria</th>
                <th>Nº Série / Patr.</th>
                <th>Estoque (Total / Disp / Uso / Cons)</th>
                <th>Cautelável p/ Policiais</th>
                <th>Validade</th>
                <th>Depto / Unidade / Cofre</th>
                <th>Cadastro & Atualização</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${vaultItems.map((mat, idx) => {
                const tipoObj = tiposMateriais.find(t => t.id === mat.tipoMaterialId);
                return `
                  <tr>
                    <td class="mono" style="text-align:center;">${idx + 1}</td>
                    <td><strong>${escapeHtml(mat.nome)}</strong></td>
                    <td>
                      <div><strong>${escapeHtml(mat.tipoMaterialNome || tipoObj?.nome || '-')}</strong></div>
                      <div style="color:#475569; font-size:8.5px;">${escapeHtml(tipoObj?.categoria || 'Geral')} • ${tipoObj?.ehConsumivel ? 'Consumível' : 'Permanente'}</div>
                    </td>
                    <td class="mono">${escapeHtml(mat.numeroSerie || 'Não informado')}</td>
                    <td class="mono">
                      <strong>Total: ${mat.quantidade}</strong><br/>
                      Disp: ${mat.quantidadeDisponivel} | Uso: ${mat.quantidadeEmUso} | Cons: ${mat.quantidadeConsumida}
                    </td>
                    <td>
                      <span class="tag">${mat.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}</span>
                    </td>
                    <td>${escapeHtml(getValidityText(mat.validade))}</td>
                    <td>
                      <div>${escapeHtml(mat.unidadeNome || vaultUnit?.name || mat.unidadeId)}</div>
                      <div style="color:#475569; font-size:8.5px;">${escapeHtml(mat.departamentoNome || vaultDept?.name || mat.departamentoId)}</div>
                      <div class="mono" style="font-size:8.5px; color:#047857;">Local: ${escapeHtml(mat.localGuarda || vaultCode)}</div>
                    </td>
                    <td style="font-size:8.5px;">
                      <div>Por: ${escapeHtml(mat.criadoPorNome || 'Sistema')}</div>
                      <div class="mono">Cad: ${mat.createdAt ? new Date(mat.createdAt).toLocaleDateString('pt-BR') : '-'}</div>
                      ${mat.updatedAt ? `<div class="mono">Atu: ${new Date(mat.updatedAt).toLocaleDateString('pt-BR')}</div>` : ''}
                    </td>
                    <td>${escapeHtml(mat.observacoes || '-')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}

        <div class="signatures">
          <div class="sig-line">
            ${escapeHtml(currentUser?.name || 'Responsável pela Armaria')}<br/>
            <span style="font-weight:normal; font-size:9px; color:#475569;">MASP: ${escapeHtml(currentUser?.masp || 'N/I')} • Conferência de Cofre de Materiais</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado pelo Sistema de Armeria PCMG em ${new Date().toLocaleString('pt-BR')} • Cofre: ${escapeHtml(vaultCode)}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  const handlePrintFilteredMaterialsReport = () => {
    const selectedSet = new Set(selectedPrintIds);
    const itemsToPrint = selectedPrintIds.length > 0
      ? filteredAllMateriais.filter(m => selectedSet.has(m.id))
      : filteredAllMateriais;

    if (itemsToPrint.length === 0) {
      setErrorMessage('Não há materiais com os filtros selecionados para imprimir no relatório.');
      return;
    }

    const filterUnitObj = selectedUnitFilter
      ? allUnitsList.find(u => u.id === selectedUnitFilter) || units.find(u => u.id === selectedUnitFilter)
      : allUnitsList.find(u => u.id === currentUser?.unitId) || units.find(u => u.id === currentUser?.unitId);
    const filterDeptObj = selectedDeptFilter
      ? allDepartmentsList.find(d => d.id === selectedDeptFilter) || departments.find(d => d.id === selectedDeptFilter)
      : allDepartmentsList.find(d => d.id === currentUser?.departmentId) || departments.find(d => d.id === currentUser?.departmentId);

    const logoSrc = getSystemLogo(filterUnitObj, filterDeptObj);

    const activeFiltersDesc: string[] = [];
    if (searchTerm.trim()) activeFiltersDesc.push(`Busca: "${searchTerm.trim()}"`);
    if (selectedTypeFilter) {
      const t = tiposMateriais.find(item => item.id === selectedTypeFilter);
      if (t) activeFiltersDesc.push(`Tipo: ${t.nome}`);
    }
    if (selectedVaultFilter === '__LEGACY__') {
      activeFiltersDesc.push('Cofre: Sem Cofre Vinculado');
    } else if (selectedVaultFilter) {
      const v = materialVaults.find(item => item.id === selectedVaultFilter);
      if (v) activeFiltersDesc.push(`Cofre: ${v.code}`);
    }
    if (selectedDepositFilter !== 'all') activeFiltersDesc.push(`Cautelável: ${selectedDepositFilter}`);
    if (selectedStockStatusFilter !== 'all') activeFiltersDesc.push(`Situação: ${selectedStockStatusFilter.toUpperCase()}`);
    if (selectedDeptFilter && filterDeptObj) activeFiltersDesc.push(`Depto: ${filterDeptObj.name}`);
    if (selectedUnitFilter && filterUnitObj) activeFiltersDesc.push(`Unidade: ${filterUnitObj.name}`);
    if (selectedPrintIds.length > 0) activeFiltersDesc.push(`Seleção Manual: ${itemsToPrint.length} item(ns)`);

    const totalQtd = itemsToPrint.reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
    const totalDisp = itemsToPrint.reduce((acc, m) => acc + Number(m.quantidadeDisponivel || 0), 0);
    const totalUso = itemsToPrint.reduce((acc, m) => acc + Number(m.quantidadeEmUso || 0), 0);
    const totalCons = itemsToPrint.reduce((acc, m) => acc + Number(m.quantidadeConsumida || 0), 0);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatório Filtrado de Materiais - PCMG</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; padding: 14px; font-size: 10px; line-height: 1.35; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; gap: 12px; }
          .header-left { display: flex; align-items: center; gap: 12px; }
          .logo { height: 50px; width: auto; object-fit: contain; }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; color: #111827; }
          .subtitle { font-size: 10px; font-weight: 700; color: #b45309; text-transform: uppercase; margin-top: 2px; }
          .meta { text-align: right; font-family: monospace; font-size: 9.5px; color: #334155; }
          .filters-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 9.5px; }
          .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 10px; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px; text-align: center; }
          .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .kpi-val { font-size: 13px; font-weight: 900; font-family: monospace; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 9.2px; }
          th { background: #1e293b; color: #fff; border: 1px solid #334155; padding: 6px 5px; text-align: left; text-transform: uppercase; font-size: 8.2px; }
          td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
          tr:nth-child(even) { background: #f8fafc; }
          .mono { font-family: monospace; }
          .signatures { display: flex; justify-content: center; margin-top: 26px; }
          .sig-line { width: 280px; border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-weight: 700; font-size: 10px; }
          .footer { margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 8.5px; color: #64748b; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <img src="${escapeHtml(logoSrc)}" alt="Brasão PCMG" class="logo" />
            <div>
              <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
              <div class="subtitle">RELATÓRIO PERSONALIZADO DE TODOS OS MATERIAIS</div>
            </div>
          </div>
          <div class="meta">
            <div>Emissor: <strong>${escapeHtml(currentUser?.name || 'Armeiro')}</strong> (MASP: ${escapeHtml(currentUser?.masp || 'N/I')})</div>
            <div>Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div class="filters-box">
          <strong>Filtros Aplicados:</strong> ${activeFiltersDesc.length > 0 ? escapeHtml(activeFiltersDesc.join(' • ')) : 'Todos os materiais do escopo permitido'}
        </div>

        <div class="kpi-row">
          <div class="kpi"><div class="kpi-label">Registros</div><div class="kpi-val">${itemsToPrint.length}</div></div>
          <div class="kpi"><div class="kpi-label">Qtd Total</div><div class="kpi-val">${totalQtd} un</div></div>
          <div class="kpi"><div class="kpi-label">Disponível</div><div class="kpi-val" style="color:#047857;">${totalDisp} un</div></div>
          <div class="kpi"><div class="kpi-label">Em Uso</div><div class="kpi-val" style="color:#b45309;">${totalUso} un</div></div>
          <div class="kpi"><div class="kpi-label">Consumidos</div><div class="kpi-val" style="color:#6d28d9;">${totalCons} un</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nome do Material</th>
              ${printFields.tipoCategoria ? '<th>Tipo / Categoria</th>' : ''}
              ${printFields.seriePatrimonio ? '<th>Nº Série / Patr.</th>' : ''}
              ${printFields.cofreLocal ? '<th>Cofre / Local</th>' : ''}
              ${printFields.deptUnidade ? '<th>Depto / Unidade</th>' : ''}
              ${printFields.estoqueDetalhado ? '<th>Estoque (Tot / Disp / Uso / Cons)</th>' : ''}
              ${printFields.situacaoAcautelado ? '<th>Acautelamento / Dados do Policial</th>' : ''}
              ${printFields.passivoDeposito ? '<th>Cautelável</th>' : ''}
              ${printFields.validade ? '<th>Validade</th>' : ''}
              ${printFields.auditoriaCadastro ? '<th>Cadastro</th>' : ''}
              ${printFields.observacoes ? '<th>Observações</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${itemsToPrint.map((mat, idx) => {
              const tipoObj = tiposMateriais.find(t => t.id === mat.tipoMaterialId);
              const vaultObj = getVaultForMaterial(mat);
              const activeForMat = activeCautelasByMaterialId.get(mat.id) || [];
              const isAcautelado = activeForMat.length > 0 || Number(mat.quantidadeEmUso || 0) > 0;
              const borrowerHtml = activeForMat.length > 0
                ? activeForMat.map(c => {
                    const nome = c.tipoDestinatario === 'interno'
                      ? (c.usuarioInternoNome || 'Policial')
                      : (c.usuarioExternoNome || 'Externo');
                    const doc = c.tipoDestinatario === 'interno'
                      ? `MASP: ${formatMasp(c.usuarioInternoMasp || '') || 'N/I'}`
                      : `Doc: ${c.usuarioExternoDocumento || 'N/I'}`;
                    const cargo = c.tipoDestinatario === 'interno'
                      ? (c.usuarioInternoCargo || 'Policial Civil')
                      : (c.usuarioExternoOrgao || 'Órgão Externo');
                    const dataStr = c.dataRetirada ? new Date(c.dataRetirada).toLocaleDateString('pt-BR') : '-';
                    return `<div style="margin-bottom:3px;"><strong style="color:#b45309;">ACAUTELADO (${c.quantidade}x)</strong><br/>${escapeHtml(nome)} (${escapeHtml(doc)})<br/><span style="color:#475569;font-size:8px;">${escapeHtml(cargo)} • Prot: ${escapeHtml(c.protocolo || c.id)} • ${dataStr}</span></div>`;
                  }).join('')
                : (isAcautelado
                    ? `<strong style="color:#b45309;">ACAUTELADO (${mat.quantidadeEmUso} un. em uso)</strong>`
                    : '<span style="color:#047857;font-weight:700;">NO COFRE</span>');

              return `
                <tr>
                  <td class="mono" style="text-align:center;">${idx + 1}</td>
                  <td><strong>${escapeHtml(mat.nome)}</strong></td>
                  ${printFields.tipoCategoria ? `<td><strong>${escapeHtml(mat.tipoMaterialNome || tipoObj?.nome || '-')}</strong><br/><span style="color:#475569;font-size:8px;">${escapeHtml(tipoObj?.categoria || 'Geral')} (${tipoObj?.ehConsumivel ? 'Consumível' : 'Permanente'})</span></td>` : ''}
                  ${printFields.seriePatrimonio ? `<td class="mono">${escapeHtml(mat.numeroSerie || '-')}</td>` : ''}
                  ${printFields.cofreLocal ? `<td><strong class="mono">${escapeHtml(mat.localGuarda || vaultObj?.code || '-')}</strong>${vaultObj?.descricaoCurta ? `<br/><span style="color:#475569;font-size:8px;">${escapeHtml(vaultObj.descricaoCurta)}</span>` : ''}</td>` : ''}
                  ${printFields.deptUnidade ? `<td>${escapeHtml(mat.unidadeNome || mat.unidadeId)}<br/><span style="color:#475569;font-size:8px;">${escapeHtml(mat.departamentoNome || mat.departamentoId)}</span></td>` : ''}
                  ${printFields.estoqueDetalhado ? `<td class="mono"><strong>Tot: ${mat.quantidade}</strong><br/>D:${mat.quantidadeDisponivel} | U:${mat.quantidadeEmUso} | C:${mat.quantidadeConsumida}</td>` : ''}
                  ${printFields.situacaoAcautelado ? `<td>${borrowerHtml}</td>` : ''}
                  ${printFields.passivoDeposito ? `<td style="text-align:center;font-weight:700;">${mat.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}</td>` : ''}
                  ${printFields.validade ? `<td>${escapeHtml(getValidityText(mat.validade))}</td>` : ''}
                  ${printFields.auditoriaCadastro ? `<td style="font-size:8px;">${escapeHtml(mat.criadoPorNome || 'Sistema')}<br/><span class="mono">${mat.createdAt ? new Date(mat.createdAt).toLocaleDateString('pt-BR') : '-'}</span></td>` : ''}
                  ${printFields.observacoes ? `<td>${escapeHtml(mat.observacoes || '-')}</td>` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-line">
            ${escapeHtml(currentUser?.name || 'Responsável pela Armaria')}<br/>
            <span style="font-weight:normal; font-size:9px; color:#475569;">MASP: ${escapeHtml(currentUser?.masp || 'N/I')}</span>
          </div>
        </div>

        <div class="footer">
          Sistema de Armeria PCMG • Relatório gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Vault cards for Estoque de Materiais tab
  const filteredMaterialVaults = useMemo(() => {
    const search = (searchTerm || '').trim().toLowerCase();
    return materialVaults.filter(v => {
      if (selectedDeptFilter && v.departmentId !== selectedDeptFilter) return false;
      if (selectedUnitFilter && v.unitId !== selectedUnitFilter) return false;

      const itemsInVault = (materiaisList || []).filter(m => {
        if (m.vaultSpaceId) return m.vaultSpaceId === v.id;
        return m.localGuarda === v.code && (!m.unidadeId || m.unidadeId === v.unitId);
      });

      if (selectedTypeFilter && !itemsInVault.some(m => m.tipoMaterialId === selectedTypeFilter)) {
        return false;
      }

      if (!search) return true;
      const uName = (units.find(u => u.id === v.unitId)?.name || '').toLowerCase();
      const dName = (departments.find(d => d.id === v.departmentId)?.name || '').toLowerCase();
      const matchesVault =
        (v.code || '').toLowerCase().includes(search) ||
        (v.descricaoCurta || '').toLowerCase().includes(search) ||
        uName.includes(search) ||
        dName.includes(search);
      const matchesMaterial = itemsInVault.some(m =>
        (m.nome || '').toLowerCase().includes(search) ||
        (m.tipoMaterialNome || '').toLowerCase().includes(search) ||
        (m.numeroSerie || '').toLowerCase().includes(search)
      );
      return matchesVault || matchesMaterial;
    });
  }, [materialVaults, materiaisList, units, departments, selectedDeptFilter, selectedUnitFilter, selectedTypeFilter, searchTerm]);

  const legacyUnlinkedMaterials = useMemo(() => {
    const vaultIds = new Set(materialVaults.map(v => v.id));
    return (filteredMateriais || []).filter(m => {
      if (m.vaultSpaceId && vaultIds.has(m.vaultSpaceId)) return false;
      const matchedByCode = materialVaults.some(
        v => v.code === m.localGuarda && (!m.unidadeId || v.unitId === m.unidadeId)
      );
      return !matchedByCode;
    });
  }, [filteredMateriais, materialVaults]);

  // Filtered cautelas
  const filteredCautelas = useMemo(() => {
    const search = (searchTerm || '').trim().toLowerCase();
    return (cautelasList || []).filter(c => {
      if (!c) return false;
      if (selectedCautelaMaterialId && c.materialId !== selectedCautelaMaterialId) return false;
      if (selectedDeptFilter && c.departamentoId !== selectedDeptFilter) return false;
      if (selectedUnitFilter && c.unidadeId !== selectedUnitFilter) return false;

      const matchSearch = !search || (
        (c.materialNome || '').toLowerCase().includes(search) ||
        (c.protocolo && c.protocolo.toLowerCase().includes(search)) ||
        (c.usuarioInternoNome && c.usuarioInternoNome.toLowerCase().includes(search)) ||
        (c.usuarioExternoNome && c.usuarioExternoNome.toLowerCase().includes(search)) ||
        (c.usuarioInternoMasp && c.usuarioInternoMasp.includes(searchTerm))
      );

      const matchStatus =
        cautelaStatusFilter === 'todas'
          ? true
          : cautelaStatusFilter === 'em_uso'
          ? c.status === 'Em Uso' || c.status === 'AUTORIZADA'
          : cautelaStatusFilter === 'devolvidas'
          ? c.status === 'Devolvido' || c.status === 'DEVOLVIDA'
          : cautelaStatusFilter === 'consumidas'
          ? c.status === 'Consumido' || c.status === 'CONSUMIDA' || c.foiConsumido
          : cautelaStatusFilter === 'anomalias'
          ? c.status === 'Devolvido com Anomalia'
          : true;

      return matchSearch && matchStatus;
    });
  }, [cautelasList, searchTerm, cautelaStatusFilter, selectedCautelaMaterialId, selectedDeptFilter, selectedUnitFilter]);

  const filteredTransfers = useMemo(() => {
    const search = (searchTerm || '').trim().toLowerCase();
    return (transfersList || []).filter(t => {
      if (selectedCautelaMaterialId && t.materialId !== selectedCautelaMaterialId) return false;
      if (selectedDeptFilter && t.originDepartmentId !== selectedDeptFilter && t.destinationDepartmentId !== selectedDeptFilter) return false;
      if (selectedUnitFilter && t.originUnitId !== selectedUnitFilter && t.destinationUnitId !== selectedUnitFilter) return false;
      if (!search) return true;
      return (
        (t.nomeMaterial || '').toLowerCase().includes(search) ||
        (t.protocolNumber || '').toLowerCase().includes(search) ||
        (t.originUnitName || '').toLowerCase().includes(search) ||
        (t.destinationUnitName || '').toLowerCase().includes(search)
      );
    });
  }, [transfersList, selectedCautelaMaterialId, selectedDeptFilter, selectedUnitFilter, searchTerm]);

  const selectedTransferCandidateMaterial = useMemo(() => {
    if (!selectedCautelaMaterialId) return null;
    return materiaisList.find(m => m.id === selectedCautelaMaterialId) || null;
  }, [materiaisList, selectedCautelaMaterialId]);

  // Departments & Units for select dropdowns
  const availableUnitsForForm = useMemo(() => {
    if (!formDepartamentoId) return [];
    return units.filter(u => u.departmentId === formDepartamentoId);
  }, [units, formDepartamentoId]);

  // Reset / Open Material Modal
  const handleOpenNewMaterialModal = (presetVault?: VaultSpace) => {
    setEditingMaterial(null);
    setFormTipoMaterialId(tiposMateriais[0]?.id || '');
    setFormNome('');
    setFormQuantidade(1);

    let targetDept = '';
    let targetUnit = '';
    if (presetVault) {
      targetDept = presetVault.departmentId || userDeptId;
      targetUnit = presetVault.unitId || userUnitId;
    } else if (isGeral) {
      targetDept = departments[0]?.id || '';
      const firstUnit = units.find(u => u.departmentId === targetDept);
      targetUnit = firstUnit?.id || '';
    } else {
      targetDept = userDeptId;
      if (isOnlyUnitAccess) {
        targetUnit = userUnitId;
      } else {
        const firstDeptUnit = units.find(u => u.departmentId === userDeptId);
        targetUnit = firstDeptUnit?.id || userUnitId || '';
      }
    }

    setFormDepartamentoId(targetDept);
    setFormUnidadeId(targetUnit);

    const matchingVaults = materialVaults.filter(v => v.unitId === targetUnit);
    const chosenVault = presetVault || matchingVaults[0];
    setFormVaultSpaceId(chosenVault?.id || '');
    setFormLocalGuarda(chosenVault?.code || '');
    setFormPassivoDeposito('SIM');
    setFormValidade('');
    setFormNumeroSerie('');
    setFormObservacoes('');
    setShowMaterialModal(true);
  };

  const handleOpenEditMaterialModal = (material: Material) => {
    setEditingMaterial(material);
    setFormTipoMaterialId(material.tipoMaterialId);
    setFormNome(material.nome);
    setFormQuantidade(material.quantidade);
    setFormDepartamentoId(material.departamentoId);
    setFormUnidadeId(material.unidadeId);
    setFormValidade(material.validade || '');
    const matchedVault = getVaultForMaterial(material);
    setFormVaultSpaceId(material.vaultSpaceId || matchedVault?.id || '');
    setFormLocalGuarda(material.localGuarda || matchedVault?.code || '');
    setFormPassivoDeposito(material.passivoDepositoPoliciais === false ? 'NAO' : 'SIM');
    setFormNumeroSerie(material.numeroSerie || '');
    setFormObservacoes(material.observacoes || '');
    setShowMaterialModal(true);
  };

  // Submit Material
  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInsertMaterial) {
      setErrorMessage('Apenas Administradores, Armeiros e Usuários Gerais podem inserir materiais.');
      return;
    }

    if (!formNome.trim()) {
      setErrorMessage('Informe o nome do material.');
      return;
    }
    if (!formTipoMaterialId) {
      setErrorMessage('Selecione o tipo do material.');
      return;
    }
    const chosenVault = materialVaults.find(v => v.id === formVaultSpaceId);
    const effectiveLocalGuarda = chosenVault?.code || formLocalGuarda.trim();
    if (!formVaultSpaceId && !effectiveLocalGuarda) {
      setErrorMessage('Selecione um Cofre de Materiais cadastrado para guarda do material.');
      return;
    }
    if (!formDepartamentoId || !formUnidadeId) {
      setErrorMessage('Selecione o departamento e a unidade.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const tipoObj = tiposMateriais.find(t => t.id === formTipoMaterialId);
    const deptObj = departments.find(d => d.id === formDepartamentoId);
    const unitObj = units.find(u => u.id === formUnidadeId);

    const payload: Partial<Material> = {
      id: editingMaterial?.id,
      tipoMaterialId: formTipoMaterialId,
      tipoMaterialNome: tipoObj?.nome || 'Material',
      nome: formNome.trim(),
      quantidade: Number(formQuantidade || 1),
      departamentoId: formDepartamentoId,
      departamentoNome: deptObj?.name || '',
      unidadeId: formUnidadeId,
      unidadeNome: unitObj?.name || '',
      validade: formValidade ? formValidade : undefined,
      vaultSpaceId: chosenVault?.id || formVaultSpaceId || undefined,
      localGuarda: effectiveLocalGuarda,
      passivoDepositoPoliciais: formPassivoDeposito === 'SIM',
      numeroSerie: formNumeroSerie ? formNumeroSerie.trim() : undefined,
      observacoes: formObservacoes ? formObservacoes.trim() : undefined
    };

    const result = await storage.saveMaterial(payload);
    setIsSubmitting(false);

    if (result.success) {
      setShowMaterialModal(false);
      setSuccessMessage(editingMaterial ? 'Material atualizado com sucesso!' : 'Novo material cadastrado com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
      onRefresh();
      reloadMateriais();
    } else {
      setErrorMessage(result.error || 'Erro ao salvar material.');
    }
  };

  const handleDeleteMaterial = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o material "${name}"? Esta ação não poderá ser desfeita.`)) {
      return;
    }

    const res = await storage.deleteMaterial(id);
    if (res.success) {
      setSuccessMessage('Material excluído com sucesso.');
      setTimeout(() => setSuccessMessage(null), 3000);
      onRefresh();
      reloadMateriais();
    } else {
      setErrorMessage(res.error || 'Não foi possível excluir o material.');
    }
  };

  // Quick or Sub-tab Tipo Material Save
  const handleSaveTipoMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTipoNome.trim()) {
      setErrorMessage('Informe o nome do tipo de material.');
      return;
    }

    setIsSubmitting(true);
    const res = await storage.saveTipoMaterial({
      nome: newTipoNome.trim(),
      descricao: newTipoDescricao.trim() || undefined,
      categoria: newTipoCategoria,
      ehConsumivel: newTipoEhConsumivel
    });
    setIsSubmitting(false);

    if (res.success) {
      setNewTipoNome('');
      setNewTipoDescricao('');
      setNewTipoEhConsumivel(false);
      setShowTipoModal(false);
      setSuccessMessage('Tipo de material cadastrado com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3000);
      onRefresh();
      reloadMateriais();
    } else {
      setErrorMessage(res.error || 'Erro ao cadastrar tipo.');
    }
  };

  const handleDeleteTipoMaterial = async (id: string, nome: string) => {
    if (!confirm(`Deseja excluir o tipo "${nome}"?`)) return;
    const res = await storage.deleteTipoMaterial(id);
    if (res.success) {
      onRefresh();
    } else {
      setErrorMessage(res.error || 'Erro ao excluir tipo.');
    }
  };

  // Open Cautela Modal for a Material
  const handleOpenCautela = (mat: Material) => {
    setCautelaMaterialTarget(mat);
    setCautelaQtd(1);
    setCautelaDestinatarioTipo('interno');
    setCautelaUsuarioInternoId(allUsers[0]?.id || '');
    setCautelaUsuarioExternoNome('');
    setCautelaUsuarioExternoDoc('');
    setCautelaUsuarioExternoOrgao('');
    setCautelaUsuarioExternoTelefone('');
    setCautelaFinalidade('');
    setCautelaDataPrevistaDevolucao('');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setCautelaDataRetirada(now.toISOString().slice(0, 16));
    setShowCautelaModal(true);
  };

  // Open Transfer Modal for a Material (allows same department / other unit OR another department)
  const handleOpenTransfer = (mat: Material) => {
    setTransferMaterialTarget(mat);
    setTransferQtd(1);
    const originUnitId = mat.unidadeId || currentUser?.unitId || '';
    const otherUnitSameDept = allUnitsList.find(
      u => u.departmentId === mat.departamentoId && u.id !== originUnitId
    );
    const fallbackDept =
      allDepartmentsList.find(d => allUnitsList.some(u => u.departmentId === d.id && u.id !== originUnitId)) ||
      allDepartmentsList.find(d => d.id !== mat.departamentoId) ||
      allDepartmentsList[0];
    const defaultDeptId = otherUnitSameDept
      ? (mat.departamentoId || fallbackDept?.id || '')
      : (fallbackDept?.id || mat.departamentoId || '');
    const defaultUnitId = otherUnitSameDept
      ? otherUnitSameDept.id
      : (allUnitsList.find(u => u.departmentId === defaultDeptId && u.id !== originUnitId)?.id || '');
    setTransferDestDeptId(defaultDeptId);
    setTransferDestUnitId(defaultUnitId);
    setTransferDestArmorerId('');
    setTransferTransporterId('');
    setTransferReason('Abastecimento e suprimento de carga');
    setTransferObs('');
    setShowTransferModal(true);
  };

  const handleConfirmReceiveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTransferTarget) return;
    if (!receiveVaultId) {
      setErrorMessage('Selecione o Cofre de Materiais de destino para receber o item.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await storage.receiveMaterialTransfer(receiveTransferTarget.id, receiveVaultId, receiveObs);
      setReceiveTransferTarget(null);
      setReceiveObs('');
      setSuccessMessage('Transferência recebida e incorporada ao Cofre de Materiais com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
      onRefresh();
      reloadMateriais();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao receber transferência.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Material Transfer
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMaterialTarget) return;

    if (transferQtd <= 0 || transferQtd > transferMaterialTarget.quantidadeDisponivel) {
      setErrorMessage(`Quantidade inválida! Disponível: ${transferMaterialTarget.quantidadeDisponivel}.`);
      return;
    }
    if (!transferDestDeptId || !transferDestUnitId) {
      setErrorMessage('Selecione o departamento e a unidade de destino.');
      return;
    }
    if (transferDestUnitId === transferMaterialTarget.unidadeId) {
      setErrorMessage('Selecione uma unidade de destino diferente da unidade de origem.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const destDept = allDepartmentsList.find(d => d.id === transferDestDeptId);
      const destUnit = allUnitsList.find(u => u.id === transferDestUnitId);
      const originDept = allDepartmentsList.find(d => d.id === transferMaterialTarget.departamentoId);
      const originUnit = allUnitsList.find(u => u.id === transferMaterialTarget.unidadeId);
      const destArmorer = allUsersLookupList.find(u => u.id === transferDestArmorerId);
      const transp = allUsersLookupList.find(u => u.id === transferTransporterId) || destArmorer || currentUser;

      await storage.transferMaterial({
        originDepartmentId: transferMaterialTarget.departamentoId || currentUser?.departmentId,
        originDepartmentName: originDept?.name || transferMaterialTarget.departamentoNome || currentUser?.departmentName,
        originUnitId: transferMaterialTarget.unidadeId || currentUser?.unitId,
        originUnitName: originUnit?.name || transferMaterialTarget.unidadeNome || currentUser?.unitName,
        destinationDepartmentId: transferDestDeptId,
        destinationDepartmentName: destDept?.name || 'Departamento Destino',
        destinationUnitId: transferDestUnitId,
        destinationUnitName: destUnit?.name || 'Unidade Destino',
        destinationArmorerId: destArmorer?.id,
        destinationArmorerName: destArmorer?.name,
        destinationArmorerMasp: destArmorer?.masp,
        receiverOrTransporterName: transp?.name || 'Armeiro Destinatário',
        receiverOrTransporterMasp: transp?.masp || 'N/A',
        receiverOrTransporterCargo: transp?.cargo || transp?.role,
        reason: transferReason,
        materialId: transferMaterialTarget.id,
        quantidade: transferQtd,
        observation: transferObs
      });

      setShowTransferModal(false);
      setSuccessMessage(`Transferência de ${transferQtd}x "${transferMaterialTarget.nome}" para a unidade ${destUnit?.name} despachada com sucesso. Aguarda recibo do armeiro de destino.`);
      onRefresh();
      reloadMateriais();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao realizar transferência de material.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Cautela
  const handleSaveCautela = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cautelaMaterialTarget) return;

    if (cautelaQtd <= 0) {
      setErrorMessage('A quantidade deve ser de pelo menos 1.');
      return;
    }
    if (cautelaQtd > cautelaMaterialTarget.quantidadeDisponivel) {
      setErrorMessage(`Estoque insuficiente! Disponível: ${cautelaMaterialTarget.quantidadeDisponivel}.`);
      return;
    }

    if (cautelaDestinatarioTipo === 'interno' && !cautelaUsuarioInternoId) {
      setErrorMessage('Selecione o policial/servidor interno.');
      return;
    }

    if (cautelaDestinatarioTipo === 'externo' && !cautelaUsuarioExternoNome.trim()) {
      setErrorMessage('Informe o nome do destinatário externo.');
      return;
    }

    if (!cautelaFinalidade.trim()) {
      setErrorMessage('Informe a finalidade / motivo da cautela.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const internalUser = allUsers.find(u => u.id === cautelaUsuarioInternoId);

    const payload: Partial<CautelaMaterial> = {
      materialId: cautelaMaterialTarget.id,
      materialNome: cautelaMaterialTarget.nome,
      tipoMaterialNome: cautelaMaterialTarget.tipoMaterialNome,
      quantidade: cautelaQtd,
      tipoDestinatario: cautelaDestinatarioTipo,
      usuarioInternoId: cautelaDestinatarioTipo === 'interno' ? internalUser?.id : undefined,
      usuarioInternoNome: cautelaDestinatarioTipo === 'interno' ? internalUser?.name : undefined,
      usuarioInternoMasp: cautelaDestinatarioTipo === 'interno' ? internalUser?.masp : undefined,
      usuarioInternoCargo: cautelaDestinatarioTipo === 'interno' ? internalUser?.role : undefined,
      usuarioExternoNome: cautelaDestinatarioTipo === 'externo' ? cautelaUsuarioExternoNome.trim() : undefined,
      usuarioExternoDocumento: cautelaDestinatarioTipo === 'externo' ? cautelaUsuarioExternoDoc.trim() : undefined,
      usuarioExternoOrgao: cautelaDestinatarioTipo === 'externo' ? cautelaUsuarioExternoOrgao.trim() : undefined,
      usuarioExternoTelefone: cautelaDestinatarioTipo === 'externo' ? cautelaUsuarioExternoTelefone.trim() : undefined,
      dataRetirada: new Date(cautelaDataRetirada).toISOString(),
      dataPrevistaDevolucao: cautelaDataPrevistaDevolucao ? cautelaDataPrevistaDevolucao : undefined,
      finalidade: cautelaFinalidade.trim(),
      departamentoId: cautelaMaterialTarget.departamentoId,
      unidadeId: cautelaMaterialTarget.unidadeId
    };

    const res = await storage.saveCautelaMaterial(payload);
    setIsSubmitting(false);

    if (res.success) {
      setShowCautelaModal(false);
      setSuccessMessage('Cautela de material realizada com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
      onRefresh();
      reloadMateriais();
    } else {
      setErrorMessage(res.error || 'Erro ao registrar cautela.');
    }
  };

  // Open Devolucao/Baixa Modal
  const handleOpenDevolucaoModal = (cautela: CautelaMaterial) => {
    setSelectedCautelaForReturn(cautela);
    setReturnStatus('Devolvido');
    setReturnFoiConsumido(false);
    setReturnRelato('');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setReturnData(now.toISOString().slice(0, 16));
    setShowDevolucaoModal(true);
  };

  // Submit Devolucao / Baixa
  const handleSaveDevolucao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCautelaForReturn) return;

    if (returnFoiConsumido && !returnRelato.trim()) {
      setErrorMessage('Por favor, descreva no campo de relato o motivo/circunstâncias do consumo do material.');
      return;
    }

    if (returnStatus === 'Devolvido com Anomalia' && !returnRelato.trim()) {
      setErrorMessage('Por favor, relate as anomalias ou avarias identificadas no material.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const effectiveStatus = returnFoiConsumido ? 'Consumido' : returnStatus;

    const res = await storage.returnCautelaMaterial(selectedCautelaForReturn.id, {
      status: effectiveStatus,
      foiConsumido: returnFoiConsumido,
      relatoUsoAnomalias: returnRelato.trim() || undefined,
      dataDevolucao: new Date(returnData).toISOString()
    });

    setIsSubmitting(false);

    if (res.success) {
      setShowDevolucaoModal(false);
      const msg = returnFoiConsumido
        ? 'Baixa por consumo registrada com sucesso (material não retornará ao estoque).'
        : 'Devolução registrada com sucesso!';
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
      onRefresh();
      reloadMateriais();
    } else {
      setErrorMessage(res.error || 'Erro ao registrar devolução.');
    }
  };

  // Calculate validity status
  const getValidityBadge = (validadeStr?: string) => {
    if (!validadeStr) {
      return (
        <span className="text-slate-400 text-xs flex items-center space-x-1">
          <span>Não perecível</span>
        </span>
      );
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validDate = new Date(validadeStr);

    const diffDays = Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center space-x-1">
          <AlertCircle className="w-3 h-3" />
          <span>Vencido em {new Date(validadeStr).toLocaleDateString('pt-BR')}</span>
        </span>
      );
    }

    if (diffDays <= 90) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
          <AlertTriangle className="w-3 h-3" />
          <span>Vence em {diffDays} dias ({new Date(validadeStr).toLocaleDateString('pt-BR')})</span>
        </span>
      );
    }

    return (
      <span className="text-slate-300 text-xs font-mono">
        Validade: {new Date(validadeStr).toLocaleDateString('pt-BR')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-100 flex items-center space-x-2">
              <span>Gestão de Materiais e Equipamentos</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                Armaria
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Controle de coletes balísticos, algemas, espargidores, rádios, drones, kits de socorro e equipamentos táticos.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canInsertMaterial && (
            <>
              <button
                onClick={() => handleOpenNewMaterialModal()}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-amber-500/10"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Material</span>
              </button>

              <button
                onClick={() => setShowTipoModal(true)}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs sm:text-sm rounded-xl border border-slate-700 flex items-center space-x-1.5 transition"
                title="Cadastrar Tipo de Material"
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Tipos</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center space-x-3 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl flex items-center justify-between text-sm animate-fade-in">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center space-x-3.5">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block">Itens no Estoque</span>
            <p className="text-xl font-black text-slate-100 font-mono">
              {materiais.reduce((acc, m) => acc + m.quantidade, 0)} <span className="text-xs font-normal text-slate-400">un</span>
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center space-x-3.5">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block">Disponíveis</span>
            <p className="text-xl font-black text-emerald-400 font-mono">
              {materiais.reduce((acc, m) => acc + m.quantidadeDisponivel, 0)} <span className="text-xs font-normal text-slate-400">un</span>
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center space-x-3.5">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block">Acautelados (Em Uso)</span>
            <p className="text-xl font-black text-amber-400 font-mono">
              {materiais.reduce((acc, m) => acc + m.quantidadeEmUso, 0)} <span className="text-xs font-normal text-slate-400">un</span>
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center space-x-3.5">
          <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block">Baixa por Consumo</span>
            <p className="text-xl font-black text-purple-400 font-mono">
              {materiais.reduce((acc, m) => acc + m.quantidadeConsumida, 0)} <span className="text-xs font-normal text-slate-400">un</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-800 gap-1">
        <button
          onClick={() => setActiveTab('estoque')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'estoque'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Estoque de Materiais ({materiais.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('todos')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'todos'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <List className="w-4 h-4" />
          <span>Todos os Materiais ({materiais.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cautelas')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'cautelas'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Cautelas e Movimentações ({cautelas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tipos')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'tipos'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Tipos de Materiais ({tiposMateriais.length})</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'estoque' || activeTab === 'todos'
                  ? "Buscar material por nome, número de série, tipo, unidade ou cofre..."
                  : activeTab === 'cautelas'
                  ? "Buscar cautela por protocolo, material, policial ou destinatário externo..."
                  : "Buscar tipos de material..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {(activeTab === 'estoque' || activeTab === 'todos') && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos os Tipos</option>
                {tiposMateriais.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>

              {isGeral && (
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => {
                    setSelectedDeptFilter(e.target.value);
                    setSelectedUnitFilter('');
                    setSelectedVaultFilter('');
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Deptos</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}

              {(isGeral || !isOnlyUnitAccess) && (
                <select
                  value={selectedUnitFilter}
                  onChange={(e) => {
                    setSelectedUnitFilter(e.target.value);
                    setSelectedVaultFilter('');
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todas as Unidades</option>
                  {(selectedDeptFilter ? units.filter(u => u.departmentId === selectedDeptFilter) : units).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {activeTab === 'todos' && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedVaultFilter}
                onChange={(e) => setSelectedVaultFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos os Cofres de Materiais</option>
                {materialVaults
                  .filter(v => (!selectedDeptFilter || v.departmentId === selectedDeptFilter) && (!selectedUnitFilter || v.unitId === selectedUnitFilter))
                  .map(v => (
                    <option key={v.id} value={v.id}>
                      {v.code}{v.descricaoCurta ? ` — ${v.descricaoCurta}` : ''}
                    </option>
                  ))}
                {legacyUnlinkedMaterials.length > 0 && (
                  <option value="__LEGACY__">Sem Cofre Vinculado (Legado)</option>
                )}
              </select>

              <select
                value={selectedDepositFilter}
                onChange={(e) => setSelectedDepositFilter(e.target.value as 'all' | 'SIM' | 'NAO')}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">Cautelável p/ Policiais: Todos</option>
                <option value="SIM">Passivo de Depósito: SIM</option>
                <option value="NAO">Passivo de Depósito: NÃO</option>
              </select>

              <select
                value={selectedStockStatusFilter}
                onChange={(e) => setSelectedStockStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">Todas as Situações de Estoque</option>
                <option value="disponivel">Com Saldo Disponível</option>
                <option value="em_uso">Com Itens Acautelados (Em Uso)</option>
                <option value="consumido">Com Baixa por Consumo</option>
                <option value="vencendo">Validade Próxima (90 dias)</option>
                <option value="vencido">Com Validade Vencida</option>
              </select>

              {(searchTerm || selectedTypeFilter || selectedDeptFilter || selectedUnitFilter || selectedVaultFilter || selectedDepositFilter !== 'all' || selectedStockStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedTypeFilter('');
                    setSelectedDeptFilter('');
                    setSelectedUnitFilter('');
                    setSelectedVaultFilter('');
                    setSelectedDepositFilter('all');
                    setSelectedStockStatusFilter('all');
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPrintConfigPanel(prev => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 transition ${
                  showPrintConfigPanel
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Campos do Relatório</span>
              </button>

              <button
                type="button"
                onClick={handlePrintFilteredMaterialsReport}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition shadow"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {selectedPrintIds.length > 0
                    ? `Imprimir Selecionados (${filteredAllMateriais.filter(m => selectedPrintIds.includes(m.id)).length})`
                    : `Imprimir Relatório (${filteredAllMateriais.length})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'cautelas' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cautelaStatusFilter}
              onChange={(e) => setCautelaStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="todas">Todos os Status</option>
              <option value="em_uso">Em Uso / Autorizadas</option>
              <option value="devolvidas">Devolvidas</option>
              <option value="consumidas">Consumidas em Serviço</option>
              <option value="anomalias">Com Anomalias</option>
            </select>

            {isGeral && (
              <select
                value={selectedDeptFilter}
                onChange={(e) => {
                  setSelectedDeptFilter(e.target.value);
                  setSelectedUnitFilter('');
                }}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos os Deptos</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}

            {(isGeral || !isOnlyUnitAccess) && (
              <select
                value={selectedUnitFilter}
                onChange={(e) => setSelectedUnitFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todas as Unidades</option>
                {(selectedDeptFilter ? units.filter(u => u.departmentId === selectedDeptFilter) : units).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: ESTOQUE DE MATERIAIS (COFRES DE MATERIAIS NO FORMATO DE CARDS DE TIPOS DE MATERIAIS) */}
      {activeTab === 'estoque' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Cofres destinados à guarda de materiais operacionais. Clique em <strong className="text-slate-200">Ver Detalhes do Cofre</strong> para listar todos os itens armazenados.
            </p>
            <span className="text-xs font-mono text-amber-400 font-bold">
              {filteredMaterialVaults.length} Cofre(s) • {filteredMateriais.length} Item(ns)
            </span>
          </div>

          {filteredMaterialVaults.length === 0 && legacyUnlinkedMaterials.length === 0 ? (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center text-slate-400 space-y-3">
              <Vault className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-semibold">Nenhum Cofre de Materiais encontrado.</p>
              <p className="text-xs text-slate-500">
                Cadastre um cofre específico no módulo <strong className="text-slate-300">Locais do Cofre (+ Novo Cofre de Materiais)</strong> para organizar e armazenar materiais.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterialVaults.map((vault) => {
                const itemsInVault = filteredMateriais.filter(m =>
                  m.vaultSpaceId
                    ? m.vaultSpaceId === vault.id
                    : (m.localGuarda === vault.code && (!m.unidadeId || m.unidadeId === vault.unitId))
                );
                const totalUnitsInVault = itemsInVault.reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
                const availUnitsInVault = itemsInVault.reduce((acc, m) => acc + Number(m.quantidadeDisponivel || 0), 0);
                const vaultUnit = units.find(u => u.id === vault.unitId);
                const vaultDept = departments.find(d => d.id === vault.departmentId);

                return (
                  <div
                    key={vault.id}
                    className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between hover:border-amber-500/40 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-amber-400 rounded border border-slate-700 truncate">
                          {vaultUnit?.name || vaultDept?.name || 'Unidade'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30 flex items-center space-x-1 shrink-0">
                          <Vault className="w-3 h-3" />
                          <span>Cofre de Materiais</span>
                        </span>
                      </div>

                      <h3 className="font-black font-mono text-lg text-slate-100 mt-2.5 tracking-wider">
                        {vault.code}
                      </h3>

                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {vault.descricaoCurta || 'Sem descrição curta informada'}
                      </p>

                      <div className="mt-3 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Quantidade dentro do cofre:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {totalUnitsInVault} un ({itemsInVault.length} {itemsInVault.length === 1 ? 'item' : 'itens'})
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        Disp.: <strong className="text-slate-200">{availUnitsInVault}</strong> un
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePrintMaterialVault(vault, false)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
                          title="Imprimir cofre com todas as informações dos materiais armazenados"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                          <span>Imprimir Cofre</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedVaultDetailsId(vault.id)}
                          className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Detalhes</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {legacyUnlinkedMaterials.length > 0 && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-amber-800/50 flex flex-col justify-between hover:border-amber-500/50 transition">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-amber-400 rounded border border-slate-700">
                        Registros Anteriores
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/15 text-amber-300 rounded border border-amber-500/30">
                        Sem Cofre Vinculado
                      </span>
                    </div>
                    <h3 className="font-black font-mono text-lg text-slate-100 mt-2.5">
                      OUTROS LOCAIS
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Materiais cadastrados antes da vinculação obrigatória a um Cofre de Materiais.
                    </p>
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Quantidade:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {legacyUnlinkedMaterials.reduce((acc, m) => acc + Number(m.quantidade || 0), 0)} un ({legacyUnlinkedMaterials.length} itens)
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePrintMaterialVault(null, true)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Imprimir Cofre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedVaultDetailsId('__LEGACY__')}
                      className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Detalhes</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: TODOS OS MATERIAIS (DETALHAMENTO COMPLETO + RELATÓRIO FILTRÁVEL) */}
      {activeTab === 'todos' && (
        <div className="space-y-4">
          {showPrintConfigPanel && (
            <div className="bg-slate-900/80 border border-sky-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-sky-300 uppercase tracking-wider">
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Personalizar Informações que Devem Ser Impressas no Relatório</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setPrintFields({
                        tipoCategoria: true,
                        seriePatrimonio: true,
                        cofreLocal: true,
                        deptUnidade: true,
                        estoqueDetalhado: true,
                        situacaoAcautelado: true,
                        passivoDeposito: true,
                        validade: true,
                        auditoriaCadastro: true,
                        observacoes: true
                      })
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
                  >
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPrintFields({
                        tipoCategoria: true,
                        seriePatrimonio: true,
                        cofreLocal: true,
                        deptUnidade: false,
                        estoqueDetalhado: true,
                        situacaoAcautelado: true,
                        passivoDeposito: false,
                        validade: false,
                        auditoriaCadastro: false,
                        observacoes: false
                      })
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                  >
                    Somente Essenciais
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
                {[
                  { key: 'tipoCategoria', label: 'Tipo / Categoria' },
                  { key: 'seriePatrimonio', label: 'Nº Série / Patrimônio' },
                  { key: 'cofreLocal', label: 'Cofre / Local de Guarda' },
                  { key: 'deptUnidade', label: 'Depto e Unidade' },
                  { key: 'estoqueDetalhado', label: 'Estoque Detalhado' },
                  { key: 'situacaoAcautelado', label: 'Acautelado / Policial' },
                  { key: 'passivoDeposito', label: 'Passivo de Depósito' },
                  { key: 'validade', label: 'Validade' },
                  { key: 'auditoriaCadastro', label: 'Cadastro / Data' },
                  { key: 'observacoes', label: 'Observações' }
                ].map((opt) => {
                  const checked = printFields[opt.key as keyof typeof printFields];
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center space-x-2 p-2 rounded-xl border cursor-pointer transition ${
                        checked
                          ? 'bg-sky-500/10 border-sky-500/40 text-slate-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setPrintFields(prev => ({
                            ...prev,
                            [opt.key]: e.target.checked
                          }))
                        }
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>
                Exibindo <strong className="text-slate-100 font-mono">{filteredAllMateriais.length}</strong> registro(s) em detalhes
              </span>
              {filteredAllMateriais.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const visibleIds = filteredAllMateriais.map(m => m.id);
                    const allSelected = visibleIds.every(id => selectedPrintIds.includes(id));
                    if (allSelected) {
                      setSelectedPrintIds(prev => prev.filter(id => !visibleIds.includes(id)));
                    } else {
                      setSelectedPrintIds(Array.from(new Set([...selectedPrintIds, ...visibleIds])));
                    }
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition"
                >
                  {filteredAllMateriais.every(m => selectedPrintIds.includes(m.id)) ? (
                    <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {filteredAllMateriais.every(m => selectedPrintIds.includes(m.id))
                      ? 'Desmarcar Visíveis'
                      : 'Selecionar Visíveis p/ Impressão'}
                  </span>
                </button>
              )}
              {selectedPrintIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPrintIds([])}
                  className="px-2 py-1 text-[11px] text-amber-400 hover:underline"
                >
                  Limpar seleção ({selectedPrintIds.length})
                </button>
              )}
            </div>

            <div className="text-xs font-mono text-amber-400 font-bold">
              Total: {filteredAllMateriais.reduce((acc, m) => acc + Number(m.quantidade || 0), 0)} un •
              Disp.: {filteredAllMateriais.reduce((acc, m) => acc + Number(m.quantidadeDisponivel || 0), 0)} un
            </div>
          </div>

          {filteredAllMateriais.length === 0 ? (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center text-slate-400 space-y-3">
              <Package className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-semibold">Nenhum material encontrado com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAllMateriais.map((mat) => {
                const tipoObj = tiposMateriais.find(t => t.id === mat.tipoMaterialId);
                const vaultObj = getVaultForMaterial(mat);
                const isSelectedForPrint = selectedPrintIds.includes(mat.id);
                const activeCautelas = activeCautelasByMaterialId.get(mat.id) || [];
                const isAcautelado = activeCautelas.length > 0 || Number(mat.quantidadeEmUso || 0) > 0;

                return (
                  <div
                    key={mat.id}
                    className={`bg-slate-900/70 rounded-2xl border p-4 transition ${
                      isSelectedForPrint
                        ? 'border-amber-500/60 bg-amber-500/5'
                        : isAcautelado
                        ? 'border-orange-500/40 hover:border-orange-400/60'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelectedForPrint}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPrintIds(prev => [...prev, mat.id]);
                            } else {
                              setSelectedPrintIds(prev => prev.filter(id => id !== mat.id));
                            }
                          }}
                          title="Selecionar este material para o relatório impresso"
                          className="w-4 h-4 mt-1 rounded text-amber-500 bg-slate-950 border-slate-700 cursor-pointer shrink-0"
                        />

                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-slate-100">{mat.nome}</h3>
                            {isAcautelado ? (
                              <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/50 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>ACAUTELADO ({mat.quantidadeEmUso || activeCautelas.reduce((acc, c) => acc + Number(c.quantidade || 0), 0)} un.)</span>
                              </span>
                            ) : Number(mat.quantidadeDisponivel || 0) > 0 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                NO COFRE ({mat.quantidadeDisponivel} disp.)
                              </span>
                            ) : null}
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {mat.tipoMaterialNome || tipoObj?.nome || 'Material'}
                            </span>
                            {tipoObj?.categoria && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {tipoObj.categoria}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              tipoObj?.ehConsumivel
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            }`}>
                              {tipoObj?.ehConsumivel ? 'Consumível' : 'Permanente / Durável'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              mat.passivoDepositoPoliciais !== false
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              Cautelável p/ Policiais: {mat.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-xs text-slate-300 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Nº Série / Patrimônio</span>
                              <span className="font-mono text-slate-100 font-semibold">{mat.numeroSerie || 'Não informado'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Cofre / Local de Guarda</span>
                              <span className="font-mono text-emerald-300 font-bold">
                                {mat.localGuarda || vaultObj?.code || 'N/I'}
                                {vaultObj?.descricaoCurta ? ` — ${vaultObj.descricaoCurta}` : ''}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Unidade / Departamento</span>
                              <span className="text-slate-200 font-medium">
                                {mat.unidadeNome || mat.unidadeId} • {mat.departamentoNome || mat.departamentoId}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Validade</span>
                              <div className="mt-0.5">{getValidityBadge(mat.validade)}</div>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Estoque Total</span>
                              <span className="font-mono font-bold text-slate-100">{mat.quantidade} un</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Disponível / Em Uso / Cons.</span>
                              <span className="font-mono text-xs">
                                <strong className="text-emerald-400">{mat.quantidadeDisponivel}</strong> disp. |{' '}
                                <strong className="text-amber-400">{mat.quantidadeEmUso}</strong> uso |{' '}
                                <strong className="text-purple-400">{mat.quantidadeConsumida}</strong> cons.
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Cadastrado por</span>
                              <span className="text-slate-200">{mat.criadoPorNome || 'Sistema'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase">Cadastro / Atualização</span>
                              <span className="font-mono text-slate-300">
                                {mat.createdAt ? new Date(mat.createdAt).toLocaleDateString('pt-BR') : '-'}
                                {mat.updatedAt ? ` (Atu: ${new Date(mat.updatedAt).toLocaleDateString('pt-BR')})` : ''}
                              </span>
                            </div>
                          </div>

                          {isAcautelado && (
                            <div className="bg-orange-950/25 border border-orange-500/40 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Material Acautelado — Dados do(s) Policial(is)</span>
                                </span>
                              </div>
                              {activeCautelas.length > 0 ? (
                                <div className="space-y-1.5">
                                  {activeCautelas.map(c => (
                                    <div
                                      key={c.id}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/70 border border-orange-500/20 rounded-lg px-3 py-2 text-xs"
                                    >
                                      <div className="space-y-0.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <strong className="text-slate-100">
                                            {c.tipoDestinatario === 'interno'
                                              ? (c.usuarioInternoNome || 'Policial')
                                              : (c.usuarioExternoNome || 'Destinatário Externo')}
                                          </strong>
                                          <span className="text-[11px] font-mono text-amber-300">
                                            {c.tipoDestinatario === 'interno'
                                              ? `MASP: ${formatMasp(c.usuarioInternoMasp || '') || 'N/I'}`
                                              : `Doc: ${c.usuarioExternoDocumento || 'N/I'}`}
                                          </span>
                                          <span className="text-[11px] text-slate-400">
                                            • {c.tipoDestinatario === 'interno'
                                              ? (c.usuarioInternoCargo || 'Policial Civil')
                                              : (c.usuarioExternoOrgao || 'Órgão Externo')}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                                          <span>Qtd: <strong className="text-orange-300">{c.quantidade} un.</strong></span>
                                          {c.protocolo && (
                                            <span className="font-mono">Prot.: <strong className="text-slate-300">{c.protocolo}</strong></span>
                                          )}
                                          <span>Retirada: <strong className="text-slate-300">{new Date(c.dataRetirada).toLocaleString('pt-BR')}</strong></span>
                                          <span>Finalidade: <strong className="text-slate-300">{c.finalidade}</strong></span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => setReceiptCautela(c)}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-bold flex items-center gap-1 shrink-0 self-start sm:self-center transition"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>Recibo</span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-orange-200/80">
                                  Consta(m) <strong className="font-mono">{mat.quantidadeEmUso} un.</strong> acautelada(s) fora do cofre.
                                </p>
                              )}
                            </div>
                          )}

                          {mat.observacoes && (
                            <p className="text-xs text-slate-400 italic">
                              <strong className="not-italic text-slate-500">Observações:</strong> {mat.observacoes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenCautela(mat)}
                          disabled={mat.quantidadeDisponivel <= 0}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                            mat.quantidadeDisponivel > 0
                              ? 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                          }`}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Cautelar</span>
                        </button>

                        {canInsertMaterial && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenTransfer(mat)}
                              disabled={mat.quantidadeDisponivel <= 0}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                                mat.quantidadeDisponivel > 0
                                  ? 'bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/30'
                                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                              }`}
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span>Transferir</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditMaterialModal(mat)}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                              title="Editar Material"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteMaterial(mat.id, mat.nome)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                              title="Excluir Material"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* TAB 2: CAUTELAS E MOVIMENTAÇÕES */}
      {activeTab === 'cautelas' && (
        <div className="space-y-5">
          {/* Painel de Filtro de Material Específico + Transferência entre Unidades / Departamentos */}
          {canInsertMaterial && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filtrar Material Específico e Transferir entre Unidades / Departamentos</span>
                  </label>
                  <select
                    value={selectedCautelaMaterialId}
                    onChange={(e) => setSelectedCautelaMaterialId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Todos os materiais (selecione um material específico para transferir)...</option>
                    {materiaisList
                      .filter(m => (!selectedDeptFilter || m.departamentoId === selectedDeptFilter) && (!selectedUnitFilter || m.unidadeId === selectedUnitFilter))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.nome} {m.numeroSerie ? `(S/N: ${m.numeroSerie})` : ''} — {m.unidadeNome || m.unidadeId} • Cofre: {m.localGuarda} ({m.quantidadeDisponivel} disp.)
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedCautelaMaterialId && (
                    <button
                      type="button"
                      onClick={() => setSelectedCautelaMaterialId('')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                    >
                      Limpar Filtro
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!selectedTransferCandidateMaterial || selectedTransferCandidateMaterial.quantidadeDisponivel <= 0}
                    onClick={() => {
                      if (selectedTransferCandidateMaterial) {
                        handleOpenTransfer(selectedTransferCandidateMaterial);
                      }
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl flex items-center space-x-2 transition shadow"
                  >
                    <Send className="w-4 h-4" />
                    <span>Transferir para Outro Depto / Unidade</span>
                  </button>
                </div>
              </div>

              {selectedTransferCandidateMaterial && (
                <div className="p-3 bg-slate-950/70 border border-sky-500/30 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-slate-100">{selectedTransferCandidateMaterial.nome}</span>
                    <span className="text-slate-400">Tipo: <strong className="text-slate-200">{selectedTransferCandidateMaterial.tipoMaterialNome}</strong></span>
                    <span className="text-slate-400">Cofre: <strong className="font-mono text-emerald-300">{selectedTransferCandidateMaterial.localGuarda}</strong></span>
                    <span className="text-slate-400">Unidade: <strong className="text-slate-200">{selectedTransferCandidateMaterial.unidadeNome || selectedTransferCandidateMaterial.unidadeId}</strong></span>
                  </div>
                  <div className="font-mono text-[11px]">
                    Disp.: <strong className={selectedTransferCandidateMaterial.quantidadeDisponivel > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {selectedTransferCandidateMaterial.quantidadeDisponivel} un
                    </strong>{' '}
                    / Total: <strong className="text-slate-200">{selectedTransferCandidateMaterial.quantidade} un</strong>
                    {selectedTransferCandidateMaterial.quantidadeDisponivel <= 0 && (
                      <span className="ml-2 text-rose-400">(Sem saldo disponível para transferência)</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transferências entre Departamentos / Unidades */}
          {filteredTransfers.length > 0 && (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>Transferências de Materiais entre Departamentos / Unidades ({filteredTransfers.length})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950/50 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                    <tr>
                      <th className="p-3">Protocolo / Material</th>
                      <th className="p-3">Origem</th>
                      <th className="p-3">Destino</th>
                      <th className="p-3 text-center">Qtd</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {filteredTransfers.map((trf) => {
                      const canReceiveTrf =
                        trf.status === 'Pendente' &&
                        canInsertMaterial &&
                        (isGeral ||
                          (isDeptArmeiro && trf.destinationDepartmentId === userDeptId) ||
                          trf.destinationUnitId === userUnitId);
                      return (
                        <tr key={trf.id} className="hover:bg-slate-800/40">
                          <td className="p-3">
                            <div className="font-bold text-slate-100">{trf.nomeMaterial}</div>
                            <div className="text-[10px] font-mono text-sky-400">{trf.protocolNumber || trf.id}</div>
                            <div className="text-[10px] text-slate-400">{trf.reason}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-200">{trf.originUnitName || trf.originUnitId}</div>
                            <div className="text-[10px] text-slate-500">{trf.originDepartmentName}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-200">{trf.destinationUnitName || trf.destinationUnitId}</div>
                            <div className="text-[10px] text-slate-500">{trf.destinationDepartmentName}</div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">{trf.quantidade} un</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              trf.status === 'Pendente'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            }`}>
                              {trf.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {canReceiveTrf && (
                              <button
                                type="button"
                                onClick={() => {
                                  const destVaults = materialVaults.filter(v => v.unitId === trf.destinationUnitId);
                                  setReceiveVaultId(destVaults[0]?.id || '');
                                  setReceiveObs('');
                                  setReceiveTransferTarget(trf);
                                }}
                                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold text-xs rounded-lg border border-emerald-500/30 transition"
                              >
                                Receber no Cofre
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lista de Cautelas */}
          <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
            {filteredCautelas.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <ArrowRightLeft className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-base font-semibold">Nenhuma cautela de material encontrada.</p>
                <p className="text-xs text-slate-500">
                  Abra os detalhes de um Cofre de Materiais na aba de Estoque ou utilize o módulo <strong className="text-slate-300">Cautela de Materiais</strong>.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold font-mono">
                    <tr>
                      <th className="p-3.5">Protocolo & Material</th>
                      <th className="p-3.5">Destinatário</th>
                      <th className="p-3.5 text-center">Quantidade</th>
                      <th className="p-3.5">Retirada & Previsão</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Finalidade</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {filteredCautelas.map((caut) => {
                      const isEmUso = caut.status === 'Em Uso' || caut.status === 'AUTORIZADA';
                      return (
                        <tr key={caut.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5">
                            <div className="font-bold text-sm text-slate-100 flex items-center space-x-2">
                              <span>{caut.materialNome}</span>
                            </div>
                            <div className="text-[11px] font-mono text-amber-400 mt-0.5">
                              {caut.protocolo || caut.id}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Entregue por: {caut.responsavelEntregaNome}
                            </div>
                          </td>

                          <td className="p-3.5">
                            {caut.tipoDestinatario === 'interno' ? (
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center space-x-1">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>{caut.usuarioInternoNome}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  MASP: {formatMasp(caut.usuarioInternoMasp || '')}
                                  {caut.usuarioInternoCargo ? ` • ${caut.usuarioInternoCargo}` : ''}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center space-x-1">
                                  <ExternalLink className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                  <span>{caut.usuarioExternoNome}</span>
                                  <span className="text-[9px] px-1 bg-purple-500/20 text-purple-300 rounded">Externo</span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {caut.usuarioExternoOrgao || 'Órgão não especificado'}
                                  {caut.usuarioExternoDocumento ? ` (Doc: ${caut.usuarioExternoDocumento})` : ''}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 text-center font-mono font-bold text-sm">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                              {caut.quantidade} un
                            </span>
                          </td>

                          <td className="p-3.5 font-mono text-[11px]">
                            <div className="text-slate-200">
                              Ret: {new Date(caut.dataRetirada).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                            <div className="text-slate-400">
                              Prev: {caut.dataPrevistaDevolucao ? new Date(caut.dataPrevistaDevolucao).toLocaleDateString('pt-BR') : 'Não estipulada'}
                            </div>
                            {caut.dataDevolucao && (
                              <div className="text-emerald-400 text-[10px]">
                                Devolvido: {new Date(caut.dataDevolucao).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center space-x-1 ${
                              isEmUso
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : caut.status === 'Consumido' || caut.status === 'CONSUMIDA' || caut.foiConsumido
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : caut.status === 'Devolvido com Anomalia'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {isEmUso && <Clock className="w-3 h-3" />}
                              {(caut.status === 'Consumido' || caut.status === 'CONSUMIDA') && <Flame className="w-3 h-3" />}
                              {caut.status === 'Devolvido com Anomalia' && <AlertTriangle className="w-3 h-3" />}
                              {!isEmUso && (caut.status === 'Devolvido' || caut.status === 'DEVOLVIDA') && <CheckCircle2 className="w-3 h-3" />}
                              <span>{caut.status}</span>
                            </span>
                          </td>

                          <td className="p-3.5 max-w-xs">
                            <p className="text-slate-300 truncate" title={caut.finalidade}>
                              {caut.finalidade}
                            </p>
                            {caut.relatoUsoAnomalias && (
                              <p className="text-[10px] text-amber-400/90 italic truncate mt-0.5" title={caut.relatoUsoAnomalias}>
                                Relato: {caut.relatoUsoAnomalias}
                              </p>
                            )}
                          </td>

                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {isEmUso && (
                                <button
                                  onClick={() => handleOpenDevolucaoModal(caut)}
                                  className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold text-xs rounded-lg border border-emerald-500/30 transition flex items-center space-x-1"
                                  title="Registrar devolução ou comunicar uso/anomalias"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Devolução / Baixa</span>
                                </button>
                              )}

                              <button
                                onClick={() => setReceiptCautela(caut)}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                title="Visualizar Comprovante / Termo"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TIPOS DE MATERIAIS */}
      {activeTab === 'tipos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Categorias e tipos cadastrados para padronizar o inventário da armaria.
            </p>
            {canInsertMaterial && (
              <button
                onClick={() => setShowTipoModal(true)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Tipo de Material</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiposMateriais.map((tipo) => (
              <div
                key={tipo.id}
                className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-amber-400 rounded border border-slate-700">
                      {tipo.categoria || 'Geral'}
                    </span>
                    {tipo.ehConsumivel ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30 flex items-center space-x-1">
                        <Flame className="w-3 h-3" />
                        <span>Consumível</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded border border-blue-500/20">
                        Permanente / Durável
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-slate-100 mt-2.5">{tipo.nome}</h3>
                  {tipo.descricao && (
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {tipo.descricao}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {materiais.filter(m => m.tipoMaterialId === tipo.id).length} material(is) vinculados
                  </span>
                  {canInsertMaterial && (
                    <button
                      onClick={() => handleDeleteTipoMaterial(tipo.id, tipo.nome)}
                      className="text-slate-500 hover:text-rose-400 transition"
                      title="Excluir Tipo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NOVO / EDITAR MATERIAL                             */}
      {/* ========================================================= */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {editingMaterial ? 'Editar Material' : 'Cadastrar Novo Material'}
                </h3>
              </div>
              <button
                onClick={() => setShowMaterialModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto flex-1 min-h-0">
              {/* Tipo e Nome */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tipo do Material <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <select
                      value={formTipoMaterialId}
                      onChange={(e) => setFormTipoMaterialId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Selecione um tipo...</option>
                      {tiposMateriais.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} ({t.categoria})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowTipoModal(true)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-700 shrink-0"
                      title="Criar novo tipo"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nome do Material <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Colete Balístico Nível III-A CBC Tam G"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Quantidade e Número de Série */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Quantidade Total <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formQuantidade}
                    onChange={(e) => setFormQuantidade(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Número de Série / Patrimônio <span className="text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: PAT-COE-7890 ou SERIE-0941"
                    value={formNumeroSerie}
                    onChange={(e) => setFormNumeroSerie(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Departamento e Unidade (Conforme Regras de Negócio) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">
                      Departamento do Material <span className="text-rose-400">*</span>
                    </label>
                    {!isGeral && (
                      <span className="text-[10px] text-amber-400 font-mono">
                        (Fixo: seu departamento)
                      </span>
                    )}
                  </div>
                  <select
                    value={formDepartamentoId}
                    disabled={!isGeral}
                    onChange={(e) => {
                      const nextDept = e.target.value;
                      setFormDepartamentoId(nextDept);
                      const firstUnit = units.find(u => u.departmentId === nextDept);
                      const nextUnit = firstUnit?.id || '';
                      setFormUnidadeId(nextUnit);
                      const firstVault = materialVaults.find(v => v.unitId === nextUnit);
                      setFormVaultSpaceId(firstVault?.id || '');
                      setFormLocalGuarda(firstVault?.code || '');
                    }}
                    required
                    className={`w-full px-3 py-2 bg-slate-900 border rounded-xl text-slate-100 focus:outline-none ${
                      !isGeral
                        ? 'border-slate-800 bg-slate-900/50 text-slate-400 cursor-not-allowed'
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  >
                    <option value="">Selecione o departamento...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">
                      Unidade do Material <span className="text-rose-400">*</span>
                    </label>
                    {isOnlyUnitAccess && (
                      <span className="text-[10px] text-amber-400 font-mono">
                        (Fixo: sua unidade)
                      </span>
                    )}
                  </div>
                  <select
                    value={formUnidadeId}
                    disabled={isOnlyUnitAccess}
                    onChange={(e) => {
                      const nextUnit = e.target.value;
                      setFormUnidadeId(nextUnit);
                      const firstVault = materialVaults.find(v => v.unitId === nextUnit);
                      setFormVaultSpaceId(firstVault?.id || '');
                      setFormLocalGuarda(firstVault?.code || '');
                    }}
                    required
                    className={`w-full px-3 py-2 bg-slate-900 border rounded-xl text-slate-100 focus:outline-none ${
                      isOnlyUnitAccess
                        ? 'border-slate-800 bg-slate-900/50 text-slate-400 cursor-not-allowed'
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  >
                    <option value="">Selecione a unidade...</option>
                    {availableUnitsForForm.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cofre de Materiais e Validade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Cofre de Guarda do Material <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formVaultSpaceId}
                    onChange={(e) => {
                      const vid = e.target.value;
                      setFormVaultSpaceId(vid);
                      const v = materialVaultsForForm.find(item => item.id === vid);
                      setFormLocalGuarda(v?.code || '');
                    }}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione um Cofre de Materiais...</option>
                    {materialVaultsForForm.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.code}{v.descricaoCurta ? ` — ${v.descricaoCurta}` : ''}
                      </option>
                    ))}
                  </select>
                  {materialVaultsForForm.length === 0 && (
                    <span className="text-[10px] text-amber-400 block mt-1">
                      Nenhum cofre do tipo Materiais cadastrado nesta unidade. Cadastre em "Locais do Cofre &rarr; + Novo Cofre de Materiais".
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Validade do Material <span className="text-slate-500">(Se aplicável)</span>
                  </label>
                  <input
                    type="date"
                    value={formValidade}
                    onChange={(e) => setFormValidade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Recomendado para sprays químicos, kits APH e coletes com prazo de validade balística.
                  </span>
                </div>
              </div>

              {/* SelectList: Passivo de depósito para policiais? */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Material é passivo de depósito para policiais? <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formPassivoDeposito}
                  onChange={(e) => setFormPassivoDeposito(e.target.value as 'SIM' | 'NAO')}
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="SIM">SIM</option>
                  <option value="NAO">NÃO</option>
                </select>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Apenas materiais marcados como SIM ficam visíveis para cautela pelos policiais no módulo Cautela de Materiais.
                </span>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observações e Especificações <span className="text-slate-500">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais sobre o estado, acessórios inclusos, manuais, etc."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMaterialModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center space-x-2"
                >
                  {isSubmitting ? (
                    <span>Salvando...</span>
                  ) : (
                    <span>{editingMaterial ? 'Atualizar Material' : 'Cadastrar Material'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NOVO TIPO DE MATERIAL                              */}
      {/* ========================================================= */}
      {showTipoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">Novo Tipo de Material</h3>
              </div>
              <button
                onClick={() => setShowTipoModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTipoMaterial} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome do Tipo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Colete Balístico, Algemas, Espargidor..."
                  value={newTipoNome}
                  onChange={(e) => setNewTipoNome(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Categoria
                </label>
                <select
                  value={newTipoCategoria}
                  onChange={(e) => setNewTipoCategoria(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Proteção Balística">Proteção Balística</option>
                  <option value="Contenção">Contenção</option>
                  <option value="Menos Letal">Menos Letal</option>
                  <option value="Comunicação">Comunicação</option>
                  <option value="Iluminação">Iluminação</option>
                  <option value="Tecnologia e Monitoramento">Tecnologia e Monitoramento</option>
                  <option value="Saúde Operacional">Saúde Operacional</option>
                  <option value="Equipamentos">Equipamentos Gerais</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Descrição / Finalidade
                </label>
                <textarea
                  rows={2}
                  placeholder="Finalidade e especificações do tipo..."
                  value={newTipoDescricao}
                  onChange={(e) => setNewTipoDescricao(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="chkConsumivel"
                  checked={newTipoEhConsumivel}
                  onChange={(e) => setNewTipoEhConsumivel(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500"
                />
                <label htmlFor="chkConsumivel" className="text-slate-200 cursor-pointer font-medium">
                  Material Consumível / Perecível (pode se esgotar ou ser utilizado em serviço sem retorno)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTipoModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/20"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Tipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NOVA CAUTELA DE MATERIAL                           */}
      {/* ========================================================= */}
      {showCautelaModal && cautelaMaterialTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Cautela de Material • {cautelaMaterialTarget.nome}
                </h3>
              </div>
              <button
                onClick={() => setShowCautelaModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCautela} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto flex-1 min-h-0">
              {/* Material Info summary */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Material Selecionado</span>
                  <p className="font-bold text-slate-100 text-sm">{cautelaMaterialTarget.nome}</p>
                  <p className="text-xs text-amber-400">
                    {cautelaMaterialTarget.tipoMaterialNome} • Local: {cautelaMaterialTarget.localGuarda}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Disponível em Estoque</span>
                  <p className="text-lg font-black text-emerald-400 font-mono">
                    {cautelaMaterialTarget.quantidadeDisponivel} un
                  </p>
                </div>
              </div>

              {/* Quantidade a Acautelar */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Quantidade a Acautelar <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={cautelaMaterialTarget.quantidadeDisponivel}
                  required
                  value={cautelaQtd}
                  onChange={(e) => setCautelaQtd(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-base font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Tipo de Destinatário */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Destinatário do Material <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCautelaDestinatarioTipo('interno')}
                    className={`p-3 rounded-xl border font-bold flex items-center justify-center space-x-2 transition ${
                      cautelaDestinatarioTipo === 'interno'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Servidor Interno (Policial)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCautelaDestinatarioTipo('externo')}
                    className={`p-3 rounded-xl border font-bold flex items-center justify-center space-x-2 transition ${
                      cautelaDestinatarioTipo === 'externo'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Usuário Externo (Outro Órgão)</span>
                  </button>
                </div>
              </div>

              {/* Campos para Servidor Interno */}
              {cautelaDestinatarioTipo === 'interno' ? (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Selecione o Policial / Servidor <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={cautelaUsuarioInternoId}
                    onChange={(e) => setCautelaUsuarioInternoId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione o servidor...</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {formatMasp(u.masp)} - {u.role})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Campos para Destinatário Externo */
                <div className="space-y-3 p-3.5 bg-slate-950/70 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Nome Completo <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Nome do militar, perito ou servidor..."
                        value={cautelaUsuarioExternoNome}
                        onChange={(e) => setCautelaUsuarioExternoNome(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Documento (CPF / RG / Matrícula) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: CPF ou RG Militar"
                        value={cautelaUsuarioExternoDoc}
                        onChange={(e) => setCautelaUsuarioExternoDoc(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Órgão / Instituição de Origem <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Polícia Militar, Polícia Federal, Judiciário..."
                        value={cautelaUsuarioExternoOrgao}
                        onChange={(e) => setCautelaUsuarioExternoOrgao(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Telefone / Contato
                      </label>
                      <input
                        type="text"
                        placeholder="(00) 00000-0000"
                        value={cautelaUsuarioExternoTelefone}
                        onChange={(e) => setCautelaUsuarioExternoTelefone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Data Retirada e Previsão Devolução */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Data e Hora de Retirada <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={cautelaDataRetirada}
                    onChange={(e) => setCautelaDataRetirada(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Data Prevista para Devolução <span className="text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={cautelaDataPrevistaDevolucao}
                    onChange={(e) => setCautelaDataPrevistaDevolucao(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Finalidade */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Finalidade / Motivo da Cautela <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ex: Plantão Operacional COE, Operação Tática Integrada, Instrução Acadepol..."
                  value={cautelaFinalidade}
                  onChange={(e) => setCautelaFinalidade(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCautelaModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center space-x-2"
                >
                  {isSubmitting ? 'Registrando...' : 'Confirmar Cautela'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DEVOLUÇÃO / BAIXA / COMUNICAÇÃO DE ANOMALIA        */}
      {/* ========================================================= */}
      {showDevolucaoModal && selectedCautelaForReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Devolução e Baixa de Material • {selectedCautelaForReturn.protocolo || selectedCautelaForReturn.id}
                </h3>
              </div>
              <button
                onClick={() => setShowDevolucaoModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevolucao} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto flex-1 min-h-0">
              {/* Summary */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-sm">{selectedCautelaForReturn.materialNome}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Qtd: {selectedCautelaForReturn.quantidade} un
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Destinatário:{' '}
                  <strong className="text-slate-200">
                    {selectedCautelaForReturn.tipoDestinatario === 'interno'
                      ? `${selectedCautelaForReturn.usuarioInternoNome} (MASP: ${formatMasp(selectedCautelaForReturn.usuarioInternoMasp || '')})`
                      : `${selectedCautelaForReturn.usuarioExternoNome} (${selectedCautelaForReturn.usuarioExternoOrgao || 'Externo'})`}
                  </strong>
                </p>
                <p className="text-xs text-slate-400">
                  Data de Retirada: <span className="font-mono text-slate-300">{new Date(selectedCautelaForReturn.dataRetirada).toLocaleString('pt-BR')}</span>
                </p>
              </div>

              {/* Data da Devolução */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Data e Hora do Recebimento / Baixa <span className="text-rose-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={returnData}
                  onChange={(e) => setReturnData(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Opções de Desfecho */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Condição e Desfecho do Material <span className="text-rose-400">*</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReturnFoiConsumido(false);
                      setReturnStatus('Devolvido');
                    }}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition ${
                      !returnFoiConsumido && returnStatus === 'Devolvido'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                      <strong className="block text-slate-100">Devolução Normal</strong>
                      <span className="text-[11px] text-slate-400">
                        Material em perfeito estado. Retorna ao estoque disponível.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReturnFoiConsumido(false);
                      setReturnStatus('Devolvido com Anomalia');
                    }}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition ${
                      !returnFoiConsumido && returnStatus === 'Devolvido com Anomalia'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                      <strong className="block text-slate-100">Devolvido com Anomalia</strong>
                      <span className="text-[11px] text-slate-400">
                        Material avariado, danificado ou com desgaste excessivo.
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Checkbox / Card para Material Consumido / Utilizado em Operação que não retornará mais */}
              <div className={`p-4 rounded-xl border transition ${
                returnFoiConsumido
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-slate-950/70 border-slate-800'
              }`}>
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="chkFoiConsumido"
                    checked={returnFoiConsumido}
                    onChange={(e) => {
                      setReturnFoiConsumido(e.target.checked);
                      if (e.target.checked) {
                        setReturnStatus('Consumido');
                      } else {
                        setReturnStatus('Devolvido');
                      }
                    }}
                    className="w-5 h-5 mt-0.5 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="chkFoiConsumido" className="font-bold text-slate-100 block cursor-pointer">
                      Material consumido / utilizado em serviço (material que se perca e não retornará mais)
                    </label>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Marque esta opção para itens de uso único, espargidores acionados em ocorrência, granadas não letais, kits de primeiros socorros ou materiais consumidos durante a missão. O item terá baixa permanente no estoque geral.
                    </p>
                  </div>
                </div>
              </div>

              {/* Campo para Comunicar Uso ou Anomalias */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Relato de Uso / Comunicação de Anomalias e Ocorrências{' '}
                  {(returnFoiConsumido || returnStatus === 'Devolvido com Anomalia') && (
                    <span className="text-rose-400">* (Obrigatório)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  required={returnFoiConsumido || returnStatus === 'Devolvido com Anomalia'}
                  placeholder={
                    returnFoiConsumido
                      ? "Descreva o acionamento / emprego do material, número da ocorrência policial (REDS/BO) e local..."
                      : returnStatus === 'Devolvido com Anomalia'
                      ? "Descreva a anomalia ou defeito verificado no material..."
                      : "Observações ou comunicação sobre o uso do material (opcional)..."
                  }
                  value={returnRelato}
                  onChange={(e) => setReturnRelato(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDevolucaoModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2 font-bold rounded-xl shadow-lg transition flex items-center space-x-2 ${
                    returnFoiConsumido
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  }`}
                >
                  {isSubmitting
                    ? 'Registrando...'
                    : returnFoiConsumido
                    ? 'Confirmar Baixa Permanente por Consumo'
                    : 'Confirmar Devolução'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: TRANSFERÊNCIA DE MATERIAL ENTRE UNIDADES           */}
      {/* ========================================================= */}
      {showTransferModal && transferMaterialTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Transferir Material para Outra Unidade
                  </h3>
                  <p className="text-xs text-slate-400">
                    {transferMaterialTarget.nome} ({transferMaterialTarget.tipoMaterialNome})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1 min-h-0">
              
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Disponível em Estoque:</span>
                  <strong className="text-emerald-400 font-mono text-sm">{transferMaterialTarget.quantidadeDisponivel} un.</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Local de Guarda Atual:</span>
                  <span className="text-slate-200 font-mono">{transferMaterialTarget.localGuarda}</span>
                </div>
              </div>

              {/* Quantidade a Transferir */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Quantidade a Transferir *
                </label>
                <input
                  type="number"
                  min="1"
                  max={transferMaterialTarget.quantidadeDisponivel}
                  required
                  value={transferQtd}
                  onChange={(e) => setTransferQtd(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Destino da Transferência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Departamento de Destino *
                  </label>
                  <select
                    value={transferDestDeptId}
                    onChange={(e) => {
                      const nextDeptId = e.target.value;
                      setTransferDestDeptId(nextDeptId);
                      const uList = allUnitsList.filter(
                        u => (!nextDeptId || u.departmentId === nextDeptId) && u.id !== transferMaterialTarget.unidadeId
                      );
                      setTransferDestUnitId(uList[0]?.id || '');
                      setTransferDestArmorerId('');
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                    required
                  >
                    <option value="">Selecione o departamento...</option>
                    {allDepartmentsList.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.code ? `${d.code} - ` : ''}{d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Unidade de Destino *
                  </label>
                  <select
                    value={transferDestUnitId}
                    onChange={(e) => {
                      setTransferDestUnitId(e.target.value);
                      setTransferDestArmorerId('');
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                    required
                  >
                    {!transferDestDeptId ? (
                      <option value="">Selecione o departamento primeiro...</option>
                    ) : availableTransferDestUnits.length === 0 ? (
                      <option value="">Nenhuma outra unidade cadastrada neste departamento</option>
                    ) : (
                      availableTransferDestUnits.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Armeiro Destinatário (Receptor):
                  </label>
                  <select
                    value={transferDestArmorerId}
                    onChange={(e) => {
                      setTransferDestArmorerId(e.target.value);
                      if (!transferTransporterId) setTransferTransporterId(e.target.value);
                    }}
                    disabled={!transferDestUnitId}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
                  >
                    {!transferDestUnitId ? (
                      <option value="">Selecione a unidade de destino...</option>
                    ) : availableTransferDestArmorers.length === 0 ? (
                      <option value="">Nenhum usuário com perfil de Armeiro cadastrado nesta unidade</option>
                    ) : (
                      availableTransferDestArmorers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - Armeiro
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Policial Responsável pelo Transporte:
                  </label>
                  <select
                    value={transferTransporterId}
                    onChange={(e) => setTransferTransporterId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Selecione o transportador...</option>
                    {allUsersLookupList
                      .filter(u => u.hasSystemAccess !== false)
                      .map(u => {
                        const unitObj = allUnitsList.find(unit => unit.id === u.unitId);
                        return (
                          <option key={u.id} value={u.id}>
                            {u.name} (MASP: {u.masp}) - {unitObj?.name || u.role}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Motivo da Transferência *
                </label>
                <input
                  type="text"
                  required
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Ex: Reforço operacional, redistribuição de acervo"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observações de Despacho (Opcional):
                </label>
                <input
                  type="text"
                  value={transferObs}
                  onChange={(e) => setTransferObs(e.target.value)}
                  placeholder="Informações adicionais..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition shadow"
                >
                  {isSubmitting ? 'Despachando...' : 'Despachar Transferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: VER DETALHES DO COFRE (LISTA DE ITENS DO COFRE)    */}
      {/* ========================================================= */}
      {selectedVaultDetailsId && (() => {
        const isLegacyGroup = selectedVaultDetailsId === '__LEGACY__';
        const vaultObj = isLegacyGroup ? null : materialVaults.find(v => v.id === selectedVaultDetailsId);
        const vaultItems = isLegacyGroup
          ? legacyUnlinkedMaterials
          : filteredMateriais.filter(m =>
              vaultObj
                ? (m.vaultSpaceId
                    ? m.vaultSpaceId === vaultObj.id
                    : (m.localGuarda === vaultObj.code && (!m.unidadeId || m.unidadeId === vaultObj.unitId)))
                : false
            );
        const vaultUnit = vaultObj ? units.find(u => u.id === vaultObj.unitId) : null;
        const vaultDept = vaultObj ? departments.find(d => d.id === vaultObj.departmentId) : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                    <Vault className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-100 font-mono">
                      {isLegacyGroup ? 'OUTROS LOCAIS (Legado)' : `Cofre ${vaultObj?.code || ''}`}
                    </h3>
                    <p className="text-xs text-slate-300">
                      {isLegacyGroup
                        ? 'Materiais sem cofre vinculado'
                        : `${vaultObj?.descricaoCurta || 'Sem descrição curta'} • ${vaultUnit?.name || ''} ${vaultDept ? `(${vaultDept.code})` : ''}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrintMaterialVault(vaultObj || null, isLegacyGroup)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>Imprimir Cofre</span>
                  </button>
                  {canInsertMaterial && vaultObj && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVaultDetailsId(null);
                        handleOpenNewMaterialModal(vaultObj);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Novo Material neste Cofre</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedVaultDetailsId(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                {vaultItems.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 space-y-2 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                    <Package className="w-9 h-9 mx-auto text-slate-600" />
                    <p className="text-sm font-semibold">Nenhum item armazenado neste cofre.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
                    {vaultItems.map((mat) => (
                      <div key={mat.id} className="p-4 hover:bg-slate-900/60 transition space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-black text-slate-100">{mat.nome}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                {mat.tipoMaterialNome}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                mat.passivoDepositoPoliciais !== false
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}>
                                Cautelável p/ Policiais: {mat.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-300 pt-1">
                              <div>
                                <span className="text-slate-500">Nº Série / Patr.:</span>{' '}
                                <span className="font-mono text-slate-200">{mat.numeroSerie || 'Não informado'}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Unidade:</span>{' '}
                                <span className="text-slate-200">{mat.unidadeNome || mat.unidadeId}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Departamento:</span>{' '}
                                <span className="text-slate-200">{mat.departamentoNome || mat.departamentoId}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Local / Cofre:</span>{' '}
                                <span className="font-mono text-emerald-300">{mat.localGuarda}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Validade:</span>
                                {getValidityBadge(mat.validade)}
                              </div>
                              <div>
                                <span className="text-slate-500">Estoque:</span>{' '}
                                <span className="font-mono font-bold text-slate-100">
                                  Total: {mat.quantidade} | Disp: <span className="text-emerald-400">{mat.quantidadeDisponivel}</span> | Em Uso: <span className="text-amber-400">{mat.quantidadeEmUso}</span> | Cons.: <span className="text-purple-400">{mat.quantidadeConsumida}</span>
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Cadastrado por:</span>{' '}
                                <span className="text-slate-200">{mat.criadoPorNome || 'Sistema'}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Data de Cadastro:</span>{' '}
                                <span className="font-mono text-slate-300">
                                  {mat.createdAt ? new Date(mat.createdAt).toLocaleDateString('pt-BR') : '-'}
                                </span>
                              </div>
                              {mat.updatedAt && (
                                <div>
                                  <span className="text-slate-500">Atualizado em:</span>{' '}
                                  <span className="font-mono text-slate-300">
                                    {new Date(mat.updatedAt).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {mat.observacoes && (
                              <p className="text-[11px] text-slate-400 italic pt-1">
                                Observações: {mat.observacoes}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVaultDetailsId(null);
                                handleOpenCautela(mat);
                              }}
                              disabled={mat.quantidadeDisponivel <= 0}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                                mat.quantidadeDisponivel > 0
                                  ? 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                              }`}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Cautelar</span>
                            </button>

                            {canInsertMaterial && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVaultDetailsId(null);
                                    handleOpenTransfer(mat);
                                  }}
                                  disabled={mat.quantidadeDisponivel <= 0}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                                    mat.quantidadeDisponivel > 0
                                      ? 'bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/30'
                                      : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                                  }`}
                                >
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span>Transferir</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVaultDetailsId(null);
                                    handleOpenEditMaterialModal(mat);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Editar Material"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteMaterial(mat.id, mat.nome)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Excluir Material"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 border-t border-slate-800 flex justify-end shrink-0 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setSelectedVaultDetailsId(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL: RECEBER TRANSFERÊNCIA DE MATERIAL NO COFRE         */}
      {/* ========================================================= */}
      {receiveTransferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-100">
                Receber Material Transferido
              </h3>
              <button
                type="button"
                onClick={() => setReceiveTransferTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmReceiveTransfer} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1 min-h-0">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-slate-100 text-sm">{receiveTransferTarget.nomeMaterial}</div>
                <div className="text-slate-400">Quantidade: <strong className="text-emerald-400">{receiveTransferTarget.quantidade} un</strong></div>
                <div className="text-slate-400">Origem: <strong className="text-slate-200">{receiveTransferTarget.originUnitName}</strong></div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Cofre de Materiais de Destino *
                </label>
                <select
                  value={receiveVaultId}
                  onChange={(e) => setReceiveVaultId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o cofre...</option>
                  {materialVaults
                    .filter(v => v.unitId === receiveTransferTarget.destinationUnitId)
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        {v.code}{v.descricaoCurta ? ` — ${v.descricaoCurta}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observação de Recebimento (Opcional)
                </label>
                <input
                  type="text"
                  value={receiveObs}
                  onChange={(e) => setReceiveObs(e.target.value)}
                  placeholder="Ex: Conferido fisicamente em boas condições"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReceiveTransferTarget(null)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl"
                >
                  {isSubmitting ? 'Recebendo...' : 'Confirmar Recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: COMPROVANTE / TERMO DE CAUTELA (IMPRESSÃO)         */}
      {/* ========================================================= */}
      {receiptCautela && (
        <MaterialReceiptModal
          cautela={receiptCautela}
          currentUser={currentUser}
          departments={departments}
          units={units}
          onClose={() => setReceiptCautela(null)}
        />
      )}
    </div>
  );
};
