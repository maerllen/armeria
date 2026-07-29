import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { CalendarRecord, User } from '../types';
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
  Building2,
  MapPin,
  Users,
  BookOpen,
  Tag,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Info,
  CalendarDays
} from 'lucide-react';

interface CalendarModuleProps {
  currentUser: User | null;
}

// Fixed Time Slots as required
const TIME_SLOTS = [
  { id: 'slot1', label: '08:00 as 09:40', type: 'class', name: '1ª Aula' },
  { id: 'break1', label: '09:40 as 10:00', type: 'break', name: 'Intervalo (20 min)' },
  { id: 'slot2', label: '10:00 as 11:40', type: 'class', name: '2ª Aula' },
  { id: 'lunch', label: '11:40 as 14:00', type: 'break', name: 'Intervalo de Almoço' },
  { id: 'slot3', label: '14:00 as 15:40', type: 'class', name: '3ª Aula' },
  { id: 'break2', label: '15:40 as 16:00', type: 'break', name: 'Intervalo (20 min)' },
  { id: 'slot4', label: '16:00 as 16:40', type: 'class', name: '4ª Aula' }
] as const;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const CalendarModule: React.FC<CalendarModuleProps> = ({ currentUser }) => {
  const [records, setRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Date filters (defaults to current date or June 2026 as per example)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear() > 2020 ? now.getFullYear() : 2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed (5 = Junho)

  // Advanced Filters
  const [filterSigla, setFilterSigla] = useState<string>('TODAS');
  const [filterSala, setFilterSala] = useState<string>('TODAS');
  const [filterNumeroAula, setFilterNumeroAula] = useState<string>('TODAS');
  const [filterEquipe, setFilterEquipe] = useState<string>('TODAS');
  const [filterTimeframe, setFilterTimeframe] = useState<'TODAS' | 'FUTURAS' | 'PASSADAS'>('TODAS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<CalendarRecord | null>(null);
  const [previewRecords, setPreviewRecords] = useState<CalendarRecord[]>([]);
  const [importing, setImporting] = useState<boolean>(false);

  // Manual Add/Edit Form State
  const [formState, setFormState] = useState<Partial<CalendarRecord>>({
    data_calendario: new Date().toISOString().split('T')[0],
    horario_calendario: '10:00 as 11:40',
    turma_calendario: 'DL1',
    sigla_calendario: 'MEAF',
    disciplina_calendario: 'Manuseio e Emprego de Armas de Fogo',
    sala_calendario: 'SL01',
    curso_calendario: 'Curso de Formação de Delegados',
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
    } catch (err: any) {
      showToast('error', 'Erro ao carregar os dados do calendário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
          // Normalize column headers
          const keys = Object.keys(row);
          const getVal = (...names: string[]) => {
            for (const n of names) {
              const matchedKey = keys.find(
                (k) => k.trim().toUpperCase() === n.toUpperCase() || k.trim().toUpperCase().includes(n.toUpperCase())
              );
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
                return String(row[matchedKey]).trim();
              }
            }
            return '';
          };

          // Parse Data
          let rawData = getVal('DATA_CALENDARIO', 'DATA CALENDARIO', 'DATA', 'DATE');
          let formattedDate = new Date().toISOString().split('T')[0];
          if (rawData) {
            // Check if DD/MM/YYYY or YYYY-MM-DD
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
              // Excel date serial number
              const d = new Date((Number(rawData) - (25567 + 2)) * 86400 * 1000);
              formattedDate = d.toISOString().split('T')[0];
            }
          }

          // Parse Horario and map to standard slots if applicable
          let rawHora = getVal('HORARIO_CALENDARIO', 'HORARIO CALENDARIO', 'HORARIO', 'HORA');
          let finalHora = rawHora || '08:00 as 09:40';
          if (rawHora.includes('1') && rawHora.includes('08')) finalHora = '08:00 as 09:40';
          else if (rawHora.includes('2') || rawHora.includes('10:00')) finalHora = '10:00 as 11:40';
          else if (rawHora.includes('3') || rawHora.includes('14:00')) finalHora = '14:00 as 15:40';
          else if (rawHora.includes('4') || rawHora.includes('16:00')) finalHora = '16:00 as 16:40';

          return {
            id: `cal-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            data_calendario: formattedDate,
            horario_calendario: finalHora,
            turma_calendario: getVal('TURMA_CALENDARIO', 'TURMA CALENDARIO', 'TURMA') || 'DL1',
            sigla_calendario: getVal('SIGLA_CALENDARIO', 'SIGLA CALENDARIO', 'SIGLA') || 'DISC',
            disciplina_calendario: getVal('DISCIPLINA_CALENDARIO', 'DISCIPLINA CALENDARIO', 'DISCIPLINA', 'MATERIA') || '',
            sala_calendario: getVal('SALA_CALENDARIO', 'SALA CALENDARIO', 'SALA', 'LOCAL') || 'SL01',
            curso_calendario: getVal('CURSO_CALENDARIO', 'CURSO CALENDARIO', 'CURSO') || 'Formação',
            numero_aula_calendario: getVal('NUMERO_AULA_CALENDARIO', 'NUMERO AULA', 'AULA', 'NUMERO_AULA') || (idx + 1),
            equipe_calendario: getVal('EQUIPE_CALENDARIO', 'EQUIPE CALENDARIO', 'EQUIPE', 'INSTRUTOR') || 'Equipe Alpha',
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

  // --- SAVE SINGLE RECORD ---
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.data_calendario || !formState.turma_calendario || !formState.sigla_calendario) {
      showToast('error', 'Preencha Data, Turma e Sigla da disciplina.');
      return;
    }

    try {
      const res = await storage.saveCalendarRecord(formState);
      if (res.success) {
        showToast('success', 'Agendamento salvo com sucesso no banco de dados!');
        setShowRecordModal(false);
        setSelectedRecord(null);
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
        await loadData();
      } else {
        showToast('error', res.error || 'Erro ao excluir aula.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('ATENÇÃO: Deseja apagar TODOS os registros do calendário no banco de dados? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await storage.clearAllCalendarRecords();
      if (res.success) {
        showToast('success', 'Banco de dados do calendário zerado com sucesso.');
        await loadData();
      } else {
        showToast('error', res.error || 'Erro ao limpar calendário.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // --- DERIVED FILTER OPTIONS ---
  const uniqueSiglas = Array.from(new Set(records.map((r) => r.sigla_calendario).filter(Boolean)));
  const uniqueSalas = Array.from(new Set(records.map((r) => r.sala_calendario).filter(Boolean)));
  const uniqueAulas = Array.from(new Set(records.map((r) => String(r.numero_aula_calendario || '')).filter(Boolean)));
  const uniqueEquipes = Array.from(new Set(records.map((r) => r.equipe_calendario).filter(Boolean)));

  // Filter records
  const todayStr = new Date().toISOString().split('T')[0];

  const filteredRecords = records.filter((r) => {
    // Search Term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match =
        r.sigla_calendario.toLowerCase().includes(term) ||
        r.turma_calendario.toLowerCase().includes(term) ||
        (r.disciplina_calendario && r.disciplina_calendario.toLowerCase().includes(term)) ||
        (r.sala_calendario && r.sala_calendario.toLowerCase().includes(term)) ||
        (r.curso_calendario && r.curso_calendario.toLowerCase().includes(term)) ||
        (r.equipe_calendario && r.equipe_calendario.toLowerCase().includes(term));
      if (!match) return false;
    }

    // Sigla Filter
    if (filterSigla !== 'TODAS' && r.sigla_calendario !== filterSigla) return false;

    // Sala Filter
    if (filterSala !== 'TODAS' && r.sala_calendario !== filterSala) return false;

    // Numero Aula Filter
    if (filterNumeroAula !== 'TODAS' && String(r.numero_aula_calendario) !== filterNumeroAula) return false;

    // Equipe Filter
    if (filterEquipe !== 'TODAS' && r.equipe_calendario !== filterEquipe) return false;

    // Timeframe Filter
    if (filterTimeframe === 'FUTURAS' && r.data_calendario < todayStr) return false;
    if (filterTimeframe === 'PASSADAS' && r.data_calendario >= todayStr) return false;

    return true;
  });

  // Generate Weekdays for the Selected Month and Year
  const getWeekdaysInMonth = (year: number, monthZeroBased: number) => {
    const days: { dateStr: string; dayNum: number; dayName: string }[] = [];
    const date = new Date(year, monthZeroBased, 1);

    while (date.getMonth() === monthZeroBased) {
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
  };

  const currentMonthWeekdays = getWeekdaysInMonth(selectedYear, selectedMonth);

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

      {/* HEADER BAR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl backdrop-blur-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
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
                Calendário de Aulas & Cronograma
              </h2>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl">
            Gestão inteligente de turmas, disciplinas, salas e horários. Importação direta de planilhas Excel (.xlsx/.csv) e integração com o banco de dados da ACADEPOL.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => {
              setFormState({
                data_calendario: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`,
                horario_calendario: '10:00 as 11:40',
                turma_calendario: 'DL1',
                sigla_calendario: 'MEAF',
                disciplina_calendario: 'Manuseio e Emprego de Armas de Fogo',
                sala_calendario: 'SL01',
                curso_calendario: 'Curso de Formação de Delegados',
                numero_aula_calendario: 1,
                equipe_calendario: 'Equipe Alpha',
                observacao_calendario: ''
              });
              setSelectedRecord(null);
              setShowRecordModal(true);
            }}
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

          {records.length > 0 && (
            <button
              onClick={handleClearAll}
              title="Limpar todos os registros"
              className="p-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded-xl transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-4 shadow-lg">
        {/* Month & Year Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
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

            <div className="flex items-center space-x-2">
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
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

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

          {/* Timeframe Filter (Passadas / Futuras) */}
          <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-2xl text-[11px] font-bold">
            <button
              onClick={() => setFilterTimeframe('TODAS')}
              className={`px-3 py-1 rounded-xl transition ${
                filterTimeframe === 'TODAS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas ({records.length})
            </button>
            <button
              onClick={() => setFilterTimeframe('FUTURAS')}
              className={`px-3 py-1 rounded-xl transition ${
                filterTimeframe === 'FUTURAS'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Futuras
            </button>
            <button
              onClick={() => setFilterTimeframe('PASSADAS')}
              className={`px-3 py-1 rounded-xl transition ${
                filterTimeframe === 'PASSADAS'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Passadas
            </button>
          </div>
        </div>

        {/* Detailed Attribute Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
          {/* SIGLA_CALENDARIO Filter */}
          <div>
            <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
              SIGLA_CALENDARIO
            </label>
            <select
              value={filterSigla}
              onChange={(e) => setFilterSigla(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="TODAS">Todas as Siglas</option>
              {uniqueSiglas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* SALA_CALENDARIO Filter */}
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

          {/* NUMERO_AULA_CALENDARIO Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Nº DA AULA
            </label>
            <select
              value={filterNumeroAula}
              onChange={(e) => setFilterNumeroAula(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="TODAS">Todas as Aulas</option>
              {uniqueAulas.map((n) => (
                <option key={n} value={n}>
                  Aula {n}
                </option>
              ))}
            </select>
          </div>

          {/* EQUIPE_CALENDARIO Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              EQUIPE / INSTRUTORES
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

          {/* Search Term Input */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              BUSCAR TEXTO
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Turma, curso, sala..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* VISUAL MONTHLY CALENDAR GRID */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-extrabold text-slate-100 flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>
                Grade Horária do Mês: {MONTH_NAMES[selectedMonth]} de {selectedYear}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Somente dias úteis (Segunda a Sexta). Aulas organizadas pelas faixas horárias regulamentares.
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl">
            {filteredRecords.length} Aulas Encontradas
          </span>
        </div>

        {currentMonthWeekdays.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            Nenhum dia útil encontrado para este mês.
          </div>
        ) : (
          <div className="space-y-6 overflow-x-auto">
            {currentMonthWeekdays.map((day) => {
              // Get records for this specific date
              const dayRecords = filteredRecords.filter((r) => r.data_calendario === day.dateStr);

              return (
                <div
                  key={day.dateStr}
                  className={`bg-slate-950/80 border rounded-2xl p-4 space-y-3 transition ${
                    day.dateStr === todayStr
                      ? 'border-amber-500/80 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center space-x-2.5">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black font-mono border ${
                          day.dateStr === todayStr
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      >
                        DIA {day.dayNum < 10 ? `0${day.dayNum}` : day.dayNum}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-200 uppercase">
                          {day.dayName}-feira
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono ml-2">
                          ({day.dateStr})
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400">
                      {dayRecords.length > 0 ? `${dayRecords.length} aula(s)` : 'Sem aulas registradas'}
                    </span>
                  </div>

                  {/* Time Slots Grid for this Day */}
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                    {TIME_SLOTS.map((slot) => {
                      if (slot.type === 'break') {
                        return (
                          <div
                            key={slot.id}
                            className="bg-slate-900/40 border border-dashed border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-center items-center text-center text-slate-500 text-[10px] min-h-[85px]"
                          >
                            <Clock className="w-3.5 h-3.5 mb-1 text-slate-600" />
                            <span className="font-bold">{slot.name}</span>
                            <span className="font-mono text-[9px] mt-0.5 text-slate-600">
                              {slot.label}
                            </span>
                          </div>
                        );
                      }

                      // Find matching records in this time slot
                      const slotRecords = dayRecords.filter(
                        (r) =>
                          r.horario_calendario === slot.label ||
                          r.horario_calendario.includes(slot.name.split(' ')[0])
                      );

                      return (
                        <div
                          key={slot.id}
                          className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between min-h-[95px] space-y-2 hover:border-slate-700 transition"
                        >
                          {/* Slot Header */}
                          <div className="flex items-center justify-between text-[9px] font-mono text-amber-400/90 border-b border-slate-800/60 pb-1">
                            <span className="font-bold">{slot.name}</span>
                            <span>{slot.label}</span>
                          </div>

                          {/* Slot Content */}
                          {slotRecords.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-[10px] text-slate-600 italic">
                              Livre
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {slotRecords.map((rec) => (
                                <div
                                  key={rec.id}
                                  className="bg-slate-950 border border-amber-500/30 rounded-xl p-2 space-y-1.5 shadow-md relative group hover:border-amber-400 transition"
                                >
                                  {/* Delete Button on Hover */}
                                  <button
                                    onClick={() => handleDeleteRecord(rec.id)}
                                    className="absolute top-1 right-1 p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                                    title="Excluir agendamento"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>

                                  {/* Sigla & Turma Badge */}
                                  <div className="flex items-center space-x-1.5">
                                    <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 font-black rounded text-[9px] tracking-tight">
                                      {rec.sigla_calendario}
                                    </span>
                                    <span className="text-[10px] font-extrabold text-slate-100">
                                      Turma {rec.turma_calendario}
                                    </span>
                                  </div>

                                  {/* Sala & Aula Number */}
                                  <div className="text-[10px] space-y-0.5">
                                    <div className="flex items-center space-x-1 text-cyan-300 font-semibold">
                                      <MapPin className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                      <span className="truncate">
                                        Sala: {rec.sala_calendario || 'Estande'}
                                      </span>
                                    </div>

                                    {rec.numero_aula_calendario && (
                                      <div className="text-[9px] font-mono font-bold text-amber-400/90">
                                        {typeof rec.numero_aula_calendario === 'number'
                                          ? `Aula ${rec.numero_aula_calendario}`
                                          : rec.numero_aula_calendario}
                                      </div>
                                    )}
                                  </div>

                                  {/* Disciplina & Equipe */}
                                  {rec.disciplina_calendario && (
                                    <p className="text-[9px] text-slate-400 line-clamp-1 border-t border-slate-800/80 pt-1">
                                      {rec.disciplina_calendario}
                                    </p>
                                  )}

                                  {rec.equipe_calendario && (
                                    <p className="text-[8px] text-indigo-300 font-mono">
                                      Eq: {rec.equipe_calendario}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SUMMARY TABLE VIEW */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-100 flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span>Tabela Completa de Registros de Aulas ({filteredRecords.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 bg-slate-950/60">
                <th className="p-3">DATA</th>
                <th className="p-3">HORÁRIO</th>
                <th className="p-3">TURMA</th>
                <th className="p-3">SIGLA</th>
                <th className="p-3">DISCIPLINA</th>
                <th className="p-3">SALA</th>
                <th className="p-3">CURSO</th>
                <th className="p-3">Nº AULA</th>
                <th className="p-3">EQUIPE</th>
                <th className="p-3 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono text-[11px]">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-500 font-sans text-xs">
                    Nenhum registro de aula cadastrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-bold text-amber-400">{r.data_calendario}</td>
                    <td className="p-3 font-semibold text-slate-300">{r.horario_calendario}</td>
                    <td className="p-3 font-extrabold text-slate-100">{r.turma_calendario}</td>
                    <td className="p-3 font-black text-cyan-400">{r.sigla_calendario}</td>
                    <td className="p-3 font-sans text-slate-300">{r.disciplina_calendario || '-'}</td>
                    <td className="p-3 text-indigo-300 font-bold">{r.sala_calendario || 'SL01'}</td>
                    <td className="p-3 font-sans text-slate-400">{r.curso_calendario || '-'}</td>
                    <td className="p-3 text-amber-300 font-bold">{r.numero_aula_calendario || '-'}</td>
                    <td className="p-3 font-sans text-slate-300">{r.equipe_calendario || '-'}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteRecord(r.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: EXCEL IMPORT */}
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
              Selecione o arquivo Excel contendo as colunas: <strong className="text-amber-400">DATA</strong>, <strong className="text-amber-400">HORARIO</strong>, <strong className="text-amber-400">TURMA</strong>, <strong className="text-amber-400">SIGLA</strong>, <strong className="text-amber-400">DISCIPLINA</strong>, <strong className="text-amber-400">SALA</strong>, <strong className="text-amber-400">CURSO</strong>, <strong className="text-amber-400">AULA</strong>, <strong className="text-amber-400">EQUIPE</strong> e <strong className="text-amber-400">OBSERVAÇÃO</strong>.
            </p>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl p-6 text-center space-y-3 bg-slate-950/50 transition">
              <Upload className="w-8 h-8 text-indigo-400 mx-auto" />
              <div className="text-xs text-slate-300">
                <label className="cursor-pointer font-extrabold text-amber-400 hover:underline">
                  Clique aqui para selecionar o arquivo
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="block text-[11px] text-slate-500 mt-1">
                  Formatos aceitos: .XLSX, .XLS, .CSV
                </span>
              </div>
            </div>

            {/* Preview Section */}
            {previewRecords.length > 0 && (
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    ✓ {previewRecords.length} linha(s) resgatadas da planilha
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-900 sticky top-0 text-amber-400 font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-2">DATA</th>
                        <th className="p-2">HORÁRIO</th>
                        <th className="p-2">TURMA</th>
                        <th className="p-2">SIGLA</th>
                        <th className="p-2">SALA</th>
                        <th className="p-2">CURSO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                      {previewRecords.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 text-emerald-400">{r.data_calendario}</td>
                          <td className="p-2">{r.horario_calendario}</td>
                          <td className="p-2 font-bold">{r.turma_calendario}</td>
                          <td className="p-2 text-cyan-300">{r.sigla_calendario}</td>
                          <td className="p-2">{r.sala_calendario}</td>
                          <td className="p-2 truncate max-w-[120px]">{r.curso_calendario}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previewRecords.length > 10 && (
                  <p className="text-[10px] text-slate-500 text-center">
                    E mais {previewRecords.length - 10} linha(s)...
                  </p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setPreviewRecords([]);
                }}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={previewRecords.length === 0 || importing}
                onClick={saveImportedData}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center space-x-2 transition"
              >
                {importing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar e Gravar no Banco</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUAL RECORD FORM */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-slate-100">
                  Cadastrar Agendamento no Calendário
                </h3>
              </div>
              <button
                onClick={() => setShowRecordModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                    DATA_CALENDARIO *
                  </label>
                  <input
                    type="date"
                    value={formState.data_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, data_calendario: e.target.value })}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                    HORARIO_CALENDARIO *
                  </label>
                  <select
                    value={formState.horario_calendario || '10:00 as 11:40'}
                    onChange={(e) => setFormState({ ...formState, horario_calendario: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="08:00 as 09:40">08:00 as 09:40 (1ª Aula)</option>
                    <option value="10:00 as 11:40">10:00 as 11:40 (2ª Aula)</option>
                    <option value="14:00 as 15:40">14:00 as 15:40 (3ª Aula)</option>
                    <option value="16:00 as 16:40">16:00 as 16:40 (4ª Aula)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    TURMA_CALENDARIO *
                  </label>
                  <input
                    type="text"
                    value={formState.turma_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, turma_calendario: e.target.value })}
                    placeholder="Ex: DL1"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    SIGLA_CALENDARIO *
                  </label>
                  <input
                    type="text"
                    value={formState.sigla_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, sigla_calendario: e.target.value })}
                    placeholder="Ex: MEAF"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    SALA_CALENDARIO
                  </label>
                  <input
                    type="text"
                    value={formState.sala_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, sala_calendario: e.target.value })}
                    placeholder="Ex: SL01 ou Estande"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    NUMERO_AULA_CALENDARIO
                  </label>
                  <input
                    type="text"
                    value={formState.numero_aula_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, numero_aula_calendario: e.target.value })}
                    placeholder="Ex: 1 ou Aula 01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  DISCIPLINA_CALENDARIO
                </label>
                <input
                  type="text"
                  value={formState.disciplina_calendario || ''}
                  onChange={(e) => setFormState({ ...formState, disciplina_calendario: e.target.value })}
                  placeholder="Ex: Manuseio e Emprego de Armas de Fogo"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    CURSO_CALENDARIO
                  </label>
                  <input
                    type="text"
                    value={formState.curso_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, curso_calendario: e.target.value })}
                    placeholder="Ex: Curso de Formação de Delegados"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    EQUIPE_CALENDARIO
                  </label>
                  <input
                    type="text"
                    value={formState.equipe_calendario || ''}
                    onChange={(e) => setFormState({ ...formState, equipe_calendario: e.target.value })}
                    placeholder="Ex: Equipe Alpha"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  OBSERVAÇÃO_CALENDARIO
                </label>
                <textarea
                  value={formState.observacao_calendario || ''}
                  onChange={(e) => setFormState({ ...formState, observacao_calendario: e.target.value })}
                  rows={2}
                  placeholder="Observações adicionais sobre o agendamento..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition"
                >
                  Salvar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
