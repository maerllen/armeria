import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { CalendarRecord, User, AcademyCourse, LessonPlan } from '../types';
import { storage } from '../services/storage';
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
  Users
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

export const CalendarModule: React.FC<CalendarModuleProps> = ({ currentUser }) => {
  const [records, setRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Available Formação Courses from Storage
  const [formacaoCoursesList, setFormacaoCoursesList] = useState<
    { name: string; module?: string; year?: number }[]
  >([]);

  // Selected Subject/Discipline Filter - REQUIRED TO START CALENDAR
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
  const [detailRecord, setDetailRecord] = useState<CalendarRecord | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [previewRecords, setPreviewRecords] = useState<CalendarRecord[]>([]);
  const [importing, setImporting] = useState<boolean>(false);

  // Custom course selector helper state
  const [isCustomCourse, setIsCustomCourse] = useState<boolean>(false);

  // Manual Add/Edit Form State
  const [formState, setFormState] = useState<Partial<CalendarRecord>>({
    data_calendario: new Date().toISOString().split('T')[0],
    horario_calendario: '10:00 as 11:40',
    turma_calendario: 'DL1',
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
      const loaded = storage.getCalendarRecords();
      setRecords(loaded);

      // Load Cursos de Formação
      const academyCourses = storage.getAcademyCourses ? storage.getAcademyCourses() : [];
      const lessonPlans = storage.getLessonPlans ? storage.getLessonPlans() : [];
      const courseClasses = storage.getCourseClasses ? storage.getCourseClasses() : [];

      const combined: { name: string; module?: string; year?: number }[] = [];

      DEFAULT_FORMACAO_COURSES.forEach((c) => {
        combined.push({ name: c, module: 'Módulo I', year: 2026 });
      });

      academyCourses.forEach((ac: AcademyCourse) => {
        if (ac.name && !combined.some((c) => c.name.toLowerCase() === ac.name.toLowerCase())) {
          combined.push({
            name: ac.name,
            module: ac.module || 'Módulo I',
            year: ac.startDate ? new Date(ac.startDate).getFullYear() : 2026
          });
        }
      });

      lessonPlans.forEach((lp: LessonPlan) => {
        if (lp.name && !combined.some((c) => c.name.toLowerCase() === lp.name.toLowerCase())) {
          combined.push({
            name: lp.name,
            module: 'Módulo I',
            year: lp.year || 2026
          });
        }
      });

      courseClasses.forEach((cc) => {
        if (cc.courseName && !combined.some((c) => c.name.toLowerCase() === cc.courseName.toLowerCase())) {
          combined.push({
            name: cc.courseName,
            module: 'Módulo I',
            year: 2026
          });
        }
      });

      setFormacaoCoursesList(combined);
    } catch (err: any) {
      showToast('error', 'Erro ao carregar os dados do calendário: ' + err.message);
    } finally {
      setLoading(false);
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
    const sigla = (rec.sigla_calendario || '').trim().toUpperCase();

    const matchingSeries = sortedAllRecords.filter((r) => {
      const rTurma = (r.turma_calendario || '').trim().toUpperCase();
      const rSigla = (r.sigla_calendario || '').trim().toUpperCase();
      return rTurma === turma && rSigla === sigla;
    });

    const index = matchingSeries.findIndex((r) => r.id === rec.id);
    return index >= 0 ? index + 1 : 1;
  };

  // --- EXCEL IMPORT PARSER ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

          return {
            id: `cal-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            data_calendario: formattedDate,
            horario_calendario: finalHora,
            turma_calendario: getVal('TURMA_CALENDARIO', 'TURMA CALENDARIO', 'TURMA') || 'DL1',
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

  const renderSlotCellContent = (slotRecords: CalendarRecord[]) => {
    if (slotRecords.length === 0) {
      return <span className="text-slate-300 font-mono text-[10px]">-</span>;
    }

    const groups: {
      key: string;
      turmasStr: string;
      primaryRecord: CalendarRecord;
      aulasStr: string;
      records: CalendarRecord[];
    }[] = [];

    slotRecords.forEach((rec) => {
      const key = `${rec.data_calendario}_${rec.sigla_calendario}_${rec.sala_calendario || ''}_${rec.equipe_calendario || ''}`;
      const found = groups.find((g) => g.key === key);
      const calculatedAula = getCalculatedLessonNumber(rec);

      if (found) {
        if (!found.records.some((r) => r.turma_calendario === rec.turma_calendario)) {
          found.records.push(rec);
          found.turmasStr = Array.from(new Set(found.records.map((r) => r.turma_calendario))).join(', ');
          found.aulasStr = Array.from(new Set(found.records.map((r) => `Aula ${getCalculatedLessonNumber(r)}`))).join(' / ');
        }
      } else {
        groups.push({
          key,
          turmasStr: rec.turma_calendario,
          primaryRecord: rec,
          aulasStr: `Aula ${calculatedAula}`,
          records: [rec]
        });
      }
    });

    return (
      <div className="space-y-1 p-0.5">
        {groups.map((group) => {
          const rec = group.primaryRecord;
          return (
            <div
              key={group.key}
              onClick={() => setDetailRecord(rec)}
              className="celula-aula cursor-pointer hover:bg-amber-100 transition p-1 border border-slate-300 rounded bg-white shadow-xs text-black text-left"
              title="Clique para ver ou editar detalhes"
            >
              <div className="turma font-extrabold text-[11px] text-black flex items-center justify-between gap-1">
                <span>Turma {group.turmasStr}</span>
                <span className="font-mono text-[9px] bg-slate-100 px-1 rounded border border-slate-300 font-bold text-slate-800">
                  {group.aulasStr}
                </span>
              </div>
              <div className="instr text-[9.5px] text-slate-700 font-semibold mt-0.5 flex flex-wrap items-center justify-between gap-1">
                <span>
                  {rec.equipe_calendario ? `Prof: ${rec.equipe_calendario}` : ''}
                  {rec.equipe_calendario && rec.sala_calendario ? ' | ' : ''}
                  {rec.sala_calendario ? `Sala: ${rec.sala_calendario}` : ''}
                </span>
                <span className="text-amber-800 font-bold text-[9px] underline">
                  [Ver]
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Print PDF for the selected discipline
  const handlePrintPDF = () => {
    window.print();
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
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-2xl flex items-center space-x-3 transition-all animate-bounce ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/50'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{feedback.message}</span>
        </div>
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
                Calendário por Disciplina
              </h2>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl">
            Selecione uma matéria para abrir e gerenciar a grade horária. A contagem de aulas é sequencial e individual por matéria e turma.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedDiscipline && (
            <button
              onClick={handlePrintPDF}
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/20 flex items-center space-x-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir PDF da Disciplina</span>
            </button>
          )}

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

          <button
            onClick={loadData}
            title="Atualizar dados"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
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

          {/* MAIN VIEW: HTML TEMPLATE STYLE TABLE (PER WEEK) */}
          <div className="space-y-6">
            <style>{`
              .folha {
                background: #ffffff !important;
                color: #000000 !important;
                font-family: Calibri, Arial, sans-serif !important;
              }
              .folha table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 11px !important;
                color: #000000 !important;
              }
              .folha th, .folha td {
                border: 1px solid #000000 !important;
                padding: 4px 2px !important;
                text-align: center !important;
                vertical-align: middle !important;
                color: #000000 !important;
              }
              .bg-dia { background-color: #D9D9D9 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-manha { background-color: #D9E2F3 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-tarde { background-color: #FFF2CC !important; font-weight: bold !important; color: #000000 !important; }
              .bg-almoco { background-color: #FFE699 !important; font-weight: 900 !important; letter-spacing: 2px !important; color: #000000 !important; text-align: center !important; }
              .bg-hora { background-color: #F2F2F2 !important; font-weight: bold !important; color: #000000 !important; }
              .bg-seg { background-color: #E2EFDA !important; font-weight: bold !important; color: #000000 !important; }
              .celula-aula .turma { background: #ffffff !important; font-size: 11px !important; font-weight: bold !important; color: #000000 !important; }
              .celula-aula .instr { background: #f8fafc !important; font-size: 10px !important; color: #334155 !important; }
            `}</style>

            {monthWeeks.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-400 text-xs">
                Nenhuma semana encontrada para este mês.
              </div>
            ) : (
              monthWeeks.map((week) => (
                <div key={week.weekNum} className="folha bg-white max-w-[1200px] w-full mx-auto shadow-2xl rounded border border-slate-400 overflow-x-auto my-4 text-black">
                  {/* Header Banner for Week */}
                  <div className="bg-slate-100 px-4 py-2 border-b-2 border-black flex items-center justify-between font-bold text-xs text-black">
                    <span className="text-black uppercase font-black">
                      {selectedDisciplineName ? `DISCIPLINA: ${selectedDisciplineName}` : 'GRADE DA DISCIPLINA'} — SEMANA {week.weekNum} ({week.days[0].formattedDate} a {week.days[4].formattedDate})
                    </span>
                    <span className="text-slate-800 font-mono text-[11px] font-bold">
                      {MONTH_NAMES[selectedMonth]} DE {selectedYear}
                    </span>
                  </div>

                  <table className="w-full border-collapse text-[11px] text-black">
                    <thead>
                      <tr>
                        <th style={{ width: '70px' }} className="bg-dia"></th>
                        <th style={{ width: '90px' }} className="bg-dia">DIA</th>
                        {week.days.map((day) => (
                          <th key={day.dateStr} colSpan={4} className="bg-dia">
                            {day.formattedDate}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th className="bg-manha">MANHÃ</th>
                        <th className="bg-hora">HORA</th>
                        {week.days.map((day) => (
                          <th key={day.dateStr} colSpan={4} className="bg-seg">
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
                            <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center min-h-[32px]">
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
                            <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center min-h-[32px]">
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
                          <td key={day.dateStr} colSpan={4} className="bg-almoco">
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
                            <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center min-h-[32px]">
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
                            <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center min-h-[32px]">
                              {renderSlotCellContent(slotRecords)}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SPECIAL PRINTABLE REPORT VIEW */}
      <div className="hidden print:block text-black bg-white p-4 font-sans text-xs">
        <div className="border-b-2 border-black pb-3 mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-black uppercase tracking-tight">ACADEPOL - ACADEMIA DE POLÍCIA CIVIL</h1>
            <h2 className="text-sm font-extrabold text-slate-900">
              MAPA HORÁRIO DA DISCIPLINA: {selectedDisciplineName}
            </h2>
            <p className="text-[11px] text-slate-700 font-medium">
              Mês / Ano: {MONTH_NAMES[selectedMonth]} / {selectedYear}
            </p>
          </div>
          <div className="text-right text-[10px] font-mono">
            <div>Data de Impressão: {new Date().toLocaleDateString('pt-BR')}</div>
            <div>Total de Aulas: {activeDisciplineRecords.length}</div>
          </div>
        </div>

        {monthWeeks.map((week) => (
          <div key={week.weekNum} className="folha bg-white w-full overflow-x-auto my-4 text-black page-break-after-always">
            <div className="bg-slate-100 px-3 py-1 border-b border-black font-bold text-[11px] text-black">
              SEMANA {week.weekNum} ({week.days[0].formattedDate} a {week.days[4].formattedDate})
            </div>
            <table className="w-full border-collapse text-[10px] text-black">
              <thead>
                <tr>
                  <th style={{ width: '60px' }} className="bg-dia"></th>
                  <th style={{ width: '80px' }} className="bg-dia">DIA</th>
                  {week.days.map((day) => (
                    <th key={day.dateStr} colSpan={4} className="bg-dia">
                      {day.formattedDate}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="bg-manha">MANHÃ</th>
                  <th className="bg-hora">HORA</th>
                  {week.days.map((day) => (
                    <th key={day.dateStr} colSpan={4} className="bg-seg">
                      {day.dayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bg-manha" rowSpan={2} style={{ fontWeight: 900 }}>MANHÃ</td>
                  <td className="bg-hora">8:00-9:40</td>
                  {week.days.map((day) => {
                    const slotRecords = activeDisciplineRecords.filter(
                      (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '08:00 as 09:40'
                    );
                    return (
                      <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center">
                        {renderSlotCellContent(slotRecords)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="bg-hora">10:00-11:40</td>
                  {week.days.map((day) => {
                    const slotRecords = activeDisciplineRecords.filter(
                      (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '10:00 as 11:40'
                    );
                    return (
                      <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center">
                        {renderSlotCellContent(slotRecords)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="bg-tarde" style={{ fontWeight: 900 }}>TARDE</td>
                  <td className="bg-hora">12:00-14:00</td>
                  {week.days.map((day) => (
                    <td key={day.dateStr} colSpan={4} className="bg-almoco">ALMOÇO</td>
                  ))}
                </tr>
                <tr>
                  <td className="bg-tarde" rowSpan={2} style={{ fontWeight: 900 }}>TARDE</td>
                  <td className="bg-hora">14:00-15:40</td>
                  {week.days.map((day) => {
                    const slotRecords = activeDisciplineRecords.filter(
                      (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '14:00 as 15:40'
                    );
                    return (
                      <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center">
                        {renderSlotCellContent(slotRecords)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="bg-hora">16:00-17:40</td>
                  {week.days.map((day) => {
                    const slotRecords = activeDisciplineRecords.filter(
                      (r) => r.data_calendario === day.dateStr && normalizeTimeSlot(r.horario_calendario) === '16:00 as 17:40'
                    );
                    return (
                      <td key={day.dateStr} colSpan={4} className="p-1 align-middle text-center">
                        {renderSlotCellContent(slotRecords)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        <div className="mt-8 flex justify-around text-[10px] font-bold text-slate-900 pt-6 border-t border-slate-400">
          <div className="text-center">
            __________________________________________<br />
            Coordenadoria Pedagógica - ACADEPOL
          </div>
          <div className="text-center">
            __________________________________________<br />
            Chefia de Ensino e Instrução
          </div>
        </div>
      </div>

      {/* MODAL 1: DETALHES DA AULA (CLICKED FROM GRID) */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-150">
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

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold mb-1">Equipe de Instrução</span>
                <span className="text-slate-200 font-bold">{detailRecord.equipe_calendario || 'Não especificada'}</span>
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
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
                    TURMA (ex: DL1, EP1) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.turma_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, turma_calendario: e.target.value.toUpperCase() })}
                    placeholder="Ex: DL1"
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

                {/* Equipe */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    EQUIPE / INSTRUTOR
                  </label>
                  <input
                    type="text"
                    value={formState.equipe_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, equipe_calendario: e.target.value })}
                    placeholder="Ex: Equipe Alpha"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
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

      {/* MODAL 3: EXCEL IMPORT */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-extrabold text-slate-100">
                  Importar Tabela Excel (.xlsx / .csv)
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
              Selecione a planilha Excel contendo as colunas: <strong className="text-amber-400">DATA</strong>, <strong className="text-amber-400">HORARIO</strong>, <strong className="text-amber-400">TURMA</strong>, <strong className="text-amber-400">SIGLA</strong>, <strong className="text-amber-400">DISCIPLINA</strong>, <strong className="text-amber-400">SALA</strong>, <strong className="text-amber-400">MODULO</strong>, <strong className="text-amber-400">ANO</strong>.
            </p>

            <div className="border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl p-6 text-center space-y-3 bg-slate-950/50 transition">
              <Upload className="w-8 h-8 text-indigo-400 mx-auto" />
              <div className="text-xs text-slate-300">
                <label className="cursor-pointer font-extrabold text-amber-400 hover:underline">
                  Clique aqui para selecionar o arquivo Excel
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
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
    </div>
  );
};
