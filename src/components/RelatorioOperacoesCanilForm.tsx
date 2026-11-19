import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  User,
  Unit,
  Cachorro,
  ParticipanteTreinamentoCachorro,
  SolicitacaoOperacaoCanil,
  TipoMaterialEncontradoCanil,
  MaterialEncontradoOperacaoCanil,
  OperadorOperacaoCanil,
  ViaturaUnidade,
  ViaturaOperacaoCanil,
  RelatorioOperacaoCanil
} from '../types';
import { MUNICIPIOS_MG, normalizeCitySearch } from '../data/municipiosMG';
import { formatMasp, formatPlacaViatura, isValidPlacaViatura } from '../utils/masks';
import { storage } from '../services/storage';
import {
  Dog,
  Search,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Printer,
  X,
  MapPin,
  ShieldAlert,
  FileText,
  Package,
  Car
} from 'lucide-react';

const MATERIAIS_OPCOES: TipoMaterialEncontradoCanil[] = ['Droga', 'Arma', 'Munição', 'Explosivos'];

interface RelatorioOperacoesCanilFormProps {
  currentUser: User;
  allUsers: User[];
  units: Unit[];
  cachorros: Cachorro[];
  viaturas: ViaturaUnidade[];
  defaultUnitId?: string;
  operacoesHojeEditaveis: RelatorioOperacaoCanil[];
  editingReport: RelatorioOperacaoCanil | null;
  isSubmitting: boolean;
  onStartEdit: (rel: RelatorioOperacaoCanil) => void;
  onCancelEdit: () => void;
  onDelete: (rel: RelatorioOperacaoCanil) => void;
  onViaturasChanged: () => void;
  onSave: (
    payload: {
      dataOperacao: string;
      horaOperacao: string;
      comarca: string;
      solicitacaoTipo: SolicitacaoOperacaoCanil;
      solicitacaoOutrosDetalhes: string;
      materialEncontrado: boolean;
      materiaisEncontrados: MaterialEncontradoOperacaoCanil[];
      operadores: OperadorOperacaoCanil[];
      viaturas: ViaturaOperacaoCanil[];
      detalhamento: string;
    },
    andPrint: boolean
  ) => Promise<boolean>;
  formatDateBr: (isoDate?: string) => string;
  getTodayIsoBr: () => string;
}

export const RelatorioOperacoesCanilForm: React.FC<RelatorioOperacoesCanilFormProps> = ({
  currentUser,
  allUsers,
  units,
  cachorros,
  viaturas,
  defaultUnitId,
  operacoesHojeEditaveis,
  editingReport,
  isSubmitting,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onViaturasChanged,
  onSave,
  formatDateBr,
  getTodayIsoBr
}) => {
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const userRolesList = Array.isArray(currentUser.roles) && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];
  const isGeral = effectiveRole === 'Geral';
  const isAdminProfile = effectiveRole === 'Administrador' || userRolesList.includes('Administrador');
  const canManageViaturas = isGeral || isAdminProfile;
  const effectiveUnitId = currentUser.unitId || defaultUnitId || '';

  const toDogItem = (d: Cachorro): ParticipanteTreinamentoCachorro => ({
    id: d.id,
    nome: d.nome,
    raca: d.raca || '',
    microchip: d.microchip || ''
  });

  const activeDogs = useMemo(
    () =>
      cachorros
        .filter(d => d && d.status !== 'Baixado / Óbito')
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    [cachorros]
  );

  const getDefaultDogsForUser = (userId?: string): Cachorro[] => {
    if (!userId) return [];
    return activeDogs
      .filter(
        d =>
          d.tipoVinculo === 'SISTEMA' &&
          (d.usuarioInternoId === userId || d.usuarioInterno2Id === userId)
      )
      .sort((a, b) => {
        const aPrimary = a.usuarioInternoId === userId ? 0 : 1;
        const bPrimary = b.usuarioInternoId === userId ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
      });
  };

  const buildInitialCreatorOperator = (): OperadorOperacaoCanil => {
    const defaultDogs = getDefaultDogsForUser(currentUser.id);
    return {
      userId: currentUser.id,
      name: currentUser.name,
      masp: currentUser.masp || '',
      cargo: currentUser.cargo || '',
      isCreator: true,
      cachorros: defaultDogs.length > 0 ? [toDogItem(defaultDogs[0])] : []
    };
  };

  const [dataOperacao, setDataOperacao] = useState<string>(getTodayIsoBr());
  const [horaOperacao, setHoraOperacao] = useState<string>('06:00');
  const [comarca, setComarca] = useState<string>('');
  const [comarcaOpen, setComarcaOpen] = useState<boolean>(false);
  const [solicitacaoTipo, setSolicitacaoTipo] = useState<SolicitacaoOperacaoCanil>('CEPOLC');
  const [solicitacaoOutrosDetalhes, setSolicitacaoOutrosDetalhes] = useState<string>('');
  const [materialEncontrado, setMaterialEncontrado] = useState<boolean>(false);
  const [materiaisEncontrados, setMateriaisEncontrados] = useState<MaterialEncontradoOperacaoCanil[]>([]);
  const [operadores, setOperadores] = useState<OperadorOperacaoCanil[]>(() => [
    buildInitialCreatorOperator()
  ]);
  const [hasInitializedCreatorDog, setHasInitializedCreatorDog] = useState<boolean>(false);
  const [operatorSearch, setOperatorSearch] = useState<string>('');
  const [selectedViaturas, setSelectedViaturas] = useState<ViaturaOperacaoCanil[]>([]);
  const [viaturaSearch, setViaturaSearch] = useState<string>('');
  const [viaturaDropdownOpen, setViaturaDropdownOpen] = useState<boolean>(false);
  const [showViaturaModal, setShowViaturaModal] = useState<boolean>(false);
  const [editingViaturaId, setEditingViaturaId] = useState<string | null>(null);
  const [viaturaDescricaoInput, setViaturaDescricaoInput] = useState<string>('');
  const [viaturaPlacaInput, setViaturaPlacaInput] = useState<string>('');
  const [viaturaTargetUnitId, setViaturaTargetUnitId] = useState<string>(() => currentUser.unitId || defaultUnitId || '');
  const [viaturaModalError, setViaturaModalError] = useState<string | null>(null);
  const [viaturaModalSuccess, setViaturaModalSuccess] = useState<string | null>(null);
  const [viaturaSaving, setViaturaSaving] = useState<boolean>(false);
  const [confirmDeleteViaturaId, setConfirmDeleteViaturaId] = useState<string | null>(null);
  const [detalhamento, setDetalhamento] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{ totalSeconds: number; formatted: string }>(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
    const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
    const s = Number(parts.find(p => p.type === 'second')?.value || 0);
    const remaining = Math.max(0, 86400 - (h * 3600 + m * 60 + s));
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      totalSeconds: remaining,
      formatted: `${pad(Math.floor(remaining / 3600))}:${pad(Math.floor((remaining % 3600) / 60))}:${pad(remaining % 60)}`
    };
  });

  const comarcaBoxRef = useRef<HTMLDivElement | null>(null);
  const viaturaBoxRef = useRef<HTMLDivElement | null>(null);

  // Contagem regressiva em tempo real até o fim do dia (23:59:59 - Horário de Brasília)
  useEffect(() => {
    if (operacoesHojeEditaveis.length === 0) return;
    const computeRemaining = () => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(new Date());
      const h = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
      const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
      const s = Number(parts.find(p => p.type === 'second')?.value || 0);
      const remaining = Math.max(0, 86400 - (h * 3600 + m * 60 + s));
      const pad = (n: number) => String(n).padStart(2, '0');
      setCountdown({
        totalSeconds: remaining,
        formatted: `${pad(Math.floor(remaining / 3600))}:${pad(Math.floor((remaining % 3600) / 60))}:${pad(remaining % 60)}`
      });
    };
    computeRemaining();
    const timer = window.setInterval(computeRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [operacoesHojeEditaveis.length]);

  // Close comarca and viatura dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comarcaBoxRef.current && !comarcaBoxRef.current.contains(e.target as Node)) {
        setComarcaOpen(false);
      }
      if (viaturaBoxRef.current && !viaturaBoxRef.current.contains(e.target as Node)) {
        setViaturaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Populate default dog for creator once dogs finish loading (only for fresh form)
  useEffect(() => {
    if (editingReport || hasInitializedCreatorDog || activeDogs.length === 0) return;
    const defaultDogs = getDefaultDogsForUser(currentUser.id);
    setHasInitializedCreatorDog(true);
    if (defaultDogs.length > 0) {
      setOperadores(prev =>
        prev.map(op =>
          op.userId === currentUser.id && op.cachorros.length === 0
            ? { ...op, cachorros: [toDogItem(defaultDogs[0])] }
            : op
        )
      );
    }
  }, [activeDogs, currentUser.id, editingReport, hasInitializedCreatorDog]);

  // Populate form when entering edit mode or reset when leaving edit mode
  useEffect(() => {
    setLocalError(null);
    if (editingReport) {
      setDataOperacao(editingReport.dataOperacao || getTodayIsoBr());
      setHoraOperacao(editingReport.horaOperacao || '06:00');
      setComarca(editingReport.comarca || '');
      setComarcaOpen(false);
      setSolicitacaoTipo(editingReport.solicitacaoTipo || 'CEPOLC');
      setSolicitacaoOutrosDetalhes(editingReport.solicitacaoOutrosDetalhes || '');
      setMaterialEncontrado(Boolean(editingReport.materialEncontrado));
      setMateriaisEncontrados(
        (editingReport.materiaisEncontrados || []).map(m => ({
          tipo: m.tipo,
          cachorros: [...(m.cachorros || [])]
        }))
      );
      setOperadores(
        (editingReport.operadores || []).length > 0
          ? editingReport.operadores.map(op => ({
              ...op,
              cachorros: [...(op.cachorros || [])]
            }))
          : [buildInitialCreatorOperator()]
      );
      setSelectedViaturas((editingReport.viaturas || []).map(v => ({ ...v })));
      setViaturaSearch('');
      setViaturaDropdownOpen(false);
      setDetalhamento(editingReport.detalhamento || '');
      setOperatorSearch('');
      setHasInitializedCreatorDog(true);
    } else {
      setDataOperacao(getTodayIsoBr());
      setHoraOperacao('06:00');
      setComarca('');
      setComarcaOpen(false);
      setSolicitacaoTipo('CEPOLC');
      setSolicitacaoOutrosDetalhes('');
      setMaterialEncontrado(false);
      setMateriaisEncontrados([]);
      setOperadores([buildInitialCreatorOperator()]);
      setSelectedViaturas([]);
      setViaturaSearch('');
      setViaturaDropdownOpen(false);
      setDetalhamento('');
      setOperatorSearch('');
      setHasInitializedCreatorDog(activeDogs.length > 0);
    }
  }, [editingReport?.id, currentUser.id]);

  // Filtered Minas Gerais municipalities as user types
  const filteredComarcas = useMemo(() => {
    const q = normalizeCitySearch(comarca);
    if (!q) return MUNICIPIOS_MG.slice(0, 40);
    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];
    for (const city of MUNICIPIOS_MG) {
      const norm = normalizeCitySearch(city);
      if (norm.startsWith(q)) {
        startsWithMatches.push(city);
      } else if (norm.includes(q)) {
        containsMatches.push(city);
      }
    }
    return [...startsWithMatches, ...containsMatches].slice(0, 50);
  }, [comarca]);

  // Eligible operators: same unit + Operador Canino profile (for Geral, all Operador Canino)
  const eligibleOperators = useMemo(() => {
    const selectedIds = new Set(operadores.map(o => o.userId));
    const q = normalizeCitySearch(operatorSearch);
    return allUsers
      .filter(u => {
        if (!u || !u.id || selectedIds.has(u.id)) return false;
        const userRoles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
        const hasOpCaninoProfile =
          u.role === 'operador_canino' || userRoles.includes('operador_canino');
        if (!hasOpCaninoProfile) return false;
        if (!isGeral && currentUser.unitId && u.unitId && u.unitId !== currentUser.unitId) {
          return false;
        }
        if (!isGeral && currentUser.unitId && !u.unitId) {
          return false;
        }
        if (!q) return true;
        return (
          normalizeCitySearch(u.name || '').includes(q) ||
          String(u.masp || '').toLowerCase().includes(q) ||
          normalizeCitySearch(u.cargo || '').includes(q)
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, operadores, operatorSearch, isGeral, currentUser.unitId]);

  // Viaturas visíveis para o usuário: todas as viaturas da unidade em que está vinculado
  const unitViaturas = useMemo(() => {
    const scopeUnitId = currentUser.unitId || defaultUnitId || '';
    return (viaturas || [])
      .filter(v => {
        if (!v || !v.id) return false;
        if (scopeUnitId) return v.unitId === scopeUnitId;
        return isGeral;
      })
      .sort((a, b) => (a.placa || '').localeCompare(b.placa || '', 'pt-BR'));
  }, [viaturas, currentUser.unitId, defaultUnitId, isGeral]);

  // Viaturas filtradas por placa ou descrição para seleção (excluindo já selecionadas)
  const filteredAvailableViaturas = useMemo(() => {
    const selectedIds = new Set(selectedViaturas.map(v => v.id));
    const qNorm = normalizeCitySearch(viaturaSearch);
    const qCleanPlate = viaturaSearch.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return unitViaturas.filter(v => {
      if (selectedIds.has(v.id)) return false;
      if (!qNorm && !qCleanPlate) return true;
      const plateClean = (v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const matchPlaca =
        (v.placa || '').toUpperCase().includes(viaturaSearch.trim().toUpperCase()) ||
        (qCleanPlate.length > 0 && plateClean.includes(qCleanPlate));
      const matchDescricao = normalizeCitySearch(v.descricao || '').includes(qNorm);
      return matchPlaca || matchDescricao;
    });
  }, [unitViaturas, selectedViaturas, viaturaSearch]);

  // Viaturas gerenciáveis no modal do Administrador (estritamente da unidade vinculada; Geral pode escolher)
  const manageableUnitId = isGeral
    ? viaturaTargetUnitId || currentUser.unitId || defaultUnitId || ''
    : currentUser.unitId || '';

  const manageableUnitName = useMemo(() => {
    if (!manageableUnitId) return 'Unidade não vinculada';
    return units.find(u => u.id === manageableUnitId)?.name || manageableUnitId;
  }, [units, manageableUnitId]);

  const manageableViaturas = useMemo(() => {
    return (viaturas || [])
      .filter(v => (manageableUnitId ? v.unitId === manageableUnitId : isGeral))
      .sort((a, b) => (a.placa || '').localeCompare(b.placa || '', 'pt-BR'));
  }, [viaturas, manageableUnitId, isGeral]);

  const handleAddViaturaToReport = (v: ViaturaUnidade) => {
    if (selectedViaturas.some(s => s.id === v.id)) return;
    setSelectedViaturas(prev => [...prev, { id: v.id, placa: v.placa, descricao: v.descricao }]);
    setViaturaSearch('');
    setViaturaDropdownOpen(false);
  };

  const handleRemoveViaturaFromReport = (viaturaId: string) => {
    setSelectedViaturas(prev => prev.filter(v => v.id !== viaturaId));
  };

  const openViaturaModal = () => {
    setViaturaModalError(null);
    setViaturaModalSuccess(null);
    setEditingViaturaId(null);
    setViaturaDescricaoInput('');
    setViaturaPlacaInput('');
    setConfirmDeleteViaturaId(null);
    setViaturaTargetUnitId(currentUser.unitId || defaultUnitId || units[0]?.id || '');
    setShowViaturaModal(true);
  };

  const handleStartEditViatura = (v: ViaturaUnidade) => {
    setViaturaModalError(null);
    setViaturaModalSuccess(null);
    setEditingViaturaId(v.id);
    setViaturaDescricaoInput(v.descricao);
    setViaturaPlacaInput(formatPlacaViatura(v.placa));
    setConfirmDeleteViaturaId(null);
  };

  const handleCancelEditViatura = () => {
    setEditingViaturaId(null);
    setViaturaDescricaoInput('');
    setViaturaPlacaInput('');
    setViaturaModalError(null);
  };

  const handleSaveViaturaModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setViaturaModalError(null);
    setViaturaModalSuccess(null);

    const desc = viaturaDescricaoInput.trim();
    const placa = formatPlacaViatura(viaturaPlacaInput);

    if (!desc) {
      setViaturaModalError('Informe a descrição (marca e modelo) da viatura.');
      return;
    }
    if (!isValidPlacaViatura(placa)) {
      setViaturaModalError(
        'Placa incompleta ou inválida. Siga a máscara AAA-XAXX (ex.: ABC-1D23), com letras maiúsculas em A e números em X.'
      );
      return;
    }
    if (!manageableUnitId) {
      setViaturaModalError('Nenhuma unidade vinculada encontrada para cadastrar a viatura.');
      return;
    }

    setViaturaSaving(true);
    const targetUnitObj = units.find(u => u.id === manageableUnitId);
    const res = editingViaturaId
      ? await storage.updateViatura(editingViaturaId, {
          descricao: desc,
          placa
        })
      : await storage.saveViatura({
          descricao: desc,
          placa,
          unitId: manageableUnitId,
          departmentId: targetUnitObj?.departmentId || currentUser.departmentId || ''
        });
    setViaturaSaving(false);

    if (!res.success) {
      setViaturaModalError(res.error || 'Erro ao salvar viatura.');
      return;
    }

    if (editingViaturaId && res.data) {
      setSelectedViaturas(prev =>
        prev.map(v => (v.id === editingViaturaId ? { id: v.id, placa: res.data!.placa, descricao: res.data!.descricao } : v))
      );
    }

    setViaturaModalSuccess(
      editingViaturaId
        ? `Viatura ${placa} atualizada com sucesso!`
        : `Viatura ${placa} (${desc}) cadastrada com sucesso na unidade!`
    );
    setEditingViaturaId(null);
    setViaturaDescricaoInput('');
    setViaturaPlacaInput('');
    onViaturasChanged();
  };

  const handleConfirmDeleteViatura = async (id: string) => {
    setViaturaModalError(null);
    setViaturaModalSuccess(null);
    setViaturaSaving(true);
    const res = await storage.deleteViatura(id);
    setViaturaSaving(false);
    setConfirmDeleteViaturaId(null);
    if (!res.success) {
      setViaturaModalError(res.error || 'Erro ao excluir viatura.');
      return;
    }
    setSelectedViaturas(prev => prev.filter(v => v.id !== id));
    if (editingViaturaId === id) {
      setEditingViaturaId(null);
      setViaturaDescricaoInput('');
      setViaturaPlacaInput('');
    }
    setViaturaModalSuccess('Viatura excluída com sucesso.');
    onViaturasChanged();
  };

  // All unique dogs currently participating in the report across all operators
  const allDogsInReport = useMemo<ParticipanteTreinamentoCachorro[]>(() => {
    const map = new Map<string, ParticipanteTreinamentoCachorro>();
    for (const op of operadores) {
      for (const dog of op.cachorros || []) {
        if (!map.has(dog.id)) map.set(dog.id, dog);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [operadores]);

  // Keep materiaisEncontrados dog references synced if dogs are removed from operators
  useEffect(() => {
    const validIds = new Set(allDogsInReport.map(d => d.id));
    setMateriaisEncontrados(prev => {
      let changed = false;
      const next = prev.map(m => {
        const filtered = (m.cachorros || []).filter(d => validIds.has(d.id));
        if (filtered.length !== (m.cachorros || []).length) changed = true;
        return { ...m, cachorros: filtered };
      });
      return changed ? next : prev;
    });
  }, [allDogsInReport]);

  const handleAddOperator = (u: User) => {
    if (operadores.some(op => op.userId === u.id)) return;
    const defaultDogs = getDefaultDogsForUser(u.id);
    setOperadores(prev => [
      ...prev,
      {
        userId: u.id,
        name: u.name,
        masp: u.masp || '',
        cargo: u.cargo || '',
        isCreator: false,
        cachorros: defaultDogs.length > 0 ? [toDogItem(defaultDogs[0])] : []
      }
    ]);
    setOperatorSearch('');
  };

  const handleRemoveOperator = (userId: string) => {
    if (operadores.length <= 1) return;
    setOperadores(prev => prev.filter(op => op.userId !== userId));
  };

  const handleAddDogToOperator = (userId: string, dogId: string) => {
    if (!dogId) return;
    const dogObj = activeDogs.find(d => d.id === dogId);
    if (!dogObj) return;
    const entry = toDogItem(dogObj);
    setOperadores(prev =>
      prev.map(op => {
        if (op.userId !== userId) return op;
        if (op.cachorros.some(c => c.id === entry.id)) return op;
        return { ...op, cachorros: [...op.cachorros, entry] };
      })
    );
  };

  const handleRemoveDogFromOperator = (userId: string, dogId: string) => {
    setOperadores(prev =>
      prev.map(op => {
        if (op.userId !== userId) return op;
        return { ...op, cachorros: op.cachorros.filter(c => c.id !== dogId) };
      })
    );
  };

  const handleReplaceSingleDogForOperator = (userId: string, dogId: string) => {
    if (!dogId) {
      setOperadores(prev =>
        prev.map(op => (op.userId === userId ? { ...op, cachorros: [] } : op))
      );
      return;
    }
    const dogObj = activeDogs.find(d => d.id === dogId);
    if (!dogObj) return;
    const entry = toDogItem(dogObj);
    setOperadores(prev =>
      prev.map(op => (op.userId === userId ? { ...op, cachorros: [entry] } : op))
    );
  };

  const handleToggleMaterialTipo = (tipo: TipoMaterialEncontradoCanil) => {
    setMateriaisEncontrados(prev => {
      const exists = prev.some(m => m.tipo === tipo);
      if (exists) {
        return prev.filter(m => m.tipo !== tipo);
      }
      // If there is only 1 dog in the report, pre-select it for convenience
      const autoDogs = allDogsInReport.length === 1 ? [allDogsInReport[0]] : [];
      return [...prev, { tipo, cachorros: autoDogs }];
    });
  };

  const handleAddMaterialFromSelect = (tipo: string) => {
    if (!tipo) return;
    const typed = tipo as TipoMaterialEncontradoCanil;
    if (materiaisEncontrados.some(m => m.tipo === typed)) return;
    const autoDogs = allDogsInReport.length === 1 ? [allDogsInReport[0]] : [];
    setMateriaisEncontrados(prev => [...prev, { tipo: typed, cachorros: autoDogs }]);
  };

  const handleToggleDogForMaterial = (
    tipo: TipoMaterialEncontradoCanil,
    dog: ParticipanteTreinamentoCachorro
  ) => {
    setMateriaisEncontrados(prev =>
      prev.map(m => {
        if (m.tipo !== tipo) return m;
        const exists = m.cachorros.some(c => c.id === dog.id);
        return {
          ...m,
          cachorros: exists
            ? m.cachorros.filter(c => c.id !== dog.id)
            : [...m.cachorros, dog]
        };
      })
    );
  };

  const handleSubmit = async (andPrint: boolean) => {
    setLocalError(null);
    if (!dataOperacao) {
      setLocalError('Informe a data da operação.');
      return;
    }
    if (!horaOperacao) {
      setLocalError('Informe o horário da operação.');
      return;
    }
    const cleanComarca = comarca.trim();
    const matchedCity = MUNICIPIOS_MG.find(
      c => normalizeCitySearch(c) === normalizeCitySearch(cleanComarca)
    );
    if (!cleanComarca || !matchedCity) {
      setLocalError('Selecione uma Comarca válida da lista de municípios mineiros.');
      return;
    }
    if (solicitacaoTipo === 'Outros' && !solicitacaoOutrosDetalhes.trim()) {
      setLocalError('Informe brevemente o detalhe da solicitação em "Outros".');
      return;
    }
    if (operadores.length === 0) {
      setLocalError('Informe pelo menos um operador na operação.');
      return;
    }
    if (materialEncontrado) {
      if (materiaisEncontrados.length === 0) {
        setLocalError('Selecione ao menos um tipo de material encontrado (Droga, Arma, Munição ou Explosivos).');
        return;
      }
      if (allDogsInReport.length === 0) {
        setLocalError('Vincule ao menos um animal a um operador para informar qual animal encontrou o material.');
        return;
      }
      const missingDog = materiaisEncontrados.find(m => !m.cachorros || m.cachorros.length === 0);
      if (missingDog) {
        setLocalError(`Informe qual(is) animal(is) encontrou(ram) o material: ${missingDog.tipo}.`);
        return;
      }
    }
    const cleanDetalhamento = detalhamento.trim();
    if (!cleanDetalhamento) {
      setLocalError('Preencha o detalhamento da operação.');
      return;
    }
    if (cleanDetalhamento.length > 1000) {
      setLocalError('O detalhamento da operação deve ter no máximo 1000 caracteres.');
      return;
    }

    const ok = await onSave(
      {
        dataOperacao,
        horaOperacao,
        comarca: matchedCity,
        solicitacaoTipo,
        solicitacaoOutrosDetalhes: solicitacaoTipo === 'Outros' ? solicitacaoOutrosDetalhes.trim() : '',
        materialEncontrado,
        materiaisEncontrados: materialEncontrado ? materiaisEncontrados : [],
        operadores,
        viaturas: selectedViaturas,
        detalhamento: cleanDetalhamento
      },
      andPrint
    );

    if (ok && !editingReport) {
      setDataOperacao(getTodayIsoBr());
      setHoraOperacao('06:00');
      setComarca('');
      setSolicitacaoTipo('CEPOLC');
      setSolicitacaoOutrosDetalhes('');
      setMaterialEncontrado(false);
      setMateriaisEncontrados([]);
      setOperadores([buildInitialCreatorOperator()]);
      setSelectedViaturas([]);
      setViaturaSearch('');
      setOperatorSearch('');
      setDetalhamento('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner de relatórios de operações confeccionados hoje (editáveis/excluíveis por qualquer citado) */}
      {operacoesHojeEditaveis.length > 0 && (
        <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <div>
                <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wide font-mono">
                  Relatórios de Operações Confeccionados Hoje ({operacoesHojeEditaveis.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Qualquer usuário citado no relatório pode editar ou excluir durante o dia da sua confecção.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div
                className={`px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold flex items-center space-x-1.5 ${
                  countdown.totalSeconds === 0
                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                    : countdown.totalSeconds <= 1800
                    ? 'bg-red-500/15 border-red-500/40 text-red-300'
                    : countdown.totalSeconds <= 7200
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                }`}
                title="Contagem regressiva até o término do dia para editar ou excluir"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {countdown.totalSeconds > 0
                    ? `Tempo restante: ${countdown.formatted}`
                    : 'Prazo encerrado'}
                </span>
              </div>
              {editingReport && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 border border-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Novo Relatório de Operação</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {operacoesHojeEditaveis.map(rel => {
              const isBeingEdited = editingReport?.id === rel.id;
              return (
                <div
                  key={rel.id}
                  className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
                    isBeingEdited
                      ? 'bg-cyan-500/15 border-cyan-400'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 text-xs space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-100">{rel.comarca}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                        {formatDateBr(rel.dataOperacao)} • {rel.horaOperacao}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {rel.solicitacaoTipo}
                      </span>
                      {rel.materialEncontrado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                          Material Encontrado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Operadores ({rel.operadores.length}): {rel.operadores.map(o => o.name).join(', ')}
                    </p>
                    <p
                      className={`text-[10px] font-mono font-bold flex items-center space-x-1 ${
                        countdown.totalSeconds <= 1800
                          ? 'text-red-400'
                          : countdown.totalSeconds <= 7200
                          ? 'text-amber-300'
                          : 'text-cyan-300'
                      }`}
                    >
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>
                        {countdown.totalSeconds > 0
                          ? `Edição/exclusão encerra em ${countdown.formatted}`
                          : 'Tempo de edição encerrado'}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={countdown.totalSeconds === 0}
                      onClick={() => (isBeingEdited ? onCancelEdit() : onStartEdit(rel))}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition disabled:opacity-50 ${
                        isBeingEdited
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      {isBeingEdited ? <X className="w-3.5 h-3.5" /> : <Edit className="w-3.5 h-3.5" />}
                      <span>{isBeingEdited ? 'Editando' : 'Editar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={countdown.totalSeconds === 0}
                      onClick={() => onDelete(rel)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 border border-red-500/30 rounded-lg transition"
                      title="Excluir relatório (permitido no dia da confecção)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulário Principal */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl border ${
                editingReport
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {editingReport ? <Edit className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100 font-mono uppercase">
                {editingReport ? 'Editar Relatório de Operação' : 'Novo Relatório de Operações'}
              </h2>
              <p className="text-xs text-slate-400">
                {editingReport
                  ? `Editando relatório confeccionado hoje (${editingReport.comarca} • ${formatDateBr(editingReport.dataOperacao)} às ${editingReport.horaOperacao}).`
                  : 'Registre operações policiais do Canil K9 com comarca, solicitação, equipe de operadores, animais e materiais encontrados.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            {editingReport && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-sans font-bold flex items-center space-x-1 transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            )}
          </div>
        </div>

        {localError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-xs font-semibold flex items-center justify-between">
            <span>{localError}</span>
            <button type="button" onClick={() => setLocalError(null)} className="p-0.5 hover:text-red-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* BLOCO 1: DATA, HORA, COMARCA E SOLICITAÇÃO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Data (inicia com data do dia, editável) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Data da Operação *</span>
            </label>
            <input
              type="date"
              value={dataOperacao}
              onChange={(e) => setDataOperacao(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Hora (padrão 06:00, selecionável) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Hora *</span>
            </label>
            <input
              type="time"
              value={horaOperacao}
              onChange={(e) => setHoraOperacao(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Comarca (Autocomplete municípios mineiros) */}
          <div ref={comarcaBoxRef} className="relative">
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5 flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Comarca (MG) *</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={comarca}
                onFocus={() => setComarcaOpen(true)}
                onChange={(e) => {
                  setComarca(e.target.value);
                  setComarcaOpen(true);
                }}
                placeholder="Digite o município de Minas Gerais..."
                autoComplete="off"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-8 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {comarca && (
                <button
                  type="button"
                  onClick={() => {
                    setComarca('');
                    setComarcaOpen(true);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-200"
                  title="Limpar comarca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {comarcaOpen && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-slate-950 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800/80">
                {filteredComarcas.length === 0 ? (
                  <div className="px-3 py-2.5 text-slate-500 italic text-[11px]">
                    Nenhum município mineiro encontrado para &quot;{comarca}&quot;.
                  </div>
                ) : (
                  filteredComarcas.map(city => {
                    const isExact = normalizeCitySearch(city) === normalizeCitySearch(comarca);
                    return (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          setComarca(city);
                          setComarcaOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between ${
                          isExact
                            ? 'bg-amber-500/20 text-amber-300 font-bold'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <span>{city}</span>
                        <span className="text-[10px] text-slate-500 font-mono">MG</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Solicitação (CEPOLC, SEI, Outros) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Solicitação *</span>
            </label>
            <select
              value={solicitacaoTipo}
              onChange={(e) => {
                const next = e.target.value as SolicitacaoOperacaoCanil;
                setSolicitacaoTipo(next);
                if (next !== 'Outros') setSolicitacaoOutrosDetalhes('');
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 font-semibold focus:outline-none focus:border-amber-500"
            >
              <option value="CEPOLC">CEPOLC</option>
              <option value="SEI">SEI</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
        </div>

        {/* Detalhe breve quando Solicitação === Outros */}
        {solicitacaoTipo === 'Outros' && (
          <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-3.5 text-xs">
            <label className="block text-[11px] font-bold text-amber-300 uppercase mb-1.5">
              Detalhe da Solicitação (Outros) *
            </label>
            <input
              type="text"
              value={solicitacaoOutrosDetalhes}
              onChange={(e) => setSolicitacaoOutrosDetalhes(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder="Informe brevemente a origem ou número da solicitação..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        )}

        {/* BLOCO 1B: VIATURAS UTILIZADAS NA OPERAÇÃO (MULTI-SELEÇÃO POR PLACA OU DESCRIÇÃO) */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-amber-400 uppercase font-mono flex items-center space-x-2">
                <Car className="w-4 h-4" />
                <span>Viaturas Utilizadas na Operação ({selectedViaturas.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Selecione uma ou mais viaturas da sua unidade pesquisando por <strong>placa</strong> ou <strong>descrição (marca e modelo)</strong>.
              </p>
            </div>
            {canManageViaturas && (
              <button
                type="button"
                onClick={openViaturaModal}
                className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-xl text-[11px] font-bold flex items-center space-x-1.5 transition shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar / Gerenciar Viaturas</span>
              </button>
            )}
          </div>

          {/* Viaturas selecionadas */}
          {selectedViaturas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedViaturas.map(v => (
                <span
                  key={v.id}
                  className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 text-xs font-semibold"
                >
                  <Car className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="font-mono font-black text-amber-300">{v.placa}</span>
                  <span className="text-slate-200">• {v.descricao}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveViaturaFromReport(v.id)}
                    className="text-cyan-300 hover:text-red-400 transition ml-1"
                    title="Remover viatura da operação"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Campo de busca por placa ou descrição */}
          <div ref={viaturaBoxRef} className="relative">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={viaturaSearch}
                onFocus={() => setViaturaDropdownOpen(true)}
                onChange={(e) => {
                  setViaturaSearch(e.target.value);
                  setViaturaDropdownOpen(true);
                }}
                placeholder="Buscar viatura da unidade por placa (ex: ABC-1D23) ou descrição (marca/modelo)..."
                autoComplete="off"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {viaturaSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setViaturaSearch('');
                    setViaturaDropdownOpen(true);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-200"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {viaturaDropdownOpen && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-slate-950 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800/80">
                {unitViaturas.length === 0 ? (
                  <div className="px-3.5 py-3 text-slate-400 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>
                      Nenhuma viatura cadastrada na unidade{effectiveUnitId ? '' : ' atual'}.
                      {canManageViaturas
                        ? ' Clique em "Cadastrar / Gerenciar Viaturas" para adicionar.'
                        : ' Solicite ao Administrador da unidade o cadastro das viaturas.'}
                    </span>
                  </div>
                ) : filteredAvailableViaturas.length === 0 ? (
                  <div className="px-3.5 py-2.5 text-slate-500 italic text-[11px]">
                    {viaturaSearch
                      ? `Nenhuma viatura disponível encontrada para "${viaturaSearch}".`
                      : 'Todas as viaturas cadastradas na unidade já foram adicionadas.'}
                  </div>
                ) : (
                  filteredAvailableViaturas.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleAddViaturaToReport(v)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="font-mono font-black text-amber-300 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded shrink-0">
                          {v.placa}
                        </span>
                        <span className="text-slate-200 font-semibold truncate">{v.descricao}</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center space-x-1 shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* BLOCO 2: OPERADORES (Criador + Operadores Caninos da Unidade, sem limite, 0/1/vários cães) */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-amber-400 uppercase font-mono flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Operadores da Operação ({operadores.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Adicione operadores caninos da sua unidade (sem limite). O animal vinculado a cada operador é sugerido automaticamente, podendo ser alterado, ter mais de um ou ficar sem animal.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-300 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 shrink-0">
              Total de cães na operação: <strong className="text-amber-400">{allDogsInReport.length}</strong>
            </span>
          </div>

          {/* Lista de Operadores adicionados */}
          <div className="space-y-2.5">
            {operadores.map(op => {
              const opDefaultDogs = getDefaultDogsForUser(op.userId);
              const isCreatorEntry = op.userId === (editingReport?.criadorId || currentUser.id);
              const availableDogsToAdd = activeDogs.filter(
                d => !op.cachorros.some(c => c.id === d.id)
              );

              return (
                <div
                  key={op.userId}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase shrink-0">
                        {isCreatorEntry ? 'Relator' : 'Operador Canino'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-100 truncate">{op.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {op.masp ? `MASP: ${formatMasp(op.masp)}` : ''}
                          {op.cargo ? ` • ${op.cargo}` : ''}
                        </p>
                      </div>
                    </div>

                    {operadores.length > 1 && !isCreatorEntry && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOperator(op.userId)}
                        className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>

                  {/* Animais deste operador */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/70">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center space-x-1">
                        <Dog className="w-3.5 h-3.5 text-amber-400" />
                        <span>Animal(is):</span>
                      </span>

                      {op.cachorros.length === 0 ? (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 italic text-[11px]">
                          Sem animal
                        </span>
                      ) : (
                        op.cachorros.map(dog => (
                          <span
                            key={dog.id}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] font-bold"
                          >
                            <Dog className="w-3 h-3 text-amber-400" />
                            <span>
                              {dog.nome}
                              {dog.raca ? ` (${dog.raca})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDogFromOperator(op.userId, dog.id)}
                              className="text-amber-300 hover:text-red-400 transition ml-0.5"
                              title="Remover animal deste operador"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {op.cachorros.length <= 1 ? (
                        <select
                          value={op.cachorros[0]?.id || ''}
                          onChange={(e) => handleReplaceSingleDogForOperator(op.userId, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Sem animal</option>
                          {activeDogs.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.nome} ({d.raca})
                              {opDefaultDogs.some(def => def.id === d.id) ? ' ★ Condutor' : ''}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {availableDogsToAdd.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => handleAddDogToOperator(op.userId, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-300 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">+ Acrescentar outro animal...</option>
                          {availableDogsToAdd.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.nome} ({d.raca})
                              {opDefaultDogs.some(def => def.id === d.id) ? ' ★ Condutor' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Adicionar novos Operadores Caninos da Unidade (lista oculta até digitar na busca) */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <label className="block text-[11px] font-bold text-slate-300 uppercase">
              Inserir Outro Operador Canino da Unidade
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={operatorSearch}
                onChange={(e) => setOperatorSearch(e.target.value)}
                placeholder="Digite o nome, MASP ou cargo para buscar um operador canino da unidade..."
                autoComplete="off"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {operatorSearch && (
                <button
                  type="button"
                  onClick={() => setOperatorSearch('')}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-200"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {operatorSearch.trim().length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">
                Digite o nome, MASP ou cargo acima para localizar e adicionar operadores caninos da unidade.
              </p>
            ) : eligibleOperators.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">
                Nenhum operador canino da unidade encontrado para &quot;{operatorSearch}&quot;.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {eligibleOperators.map(u => {
                  const suggestedDogs = getDefaultDogsForUser(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleAddOperator(u)}
                      className="text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 transition flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 truncate">{u.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {u.masp ? `MASP ${formatMasp(u.masp)}` : u.cargo || 'Operador Canino'}
                        </p>
                        {suggestedDogs.length > 0 && (
                          <p className="text-[10px] text-amber-400 truncate mt-0.5">
                            Cão sugerido: {suggestedDogs[0].nome}
                          </p>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* BLOCO 3: ALGUM MATERIAL ENCONTRADO? */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-black text-amber-400 uppercase font-mono flex items-center space-x-2">
                <Package className="w-4 h-4" />
                <span>Algum Material Encontrado? *</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Informe se houve localização de material ilícito ou de interesse policial durante a operação.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMaterialEncontrado(true)}
                className={`px-4 py-2 rounded-xl font-bold border transition ${
                  materialEncontrado
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                SIM
              </button>
              <button
                type="button"
                onClick={() => {
                  setMaterialEncontrado(false);
                  setMateriaisEncontrados([]);
                }}
                className={`px-4 py-2 rounded-xl font-bold border transition ${
                  !materialEncontrado
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                NÃO
              </button>
            </div>
          </div>

          {materialEncontrado && (
            <div className="space-y-4 pt-3 border-t border-slate-800">
              {/* Selectlist + Multi-select buttons para tipos de material */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                    Tipo de Material Encontrado (pode selecionar mais de um) *
                  </label>
                  <select
                    value=""
                    onChange={(e) => handleAddMaterialFromSelect(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione para adicionar material...</option>
                    {MATERIAIS_OPCOES.filter(opt => !materiaisEncontrados.some(m => m.tipo === opt)).map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  {MATERIAIS_OPCOES.map(opt => {
                    const selected = materiaisEncontrados.some(m => m.tipo === opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleToggleMaterialTipo(opt)}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 ${
                          selected
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${selected ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aviso se não houver cães no relatório */}
              {allDogsInReport.length === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl p-3 text-[11px] font-semibold">
                  Nenhum animal está vinculado aos operadores acima. Vincule ao menos um animal a um operador para informar qual animal encontrou o material.
                </div>
              )}

              {/* Seleção de qual(is) animal(is) achou cada material */}
              {materiaisEncontrados.length > 0 && allDogsInReport.length > 0 && (
                <div className="space-y-2.5">
                  <span className="block text-[11px] font-bold text-slate-300 uppercase">
                    Informe qual(is) animal(is) encontrou(ram) cada material *
                  </span>
                  {materiaisEncontrados.map(mat => (
                    <div
                      key={mat.tipo}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold text-xs">
                          {mat.tipo}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleMaterialTipo(mat.tipo)}
                          className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center space-x-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {allDogsInReport.map(dog => {
                          const isSelected = mat.cachorros.some(c => c.id === dog.id);
                          return (
                            <button
                              key={dog.id}
                              type="button"
                              onClick={() => handleToggleDogForMaterial(mat.tipo, dog)}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                                  : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-amber-500/50'
                              }`}
                            >
                              <Dog className="w-3.5 h-3.5" />
                              <span>
                                {dog.nome}
                                {dog.raca ? ` (${dog.raca})` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {mat.cachorros.length === 0 && (
                        <p className="text-[11px] text-amber-400 font-semibold">
                          Selecione ao menos um animal acima que localizou: {mat.tipo}.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BLOCO 4: DETALHAMENTO DA OPERAÇÃO (ATÉ 1000 CARACTERES) */}
        <div className="text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-bold text-slate-300 uppercase text-[11px]">
              Detalhamento da Operação *
            </label>
            <span
              className={`font-mono text-[11px] ${
                detalhamento.length >= 950 ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {detalhamento.length} / 1000 caracteres
            </span>
          </div>
          <textarea
            value={detalhamento}
            onChange={(e) => setDetalhamento(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={5}
            placeholder="Descreva o contexto da operação, locais vistoriados, atuação dos cães K9, resultados obtidos e demais observações relevantes..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
          {editingReport && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancelEdit}
              className="px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
            >
              <X className="w-4 h-4" />
              <span>Cancelar Edição</span>
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{editingReport ? 'Salvar Alterações' : 'Salvar Relatório de Operação'}</span>
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(true)}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg transition"
          >
            <Printer className="w-4 h-4" />
            <span>{editingReport ? 'Salvar Alterações e Imprimir' : 'Salvar e Imprimir Relatório'}</span>
          </button>
        </div>
      </div>

      {/* MODAL DE CADASTRO E GERENCIAMENTO DE VIATURAS (APENAS ADMINISTRADOR / GERAL) */}
      {showViaturaModal && canManageViaturas && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto my-auto text-xs">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-100 font-mono text-sm uppercase">
                    Cadastro de Viaturas da Unidade
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Unidade vinculada: <strong className="text-amber-300">{manageableUnitName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowViaturaModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {viaturaModalError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between">
                  <span>{viaturaModalError}</span>
                  <button type="button" onClick={() => setViaturaModalError(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {viaturaModalSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between">
                  <span>{viaturaModalSuccess}</span>
                  <button type="button" onClick={() => setViaturaModalSuccess(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Se Geral sem unidade fixa, permite escolher a unidade */}
              {isGeral && !currentUser.unitId && units.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                    Unidade de Destino
                  </label>
                  <select
                    value={viaturaTargetUnitId}
                    onChange={(e) => setViaturaTargetUnitId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Formulário: APENAS Descrição (Marca e Modelo) e Placa (AAA-XAXX) */}
              <form onSubmit={handleSaveViaturaModal} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-amber-400 uppercase font-mono">
                    {editingViaturaId ? 'Editar Viatura' : 'Nova Viatura'}
                  </span>
                  {editingViaturaId && (
                    <button
                      type="button"
                      onClick={handleCancelEditViatura}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                      Descrição (Marca e Modelo) *
                    </label>
                    <input
                      type="text"
                      value={viaturaDescricaoInput}
                      onChange={(e) => setViaturaDescricaoInput(e.target.value.slice(0, 160))}
                      maxLength={160}
                      placeholder="Ex.: Toyota Hilux 4x4, Mitsubishi L200 Triton..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                      Placa (AAA-XAXX) *
                    </label>
                    <input
                      type="text"
                      value={viaturaPlacaInput}
                      onChange={(e) => setViaturaPlacaInput(formatPlacaViatura(e.target.value))}
                      maxLength={8}
                      placeholder="ABC-1D23"
                      autoComplete="off"
                      className={`w-full bg-slate-900 border rounded-xl px-3 py-2.5 text-slate-100 font-mono font-black uppercase tracking-wider placeholder-slate-600 focus:outline-none ${
                        viaturaPlacaInput.length > 0 && isValidPlacaViatura(viaturaPlacaInput)
                          ? 'border-emerald-500/60 focus:border-emerald-400'
                          : 'border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  Padrão obrigatório da placa: <span className="font-mono text-amber-300 font-bold">AAA-XAXX</span> — onde{' '}
                  <strong className="text-slate-200">A</strong> aceita somente letras maiúsculas e{' '}
                  <strong className="text-slate-200">X</strong> aceita somente números (ex.: <span className="font-mono">QWE-4R56</span>).
                </p>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={viaturaSaving}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold rounded-xl flex items-center space-x-1.5 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {viaturaSaving
                        ? 'Salvando...'
                        : editingViaturaId
                        ? 'Atualizar Viatura'
                        : 'Cadastrar Viatura'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Lista de Viaturas já cadastradas na unidade */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-black text-slate-300 uppercase font-mono">
                  Viaturas Cadastradas na Unidade ({manageableViaturas.length})
                </h4>
                {manageableViaturas.length === 0 ? (
                  <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-center text-slate-500 italic">
                    Nenhuma viatura cadastrada nesta unidade até o momento.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manageableViaturas.map(v => {
                      const isConfirmingDel = confirmDeleteViaturaId === v.id;
                      return (
                        <div
                          key={v.id}
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className="font-mono font-black text-amber-300 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded shrink-0">
                              {v.placa}
                            </span>
                            <span className="font-semibold text-slate-200 truncate">{v.descricao}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isConfirmingDel ? (
                              <>
                                <button
                                  type="button"
                                  disabled={viaturaSaving}
                                  onClick={() => handleConfirmDeleteViatura(v.id)}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-bold transition"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteViaturaId(null)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditViatura(v)}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg transition"
                                  title="Editar viatura"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteViaturaId(v.id)}
                                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition"
                                  title="Excluir viatura"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
