import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import {
  CalendarRecord,
  User,
  AcademyCourse,
  LessonPlan,
  EquipeCalendario,
  ProfessorEquipe,
  InstrutorItem,
  AuxiliarTabelaEquipe,
  AuxiliarTabelaEquipeItem,
  CourseClass,
  EquipeProfessoresCursoFormacao,
  DesignacaoEquipeTurmaCftp,
  TurmaCftp
} from '../types';
import { storage } from '../services/storage';
import { buildStandardDocumentTitle, printWithWindowTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import { formatMasp, formatPhone } from '../utils/masks';
import { TopLayerAlert } from './TopLayerAlert';
import {
  Calendar,
  Clock,
  Upload,
  Plus,
  Trash2,
  Filter,
  Search,
  CheckCircle,
  AlertCircle,
  MapPin,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CalendarDays,
  Layers,
  Printer,
  Edit3,
  Eye,
  BookOpen,
  Award,
  Users,
  FileText
} from 'lucide-react';

interface CalendarModuleProps {
  currentUser: User | null;
}

// Fixed Time Slots (No 20min interval breaks, only Lunch break)
const TIME_SLOTS = [
  { id: 'slot1', label: '08:00 as 09:40', type: 'class', name: '1ª Aula' },
  { id: 'slot2', label: '10:00 as 11:40', type: 'class', name: '2ª Aula' },
  { id: 'lunch', label: '11:40 as 14:00', type: 'break', name: 'Intervalo de Almoço' },
  { id: 'slot3', label: '14:00 as 15:40', type: 'class', name: '3ª Aula' },
  { id: 'slot4', label: '16:00 as 17:40', type: 'class', name: '4ª Aula' }
] as const;

interface CftpSlotRowDef {
  id: 'slot1' | 'slot2' | 'lunch' | 'slot3' | 'slot4' | 'slot5';
  period: 'MANHÃ' | 'ALMOÇO' | 'TARDE' | 'NOITE';
  title: string;
  timeLabel: string;
  type: 'class' | 'break';
  order: number;
}

const CFTP_STANDARD_SLOTS: CftpSlotRowDef[] = [
  { id: 'slot1', period: 'MANHÃ', title: '1º Horário', timeLabel: '08h00 às 09h40min', type: 'class', order: 1 },
  { id: 'slot2', period: 'MANHÃ', title: '2º Horário', timeLabel: '10h00 às 11h40min', type: 'class', order: 2 },
  { id: 'lunch', period: 'ALMOÇO', title: 'Horário de Almoço', timeLabel: '12h00 às 14h00', type: 'break', order: 2.5 },
  { id: 'slot3', period: 'TARDE', title: '3º Horário', timeLabel: '14h00 às 15h40min', type: 'class', order: 3 },
  { id: 'slot4', period: 'TARDE', title: '4º Horário', timeLabel: '16h00 às 17h40min', type: 'class', order: 4 }
];

const CFTP_FIFTH_SLOT: CftpSlotRowDef = {
  id: 'slot5',
  period: 'NOITE',
  title: '5º Horário',
  timeLabel: '18h00 às 19h40min',
  type: 'class',
  order: 5
};

const normalizeCftpHorarioKey = (rawHora: any): 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' => {
  const h = String(rawHora || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (h.includes('5o') || h.includes('5º') || h.includes('5°') || h.includes('5ª') || h.includes('5a') || h.includes('18:') || h.includes('18h') || h.includes('19:')) {
    return 'slot5';
  }
  if (h.includes('4o') || h.includes('4º') || h.includes('4°') || h.includes('4ª') || h.includes('4a') || h.includes('16:') || h.includes('16h')) {
    return 'slot4';
  }
  if (h.includes('3o') || h.includes('3º') || h.includes('3°') || h.includes('3ª') || h.includes('3a') || h.includes('14:') || h.includes('14h')) {
    return 'slot3';
  }
  if (h.includes('2o') || h.includes('2º') || h.includes('2°') || h.includes('2ª') || h.includes('2a') || h.includes('10:') || h.includes('10h')) {
    return 'slot2';
  }
  return 'slot1';
};

const normalizeCftpDateToIso = (raw: string): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const dashBrMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dashBrMatch) return `${dashBrMatch[3]}-${dashBrMatch[2]}-${dashBrMatch[1]}`;
  return '';
};

const normCftpTurmaKey = (raw: string): string => {
  const noAccent = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  const compact = noAccent.replace(/[\s\-_]+/g, '');
  if (!compact) return '';
  const m = compact.match(/^([A-Z]{1,6})0*(\d{1,3})([A-Z]*)$/);
  if (m) {
    const num = parseInt(m[2], 10);
    if (!isNaN(num) && num > 0) {
      return `${m[1]}${String(num).padStart(2, '0')}${m[3] || ''}`;
    }
  }
  return compact;
};

const formatCftpTurmaLabel = (raw: string): string => {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const noAccent = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/\bUNICA\b/.test(noAccent)) {
    const prefixMatch = noAccent.match(/\b(DL|IP|EP|ML|PC)\b/);
    if (prefixMatch) return `${prefixMatch[1]} Única`;
    const beforeUnica = trimmed.replace(/\b[uú]nica\b/i, '').trim().toUpperCase();
    return beforeUnica ? `${beforeUnica} Única` : 'Única';
  }
  const compact = noAccent.replace(/[\s\-_]+/g, '');
  const m = compact.match(/^([A-Z]{1,6})0*(\d{1,3})([A-Z]*)$/);
  if (m) {
    const num = parseInt(m[2], 10);
    if (!isNaN(num) && num > 0) {
      return `${m[1]}${String(num).padStart(2, '0')}${m[3] || ''}`;
    }
  }
  return trimmed.replace(/\s+/g, '').toUpperCase();
};

const formatIsoToBr = (iso?: string): string => {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Helper to normalize any time slot text before saving or filtering
const normalizeTimeSlot = (rawHora: any): string => {
  if (rawHora === null || rawHora === undefined) return '08:00 as 09:40';
  const str = String(rawHora).trim();
  if (!str) return '08:00 as 09:40';
  const h = str.toLowerCase();

  if (
    h.includes('4º') ||
    h.includes('4°') ||
    h.includes('4ª') ||
    h.includes('4a') ||
    h.includes('4o') ||
    h.includes('16:') ||
    h.includes('16h')
  ) {
    return '16:00 as 17:40';
  }

  if (
    h.includes('3º') ||
    h.includes('3°') ||
    h.includes('3ª') ||
    h.includes('3a') ||
    h.includes('3o') ||
    h.includes('14:') ||
    h.includes('14h')
  ) {
    return '14:00 as 15:40';
  }

  if (
    h.includes('2º') ||
    h.includes('2°') ||
    h.includes('2ª') ||
    h.includes('2a') ||
    h.includes('2o') ||
    h.includes('10:') ||
    h.includes('10h')
  ) {
    return '10:00 as 11:40';
  }

  if (
    h.includes('1º') ||
    h.includes('1°') ||
    h.includes('1ª') ||
    h.includes('1a') ||
    h.includes('1o') ||
    h.includes('08:') ||
    h.includes('8:') ||
    h.includes('8h')
  ) {
    return '08:00 as 09:40';
  }

  return str;
};

/**
 * Formats turma code according to rules:
 * - Separates letter abbreviation and number with a space.
 * - If the number has a single digit (1-9), pads with a leading zero (e.g., 'DL1' -> 'DL 01', 'MC2' -> 'MC 02').
 * - Preserves double or multi-digit numbers with space (e.g., 'DL10' -> 'DL 10').
 */
export const formatTurmaCode = (raw: any): string => {
  if (raw === null || raw === undefined) return 'DL 01';
  let str = String(raw).trim();
  if (!str) return 'DL 01';

  // Normalize spaces
  str = str.replace(/\s+/g, ' ');

  // Match pattern: [letters][optional separator][digits][optional suffix]
  const match = str.match(/^([A-Za-zÀ-ÿ]+)[_\-\s]*(\d+)(.*)$/);
  if (match) {
    const prefix = match[1].toUpperCase();
    const numStr = match[2];
    const suffix = match[3] ? match[3].trim().toUpperCase() : '';

    const formattedNum = numStr.length === 1 ? numStr.padStart(2, '0') : numStr;

    return `${prefix} ${formattedNum}${suffix ? ' ' + suffix : ''}`.trim();
  }

  if (/^\d+$/.test(str)) {
    return str.length === 1 ? str.padStart(2, '0') : str;
  }

  return str.toUpperCase();
};

interface CalendarDayInfo {
  dateStr: string;
  formattedDate: string;
  dayNum: number;
  dayName: string;
  isCurrentMonth: boolean;
}

interface CalendarWeekInfo {
  weekNum: number;
  days: CalendarDayInfo[];
}

const getMonthWeeks = (year: number, month: number): CalendarWeekInfo[] => {
  const weeks: CalendarWeekInfo[] = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let current = new Date(firstDayOfMonth);
  while (current.getDay() !== 1) {
    current.setDate(current.getDate() - 1);
  }

  let weekCount = 1;
  const dayNames = ['Dom', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA-FEIRA', 'Sáb'];

  while (current <= lastDayOfMonth) {
    const days: CalendarDayInfo[] = [];
    for (let i = 0; i < 5; i++) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const formattedDate = `${d}/${m}/${y}`;

      days.push({
        dateStr,
        formattedDate,
        dayNum: current.getDate(),
        dayName: dayNames[current.getDay()],
        isCurrentMonth: current.getMonth() === month
      });

      current.setDate(current.getDate() + 1);
    }

    current.setDate(current.getDate() + 2);

    if (days.some((d) => d.isCurrentMonth)) {
      weeks.push({ weekNum: weekCount++, days });
    }
  }

  return weeks;
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const PRESET_MODULES = [
  'Módulo I',
  'Módulo II',
  'Módulo III',
  'Módulo IV',
  'Módulo V',
  'Módulo Único',
  'Módulo Especial'
];

const DEFAULT_FORMACAO_COURSES = [
  'Curso de Formação de Delegados de Polícia',
  'Curso de Formação de Investigadores de Polícia',
  'Curso de Formação de Escrivães de Polícia',
  'Curso de Formação de Médicos Legistas',
  'Curso de Formação de Peritos Criminais'
];

const TEAM_NAMES_LIST = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf',
  'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November',
  'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform',
  'Victor', 'Whiskey', 'X-Ray', 'Yankee', 'Zulu'
];

export const CalendarModule: React.FC<CalendarModuleProps> = ({ currentUser }) => {
  const [records, setRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Available Formação Courses from Storage
  const [formacaoCoursesList, setFormacaoCoursesList] = useState<
    { name: string; module?: string; year?: number }[]
  >([]);
  const [cftpCourses, setCftpCourses] = useState<AcademyCourse[]>([]);
  const [equipesCftpList, setEquipesCftpList] = useState<EquipeProfessoresCursoFormacao[]>([]);
  const [designacoesCftpList, setDesignacoesCftpList] = useState<DesignacaoEquipeTurmaCftp[]>([]);
  const [turmasCftpList, setTurmasCftpList] = useState<TurmaCftp[]>([]);

  // Mode: 'cftp' (Calendário por Curso de Formação CFTP) or 'meu-relatorio' (Meu Relatório de Aulas)
  const [calendarViewMode, setCalendarViewMode] = useState<'cftp' | 'meu-relatorio' | 'legacy'>('cftp');
  const [selectedCftpCourseId, setSelectedCftpCourseId] = useState<string>('');
  const [cftpSelectedSubject, setCftpSelectedSubject] = useState<string>('');
  const [cftpFilterTurma, setCftpFilterTurma] = useState<string>('TODAS');
  const [cftpFilterSala, setCftpFilterSala] = useState<string>('TODAS');
  const [cftpShowAllMonths, setCftpShowAllMonths] = useState<boolean>(false);
  const [reportCourseId, setReportCourseId] = useState<string>('');
  const [reportSubjectFilter, setReportSubjectFilter] = useState<string>('TODAS');
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear() > 2020 ? new Date().getFullYear() : 2026);
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth());
  const [cftpDetailCell, setCftpDetailCell] = useState<{
    isoDate: string;
    brDate: string;
    slotTitle: string;
    slotTime: string;
    turma: string;
    aulaNumero: number;
    sigla: string;
    disciplina: string;
    sala: string;
    equipeApelido?: string;
    professores: Array<{ nome: string; sigla: string }>;
  } | null>(null);

  // Selected Subject/Discipline Filter - REQUIRED TO START CALENDAR (Legacy mode)
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('');

  // Date filters (defaults to current year/month or June 2026)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear() > 2020 ? now.getFullYear() : 2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed

  // Secondary Filters
  const [filterTurma, setFilterTurma] = useState<string>('TODAS');
  const [filterSala, setFilterSala] = useState<string>('TODAS');
  const [filterEquipe, setFilterEquipe] = useState<string>('TODAS');
  const [filterModulo, setFilterModulo] = useState<string>('TODOS');
  const [filterAno, setFilterAno] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals & Detail Popups
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  const [showEquipeModal, setShowEquipeModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printOption, setPrintOption] = useState<'month' | 'all'>('month');
  const [printMonthChoice, setPrintMonthChoice] = useState<number>(selectedMonth);
  const [printYearChoice, setPrintYearChoice] = useState<number>(selectedYear);
  const [isPrintingAllMonths, setIsPrintingAllMonths] = useState<boolean>(false);
  const [detailRecord, setDetailRecord] = useState<CalendarRecord | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [previewRecords, setPreviewRecords] = useState<CalendarRecord[]>([]);
  const [importing, setImporting] = useState<boolean>(false);

  // Equipes state & Auxiliar Tabela Equipe state
  const [equipesList, setEquipesList] = useState<EquipeCalendario[]>([]);
  const [auxiliarEquipesList, setAuxiliarEquipesList] = useState<AuxiliarTabelaEquipe[]>([]);
  const [createdTurmasList, setCreatedTurmasList] = useState<CourseClass[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [editingEquipeId, setEditingEquipeId] = useState<string | null>(null);
  const [equipeModalTab, setEquipeModalTab] = useState<'auxiliar' | 'base'>('auxiliar');

  // Helper to get complete course period dates
  const getCoursePeriodDates = () => {
    const academyCourses = storage.getAcademyCourses ? storage.getAcademyCourses() : [];
    const validCourses = academyCourses.filter((c) => c.startDate && c.endDate);
    if (validCourses.length > 0) {
      const startDates = validCourses.map((c) => c.startDate!).sort();
      const endDates = validCourses.map((c) => c.endDate!).sort();
      return {
        start: startDates[0],
        end: endDates[endDates.length - 1]
      };
    }

    if (records && records.length > 0) {
      const validRecordDates = records.map((r) => r.data_calendario).filter(Boolean).sort();
      if (validRecordDates.length > 0) {
        return {
          start: validRecordDates[0],
          end: validRecordDates[validRecordDates.length - 1]
        };
      }
    }

    return { start: '2026-01-01', end: '2026-12-31' };
  };

  // Auxiliar Tabela Equipe Form State
  const [editingAuxId, setEditingAuxId] = useState<string | null>(null);
  const [auxForm, setAuxForm] = useState({
    nome_da_equipe: 'Alpha',
    codigo_turma: 'DL 01',
    materia: 'MEAF',
    professor_titular_nome: '',
    sigla_professor: '',
    data_inicio: '2026-01-01',
    data_fim: '2026-12-31',
    observacao: ''
  });

  const [auxInstrutoresForm, setAuxInstrutoresForm] = useState<{ nome: string; sigla: string }[]>([]);

  const handleAddAuxInstrutorRow = () => {
    setAuxInstrutoresForm((prev) => [...prev, { nome: '', sigla: '' }]);
  };

  const handleRemoveAuxInstrutorRow = (index: number) => {
    setAuxInstrutoresForm((prev) => prev.filter((_, i) => i !== index));
  };

  const resetAuxForm = () => {
    const period = getCoursePeriodDates();
    setAuxForm({
      nome_da_equipe: 'Alpha',
      codigo_turma: 'DL 01',
      materia: selectedDiscipline || 'MEAF',
      professor_titular_nome: '',
      sigla_professor: '',
      data_inicio: period.start,
      data_fim: period.end,
      observacao: ''
    });
    setAuxInstrutoresForm([]);
    setEditingAuxId(null);
  };

  const [equipeForm, setEquipeForm] = useState({
    nome_da_equipe: 'Alpha',
    materia: 'MEAF',
    tipo_curso: 'Curso de Formação',
    nome_do_curso: '',
    professor_titular_id: '',
    professor_titular_equipe: '',
    sigla_professor: ''
  });

  const [instrutoresForm, setInstrutoresForm] = useState<InstrutorItem[]>([
    { rotulo: 'Instrutor 02', instrutorNome: '', siglaInstrutor: '' }
  ]);

  const handleAddInstrutorRow = () => {
    setInstrutoresForm((prev) => [
      ...prev,
      { rotulo: `Instrutor 0${prev.length + 2}`, instrutorNome: '', siglaInstrutor: '' }
    ]);
  };

  const handleRemoveInstrutorRow = (index: number) => {
    setInstrutoresForm((prev) => {
      const filtered = prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ rotulo: 'Instrutor 02', instrutorNome: '', siglaInstrutor: '' }];
      return filtered.map((item, idx) => ({
        ...item,
        rotulo: `Instrutor 0${idx + 2}`
      }));
    });
  };

  const handleSelectTitularUser = (userName: string) => {
    const matchedUser = systemUsers.find((u) => u.name === userName);
    const userSigla = matchedUser?.professorSigla || matchedUser?.professor_sigla || '';
    setEquipeForm((prev) => ({
      ...prev,
      professor_titular_equipe: userName,
      sigla_professor: userSigla ? userSigla.toUpperCase() : prev.sigla_professor
    }));
  };

  const handleSelectInstrutorUser = (index: number, userName: string) => {
    const matchedUser = systemUsers.find((u) => u.name === userName);
    const userSigla = matchedUser?.professorSigla || matchedUser?.professor_sigla || '';
    setInstrutoresForm((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        instrutorNome: userName,
        siglaInstrutor: userSigla ? userSigla.toUpperCase() : copy[index].siglaInstrutor,
        rotulo: `Instrutor 0${index + 2}`
      };
      return copy;
    });
  };

  const handleUpdateInstrutorRow = (index: number, field: 'instrutorNome' | 'siglaInstrutor' | 'rotulo', value: string) => {
    setInstrutoresForm((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const resetEquipeForm = () => {
    const defaultCourse = formacaoCoursesList[0]?.name || DEFAULT_FORMACAO_COURSES[0];
    setEquipeForm({
      nome_da_equipe: 'Alpha',
      materia: selectedDiscipline || 'MEAF',
      tipo_curso: 'Curso de Formação',
      nome_do_curso: defaultCourse,
      professor_titular_id: '',
      professor_titular_equipe: '',
      sigla_professor: ''
    });
    setInstrutoresForm([{ rotulo: 'Instrutor 02', instrutorNome: '', siglaInstrutor: '' }]);
    setEditingEquipeId(null);
  };

  // Custom course selector helper state
  const [isCustomCourse, setIsCustomCourse] = useState<boolean>(false);

  // Manual Add/Edit Form State
  const [formState, setFormState] = useState<Partial<CalendarRecord>>({
    data_calendario: new Date().toISOString().split('T')[0],
    horario_calendario: '10:00 as 11:40',
    turma_calendario: 'DL 01',
    sigla_calendario: 'MEAF',
    disciplina_calendario: 'Manuseio e Emprego de Armas de Fogo',
    sala_calendario: 'SL01',
    curso_calendario: 'Curso de Formação de Delegados de Polícia',
    modulo_calendario: 'Módulo I',
    ano_calendario: 2026,
    numero_aula_calendario: 1,
    equipe_calendario: 'Equipe Alpha',
    observacao_calendario: ''
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await storage.refreshFromServer();
      const loaded = storage.getCalendarRecords().map(r => ({
        ...r,
        turma_calendario: formatTurmaCode(r.turma_calendario)
      }));
      setRecords(loaded);

      // Load Equipes, Auxiliar Equipes & Users
      const loadedEquipes = storage.getEquipesCalendario ? storage.getEquipesCalendario() : [];
      setEquipesList(loadedEquipes);

      const loadedAuxiliar = storage.getAuxiliarTabelaEquipe ? storage.getAuxiliarTabelaEquipe() : [];
      setAuxiliarEquipesList(loadedAuxiliar);

      const loadedUsers = storage.getUsersForFormacao
        ? storage.getUsersForFormacao(currentUser)
        : (storage.getUsers ? storage.getUsers() : []);
      setSystemUsers(loadedUsers);

      // Load Cursos de Formação CFTP, Equipes, Designações e Turmas
      const academyCourses = storage.getAcademyCourses ? storage.getAcademyCourses() : [];
      const onlyFormacao = academyCourses.filter((c: AcademyCourse) => c.type === 'Formação');
      setCftpCourses(onlyFormacao);
      if (onlyFormacao.length > 0) {
        setReportCourseId(prev => prev || onlyFormacao[0].id);
      }
      setEquipesCftpList(storage.getEquipesProfessoresCftp ? storage.getEquipesProfessoresCftp() : []);
      setDesignacoesCftpList(storage.getDesignacoesEquipeCftp ? storage.getDesignacoesEquipeCftp() : []);
      setTurmasCftpList(storage.getTurmasCftp ? storage.getTurmasCftp() : []);

      const lessonPlans = storage.getLessonPlans ? storage.getLessonPlans() : [];
      const courseClasses = storage.getCourseClasses ? storage.getCourseClasses() : [];
      setCreatedTurmasList(courseClasses);

      const combined: { name: string; code?: string; dates?: string; module?: string; year?: number }[] = [];

      DEFAULT_FORMACAO_COURSES.forEach((c) => {
        combined.push({
          name: c,
          code: 'CFP-2026',
          dates: '2026-01-01 a 2026-12-31',
          module: 'Módulo I',
          year: 2026
        });
      });

      academyCourses.forEach((ac: AcademyCourse) => {
        if (ac.name && !combined.some((c) => c.name.toLowerCase() === ac.name.toLowerCase())) {
          const datesStr = ac.startDate && ac.endDate
            ? `${ac.startDate} a ${ac.endDate}`
            : (ac.dates && ac.dates.length > 0 ? ac.dates.join(', ') : '2026-01-01 a 2026-12-31');
          combined.push({
            name: ac.name,
            code: ac.code || 'CFP-2026',
            dates: datesStr,
            module: ac.module || 'Módulo I',
            year: ac.startDate ? new Date(ac.startDate).getFullYear() : 2026
          });
        }
      });

      lessonPlans.forEach((lp: LessonPlan) => {
        if (lp.name && !combined.some((c) => c.name.toLowerCase() === lp.name.toLowerCase())) {
          combined.push({
            name: lp.name,
            code: 'CFP-2026',
            dates: '2026-01-01 a 2026-12-31',
            module: 'Módulo I',
            year: lp.year || 2026
          });
        }
      });

      courseClasses.forEach((cc) => {
        if (cc.courseName && !combined.some((c) => c.name.toLowerCase() === cc.courseName.toLowerCase())) {
          combined.push({
            name: cc.courseName,
            code: cc.code || 'CFP-2026',
            dates: '2026-01-01 a 2026-12-31',
            module: 'Módulo I',
            year: 2026
          });
        }
      });

      setFormacaoCoursesList(combined);

      // Set default course for equipe form if empty
      if (!equipeForm.nome_do_curso && combined.length > 0) {
        setEquipeForm((prev) => ({ ...prev, nome_do_curso: combined[0].name }));
      }
    } catch (err: any) {
      showToast('error', 'Erro ao carregar os dados do calendário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEquipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipeForm.nome_da_equipe || !equipeForm.materia || !equipeForm.nome_do_curso) {
      showToast('error', 'Preencha o Nome da Equipe, Matéria e Curso.');
      return;
    }

    const selectedCourseObj = formacaoCoursesList.find((c) => c.name === equipeForm.nome_do_curso);

    const payload: Partial<EquipeCalendario> = {
      id: editingEquipeId || undefined,
      nome_da_equipe: equipeForm.nome_da_equipe,
      materia: equipeForm.materia,
      tipo_curso: 'Curso de Formação',
      nome_do_curso: equipeForm.nome_do_curso,
      codigo_curso: selectedCourseObj?.code || 'CFP-2026',
      dates_curso: selectedCourseObj?.dates || '2026-01-01 a 2026-12-31',
      modulo: selectedCourseObj?.module || 'Módulo I',
      ano: new Date().getFullYear().toString(),
      professor_titular_equipe: equipeForm.professor_titular_equipe,
      sigla_professor: equipeForm.sigla_professor,
      instrutores: instrutoresForm
        .filter((i) => i.instrutorNome.trim() || i.siglaInstrutor.trim())
        .map((item, idx) => ({
          ...item,
          rotulo: item.rotulo || `Instrutor 0${idx + 2}`
        }))
    };

    const res = await storage.saveEquipeCalendario(payload);
    if (res.success) {
      showToast('success', editingEquipeId ? 'Equipe atualizada com sucesso!' : 'Equipe cadastrada com sucesso!');
      resetEquipeForm();
      await loadData();
    } else {
      showToast('error', 'Erro ao salvar equipe: ' + (res.error || ''));
    }
  };

  const handleDeleteEquipe = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir esta equipe?')) return;
    const res = await storage.deleteEquipeCalendario(id);
    if (res.success) {
      showToast('success', 'Equipe excluída com sucesso!');
      await loadData();
    } else {
      showToast('error', 'Erro ao excluir equipe: ' + (res.error || ''));
    }
  };

  // --- AUXILIAR TABELA EQUIPE HANDLERS ---
  const handleSaveAuxiliarEquipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auxForm.nome_da_equipe || !auxForm.codigo_turma || !auxForm.materia || !auxForm.data_inicio || !auxForm.data_fim) {
      showToast('error', 'Preencha Nome da Equipe, Turma, Matéria, Data Início e Data Fim.');
      return;
    }

    const profsList: AuxiliarTabelaEquipeItem[] = [];

    if (auxForm.professor_titular_nome.trim() || auxForm.sigla_professor.trim()) {
      profsList.push({
        nome: auxForm.professor_titular_nome.trim(),
        sigla: auxForm.sigla_professor.trim().toUpperCase(),
        tipo: 'TITULAR'
      });
    }

    auxInstrutoresForm.forEach((inst) => {
      if (inst.nome.trim() || inst.sigla.trim()) {
        profsList.push({
          nome: inst.nome.trim(),
          sigla: inst.sigla.trim().toUpperCase(),
          tipo: 'INSTRUTOR'
        });
      }
    });

    const payload: Partial<AuxiliarTabelaEquipe> = {
      id: editingAuxId || undefined,
      nome_da_equipe: auxForm.nome_da_equipe,
      codigo_turma: formatTurmaCode(auxForm.codigo_turma),
      materia: auxForm.materia,
      professor_titular_nome: auxForm.professor_titular_nome,
      sigla_professor: auxForm.sigla_professor,
      professores: profsList,
      data_inicio: auxForm.data_inicio,
      data_fim: auxForm.data_fim,
      observacao: auxForm.observacao
    };

    const res = await storage.saveAuxiliarTabelaEquipe(payload);
    if (res.success) {
      showToast('success', editingAuxId ? 'Vínculo da equipe atualizado com sucesso!' : 'Vínculo da equipe criado na Tabela Auxiliar!');
      resetAuxForm();
      await loadData();
    } else {
      showToast('error', 'Erro ao salvar vínculo na tabela auxiliar: ' + (res.error || ''));
    }
  };

  const handleDeleteAuxiliarEquipe = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este vínculo da tabela auxiliar de equipe?')) return;
    const res = await storage.deleteAuxiliarTabelaEquipe(id);
    if (res.success) {
      showToast('success', 'Vínculo excluído com sucesso!');
      await loadData();
    } else {
      showToast('error', 'Erro ao excluir vínculo: ' + (res.error || ''));
    }
  };

  const handleEditAuxiliarEquipe = (aux: AuxiliarTabelaEquipe) => {
    setEditingAuxId(aux.id);
    setAuxForm({
      nome_da_equipe: aux.nome_da_equipe || 'Alpha',
      codigo_turma: aux.codigo_turma || 'DL 01',
      materia: aux.materia || selectedDiscipline || 'MEAF',
      professor_titular_nome: aux.professor_titular_nome || '',
      sigla_professor: aux.sigla_professor || '',
      data_inicio: aux.data_inicio || '2026-01-01',
      data_fim: aux.data_fim || '2026-05-01',
      observacao: aux.observacao || ''
    });

    const insts = (aux.professores || [])
      .filter((p) => p.tipo !== 'TITULAR')
      .map((p) => ({ nome: p.nome || '', sigla: p.sigla || '' }));
    setAuxInstrutoresForm(insts);
  };

  const handleEditEquipe = (eq: EquipeCalendario) => {
    setEditingEquipeId(eq.id);
    setEquipeForm({
      nome_da_equipe: eq.nome_da_equipe || 'Alpha',
      materia: eq.materia || 'MEAF',
      tipo_curso: 'Curso de Formação',
      nome_do_curso: eq.nome_do_curso || (formacaoCoursesList[0]?.name || ''),
      professor_titular_id: '',
      professor_titular_equipe: eq.professor_titular_equipe || '',
      sigla_professor: eq.sigla_professor || ''
    });

    if (eq.instrutores && eq.instrutores.length > 0) {
      setInstrutoresForm(eq.instrutores.map((i) => ({ instrutorNome: i.instrutorNome || '', siglaInstrutor: i.siglaInstrutor || '' })));
    } else if (eq.instrutor_equipe || eq.sigla_instrutor) {
      setInstrutoresForm([{ instrutorNome: eq.instrutor_equipe || '', siglaInstrutor: eq.sigla_instrutor || '' }]);
    } else {
      setInstrutoresForm([{ instrutorNome: '', siglaInstrutor: '' }]);
    }
  };


  useEffect(() => {
    loadData();
  }, []);

  // --- LESSON NUMBERING LOGIC (Per Turma + Sigla) ---
  // Calculates sequential lesson index for each class based on (turma_calendario + sigla_calendario)
  const sortedAllRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      if (a.data_calendario !== b.data_calendario) {
        return a.data_calendario.localeCompare(b.data_calendario);
      }
      return a.horario_calendario.localeCompare(b.horario_calendario);
    });
  }, [records]);

  const getCalculatedLessonNumber = (rec: CalendarRecord): number => {
    const turma = (rec.turma_calendario || '').trim().toUpperCase();
    const sigla = (rec.sigla_calendario || rec.disciplina_calendario || '').trim().toUpperCase();

    const matchingSeries = sortedAllRecords.filter((r) => {
      const rTurma = (r.turma_calendario || '').trim().toUpperCase();
      const rSigla = (r.sigla_calendario || r.disciplina_calendario || '').trim().toUpperCase();
      if (turma && rTurma) {
        return rTurma === turma && rSigla === sigla;
      }
      return rSigla === sigla;
    });

    const index = matchingSeries.findIndex((r) => r.id === rec.id);
    return index >= 0 ? index + 1 : (rec.numero_aula_calendario ? Number(String(rec.numero_aula_calendario).replace(/\D/g, '')) || 1 : 1);
  };

  // --- EXCEL & PDF IMPORT PARSER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    // PDF IMPORT HANDLER
    if (fileName.endsWith('.pdf')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
        }
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const extractedRecords: CalendarRecord[] = [];
        let globalIdx = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();

          const linesMap = new Map<number, { x: number; text: string }[]>();

          textContent.items.forEach((item: any) => {
            if (!item.str || !item.str.trim()) return;
            const y = Math.round(item.transform[5]);
            const x = Math.round(item.transform[4]);
            if (!linesMap.has(y)) {
              linesMap.set(y, []);
            }
            linesMap.get(y)!.push({ x, text: item.str.trim() });
          });

          const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);

          for (const y of sortedY) {
            const itemsOnLine = linesMap.get(y)!.sort((a, b) => a.x - b.x);
            const lineText = itemsOnLine.map(i => i.text).join(' ');

            const dateMatch = lineText.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
            if (!dateMatch) continue;

            let formattedDate = new Date().toISOString().split('T')[0];
            const rawDate = dateMatch[1];
            if (rawDate.includes('/')) {
              const parts = rawDate.split('/');
              if (parts.length === 3) {
                formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            } else {
              formattedDate = rawDate;
            }

            const slotHora = normalizeTimeSlot(lineText);

            const turmaMatch = lineText.match(/\b([A-Za-z]{1,10}\s*[-_]?\s*\d{1,3})\b/);
            const rawTurma = turmaMatch ? turmaMatch[1] : 'DL 01';
            const formattedTurma = formatTurmaCode(rawTurma);

            const siglaMatch = lineText.match(/\b([A-Z]{2,8})\b/g);
            let extractedSigla = 'DISC';
            if (siglaMatch) {
              const found = siglaMatch.find(s => s !== 'DL' && s !== 'MC' && s !== 'SL' && s !== 'AULA' && s !== 'AULAS');
              if (found) extractedSigla = found;
            }

            extractedRecords.push({
              id: `cal-imp-pdf-${Date.now()}-${globalIdx}-${Math.random().toString(36).substring(2, 6)}`,
              data_calendario: formattedDate,
              horario_calendario: slotHora,
              turma_calendario: formattedTurma,
              sigla_calendario: extractedSigla,
              disciplina_calendario: '',
              sala_calendario: 'SL01',
              curso_calendario: 'Curso de Formação de Delegados de Polícia',
              modulo_calendario: 'Módulo I',
              ano_calendario: formattedDate.split('-')[0] || '2026',
              numero_aula_calendario: globalIdx + 1,
              equipe_calendario: '',
              observacao_calendario: ''
            });
            globalIdx++;
          }
        }

        if (extractedRecords.length === 0) {
          showToast('error', 'Nenhum registro de aula pôde ser extraído do arquivo PDF.');
          return;
        }

        setPreviewRecords(extractedRecords);
        showToast('success', `${extractedRecords.length} registro(s) extraído(s) do PDF com sucesso!`);
      } catch (pdfErr: any) {
        showToast('error', 'Erro ao ler arquivo PDF: ' + (pdfErr.message || 'formato inválido.'));
      }
      return;
    }

    // EXCEL / CSV PARSER
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          showToast('error', 'A planilha importada está vazia.');
          return;
        }

        const parsed: CalendarRecord[] = data.map((row: any, idx: number) => {
          const keys = Object.keys(row);
          const getVal = (...names: string[]) => {
            for (const n of names) {
              const matchedKey = keys.find((k) => {
                const cleanK = k.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const cleanN = n.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return cleanK === cleanN || cleanK.includes(cleanN);
              });
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
                return String(row[matchedKey]).trim();
              }
            }
            return '';
          };

          let rawData = getVal('DATA_CALENDARIO', 'DATA CALENDARIO', 'DATA', 'DATE');
          let formattedDate = new Date().toISOString().split('T')[0];
          if (rawData) {
            if (rawData.includes('/')) {
              const parts = rawData.split('/');
              if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = '20' + year;
                formattedDate = `${year}-${month}-${day}`;
              }
            } else if (rawData.includes('-')) {
              formattedDate = rawData.split('T')[0];
            } else if (!isNaN(Number(rawData))) {
              const d = new Date((Number(rawData) - (25567 + 2)) * 86400 * 1000);
              formattedDate = d.toISOString().split('T')[0];
            }
          }

          let rawHora = getVal('HORARIO_CALENDARIO', 'HORARIO CALENDARIO', 'HORARIO', 'HORA', 'AULA', 'SLOT');
          let finalHora = normalizeTimeSlot(rawHora);

          const yearOfDate = formattedDate ? formattedDate.split('-')[0] : String(selectedYear);
          const rawTurma = getVal('TURMA_CALENDARIO', 'TURMA CALENDARIO', 'TURMA') || 'DL 01';

          return {
            id: `cal-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            data_calendario: formattedDate,
            horario_calendario: finalHora,
            turma_calendario: formatTurmaCode(rawTurma),
            sigla_calendario: getVal('SIGLA_CALENDARIO', 'SIGLA CALENDARIO', 'SIGLA') || 'DISC',
            disciplina_calendario: getVal('DISCIPLINA_CALENDARIO', 'DISCIPLINA CALENDARIO', 'DISCIPLINA', 'MATERIA') || '',
            sala_calendario: getVal('SALA_CALENDARIO', 'SALA CALENDARIO', 'SALA', 'LOCAL') || 'SL01',
            curso_calendario: getVal('CURSO_CALENDARIO', 'CURSO CALENDARIO', 'CURSO') || 'Curso de Formação de Delegados de Polícia',
            modulo_calendario: getVal('MODULO_CALENDARIO', 'MODULO CALENDARIO', 'MODULO', 'MODULO_CURSO') || 'Módulo I',
            ano_calendario: getVal('ANO_CALENDARIO', 'ANO CALENDARIO', 'ANO', 'YEAR') || yearOfDate,
            numero_aula_calendario: getVal('NUMERO_AULA_CALENDARIO', 'NUMERO AULA', 'AULA', 'NUMERO_AULA') || (idx + 1),
            equipe_calendario: getVal('EQUIPE_CALENDARIO', 'EQUIPE CALENDARIO', 'EQUIPE', 'INSTRUTOR', 'PROFESSORE', 'PROFESSOR') || '',
            observacao_calendario: getVal('OBSERVAÇÃO_CALENDARIO', 'OBSERVACAO_CALENDARIO', 'OBSERVACAO', 'OBS') || ''
          };
        });

        setPreviewRecords(parsed);
      } catch (err: any) {
        showToast('error', 'Falha ao ler o arquivo Excel: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const saveImportedData = async () => {
    if (previewRecords.length === 0) return;
    setImporting(true);
    try {
      const res = await storage.importCalendarRecords(previewRecords);
      if (res.success) {
        showToast('success', `${res.count || previewRecords.length} registros importados com sucesso!`);
        setShowImportModal(false);
        setPreviewRecords([]);
        await loadData();
      } else {
        showToast('error', res.error || 'Erro ao gravar registros no banco de dados.');
      }
    } catch (err: any) {
      showToast('error', 'Erro ao salvar no banco: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // --- SAVE / EDIT SINGLE RECORD ---
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.data_calendario || !formState.turma_calendario || !formState.sigla_calendario) {
      showToast('error', 'Preencha Data, Turma e Sigla da disciplina.');
      return;
    }

    try {
      const payload = {
        ...formState,
        horario_calendario: normalizeTimeSlot(formState.horario_calendario || ''),
        id: editingRecordId || formState.id
      };
      const res = await storage.saveCalendarRecord(payload);
      if (res.success) {
        showToast('success', 'Agendamento salvo com sucesso!');
        setShowRecordModal(false);
        setEditingRecordId(null);
        setDetailRecord(null);
        await loadData();
      } else {
        showToast('error', res.error || 'Erro ao salvar agendamento.');
      }
    } catch (err: any) {
      showToast('error', 'Erro: ' + err.message);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta aula do calendário?')) return;
    try {
      const res = await storage.deleteCalendarRecord(id);
      if (res.success) {
        showToast('success', 'Aula excluída com sucesso.');
        setDetailRecord(null);
        await loadData();
      } else {
        showToast('error', res.error || 'Erro ao excluir aula.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // --- DERIVED SUBJECT/DISCIPLINE LIST ---
  const uniqueSubjectsMap = useMemo(() => {
    const map = new Map<string, { sigla: string; nome: string; count: number }>();
    records.forEach((r) => {
      const sigla = (r.sigla_calendario || '').trim().toUpperCase();
      if (!sigla) return;
      const nome = r.disciplina_calendario || sigla;
      if (!map.has(sigla)) {
        map.set(sigla, { sigla, nome, count: 1 });
      } else {
        map.get(sigla)!.count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.sigla.localeCompare(b.sigla));
  }, [records]);

  // Derive additional unique filters
  const uniqueTurmas = Array.from(new Set(records.map((r) => r.turma_calendario).filter(Boolean)));
  const uniqueSalas = Array.from(new Set(records.map((r) => r.sala_calendario).filter(Boolean)));
  const uniqueEquipes = Array.from(new Set(records.map((r) => r.equipe_calendario).filter(Boolean)));
  const uniqueModulos = Array.from(new Set(records.map((r) => r.modulo_calendario).filter(Boolean)));
  const uniqueAnos = Array.from(new Set(records.map((r) => String(r.ano_calendario || '')).filter(Boolean)));

  // Filter records specifically for the selected discipline
  const activeDisciplineRecords = useMemo(() => {
    if (!selectedDiscipline) return [];
    const selUpper = selectedDiscipline.trim().toUpperCase();
    return sortedAllRecords.filter((r) => {
      const siglaUpper = (r.sigla_calendario || '').trim().toUpperCase();
      const discUpper = (r.disciplina_calendario || '').trim().toUpperCase();
      if (siglaUpper !== selUpper && discUpper !== selUpper) return false;

      if (filterTurma !== 'TODAS' && r.turma_calendario !== filterTurma) return false;
      if (filterSala !== 'TODAS' && r.sala_calendario !== filterSala) return false;
      if (filterEquipe !== 'TODAS' && r.equipe_calendario !== filterEquipe) return false;
      if (filterModulo !== 'TODOS' && r.modulo_calendario !== filterModulo) return false;
      if (filterAno !== 'TODOS' && String(r.ano_calendario) !== filterAno) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const match =
          r.turma_calendario.toLowerCase().includes(term) ||
          (r.disciplina_calendario && r.disciplina_calendario.toLowerCase().includes(term)) ||
          (r.sala_calendario && r.sala_calendario.toLowerCase().includes(term)) ||
          (r.curso_calendario && r.curso_calendario.toLowerCase().includes(term)) ||
          (r.equipe_calendario && r.equipe_calendario.toLowerCase().includes(term));
        if (!match) return false;
      }

      return true;
    });
  }, [selectedDiscipline, sortedAllRecords, filterTurma, filterSala, filterEquipe, filterModulo, filterAno, searchTerm]);

  // Generate Weekdays for the Selected Month and Year
  const currentMonthWeekdays = useMemo(() => {
    const days: { dateStr: string; dayNum: number; dayName: string }[] = [];
    const date = new Date(selectedYear, selectedMonth, 1);

    while (date.getMonth() === selectedMonth) {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        days.push({
          dateStr: `${y}-${m}-${d}`,
          dayNum: date.getDate(),
          dayName: dayNames[dayOfWeek]
        });
      }
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [selectedYear, selectedMonth]);

  const selectedDisciplineName = useMemo(() => {
    if (!selectedDiscipline) return '';
    const found = uniqueSubjectsMap.find((s) => s.sigla === selectedDiscipline);
    return found ? `${found.sigla} - ${found.nome}` : selectedDiscipline;
  }, [selectedDiscipline, uniqueSubjectsMap]);

  const monthWeeks = useMemo(() => getMonthWeeks(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const weeksToRender = useMemo(() => {
    const targetRecords = selectedDiscipline ? activeDisciplineRecords : sortedAllRecords;

    const weekHasRecords = (week: CalendarWeekInfo) => {
      const dates = new Set<string>(week.days.map((d) => d.dateStr));
      return targetRecords.some((r) => dates.has(r.data_calendario));
    };

    if (isPrintingAllMonths) {
      const allWeeks: CalendarWeekInfo[] = [];
      for (let m = 0; m < 12; m++) {
        const mWeeks = getMonthWeeks(printYearChoice, m);
        mWeeks.forEach((w) => {
          if (weekHasRecords(w)) {
            const firstDate = w.days[0]?.dateStr;
            if (!allWeeks.some((exist) => exist.days[0]?.dateStr === firstDate)) {
              allWeeks.push(w);
            }
          }
        });
      }
      return allWeeks;
    } else {
      const weeksWithClasses = monthWeeks.filter((w) => weekHasRecords(w));
      return weeksWithClasses.length > 0 ? weeksWithClasses : monthWeeks;
    }
  }, [
    isPrintingAllMonths,
    printYearChoice,
    monthWeeks,
    activeDisciplineRecords,
    sortedAllRecords,
    selectedDiscipline
  ]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingAllMonths(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const availableTeachersForEquipe = useMemo(() => {
    const currentSubj = (equipeForm.materia || selectedDiscipline || '').trim().toUpperCase();

    const matched = systemUsers.filter((u) => {
      if (!u.isTeacher) return false;
      const uSubj = (u.teacherSubject || u.teacher_subject || '').trim().toUpperCase();
      if (!currentSubj) return true;
      if (uSubj === currentSubj) return true;
      if (uSubj && (currentSubj.includes(uSubj) || uSubj.includes(currentSubj))) return true;
      return false;
    });

    if (matched.length > 0) return matched;

    // Fallback: Return all users marked as teachers if no exact match for discipline
    const teachersOnly = systemUsers.filter((u) => u.isTeacher);
    return teachersOnly.length > 0 ? teachersOnly : systemUsers;
  }, [systemUsers, equipeForm.materia, selectedDiscipline]);

  const getProfFirstName = (fullName: string): string => {
    if (!fullName) return '';
    const clean = fullName.replace(/^(Dr\.|Dra\.|Prof\.|Professor|Professora)\s+/i, '').trim();
    const firstName = clean.split(/\s+/)[0] || '';
    if (!firstName) return '';
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  };

  // Helper to extract team professor siglas and details (with Auxiliar Tabela Equipe support)
  const getTeamProfessorsSiglas = (rec: CalendarRecord) => {
    const recDate = rec.data_calendario;
    const recTurma = formatTurmaCode(rec.turma_calendario || 'DL 01');
    const recSigla = (rec.sigla_calendario || selectedDiscipline || '').trim().toUpperCase();
    const eqName = (rec.equipe_calendario || '').trim().toLowerCase();

    // 1. Check Auxiliar Tabela Equipe first (period + turma + materia link)
    const matchedAux = auxiliarEquipesList.find((aux) => {
      const auxTurma = formatTurmaCode(aux.codigo_turma || '');
      const auxMat = (aux.materia || '').trim().toUpperCase();
      const isTurmaMatch = auxTurma === recTurma;
      const isMatMatch = !auxMat || !recSigla || auxMat === recSigla || recSigla.includes(auxMat) || auxMat.includes(recSigla);
      const isDateMatch = recDate >= aux.data_inicio && recDate <= aux.data_fim;

      return isTurmaMatch && isMatMatch && isDateMatch;
    });

    if (matchedAux) {
      const profsList: { nome: string; sigla: string; tipo: string }[] = [];

      if (matchedAux.professor_titular_nome || matchedAux.sigla_professor) {
        profsList.push({
          nome: matchedAux.professor_titular_nome || '',
          sigla: matchedAux.sigla_professor || '',
          tipo: 'TITULAR'
        });
      }

      if (Array.isArray(matchedAux.professores)) {
        matchedAux.professores.forEach((p) => {
          if (p.nome || p.sigla) {
            const isDup = profsList.some(
              (ex) => (p.nome && ex.nome === p.nome) || (p.sigla && ex.sigla === p.sigla)
            );
            if (!isDup) {
              profsList.push({
                nome: p.nome || '',
                sigla: p.sigla || '',
                tipo: p.tipo || 'INSTRUTOR'
              });
            }
          }
        });
      }

      const titular = profsList.find((p) => p.tipo === 'TITULAR') || profsList[0];
      const instrutores = profsList.filter((p) => p !== titular && (p.tipo === 'INSTRUTOR' || p.tipo === 'INSTRUTORES'));
      const hasInstructors = instrutores.length > 0;

      if (!hasInstructors) {
        const fullName = titular?.nome || matchedAux.professor_titular_nome || '';
        const firstName = getProfFirstName(fullName);
        return {
          hasInstructors: false,
          displayName: firstName || fullName || titular?.sigla || matchedAux.sigla_professor || '',
          equipeNome: matchedAux.nome_da_equipe,
          titularNome: fullName,
          titularSigla: titular?.sigla || matchedAux.sigla_professor || '',
          instrutores: [],
          instrutoresSiglas: [],
          isAuxiliarMatch: true
        };
      } else {
        return {
          hasInstructors: true,
          displayName: '',
          equipeNome: matchedAux.nome_da_equipe,
          titularNome: titular?.nome || matchedAux.professor_titular_nome || '',
          titularSigla: titular?.sigla || matchedAux.sigla_professor || 'TITULAR',
          instrutores,
          instrutoresSiglas: instrutores.map((i) => i.sigla).filter(Boolean),
          isAuxiliarMatch: true
        };
      }
    }

    // 2. Fallback to base Equipes List
    const matched = equipesList.find((e) => {
      const eName = (e.nome_da_equipe || '').trim().toLowerCase();
      const eMat = (e.materia || '').trim().toUpperCase();
      const nameMatch = eName === eqName || eqName.includes(eName) || eName.includes(eqName);
      const matMatch = !recSigla || !eMat || eMat === recSigla;
      return nameMatch && matMatch;
    });

    if (matched) {
      const titularSigla = (matched.sigla_professor || '').trim();
      const instrutoresSiglas = (matched.instrutores || [])
        .map((i) => (i.siglaInstrutor || '').trim())
        .filter(Boolean);

      if (instrutoresSiglas.length === 0 && matched.sigla_instrutor) {
        instrutoresSiglas.push(matched.sigla_instrutor.trim());
      }

      const hasInstructors = instrutoresSiglas.length > 0;

      if (!hasInstructors) {
        const fullName = matched.professor_titular_equipe || '';
        const firstName = getProfFirstName(fullName);
        return {
          hasInstructors: false,
          displayName: firstName || fullName || titularSigla || '',
          equipeNome: matched.nome_da_equipe,
          titularNome: fullName,
          titularSigla: titularSigla || 'TITULAR',
          instrutores: [],
          instrutoresSiglas: [],
          isAuxiliarMatch: false
        };
      } else {
        return {
          hasInstructors: true,
          displayName: '',
          equipeNome: matched.nome_da_equipe,
          titularNome: matched.professor_titular_equipe || 'Prof. Titular',
          titularSigla: titularSigla || (rec.equipe_calendario || 'TITULAR'),
          instrutores: matched.instrutores || [],
          instrutoresSiglas,
          isAuxiliarMatch: false
        };
      }
    }

    // 3. Fallback string
    return {
      hasInstructors: false,
      displayName: rec.equipe_calendario || '',
      equipeNome: rec.equipe_calendario || '',
      titularNome: '',
      titularSigla: rec.equipe_calendario || '',
      instrutores: [],
      instrutoresSiglas: [],
      isAuxiliarMatch: false
    };
  };

  const renderSlotCellContent = (slotRecords: CalendarRecord[]) => {
    if (slotRecords.length === 0) {
      return (
        <div className="flex items-center justify-center h-full w-full min-h-[36px] print:min-h-[30px]">
          <span className="text-slate-400 font-mono text-[9px]">-</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col space-y-0.5 justify-start items-center w-full h-full min-h-[36px] print:min-h-[30px] py-0.5">
        {slotRecords.map((rec) => {
          const turmaFormatted = formatTurmaCode(rec.turma_calendario || 'DL 01');
          const numAulaOnly = String(getCalculatedLessonNumber(rec));

          const teamInfo = getTeamProfessorsSiglas(rec);

          return (
            <div
              key={rec.id}
              onClick={() => setDetailRecord(rec)}
              className="celula-aula cursor-pointer hover:bg-amber-100 transition py-0.5 px-0.5 border border-slate-300 rounded bg-white shadow-xs text-black w-full text-center flex items-center justify-center space-x-0.5 overflow-hidden whitespace-nowrap text-[9.5px] print:text-[8.5px] leading-tight h-[20px] print:h-[18px] shrink-0"
              title={`Clique para ver detalhes - ${turmaFormatted} | ${numAulaOnly}° Aula | Equipe ${teamInfo.equipeNome}`}
            >
              {/* TURMA_CALENDARIO (ex: DL 01) */}
              <span className="font-black text-black font-mono tracking-tight shrink-0">
                {turmaFormatted}
              </span>

              {/* NUMERO_AULA_CALENDARIO (ex: 3°) */}
              <span className="font-bold text-slate-800 font-mono shrink-0">
                {numAulaOnly}°
              </span>

              {/* PROFESSOR DISPLAY: Equipes apenas com professores -> NOME (fonte reduzida para não alterar tabela). Com instrutores -> SIGLAS */}
              {!teamInfo.hasInstructors ? (
                <span
                  className="font-bold text-slate-950 font-mono text-[8.5px] print:text-[7.5px] truncate max-w-[65px] leading-tight shrink-0"
                  title={teamInfo.titularNome || teamInfo.displayName}
                >
                  {teamInfo.displayName || teamInfo.titularNome || teamInfo.titularSigla}
                </span>
              ) : (
                <span className="flex items-center space-x-0.5 shrink-0 overflow-hidden text-ellipsis">
                  {/* Professor Titular (Negrito) */}
                  {teamInfo.titularSigla && (
                    <strong className="font-black text-slate-950 font-mono uppercase">
                      {teamInfo.titularSigla}
                    </strong>
                  )}

                  {/* Instrutores */}
                  {teamInfo.instrutoresSiglas.map((s, idx) => (
                    <span key={idx} className="font-medium text-slate-700 font-mono uppercase text-[9px] print:text-[8px]">
                      {s}
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Open Print Modal for the selected discipline
  const handlePrintPDF = () => {
    setPrintMonthChoice(selectedMonth);
    setPrintYearChoice(selectedYear);
    setPrintOption('month');
    setShowPrintModal(true);
  };

  const handleConfirmPrint = () => {
    if (printOption === 'month') {
      setSelectedMonth(printMonthChoice);
      setSelectedYear(printYearChoice);
      setIsPrintingAllMonths(false);
    } else {
      setSelectedYear(printYearChoice);
      setIsPrintingAllMonths(true);
    }
    setShowPrintModal(false);

    setTimeout(() => {
      const titleSubject =
        calendarViewMode === 'cftp' && selectedCftpCourseObj
          ? `${selectedCftpCourseObj.module || selectedCftpCourseObj.name} - ${cftpSelectedSubject || 'CFTP'}`
          : `${selectedDisciplineName || selectedDiscipline || 'ACADEPOL'} (${printYearChoice})`;
      printWithWindowTitle(
        buildStandardDocumentTitle(
          'Calendário Letivo (Calendário Acadêmico)',
          titleSubject,
          currentUser?.name || 'ACADEPOL'
        )
      );
    }, 250);
  };

  // --- CFTP SCHEDULE CALENDAR MEMOS & HELPERS ---
  const selectedCftpCourseObj = useMemo(
    () => cftpCourses.find(c => c.id === selectedCftpCourseId) || null,
    [cftpCourses, selectedCftpCourseId]
  );

  // Matérias disponíveis no curso de formação selecionado
  const cftpCourseSubjects = useMemo(() => {
    if (!selectedCftpCourseObj) return [] as Array<{ sigla: string; nome: string; count: number }>;
    const map = new Map<string, { sigla: string; nome: string; count: number }>();
    const rows = Array.isArray(selectedCftpCourseObj.moduleSchedule) ? selectedCftpCourseObj.moduleSchedule : [];
    for (const r of rows) {
      const sig = String(r.sigla || '').trim().toUpperCase();
      if (!sig) continue;
      const nome = String(r.disciplina || sig).trim();
      const ex = map.get(sig);
      if (ex) {
        ex.count += 1;
      } else {
        map.set(sig, { sigla: sig, nome, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.sigla.localeCompare(b.sigla));
  }, [selectedCftpCourseObj]);

  // Mapa canônico de exibição das turmas do curso (prioriza TURMAS_CFTP com alunos / formato padronizado)
  const cftpTurmaDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedCftpCourseObj) return map;
    for (const t of turmasCftpList.filter(tc => tc.cursoId === selectedCftpCourseObj.id)) {
      const k = normCftpTurmaKey(t.turma);
      if (k && !map.has(k)) {
        map.set(k, formatCftpTurmaLabel(t.turma) || t.turma);
      }
    }
    const rows = Array.isArray(selectedCftpCourseObj.moduleSchedule) ? selectedCftpCourseObj.moduleSchedule : [];
    for (const r of rows) {
      const k = normCftpTurmaKey(r.turma || '');
      if (k && !map.has(k)) {
        map.set(k, formatCftpTurmaLabel(r.turma || '') || r.turma);
      }
    }
    return map;
  }, [selectedCftpCourseObj, turmasCftpList]);

  // Resolve as siglas dos professores designados para (cursoId, turma, materia, isoDate)
  const resolveCftpCellProfessors = (
    cursoId: string,
    turmaRaw: string,
    materiaSigla: string,
    isoDate: string
  ): { equipeApelido?: string; professores: Array<{ nome: string; sigla: string }> } => {
    const targetTurmaKey = normCftpTurmaKey(turmaRaw);
    const targetMateria = String(materiaSigla || '').trim().toUpperCase();

    const matchedDesig = designacoesCftpList.find(d => {
      if (d.cursoId !== cursoId) return false;
      if (normCftpTurmaKey(d.turma) !== targetTurmaKey) return false;
      if (String(d.materia || '').trim().toUpperCase() !== targetMateria) return false;
      const p = (d.primeiraAula || '').slice(0, 10);
      const u = (d.ultimaAula || '').slice(0, 10);
      if (p && isoDate < p) return false;
      if (u && isoDate > u) return false;
      return true;
    });

    if (!matchedDesig) {
      return { professores: [] };
    }

    const eqObj = equipesCftpList.find(e => e.id === matchedDesig.equipeId);
    const slots: Array<{ id?: string; nome?: string }> = [
      { id: eqObj?.equipe01Id, nome: matchedDesig.equipe01 || eqObj?.equipe01 },
      { id: eqObj?.equipe02Id, nome: matchedDesig.equipe02 || eqObj?.equipe02 },
      { id: eqObj?.equipe03Id, nome: matchedDesig.equipe03 || eqObj?.equipe03 },
      { id: eqObj?.equipe04Id, nome: matchedDesig.equipe04 || eqObj?.equipe04 },
      { id: eqObj?.equipe05Id, nome: matchedDesig.equipe05 || eqObj?.equipe05 },
      { id: eqObj?.equipe06Id, nome: matchedDesig.equipe06 || eqObj?.equipe06 }
    ];

    const professores: Array<{ nome: string; sigla: string }> = [];
    for (const s of slots) {
      const cleanName = String(s.nome || '').trim();
      if (!cleanName && !s.id) continue;
      const matchedUser =
        (s.id ? systemUsers.find(u => u.id === s.id) : undefined) ||
        (cleanName
          ? systemUsers.find(u => u.name.trim().toLowerCase() === cleanName.toLowerCase())
          : undefined);

      const rawSigla = (matchedUser?.professorSigla || matchedUser?.professor_sigla || '').trim().toUpperCase();
      let sigla = rawSigla;
      if (!sigla && cleanName) {
        const words = cleanName
          .replace(/^(Dr\.|Dra\.|Prof\.|Professor|Professora)\s+/i, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        sigla =
          words.length >= 2
            ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
            : (words[0]?.slice(0, 2) || '').toUpperCase();
      }
      professores.push({ nome: matchedUser?.name || cleanName, sigla });
    }

    return {
      equipeApelido: matchedDesig.apelidoEquipe || eqObj?.apelidoEquipe,
      professores
    };
  };

  interface CftpNormalizedScheduleItem {
    key: string;
    isoDate: string;
    brDate: string;
    slotId: 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5';
    slotOrder: number;
    turmaKey: string;
    turmaLabel: string;
    sigla: string;
    disciplina: string;
    sala: string;
    aulaNumero: number;
    equipeApelido?: string;
    professores: Array<{ nome: string; sigla: string }>;
  }

  // Registros normalizados do curso selecionado + matéria selecionada (com numeração sequencial por turma)
  const cftpSubjectAllItems = useMemo<CftpNormalizedScheduleItem[]>(() => {
    if (!selectedCftpCourseObj || !cftpSelectedSubject) return [];
    const targetSubj = cftpSelectedSubject.trim().toUpperCase();
    const rawRows = Array.isArray(selectedCftpCourseObj.moduleSchedule)
      ? selectedCftpCourseObj.moduleSchedule
      : [];

    const preSorted = rawRows
      .filter(r => String(r.sigla || '').trim().toUpperCase() === targetSubj)
      .map((r, idx) => {
        const isoDate = normalizeCftpDateToIso(r.data);
        const slotId = normalizeCftpHorarioKey(r.horario);
        const slotOrder = slotId === 'slot1' ? 1 : slotId === 'slot2' ? 2 : slotId === 'slot3' ? 3 : slotId === 'slot4' ? 4 : 5;
        const turmaKey = normCftpTurmaKey(r.turma || '');
        const turmaLabel = cftpTurmaDisplayMap.get(turmaKey) || formatCftpTurmaLabel(r.turma || '') || r.turma || '—';
        return {
          idx,
          isoDate,
          brDate: formatIsoToBr(isoDate),
          slotId,
          slotOrder,
          turmaKey,
          turmaLabel,
          sigla: targetSubj,
          disciplina: String(r.disciplina || targetSubj).trim(),
          sala: String(r.sala || '').trim()
        };
      })
      .filter(item => Boolean(item.isoDate))
      .sort(
        (a, b) =>
          a.isoDate.localeCompare(b.isoDate) ||
          a.slotOrder - b.slotOrder ||
          a.turmaLabel.localeCompare(b.turmaLabel, 'pt-BR', { numeric: true, sensitivity: 'base' })
      );

    const turmaCounters = new Map<string, number>();
    return preSorted.map(item => {
      const nextAula = (turmaCounters.get(item.turmaKey) || 0) + 1;
      turmaCounters.set(item.turmaKey, nextAula);
      const profInfo = resolveCftpCellProfessors(
        selectedCftpCourseObj.id,
        item.turmaLabel,
        item.sigla,
        item.isoDate
      );
      return {
        key: `${item.isoDate}-${item.slotId}-${item.turmaKey}-${item.idx}`,
        isoDate: item.isoDate,
        brDate: item.brDate,
        slotId: item.slotId,
        slotOrder: item.slotOrder,
        turmaKey: item.turmaKey,
        turmaLabel: item.turmaLabel,
        sigla: item.sigla,
        disciplina: item.disciplina,
        sala: item.sala,
        aulaNumero: nextAula,
        equipeApelido: profInfo.equipeApelido,
        professores: profInfo.professores
      };
    });
  }, [selectedCftpCourseObj, cftpSelectedSubject, cftpTurmaDisplayMap, designacoesCftpList, equipesCftpList, systemUsers]);

  const cftpAvailableTurmas = useMemo(() => {
    const set = new Set<string>(cftpSubjectAllItems.map(i => i.turmaLabel));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [cftpSubjectAllItems]);

  const cftpAvailableSalas = useMemo(() => {
    const set = new Set<string>(cftpSubjectAllItems.map(i => i.sala).filter(Boolean));
    return Array.from(set).sort();
  }, [cftpSubjectAllItems]);

  const cftpFilteredItems = useMemo(() => {
    return cftpSubjectAllItems.filter(item => {
      if (cftpFilterTurma !== 'TODAS' && normCftpTurmaKey(item.turmaLabel) !== normCftpTurmaKey(cftpFilterTurma)) {
        return false;
      }
      if (cftpFilterSala !== 'TODAS' && item.sala !== cftpFilterSala) {
        return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const profStr = item.professores.map(p => `${p.sigla} ${p.nome}`).join(' ').toLowerCase();
        if (
          !item.turmaLabel.toLowerCase().includes(q) &&
          !item.sala.toLowerCase().includes(q) &&
          !profStr.includes(q) &&
          !(item.equipeApelido || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [cftpSubjectAllItems, cftpFilterTurma, cftpFilterSala, searchTerm]);

  // Meses que possuem aulas da matéria selecionada no CFTP
  const cftpAvailableMonths = useMemo(() => {
    const map = new Map<string, { year: number; month: number; label: string; count: number }>();
    for (const item of cftpFilteredItems) {
      const y = Number(item.isoDate.slice(0, 4));
      const m = Number(item.isoDate.slice(5, 7)) - 1;
      if (isNaN(y) || isNaN(m)) continue;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { year: y, month: m, label: `${MONTH_NAMES[m].slice(0, 3)}/${y}`, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [cftpFilteredItems]);

  // Determina dinamicamente os horários do curso/matéria (padrão 4 horários + almoço, adicionando 5º apenas se existir)
  const cftpActiveTimeSlots = useMemo<CftpSlotRowDef[]>(() => {
    const hasFifthSlot = cftpSubjectAllItems.some(i => i.slotId === 'slot5');
    return hasFifthSlot ? [...CFTP_STANDARD_SLOTS, CFTP_FIFTH_SLOT] : CFTP_STANDARD_SLOTS;
  }, [cftpSubjectAllItems]);

  // Semanas do calendário convencional CFTP
  const cftpWeeksToRender = useMemo(() => {
    const dateSet = new Set<string>(cftpFilteredItems.map(i => i.isoDate));
    const weekHasItems = (w: CalendarWeekInfo) => w.days.some(d => dateSet.has(d.dateStr));

    if (cftpShowAllMonths) {
      const allWeeks: CalendarWeekInfo[] = [];
      const seenFirstDay = new Set<string>();
      for (const mInfo of cftpAvailableMonths) {
        const mWeeks = getMonthWeeks(mInfo.year, mInfo.month);
        for (const w of mWeeks) {
          if (weekHasItems(w)) {
            const fd = w.days[0]?.dateStr || '';
            if (!seenFirstDay.has(fd)) {
              seenFirstDay.add(fd);
              allWeeks.push({ ...w, weekNum: allWeeks.length + 1 });
            }
          }
        }
      }
      return allWeeks;
    }

    const mWeeks = getMonthWeeks(selectedYear, selectedMonth);
    const withClasses = mWeeks.filter(weekHasItems);
    return withClasses.length > 0 ? withClasses : mWeeks;
  }, [cftpFilteredItems, cftpShowAllMonths, cftpAvailableMonths, selectedYear, selectedMonth]);

  const handleSelectCftpCourse = (courseId: string) => {
    setSelectedCftpCourseId(courseId);
    setCftpSelectedSubject('');
    setCftpFilterTurma('TODAS');
    setCftpFilterSala('TODAS');
    setCftpShowAllMonths(false);
    setSearchTerm('');
  };

  const handleSelectCftpSubject = (sigla: string) => {
    setCftpSelectedSubject(sigla);
    setCftpFilterTurma('TODAS');
    setCftpFilterSala('TODAS');
    setCftpShowAllMonths(false);

    // Pula automaticamente para o primeiro mês com aulas dessa matéria no CFTP selecionado
    if (selectedCftpCourseObj && sigla) {
      const targetUpper = sigla.trim().toUpperCase();
      const dates = (selectedCftpCourseObj.moduleSchedule || [])
        .filter(r => String(r.sigla || '').trim().toUpperCase() === targetUpper)
        .map(r => normalizeCftpDateToIso(r.data))
        .filter(Boolean)
        .sort();
      if (dates.length > 0) {
        const firstIso = dates[0];
        const y = Number(firstIso.slice(0, 4));
        const m = Number(firstIso.slice(5, 7)) - 1;
        if (!isNaN(y) && !isNaN(m)) {
          setSelectedYear(y);
          setSelectedMonth(m);
        }
      }
    }
  };

  // --- MEU RELATÓRIO (AULAS DO USUÁRIO NO CFTP SELECIONADO: 2 HORAS/AULA POR AULA) ---
  const selectedReportCourseObj = useMemo(
    () => cftpCourses.find(c => c.id === reportCourseId) || cftpCourses[0] || null,
    [cftpCourses, reportCourseId]
  );

  interface MyReportLessonItem {
    key: string;
    isoDate: string;
    brDate: string;
    slotOrder: number;
    slotTitle: string;
    slotTime: string;
    turmaLabel: string;
    sigla: string;
    disciplina: string;
    sala: string;
    equipeApelido?: string;
    usuarioNome: string;
    horasAula: number;
  }

  const myReportAllCourseLessons = useMemo<MyReportLessonItem[]>(() => {
    if (!selectedReportCourseObj || !currentUser) return [];

    const currentUserId = String(currentUser.id || '').trim();
    const currentUserNameNorm = String(currentUser.name || '').trim().toLowerCase();
    const rawRows = Array.isArray(selectedReportCourseObj.moduleSchedule)
      ? selectedReportCourseObj.moduleSchedule
      : [];

    const slotById = new Map<string, CftpSlotRowDef>();
    for (const s of [...CFTP_STANDARD_SLOTS, CFTP_FIFTH_SLOT]) {
      slotById.set(s.id, s);
    }

    const turmaLabelMap = new Map<string, string>();
    for (const t of turmasCftpList.filter(tc => tc.cursoId === selectedReportCourseObj.id)) {
      const k = normCftpTurmaKey(t.turma);
      if (k && !turmaLabelMap.has(k)) {
        turmaLabelMap.set(k, formatCftpTurmaLabel(t.turma) || t.turma);
      }
    }

    const seenKeys = new Set<string>();
    const result: MyReportLessonItem[] = [];

    for (const r of rawRows) {
      const isoDate = normalizeCftpDateToIso(r.data);
      if (!isoDate) continue;
      const sigla = String(r.sigla || '').trim().toUpperCase();
      if (!sigla) continue;

      const turmaKey = normCftpTurmaKey(r.turma || '');
      if (!turmaKey) continue;

      const matchedDesigs = designacoesCftpList.filter(d => {
        if (d.cursoId !== selectedReportCourseObj.id) return false;
        if (normCftpTurmaKey(d.turma) !== turmaKey) return false;
        if (String(d.materia || '').trim().toUpperCase() !== sigla) return false;
        const p = (d.primeiraAula || '').slice(0, 10);
        const u = (d.ultimaAula || '').slice(0, 10);
        if (p && isoDate < p) return false;
        if (u && isoDate > u) return false;
        return true;
      });

      if (matchedDesigs.length === 0) continue;

      let matchedTeamApelido: string | undefined;
      const userIsAssigned = matchedDesigs.some(d => {
        const eqObj = equipesCftpList.find(e => e.id === d.equipeId);
        const slots: Array<{ id?: string; nome?: string }> = [
          { id: eqObj?.equipe01Id, nome: d.equipe01 || eqObj?.equipe01 },
          { id: eqObj?.equipe02Id, nome: d.equipe02 || eqObj?.equipe02 },
          { id: eqObj?.equipe03Id, nome: d.equipe03 || eqObj?.equipe03 },
          { id: eqObj?.equipe04Id, nome: d.equipe04 || eqObj?.equipe04 },
          { id: eqObj?.equipe05Id, nome: d.equipe05 || eqObj?.equipe05 },
          { id: eqObj?.equipe06Id, nome: d.equipe06 || eqObj?.equipe06 }
        ];
        const found = slots.some(s => {
          if (currentUserId && s.id && String(s.id).trim() === currentUserId) return true;
          const slotName = String(s.nome || '').trim().toLowerCase();
          return Boolean(currentUserNameNorm && slotName && slotName === currentUserNameNorm);
        });
        if (found) {
          matchedTeamApelido = d.apelidoEquipe || eqObj?.apelidoEquipe;
        }
        return found;
      });

      if (!userIsAssigned) continue;

      const slotId = normalizeCftpHorarioKey(r.horario);
      const slotDef = slotById.get(slotId) || CFTP_STANDARD_SLOTS[0];
      const dedupKey = `${selectedReportCourseObj.id}|${isoDate}|${slotId}|${turmaKey}|${sigla}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      const turmaLabel = turmaLabelMap.get(turmaKey) || formatCftpTurmaLabel(r.turma || '') || r.turma || '—';

      result.push({
        key: dedupKey,
        isoDate,
        brDate: formatIsoToBr(isoDate),
        slotOrder: slotDef.order,
        slotTitle: slotDef.title,
        slotTime: slotDef.timeLabel,
        turmaLabel,
        sigla,
        disciplina: String(r.disciplina || sigla).trim(),
        sala: String(r.sala || '').trim(),
        equipeApelido: matchedTeamApelido,
        usuarioNome: currentUser.name,
        horasAula: 2
      });
    }

    return result.sort(
      (a, b) =>
        a.isoDate.localeCompare(b.isoDate) ||
        a.slotOrder - b.slotOrder ||
        a.turmaLabel.localeCompare(b.turmaLabel, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [selectedReportCourseObj, currentUser, designacoesCftpList, equipesCftpList, turmasCftpList]);

  const myReportAvailableSubjects = useMemo(() => {
    return Array.from(new Set(myReportAllCourseLessons.map(l => l.sigla))).sort();
  }, [myReportAllCourseLessons]);

  const myReportFilteredLessons = useMemo(() => {
    if (reportSubjectFilter === 'TODAS') return myReportAllCourseLessons;
    return myReportAllCourseLessons.filter(l => l.sigla === reportSubjectFilter);
  }, [myReportAllCourseLessons, reportSubjectFilter]);

  const myReportMonthlySummary = useMemo(() => {
    const map = new Map<string, { key: string; year: number; month: number; label: string; aulas: number; horasAula: number }>();
    for (const l of myReportFilteredLessons) {
      const y = Number(l.isoDate.slice(0, 4));
      const m = Number(l.isoDate.slice(5, 7)) - 1;
      if (isNaN(y) || isNaN(m)) continue;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const existing = map.get(key);
      if (existing) {
        existing.aulas += 1;
        existing.horasAula += 2;
      } else {
        map.set(key, {
          key,
          year: y,
          month: m,
          label: `${MONTH_NAMES[m]}/${y}`,
          aulas: 1,
          horasAula: 2
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [myReportFilteredLessons]);

  const myReportMonthLessons = useMemo(() => {
    const prefix = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}`;
    return myReportFilteredLessons.filter(l => l.isoDate.startsWith(prefix));
  }, [myReportFilteredLessons, reportYear, reportMonth]);

  const syncReportMonthToAvailable = (courseIdToUse: string) => {
    const course = cftpCourses.find(c => c.id === courseIdToUse) || selectedReportCourseObj;
    if (!course || !currentUser) return;
    const currentUserId = String(currentUser.id || '').trim();
    const currentUserNameNorm = String(currentUser.name || '').trim().toLowerCase();
    const dates: string[] = [];

    for (const r of course.moduleSchedule || []) {
      const isoDate = normalizeCftpDateToIso(r.data);
      const sigla = String(r.sigla || '').trim().toUpperCase();
      const turmaKey = normCftpTurmaKey(r.turma || '');
      if (!isoDate || !sigla || !turmaKey) continue;

      const matched = designacoesCftpList.some(d => {
        if (d.cursoId !== course.id) return false;
        if (normCftpTurmaKey(d.turma) !== turmaKey) return false;
        if (String(d.materia || '').trim().toUpperCase() !== sigla) return false;
        const p = (d.primeiraAula || '').slice(0, 10);
        const u = (d.ultimaAula || '').slice(0, 10);
        if (p && isoDate < p) return false;
        if (u && isoDate > u) return false;
        const eqObj = equipesCftpList.find(e => e.id === d.equipeId);
        const slots = [
          { id: eqObj?.equipe01Id, nome: d.equipe01 || eqObj?.equipe01 },
          { id: eqObj?.equipe02Id, nome: d.equipe02 || eqObj?.equipe02 },
          { id: eqObj?.equipe03Id, nome: d.equipe03 || eqObj?.equipe03 },
          { id: eqObj?.equipe04Id, nome: d.equipe04 || eqObj?.equipe04 },
          { id: eqObj?.equipe05Id, nome: d.equipe05 || eqObj?.equipe05 },
          { id: eqObj?.equipe06Id, nome: d.equipe06 || eqObj?.equipe06 }
        ];
        return slots.some(
          s =>
            (currentUserId && s.id && String(s.id).trim() === currentUserId) ||
            (currentUserNameNorm && String(s.nome || '').trim().toLowerCase() === currentUserNameNorm)
        );
      });

      if (matched) dates.push(isoDate);
    }

    if (dates.length > 0) {
      dates.sort();
      const firstIso = dates[0];
      const y = Number(firstIso.slice(0, 4));
      const m = Number(firstIso.slice(5, 7)) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        setReportYear(y);
        setReportMonth(m);
      }
    }
  };

  const handleOpenMeuRelatorio = () => {
    const targetCourseId = reportCourseId || selectedCftpCourseId || cftpCourses[0]?.id || '';
    if (targetCourseId && targetCourseId !== reportCourseId) {
      setReportCourseId(targetCourseId);
    }
    setCalendarViewMode('meu-relatorio');
    if (targetCourseId) {
      syncReportMonthToAvailable(targetCourseId);
    }
  };

  const handlePrintMyMonthlyReport = (overrideYear?: number, overrideMonth?: number) => {
    const targetYear = overrideYear ?? reportYear;
    const targetMonth = overrideMonth ?? reportMonth;
    const prefix = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const lessonsToPrint = myReportFilteredLessons.filter(l => l.isoDate.startsWith(prefix));

    const monthName = MONTH_NAMES[targetMonth] || '';
    const courseTitle = selectedReportCourseObj
      ? `${selectedReportCourseObj.module || selectedReportCourseObj.name}${selectedReportCourseObj.code ? ` (${selectedReportCourseObj.code})` : ''}`
      : 'Curso de Formação (CFTP)';

    const userFullName = currentUser?.name || 'Usuário não identificado';
    const userMasp = formatMasp(currentUser?.masp || '') || '—';
    const userPhone = formatPhone(currentUser?.phone || '') || currentUser?.phone || '—';
    const userSigla = (currentUser?.professorSigla || currentUser?.professor_sigla || '').trim().toUpperCase() || '—';
    const resolvedSubjects =
      reportSubjectFilter !== 'TODAS'
        ? reportSubjectFilter
        : myReportAvailableSubjects.length > 0
          ? myReportAvailableSubjects.join(', ')
          : ((currentUser?.teacherSubject || '') || '—');

    const totalMonthAulas = lessonsToPrint.length;
    const totalMonthHoras = totalMonthAulas * 2;
    const totalCourseAulas = myReportFilteredLessons.length;
    const totalCourseHoras = totalCourseAulas * 2;

    const docTitle = buildStandardDocumentTitle(
      'Meu Relatório Mensal de Aulas',
      `${monthName}-${targetYear} - ${courseTitle}`,
      userFullName
    );

    const rowsHtml =
      lessonsToPrint.length === 0
        ? `<tr><td colspan="5" style="text-align:center; padding:18px; color:#475569;">Nenhuma aula cadastrada para este usuário em ${escapeHtmlText(monthName)}/${targetYear}.</td></tr>`
        : lessonsToPrint
            .map(
              (l) => `
                <tr>
                  <td style="font-family: monospace; font-weight: bold; text-align: center; white-space: nowrap;">${escapeHtmlText(l.brDate)}</td>
                  <td style="text-align: center; white-space: nowrap;">${escapeHtmlText(l.slotTime)}</td>
                  <td style="font-weight: bold; text-align: center; white-space: nowrap;">${escapeHtmlText(l.turmaLabel)}</td>
                  <td>${escapeHtmlText(l.usuarioNome)}</td>
                  <td style="min-width: 150px;">&nbsp;</td>
                </tr>
              `
            )
            .join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 11px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .header .org { font-size: 10px; font-weight: bold; letter-spacing: 0.8px; text-transform: uppercase; color: #334155; }
    .header h1 { font-size: 15px; margin: 4px 0 2px; text-transform: uppercase; letter-spacing: 0.4px; }
    .header .sub { font-size: 11px; font-weight: bold; color: #1e293b; }
    .info-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .info-grid td { border: 1px solid #334155; padding: 6px 8px; vertical-align: top; }
    .info-label { display: block; font-size: 9px; font-weight: bold; text-transform: uppercase; color: #475569; margin-bottom: 2px; }
    .info-val { font-size: 11px; font-weight: bold; color: #0f172a; }
    .summary-bar { display: flex; justify-content: space-between; gap: 10px; background: #f8fafc; border: 1px solid #334155; padding: 8px 10px; margin-bottom: 12px; font-size: 11px; }
    .summary-item strong { color: #0f172a; }
    table.aulas { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    table.aulas th { background: #e2e8f0; border: 1px solid #0f172a; padding: 7px 6px; font-size: 10px; text-transform: uppercase; text-align: center; }
    table.aulas td { border: 1px solid #0f172a; padding: 7px 6px; font-size: 10.5px; height: 28px; }
    .footer-sign { margin-top: 26px; display: flex; justify-content: space-between; gap: 24px; }
    .sign-box { flex: 1; text-align: center; }
    .sign-line { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px; font-weight: bold; }
    .sign-sub { font-size: 9px; color: #475569; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org">Polícia Civil de Minas Gerais • Academia de Polícia Civil (ACADEPOL)</div>
    <h1>Folha Mensal de Aulas Ministradas</h1>
    <div class="sub">${escapeHtmlText(courseTitle)} • Referência: ${escapeHtmlText(monthName)}/${targetYear}</div>
  </div>

  <table class="info-grid">
    <tr>
      <td colspan="2">
        <span class="info-label">Nome Completo</span>
        <span class="info-val">${escapeHtmlText(userFullName)}</span>
      </td>
      <td>
        <span class="info-label">MASP</span>
        <span class="info-val" style="font-family: monospace;">${escapeHtmlText(userMasp)}</span>
      </td>
    </tr>
    <tr>
      <td>
        <span class="info-label">Matéria</span>
        <span class="info-val">${escapeHtmlText(resolvedSubjects)}</span>
      </td>
      <td>
        <span class="info-label">Sigla</span>
        <span class="info-val" style="font-family: monospace;">${escapeHtmlText(userSigla)}</span>
      </td>
      <td>
        <span class="info-label">Celular</span>
        <span class="info-val" style="font-family: monospace;">${escapeHtmlText(userPhone)}</span>
      </td>
    </tr>
  </table>

  <div class="summary-bar">
    <div class="summary-item">Aulas no Mês (${escapeHtmlText(monthName)}/${targetYear}): <strong>${totalMonthAulas} aula(s)</strong></div>
    <div class="summary-item">Carga Horária do Mês: <strong>${totalMonthHoras} horas-aula</strong> (2h/aula)</div>
    <div class="summary-item">Total no Curso CFTP: <strong>${totalCourseAulas} aula(s) / ${totalCourseHoras} horas-aula</strong></div>
  </div>

  <table class="aulas">
    <thead>
      <tr>
        <th style="width: 14%;">Data</th>
        <th style="width: 22%;">Horário</th>
        <th style="width: 12%;">Turma</th>
        <th style="width: 30%;">Usuário</th>
        <th style="width: 22%;">Assinatura</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer-sign">
    <div class="sign-box">
      <div class="sign-line">${escapeHtmlText(userFullName)}</div>
      <div class="sign-sub">MASP: ${escapeHtmlText(userMasp)} • Professor / Instrutor (${escapeHtmlText(userSigla)})</div>
    </div>
    <div class="sign-box">
      <div class="sign-line">Coordenação / Direção de Ensino</div>
      <div class="sign-sub">ACADEPOL • Conferência Mensal</div>
    </div>
  </div>
</body>
</html>`;

    printDocumentInPage(htmlContent, docTitle);
  };

  const openNewRecordModalForDiscipline = () => {
    const defaultCourse = formacaoCoursesList[0]?.name || 'Curso de Formação de Delegados de Polícia';
    setFormState({
      data_calendario: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`,
      horario_calendario: '08:00 as 09:40',
      turma_calendario: 'DL1',
      sigla_calendario: selectedDiscipline || 'MEAF',
      disciplina_calendario: selectedDisciplineName.split(' - ')[1] || selectedDiscipline || '',
      sala_calendario: 'SL01',
      curso_calendario: defaultCourse,
      modulo_calendario: 'Módulo I',
      ano_calendario: selectedYear,
      numero_aula_calendario: 1,
      equipe_calendario: 'Equipe Alpha',
      observacao_calendario: ''
    });
    setEditingRecordId(null);
    setIsCustomCourse(false);
    setShowRecordModal(true);
  };

  const openEditRecordModal = (rec: CalendarRecord) => {
    setFormState({ ...rec });
    setEditingRecordId(rec.id);
    setIsCustomCourse(false);
    setShowRecordModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback na primeira camada */}
      {feedback && (
        <TopLayerAlert
          type={feedback.type === 'success' ? 'success' : 'error'}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* HEADER BAR (Hidden on Print) */}
      <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl backdrop-blur-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-widest font-mono block">
                MÓDULO ACADÊMICO ACADEPOL
              </span>
              <h2 className="text-xl font-extrabold text-slate-100">
                Calendário Curso de Formação
              </h2>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl">
            Selecione uma matéria para abrir e gerenciar a grade horária. A contagem de aulas é sequencial e individual por matéria e turma.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCalendarViewMode('cftp')}
              className={`px-3 py-1.5 rounded-lg transition ${
                calendarViewMode === 'cftp'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Calendário CFTP
            </button>
            <button
              type="button"
              onClick={handleOpenMeuRelatorio}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                calendarViewMode === 'meu-relatorio'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Meu Relatório</span>
            </button>
          </div>

          {((calendarViewMode === 'cftp' && selectedCftpCourseObj && cftpSelectedSubject) ||
            (calendarViewMode === 'legacy' && selectedDiscipline)) && (
            <button
              onClick={() => {
                if (calendarViewMode === 'cftp') {
                  printWithWindowTitle(
                    buildStandardDocumentTitle(
                      'Calendário Curso de Formação',
                      `${selectedCftpCourseObj?.module || selectedCftpCourseObj?.name || 'CFTP'} - ${cftpSelectedSubject}`,
                      currentUser?.name || 'ACADEPOL'
                    )
                  );
                } else {
                  handlePrintPDF();
                }
              }}
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/20 flex items-center space-x-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir PDF</span>
            </button>
          )}

          {calendarViewMode === 'legacy' && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Importar Excel</span>
              </button>

              <button
                onClick={openNewRecordModalForDiscipline}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 flex items-center space-x-2 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Agendamento</span>
              </button>
            </>
          )}

          <button
            onClick={loadData}
            title="Atualizar dados"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* MODO CFTP: 1. SELECIONAR CURSO CFTP -> 2. SELECIONAR MATÉRIA -> CALENDÁRIO POR PERÍODOS E HORÁRIOS */}
      {calendarViewMode === 'cftp' && (
        <div className="space-y-6">
          {/* Passo 1: Seleção do Curso de Formação CFTP */}
          <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-extrabold text-slate-100">
                  1. Selecione o Curso de Formação (CFTP)
                </h3>
              </div>
              {selectedCftpCourseObj && (
                <span className="text-xs font-mono text-amber-300">
                  {selectedCftpCourseObj.module || selectedCftpCourseObj.name} ({selectedCftpCourseObj.code}) •{' '}
                  {formatIsoToBr((selectedCftpCourseObj.startDate || '').slice(0, 10))} a{' '}
                  {formatIsoToBr((selectedCftpCourseObj.endDate || '').slice(0, 10))}
                </span>
              )}
            </div>

            {cftpCourses.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-slate-950/50 rounded-2xl border border-slate-800 p-4">
                Nenhum curso de formação CFTP cadastrado ainda. Cadastre um curso em <strong className="text-amber-400">Curso de Formação → Novo CFTP</strong>.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-8">
                  <select
                    value={selectedCftpCourseId}
                    onChange={(e) => handleSelectCftpCourse(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">Selecione um Curso de Formação CFTP...</option>
                    {cftpCourses.map((crs) => {
                      const sIso = (crs.startDate || '').slice(0, 10);
                      const eIso = (crs.endDate || '').slice(0, 10);
                      const modCount = Array.isArray(crs.moduleSchedule) ? crs.moduleSchedule.length : 0;
                      return (
                        <option key={crs.id} value={crs.id}>
                          {crs.module || crs.name} - {crs.code} ({formatIsoToBr(sIso)} a {formatIsoToBr(eIso)}) — {modCount} horário(s)
                        </option>
                      );
                    })}
                  </select>
                </div>
                {selectedCftpCourseObj && (
                  <div className="md:col-span-4 text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                    <span>Matérias no horário:</span>
                    <strong className="text-amber-400 font-mono">{cftpCourseSubjects.length}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Passo 2: Aparece após selecionar o curso para selecionar a Matéria */}
            {selectedCftpCourseObj && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-extrabold text-slate-100 uppercase tracking-wider">
                      2. Selecione a Matéria para abrir o Calendário
                    </h4>
                  </div>
                  {cftpSelectedSubject && (
                    <button
                      type="button"
                      onClick={() => setCftpSelectedSubject('')}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 underline flex items-center space-x-1 self-start sm:self-auto"
                    >
                      <span>Trocar Matéria</span>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {cftpCourseSubjects.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
                    Este curso ainda não possui planilha de horários importada. Importe o horário do módulo em <strong className="text-amber-300">Curso de Formação</strong>.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {cftpCourseSubjects.map((subj) => {
                      const isSel = cftpSelectedSubject === subj.sigla;
                      return (
                        <button
                          key={subj.sigla}
                          type="button"
                          onClick={() => handleSelectCftpSubject(subj.sigla)}
                          title={`${subj.sigla} - ${subj.nome} (${subj.count} aula${subj.count > 1 ? 's' : ''})`}
                          className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-2 border ${
                            isSel
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-slate-950 text-amber-300 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/70'
                          }`}
                        >
                          <span>{subj.sigla}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSel ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                            {subj.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Estado vazio antes de selecionar Curso + Matéria */}
          {!selectedCftpCourseObj || !cftpSelectedSubject ? (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl w-14 h-14 mx-auto flex items-center justify-center text-amber-400">
                <Calendar className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-200">
                {!selectedCftpCourseObj
                  ? 'Selecione um Curso de Formação CFTP acima'
                  : 'Selecione uma Matéria para exibir o calendário'}
              </h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Ao selecionar o curso e a matéria, será exibido o calendário padrão separado por períodos (Manhã, Almoço e Tarde) e dias com data, horário, turma e siglas dos professores designados.
              </p>
            </div>
          ) : (
            /* Calendário Padrão CFTP Aberto */
            <div className="space-y-4">
              {/* Barra de Navegação de Mês e Filtros (Oculta na Impressão) */}
              <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <span className="px-3 py-1.5 bg-amber-500 text-slate-950 font-black text-sm font-mono rounded-lg">
                      {cftpSelectedSubject}
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-100">
                        {cftpCourseSubjects.find(s => s.sigla === cftpSelectedSubject)?.nome || cftpSelectedSubject}
                      </h3>
                      <span className="text-[11px] font-mono text-amber-300">
                        {selectedCftpCourseObj.module || selectedCftpCourseObj.name} • {cftpFilteredItems.length} aula(s) •{' '}
                        {cftpActiveTimeSlots.filter(s => s.type === 'class').length} horários/dia
                      </span>
                    </div>
                  </div>

                  {/* Controles de Mês / Ver Todos os Meses */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCftpShowAllMonths(prev => !prev)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition ${
                        cftpShowAllMonths
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 border-slate-700 text-slate-200 hover:border-amber-500/50'
                      }`}
                    >
                      {cftpShowAllMonths ? 'Exibindo Todos os Meses' : 'Ver Todos os Meses'}
                    </button>

                    {!cftpShowAllMonths && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedMonth === 0) {
                              setSelectedMonth(11);
                              setSelectedYear(y => y - 1);
                            } else {
                              setSelectedMonth(m => m - 1);
                            }
                          }}
                          className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-400 focus:outline-none"
                        >
                          {MONTH_NAMES.map((name, idx) => (
                            <option key={name} value={idx}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 focus:outline-none"
                        >
                          {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedMonth === 11) {
                              setSelectedMonth(0);
                              setSelectedYear(y => y + 1);
                            } else {
                              setSelectedMonth(m => m + 1);
                            }
                          }}
                          className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Atalhos rápidos de meses com aulas da matéria */}
                {cftpAvailableMonths.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">Meses com aulas:</span>
                    {cftpAvailableMonths.map((mInfo) => {
                      const active = !cftpShowAllMonths && selectedYear === mInfo.year && selectedMonth === mInfo.month;
                      return (
                        <button
                          key={`${mInfo.year}-${mInfo.month}`}
                          type="button"
                          onClick={() => {
                            setCftpShowAllMonths(false);
                            setSelectedYear(mInfo.year);
                            setSelectedMonth(mInfo.month);
                          }}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold transition ${
                            active
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-500/50'
                          }`}
                        >
                          {mInfo.label} ({mInfo.count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Filtros Turma / Sala / Busca */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Turma</label>
                    <select
                      value={cftpFilterTurma}
                      onChange={(e) => setCftpFilterTurma(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="TODAS">Todas as Turmas ({cftpAvailableTurmas.length})</option>
                      {cftpAvailableTurmas.map(t => (
                        <option key={t} value={t}>
                          Turma {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Sala</label>
                    <select
                      value={cftpFilterSala}
                      onChange={(e) => setCftpFilterSala(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="TODAS">Todas as Salas</option>
                      {cftpAvailableSalas.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Busca (Turma / Sigla Professor)</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Ex: DL01, MC, BR..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Grade Convencional Separada por Períodos e Dias */}
              <style>{`
                @media print {
                  @page { size: A4 portrait; margin: 10mm 8mm; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
                  html, body, #root, #root > div, main {
                    background-color: #ffffff !important; background-image: none !important;
                    color: #000000 !important; margin: 0 !important; padding: 0 !important;
                    width: 100% !important; max-width: 100% !important; overflow: visible !important;
                  }
                  .print\\:hidden, header, aside, footer, nav, button, input, select { display: none !important; }
                  .folha-pagina { width: 100% !important; max-width: 100% !important; margin: 0 !important; background: #ffffff !important; border: none !important; padding: 0 !important; box-shadow: none !important; }
                  .semana-bloco { display: block !important; page-break-inside: avoid !important; break-inside: avoid !important; margin-bottom: 5mm !important; }
                  .folha-pagina table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
                  tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
                }
                .folha-pagina { background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; }
                .folha-pagina table { width: 100% !important; border-collapse: collapse !important; font-size: 9.5px !important; color: #000000 !important; table-layout: fixed !important; }
                .folha-pagina th, .folha-pagina td { border: 1px solid #000000 !important; padding: 3px 3px !important; text-align: center !important; vertical-align: middle !important; color: #000000 !important; word-wrap: break-word !important; }
                .bg-dia { background-color: #D9D9D9 !important; font-weight: bold !important; color: #000000 !important; }
                .bg-manha { background-color: #D9E2F3 !important; font-weight: bold !important; color: #000000 !important; }
                .bg-tarde { background-color: #FFF2CC !important; font-weight: bold !important; color: #000000 !important; }
                .bg-noite { background-color: #E8EAF6 !important; font-weight: bold !important; color: #000000 !important; }
                .bg-almoco { background-color: #FFE699 !important; font-weight: 900 !important; letter-spacing: 1px !important; color: #000000 !important; text-align: center !important; }
                .bg-hora { background-color: #F2F2F2 !important; font-weight: bold !important; color: #000000 !important; }
                .bg-seg { background-color: #E2EFDA !important; font-weight: bold !important; color: #000000 !important; }
              `}</style>

              <div className="folha-pagina bg-white max-w-[1050px] w-full mx-auto shadow-2xl rounded border border-slate-300 print:border-none print:shadow-none print:rounded-none p-4 print:p-0 text-black">
                <div className="text-center pb-2 border-b border-black mb-3 font-sans">
                  <span className="text-[11px] font-bold text-slate-800 uppercase font-mono tracking-wider block">
                    ACADEPOL • {selectedCftpCourseObj.module || selectedCftpCourseObj.name} ({selectedCftpCourseObj.code})
                  </span>
                  <h2 className="font-extrabold text-sm uppercase tracking-wide text-black mt-0.5">
                    {cftpSelectedSubject} — {cftpCourseSubjects.find(s => s.sigla === cftpSelectedSubject)?.nome || cftpSelectedSubject}
                  </h2>
                </div>

                {cftpWeeksToRender.length === 0 ? (
                  <div className="text-center text-slate-600 py-8 text-xs font-mono">
                    Nenhuma aula encontrada para este filtro no período selecionado.
                  </div>
                ) : (
                  <div className="space-y-4 print:space-y-3">
                    {cftpWeeksToRender.map((week) => {
                      const morningCount = cftpActiveTimeSlots.filter(s => s.period === 'MANHÃ').length;
                      const afternoonCount = cftpActiveTimeSlots.filter(s => s.period === 'TARDE').length;

                      return (
                        <div key={`${week.weekNum}-${week.days[0]?.dateStr}`} className="semana-bloco">
                          <div
                            className="text-center font-black text-[11px] uppercase text-black py-1 mb-1 font-sans border border-black"
                            style={{ backgroundColor: '#f1f5f9', color: '#000000' }}
                          >
                            SEMANA {week.weekNum} ({week.days[0].formattedDate} a {week.days[4].formattedDate})
                          </div>

                          <table className="w-full border-collapse text-[10px] text-black" style={{ tableLayout: 'fixed' }}>
                            <thead>
                              <tr>
                                <th style={{ width: '8%' }} className="bg-dia">PERÍODO</th>
                                <th style={{ width: '15%' }} className="bg-dia">DIA / HORÁRIO</th>
                                {week.days.map((day) => (
                                  <th key={day.dateStr} className="bg-dia" style={{ width: '15.4%' }}>
                                    {day.formattedDate}
                                  </th>
                                ))}
                              </tr>
                              <tr>
                                <th className="bg-manha">TURNO</th>
                                <th className="bg-hora">HORA</th>
                                {week.days.map((day) => (
                                  <th key={day.dateStr} className="bg-seg">
                                    {day.dayName}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cftpActiveTimeSlots.map((slot, sIdx) => {
                                const isFirstMorning = slot.period === 'MANHÃ' && sIdx === 0;
                                const isFirstAfternoon = slot.period === 'TARDE' && cftpActiveTimeSlots[sIdx - 1]?.period !== 'TARDE';

                                if (slot.type === 'break') {
                                  return (
                                    <tr key={slot.id}>
                                      <td className="bg-almoco" style={{ fontWeight: 900 }}>
                                        ALMOÇO
                                      </td>
                                      <td className="bg-hora">
                                        <div className="font-bold leading-tight">{slot.title}</div>
                                        <div className="font-mono text-[8.5px] text-slate-700 leading-tight">{slot.timeLabel}</div>
                                      </td>
                                      {week.days.map((day) => (
                                        <td key={day.dateStr} className="bg-almoco" style={{ height: '20px' }}>
                                          HORÁRIO DE ALMOÇO
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={slot.id}>
                                    {isFirstMorning && (
                                      <td className="bg-manha" rowSpan={morningCount} style={{ fontWeight: 900 }}>
                                        MANHÃ
                                      </td>
                                    )}
                                    {isFirstAfternoon && (
                                      <td className="bg-tarde" rowSpan={afternoonCount} style={{ fontWeight: 900 }}>
                                        TARDE
                                      </td>
                                    )}
                                    {slot.period === 'NOITE' && (
                                      <td className="bg-noite" style={{ fontWeight: 900 }}>
                                        EXTRA
                                      </td>
                                    )}

                                    <td className="bg-hora">
                                      <div className="font-bold leading-tight">{slot.title}</div>
                                      <div className="font-mono text-[8.5px] text-slate-700 leading-tight">{slot.timeLabel}</div>
                                    </td>

                                    {week.days.map((day) => {
                                      const cellItems = cftpFilteredItems.filter(
                                        item => item.isoDate === day.dateStr && item.slotId === slot.id
                                      );

                                      return (
                                        <td key={day.dateStr} className="cell-slot p-1 align-top text-center">
                                          {cellItems.length === 0 ? (
                                            <div className="flex items-center justify-center min-h-[34px]">
                                              <span className="text-slate-400 font-mono text-[9px]">-</span>
                                            </div>
                                          ) : (
                                            <div className="flex flex-col space-y-1 justify-start items-center w-full min-h-[34px]">
                                              {cellItems.map((ci) => {
                                                const siglasText = ci.professores.map(p => p.sigla).filter(Boolean).join(' ');
                                                return (
                                                  <div
                                                    key={ci.key}
                                                    onClick={() =>
                                                      setCftpDetailCell({
                                                        isoDate: ci.isoDate,
                                                        brDate: ci.brDate,
                                                        slotTitle: slot.title,
                                                        slotTime: slot.timeLabel,
                                                        turma: ci.turmaLabel,
                                                        aulaNumero: ci.aulaNumero,
                                                        sigla: ci.sigla,
                                                        disciplina: ci.disciplina,
                                                        sala: ci.sala,
                                                        equipeApelido: ci.equipeApelido,
                                                        professores: ci.professores
                                                      })
                                                    }
                                                    title={`${ci.brDate} | ${slot.title} (${slot.timeLabel}) | Turma ${ci.turmaLabel} (${ci.aulaNumero}ª aula) | ${ci.professores.length > 0 ? ci.professores.map(p => `${p.nome} [${p.sigla}]`).join(', ') : 'Sem equipe designada'}`}
                                                    className="cursor-pointer hover:bg-amber-100 transition py-0.5 px-1 border border-slate-400 rounded bg-white text-black w-full text-center flex flex-col items-center justify-center leading-tight"
                                                  >
                                                    <div className="flex flex-wrap items-center justify-center gap-1 w-full text-[9px] font-mono">
                                                      <span className="font-black text-black">{ci.turmaLabel}</span>
                                                      <span className="font-bold text-slate-700">{ci.aulaNumero}ª</span>
                                                      {siglasText ? (
                                                        <span className="font-black text-slate-950 uppercase tracking-tight">
                                                          {siglasText}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[8px] text-slate-500 font-normal">S/Eq</span>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DETALHES DA AULA CFTP */}
      {cftpDetailCell && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 bg-amber-500 text-slate-950 font-black text-xs font-mono rounded-lg">
                  {cftpDetailCell.sigla}
                </span>
                <h3 className="text-base font-extrabold text-slate-100">
                  Detalhes da Aula — {cftpDetailCell.turma}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCftpDetailCell(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
                <div className="text-sm font-bold text-white">{cftpDetailCell.disciplina}</div>
                <div className="text-amber-400 font-mono font-bold">
                  Turma {cftpDetailCell.turma} • {cftpDetailCell.aulaNumero}ª Aula sequencial
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Data</span>
                  <span className="text-white font-bold">{cftpDetailCell.brDate}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Horário</span>
                  <span className="text-amber-300 font-bold">{cftpDetailCell.slotTitle}</span>
                  <span className="text-slate-400 block text-[10px]">{cftpDetailCell.slotTime}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Turma</span>
                  <span className="text-white font-bold">{cftpDetailCell.turma}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Sala / Local</span>
                  <span className="text-cyan-300 font-bold">{cftpDetailCell.sala || '—'}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-400 uppercase font-mono font-bold tracking-wider">
                    Professores Designados
                  </span>
                  {cftpDetailCell.equipeApelido && (
                    <span className="text-[11px] font-bold text-emerald-300">
                      Equipe {cftpDetailCell.equipeApelido}
                    </span>
                  )}
                </div>
                {cftpDetailCell.professores.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Nenhuma equipe designada para esta turma neste período. Use <strong className="text-amber-300">Curso de Formação → Designar equipe</strong> para vincular uma equipe.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {cftpDetailCell.professores.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-200 font-medium">{p.nome}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-bold text-[11px]">
                          {p.sigla}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCftpDetailCell(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODO MEU RELATÓRIO: QUANTIDADE DE AULAS E HORAS-AULA DO USUÁRIO LOGADO + IMPRESSÃO MENSAL */}
      {calendarViewMode === 'meu-relatorio' && (
        <div className="space-y-5">
          {/* Seleção do Curso CFTP e Filtro Opcional de Matéria */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-100">
                    Meu Relatório de Aulas Ministradas (2 horas-aula por aula)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Contabilização automática por mês e no curso CFTP selecionado conforme equipes designadas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePrintMyMonthlyReport()}
                disabled={!selectedReportCourseObj}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/20 flex items-center space-x-2 transition self-start md:self-auto"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Folha do Mês ({MONTH_NAMES[reportMonth]}/{reportYear})</span>
              </button>
            </div>

            {cftpCourses.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-slate-950/50 rounded-2xl border border-slate-800 p-4">
                Nenhum curso de formação CFTP cadastrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-6">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Curso de Formação (CFTP)
                  </label>
                  <select
                    value={selectedReportCourseObj?.id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setReportCourseId(nextId);
                      setReportSubjectFilter('TODAS');
                      syncReportMonthToAvailable(nextId);
                    }}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:border-amber-400 focus:outline-none"
                  >
                    {cftpCourses.map((crs) => {
                      const sIso = (crs.startDate || '').slice(0, 10);
                      const eIso = (crs.endDate || '').slice(0, 10);
                      return (
                        <option key={crs.id} value={crs.id}>
                          {crs.module || crs.name} - {crs.code} ({formatIsoToBr(sIso)} a {formatIsoToBr(eIso)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Matéria
                  </label>
                  <select
                    value={reportSubjectFilter}
                    onChange={(e) => setReportSubjectFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold focus:border-amber-400 focus:outline-none"
                  >
                    <option value="TODAS">Todas ({myReportAvailableSubjects.length})</option>
                    {myReportAvailableSubjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Mês
                  </label>
                  <select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-400 font-bold focus:border-amber-400 focus:outline-none"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Ano
                  </label>
                  <select
                    value={reportYear}
                    onChange={(e) => setReportYear(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold focus:border-amber-400 focus:outline-none"
                  >
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Dados do Usuário + Totais (Mês e Curso Completo) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider font-mono border-b border-slate-800 pb-2">
                Dados do Docente / Usuário
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Nome Completo</span>
                  <span className="text-slate-100 font-bold">{currentUser?.name || '—'}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">MASP</span>
                  <span className="text-slate-100 font-mono font-bold">{formatMasp(currentUser?.masp || '') || '—'}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Celular</span>
                  <span className="text-slate-100 font-mono font-bold">
                    {formatPhone(currentUser?.phone || '') || currentUser?.phone || '—'}
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Matéria</span>
                  <span className="text-amber-300 font-bold">
                    {reportSubjectFilter !== 'TODAS'
                      ? reportSubjectFilter
                      : myReportAvailableSubjects.length > 0
                        ? myReportAvailableSubjects.join(', ')
                        : (currentUser?.teacherSubject || '—')}
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Sigla</span>
                  <span className="text-amber-300 font-mono font-black">
                    {(currentUser?.professorSigla || currentUser?.professor_sigla || '').trim().toUpperCase() || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono block">
                  No Mês ({MONTH_NAMES[reportMonth]}/{reportYear})
                </span>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-white font-mono">
                    {myReportMonthLessons.length}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">aula(s)</span>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                <span className="text-[10px] text-amber-300 uppercase font-bold block">Horas-Aula do Mês</span>
                <span className="text-lg font-black text-amber-400 font-mono">
                  {myReportMonthLessons.length * 2} horas-aula
                </span>
                <span className="text-[10px] text-slate-400 block">2 horas-aula por aula</span>
              </div>
            </div>

            <div className="lg:col-span-3 bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono block">
                  Todo o Curso CFTP
                </span>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-white font-mono">
                    {myReportFilteredLessons.length}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">aula(s)</span>
                </div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
                <span className="text-[10px] text-emerald-300 uppercase font-bold block">Carga Horária Total</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {myReportFilteredLessons.length * 2} horas-aula
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {selectedReportCourseObj?.module || selectedReportCourseObj?.name || 'Curso CFTP'}
                </span>
              </div>
            </div>
          </div>

          {/* Resumo Separado por Mês */}
          {myReportMonthlySummary.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                Distribuição por Mês no Curso Selecionado
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {myReportMonthlySummary.map((mItem) => {
                  const isActive = mItem.year === reportYear && mItem.month === reportMonth;
                  return (
                    <div
                      key={mItem.key}
                      onClick={() => {
                        setReportYear(mItem.year);
                        setReportMonth(mItem.month);
                      }}
                      className={`cursor-pointer rounded-xl border p-3 transition flex items-center justify-between ${
                        isActive
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-500/50'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-extrabold">{mItem.label}</div>
                        <div className="text-[11px] font-mono text-amber-300 font-bold">
                          {mItem.aulas} aula(s) • {mItem.horasAula} h/a
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportYear(mItem.year);
                          setReportMonth(mItem.month);
                          handlePrintMyMonthlyReport(mItem.year, mItem.month);
                        }}
                        title={`Imprimir folha de ${mItem.label}`}
                        className="p-2 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 rounded-lg transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabela de Discriminação das Aulas do Mês */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-extrabold text-slate-100 uppercase tracking-wider">
                  Aulas do Mês — {MONTH_NAMES[reportMonth]}/{reportYear}
                </h4>
                <span className="text-[11px] text-slate-400">
                  {myReportMonthLessons.length} aula(s) • {myReportMonthLessons.length * 2} horas-aula computadas
                </span>
              </div>
              <button
                type="button"
                onClick={() => handlePrintMyMonthlyReport()}
                className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition self-start sm:self-auto"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Folha do Mês</span>
              </button>
            </div>

            {myReportMonthLessons.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800">
                Nenhuma aula cadastrada para <strong className="text-slate-200">{currentUser?.name}</strong> em{' '}
                <strong className="text-amber-300">{MONTH_NAMES[reportMonth]}/{reportYear}</strong> neste curso.
                {myReportMonthlySummary.length > 0 && (
                  <span className="block mt-1 text-[11px] text-slate-500">
                    Selecione um dos meses listados acima em &ldquo;Distribuição por Mês&rdquo;.
                  </span>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-mono">
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Horário</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3">Matéria</th>
                      <th className="py-2.5 px-3">Usuário</th>
                      <th className="py-2.5 px-3 text-center">Horas-Aula</th>
                      <th className="py-2.5 px-3">Assinatura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {myReportMonthLessons.map((l) => (
                      <tr key={l.key} className="hover:bg-slate-950/60">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-100 whitespace-nowrap">{l.brDate}</td>
                        <td className="py-2.5 px-3 font-mono text-amber-300 whitespace-nowrap">{l.slotTime}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-white whitespace-nowrap">{l.turmaLabel}</td>
                        <td className="py-2.5 px-3 font-mono text-cyan-300 font-bold">{l.sigla}</td>
                        <td className="py-2.5 px-3 text-slate-200 font-medium">{l.usuarioNome}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-400">2 h/a</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">______________________</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODO LEGACY: GRADE AVULSA (CALENDARIO_AULAS) */}
      {calendarViewMode === 'legacy' && (
        <>
          {/* STEP 1: SUBJECT / DISCIPLINE SELECTION PANEL (Print: Hidden) */}
          <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-extrabold text-slate-100">
                  1. Seleção da Matéria / Disciplina
                </h3>
              </div>

              {selectedDiscipline && (
                <button
                  onClick={() => setSelectedDiscipline('')}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 underline flex items-center space-x-1"
                >
                  <span>Trocar / Desmarcar Disciplina</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of Disciplines / Badges (Only Siglas, hover shows full name) */}
            {uniqueSubjectsMap.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-slate-950/50 rounded-2xl border border-slate-800/80 p-4">
                Nenhuma disciplina cadastrada no banco. Clique em <strong className="text-amber-400">Novo Agendamento</strong> ou <strong className="text-amber-400">Importar Excel</strong> para adicionar aulas.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {uniqueSubjectsMap.map((subj) => {
                  const isSelected = selectedDiscipline === subj.sigla;
                  return (
                    <button
                      key={subj.sigla}
                      onClick={() => setSelectedDiscipline(subj.sigla)}
                      title={`${subj.sigla} - ${subj.nome} (${subj.count} aula${subj.count > 1 ? 's' : ''})`}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono font-black transition flex items-center space-x-1.5 border shadow-sm ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-500/40 shadow-amber-500/20 scale-105'
                          : 'bg-slate-950 text-amber-400 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{subj.sigla}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${isSelected ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}>
                        {subj.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* STATE A: NO DISCIPLINE SELECTED */}
          {!selectedDiscipline ? (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-full w-16 h-16 mx-auto flex items-center justify-center text-amber-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-extrabold text-slate-200">
                  Selecione uma matéria para iniciar o calendário
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Clique em uma das siglas acima para visualizar os dias, horários e número das aulas por turma.
                </p>
              </div>
            </div>
          ) : (
            /* STATE B: DISCIPLINE SELECTED - SHOW CALENDAR GRID */
        <div className="space-y-6">
          {/* Active Discipline Header Indicator */}
          <div className="print:hidden bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <span className="px-3 py-1.5 bg-amber-500 text-slate-950 font-black text-sm font-mono rounded-xl shadow">
                {selectedDiscipline}
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-100">
                  {selectedDisciplineName}
                </h3>
                <span className="text-[11px] font-mono text-amber-400/90 font-semibold">
                  Exibindo {activeDisciplineRecords.length} aula(s) cadastrada(s)
                </span>
              </div>
            </div>

            {/* Navigation & Month / Year Selector */}
            <div className="print:hidden flex items-center space-x-2">
              <button
                onClick={() => {
                  if (selectedMonth === 0) {
                    setSelectedMonth(11);
                    setSelectedYear((y) => y - 1);
                  } else {
                    setSelectedMonth((m) => m - 1);
                  }
                }}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-400 focus:outline-none"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 focus:outline-none"
              >
                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  if (selectedMonth === 11) {
                    setSelectedMonth(0);
                    setSelectedYear((y) => y + 1);
                  } else {
                    setSelectedMonth((m) => m + 1);
                  }
                }}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* SECONDARY FILTERS BAR (Print: Hidden) */}
          <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
            {/* TURMA Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                TURMA
              </label>
              <select
                value={filterTurma}
                onChange={(e) => setFilterTurma(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODAS">Todas as Turmas</option>
                {uniqueTurmas.map((t) => (
                  <option key={t} value={t}>
                    Turma {t}
                  </option>
                ))}
              </select>
            </div>

            {/* SALA Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                SALA
              </label>
              <select
                value={filterSala}
                onChange={(e) => setFilterSala(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODAS">Todas as Salas</option>
                {uniqueSalas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* EQUIPE Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                EQUIPE / INSTRUTOR
              </label>
              <select
                value={filterEquipe}
                onChange={(e) => setFilterEquipe(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODAS">Todas as Equipes</option>
                {uniqueEquipes.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </select>
            </div>

            {/* MÓDULO Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                MÓDULO
              </label>
              <select
                value={filterModulo}
                onChange={(e) => setFilterModulo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODOS">Todos os Módulos</option>
                {uniqueModulos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* SEARCH TEXT */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                BUSCA RÁPIDA
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Turma, sala..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* MAIN VIEW: CONTINUOUS HTML TEMPLATE STYLE TABLE */}
          <div className="space-y-6">
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 10mm 8mm;
                }
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  box-sizing: border-box !important;
                }
                html, body, #root, #root > div, main {
                  background-color: #ffffff !important;
                  background-image: none !important;
                  color: #000000 !important;
                  box-shadow: none !important;
                  text-shadow: none !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  overflow: visible !important;
                }
                .print\\:hidden, header, aside, footer, nav, button, input, select {
                  display: none !important;
                }
                .folha-pagina {
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  background: #ffffff !important;
                  border: none !important;
                  padding: 0 !important;
                  box-shadow: none !important;
                  border-radius: 0 !important;
                }
                .semana-bloco {
                  display: block !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  break-inside: avoid-page !important;
                  margin-bottom: 5mm !important;
                  background-color: #ffffff !important;
                }
                .folha-pagina table {
                  width: 100% !important;
                  max-width: 100% !important;
                  table-layout: fixed !important;
                  border-collapse: collapse !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  break-inside: avoid-page !important;
                  background-color: #ffffff !important;
                  border: none !important;
                }
                tr, td, th {
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  break-inside: avoid-page !important;
                }
                td.cell-slot {
                  height: 34px !important;
                  min-height: 34px !important;
                  padding: 1px !important;
                }
                td.cell-slot > div {
                  min-height: 34px !important;
                }
                .celula-aula {
                  border: none !important;
                }
              }
              .folha-pagina {
                background: #ffffff !important;
                color: #000000 !important;
                font-family: Arial, Helvetica, sans-serif !important;
              }
              .folha-pagina table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 9.5px !important;
                color: #000000 !important;
                table-layout: fixed !important;
                border: none !important;
              }
              .folha-pagina th, .folha-pagina td {
                border: 1px solid #000000 !important;
                padding: 2px 2px !important;
                text-align: center !important;
                vertical-align: middle !important;
                color: #000000 !important;
                word-wrap: break-word !important;
                overflow: hidden !important;
              }
              .bg-dia { background-color: #D9D9D9 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-manha { background-color: #D9E2F3 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-tarde { background-color: #FFF2CC !important; font-weight: bold !important; color: #000000 !important; }
              .bg-almoco { background-color: #FFE699 !important; font-weight: 900 !important; letter-spacing: 2px !important; color: #000000 !important; text-align: center !important; height: 16px !important; }
              .bg-hora { background-color: #F2F2F2 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-seg { background-color: #E2EFDA !important; font-weight: bold !important; color: #000000 !important; }
              .celula-aula { background-color: #ffffff !important; border: 1px solid #cbd5e1 !important; }
              @media print {
                .celula-aula { border: none !important; }
              }
            `}</style>

            <div className="folha-pagina bg-white max-w-[1000px] w-full mx-auto shadow-2xl rounded border border-slate-300 print:border-none print:shadow-none print:rounded-none p-4 print:p-0 text-black">
              {/* Header Único do Documento */}
              <div className="text-center pb-2 border-b border-black mb-3 font-sans">
                <span className="text-[11px] font-bold text-slate-800 uppercase font-mono tracking-wider block">
                  ACADEPOL CURSO DE FORMAÇÃO
                </span>
                <h2 className="font-extrabold text-sm uppercase tracking-wide text-black mt-0.5">
                  {selectedDisciplineName || selectedDiscipline || 'CALENDÁRIO LETIVO'}
                </h2>
              </div>

              {weeksToRender.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-xs font-mono">
                  Nenhuma semana encontrada para esta matéria no período.
                </div>
              ) : (
                <div className="space-y-4 print:space-y-3">
                  {weeksToRender.map((week) => (
                    <div key={`${week.weekNum}-${week.days[0]?.dateStr}`} className="semana-bloco">
                      {/* Week Header */}
                      <div className="text-center font-black text-[11px] uppercase text-black py-0.5 mb-1 font-sans bg-white border border-black print:border-black print:border" style={{ borderWidth: '1px', backgroundColor: '#f1f5f9', color: '#000000' }}>
                        SEMANA {week.weekNum} ({week.days[0].formattedDate} a {week.days[4].formattedDate})
                      </div>

                      <table className="w-full border-collapse text-[10px] text-black" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '8%' }} className="bg-dia"></th>
                            <th style={{ width: '12%' }} className="bg-dia">DIA</th>
                            {week.days.map((day) => (
                              <th key={day.dateStr} colSpan={4} className="bg-dia" style={{ width: '16%' }}>
                                {day.formattedDate}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            <th style={{ width: '8%' }} className="bg-manha">MANHÃ</th>
                            <th style={{ width: '12%' }} className="bg-hora">HORA</th>
                            {week.days.map((day) => (
                              <th key={day.dateStr} colSpan={4} className="bg-seg" style={{ width: '16%' }}>
                                {day.dayName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* 8:00-9:40 */}
                          <tr>
                            <td className="bg-manha" rowSpan={2} style={{ fontWeight: 900 }}>
                              MANHÃ
                            </td>
                            <td className="bg-hora">8:00-9:40</td>
                            {week.days.map((day) => {
                              const slotRecords = activeDisciplineRecords.filter(
                                (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '08:00 as 09:40'
                              );
                              return (
                                <td key={day.dateStr} colSpan={4} className="cell-slot p-0.5 align-top text-center">
                                  {renderSlotCellContent(slotRecords)}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 10:00-11:40 */}
                          <tr>
                            <td className="bg-hora">10:00-11:40</td>
                            {week.days.map((day) => {
                              const slotRecords = activeDisciplineRecords.filter(
                                (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '10:00 as 11:40'
                              );
                              return (
                                <td key={day.dateStr} colSpan={4} className="cell-slot p-0.5 align-top text-center">
                                  {renderSlotCellContent(slotRecords)}
                                </td>
                              );
                            })}
                          </tr>

                          {/* ALMOÇO */}
                          <tr>
                            <td className="bg-tarde" style={{ fontWeight: 900 }}>
                              TARDE
                            </td>
                            <td className="bg-hora">12:00-14:00</td>
                            {week.days.map((day) => (
                              <td key={day.dateStr} colSpan={4} className="bg-almoco" style={{ height: '16px' }}>
                                ALMOÇO
                              </td>
                            ))}
                          </tr>

                          {/* 14:00-15:40 */}
                          <tr>
                            <td className="bg-tarde" rowSpan={2} style={{ fontWeight: 900 }}>
                              TARDE
                            </td>
                            <td className="bg-hora">14:00-15:40</td>
                            {week.days.map((day) => {
                              const slotRecords = activeDisciplineRecords.filter(
                                (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '14:00 as 15:40'
                              );
                              return (
                                <td key={day.dateStr} colSpan={4} className="cell-slot p-0.5 align-top text-center">
                                  {renderSlotCellContent(slotRecords)}
                                </td>
                              );
                            })}
                          </tr>

                          {/* 16:00-17:40 */}
                          <tr>
                            <td className="bg-hora">16:00-17:40</td>
                            {week.days.map((day) => {
                              const slotRecords = activeDisciplineRecords.filter(
                                (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '16:00 as 17:40'
                              );
                              return (
                                <td key={day.dateStr} colSpan={4} className="cell-slot p-0.5 align-top text-center">
                                  {renderSlotCellContent(slotRecords)}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* MODAL 1: DETALHES DA AULA (CLICKED FROM GRID) */}
      {detailRecord && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 bg-amber-500 text-slate-950 font-black text-xs font-mono rounded-lg">
                  {detailRecord.sigla_calendario}
                </span>
                <h3 className="text-base font-extrabold text-slate-100">
                  Detalhes da Aula
                </h3>
              </div>
              <button
                onClick={() => setDetailRecord(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="text-sm font-extrabold text-slate-100">
                  {detailRecord.disciplina_calendario || detailRecord.sigla_calendario}
                </div>
                <div className="text-amber-400 font-mono font-bold flex items-center space-x-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>
                    Turma {detailRecord.turma_calendario} • Aula nº {getCalculatedLessonNumber(detailRecord)} (sequencial da matéria)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Data & Horário</span>
                  <span className="text-slate-200 font-bold">{detailRecord.data_calendario}</span>
                  <span className="text-slate-400 block text-[10px]">{detailRecord.horario_calendario}</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Sala / Local</span>
                  <span className="text-cyan-300 font-bold">{detailRecord.sala_calendario || 'SL01'}</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Curso de Formação</span>
                  <span className="text-slate-200">{detailRecord.curso_calendario || '-'}</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Módulo & Ano</span>
                  <span className="text-indigo-300 font-bold">{detailRecord.modulo_calendario || 'Módulo I'} ({detailRecord.ano_calendario || 2026})</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-amber-400 block uppercase font-mono font-bold tracking-wider">
                  EQUIPE E PROFESSORES DA AULA
                </span>
                {(() => {
                  const teamInfo = getTeamProfessorsSiglas(detailRecord);
                  return (
                    <div className="space-y-2 text-xs font-sans">
                      <div className="flex items-center justify-between text-slate-200">
                        <span>Equipe Selecionada: <strong className="text-amber-300 font-mono font-bold">Equipe {teamInfo.equipeNome || detailRecord.equipe_calendario || 'Não especificada'}</strong></span>
                      </div>
                      <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="text-slate-100 font-semibold flex items-center justify-between">
                          <span><span className="text-amber-400 font-bold">Professor Titular:</span> {teamInfo.titularNome || 'Titular'}</span>
                          <span className="bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded text-[10.5px] font-mono font-black border border-amber-500/30">
                            [{teamInfo.titularSigla}]
                          </span>
                        </div>
                        {teamInfo.instrutores.length > 0 && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                            <span className="text-[10px] text-indigo-300 font-mono font-bold uppercase block">Instrutores Auxiliares da Equipe:</span>
                            {teamInfo.instrutores.map((inst, i) => (
                              <div key={i} className="flex items-center justify-between text-[11px] text-slate-300 pl-2">
                                <span><strong className="text-slate-400">{inst.rotulo || `Instrutor 0${i + 2}`}:</strong> {inst.instrutorNome || 'Instrutor'}</span>
                                <span className="text-indigo-300 font-mono font-bold">[{inst.siglaInstrutor || '-'}]</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {detailRecord.observacao_calendario && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold mb-1">Observações</span>
                  <p className="text-slate-300 font-sans text-[11px] leading-relaxed">{detailRecord.observacao_calendario}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => handleDeleteRecord(detailRecord.id)}
                className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => openEditRecordModal(detailRecord)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => setDetailRecord(null)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW / EDIT RECORD FORM */}
      {showRecordModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-extrabold text-slate-100 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <span>{editingRecordId ? 'Editar Agendamento' : 'Novo Agendamento de Aula'}</span>
              </h3>
              <button
                onClick={() => {
                  setShowRecordModal(false);
                  setEditingRecordId(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Data */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    DATA DA AULA *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.data_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, data_calendario: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Horário Slot */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    FAIXA HORÁRIA *
                  </label>
                  <select
                    value={formState.horario_calendario || '08:00 as 09:40'}
                    onChange={(e) => setFormState({ ...formState, horario_calendario: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="08:00 as 09:40">1ª Aula (08:00 as 09:40)</option>
                    <option value="10:00 as 11:40">2ª Aula (10:00 as 11:40)</option>
                    <option value="14:00 as 15:40">3ª Aula (14:00 as 15:40)</option>
                    <option value="16:00 as 17:40">4ª Aula (16:00 as 17:40)</option>
                  </select>
                </div>

                {/* Turma */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    TURMA (ex: DL 01, EP 01) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.turma_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, turma_calendario: e.target.value.toUpperCase() })}
                    onBlur={(e) => setFormState({ ...formState, turma_calendario: formatTurmaCode(e.target.value) })}
                    placeholder="Ex: DL 01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none uppercase font-mono font-bold"
                  />
                </div>

                {/* Sigla */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    SIGLA DA DISCIPLINA *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.sigla_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, sigla_calendario: e.target.value.toUpperCase() })}
                    placeholder="Ex: MEAF"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-amber-400 focus:border-amber-500 focus:outline-none uppercase font-mono font-extrabold"
                  />
                </div>

                {/* Nome Completo da Disciplina */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    NOME DA DISCIPLINA
                  </label>
                  <input
                    type="text"
                    value={formState.disciplina_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, disciplina_calendario: e.target.value })}
                    placeholder="Ex: Manuseio e Emprego de Armas de Fogo"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Sala */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    SALA / LOCAL
                  </label>
                  <input
                    type="text"
                    value={formState.sala_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, sala_calendario: e.target.value })}
                    placeholder="Ex: SL01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Módulo */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    MÓDULO DO CURSO
                  </label>
                  <select
                    value={formState.modulo_calendario || 'Módulo I'}
                    onChange={(e) => setFormState({ ...formState, modulo_calendario: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    {PRESET_MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Curso de Formação */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    CURSO DE FORMAÇÃO
                  </label>
                  <select
                    value={isCustomCourse ? 'CUSTOM' : formState.curso_calendario || ''}
                    onChange={(e) => {
                      if (e.target.value === 'CUSTOM') {
                        setIsCustomCourse(true);
                        setFormState({ ...formState, curso_calendario: '' });
                      } else {
                        setIsCustomCourse(false);
                        setFormState({ ...formState, curso_calendario: e.target.value });
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    {formacaoCoursesList.map((c, i) => (
                      <option key={i} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    <option value="CUSTOM">+ Outro Curso (Digitar)</option>
                  </select>

                  {isCustomCourse && (
                    <input
                      type="text"
                      value={formState.curso_calendario || ''}
                      onChange={(e) => setFormState({ ...formState, curso_calendario: e.target.value })}
                      placeholder="Digite o nome do curso de formação..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 mt-2 focus:border-amber-500 focus:outline-none"
                    />
                  )}
                </div>

                {/* Equipe / Time Selecionado */}
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                    EQUIPE DA MATÉRIA *
                  </label>
                  <select
                    value={formState.equipe_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, equipe_calendario: e.target.value })}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-2 text-slate-100 font-bold focus:border-amber-500 focus:outline-none text-xs"
                    required
                  >
                    <option value="">Selecione a Equipe...</option>
                    {/* Registered teams for this subject */}
                    {equipesList
                      .filter((eq) => !formState.sigla_calendario || !eq.materia || eq.materia.toUpperCase() === (formState.sigla_calendario || '').toUpperCase())
                      .map((eq) => (
                        <option key={eq.id} value={eq.nome_da_equipe}>
                          Equipe {eq.nome_da_equipe} ({eq.professor_titular_equipe ? `Titular: ${eq.professor_titular_equipe}` : 'Sem Titular'})
                        </option>
                      ))}
                    {/* Fallback list for Phonetic alphabet team names */}
                    <optgroup label="Todas as Equipes (Alfabeto Fonético)">
                      {TEAM_NAMES_LIST.map((teamName) => (
                        <option key={teamName} value={teamName}>
                          Equipe {teamName}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Ano */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    ANO LETIVO
                  </label>
                  <input
                    type="number"
                    value={formState.ano_calendario || 2026}
                    onChange={(e) => setFormState({ ...formState, ano_calendario: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Observações */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    OBSERVAÇÕES ADICIONAIS
                  </label>
                  <textarea
                    rows={2}
                    value={formState.observacao_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, observacao_calendario: e.target.value })}
                    placeholder="Observações sobre a aula..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 transition"
                >
                  Salvar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: IMPORT (EXCEL / PDF) */}
      {showImportModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-extrabold text-slate-100">
                  Importar Tabela ou PDF (.pdf, .xlsx, .csv)
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setPreviewRecords([]);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Selecione o arquivo PDF ou a planilha Excel contendo as colunas: <strong className="text-amber-400">DATA</strong>, <strong className="text-amber-400">HORARIO</strong>, <strong className="text-amber-400">TURMA</strong>, <strong className="text-amber-400">SIGLA</strong>, <strong className="text-amber-400">DISCIPLINA</strong>, <strong className="text-amber-400">SALA</strong>, <strong className="text-amber-400">MODULO</strong>, <strong className="text-amber-400">ANO</strong>.
            </p>

            <div className="border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl p-6 text-center space-y-3 bg-slate-950/50 transition">
              <Upload className="w-8 h-8 text-indigo-400 mx-auto" />
              <div className="text-xs text-slate-300">
                <label className="cursor-pointer font-extrabold text-amber-400 hover:underline">
                  Clique aqui para selecionar o arquivo PDF ou Excel
                  <input
                    type="file"
                    accept=".pdf, .xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {previewRecords.length > 0 && (
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    ✓ {previewRecords.length} linha(s) lidas
                  </span>
                </div>

                <div className="max-h-52 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-900 sticky top-0 text-amber-400 font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-2">DATA</th>
                        <th className="p-2">TURMA</th>
                        <th className="p-2">SIGLA</th>
                        <th className="p-2">MÓDULO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                      {previewRecords.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 text-emerald-400">{r.data_calendario}</td>
                          <td className="p-2 font-bold">{r.turma_calendario}</td>
                          <td className="p-2 text-amber-400 font-bold">{r.sigla_calendario}</td>
                          <td className="p-2 text-indigo-300">{r.modulo_calendario}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    onClick={() => setPreviewRecords([])}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={saveImportedData}
                    disabled={importing}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20"
                  >
                    {importing ? 'Gravando...' : 'Gravar no Banco'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: GERENCIAR EQUIPES E TABELA AUXILIAR */}
      {showEquipeModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-5 sm:p-6 space-y-6 shadow-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">
                    Gerenciamento de Equipes e Professores
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Vincule turmas a equipes em determinados períodos ou cadastre as equipes base do sistema.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEquipeModal(false);
                  resetEquipeForm();
                  resetAuxForm();
                }}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SELEÇÃO DE ABAS DO MODAL */}
            <div className="flex border-b border-slate-800 space-x-2">
              <button
                onClick={() => setEquipeModalTab('auxiliar')}
                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition flex items-center space-x-2 border-b-2 ${
                  equipeModalTab === 'auxiliar'
                    ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Vínculo por Turma e Período (Tabela Auxiliar Equipe)</span>
              </button>

              <button
                onClick={() => setEquipeModalTab('base')}
                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition flex items-center space-x-2 border-b-2 ${
                  equipeModalTab === 'base'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Cadastro de Equipes Base ({equipesList.length})</span>
              </button>
            </div>

            {/* ABA 1: TABELA AUXILIAR EQUIPE (VÍNCULO POR TURMA, PERÍODO E PROFESSORES) */}
            {equipeModalTab === 'auxiliar' && (
              <div className="space-y-6">
                <form onSubmit={handleSaveAuxiliarEquipe} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                    {/* Equipe */}
                    <div>
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        EQUIPE (NOME) *
                      </label>
                      <select
                        value={auxForm.nome_da_equipe}
                        onChange={(e) => setAuxForm({ ...auxForm, nome_da_equipe: e.target.value })}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {TEAM_NAMES_LIST.map((teamName) => (
                          <option key={teamName} value={teamName}>
                            Equipe {teamName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Turma (Seleção das turmas criadas em Curso de Formação) */}
                    <div>
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        TURMA VINCULADA (CURSO DE FORMAÇÃO) *
                      </label>
                      <select
                        value={auxForm.codigo_turma}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAuxForm({ ...auxForm, codigo_turma: val });
                        }}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-amber-300 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        <option value="">-- Selecione a Turma --</option>
                        {createdTurmasList.map((c) => {
                          const codeLabel = c.code || `${c.careerAbbreviation || 'DL'}-${c.turmaNumber || '01'}`;
                          return (
                            <option key={c.id} value={codeLabel}>
                              Turma {codeLabel} • {c.career || 'Carreira'} {c.teacherName ? `(Prof. ${c.teacherName})` : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div className="mt-1">
                        <input
                          type="text"
                          value={auxForm.codigo_turma}
                          onChange={(e) => setAuxForm({ ...auxForm, codigo_turma: e.target.value })}
                          placeholder="Ou digite/ajuste a sigla da turma (Ex: DL 01)"
                          className="w-full bg-slate-950/80 border border-slate-700/60 rounded-lg p-1.5 text-[11px] text-slate-300 font-mono focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Matéria */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        MATÉRIA / DISCIPLINA *
                      </label>
                      <select
                        value={auxForm.materia}
                        onChange={(e) => setAuxForm({ ...auxForm, materia: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {uniqueSubjectsMap.length > 0 ? (
                          uniqueSubjectsMap.map((s) => (
                            <option key={s.sigla} value={s.sigla}>
                              {s.sigla} - {s.nome}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="MEAF">MEAF - Manuseio e Emprego de Armas de Fogo</option>
                            <option value="TAP">TAP - Táticas de Ação Policial</option>
                            <option value="DP">DP - Direito Processual Penal</option>
                            <option value="TIG">TIG - Técnicas de Investigação</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Professor Titular (Nome) */}
                    <div>
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        PROFESSOR TITULAR *
                      </label>
                      <select
                        value={auxForm.professor_titular_nome}
                        onChange={(e) => {
                          const userName = e.target.value;
                          const matchedUser = systemUsers.find((u) => u.name === userName);
                          const userSigla = matchedUser?.professorSigla || matchedUser?.professor_sigla || '';
                          setAuxForm((prev) => ({
                            ...prev,
                            professor_titular_nome: userName,
                            sigla_professor: userSigla ? userSigla.toUpperCase() : prev.sigla_professor
                          }));
                        }}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">Selecione ou digite abaixo...</option>
                        {availableTeachersForEquipe.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name} {u.professorSigla ? `[${u.professorSigla}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Campo Livre para Nome do Professor (se não estiver na lista) */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        NOME COMPLETO DO PROFESSOR TITULAR
                      </label>
                      <input
                        type="text"
                        value={auxForm.professor_titular_nome}
                        onChange={(e) => setAuxForm({ ...auxForm, professor_titular_nome: e.target.value })}
                        placeholder="Ex: João Evangelista Nascimento"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    {/* Sigla do Professor Titular */}
                    <div>
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        SIGLA DO PROFESSOR TITULAR
                      </label>
                      <input
                        type="text"
                        value={auxForm.sigla_professor}
                        onChange={(e) => setAuxForm({ ...auxForm, sigla_professor: e.target.value.toUpperCase() })}
                        placeholder="Ex: JEN"
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-amber-300 font-mono font-bold uppercase focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    {/* Período: Início */}
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">
                        DATA INÍCIO DO PERÍODO *
                      </label>
                      <input
                        type="date"
                        required
                        value={auxForm.data_inicio}
                        onChange={(e) => setAuxForm({ ...auxForm, data_inicio: e.target.value })}
                        className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Período: Fim */}
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">
                        DATA FIM DO PERÍODO *
                      </label>
                      <input
                        type="date"
                        required
                        value={auxForm.data_fim}
                        onChange={(e) => setAuxForm({ ...auxForm, data_fim: e.target.value })}
                        className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Observação */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        OBSERVAÇÃO / DESCRIÇÃO
                      </label>
                      <input
                        type="text"
                        value={auxForm.observacao}
                        onChange={(e) => setAuxForm({ ...auxForm, observacao: e.target.value })}
                        placeholder="Ex: Equipe Alfa MEAF primeiro semestre 2026"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* INSTRUTORES ADICIONAIS NA TABELA AUXILIAR */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                        <Users className="w-4 h-4" />
                        <span>INSTRUTORES AUXILIARES / ADICIONAIS NESTE PERÍODO</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleAddAuxInstrutorRow}
                        className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Instrutor</span>
                      </button>
                    </div>

                    {auxInstrutoresForm.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">
                        Nenhum instrutor adicional. (Se houver apenas 1 professor titular, a exibição no calendário mostrará <strong className="text-amber-300">"[Primeiro Nome]"</strong>, por exemplo: <strong className="text-amber-300">Maerllen</strong>).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {auxInstrutoresForm.map((inst, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                            <div className="md:col-span-6 space-y-1">
                              <label className="block text-[9px] font-bold text-indigo-300 uppercase mb-0.5">
                                INSTRUTOR 0{index + 2} (PROFESSOR DA MATÉRIA) *
                              </label>
                              <select
                                value={inst.nome}
                                onChange={(e) => {
                                  const userName = e.target.value;
                                  const matchedUser = systemUsers.find((u) => u.name === userName);
                                  const userSigla = matchedUser?.professorSigla || matchedUser?.professor_sigla || '';
                                  setAuxInstrutoresForm((prev) => {
                                    const copy = [...prev];
                                    copy[index] = {
                                      ...copy[index],
                                      nome: userName,
                                      sigla: userSigla ? userSigla.toUpperCase() : copy[index].sigla
                                    };
                                    return copy;
                                  });
                                }}
                                className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg p-2 text-xs text-slate-100 font-bold focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="">Selecione o Instrutor da matéria ({auxForm.materia || selectedDiscipline})...</option>
                                {availableTeachersForEquipe.map((u) => (
                                  <option key={u.id} value={u.name}>
                                    {u.name} {u.professorSigla ? `[${u.professorSigla}]` : ''} ({u.teacherSubject || u.teacher_subject || 'Professor'})
                                  </option>
                                ))}
                              </select>

                              {/* Campo livre em caso de nome customizado */}
                              <input
                                type="text"
                                value={inst.nome}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAuxInstrutoresForm((prev) => {
                                    const copy = [...prev];
                                    copy[index] = { ...copy[index], nome: val };
                                    return copy;
                                  });
                                }}
                                placeholder="Ou digite o nome completo..."
                                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg p-1.5 text-[11px] text-slate-300 focus:border-indigo-500 focus:outline-none font-medium"
                              />
                            </div>

                            <div className="md:col-span-5">
                              <label className="block text-[9px] font-bold text-indigo-300 uppercase mb-0.5">
                                SIGLA DO INSTRUTOR 0{index + 2}
                              </label>
                              <input
                                type="text"
                                value={inst.sigla}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  setAuxInstrutoresForm((prev) => {
                                    const copy = [...prev];
                                    copy[index] = { ...copy[index], sigla: val };
                                    return copy;
                                  });
                                }}
                                placeholder="Ex: FLS"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-indigo-300 font-mono font-bold uppercase focus:border-indigo-500 focus:outline-none"
                              />
                            </div>

                            <div className="md:col-span-1 flex justify-end pt-5 md:pt-4">
                              <button
                                type="button"
                                onClick={() => handleRemoveAuxInstrutorRow(index)}
                                className="p-2 text-slate-400 hover:text-rose-400 transition hover:bg-rose-500/10 rounded-lg"
                                title="Remover Instrutor"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    {editingAuxId && (
                      <button
                        type="button"
                        onClick={resetAuxForm}
                        className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                      >
                        Cancelar Edição
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition flex items-center space-x-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{editingAuxId ? 'Atualizar Vínculo' : 'Salvar Vínculo na Tabela Auxiliar'}</span>
                    </button>
                  </div>
                </form>

                {/* TABELA DE VÍNCULOS REGISTRADOS NA TABELA AUXILIAR */}
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center space-x-2">
                    <Layers className="w-4 h-4" />
                    <span>Vínculos Cadastrados na Tabela Auxiliar ({auxiliarEquipesList.length})</span>
                  </h4>

                  {auxiliarEquipesList.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-slate-800">
                      Nenhum vínculo por período cadastrado ainda. Preencha o formulário acima para vincular uma turma, equipe e professores a um período.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="p-2.5">TURMA & EQUIPE</th>
                            <th className="p-2.5">MATÉRIA</th>
                            <th className="p-2.5">PERÍODO (INÍCIO A FIM)</th>
                            <th className="p-2.5">PROFESSORES & EXIBIÇÃO NO CALENDÁRIO</th>
                            <th className="p-2.5 text-center">AÇÕES</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {auxiliarEquipesList.map((aux) => {
                            const profs = aux.professores || [];
                            const hasInstructors = profs.some((p) => p.tipo === 'INSTRUTOR' || p.tipo === 'INSTRUTORES');
                            const isOnlyProfessors = !hasInstructors;
                            const profName = aux.professor_titular_nome || (profs[0]?.nome) || '';
                            const cleanFirstName = profName.replace(/^(Dr\.|Dra\.|Prof\.|Professor|Professora)\s+/i, '').trim().split(/\s+/)[0];

                            return (
                              <tr key={aux.id} className="hover:bg-slate-900/40">
                                <td className="p-2.5 font-bold">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[11px] font-mono">
                                      {aux.codigo_turma}
                                    </span>
                                    <span className="text-slate-200">Equipe {aux.nome_da_equipe}</span>
                                  </div>
                                </td>

                                <td className="p-2.5 font-mono text-amber-300 font-bold">{aux.materia}</td>

                                <td className="p-2.5 font-mono text-emerald-400 text-[11px]">
                                  {aux.data_inicio} <span className="text-slate-500">até</span> {aux.data_fim}
                                </td>

                                <td className="p-2.5 text-[11px]">
                                  <div className="font-semibold text-slate-200">
                                    Titular: {aux.professor_titular_nome || profs[0]?.nome || '-'}
                                    {aux.sigla_professor && <span className="text-amber-400 font-mono ml-1">[{aux.sigla_professor}]</span>}
                                  </div>
                                  {profs.length > 0 && profs.some((p) => p.tipo !== 'TITULAR') && (
                                    <div className="text-[10px] text-slate-400">
                                      Instrutores: {profs.filter((p) => p.tipo !== 'TITULAR').map((p) => `${p.nome} [${p.sigla}]`).join(', ')}
                                    </div>
                                  )}
                                  <div className="mt-1">
                                    {isOnlyProfessors ? (
                                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                                        Exibe no Calendário (Nome): {cleanFirstName}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-bold">
                                        Exibe no Calendário (Siglas): {[aux.sigla_professor, ...profs.filter((p) => p.tipo !== 'TITULAR').map((p) => p.sigla)].filter(Boolean).join(' ')}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="p-2.5 text-center space-x-1">
                                  <button
                                    onClick={() => handleEditAuxiliarEquipe(aux)}
                                    className="p-1 text-slate-400 hover:text-amber-400 transition"
                                    title="Editar Vínculo"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAuxiliarEquipe(aux.id)}
                                    className="p-1 text-slate-400 hover:text-rose-400 transition"
                                    title="Excluir Vínculo"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
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

            {/* ABA 2: CADASTRO DE EQUIPES BASE */}
            {equipeModalTab === 'base' && (
              <div className="space-y-6">
                <form onSubmit={handleSaveEquipe} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                    {/* Nome da Equipe */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        NOME DA EQUIPE *
                      </label>
                      <select
                        value={equipeForm.nome_da_equipe}
                        onChange={(e) => setEquipeForm({ ...equipeForm, nome_da_equipe: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {TEAM_NAMES_LIST.map((teamName) => (
                          <option key={teamName} value={teamName}>
                            Equipe {teamName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Matéria */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        MATÉRIA / DISCIPLINA *
                      </label>
                      <select
                        value={equipeForm.materia}
                        onChange={(e) => setEquipeForm({ ...equipeForm, materia: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {uniqueSubjectsMap.length > 0 ? (
                          uniqueSubjectsMap.map((s) => (
                            <option key={s.sigla} value={s.sigla}>
                              {s.sigla} - {s.nome}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="MEAF">MEAF - Manuseio e Emprego de Armas de Fogo</option>
                            <option value="TAP">TAP - Táticas de Ação Policial</option>
                            <option value="DP">DP - Direito Processual Penal</option>
                            <option value="TIG">TIG - Técnicas de Investigação</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Tipo de Curso */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        TIPO DE CURSO
                      </label>
                      <input
                        type="text"
                        value="Curso de Formação"
                        readOnly
                        disabled
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-400 font-bold cursor-not-allowed opacity-90"
                      />
                    </div>

                    {/* Nome do Curso de Formação */}
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        CURSO DE FORMAÇÃO (CÓDIGO BANCO E DATAS) *
                      </label>
                      <select
                        value={equipeForm.nome_do_curso}
                        onChange={(e) => setEquipeForm({ ...equipeForm, nome_do_curso: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {formacaoCoursesList.map((c, i) => (
                          <option key={i} value={c.name}>
                            [{c.code || 'CFP-2026'}] {c.name} — Datas: {c.dates || '2026-01-01 a 2026-12-31'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Professor Titular */}
                    <div>
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        PROFESSOR TITULAR *
                      </label>
                      <select
                        value={equipeForm.professor_titular_equipe}
                        onChange={(e) => handleSelectTitularUser(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                        required
                      >
                        <option value="">Selecione o Professor Titular...</option>
                        {availableTeachersForEquipe.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name} {u.professorSigla ? `[${u.professorSigla}]` : ''} ({u.teacherSubject || u.teacher_subject || 'Professor'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sigla do Professor Titular */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        SIGLA DO PROFESSOR TITULAR *
                      </label>
                      <input
                        type="text"
                        required
                        value={equipeForm.sigla_professor}
                        onChange={(e) => setEquipeForm({ ...equipeForm, sigla_professor: e.target.value.toUpperCase() })}
                        placeholder="Ex: JÃO SILVA JS"
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-xs text-amber-300 font-mono font-bold uppercase focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* SEÇÃO INSTRUTORES */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                        <Users className="w-4 h-4" />
                        <span>INSTRUTORES AUXILIARES</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleAddInstrutorRow}
                        className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Instrutor</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {instrutoresForm.map((inst, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <div className="md:col-span-6">
                            <label className="block text-[9px] font-bold text-indigo-300 uppercase mb-0.5">
                              {inst.rotulo || `INSTRUTOR 0${index + 2}`} (NOME)
                            </label>
                            <select
                              value={inst.instrutorNome}
                              onChange={(e) => handleSelectInstrutorUser(index, e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">Selecione o Instrutor...</option>
                              {availableTeachersForEquipe.map((u) => (
                                <option key={u.id} value={u.name}>
                                  {u.name} {u.professorSigla ? `[${u.professorSigla}]` : ''} ({u.teacherSubject || u.teacher_subject || 'Professor'})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-5">
                            <label className="block text-[9px] font-bold text-indigo-300 uppercase mb-0.5">
                              SIGLA DO {inst.rotulo || `INSTRUTOR 0${index + 2}`}
                            </label>
                            <input
                              type="text"
                              value={inst.siglaInstrutor}
                              onChange={(e) => handleUpdateInstrutorRow(index, 'siglaInstrutor', e.target.value.toUpperCase())}
                              placeholder="Ex: JS"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-indigo-300 font-mono font-bold uppercase focus:border-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-end pt-3 md:pt-0">
                            <button
                              type="button"
                              onClick={() => handleRemoveInstrutorRow(index)}
                              className="p-2 text-slate-400 hover:text-rose-400 transition hover:bg-rose-500/10 rounded-lg"
                              title="Remover Instrutor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    {editingEquipeId && (
                      <button
                        type="button"
                        onClick={resetEquipeForm}
                        className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                      >
                        Cancelar Edição
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition flex items-center space-x-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{editingEquipeId ? 'Atualizar Equipe' : 'Salvar Equipe Base'}</span>
                    </button>
                  </div>
                </form>

                {/* TABELA DE EQUIPES CADASTRADAS */}
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>Equipes Base Cadastradas ({equipesList.length})</span>
                  </h4>

                  {equipesList.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-slate-800">
                      Nenhuma equipe cadastrada ainda. Preencha o formulário acima para criar uma equipe.
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="p-2.5">EQUIPE</th>
                            <th className="p-2.5">MATÉRIA</th>
                            <th className="p-2.5">CURSO / CÓDIGO / DATAS</th>
                            <th className="p-2.5">PROFESSOR TITULAR</th>
                            <th className="p-2.5">INSTRUTORES</th>
                            <th className="p-2.5 text-center">AÇÕES</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {equipesList.map((eq) => (
                            <tr key={eq.id} className="hover:bg-slate-900/40">
                              <td className="p-2.5 font-bold">
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-[11px]">
                                  Equipe {eq.nome_da_equipe}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-amber-300 font-bold">{eq.materia}</td>
                              <td className="p-2.5 text-[11px]">
                                <div className="font-semibold text-slate-200">{eq.nome_do_curso}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Código: {eq.codigo_curso || 'CFP-2026'} | Datas: {eq.dates_curso || '2026'}
                                </div>
                              </td>
                              <td className="p-2.5 text-[11px]">
                                <div className="font-semibold">{eq.professor_titular_equipe || '-'}</div>
                                {eq.sigla_professor && (
                                  <span className="text-[10px] font-mono text-amber-400 font-bold">[{eq.sigla_professor}]</span>
                                )}
                              </td>
                              <td className="p-2.5 text-[11px]">
                                {eq.instrutores && eq.instrutores.length > 0 ? (
                                  <div className="space-y-1">
                                    {eq.instrutores.map((ins, idx) => (
                                      <div key={idx} className="flex items-center space-x-1">
                                        <span className="text-slate-300 font-medium">{ins.instrutorNome || 'Instrutor'}</span>
                                        {ins.siglaInstrutor && (
                                          <span className="text-[10px] font-mono text-indigo-400 font-bold">[{ins.siglaInstrutor}]</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-semibold">{eq.instrutor_equipe || '-'}</div>
                                    {eq.sigla_instrutor && (
                                      <span className="text-[10px] font-mono text-indigo-400 font-bold">[{eq.sigla_instrutor}]</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-center space-x-1">
                                <button
                                  onClick={() => handleEditEquipe(eq)}
                                  className="p-1 text-slate-400 hover:text-amber-400 transition"
                                  title="Editar Equipe"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEquipe(eq.id)}
                                  className="p-1 text-slate-400 hover:text-rose-400 transition"
                                  title="Excluir Equipe"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL IMPRESSÃO PDF: ESCOLHA ENTRE MÊS OU CALENDÁRIO COMPLETO */}
      {showPrintModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-150 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-base">
                    Opções de Impressão PDF
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {selectedDisciplineName || selectedDiscipline}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-300 font-semibold leading-relaxed">
                Qual escopo do calendário você deseja imprimir em formato PDF?
              </p>

              <div className="space-y-3">
                {/* Opção A: Mês Específico */}
                <div
                  onClick={() => setPrintOption('month')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start space-x-3 ${
                    printOption === 'month'
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-slate-100 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="printScope"
                    checked={printOption === 'month'}
                    onChange={() => setPrintOption('month')}
                    className="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="space-y-2.5 w-full">
                    <div>
                      <span className="font-bold text-slate-100 block text-xs">Apenas o Mês Específico</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Gera as páginas relativas apenas ao mês e ano selecionados.
                      </span>
                    </div>

                    {printOption === 'month' && (
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Selecione o Mês</label>
                          <select
                            value={printMonthChoice}
                            onChange={(e) => setPrintMonthChoice(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100 font-semibold text-xs focus:border-cyan-400 focus:outline-none"
                          >
                            {MONTH_NAMES.map((m, idx) => (
                              <option key={idx} value={idx}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Ano</label>
                          <select
                            value={printYearChoice}
                            onChange={(e) => setPrintYearChoice(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100 font-semibold text-xs focus:border-cyan-400 focus:outline-none"
                          >
                            {[2024, 2025, 2026, 2027, 2028].map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Opção B: Todo o Calendário */}
                <div
                  onClick={() => setPrintOption('all')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start space-x-3 ${
                    printOption === 'all'
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-slate-100 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="printScope"
                    checked={printOption === 'all'}
                    onChange={() => setPrintOption('all')}
                    className="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="space-y-1 w-full">
                    <span className="font-bold text-slate-100 block text-xs">Todo o Calendário Letivo</span>
                    <span className="text-[11px] text-slate-400 block">
                      Gera o documento completo contendo todas as folhas de todos os meses do ano letivo ({printYearChoice}).
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPrint}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-cyan-600/20 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

