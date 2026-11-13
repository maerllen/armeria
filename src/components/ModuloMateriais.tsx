import React, { useState, useMemo, useEffect } from 'react';
import {
  Material,
  TipoMaterial,
  CautelaMaterial,
  MaterialTransfer,
  VaultSpace,
  User,
  Department,
  Unit
} from '../types';
import { storage } from '../services/storage';
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
  Send
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
  const [activeTab, setActiveTab] = useState<'estoque' | 'cautelas' | 'tipos'>('estoque');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('');
  const [cautelaStatusFilter, setCautelaStatusFilter] = useState<string>('todas');
  const [selectedCautelaMaterialId, setSelectedCautelaMaterialId] = useState<string>('');
  const [selectedVaultDetailsId, setSelectedVaultDetailsId] = useState<string | null>(null);

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
  const [vaultsList, setVaultsList] = useState<VaultSpace[]>(() =>
    (vaultSpacesProp && vaultSpacesProp.length > 0) ? vaultSpacesProp : storage.getVaultSpaces(currentUser)
  );
  const [receiveTransferTarget, setReceiveTransferTarget] = useState<MaterialTransfer | null>(null);
  const [receiveVaultId, setReceiveVaultId] = useState('');
  const [receiveObs, setReceiveObs] = useState('');

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
    const otherUnitSameDept = units.find(
      u => u.departmentId === mat.departamentoId && u.id !== mat.unidadeId
    );
    const fallbackDept = departments.find(d => d.id !== mat.departamentoId) || departments[0];
    const defaultDeptId = otherUnitSameDept ? mat.departamentoId : (fallbackDept?.id || mat.departamentoId || '');
    const defaultUnitId = otherUnitSameDept
      ? otherUnitSameDept.id
      : (units.find(u => u.departmentId === defaultDeptId && u.id !== mat.unidadeId)?.id ||
         units.find(u => u.departmentId === defaultDeptId)?.id ||
         '');
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

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const destDept = departments.find(d => d.id === transferDestDeptId);
      const destUnit = units.find(u => u.id === transferDestUnitId);
      const destArmorer = allUsers.find(u => u.id === transferDestArmorerId);
      const transp = allUsers.find(u => u.id === transferTransporterId) || destArmorer || currentUser;

      await storage.transferMaterial({
        originDepartmentId: transferMaterialTarget.departamentoId || currentUser?.departmentId,
        originDepartmentName: departments.find(d => d.id === transferMaterialTarget.departamentoId)?.name || currentUser?.departmentName,
        originUnitId: transferMaterialTarget.unidadeId || currentUser?.unitId,
        originUnitName: units.find(u => u.id === transferMaterialTarget.unidadeId)?.name || currentUser?.unitName,
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
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab('estoque')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'estoque'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Estoque de Materiais ({materiais.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cautelas')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
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
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
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
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              activeTab === 'estoque'
                ? "Buscar material por nome, número de série, local de guarda..."
                : activeTab === 'cautelas'
                ? "Buscar cautela por protocolo, material, policial ou destinatário externo..."
                : "Buscar tipos de material..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {activeTab === 'estoque' && (
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

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        Disp.: <strong className="text-slate-200">{availUnitsInVault}</strong> un
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectedVaultDetailsId(vault.id)}
                        className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Detalhes do Cofre</span>
                      </button>
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
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedVaultDetailsId('__LEGACY__')}
                      className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Detalhes do Cofre</span>
                    </button>
                  </div>
                </div>
              )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
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

            <form onSubmit={handleSaveMaterial} className="p-6 space-y-4 text-xs sm:text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
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

            <form onSubmit={handleSaveTipoMaterial} className="p-6 space-y-4 text-xs sm:text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
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

            <form onSubmit={handleSaveCautela} className="p-6 space-y-4 text-xs sm:text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
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

            <form onSubmit={handleSaveDevolucao} className="p-6 space-y-4 text-xs sm:text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
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

            <form onSubmit={handleSaveTransfer} className="p-6 space-y-4 text-xs">
              
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
                      setTransferDestDeptId(e.target.value);
                      const uList = units.filter(u => u.departmentId === e.target.value);
                      setTransferDestUnitId(uList[0]?.id || '');
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                    required
                  >
                    <option value="">Selecione...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Unidade de Destino *
                  </label>
                  <select
                    value={transferDestUnitId}
                    onChange={(e) => setTransferDestUnitId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                    required
                  >
                    <option value="">Selecione...</option>
                    {units
                      .filter(u => !transferDestDeptId || u.departmentId === transferDestDeptId)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
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
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Selecione o armeiro...</option>
                    {allUsers
                      .filter(u => !transferDestUnitId || u.unitId === transferDestUnitId)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - {u.role}
                        </option>
                      ))}
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
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp}) - {u.unitName || u.role}
                      </option>
                    ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
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
            <form onSubmit={handleConfirmReceiveTransfer} className="p-6 space-y-4 text-xs">
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
