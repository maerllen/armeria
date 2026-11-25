import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  Unit,
  CategoriaDesempenho,
  TipoMarcaFisica,
  DificuldadeDesempenho,
  TipoArmaDesempenho,
  ModoLancamentoDesempenho,
  DesempenhoMarcador,
  DesempenhoAtividade,
  DesempenhoGrupo,
  DesempenhoResultado
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { TopLayerAlert } from './TopLayerAlert';
import {
  UsuarioDesempenhoDashboard,
  formatDateBr,
  formatSecondsCompact,
  formatNumberBr,
  formatResultadoResumo
} from './UsuarioDesempenhoDashboard';
import {
  Users,
  Dumbbell,
  Crosshair,
  Plus,
  Search,
  Edit,
  Trash2,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Archive,
  ClipboardList,
  Calendar,
  Clock,
  BarChart3,
  Building2,
  UserCheck,
  Target,
  Sliders,
  Lock,
  CheckSquare,
  Square,
  ChevronRight,
  RefreshCw,
  Award
} from 'lucide-react';

interface RelatorioDesempenhoUnidadePanelProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  activeUnitId?: string;
  activeDeptId?: string;
}

type PanelSubTab = 'USUARIOS' | 'ATIVIDADES_GRUPOS' | 'MARCADORES';

const DIFICULDADES: DificuldadeDesempenho[] = ['Fácil', 'Médio', 'Difícil', 'Muito Difícil'];
const TIPOS_MARCA: TipoMarcaFisica[] = ['Execução', 'Repetição', 'Distância'];
const TIPOS_ARMA: TipoArmaDesempenho[] = ['Fuzil', 'Pistola', 'Espingarda', 'Submetralhadora'];

function getTodayIsoBr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function maskTimeMMSS(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const capped = digits.slice(0, 4);
  const padded = capped.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

function parseTimeInputToSeconds(raw: string): number | null {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  if (clean.includes(':')) {
    const parts = clean.split(':').map(p => Number(p.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
    }
    return null;
  }
  const n = Number(clean.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function secondsToInputString(sec?: number | null): string {
  if (sec === undefined || sec === null || !Number.isFinite(sec)) return '';
  return formatSecondsCompact(sec);
}

interface DraftResultCell {
  valorMarca: string;
  tempoInput: string;
  notaObtida: string;
  tirosEfetuados: string;
  observacoes: string;
}

interface ParticipantAbsenceDraft {
  ausente: boolean;
  ausenciaInformada: '' | 'SIM' | 'NAO';
}

export const RelatorioDesempenhoUnidadePanel: React.FC<RelatorioDesempenhoUnidadePanelProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  activeUnitId,
  activeDeptId
}) => {
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const assignedRoles = useMemo(
    () => [effectiveRole, currentUser.role, ...(currentUser.roles || [])].map(r => String(r || '').toLowerCase()),
    [effectiveRole, currentUser.role, currentUser.roles]
  );
  const isGeral = effectiveRole === 'Geral' || assignedRoles.includes('geral');
  const isAdmin = effectiveRole === 'Administrador' || assignedRoles.includes('administrador');
  const isArmeiro = effectiveRole === 'Armeiro' || assignedRoles.includes('armeiro');
  const canManageMarkers = isGeral || isAdmin;
  const isDeptScoped =
    isGeral ||
    isAdmin ||
    (isArmeiro && (currentUser.managementScope === 'department' || !currentUser.unitId));

  // Unidades acessíveis ao criador (para filtro e formação de grupos inter-unidades)
  const accessibleUnits = useMemo(() => {
    if (isGeral) return [...units].sort((a, b) => a.name.localeCompare(b.name));
    const deptId = activeDeptId || currentUser.departmentId;
    if (isDeptScoped && deptId) {
      return units
        .filter(u => u.departmentId === deptId || u.id === currentUser.unitId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (currentUser.unitId) {
      return units.filter(u => u.id === currentUser.unitId);
    }
    return [];
  }, [isGeral, isDeptScoped, units, activeDeptId, currentUser.departmentId, currentUser.unitId]);

  const accessibleUnitIdsSet = useMemo(() => new Set(accessibleUnits.map(u => u.id)), [accessibleUnits]);

  const accessibleUsers = useMemo(() => {
    const filtered = allUsers.filter(u => {
      if (isGeral) return true;
      if (u.unitId && accessibleUnitIdsSet.has(u.unitId)) return true;
      if (isDeptScoped && currentUser.departmentId && u.departmentId === currentUser.departmentId) return true;
      return u.id === currentUser.id;
    });
    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allUsers, isGeral, accessibleUnitIdsSet, isDeptScoped, currentUser.departmentId, currentUser.id]);

  // Estado principal carregado do servidor
  const [subTab, setSubTab] = useState<PanelSubTab>('USUARIOS');
  const [loading, setLoading] = useState(true);
  const [marcadores, setMarcadores] = useState<DesempenhoMarcador[]>([]);
  const [atividades, setAtividades] = useState<DesempenhoAtividade[]>([]);
  const [grupos, setGrupos] = useState<DesempenhoGrupo[]>([]);
  const [allResultados, setAllResultados] = useState<DesempenhoResultado[]>([]);
  const [alertState, setAlertState] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Usuários & Gráficos
  const [userSearch, setUserSearch] = useState('');
  const [userUnitFilter, setUserUnitFilter] = useState<string>(
    activeUnitId && accessibleUnitIdsSet.has(activeUnitId) ? activeUnitId : 'TODAS'
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);

  // Atividades & Grupos
  const [groupStatusTab, setGroupStatusTab] = useState<'ABERTO' | 'ENCERRADO'>('ABERTO');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [draftCells, setDraftCells] = useState<Record<string, DraftResultCell>>({});
  const [participantAbsence, setParticipantAbsence] = useState<Record<string, ParticipantAbsenceDraft>>({});
  const [savingResults, setSavingResults] = useState(false);
  const [confirmCloseGroupId, setConfirmCloseGroupId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<string | null>(null);

  // Marcadores tab
  const [markerCatFilter, setMarkerCatFilter] = useState<'TODOS' | CategoriaDesempenho>('TODOS');
  const [markerSearch, setMarkerSearch] = useState('');
  const [confirmDeleteMarkerId, setConfirmDeleteMarkerId] = useState<string | null>(null);

  // Modal Marcador (Físico ou Tático)
  const [markerModalOpen, setMarkerModalOpen] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [mCategoria, setMCategoria] = useState<CategoriaDesempenho>('FISICO');
  const [mNome, setMNome] = useState('');
  const [mTipoMarca, setMTipoMarca] = useState<TipoMarcaFisica>('Repetição');
  const [mUnidadeMedida, setMUnidadeMedida] = useState('repetições');
  const [mUsaTempo, setMUsaTempo] = useState(true);
  const [mTempoMin, setMTempoMin] = useState('');
  const [mTempoMax, setMTempoMax] = useState('');
  const [mTempoAprov, setMTempoAprov] = useState('');
  const [mNotaMin, setMNotaMin] = useState('0');
  const [mNotaMax, setMNotaMax] = useState('10');
  const [mNotaAprov, setMNotaAprov] = useState('6');
  const [mDificuldade, setMDificuldade] = useState<DificuldadeDesempenho>('Médio');
  const [mTeveTiro, setMTeveTiro] = useState(false);
  const [mTipoArma, setMTipoArma] = useState<TipoArmaDesempenho>('Pistola');
  const [mQtdTiros, setMQtdTiros] = useState('10');
  const [mDescricao, setMDescricao] = useState('');
  const [savingMarker, setSavingMarker] = useState(false);

  // Modal Atividade
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [aCategoria, setACategoria] = useState<CategoriaDesempenho>('FISICO');
  const [aNome, setANome] = useState('');
  const [aData, setAData] = useState(getTodayIsoBr());
  const [aHora, setAHora] = useState('08:00');
  const [aDescricao, setADescricao] = useState('');
  const [aMarcadoresIds, setAMarcadoresIds] = useState<string[]>([]);
  const [savingActivity, setSavingActivity] = useState(false);

  // Modal Novo Grupo
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [gAtividadeId, setGAtividadeId] = useState('');
  const [gNomeGrupo, setGNomeGrupo] = useState('');
  const [gModo, setGModo] = useState<ModoLancamentoDesempenho>('COLETIVO');
  const [gData, setGData] = useState(getTodayIsoBr());
  const [gHora, setGHora] = useState('08:00');
  const [gParticipantesIds, setGParticipantesIds] = useState<string[]>([]);
  const [gUserSearch, setGUserSearch] = useState('');
  const [gUserUnitFilter, setGUserUnitFilter] = useState('TODAS');
  const [savingGroup, setSavingGroup] = useState(false);

  const notify = (type: 'success' | 'error', message: string) => {
    setAlertState({ type, message });
  };

  const loadAll = async () => {
    setLoading(true);
    const [mRes, aRes, gRes, rRes] = await Promise.all([
      storage.getDesempenhoMarcadores(),
      storage.getDesempenhoAtividades(),
      storage.getDesempenhoGrupos(),
      storage.getDesempenhoResultados()
    ]);
    if (mRes.success) setMarcadores(mRes.marcadores);
    if (aRes.success) setAtividades(aRes.atividades);
    if (gRes.success) setGrupos(gRes.grupos);
    if (rRes.success) setAllResultados(rRes.resultados);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [currentUser.id]);

  // Users filtered in "Usuários & Gráficos"
  const displayedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return accessibleUsers.filter(u => {
      if (userUnitFilter !== 'TODAS' && u.unitId !== userUnitFilter) return false;
      if (q) {
        const nameMatch = (u.name || '').toLowerCase().includes(q);
        const maspMatch = (u.masp || '').toLowerCase().includes(q);
        const cargoMatch = (u.cargo || '').toLowerCase().includes(q);
        if (!nameMatch && !maspMatch && !cargoMatch) return false;
      }
      return true;
    });
  }, [accessibleUsers, userUnitFilter, userSearch]);

  useEffect(() => {
    if (displayedUsers.length > 0 && !displayedUsers.some(u => u.id === selectedUserId)) {
      setSelectedUserId(displayedUsers[0].id);
    }
  }, [displayedUsers, selectedUserId]);

  const selectedUserObj = useMemo(
    () => accessibleUsers.find(u => u.id === selectedUserId) || displayedUsers[0] || currentUser,
    [accessibleUsers, displayedUsers, selectedUserId, currentUser]
  );

  const statsByUserId = useMemo(() => {
    const map = new Map<string, { count: number; avgPct: number; approvedPct: number }>();
    const grouped = new Map<string, DesempenhoResultado[]>();
    for (const r of allResultados) {
      const list = grouped.get(r.usuarioId) || [];
      list.push(r);
      grouped.set(r.usuarioId, list);
    }
    for (const [uid, items] of grouped.entries()) {
      const presentes = items.filter(r => !r.ausente);
      const avgPct =
        presentes.length > 0
          ? Math.round(
              presentes.reduce(
                (s, r) => s + (r.notaMaxRef > 0 ? Math.min(100, (r.notaObtida / r.notaMaxRef) * 100) : 0),
                0
              ) / presentes.length
            )
          : 0;
      const approvedPct =
        presentes.length > 0 ? Math.round((presentes.filter(r => r.aprovado).length / presentes.length) * 100) : 0;
      map.set(uid, { count: items.length, avgPct, approvedPct });
    }
    return map;
  }, [allResultados]);

  // Active Group for result entry / view
  const activeGroup = useMemo(
    () => grupos.find(g => g.id === activeGroupId) || null,
    [grupos, activeGroupId]
  );

  // Hydrate draft cells & participant absence state when activeGroup changes
  useEffect(() => {
    if (!activeGroup) return;
    const nextDraft: Record<string, DraftResultCell> = {};
    const nextAbs: Record<string, ParticipantAbsenceDraft> = {};
    for (const p of activeGroup.participantes) {
      const userSavedList = activeGroup.resultados.filter(r => r.usuarioId === p.usuarioId);
      const savedAbsent = userSavedList.find(r => r.ausente);
      nextAbs[p.usuarioId] = {
        ausente: Boolean(savedAbsent),
        ausenciaInformada:
          savedAbsent?.ausenciaInformada === true
            ? 'SIM'
            : savedAbsent?.ausenciaInformada === false
            ? 'NAO'
            : ''
      };
      for (const m of activeGroup.marcadores) {
        const key = `${p.usuarioId}__${m.id}`;
        const existing = userSavedList.find(r => r.marcadorId === m.id);
        nextDraft[key] = {
          valorMarca:
            existing?.valorMarca !== undefined && existing?.valorMarca !== null ? String(existing.valorMarca) : '',
          tempoInput:
            existing?.tempoSegundos !== undefined && existing?.tempoSegundos !== null
              ? secondsToInputString(existing.tempoSegundos)
              : '',
          notaObtida:
            existing && !existing.ausente && existing.notaObtida !== undefined && existing.notaObtida !== null
              ? String(existing.notaObtida)
              : '',
          tirosEfetuados:
            existing?.tirosEfetuados !== undefined && existing?.tirosEfetuados !== null
              ? String(existing.tirosEfetuados)
              : m.teveTiro && m.quantidadeTiros
              ? String(m.quantidadeTiros)
              : '',
          observacoes: existing?.observacoes || ''
        };
      }
    }
    setDraftCells(nextDraft);
    setParticipantAbsence(nextAbs);
  }, [activeGroup]);

  // Open Marker Modal
  const openCreateMarkerModal = (categoria: CategoriaDesempenho) => {
    setEditingMarkerId(null);
    setMCategoria(categoria);
    setMNome('');
    setMTipoMarca('Repetição');
    setMUnidadeMedida(categoria === 'FISICO' ? 'repetições' : 'pontos');
    setMUsaTempo(true);
    setMTempoMin('');
    setMTempoMax('');
    setMTempoAprov('');
    setMNotaMin('0');
    setMNotaMax('10');
    setMNotaAprov('6');
    setMDificuldade('Médio');
    setMTeveTiro(false);
    setMTipoArma('Pistola');
    setMQtdTiros('10');
    setMDescricao('');
    setMarkerModalOpen(true);
  };

  const openEditMarkerModal = (m: DesempenhoMarcador) => {
    setEditingMarkerId(m.id);
    setMCategoria(m.categoria);
    setMNome(m.nome);
    setMTipoMarca((m.tipoMarca as TipoMarcaFisica) || 'Repetição');
    setMUnidadeMedida(m.unidadeMedida || (m.categoria === 'FISICO' ? 'repetições' : 'pontos'));
    setMUsaTempo(m.usaTempo);
    setMTempoMin(secondsToInputString(m.tempoMinSegundos));
    setMTempoMax(secondsToInputString(m.tempoMaxSegundos));
    setMTempoAprov(secondsToInputString(m.tempoAprovacaoSegundos));
    setMNotaMin(String(m.notaMinima));
    setMNotaMax(String(m.notaMaxima));
    setMNotaAprov(String(m.notaAprovacao));
    setMDificuldade((m.dificuldade as DificuldadeDesempenho) || 'Médio');
    setMTeveTiro(m.teveTiro);
    setMTipoArma((m.tipoArma as TipoArmaDesempenho) || 'Pistola');
    setMQtdTiros(m.quantidadeTiros != null ? String(m.quantidadeTiros) : '10');
    setMDescricao(m.descricao || '');
    setMarkerModalOpen(true);
  };

  const markerDescLineCount = mDescricao ? mDescricao.split(/\r?\n/).length : 0;

  const handleSaveMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mNome.trim()) {
      notify('error', 'Informe o nome do marcador.');
      return;
    }
    if (markerDescLineCount > 200) {
      notify('error', 'A descrição não pode ultrapassar 200 linhas.');
      return;
    }
    const payload: Partial<DesempenhoMarcador> = {
      categoria: mCategoria,
      nome: mNome.trim(),
      tipoMarca: mCategoria === 'FISICO' ? mTipoMarca : null,
      unidadeMedida: mUnidadeMedida.trim() || null,
      usaTempo: mUsaTempo,
      tempoMinSegundos: mUsaTempo ? parseTimeInputToSeconds(mTempoMin) : null,
      tempoMaxSegundos: mUsaTempo ? parseTimeInputToSeconds(mTempoMax) : null,
      tempoAprovacaoSegundos: mUsaTempo ? parseTimeInputToSeconds(mTempoAprov) : null,
      notaMinima: Number(mNotaMin.replace(',', '.')),
      notaMaxima: Number(mNotaMax.replace(',', '.')),
      notaAprovacao: Number(mNotaAprov.replace(',', '.')),
      dificuldade: mDificuldade,
      teveTiro: mCategoria === 'TATICO' ? mTeveTiro : false,
      tipoArma: mCategoria === 'TATICO' && mTeveTiro ? mTipoArma : null,
      quantidadeTiros: mCategoria === 'TATICO' && mTeveTiro ? Number(mQtdTiros) : null,
      descricao: mDescricao.trim() || null
    };

    setSavingMarker(true);
    const res = editingMarkerId
      ? await storage.updateDesempenhoMarcador(editingMarkerId, payload)
      : await storage.createDesempenhoMarcador(payload);
    setSavingMarker(false);

    if (!res.success) {
      notify('error', res.error || 'Erro ao salvar marcador.');
      return;
    }
    setMarkerModalOpen(false);
    notify(
      'success',
      `Marcador ${mCategoria === 'FISICO' ? 'Físico' : 'Tático'} "${mNome.trim()}" ${editingMarkerId ? 'atualizado' : 'cadastrado'} com sucesso!`
    );
    await loadAll();
  };

  const handleDeleteMarker = async (id: string) => {
    const res = await storage.deleteDesempenhoMarcador(id);
    setConfirmDeleteMarkerId(null);
    if (!res.success) {
      notify('error', res.error || 'Erro ao excluir marcador.');
      return;
    }
    notify(
      'success',
      res.archived
        ? 'Marcador inativado (histórico preservado nos gráficos existentes).'
        : 'Marcador excluído com sucesso.'
    );
    await loadAll();
  };

  // Activity Modal
  const openCreateActivityModal = (defaultCat?: CategoriaDesempenho) => {
    setACategoria(defaultCat || 'FISICO');
    setANome('');
    setAData(getTodayIsoBr());
    setAHora('08:00');
    setADescricao('');
    setAMarcadoresIds([]);
    setActivityModalOpen(true);
  };

  const markersForActivityCat = useMemo(
    () => marcadores.filter(m => m.ativo && m.categoria === aCategoria),
    [marcadores, aCategoria]
  );

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aNome.trim()) {
      notify('error', 'Informe o nome da atividade.');
      return;
    }
    if (!aDescricao.trim() || aDescricao.length > 500) {
      notify('error', 'Informe uma descrição válida (máximo 500 caracteres).');
      return;
    }
    if (aMarcadoresIds.length === 0) {
      notify('error', 'Selecione ao menos um marcador para a atividade.');
      return;
    }

    setSavingActivity(true);
    const res = await storage.createDesempenhoAtividade({
      categoria: aCategoria,
      nome: aNome.trim(),
      dataAtividade: aData,
      horaAtividade: aHora,
      descricao: aDescricao.trim(),
      marcadoresIds: aMarcadoresIds
    });
    setSavingActivity(false);

    if (!res.success) {
      notify('error', res.error || 'Erro ao criar atividade.');
      return;
    }
    setActivityModalOpen(false);
    setSubTab('ATIVIDADES_GRUPOS');
    notify('success', `Atividade "${aNome.trim()}" criada com sucesso!`);
    await loadAll();
  };

  const handleDeleteActivity = async (id: string) => {
    const res = await storage.deleteDesempenhoAtividade(id);
    setConfirmDeleteActivityId(null);
    if (!res.success) {
      notify('error', res.error || 'Erro ao excluir atividade.');
      return;
    }
    notify('success', 'Atividade removida com sucesso.');
    await loadAll();
  };

  // Group Modal
  const openCreateGroupModal = (preselectedActivity?: DesempenhoAtividade) => {
    const act = preselectedActivity || atividades[0];
    setGAtividadeId(act?.id || '');
    setGNomeGrupo('');
    setGModo('COLETIVO');
    setGData(act?.dataAtividade || getTodayIsoBr());
    setGHora(act?.horaAtividade || '08:00');
    setGParticipantesIds([]);
    setGUserSearch('');
    setGUserUnitFilter('TODAS');
    setGroupModalOpen(true);
  };

  const groupCandidateUsers = useMemo(() => {
    const q = gUserSearch.trim().toLowerCase();
    return accessibleUsers.filter(u => {
      if (gUserUnitFilter !== 'TODAS' && u.unitId !== gUserUnitFilter) return false;
      if (q) {
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.masp || '').toLowerCase().includes(q) ||
          (u.cargo || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accessibleUsers, gUserUnitFilter, gUserSearch]);

  const toggleGroupParticipant = (uid: string) => {
    if (gModo === 'INDIVIDUAL') {
      setGParticipantesIds([uid]);
      return;
    }
    setGParticipantesIds(prev => (prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]));
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gAtividadeId) {
      notify('error', 'Selecione uma atividade.');
      return;
    }
    if (gParticipantesIds.length === 0) {
      notify('error', 'Selecione ao menos um policial participante.');
      return;
    }

    setSavingGroup(true);
    const res = await storage.createDesempenhoGrupo({
      atividadeId: gAtividadeId,
      nomeGrupo: gNomeGrupo.trim() || undefined,
      modoLancamento: gParticipantesIds.length === 1 ? 'INDIVIDUAL' : gModo,
      dataPrevista: gData,
      horaPrevista: gHora,
      participantesIds: gParticipantesIds
    });
    setSavingGroup(false);

    if (!res.success) {
      notify('error', res.error || 'Erro ao criar grupo.');
      return;
    }
    setGroupModalOpen(false);
    setSubTab('ATIVIDADES_GRUPOS');
    setGroupStatusTab('ABERTO');
    await loadAll();
    if (res.id) setActiveGroupId(res.id);
    notify('success', 'Grupo criado! Preencha os valores individuais de cada policial nos marcadores abaixo.');
  };

  // Save Individual Results for Active Group
  const handleSaveGroupResults = async () => {
    if (!activeGroup) return;
    const payload: Array<{
      usuarioId: string;
      marcadorId: string;
      valorMarca?: number | null;
      tempoSegundos?: number | null;
      notaObtida: number;
      ausente?: boolean;
      ausenciaInformada?: boolean | null;
      tirosEfetuados?: number | null;
      observacoes?: string | null;
    }> = [];

    for (const p of activeGroup.participantes) {
      const abs = participantAbsence[p.usuarioId];
      if (abs?.ausente) {
        if (abs.ausenciaInformada !== 'SIM' && abs.ausenciaInformada !== 'NAO') {
          notify('error', `Informe se a ausência de "${p.usuarioNome}" foi informada previamente ou não.`);
          return;
        }
        const informedBool = abs.ausenciaInformada === 'SIM';
        for (const m of activeGroup.marcadores) {
          const key = `${p.usuarioId}__${m.id}`;
          const cell = draftCells[key];
          payload.push({
            usuarioId: p.usuarioId,
            marcadorId: m.id,
            valorMarca: null,
            tempoSegundos: null,
            notaObtida: 0,
            ausente: true,
            ausenciaInformada: informedBool,
            tirosEfetuados: null,
            observacoes: cell?.observacoes?.trim() || null
          });
        }
        continue;
      }

      for (const m of activeGroup.marcadores) {
        const key = `${p.usuarioId}__${m.id}`;
        const cell = draftCells[key];
        if (!cell) continue;
        const notaRaw = cell.notaObtida.trim().replace(',', '.');
        if (notaRaw === '') continue;
        const notaNum = Number(notaRaw);
        if (!Number.isFinite(notaNum)) continue;
        const valRaw = cell.valorMarca.trim().replace(',', '.');
        const valorMarca = valRaw !== '' && Number.isFinite(Number(valRaw)) ? Number(valRaw) : null;
        const tempoSegundos = m.usaTempo ? parseTimeInputToSeconds(cell.tempoInput) : null;
        const tirosRaw = cell.tirosEfetuados.trim();
        const tirosEfetuados = m.teveTiro && tirosRaw !== '' && Number.isFinite(Number(tirosRaw)) ? Math.round(Number(tirosRaw)) : null;
        payload.push({
          usuarioId: p.usuarioId,
          marcadorId: m.id,
          valorMarca,
          tempoSegundos,
          notaObtida: notaNum,
          ausente: false,
          ausenciaInformada: null,
          tirosEfetuados,
          observacoes: cell.observacoes.trim() || null
        });
      }
    }

    if (payload.length === 0) {
      notify('error', 'Informe a nota ou marque ausência de ao menos um policial antes de salvar.');
      return;
    }

    setSavingResults(true);
    const res = await storage.saveDesempenhoGrupoResultados(activeGroup.id, payload);
    setSavingResults(false);
    if (!res.success) {
      notify('error', res.error || 'Erro ao salvar resultados.');
      return;
    }
    notify('success', `${res.savedCount || payload.length} resultado(s) salvo(s) com sucesso!`);
    await loadAll();
  };

  const handleCloseGroup = async (grupoId: string) => {
    const res = await storage.encerrarDesempenhoGrupo(grupoId);
    setConfirmCloseGroupId(null);
    if (!res.success) {
      notify('error', res.error || 'Erro ao encerrar grupo.');
      return;
    }
    notify('success', 'Grupo encerrado e arquivado! Todos os índices permanecem salvos no gráfico e na curva de evolução de cada policial.');
    setGroupStatusTab('ENCERRADO');
    await loadAll();
  };

  const handleDeleteGroup = async (grupoId: string) => {
    const res = await storage.deleteDesempenhoGrupo(grupoId);
    setConfirmDeleteGroupId(null);
    if (!res.success) {
      notify('error', res.error || 'Erro ao excluir grupo.');
      return;
    }
    if (activeGroupId === grupoId) setActiveGroupId(null);
    notify('success', 'Grupo excluído com sucesso.');
    await loadAll();
  };

  const filteredGrupos = useMemo(
    () => grupos.filter(g => g.status === groupStatusTab),
    [grupos, groupStatusTab]
  );

  const filteredMarcadores = useMemo(() => {
    const q = markerSearch.trim().toLowerCase();
    return marcadores.filter(m => {
      if (markerCatFilter !== 'TODOS' && m.categoria !== markerCatFilter) return false;
      if (q && !m.nome.toLowerCase().includes(q) && !(m.descricao || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [marcadores, markerCatFilter, markerSearch]);

  const unitNameById = (uid?: string | null) => units.find(u => u.id === uid)?.name || '—';

  return (
    <div className="space-y-5">
      {alertState && (
        <TopLayerAlert
          type={alertState.type}
          message={alertState.message}
          onClose={() => setAlertState(null)}
        />
      )}

      {/* CABEÇALHO E BOTÕES PRINCIPAIS DE AÇÃO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-extrabold text-white">
                Índices de Desempenho da Unidade (Físico & Técnico / Tático)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cadastre marcadores físicos e táticos, organize atividades e grupos (individuais ou coletivos), lance resultados por policial e acompanhe a curva de evolução anual.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageMarkers && (
              <>
                <button
                  type="button"
                  onClick={() => openCreateMarkerModal('FISICO')}
                  className="px-3.5 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-extrabold flex items-center space-x-1.5 transition"
                >
                  <Dumbbell className="w-4 h-4" />
                  <span>+ Marcador Físico</span>
                </button>
                <button
                  type="button"
                  onClick={() => openCreateMarkerModal('TATICO')}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-extrabold flex items-center space-x-1.5 transition"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>+ Marcador Tático</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => openCreateActivityModal('FISICO')}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Atividade</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateGroupModal()}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5 transition shadow"
            >
              <Users className="w-4 h-4" />
              <span>Novo Grupo / Lançar</span>
            </button>
          </div>
        </div>

        {/* Sub-abas da aba Desempenho da Unidade */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSubTab('USUARIOS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
                subTab === 'USUARIOS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Policiais & Gráficos ({accessibleUsers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('ATIVIDADES_GRUPOS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
                subTab === 'ATIVIDADES_GRUPOS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>
                Atividades & Grupos ({grupos.filter(g => g.status === 'ABERTO').length} abertos /{' '}
                {grupos.filter(g => g.status === 'ENCERRADO').length} arquivados)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('MARCADORES')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
                subTab === 'MARCADORES'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Marcadores Físicos & Táticos ({marcadores.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadAll}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center space-x-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SUB-ABA 1: POLICIAIS & GRÁFICOS (MODELO COC ANIMAIS)                */}
      {/* =================================================================== */}
      {subTab === 'USUARIOS' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Lista lateral separada dos usuários da unidade */}
          <div className="xl:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 h-fit xl:sticky xl:top-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                Policiais da Unidade ({displayedUsers.length})
              </span>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar policial por nome ou MASP..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {accessibleUnits.length > 1 && (
                <select
                  value={userUnitFilter}
                  onChange={e => setUserUnitFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="TODAS">Todas as Unidades Acessíveis ({accessibleUnits.length})</option>
                  {accessibleUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
              {displayedUsers.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Nenhum policial encontrado para o filtro atual.
                </div>
              ) : (
                displayedUsers.map(u => {
                  const isSel = selectedUserObj?.id === u.id;
                  const st = statsByUserId.get(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-2 ${
                        isSel
                          ? 'bg-amber-500/15 border-amber-500 text-white shadow'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          MASP {formatMasp(u.masp || '')} • {unitNameById(u.unitId)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {st ? (
                            <>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                {st.avgPct}% média
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {st.count} avaliação(ões)
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-500">Sem avaliações lançadas</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${isSel ? 'text-amber-400' : 'text-slate-600'}`}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Dashboard / Gráficos do policial selecionado */}
          <div className="xl:col-span-8">
            {selectedUserObj && (
              <UsuarioDesempenhoDashboard
                targetUser={selectedUserObj}
                currentUser={currentUser}
                units={units}
                departments={departments}
                preloadedResultados={allResultados}
              />
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 2: ATIVIDADES & GRUPOS (INDIVIDUAL / COLETIVO / ARQUIVO)    */}
      {/* =================================================================== */}
      {subTab === 'ATIVIDADES_GRUPOS' && (
        <div className="space-y-5">
          {/* Atividades Cadastradas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Atividades Criadas ({atividades.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => openCreateActivityModal('FISICO')}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar Atividade</span>
              </button>
            </div>

            {atividades.length === 0 ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center">
                Nenhuma atividade criada ainda. Clique em <strong>Nova Atividade</strong> e selecione os marcadores desejados.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {atividades.map(a => (
                  <div
                    key={a.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            a.categoria === 'FISICO'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {a.categoria === 'FISICO' ? 'Atividade Física' : 'Atividade Tática'}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {formatDateBr(a.dataAtividade)} {a.horaAtividade}
                          </span>
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-white">{a.nome}</h4>
                      <p className="text-xs text-slate-400 line-clamp-3">{a.descricao}</p>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {(a.marcadores || []).map(m => (
                          <span
                            key={m.id}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-semibold text-slate-200"
                          >
                            {m.nome}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => openCreateGroupModal(a)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center space-x-1 transition"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Criar Grupo / Lançar</span>
                      </button>

                      {confirmDeleteActivityId === a.id ? (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteActivity(a.id)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteActivityId(null)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-bold"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteActivityId(a.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Excluir atividade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grupos em Aberto vs Arquivados + Matriz de Lançamento */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Lista de Grupos */}
            <div className="xl:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 h-fit">
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setGroupStatusTab('ABERTO');
                    setActiveGroupId(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition ${
                    groupStatusTab === 'ABERTO'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Em Aberto ({grupos.filter(g => g.status === 'ABERTO').length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGroupStatusTab('ENCERRADO');
                    setActiveGroupId(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center space-x-1 ${
                    groupStatusTab === 'ENCERRADO'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Arquivados ({grupos.filter(g => g.status === 'ENCERRADO').length})</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredGrupos.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    {groupStatusTab === 'ABERTO'
                      ? 'Nenhum grupo em aberto. Selecione uma atividade acima para criar um grupo.'
                      : 'Nenhum grupo encerrado/arquivado ainda.'}
                  </div>
                ) : (
                  filteredGrupos.map(g => {
                    const isSel = activeGroup?.id === g.id;
                    const expectedCells = g.participantes.length * g.marcadores.length;
                    const filledCells = g.resultados.length;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setActiveGroupId(g.id)}
                        className={`w-full text-left p-3.5 rounded-xl border transition space-y-1.5 ${
                          isSel
                            ? 'bg-amber-500/15 border-amber-500'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              g.categoria === 'FISICO'
                                ? 'bg-sky-500/15 text-sky-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {g.categoria === 'FISICO' ? 'Físico' : 'Tático'} • {g.modoLancamento}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateBr(g.dataPrevista)} {g.horaPrevista}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-white line-clamp-2">{g.nomeGrupo}</div>
                        <div className="text-[11px] text-slate-400">
                          {g.participantes.length} policial(is) • {g.marcadores.length} marcador(es) •{' '}
                          <strong className={filledCells >= expectedCells && expectedCells > 0 ? 'text-emerald-400' : 'text-amber-300'}>
                            {filledCells}/{expectedCells} lançados
                          </strong>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Painel de Lançamento / Visualização do Grupo Selecionado */}
            <div className="xl:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5">
              {!activeGroup ? (
                <div className="py-16 text-center space-y-2">
                  <ClipboardList className="w-10 h-10 text-slate-600 mx-auto" />
                  <div className="text-sm font-bold text-slate-300">
                    Selecione um grupo à esquerda para lançar ou consultar resultados
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Você pode lançar resultados individuais ou coletivos para cada marcador da atividade. Ao encerrar o grupo, ele é arquivado e os índices alimentam permanentemente o gráfico e a curva de evolução de cada policial.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cabeçalho do Grupo */}
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            activeGroup.status === 'ENCERRADO'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {activeGroup.status === 'ENCERRADO' ? 'Encerrado / Arquivado' : 'Em Aberto'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {activeGroup.modoLancamento} • Previsto: {formatDateBr(activeGroup.dataPrevista)}{' '}
                          {activeGroup.horaPrevista}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-white mt-1">{activeGroup.nomeGrupo}</h3>
                      {activeGroup.atividadeDescricao && (
                        <p className="text-xs text-slate-400 mt-1">{activeGroup.atividadeDescricao}</p>
                      )}
                      {activeGroup.status === 'ENCERRADO' && activeGroup.encerradoPorNome && (
                        <p className="text-[11px] text-emerald-300 mt-1 flex items-center space-x-1">
                          <Lock className="w-3.5 h-3.5" />
                          <span>
                            Arquivado por {activeGroup.encerradoPorNome}{' '}
                            {activeGroup.encerradoEm
                              ? `em ${new Date(activeGroup.encerradoEm).toLocaleString('pt-BR')}`
                              : ''}
                          </span>
                        </p>
                      )}
                    </div>

                    {activeGroup.status === 'ABERTO' && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleSaveGroupResults}
                          disabled={savingResults}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5 transition"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{savingResults ? 'Salvando...' : 'Salvar Resultados'}</span>
                        </button>

                        {confirmCloseGroupId === activeGroup.id ? (
                          <div className="flex items-center space-x-1 bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-2 py-1">
                            <span className="text-[11px] font-bold text-emerald-200 px-1">Arquivar grupo?</span>
                            <button
                              type="button"
                              onClick={() => handleCloseGroup(activeGroup.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-extrabold"
                            >
                              Sim, Encerrar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCloseGroupId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCloseGroupId(activeGroup.id)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center space-x-1.5 transition"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Encerrar e Arquivar</span>
                          </button>
                        )}

                        {confirmDeleteGroupId === activeGroup.id ? (
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(activeGroup.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                            >
                              Confirmar Exclusão
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroupId(null)}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(activeGroup.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Excluir grupo aberto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Participantes & Lançamento por Marcador */}
                  <div className="space-y-4">
                    {activeGroup.participantes.map(p => {
                      const absState = participantAbsence[p.usuarioId] || {
                        ausente: false,
                        ausenciaInformada: ''
                      };
                      const isParticipantAbsent = activeGroup.status === 'ABERTO' && absState.ausente;

                      return (
                      <div
                        key={p.usuarioId}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
                          <div>
                            <div className="font-extrabold text-sm text-white">{p.usuarioNome}</div>
                            <div className="text-[11px] text-slate-400">
                              MASP {formatMasp(p.usuarioMasp || '') || '—'} • {p.usuarioCargo || 'Policial'} •{' '}
                              <span className="text-sky-300">{p.usuarioUnitName || unitNameById(p.usuarioUnitId)}</span>
                            </div>
                          </div>

                          {activeGroup.status === 'ABERTO' && (
                            <div className="flex flex-wrap items-center gap-2.5">
                              <label className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-rose-500/50 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={absState.ausente}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setParticipantAbsence(prev => ({
                                      ...prev,
                                      [p.usuarioId]: {
                                        ausente: checked,
                                        ausenciaInformada: checked ? prev[p.usuarioId]?.ausenciaInformada || '' : ''
                                      }
                                    }));
                                  }}
                                  className="rounded border-slate-600 text-rose-500 focus:ring-rose-500"
                                />
                                <span className={`text-xs font-bold ${absState.ausente ? 'text-rose-300' : 'text-slate-300'}`}>
                                  Usuário ausente
                                </span>
                              </label>

                              {absState.ausente && (
                                <select
                                  value={absState.ausenciaInformada}
                                  onChange={e =>
                                    setParticipantAbsence(prev => ({
                                      ...prev,
                                      [p.usuarioId]: {
                                        ausente: true,
                                        ausenciaInformada: e.target.value as '' | 'SIM' | 'NAO'
                                      }
                                    }))
                                  }
                                  className="bg-slate-900 border border-rose-500/50 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-200 focus:outline-none focus:border-rose-400"
                                >
                                  <option value="">Ausência informada previamente?</option>
                                  <option value="SIM">Sim — Ausência informada previamente</option>
                                  <option value="NAO">Não — Ausência não informada previamente</option>
                                </select>
                              )}
                            </div>
                          )}
                        </div>

                        {activeGroup.status === 'ENCERRADO' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {activeGroup.marcadores.map(m => {
                              const saved = activeGroup.resultados.find(
                                r => r.usuarioId === p.usuarioId && r.marcadorId === m.id
                              );
                              return (
                                <div
                                  key={m.id}
                                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-white truncate">{m.nome}</div>
                                    <div className={`text-xs mt-0.5 ${saved?.ausente ? 'text-rose-300 font-semibold' : 'text-amber-200'}`}>
                                      {saved ? formatResultadoResumo(saved) : 'Não lançado'}
                                    </div>
                                    {saved?.observacoes && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">{saved.observacoes}</div>
                                    )}
                                  </div>
                                  {saved && (
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                                        saved.ausente
                                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                          : saved.aprovado
                                          ? 'bg-emerald-500/15 text-emerald-300'
                                          : 'bg-amber-500/15 text-amber-300'
                                      }`}
                                    >
                                      {saved.ausente ? 'Ausente' : saved.aprovado ? 'Aprovado' : 'Abaixo da Meta'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {activeGroup.marcadores.map(m => {
                              const key = `${p.usuarioId}__${m.id}`;
                              const cell = draftCells[key] || {
                                valorMarca: '',
                                tempoInput: '',
                                notaObtida: '',
                                tirosEfetuados: '',
                                observacoes: ''
                              };
                              const notaNum = Number(cell.notaObtida.replace(',', '.'));
                              const timeSec = m.usaTempo ? parseTimeInputToSeconds(cell.tempoInput) : null;
                              const hasNota = cell.notaObtida.trim() !== '' && Number.isFinite(notaNum);
                              const isAprovPreview =
                                hasNota &&
                                notaNum >= m.notaAprovacao &&
                                (!m.usaTempo ||
                                  m.tempoAprovacaoSegundos == null ||
                                  timeSec == null ||
                                  timeSec <= m.tempoAprovacaoSegundos);

                              const updateCell = (patch: Partial<DraftResultCell>) => {
                                setDraftCells(prev => ({
                                  ...prev,
                                  [key]: { ...cell, ...patch }
                                }));
                              };

                              return (
                                <div
                                  key={m.id}
                                  className={`bg-slate-900 border rounded-xl p-3 space-y-2.5 ${
                                    isParticipantAbsent ? 'border-rose-500/30 bg-rose-950/10' : 'border-slate-800'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <span className="text-xs font-extrabold text-amber-300">{m.nome}</span>
                                      <span className="text-[11px] text-slate-400 ml-2">
                                        Nota: {formatNumberBr(m.notaMinima)} a {formatNumberBr(m.notaMaxima)} (aprovação ≥{' '}
                                        {formatNumberBr(m.notaAprovacao)})
                                        {m.usaTempo && m.tempoAprovacaoSegundos != null
                                          ? ` • Tempo alvo ≤ ${formatSecondsCompact(m.tempoAprovacaoSegundos)}`
                                          : ''}
                                      </span>
                                    </div>
                                    {isParticipantAbsent ? (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                        Ausente
                                        {absState.ausenciaInformada === 'SIM'
                                          ? ' • Informada'
                                          : absState.ausenciaInformada === 'NAO'
                                          ? ' • Não informada'
                                          : ''}
                                      </span>
                                    ) : hasNota ? (
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                          isAprovPreview
                                            ? 'bg-emerald-500/15 text-emerald-300'
                                            : 'bg-amber-500/15 text-amber-300'
                                        }`}
                                      >
                                        {isAprovPreview ? 'Aprovado' : 'Abaixo da Meta'}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                    <div>
                                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                        Marca ({m.unidadeMedida || m.tipoMarca || 'valor'})
                                      </label>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={isParticipantAbsent}
                                        value={isParticipantAbsent ? '' : cell.valorMarca}
                                        onChange={e => updateCell({ valorMarca: e.target.value })}
                                        placeholder={isParticipantAbsent ? 'Ausente' : m.tipoMarca === 'Distância' ? 'Ex: 2400' : 'Ex: 35'}
                                        className="w-full bg-slate-950 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                                      />
                                    </div>

                                    {m.usaTempo && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                          Tempo (MM:SS)
                                        </label>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          disabled={isParticipantAbsent}
                                          value={isParticipantAbsent ? '' : cell.tempoInput}
                                          onChange={e => updateCell({ tempoInput: maskTimeMMSS(e.target.value) })}
                                          placeholder={isParticipantAbsent ? 'Ausente' : '00:00'}
                                          className="w-full bg-slate-950 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                                        />
                                      </div>
                                    )}

                                    <div>
                                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                        Pontuação / Nota {isParticipantAbsent ? '' : '*'}
                                      </label>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={isParticipantAbsent}
                                        value={isParticipantAbsent ? '' : cell.notaObtida}
                                        onChange={e => updateCell({ notaObtida: e.target.value })}
                                        placeholder={
                                          isParticipantAbsent
                                            ? 'Ausente'
                                            : `${formatNumberBr(m.notaMinima)} - ${formatNumberBr(m.notaMaxima)}`
                                        }
                                        className="w-full bg-slate-950 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                                      />
                                    </div>

                                    {m.teveTiro && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-rose-300 mb-1">
                                          Tiros ({m.tipoArma})
                                        </label>
                                        <input
                                          type="number"
                                          min={0}
                                          disabled={isParticipantAbsent}
                                          value={isParticipantAbsent ? '' : cell.tirosEfetuados}
                                          onChange={e => updateCell({ tirosEfetuados: e.target.value })}
                                          className="w-full bg-slate-950 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                                        />
                                      </div>
                                    )}

                                    <div className={m.usaTempo && m.teveTiro ? 'sm:col-span-2 lg:col-span-4' : ''}>
                                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                        Observações
                                      </label>
                                      <input
                                        type="text"
                                        value={cell.observacoes}
                                        onChange={e => updateCell({ observacoes: e.target.value })}
                                        placeholder={isParticipantAbsent ? 'Justificativa / detalhe da ausência (opcional)' : 'Opcional'}
                                        maxLength={500}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 3: MARCADORES CADASTRADOS (FÍSICOS & TÁTICOS)               */}
      {/* =================================================================== */}
      {subTab === 'MARCADORES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['TODOS', 'FISICO', 'TATICO'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMarkerCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    markerCatFilter === cat
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {cat === 'TODOS' ? 'Todos' : cat === 'FISICO' ? 'Físicos' : 'Táticos'}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={markerSearch}
                onChange={e => setMarkerSearch(e.target.value)}
                placeholder="Buscar marcador..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {!canManageMarkers && (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
              Apenas usuários com perfil <strong>Administrador</strong> podem cadastrar, editar ou excluir marcadores. Você pode utilizar todos os marcadores abaixo ao criar atividades e grupos.
            </div>
          )}

          {filteredMarcadores.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              Nenhum marcador cadastrado para este filtro.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMarcadores.map(m => (
                <div
                  key={m.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            m.categoria === 'FISICO'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {m.categoria === 'FISICO' ? 'Físico' : 'Tático'}
                        </span>
                        {m.tipoMarca && (
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-300">
                            {m.tipoMarca} ({m.unidadeMedida || 'un.'})
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-amber-300">
                          {m.dificuldade}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-sm text-white">{m.nome}</h4>
                    </div>

                    {canManageMarkers && (
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditMarkerModal(m)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition"
                          title="Editar marcador"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteMarkerId === m.id ? (
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteMarker(m.id)}
                              className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold"
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMarkerId(null)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-bold"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMarkerId(m.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Excluir marcador"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-slate-900/70 border border-slate-800/80 rounded-lg p-2.5">
                    <div>
                      <span className="text-slate-500 block">Pontuação (Min / Máx)</span>
                      <strong className="text-slate-200">
                        {formatNumberBr(m.notaMinima)} — {formatNumberBr(m.notaMaxima)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Aprovação</span>
                      <strong className="text-emerald-400">≥ {formatNumberBr(m.notaAprovacao)} pts</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Controle de Tempo</span>
                      <strong className="text-slate-200">
                        {m.usaTempo
                          ? `${formatSecondsCompact(m.tempoMinSegundos)} / ${formatSecondsCompact(m.tempoMaxSegundos)} (alvo ${formatSecondsCompact(m.tempoAprovacaoSegundos)})`
                          : 'Sem exigência de tempo'}
                      </strong>
                    </div>
                    {m.categoria === 'TATICO' && (
                      <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-800">
                        <span className="text-slate-500">Disparo de Arma de Fogo: </span>
                        <strong className={m.teveTiro ? 'text-rose-300' : 'text-slate-300'}>
                          {m.teveTiro ? `Sim — ${m.tipoArma} (${m.quantidadeTiros} tiros)` : 'Não'}
                        </strong>
                      </div>
                    )}
                  </div>

                  {m.descricao && (
                    <p className="text-xs text-slate-400 whitespace-pre-line line-clamp-4">{m.descricao}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: CADASTRAR / EDITAR MARCADOR FÍSICO OU TÁTICO               */}
      {/* =================================================================== */}
      {markerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveMarker}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center space-x-2">
                {mCategoria === 'FISICO' ? (
                  <Dumbbell className="w-5 h-5 text-sky-400" />
                ) : (
                  <Crosshair className="w-5 h-5 text-rose-400" />
                )}
                <h3 className="text-base font-extrabold text-white">
                  {editingMarkerId ? 'Editar' : 'Cadastrar'} Marcador{' '}
                  {mCategoria === 'FISICO' ? 'Físico' : 'Tático'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMarkerModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-300 mb-1">Nome do Marcador *</label>
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={mNome}
                    onChange={e => setMNome(e.target.value)}
                    placeholder={
                      mCategoria === 'FISICO'
                        ? 'Ex: Flexões de Braço, Corrida 2400m, Barra Fixa'
                        : 'Ex: Pista CQB, Tiro de Precisão 25m, Transição de Arma'
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {mCategoria === 'FISICO' && (
                  <>
                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Tipo de Marca *</label>
                      <select
                        value={mTipoMarca}
                        onChange={e => {
                          const v = e.target.value as TipoMarcaFisica;
                          setMTipoMarca(v);
                          setMUnidadeMedida(
                            v === 'Repetição' ? 'repetições' : v === 'Distância' ? 'metros' : 'execuções'
                          );
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                      >
                        {TIPOS_MARCA.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-300 mb-1">
                        Unidade de Medida (exibida no gráfico)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={mUnidadeMedida}
                        onChange={e => setMUnidadeMedida(e.target.value)}
                        placeholder="Ex: flexões, metros, execuções"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Dificuldade *</label>
                  <select
                    value={mDificuldade}
                    onChange={e => setMDificuldade(e.target.value as DificuldadeDesempenho)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    {DIFICULDADES.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {mCategoria === 'FISICO' ? 'Nota Mínima *' : 'Pontuação Mínima *'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={mNotaMin}
                      onChange={e => setMNotaMin(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {mCategoria === 'FISICO' ? 'Nota Máxima *' : 'Pontuação Máxima *'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={mNotaMax}
                      onChange={e => setMNotaMax(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-emerald-300 mb-1">
                      {mCategoria === 'FISICO' ? 'Nota de Aprovação *' : 'Pontuação Aprovação *'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={mNotaAprov}
                      onChange={e => setMNotaAprov(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Controle de Tempo (opcional para marcadores Físicos e Táticos) */}
              <label className="flex items-center space-x-2.5 bg-slate-950/70 border border-slate-800 rounded-xl p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mUsaTempo}
                  onChange={e => setMUsaTempo(e.target.checked)}
                  className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="font-bold text-slate-200">
                    Este marcador {mCategoria === 'FISICO' ? 'físico' : 'tático'} exige controle de tempo (mínimo / máximo / aprovação)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Desmarque para exercícios {mCategoria === 'FISICO' ? 'físicos' : 'táticos'} que não precisam de tempo mínimo, máximo ou tempo de aprovação.
                  </div>
                </div>
              </label>

              {mUsaTempo && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Tempo Mínimo (MM:SS)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mTempoMin}
                      onChange={e => setMTempoMin(maskTimeMMSS(e.target.value))}
                      placeholder="00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Tempo Máximo (MM:SS)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mTempoMax}
                      onChange={e => setMTempoMax(maskTimeMMSS(e.target.value))}
                      placeholder="00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-300 mb-1">Tempo de Aprovação (MM:SS)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mTempoAprov}
                      onChange={e => setMTempoAprov(maskTimeMMSS(e.target.value))}
                      placeholder="00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Disparo de Arma de Fogo (Marcador Tático) */}
              {mCategoria === 'TATICO' && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-200">Teve tiro de arma de fogo?</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setMTeveTiro(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                          !mTeveTiro ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        onClick={() => setMTeveTiro(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                          mTeveTiro ? 'bg-rose-500 text-white' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Sim
                      </button>
                    </div>
                  </div>

                  {mTeveTiro && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block font-bold text-slate-300 mb-1">Tipo de Arma *</label>
                        <select
                          value={mTipoArma}
                          onChange={e => setMTipoArma(e.target.value as TipoArmaDesempenho)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                        >
                          {TIPOS_ARMA.map(arma => (
                            <option key={arma} value={arma}>
                              {arma}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-300 mb-1">Quantidade de Tiros *</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={mQtdTiros}
                          onChange={e => setMQtdTiros(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Descrição (até 200 linhas) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">Descrição da Atividade</label>
                  <span
                    className={`text-[11px] font-bold ${
                      markerDescLineCount > 200 ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {markerDescLineCount} / 200 linhas
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={mDescricao}
                  onChange={e => setMDescricao(e.target.value)}
                  placeholder="Descreva os critérios de execução, postura, pontuação e regras do exercício (máximo 200 linhas)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setMarkerModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingMarker || markerDescLineCount > 200}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{savingMarker ? 'Salvando...' : 'Salvar Marcador'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CRIAR ATIVIDADE (FÍSICA OU TÁTICA)                         */}
      {/* =================================================================== */}
      {activityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveActivity}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-extrabold text-white">Criar Nova Atividade de Desempenho</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivityModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1.5">Tipo de Atividade *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setACategoria('FISICO');
                      setAMarcadoresIds([]);
                    }}
                    className={`p-3 rounded-xl border font-extrabold flex items-center justify-center space-x-2 transition ${
                      aCategoria === 'FISICO'
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Dumbbell className="w-4 h-4" />
                    <span>Atividade Física</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setACategoria('TATICO');
                      setAMarcadoresIds([]);
                    }}
                    className={`p-3 rounded-xl border font-extrabold flex items-center justify-center space-x-2 transition ${
                      aCategoria === 'TATICO'
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Crosshair className="w-4 h-4" />
                    <span>Atividade Tática</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-300 mb-1">Nome da Atividade *</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={aNome}
                    onChange={e => setANome(e.target.value)}
                    placeholder="Ex: TAF Semestral 2026 / Pista Tática Trimestral"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-300 mb-1">Data da Realização *</label>
                  <input
                    type="date"
                    required
                    value={aData}
                    onChange={e => setAData(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Hora *</label>
                  <input
                    type="time"
                    required
                    value={aHora}
                    onChange={e => setAHora(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">Descrição da Atividade *</label>
                  <span className={`text-[11px] font-bold ${aDescricao.length > 500 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {aDescricao.length} / 500 caracteres
                  </span>
                </div>
                <textarea
                  rows={3}
                  required
                  maxLength={500}
                  value={aDescricao}
                  onChange={e => setADescricao(e.target.value)}
                  placeholder="Descreva os objetivos e orientações gerais desta atividade (máximo 500 caracteres)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Seleção de Marcadores */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-300">
                  Selecione os Marcadores ({aCategoria === 'FISICO' ? 'Físicos' : 'Táticos'}) * —{' '}
                  <span className="text-amber-300">{aMarcadoresIds.length} selecionado(s)</span>
                </label>

                {markersForActivityCat.length === 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-200 text-xs">
                    Nenhum marcador {aCategoria === 'FISICO' ? 'Físico' : 'Tático'} cadastrado ainda.
                    {canManageMarkers
                      ? ' Cadastre marcadores primeiro usando os botões "+ Marcador Físico" / "+ Marcador Tático".'
                      : ' Solicite a um Administrador o cadastro dos marcadores.'}
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {markersForActivityCat.map(m => {
                      const checked = aMarcadoresIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            setAMarcadoresIds(prev =>
                              prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]
                            )
                          }
                          className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                            checked
                              ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold truncate">{m.nome}</div>
                              <div className="text-[10px] text-slate-400">
                                {m.tipoMarca ? `${m.tipoMarca} • ` : ''}Nota {formatNumberBr(m.notaMinima)}–
                                {formatNumberBr(m.notaMaxima)} (aprov. ≥ {formatNumberBr(m.notaAprovacao)}) •{' '}
                                {m.dificuldade}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setActivityModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingActivity || aMarcadoresIds.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{savingActivity ? 'Criando...' : 'Criar Atividade'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: CRIAR GRUPO (INDIVIDUAL OU COLETIVO)                       */}
      {/* =================================================================== */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateGroup}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Criar Grupo / Lançamento de Desempenho</h3>
              </div>
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Atividade *</label>
                {atividades.length === 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-200">
                    Crie uma atividade primeiro usando o botão <strong>Nova Atividade</strong>.
                  </div>
                ) : (
                  <select
                    required
                    value={gAtividadeId}
                    onChange={e => {
                      const id = e.target.value;
                      setGAtividadeId(id);
                      const found = atividades.find(a => a.id === id);
                      if (found) {
                        setGData(found.dataAtividade);
                        setGHora(found.horaAtividade);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione a atividade...</option>
                    {atividades.map(a => (
                      <option key={a.id} value={a.id}>
                        [{a.categoria === 'FISICO' ? 'FÍSICO' : 'TÁTICO'}] {a.nome} ({formatDateBr(a.dataAtividade)}) —{' '}
                        {a.marcadoresIds.length} marcador(es)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGModo('COLETIVO')}
                  className={`p-3 rounded-xl border font-extrabold flex items-center justify-center space-x-2 transition ${
                    gModo === 'COLETIVO'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Coletivo (Grupo de Policiais)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGModo('INDIVIDUAL');
                    setGParticipantesIds(prev => prev.slice(0, 1));
                  }}
                  className={`p-3 rounded-xl border font-extrabold flex items-center justify-center space-x-2 transition ${
                    gModo === 'INDIVIDUAL'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Individual (1 Policial)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-300 mb-1">Nome do Grupo (opcional)</label>
                  <input
                    type="text"
                    maxLength={220}
                    value={gNomeGrupo}
                    onChange={e => setGNomeGrupo(e.target.value)}
                    placeholder="Deixe vazio para gerar automaticamente"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-300 mb-1">Data Prevista *</label>
                  <input
                    type="date"
                    required
                    value={gData}
                    onChange={e => setGData(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Hora Prevista *</label>
                  <input
                    type="time"
                    required
                    value={gHora}
                    onChange={e => setGHora(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Seleção de Policiais de qualquer unidade acessível */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-300">
                    Policiais Participantes (qualquer unidade com acesso) * —{' '}
                    <span className="text-amber-300">{gParticipantesIds.length} selecionado(s)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={gUserSearch}
                      onChange={e => setGUserSearch(e.target.value)}
                      placeholder="Buscar por nome ou MASP..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  {accessibleUnits.length > 1 && (
                    <select
                      value={gUserUnitFilter}
                      onChange={e => setGUserUnitFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="TODAS">Todas as Unidades Acessíveis</option>
                      {accessibleUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {groupCandidateUsers.map(u => {
                    const checked = gParticipantesIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleGroupParticipant(u.id)}
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                          checked
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold truncate">{u.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              MASP {formatMasp(u.masp || '')} • {unitNameById(u.unitId)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingGroup || !gAtividadeId || gParticipantesIds.length === 0}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{savingGroup ? 'Criando...' : 'Criar Grupo e Lançar Resultados'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
