import React, { useState } from 'react';
import {
  User,
  Weapon,
  Department,
  Unit,
  Caliber,
  Course,
  WeaponBox,
  WeaponBoxReplacement,
  LessonPlan,
  LessonPlanItem
} from '../types';
import { storage } from '../services/storage';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import mammoth from 'mammoth';
import {
  GraduationCap,
  Box,
  ClipboardList,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Building2,
  ListPlus,
  Award,
  Eye,
  CheckSquare,
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
  FileText
} from 'lucide-react';

interface CourseManagementModuleProps {
  currentUser: User | null;
  weapons: Weapon[];
  departments: Department[];
  units: Unit[];
  calibers: Caliber[];
  onRefresh?: () => void;
}

const WEAPON_TYPES_OPTIONS = [
  'Pistola',
  'Fuzil',
  'Espingarda',
  'Submetralhadora',
  'Carabina',
  'Revolver'
];

const WEAPON_MODELS_OPTIONS = [
  'PT 100',
  'PT 24/7',
  'PT 840',
  'PT 640',
  'SFP9',
  'SFP9 SK',
  'SFP9 OR',
  'T4',
  'IA2',
  'CTT40',
  'SMT9',
  '586',
  'CBC 586',
  'Pump'
];

export const CourseManagementModule: React.FC<CourseManagementModuleProps> = ({
  currentUser,
  weapons,
  departments,
  units,
  calibers,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'qual-courses' | 'weapon-boxes' | 'lesson-plans'>('qual-courses');

  // Storage getters
  const qualCourses = storage.getCourses();
  const weaponBoxes = storage.getWeaponBoxes();
  const boxReplacements = storage.getWeaponBoxReplacements();
  const lessonPlans = storage.getLessonPlans();

  // Search filters
  const [qualSearch, setQualSearch] = useState('');
  const [boxSearch, setBoxSearch] = useState('');
  const [planSearch, setPlanSearch] = useState('');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'qual' | 'box' | 'plan';
    id: string;
    name: string;
  } | null>(null);

  // Global messages
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showFeedback = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message);
      setErrorMsg('');
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(message);
      setSuccessMsg('');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // Helper date format
  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'N/A';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  const getAcadepolDeptId = () => {
    const acadDept = departments.find(d => d.name.toUpperCase().includes('ACADEMIA') || d.code === 'ACADEPOL') || departments[0];
    return acadDept?.id || 'dept-acad';
  };

  // =========================================================================
  // TAB 1: GERENCIAR CURSOS DE HABILITAÇÃO
  // =========================================================================
  const [showQualModal, setShowQualModal] = useState(false);
  const [editingQualCourse, setEditingQualCourse] = useState<Course | null>(null);
  const [qualCourseName, setQualCourseName] = useState('');
  const [qualSelectedWeaponTypes, setQualSelectedWeaponTypes] = useState<string[]>([]);
  const [qualSelectedModels, setQualSelectedModels] = useState<string[]>([]);
  const [qualShotsPerStudent, setQualShotsPerStudent] = useState<number>(50);
  const [qualShotsPerWeaponType, setQualShotsPerWeaponType] = useState<Record<string, number>>({});
  const [qualDeptId, setQualDeptId] = useState<string>('');
  const [qualModalError, setQualModalError] = useState('');

  const handleOpenQualModal = (course?: Course) => {
    setQualModalError('');
    const acadId = getAcadepolDeptId();
    if (course) {
      setEditingQualCourse(course);
      setQualCourseName(course.name);
      setQualSelectedWeaponTypes(course.allowedWeaponTypes || []);
      setQualSelectedModels(course.allowedModels || []);
      setQualShotsPerStudent(course.shotsPerStudent || 50);
      setQualShotsPerWeaponType(course.shotsPerWeaponType || {});
      setQualDeptId(course.departmentId || acadId);
    } else {
      setEditingQualCourse(null);
      setQualCourseName('');
      setQualSelectedWeaponTypes([]);
      setQualSelectedModels([]);
      setQualShotsPerStudent(50);
      setQualShotsPerWeaponType({});
      setQualDeptId(acadId);
    }
    setShowQualModal(true);
  };

  const handleSaveQualCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setQualModalError('');
    if (!qualCourseName.trim()) {
      setQualModalError('Informe o nome do curso.');
      return;
    }
    if (qualSelectedWeaponTypes.length === 0) {
      setQualModalError('Selecione pelo menos um Tipo de Arma para o curso.');
      return;
    }

    const acadId = getAcadepolDeptId();

    let totalShots = 0;
    qualSelectedWeaponTypes.forEach(type => {
      totalShots += Number(qualShotsPerWeaponType[type] || 0);
    });
    if (totalShots === 0) totalShots = qualShotsPerStudent || 50;

    try {
      if (editingQualCourse) {
        await storage.updateCourse(editingQualCourse.id, {
          name: qualCourseName.trim(),
          allowedWeaponTypes: qualSelectedWeaponTypes,
          allowedModels: qualSelectedModels,
          shotsPerStudent: totalShots,
          shotsPerWeaponType: qualShotsPerWeaponType,
          departmentId: acadId
        });
        showFeedback('success', 'Curso de Habilitação atualizado com sucesso!');
      } else {
        await storage.addCourse({
          name: qualCourseName.trim(),
          allowedWeaponTypes: qualSelectedWeaponTypes,
          allowedModels: qualSelectedModels,
          shotsPerStudent: totalShots,
          shotsPerWeaponType: qualShotsPerWeaponType,
          allowedCalibers: [],
          departmentId: acadId
        });
        showFeedback('success', 'Curso de Habilitação cadastrado com sucesso!');
      }
      setShowQualModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setQualModalError(err?.message || 'Erro ao salvar curso de habilitação.');
    }
  };

  // =========================================================================
  // TAB 2: CAIXAS DE ARMAS DE AULA
  // =========================================================================
  const [showBoxModal, setShowBoxModal] = useState(false);
  const [editingBox, setEditingBox] = useState<WeaponBox | null>(null);
  const [boxName, setBoxName] = useState('');
  const [boxDescription, setBoxDescription] = useState('');
  const [boxSelectedWeaponIds, setBoxSelectedWeaponIds] = useState<string[]>([]);
  const [boxModalError, setBoxModalError] = useState('');

  // Box Item Replacement Sub-modal
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replacingBox, setReplacingBox] = useState<WeaponBox | null>(null);
  const [oldWeaponId, setOldWeaponId] = useState('');
  const [newWeaponId, setNewWeaponId] = useState('');
  const [replaceReason, setReplaceReason] = useState('');
  const [replaceError, setReplaceError] = useState('');

  const handleOpenBoxModal = (box?: WeaponBox) => {
    setBoxModalError('');
    if (box) {
      setEditingBox(box);
      setBoxName(box.name);
      setBoxDescription(box.description || '');
      setBoxSelectedWeaponIds(box.weaponIds || []);
    } else {
      setEditingBox(null);
      setBoxName('');
      setBoxDescription('');
      setBoxSelectedWeaponIds([]);
    }
    setShowBoxModal(true);
  };

  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    setBoxModalError('');
    if (!boxName.trim()) {
      setBoxModalError('Informe o nome da caixa de armas.');
      return;
    }
    if (boxSelectedWeaponIds.length === 0) {
      setBoxModalError('Selecione pelo menos uma arma para compor a caixa.');
      return;
    }

    try {
      if (editingBox) {
        await storage.saveWeaponBox({
          id: editingBox.id,
          name: boxName.trim(),
          description: boxDescription.trim(),
          weaponIds: boxSelectedWeaponIds,
          weaponCount: boxSelectedWeaponIds.length
        });
        showFeedback('success', `Caixa "${boxName}" atualizada com sucesso!`);
      } else {
        await storage.saveWeaponBox({
          name: boxName.trim(),
          description: boxDescription.trim(),
          weaponIds: boxSelectedWeaponIds,
          weaponCount: boxSelectedWeaponIds.length
        });
        showFeedback('success', `Caixa de armas "${boxName}" criada com sucesso!`);
      }
      setShowBoxModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setBoxModalError(err?.message || 'Erro ao salvar caixa de armas.');
    }
  };

  const handleOpenReplaceModal = (box: WeaponBox) => {
    setReplacingBox(box);
    setOldWeaponId('');
    setNewWeaponId('');
    setReplaceReason('');
    setReplaceError('');
    setShowReplaceModal(true);
  };

  const handleSaveWeaponReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    setReplaceError('');
    if (!replacingBox) return;
    if (!oldWeaponId) {
      setReplaceError('Selecione a arma a ser removida da caixa.');
      return;
    }
    if (!newWeaponId) {
      setReplaceError('Selecione a nova arma a ser inserida.');
      return;
    }
    if (!replaceReason.trim()) {
      setReplaceError('Informe o motivo da substituição da arma.');
      return;
    }

    const oldW = weapons.find(w => w.id === oldWeaponId);
    const newW = weapons.find(w => w.id === newWeaponId);

    const oldDesc = oldW ? `${oldW.type} ${oldW.model} (Nº ${oldW.serialNumber})` : oldWeaponId;
    const newDesc = newW ? `${newW.type} ${newW.model} (Nº ${newW.serialNumber})` : newWeaponId;

    try {
      const res = await storage.replaceWeaponInBox(
        replacingBox.id,
        oldWeaponId,
        oldDesc,
        newWeaponId,
        newDesc,
        replaceReason.trim(),
        currentUser?.name || 'Instrutor/Armeiro',
        currentUser?.name || 'Sistema'
      );

      if (!res.success) {
        setReplaceError(res.error || 'Erro ao registrar substituição.');
        return;
      }

      showFeedback('success', 'Substituição de arma registrada com sucesso!');
      setShowReplaceModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setReplaceError(err?.message || 'Erro ao registrar substituição.');
    }
  };

  // =========================================================================
  // TAB 3: PLANOS DE AULA
  // =========================================================================
  const [planCategoryTab, setPlanCategoryTab] = useState<'curso de formação' | 'curso ensino continuado'>('curso de formação');
  const [viewingBoxWeaponsModal, setViewingBoxWeaponsModal] = useState<WeaponBox | null>(null);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planSubject, setPlanSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');
  const [planCareer, setPlanCareer] = useState<'Delegado' | 'Médico Legista' | 'Perito' | 'Investigador' | 'Escrivão'>('Investigador');
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear());
  const [planType, setPlanType] = useState<'curso de formação' | 'curso ensino continuado'>('curso de formação');
  const [planTurmaCode, setPlanTurmaCode] = useState('');
  const [planLessonCount, setPlanLessonCount] = useState<number>(5);
  const [planLessonsData, setPlanLessonsData] = useState<LessonPlanItem[]>([]);
  const [planModalError, setPlanModalError] = useState('');
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');

  const parsePlanWithAi = async (payload: { fileText?: string; base64?: string; mimeType?: string }) => {
    const response = await fetch('/api/parse-lesson-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (!response.ok || !resData.success) {
      throw new Error(resData.error || 'Erro ao interpretar plano de aula com IA.');
    }

    const parsed = resData.data;

    if (parsed.name) setPlanName(parsed.name);
    if (parsed.subject && ['MEAF', 'TAP', 'DP'].includes(parsed.subject.toUpperCase())) {
      setPlanSubject(parsed.subject.toUpperCase() as any);
    }
    if (parsed.career && ['Delegado', 'Médico Legista', 'Perito', 'Investigador', 'Escrivão'].includes(parsed.career)) {
      setPlanCareer(parsed.career as any);
    }
    if (parsed.year && typeof parsed.year === 'number') setPlanYear(parsed.year);

    if (Array.isArray(parsed.lessons) && parsed.lessons.length > 0) {
      const defaultCaliber = calibers[0]?.name || '.40 S&W';
      const newItems: LessonPlanItem[] = parsed.lessons.map((item: any, idx: number) => {
        const shots = Number(item.shotsPerStudent) || 0;
        const calcInstructorShots = item.instructorShots !== undefined && item.instructorShots !== null
          ? Number(item.instructorShots)
          : (shots > 0 ? Math.ceil(shots / 2) : 0);

        return {
          lessonNumber: item.lessonNumber || idx + 1,
          weaponUsed: item.weaponUsed || '',
          content: item.content || '',
          description: item.description || '',
          shotsPerStudent: shots,
          caliberName: item.caliberName || defaultCaliber,
          instructorShots: calcInstructorShots
        };
      });

      setPlanLessonCount(newItems.length);
      setPlanLessonsData(newItems);
      setAiMessage({
        type: 'success',
        text: `Plano de aula interpretado com sucesso pela IA! Extraídas ${newItems.length} aula(s) com armas, conteúdos, descrições e insumos de professores calculados (50% dos tiros).`
      });
    } else {
      setAiMessage({
        type: 'error',
        text: 'Nenhuma aula pôde ser identificada no conteúdo enviado. Verifique se o texto/arquivo possui a estrutura de plano de aula.'
      });
    }
  };

  const handleImportDocument = async (file: File) => {
    setIsParsingAi(true);
    setAiMessage(null);
    setPlanModalError('');

    try {
      let fileText = '';
      let base64 = '';
      const lowerName = file.name.toLowerCase();
      const mimeType = file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

      if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          fileText = result.value || '';
        } catch (e) {
          console.warn('Could not extract docx text locally with mammoth', e);
        }
      }

      if (!fileText) {
        try {
          const text = await file.text();
          if (text && !text.includes('\0') && text.trim().length > 0) {
            fileText = text;
          }
        } catch (e) {
          console.warn('Direct file.text fallback failed:', e);
        }
      }

      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Clean = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Clean);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await parsePlanWithAi({ fileText, base64, mimeType });
    } catch (err: any) {
      console.error('Import error:', err);
      setAiMessage({
        type: 'error',
        text: err.message || 'Erro ao processar o arquivo para importação.'
      });
    } finally {
      setIsParsingAi(false);
    }
  };

  const handleImportRawText = async () => {
    if (!rawTextInput || !rawTextInput.trim()) {
      setAiMessage({ type: 'error', text: 'Cole ou digite o texto do plano de aula antes de enviar.' });
      return;
    }
    setIsParsingAi(true);
    setAiMessage(null);
    setPlanModalError('');

    try {
      await parsePlanWithAi({ fileText: rawTextInput.trim() });
    } catch (err: any) {
      console.error('Import text error:', err);
      setAiMessage({
        type: 'error',
        text: err.message || 'Erro ao interpretar o texto fornecido.'
      });
    } finally {
      setIsParsingAi(false);
    }
  };

  const handleOpenPlanModal = (plan?: LessonPlan) => {
    setPlanModalError('');
    setAiMessage(null);
    if (plan) {
      setEditingPlan(plan);
      setPlanName(plan.name);
      setPlanSubject((plan.subject as 'MEAF' | 'TAP' | 'DP') || 'MEAF');
      setPlanCareer(plan.career || 'Investigador');
      setPlanYear(plan.year || new Date().getFullYear());
      setPlanType(plan.type || planCategoryTab);
      setPlanTurmaCode(plan.turmaCode || '');
      setPlanLessonCount(plan.lessonCount || plan.lessonsData?.length || 5);
      setPlanLessonsData(plan.lessonsData || []);
    } else {
      setEditingPlan(null);
      setPlanName('');
      setPlanSubject('MEAF');
      setPlanCareer('Investigador');
      setPlanYear(new Date().getFullYear());
      setPlanType(planCategoryTab);
      setPlanTurmaCode('');
      setPlanLessonCount(5);

      const defaultCaliber = calibers[0]?.name || '.40 S&W';
      const initialItems: LessonPlanItem[] = Array.from({ length: 5 }, (_, i) => ({
        lessonNumber: i + 1,
        shotsPerStudent: 50,
        caliberName: defaultCaliber,
        instructorShots: 20
      }));
      setPlanLessonsData(initialItems);
    }
    setShowPlanModal(true);
  };

  const handlePlanLessonCountChange = (count: number) => {
    const validCount = Math.max(1, Math.min(100, count));
    setPlanLessonCount(validCount);
    const defaultCaliber = calibers[0]?.name || '.40 S&W';

    setPlanLessonsData(prev => {
      if (validCount > prev.length) {
        const extra: LessonPlanItem[] = Array.from({ length: validCount - prev.length }, (_, i) => ({
          lessonNumber: prev.length + i + 1,
          shotsPerStudent: 50,
          caliberName: defaultCaliber,
          instructorShots: 20
        }));
        return [...prev, ...extra];
      } else {
        return prev.slice(0, validCount);
      }
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanModalError('');
    if (!planName.trim()) {
      setPlanModalError('Informe o nome do plano de aula.');
      return;
    }

    try {
      await storage.saveLessonPlan({
        id: editingPlan?.id,
        name: planName.trim(),
        subject: planSubject,
        career: planCareer,
        year: planYear,
        type: planType,
        turmaCode: planTurmaCode.trim() || 'Geral',
        lessonCount: planLessonCount,
        lessonsData: planLessonsData,
        departmentId: getAcadepolDeptId()
      });

      showFeedback('success', `Plano de aula "${planName}" salvo com sucesso!`);
      setShowPlanModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setPlanModalError(err?.message || 'Erro ao salvar plano de aula.');
    }
  };

  // =========================================================================
  // EXCLUSÃO GERAL
  // =========================================================================
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'qual') {
        await storage.deleteCourse(deleteTarget.id);
        showFeedback('success', `Curso de habilitação "${deleteTarget.name}" excluído.`);
      } else if (deleteTarget.type === 'box') {
        await storage.deleteWeaponBox(deleteTarget.id);
        showFeedback('success', `Caixa de armas "${deleteTarget.name}" excluída.`);
      } else if (deleteTarget.type === 'plan') {
        await storage.deleteLessonPlan(deleteTarget.id);
        showFeedback('success', `Plano de aula "${deleteTarget.name}" excluído.`);
      }
      setDeleteTarget(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erro ao realizar exclusão.');
      setDeleteTarget(null);
    }
  };

  // Filtered lists
  const filteredQualCourses = qualCourses.filter(c =>
    c.name.toLowerCase().includes(qualSearch.toLowerCase()) ||
    (c.allowedWeaponTypes || []).some(wt => wt.toLowerCase().includes(qualSearch.toLowerCase())) ||
    (c.allowedModels || []).some(m => m.toLowerCase().includes(qualSearch.toLowerCase()))
  );

  const filteredBoxes = weaponBoxes.filter(b =>
    b.name.toLowerCase().includes(boxSearch.toLowerCase()) ||
    (b.description || '').toLowerCase().includes(boxSearch.toLowerCase())
  );

  const filteredPlans = lessonPlans.filter(p =>
    p.name.toLowerCase().includes(planSearch.toLowerCase()) ||
    p.career.toLowerCase().includes(planSearch.toLowerCase()) ||
    (p.turmaCode || '').toLowerCase().includes(planSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Painel Administrativo</span>
            </div>
            <h1 className="text-xl font-black text-slate-100 tracking-tight">
              Gerência de Cursos
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Administre Cursos de Habilitação em Armas, Caixas de Armas para Aulas Táticas e Planos de Ensino da Academia de Polícia.
            </p>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold shrink-0">
            <button
              onClick={() => setActiveTab('qual-courses')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-2 ${
                activeTab === 'qual-courses'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Cursos de Habilitação ({qualCourses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('weapon-boxes')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-2 ${
                activeTab === 'weapon-boxes'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>Caixas de Armas ({weaponBoxes.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('lesson-plans')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-2 ${
                activeTab === 'lesson-plans'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Planos de Aula ({lessonPlans.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Feedback Notifications */}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-950/80 border border-red-500/40 text-red-300 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: CURSOS DE HABILITAÇÃO                                          */}
      {/* ========================================================================= */}
      {activeTab === 'qual-courses' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={qualSearch}
                onChange={(e) => setQualSearch(e.target.value)}
                placeholder="Buscar curso de habilitação..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              onClick={() => handleOpenQualModal()}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Curso de Habilitação</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQualCourses.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 italic text-xs">
                Nenhum curso de habilitação cadastrado.
              </div>
            ) : (
              filteredQualCourses.map((course) => {
                const totalShots = course.shotsPerStudent ||
                  (course.shotsPerWeaponType ? Object.values(course.shotsPerWeaponType).reduce((a, b) => a + Number(b), 0) : 50);

                return (
                  <div key={course.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition flex flex-col justify-between shadow-sm">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30 text-[10px] uppercase font-mono">
                            Habilitação Tática
                          </span>
                          <h3 className="text-sm font-bold text-slate-100 leading-snug">{course.name}</h3>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={() => handleOpenQualModal(course)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg transition"
                            title="Editar Curso"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: 'qual', id: course.id, name: course.name })}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg transition"
                            title="Excluir Curso"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Tipos de Armas Permitidos:</span>
                          <div className="flex flex-wrap gap-1">
                            {(course.allowedWeaponTypes || ['Pistola']).map((wt, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-medium text-[11px]">
                                {wt}
                              </span>
                            ))}
                          </div>
                        </div>

                        {course.allowedModels && course.allowedModels.length > 0 && (
                          <div className="pt-1">
                            <span className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Modelos Especificados:</span>
                            <div className="flex flex-wrap gap-1">
                              {course.allowedModels.map((m, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-slate-950 text-amber-400/90 border border-slate-800 font-mono text-[10px]">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 space-y-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Carga de Tiros (Separada por Tipo):</span>
                        <span className="text-amber-400 font-mono font-bold text-xs">Total: {totalShots} tiros / aluno</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {course.shotsPerWeaponType && Object.keys(course.shotsPerWeaponType).length > 0 ? (
                          Object.entries(course.shotsPerWeaponType).map(([wType, shots]) => (
                            <div key={wType} className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center justify-between font-mono text-[11px]">
                              <span className="text-slate-300 font-medium">{wType}:</span>
                              <span className="text-amber-400 font-bold">{shots} tiros</span>
                            </div>
                          ))
                        ) : (
                          (course.allowedWeaponTypes || ['Pistola']).map(wType => (
                            <div key={wType} className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center justify-between font-mono text-[11px]">
                              <span className="text-slate-300 font-medium">{wType}:</span>
                              <span className="text-amber-400 font-bold">{course.shotsPerStudent || 50} tiros</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: CAIXAS DE ARMAS                                                */}
      {/* ========================================================================= */}
      {activeTab === 'weapon-boxes' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={boxSearch}
                onChange={(e) => setBoxSearch(e.target.value)}
                placeholder="Buscar caixa de armas..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              onClick={() => handleOpenBoxModal()}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Caixa de Armas</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBoxes.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 italic text-xs">
                Nenhuma caixa de armas cadastrada.
              </div>
            ) : (
              filteredBoxes.map((box) => (
                <div key={box.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-amber-500/50 transition shadow-sm flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                          <Box className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-100">{box.name}</h3>
                          <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 inline-block mt-0.5">
                            {box.weaponIds.length} armas acondicionadas
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenReplaceModal(box)}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 p-1.5 rounded-lg text-xs transition"
                          title="Substituir Arma Defeituosa na Caixa"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenBoxModal(box)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg transition"
                          title="Editar Caixa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: 'box', id: box.id, name: box.name })}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg transition"
                          title="Excluir Caixa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {box.description && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{box.description}</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => setViewingBoxWeaponsModal(box)}
                      className="w-full bg-slate-950 hover:bg-slate-800 text-amber-400 font-bold text-xs py-2.5 px-4 rounded-xl border border-slate-800 hover:border-amber-500/50 transition flex items-center justify-center space-x-2 shadow-inner"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Ver Armas da Caixa ({box.weaponIds.length})</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Replacement Logs Table */}
          {boxReplacements.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                <RefreshCw className="w-4 h-4" />
                <span>Histórico de Substituição de Armas em Caixas de Aula</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Arma Anterior (Removida)</th>
                      <th className="py-2.5 px-3">Nova Arma (Inserida)</th>
                      <th className="py-2.5 px-3">Motivo da Substituição</th>
                      <th className="py-2.5 px-3">Professor / Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {boxReplacements.map(rep => (
                      <tr key={rep.id} className="hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 text-slate-400">{formatTimestamp(rep.replacedAt)}</td>
                        <td className="py-2.5 px-3 text-red-400 font-semibold">{rep.oldWeaponDesc}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">{rep.newWeaponDesc}</td>
                        <td className="py-2.5 px-3 text-slate-200">{rep.reason}</td>
                        <td className="py-2.5 px-3 text-amber-400">{rep.teacherName || rep.replacedByUserName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PLANOS DE AULA                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'lesson-plans' && (
        <div className="space-y-4">
          {/* Sub-tabs: Curso de Formação / Ensino Continuado */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-3 gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <button
                onClick={() => setPlanCategoryTab('curso de formação')}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                  planCategoryTab === 'curso de formação'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>Plano de Aula do Curso de Formação</span>
              </button>
              <button
                onClick={() => setPlanCategoryTab('curso ensino continuado')}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                  planCategoryTab === 'curso ensino continuado'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>Plano de Aula de Ensino Continuado</span>
              </button>
            </div>
            <span className="text-xs font-mono text-amber-400 font-bold px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/30 shrink-0">
              {filteredPlans.length} plano(s) encontrado(s)
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={planSearch}
                onChange={(e) => setPlanSearch(e.target.value)}
                placeholder="Buscar plano de aula..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              onClick={() => handleOpenPlanModal()}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>
                Novo {planCategoryTab === 'curso de formação' ? 'Plano de Aula (Formação)' : 'Plano de Aula (Ensino Continuado)'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPlans.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 italic text-xs">
                Nenhum plano de aula cadastrado até o momento.
              </div>
            ) : (
              filteredPlans.map((plan) => (
                <div key={plan.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-700 transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{plan.name}</h3>
                      <div className="flex items-center space-x-2 pt-1 text-[11px] flex-wrap gap-y-1">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-extrabold border border-amber-500/40 uppercase font-mono">
                          MATÉRIA: {plan.subject || 'MEAF'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-bold border border-slate-700 uppercase">
                          {plan.career}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${
                          (plan.type || '').toLowerCase().includes('formação')
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-blue-950 text-blue-300 border-blue-800'
                        }`}>
                          {plan.type}
                        </span>
                        <span className="text-slate-400 font-mono">Ano: {plan.year}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenPlanModal(plan)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg transition"
                        title="Editar Plano de Aula"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: 'plan', id: plan.id, name: plan.name })}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg transition"
                        title="Excluir Plano de Aula"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Aulas Previstas ({plan.lessonCount} aulas):</span>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {(plan.lessonsData || []).map((item, idx) => (
                        <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                          <div className="flex items-center justify-between font-mono flex-wrap gap-1">
                            <span className="font-bold text-amber-400">Aula {item.lessonNumber}</span>
                            {item.weaponUsed && (
                              <span className="text-amber-300 font-sans font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {item.weaponUsed}
                              </span>
                            )}
                            <span className="text-slate-300">{item.shotsPerStudent} tiros/aluno</span>
                            <span className="text-slate-400">Cal: {item.caliberName}</span>
                            <span className="text-emerald-400 font-bold">Prof: +{item.instructorShots ?? Math.ceil(item.shotsPerStudent / 2)} un</span>
                          </div>
                          {item.content && (
                            <div className="text-slate-200 text-[10px] font-sans">
                              <span className="text-amber-400/80 font-bold">Conteúdo:</span> {item.content}
                            </div>
                          )}
                          {item.description && (
                            <div className="text-slate-400 text-[10px] font-sans italic leading-relaxed">
                              {item.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO/EDIÇÃO DE CURSO DE HABILITAÇÃO                            */}
      {/* ========================================================================= */}
      {showQualModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-xl shadow-2xl space-y-5 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {editingQualCourse ? 'Editar Curso de Habilitação' : 'Novo Curso de Habilitação'}
                </h3>
              </div>
              <button onClick={() => setShowQualModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {qualModalError && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{qualModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQualCourse} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome do Curso de Habilitação <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  list="qualCoursesListModal"
                  value={qualCourseName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQualCourseName(val);
                    const matched = qualCourses.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
                    if (matched) {
                      if (matched.allowedWeaponTypes) setQualSelectedWeaponTypes(matched.allowedWeaponTypes);
                      if (matched.allowedModels) setQualSelectedModels(matched.allowedModels);
                      if (matched.shotsPerWeaponType) setQualShotsPerWeaponType(matched.shotsPerWeaponType);
                    }
                  }}
                  placeholder="Ex: Operador de Fuzil / Habilitação em Fuzil 5.56mm e Pistola 9mm"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
                <datalist id="qualCoursesListModal">
                  {qualCourses.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* Tipos de Armas */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tipos de Armas Permitidos <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {WEAPON_TYPES_OPTIONS.map((type) => {
                    const isSelected = qualSelectedWeaponTypes.includes(type);
                    return (
                      <label key={type} className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold'
                          : 'border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setQualSelectedWeaponTypes(prev => [...prev, type]);
                              if (!qualShotsPerWeaponType[type]) {
                                setQualShotsPerWeaponType(prev => ({ ...prev, [type]: 50 }));
                              }
                            } else {
                              setQualSelectedWeaponTypes(prev => prev.filter(t => t !== type));
                            }
                          }}
                          className="accent-amber-500 rounded"
                        />
                        <span>{type}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Modelos Especificados */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Modelos Especificados (Opcional)
                </label>
                <div className="flex flex-wrap gap-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-32 overflow-y-auto">
                  {WEAPON_MODELS_OPTIONS.map((model) => {
                    const isSelected = qualSelectedModels.includes(model);
                    return (
                      <button
                        type="button"
                        key={model}
                        onClick={() => {
                          if (isSelected) {
                            setQualSelectedModels(prev => prev.filter(m => m !== model));
                          } else {
                            setQualSelectedModels(prev => [...prev, model]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantidade de Tiros por Tipo de Arma */}
              {qualSelectedWeaponTypes.length > 0 && (
                <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-xl border border-amber-500/30">
                  <label className="block font-bold text-amber-400 text-xs">
                    Quantidade de Tiros por Aluno (por tipo de arma):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {qualSelectedWeaponTypes.map(type => (
                      <div key={type} className="flex items-center justify-between space-x-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="font-semibold text-slate-200">{type}:</span>
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            min="0"
                            value={qualShotsPerWeaponType[type] ?? 50}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setQualShotsPerWeaponType(prev => ({ ...prev, [type]: val }));
                            }}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-amber-400 font-mono font-bold"
                          />
                          <span className="text-slate-400 text-[10px]">tiros</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQualModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
                >
                  Salvar Curso de Habilitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO/EDIÇÃO DE CAIXA DE ARMAS                                 */}
      {/* ========================================================================= */}
      {showBoxModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-xl shadow-2xl space-y-5 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Box className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {editingBox ? 'Editar Caixa de Armas' : 'Nova Caixa de Armas'}
                </h3>
              </div>
              <button onClick={() => setShowBoxModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {boxModalError && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{boxModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBox} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome da Caixa <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={boxName}
                  onChange={(e) => setBoxName(e.target.value)}
                  placeholder="Ex: Caixa 01 - Fuzil 5.56mm ACADEPOL"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descrição / Observações</label>
                <input
                  type="text"
                  value={boxDescription}
                  onChange={(e) => setBoxDescription(e.target.value)}
                  placeholder="Ex: Contém 10 Fuzis T4 de instrução"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Seleção de Armas */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecionar Armas para a Caixa ({boxSelectedWeaponIds.length} selecionadas) <span className="text-red-400">*</span>
                </label>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-60 overflow-y-auto space-y-1.5">
                  {(() => {
                    const otherBoxesWeaponIds = weaponBoxes
                      .filter(b => !editingBox || b.id !== editingBox.id)
                      .flatMap(b => b.weaponIds || []);
                    const availableWeapons = weapons.filter(w => !otherBoxesWeaponIds.includes(w.id));

                    if (availableWeapons.length === 0) {
                      return <div className="text-slate-500 italic text-center p-3">Nenhuma arma disponível ou sem vínculo com outra caixa.</div>;
                    }

                    return availableWeapons.map(w => {
                      const isChecked = boxSelectedWeaponIds.includes(w.id);
                      return (
                        <label key={w.id} className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : 'border-slate-800 text-slate-300 hover:bg-slate-900'
                        }`}>
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBoxSelectedWeaponIds(prev => [...prev, w.id]);
                                } else {
                                  setBoxSelectedWeaponIds(prev => prev.filter(id => id !== w.id));
                                }
                              }}
                              className="accent-amber-500 rounded"
                            />
                            <div>
                              <span className="font-bold">{w.type} {w.manufacturer} {w.model}</span>
                              <span className="text-amber-400 font-mono text-[10px] ml-2">Nº {w.serialNumber}</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{w.caliber}</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBoxModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
                >
                  Salvar Caixa de Armas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SUBSTITUIÇÃO DE ARMA EM CAIXA                                     */}
      {/* ========================================================================= */}
      {showReplaceModal && replacingBox && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">Substituir Arma na Caixa</h3>
              </div>
              <button onClick={() => setShowReplaceModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {replaceError && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{replaceError}</span>
              </div>
            )}

            <form onSubmit={handleSaveWeaponReplacement} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Arma Defeituosa / A Remover da Caixa <span className="text-red-400">*</span>
                </label>
                <select
                  value={oldWeaponId}
                  onChange={(e) => setOldWeaponId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione a arma atual da caixa --</option>
                  {replacingBox.weaponIds.map(wId => {
                    const w = weapons.find(item => item.id === wId);
                    return (
                      <option key={wId} value={wId}>
                        {w ? `${w.type} ${w.model} (Nº ${w.serialNumber})` : wId}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nova Arma Substituta (Disponível no Acervo) <span className="text-red-400">*</span>
                </label>
                <select
                  value={newWeaponId}
                  onChange={(e) => setNewWeaponId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione a nova arma para a caixa --</option>
                  {weapons
                    .filter(w => !replacingBox.weaponIds.includes(w.id))
                    .map(w => (
                      <option key={w.id} value={w.id}>
                        {w.type} {w.manufacturer} {w.model} (Nº {w.serialNumber})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Motivo da Substituição <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="Ex: Falha no percussor verificada durante instrução tática"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
                >
                  Confirmar Substituição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO/EDIÇÃO DE PLANO DE AULA                                  */}
      {/* ========================================================================= */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-5 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <ClipboardList className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {editingPlan ? 'Editar Plano de Aula Curso de Formação' : 'Novo Plano de Aula Curso de Formação'}
                </h3>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {planModalError && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{planModalError}</span>
              </div>
            )}

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              {/* AI Import Banner */}
              <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                    <span>Importar Plano de Aula com IA (Word ou PDF)</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 font-mono">
                    .docx, .doc, .pdf
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Envie qualquer arquivo (Word, PDF, TXT, ODT, etc.) ou cole o texto do plano de aula. A IA extrairá as aulas, armas, conteúdos, descrições e calculará os tiros dos alunos e instrutores (50%).
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className={`cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border shadow-sm ${
                    isParsingAi 
                      ? 'bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed' 
                      : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
                  }`}>
                    {isParsingAi ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Interpretando...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>Enviar Qualquer Arquivo</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="*"
                      disabled={isParsingAi}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportDocument(file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowPasteBox(!showPasteBox)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition flex items-center space-x-1.5"
                  >
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>{showPasteBox ? 'Ocultar Caixa de Texto' : 'Colar Texto Diretamente'}</span>
                  </button>
                </div>

                {showPasteBox && (
                  <div className="space-y-2 pt-2 border-t border-slate-800 animate-in fade-in duration-150">
                    <textarea
                      rows={4}
                      value={rawTextInput}
                      onChange={(e) => setRawTextInput(e.target.value)}
                      placeholder="Cole aqui o texto do plano de aula em qualquer formato (copiado do Word, PDF, E-mape, WhatsApp, e-mail...)..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleImportRawText}
                        disabled={isParsingAi || !rawTextInput.trim()}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center space-x-2 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isParsingAi ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Interpretando...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Interpretar Texto Colado com IA</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {aiMessage && (
                  <div className={`p-3 rounded-xl text-xs flex items-start space-x-2 border ${
                    aiMessage.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' : 'bg-red-950/80 border-red-500/40 text-red-300'
                  }`}>
                    {aiMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />}
                    <span className="leading-relaxed">{aiMessage.text}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nome do Plano de Aula <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Ex: Armamento e Tiro Tático I"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Carreira / Cargo</label>
                  <select
                    value={planCareer}
                    onChange={(e) => setPlanCareer(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="Investigador">Investigador</option>
                    <option value="Escrivão">Escrivão</option>
                    <option value="Delegado">Delegado</option>
                    <option value="Perito">Perito</option>
                    <option value="Médico Legista">Médico Legista</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Matéria <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={planSubject}
                    onChange={(e) => setPlanSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-amber-400 font-extrabold focus:border-amber-500 focus:outline-none"
                  >
                    <option value="MEAF">MEAF</option>
                    <option value="TAP">TAP</option>
                    <option value="DP">DP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Ano</label>
                  <input
                    type="number"
                    value={planYear}
                    onChange={(e) => setPlanYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Número de Aulas Previstas</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={planLessonCount}
                    onChange={(e) => handlePlanLessonCountChange(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-bold font-mono text-amber-400 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tabela Dinâmica de Aulas */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <label className="block font-bold text-amber-400 text-xs">
                  Configuração Detalhada das Aulas ({planLessonsData.length} aulas):
                </label>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {planLessonsData.map((item, idx) => (
                    <div key={idx} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="font-bold text-amber-400 font-mono text-xs flex items-center space-x-1">
                          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>Aula {item.lessonNumber}</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Aula #{idx + 1}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Arma Usada:</label>
                          <input
                            type="text"
                            value={item.weaponUsed || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], weaponUsed: val };
                                return copy;
                              });
                            }}
                            placeholder="Ex: Pistola .40, Fuzil 5.56"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Conteúdo Lecionado:</label>
                          <input
                            type="text"
                            value={item.content || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], content: val };
                                return copy;
                              });
                            }}
                            placeholder="Ex: Manejo e regras de segurança"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Descrição da Aula:</label>
                        <textarea
                          value={item.description || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlanLessonsData(prev => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], description: val };
                              return copy;
                            });
                          }}
                          placeholder="Resumo das atividades práticas e teóricas da aula..."
                          rows={2}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pt-2 border-t border-slate-800/60">
                        <div>
                          <label className="block text-[10px] text-slate-400">Qtd. Tiros/Aluno:</label>
                          <input
                            type="number"
                            min="0"
                            value={item.shotsPerStudent}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const calcInst = val > 0 ? Math.ceil(val / 2) : 0;
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[idx] = { 
                                  ...copy[idx], 
                                  shotsPerStudent: val,
                                  instructorShots: calcInst
                                };
                                return copy;
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-amber-400 font-mono font-bold focus:border-amber-500 focus:outline-none text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400">Insumo/Prof. (50%):</label>
                          <input
                            type="number"
                            min="0"
                            value={item.instructorShots ?? (item.shotsPerStudent > 0 ? Math.ceil(item.shotsPerStudent / 2) : 0)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], instructorShots: val };
                                return copy;
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-mono font-bold focus:border-emerald-500 focus:outline-none text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400">Calibre:</label>
                          <select
                            value={item.caliberName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], caliberName: val };
                                return copy;
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                          >
                            {calibers.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
                >
                  Salvar Plano de Aula
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ver Armas da Caixa */}
      {viewingBoxWeaponsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-auto relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <Box className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Armas Acondicionadas na Caixa: <span className="text-amber-400">{viewingBoxWeaponsModal.name}</span>
                </h3>
              </div>
              <button
                onClick={() => setViewingBoxWeaponsModal(null)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {viewingBoxWeaponsModal.description && (
              <p className="text-xs text-slate-400 italic bg-slate-950 p-3 rounded-xl border border-slate-800">
                {viewingBoxWeaponsModal.description}
              </p>
            )}

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Relação de Armamentos ({viewingBoxWeaponsModal.weaponIds.length}):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {viewingBoxWeaponsModal.weaponIds.map((wId) => {
                  const w = weapons.find((item) => item.id === wId);
                  return (
                    <div
                      key={wId}
                      className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs"
                    >
                      {w ? (
                        <>
                          <div className="font-bold text-slate-100 flex items-center justify-between">
                            <span>{w.type} • {w.model}</span>
                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                              {w.caliber}
                            </span>
                          </div>
                          <div className="text-amber-400 font-mono font-bold text-[11px]">
                            Nº de Série: {w.serialNumber}
                          </div>
                          {w.manufacturer && (
                            <div className="text-[10px] text-slate-400">
                              Fabricante: {w.manufacturer}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            Status: <span className="text-emerald-400 font-semibold">{w.status}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-500 italic">ID da arma: {wId}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setViewingBoxWeaponsModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Confirmar Exclusão"
        message={`Tem certeza que deseja excluir "${deleteTarget?.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
