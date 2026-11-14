import React, { useState, useMemo } from 'react';
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
  TipoMovimentacaoVet
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printWithWindowTitle } from '../utils/printHelper';
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
  Info
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
  const [activeTab, setActiveTab] = useState<'caes' | 'canis' | 'farmacia' | 'administracao' | 'historico'>('caes');

  // Data from storage
  const canis = storage.getCanisFisicos();
  const cachorros = storage.getCachorros();
  const produtos = storage.getProdutosVeterinarios();
  const movimentacoes = storage.getMovimentacoesVeterinarias();

  // Common filters & search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [filterTipoProduto, setFilterTipoProduto] = useState<string>('TODOS');

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
  const handleOpenNewDog = () => {
    setEditingDog(null);
    setDogForm({
      nome: '',
      raca: 'Pastor Belga Malinois',
      sexo: 'Macho',
      dataNascimento: '',
      microchip: '',
      pelagem: '',
      especialidade: 'Faro de Drogas / Entorpecentes',
      canilFisicoId: canis[0]?.id || '',
      status: 'Ativo / Operacional',
      tipoVinculo: 'SISTEMA',
      usuarioInternoId: currentUser?.id || allUsers[0]?.id || '',
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
    if (!dogForm.nome.trim()) {
      notifyError('O nome do cão é obrigatório.');
      return;
    }
    if (!dogForm.raca.trim()) {
      notifyError('A raça do cão é obrigatória.');
      return;
    }

    let internalUser: User | undefined;
    if (dogForm.tipoVinculo === 'SISTEMA' && dogForm.usuarioInternoId) {
      internalUser = allUsers.find(u => u.id === dogForm.usuarioInternoId);
    }

    setIsSubmitting(true);
    const res = await storage.saveCachorro({
      id: editingDog?.id,
      ...dogForm,
      usuarioInternoNome: internalUser?.name,
      usuarioInternoMasp: internalUser?.masp,
      usuarioInternoCargo: internalUser?.cargo
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
      condutorNome: targetDog?.tipoVinculo === 'SISTEMA' ? targetDog?.usuarioInternoNome : targetDog?.responsavelExternoNome,
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
          condutorNome: targetDog.tipoVinculo === 'SISTEMA' ? targetDog.usuarioInternoNome : targetDog.responsavelExternoNome,
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
            <button
              onClick={handleOpenNewDog}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg transition text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>CADASTRAR CÃO K9</span>
            </button>
            <button
              onClick={() => handleOpenNewProd('REMEDIO')}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition text-xs"
            >
              <Pill className="w-4 h-4" />
              <span>NOVO MEDICAMENTO</span>
            </button>
            <button
              onClick={() => handleOpenAdminModal()}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition text-xs"
            >
              <Syringe className="w-4 h-4" />
              <span>ADMINISTRAR AO CÃO</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {successMsg && (
          <div className="mt-4 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs p-3.5 rounded-xl flex items-center space-x-2 shadow-md animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 bg-red-950/80 border border-red-500/50 text-red-300 text-xs p-3.5 rounded-xl flex items-center space-x-2 shadow-md animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

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
              <button
                onClick={handleOpenNewDog}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>CADASTRAR CÃO K9</span>
              </button>
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
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-200 truncate">{handlerName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{handlerDoc} {dog.tipoVinculo === 'EXTERNO' ? `• ${dog.responsavelExternoOrgao || 'Externo'}` : ''}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleOpenAdminModal(undefined, dog)}
                        className="flex-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center space-x-1.5"
                        title="Administrar medicamento ou alimento a este cão"
                      >
                        <Syringe className="w-3.5 h-3.5" />
                        <span>Administrar</span>
                      </button>

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
                    </div>
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
            <button
              onClick={handleOpenNewCanil}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>NOVO CANIL / BAIA</span>
            </button>
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FARMÁCIA, REMÉDIOS & RAÇÕES */}
      {/* ========================================================================= */}
      {activeTab === 'farmacia' && (
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
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenAdminModal(prod)}
                      className="flex-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center space-x-1"
                    >
                      <Syringe className="w-3.5 h-3.5" />
                      <span>Destinar / Baixa</span>
                    </button>

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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: ADMINISTRAÇÃO & BAIXAS (DESTINAÇÃO AO CÃO) */}
      {/* ========================================================================= */}
      {activeTab === 'administracao' && (
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
                      {c.nome} - {c.raca} (Microchip: {c.microchip || 'N/A'}) - Condutor: {c.tipoVinculo === 'SISTEMA' ? c.usuarioInternoNome : c.responsavelExternoNome}
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
      {activeTab === 'historico' && (
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
                    {canis.map(k => (
                      <option key={k.id} value={k.id}>
                        {k.nome} ({k.identificacao || 'Sem código'}) - Cap: {k.capacidade}
                      </option>
                    ))}
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
                  <div>
                    <label className="block text-slate-400 mb-1">Selecione o Policial Condutor</label>
                    <select
                      value={dogForm.usuarioInternoId}
                      onChange={(e) => setDogForm({ ...dogForm, usuarioInternoId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl p-2.5 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Selecione o policial...</option>
                      {allUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {formatMasp(u.masp)}) - Cargo: {u.cargo}
                        </option>
                      ))}
                    </select>
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
