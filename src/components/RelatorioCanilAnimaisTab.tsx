import React, { useState, useMemo, useEffect } from 'react';
import {
  User,
  Cachorro,
  RelatorioTreinamentoCanil,
  MovimentacaoVeterinaria,
  DetalhesCompletosCachorro,
  Unit,
  Department,
  getSystemLogo,
  DEFAULT_SYSTEM_LOGO
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import QRCode from 'qrcode';
import {
  Dog,
  Search,
  Printer,
  History,
  Syringe,
  Stethoscope,
  Pill,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Award,
  TrendingDown,
  BarChart3,
  Plus,
  Trash2,
  Save,
  X,
  UserCheck,
  Calendar,
  Hash,
  Sparkles,
  CheckSquare,
  Square,
  Home,
  Clock,
  IdCard
} from 'lucide-react';

interface RelatorioCanilAnimaisTabProps {
  currentUser: User;
  cachorros: Cachorro[];
  relatoriosTreinamento: RelatorioTreinamentoCanil[];
  movimentacoesVeterinarias: MovimentacaoVeterinaria[];
  activeTopicos: string[];
  units: Unit[];
  departments: Department[];
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
  onDataChanged: () => void;
}

interface TopicBarDatum {
  topico: string;
  count: number;
  pctOfTrainings: number;
}

interface DogTrainingStats {
  totalTreinos: number;
  bars: TopicBarDatum[];
  maxCount: number;
  minCount: number;
  aptidaoTopicos: string[];
  sugestaoTopicos: string[];
}

function getSafeImageUrl(url?: string | null): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTimeBr(dt?: string | null): string {
  if (!dt) return '—';
  const str = String(dt).trim();
  if (str.length >= 16 && str.includes('-')) {
    const datePart = formatDateBr(str.slice(0, 10));
    const timePart = str.slice(11, 16);
    return `${datePart} ${timePart}`;
  }
  return formatDateBr(str);
}

function formatBaiaBoxLabel(dog: Cachorro): string {
  const nome = String(dog.canilFisicoNome || '').trim();
  const ident = String(dog.canilFisicoIdentificacao || '').trim();
  if (!nome && !ident) return 'Não alocada';
  if (nome && ident && !nome.toLowerCase().includes(ident.toLowerCase())) {
    return `${nome} (${ident})`;
  }
  return nome || ident;
}

function formatSugestaoTopicos(sugestaoTopicos: string[], separator = ' • '): string {
  if (sugestaoTopicos.length === 0) return '';
  if (sugestaoTopicos.length <= 4) {
    return sugestaoTopicos.join(separator);
  }
  return `${sugestaoTopicos.slice(0, 4).join(separator)} e outros`;
}

function resolveCocUnitAndLogo(
  units: Unit[],
  departments: Department[],
  dog: Cachorro,
  currentUser: User
): { unitObj: Unit | null; deptObj: Department | null; logoUrl: string } {
  // Layout do relatório/ficha segue a unidade cadastrada do usuário emissor
  const issuerUnit = currentUser?.unitId ? units.find(u => u.id === currentUser.unitId) || null : null;

  const cocMatches = units.filter(
    u =>
      /\bcoc\b/i.test(u.name || '') ||
      /opera[çc][õo]es\s+com\s+c[ãa]es/i.test(u.name || '')
  );
  const canilMatches = units.filter(u => /canil|\bk9\b/i.test(u.name || ''));

  const layoutUnit =
    issuerUnit ||
    cocMatches.find(u => Boolean(u.logoUrl && u.logoUrl.trim())) ||
    cocMatches[0] ||
    canilMatches.find(u => Boolean(u.logoUrl && u.logoUrl.trim())) ||
    canilMatches[0] ||
    units.find(u => u.id === dog.unitId) ||
    null;

  const deptObj =
    departments.find(
      d => d.id === (layoutUnit?.departmentId || currentUser?.departmentId || dog.departmentId)
    ) || null;

  const rawLogo = getSystemLogo(layoutUnit, deptObj);
  const safeLogo = getSafeImageUrl(rawLogo) || '';
  return { unitObj: layoutUnit, deptObj, logoUrl: safeLogo };
}

function getTodayIsoBr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function calculateAgeText(dataNascimento?: string | null): string {
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}/.test(dataNascimento)) return 'Não informada';
  const [y, m, d] = dataNascimento.slice(0, 10).split('-').map(Number);
  const birth = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) return 'Não informada';

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'Menos de 1 mês';
  if (years <= 0) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  if (months === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${months} ${months === 1 ? 'mês' : 'meses'}`;
}

function computeDogTrainingStats(
  dog: Cachorro,
  relatorios: RelatorioTreinamentoCanil[],
  activeTopicos: string[]
): DogTrainingStats {
  const counts = new Map<string, number>();
  for (const t of activeTopicos) {
    counts.set(t, 0);
  }

  let totalTreinos = 0;

  for (const rel of relatorios) {
    const condutorDogs =
      rel.cachorros && rel.cachorros.length > 0
        ? rel.cachorros
        : rel.cachorroId
        ? [{ id: rel.cachorroId, nome: rel.cachorroNome }]
        : [];
    const partDogs = (rel.participantes || []).flatMap(p => p.cachorros || []);
    const reportDogIds = new Set<string>([
      ...condutorDogs.map(d => d.id).filter(Boolean),
      ...partDogs.map(d => d.id).filter(Boolean)
    ]);

    const participatedInReport = reportDogIds.has(dog.id);
    if (participatedInReport) {
      totalTreinos += 1;
    }

    for (const item of rel.topicosTreinamento || []) {
      const normalizedTopic = item.topico === 'PADERE' ? 'PAREDE' : item.topico;
      if (!counts.has(normalizedTopic)) continue;

      const dogTrainedTopic =
        (item.aplicarTodosK9 && participatedInReport) ||
        (item.cachorros || []).some(c => c.id === dog.id);

      if (dogTrainedTopic) {
        counts.set(normalizedTopic, (counts.get(normalizedTopic) || 0) + 1);
      }
    }
  }

  const bars: TopicBarDatum[] = activeTopicos.map(topico => {
    const count = counts.get(topico) || 0;
    const pctOfTrainings = totalTreinos > 0 ? Math.round((count / totalTreinos) * 100) : 0;
    return { topico, count, pctOfTrainings };
  });

  const maxCount = bars.length > 0 ? Math.max(...bars.map(b => b.count)) : 0;
  const minCount = bars.length > 0 ? Math.min(...bars.map(b => b.count)) : 0;

  const aptidaoTopicos = maxCount > 0 ? bars.filter(b => b.count === maxCount).map(b => b.topico) : [];
  const sugestaoTopicos = bars.length > 0 ? bars.filter(b => b.count === minCount).map(b => b.topico) : [];

  return {
    totalTreinos,
    bars,
    maxCount,
    minCount,
    aptidaoTopicos,
    sugestaoTopicos
  };
}

function buildPrintableChartSvg(stats: DogTrainingStats): string {
  const bars = stats.bars;
  if (bars.length === 0) {
    return '<div style="padding:16px;text-align:center;color:#475569;font-size:12px;">Nenhum tópico de treinamento configurado.</div>';
  }

  const width = 760;
  const height = 290;
  const padLeft = 40;
  const padRight = 18;
  const padTop = 26;
  const padBottom = 96;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const maxVal = Math.max(stats.maxCount, 1);

  const stepCount = Math.min(maxVal, 5);
  const gridLines: string[] = [];
  for (let i = 0; i <= stepCount; i++) {
    const val = Math.round((maxVal / stepCount) * i);
    const y = padTop + chartH - (val / maxVal) * chartH;
    gridLines.push(
      `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />` +
        `<text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b" font-family="Arial,sans-serif">${val}</text>`
    );
  }

  const slotW = chartW / bars.length;
  const barW = Math.max(12, Math.min(34, slotW * 0.62));

  const barEls = bars
    .map((b, idx) => {
      const cx = padLeft + slotW * idx + slotW / 2;
      const x = cx - barW / 2;
      const barH = b.count > 0 ? Math.max(4, (b.count / maxVal) * chartH) : 2;
      const y = padTop + chartH - barH;
      const isAptidao = stats.maxCount > 0 && b.count === stats.maxCount;
      const isSugestao = b.count === stats.minCount;
      const fill = isAptidao ? '#059669' : isSugestao ? '#d97706' : '#2563eb';
      const label = escapeHtmlText(b.topico.length > 16 ? `${b.topico.slice(0, 15)}…` : b.topico);

      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${fill}" />` +
        `<text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#0f172a" font-family="Arial,sans-serif">${b.count}</text>` +
        `<text x="${cx.toFixed(1)}" y="${(padTop + chartH + 12).toFixed(1)}" text-anchor="end" transform="rotate(-40 ${cx.toFixed(1)} ${(padTop + chartH + 12).toFixed(1)})" font-size="8.5" font-weight="bold" fill="#1e293b" font-family="Arial,sans-serif">${label}</text>`
      );
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-height:280px;display:block;" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      ${gridLines.join('')}
      <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="#94a3b8" stroke-width="1.2" />
      ${barEls}
    </svg>
  `;
}

export const RelatorioCanilAnimaisTab: React.FC<RelatorioCanilAnimaisTabProps> = ({
  currentUser,
  cachorros,
  relatoriosTreinamento,
  movimentacoesVeterinarias,
  activeTopicos,
  units,
  departments,
  onNotifySuccess,
  onNotifyError,
  onDataChanged
}) => {
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const canViewAllAnimals =
    effectiveRole === 'Geral' ||
    effectiveRole === 'Administrador' ||
    effectiveRole === 'Armeiro' ||
    Boolean(currentUser.canManageCanilAndAnimals);

  const canEditHealthRecords =
    effectiveRole === 'Geral' ||
    effectiveRole === 'Administrador' ||
    effectiveRole === 'Armeiro' ||
    effectiveRole === 'Veterinário' ||
    Boolean(currentUser.canManageCanilAndAnimals) ||
    Boolean(currentUser.canManageCanilMeds) ||
    Boolean(currentUser.canAdministerCanilMeds);

  const visibleDogs = useMemo(() => {
    const base = canViewAllAnimals
      ? cachorros
      : cachorros.filter(
          d =>
            d.tipoVinculo === 'SISTEMA' &&
            (d.usuarioInternoId === currentUser.id || d.usuarioInterno2Id === currentUser.id)
        );
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [cachorros, canViewAllAnimals, currentUser.id]);

  const [animalSearch, setAnimalSearch] = useState('');
  const [selectedDogId, setSelectedDogId] = useState<string>('');
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);

  // Detalhes completos do cão selecionado (histórico condutores, vacinas, histórico médico, medicamentos)
  const [detalhes, setDetalhes] = useState<DetalhesCompletosCachorro | null>(null);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  // Modais e formulários auxiliares
  const [showCondutoresHistoryModal, setShowCondutoresHistoryModal] = useState(false);
  const [showMultiPrintModal, setShowMultiPrintModal] = useState(false);
  const [multiPrintSelectedIds, setMultiPrintSelectedIds] = useState<string[]>([]);

  // Anotações do condutor (500 caracteres)
  const [anotacoesDraft, setAnotacoesDraft] = useState('');
  const [savingAnotacoes, setSavingAnotacoes] = useState(false);

  // Formulário rápido de Vacina
  const [showAddVacina, setShowAddVacina] = useState(false);
  const [vacinaForm, setVacinaForm] = useState({
    nomeVacina: '',
    dataAplicacao: getTodayIsoBr(),
    proximaDose: '',
    lote: '',
    veterinario: '',
    observacoes: ''
  });
  const [savingVacina, setSavingVacina] = useState(false);

  // Formulário rápido de Histórico Médico
  const [showAddMedico, setShowAddMedico] = useState(false);
  const [medicoForm, setMedicoForm] = useState({
    dataAtendimento: getTodayIsoBr(),
    tipoAtendimento: '',
    diagnostico: '',
    conduta: '',
    veterinario: '',
    observacoes: ''
  });
  const [savingMedico, setSavingMedico] = useState(false);

  const filteredDogs = useMemo(() => {
    const q = animalSearch.trim().toLowerCase();
    if (!q) return visibleDogs;
    return visibleDogs.filter(d => {
      const hay = `${d.nome} ${d.raca || ''} ${d.microchip || ''} ${d.usuarioInternoNome || ''} ${d.usuarioInterno2Nome || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [visibleDogs, animalSearch]);

  useEffect(() => {
    if (visibleDogs.length === 0) {
      setSelectedDogId('');
      return;
    }
    if (!selectedDogId || !visibleDogs.some(d => d.id === selectedDogId)) {
      setSelectedDogId(visibleDogs[0].id);
    }
  }, [visibleDogs, selectedDogId]);

  const selectedDog = useMemo(
    () => visibleDogs.find(d => d.id === selectedDogId) || null,
    [visibleDogs, selectedDogId]
  );

  useEffect(() => {
    setAnotacoesDraft(selectedDog?.anotacoesCondutor || '');
    setShowAddVacina(false);
    setShowAddMedico(false);
  }, [selectedDog?.id, selectedDog?.anotacoesCondutor]);

  const loadDetalhesDog = async (dogId: string) => {
    setLoadingDetalhes(true);
    try {
      const res = await storage.getDetalhesCompletosCachorro(dogId);
      if (res.success && res.data) {
        setDetalhes(res.data);
      } else {
        setDetalhes({
          historicoCondutores: [],
          vacinas: [],
          historicoMedico: [],
          medicamentos: []
        });
      }
    } finally {
      setLoadingDetalhes(false);
    }
  };

  useEffect(() => {
    if (!selectedDog?.id) {
      setDetalhes(null);
      return;
    }
    loadDetalhesDog(selectedDog.id);
  }, [selectedDog?.id]);

  const selectedDogStats = useMemo(() => {
    if (!selectedDog) return null;
    return computeDogTrainingStats(selectedDog, relatoriosTreinamento, activeTopicos);
  }, [selectedDog, relatoriosTreinamento, activeTopicos]);

  const isSelectedDogConductor = useMemo(() => {
    if (!selectedDog) return false;
    return (
      selectedDog.tipoVinculo === 'SISTEMA' &&
      (selectedDog.usuarioInternoId === currentUser.id || selectedDog.usuarioInterno2Id === currentUser.id)
    );
  }, [selectedDog, currentUser.id]);

  // Medicamentos combinando resposta detalhada do backend + fallback do cache local
  const dogMedicamentos = useMemo(() => {
    if (!selectedDog) return [];
    if (detalhes?.medicamentos && detalhes.medicamentos.length > 0) {
      return detalhes.medicamentos;
    }
    return movimentacoesVeterinarias
      .filter(m => m.cachorroId === selectedDog.id && m.tipoMovimentacao === 'ADMINISTRACAO_CAO')
      .sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')));
  }, [selectedDog, detalhes?.medicamentos, movimentacoesVeterinarias]);

  // Status vacinal (indicativo verde quando em dia)
  const vacinaStatus = useMemo(() => {
    const list = detalhes?.vacinas || [];
    if (list.length === 0) {
      return { status: 'SEM_REGISTRO' as const, overdueCount: 0 };
    }
    const todayIso = getTodayIsoBr();
    const overdueCount = list.filter(v => v.proximaDose && v.proximaDose < todayIso).length;
    if (overdueCount > 0) {
      return { status: 'ATRASADA' as const, overdueCount };
    }
    return { status: 'EM_DIA' as const, overdueCount: 0 };
  }, [detalhes?.vacinas]);

  const handleSaveAnotacoes = async () => {
    if (!selectedDog || !isSelectedDogConductor) return;
    if (anotacoesDraft.length > 500) {
      onNotifyError('As anotações do condutor não podem ultrapassar 500 caracteres.');
      return;
    }
    setSavingAnotacoes(true);
    try {
      const res = await storage.updateAnotacoesCondutorCachorro(selectedDog.id, anotacoesDraft);
      if (res.success) {
        onNotifySuccess('Anotações do condutor salvas com sucesso.');
        onDataChanged();
      } else {
        onNotifyError(res.error || 'Erro ao salvar anotações do condutor.');
      }
    } finally {
      setSavingAnotacoes(false);
    }
  };

  const handleAddVacina = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDog) return;
    if (!vacinaForm.nomeVacina.trim()) {
      onNotifyError('Informe o nome da vacina.');
      return;
    }
    setSavingVacina(true);
    try {
      const res = await storage.saveVacinaCachorro(selectedDog.id, vacinaForm);
      if (res.success) {
        onNotifySuccess('Vacina registrada no histórico do animal.');
        setVacinaForm({
          nomeVacina: '',
          dataAplicacao: getTodayIsoBr(),
          proximaDose: '',
          lote: '',
          veterinario: '',
          observacoes: ''
        });
        setShowAddVacina(false);
        await loadDetalhesDog(selectedDog.id);
      } else {
        onNotifyError(res.error || 'Erro ao registrar vacina.');
      }
    } finally {
      setSavingVacina(false);
    }
  };

  const handleDeleteVacina = async (vacinaId: string) => {
    if (!selectedDog) return;
    const res = await storage.deleteVacinaCachorro(selectedDog.id, vacinaId);
    if (res.success) {
      onNotifySuccess('Registro de vacina removido.');
      await loadDetalhesDog(selectedDog.id);
    } else {
      onNotifyError(res.error || 'Erro ao remover vacina.');
    }
  };

  const handleAddMedico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDog) return;
    if (!medicoForm.tipoAtendimento.trim()) {
      onNotifyError('Informe o tipo de atendimento médico.');
      return;
    }
    setSavingMedico(true);
    try {
      const res = await storage.saveHistoricoMedicoCachorro(selectedDog.id, medicoForm);
      if (res.success) {
        onNotifySuccess('Registro médico adicionado ao histórico do animal.');
        setMedicoForm({
          dataAtendimento: getTodayIsoBr(),
          tipoAtendimento: '',
          diagnostico: '',
          conduta: '',
          veterinario: '',
          observacoes: ''
        });
        setShowAddMedico(false);
        await loadDetalhesDog(selectedDog.id);
      } else {
        onNotifyError(res.error || 'Erro ao registrar atendimento médico.');
      }
    } finally {
      setSavingMedico(false);
    }
  };

  const handleDeleteMedico = async (histId: string) => {
    if (!selectedDog) return;
    const res = await storage.deleteHistoricoMedicoCachorro(selectedDog.id, histId);
    if (res.success) {
      onNotifySuccess('Registro médico removido.');
      await loadDetalhesDog(selectedDog.id);
    } else {
      onNotifyError(res.error || 'Erro ao remover registro médico.');
    }
  };

  const buildSingleAnimalPrintPageHtml = (dog: Cachorro, dogDetalhes?: DetalhesCompletosCachorro | null) => {
    const stats = computeDogTrainingStats(dog, relatoriosTreinamento, activeTopicos);
    const { unitObj, deptObj, logoUrl } = resolveCocUnitAndLogo(units, departments, dog, currentUser);
    const safeFoto = getSafeImageUrl(dog.fotoUrl);
    const baiaBoxText = formatBaiaBoxLabel(dog);
    const condutoresText =
      dog.tipoVinculo === 'SISTEMA'
        ? [
            dog.usuarioInternoNome
              ? `${dog.usuarioInternoNome}${dog.usuarioInternoMasp ? ` (MASP ${formatMasp(dog.usuarioInternoMasp)})` : ''}`
              : null,
            dog.usuarioInterno2Nome
              ? `${dog.usuarioInterno2Nome}${dog.usuarioInterno2Masp ? ` (MASP ${formatMasp(dog.usuarioInterno2Masp)})` : ''}`
              : null
          ]
            .filter(Boolean)
            .join(' / ') || 'Não vinculado'
        : dog.responsavelExternoNome || 'Vínculo Externo';

    const aptidaoText =
      stats.aptidaoTopicos.length > 0
        ? `${stats.aptidaoTopicos.join(' • ')} (${stats.maxCount} ${stats.maxCount === 1 ? 'treino' : 'treinos'})`
        : 'Nenhum tópico treinado registrado';

    const sugestaoText =
      stats.sugestaoTopicos.length > 0
        ? `${formatSugestaoTopicos(stats.sugestaoTopicos, ' • ')} (${stats.minCount} ${stats.minCount === 1 ? 'treino' : 'treinos'})`
        : 'Sem tópicos cadastrados';

    const todayIso = getTodayIsoBr();
    const vacinasList = [...(dogDetalhes?.vacinas || [])].sort((a, b) =>
      String(b.dataAplicacao || '').localeCompare(String(a.dataAplicacao || ''))
    );
    const overdueVac = vacinasList.filter(v => v.proximaDose && v.proximaDose < todayIso).length;
    const vacBadgeHtml =
      vacinasList.length === 0
        ? '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:6px;font-size:9.5px;font-weight:bold;border:1px solid #cbd5e1;">Sem vacinas registradas</span>'
        : overdueVac === 0
        ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:6px;font-size:9.5px;font-weight:bold;border:1px solid #86efac;">● VACINAS EM DIA</span>'
        : `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:6px;font-size:9.5px;font-weight:bold;border:1px solid #fca5a5;">▲ ${overdueVac} REFORÇO(S) PENDENTE(S)</span>`;

    const ultimaVacina = vacinasList[0] || null;
    const vacinasComProxima = vacinasList.filter(v => Boolean(v.proximaDose));
    const proximasFuturas = vacinasComProxima
      .filter(v => String(v.proximaDose) >= todayIso)
      .sort((a, b) => String(a.proximaDose || '').localeCompare(String(b.proximaDose || '')));
    const proximasVencidas = vacinasComProxima
      .filter(v => String(v.proximaDose) < todayIso)
      .sort((a, b) => String(b.proximaDose || '').localeCompare(String(a.proximaDose || '')));
    const proximaVacina = proximasFuturas[0] || proximasVencidas[0] || null;
    const proximaVacinaVencida = Boolean(proximaVacina?.proximaDose && proximaVacina.proximaDose < todayIso);

    const ultimoMedico =
      [...(dogDetalhes?.historicoMedico || [])].sort((a, b) =>
        String(b.dataAtendimento || '').localeCompare(String(a.dataAtendimento || ''))
      )[0] || null;

    const dogMedsList =
      dogDetalhes?.medicamentos && dogDetalhes.medicamentos.length > 0
        ? [...dogDetalhes.medicamentos].sort((a, b) =>
            String(b.dataHora || '').localeCompare(String(a.dataHora || ''))
          )
        : movimentacoesVeterinarias
            .filter(m => m.cachorroId === dog.id && m.tipoMovimentacao === 'ADMINISTRACAO_CAO')
            .sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')));
    const ultimoMedicamento = dogMedsList[0] || null;

    const anotacoesTexto = String(dog.anotacoesCondutor || '').trim();
    const anotacoesUpdatedText = dog.anotacoesCondutorUpdatedAt
      ? formatDateTimeBr(dog.anotacoesCondutorUpdatedAt)
      : anotacoesTexto
      ? 'Data/hora não registrada'
      : 'Sem alterações';

    return `
      <section class="animal-print-page">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${logoUrl ? `<img src="${escapeHtmlText(logoUrl)}" alt="Brasão COC" style="height:46px;max-width:58px;object-fit:contain;" />` : ''}
            <div>
              <div style="font-size:13px;font-weight:900;color:#0f172a;text-transform:uppercase;">Polícia Civil de Minas Gerais — ${escapeHtmlText(unitObj?.name || 'COC / Canil K9')}</div>
              <div style="font-size:11px;font-weight:700;color:#334155;">Ficha de Desempenho e Tópicos de Treinamento K9</div>
            </div>
          </div>
          <div style="text-align:right;font-size:10px;color:#475569;">
            <div><strong>Emissão:</strong> ${escapeHtmlText(formatDateBr(todayIso))}</div>
            <div>${escapeHtmlText(deptObj?.name || 'COE')}${unitObj?.name ? ` — ${escapeHtmlText(unitObj.name)}` : ''}</div>
          </div>
        </div>

        <div style="display:flex;gap:14px;border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin-bottom:10px;background:#f8fafc;">
          <div style="width:82px;height:109px;border:1.5px solid #d97706;border-radius:8px;overflow:hidden;flex-shrink:0;background:#e2e8f0;display:flex;align-items:center;justify-content:center;">
            ${
              safeFoto
                ? `<img src="${escapeHtmlText(safeFoto)}" style="width:100%;height:100%;object-fit:cover;" />`
                : `<span style="font-size:10px;color:#64748b;font-weight:bold;text-align:center;">FOTO 3x4<br/>K9</span>`
            }
          </div>
          <div style="flex:1;font-size:10.5px;line-height:1.45;color:#0f172a;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:8px;">
              <div>
                <div style="font-size:15px;font-weight:900;text-transform:uppercase;line-height:1.15;">${escapeHtmlText(dog.nome)}</div>
                <div style="font-size:10px;font-weight:700;color:#b45309;">${escapeHtmlText(dog.raca || 'Raça não informada')}${dog.especialidade ? ` • ${escapeHtmlText(dog.especialidade)}` : ''}</div>
              </div>
              <div>${vacBadgeHtml}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:5px 10px;margin-bottom:5px;">
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Cor / Pelagem</div>
                <div style="font-weight:700;color:#0f172a;">${escapeHtmlText(dog.pelagem || 'Não informada')}</div>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Nascimento / Idade</div>
                <div style="font-weight:700;color:#0f172a;">${escapeHtmlText(formatDateBr(dog.dataNascimento))} (${escapeHtmlText(calculateAgeText(dog.dataNascimento))})</div>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Baia / Box</div>
                <div style="font-weight:800;color:#0f172a;">${escapeHtmlText(baiaBoxText)}</div>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Microchip</div>
                <div style="font-weight:700;color:#0f172a;font-family:monospace;">${escapeHtmlText(dog.microchip || 'Não informado')}</div>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Status</div>
                <div style="font-weight:700;color:#0f172a;">${escapeHtmlText(dog.status || '—')}</div>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;">
                <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Total de Treinamentos</div>
                <div style="font-weight:800;color:#b45309;">${stats.totalTreinos}</div>
              </div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;">
              <strong style="font-size:9px;text-transform:uppercase;color:#64748b;">Condutor(es):</strong>
              <span style="font-weight:700;color:#0f172a;"> ${escapeHtmlText(condutoresText)}</span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div style="border:1px solid #10b981;background:#ecfdf5;border-radius:10px;padding:8px 10px;">
            <div style="font-size:9.5px;font-weight:900;color:#047857;text-transform:uppercase;letter-spacing:0.3px;">Aptidão em (Mais Treinado)</div>
            <div style="font-size:11px;font-weight:800;color:#064e3b;margin-top:2px;">${escapeHtmlText(aptidaoText)}</div>
          </div>
          <div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:10px;padding:8px 10px;">
            <div style="font-size:9.5px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:0.3px;">Sugestão de Treinamento (Menor Índice)</div>
            <div style="font-size:11px;font-weight:800;color:#78350f;margin-top:2px;">${escapeHtmlText(sugestaoText)}</div>
          </div>
        </div>

        <div style="border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;margin-bottom:10px;background:#ffffff;">
          <div style="font-size:10.5px;font-weight:900;color:#0f172a;text-transform:uppercase;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
            <span>Gráfico de Tópicos de Treinamento (Total de Treinos do Animal: ${stats.totalTreinos})</span>
            <span style="font-size:9px;font-weight:700;color:#475569;">
              <span style="color:#059669;">■ Aptidão</span> &nbsp;
              <span style="color:#2563eb;">■ Regular</span> &nbsp;
              <span style="color:#d97706;">■ Sugestão</span>
            </span>
          </div>
          ${buildPrintableChartSvg(stats)}
        </div>

        <!-- Campo de Anotações do Condutor com data e hora da última alteração -->
        <div style="border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;margin-bottom:10px;background:#f8fafc;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="font-size:10px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:0.3px;">
              Anotações do Condutor do Animal
            </div>
            <div style="font-size:9px;font-weight:700;color:#475569;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:2px 7px;">
              Última alteração: <strong style="color:#0f172a;">${escapeHtmlText(anotacoesUpdatedText)}</strong>
            </div>
          </div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px;font-size:10px;line-height:1.45;color:#1e293b;min-height:38px;white-space:pre-wrap;">${
            anotacoesTexto
              ? escapeHtmlText(anotacoesTexto)
              : '<span style="color:#64748b;font-style:italic;">Nenhuma anotação registrada pelo condutor.</span>'
          }</div>
        </div>

        <!-- Prontuário Clínico Resumido (divs similares às do sistema) -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <!-- Div 1: Vacinas (Última tomada e Próxima vacina) -->
          <div style="border:1px solid #a7f3d0;border-radius:10px;padding:9px 10px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <div style="font-size:9.5px;font-weight:900;color:#047857;text-transform:uppercase;">Vacinas</div>
              <span style="font-size:8.5px;font-weight:800;padding:1px 6px;border-radius:4px;${
                vacinasList.length === 0
                  ? 'background:#e2e8f0;color:#475569;'
                  : overdueVac === 0
                  ? 'background:#dcfce7;color:#166534;'
                  : 'background:#fee2e2;color:#991b1b;'
              }">${vacinasList.length === 0 ? 'Sem registro' : overdueVac === 0 ? 'Em dia' : 'Pendente'}</span>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;font-size:9.5px;line-height:1.4;">
              <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Última Vacina Tomada</div>
              ${
                ultimaVacina
                  ? `<div style="font-weight:800;color:#0f172a;margin-top:2px;">${escapeHtmlText(ultimaVacina.nomeVacina)}</div>
                     <div style="color:#334155;">Data: <strong>${escapeHtmlText(formatDateBr(ultimaVacina.dataAplicacao))}</strong></div>
                     ${
                       ultimaVacina.lote || ultimaVacina.veterinario
                         ? `<div style="font-size:8.5px;color:#64748b;margin-top:1px;">${escapeHtmlText(
                             [ultimaVacina.lote ? `Lote: ${ultimaVacina.lote}` : '', ultimaVacina.veterinario ? `Vet.: ${ultimaVacina.veterinario}` : '']
                               .filter(Boolean)
                               .join(' • ')
                           )}</div>`
                         : ''
                     }`
                  : '<div style="color:#64748b;font-style:italic;margin-top:2px;">Nenhuma vacina registrada.</div>'
              }
            </div>
            <div style="background:#ffffff;border:1px solid ${proximaVacinaVencida ? '#fca5a5' : '#e2e8f0'};border-radius:8px;padding:6px 8px;font-size:9.5px;line-height:1.4;">
              <div style="font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;">Próxima Vacina</div>
              ${
                proximaVacina
                  ? `<div style="font-weight:800;color:${proximaVacinaVencida ? '#b91c1c' : '#047857'};margin-top:2px;">${escapeHtmlText(formatDateBr(proximaVacina.proximaDose))}</div>
                     <div style="font-size:9px;color:#334155;">${escapeHtmlText(proximaVacina.nomeVacina)}${proximaVacinaVencida ? ' (Vencida)' : ''}</div>`
                  : '<div style="color:#64748b;font-style:italic;margin-top:2px;">Não agendada.</div>'
              }
            </div>
          </div>

          <!-- Div 2: Último Atendimento Médico -->
          <div style="border:1px solid #a5f3fc;border-radius:10px;padding:9px 10px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <div style="font-size:9.5px;font-weight:900;color:#0e7490;text-transform:uppercase;">Último Atendimento Médico</div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:7px 8px;font-size:9.5px;line-height:1.45;flex:1;">
              ${
                ultimoMedico
                  ? `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:3px;">
                       <span style="font-weight:800;color:#0f172a;">${escapeHtmlText(ultimoMedico.tipoAtendimento)}</span>
                       <span style="font-size:8.5px;font-weight:800;color:#0e7490;font-family:monospace;white-space:nowrap;">${escapeHtmlText(formatDateBr(ultimoMedico.dataAtendimento))}</span>
                     </div>
                     ${
                       ultimoMedico.diagnostico
                         ? `<div style="color:#334155;"><span style="color:#64748b;font-weight:700;">Diag.:</span> ${escapeHtmlText(ultimoMedico.diagnostico)}</div>`
                         : ''
                     }
                     ${
                       ultimoMedico.conduta
                         ? `<div style="color:#334155;"><span style="color:#64748b;font-weight:700;">Conduta:</span> ${escapeHtmlText(ultimoMedico.conduta)}</div>`
                         : ''
                     }
                     ${
                       ultimoMedico.veterinario
                         ? `<div style="font-size:8.5px;color:#64748b;margin-top:3px;">Vet.: ${escapeHtmlText(ultimoMedico.veterinario)}</div>`
                         : ''
                     }`
                  : '<div style="color:#64748b;font-style:italic;">Nenhum atendimento médico registrado.</div>'
              }
            </div>
          </div>

          <!-- Div 3: Último Registro de Medicamentos -->
          <div style="border:1px solid #fde68a;border-radius:10px;padding:9px 10px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <div style="font-size:9.5px;font-weight:900;color:#b45309;text-transform:uppercase;">Último Registro de Medicamentos</div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:7px 8px;font-size:9.5px;line-height:1.45;flex:1;">
              ${
                ultimoMedicamento
                  ? `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:3px;">
                       <span style="font-weight:800;color:#0f172a;">${escapeHtmlText(ultimoMedicamento.produtoNome)}</span>
                       <span style="font-size:8.5px;font-weight:800;color:#b45309;font-family:monospace;white-space:nowrap;">${escapeHtmlText(formatDateTimeBr(ultimoMedicamento.dataHora))}</span>
                     </div>
                     <div style="color:#334155;">
                       Qtd.: <strong>${escapeHtmlText(String(ultimoMedicamento.quantidade))} ${escapeHtmlText(ultimoMedicamento.unidadeMedida || '')}</strong>${
                         ultimoMedicamento.dosagemAplicada ? ` • Dose: ${escapeHtmlText(ultimoMedicamento.dosagemAplicada)}` : ''
                       }${ultimoMedicamento.frequenciaAdministrada ? ` • ${escapeHtmlText(ultimoMedicamento.frequenciaAdministrada)}` : ''}
                     </div>
                     ${
                       ultimoMedicamento.motivo
                         ? `<div style="color:#475569;margin-top:2px;"><span style="color:#64748b;font-weight:700;">Motivo:</span> ${escapeHtmlText(ultimoMedicamento.motivo)}</div>`
                         : ''
                     }
                     ${
                       ultimoMedicamento.responsavelAplicacaoNome
                         ? `<div style="font-size:8.5px;color:#64748b;margin-top:3px;">Aplicado por: ${escapeHtmlText(ultimoMedicamento.responsavelAplicacaoNome)}</div>`
                         : ''
                     }`
                  : '<div style="color:#64748b;font-style:italic;">Nenhum medicamento ministrado registrado.</div>'
              }
            </div>
          </div>
        </div>
      </section>
    `;
  };

  const printDogsPages = (dogsToPrint: Cachorro[], detalhesMap?: Record<string, DetalhesCompletosCachorro | null>) => {
    if (dogsToPrint.length === 0) {
      onNotifyError('Selecione ao menos um animal para impressão.');
      return;
    }

    const pagesHtml = dogsToPrint
      .map(d => buildSingleAnimalPrintPageHtml(d, detalhesMap ? detalhesMap[d.id] : null))
      .join('');

    const title = buildStandardDocumentTitle(
      dogsToPrint.length === 1 ? `K9_${dogsToPrint[0].nome}` : `K9_Graficos_${dogsToPrint.length}_Animais`,
      'COC'
    );

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtmlText(title)}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; }
          .animal-print-page { page-break-after: always; break-after: page; }
          .animal-print-page:last-child { page-break-after: auto; break-after: auto; }
        </style>
      </head>
      <body>${pagesHtml}</body>
      </html>
    `;

    printDocumentInPage(html, title);
  };

  const handlePrintSelectedAnimal = async () => {
    if (!selectedDog) return;
    let currentDetalhes = detalhes;
    if (!currentDetalhes) {
      const r = await storage.getDetalhesCompletosCachorro(selectedDog.id);
      if (r.success && r.data) {
        currentDetalhes = r.data;
      }
    }
    printDogsPages([selectedDog], { [selectedDog.id]: currentDetalhes });
  };

  const buildIdentidadeFuncionalK9Html = async (
    dog: Cachorro,
    dogDetalhes?: DetalhesCompletosCachorro | null
  ): Promise<string> => {
    const { unitObj, deptObj, logoUrl: cocLogoUrl } = resolveCocUnitAndLogo(units, departments, dog, currentUser);
    const cocBadgeUrl = cocLogoUrl || getSafeImageUrl(deptObj?.logoUrl || DEFAULT_SYSTEM_LOGO) || '';
    const mgCoatOfArmsSvg = `<svg class="front-emblem" viewBox="0 0 64 68" xmlns="http://www.w3.org/2000/svg" aria-label="Brasão de Minas Gerais">
      <g fill="none" stroke="#cbd5e1" stroke-width="1.3" stroke-linecap="round">
        <path d="M18 48 C10 42 8 31 11 20 C13 14 16 10 21 7"/>
        <path d="M46 48 C54 42 56 31 53 20 C51 14 48 10 43 7"/>
      </g>
      <g fill="#4d7c0f" stroke="#d9f99d" stroke-width="0.45">
        <ellipse cx="12" cy="38" rx="3.4" ry="1.8" transform="rotate(-35 12 38)"/>
        <ellipse cx="10" cy="30" rx="3.5" ry="1.8" transform="rotate(-15 10 30)"/>
        <ellipse cx="11" cy="22" rx="3.4" ry="1.7" transform="rotate(10 11 22)"/>
        <ellipse cx="15" cy="14" rx="3.2" ry="1.6" transform="rotate(32 15 14)"/>
        <ellipse cx="52" cy="38" rx="3.4" ry="1.8" transform="rotate(35 52 38)"/>
        <ellipse cx="54" cy="30" rx="3.5" ry="1.8" transform="rotate(15 54 30)"/>
        <ellipse cx="53" cy="22" rx="3.4" ry="1.7" transform="rotate(-10 53 22)"/>
        <ellipse cx="49" cy="14" rx="3.2" ry="1.6" transform="rotate(-32 49 14)"/>
      </g>
      <polygon points="32,8 37.2,23.5 53.5,23.5 40.3,33.1 45.3,48.6 32,39 18.7,48.6 23.7,33.1 10.5,23.5 26.8,23.5" fill="#dc2626" stroke="#f8fafc" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="32" cy="30" r="6.6" fill="#991b1b" stroke="#fde68a" stroke-width="0.9"/>
      <path d="M29 33 L35 27 M29 27 L35 33" stroke="#f8fafc" stroke-width="1.3" stroke-linecap="round"/>
      <rect x="30.2" y="25.8" width="3.6" height="8.2" rx="1.4" fill="#f8fafc" stroke="#7f1d1d" stroke-width="0.6"/>
      <path d="M12 49 Q32 43 52 49 L50 56 Q32 50 14 56 Z" fill="#1e3a8a" stroke="#e2e8f0" stroke-width="1"/>
      <text x="32" y="52.4" text-anchor="middle" font-family="Arial,sans-serif" font-size="3.9" font-weight="900" fill="#ffffff" letter-spacing="0.3">MINAS GERAIS</text>
    </svg>`;
    const safeFoto = getSafeImageUrl(dog.fotoUrl);
    const todayIso = getTodayIsoBr();
    const baiaBoxText = formatBaiaBoxLabel(dog);
    const registroK9 = dog.microchip?.trim() || dog.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
    const docNumShort =
      (dog.microchip || dog.id).replace(/\D/g, '').slice(-4).padStart(4, '0') || 'K901';

    const vacinasList = [...(dogDetalhes?.vacinas || [])].sort((a, b) =>
      String(b.dataAplicacao || '').localeCompare(String(a.dataAplicacao || ''))
    );
    const overdueVac = vacinasList.filter(v => v.proximaDose && v.proximaDose < todayIso).length;
    const vacStatusLabel =
      vacinasList.length === 0 ? 'SEM REGISTRO' : overdueVac === 0 ? 'EM DIA' : 'PENDENTE';

    const vacinasComProxima = vacinasList.filter(v => Boolean(v.proximaDose));
    const proximaVacina =
      vacinasComProxima
        .filter(v => String(v.proximaDose) >= todayIso)
        .sort((a, b) => String(a.proximaDose || '').localeCompare(String(b.proximaDose || '')))[0] ||
      vacinasComProxima
        .filter(v => String(v.proximaDose) < todayIso)
        .sort((a, b) => String(b.proximaDose || '').localeCompare(String(a.proximaDose || '')))[0] ||
      null;

    const condutorShort =
      dog.tipoVinculo === 'SISTEMA'
        ? dog.usuarioInternoNome
          ? `${dog.usuarioInternoNome}${dog.usuarioInternoMasp ? ` (${formatMasp(dog.usuarioInternoMasp)})` : ''}`
          : 'COC / PCMG'
        : dog.responsavelExternoNome || 'Vínculo Externo';

    const condutor2Short =
      dog.tipoVinculo === 'SISTEMA' && dog.usuarioInterno2Nome ? dog.usuarioInterno2Nome : '';

    // Gera MRZ 3 linhas (30 caracteres cada) fiel ao padrão ICAO/PCMG vertical do verso
    const toMrzAscii = (val: string) =>
      val
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '<')
        .replace(/^<+|<+$/g, '');
    const padMrz = (val: string, len = 30) => (val + '<'.repeat(len)).slice(0, len);

    const birthYYMMDD =
      dog.dataNascimento && /^\d{4}-\d{2}-\d{2}/.test(dog.dataNascimento)
        ? `${dog.dataNascimento.slice(2, 4)}${dog.dataNascimento.slice(5, 7)}${dog.dataNascimento.slice(8, 10)}`
        : '000000';
    const expYYMMDD = `${todayIso.slice(2, 4)}${todayIso.slice(5, 7)}${todayIso.slice(8, 10)}`;
    const sexCode = String(dog.sexo || 'M').toUpperCase().startsWith('F') ? 'F' : 'M';
    const mrzLine1 = padMrz(`IDBRA${docNumShort}<<<<<<1`);
    const mrzLine2 = padMrz(`${birthYYMMDD}1${sexCode}${expYYMMDD}OBRA<<<<<<K9`);
    const mrzNameParts = [toMrzAscii(dog.nome || 'K9'), toMrzAscii(dog.raca || 'CANIL'), 'COC'].filter(Boolean).join('<<');
    const mrzLine3 = padMrz(mrzNameParts);

    // QR Code real escaneável com dados funcionais do semovente K9
    const qrPayload = [
      'PCMG - IDENTIDADE FUNCIONAL K9',
      `UNIDADE: ${unitObj?.name || 'COC'} / ${deptObj?.name || 'COE'}`,
      `NOME: ${dog.nome}`,
      `RACA: ${dog.raca || 'N/I'} (${dog.sexo || 'N/I'})`,
      `PELAGEM: ${dog.pelagem || 'N/I'}`,
      `MICROCHIP: ${registroK9}`,
      `NASCIMENTO: ${formatDateBr(dog.dataNascimento)}`,
      `BAIA/BOX: ${baiaBoxText}`,
      `CONDUTOR: ${condutorShort}`,
      `VACINACAO: ${vacStatusLabel}${proximaVacina?.proximaDose ? ` (Prox: ${formatDateBr(proximaVacina.proximaDose)})` : ''}`,
      `EXPEDICAO: ${formatDateBr(todayIso)}`
    ].join('\n');

    let qrSvg = '';
    try {
      qrSvg = await QRCode.toString(qrPayload, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
        color: { dark: '#141517', light: '#00000000' }
      });
    } catch {
      qrSvg = '<div style="font-size:6pt;color:#475569;text-align:center;">QR K9</div>';
    }

    const title = buildStandardDocumentTitle(`Identidade_Funcional_K9_${dog.nome}`, 'COC');

    const pawInkSvg = `
      <svg viewBox="0 0 64 64" width="22" height="22" fill="#18181b" opacity="0.88" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="16" cy="24" rx="5.6" ry="7.6" transform="rotate(-18 16 24)"/>
        <ellipse cx="27" cy="15" rx="5.6" ry="8" transform="rotate(-6 27 15)"/>
        <ellipse cx="39" cy="15" rx="5.6" ry="8" transform="rotate(6 39 15)"/>
        <ellipse cx="49" cy="24" rx="5.6" ry="7.6" transform="rotate(18 49 24)"/>
        <path d="M32 27.5c-9 0-15.8 7-15.8 13.8 0 5 3.6 8.2 8.1 8.2 2.9 0 5.1-1.3 7.7-1.3s4.8 1.3 7.7 1.3c4.5 0 8.1-3.2 8.1-8.2 0-6.8-6.8-13.8-15.8-13.8z"/>
      </svg>
    `;

    const dogPlaceholderSvg = `
      <svg viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="#4b5563" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 22l-5-10 10 4h18l10-4-5 10v14c0 9-6.5 16-14 16s-14-7-14-16V22z"/>
        <circle cx="25" cy="30" r="2" fill="#4b5563"/>
        <circle cx="39" cy="30" r="2" fill="#4b5563"/>
        <path d="M29 37h6l-3 3.5L29 37z" fill="#4b5563"/>
      </svg>
    `;

    // Marca d'água central vetorial (Brasão / Estrela de Armas em guilhoche prateado)
    const armsWatermarkSvg = `
      <svg viewBox="0 0 200 200" width="142" height="142" fill="none" stroke="#475569" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.22" stroke-width="1.2">
          <circle cx="100" cy="100" r="82" stroke-dasharray="3 2"/>
          <circle cx="100" cy="100" r="72"/>
          <circle cx="100" cy="100" r="56" stroke-dasharray="2 2"/>
          <polygon points="100,18 121,72 178,72 132,106 149,162 100,128 51,162 68,106 22,72 79,72" stroke-width="1.6"/>
          <polygon points="100,34 116,76 160,76 124,102 138,144 100,118 62,144 76,102 40,76 84,76" stroke-width="0.9"/>
          <circle cx="100" cy="100" r="26" stroke-width="1.4"/>
          <circle cx="100" cy="100" r="18" stroke-dasharray="1.5 1.5"/>
          <path d="M26 118 Q100 158 174 118" stroke-width="1.4"/>
          <path d="M34 128 Q100 166 166 128" stroke-width="0.9"/>
        </g>
      </svg>
    `;

    // Selo tátil óptico (canto inferior esquerdo do verso, igual à referência)
    const opticalPatchSvg = `
      <svg viewBox="0 0 48 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="optGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3f3f46"/>
            <stop offset="50%" stop-color="#18181b"/>
            <stop offset="100%" stop-color="#52525b"/>
          </linearGradient>
          <pattern id="optWave" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 4 Q2 0 4 4 T8 4" fill="none" stroke="#d4d4d8" stroke-width="0.7" opacity="0.65"/>
            <path d="M0 8 Q2 4 4 8 T8 8" fill="none" stroke="#a1a1aa" stroke-width="0.6" opacity="0.5"/>
          </pattern>
        </defs>
        <rect width="48" height="40" rx="5" fill="url(#optGrad)"/>
        <rect x="2" y="2" width="44" height="36" rx="4" fill="url(#optWave)"/>
        <rect x="1" y="1" width="46" height="38" rx="4.5" fill="none" stroke="#a1a1aa" stroke-width="0.8"/>
      </svg>
    `;

    // Faixa decorativa inferior em guilhoche (base da frente)
    const bottomGuillocheSvg = `
      <svg viewBox="0 0 220 34" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="gNet" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 5 Q5 0 10 5 Q5 10 0 5 Z" fill="none" stroke="#18181b" stroke-width="0.65" opacity="0.6"/>
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="#27272a" stroke-width="0.35" opacity="0.45"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="220" height="34" fill="url(#gNet)"/>
        <path d="M0 2 H220 M0 4.5 H220 M0 32 H220" stroke="#18181b" stroke-width="0.9"/>
      </svg>
    `;

    // Rubrica estilizada institucional para o rodapé do verso
    const authoritySigSvg = `
      <svg viewBox="0 0 140 34" width="24mm" height="6.2mm" fill="none" stroke="#111827" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 24 C28 10, 48 6, 56 14 C62 20, 44 26, 36 22 C44 14, 72 8, 92 14 C104 17, 94 25, 86 21 C94 18, 114 14, 126 17"/>
        <path d="M30 27 C52 24, 82 23, 116 25" stroke-width="0.8" opacity="0.7"/>
      </svg>
    `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
      color: #111827;
    }
    .sheet {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 6mm;
    }
    .sheet-header {
      width: 120mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5pt;
      color: #475569;
      margin-bottom: 6mm;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2.5mm;
    }
    .card-assembly {
      position: relative;
      padding: 4.5mm;
    }
    /* Marcas de corte externas */
    .crop {
      position: absolute;
      width: 3.5mm;
      height: 3.5mm;
      border-color: #64748b;
      border-style: solid;
      border-width: 0;
    }
    .crop-tl { top: 0; left: 0; border-top-width: 0.6pt; border-left-width: 0.6pt; }
    .crop-tr { top: 0; right: 0; border-top-width: 0.6pt; border-right-width: 0.6pt; }
    .crop-bl { bottom: 0; left: 0; border-bottom-width: 0.6pt; border-left-width: 0.6pt; }
    .crop-br { bottom: 0; right: 0; border-bottom-width: 0.6pt; border-right-width: 0.6pt; }
    .fold-label {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      font-size: 5.5pt;
      font-weight: 800;
      color: #64748b;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .fold-label.top { top: 0.4mm; }
    .fold-label.bottom { bottom: 0.4mm; }

    /* Par Frente + Verso lado a lado (CR80 Vertical: 54mm × 85.6mm cada face) */
    .card-pair {
      display: flex;
      width: 108mm;
      height: 85.6mm;
      border: 0.7pt solid #475569;
      border-radius: 3mm;
      overflow: hidden;
      background: #ffffff;
    }
    .face {
      position: relative;
      width: 54mm;
      height: 85.6mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ==================== FRENTE (Referência 1) ==================== */
    .face.front {
      border-right: 0.9pt dashed #64748b;
      background:
        linear-gradient(
          180deg,
          #090a0c 0%,
          #101215 21%,
          #202328 29%,
          #8f959c 36%,
          #d7dadd 44%,
          #e3e6e9 72%,
          #cfd4d9 92%,
          #b8bec5 100%
        );
    }
    /* Linhas finas de segurança laterais em guilhoche */
    .front-side-pattern {
      position: absolute;
      top: 19mm;
      bottom: 8.5mm;
      width: 2.2mm;
      z-index: 1;
      opacity: 0.45;
      background-image: repeating-linear-gradient(
        0deg,
        #18181b 0px,
        #18181b 0.8px,
        transparent 0.8px,
        transparent 2.4px
      );
    }
    .front-side-pattern.left { left: 0.8mm; }
    .front-side-pattern.right { right: 0.8mm; }

    .front-watermark {
      position: absolute;
      top: 32mm;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1;
      pointer-events: none;
    }

    .front-header {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      gap: 1.8mm;
      padding: 2.4mm 2.6mm 1.5mm;
      height: 17.5mm;
    }
    .front-emblem {
      width: 11mm;
      height: 11.5mm;
      object-fit: contain;
      flex-shrink: 0;
      filter: drop-shadow(0 0.5px 1.2px rgba(0, 0, 0, 0.7));
    }
    .front-titles {
      flex: 1;
      text-align: center;
      color: #ffffff;
      line-height: 1.08;
    }
    .ft-rep {
      font-size: 4.3pt;
      font-weight: 700;
      letter-spacing: 0.25px;
      color: #e5e7eb;
    }
    .ft-mg {
      font-size: 6.1pt;
      font-weight: 900;
      letter-spacing: 0.2px;
      color: #f8fafc;
      margin-top: 0.3mm;
    }
    .ft-pc {
      font-size: 9.6pt;
      font-weight: 900;
      letter-spacing: 0.35px;
      color: #ffffff;
      margin-top: 0.2mm;
    }
    .ft-id {
      font-size: 5pt;
      font-weight: 800;
      letter-spacing: 0.4px;
      color: #e2e8f0;
      margin-top: 0.3mm;
    }

    /* Faixa Foto + Distintivo Dourado PCMG */
    .front-media-row {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6mm 2.8mm 0;
      gap: 2mm;
      height: 26mm;
    }
    .photo-guilloche-wrap {
      padding: 1.1mm;
      border-radius: 2mm;
      border: 0.6pt solid rgba(255, 255, 255, 0.72);
      box-shadow:
        0 0 0 0.7pt rgba(255, 255, 255, 0.35),
        0 0 0 1.4pt rgba(148, 163, 184, 0.45);
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }
    .photo-box {
      width: 19.6mm;
      height: 23.6mm;
      border-radius: 1.2mm;
      overflow: hidden;
      background: #e2e8f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .photo-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gold-shield-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 25mm;
    }
    .gold-shield-img {
      height: 24.4mm;
      max-width: 22.5mm;
      object-fit: contain;
      filter: drop-shadow(0 0 0.7px #ffffff) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
    }

    /* Dados da Frente (tipografia direta sobre o fundo prateado, igual à referência) */
    .front-fields {
      position: relative;
      z-index: 3;
      flex: 1;
      padding: 1.2mm 3.6mm 0.4mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #0b0c0e;
    }
    .ff-block {
      line-height: 1.12;
    }
    .ff-lbl {
      font-size: 4.8pt;
      font-weight: 600;
      color: #1f2937;
      text-transform: uppercase;
      letter-spacing: 0.15px;
    }
    .ff-val {
      font-size: 6.4pt;
      font-weight: 800;
      color: #09090b;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ff-val.name-val {
      font-size: 7.4pt;
      font-weight: 900;
      letter-spacing: 0.15px;
    }
    .ff-val.cargo-red {
      font-size: 6.6pt;
      font-weight: 900;
      color: #991b1b;
      letter-spacing: 0.2px;
    }
    .ff-val.sub-cargo {
      font-size: 5.6pt;
      font-weight: 800;
      color: #18181b;
    }
    .ff-row-2 {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 2mm;
    }

    /* Área Assinatura / Pata K9 com marca d'água PCMG */
    .front-sig-area {
      position: relative;
      z-index: 3;
      padding: 0 3.6mm 0.7mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      height: 9.2mm;
    }
    .pcmg-ghost {
      position: absolute;
      top: 0.2mm;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11pt;
      font-weight: 900;
      letter-spacing: 4px;
      color: rgba(51, 65, 85, 0.2);
      user-select: none;
      white-space: nowrap;
    }
    .paw-ink-wrap {
      position: relative;
      z-index: 2;
      line-height: 0;
      margin-bottom: 0.3mm;
    }
    .sig-caption {
      position: relative;
      z-index: 2;
      font-size: 4.3pt;
      font-weight: 800;
      color: #111827;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }

    /* Rodapé Guilhoche com pílula branca central */
    .front-bottom-band {
      position: relative;
      z-index: 3;
      height: 7.4mm;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .front-bottom-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
    }
    .valid-pill {
      position: relative;
      z-index: 2;
      background: #f8fafc;
      border: 0.6pt solid #334155;
      border-radius: 3mm;
      padding: 0.7mm 2.8mm;
      font-size: 4.4pt;
      font-weight: 900;
      color: #09090b;
      letter-spacing: 0.2px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* ==================== VERSO (Referência 2) ==================== */
    .face.back {
      background: linear-gradient(155deg, #eceee9 0%, #e4e7e2 48%, #d9ddd7 100%);
      flex-direction: row;
    }
    .back-shield-ghost {
      position: absolute;
      top: 7mm;
      left: 7mm;
      width: 26mm;
      height: 30mm;
      object-fit: contain;
      opacity: 0.085;
      filter: grayscale(100%);
      pointer-events: none;
      z-index: 0;
    }
    .back-left {
      position: relative;
      z-index: 2;
      width: 39.2mm;
      height: 100%;
      padding: 3.2mm 1.6mm 2.4mm 3.2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .back-clause {
      font-size: 3.85pt;
      font-weight: 800;
      color: #18181b;
      line-height: 1.24;
      text-align: justify;
      text-transform: uppercase;
      letter-spacing: 0.05px;
    }
    .back-meta {
      display: flex;
      flex-direction: column;
      gap: 1.1mm;
      margin-top: 1mm;
    }
    .bm-row-2 {
      display: grid;
      grid-template-columns: 0.85fr 1.15fr;
      gap: 1.4mm;
    }
    .bm-lbl {
      font-size: 4.3pt;
      font-weight: 600;
      color: #27272a;
      text-transform: uppercase;
      line-height: 1.05;
    }
    .bm-val {
      font-size: 5.4pt;
      font-weight: 900;
      color: #09090b;
      text-transform: uppercase;
      line-height: 1.14;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .back-qr-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 1.2mm 0 0.8mm;
    }
    .back-qr-box {
      width: 21.5mm;
      height: 21.5mm;
      padding: 0.8mm;
      background: rgba(255, 255, 255, 0.35);
      border-radius: 0.8mm;
    }
    .back-qr-box svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Trio de Segurança abaixo do QR (Selo Tátil + PC Roxo + Mini Foto Fantasma) */
    .security-trio {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.4mm;
      padding: 0 0.8mm;
    }
    .sec-optical {
      width: 10.8mm;
      height: 9mm;
      flex-shrink: 0;
    }
    .sec-pc-badge {
      width: 6.4mm;
      height: 10.6mm;
      border-radius: 1.2mm;
      background: linear-gradient(180deg, #8e3a65 0%, #6d264b 100%);
      border: 0.5pt solid #4c1733;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 0.94;
      font-weight: 900;
      font-size: 8.6pt;
      flex-shrink: 0;
      box-shadow: inset 0 0 2px rgba(255, 255, 255, 0.25);
    }
    .sec-ghost-photo {
      width: 8mm;
      height: 9.8mm;
      overflow: hidden;
      border-radius: 0.8mm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sec-ghost-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: grayscale(100%) contrast(88%) brightness(108%);
      opacity: 0.42;
    }

    /* Faixa em relevo PCMGPCMGPCMG */
    .emboss-strip {
      text-align: center;
      font-size: 6pt;
      font-weight: 900;
      letter-spacing: 0.6px;
      color: rgba(100, 116, 139, 0.28);
      text-shadow: 0.4px 0.4px 0 rgba(255, 255, 255, 0.75);
      line-height: 1;
      margin-top: 0.5mm;
      white-space: nowrap;
      overflow: hidden;
    }

    /* Assinatura Autoridade no rodapé do verso */
    .back-authority {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      line-height: 1.12;
      margin-top: 0.2mm;
    }
    .auth-sig {
      margin-bottom: -1.4mm;
    }
    .auth-name {
      font-size: 4.3pt;
      font-weight: 900;
      color: #09090b;
      text-transform: uppercase;
    }
    .auth-role {
      font-size: 4.2pt;
      font-weight: 800;
      color: #18181b;
      text-transform: uppercase;
    }

    /* Faixa MRZ vertical à direita (igual à referência) */
    .back-mrz-col {
      position: relative;
      z-index: 2;
      width: 14.8mm;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .mrz-rotated {
      transform: rotate(-90deg);
      transform-origin: center center;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
      font-family: "Courier New", Courier, monospace;
      font-size: 7.4pt;
      font-weight: 800;
      color: #111827;
      letter-spacing: 0.95px;
      line-height: 1;
      white-space: nowrap;
    }

    .instructions {
      width: 120mm;
      margin-top: 6mm;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 3.2mm 4mm;
      font-size: 7.8pt;
      color: #334155;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="sheet-header">
      <div><strong>IDENTIDADE FUNCIONAL K9</strong> — ${escapeHtmlText(dog.nome.toUpperCase())}</div>
      <div>Padrão CR80 Vertical: <strong>54 × 85,6 mm</strong></div>
    </div>

    <div class="card-assembly">
      <div class="crop crop-tl"></div>
      <div class="crop crop-tr"></div>
      <div class="crop crop-bl"></div>
      <div class="crop crop-br"></div>
      <div class="fold-label top">▼ DOBRAR AQUI ▼</div>
      <div class="fold-label bottom">▲ DOBRAR AQUI ▲</div>

      <div class="card-pair">
        <!-- ======================= FRENTE ======================= -->
        <div class="face front">
          <div class="front-side-pattern left"></div>
          <div class="front-side-pattern right"></div>
          <div class="front-watermark">${armsWatermarkSvg}</div>

          <div class="front-header">
            ${mgCoatOfArmsSvg}
            <div class="front-titles">
              <div class="ft-rep">REPÚBLICA FEDERATIVA DO BRASIL</div>
              <div class="ft-mg">ESTADO DE MINAS GERAIS</div>
              <div class="ft-pc">POLÍCIA CIVIL</div>
              <div class="ft-id">IDENTIDADE FUNCIONAL K9</div>
            </div>
          </div>

          <div class="front-media-row">
            <div class="photo-guilloche-wrap">
              <div class="photo-box">
                ${
                  safeFoto
                    ? `<img src="${escapeHtmlText(safeFoto)}" alt="Foto 3x4 ${escapeHtmlText(dog.nome)}" />`
                    : `${dogPlaceholderSvg}<span style="font-size:4.6pt;font-weight:800;color:#4b5563;margin-top:0.6mm;">FOTO 3×4</span>`
                }
              </div>
            </div>
            <div class="gold-shield-wrap">
              ${cocBadgeUrl ? `<img class="gold-shield-img" src="${escapeHtmlText(cocBadgeUrl)}" alt="Logo Unidade COC" />` : ''}
            </div>
          </div>

          <div class="front-fields">
            <div class="ff-block">
              <div class="ff-lbl">Nome</div>
              <div class="ff-val name-val">${escapeHtmlText(dog.nome)}</div>
            </div>

            <div class="ff-block">
              <div class="ff-lbl">Cargo / Função</div>
              <div class="ff-val cargo-red">CÃO POLICIAL K9</div>
              <div class="ff-val sub-cargo">${escapeHtmlText(dog.especialidade || unitObj?.name || 'COC • COE')}</div>
            </div>

            <div class="ff-block">
              <div class="ff-lbl">Microchip / Registro</div>
              <div class="ff-val">${escapeHtmlText(registroK9)}</div>
            </div>

            <div class="ff-row-2">
              <div class="ff-block">
                <div class="ff-lbl">Raça</div>
                <div class="ff-val">${escapeHtmlText(dog.raca || 'Não informada')}</div>
              </div>
              <div class="ff-block">
                <div class="ff-lbl">Sexo / Pelagem</div>
                <div class="ff-val">${escapeHtmlText(`${dog.sexo || '—'}${dog.pelagem ? ` • ${dog.pelagem}` : ''}`)}</div>
              </div>
            </div>
          </div>

          <div class="front-sig-area">
            <div class="pcmg-ghost">PCMG</div>
            <div class="paw-ink-wrap">${pawInkSvg}</div>
            <div class="sig-caption">ASSINATURA / PATA DO K9</div>
          </div>

          <div class="front-bottom-band">
            <div class="front-bottom-bg">${bottomGuillocheSvg}</div>
            <div class="valid-pill">VÁLIDA EM TODO O TERRITÓRIO NACIONAL</div>
          </div>
        </div>

        <!-- ======================= VERSO (FUNDO) ======================= -->
        <div class="face back">
          ${cocBadgeUrl ? `<img class="back-shield-ghost" src="${escapeHtmlText(cocBadgeUrl)}" alt="" />` : ''}

          <div class="back-left">
            <div class="back-clause">
              O SEMOVENTE K9 INTEGRA O EFETIVO OPERACIONAL DA POLÍCIA CIVIL DE MINAS GERAIS (${escapeHtmlText((unitObj?.name || 'COC').toUpperCase())}), COM FRANCO ACESSO A LOCAIS DE OPERAÇÃO E FISCALIZAÇÃO POLICIAL QUANDO CONDUZIDO POR POLICIAL CIVIL.
            </div>

            <div class="back-meta">
              <div class="bm-row-2">
                <div>
                  <div class="bm-lbl">Nº Doc</div>
                  <div class="bm-val">${escapeHtmlText(docNumShort)}</div>
                </div>
                <div>
                  <div class="bm-lbl">Baia / Box</div>
                  <div class="bm-val">${escapeHtmlText(baiaBoxText)}</div>
                </div>
              </div>

              <div>
                <div class="bm-lbl">Data de Nasc.</div>
                <div class="bm-val">${escapeHtmlText(formatDateBr(dog.dataNascimento))} (${escapeHtmlText(calculateAgeText(dog.dataNascimento))})</div>
              </div>

              <div>
                <div class="bm-lbl">Condutor / Unidade</div>
                <div class="bm-val">${escapeHtmlText(condutorShort)}</div>
                ${condutor2Short ? `<div class="bm-val" style="font-size:4.8pt;color:#3f3f46;">2º: ${escapeHtmlText(condutor2Short)}</div>` : ''}
              </div>

              <div class="bm-row-2">
                <div>
                  <div class="bm-lbl">Vacinação</div>
                  <div class="bm-val" style="color:${vacStatusLabel === 'EM DIA' ? '#166534' : vacStatusLabel === 'PENDENTE' ? '#991b1b' : '#27272a'};">${vacStatusLabel}</div>
                </div>
                <div>
                  <div class="bm-lbl">Data de Exp.</div>
                  <div class="bm-val">${escapeHtmlText(formatDateBr(todayIso))}</div>
                </div>
              </div>
            </div>

            <div class="back-qr-wrap">
              <div class="back-qr-box">${qrSvg}</div>
            </div>

            <div class="security-trio">
              <div class="sec-optical">${opticalPatchSvg}</div>
              <div class="sec-pc-badge"><span>P</span><span>C</span></div>
              <div class="sec-ghost-photo">
                ${
                  safeFoto
                    ? `<img src="${escapeHtmlText(safeFoto)}" alt="" />`
                    : `<div style="opacity:0.35;">${dogPlaceholderSvg}</div>`
                }
              </div>
            </div>

            <div class="emboss-strip">PCMGPCMGPCMGPCMG</div>

            <div class="back-authority">
              <div class="auth-sig">${authoritySigSvg}</div>
              <div class="auth-name">${escapeHtmlText(unitObj?.name || 'COORDENAÇÃO DE OPERAÇÕES COM CÃES')}</div>
              <div class="auth-role">POLÍCIA CIVIL</div>
              <div class="auth-role">DE MINAS GERAIS</div>
            </div>
          </div>

          <div class="back-mrz-col">
            <div class="mrz-rotated">
              <div>${escapeHtmlText(mrzLine1)}</div>
              <div>${escapeHtmlText(mrzLine2)}</div>
              <div>${escapeHtmlText(mrzLine3)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="instructions">
      <strong>Instruções para impressão e plastificação:</strong>
      Imprima com escala <strong>100% (Tamanho Real)</strong> em papel 180g ou fotográfico fosco, recorte seguindo as marcas externas,
      dobre na <strong>linha tracejada central</strong> unindo Frente e Verso (tamanho final CR80: <strong>54 × 85,6 mm</strong>)
      e plastifique em envelope polaseal padrão crachá/RG (59 × 86 mm ou 60 × 90 mm).
    </div>
  </div>
</body>
</html>`;
  };

  const handlePrintIdentidadeFuncionalK9 = async () => {
    if (!selectedDog) return;
    let currentDetalhes = detalhes;
    if (!currentDetalhes) {
      const r = await storage.getDetalhesCompletosCachorro(selectedDog.id);
      if (r.success && r.data) {
        currentDetalhes = r.data;
      }
    }
    const title = buildStandardDocumentTitle(`Identidade_Funcional_K9_${selectedDog.nome}`, 'COC');
    const html = await buildIdentidadeFuncionalK9Html(selectedDog, currentDetalhes);
    printDocumentInPage(html, title);
  };

  const handleOpenMultiPrint = () => {
    setMultiPrintSelectedIds(visibleDogs.map(d => d.id));
    setShowMultiPrintModal(true);
  };

  const handleConfirmMultiPrint = async () => {
    const selected = visibleDogs.filter(d => multiPrintSelectedIds.includes(d.id));
    if (selected.length === 0) {
      onNotifyError('Selecione pelo menos um animal para imprimir.');
      return;
    }
    const detalhesMap: Record<string, DetalhesCompletosCachorro | null> = {};
    if (selectedDog && detalhes) {
      detalhesMap[selectedDog.id] = detalhes;
    }
    await Promise.all(
      selected.map(async d => {
        if (detalhesMap[d.id]) return;
        const r = await storage.getDetalhesCompletosCachorro(d.id);
        detalhesMap[d.id] = r.success && r.data ? r.data : null;
      })
    );
    setShowMultiPrintModal(false);
    printDogsPages(selected, detalhesMap);
  };

  // Interactive SVG Chart geometry
  const chartWidth = 920;
  const chartHeight = 340;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 34;
  const padBottom = 112;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const hoveredBar = useMemo(() => {
    if (!selectedDogStats || !hoveredTopic) return null;
    return selectedDogStats.bars.find(b => b.topico === hoveredTopic) || null;
  }, [selectedDogStats, hoveredTopic]);

  const safeSelectedFoto = getSafeImageUrl(selectedDog?.fotoUrl);

  return (
    <div className="space-y-4">
      {/* Barra superior de resumo e ações de impressão */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-amber-400 uppercase tracking-wide flex items-center space-x-2">
            <Dog className="w-4 h-4" />
            <span>Painel de Animais K9 — Prontuário e Gráficos de Treinamento</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {canViewAllAnimals
              ? `Visualizando todos os animais K9 cadastrados (${visibleDogs.length}).`
              : `Visualizando somente os animais K9 vinculados ao seu perfil (${visibleDogs.length}).`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedDog && (
            <>
              <button
                type="button"
                onClick={handlePrintSelectedAnimal}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center space-x-1.5 shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Gráfico ({selectedDog.nome})</span>
              </button>
              <button
                type="button"
                onClick={handlePrintIdentidadeFuncionalK9}
                className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition flex items-center space-x-1.5 shadow"
                title="Imprimir Carteira de Identidade Funcional K9 (Frente e Verso pronta para recortar e plastificar)"
              >
                <IdCard className="w-4 h-4" />
                <span>Identidade Funcional K9</span>
              </button>
            </>
          )}
          {visibleDogs.length > 1 && (
            <button
              type="button"
              onClick={handleOpenMultiPrint}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold text-xs transition flex items-center space-x-1.5"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>Imprimir Vários Animais (1 por página)</span>
            </button>
          )}
        </div>
      </div>

      {visibleDogs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <Dog className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Nenhum animal K9 disponível para exibição.</p>
          <p className="text-xs text-slate-500">
            {canViewAllAnimals
              ? 'Cadastre animais no módulo Veterinário / Canil para acompanhá-los aqui.'
              : 'Você ainda não possui animais vinculados como condutor no sistema.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Coluna Esquerda: Lista de Animais */}
          <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3 h-fit">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={animalSearch}
                onChange={e => setAnimalSearch(e.target.value)}
                placeholder="Buscar cão, raça ou condutor..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredDogs.map(dog => {
                const isSelected = dog.id === selectedDog?.id;
                const thumb = getSafeImageUrl(dog.fotoUrl);
                const statsPreview = computeDogTrainingStats(dog, relatoriosTreinamento, activeTopicos);
                return (
                  <button
                    key={dog.id}
                    type="button"
                    onClick={() => setSelectedDogId(dog.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-amber-100 shadow'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="w-9 h-12 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
                      {thumb ? (
                        <img src={thumb} alt={dog.nome} className="w-full h-full object-cover" />
                      ) : (
                        <Dog className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-xs truncate uppercase">{dog.nome}</div>
                      <div className="text-[11px] text-slate-400 truncate">{dog.raca || 'Raça não informada'}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          {dog.usuarioInternoNome || dog.responsavelExternoNome || 'Sem condutor'}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                          {statsPreview.totalTreinos} tr.
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Dossiê do Animal + Gráfico Interativo */}
          {selectedDog && selectedDogStats && (
            <div className="xl:col-span-9 space-y-4">
              {/* 1. Cartão Principal: Foto 3x4 + Dados do Animal + Condutor + Histórico */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col md:flex-row gap-5">
                  {/* Foto 3x4 estilo identidade */}
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="w-28 h-[149px] aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 border-2 border-amber-500/40 shadow-lg flex flex-col items-center justify-center relative">
                      {safeSelectedFoto ? (
                        <img
                          src={safeSelectedFoto}
                          alt={`Foto 3x4 de ${selectedDog.nome}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <Dog className="w-10 h-10 text-slate-600" />
                          <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Foto 3x4</span>
                        </>
                      )}
                    </div>
                    <span className="mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedDog.status}
                    </span>
                  </div>

                  {/* Dados detalhados */}
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">
                          {selectedDog.nome}
                        </h3>
                        <p className="text-xs text-amber-300 font-semibold">
                          {selectedDog.raca || 'Raça não informada'}
                          {selectedDog.especialidade ? ` • ${selectedDog.especialidade}` : ''}
                        </p>
                      </div>

                      {/* Indicador Vacinas em Dia */}
                      {vacinaStatus.status === 'EM_DIA' && (
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-black">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Vacinas em Dia</span>
                        </span>
                      )}
                      {vacinaStatus.status === 'ATRASADA' && (
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-black">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span>{vacinaStatus.overdueCount} Reforço(s) Vacinal(is) Pendente(s)</span>
                        </span>
                      )}
                      {vacinaStatus.status === 'SEM_REGISTRO' && (
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold">
                          <Syringe className="w-3.5 h-3.5" />
                          <span>Sem vacinas registradas</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Cor / Pelagem</div>
                        <div className="font-bold text-slate-200 mt-0.5">{selectedDog.pelagem || 'Não informada'}</div>
                      </div>
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-amber-400" />
                          <span>Data de Nascimento</span>
                        </div>
                        <div className="font-bold text-slate-200 mt-0.5">{formatDateBr(selectedDog.dataNascimento)}</div>
                      </div>
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Idade</div>
                        <div className="font-bold text-amber-300 mt-0.5">{calculateAgeText(selectedDog.dataNascimento)}</div>
                      </div>
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Hash className="w-3 h-3 text-cyan-400" />
                          <span>Microchip</span>
                        </div>
                        <div className="font-mono font-bold text-slate-200 mt-0.5 truncate">
                          {selectedDog.microchip || 'Não informado'}
                        </div>
                      </div>
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Home className="w-3 h-3 text-emerald-400" />
                          <span>Baia / Box</span>
                        </div>
                        <div className="font-bold text-emerald-300 mt-0.5 truncate" title={formatBaiaBoxLabel(selectedDog)}>
                          {formatBaiaBoxLabel(selectedDog)}
                        </div>
                      </div>
                    </div>

                    {/* Condutor(es) + Botão de Histórico de Condutores na frente do nome */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Condutor(es) Atual(is)</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-slate-100">
                            {selectedDog.tipoVinculo === 'SISTEMA'
                              ? [
                                  selectedDog.usuarioInternoNome
                                    ? `${selectedDog.usuarioInternoNome}${
                                        selectedDog.usuarioInternoMasp
                                          ? ` (${formatMasp(selectedDog.usuarioInternoMasp)})`
                                          : ''
                                      }`
                                    : null,
                                  selectedDog.usuarioInterno2Nome
                                    ? `${selectedDog.usuarioInterno2Nome}${
                                        selectedDog.usuarioInterno2Masp
                                          ? ` (${formatMasp(selectedDog.usuarioInterno2Masp)})`
                                          : ''
                                      }`
                                    : null
                                ]
                                  .filter(Boolean)
                                  .join('  •  ') || 'Sem condutor vinculado'
                              : `${selectedDog.responsavelExternoNome || 'Externo'}${
                                  selectedDog.responsavelExternoOrgao ? ` (${selectedDog.responsavelExternoOrgao})` : ''
                                }`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCondutoresHistoryModal(true)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold text-[11px] transition"
                            title="Ver histórico completo de condutores vinculados a este animal"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Histórico de Condutores</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Gráfico Interativo de Tópicos de Treinamento */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-100 uppercase flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4 text-amber-400" />
                      <span>Gráfico de Tópicos de Treinamento — {selectedDog.nome}</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Total de treinamentos do animal:{' '}
                      <strong className="text-amber-300 font-mono">{selectedDogStats.totalTreinos}</strong> • Passe o
                      mouse sobre as barras para detalhes interativos.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                      Aptidão em
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sky-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />
                      Regular
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-amber-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                      Sugestão de Treinamento
                    </span>
                  </div>
                </div>

                {/* Cards de Aptidão e Sugestão */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/35 rounded-xl p-3.5 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-black text-emerald-400 uppercase tracking-wide">
                        Aptidão em (Mais Treinado)
                      </div>
                      {selectedDogStats.aptidaoTopicos.length > 0 ? (
                        <>
                          <div className="text-sm font-black text-emerald-100 mt-0.5">
                            {selectedDogStats.aptidaoTopicos.join(' • ')}
                          </div>
                          <div className="text-[11px] text-emerald-300/80 mt-0.5">
                            {selectedDogStats.maxCount}{' '}
                            {selectedDogStats.maxCount === 1 ? 'treino registrado' : 'treinos registrados'}
                            {selectedDogStats.totalTreinos > 0
                              ? ` (${Math.round((selectedDogStats.maxCount / selectedDogStats.totalTreinos) * 100)}% dos treinos do animal)`
                              : ''}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5 italic">
                          Nenhum tópico treinado registrado ainda para este animal.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl p-3.5 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-black text-amber-400 uppercase tracking-wide">
                        Sugestão de Treinamento (Menor Índice)
                      </div>
                      {selectedDogStats.sugestaoTopicos.length > 0 ? (
                        <>
                          <div className="text-sm font-black text-amber-100 mt-0.5 break-words">
                            {formatSugestaoTopicos(selectedDogStats.sugestaoTopicos, ' • ')}
                          </div>
                          <div className="text-[11px] text-amber-300/80 mt-0.5">
                            {selectedDogStats.minCount}{' '}
                            {selectedDogStats.minCount === 1 ? 'treino registrado' : 'treinos registrados'} — priorizar nos
                            próximos treinamentos
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5 italic">Sem tópicos configurados.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de Tooltip Interativo */}
                <div className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {hoveredBar ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-black text-white uppercase">{hoveredBar.topico}</span>
                        <span className="text-slate-400">—</span>
                        <span className="text-slate-200 font-semibold">
                          {hoveredBar.count} {hoveredBar.count === 1 ? 'vez treinada' : 'vezes treinadas'} de{' '}
                          {selectedDogStats.totalTreinos} treino(s) ({hoveredBar.pctOfTrainings}%)
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                          selectedDogStats.maxCount > 0 && hoveredBar.count === selectedDogStats.maxCount
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : hoveredBar.count === selectedDogStats.minCount
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {selectedDogStats.maxCount > 0 && hoveredBar.count === selectedDogStats.maxCount
                          ? 'Aptidão em'
                          : hoveredBar.count === selectedDogStats.minCount
                          ? 'Sugestão de Treinamento'
                          : 'Em Evolução'}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500">
                      Passe o cursor ou toque em qualquer coluna do gráfico para inspecionar o desempenho por tópico.
                    </span>
                  )}
                </div>

                {/* Gráfico SVG Interativo */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 overflow-x-auto">
                  {selectedDogStats.bars.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500">
                      Nenhum tópico de treinamento cadastrado.
                    </div>
                  ) : (
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full min-w-[680px] h-auto select-none"
                      role="img"
                      aria-label={`Gráfico de tópicos de treinamento de ${selectedDog.nome}`}
                    >
                      {(() => {
                        const maxVal = Math.max(selectedDogStats.maxCount, 1);
                        const stepCount = Math.min(maxVal, 5);
                        const gridTicks = Array.from({ length: stepCount + 1 }, (_, i) =>
                          Math.round((maxVal / stepCount) * i)
                        );
                        const slotW = innerW / selectedDogStats.bars.length;
                        const barW = Math.max(16, Math.min(40, slotW * 0.62));

                        return (
                          <>
                            {gridTicks.map((val, idx) => {
                              const y = padTop + innerH - (val / maxVal) * innerH;
                              return (
                                <g key={`grid-${idx}`}>
                                  <line
                                    x1={padLeft}
                                    y1={y}
                                    x2={chartWidth - padRight}
                                    y2={y}
                                    stroke="#1e293b"
                                    strokeDasharray="3 3"
                                  />
                                  <text
                                    x={padLeft - 8}
                                    y={y + 4}
                                    textAnchor="end"
                                    fill="#64748b"
                                    fontSize="11"
                                    fontFamily="monospace"
                                  >
                                    {val}
                                  </text>
                                </g>
                              );
                            })}

                            <line
                              x1={padLeft}
                              y1={padTop + innerH}
                              x2={chartWidth - padRight}
                              y2={padTop + innerH}
                              stroke="#475569"
                              strokeWidth="1.5"
                            />

                            {selectedDogStats.bars.map((bar, idx) => {
                              const cx = padLeft + slotW * idx + slotW / 2;
                              const x = cx - barW / 2;
                              const barH = bar.count > 0 ? Math.max(6, (bar.count / maxVal) * innerH) : 3;
                              const y = padTop + innerH - barH;
                              const isAptidao = selectedDogStats.maxCount > 0 && bar.count === selectedDogStats.maxCount;
                              const isSugestao = bar.count === selectedDogStats.minCount;
                              const isHover = hoveredTopic === bar.topico;
                              const fill = isAptidao ? '#10b981' : isSugestao ? '#f59e0b' : '#38bdf8';

                              return (
                                <g
                                  key={bar.topico}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredTopic(bar.topico)}
                                  onMouseLeave={() => setHoveredTopic(null)}
                                  onClick={() => setHoveredTopic(bar.topico)}
                                >
                                  {/* Área interativa invisível para facilitar hover */}
                                  <rect
                                    x={padLeft + slotW * idx}
                                    y={padTop}
                                    width={slotW}
                                    height={innerH + padBottom}
                                    fill={isHover ? 'rgba(255,255,255,0.03)' : 'transparent'}
                                  />
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barW}
                                    height={barH}
                                    rx={4}
                                    fill={fill}
                                    opacity={hoveredTopic && !isHover ? 0.5 : 1}
                                  />
                                  <text
                                    x={cx}
                                    y={y - 7}
                                    textAnchor="middle"
                                    fill={isHover ? '#ffffff' : '#cbd5e1'}
                                    fontSize="11"
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                  >
                                    {bar.count}
                                  </text>
                                  <text
                                    x={cx}
                                    y={padTop + innerH + 14}
                                    textAnchor="end"
                                    transform={`rotate(-40 ${cx} ${padTop + innerH + 14})`}
                                    fill={isHover ? '#fbbf24' : '#94a3b8'}
                                    fontSize="10.5"
                                    fontWeight="bold"
                                  >
                                    {bar.topico.length > 18 ? `${bar.topico.slice(0, 17)}…` : bar.topico}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
                  )}
                </div>
              </div>

              {/* 3. Campo Livre de Anotações do Condutor (500 caracteres) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-black text-slate-100 uppercase">
                      Anotações do Condutor do Animal
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDog.anotacoesCondutorUpdatedAt && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-slate-700 font-semibold">
                        <Clock className="w-3 h-3" />
                        <span>Última alteração: {formatDateTimeBr(selectedDog.anotacoesCondutorUpdatedAt)}</span>
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        anotacoesDraft.length >= 470 ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {anotacoesDraft.length} / 500 caracteres
                    </span>
                    {!isSelectedDogConductor && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                        Somente leitura (editável pelo condutor)
                      </span>
                    )}
                  </div>
                </div>

                {isSelectedDogConductor ? (
                  <div className="space-y-2">
                    <textarea
                      value={anotacoesDraft}
                      onChange={e => setAnotacoesDraft(e.target.value.slice(0, 500))}
                      maxLength={500}
                      rows={3}
                      placeholder="Registre observações comportamentais, rotina, preferências de recompensa ou orientações específicas do animal (até 500 caracteres)..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingAnotacoes}
                        onClick={handleSaveAnotacoes}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center space-x-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingAnotacoes ? 'Salvando...' : 'Salvar Anotações'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 whitespace-pre-wrap min-h-[60px]">
                    {selectedDog.anotacoesCondutor?.trim() ? (
                      selectedDog.anotacoesCondutor
                    ) : (
                      <span className="text-slate-500 italic">Nenhuma anotação registrada pelo condutor.</span>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Prontuário Clínico: Histórico de Vacinas, Histórico Médico e Histórico de Medicamentos */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Histórico de Vacinas */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-emerald-300 uppercase flex items-center gap-1.5">
                      <Syringe className="w-4 h-4" />
                      <span>Histórico de Vacinas</span>
                    </h4>
                    {canEditHealthRecords && (
                      <button
                        type="button"
                        onClick={() => setShowAddVacina(v => !v)}
                        className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Nova</span>
                      </button>
                    )}
                  </div>

                  {showAddVacina && canEditHealthRecords && (
                    <form onSubmit={handleAddVacina} className="bg-slate-950 border border-slate-700 rounded-xl p-3 space-y-2 text-xs">
                      <input
                        type="text"
                        required
                        maxLength={160}
                        placeholder="Nome da vacina (ex: V10, Antirrábica) *"
                        value={vacinaForm.nomeVacina}
                        onChange={e => setVacinaForm({ ...vacinaForm, nomeVacina: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Aplicação *</label>
                          <input
                            type="date"
                            required
                            value={vacinaForm.dataAplicacao}
                            onChange={e => setVacinaForm({ ...vacinaForm, dataAplicacao: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Próxima Dose</label>
                          <input
                            type="date"
                            value={vacinaForm.proximaDose}
                            onChange={e => setVacinaForm({ ...vacinaForm, proximaDose: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Lote"
                          value={vacinaForm.lote}
                          onChange={e => setVacinaForm({ ...vacinaForm, lote: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="Veterinário"
                          value={vacinaForm.veterinario}
                          onChange={e => setVacinaForm({ ...vacinaForm, veterinario: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddVacina(false)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingVacina}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          {savingVacina ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2 flex-1 max-h-72 overflow-y-auto pr-1">
                    {loadingDetalhes ? (
                      <div className="text-xs text-slate-500 py-4 text-center">Carregando...</div>
                    ) : (detalhes?.vacinas || []).length === 0 ? (
                      <div className="text-xs text-slate-500 italic py-4 text-center">
                        Nenhuma vacina registrada.
                      </div>
                    ) : (
                      (detalhes?.vacinas || []).map(v => {
                        const isOverdue = Boolean(v.proximaDose && v.proximaDose < getTodayIsoBr());
                        return (
                          <div key={v.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-slate-100">{v.nomeVacina}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isOverdue
                                      ? 'bg-red-500/20 text-red-300'
                                      : 'bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  {isOverdue ? 'Vencida' : 'Em dia'}
                                </span>
                                {canEditHealthRecords && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVacina(v.id)}
                                    className="text-slate-500 hover:text-red-400"
                                    title="Excluir vacina"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Aplicada em: <strong className="text-slate-200">{formatDateBr(v.dataAplicacao)}</strong>
                              {v.proximaDose && (
                                <>
                                  {' • '}Reforço: <strong className={isOverdue ? 'text-red-300' : 'text-emerald-300'}>{formatDateBr(v.proximaDose)}</strong>
                                </>
                              )}
                            </div>
                            {(v.lote || v.veterinario) && (
                              <div className="text-[10px] text-slate-500">
                                {v.lote ? `Lote: ${v.lote}` : ''}
                                {v.lote && v.veterinario ? ' • ' : ''}
                                {v.veterinario ? `Vet.: ${v.veterinario}` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Histórico Médico */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-cyan-300 uppercase flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4" />
                      <span>Histórico Médico</span>
                    </h4>
                    {canEditHealthRecords && (
                      <button
                        type="button"
                        onClick={() => setShowAddMedico(v => !v)}
                        className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Novo</span>
                      </button>
                    )}
                  </div>

                  {showAddMedico && canEditHealthRecords && (
                    <form onSubmit={handleAddMedico} className="bg-slate-950 border border-slate-700 rounded-xl p-3 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          required
                          value={medicoForm.dataAtendimento}
                          onChange={e => setMedicoForm({ ...medicoForm, dataAtendimento: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                        />
                        <input
                          type="text"
                          required
                          maxLength={120}
                          placeholder="Tipo (Consulta, Exame...) *"
                          value={medicoForm.tipoAtendimento}
                          onChange={e => setMedicoForm({ ...medicoForm, tipoAtendimento: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Diagnóstico / Ocorrência"
                        value={medicoForm.diagnostico}
                        onChange={e => setMedicoForm({ ...medicoForm, diagnostico: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="Conduta / Tratamento"
                        value={medicoForm.conduta}
                        onChange={e => setMedicoForm({ ...medicoForm, conduta: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="Veterinário responsável"
                        value={medicoForm.veterinario}
                        onChange={e => setMedicoForm({ ...medicoForm, veterinario: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      />
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddMedico(false)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingMedico}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                        >
                          {savingMedico ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2 flex-1 max-h-72 overflow-y-auto pr-1">
                    {loadingDetalhes ? (
                      <div className="text-xs text-slate-500 py-4 text-center">Carregando...</div>
                    ) : (detalhes?.historicoMedico || []).length === 0 ? (
                      <div className="text-xs text-slate-500 italic py-4 text-center">
                        Nenhum atendimento médico registrado.
                      </div>
                    ) : (
                      (detalhes?.historicoMedico || []).map(hm => (
                        <div key={hm.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100">{hm.tipoAtendimento}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-mono text-cyan-300">{formatDateBr(hm.dataAtendimento)}</span>
                              {canEditHealthRecords && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMedico(hm.id)}
                                  className="text-slate-500 hover:text-red-400"
                                  title="Excluir registro médico"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {hm.diagnostico && (
                            <div className="text-[11px] text-slate-300">
                              <span className="text-slate-500">Diag.:</span> {hm.diagnostico}
                            </div>
                          )}
                          {hm.conduta && (
                            <div className="text-[11px] text-slate-300">
                              <span className="text-slate-500">Conduta:</span> {hm.conduta}
                            </div>
                          )}
                          {hm.veterinario && (
                            <div className="text-[10px] text-slate-500">Vet.: {hm.veterinario}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Histórico de Medicamentos */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-amber-300 uppercase flex items-center gap-1.5">
                      <Pill className="w-4 h-4" />
                      <span>Histórico de Medicamentos</span>
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">{dogMedicamentos.length} reg.</span>
                  </div>

                  <div className="space-y-2 flex-1 max-h-72 overflow-y-auto pr-1">
                    {loadingDetalhes ? (
                      <div className="text-xs text-slate-500 py-4 text-center">Carregando...</div>
                    ) : dogMedicamentos.length === 0 ? (
                      <div className="text-xs text-slate-500 italic py-4 text-center">
                        Nenhum medicamento ministrado registrado no módulo veterinário.
                      </div>
                    ) : (
                      dogMedicamentos.map(med => (
                        <div key={med.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100">{med.produtoNome}</span>
                            <span className="text-[10px] font-mono text-amber-300 shrink-0">
                              {formatDateTimeBr(med.dataHora)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Qtd.: <strong>{med.quantidade} {med.unidadeMedida || ''}</strong>
                            {med.dosagemAplicada ? ` • Dose: ${med.dosagemAplicada}` : ''}
                            {med.frequenciaAdministrada ? ` • ${med.frequenciaAdministrada}` : ''}
                          </div>
                          {med.motivo && (
                            <div className="text-[11px] text-slate-400">Motivo: {med.motivo}</div>
                          )}
                          {med.responsavelAplicacaoNome && (
                            <div className="text-[10px] text-slate-500">
                              Aplicado por: {med.responsavelAplicacaoNome}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Histórico de Condutores do Animal */}
      {showCondutoresHistoryModal && selectedDog && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-cyan-300 uppercase flex items-center gap-2">
                  <History className="w-4 h-4" />
                  <span>Histórico de Condutores — {selectedDog.nome}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Todos os policiais vinculados como condutores deste animal com data de início e término.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCondutoresHistoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-2.5">
              {(detalhes?.historicoCondutores || []).length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-6">
                  Nenhum vínculo de condutor registrado no histórico para este animal.
                </div>
              ) : (
                (detalhes?.historicoCondutores || []).map(h => (
                  <div
                    key={h.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                      !h.dataFim
                        ? 'bg-emerald-500/10 border-emerald-500/35'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        <span>{h.condutorNome}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                          {h.slot === 2 ? '2º Condutor' : '1º Condutor'}
                        </span>
                        {!h.dataFim && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                            ATUAL
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {h.condutorMasp ? `MASP ${formatMasp(h.condutorMasp)}` : 'MASP não informado'}
                        {h.condutorCargo ? ` • ${h.condutorCargo}` : ''}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-300 sm:text-right">
                      <div>
                        <span className="text-slate-500">Início:</span> {formatDateBr(h.dataInicio)}
                      </div>
                      <div>
                        <span className="text-slate-500">Término:</span>{' '}
                        {h.dataFim ? formatDateBr(h.dataFim) : <span className="text-emerald-400 font-bold">Em vigor</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCondutoresHistoryModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Impressão de Vários Animais (1 gráfico/ficha por página) */}
      {showMultiPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-amber-300 uppercase flex items-center gap-2">
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Gráficos de Vários Animais</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cada animal selecionado será impresso em sua própria folha (1 gráfico por página).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMultiPrintModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Selecionados: <strong className="text-amber-300">{multiPrintSelectedIds.length}</strong> de{' '}
                  {visibleDogs.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMultiPrintSelectedIds(visibleDogs.map(d => d.id))}
                    className="text-cyan-400 hover:text-cyan-300 font-bold"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setMultiPrintSelectedIds([])}
                    className="text-slate-400 hover:text-slate-200 font-bold"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {visibleDogs.map(dog => {
                  const checked = multiPrintSelectedIds.includes(dog.id);
                  return (
                    <button
                      key={`mp-${dog.id}`}
                      type="button"
                      onClick={() =>
                        setMultiPrintSelectedIds(prev =>
                          prev.includes(dog.id) ? prev.filter(id => id !== dog.id) : [...prev, dog.id]
                        )
                      }
                      className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between transition ${
                        checked
                          ? 'bg-amber-500/15 border-amber-400 text-amber-100'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span className="font-bold uppercase">{dog.nome}</span>
                        <span className="text-slate-400">({dog.raca || 'K9'})</span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate max-w-[160px]">
                        {dog.usuarioInternoNome || dog.responsavelExternoNome || 'Sem condutor'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMultiPrintModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmMultiPrint}
                disabled={multiPrintSelectedIds.length === 0}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir ({multiPrintSelectedIds.length} folha(s))</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
