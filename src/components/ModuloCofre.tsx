import React, { useState, useMemo } from 'react';
import { User, VaultSpace, VaultSpaceType, Department, Unit, Explosivo, MovimentacaoExplosivo, Weapon, WeaponCustodyMovement } from '../types';
import { storage } from '../services/storage';
import { 
  Vault, Plus, Trash2, Edit2, AlertCircle, Check, Crosshair, Disc, 
  Search, ChevronDown, ChevronUp, Building, Eye, Printer, X, Filter,
  Shield, Layers, Package, Bomb, History, Flame, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { printDocumentInPage, buildStandardDocumentTitle, escapeHtmlText } from '../utils/printHelper';

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
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ARMAS' | 'MUNIÇÕES' | 'MATERIAIS' | 'EXPLOSIVOS'>('ALL');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('ALL');
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);
  const [selectedVaultForDetails, setSelectedVaultForDetails] = useState<VaultSpace | null>(null);
  const [vaultDetailsTab, setVaultDetailsTab] = useState<'ITEMS' | 'HISTORICO'>('ITEMS');
  const [selectedExplosivoHistory, setSelectedExplosivoHistory] = useState<Explosivo | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingVault, setEditingVault] = useState<VaultSpace | null>(null);
  const [code, setCode] = useState('');
  const [descricaoCurta, setDescricaoCurta] = useState('');
  const [type, setType] = useState<VaultSpaceType>('ARMAS');
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetVault, setDeleteTargetVault] = useState<VaultSpace | null>(null);

  const [darEntradaTargetWeapon, setDarEntradaTargetWeapon] = useState<Weapon | null>(null);
  const [darEntradaShotsInput, setDarEntradaShotsInput] = useState('0');
  const [custodyActionLoading, setCustodyActionLoading] = useState(false);
  const [weaponDetailHistoryTarget, setWeaponDetailHistoryTarget] = useState<Weapon | null>(null);
  const [weaponDetailHistoryRecords, setWeaponDetailHistoryRecords] = useState<WeaponCustodyMovement[]>([]);

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const isArmeiro = effectiveRole === 'Armeiro' || (currentUser.roles?.includes('Armeiro') && effectiveRole === 'Armeiro');
  const isDeptArmeiro = isArmeiro && currentUser.managementScope === 'department';
  const isExplosivista = effectiveRole === 'Explosivista';
  const isAdmin = effectiveRole === 'Administrador';
  const isAdminOrArmeiro = isAdmin || isArmeiro;
  const isPolicial = effectiveRole === 'Policial';
  const canManageVault = isGeral || isAdminOrArmeiro || isExplosivista;

  const userUnit = units.find(u => u.id === currentUser.unitId);
  const effectiveDeptId = currentUser.departmentId || userUnit?.departmentId || '';

  const deptUnitIds = useMemo(() => {
    if (!effectiveDeptId) return new Set<string>();
    return new Set(units.filter(u => u.departmentId === effectiveDeptId).map(u => u.id));
  }, [units, effectiveDeptId]);

  const isVaultInArmeiroScope = (v: VaultSpace) => {
    if (isDeptArmeiro) {
      return v.departmentId === effectiveDeptId || (v.unitId ? deptUnitIds.has(v.unitId) : false);
    }
    return v.unitId === currentUser.unitId || (!v.unitId && v.departmentId === effectiveDeptId);
  };

  const canOperateWeaponCustody = isGeral || isArmeiro || isAdmin || Boolean(currentUser.canMoveWeapons);

  const getVaultWeaponsList = (vaultId: string): Weapon[] => {
    const allWeaps = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User);
    const activeCautelas = storage.getCautelasArmas().filter(
      c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
    );
    return allWeaps.filter(w => {
      if (w.vaultSpaceId === vaultId && w.status === 'No Cofre') return true;
      const isCustodyStatus = w.status === 'Acautelada' || w.status === 'Com o Policial';
      const activeCaut = activeCautelas.find(c => c.weaponId === w.id);
      if (isCustodyStatus || activeCaut) {
        return (
          w.vaultSpaceId === vaultId ||
          w.previousVaultSpaceId === vaultId ||
          activeCaut?.vaultSpaceId === vaultId
        );
      }
      return false;
    });
  };

  const getCustodyNamesForWeapon = (w: Weapon) => {
    const activeCaut = storage
      .getCautelasArmas()
      .find(c => c.weaponId === w.id && (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'));
    const locNote = String((w as any).locationNote || '');
    const parsedName = locNote
      ? locNote.split('•')[0].replace(/^Acautelada com\s*/i, '').split('(MASP:')[0].trim()
      : '';
    return {
      activeCaut,
      custodyUserName: activeCaut?.requesterName || parsedName || 'Policial',
      authorizerUserName: activeCaut?.armorerName || currentUser.name
    };
  };

  const handleDarSaidaWeapon = async (w: Weapon) => {
    setErrorMsg('');
    setSuccessMsg('');
    setCustodyActionLoading(true);
    try {
      const { custodyUserName, authorizerUserName } = getCustodyNamesForWeapon(w);
      await storage.darSaidaArma(w.id, { custodyUserName, authorizerUserName });
      setSuccessMsg(`Saída registrada: ${w.type} ${w.model} (Série: ${w.serialNumber}) está agora "Com o Policial".`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao dar saída na arma.');
    } finally {
      setCustodyActionLoading(false);
    }
  };

  const handleOpenDarEntradaModal = (w: Weapon) => {
    setErrorMsg('');
    setSuccessMsg('');
    setDarEntradaTargetWeapon(w);
    setDarEntradaShotsInput('0');
  };

  const handleConfirmDarEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!darEntradaTargetWeapon) return;
    setErrorMsg('');
    setSuccessMsg('');
    const shots = Math.max(0, parseInt(darEntradaShotsInput || '0', 10) || 0);
    setCustodyActionLoading(true);
    try {
      const res = await storage.darEntradaArma(darEntradaTargetWeapon.id, shots);
      setSuccessMsg(
        `Entrada registrada: ${darEntradaTargetWeapon.type} ${darEntradaTargetWeapon.model} (Série: ${darEntradaTargetWeapon.serialNumber}) retornou para "Acautelada"${shots > 0 ? ` com +${shots} tiro(s) acrescentado(s) (Total: ${res.shotCount} tiros)` : ''}.`
      );
      setDarEntradaTargetWeapon(null);
      setDarEntradaShotsInput('0');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao dar entrada na arma.');
    } finally {
      setCustodyActionLoading(false);
    }
  };

  const handleOpenWeaponHistory = async (w: Weapon) => {
    setWeaponDetailHistoryTarget(w);
    setWeaponDetailHistoryRecords(storage.getWeaponCustodyHistory(w.id));
    const records = await storage.fetchWeaponCustodyHistory(w.id);
    setWeaponDetailHistoryRecords(records);
  };

  // Visible departments based on user scope
  const visibleDepts = useMemo(() => {
    if (isGeral) return departments;
    const targetDeptId = currentUser.departmentId || userUnit?.departmentId;
    const depts = departments.filter(d => d.id === targetDeptId);
    if (depts.length > 0) return depts;
    const vaultDeptIds = new Set(vaultSpaces.filter(v => v.unitId === currentUser.unitId).map(v => v.departmentId));
    const matched = departments.filter(d => vaultDeptIds.has(d.id));
    return matched.length > 0 ? matched : (departments.length > 0 ? [departments[0]] : []);
  }, [isGeral, departments, currentUser.departmentId, userUnit, vaultSpaces]);

  // Scoped vault spaces for user
  const userScopedVaults = useMemo(() => {
    if (isGeral) return vaultSpaces;
    if (isArmeiro) {
      return vaultSpaces.filter(v => 
        (v.type === 'ARMAS' || v.type === 'MUNIÇÕES' || v.type === 'MATERIAIS') &&
        (isDeptArmeiro
          ? (v.departmentId === effectiveDeptId || (v.unitId ? deptUnitIds.has(v.unitId) : false))
          : (v.unitId === currentUser.unitId || (!v.unitId && v.departmentId === effectiveDeptId)))
      );
    }
    if (isExplosivista) {
      return vaultSpaces.filter(v => v.unitId === currentUser.unitId && v.type === 'EXPLOSIVOS');
    }
    if (isAdmin) {
      return vaultSpaces.filter(v => v.departmentId === currentUser.departmentId || (v.unitId ? deptUnitIds.has(v.unitId) : false));
    }
    return vaultSpaces.filter(v => v.unitId === currentUser.unitId);
  }, [vaultSpaces, isGeral, isArmeiro, isDeptArmeiro, isExplosivista, isAdmin, currentUser, effectiveDeptId, deptUnitIds]);

  // Global counts for filter badges
  const totalArmas = useMemo(() => userScopedVaults.filter(v => v.type === 'ARMAS').length, [userScopedVaults]);
  const totalMunicoes = useMemo(() => userScopedVaults.filter(v => v.type === 'MUNIÇÕES').length, [userScopedVaults]);
  const totalMateriais = useMemo(() => userScopedVaults.filter(v => v.type === 'MATERIAIS').length, [userScopedVaults]);
  const totalExplosivos = useMemo(() => userScopedVaults.filter(v => v.type === 'EXPLOSIVOS').length, [userScopedVaults]);
  const totalAll = userScopedVaults.length;

  // Available departments & units for modal
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId || d.id === effectiveDeptId);
  const availableUnitsForModal = isGeral 
    ? units.filter(u => u.departmentId === (deptId || effectiveDeptId))
    : ((isArmeiro && !isDeptArmeiro) || isExplosivista)
    ? (userUnit ? [userUnit] : units.filter(u => u.id === currentUser.unitId))
    : units.filter(u => u.departmentId === (deptId || effectiveDeptId));

  // Available units for quick filter dropdown
  const filterUnits = useMemo(() => {
    if (isGeral) return units;
    if ((isArmeiro && !isDeptArmeiro) || isExplosivista) {
      return userUnit ? [userUnit] : units.filter(u => u.id === currentUser.unitId);
    }
    return units.filter(u => u.departmentId === (currentUser.departmentId || effectiveDeptId));
  }, [isGeral, isArmeiro, isDeptArmeiro, isExplosivista, units, currentUser, userUnit, effectiveDeptId]);

  const toggleDeptExpand = (id: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenModal = (presetType?: VaultSpaceType) => {
    setErrorMsg('');
    setEditingVault(null);
    setCode('');
    setDescricaoCurta('');
    
    // Explosivista só pode criar locais vinculados a explosivos
    if (isExplosivista) {
      setType('EXPLOSIVOS');
    } else if (isArmeiro) {
      if (presetType === 'MUNIÇÕES' || presetType === 'MATERIAIS' || presetType === 'ARMAS') {
        setType(presetType);
      } else if (typeFilter === 'MUNIÇÕES') {
        setType('MUNIÇÕES');
      } else if (typeFilter === 'MATERIAIS') {
        setType('MATERIAIS');
      } else {
        setType('ARMAS');
      }
    } else if (presetType) {
      setType(presetType);
    } else if (typeFilter === 'MUNIÇÕES') {
      setType('MUNIÇÕES');
    } else if (typeFilter === 'MATERIAIS') {
      setType('MATERIAIS');
    } else if (typeFilter === 'EXPLOSIVOS') {
      setType('EXPLOSIVOS');
    } else {
      setType('ARMAS');
    }

    const initialDept = isGeral ? (departments[0]?.id || '') : (currentUser.departmentId || effectiveDeptId);
    setDeptId(initialDept);
    const initialUnits = units.filter(u => u.departmentId === initialDept);
    const targetUnit =
      (isDeptArmeiro || isAdmin || isGeral) && selectedUnitFilter !== 'ALL' && initialUnits.some(u => u.id === selectedUnitFilter)
        ? selectedUnitFilter
        : (!isGeral && currentUser.unitId && (!isDeptArmeiro || initialUnits.some(u => u.id === currentUser.unitId)))
          ? currentUser.unitId
          : (userUnit?.id || initialUnits[0]?.id || '');
    setUnitId(targetUnit);
    setShowModal(true);
  };

  const handleOpenEditModal = (vault: VaultSpace) => {
    if (isArmeiro) {
      if (vault.type === 'EXPLOSIVOS') {
        setErrorMsg('Usuários armeiros só podem editar locais de armas, munições e materiais.');
        return;
      }
      if (!isVaultInArmeiroScope(vault) && !isAdmin && !isGeral) {
        setErrorMsg(
          isDeptArmeiro
            ? 'Usuários armeiros com abrangência departamental só podem editar locais de unidades do seu departamento.'
            : 'Usuários armeiros só podem editar locais da sua própria unidade.'
        );
        return;
      }
    }
    if (isExplosivista && vault.type !== 'EXPLOSIVOS') {
      setErrorMsg('Usuários explosivistas só podem editar locais no cofre vinculados a explosivos.');
      return;
    }
    setErrorMsg('');
    setEditingVault(vault);
    setCode(vault.code);
    setDescricaoCurta(vault.descricaoCurta || '');
    setType(vault.type);
    setDeptId(vault.departmentId || effectiveDeptId);
    setUnitId(vault.unitId || currentUser.unitId || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const finalUnitId = (isArmeiro && !isDeptArmeiro)
      ? (currentUser.unitId || unitId || userUnit?.id || '')
      : (unitId || currentUser.unitId || '');
    const selectedUnitObj = units.find(u => u.id === finalUnitId);
    const finalDeptId = deptId || selectedUnitObj?.departmentId || userUnit?.departmentId || currentUser.departmentId || effectiveDeptId;

    if (!code.trim()) {
      setErrorMsg('Informe a identificação/código do local do cofre.');
      return;
    }
    if (type === 'MATERIAIS' && !descricaoCurta.trim()) {
      setErrorMsg('Informe a descrição curta do material armazenado neste cofre.');
      return;
    }
    if (!finalUnitId) {
      setErrorMsg('Selecione uma unidade para o local do cofre.');
      return;
    }

    if (isArmeiro) {
      if (type !== 'ARMAS' && type !== 'MUNIÇÕES' && type !== 'MATERIAIS') {
        setErrorMsg('Usuários armeiros só podem cadastrar ou alterar locais vinculados a armas, munições e materiais.');
        return;
      }
      if (!isDeptArmeiro && currentUser.unitId && finalUnitId !== currentUser.unitId) {
        setErrorMsg('Usuários armeiros só podem criar locais do cofre na sua própria unidade.');
        return;
      }
      if (isDeptArmeiro && deptUnitIds.size > 0 && !deptUnitIds.has(finalUnitId)) {
        setErrorMsg('Selecione uma unidade pertencente ao seu departamento.');
        return;
      }
    }

    if (isExplosivista && type !== 'EXPLOSIVOS') {
      setErrorMsg('Usuários explosivistas só podem cadastrar ou alterar locais vinculados a explosivos.');
      return;
    }

    try {
      const effectiveType = isExplosivista ? 'EXPLOSIVOS' : type;
      const typeLabel =
        effectiveType === 'ARMAS'
          ? 'Cofre para Armas'
          : effectiveType === 'MUNIÇÕES'
          ? 'Cofre para Munições'
          : effectiveType === 'MATERIAIS'
          ? 'Cofre de Materiais'
          : 'Paiol / Cofre de Explosivos';
      const payload = {
        code: code.trim().toUpperCase(),
        type: effectiveType,
        descricaoCurta: effectiveType === 'MATERIAIS' ? descricaoCurta.trim() : undefined,
        departmentId: finalDeptId,
        unitId: finalUnitId
      };
      if (editingVault) {
        await storage.updateVaultSpace(editingVault.id, payload);
        setSuccessMsg(`Local de cofre "${code.toUpperCase()}" (${typeLabel}) atualizado com sucesso.`);
      } else {
        await storage.addVaultSpace(payload);
        setSuccessMsg(`Novo local "${code.toUpperCase()}" (${typeLabel}) cadastrado com sucesso.`);
      }
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar local do cofre.');
    }
  };

  const handleDelete = (vault: VaultSpace) => {
    if (isArmeiro) {
      if (vault.type === 'EXPLOSIVOS') {
        setErrorMsg('Usuários armeiros só podem excluir locais de armas, munições e materiais.');
        return;
      }
      if (!isVaultInArmeiroScope(vault) && !isAdmin && !isGeral) {
        setErrorMsg(
          isDeptArmeiro
            ? 'Usuários armeiros com abrangência departamental só podem excluir locais de unidades do seu departamento.'
            : 'Usuários armeiros só podem excluir locais da sua própria unidade.'
        );
        return;
      }
    }
    if (isExplosivista && vault.type !== 'EXPLOSIVOS') {
      setErrorMsg('Usuários explosivistas só podem excluir locais no cofre vinculados a explosivos.');
      return;
    }
    setDeleteTargetVault(vault);
  };

  const confirmExecuteDeleteVault = async () => {
    if (!deleteTargetVault) return;
    if (isArmeiro) {
      if (deleteTargetVault.type === 'EXPLOSIVOS') {
        setErrorMsg('Usuários armeiros só podem excluir locais de armas, munições e materiais.');
        setDeleteTargetVault(null);
        return;
      }
      if (!isVaultInArmeiroScope(deleteTargetVault) && !isAdmin && !isGeral) {
        setErrorMsg(
          isDeptArmeiro
            ? 'Usuários armeiros com abrangência departamental só podem excluir locais de unidades do seu departamento.'
            : 'Usuários armeiros só podem excluir locais da sua própria unidade.'
        );
        setDeleteTargetVault(null);
        return;
      }
    }
    if (isExplosivista && deleteTargetVault.type !== 'EXPLOSIVOS') {
      setErrorMsg('Usuários explosivistas só podem excluir locais no cofre vinculados a explosivos.');
      setDeleteTargetVault(null);
      return;
    }
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

  // Direct print PDF of vault content - Detalhado e uma página por objeto caso haja mais de um item
  const handlePrintVaultContent = (vault: VaultSpace) => {
    const dept = departments.find(d => d.id === vault.departmentId);
    const unit = units.find(u => u.id === vault.unitId);
    const storedWeapons = storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).filter(w => w.vaultSpaceId === vault.id && w.status === 'No Cofre');
    const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === vault.id);
    const storedMaterials = storage.getMateriais({ role: 'Geral' } as User).filter(
      m => m.vaultSpaceId === vault.id || (!m.vaultSpaceId && m.localGuarda === vault.code && m.unidadeId === vault.unitId)
    );
    const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === vault.id || e.localArmazenamento === vault.code);

    const typeLabel = vault.type === 'ARMAS'
      ? 'COFRE PARA ARMAS'
      : vault.type === 'MUNIÇÕES'
      ? 'COFRE PARA MUNIÇÕES'
      : vault.type === 'MATERIAIS'
      ? 'COFRE DE MATERIAIS'
      : 'PAIOL / COFRE PARA EXPLOSIVOS';

    let pagesHtml = '';

    if (vault.type === 'MUNIÇÕES') {
      if (storedAmmo.length === 0) {
        pagesHtml = `
          <div class="report-page">
            <div class="header">
              <div>
                <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO OFICIAL DE COFRE DE MUNIÇÕES</div>
              </div>
              <div class="badge">
                COFRE<br>
                <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
              <div class="meta-item"><label>Unidade:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
              <div class="meta-item"><label>Tipo de Cofre:</label> <span>${typeLabel}</span></div>
              <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
            </div>

            <div style="background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 8px; padding: 30px; text-align: center; margin: 40px 0; color: #475569; font-style: italic;">
              Espaço de guarda atualmente sem munições armazenadas no cofre.
            </div>

            <div class="signatures">
              <div class="sig-line">
                ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pelo Mapa de munições</span>
              </div>
             </div>

            <div class="footer">
              Relatório oficial emitido em ${new Date().toLocaleString('pt-BR')} através do Sistema de Armaria PCMG.
            </div>
          </div>
        `;
      } else {
        pagesHtml = storedAmmo.map((s, idx) => {
          const cal = storage.getCalibers().find(c => c.id === s.caliberId);
          const calName = cal ? cal.name : s.caliberId;
          const fab = s.fabricante || cal?.fabricante || 'CBC';
          const lote = s.loteMunicao || 'S/L';
          const tipo = s.tipoMunicao || cal?.tipo || 'COMUM';
          const peso = s.pesoMunicao || cal?.peso || 'N/I';
          const dest = s.destinacao || 'Operacional';
          const ano = s.anoFabricacao || 'N/A';
          const isLast = idx === storedAmmo.length - 1;

          return `
            <div class="report-page ${!isLast ? 'page-break' : ''}">
              <div class="header">
                <div>
                  <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                  <div class="subtitle">SISTEMA DE ARMARIA • FICHA INDIVIDUAL DE OBJETO NO COFRE</div>
                </div>
                <div class="badge">
                  LOCAL COFRE<br>
                  <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
                </div>
              </div>

              <div class="meta-box">
                <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
                <div class="meta-item"><label>Unidade Policial:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
                <div class="meta-item"><label>Tipo de Local:</label> <span>${typeLabel}</span></div>
                <div class="meta-item"><label>Item / Objeto no Cofre:</label> <span style="color: #0369a1;">Página ${idx + 1} de ${storedAmmo.length}</span></div>
              </div>

              <div class="section-title">DETALHES COMPLETOS DA MUNIÇÃO ARMAZENADA</div>

              <table class="detail-table">
                <tbody>
                  <tr>
                    <td class="dt-label" style="width: 25%;">Calibre:</td>
                    <td class="dt-value" style="font-size: 13px; font-weight: 900; color: #0f172a;">${calName}</td>
                    <td class="dt-label" style="width: 20%;">Quantidade no Cofre:</td>
                    <td class="dt-value" style="font-size: 13px; font-weight: 900; color: #0369a1;">${s.quantity.toLocaleString('pt-BR')} unidades</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Fabricante / Marca:</td>
                    <td class="dt-value">${fab}</td>
                    <td class="dt-label">Lote:</td>
                    <td class="dt-value font-mono" style="font-weight: bold; color: #b45309;">${lote}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Tipo de Projétil:</td>
                    <td class="dt-value">${tipo}</td>
                    <td class="dt-label">Peso do Projétil:</td>
                    <td class="dt-value">${peso}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Ano de Fabricação:</td>
                    <td class="dt-value">${ano}</td>
                    <td class="dt-label">Destinação:</td>
                    <td class="dt-value" style="font-weight: bold;">${dest}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Local no Cofre:</td>
                    <td class="dt-value" colspan="3"><strong>Espaço ${vault.code}</strong> • ${unit ? unit.name : ''}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Observações / Detalhes:</td>
                    <td class="dt-value" colspan="3" style="color: #475569; font-style: ${s.additionalInfo ? 'normal' : 'italic'};">
                      ${s.additionalInfo || 'Padrão / Sem informações adicionais registradas.'}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="info-footer-box">
                <strong>TERMO DE RESPONSABILIDADE E CONFERÊNCIA FÍSICA:</strong>
                Declaro para os devidos fins que o material bélico discriminado acima encontra-se devidamente conferido, acondicionado e registrado no local do cofre <strong>${vault.code}</strong> sob responsabilidade da equipe de Armaria desta Unidade.
              </div>

              <div class="signatures">
                <div class="sig-line">
                  ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                  <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pela Armaria</span>
                </div>
              </div>

              <div class="footer">
                Página ${idx + 1} de ${storedAmmo.length} • Relatório individual de objeto emitido em ${new Date().toLocaleString('pt-BR')} via Sistema de Armaria PCMG.
              </div>
            </div>
          `;
        }).join('');
      }
    } else if (vault.type === 'ARMAS') {
      if (storedWeapons.length === 0) {
        pagesHtml = `
          <div class="report-page">
            <div class="header">
              <div>
                <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO OFICIAL DE COFRE DE ARMAS</div>
              </div>
              <div class="badge">
                COFRE<br>
                <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
              <div class="meta-item"><label>Unidade:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
              <div class="meta-item"><label>Tipo de Cofre:</label> <span>${typeLabel}</span></div>
              <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
            </div>

            <div style="background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 8px; padding: 30px; text-align: center; margin: 40px 0; color: #475569; font-style: italic;">
              Espaço de guarda atualmente livre / sem armamentos armazenados.
            </div>

            <div class="signatures">
              <div class="sig-line">
                ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável</span>
              </div>
              
            </div>

            <div class="footer">
              Relatório oficial emitido em ${new Date().toLocaleString('pt-BR')} através do Sistema de Armaria PCMG.
            </div>
          </div>
        `;
      } else {
        pagesHtml = storedWeapons.map((w, idx) => {
          const isLast = idx === storedWeapons.length - 1;
          return `
            <div class="report-page ${!isLast ? 'page-break' : ''}">
              <div class="header">
                <div>
                  <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                  <div class="subtitle">SISTEMA DE ARMARIA • FICHA INDIVIDUAL DE ARMAMENTO NO COFRE</div>
                </div>
                <div class="badge">
                  LOCAL COFRE<br>
                  <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
                </div>
              </div>

              <div class="meta-box">
                <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
                <div class="meta-item"><label>Unidade Policial:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
                <div class="meta-item"><label>Tipo de Local:</label> <span>${typeLabel}</span></div>
                <div class="meta-item"><label>Item / Armamento no Cofre:</label> <span style="color: #b45309;">Página ${idx + 1} de ${storedWeapons.length}</span></div>
              </div>

              <div class="section-title">DETALHES COMPLETOS DO ARMAMENTO</div>

              <table class="detail-table">
                <tbody>
                  <tr>
                    <td class="dt-label" style="width: 25%;">Armamento / Tipo:</td>
                    <td class="dt-value" style="font-size: 13px; font-weight: 900; color: #0f172a;">${w.type} ${w.model}</td>
                    <td class="dt-label" style="width: 20%;">Número de Série:</td>
                    <td class="dt-value font-mono" style="font-size: 13px; font-weight: 900; color: #b45309;">${w.serialNumber}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Marca / Fabricante:</td>
                    <td class="dt-value">${w.manufacturer || (w as any).brand || 'N/I'}</td>
                    <td class="dt-label">Calibre:</td>
                    <td class="dt-value font-mono" style="font-weight: bold;">${w.caliber}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Estado / Condição:</td>
                    <td class="dt-value">${(w as any).condition || 'Bom'}</td>
                    <td class="dt-label">Situação:</td>
                    <td class="dt-value" style="font-weight: bold;">${(w as any).situation || 'Ativa'}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Destinação:</td>
                    <td class="dt-value">${(w as any).destination || (w as any).destinacao || 'Operacional'}</td>
                    <td class="dt-label">Registro SIGMA/SINARM:</td>
                    <td class="dt-value font-mono">${(w as any).sigma || (w as any).sinarm || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Local no Cofre:</td>
                    <td class="dt-value" colspan="3"><strong>Espaço ${vault.code}</strong> • Status: <strong>No Cofre</strong></td>
                  </tr>
                </tbody>
              </table>

              <div class="info-footer-box">
                <strong>CONFERÊNCIA FÍSICA DE ARMARIA:</strong>
                Armamento devidamente conferido em depósito físico, inventariado no local do cofre <strong>${vault.code}</strong>.
              </div>

              <div class="signatures">
                <div class="sig-line">
                  ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                  <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável</span>
                </div>
              
              </div>

              <div class="footer">
                Página ${idx + 1} de ${storedWeapons.length} • Relatório individual de armamento emitido em ${new Date().toLocaleString('pt-BR')} via Sistema de Armaria PCMG.
              </div>
            </div>
          `;
        }).join('');
      }
    } else if (vault.type === 'MATERIAIS') {
      if (storedMaterials.length === 0) {
        pagesHtml = `
          <div class="report-page">
            <div class="header">
              <div>
                <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO OFICIAL DE COFRE DE MATERIAIS</div>
              </div>
              <div class="badge">
                COFRE<br>
                <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
              <div class="meta-item"><label>Unidade:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
              <div class="meta-item"><label>Descrição Curta:</label> <span>${vault.descricaoCurta || 'Não informada'}</span></div>
              <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
            </div>

            <div style="background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 8px; padding: 30px; text-align: center; margin: 40px 0; color: #475569; font-style: italic;">
              Espaço de guarda atualmente sem materiais armazenados no cofre.
            </div>

            <div class="signatures">
              <div class="sig-line">
                ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pela Armaria</span>
              </div>
            </div>

            <div class="footer">
              Relatório oficial emitido em ${new Date().toLocaleString('pt-BR')} através do Sistema de Armaria PCMG.
            </div>
          </div>
        `;
      } else {
        pagesHtml = `
          <div class="report-page">
            <div>
              <div class="header">
                <div>
                  <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                  <div class="subtitle">SISTEMA DE ARMARIA • INVENTÁRIO OFICIAL DO COFRE DE MATERIAIS</div>
                </div>
                <div class="badge">
                  LOCAL COFRE<br>
                  <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
                </div>
              </div>

              <div class="meta-box">
                <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
                <div class="meta-item"><label>Unidade Policial:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
                <div class="meta-item"><label>Descrição Curta do Material:</label> <span>${vault.descricaoCurta || 'Geral'}</span></div>
                <div class="meta-item"><label>Total de Registros / Itens:</label> <span>${storedMaterials.length} item(ns) • ${storedMaterials.reduce((acc, m) => acc + Number(m.quantidade || 0), 0)} un.</span></div>
              </div>

              <div class="section-title">RELAÇÃO DE MATERIAIS ARMAZENADOS NO COFRE</div>

              <table class="detail-table">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <td class="dt-label">Material</td>
                    <td class="dt-label">Tipo</td>
                    <td class="dt-label">Série / Patr.</td>
                    <td class="dt-label">Disp. / Total</td>
                    <td class="dt-label">Cautelável?</td>
                  </tr>
                </thead>
                <tbody>
                  ${storedMaterials.map(m => `
                    <tr>
                      <td class="dt-value" style="font-weight:bold;">${m.nome}</td>
                      <td class="dt-value">${m.tipoMaterialNome || '-'}</td>
                      <td class="dt-value font-mono">${m.numeroSerie || '-'}</td>
                      <td class="dt-value font-mono"><strong>${m.quantidadeDisponivel}</strong> / ${m.quantidade} un</td>
                      <td class="dt-value">${m.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div>
              <div class="signatures">
                <div class="sig-line">
                  ${currentUser.name} (MASP: ${currentUser.masp || 'Armeiro'})<br>
                  <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pela Armaria</span>
                </div>
              </div>
              <div class="footer">
                Relatório emitido em ${new Date().toLocaleString('pt-BR')} via Sistema de Armaria PCMG.
              </div>
            </div>
          </div>
        `;
      }
    } else {
      if (storedExplosives.length === 0) {
        pagesHtml = `
          <div class="report-page">
            <div class="header">
              <div>
                <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO OFICIAL DE PAIOL / EXPLOSIVOS</div>
              </div>
              <div class="badge">
                PAIOL<br>
                <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
              <div class="meta-item"><label>Unidade:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
              <div class="meta-item"><label>Tipo:</label> <span>${typeLabel}</span></div>
              <div class="meta-item"><label>Data da Emissão:</label> <span>${new Date().toLocaleString('pt-BR')}</span></div>
            </div>

            <div style="background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 8px; padding: 30px; text-align: center; margin: 40px 0; color: #475569; font-style: italic;">
              Paiol atualmente livre / sem materiais explosivos armazenados.
            </div>

            <div class="signatures">
              <div class="sig-line">
                ${currentUser.name} (MASP: ${currentUser.masp || 'Explosivista'})<br>
                <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Responsável pelo Paiol</span>
              </div>
             
            </div>

            <div class="footer">
              Relatório oficial emitido em ${new Date().toLocaleString('pt-BR')} através do Sistema de Armaria PCMG.
            </div>
          </div>
        `;
      } else {
        pagesHtml = storedExplosives.map((e, idx) => {
          const isLast = idx === storedExplosives.length - 1;
          return `
            <div class="report-page ${!isLast ? 'page-break' : ''}">
              <div class="header">
                <div>
                  <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                  <div class="subtitle">SISTEMA DE ARMARIA • FICHA INDIVIDUAL DE MATERIAL EXPLOSIVO</div>
                </div>
                <div class="badge">
                  LOCAL PAIOL<br>
                  <span style="font-size: 16px; font-weight: 900; color: #000;">${vault.code}</span>
                </div>
              </div>

              <div class="meta-box">
                <div class="meta-item"><label>Departamento:</label> <span>${dept ? dept.name : 'N/A'} (${dept ? dept.code : ''})</span></div>
                <div class="meta-item"><label>Unidade Policial:</label> <span>${unit ? unit.name : 'N/A'}</span></div>
                <div class="meta-item"><label>Tipo de Local:</label> <span>${typeLabel}</span></div>
                <div class="meta-item"><label>Item / Material:</label> <span style="color: #dc2626;">Página ${idx + 1} de ${storedExplosives.length}</span></div>
              </div>

              <div class="section-title">DETALHES COMPLETOS DO MATERIAL EXPLOSIVO</div>

              <table class="detail-table">
                <tbody>
                  <tr>
                    <td class="dt-label" style="width: 25%;">Material / Nome:</td>
                    <td class="dt-value" style="font-size: 13px; font-weight: 900; color: #0f172a;">${e.nome}</td>
                    <td class="dt-label" style="width: 20%;">Quantidade:</td>
                    <td class="dt-value" style="font-size: 13px; font-weight: 900; color: #dc2626;">${e.quantidade} ${e.unidadeMedida}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Tipo / Subtipo:</td>
                    <td class="dt-value">${e.tipo} ${e.subtipo ? `(${e.subtipo})` : ''}</td>
                    <td class="dt-label">Lote:</td>
                    <td class="dt-value font-mono" style="font-weight: bold;">${e.lote}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Status:</td>
                    <td class="dt-value" style="font-weight: bold;">${e.status}</td>
                    <td class="dt-label">Validade:</td>
                    <td class="dt-value">${e.dataValidade || (e as any).validade || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Destinação / Finalidade:</td>
                    <td class="dt-value" colspan="3">${(e as any).destinacao || e.observacoes || 'Operacional'}</td>
                  </tr>
                  <tr>
                    <td class="dt-label">Local no Paiol:</td>
                    <td class="dt-value" colspan="3"><strong>Espaço ${vault.code}</strong> • ${unit ? unit.name : ''}</td>
                  </tr>
                </tbody>
              </table>

              <div class="info-footer-box">
                <strong>CONFERÊNCIA DE PAIOL:</strong>
                Material explosivo devidamente catalogado e armazenado conforme normas técnicas de segurança.
              </div>

              <div class="signatures">
                <div class="sig-line">
                  ${currentUser.name} (MASP: ${currentUser.masp || 'Explosivista'})<br>
                  <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Responsável pelo Paiol</span>
                </div>
               
              </div>

              <div class="footer">
                Página ${idx + 1} de ${storedExplosives.length} • Relatório individual emitido em ${new Date().toLocaleString('pt-BR')} via Sistema de Armaria PCMG.
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const docTitle = buildStandardDocumentTitle(
      'Inventário do Cofre (Cofres)',
      `Espaço ${vault.code}`,
      currentUser.name
    );

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtmlText(docTitle)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
          }
          .report-page {
            box-sizing: border-box;
            min-height: 260mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 10px 0;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .badge {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: monospace;
            text-align: right;
            font-size: 9px;
            font-weight: bold;
          }
          .meta-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
          }
          .meta-item label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; display: block; }
          .meta-item span { font-size: 11px; font-weight: bold; color: #0f172a; }
          .section-title {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: #0f172a;
            color: #fff;
            padding: 6px 10px;
            border-radius: 4px 4px 0 0;
            margin-top: 10px;
          }
          table.detail-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #cbd5e1;
            margin-bottom: 20px;
          }
          table.detail-table td {
            padding: 8px 10px;
            border: 1px solid #e2e8f0;
            font-size: 11px;
          }
          td.dt-label {
            background: #f8fafc;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            font-size: 10px;
          }
          td.dt-value {
            color: #1e293b;
          }
          .info-footer-box {
            background: #f8fafc;
            border-left: 3px solid #0f172a;
            padding: 8px 12px;
            font-size: 9.5px;
            color: #334155;
            line-height: 1.45;
            margin-bottom: 30px;
          }
          .signatures {
            margin-top: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            text-align: center;
            font-size: 10px;
          }
          .sig-line { justify-self: center; border-top: 1px solid #000; padding-top: 6px; font-weight: bold; }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 9px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
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
    const storedWeapons = getVaultWeaponsList(v.id);
    const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);
    const storedMaterials = storage.getMateriais({ role: 'Geral' } as User).filter(
      m => m.vaultSpaceId === v.id || (!m.vaultSpaceId && m.localGuarda === v.code && m.unidadeId === v.unitId)
    );
    const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);
    const isArmas = v.type === 'ARMAS';
    const isMunicoes = v.type === 'MUNIÇÕES';
    const isMateriais = v.type === 'MATERIAIS';
    const isMyUnitVault = v.unitId === currentUser.unitId || (!v.unitId && v.departmentId === effectiveDeptId);
    const isScopedArmeiroVault = isVaultInArmeiroScope(v);
    const canEditThisVault = isGeral ||
      (isArmeiro && isScopedArmeiroVault && (v.type === 'ARMAS' || v.type === 'MUNIÇÕES' || v.type === 'MATERIAIS')) ||
      (isExplosivista && isMyUnitVault && v.type === 'EXPLOSIVOS') ||
      isAdmin;
    const canDeleteThisVault = isGeral ||
      (isArmeiro && isScopedArmeiroVault && (v.type === 'ARMAS' || v.type === 'MUNIÇÕES' || v.type === 'MATERIAIS')) ||
      (isExplosivista && isMyUnitVault && v.type === 'EXPLOSIVOS') ||
      isAdmin;

    return (
      <div
        key={v.id}
        className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm transition hover:border-slate-600 ${
          isArmas
            ? 'border-amber-900/30 hover:border-amber-500/50'
            : isMunicoes
            ? 'border-cyan-900/30 hover:border-cyan-500/50'
            : isMateriais
            ? 'border-emerald-900/30 hover:border-emerald-500/50'
            : 'border-red-900/30 hover:border-red-500/50'
        }`}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-lg font-black text-slate-100 font-mono tracking-wider">
                  {v.code}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center space-x-1 ${
                    isArmas
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                      : isMunicoes
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                      : isMateriais
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                      : 'bg-red-950/80 text-red-300 border-red-800/80'
                  }`}
                >
                  {isArmas ? (
                    <Crosshair className="w-3 h-3 text-amber-400" />
                  ) : isMunicoes ? (
                    <Disc className="w-3 h-3 text-cyan-400" />
                  ) : isMateriais ? (
                    <Package className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Bomb className="w-3 h-3 text-red-400" />
                  )}
                  <span>
                    {isArmas
                      ? 'Cofre para Armas'
                      : isMunicoes
                      ? 'Cofre para Munições'
                      : isMateriais
                      ? 'Cofre de Materiais'
                      : 'Paiol / Cofre de Explosivos'}
                  </span>
                </span>
              </div>
              {isMateriais && v.descricaoCurta && (
                <p className="mt-1.5 text-xs font-semibold text-emerald-300">
                  {v.descricaoCurta}
                </p>
              )}
              <div className="mt-1 text-xs text-slate-300">
                <p className="font-semibold text-slate-200">{unit ? unit.name : 'Unidade N/A'}</p>
                <p className="text-[11px] text-slate-400">{dept ? dept.name : ''}</p>
              </div>
            </div>

            {canManageVault && (canEditThisVault || canDeleteThisVault) && (
              <div className="flex items-center space-x-1 shrink-0">
                {canEditThisVault && (
                  <button
                    onClick={() => handleOpenEditModal(v)}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title="Editar Local do Cofre"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                {canDeleteThisVault && (
                  <button
                    onClick={() => handleDelete(v)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                    title="Excluir Local"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
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
            ) : isMateriais ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  Itens no cofre:
                </span>
                <span className={`font-mono font-bold ${storedMaterials.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {storedMaterials.length > 0
                    ? `${storedMaterials.reduce((acc, m) => acc + Number(m.quantidade || 0), 0)} un (${storedMaterials.length} reg.)`
                    : 'Cofre Livre'
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

        {/* Card Actions: View Details, Edit and Print PDF */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              setVaultDetailsTab('ITEMS');
              setSelectedVaultForDetails(v);
            }}
            className="flex-1 bg-slate-800/90 hover:bg-slate-800 text-slate-100 hover:text-amber-400 font-bold text-xs py-2 px-3 rounded-xl border border-slate-700/80 flex items-center justify-center space-x-1.5 transition shadow-sm"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Detalhes</span>
          </button>

          {canEditThisVault && (
            <button
              onClick={() => handleOpenEditModal(v)}
              className="py-2 px-3 bg-slate-800/90 hover:bg-amber-500/20 text-slate-200 hover:text-amber-400 font-bold text-xs rounded-xl border border-slate-700/80 flex items-center space-x-1 transition shadow-sm"
              title="Editar este cofre"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>
          )}

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
              Separação física e controle de locais para armamentos, munições, materiais e explosivos por departamento e unidade.
            </p>
          </div>
        </div>

        {canManageVault && (
          <div className="flex flex-wrap items-center gap-2">
            {!isExplosivista && (
              <button
                onClick={() => handleOpenModal('ARMAS')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Cofre de Armas</span>
              </button>
            )}
            {!isExplosivista && (
              <button
                onClick={() => handleOpenModal('MUNIÇÕES')}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Cofre de Munições</span>
              </button>
            )}
            {!isExplosivista && (
              <button
                onClick={() => handleOpenModal('MATERIAIS')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo Cofre de Materiais</span>
              </button>
            )}
            {!isArmeiro && (
              <button
                onClick={() => handleOpenModal('EXPLOSIVOS')}
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Cofre de Explosivos</span>
              </button>
            )}
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

            {/* Filter: Cofre de Materiais */}
            <button
              type="button"
              onClick={() => setTypeFilter('MATERIAIS')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                typeFilter === 'MATERIAIS'
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-800 shadow-sm'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cofre de Materiais</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                typeFilter === 'MATERIAIS' ? 'bg-emerald-900/80 text-emerald-200' : 'bg-slate-900 text-slate-500'
              }`}>
                {totalMateriais}
              </span>
            </button>

            {/* Filter: Paiol / Cofre para Explosivos */}
            {!isArmeiro && (
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
            )}

          </div>

          {/* Quick Unit Filter (Optional dropdown) */}
          {((!isArmeiro && !isExplosivista) || isDeptArmeiro) && (
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
          )}
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
          const deptVaults = userScopedVaults.filter(v => {
            if (v.departmentId && v.departmentId !== dept.id) return false;
            if (!v.departmentId && v.unitId) {
              const uObj = units.find(u => u.id === v.unitId);
              if (uObj && uObj.departmentId !== dept.id) return false;
            }

            // Type filter
            if (typeFilter !== 'ALL' && v.type !== typeFilter) return false;

            // Unit filter
            if (selectedUnitFilter !== 'ALL' && v.unitId !== selectedUnitFilter) return false;

            // Search query filter
            if (!term) return true;

            const unit = units.find(u => u.id === v.unitId);
            const storedWeapons = getVaultWeaponsList(v.id);
            const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);
            const storedMaterials = storage.getMateriais({ role: 'Geral' } as User).filter(
              m => m.vaultSpaceId === v.id || (!m.vaultSpaceId && m.localGuarda === v.code && m.unidadeId === v.unitId)
            );
            const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);

            const matchesBasic = v.code.toLowerCase().includes(term) ||
              v.type.toLowerCase().includes(term) ||
              (v.descricaoCurta && v.descricaoCurta.toLowerCase().includes(term)) ||
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

            const matchesMaterials = storedMaterials.some(m =>
              (m.nome || '').toLowerCase().includes(term) ||
              (m.tipoMaterialNome || '').toLowerCase().includes(term) ||
              (m.numeroSerie || '').toLowerCase().includes(term)
            );

            const matchesExplosives = storedExplosives.some(e =>
              (e?.nome || '').toLowerCase().includes(term) ||
              (e?.tipo || '').toLowerCase().includes(term) ||
              (e?.subtipo && e.subtipo.toLowerCase().includes(term)) ||
              (e?.lote || '').toLowerCase().includes(term)
            );

            return matchesBasic || matchesWeapons || matchesAmmo || matchesMaterials || matchesExplosives;
          });

          // Separate by type within this department
          const armasVaults = deptVaults.filter(v => v.type === 'ARMAS');
          const municoesVaults = deptVaults.filter(v => v.type === 'MUNIÇÕES');
          const materiaisVaults = deptVaults.filter(v => v.type === 'MATERIAIS');
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
                    <span className="text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5">
                      <Package className="w-3 h-3 text-emerald-400" />
                      <span>{materiaisVaults.length} Materiais</span>
                    </span>
                    {!isArmeiro && (
                      <span className="text-xs bg-red-950/60 text-red-300 border border-red-800/60 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5">
                        <Bomb className="w-3 h-3 text-red-400" />
                        <span>{explosivosVaults.length} Explosivos</span>
                      </span>
                    )}
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
                              <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg flex items-center justify-center">
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

                      {/* SECTION 2B: COFRES PARA MATERIAIS */}
                      {(typeFilter === 'ALL' || typeFilter === 'MATERIAIS') && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-emerald-900/30">
                            <div className="flex items-center space-x-2.5">
                              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg flex items-center justify-center">
                                <Package className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
                                  Cofres de Materiais
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                  Locais e armários destinados à guarda de equipamentos e materiais operacionais
                                </p>
                              </div>
                            </div>

                            <span className="text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-full">
                              {materiaisVaults.length} {materiaisVaults.length === 1 ? 'espaço' : 'espaços'}
                            </span>
                          </div>

                          {materiaisVaults.length === 0 ? (
                            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                              Nenhum cofre de materiais cadastrado neste departamento.
                              {canManageVault && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenModal('MATERIAIS')}
                                  className="mt-2 block mx-auto text-emerald-400 hover:text-emerald-300 font-bold underline"
                                >
                                  + Cadastrar cofre de materiais
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {materiaisVaults.map(renderVaultCard)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SECTION 3: PAIÓIS / COFRES PARA EXPLOSIVOS */}
                      {!isArmeiro && (typeFilter === 'ALL' || typeFilter === 'EXPLOSIVOS') && (
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
        const storedWeapons = getVaultWeaponsList(v.id);
        const storedAmmo = storage.getAmmoStocks({ role: 'Geral' } as User).filter(s => s.vaultSpaceId === v.id);
        const storedMaterials = storage.getMateriais({ role: 'Geral' } as User).filter(
          m => m.vaultSpaceId === v.id || (!m.vaultSpaceId && m.localGuarda === v.code && m.unidadeId === v.unitId)
        );
        const storedExplosives = storage.getExplosivos({ role: 'Geral' } as User).filter(e => e.cofreId === v.id || e.localArmazenamento === v.code);
        const vaultMovements = storage.getMovimentacoesExplosivosByVault(v.id || v.code);
        const vaultAmmoMovements = storage.getAmmoMovements({ role: 'Geral' } as User).filter(m => m.vaultSpaceId === v.id);
        const allCautelasMunicoes = storage.getCautelasMunicoes();
        const vaultAmmoCautelas = allCautelasMunicoes.filter(c => c.vaultSpaceId === v.id || (!c.vaultSpaceId && c.unitId === v.unitId));

        const isArmas = v.type === 'ARMAS';
        const isMunicoes = v.type === 'MUNIÇÕES';
        const isMateriais = v.type === 'MATERIAIS';
        const isExplosivos = v.type === 'EXPLOSIVOS';

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-4xl shadow-2xl space-y-5 my-8 max-h-[92vh] flex flex-col">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-2xl border ${
                    isArmas
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : isMunicoes
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      : isMateriais
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {isArmas ? (
                      <Crosshair className="w-6 h-6 text-amber-400" />
                    ) : isMunicoes ? (
                      <Disc className="w-6 h-6 text-cyan-400" />
                    ) : isMateriais ? (
                      <Package className="w-6 h-6 text-emerald-400" />
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
                            : isMateriais
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : 'bg-red-950/80 text-red-300 border-red-800'
                        }`}
                      >
                        {isArmas ? (
                          <Crosshair className="w-3 h-3 text-amber-400" />
                        ) : isMunicoes ? (
                          <Disc className="w-3 h-3 text-cyan-400" />
                        ) : isMateriais ? (
                          <Package className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Bomb className="w-3 h-3 text-red-400" />
                        )}
                        <span>
                          {isArmas
                            ? 'Cofre para Armas'
                            : isMunicoes
                            ? 'Cofre para Munições'
                            : isMateriais
                            ? 'Cofre de Materiais'
                            : 'Paiol / Cofre de Explosivos'}
                        </span>
                      </span>
                    </div>
                    {isMateriais && v.descricaoCurta && (
                      <p className="text-xs font-semibold text-emerald-300 mt-1">{v.descricaoCurta}</p>
                    )}
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

              {/* Subtabs for Munições & Explosives Vault: Content vs Movement/Cautela History */}
              {(isExplosivos || isMunicoes) && (
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVaultDetailsTab('ITEMS')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                      vaultDetailsTab === 'ITEMS'
                        ? (isMunicoes ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm' : 'bg-red-950 text-red-300 border border-red-800 shadow-sm')
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>{isMunicoes ? `Munições no Cofre (${storedAmmo.length})` : `Materiais no Paiol (${storedExplosives.length})`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVaultDetailsTab('HISTORICO')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                      vaultDetailsTab === 'HISTORICO'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {isMunicoes 
                        ? `Histórico de Movimentações e Cautelas (${vaultAmmoMovements.length + vaultAmmoCautelas.length})` 
                        : `Histórico de Movimentações deste Local (${vaultMovements.length})`}
                    </span>
                  </button>
                </div>
              )}

              {/* Modal Content Details */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {errorMsg && (
                  <div className="bg-red-950/60 border border-red-800 text-red-200 text-xs px-3.5 py-2.5 rounded-xl flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs px-3.5 py-2.5 rounded-xl flex items-center space-x-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}
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
                      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Armamento</th>
                              <th className="py-2.5 px-3">Nº de Série</th>
                              <th className="py-2.5 px-3">Calibre</th>
                              <th className="py-2.5 px-3">Status / Policial</th>
                              <th className="py-2.5 px-3 text-center">Tiros</th>
                              <th className="py-2.5 px-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {storedWeapons.map((w) => {
                              const { activeCaut, custodyUserName } = getCustodyNamesForWeapon(w);
                              const isComOPolicial = w.status === 'Com o Policial';
                              const isAcautelada = w.status === 'Acautelada' || (Boolean(activeCaut) && !isComOPolicial && w.status !== 'No Cofre');
                              return (
                                <tr key={w.id} className="hover:bg-slate-900/50">
                                  <td className="py-2.5 px-3 font-semibold text-slate-100">
                                    {w.type} {w.manufacturer} {w.model}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{w.serialNumber}</td>
                                  <td className="py-2.5 px-3 text-slate-300">{w.caliber}</td>
                                  <td className="py-2.5 px-3">
                                    {isComOPolicial ? (
                                      <div className="space-y-0.5">
                                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                          Com o Policial
                                        </span>
                                        <div className="text-[11px] text-slate-300">{custodyUserName}</div>
                                      </div>
                                    ) : isAcautelada ? (
                                      <div className="space-y-0.5">
                                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                          Acautelada
                                        </span>
                                        <div className="text-[11px] text-slate-300">{custodyUserName}</div>
                                      </div>
                                    ) : (
                                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        {w.status}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-300">
                                    {w.shotCount || 0}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                      {canOperateWeaponCustody && isAcautelada && !isComOPolicial && (
                                        <button
                                          type="button"
                                          disabled={custodyActionLoading}
                                          onClick={() => handleDarSaidaWeapon(w)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-sm disabled:opacity-50"
                                          title="Registrar saída da arma do cofre para o policial"
                                        >
                                          <ArrowUpRight className="w-3.5 h-3.5" />
                                          <span>Dar Saída</span>
                                        </button>
                                      )}
                                      {canOperateWeaponCustody && isComOPolicial && (
                                        <button
                                          type="button"
                                          disabled={custodyActionLoading}
                                          onClick={() => handleOpenDarEntradaModal(w)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm disabled:opacity-50"
                                          title="Registrar retorno da arma ao cofre e informar disparos"
                                        >
                                          <ArrowDownLeft className="w-3.5 h-3.5" />
                                          <span>Dar Entrada</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenWeaponHistory(w)}
                                        className="inline-flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                                        title="Ver detalhes e histórico de saídas/retornos desta arma"
                                      >
                                        <History className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Histórico</span>
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
                  </>
                ) : isMunicoes ? (
                  vaultDetailsTab === 'ITEMS' ? (
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
                                <th className="py-2.5 px-3">Fabricante / Lote</th>
                                <th className="py-2.5 px-3">Tipo / Peso</th>
                                <th className="py-2.5 px-3">Destinação</th>
                                <th className="py-2.5 px-3 text-right">Quantidade</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80">
                              {storedAmmo.map((s) => {
                                const cal = storage.getCalibers().find(c => c.id === s.caliberId);
                                return (
                                  <tr key={s.id} className="hover:bg-slate-900/50">
                                    <td className="py-2.5 px-3 font-bold text-slate-100 font-mono">
                                      {cal?.name || s.caliberId}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      <span className="text-amber-400 font-semibold">{s.fabricante || cal?.fabricante || 'N/I'}</span>
                                      <span className="text-slate-500 mx-1">•</span>
                                      <span className="font-mono text-slate-200">Lote: {s.loteMunicao || 'S/L'}</span>
                                      {s.anoFabricacao && <span className="text-slate-500 text-[10px] ml-1">({s.anoFabricacao})</span>}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      <span>{s.tipoMunicao || cal?.tipo || 'Padrão'}</span>
                                      {(s.pesoMunicao || cal?.peso) && (
                                        <span className="text-slate-400 text-[10px] ml-1 font-mono">({s.pesoMunicao || cal?.peso})</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                                      {s.destinacao || 'Operacional'}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold font-mono text-cyan-400">
                                      {s.quantity} un
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    /* HISTORICO DE MOVIMENTAÇÕES E CAUTELAS DO COFRE DE MUNIÇÃO */
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <History className="w-4 h-4 text-amber-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Histórico de Movimentações e Cautelas do Cofre ({v.code})
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-400">
                          {vaultAmmoMovements.length + vaultAmmoCautelas.length} Registros
                        </span>
                      </div>

                      {vaultAmmoMovements.length === 0 && vaultAmmoCautelas.length === 0 ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                          Nenhuma movimentação ou cautela registrada para este cofre até o momento.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Tabela de Cautelas de Munições Vinculadas a este Cofre */}
                          {vaultAmmoCautelas.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                                <Disc className="w-3.5 h-3.5" />
                                <span>Cautelas de Munição ({vaultAmmoCautelas.length})</span>
                              </div>
                              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs text-slate-300">
                                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                                    <tr>
                                      <th className="py-2.5 px-3">Data / Hora</th>
                                      <th className="py-2.5 px-3">Status / Modalidade</th>
                                      <th className="py-2.5 px-3">Calibre / Fab / Lote</th>
                                      <th className="py-2.5 px-3 text-center">Qtd</th>
                                      <th className="py-2.5 px-3">Policial Solicitante</th>
                                      <th className="py-2.5 px-3">Armeiro Autorizador</th>
                                      <th className="py-2.5 px-3">Motivo / Destino</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                                    {vaultAmmoCautelas.map((c) => {
                                      const isDefinitive = c.seraDevolvida === false;
                                      return (
                                        <tr key={c.id} className="hover:bg-slate-900/50">
                                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                                            {c.createdAt ? new Date(c.createdAt).toLocaleString('pt-BR') : 'N/A'}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <div className="flex flex-col space-y-0.5">
                                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border w-max ${
                                                c.status === 'AUTORIZADA'
                                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                  : c.status === 'DEVOLVIDA'
                                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                                  : c.status === 'RECUSADA'
                                                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                              }`}>
                                                {c.status}
                                              </span>
                                              {isDefinitive ? (
                                                <span className="text-[9px] text-red-400 font-bold">Baixa Definitiva</span>
                                              ) : (
                                                <span className="text-[9px] text-sky-400">Com Devolução</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2 px-3">
                                            <div className="font-bold text-amber-400">{c.caliberName}</div>
                                            <div className="text-[10px] text-slate-400">
                                              {c.fabricante ? `${c.fabricante} ` : ''}
                                              {c.loteMunicao ? `(Lote: ${c.loteMunicao})` : ''}
                                            </div>
                                          </td>
                                          <td className="py-2 px-3 text-center font-bold text-emerald-400">
                                            {c.quantity} un
                                          </td>
                                          <td className="py-2 px-3 font-sans">
                                            <div className="font-semibold text-slate-200">{c.requesterName || 'Policial'}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">MASP: {c.requesterMasp || 'N/A'}</div>
                                          </td>
                                          <td className="py-2 px-3 font-sans">
                                            <div className="font-semibold text-slate-200">{c.armorerName || 'Aguardando'}</div>
                                            {c.armorerMasp && <div className="text-[10px] text-slate-400 font-mono">MASP: {c.armorerMasp}</div>}
                                          </td>
                                          <td className="py-2 px-3 font-sans text-slate-300">
                                            {c.reason || 'Operacional'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Tabela de Movimentações Físicas de Estoque */}
                          {vaultAmmoMovements.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
                                <History className="w-3.5 h-3.5" />
                                <span>Movimentações de Estoque do Cofre (Entradas, Saídas e Retornos) ({vaultAmmoMovements.length})</span>
                              </div>
                              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs text-slate-300">
                                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                                    <tr>
                                      <th className="py-2.5 px-3">Data / Hora</th>
                                      <th className="py-2.5 px-3">Operação</th>
                                      <th className="py-2.5 px-3">Calibre / Detalhes</th>
                                      <th className="py-2.5 px-3 text-center">Quantidade</th>
                                      <th className="py-2.5 px-3">Policial / Armeiro</th>
                                      <th className="py-2.5 px-3">Motivo / Observação</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                                    {vaultAmmoMovements.map((m) => {
                                      const cal = storage.getCalibers().find(c => c.id === m.caliberId);
                                      const isEntrada = m.type === 'Entrada';
                                      return (
                                        <tr key={m.id} className="hover:bg-slate-900/50">
                                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                                            {new Date(m.createdAt).toLocaleString('pt-BR')}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                              isEntrada
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                                            }`}>
                                              {m.type}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3">
                                            <div className="font-bold text-amber-400">{cal?.name || m.caliberId}</div>
                                            {(m.fabricante || m.loteMunicao) && (
                                              <div className="text-[10px] text-slate-400">
                                                {m.fabricante} {m.loteMunicao ? `(Lote: ${m.loteMunicao})` : ''}
                                              </div>
                                            )}
                                          </td>
                                          <td className={`py-2 px-3 text-center font-bold ${isEntrada ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {isEntrada ? '+' : '-'}{m.quantity} un
                                          </td>
                                          <td className="py-2 px-3 font-sans">
                                            <div className="font-semibold text-slate-200">{m.responsibleName || 'Sistema'}</div>
                                            {m.responsibleMasp && <div className="text-[10px] text-slate-400 font-mono">MASP: {m.responsibleMasp}</div>}
                                          </td>
                                          <td className="py-2 px-3 font-sans text-slate-300">
                                            <div>{m.recipientOrReason}</div>
                                            {m.observation && <div className="text-[10px] text-slate-400 italic">{m.observation}</div>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                ) : isMateriais ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Materiais Armazenados no Cofre ({v.code})
                      </h4>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {storedMaterials.length} Item(ns) Cadastrado(s)
                      </span>
                    </div>

                    {storedMaterials.length === 0 ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs italic">
                        Este cofre de materiais está atualmente livre / sem materiais armazenados.
                      </div>
                    ) : (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Material & Série</th>
                              <th className="py-2.5 px-3">Tipo</th>
                              <th className="py-2.5 px-3 text-center">Disp. / Total</th>
                              <th className="py-2.5 px-3 text-center">Em Uso</th>
                              <th className="py-2.5 px-3">Passivo Cautela</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {storedMaterials.map((m) => (
                              <tr key={m.id} className="hover:bg-slate-900/50">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-100">{m.nome}</div>
                                  {m.numeroSerie && <div className="text-[10px] font-mono text-amber-400">S/N: {m.numeroSerie}</div>}
                                </td>
                                <td className="py-2.5 px-3 text-slate-300">{m.tipoMaterialNome || '-'}</td>
                                <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-400">
                                  {m.quantidadeDisponivel} / {m.quantidade} un
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono text-amber-300">
                                  {m.quantidadeEmUso} un
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    m.passivoDepositoPoliciais !== false
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}>
                                    {m.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}
                                  </span>
                                </td>
                              </tr>
                            ))}
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
                {isExplosivista ? (
                  <div className="p-3 bg-red-950/70 border border-red-500 rounded-xl flex items-center space-x-3">
                    <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
                      <Bomb className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-red-200">Paiol / Cofre de Explosivos</p>
                      <p className="text-[10px] text-slate-300">
                        Perfil Explosivista: gerenciamento restrito a espaços para materiais explosivos.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                        Para custódia de armamentos da unidade
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
                        Para estocagem de cartuchos da unidade
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setType('MATERIAIS')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        type === 'MATERIAIS'
                          ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1.5">
                        <Package className={`w-4 h-4 ${type === 'MATERIAIS' ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold text-slate-100">Cofre de Materiais</span>
                      </div>
                      <span className="text-[10px] text-slate-400 leading-tight">
                        Para equipamentos, coletes e materiais táticos
                      </span>
                    </button>

                    {!isArmeiro && (
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
                    )}
                  </div>
                )}
              </div>

              {type === 'MATERIAIS' && (
                <div>
                  <label className="block text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-1">
                    Descrição Curta do Material *
                  </label>
                  <input
                    type="text"
                    value={descricaoCurta}
                    onChange={(e) => setDescricaoCurta(e.target.value)}
                    placeholder="Ex: Coletes Balísticos III-A, Algemas e Rádios"
                    maxLength={180}
                    className="w-full bg-slate-950 border border-emerald-800/80 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Resumo dos materiais guardados neste cofre (exibido no módulo de Materiais).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Departamento
                </label>
                {isArmeiro || isExplosivista ? (
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-300">
                    {departments.find(d => d.id === deptId)?.name || departments.find(d => d.id === effectiveDeptId)?.name || userUnit?.departmentId || 'Departamento da Unidade'}
                  </div>
                ) : (
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
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Unidade
                </label>
                {(isArmeiro && !isDeptArmeiro) || isExplosivista ? (
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm flex items-center justify-between">
                    <div>
                      <span className="text-slate-100 font-semibold">
                        {userUnit?.name || units.find(u => u.id === unitId)?.name || 'Sua Unidade'}
                      </span>
                      <p className="text-[10px] text-amber-400 mt-0.5">
                        {isArmeiro 
                          ? 'Cofre vinculado automaticamente à sua unidade de lotação.' 
                          : 'Paiol vinculado automaticamente à sua unidade de lotação.'}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                      Sua Unidade
                    </span>
                  </div>
                ) : (
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    disabled={!isGeral && !isDeptArmeiro && !isAdmin && Boolean(currentUser.unitId)}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                      !isGeral && !isDeptArmeiro && !isAdmin && Boolean(currentUser.unitId)
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-amber-500'
                    }`}
                  >
                    {availableUnitsForModal.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
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

      {/* Modal Dar Entrada (Informar Tiros Disparados) */}
      {darEntradaTargetWeapon && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Dar Entrada no Armamento</h3>
                  <p className="text-xs font-mono text-amber-400 font-bold">
                    {darEntradaTargetWeapon.type} {darEntradaTargetWeapon.manufacturer} {darEntradaTargetWeapon.model} • {darEntradaTargetWeapon.serialNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDarEntradaTargetWeapon(null)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDarEntrada} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quantidade de tiros disparados no retorno
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={darEntradaShotsInput}
                  onChange={(e) => setDarEntradaShotsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="0"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Caso tenham sido realizados disparos, a quantidade será acrescentada automaticamente ao total de tiros da arma ({darEntradaTargetWeapon.shotCount || 0} atualmente).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDarEntradaTargetWeapon(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={custodyActionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{custodyActionLoading ? 'Salvando...' : 'Confirmar Entrada'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Histórico de Saídas e Entradas da Arma */}
      {weaponDetailHistoryTarget && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <History className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-100">Detalhes e Histórico de Saídas da Arma</h3>
                  <p className="text-xs font-mono text-amber-400 font-bold">
                    {weaponDetailHistoryTarget.type} {weaponDetailHistoryTarget.manufacturer} {weaponDetailHistoryTarget.model} • Série: {weaponDetailHistoryTarget.serialNumber} • Total de Tiros: {weaponDetailHistoryTarget.shotCount || 0}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeaponDetailHistoryTarget(null)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {weaponDetailHistoryRecords.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 italic">
                  Nenhuma saída ou entrada registrada para esta arma até o momento.
                </div>
              ) : (
                weaponDetailHistoryRecords.map((rec) => (
                  <div key={rec.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-slate-100">
                        {rec.weaponName} <span className="text-amber-400 font-mono">({rec.weaponSerialNumber})</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        rec.returnDate
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                      }`}>
                        {rec.returnDate ? 'Retornou ao Cofre' : 'Com o Policial'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                      <p>Policial com a cautela: <strong className="text-slate-100">{rec.custodyUserName}</strong></p>
                      <p>Autorizado por: <strong className="text-slate-100">{rec.authorizerUserName}</strong></p>
                      <p>Data de Saída: <span className="font-mono text-amber-300">{new Date(rec.exitDate).toLocaleString('pt-BR')}</span></p>
                      <p>
                        Data de Retorno:{' '}
                        {rec.returnDate ? (
                          <span className="font-mono text-emerald-300">{new Date(rec.returnDate).toLocaleString('pt-BR')}</span>
                        ) : (
                          <span className="italic text-sky-300">Em posse do policial</span>
                        )}
                      </p>
                      <p>Tiros disparados: <strong className="font-mono text-amber-400">{rec.shotsFired || 0}</strong></p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
