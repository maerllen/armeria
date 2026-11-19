import React, { useState, useMemo, useEffect } from 'react';
import {
  User,
  Department,
  Unit,
  CanilFisico,
  Cachorro,
  ProdutoVeterinario,
  MovimentacaoVeterinaria,
  SexoCachorro,
  StatusCachorro,
  TipoProdutoVet,
  FormaFarmaceuticaVet,
  RegimeConsumoVet,
  TipoMovimentacaoVet,
  RelatorioTreinamentoCanil,
  ParticipanteTreinamentoCanil,
  ParticipanteTreinamentoCachorro,
  LocalTreinamentoCanil,
  ParticipacaoTreinamentoCanil
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printWithWindowTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import { TopLayerAlert } from './TopLayerAlert';
import {
  Dog,
  HeartPulse,
  Pill,
  Syringe,
  Barcode,
  Search,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Clock,
  UserCheck,
  Users,
  Building,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Printer,
  ChevronRight,
  Package,
  Layers,
  ArrowRightLeft,
  X,
  Filter,
  DollarSign,
  ShieldAlert,
  Sparkles,
  Info,
  ClipboardList,
  PenTool,
  MapPin
} from 'lucide-react';

interface ModuloVeterinarioProps {
  currentUser: User | null;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  onRefresh: () => void;
}

export const ModuloVeterinario: React.FC<ModuloVeterinarioProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'caes'
    | 'canis'
    | 'farmacia'
    | 'administracao'
    | 'historico'
    | 'relatorio-treinamento'
    | 'meus-relatorios'
    | 'relatorio-unidade'
  >('caes');

  const effectiveRole = currentUser?.activeRole || currentUser?.role;
  const isOperadorCanino = effectiveRole === 'operador_canino';
  const isGeral = effectiveRole === 'Geral';
  const canAccessTrainingTabs = isOperadorCanino || isGeral;
  const canCreateBaiasEAnimais = isGeral || Boolean(currentUser?.canManageCanilAndAnimals);
  const canCadastrarMedicamentos = isGeral || Boolean(currentUser?.canRegisterCanilMeds);
  const canMinistrarMedicamentos = isGeral || Boolean(currentUser?.canAdministerCanilMeds);
  const canVerRelatoriosTodasEquipes = isGeral || Boolean(currentUser?.canViewAllCanilReports);
  const showFarmaciaTab = canCadastrarMedicamentos && canMinistrarMedicamentos;

  // Data from storage
  const canis = storage.getCanisFisicos();
  const cachorros = storage.getCachorros();
  const produtos = storage.getProdutosVeterinarios();
  const movimentacoes = storage.getMovimentacoesVeterinarias();
  const relatoriosTreinamento = storage.getRelatoriosTreinamentoCanil();

  // Common filters & search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [filterTipoProduto, setFilterTipoProduto] = useState<string>('TODOS');

  // Relatório de Treinamento state
  const getTodayIsoBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [treinoForm, setTreinoForm] = useState<{
    dataTreinamento: string;
    cachorros: ParticipanteTreinamentoCachorro[];
    modalidadeLocal: LocalTreinamentoCanil;
    modalidadeParticipacao: ParticipacaoTreinamentoCanil;
    descricao: string;
    participantes: ParticipanteTreinamentoCanil[];
  }>({
    dataTreinamento: getTodayIsoBr(),
    cachorros: [],
    modalidadeLocal: 'Interno',
    modalidadeParticipacao: 'Sozinho',
    descricao: '',
    participantes: []
  });
  const [hasUserChangedMainDog, setHasUserChangedMainDog] = useState(false);

  const toParticipanteDog = (d: Cachorro): ParticipanteTreinamentoCachorro => ({
    id: d.id,
    nome: d.nome,
    raca: d.raca || '',
    microchip: d.microchip || ''
  });

  const getRelatorioCondutorDogs = (rel: RelatorioTreinamentoCanil): ParticipanteTreinamentoCachorro[] => {
    if (rel.cachorros && rel.cachorros.length > 0) return rel.cachorros;
    if (rel.cachorroId && rel.cachorroNome) {
      return [
        {
          id: rel.cachorroId,
          nome: rel.cachorroNome,
          raca: rel.cachorroRaca || '',
          microchip: rel.cachorroMicrochip || ''
        }
      ];
    }
    return [];
  };

  const getDefaultDogsForUser = (userId?: string) => {
    if (!userId) return [];
    const active = cachorros.filter(
      d =>
        d &&
        d.status !== 'Baixado / Óbito' &&
        d.tipoVinculo === 'SISTEMA' &&
        (d.usuarioInternoId === userId || d.usuarioInterno2Id === userId)
    );
    return active.sort((a, b) => {
      const aPrimary = a.usuarioInternoId === userId ? 0 : 1;
      const bPrimary = b.usuarioInternoId === userId ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  };

  useEffect(() => {
    if (
      (activeTab === 'farmacia' && !showFarmaciaTab) ||
      (activeTab === 'administracao' && !canMinistrarMedicamentos) ||
      (activeTab === 'historico' && !canMinistrarMedicamentos) ||
      (activeTab === 'relatorio-unidade' && (!canAccessTrainingTabs || !canVerRelatoriosTodasEquipes)) ||
      ((activeTab === 'relatorio-treinamento' || activeTab === 'meus-relatorios') && !canAccessTrainingTabs)
    ) {
      setActiveTab('caes');
    }
  }, [activeTab, showFarmaciaTab, canMinistrarMedicamentos, canAccessTrainingTabs, canVerRelatoriosTodasEquipes]);

  const [editingTreinoReport, setEditingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);

  const canEditRelatorioTreinamento = (rel?: RelatorioTreinamentoCanil | null): boolean => {
    if (!rel || !currentUser?.id) return false;
    const todayIso = getTodayIsoBr();
    if (String(rel.dataTreinamento || '').slice(0, 10) !== todayIso) return false;
    if (rel.condutorId === currentUser.id) return true;
    return (rel.participantes || []).some(p => p.userId === currentUser.id && Boolean(p.signed));
  };

  useEffect(() => {
    if (
      activeTab === 'relatorio-treinamento' &&
      !editingTreinoReport &&
      !hasUserChangedMainDog &&
      treinoForm.cachorros.length === 0 &&
      currentUser?.id
    ) {
      const defaultDogs = getDefaultDogsForUser(currentUser.id);
      if (defaultDogs.length > 0) {
        setTreinoForm(prev => (prev.cachorros.length > 0 ? prev : { ...prev, cachorros: [toParticipanteDog(defaultDogs[0])] }));
      }
    }
  }, [activeTab, currentUser?.id, cachorros, hasUserChangedMainDog, treinoForm.cachorros.length, editingTreinoReport]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [meusRelFilter, setMeusRelFilter] = useState<'TODOS' | 'CRIADOS' | 'CONJUNTOS_ASSINADOS' | 'PENDENTES'>('TODOS');
  const [unidadeFilterDataInicio, setUnidadeFilterDataInicio] = useState('');
  const [unidadeFilterDataFim, setUnidadeFilterDataFim] = useState('');
  const [unidadeFilterPolicialId, setUnidadeFilterPolicialId] = useState('');
  const [unidadeFilterCachorroId, setUnidadeFilterCachorroId] = useState('');
  const [unidadeFilterLocal, setUnidadeFilterLocal] = useState<'TODOS' | 'Interno' | 'Externo'>('TODOS');
  const [unidadeFilterUnitId, setUnidadeFilterUnitId] = useState<string>('');
  const [viewingTreinoReport, setViewingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);

  // Messages & Loading state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helpers to display messages
  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const notifyError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 6000);
  };

  // =========================================================================
  // MODAL STATES
  // =========================================================================
  // 1. Canil Modal
  const [showCanilModal, setShowCanilModal] = useState(false);
  const [editingCanil, setEditingCanil] = useState<CanilFisico | null>(null);
  const [canilForm, setCanilForm] = useState({
    nome: '',
    identificacao: '',
    capacidade: 1,
    localizacao: '',
    departmentId: '',
    unitId: '',
    status: 'Ativo' as 'Ativo' | 'Em Manutenção' | 'Inativo',
    observacoes: ''
  });

  // 2. Cachorro Modal
  const [showDogModal, setShowDogModal] = useState(false);
  const [editingDog, setEditingDog] = useState<Cachorro | null>(null);
  const [dogForm, setDogForm] = useState({
    nome: '',
    raca: 'Pastor Belga Malinois',
    sexo: 'Macho' as SexoCachorro,
    dataNascimento: '',
    microchip: '',
    pelagem: '',
    especialidade: 'Faro de Drogas / Entorpecentes',
    canilFisicoId: '',
    status: 'Ativo / Operacional' as StatusCachorro,
    tipoVinculo: 'SISTEMA' as 'SISTEMA' | 'EXTERNO',
    usuarioInternoId: '',
    usuarioInterno2Id: '',
    responsavelExternoNome: '',
    responsavelExternoDoc: '',
    responsavelExternoTel: '',
    responsavelExternoOrgao: '',
    departmentId: '',
    unitId: '',
    fotoUrl: '',
    observacoes: ''
  });

  // 3. Produto Modal
  const [showProdModal, setShowProdModal] = useState(false);
  const [editingProd, setEditingProd] = useState<ProdutoVeterinario | null>(null);
  const [prodForm, setProdForm] = useState({
    tipo: 'REMEDIO' as TipoProdutoVet,
    nome: '',
    categoria: '',
    codigoBarras: '',
    fabricante: '',
    lote: '',
    valorUnitario: 0,
    temValidade: true,
    dataValidade: '',
    ehPerecivel: false,
    quantidadeEstoque: 10,
    unidadeMedida: 'Comprimido(s)',
    quantidadeMinima: 5,
    localGuarda: 'Farmácia Veterinária',
    formaFarmaceutica: 'Comprimido' as FormaFarmaceuticaVet,
    regimeConsumo: 'Consumo Diário' as RegimeConsumoVet,
    intervaloHoras: 12,
    dosagemPadrao: '1 comprimido',
    departmentId: '',
    unitId: '',
    observacoes: ''
  });

  // 4. Administração / Movimentação Modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedProdForAdmin, setSelectedProdForAdmin] = useState<ProdutoVeterinario | null>(null);
  const [adminForm, setAdminForm] = useState({
    tipoMovimentacao: 'ADMINISTRACAO_CAO' as TipoMovimentacaoVet,
    produtoId: '',
    quantidade: 1,
    dataHora: new Date().toISOString().slice(0, 16),
    cachorroId: '',
    dosagemAplicada: '',
    frequenciaAdministrada: '',
    motivo: '',
    responsavelAplicacaoId: currentUser?.id || '',
    observacoes: ''
  });

  // 5. Printable Receipt Modal
  const [selectedReceiptMov, setSelectedReceiptMov] = useState<MovimentacaoVeterinaria | null>(null);

  // Quick Barcode Lookup
  const [barcodeQuery, setBarcodeQuery] = useState('');

  // =========================================================================
  // HANDLERS: CANIS
  // =========================================================================
  const handleOpenNewCanil = () => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para criar ou editar canis.');
      return;
    }
    setEditingCanil(null);
    setCanilForm({
      nome: '',
      identificacao: '',
      capacidade: 1,
      localizacao: 'Sede DOE - Canil Central',
      departmentId: currentUser?.departmentId || departments[0]?.id || '',
      unitId: currentUser?.unitId || units[0]?.id || '',
      status: 'Ativo',
      observacoes: ''
    });
    setShowCanilModal(true);
  };

  const handleEditCanil = (canil: CanilFisico) => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para editar canis.');
      return;
    }
    setEditingCanil(canil);
    setCanilForm({
      nome: canil.nome,
      identificacao: canil.identificacao || '',
      capacidade: canil.capacidade || 1,
      localizacao: canil.localizacao || '',
      departmentId: canil.departmentId || '',
      unitId: canil.unitId || '',
      status: canil.status,
      observacoes: canil.observacoes || ''
    });
    setShowCanilModal(true);
  };

  const handleSaveCanil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para criar ou editar canis.');
      return;
    }
    if (!canilForm.nome.trim()) {
      notifyError('O nome do canil é obrigatório.');
      return;
    }
    setIsSubmitting(true);
    const res = await storage.saveCanilFisico({
      id: editingCanil?.id,
      ...canilForm
    });
    setIsSubmitting(false);
    if (res.success) {
      setShowCanilModal(false);
      notifySuccess(editingCanil ? 'Canil físico atualizado com sucesso!' : 'Canil físico cadastrado com sucesso!');
      onRefresh();
    } else {
      notifyError(res.error || 'Erro ao salvar canil físico.');
    }
  };

  const handleDeleteCanil = async (canil: CanilFisico) => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para excluir canis.');
      return;
    }
    if (!confirm(`Deseja realmente excluir o canil físico "${canil.nome}"?`)) return;
    setIsSubmitting(true);
    const res = await storage.deleteCanilFisico(canil.id);
    setIsSubmitting(false);
    if (res.success) {
      notifySuccess('Canil físico excluído com sucesso.');
      onRefresh();
    } else {
      notifyError(res.error || 'Não foi possível excluir o canil físico.');
    }
  };

  // =========================================================================
  // HANDLERS: CACHORROS
  // =========================================================================
  const eligibleDogHandlers = useMemo(() => {
    const rawLookup = storage.getAllUsersForLookup();
    const base = rawLookup.length > 0 ? rawLookup : allUsers;
    const targetUnitId = currentUser?.unitId || '';
    return base
      .filter(u => {
        if (!u) return false;
        const isCanino =
          u.role === 'operador_canino' ||
          u.activeRole === 'operador_canino' ||
          (Array.isArray(u.roles) && u.roles.includes('operador_canino'));
        if (!isCanino) return false;
        if (targetUnitId && u.unitId !== targetUnitId) return false;
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, currentUser]);

  const formatDogHandlersLabel = (dog?: Cachorro | null) => {
    if (!dog) return '';
    if (dog.tipoVinculo !== 'SISTEMA') return dog.responsavelExternoNome || 'Responsável Externo';
    const names = [dog.usuarioInternoNome, dog.usuarioInterno2Nome].filter(Boolean);
    return names.length > 0 ? names.join(' / ') : 'Policial do Sistema';
  };

  const handleOpenNewDog = () => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para cadastrar animais.');
      return;
    }
    const defaultHandler =
      eligibleDogHandlers.find(u => u.id === currentUser?.id)?.id ||
      eligibleDogHandlers[0]?.id ||
      '';
    const firstAvailableCanil = canis.find(
      k => cachorros.filter(c => c.canilFisicoId === k.id).length < (k.capacidade || 1)
    );
    setEditingDog(null);
    setDogForm({
      nome: '',
      raca: 'Pastor Belga Malinois',
      sexo: 'Macho',
      dataNascimento: '',
      microchip: '',
      pelagem: '',
      especialidade: 'Faro de Drogas / Entorpecentes',
      canilFisicoId: firstAvailableCanil?.id || '',
      status: 'Ativo / Operacional',
      tipoVinculo: 'SISTEMA',
      usuarioInternoId: defaultHandler,
      usuarioInterno2Id: '',
      responsavelExternoNome: '',
      responsavelExternoDoc: '',
      responsavelExternoTel: '',
      responsavelExternoOrgao: '',
      departmentId: currentUser?.departmentId || departments[0]?.id || '',
      unitId: currentUser?.unitId || units[0]?.id || '',
      fotoUrl: '',
      observacoes: ''
    });
    setShowDogModal(true);
  };

  const handleEditDog = (dog: Cachorro) => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para editar animais.');
      return;
    }
    setEditingDog(dog);
    setDogForm({
      nome: dog.nome,
      raca: dog.raca,
      sexo: dog.sexo,
      dataNascimento: dog.dataNascimento || '',
      microchip: dog.microchip || '',
      pelagem: dog.pelagem || '',
      especialidade: dog.especialidade || '',
      canilFisicoId: dog.canilFisicoId || '',
      status: dog.status,
      tipoVinculo: dog.tipoVinculo,
      usuarioInternoId: dog.usuarioInternoId || '',
      usuarioInterno2Id: dog.usuarioInterno2Id || '',
      responsavelExternoNome: dog.responsavelExternoNome || '',
      responsavelExternoDoc: dog.responsavelExternoDoc || '',
      responsavelExternoTel: dog.responsavelExternoTel || '',
      responsavelExternoOrgao: dog.responsavelExternoOrgao || '',
      departmentId: dog.departmentId || '',
      unitId: dog.unitId || '',
      fotoUrl: dog.fotoUrl || '',
      observacoes: dog.observacoes || ''
    });
    setShowDogModal(true);
  };

  const handleSaveDog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para cadastrar ou editar animais.');
      return;
    }
    if (!dogForm.nome.trim()) {
      notifyError('O nome do cão é obrigatório.');
      return;
    }
    if (!dogForm.raca.trim()) {
      notifyError('A raça do cão é obrigatória.');
      return;
    }

    let internalUser1: User | undefined;
    let internalUser2: User | undefined;
    if (dogForm.tipoVinculo === 'SISTEMA') {
      if (!dogForm.usuarioInternoId) {
        notifyError('Selecione o 1º condutor (Operador Canino) do animal.');
        return;
      }
      if (dogForm.usuarioInterno2Id && dogForm.usuarioInterno2Id === dogForm.usuarioInternoId) {
        notifyError('O 1º e o 2º condutor não podem ser o mesmo usuário.');
        return;
      }
      internalUser1 = eligibleDogHandlers.find(u => u.id === dogForm.usuarioInternoId);
      if (!internalUser1) {
        notifyError('O 1º condutor deve ser um Operador Canino da mesma unidade.');
        return;
      }
      if (dogForm.usuarioInterno2Id) {
        internalUser2 = eligibleDogHandlers.find(u => u.id === dogForm.usuarioInterno2Id);
        if (!internalUser2) {
          notifyError('O 2º condutor deve ser um Operador Canino da mesma unidade.');
          return;
        }
      }
    }

    setIsSubmitting(true);
    const res = await storage.saveCachorro({
      id: editingDog?.id,
      ...dogForm,
      usuarioInternoId: dogForm.tipoVinculo === 'SISTEMA' ? internalUser1?.id : undefined,
      usuarioInternoNome: dogForm.tipoVinculo === 'SISTEMA' ? internalUser1?.name : undefined,
      usuarioInternoMasp: dogForm.tipoVinculo === 'SISTEMA' ? internalUser1?.masp : undefined,
      usuarioInternoCargo: dogForm.tipoVinculo === 'SISTEMA' ? internalUser1?.cargo : undefined,
      usuarioInterno2Id: dogForm.tipoVinculo === 'SISTEMA' ? internalUser2?.id : undefined,
      usuarioInterno2Nome: dogForm.tipoVinculo === 'SISTEMA' ? internalUser2?.name : undefined,
      usuarioInterno2Masp: dogForm.tipoVinculo === 'SISTEMA' ? internalUser2?.masp : undefined,
      usuarioInterno2Cargo: dogForm.tipoVinculo === 'SISTEMA' ? internalUser2?.cargo : undefined
    });
    setIsSubmitting(false);

    if (res.success) {
      setShowDogModal(false);
      notifySuccess(editingDog ? 'Cadastro do cão atualizado com sucesso!' : 'Cão K9 cadastrado com sucesso!');
      onRefresh();
    } else {
      notifyError(res.error || 'Erro ao salvar cão K9.');
    }
  };

  const handleDeleteDog = async (dog: Cachorro) => {
    if (!canCreateBaiasEAnimais) {
      notifyError('Você não possui permissão para excluir animais.');
      return;
    }
    if (!confirm(`Deseja realmente excluir o cadastro do cão "${dog.nome}"?`)) return;
    setIsSubmitting(true);
    const res = await storage.deleteCachorro(dog.id);
    setIsSubmitting(false);
    if (res.success) {
      notifySuccess('Cão K9 excluído com sucesso.');
      onRefresh();
    } else {
      notifyError(res.error || 'Não foi possível excluir o cão.');
    }
  };

  // =========================================================================
  // HANDLERS: PRODUTOS VETERINÁRIOS
  // =========================================================================
  const handleOpenNewProd = (tipo: TipoProdutoVet = 'REMEDIO') => {
    if (!canCadastrarMedicamentos) {
      notifyError('Você não possui permissão para cadastrar medicamentos ou insumos.');
      return;
    }
    setEditingProd(null);
    setProdForm({
      tipo,
      nome: '',
      categoria: tipo === 'REMEDIO' ? 'Antibiótico' : tipo === 'RACAO' ? 'Ração Super Premium K9' : 'Higiene / Cuidado',
      codigoBarras: '',
      fabricante: '',
      lote: '',
      valorUnitario: 0,
      temValidade: true,
      dataValidade: '',
      ehPerecivel: tipo === 'RACAO',
      quantidadeEstoque: tipo === 'RACAO' ? 25 : 10,
      unidadeMedida: tipo === 'REMEDIO' ? 'Comprimido(s)' : tipo === 'RACAO' ? 'Kg' : 'Unidade(s)',
      quantidadeMinima: tipo === 'RACAO' ? 10 : 5,
      localGuarda: 'Farmácia Veterinária',
      formaFarmaceutica: 'Comprimido',
      regimeConsumo: 'Consumo Diário',
      intervaloHoras: 12,
      dosagemPadrao: tipo === 'REMEDIO' ? '1 comprimido' : '300g por refeição',
      departmentId: currentUser?.departmentId || departments[0]?.id || '',
      unitId: currentUser?.unitId || units[0]?.id || '',
      observacoes: ''
    });
    setShowProdModal(true);
  };

  const handleEditProd = (prod: ProdutoVeterinario) => {
    if (!canCadastrarMedicamentos) {
      notifyError('Você não possui permissão para editar medicamentos ou insumos.');
      return;
    }
    setEditingProd(prod);
    setProdForm({
      tipo: prod.tipo,
      nome: prod.nome,
      categoria: prod.categoria || '',
      codigoBarras: prod.codigoBarras || '',
      fabricante: prod.fabricante || '',
      lote: prod.lote || '',
      valorUnitario: prod.valorUnitario || 0,
      temValidade: prod.temValidade,
      dataValidade: prod.dataValidade || '',
      ehPerecivel: prod.ehPerecivel,
      quantidadeEstoque: prod.quantidadeEstoque || 0,
      unidadeMedida: prod.unidadeMedida || 'Unidade',
      quantidadeMinima: prod.quantidadeMinima || 0,
      localGuarda: prod.localGuarda || '',
      formaFarmaceutica: prod.formaFarmaceutica || 'Comprimido',
      regimeConsumo: prod.regimeConsumo || 'Consumo Diário',
      intervaloHoras: prod.intervaloHoras || 12,
      dosagemPadrao: prod.dosagemPadrao || '',
      departmentId: prod.departmentId || '',
      unitId: prod.unitId || '',
      observacoes: prod.observacoes || ''
    });
    setShowProdModal(true);
  };

  const handleSaveProd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCadastrarMedicamentos) {
      notifyError('Você não possui permissão para cadastrar ou editar medicamentos.');
      return;
    }
    if (!prodForm.nome.trim()) {
      notifyError('O nome do produto é obrigatório.');
      return;
    }
    setIsSubmitting(true);
    const res = await storage.saveProdutoVeterinario({
      id: editingProd?.id,
      ...prodForm
    });
    setIsSubmitting(false);

    if (res.success) {
      setShowProdModal(false);
      notifySuccess(editingProd ? 'Produto veterinário atualizado com sucesso!' : 'Produto veterinário cadastrado com sucesso!');
      onRefresh();
    } else {
      notifyError(res.error || 'Erro ao salvar produto veterinário.');
    }
  };

  const handleDeleteProd = async (prod: ProdutoVeterinario) => {
    if (!canCadastrarMedicamentos) {
      notifyError('Você não possui permissão para excluir medicamentos.');
      return;
    }
    if (!confirm(`Deseja realmente excluir o produto "${prod.nome}"?`)) return;
    setIsSubmitting(true);
    const res = await storage.deleteProdutoVeterinario(prod.id);
    setIsSubmitting(false);
    if (res.success) {
      notifySuccess('Produto veterinário excluído com sucesso.');
      onRefresh();
    } else {
      notifyError(res.error || 'Não foi possível excluir o produto.');
    }
  };

  // =========================================================================
  // HANDLERS: ADMINISTRAÇÃO & BAIXA (DESTINAÇÃO AO CÃO)
  // =========================================================================
  const handleOpenAdminModal = (prod?: ProdutoVeterinario, dog?: Cachorro) => {
    if (!canMinistrarMedicamentos) {
      notifyError('Você não possui permissão para ministrar medicamentos.');
      return;
    }
    const selectedP = prod || produtos[0] || null;
    setSelectedProdForAdmin(selectedP);

    setAdminForm({
      tipoMovimentacao: 'ADMINISTRACAO_CAO',
      produtoId: selectedP?.id || '',
      quantidade: 1,
      dataHora: new Date().toISOString().slice(0, 16),
      cachorroId: dog?.id || cachorros[0]?.id || '',
      dosagemAplicada: selectedP?.dosagemPadrao || (selectedP?.formaFarmaceutica === 'Injeção' ? '1 ampola (2.5 ml)' : '1 comprimido'),
      frequenciaAdministrada: selectedP?.intervaloHoras ? `A cada ${selectedP.intervaloHoras} horas` : 'Dose única',
      motivo: selectedP?.tipo === 'REMEDIO' ? 'Tratamento profilático / prescrição veterinária' : 'Alimentação diária balanceada K9',
      responsavelAplicacaoId: currentUser?.id || allUsers[0]?.id || '',
      observacoes: ''
    });

    setShowAdminModal(true);
  };

  const handleSaveAdministration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMinistrarMedicamentos) {
      notifyError('Você não possui permissão para ministrar medicamentos.');
      return;
    }
    if (!adminForm.produtoId) {
      notifyError('Selecione o produto a ser administrado ou baixado.');
      return;
    }
    if (adminForm.quantidade <= 0) {
      notifyError('A quantidade deve ser maior que zero.');
      return;
    }

    const prod = produtos.find(p => p.id === adminForm.produtoId);
    if (!prod) {
      notifyError('Produto não encontrado.');
      return;
    }

    if (adminForm.tipoMovimentacao !== 'ENTRADA' && adminForm.quantidade > prod.quantidadeEstoque) {
      notifyError(`Estoque insuficiente! Disponível: ${prod.quantidadeEstoque} ${prod.unidadeMedida}.`);
      return;
    }

    const targetDog = cachorros.find(c => c.id === adminForm.cachorroId);
    const applierUser = allUsers.find(u => u.id === adminForm.responsavelAplicacaoId) || currentUser;

    const valorTotal = Number(adminForm.quantidade) * Number(prod.valorUnitario || 0);

    setIsSubmitting(true);
    const res = await storage.saveMovimentacaoVeterinaria({
      produtoId: prod.id,
      produtoNome: prod.nome,
      tipoProduto: prod.tipo,
      tipoMovimentacao: adminForm.tipoMovimentacao,
      quantidade: adminForm.quantidade,
      unidadeMedida: prod.unidadeMedida,
      dataHora: adminForm.dataHora ? adminForm.dataHora.replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '),
      cachorroId: targetDog?.id,
      cachorroNome: targetDog?.nome,
      cachorroRaca: targetDog?.raca,
      cachorroMicrochip: targetDog?.microchip,
      condutorNome: formatDogHandlersLabel(targetDog),
      condutorMasp: targetDog?.tipoVinculo === 'SISTEMA' ? targetDog?.usuarioInternoMasp : undefined,
      dosagemAplicada: adminForm.dosagemAplicada,
      frequenciaAdministrada: adminForm.frequenciaAdministrada,
      valorTotalItem: valorTotal,
      motivo: adminForm.motivo,
      responsavelAplicacaoId: applierUser?.id,
      responsavelAplicacaoNome: applierUser?.name,
      responsavelAplicacaoMasp: applierUser?.masp,
      departmentId: prod.departmentId || currentUser?.departmentId,
      unitId: prod.unitId || currentUser?.unitId,
      observacoes: adminForm.observacoes
    });
    setIsSubmitting(false);

    if (res.success) {
      setShowAdminModal(false);
      notifySuccess(
        adminForm.tipoMovimentacao === 'ADMINISTRACAO_CAO'
          ? `Medicamento/Insumo administrado ao cão "${targetDog?.nome}" com sucesso! Estoque atualizado.`
          : 'Movimentação veterinária registrada com sucesso!'
      );
      onRefresh();

      // Open receipt automatically if it was administered to a dog
      if (adminForm.tipoMovimentacao === 'ADMINISTRACAO_CAO' && targetDog) {
        setSelectedReceiptMov({
          id: res.id || `mov-${Date.now()}`,
          produtoId: prod.id,
          produtoNome: prod.nome,
          tipoProduto: prod.tipo,
          tipoMovimentacao: adminForm.tipoMovimentacao,
          quantidade: adminForm.quantidade,
          unidadeMedida: prod.unidadeMedida,
          dataHora: adminForm.dataHora,
          cachorroId: targetDog.id,
          cachorroNome: targetDog.nome,
          cachorroRaca: targetDog.raca,
          cachorroMicrochip: targetDog.microchip,
          condutorNome: formatDogHandlersLabel(targetDog),
          condutorMasp: targetDog.tipoVinculo === 'SISTEMA' ? targetDog.usuarioInternoMasp : undefined,
          dosagemAplicada: adminForm.dosagemAplicada,
          frequenciaAdministrada: adminForm.frequenciaAdministrada,
          valorTotalItem: valorTotal,
          motivo: adminForm.motivo,
          responsavelAplicacaoId: applierUser?.id,
          responsavelAplicacaoNome: applierUser?.name,
          responsavelAplicacaoMasp: applierUser?.masp,
          createdAt: new Date().toISOString()
        });
      }
    } else {
      notifyError(res.error || 'Erro ao registrar administração.');
    }
  };

  // Barcode quick search handler
  const handleBarcodeSearch = (code: string) => {
    if (!canMinistrarMedicamentos) return;
    setBarcodeQuery(code);
    if (!code) return;
    const clean = code.trim().toLowerCase();
    const found = produtos.find(p => p.codigoBarras && p.codigoBarras.toLowerCase() === clean);
    if (found) {
      handleOpenAdminModal(found);
      setBarcodeQuery('');
    }
  };

  // Helper calculation of age
  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return 'Idade não informada';
    const birth = new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
      years--;
      months += 12;
    }
    if (years === 0) return `${months} mês(es)`;
    return `${years} ano(s) ${months > 0 ? `e ${months} m` : ''}`;
  };

  // Statistics
  const totalCaes = cachorros.length;
  const caesOperacionais = cachorros.filter(c => c.status === 'Ativo / Operacional').length;
  const caesEmTratamento = cachorros.filter(c => c.status === 'Tratamento Veterinário').length;
  const totalProdutos = produtos.length;
  const produtosBaixoEstoque = produtos.filter(p => p.quantidadeEstoque <= p.quantidadeMinima).length;
  const totalValorFarmacia = produtos.reduce((acc, p) => acc + (p.quantidadeEstoque * p.valorUnitario), 0);

  // Filtered Dogs
  const filteredDogs = useMemo(() => {
    return cachorros.filter(d => {
      if (!d) return false;
      const matchSearch =
        (d.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.raca || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.microchip && d.microchip.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.usuarioInternoNome && d.usuarioInternoNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.usuarioInterno2Nome && d.usuarioInterno2Nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.responsavelExternoNome && d.responsavelExternoNome.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = filterStatus === 'TODOS' || d.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [cachorros, searchTerm, filterStatus]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return produtos.filter(p => {
      if (!p) return false;
      const matchSearch =
        (p.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigoBarras && p.codigoBarras.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.categoria && p.categoria.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.fabricante && p.fabricante.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchTipo = filterTipoProduto === 'TODOS' || p.tipo === filterTipoProduto;
      return matchSearch && matchTipo;
    });
  }, [produtos, searchTerm, filterTipoProduto]);

  // =========================================================================
  // TREINAMENTO CANIL K9: HELPERS, FILTROS & IMPRESSÃO
  // =========================================================================
  const formatDateBr = (isoDate?: string) => {
    if (!isoDate) return '-';
    const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const d = new Date(isoDate);
    return Number.isNaN(d.getTime()) ? String(isoDate) : d.toLocaleDateString('pt-BR');
  };

  const selectableUsersForTreino = useMemo(() => {
    const rawLookup = storage.getAllUsersForLookup();
    const base = rawLookup.length > 0 ? rawLookup : allUsers;
    const ownerId = editingTreinoReport?.condutorId || currentUser?.id;
    return base
      .filter(u => u && u.id !== ownerId && (isGeral || u.role !== 'Geral'))
      .sort((a, b) => {
        const aSameUnit = a.unitId === currentUser?.unitId ? 0 : 1;
        const bSameUnit = b.unitId === currentUser?.unitId ? 0 : 1;
        if (aSameUnit !== bSameUnit) return aSameUnit - bSameUnit;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [allUsers, currentUser, isGeral, editingTreinoReport?.condutorId]);

  const editableTodayReports = useMemo(() => {
    if (!currentUser?.id) return [];
    return relatoriosTreinamento.filter(r => canEditRelatorioTreinamento(r));
  }, [relatoriosTreinamento, currentUser?.id]);

  const filteredParticipantCandidates = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    const selectedIds = new Set(treinoForm.participantes.map(p => p.userId));
    return selectableUsersForTreino
      .filter(u => !selectedIds.has(u.id))
      .filter(u => {
        if (!q) return true;
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.masp || '').toLowerCase().includes(q) ||
          (u.cargo || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [selectableUsersForTreino, participantSearch, treinoForm.participantes]);

  const handleAddParticipant = (userToAdd: User) => {
    if (treinoForm.participantes.length >= 15) {
      notifyError('Limite máximo de 15 usuários adicionais atingido para treinamento coletivo.');
      return;
    }
    if (treinoForm.participantes.some(p => p.userId === userToAdd.id)) return;
    const defaultDogs = getDefaultDogsForUser(userToAdd.id);
    const initialDogs =
      defaultDogs.length > 0
        ? [
            {
              id: defaultDogs[0].id,
              nome: defaultDogs[0].nome,
              raca: defaultDogs[0].raca || '',
              microchip: defaultDogs[0].microchip || ''
            }
          ]
        : [];
    setTreinoForm(prev => ({
      ...prev,
      participantes: [
        ...prev.participantes,
        {
          userId: userToAdd.id,
          name: userToAdd.name,
          masp: userToAdd.masp || '',
          cargo: userToAdd.cargo || '',
          signed: false,
          cachorros: initialDogs
        }
      ]
    }));
  };

  const handleRemoveParticipant = (userId: string) => {
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.filter(p => p.userId !== userId)
    }));
  };

  const handleAddDogToParticipant = (userId: string, dogId: string) => {
    if (!dogId) return;
    const dog = cachorros.find(c => c.id === dogId);
    if (!dog) return;
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.map(p => {
        if (p.userId !== userId) return p;
        const currentDogs = p.cachorros || [];
        if (currentDogs.some(c => c.id === dog.id)) return p;
        return {
          ...p,
          cachorros: [
            ...currentDogs,
            {
              id: dog.id,
              nome: dog.nome,
              raca: dog.raca || '',
              microchip: dog.microchip || ''
            }
          ]
        };
      })
    }));
  };

  const handleRemoveDogFromParticipant = (userId: string, dogId: string) => {
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.map(p => {
        if (p.userId !== userId) return p;
        return {
          ...p,
          cachorros: (p.cachorros || []).filter(c => c.id !== dogId)
        };
      })
    }));
  };

  const handleAddMainDog = (dogId: string) => {
    if (!dogId) return;
    const dog = cachorros.find(c => c.id === dogId);
    if (!dog) return;
    setHasUserChangedMainDog(true);
    setTreinoForm(prev => {
      if (prev.cachorros.some(c => c.id === dog.id)) return prev;
      return {
        ...prev,
        cachorros: [...prev.cachorros, toParticipanteDog(dog)]
      };
    });
  };

  const handleRemoveMainDog = (dogId: string) => {
    setHasUserChangedMainDog(true);
    setTreinoForm(prev => ({
      ...prev,
      cachorros: prev.cachorros.filter(c => c.id !== dogId)
    }));
  };

  const handleStartEditTreinamento = (rel: RelatorioTreinamentoCanil) => {
    if (!canEditRelatorioTreinamento(rel)) {
      notifyError('Este relatório só pode ser modificado no mesmo dia em que foi criado pelo condutor autor ou por participantes que já assinaram.');
      return;
    }
    setEditingTreinoReport(rel);
    setHasUserChangedMainDog(true);
    setTreinoForm({
      dataTreinamento: rel.dataTreinamento,
      cachorros: getRelatorioCondutorDogs(rel),
      modalidadeLocal: rel.modalidadeLocal,
      modalidadeParticipacao: rel.modalidadeParticipacao,
      descricao: rel.descricao || '',
      participantes: (rel.participantes || []).map(p => ({
        ...p,
        cachorros: (p.cachorros || []).map(c => ({ ...c }))
      }))
    });
    setParticipantSearch('');
    setViewingTreinoReport(null);
    setActiveTab('relatorio-treinamento');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCancelEditTreinamento = () => {
    setEditingTreinoReport(null);
    const nextDefaultDogs = currentUser ? getDefaultDogsForUser(currentUser.id) : [];
    setHasUserChangedMainDog(false);
    setTreinoForm({
      dataTreinamento: getTodayIsoBr(),
      cachorros: nextDefaultDogs.length > 0 ? [toParticipanteDog(nextDefaultDogs[0])] : [],
      modalidadeLocal: 'Interno',
      modalidadeParticipacao: 'Sozinho',
      descricao: '',
      participantes: []
    });
    setParticipantSearch('');
  };

  const handleSaveTreinamento = async (shouldPrintAfter: boolean) => {
    if (!currentUser) return;
    if (treinoForm.cachorros.length === 0) {
      notifyError('Selecione ao menos um cachorro participante do treinamento.');
      return;
    }
    const cleanDesc = treinoForm.descricao.trim();
    if (!cleanDesc) {
      notifyError('Preencha a descrição do treinamento do dia.');
      return;
    }
    if (cleanDesc.length > 1000) {
      notifyError('A descrição do treinamento deve ter no máximo 1000 caracteres.');
      return;
    }
    if (treinoForm.modalidadeParticipacao === 'Coletivo' && treinoForm.participantes.length === 0) {
      notifyError('Em treinamento coletivo, selecione ao menos 1 usuário participante junto com o condutor (ou altere para Sozinho).');
      return;
    }
    if (treinoForm.modalidadeParticipacao === 'Coletivo' && treinoForm.participantes.length > 15) {
      notifyError('É permitido adicionar no máximo 15 usuários em treinamento coletivo.');
      return;
    }

    const primaryDogEntry = treinoForm.cachorros[0];
    const primaryDogRecord = cachorros.find(c => c.id === primaryDogEntry.id);

    setIsSubmitting(true);
    let res: { success: boolean; error?: string; data?: RelatorioTreinamentoCanil };
    if (editingTreinoReport) {
      res = await storage.updateRelatorioTreinamentoCanil(editingTreinoReport.id, {
        cachorroId: primaryDogEntry.id,
        cachorroNome: primaryDogEntry.nome,
        cachorroRaca: primaryDogEntry.raca || '',
        cachorroMicrochip: primaryDogEntry.microchip || '',
        cachorros: treinoForm.cachorros,
        modalidadeLocal: treinoForm.modalidadeLocal,
        modalidadeParticipacao: treinoForm.modalidadeParticipacao,
        descricao: cleanDesc,
        participantes: treinoForm.modalidadeParticipacao === 'Coletivo' ? treinoForm.participantes : []
      });
    } else {
      const todayDate = getTodayIsoBr();
      res = await storage.saveRelatorioTreinamentoCanil({
        dataTreinamento: todayDate,
        condutorId: currentUser.id,
        condutorNome: currentUser.name,
        condutorMasp: currentUser.masp || '',
        condutorCargo: currentUser.cargo || '',
        cachorroId: primaryDogEntry.id,
        cachorroNome: primaryDogEntry.nome,
        cachorroRaca: primaryDogEntry.raca || '',
        cachorroMicrochip: primaryDogEntry.microchip || '',
        cachorros: treinoForm.cachorros,
        modalidadeLocal: treinoForm.modalidadeLocal,
        modalidadeParticipacao: treinoForm.modalidadeParticipacao,
        descricao: cleanDesc,
        participantes: treinoForm.modalidadeParticipacao === 'Coletivo' ? treinoForm.participantes : [],
        departmentId: currentUser.departmentId || primaryDogRecord?.departmentId || '',
        unitId: currentUser.unitId || primaryDogRecord?.unitId || ''
      });
    }
    setIsSubmitting(false);

    if (!res.success) {
      notifyError(res.error || 'Erro ao salvar relatório de treinamento.');
      return;
    }

    notifySuccess(
      editingTreinoReport
        ? 'Relatório de treinamento atualizado com sucesso!'
        : 'Relatório de treinamento salvo com sucesso!'
    );
    setEditingTreinoReport(null);
    const nextDefaultDogs = getDefaultDogsForUser(currentUser.id);
    setHasUserChangedMainDog(false);
    setTreinoForm({
      dataTreinamento: getTodayIsoBr(),
      cachorros: nextDefaultDogs.length > 0 ? [toParticipanteDog(nextDefaultDogs[0])] : [],
      modalidadeLocal: 'Interno',
      modalidadeParticipacao: 'Sozinho',
      descricao: '',
      participantes: []
    });
    setParticipantSearch('');
    onRefresh();

    if (shouldPrintAfter && res.data) {
      handlePrintRelatorioTreinamento(res.data);
    }
  };

  const handleAssinarRelatorioTreino = async (rel: RelatorioTreinamentoCanil) => {
    setIsSubmitting(true);
    const res = await storage.assinarRelatorioTreinamentoCanil(rel.id);
    setIsSubmitting(false);
    const dogsLabel = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ') || rel.cachorroNome;
    if (res.success) {
      notifySuccess(`Relatório de treinamento (${dogsLabel}) assinado com sucesso!`);
      onRefresh();
    } else {
      notifyError(res.error || 'Erro ao assinar relatório.');
    }
  };

  const handleDeleteRelatorioTreino = async (rel: RelatorioTreinamentoCanil) => {
    const dogsLabel = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ') || rel.cachorroNome;
    if (!confirm(`Deseja excluir o relatório de treinamento (${dogsLabel}) de ${formatDateBr(rel.dataTreinamento)}?`)) {
      return;
    }
    setIsSubmitting(true);
    const res = await storage.deleteRelatorioTreinamentoCanil(rel.id);
    setIsSubmitting(false);
    if (res.success) {
      if (editingTreinoReport?.id === rel.id) {
        handleCancelEditTreinamento();
      }
      notifySuccess('Relatório de treinamento excluído.');
      onRefresh();
    } else {
      notifyError(res.error || 'Erro ao excluir relatório.');
    }
  };

  // Meus Relatórios: criados pelo usuário OU treinamentos conjuntos onde foi incluído (assinados ou aguardando assinatura)
  const myPendingSignCount = useMemo(() => {
    if (!currentUser) return 0;
    return relatoriosTreinamento.filter(
      r => r.condutorId !== currentUser.id && (r.participantes || []).some(p => p.userId === currentUser.id && !p.signed)
    ).length;
  }, [relatoriosTreinamento, currentUser]);

  const meusRelatoriosList = useMemo(() => {
    if (!currentUser) return [];
    return relatoriosTreinamento.filter(r => {
      const isCreator = r.condutorId === currentUser.id;
      const myPart = (r.participantes || []).find(p => p.userId === currentUser.id);
      if (meusRelFilter === 'CRIADOS') return isCreator;
      if (meusRelFilter === 'CONJUNTOS_ASSINADOS') return !isCreator && Boolean(myPart?.signed);
      if (meusRelFilter === 'PENDENTES') return !isCreator && Boolean(myPart && !myPart.signed);
      return isCreator || Boolean(myPart);
    });
  }, [relatoriosTreinamento, currentUser, meusRelFilter]);

  // Relatório da Unidade: todas as equipes/unidades se autorizado
  const unitScopedReports = useMemo(() => {
    if (!currentUser || !canVerRelatoriosTodasEquipes) return [];
    const targetUnitId = canVerRelatoriosTodasEquipes ? unidadeFilterUnitId : currentUser.unitId;
    return relatoriosTreinamento.filter(r => {
      const reportUnitId = r.unitId || '';
      if (!targetUnitId) return true;
      if (reportUnitId) return reportUnitId === targetUnitId;
      const condutorUser = selectableUsersForTreino.find(u => u.id === r.condutorId) || (r.condutorId === currentUser.id ? currentUser : undefined);
      if (condutorUser?.unitId) return condutorUser.unitId === targetUnitId;
      const condutorDogs = getRelatorioCondutorDogs(r);
      if (condutorDogs.some(cd => cachorros.find(d => d.id === cd.id)?.unitId === targetUnitId)) return true;
      return false;
    });
  }, [relatoriosTreinamento, currentUser, canVerRelatoriosTodasEquipes, unidadeFilterUnitId, selectableUsersForTreino, cachorros]);

  const unitOfficersForFilter = useMemo(() => {
    const map = new Map<string, { id: string; name: string; masp: string }>();
    for (const r of unitScopedReports) {
      if (r.condutorId && !map.has(r.condutorId)) {
        map.set(r.condutorId, { id: r.condutorId, name: r.condutorNome, masp: r.condutorMasp || '' });
      }
      for (const p of r.participantes || []) {
        if (p.userId && !map.has(p.userId)) {
          map.set(p.userId, { id: p.userId, name: p.name, masp: p.masp || '' });
        }
      }
    }
    for (const u of allUsers) {
      if ((!currentUser?.unitId || canVerRelatoriosTodasEquipes || u.unitId === currentUser.unitId) && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name, masp: u.masp || '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [unitScopedReports, allUsers, currentUser, canVerRelatoriosTodasEquipes]);

  const filteredUnidadeReports = useMemo(() => {
    return unitScopedReports.filter(r => {
      if (unidadeFilterDataInicio && r.dataTreinamento < unidadeFilterDataInicio) return false;
      if (unidadeFilterDataFim && r.dataTreinamento > unidadeFilterDataFim) return false;
      if (unidadeFilterPolicialId) {
        const matchesCondutor = r.condutorId === unidadeFilterPolicialId;
        const matchesPart = (r.participantes || []).some(p => p.userId === unidadeFilterPolicialId);
        if (!matchesCondutor && !matchesPart) return false;
      }
      if (unidadeFilterCachorroId) {
        const matchesMainDog = getRelatorioCondutorDogs(r).some(c => c.id === unidadeFilterCachorroId);
        const matchesPartDog = (r.participantes || []).some(p =>
          (p.cachorros || []).some(c => c.id === unidadeFilterCachorroId)
        );
        if (!matchesMainDog && !matchesPartDog) return false;
      }
      if (unidadeFilterLocal !== 'TODOS' && r.modalidadeLocal !== unidadeFilterLocal) return false;
      return true;
    });
  }, [
    unitScopedReports,
    unidadeFilterDataInicio,
    unidadeFilterDataFim,
    unidadeFilterPolicialId,
    unidadeFilterCachorroId,
    unidadeFilterLocal
  ]);

  const handlePrintRelatorioTreinamento = (rel: RelatorioTreinamentoCanil) => {
    const unitName = units.find(u => u.id === rel.unitId)?.name || units.find(u => u.id === currentUser?.unitId)?.name || 'Unidade Operacional Canil K9';
    const deptName = departments.find(d => d.id === rel.departmentId)?.name || 'Polícia Civil de Minas Gerais';
    const isSozinho = rel.modalidadeParticipacao === 'Sozinho';
    const condutorDogs = getRelatorioCondutorDogs(rel);
    const dogsTitleText = condutorDogs.map(c => c.nome).join(', ') || rel.cachorroNome;
    const docTitle = buildStandardDocumentTitle(
      'Relatório de Treinamento (Canil K9)',
      `${dogsTitleText} - ${formatDateBr(rel.dataTreinamento)}`,
      rel.condutorNome
    );

    const participantBoxesHtml = isSozinho
      ? `
        <div class="sig-grid-single">
          <div class="sig-box">
            ${rel.condutorAssinado ? '<div class="sig-digital">Assinado eletronicamente no sistema</div>' : '<div class="sig-space"></div>'}
            <div class="sig-line">${escapeHtmlText(rel.condutorNome)}</div>
            <div class="sig-meta">${rel.condutorMasp ? `MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))}` : ''} ${rel.condutorCargo ? `• ${escapeHtmlText(rel.condutorCargo)}` : ''}</div>
            <div class="sig-role">Condutor Responsável (Treinamento Individual)</div>
          </div>
        </div>
      `
      : `
        <div class="sig-grid">
          <div class="sig-box">
            ${rel.condutorAssinado ? '<div class="sig-digital">Assinado eletronicamente</div>' : '<div class="sig-space"></div>'}
            <div class="sig-line">${escapeHtmlText(rel.condutorNome)}</div>
            <div class="sig-meta">${rel.condutorMasp ? `MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))}` : ''}</div>
            <div class="sig-role">Condutor Responsável</div>
          </div>
          ${(rel.participantes || []).slice(0, 15).map((p, idx) => {
            const dogsText = (p.cachorros && p.cachorros.length > 0)
              ? p.cachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}`).join(', ')
              : 'Sem cachorro';
            return `
            <div class="sig-box">
              ${p.signed ? `<div class="sig-digital">Assinado eletronicamente${p.signedAt ? ` em ${escapeHtmlText(new Date(p.signedAt).toLocaleString('pt-BR'))}` : ''}</div>` : '<div class="sig-space"></div>'}
              <div class="sig-line">${escapeHtmlText(p.name)}</div>
              <div class="sig-meta">${p.masp ? `MASP: ${escapeHtmlText(formatMasp(p.masp))}` : ''} ${p.cargo ? `• ${escapeHtmlText(p.cargo)}` : ''}</div>
              <div class="sig-role">Participante ${idx + 1} • Cão(s): ${escapeHtmlText(dogsText)}</div>
            </div>
          `;
          }).join('')}
        </div>
      `;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; text-align: center; }
    .header .org { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; }
    .header .unit { font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px; }
    .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; margin: 6px 0 2px; }
    .header .doc-id { font-size: 10px; font-family: monospace; color: #64748b; }
    .grid-info { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .grid-info td { border: 1px solid #cbd5e1; padding: 7px 10px; vertical-align: top; }
    .lbl { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
    .val { font-size: 12px; font-weight: 700; color: #0f172a; }
    .desc-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; margin-bottom: 16px; background: #f8fafc; }
    .desc-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .desc-text { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #0f172a; min-height: 70px; }
    .sig-section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin: 14px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    .sig-grid-single { display: flex; justify-content: center; margin-top: 26px; }
    .sig-grid-single .sig-box { width: 320px; text-align: center; }
    .sig-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 24px; margin-top: 18px; }
    .sig-box { text-align: center; page-break-inside: avoid; }
    .sig-space { height: 28px; }
    .sig-digital { height: 28px; display: flex; align-items: flex-end; justify-content: center; font-size: 9px; font-style: italic; color: #047857; padding-bottom: 2px; }
    .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 11px; }
    .sig-meta { font-size: 10px; font-family: monospace; color: #334155; }
    .sig-role { font-size: 9px; color: #64748b; text-transform: uppercase; }
    .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 9px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org">Polícia Civil do Estado de Minas Gerais • ${escapeHtmlText(deptName)}</div>
    <div class="unit">${escapeHtmlText(unitName)} • Seção de Canil K9</div>
    <h1>Relatório Diário de Treinamento K9</h1>
    <div class="doc-id">Registro: ${escapeHtmlText(rel.id)}</div>
  </div>

  <table class="grid-info">
    <tr>
      <td style="width: 25%;">
        <span class="lbl">Data do Treinamento</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(formatDateBr(rel.dataTreinamento))}</span>
      </td>
      <td style="width: 45%;">
        <span class="lbl">Condutor</span>
        <span class="val">${escapeHtmlText(rel.condutorNome)}${rel.condutorMasp ? ` (MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))})` : ''}</span>
      </td>
      <td style="width: 30%;">
        <span class="lbl">${condutorDogs.length > 1 ? 'Cães Policiais K9' : 'Cão Policial K9'}</span>
        <span class="val">${condutorDogs.map(c => `${escapeHtmlText(c.nome)}${c.raca ? ` (${escapeHtmlText(c.raca)})` : ''}`).join('<br/>')}</span>
      </td>
    </tr>
    <tr>
      <td>
        <span class="lbl">Local do Treinamento</span>
        <span class="val">${escapeHtmlText(rel.modalidadeLocal)}</span>
      </td>
      <td>
        <span class="lbl">Modalidade de Participação</span>
        <span class="val">${escapeHtmlText(rel.modalidadeParticipacao)}${!isSozinho ? ` (${1 + (rel.participantes?.length || 0)} participantes)` : ''}</span>
      </td>
      <td>
        <span class="lbl">${condutorDogs.length > 1 ? 'Microchips' : 'Microchip'}</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(condutorDogs.map(c => c.microchip).filter(Boolean).join(', ') || 'N/A')}</span>
      </td>
    </tr>
  </table>

  <div class="desc-box">
    <div class="desc-title">Descrição do Treinamento do Dia</div>
    <div class="desc-text">${escapeHtmlText(rel.descricao)}</div>
  </div>

  <div class="sig-section-title">Assinaturas</div>
  ${participantBoxesHtml}

  <div class="footer">
    Documento emitido eletronicamente pelo Sistema ARMARIA • Polícia Civil de Minas Gerais
  </div>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  const handlePrintRelatorioUnidadeConsolidado = () => {
    const unitName =
      units.find(u => u.id === (canVerRelatoriosTodasEquipes && unidadeFilterUnitId ? unidadeFilterUnitId : currentUser?.unitId))?.name ||
      'Todas as Unidades / Equipes';
    const docTitle = buildStandardDocumentTitle('Relatório Consolidado de Treinamentos K9 (Canil)', unitName, currentUser?.name || '');

    const rowsHtml = filteredUnidadeReports.length === 0
      ? `<tr><td colspan="6" style="text-align:center; padding: 14px; color: #64748b;">Nenhum relatório encontrado para os filtros selecionados.</td></tr>`
      : filteredUnidadeReports
          .map(r => {
            const condutorDogs = getRelatorioCondutorDogs(r);
            const condutorDogsHtml = condutorDogs
              .map(c => `<strong>${escapeHtmlText(c.nome)}</strong>${c.raca ? ` <span style="font-size:9px; color:#475569;">(${escapeHtmlText(c.raca)})</span>` : ''}`)
              .join('<br/>');
            const participantsSummary =
              r.modalidadeParticipacao === 'Coletivo' && (r.participantes || []).length > 0
                ? `<br/><span style="font-size:9px; color:#475569;">${(r.participantes || [])
                    .map(p => {
                      const dogsTxt =
                        p.cachorros && p.cachorros.length > 0
                          ? p.cachorros.map(c => c.nome).join(', ')
                          : 'Sem cachorro';
                      return `${escapeHtmlText(p.name)} (${escapeHtmlText(dogsTxt)})`;
                    })
                    .join('; ')}</span>`
                : '';
            return `
            <tr>
              <td style="font-family: monospace; white-space: nowrap;">${escapeHtmlText(formatDateBr(r.dataTreinamento))}</td>
              <td><strong>${escapeHtmlText(r.condutorNome)}</strong>${r.condutorMasp ? `<br/><span style="font-size:9px; color:#475569;">MASP: ${escapeHtmlText(formatMasp(r.condutorMasp))}</span>` : ''}</td>
              <td>${condutorDogsHtml}${participantsSummary}</td>
              <td>${escapeHtmlText(r.modalidadeLocal)}</td>
              <td>${escapeHtmlText(r.modalidadeParticipacao)}${r.modalidadeParticipacao === 'Coletivo' ? `<br/><span style="font-size:9px; color:#475569;">+${(r.participantes || []).length} policial(is)</span>` : ''}</td>
              <td style="white-space: pre-wrap; word-break: break-word;">${escapeHtmlText(r.descricao)}</td>
            </tr>`;
          })
          .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; text-align: center; }
    .header h1 { font-size: 15px; margin: 4px 0; text-transform: uppercase; }
    .meta { font-size: 10px; color: #475569; margin-bottom: 10px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-weight:bold; font-size:10px; text-transform:uppercase;">Polícia Civil do Estado de Minas Gerais • Seção Canil K9</div>
    <h1>Relatório de Treinamentos da Unidade</h1>
    <div style="font-size:10px; color:#334155;">Unidade: ${escapeHtmlText(unitName)}</div>
  </div>
  <div class="meta">
    <span>Total de registros listados: <strong>${filteredUnidadeReports.length}</strong></span>
    <span>Emitido em: ${escapeHtmlText(new Date().toLocaleString('pt-BR'))}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 9%;">Data</th>
        <th style="width: 18%;">Condutor</th>
        <th style="width: 14%;">Cachorro K9</th>
        <th style="width: 9%;">Local</th>
        <th style="width: 12%;">Participação</th>
        <th style="width: 38%;">Descrição do Treinamento</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
          <Dog className="w-80 h-80 text-amber-400" />
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-3">
              <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/30 text-amber-400 shadow-inner">
                <Dog className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-100 tracking-wide font-mono flex items-center space-x-2">
                  <span>CANIL</span>
                  <span className="text-xs bg-amber-500 text-slate-950 font-sans font-bold px-2 py-0.5 rounded-full uppercase">
                    POLÍCIA CIVIL
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Gestão integrada de cães policiais, canis físicos, farmácia veterinária, rações e administração terapêutica.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {canCreateBaiasEAnimais && (
              <button
                onClick={handleOpenNewDog}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg transition text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>CADASTRAR CÃO K9</span>
              </button>
            )}
            {canCadastrarMedicamentos && (
              <button
                onClick={() => handleOpenNewProd('REMEDIO')}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition text-xs"
              >
                <Pill className="w-4 h-4" />
                <span>NOVO MEDICAMENTO</span>
              </button>
            )}
            {canMinistrarMedicamentos && (
              <button
                onClick={() => handleOpenAdminModal()}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition text-xs"
              >
                <Syringe className="w-4 h-4" />
                <span>ADMINISTRAR AO CÃO</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Notifications na primeira camada */}
        <TopLayerAlert type="success" message={successMsg} onClose={() => setSuccessMsg('')} />
        <TopLayerAlert type="error" message={errorMsg} onClose={() => setErrorMsg('')} />

        {/* Statistics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-800/80 text-xs font-mono">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase font-sans">Total Cães K9</span>
            <p className="text-lg font-black text-slate-100">{totalCaes}</p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-emerald-400 text-[10px] uppercase font-sans">Operacionais</span>
            <p className="text-lg font-black text-emerald-400">{caesOperacionais}</p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-amber-400 text-[10px] uppercase font-sans">Em Tratamento</span>
            <p className="text-lg font-black text-amber-400">{caesEmTratamento}</p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase font-sans">Canis / Baias</span>
            <p className="text-lg font-black text-slate-100">{canis.length}</p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-cyan-400 text-[10px] uppercase font-sans">Itens Farmácia</span>
            <p className="text-lg font-black text-cyan-400">{totalProdutos}</p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-purple-400 text-[10px] uppercase font-sans">Valor em Estoque</span>
            <p className="text-lg font-black text-purple-400">R$ {totalValorFarmacia.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Barcode Quick Dispatch Bar */}
      {canMinistrarMedicamentos && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-slate-300 w-full sm:w-auto">
            <Barcode className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-semibold text-slate-200">Leitor / Busca Rápida por Código de Barras:</span>
          </div>
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={barcodeQuery}
              onChange={(e) => handleBarcodeSearch(e.target.value)}
              placeholder="Passe o leitor ou digite o código de barras (EAN)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center space-x-1 border-b border-slate-800 overflow-x-auto pb-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('caes')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'caes'
              ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <Dog className="w-4 h-4" />
          <span>CÃES K9 ({cachorros.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('canis')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
            activeTab === 'canis'
              ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>CANIS FÍSICOS & BAIAS ({canis.length})</span>
        </button>

        {showFarmaciaTab && (
          <button
            onClick={() => setActiveTab('farmacia')}
            className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
              activeTab === 'farmacia'
                ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Pill className="w-4 h-4" />
            <span>FARMÁCIA, REMÉDIOS & RAÇÕES ({produtos.length})</span>
          </button>
        )}

        {canMinistrarMedicamentos && (
          <button
            onClick={() => setActiveTab('administracao')}
            className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
              activeTab === 'administracao'
                ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Syringe className="w-4 h-4" />
            <span>ADMINISTRAÇÃO & BAIXAS</span>
          </button>
        )}

        {canMinistrarMedicamentos && (
          <button
            onClick={() => setActiveTab('historico')}
            className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
              activeTab === 'historico'
                ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>HISTÓRICO DE APLICAÇÕES ({movimentacoes.length})</span>
          </button>
        )}

        {canAccessTrainingTabs && (
          <>
            <button
              onClick={() => setActiveTab('relatorio-treinamento')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
                activeTab === 'relatorio-treinamento'
                  ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>RELATÓRIO DE TREINAMENTO</span>
            </button>

            <button
              onClick={() => setActiveTab('meus-relatorios')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
                activeTab === 'meus-relatorios'
                  ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>MEUS RELATÓRIOS ({meusRelatoriosList.length})</span>
              {myPendingSignCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                  {myPendingSignCount}
                </span>
              )}
            </button>

            {canVerRelatoriosTodasEquipes && (
              <button
                onClick={() => setActiveTab('relatorio-unidade')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-t-xl transition border-b-2 whitespace-nowrap ${
                  activeTab === 'relatorio-unidade'
                    ? 'border-amber-400 text-amber-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>RELATÓRIOS DA UNIDADE ({unitScopedReports.length})</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CÃES K9 */}
      {/* ========================================================================= */}
      {activeTab === 'caes' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, microchip, raça ou condutor..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-amber-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            </div>

            <div className="flex items-center space-x-2 w-full md:w-auto">
              <span className="text-xs text-slate-400 font-medium">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="Ativo / Operacional">Ativo / Operacional</option>
                <option value="Em Treinamento">Em Treinamento</option>
                <option value="Tratamento Veterinário">Tratamento Veterinário</option>
                <option value="Aposentado">Aposentado</option>
                <option value="Baixado / Óbito">Baixado / Óbito</option>
              </select>
            </div>
          </div>

          {/* Dogs Grid Cards */}
          {filteredDogs.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <Dog className="w-12 h-12 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-300">Nenhum cão K9 encontrado.</p>
              <p className="text-xs text-slate-500">Cadastre um novo cachorro policial para iniciar o acompanhamento veterinário.</p>
              {canCreateBaiasEAnimais && (
                <button
                  onClick={handleOpenNewDog}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>CADASTRAR CÃO K9</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDogs.map((dog) => {
                const kennel = canis.find(k => k.id === dog.canilFisicoId);
                const isSystemUser = dog.tipoVinculo === 'SISTEMA';
                const handlerName = isSystemUser ? (dog.usuarioInternoNome || 'Policial do Sistema') : (dog.responsavelExternoNome || 'Responsável Externo');
                const handlerDoc = isSystemUser ? (dog.usuarioInternoMasp ? `MASP: ${formatMasp(dog.usuarioInternoMasp)}` : '') : (dog.responsavelExternoDoc ? `Doc: ${dog.responsavelExternoDoc}` : '');

                return (
                  <div
                    key={dog.id}
                    className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 shadow-lg transition flex flex-col justify-between space-y-4 relative group"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                          dog.status === 'Ativo / Operacional'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                            : dog.status === 'Tratamento Veterinário'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/40 animate-pulse'
                            : dog.status === 'Em Treinamento'
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {dog.status}
                        </span>

                        <span className="text-[10px] font-mono bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                          {dog.sexo}
                        </span>
                      </div>

                      {/* Dog Avatar + Name */}
                      <div className="flex items-center space-x-3.5 mb-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-amber-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                          {dog.fotoUrl ? (
                            <img src={dog.fotoUrl} alt={dog.nome} className="w-full h-full object-cover" />
                          ) : (
                            <Dog className="w-8 h-8 text-amber-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-base text-slate-100 truncate tracking-wide font-mono">
                            {dog.nome.toUpperCase()}
                          </h3>
                          <p className="text-xs text-amber-400 font-semibold truncate">{dog.raca}</p>
                          <p className="text-[11px] text-slate-400">{calculateAge(dog.dataNascimento)}</p>
                        </div>
                      </div>

                      {/* Details Box */}
                      <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Microchip:</span>
                          <span className="font-mono font-bold text-slate-200">{dog.microchip || 'Não chipado'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Baia / Canil:</span>
                          <span className="font-semibold text-amber-300 truncate max-w-[150px]">
                            {kennel ? `${kennel.nome} ${kennel.identificacao ? `(${kennel.identificacao})` : ''}` : 'Não alocado'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Especialidade:</span>
                          <span className="text-slate-200 truncate max-w-[150px] font-medium">{dog.especialidade || 'Patrulha'}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 flex items-start space-x-2">
                          <UserCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 space-y-1">
                            <div>
                              <p className="text-[11px] font-bold text-slate-200 truncate">
                                {dog.tipoVinculo === 'SISTEMA' && dog.usuarioInterno2Nome ? `1º: ${handlerName}` : handlerName}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {handlerDoc} {dog.tipoVinculo === 'EXTERNO' ? `• ${dog.responsavelExternoOrgao || 'Externo'}` : ''}
                              </p>
                            </div>
                            {dog.tipoVinculo === 'SISTEMA' && dog.usuarioInterno2Nome && (
                              <div>
                                <p className="text-[11px] font-bold text-slate-200 truncate">
                                  2º: {dog.usuarioInterno2Nome}
                                </p>
                                {dog.usuarioInterno2Masp && (
                                  <p className="text-[10px] text-slate-400 font-mono">
                                    MASP: {formatMasp(dog.usuarioInterno2Masp)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {(canMinistrarMedicamentos || canCreateBaiasEAnimais) && (
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        {canMinistrarMedicamentos && (
                          <button
                            onClick={() => handleOpenAdminModal(undefined, dog)}
                            className="flex-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center space-x-1.5"
                            title="Administrar medicamento ou alimento a este cão"
                          >
                            <Syringe className="w-3.5 h-3.5" />
                            <span>Administrar</span>
                          </button>
                        )}

                        {canCreateBaiasEAnimais && (
                          <>
                            <button
                              onClick={() => handleEditDog(dog)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                              title="Editar cadastro do cão"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteDog(dog)}
                              className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg transition border border-red-800/40"
                              title="Excluir cão"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CANIS FÍSICOS & BAIAS */}
      {/* ========================================================================= */}
      {activeTab === 'canis' && (
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-mono">ESTRUTURA DE ALOJAMENTO & BAIAS</h2>
              <p className="text-xs text-slate-400">Gerenciamento físico de instalações, boxes, capacidade e lotação.</p>
            </div>
            {canCreateBaiasEAnimais && (
              <button
                onClick={handleOpenNewCanil}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>NOVO CANIL / BAIA</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {canis.map((canil) => {
              const dogsInKennel = cachorros.filter(c => c.canilFisicoId === canil.id);
              const isFull = dogsInKennel.length >= canil.capacidade;

              return (
                <div key={canil.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        canil.status === 'Ativo'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : 'bg-red-950 text-red-300 border-red-500/40'
                      }`}>
                        {canil.status}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        isFull ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-950 text-slate-400'
                      }`}>
                        Ocupação: {dogsInKennel.length} / {canil.capacidade}
                      </span>
                    </div>

                    <h3 className="font-black text-lg text-slate-100 font-mono">{canil.nome}</h3>
                    {canil.identificacao && (
                      <p className="text-xs text-amber-400 font-semibold">{canil.identificacao}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1">
                      <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{canil.localizacao || 'Localização não especificada'}</span>
                    </p>

                    {/* Dogs Housed inside */}
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-300">Cães Alojados:</p>
                      {dogsInKennel.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">Baia desocupada no momento.</p>
                      ) : (
                        <div className="space-y-1">
                          {dogsInKennel.map(d => (
                            <div key={d.id} className="bg-slate-950 p-2 rounded-lg flex items-center justify-between text-xs border border-slate-800">
                              <span className="font-bold text-slate-200">{d.nome}</span>
                              <span className="text-[10px] text-amber-400 font-mono">{d.raca}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {canCreateBaiasEAnimais && (
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEditCanil(canil)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCanil(canil)}
                        className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg transition border border-red-800/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FARMÁCIA, REMÉDIOS & RAÇÕES */}
      {/* ========================================================================= */}
      {showFarmaciaTab && activeTab === 'farmacia' && (
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por remédio, ração, código de barras ou fabricante..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-amber-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={filterTipoProduto}
                onChange={(e) => setFilterTipoProduto(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="TODOS">Todos os Tipos</option>
                <option value="REMEDIO">Apenas Remédios</option>
                <option value="RACAO">Apenas Rações</option>
                <option value="INSUMO">Insumos e Acessórios</option>
                <option value="OUTROS">Outros</option>
              </select>

              {canCadastrarMedicamentos && (
                <>
                  <button
                    onClick={() => handleOpenNewProd('REMEDIO')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-xs transition flex items-center space-x-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Remédio</span>
                  </button>
                  <button
                    onClick={() => handleOpenNewProd('RACAO')}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-2 rounded-xl text-xs transition flex items-center space-x-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Ração / Insumo</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((prod) => {
              const isRemedio = prod.tipo === 'REMEDIO';
              const isLowStock = prod.quantidadeEstoque <= prod.quantidadeMinima;
              const isExpired = prod.temValidade && prod.dataValidade && new Date(prod.dataValidade) < new Date();

              return (
                <div
                  key={prod.id}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-3 transition"
                >
                  <div>
                    {/* Header Badges */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        isRemedio
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                          : prod.tipo === 'RACAO'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                          : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                      }`}>
                        {prod.tipo} {prod.categoria ? `• ${prod.categoria}` : ''}
                      </span>

                      {isLowStock && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-500/50 animate-pulse">
                          Estoque Baixo
                        </span>
                      )}
                    </div>

                    <h3 className="font-black text-base text-slate-100 font-mono">{prod.nome}</h3>
                    {prod.fabricante && (
                      <p className="text-xs text-slate-400">Fabr: {prod.fabricante} {prod.lote ? `• Lote: ${prod.lote}` : ''}</p>
                    )}

                    {/* Barcode representation */}
                    {prod.codigoBarras && (
                      <div className="mt-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800 flex items-center space-x-1.5 text-[11px] font-mono text-slate-400">
                        <Barcode className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>EAN: {prod.codigoBarras}</span>
                      </div>
                    )}

                    {/* Specific details */}
                    <div className="mt-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Estoque Atual:</span>
                        <span className="font-mono font-black text-emerald-400 text-sm">
                          {prod.quantidadeEstoque} {prod.unidadeMedida}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Valor Unitário:</span>
                        <span className="font-mono font-bold text-amber-300">
                          R$ {prod.valorUnitario ? prod.valorUnitario.toFixed(2) : '0.00'}
                        </span>
                      </div>

                      {isRemedio && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Forma / Regime:</span>
                            <span className="font-semibold text-slate-200">{prod.formaFarmaceutica} • {prod.regimeConsumo}</span>
                          </div>
                          {prod.regimeConsumo === 'Consumo Diário' && prod.intervaloHoras && (
                            <div className="flex items-center justify-between text-cyan-400">
                              <span>Frequência:</span>
                              <span className="font-mono font-bold">A cada {prod.intervaloHoras} horas</span>
                            </div>
                          )}
                          {prod.dosagemPadrao && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Dosagem Padrão:</span>
                              <span className="font-mono text-slate-300">{prod.dosagemPadrao}</span>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">Validade:</span>
                        <span className={`font-mono text-[11px] ${isExpired ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                          {prod.temValidade ? (prod.dataValidade || 'Sem data') : 'Sem prazo de validade'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {(canMinistrarMedicamentos || canCadastrarMedicamentos) && (
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      {canMinistrarMedicamentos && (
                        <button
                          onClick={() => handleOpenAdminModal(prod)}
                          className="flex-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center space-x-1"
                        >
                          <Syringe className="w-3.5 h-3.5" />
                          <span>Destinar / Baixa</span>
                        </button>
                      )}

                      {canCadastrarMedicamentos && (
                        <>
                          <button
                            onClick={() => handleEditProd(prod)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteProd(prod)}
                            className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg transition border border-red-800/40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: ADMINISTRAÇÃO & BAIXAS (DESTINAÇÃO AO CÃO) */}
      {/* ========================================================================= */}
      {canMinistrarMedicamentos && activeTab === 'administracao' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-black text-slate-100 font-mono flex items-center space-x-2">
              <Syringe className="w-5 h-5 text-cyan-400" />
              <span>DISPENSAR & ADMINISTRAR PRODUTO VETERINÁRIO AO CÃO K9</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Destine remédios, dosagens, horários e ração a um cachorro específico ou registre baixas gerais de estoque.
            </p>
          </div>

          <form onSubmit={handleSaveAdministration} className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Tipo de Operação */}
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Tipo de Movimentação</label>
              <select
                value={adminForm.tipoMovimentacao}
                onChange={(e) => setAdminForm({ ...adminForm, tipoMovimentacao: e.target.value as TipoMovimentacaoVet })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
              >
                <option value="ADMINISTRACAO_CAO">Administração Direta ao Cão K9 (Remédio / Ração)</option>
                <option value="BAIXA_CONSUMO">Baixa Geral por Consumo</option>
                <option value="BAIXA_DESCARTE">Baixa por Descarte / Vencimento</option>
                <option value="ENTRADA">Entrada / Reabastecimento de Estoque</option>
              </select>
            </div>

            {/* Produto */}
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Produto / Medicamento</label>
              <select
                value={adminForm.produtoId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const p = produtos.find(item => item.id === pid);
                  setSelectedProdForAdmin(p || null);
                  setAdminForm({
                    ...adminForm,
                    produtoId: pid,
                    dosagemAplicada: p?.dosagemPadrao || '',
                    frequenciaAdministrada: p?.intervaloHoras ? `A cada ${p.intervaloHoras} horas` : 'Dose única'
                  });
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500 font-mono"
                required
              >
                <option value="">Selecione o produto...</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.tipo}) - Estoque: {p.quantidadeEstoque} {p.unidadeMedida} - R$ {p.valorUnitario.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Dog Selector (if administrating to dog) */}
            {adminForm.tipoMovimentacao === 'ADMINISTRACAO_CAO' && (
              <div className="md:col-span-2 bg-slate-950 p-4 rounded-xl border border-cyan-500/30 space-y-3">
                <label className="block text-cyan-400 font-bold uppercase tracking-wider">Cão Policial Destinatário</label>
                <select
                  value={adminForm.cachorroId}
                  onChange={(e) => setAdminForm({ ...adminForm, cachorroId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-cyan-500 text-sm font-bold"
                  required
                >
                  <option value="">Selecione o cão K9...</option>
                  {cachorros.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} - {c.raca} (Microchip: {c.microchip || 'N/A'}) - Condutor(es): {formatDogHandlersLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantidade e Data/Hora */}
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">
                Quantidade ({selectedProdForAdmin?.unidadeMedida || 'Unidades'})
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={adminForm.quantidade}
                onChange={(e) => setAdminForm({ ...adminForm, quantidade: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 font-mono focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Data e Hora da Aplicação</label>
              <input
                type="datetime-local"
                value={adminForm.dataHora}
                onChange={(e) => setAdminForm({ ...adminForm, dataHora: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 font-mono focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            {/* Dosagem e Frequência */}
            {adminForm.tipoMovimentacao === 'ADMINISTRACAO_CAO' && (
              <>
                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Dosagem Administrada</label>
                  <input
                    type="text"
                    value={adminForm.dosagemAplicada}
                    onChange={(e) => setAdminForm({ ...adminForm, dosagemAplicada: e.target.value })}
                    placeholder="Ex: 1 comprimido (50mg), 2.5 ml subcutâneo"
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Frequência / Intervalo</label>
                  <input
                    type="text"
                    value={adminForm.frequenciaAdministrada}
                    onChange={(e) => setAdminForm({ ...adminForm, frequenciaAdministrada: e.target.value })}
                    placeholder="Ex: De 8 em 8 horas por 5 dias, Dose única"
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </>
            )}

            {/* Responsável pela Aplicação */}
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Responsável pela Aplicação / Veterinário</label>
              <select
                value={adminForm.responsavelAplicacaoId}
                onChange={(e) => setAdminForm({ ...adminForm, responsavelAplicacaoId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
              >
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (MASP: {formatMasp(u.masp)} - {u.cargo})
                  </option>
                ))}
              </select>
            </div>

            {/* Motivo / Prescrição */}
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Motivo / Prescrição Clínica</label>
              <input
                type="text"
                value={adminForm.motivo}
                onChange={(e) => setAdminForm({ ...adminForm, motivo: e.target.value })}
                placeholder="Ex: Pós-operatório, dermatite, alimentação diária de treino"
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Observações */}
            <div className="md:col-span-2">
              <label className="block text-slate-300 font-bold uppercase mb-1">Observações Complementares</label>
              <textarea
                value={adminForm.observacoes}
                onChange={(e) => setAdminForm({ ...adminForm, observacoes: e.target.value })}
                rows={2}
                placeholder="Informações adicionais sobre a reação do animal, lote de aplicação, etc."
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Submit */}
            <div className="md:col-span-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex items-center justify-center space-x-2 text-sm tracking-wide"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>CONFIRMAR ADMINISTRAÇÃO & ATUALIZAR ESTOQUE</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: HISTÓRICO DE APLICAÇÕES */}
      {/* ========================================================================= */}
      {canMinistrarMedicamentos && activeTab === 'historico' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-mono">REGISTRO DE ADMINISTRAÇÕES & BAIXAS</h2>
              <p className="text-xs text-slate-400">Histórico completo auditado com data, hora, cão, condutor e responsável.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Data / Hora</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Produto</th>
                  <th className="py-3 px-3">Qtd</th>
                  <th className="py-3 px-3">Cão Destinatário</th>
                  <th className="py-3 px-3">Condutor</th>
                  <th className="py-3 px-3">Dosagem / Frequência</th>
                  <th className="py-3 px-3">Responsável</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {movimentacoes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                      Nenhuma administração ou baixa registrada até o momento.
                    </td>
                  </tr>
                ) : (
                  movimentacoes.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {mov.dataHora}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                          mov.tipoMovimentacao === 'ADMINISTRACAO_CAO'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                            : mov.tipoMovimentacao === 'ENTRADA'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-950 text-red-300 border border-red-500/40'
                        }`}>
                          {mov.tipoMovimentacao}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-100">
                        {mov.produtoNome}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-emerald-400">
                        {mov.quantidade} {mov.unidadeMedida}
                      </td>
                      <td className="py-3 px-3 font-semibold text-amber-300">
                        {mov.cachorroNome ? `${mov.cachorroNome} (${mov.cachorroRaca || 'K9'})` : '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {mov.condutorNome || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {mov.dosagemAplicada ? `${mov.dosagemAplicada} ${mov.frequenciaAdministrada ? `• ${mov.frequenciaAdministrada}` : ''}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {mov.responsavelAplicacaoNome} {mov.responsavelAplicacaoMasp ? `(${formatMasp(mov.responsavelAplicacaoMasp)})` : ''}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedReceiptMov(mov)}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded transition inline-flex items-center space-x-1"
                          title="Imprimir Ficha / Termo de Aplicação"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-semibold">Termo</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: RELATÓRIO DE TREINAMENTO (OPERADOR CANINO / CANIL) */}
      {/* ========================================================================= */}
      {canAccessTrainingTabs && activeTab === 'relatorio-treinamento' && (
        <div className="space-y-4">
          {editableTodayReports.length > 0 && (
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <div>
                    <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wide font-mono">
                      Relatórios de Hoje Disponíveis para Edição ({editableTodayReports.length})
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Relatórios criados ou assinados por você hoje podem ser modificados ao longo do dia.
                    </p>
                  </div>
                </div>
                {editingTreinoReport && (
                  <button
                    type="button"
                    onClick={handleCancelEditTreinamento}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 border border-slate-700 transition self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Novo Relatório</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                {editableTodayReports.map(rel => {
                  const isBeingEdited = editingTreinoReport?.id === rel.id;
                  const isCreator = rel.condutorId === currentUser?.id;
                  const dogsText = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ');
                  return (
                    <div
                      key={rel.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-3 transition ${
                        isBeingEdited
                          ? 'bg-cyan-500/10 border-cyan-400/60'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-100 truncate">{dogsText}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                            {rel.modalidadeLocal} • {rel.modalidadeParticipacao}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            {isCreator ? 'Criado por você' : 'Assinado por você'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          Condutor: {rel.condutorNome} — {rel.descricao}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => (isBeingEdited ? handleCancelEditTreinamento() : handleStartEditTreinamento(rel))}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center space-x-1 shrink-0 transition ${
                          isBeingEdited
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                      >
                        {isBeingEdited ? (
                          <>
                            <X className="w-3.5 h-3.5" />
                            <span>Cancelar</span>
                          </>
                        ) : (
                          <>
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        <div className={`bg-slate-900 border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 ${
          editingTreinoReport ? 'border-cyan-500/60' : 'border-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className={`p-2.5 rounded-xl border ${
                editingTreinoReport
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}>
                {editingTreinoReport ? <Edit className="w-5 h-5" /> : <PenTool className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide font-mono">
                    {editingTreinoReport ? 'Editando Relatório de Treinamento do Dia' : 'Relatório de Treinamento do Dia'}
                  </h2>
                  {editingTreinoReport && (
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold uppercase">
                      Modo Edição
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {editingTreinoReport
                    ? 'As assinaturas já registradas serão preservadas. Alterações são permitidas ao longo do dia de hoje.'
                    : 'Registre o treinamento diário do cão K9 com condutor, modalidade, descrição e assinaturas.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editingTreinoReport && (
                <button
                  type="button"
                  onClick={handleCancelEditTreinamento}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-700 transition"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar Edição</span>
                </button>
              )}
              <div className="inline-flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="text-slate-400">Data de Criação:</span>
                <span className="font-bold text-slate-100">{formatDateBr(treinoForm.dataTreinamento)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Condutor */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Condutor Responsável
              </label>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-slate-100">
                    {editingTreinoReport ? editingTreinoReport.condutorNome : (currentUser?.name || 'Policial')}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    MASP: {(editingTreinoReport ? editingTreinoReport.condutorMasp : currentUser?.masp)
                      ? formatMasp((editingTreinoReport ? editingTreinoReport.condutorMasp : currentUser?.masp) || '')
                      : 'N/A'}
                    {(editingTreinoReport ? editingTreinoReport.condutorCargo : currentUser?.cargo)
                      ? ` • ${editingTreinoReport ? editingTreinoReport.condutorCargo : currentUser?.cargo}`
                      : ''}
                  </p>
                  {editingTreinoReport && editingTreinoReport.condutorId !== currentUser?.id && (
                    <p className="text-[10px] text-cyan-300 mt-1 font-semibold">
                      Editando como participante assinante: {currentUser?.name}
                    </p>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                  CONDUTOR
                </span>
              </div>
            </div>

            {/* Cachorro(s) do Condutor */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Cachorro(s) K9 *
                </label>
                {treinoForm.cachorros.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                    {treinoForm.cachorros.length} selecionado(s)
                  </span>
                )}
              </div>

              {treinoForm.cachorros.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {treinoForm.cachorros.map(dog => (
                    <span
                      key={dog.id}
                      className="inline-flex items-center space-x-1.5 bg-slate-900 border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <Dog className="w-3 h-3 text-amber-400" />
                      <span>{dog.nome}{dog.raca ? ` (${dog.raca})` : ''}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMainDog(dog.id)}
                        className="text-slate-400 hover:text-red-400"
                        title="Remover cachorro"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <select
                value=""
                onChange={(e) => handleAddMainDog(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">
                  {treinoForm.cachorros.length === 0
                    ? 'Selecione o(s) cão(es) policial(is)...'
                    : '+ Adicionar outro cachorro...'}
                </option>
                {cachorros
                  .filter(d => d.status !== 'Baixado / Óbito' && !treinoForm.cachorros.some(c => c.id === d.id))
                  .map(dog => (
                    <option key={dog.id} value={dog.id}>
                      {dog.nome} — {dog.raca} ({dog.status})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Local & Participação */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Local do Treinamento *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Interno', 'Externo'] as LocalTreinamentoCanil[]).map(local => (
                  <button
                    key={local}
                    type="button"
                    onClick={() => setTreinoForm({ ...treinoForm, modalidadeLocal: local })}
                    className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                      treinoForm.modalidadeLocal === local
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{local}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Formato de Participação *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Sozinho', 'Coletivo'] as ParticipacaoTreinamentoCanil[]).map(part => (
                  <button
                    key={part}
                    type="button"
                    onClick={() =>
                      setTreinoForm(prev => ({
                        ...prev,
                        modalidadeParticipacao: part,
                        participantes: part === 'Sozinho' ? [] : prev.participantes
                      }))
                    }
                    className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                      treinoForm.modalidadeParticipacao === part
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {part === 'Sozinho' ? <UserCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                    <span>{part}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Participantes Coletivos (até 15 usuários) */}
          {treinoForm.modalidadeParticipacao === 'Coletivo' && (
            <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-4 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-cyan-300 uppercase flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>Usuários Participantes para Assinatura Conjunta</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Adicione até 15 usuários junto com {editingTreinoReport ? editingTreinoReport.condutorNome : currentUser?.name} para constar e assinar este relatório.
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-lg font-mono font-bold text-xs border ${
                    treinoForm.participantes.length >= 15
                      ? 'bg-red-500/20 border-red-500/40 text-red-300'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  {treinoForm.participantes.length} / 15 adicionados
                </span>
              </div>

              {/* Usuários já selecionados (cada integrante com ou sem cachorro, podendo vincular 1 ou mais cachorros) */}
              {treinoForm.participantes.length > 0 && (
                <div className="space-y-2.5">
                  {treinoForm.participantes.map((p, idx) => {
                    const participantDogs = p.cachorros || [];
                    const assignedIds = new Set(participantDogs.map(c => c.id));
                    const availableDogs = cachorros.filter(
                      d => d.status !== 'Baixado / Óbito' && !assignedIds.has(d.id)
                    );
                    return (
                      <div
                        key={p.userId}
                        className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono text-cyan-400 font-bold">#{idx + 1}</span>
                            <span className="font-bold text-slate-100">{p.name}</span>
                            {p.masp && (
                              <span className="text-[10px] font-mono text-slate-400">
                                (MASP: {formatMasp(p.masp)})
                              </span>
                            )}
                            {participantDogs.length === 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400">
                                Sem cachorro
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                                {participantDogs.length} cachorro(s)
                              </span>
                            )}
                            {editingTreinoReport && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                p.signed
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-400'
                              }`}>
                                {p.signed ? '✓ Assinado' : 'Assinatura Pendente'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(p.userId)}
                            className="text-slate-400 hover:text-red-400 transition flex items-center space-x-1 text-[11px]"
                            title="Remover participante"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-slate-800/80">
                          <div className="flex-1 flex flex-wrap items-center gap-1.5">
                            {participantDogs.map(dog => (
                              <span
                                key={dog.id}
                                className="inline-flex items-center space-x-1.5 bg-slate-950 border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                              >
                                <Dog className="w-3 h-3 text-amber-400" />
                                <span>{dog.nome}{dog.raca ? ` (${dog.raca})` : ''}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDogFromParticipant(p.userId, dog.id)}
                                  className="text-slate-400 hover:text-red-400"
                                  title="Remover cachorro deste integrante"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <select
                            value=""
                            onChange={(e) => handleAddDogToParticipant(p.userId, e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-amber-500 sm:w-64"
                          >
                            <option value="">
                              {participantDogs.length === 0
                                ? '+ Vincular cachorro (opcional)...'
                                : '+ Adicionar outro cachorro...'}
                            </option>
                            {availableDogs.map(dog => (
                              <option key={dog.id} value={dog.id}>
                                {dog.nome} — {dog.raca}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Busca e seleção de usuários */}
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="Buscar policial por nome, MASP ou cargo para adicionar..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-900/60">
                  {filteredParticipantCandidates.length === 0 ? (
                    <p className="p-3 text-center text-slate-500">Nenhum outro usuário encontrado para adicionar.</p>
                  ) : (
                    filteredParticipantCandidates.map(u => {
                      const disabled = treinoForm.participantes.length >= 15;
                      return (
                        <div key={u.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-800/40">
                          <div>
                            <p className="font-semibold text-slate-200">{u.name}</p>
                            <p className="text-[10px] font-mono text-slate-400">
                              MASP: {u.masp ? formatMasp(u.masp) : 'N/A'} • {u.cargo || 'Policial'}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => handleAddParticipant(u)}
                            className={`px-3 py-1 rounded-lg font-bold text-[11px] flex items-center space-x-1 transition ${
                              disabled
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Descrição até 1000 caracteres */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-300 uppercase">
                Descrição do Treinamento do Dia *
              </label>
              <span
                className={`font-mono text-[11px] font-bold ${
                  treinoForm.descricao.length >= 950 ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {treinoForm.descricao.length} / 1000 caracteres
              </span>
            </div>
            <textarea
              value={treinoForm.descricao}
              onChange={(e) => setTreinoForm({ ...treinoForm, descricao: e.target.value.slice(0, 1000) })}
              maxLength={1000}
              rows={5}
              placeholder="Descreva as atividades, exercícios de faro/obediência/proteção, comportamento do cão, duração e observações do treinamento..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
            {editingTreinoReport && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCancelEditTreinamento}
                className="px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
              >
                <X className="w-4 h-4" />
                <span>Cancelar Edição</span>
              </button>
            )}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveTreinamento(false)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{editingTreinoReport ? 'Salvar Alterações' : 'Salvar Relatório'}</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveTreinamento(true)}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg transition"
            >
              <Printer className="w-4 h-4" />
              <span>{editingTreinoReport ? 'Salvar Alterações e Imprimir' : 'Salvar e Imprimir Relatório'}</span>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: MEUS RELATÓRIOS (PRÓPRIOS E TREINAMENTOS CONJUNTOS) */}
      {/* ========================================================================= */}
      {canAccessTrainingTabs && activeTab === 'meus-relatorios' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-100 uppercase font-mono flex items-center space-x-2">
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>Meus Relatórios de Treinamento</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Relatórios criados por você ou treinamentos conjuntos em que outros condutores o incluíram para assinatura.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: 'TODOS', label: 'Todos' },
                { key: 'CRIADOS', label: 'Criados por Mim' },
                { key: 'CONJUNTOS_ASSINADOS', label: 'Conjuntos Assinados' },
                { key: 'PENDENTES', label: `Pendentes (${myPendingSignCount})` }
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMeusRelFilter(opt.key as any)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition border ${
                    meusRelFilter === opt.key
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {meusRelatoriosList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-xs">
              Nenhum relatório de treinamento encontrado para este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {meusRelatoriosList.map(rel => {
                const isCreator = rel.condutorId === currentUser?.id;
                const myParticipantEntry = (rel.participantes || []).find(p => p.userId === currentUser?.id);
                const needsMySignature = !isCreator && Boolean(myParticipantEntry && !myParticipantEntry.signed);
                const iSignedJoint = !isCreator && Boolean(myParticipantEntry?.signed);

                return (
                  <div
                    key={rel.id}
                    className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 space-y-3 ${
                      needsMySignature ? 'border-amber-500/60' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400">
                            {formatDateBr(rel.dataTreinamento)}
                          </span>
                          <span className="font-black text-slate-100 text-sm flex items-center space-x-1.5">
                            <Dog className="w-4 h-4 text-amber-400" />
                            <span>{getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ')}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rel.modalidadeLocal === 'Interno'
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          }`}>
                            {rel.modalidadeLocal}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rel.modalidadeParticipacao === 'Sozinho'
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {rel.modalidadeParticipacao}
                          </span>
                          {isCreator && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Autor / Condutor
                            </span>
                          )}
                          {iSignedJoint && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Conjunto Assinado por Você
                            </span>
                          )}
                          {needsMySignature && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Aguardando Sua Assinatura
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          Condutor: <strong className="text-slate-200">{rel.condutorNome}</strong>
                          {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {needsMySignature && (
                          <button
                            onClick={() => handleAssinarRelatorioTreino(rel)}
                            disabled={isSubmitting}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Assinar Relatório</span>
                          </button>
                        )}
                        {canEditRelatorioTreinamento(rel) && (
                          <button
                            onClick={() => handleStartEditTreinamento(rel)}
                            disabled={isSubmitting}
                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                            title="Editar relatório (disponível ao longo do dia de hoje)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        )}
                        <button
                          onClick={() => setViewingTreinoReport(rel)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition"
                        >
                          Visualizar
                        </button>
                        <button
                          onClick={() => handlePrintRelatorioTreinamento(rel)}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimir</span>
                        </button>
                        {(isCreator || isGeral) && (
                          <button
                            onClick={() => handleDeleteRelatorioTreino(rel)}
                            disabled={isSubmitting}
                            className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition"
                            title="Excluir relatório"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-wrap">
                      {rel.descricao}
                    </div>

                    {rel.modalidadeParticipacao === 'Coletivo' && (rel.participantes || []).length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-semibold mr-1">Participantes ({rel.participantes.length}):</span>
                        {rel.participantes.map(p => (
                          <span
                            key={p.userId}
                            className={`px-2 py-0.5 rounded-lg border ${
                              p.signed
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                            }`}
                          >
                            {p.name}
                            {p.cachorros && p.cachorros.length > 0
                              ? ` • Cão(s): ${p.cachorros.map(c => c.nome).join(', ')}`
                              : ' • Sem cachorro'}{' '}
                            {p.signed ? '✓ Assinado' : '• Pendente'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: RELATÓRIO DA UNIDADE (FILTROS: DATA, POLICIAL, CACHORRO, INTERNO/EXTERNO) */}
      {/* ========================================================================= */}
      {canAccessTrainingTabs && canVerRelatoriosTodasEquipes && activeTab === 'relatorio-unidade' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-100 uppercase font-mono flex items-center space-x-2">
                  <Building className="w-4 h-4 text-amber-400" />
                  <span>Relatório de Treinamentos da Unidade</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consulte e filtre todos os relatórios de treinamento da unidade por data, policial, cachorro ou local.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setUnidadeFilterDataInicio('');
                    setUnidadeFilterDataFim('');
                    setUnidadeFilterPolicialId('');
                    setUnidadeFilterCachorroId('');
                    setUnidadeFilterLocal('TODOS');
                    if (isGeral) setUnidadeFilterUnitId('');
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Limpar Filtros
                </button>
                <button
                  onClick={handlePrintRelatorioUnidadeConsolidado}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório da Unidade</span>
                </button>
              </div>
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-800">
              {canVerRelatoriosTodasEquipes && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidade / Equipe</label>
                  <select
                    value={unidadeFilterUnitId}
                    onChange={(e) => setUnidadeFilterUnitId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Todas as Unidades / Equipes</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={unidadeFilterDataInicio}
                  onChange={(e) => setUnidadeFilterDataInicio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Final</label>
                <input
                  type="date"
                  value={unidadeFilterDataFim}
                  onChange={(e) => setUnidadeFilterDataFim(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Policial (Condutor / Participante)</label>
                <select
                  value={unidadeFilterPolicialId}
                  onChange={(e) => setUnidadeFilterPolicialId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Policiais</option>
                  {unitOfficersForFilter.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}{o.masp ? ` (${formatMasp(o.masp)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cachorro K9</label>
                <select
                  value={unidadeFilterCachorroId}
                  onChange={(e) => setUnidadeFilterCachorroId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Cães</option>
                  {cachorros.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome} ({d.raca})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Interno ou Externo</label>
                <select
                  value={unidadeFilterLocal}
                  onChange={(e) => setUnidadeFilterLocal(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="TODOS">Todos (Interno e Externo)</option>
                  <option value="Interno">Interno</option>
                  <option value="Externo">Externo</option>
                </select>
              </div>
            </div>

            {/* Summary counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-slate-400 uppercase">Relatórios Filtrados</span>
                <p className="text-lg font-black text-slate-100">{filteredUnidadeReports.length}</p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-blue-400 uppercase">Internos</span>
                <p className="text-lg font-black text-blue-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeLocal === 'Interno').length}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-purple-400 uppercase">Externos</span>
                <p className="text-lg font-black text-purple-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeLocal === 'Externo').length}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-cyan-400 uppercase">Coletivos</span>
                <p className="text-lg font-black text-cyan-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeParticipacao === 'Coletivo').length}
                </p>
              </div>
            </div>
          </div>

          {/* Unit Reports Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Condutor</th>
                    <th className="p-3.5">Cachorro K9</th>
                    <th className="p-3.5">Local</th>
                    <th className="p-3.5">Participação</th>
                    <th className="p-3.5">Descrição do Treinamento</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredUnidadeReports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500">
                        Nenhum relatório de treinamento da unidade encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredUnidadeReports.map(rel => (
                      <tr key={rel.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                          {formatDateBr(rel.dataTreinamento)}
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-slate-200">{rel.condutorNome}</p>
                          {rel.condutorMasp && (
                            <p className="text-[10px] font-mono text-slate-500">MASP: {formatMasp(rel.condutorMasp)}</p>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-0.5">
                            {getRelatorioCondutorDogs(rel).map(dog => (
                              <div key={dog.id}>
                                <p className="font-bold text-slate-100">{dog.nome}</p>
                                {dog.raca && <p className="text-[10px] text-slate-500">{dog.raca}</p>}
                              </div>
                            ))}
                          </div>
                          {rel.modalidadeParticipacao === 'Coletivo' && (rel.participantes || []).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {rel.participantes.map(p => (
                                <p key={p.userId} className="text-[10px] text-slate-400">
                                  • {p.name}:{' '}
                                  <span className="text-amber-300">
                                    {p.cachorros && p.cachorros.length > 0
                                      ? p.cachorros.map(c => c.nome).join(', ')
                                      : 'Sem cachorro'}
                                  </span>
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rel.modalidadeLocal === 'Interno'
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          }`}>
                            {rel.modalidadeLocal}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rel.modalidadeParticipacao === 'Sozinho'
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {rel.modalidadeParticipacao}
                          </span>
                          {rel.modalidadeParticipacao === 'Coletivo' && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              +{(rel.participantes || []).length} participante(s)
                            </p>
                          )}
                        </td>
                        <td className="p-3.5 max-w-md">
                          <p className="text-slate-300 line-clamp-2 whitespace-pre-wrap">{rel.descricao}</p>
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center space-x-1.5">
                            {canEditRelatorioTreinamento(rel) && (
                              <button
                                onClick={() => handleStartEditTreinamento(rel)}
                                className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                                title="Editar relatório (disponível ao longo do dia de hoje)"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Editar</span>
                              </button>
                            )}
                            <button
                              onClick={() => setViewingTreinoReport(rel)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold transition"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() => handlePrintRelatorioTreinamento(rel)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Imprimir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DO RELATÓRIO DE TREINAMENTO */}
      {viewingTreinoReport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto my-auto text-xs">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Dog className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-slate-100 font-mono text-sm uppercase">
                  Relatório de Treinamento • {formatDateBr(viewingTreinoReport.dataTreinamento)}
                </h3>
              </div>
              <button
                onClick={() => setViewingTreinoReport(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Condutor</span>
                  <p className="font-bold text-slate-100 text-sm">{viewingTreinoReport.condutorNome}</p>
                  {viewingTreinoReport.condutorMasp && (
                    <p className="font-mono text-slate-400">MASP: {formatMasp(viewingTreinoReport.condutorMasp)}</p>
                  )}
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    {getRelatorioCondutorDogs(viewingTreinoReport).length > 1 ? 'Cães Policiais K9' : 'Cão Policial K9'}
                  </span>
                  <div className="space-y-1 mt-0.5">
                    {getRelatorioCondutorDogs(viewingTreinoReport).map(dog => (
                      <div key={dog.id}>
                        <p className="font-bold text-slate-100 text-sm">{dog.nome}</p>
                        <p className="text-slate-400">{dog.raca || 'K9'}{dog.microchip ? ` • Chip: ${dog.microchip}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Local</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeLocal}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Participação</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeParticipacao}</p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Descrição do Treinamento do Dia
                </span>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{viewingTreinoReport.descricao}</p>
              </div>

              {viewingTreinoReport.modalidadeParticipacao === 'Coletivo' && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    Participantes para Assinatura ({viewingTreinoReport.participantes.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {viewingTreinoReport.participantes.map(p => (
                      <div key={p.userId} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-200">{p.name}</p>
                          {p.masp && <p className="text-[10px] font-mono text-slate-400">MASP: {formatMasp(p.masp)}</p>}
                          <p className="text-[10px] text-amber-300 mt-0.5">
                            {p.cachorros && p.cachorros.length > 0
                              ? `Cão(s): ${p.cachorros.map(c => c.nome).join(', ')}`
                              : 'Sem cachorro'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                          p.signed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                        }`}>
                          {p.signed ? 'Assinado' : 'Pendente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setViewingTreinoReport(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Fechar
                </button>
                {canEditRelatorioTreinamento(viewingTreinoReport) && (
                  <button
                    onClick={() => handleStartEditTreinamento(viewingTreinoReport)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center space-x-1.5 transition"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Editar Relatório</span>
                  </button>
                )}
                <button
                  onClick={() => handlePrintRelatorioTreinamento(viewingTreinoReport)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center space-x-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO / EDIÇÃO DE CÃO K9 */}
      {/* ========================================================================= */}
      {showDogModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto my-auto">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2.5">
                <Dog className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-slate-100 font-mono text-base">
                  {editingDog ? 'EDITAR CÃO K9' : 'CADASTRAR NOVO CÃO POLICIAL'}
                </h3>
              </div>
              <button
                onClick={() => setShowDogModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDog} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Nome do Cão *</label>
                  <input
                    type="text"
                    value={dogForm.nome}
                    onChange={(e) => setDogForm({ ...dogForm, nome: e.target.value })}
                    placeholder="Ex: THOR, ZEUS, ATHENA"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold uppercase focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Raça *</label>
                  <input
                    type="text"
                    value={dogForm.raca}
                    onChange={(e) => setDogForm({ ...dogForm, raca: e.target.value })}
                    placeholder="Ex: Pastor Belga Malinois, Pastor Alemão, Labrador"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Sexo</label>
                  <select
                    value={dogForm.sexo}
                    onChange={(e) => setDogForm({ ...dogForm, sexo: e.target.value as SexoCachorro })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Data de Nascimento</label>
                  <input
                    type="date"
                    value={dogForm.dataNascimento}
                    onChange={(e) => setDogForm({ ...dogForm, dataNascimento: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Microchip / Tatuagem</label>
                  <input
                    type="text"
                    value={dogForm.microchip}
                    onChange={(e) => setDogForm({ ...dogForm, microchip: e.target.value })}
                    placeholder="Número do microchip ISO"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Pelagem / Cor</label>
                  <input
                    type="text"
                    value={dogForm.pelagem}
                    onChange={(e) => setDogForm({ ...dogForm, pelagem: e.target.value })}
                    placeholder="Ex: Fulvo encarvado com máscara negra"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Especialidade K9</label>
                  <input
                    type="text"
                    value={dogForm.especialidade}
                    onChange={(e) => setDogForm({ ...dogForm, especialidade: e.target.value })}
                    placeholder="Ex: Faro de Drogas, Detecção de Explosivos, Patrulha"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Canil Físico (Baia / Box)</label>
                  <select
                    value={dogForm.canilFisicoId}
                    onChange={(e) => setDogForm({ ...dogForm, canilFisicoId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Nenhum canil vinculado</option>
                    {canis
                      .filter(k => {
                        const occupied = cachorros.filter(
                          c => c.canilFisicoId === k.id && c.id !== editingDog?.id
                        ).length;
                        return occupied < (k.capacidade || 1);
                      })
                      .map(k => {
                        const occupied = cachorros.filter(
                          c => c.canilFisicoId === k.id && c.id !== editingDog?.id
                        ).length;
                        return (
                          <option key={k.id} value={k.id}>
                            {k.nome} ({k.identificacao || 'Sem código'}) - Ocupação: {occupied}/{k.capacidade}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Status do Animal</label>
                  <select
                    value={dogForm.status}
                    onChange={(e) => setDogForm({ ...dogForm, status: e.target.value as StatusCachorro })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Ativo / Operacional">Ativo / Operacional</option>
                    <option value="Em Treinamento">Em Treinamento</option>
                    <option value="Tratamento Veterinário">Tratamento Veterinário</option>
                    <option value="Aposentado">Aposentado</option>
                    <option value="Baixado / Óbito">Baixado / Óbito</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Foto URL (ou Avatar)</label>
                  <input
                    type="text"
                    value={dogForm.fotoUrl}
                    onChange={(e) => setDogForm({ ...dogForm, fotoUrl: e.target.value })}
                    placeholder="URL da foto do cão"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Vínculo com Condutor */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 uppercase">Vínculo com Condutor / Responsável</span>
                  <div className="flex items-center space-x-3 text-xs">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={dogForm.tipoVinculo === 'SISTEMA'}
                        onChange={() => setDogForm({ ...dogForm, tipoVinculo: 'SISTEMA' })}
                        className="text-amber-500"
                      />
                      <span>Policial do Sistema</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={dogForm.tipoVinculo === 'EXTERNO'}
                        onChange={() => setDogForm({ ...dogForm, tipoVinculo: 'EXTERNO' })}
                        className="text-amber-500"
                      />
                      <span>Condutor Externo</span>
                    </label>
                  </div>
                </div>

                {dogForm.tipoVinculo === 'SISTEMA' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">
                          1º Condutor (Operador Canino) *
                        </label>
                        <select
                          value={dogForm.usuarioInternoId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setDogForm(prev => ({
                              ...prev,
                              usuarioInternoId: nextId,
                              usuarioInterno2Id: prev.usuarioInterno2Id === nextId ? '' : prev.usuarioInterno2Id
                            }));
                          }}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                          required
                        >
                          <option value="">Selecione o 1º condutor...</option>
                          {eligibleDogHandlers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} (MASP: {formatMasp(u.masp)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">
                          2º Condutor (Opcional)
                        </label>
                        <select
                          value={dogForm.usuarioInterno2Id}
                          onChange={(e) => setDogForm({ ...dogForm, usuarioInterno2Id: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Nenhum (apenas 1 condutor)</option>
                          {eligibleDogHandlers
                            .filter(u => u.id !== dogForm.usuarioInternoId)
                            .map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} (MASP: {formatMasp(u.masp)})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    {eligibleDogHandlers.length === 0 && (
                      <p className="text-[11px] text-amber-400">
                        Nenhum usuário com perfil Operador Canino encontrado na sua unidade.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">
                      São exibidos apenas usuários com perfil Operador Canino vinculados à mesma unidade do operador logado.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Nome do Responsável Externo</label>
                      <input
                        type="text"
                        value={dogForm.responsavelExternoNome}
                        onChange={(e) => setDogForm({ ...dogForm, responsavelExternoNome: e.target.value })}
                        placeholder="Nome completo"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Documento (CPF / RG)</label>
                      <input
                        type="text"
                        value={dogForm.responsavelExternoDoc}
                        onChange={(e) => setDogForm({ ...dogForm, responsavelExternoDoc: e.target.value })}
                        placeholder="Documento"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Telefone</label>
                      <input
                        type="text"
                        value={dogForm.responsavelExternoTel}
                        onChange={(e) => setDogForm({ ...dogForm, responsavelExternoTel: e.target.value })}
                        placeholder="(31) 99999-9999"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Órgão / Instituição</label>
                      <input
                        type="text"
                        value={dogForm.responsavelExternoOrgao}
                        onChange={(e) => setDogForm({ ...dogForm, responsavelExternoOrgao: e.target.value })}
                        placeholder="Ex: Polícia Militar, Bombeiros, Canil Civil"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Histórico Clínico / Observações</label>
                <textarea
                  value={dogForm.observacoes}
                  onChange={(e) => setDogForm({ ...dogForm, observacoes: e.target.value })}
                  rows={2}
                  placeholder="Informações comportamentais, alergias, histórico médico..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowDogModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow transition"
                >
                  Salvar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO / EDIÇÃO DE PRODUTO VETERINÁRIO */}
      {/* ========================================================================= */}
      {showProdModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto my-auto">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2.5">
                <Pill className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-slate-100 font-mono text-base">
                  {editingProd ? 'EDITAR PRODUTO VETERINÁRIO' : 'CADASTRAR PRODUTO / REMÉDIO / RAÇÃO'}
                </h3>
              </div>
              <button
                onClick={() => setShowProdModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProd} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Tipo de Produto</label>
                  <select
                    value={prodForm.tipo}
                    onChange={(e) => setProdForm({ ...prodForm, tipo: e.target.value as TipoProdutoVet })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="REMEDIO">Remédio / Farmácia</option>
                    <option value="RACAO">Ração / Nutrição</option>
                    <option value="INSUMO">Insumo / Curativo / Objeto</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Nome do Produto *</label>
                  <input
                    type="text"
                    value={prodForm.nome}
                    onChange={(e) => setProdForm({ ...prodForm, nome: e.target.value })}
                    placeholder="Ex: Amoxicilina 500mg, Ração ProPlan K9, NexGard"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-bold focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Código de Barras (EAN)</label>
                  <input
                    type="text"
                    value={prodForm.codigoBarras}
                    onChange={(e) => setProdForm({ ...prodForm, codigoBarras: e.target.value })}
                    placeholder="EAN / Código numérico"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Fabricante / Laboratório</label>
                  <input
                    type="text"
                    value={prodForm.fabricante}
                    onChange={(e) => setProdForm({ ...prodForm, fabricante: e.target.value })}
                    placeholder="Ex: Zoetis, Bayer, Royal Canin"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Lote</label>
                  <input
                    type="text"
                    value={prodForm.lote}
                    onChange={(e) => setProdForm({ ...prodForm, lote: e.target.value })}
                    placeholder="Ex: LOT-2026-X"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Valor Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prodForm.valorUnitario}
                    onChange={(e) => setProdForm({ ...prodForm, valorUnitario: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Quantidade em Estoque</label>
                  <input
                    type="number"
                    step="any"
                    value={prodForm.quantidadeEstoque}
                    onChange={(e) => setProdForm({ ...prodForm, quantidadeEstoque: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Unidade de Medida</label>
                  <select
                    value={prodForm.unidadeMedida}
                    onChange={(e) => setProdForm({ ...prodForm, unidadeMedida: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Comprimido(s)">Comprimido(s)</option>
                    <option value="Ampola(s)">Ampola(s)</option>
                    <option value="Frasco(s)">Frasco(s)</option>
                    <option value="ml">ml (Mililitro)</option>
                    <option value="Dose(s)">Dose(s)</option>
                    <option value="Kg">Kg (Quilograma)</option>
                    <option value="Unidade(s)">Unidade(s)</option>
                    <option value="Pacote(s)">Pacote(s)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Estoque Mínimo (Alerta)</label>
                  <input
                    type="number"
                    step="any"
                    value={prodForm.quantidadeMinima}
                    onChange={(e) => setProdForm({ ...prodForm, quantidadeMinima: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Local de Guarda</label>
                  <input
                    type="text"
                    value={prodForm.localGuarda}
                    onChange={(e) => setProdForm({ ...prodForm, localGuarda: e.target.value })}
                    placeholder="Ex: Farmácia - Armário B, Geladeira"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Seção de Validade & Perecibilidade */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodForm.temValidade}
                      onChange={(e) => setProdForm({ ...prodForm, temValidade: e.target.checked })}
                      className="rounded border-slate-700 text-amber-500"
                    />
                    <span className="font-bold text-slate-200">Possui Prazo de Validade</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodForm.ehPerecivel}
                      onChange={(e) => setProdForm({ ...prodForm, ehPerecivel: e.target.checked })}
                      className="rounded border-slate-700 text-amber-500"
                    />
                    <span className="font-bold text-slate-200">É Perecível (Ex: Ração, Vacina)</span>
                  </label>
                </div>

                {prodForm.temValidade && (
                  <div>
                    <label className="block text-slate-400 mb-1">Data de Validade</label>
                    <input
                      type="date"
                      value={prodForm.dataValidade}
                      onChange={(e) => setProdForm({ ...prodForm, dataValidade: e.target.value })}
                      className="w-full sm:w-64 bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Seção Específica para Remédios */}
              {prodForm.tipo === 'REMEDIO' && (
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-3">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider block">
                    Parâmetros Terapêuticos do Remédio
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Forma de Administração</label>
                      <select
                        value={prodForm.formaFarmaceutica}
                        onChange={(e) => setProdForm({ ...prodForm, formaFarmaceutica: e.target.value as FormaFarmaceuticaVet })}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      >
                        <option value="Comprimido">Comprimido</option>
                        <option value="Injeção">Injeção (SC / IM / IV)</option>
                        <option value="Pomada">Pomada / Tópico</option>
                        <option value="Gotas / Líquido">Gotas / Líquido</option>
                        <option value="Spray">Spray</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Regime de Consumo</label>
                      <select
                        value={prodForm.regimeConsumo}
                        onChange={(e) => setProdForm({ ...prodForm, regimeConsumo: e.target.value as RegimeConsumoVet })}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      >
                        <option value="Consumo Diário">Consumo Diário</option>
                        <option value="Dose Única">Dose Única</option>
                        <option value="Uso Tópico / Contínuo">Uso Tópico / Contínuo</option>
                      </select>
                    </div>

                    {prodForm.regimeConsumo === 'Consumo Diário' && (
                      <div>
                        <label className="block text-slate-400 mb-1">Intervalo (Em quantas horas)</label>
                        <select
                          value={prodForm.intervaloHoras}
                          onChange={(e) => setProdForm({ ...prodForm, intervaloHoras: parseInt(e.target.value, 10) })}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none font-mono"
                        >
                          <option value="6">A cada 6 horas (4x ao dia)</option>
                          <option value="8">A cada 8 horas (3x ao dia)</option>
                          <option value="12">A cada 12 horas (2x ao dia)</option>
                          <option value="24">A cada 24 horas (1x ao dia)</option>
                          <option value="48">A cada 48 horas (dias alternados)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-400 mb-1">Dosagem Padrão Sugerida</label>
                      <input
                        type="text"
                        value={prodForm.dosagemPadrao}
                        onChange={(e) => setProdForm({ ...prodForm, dosagemPadrao: e.target.value })}
                        placeholder="Ex: 1 comprimido, 2.5 ml"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowProdModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow transition"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO / EDIÇÃO DE CANIL FÍSICO */}
      {/* ========================================================================= */}
      {showCanilModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto my-auto">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2">
                <Building className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-slate-100 font-mono text-base">
                  {editingCanil ? 'EDITAR CANIL FÍSICO' : 'CADASTRAR CANIL FÍSICO'}
                </h3>
              </div>
              <button
                onClick={() => setShowCanilModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCanil} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Nome da Instalação / Canil *</label>
                <input
                  type="text"
                  value={canilForm.nome}
                  onChange={(e) => setCanilForm({ ...canilForm, nome: e.target.value })}
                  placeholder="Ex: Canil Central, Ala K9 Tático"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Identificação / Baia / Box</label>
                <input
                  type="text"
                  value={canilForm.identificacao}
                  onChange={(e) => setCanilForm({ ...canilForm, identificacao: e.target.value })}
                  placeholder="Ex: Baia 01, Box Alfa"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Capacidade (Cães)</label>
                  <input
                    type="number"
                    min="1"
                    value={canilForm.capacidade}
                    onChange={(e) => setCanilForm({ ...canilForm, capacidade: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1">Status</label>
                  <select
                    value={canilForm.status}
                    onChange={(e) => setCanilForm({ ...canilForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Em Manutenção">Em Manutenção</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Localização Física</label>
                <input
                  type="text"
                  value={canilForm.localizacao}
                  onChange={(e) => setCanilForm({ ...canilForm, localizacao: e.target.value })}
                  placeholder="Ex: Pátio Norte - COE / ACADEPOL"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Observações</label>
                <textarea
                  value={canilForm.observacoes}
                  onChange={(e) => setCanilForm({ ...canilForm, observacoes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCanilModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow transition"
                >
                  Salvar Canil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FICHA / TERMO DE ADMINISTRAÇÃO VETERINÁRIA PARA IMPRESSÃO */}
      {/* ========================================================================= */}
      {selectedReceiptMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-y-auto my-auto text-slate-100">
            {/* Action Bar (hidden on print) */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between print:hidden">
              <span className="font-bold text-sm text-amber-400 flex items-center space-x-2">
                <Printer className="w-4 h-4" />
                <span>TERMO DE ADMINISTRAÇÃO VETERINÁRIA K9</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() =>
                    printWithWindowTitle(
                      buildStandardDocumentTitle(
                        'Termo de Administração Veterinária (Canil K9)',
                        `${selectedReceiptMov.cachorroNome || 'K9'} #${selectedReceiptMov.id}`,
                        selectedReceiptMov.responsavelAplicacaoNome || selectedReceiptMov.condutorNome || currentUser?.name || 'Responsável K9'
                      )
                    )
                  }
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  onClick={() => setSelectedReceiptMov(null)}
                  className="p-1 text-slate-400 hover:text-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 bg-white text-slate-900 space-y-6 print:p-0">
              <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
                <p className="font-black text-sm tracking-wider uppercase">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</p>
                <p className="font-bold text-xs uppercase text-slate-700">COORDENADORIA DE OPERAÇÕES POLICIAIS ESPECIAIS • SEÇÃO DE CANIL K9</p>
                <h2 className="font-black text-lg tracking-wide uppercase pt-2">FICHA DE ADMINISTRAÇÃO & TRATAMENTO VETERINÁRIO</h2>
                <p className="text-[11px] font-mono text-slate-600">ID REGISTRO: {selectedReceiptMov.id}</p>
              </div>

              {/* Animal & Handler info */}
              <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 rounded text-xs">
                <div>
                  <p className="text-slate-500 font-semibold uppercase text-[10px]">CÃO POLICIAL K9</p>
                  <p className="font-bold text-base text-slate-900">{selectedReceiptMov.cachorroNome || 'Não especificado'}</p>
                  <p className="text-slate-700">Raça: {selectedReceiptMov.cachorroRaca || 'K9'}</p>
                  <p className="font-mono text-slate-700">Microchip: {selectedReceiptMov.cachorroMicrochip || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold uppercase text-[10px]">CONDUTOR / RESPONSÁVEL</p>
                  <p className="font-bold text-base text-slate-900">{selectedReceiptMov.condutorNome || 'Condutor Policial'}</p>
                  <p className="font-mono text-slate-700">{selectedReceiptMov.condutorMasp ? `MASP: ${formatMasp(selectedReceiptMov.condutorMasp)}` : ''}</p>
                </div>
              </div>

              {/* Medication Administered */}
              <div className="border border-slate-300 p-4 rounded text-xs space-y-3">
                <p className="text-slate-500 font-semibold uppercase text-[10px]">DADOS DA TERAPÊUTICA / INSUMO</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500">Produto Administrado:</span>
                    <p className="font-bold text-sm text-slate-900">{selectedReceiptMov.produtoNome}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Quantidade Dispensada:</span>
                    <p className="font-bold text-sm font-mono text-slate-900">
                      {selectedReceiptMov.quantidade} {selectedReceiptMov.unidadeMedida}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Dosagem Aplicada:</span>
                    <p className="font-bold text-slate-900">{selectedReceiptMov.dosagemAplicada || 'Dose padrão'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Frequência / Intervalo:</span>
                    <p className="font-bold text-slate-900">{selectedReceiptMov.frequenciaAdministrada || 'Dose única'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Data e Horário:</span>
                    <p className="font-bold font-mono text-slate-900">{selectedReceiptMov.dataHora}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Valor Estimado do Item:</span>
                    <p className="font-bold font-mono text-slate-900">R$ {selectedReceiptMov.valorTotalItem.toFixed(2)}</p>
                  </div>
                </div>

                {selectedReceiptMov.motivo && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500">Prescrição / Justificativa Clínica:</span>
                    <p className="italic text-slate-800">{selectedReceiptMov.motivo}</p>
                  </div>
                )}
              </div>

              {/* Signatures */}
              <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <div className="border-t border-slate-900 pt-1">
                    <p className="font-bold">{selectedReceiptMov.responsavelAplicacaoNome}</p>
                    <p className="text-[11px] font-mono text-slate-600">
                      {selectedReceiptMov.responsavelAplicacaoMasp ? `MASP: ${formatMasp(selectedReceiptMov.responsavelAplicacaoMasp)}` : 'Responsável pela Aplicação'}
                    </p>
                    <p className="text-[10px] text-slate-500">Aplicador / Veterinário</p>
                  </div>
                </div>

                <div>
                  <div className="border-t border-slate-900 pt-1">
                    <p className="font-bold">{selectedReceiptMov.condutorNome || 'Condutor K9'}</p>
                    <p className="text-[11px] font-mono text-slate-600">
                      {selectedReceiptMov.condutorMasp ? `MASP: ${formatMasp(selectedReceiptMov.condutorMasp)}` : 'Condutor Responsável'}
                    </p>
                    <p className="text-[10px] text-slate-500">Policial Condutor / Destinatário</p>
                  </div>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 pt-6 border-t border-slate-200">
                Documento emitido eletronicamente pelo Sistema ARMARIA • Polícia Civil de Minas Gerais
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
