import React, { useState, useMemo, useEffect } from 'react';
import {
  User,
  Department,
  Unit,
  Explosivo,
  MovimentacaoExplosivo,
  ExplosivoStatus,
  TipoMovimentacaoExplosivo,
  isUserExplosivista
} from '../types';
import { storage } from '../services/storage';
import { formatTimestamp, formatDisplayDate } from '../utils/masks';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import {
  Bomb,
  Plus,
  ArrowRightLeft,
  History,
  Printer,
  Search,
  Filter,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Building,
  Layers,
  Calendar,
  ShieldAlert,
  Flame,
  Clock,
  Eye,
  X,
  UserCheck,
  UserX,
  FileText,
  Boxes
} from 'lucide-react';

interface ModuloExplosivosProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  users?: User[];
  onRefresh: () => void;
}

const TIPOS_EXPLOSIVOS = [
  'Alto Explosivo (Detonante)',
  'Baixo Explosivo (Deflagrante/Pólvora)',
  'Iniciador / Acessório',
  'Granada / Dispositivo Tático',
  'Material Pirotécnico / Sinalização',
  'Outro'
];

const CLASSES_RISCO = [
  '1.1D - Alto Risco de Detonação em Massa',
  '1.2D - Risco de Projeção sem Detonação em Massa',
  '1.3G - Risco de Incêndio / Pequena Explosão',
  '1.4S - Baixo Risco (Segurança Acentuada)',
  '1.5D - Substâncias Pouco Sensíveis',
  'Não Aplicável'
];

const UNIDADES_MEDIDA = ['kg', 'g', 'un', 'm', 'caixas', 'cartuchos', 'litros'];

const STATUS_OPCOES: ExplosivoStatus[] = [
  'Disponível',
  'Em Uso/Operação',
  'Vencido',
  'Quarentena/Perícia',
  'Descartado'
];

export const ModuloExplosivos: React.FC<ModuloExplosivosProps> = ({
  currentUser,
  departments,
  units,
  users = [],
  onRefresh
}) => {
  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isExplosivista = isUserExplosivista(currentUser);

  // Full CRUD permissions for Geral, Armeiro, Admin, and Explosivista
  const canManageExplosives = isGeral || isArmeiro || isAdmin || isExplosivista;

  // Local data from storage
  const [explosivos, setExplosivos] = useState<Explosivo[]>(() => storage.getExplosivos(currentUser));
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoExplosivo[]>(() => storage.getMovimentacoesExplosivos(currentUser));

  // Department / Unit selector
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(availableDepts[0]?.id || '');

  const availableUnits = useMemo(() => {
    if (selectedDeptId === 'ALL') {
      return isGeral ? units : units.filter(u => u.departmentId === currentUser.departmentId);
    }
    return units.filter(u => u.departmentId === selectedDeptId);
  }, [units, selectedDeptId, isGeral, currentUser.departmentId]);

  const canSelectAllUnits = isGeral || isAdmin;
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    return canSelectAllUnits ? 'ALL' : (availableUnits[0]?.id || currentUser.unitId || '');
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('TODOS');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [filterClasseRisco, setFilterClasseRisco] = useState<string>('TODOS');

  // Modals state
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Explosivo | null>(null);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementInitialItem, setMovementInitialItem] = useState<Explosivo | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedItemDetail, setSelectedItemDetail] = useState<Explosivo | null>(null);
  const [deleteTargetItem, setDeleteTargetItem] = useState<Explosivo | null>(null);

  // Notifications
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Item Form states
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState(TIPOS_EXPLOSIVOS[0]);
  const [formSubtipo, setFormSubtipo] = useState('');
  const [formQuantidade, setFormQuantidade] = useState<number>(1);
  const [formUnidadeMedida, setFormUnidadeMedida] = useState('kg');
  const [formLote, setFormLote] = useState('');
  const [formFabricante, setFormFabricante] = useState('');
  const [formDataFabricacao, setFormDataFabricacao] = useState('');
  const [formDataValidade, setFormDataValidade] = useState('');
  const [formClasseRisco, setFormClasseRisco] = useState(CLASSES_RISCO[0]);
  const [formLocalArmazenamento, setFormLocalArmazenamento] = useState('');
  const [formStatus, setFormStatus] = useState<ExplosivoStatus>('Disponível');
  const [formDeptId, setFormDeptId] = useState(currentUser.departmentId || '');
  const [formUnitId, setFormUnitId] = useState(currentUser.unitId || '');
  const [formObservacoes, setFormObservacoes] = useState('');

  // Movement Form states
  const [movTipo, setMovTipo] = useState<TipoMovimentacaoExplosivo>('Saída');
  const [movExplosivoId, setMovExplosivoId] = useState('');
  const [movQuantidade, setMovQuantidade] = useState<number>(1);
  const [movMotivo, setMovMotivo] = useState('Instrução / Treinamento Especializado');
  const [movResponsavelTipo, setMovResponsavelTipo] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [movResponsavelUserId, setMovResponsavelUserId] = useState(currentUser.id || '');
  const [movCustomNome, setMovCustomNome] = useState('');
  const [movCustomMasp, setMovCustomMasp] = useState('');
  const [movOrigemDestino, setMovOrigemDestino] = useState('');
  const [movObservacoes, setMovObservacoes] = useState('');

  // Sync with storage on mount or refresh
  const reloadData = () => {
    setExplosivos(storage.getExplosivos(currentUser));
    setMovimentacoes(storage.getMovimentacoesExplosivos(currentUser));
  };

  useEffect(() => {
    reloadData();
  }, [currentUser]);

  // Filtered Explosives list
  const filteredExplosivos = useMemo(() => {
    return explosivos.filter(item => {
      // Dept filter
      if (selectedDeptId !== 'ALL' && item.departmentId && item.departmentId !== selectedDeptId) {
        return false;
      }
      // Unit filter
      if (selectedUnitId !== 'ALL' && item.unitId && item.unitId !== selectedUnitId) {
        return false;
      }
      // Tipo filter
      if (filterTipo !== 'TODOS' && item.tipo !== filterTipo) {
        return false;
      }
      // Status filter
      if (filterStatus !== 'TODOS' && item.status !== filterStatus) {
        return false;
      }
      // Classe Risco filter
      if (filterClasseRisco !== 'TODOS' && item.classeRisco !== filterClasseRisco) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = item.nome.toLowerCase().includes(query);
        const matchesLote = item.lote.toLowerCase().includes(query);
        const matchesFab = item.fabricante.toLowerCase().includes(query);
        const matchesLoc = item.localArmazenamento.toLowerCase().includes(query);
        const matchesSub = (item.subtipo || '').toLowerCase().includes(query);
        return matchesName || matchesLote || matchesFab || matchesLoc || matchesSub;
      }
      return true;
    });
  }, [explosivos, selectedDeptId, selectedUnitId, filterTipo, filterStatus, filterClasseRisco, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalItens = filteredExplosivos.length;
    const altosExplosivos = filteredExplosivos.filter(e => e.tipo.includes('Alto Explosivo')).length;
    const iniciadores = filteredExplosivos.filter(e => e.tipo.includes('Iniciador') || e.tipo.includes('Granada')).length;
    const disponiveis = filteredExplosivos.filter(e => e.status === 'Disponível').length;
    const vencidos = filteredExplosivos.filter(e => {
      if (!e.dataValidade) return false;
      return new Date(e.dataValidade) < new Date();
    }).length;

    return { totalItens, altosExplosivos, iniciadores, disponiveis, vencidos };
  }, [filteredExplosivos]);

  // Handlers for Item Modal
  const handleOpenItemModal = (item?: Explosivo) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (item) {
      setEditingItem(item);
      setFormNome(item.nome);
      setFormTipo(item.tipo);
      setFormSubtipo(item.subtipo || '');
      setFormQuantidade(item.quantidade);
      setFormUnidadeMedida(item.unidadeMedida);
      setFormLote(item.lote);
      setFormFabricante(item.fabricante);
      setFormDataFabricacao(item.dataFabricacao ? item.dataFabricacao.substring(0, 10) : '');
      setFormDataValidade(item.dataValidade ? item.dataValidade.substring(0, 10) : '');
      setFormClasseRisco(item.classeRisco);
      setFormLocalArmazenamento(item.localArmazenamento);
      setFormStatus(item.status);
      setFormDeptId(item.departmentId);
      setFormUnitId(item.unitId);
      setFormObservacoes(item.observacoes || '');
    } else {
      setEditingItem(null);
      setFormNome('');
      setFormTipo(TIPOS_EXPLOSIVOS[0]);
      setFormSubtipo('');
      setFormQuantidade(1);
      setFormUnidadeMedida('kg');
      setFormLote('');
      setFormFabricante('CBC / IMBEL / Britanite');
      setFormDataFabricacao(new Date().toISOString().substring(0, 10));
      setFormDataValidade('');
      setFormClasseRisco(CLASSES_RISCO[0]);
      setFormLocalArmazenamento('Paiol de Explosivos - Cofre E-1');
      setFormStatus('Disponível');
      setFormDeptId(selectedDeptId !== 'ALL' ? selectedDeptId : currentUser.departmentId);
      setFormUnitId(selectedUnitId !== 'ALL' ? selectedUnitId : currentUser.unitId);
      setFormObservacoes('');
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!formNome.trim()) {
      setErrorMsg('Informe o nome do material explosivo.');
      return;
    }
    if (formQuantidade < 0) {
      setErrorMsg('A quantidade não pode ser negativa.');
      return;
    }

    try {
      const itemToSave: Explosivo = {
        id: editingItem ? editingItem.id : `exp-${Date.now()}`,
        nome: formNome.trim(),
        tipo: formTipo,
        subtipo: formSubtipo.trim(),
        quantidade: Number(formQuantidade),
        unidadeMedida: formUnidadeMedida,
        lote: formLote.trim() || 'S/L',
        fabricante: formFabricante.trim() || 'N/I',
        dataFabricacao: formDataFabricacao || undefined,
        dataValidade: formDataValidade || undefined,
        classeRisco: formClasseRisco,
        localArmazenamento: formLocalArmazenamento.trim() || 'Paiol Principal',
        status: formStatus,
        departmentId: formDeptId || currentUser.departmentId,
        unitId: formUnitId || currentUser.unitId,
        observacoes: formObservacoes.trim(),
        dataCriacao: editingItem ? editingItem.dataCriacao : new Date().toISOString()
      };

      await storage.saveExplosivo(itemToSave);
      setShowItemModal(false);
      setSuccessMsg(
        editingItem
          ? `Explosivo "${itemToSave.nome}" atualizado com sucesso.`
          : `Explosivo "${itemToSave.nome}" cadastrado com sucesso.`
      );
      reloadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar explosivo.');
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTargetItem) return;
    try {
      await storage.deleteExplosivo(deleteTargetItem.id);
      setSuccessMsg(`Explosivo "${deleteTargetItem.nome}" removido do acervo.`);
      setDeleteTargetItem(null);
      reloadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir explosivo.');
    }
  };

  // Handlers for Movement Modal
  const handleOpenMovementModal = (item?: Explosivo, defaultType: TipoMovimentacaoExplosivo = 'Saída') => {
    setErrorMsg('');
    setSuccessMsg('');
    const target = item || filteredExplosivos[0];
    setMovementInitialItem(target || null);
    setMovExplosivoId(target ? target.id : '');
    setMovTipo(defaultType);
    setMovQuantidade(1);
    setMovMotivo(
      defaultType === 'Consumo/Treinamento'
        ? 'Instrução e Treinamento de Destruição / BREACHING'
        : defaultType === 'Entrada'
        ? 'Aquisição / Abastecimento do Paiol'
        : 'Operação Policial Especializada'
    );
    setMovResponsavelTipo('SISTEMA');
    setMovResponsavelUserId(currentUser.id || (users[0]?.id || ''));
    setMovCustomNome('');
    setMovCustomMasp('');
    setMovOrigemDestino(defaultType === 'Entrada' ? 'Fornecedor / Depósito Central' : 'Campo de Instrução / Operação');
    setMovObservacoes('');
    setShowMovementModal(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const targetItem = explosivos.find(e => e.id === movExplosivoId);
    if (!targetItem) {
      setErrorMsg('Selecione o explosivo para a movimentação.');
      return;
    }

    if (movQuantidade <= 0) {
      setErrorMsg('A quantidade da movimentação deve ser maior que zero.');
      return;
    }

    // Validation for outgoing movements
    if ((movTipo === 'Saída' || movTipo === 'Consumo/Treinamento' || movTipo === 'Descarte/Destruição') && movQuantidade > targetItem.quantidade) {
      setErrorMsg(`Saldo insuficiente! Saldo atual no estoque: ${targetItem.quantidade} ${targetItem.unidadeMedida}.`);
      return;
    }

    // Determine responsible officer
    let respNome = currentUser.name;
    let respMasp = currentUser.masp;
    let respId = currentUser.id;

    if (movResponsavelTipo === 'SISTEMA') {
      const u = users.find(usr => usr.id === movResponsavelUserId);
      if (u) {
        respNome = u.name;
        respMasp = u.masp;
        respId = u.id;
      }
    } else {
      if (!movCustomNome.trim() || !movCustomMasp.trim()) {
        setErrorMsg('Informe o nome e o MASP do responsável externo.');
        return;
      }
      respNome = movCustomNome.trim();
      respMasp = movCustomMasp.trim();
      respId = undefined;
    }

    try {
      const movRecord: MovimentacaoExplosivo = {
        id: `mov-exp-${Date.now()}`,
        explosivoId: targetItem.id,
        nomeExplosivo: targetItem.nome,
        tipoMovimentacao: movTipo,
        quantidade: Number(movQuantidade),
        unidadeMedida: targetItem.unidadeMedida,
        motivo: movMotivo.trim(),
        responsavelNome: respNome,
        responsavelMasp: respMasp,
        responsavelId: respId,
        localOrigemDestino: movOrigemDestino.trim(),
        dataMovimentacao: new Date().toISOString(),
        departmentId: targetItem.departmentId,
        unitId: targetItem.unitId,
        observacoes: movObservacoes.trim()
      };

      await storage.saveMovimentacaoExplosivo(movRecord);

      // Adjust item balance
      let newQty = targetItem.quantidade;
      if (movTipo === 'Entrada') {
        newQty += Number(movQuantidade);
      } else if (movTipo === 'Saída' || movTipo === 'Consumo/Treinamento' || movTipo === 'Descarte/Destruição') {
        newQty = Math.max(0, newQty - Number(movQuantidade));
      }

      await storage.saveExplosivo({
        ...targetItem,
        quantidade: newQty,
        status: newQty === 0 ? 'Descartado' : targetItem.status
      });

      setShowMovementModal(false);
      setSuccessMsg(`Movimentação de ${movTipo} registrada com sucesso para "${targetItem.nome}".`);
      reloadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação de explosivo.');
    }
  };

  // Print Inventory Report
  const handlePrintInventory = () => {
    const deptObj = departments.find(d => d.id === selectedDeptId);
    const unitObj = units.find(u => u.id === selectedUnitId);
    const deptTitle = deptObj ? deptObj.name : 'TODOS OS DEPARTAMENTOS';
    const unitTitle = unitObj ? unitObj.name : 'TODAS AS UNIDADES';

    const rows = filteredExplosivos.map(item => `
      <tr style="border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 8px; font-weight: bold;">${item.nome}</td>
        <td style="padding: 8px;">${item.tipo}</td>
        <td style="padding: 8px; text-align: center; font-weight: bold; font-family: monospace;">${item.quantidade} ${item.unidadeMedida}</td>
        <td style="padding: 8px; font-family: monospace;">${item.lote}</td>
        <td style="padding: 8px;">${item.fabricante}</td>
        <td style="padding: 8px; font-size: 11px;">${item.classeRisco}</td>
        <td style="padding: 8px;">${item.localArmazenamento}</td>
        <td style="padding: 8px; font-weight: bold; text-align: center;">${item.status}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; text-transform: uppercase;">POLÍCIA CIVIL DE MINAS GERAIS</h2>
          <h3 style="margin: 5px 0 0; font-size: 16px; color: #475569;">RELATÓRIO DE INVENTÁRIO DO PAIOL DE EXPLOSIVOS</h3>
          <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">
            <strong>Departamento:</strong> ${deptTitle} | <strong>Unidade:</strong> ${unitTitle} | <strong>Emissão:</strong> ${formatTimestamp(new Date().toISOString())}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #94a3b8; text-align: left;">
              <th style="padding: 8px;">Item / Material</th>
              <th style="padding: 8px;">Tipo</th>
              <th style="padding: 8px; text-align: center;">Qtd. Saldo</th>
              <th style="padding: 8px;">Lote</th>
              <th style="padding: 8px;">Fabricante</th>
              <th style="padding: 8px;">Classe de Risco</th>
              <th style="padding: 8px;">Localização</th>
              <th style="padding: 8px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum item explosivo registrado.</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 50px; display: flex; justify-content: space-around; text-align: center;">
          <div style="border-top: 1px solid #0f172a; width: 280px; padding-top: 5px; font-size: 12px;">
            <strong>${currentUser.name}</strong><br />
            MASP: ${currentUser.masp}<br />
            Responsável pelo Paiol / Explosivista
          </div>
          <div style="border-top: 1px solid #0f172a; width: 280px; padding-top: 5px; font-size: 12px;">
            <strong>Visto da Autoridade Policial</strong><br />
            Titular da Unidade Policial
          </div>
        </div>
      </div>
    `;

    printDocumentInPage(html);
  };

  // Print Movement History Report
  const handlePrintHistory = () => {
    const rows = movimentacoes.map(m => `
      <tr style="border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 8px; font-family: monospace;">${formatTimestamp(m.dataMovimentacao)}</td>
        <td style="padding: 8px; font-weight: bold;">${m.tipoMovimentacao}</td>
        <td style="padding: 8px;">${m.nomeExplosivo}</td>
        <td style="padding: 8px; text-align: center; font-weight: bold; font-family: monospace;">${m.quantidade} ${m.unidadeMedida}</td>
        <td style="padding: 8px;">${m.motivo}</td>
        <td style="padding: 8px;">${m.responsavelNome} (MASP: ${m.responsavelMasp})</td>
        <td style="padding: 8px;">${m.localOrigemDestino || '-'}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; text-transform: uppercase;">POLÍCIA CIVIL DE MINAS GERAIS</h2>
          <h3 style="margin: 5px 0 0; font-size: 16px; color: #475569;">LIVRO DE MOVIMENTAÇÕES DE EXPLOSIVOS E DETONANTES</h3>
          <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">
            <strong>Data do Relatório:</strong> ${formatTimestamp(new Date().toISOString())}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #94a3b8; text-align: left;">
              <th style="padding: 8px;">Data / Hora</th>
              <th style="padding: 8px;">Operação</th>
              <th style="padding: 8px;">Explosivo</th>
              <th style="padding: 8px; text-align: center;">Qtd</th>
              <th style="padding: 8px;">Finalidade / Motivo</th>
              <th style="padding: 8px;">Responsável</th>
              <th style="padding: 8px;">Destino / Local</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma movimentação registrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    printDocumentInPage(html);
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Global Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              <Bomb className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-wide flex items-center gap-2">
                PAIOL DE EXPLOSIVOS & DETONANTES
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-mono font-normal">
                  Controle Especial
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Gestão rigorosa de altos e baixos explosivos, iniciadores, dispositivos táticos e rastreabilidade de consumo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageExplosives && (
            <>
              <button
                onClick={() => handleOpenItemModal()}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-amber-500/10 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Explosivo</span>
              </button>

              <button
                onClick={() => handleOpenMovementModal(undefined, 'Saída')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 flex items-center space-x-1.5 transition"
              >
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                <span>Movimentar</span>
              </button>
            </>
          )}

          <button
            onClick={() => setShowHistoryModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <History className="w-4 h-4 text-cyan-400" />
            <span>Histórico de Movimentações</span>
          </button>

          <button
            onClick={handlePrintInventory}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Imprimir Inventário</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium mb-1">
            <Boxes className="w-4 h-4 text-amber-400" />
            <span>Itens Cadastrados</span>
          </div>
          <p className="text-2xl font-black text-slate-100 font-mono">{stats.totalItens}</p>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium mb-1">
            <Flame className="w-4 h-4 text-red-400" />
            <span>Altos Explosivos</span>
          </div>
          <p className="text-2xl font-black text-red-400 font-mono">{stats.altosExplosivos}</p>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium mb-1">
            <ShieldAlert className="w-4 h-4 text-purple-400" />
            <span>Iniciadores / Táticos</span>
          </div>
          <p className="text-2xl font-black text-purple-400 font-mono">{stats.iniciadores}</p>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Disponíveis</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">{stats.disponiveis}</p>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium mb-1">
            <Clock className="w-4 h-4 text-rose-400" />
            <span>Itens Vencidos</span>
          </div>
          <p className="text-2xl font-black text-rose-400 font-mono">{stats.vencidos}</p>
        </div>
      </div>

      {/* Scope Navigation: Department & Unit */}
      <div className="glass-card p-3.5 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
            <Building className="w-4 h-4 text-amber-400" />
            <span>Departamento:</span>
          </div>
          <select
            value={selectedDeptId}
            onChange={(e) => {
              setSelectedDeptId(e.target.value);
              setSelectedUnitId(canSelectAllUnits ? 'ALL' : '');
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:border-amber-400 outline-none"
          >
            {isGeral && <option value="ALL">TODOS OS DEPARTAMENTOS</option>}
            {availableDepts.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
            ))}
          </select>

          <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium ml-0 md:ml-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Unidade:</span>
          </div>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:border-cyan-400 outline-none"
          >
            {canSelectAllUnits && <option value="ALL">TODAS AS UNIDADES</option>}
            {availableUnits.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Exibindo: <strong className="text-amber-400">{filteredExplosivos.length}</strong> de {explosivos.length} materiais
        </div>
      </div>

      {/* Filters & Search */}
      <div className="glass-card p-3.5 rounded-2xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, lote, fabricante, local..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 outline-none"
          />
        </div>

        <div>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="w-full py-2 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:border-amber-400 outline-none"
          >
            <option value="TODOS">Todos os Tipos</option>
            {TIPOS_EXPLOSIVOS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={filterClasseRisco}
            onChange={(e) => setFilterClasseRisco(e.target.value)}
            className="w-full py-2 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:border-amber-400 outline-none"
          >
            <option value="TODOS">Todas as Classes de Risco</option>
            {CLASSES_RISCO.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full py-2 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:border-amber-400 outline-none"
          >
            <option value="TODOS">Todos os Status</option>
            {STATUS_OPCOES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Explosives Grid */}
      {filteredExplosivos.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-slate-800">
          <Bomb className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-300">Nenhum explosivo encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Não há registros correspondentes aos filtros selecionados. Utilize o botão "Novo Explosivo" acima para registrar um material.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExplosivos.map(item => {
            const isExpired = item.dataValidade && new Date(item.dataValidade) < new Date();
            const isHighExplosive = item.tipo.includes('Alto Explosivo');

            return (
              <div
                key={item.id}
                className="glass-card hover:border-slate-700 rounded-2xl p-4 border border-slate-800 transition-all flex flex-col justify-between space-y-3 relative overflow-hidden"
              >
                {/* Top strip highlight for risk */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isHighExplosive ? 'bg-gradient-to-r from-red-500 to-amber-500' : 'bg-gradient-to-r from-purple-500 to-cyan-500'
                  }`}
                />

                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                        {item.tipo}
                      </span>
                      <h3 className="text-base font-black text-slate-100 leading-snug">
                        {item.nome}
                      </h3>
                      {item.subtipo && (
                        <p className="text-xs text-slate-400 font-medium">{item.subtipo}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase border ${
                          item.status === 'Disponível'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : item.status === 'Vencido'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : item.status === 'Quarentena/Perícia'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600'
                        }`}
                      >
                        {item.status}
                      </span>

                      {isExpired && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-700/50 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Vencido
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock Quantity Highlight */}
                  <div className="mt-3 p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Estoque Atual:</span>
                    <span className="text-lg font-black text-amber-400 font-mono">
                      {item.quantidade} <span className="text-xs font-normal text-slate-400">{item.unidadeMedida}</span>
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="block text-slate-500 text-[10px] uppercase font-semibold">Lote:</span>
                      <span className="font-mono text-slate-200 font-semibold">{item.lote}</span>
                    </div>

                    <div>
                      <span className="block text-slate-500 text-[10px] uppercase font-semibold">Fabricante:</span>
                      <span className="text-slate-200 truncate block">{item.fabricante}</span>
                    </div>

                    <div>
                      <span className="block text-slate-500 text-[10px] uppercase font-semibold">Classe de Risco:</span>
                      <span className="text-slate-300 font-mono truncate block" title={item.classeRisco}>
                        {item.classeRisco.split(' - ')[0]}
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-500 text-[10px] uppercase font-semibold">Validade:</span>
                      <span className={`font-mono ${isExpired ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                        {item.dataValidade ? formatDisplayDate(item.dataValidade) : 'Indeterminada'}
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-slate-800/60">
                      <span className="block text-slate-500 text-[10px] uppercase font-semibold">Local no Paiol:</span>
                      <span className="text-cyan-300 font-medium">{item.localArmazenamento}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setSelectedItemDetail(item)}
                      title="Ver Detalhes"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {canManageExplosives && (
                      <button
                        onClick={() => handleOpenItemModal(item)}
                        title="Editar Informações"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {canManageExplosives && (
                      <button
                        onClick={() => setDeleteTargetItem(item)}
                        title="Excluir do Sistema"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {canManageExplosives && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenMovementModal(item, 'Entrada')}
                        className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 transition flex items-center space-x-1"
                        title="Registrar Entrada / Suprimento"
                      >
                        <span>+ Entrar</span>
                      </button>

                      <button
                        onClick={() => handleOpenMovementModal(item, 'Saída')}
                        className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-bold border border-amber-500/30 transition flex items-center space-x-1"
                        title="Registrar Saída ou Consumo"
                      >
                        <span>- Sair</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Cadastrar / Editar Explosivo */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="glass-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Bomb className="w-5 h-5" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  {editingItem ? 'Alterar Informações do Explosivo' : 'Cadastrar Novo Material Explosivo'}
                </h2>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome Comercial / Denominação Oficial *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder="Ex: Emulsão Britex 1 1/4x8, C-4 Demolição, Granada GL-304"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Explosivo *
                  </label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    {TIPOS_EXPLOSIVOS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Subtipo / Especificação Técnica
                  </label>
                  <input
                    type="text"
                    value={formSubtipo}
                    onChange={(e) => setFormSubtipo(e.target.value)}
                    placeholder="Ex: RDX/Plastificante, NP-10, Eletro-Eletrônica"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Quantidade em Estoque *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    value={formQuantidade}
                    onChange={(e) => setFormQuantidade(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unidade de Medida *
                  </label>
                  <select
                    value={formUnidadeMedida}
                    onChange={(e) => setFormUnidadeMedida(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    {UNIDADES_MEDIDA.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número do Lote
                  </label>
                  <input
                    type="text"
                    value={formLote}
                    onChange={(e) => setFormLote(e.target.value)}
                    placeholder="Ex: EXP-2024/09, L-9843"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    value={formFabricante}
                    onChange={(e) => setFormFabricante(e.target.value)}
                    placeholder="Ex: Britanite, IMBEL, CBC, Condor"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data de Fabricação
                  </label>
                  <input
                    type="date"
                    value={formDataFabricacao}
                    onChange={(e) => setFormDataFabricacao(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={formDataValidade}
                    onChange={(e) => setFormDataValidade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Classe de Risco (ONU / Transporte)
                  </label>
                  <select
                    value={formClasseRisco}
                    onChange={(e) => setFormClasseRisco(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    {CLASSES_RISCO.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Local de Armazenamento (Paiol / Cofre / Gaveta) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formLocalArmazenamento}
                    onChange={(e) => setFormLocalArmazenamento(e.target.value)}
                    placeholder="Ex: Paiol de Alto Poder - Cofre A1"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Status Operacional
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ExplosivoStatus)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    {STATUS_OPCOES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Informações Adicionais / Observações Técnicas
                  </label>
                  <textarea
                    rows={3}
                    value={formObservacoes}
                    onChange={(e) => setFormObservacoes(e.target.value)}
                    placeholder="Descreva particularidades, laudos de peritagem, compatibilidade química..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                >
                  <span>{editingItem ? 'Salvar Alterações' : 'Cadastrar Explosivo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Movimentar Explosivo */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="glass-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Registrar Movimentação de Explosivo
                </h2>
              </div>
              <button
                onClick={() => setShowMovementModal(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Material Explosivo *
                </label>
                <select
                  required
                  value={movExplosivoId}
                  onChange={(e) => setMovExplosivoId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                >
                  {explosivos.map(exp => (
                    <option key={exp.id} value={exp.id}>
                      {exp.nome} (Lote: {exp.lote} | Saldo: {exp.quantidade} {exp.unidadeMedida})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Movimentação *
                  </label>
                  <select
                    value={movTipo}
                    onChange={(e) => setMovTipo(e.target.value as TipoMovimentacaoExplosivo)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    <option value="Saída">Saída Operacional</option>
                    <option value="Entrada">Entrada / Abastecimento</option>
                    <option value="Consumo/Treinamento">Consumo em Treinamento / Instrução</option>
                    <option value="Descarte/Destruição">Descarte Controlado / Destruição</option>
                    <option value="Transferência">Transferência entre Unidades</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Quantidade Movimentada *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.001"
                    value={movQuantidade}
                    onChange={(e) => setMovQuantidade(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Finalidade / Motivo da Movimentação *
                </label>
                <input
                  type="text"
                  required
                  value={movMotivo}
                  onChange={(e) => setMovMotivo(e.target.value)}
                  placeholder="Ex: Operação Tática BREACHING, Treinamento de Desativação"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                />
              </div>

              {/* Responsible Officer */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Policial Responsável:</span>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMovResponsavelTipo('SISTEMA')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                        movResponsavelTipo === 'SISTEMA'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Usuário do Sistema
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovResponsavelTipo('FORA_DO_SISTEMA')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                        movResponsavelTipo === 'FORA_DO_SISTEMA'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Policial Externo
                    </button>
                  </div>
                </div>

                {movResponsavelTipo === 'SISTEMA' ? (
                  <select
                    value={movResponsavelUserId}
                    onChange={(e) => setMovResponsavelUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp}) - {u.cargo || u.role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="Nome completo do policial"
                        value={movCustomNome}
                        onChange={(e) => setMovCustomNome(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="MASP do policial"
                        value={movCustomMasp}
                        onChange={(e) => setMovCustomMasp(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-400 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Origem / Destino / Local da Ação
                </label>
                <input
                  type="text"
                  value={movOrigemDestino}
                  onChange={(e) => setMovOrigemDestino(e.target.value)}
                  placeholder="Ex: Estande de Demolição Santa Luzia, Mandado Judicial"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações da Movimentação
                </label>
                <textarea
                  rows={2}
                  value={movObservacoes}
                  onChange={(e) => setMovObservacoes(e.target.value)}
                  placeholder="Observações complementares..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:border-amber-400 outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                >
                  <span>Confirmar Movimentação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Histórico de Movimentações */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="glass-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">
                    Histórico Geral de Movimentações de Explosivos
                  </h2>
                  <p className="text-xs text-slate-400">
                    Registro de todas as entradas, saídas, consumos e descartes auditáveis
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrintHistory}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Imprimir Relatório</span>
                </button>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              {movimentacoes.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Nenhuma movimentação de explosivos registrada até o momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {movimentacoes.map(m => (
                    <div
                      key={m.id}
                      className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono uppercase border ${
                              m.tipoMovimentacao === 'Entrada'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : m.tipoMovimentacao === 'Consumo/Treinamento'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}
                          >
                            {m.tipoMovimentacao}
                          </span>
                          <span className="text-xs font-bold text-slate-200">
                            {m.nomeExplosivo}
                          </span>
                          <span className="text-xs font-black text-amber-400 font-mono">
                            {m.quantidade} {m.unidadeMedida}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          <strong>Motivo:</strong> {m.motivo}
                          {m.localOrigemDestino && ` | Local: ${m.localOrigemDestino}`}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Responsável: <strong className="text-slate-300">{m.responsavelNome}</strong> (MASP: {m.responsavelMasp})
                        </p>
                      </div>

                      <div className="text-right text-[10px] text-slate-500 font-mono">
                        {formatTimestamp(m.dataMovimentacao)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Explosivo */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="glass-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <Bomb className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-slate-100">
                  Ficha Técnica do Material Explosivo
                </h2>
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Nome / Denominação:</span>
                <p className="text-sm font-bold text-slate-100">{selectedItemDetail.nome}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Tipo:</span>
                  <p className="text-slate-300">{selectedItemDetail.tipo}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Subtipo:</span>
                  <p className="text-slate-300">{selectedItemDetail.subtipo || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Quantidade em Estoque:</span>
                  <p className="text-sm font-black text-amber-400 font-mono">
                    {selectedItemDetail.quantidade} {selectedItemDetail.unidadeMedida}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Status:</span>
                  <p className="text-slate-300 font-semibold">{selectedItemDetail.status}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Lote:</span>
                  <p className="text-slate-200 font-mono">{selectedItemDetail.lote}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Fabricante:</span>
                  <p className="text-slate-200">{selectedItemDetail.fabricante}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Data Fabricação:</span>
                  <p className="text-slate-300">{selectedItemDetail.dataFabricacao ? formatDisplayDate(selectedItemDetail.dataFabricacao) : '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Data Validade:</span>
                  <p className="text-slate-300">{selectedItemDetail.dataValidade ? formatDisplayDate(selectedItemDetail.dataValidade) : 'Indeterminada'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Classe de Risco:</span>
                  <p className="text-slate-200">{selectedItemDetail.classeRisco}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Local no Paiol:</span>
                  <p className="text-cyan-300 font-semibold">{selectedItemDetail.localArmazenamento}</p>
                </div>
                {selectedItemDetail.observacoes && (
                  <div className="col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Observações:</span>
                    <p className="text-slate-300 whitespace-pre-wrap">{selectedItemDetail.observacoes}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setSelectedItemDetail(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Delete Modal */}
      {deleteTargetItem && (
        <ConfirmDeleteModal
          isOpen={Boolean(deleteTargetItem)}
          title="Excluir Material Explosivo"
          description={`Deseja realmente remover o explosivo "${deleteTargetItem.nome}" (Lote: ${deleteTargetItem.lote}) permanentemente do acervo?`}
          onConfirm={handleDeleteItem}
          onClose={() => setDeleteTargetItem(null)}
        />
      )}
    </div>
  );
};
