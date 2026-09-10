import React, { useState, useMemo } from 'react';
import {
  Material,
  TipoMaterial,
  CautelaMaterial,
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
  Info
} from 'lucide-react';
import { formatMasp } from '../utils/masks';
import { MaterialReceiptModal } from './MaterialReceiptModal';

interface MaterialModuleProps {
  currentUser: User | null;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  onRefresh: () => void;
}

export const MaterialModule: React.FC<MaterialModuleProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'estoque' | 'cautelas' | 'tipos'>('estoque');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('');
  const [cautelaStatusFilter, setCautelaStatusFilter] = useState<string>('todas');

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
  const [formLocalGuarda, setFormLocalGuarda] = useState('');
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

  // Permission logic
  const isGeral = currentUser?.role === 'Geral';
  const isAdmin = currentUser?.role === 'Administrador';
  const isArmeiro = currentUser?.role === 'Armeiro';

  // "novos materiais so podem ser inseridos por usuarios administradores, armeiros e geral"
  const canInsertMaterial = isGeral || isAdmin || isArmeiro;

  // Department and Unit lock rules:
  // "onde, o geral pode escolher para qual departamento e unidade está criando o material"
  // "já armeiros e administradores, a opção departamento do material já será automaticamente selecionada como o departamento que ele faz parte, podendo escolher apenas a unidade"
  // "caso o usuario só tenha acesso a sua unidade, tanto departamento quanto unidade ficará selecionado automaticamente"
  const userDeptId = currentUser?.departmentId || '';
  const userUnitId = currentUser?.unitId || '';
  const isOnlyUnitAccess = !isGeral && (
    currentUser?.managementScope === 'unit' ||
    (userUnitId && !isGeral && !isAdmin)
  );

  // Available data from storage
  const tiposMateriais = storage.getTiposMateriais();
  const materiais = storage.getMateriais(currentUser);
  const cautelas = storage.getCautelasMateriais(currentUser);

  // Filtered materials
  const filteredMateriais = useMemo(() => {
    return materiais.filter(m => {
      const matchSearch =
        m.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.tipoMaterialNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.localGuarda && m.localGuarda.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.numeroSerie && m.numeroSerie.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.unidadeNome && m.unidadeNome.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType = selectedTypeFilter ? m.tipoMaterialId === selectedTypeFilter : true;
      const matchDept = selectedDeptFilter ? m.departamentoId === selectedDeptFilter : true;
      const matchUnit = selectedUnitFilter ? m.unidadeId === selectedUnitFilter : true;

      return matchSearch && matchType && matchDept && matchUnit;
    });
  }, [materiais, searchTerm, selectedTypeFilter, selectedDeptFilter, selectedUnitFilter]);

  // Filtered cautelas
  const filteredCautelas = useMemo(() => {
    return cautelas.filter(c => {
      const matchSearch =
        c.materialNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.protocolo && c.protocolo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.usuarioInternoNome && c.usuarioInternoNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.usuarioExternoNome && c.usuarioExternoNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.usuarioInternoMasp && c.usuarioInternoMasp.includes(searchTerm));

      const matchStatus =
        cautelaStatusFilter === 'todas'
          ? true
          : cautelaStatusFilter === 'em_uso'
          ? c.status === 'Em Uso'
          : cautelaStatusFilter === 'devolvidas'
          ? c.status === 'Devolvido'
          : cautelaStatusFilter === 'consumidas'
          ? c.status === 'Consumido' || c.foiConsumido
          : cautelaStatusFilter === 'anomalias'
          ? c.status === 'Devolvido com Anomalia'
          : true;

      return matchSearch && matchStatus;
    });
  }, [cautelas, searchTerm, cautelaStatusFilter]);

  // Departments & Units for select dropdowns
  const availableUnitsForForm = useMemo(() => {
    if (!formDepartamentoId) return [];
    return units.filter(u => u.departmentId === formDepartamentoId);
  }, [units, formDepartamentoId]);

  // Reset / Open Material Modal
  const handleOpenNewMaterialModal = () => {
    setEditingMaterial(null);
    setFormTipoMaterialId(tiposMateriais[0]?.id || '');
    setFormNome('');
    setFormQuantidade(1);

    if (isGeral) {
      setFormDepartamentoId(departments[0]?.id || '');
      const firstUnit = units.find(u => u.departmentId === departments[0]?.id);
      setFormUnidadeId(firstUnit?.id || '');
    } else {
      // Armeiro ou Administrador: Depto pré-selecionado
      setFormDepartamentoId(userDeptId);
      if (isOnlyUnitAccess) {
        setFormUnidadeId(userUnitId);
      } else {
        const firstDeptUnit = units.find(u => u.departmentId === userDeptId);
        setFormUnidadeId(firstDeptUnit?.id || userUnitId || '');
      }
    }

    setFormValidade('');
    setFormLocalGuarda('');
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
    setFormLocalGuarda(material.localGuarda);
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
    if (!formLocalGuarda.trim()) {
      setErrorMessage('Informe o local de guarda do material.');
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
      localGuarda: formLocalGuarda.trim(),
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
    } else {
      alert(res.error || 'Não foi possível excluir o material.');
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
      alert(res.error || 'Erro ao excluir tipo.');
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
                onClick={handleOpenNewMaterialModal}
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
          <div className="flex items-center gap-2">
            <select
              value={cautelaStatusFilter}
              onChange={(e) => setCautelaStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="todas">Todos os Status</option>
              <option value="em_uso">Em Uso (Ativas)</option>
              <option value="devolvidas">Devolvidas</option>
              <option value="consumidas">Consumidas em Serviço</option>
              <option value="anomalias">Com Anomalias</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: ESTOQUE DE MATERIAIS */}
      {activeTab === 'estoque' && (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
          {filteredMateriais.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Package className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-semibold">Nenhum material encontrado no estoque.</p>
              <p className="text-xs text-slate-500">
                {searchTerm ? 'Tente ajustar os termos da busca ou os filtros.' : 'Clique no botão "+ Novo Material" para cadastrar.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold font-mono">
                  <tr>
                    <th className="p-3.5">Material & Tipo</th>
                    <th className="p-3.5">Localização / Unidade</th>
                    <th className="p-3.5 text-center">Total</th>
                    <th className="p-3.5 text-center">Disponível</th>
                    <th className="p-3.5 text-center">Em Uso</th>
                    <th className="p-3.5">Local de Guarda</th>
                    <th className="p-3.5">Validade</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredMateriais.map((mat) => {
                    const isLowStock = mat.quantidadeDisponivel === 0;
                    return (
                      <tr key={mat.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5">
                          <div className="font-bold text-sm text-slate-100 flex items-center space-x-2">
                            <span>{mat.nome}</span>
                            {mat.numeroSerie && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                                S/N: {mat.numeroSerie}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-amber-400 flex items-center space-x-1.5 mt-0.5">
                            <Tag className="w-3 h-3" />
                            <span>{mat.tipoMaterialNome}</span>
                          </div>
                          {mat.observacoes && (
                            <p className="text-[10px] text-slate-400 italic mt-1 line-clamp-1">
                              Obs: {mat.observacoes}
                            </p>
                          )}
                        </td>

                        <td className="p-3.5">
                          <div className="text-slate-200 font-medium">{mat.unidadeNome || mat.unidadeId}</div>
                          <div className="text-[10px] text-slate-500">{mat.departamentoNome || mat.departamentoId}</div>
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold text-sm text-slate-200">
                          {mat.quantidade}
                        </td>

                        <td className="p-3.5 text-center font-mono">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            isLowStock
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {mat.quantidadeDisponivel} un
                          </span>
                        </td>

                        <td className="p-3.5 text-center font-mono font-semibold">
                          {mat.quantidadeEmUso > 0 ? (
                            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {mat.quantidadeEmUso} un
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>

                        <td className="p-3.5 font-medium text-slate-300">
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{mat.localGuarda}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {getValidityBadge(mat.validade)}
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Cautelar Button */}
                            <button
                              onClick={() => handleOpenCautela(mat)}
                              disabled={mat.quantidadeDisponivel <= 0}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                                mat.quantidadeDisponivel > 0
                                  ? 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                              }`}
                              title={mat.quantidadeDisponivel > 0 ? "Realizar cautela / empréstimo" : "Sem estoque disponível"}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Cautelar</span>
                            </button>

                            {canInsertMaterial && (
                              <>
                                <button
                                  onClick={() => handleOpenEditMaterialModal(mat)}
                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Editar Material"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => handleDeleteMaterial(mat.id, mat.nome)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Excluir Material"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
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
      )}

      {/* TAB 2: CAUTELAS E MOVIMENTAÇÕES */}
      {activeTab === 'cautelas' && (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
          {filteredCautelas.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <ArrowRightLeft className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-semibold">Nenhuma cautela de material encontrada.</p>
              <p className="text-xs text-slate-500">
                Vá até a aba de Estoque e clique em "Cautelar" para registrar retiradas de materiais.
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
                    const isEmUso = caut.status === 'Em Uso';
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
                                <span>{cautelaUsuarioExternoNome || caut.usuarioExternoNome}</span>
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
                              : caut.status === 'Consumido' || caut.foiConsumido
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : caut.status === 'Devolvido com Anomalia'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {isEmUso && <Clock className="w-3 h-3" />}
                            {caut.status === 'Consumido' && <Flame className="w-3 h-3" />}
                            {caut.status === 'Devolvido com Anomalia' && <AlertTriangle className="w-3 h-3" />}
                            {!isEmUso && caut.status === 'Devolvido' && <CheckCircle2 className="w-3 h-3" />}
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
                            {/* Devolução / Baixa Button */}
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

                            {/* Print Receipt Button */}
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
                      setFormDepartamentoId(e.target.value);
                      const firstUnit = units.find(u => u.departmentId === e.target.value);
                      setFormUnidadeId(firstUnit?.id || '');
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
                    onChange={(e) => setFormUnidadeId(e.target.value)}
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

              {/* Local de Guarda e Validade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Local de Guarda do Material <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Armário de Proteção Balística 01"
                    value={formLocalGuarda}
                    onChange={(e) => setFormLocalGuarda(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
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
