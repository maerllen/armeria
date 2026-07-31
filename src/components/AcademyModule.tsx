import React, { useState } from 'react';
import {
  User,
  Weapon,
  AmmunitionStock,
  VaultSpace,
  Department,
  Unit,
  AcademyCourse,
  Course,
  WeaponBox,
  WeaponBoxReplacement,
  CourseClass,
  CourseMovement,
  LessonPlan,
  LessonPlanItem,
  AcademyCareer,
  AlunoTurma,
  AlunoAula
} from '../types';
import { storage } from '../services/storage';
import { formatTimestamp, formatMasp } from '../utils/masks';
import {
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  Box,
  Users,
  ArrowRightLeft,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertCircle,
  Search,
  BookOpen,
  HelpCircle,
  FileText,
  ClipboardList,
  Layers,
  Calendar,
  RotateCcw,
  Eye,
  Smartphone
} from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { AcademyReceiptModal } from './AcademyReceiptModal';
import { formatTurmaCode } from './CalendarModule';

export const parseTurmaCalendarCode = (rawCode: string) => {
  const formatted = formatTurmaCode(rawCode);
  const upper = formatted.toUpperCase();

  let career: 'Delegado' | 'Investigador' | 'Escrivão' | 'Perito' | 'Médico Legista' = 'Delegado';

  if (upper.startsWith('EP') || upper.includes('ESCRIV')) {
    career = 'Escrivão';
  } else if (upper.startsWith('IP') || upper.includes('INVESTIGADOR')) {
    career = 'Investigador';
  } else if (upper.startsWith('PC') || upper.includes('PERITO')) {
    career = 'Perito';
  } else if (upper.startsWith('ML') || upper.includes('MEDICO') || upper.includes('LEGISTA')) {
    career = 'Médico Legista';
  } else if (upper.startsWith('DL') || upper.includes('DELEGADO')) {
    career = 'Delegado';
  }

  const digitsMatch = upper.match(/\d+/);
  const digits = digitsMatch ? digitsMatch[0].padStart(2, '0').slice(-2) : '01';

  return { career, turmaNumber: digits, formattedCode: formatted };
};

const ACADEPOL_CATALOG = [
  { name: 'Curso de Táticas Policiais Especiais', code: 'EC-TPE-2026' },
  { name: 'Tiro Defensivo e Armamento Operacional', code: 'EC-TDAO-2026' },
  { name: 'Operações em Ambientes Confinados (CQB)', code: 'EC-CQB-2026' },
  { name: 'Sobrevivência Policial Urbana', code: 'EC-SPU-2026' },
  { name: 'Atendimento Pré-Hospitalar Tático (APH-T)', code: 'EC-APHT-2026' },
  { name: 'Cumprimento de Mandados de Alta Complexidade', code: 'EC-CMAC-2026' },
  { name: 'Instrução e Habilitação em Fuzil e Submetralhadora', code: 'EC-IHFS-2026' },
  { name: 'Gestão de Armeria e Munição', code: 'EC-GAM-2026' },
  { name: 'Inteligência Policial e Investigação Cibernética', code: 'EC-IPIC-2026' }
];

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function generateDateRange(startStr: string, endStr: string): string[] {
  if (!startStr) return [];
  if (!endStr || endStr < startStr) return [startStr];
  const list: string[] = [];
  const current = new Date(startStr + 'T00:00:00');
  const last = new Date(endStr + 'T00:00:00');
  while (current <= last) {
    list.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return list;
}

interface AcademyModuleProps {
  currentUser: User;
  users: User[];
  weapons: Weapon[];
  ammoStocks: AmmunitionStock[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
  courseTypeFilterProp?: 'Formação' | 'Ensino Continuado';
}

export const AcademyModule: React.FC<AcademyModuleProps> = ({
  currentUser,
  users,
  weapons,
  ammoStocks,
  vaultSpaces,
  departments,
  units,
  onRefresh,
  courseTypeFilterProp
}) => {
  const [activeTab, setActiveTab] = useState<'movements' | 'turmas' | 'cursos'>('movements');

  const userDept = departments.find(d => d.id === currentUser.departmentId);
  const isAcademiaDept = (userDept?.name || '').toUpperCase().includes('ACADEMIA');
  const canManageCourses = currentUser.role === 'Geral' || 
    ((currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') && isAcademiaDept);

  if (!canManageCourses) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-amber-400">
          <GraduationCap className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Acesso Restrito - Gestão de Cursos</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Apenas usuários do perfil <strong className="text-amber-400">Geral</strong> e usuários <strong className="text-amber-400">Administradores e Armeiros</strong> vinculados ao departamento <strong className="text-slate-200">ACADEMIA DE POLICIA</strong> têm permissão para gerenciar cursos da Academia.
        </p>
      </div>
    );
  }

  // Server state getters
  const academyCourses = storage.getAcademyCourses();
  const qualCourses = storage.getCourses();
  const calibers = storage.getCalibers();
  const availableWeaponTypes = storage.getAvailableWeaponTypes();
  const weaponBoxes = storage.getWeaponBoxes();
  const boxReplacements = storage.getWeaponBoxReplacements();
  const courseClasses = storage.getCourseClasses();
  const courseMovements = storage.getCourseMovements();
  const lessonPlans = storage.getLessonPlans();
  const calendarRecords = storage.getCalendarRecords();

  const availableCalendarTurmas = React.useMemo(() => {
    const set = new Set<string>();
    calendarRecords.forEach(r => {
      if (r.turma_calendario && r.turma_calendario.trim()) {
        set.add(formatTurmaCode(r.turma_calendario));
      }
    });
    return Array.from(set).sort();
  }, [calendarRecords]);

  const filteredMovements = courseMovements.filter(mov => {
    if (courseTypeFilterProp) {
      if ((mov as any).type && (mov as any).type !== courseTypeFilterProp) return false;
      const linkedCourse = academyCourses.find(ac => ac.name === mov.courseName || ac.id === mov.courseId);
      if (linkedCourse && linkedCourse.type !== courseTypeFilterProp) return false;
    }
    return true;
  });

  const filteredClasses = courseClasses.filter(cls => {
    if (courseTypeFilterProp) {
      if ((cls as any).type && (cls as any).type !== courseTypeFilterProp) return false;
      const linkedCourse = academyCourses.find(ac => ac.id === cls.courseId);
      if (linkedCourse && linkedCourse.type !== courseTypeFilterProp) return false;
    }
    return true;
  });

  // --- QUALIFICATION / HABILITAÇÃO COURSES MANAGEMENT STATE ---
  const [showManageCoursesModal, setShowManageCoursesModal] = useState(false);
  const [editingQualCourse, setEditingQualCourse] = useState<Course | null>(null);
  const [qualCourseName, setQualCourseName] = useState('');
  const [qualSelectedWeaponTypes, setQualSelectedWeaponTypes] = useState<string[]>([]);
  const [qualSelectedModels, setQualSelectedModels] = useState<string[]>([]);
  const [qualShotsPerStudent, setQualShotsPerStudent] = useState<number>(50);
  const [qualShotsPerWeaponType, setQualShotsPerWeaponType] = useState<Record<string, number>>({});
  const [qualDeptId, setQualDeptId] = useState<string>('');
  const [qualModalError, setQualModalError] = useState('');
  const [qualModalSuccess, setQualModalSuccess] = useState('');

  const getAcadepolDeptId = () => {
    const acadDept = departments.find(d => d.name.toUpperCase().includes('ACADEMIA') || d.code === 'ACADEPOL') || departments[0];
    return acadDept?.id || 'dept-acad';
  };

  const handleOpenQualCourseModal = (c?: Course) => {
    setQualModalError('');
    setQualModalSuccess('');
    const acadId = getAcadepolDeptId();
    if (c) {
      setEditingQualCourse(c);
      setQualCourseName(c.name);
      setQualSelectedWeaponTypes(c.allowedWeaponTypes || []);
      setQualSelectedModels(c.allowedModels || []);
      setQualShotsPerStudent(c.shotsPerStudent || 50);
      setQualShotsPerWeaponType(c.shotsPerWeaponType || {});
      setQualDeptId(c.departmentId || acadId);
    } else {
      setEditingQualCourse(null);
      setQualCourseName('');
      setQualSelectedWeaponTypes([]);
      setQualSelectedModels([]);
      setQualShotsPerStudent(50);
      setQualShotsPerWeaponType({});
      setQualDeptId(acadId);
    }
    setShowManageCoursesModal(true);
  };

  const handleSaveQualCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setQualModalError('');
    setQualModalSuccess('');
    if (!qualCourseName.trim()) {
      setQualModalError('Informe o nome do curso.');
      return;
    }
    if (qualSelectedWeaponTypes.length === 0) {
      setQualModalError('Selecione pelo menos um Tipo de Arma para o curso.');
      return;
    }

    const acadId = getAcadepolDeptId();

    // Calculate total shots per student
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
        setQualModalSuccess('Curso de Habilitação atualizado com sucesso!');
      } else {
        await storage.addCourse({
          name: qualCourseName.trim(),
          allowedWeaponTypes: qualSelectedWeaponTypes,
          allowedModels: qualSelectedModels,
          allowedCalibers: [],
          shotsPerStudent: totalShots,
          shotsPerWeaponType: qualShotsPerWeaponType,
          departmentId: acadId
        });
        setQualModalSuccess('Novo curso de Habilitação cadastrado com sucesso!');
      }
      setQualCourseName('');
      setQualSelectedWeaponTypes([]);
      setQualSelectedModels([]);
      setQualShotsPerStudent(50);
      setQualShotsPerWeaponType({});
      setEditingQualCourse(null);
      onRefresh();
    } catch (err: any) {
      setQualModalError(err.message || 'Erro ao salvar curso de habilitação.');
    }
  };

  const handleDeleteQualCourse = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente excluir o curso "${name}"?`)) return;
    try {
      await storage.deleteCourse(id);
      setQualModalSuccess(`Curso "${name}" excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setQualModalError(err.message || 'Erro ao excluir curso.');
    }
  };

  // --- CURSOS TAB FILTERS ---
  const [courseSearchName, setCourseSearchName] = useState('');
  const [courseDeptFilter, setCourseDeptFilter] = useState('');
  const [courseTypeFilter, setCourseTypeFilter] = useState('');
  const [courseMonthFilter, setCourseMonthFilter] = useState('');
  const [courseYearFilter, setCourseYearFilter] = useState('');
  const [courseDateStatusFilter, setCourseDateStatusFilter] = useState<'futuros' | 'todos' | 'passados'>('futuros');

  const todayStr = new Date().toISOString().split('T')[0];

  const allUnifiedCourses = [
    ...academyCourses.map(ac => {
      const locationDept = ac.type === 'Formação'
        ? 'ACADEPOL'
        : (ac.locationDepartmentName || ac.departmentName || 'ACADEPOL');
      const teachingDept = ac.type === 'Formação'
        ? 'ACADEPOL'
        : (ac.teachingDepartmentName || ac.departmentName || 'ACADEPOL');
      const deptId = departments.find(d => d.name === locationDept)?.id || '';

      return {
        id: ac.id,
        name: ac.name,
        type: ac.type as 'Formação' | 'Ensino Continuado',
        code: ac.code || 'N/A',
        departmentId: deptId,
        departmentName: locationDept,
        locationDepartmentName: locationDept,
        teachingDepartmentName: teachingDept,
        dates: ac.dates || [],
        startDate: ac.startDate,
        endDate: ac.endDate,
        subject: ac.subject,
        durationDays: ac.durationDays,
        module: ac.module,
        allowedWeaponTypes: [] as string[],
        allowedModels: [] as string[],
        shotsPerStudent: 0,
        shotsPerWeaponType: undefined as Record<string, number> | undefined,
        isQualification: false,
        rawAcademy: ac,
        rawQual: null as Course | null
      };
    })
  ];

  const filteredUnifiedCourses = allUnifiedCourses.filter(c => {
    if (courseTypeFilterProp && c.type !== courseTypeFilterProp) return false;

    if (courseSearchName.trim()) {
      const term = courseSearchName.toLowerCase();
      const matchName = c.name.toLowerCase().includes(term);
      const matchModels = c.allowedModels.some(m => m.toLowerCase().includes(term));
      const matchTypes = c.allowedWeaponTypes.some(wt => wt.toLowerCase().includes(term));
      if (!matchName && !matchModels && !matchTypes) return false;
    }

    if (courseDeptFilter && courseDeptFilter !== 'TODOS') {
      if (c.departmentId !== courseDeptFilter && c.departmentName !== courseDeptFilter) return false;
    }

    if (courseTypeFilter && courseTypeFilter !== 'TODOS') {
      if (c.type !== courseTypeFilter) return false;
    }

    if (courseMonthFilter && courseMonthFilter !== 'TODOS') {
      const hasMonth = c.dates.some(d => {
        const parts = d.split('-');
        return parts.length >= 2 && parts[1] === courseMonthFilter;
      });
      if (c.dates.length > 0 && !hasMonth) return false;
    }

    if (courseYearFilter && courseYearFilter !== 'TODOS') {
      const hasYear = c.dates.some(d => d.startsWith(courseYearFilter));
      if (c.dates.length > 0 && !hasYear) return false;
    }

    if (courseDateStatusFilter === 'futuros') {
      if (c.dates.length > 0) {
        const hasFutureDate = c.dates.some(d => d >= todayStr);
        if (!hasFutureDate) return false;
      }
    } else if (courseDateStatusFilter === 'passados') {
      if (c.dates.length === 0) return false;
      const allPast = c.dates.every(d => d < todayStr);
      if (!allPast) return false;
    }

    return true;
  });

  // Ordenação cronológica por data (mais próximos de ocorrer primeiro)
  const sortedUnifiedCourses = [...filteredUnifiedCourses].sort((a, b) => {
    const getPrimaryDate = (c: typeof a) => {
      if (c.dates && c.dates.length > 0) {
        const futureDates = c.dates.filter(d => d >= todayStr).sort();
        if (futureDates.length > 0) return futureDates[0];
        return [...c.dates].sort()[0];
      }
      return '9999-12-31';
    };
    const dateA = getPrimaryDate(a);
    const dateB = getPrimaryDate(b);
    return dateA.localeCompare(dateB);
  });

  // Permission check for deleting courses (only Geral)
  const canDeleteCourse = currentUser.role === 'Geral';

  // Feedback messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'course' | 'box' | 'class' | 'plan' | 'movement'; id: string; name: string } | null>(null);

  // Edit Mapa de Aula state
  const [showEditMovModal, setShowEditMovModal] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CourseMovement | null>(null);
  const [editMovTeacherName, setEditMovTeacherName] = useState('');
  const [editMovLessonNumber, setEditMovLessonNumber] = useState<number>(1);
  const [editMovLessonPlanName, setEditMovLessonPlanName] = useState('');
  const [editMovAmmoSupplied, setEditMovAmmoSupplied] = useState<number>(0);
  const [editMovNotes, setEditMovNotes] = useState('');

  // Selected receipt for printing
  const [selectedReceiptMovement, setSelectedReceiptMovement] = useState<CourseMovement | null>(null);

  // Teachers list
  const teachers = users.filter(u => u.isTeacher || u.role === 'Geral' || u.role === 'Administrador' || u.role === 'Armeiro');

  // Available weapons for boxes or movements (excluding weapons already assigned to any weapon box)
  const allBoxedWeaponIds = weaponBoxes.flatMap(b => b.weaponIds || []);
  const availableWeapons = weapons.filter(w => (w.status === 'Disponível' || w.status === 'No Cofre') && !allBoxedWeaponIds.includes(w.id));

  // --- 1. COURSE FORM STATE ---
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AcademyCourse | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseType, setCourseType] = useState<'Formação' | 'Ensino Continuado'>('Formação');
  const [courseModuleRoman, setCourseModuleRoman] = useState<string>('I');
  const [courseCode, setCourseCode] = useState('');
  const [courseDepartment, setCourseDepartment] = useState('');
  const [courseTeachingDept, setCourseTeachingDept] = useState('');
  const [courseLocationDept, setCourseLocationDept] = useState('');
  const [courseDurationDays, setCourseDurationDays] = useState<number>(1);
  const [courseSubject, setCourseSubject] = useState<string>('MEAF');
  const [courseStartDate, setCourseStartDate] = useState('');
  const [courseEndDate, setCourseEndDate] = useState('');
  const [courseDates, setCourseDates] = useState<string[]>([]);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  const handleOpenCourseModal = (param?: 'Formação' | 'Ensino Continuado' | AcademyCourse) => {
    if (typeof param === 'object' && param !== null) {
      setEditingCourse(param);
      setCourseName(param.name);
      setCourseType(param.type);
      setCourseCode(param.code || '');
      setCourseDepartment(param.departmentName || (param.type === 'Formação' ? 'ACADEPOL' : ''));
      setCourseTeachingDept(param.teachingDepartmentName || param.departmentName || 'ACADEPOL');
      setCourseLocationDept(param.locationDepartmentName || 'ACADEPOL');
      setCourseDurationDays(param.durationDays || (param.dates && param.dates.length ? param.dates.length : 1));
      setCourseSubject(param.subject || 'MEAF');
      setCourseDates(param.dates || []);
      setCourseStartDate(param.startDate || (param.dates && param.dates.length > 0 ? param.dates[0] : ''));
      setCourseEndDate(param.endDate || (param.dates && param.dates.length > 1 ? param.dates[param.dates.length - 1] : (param.dates && param.dates.length === 1 ? param.dates[0] : '')));
      setCourseModuleRoman(param.module ? param.module.replace('Módulo ', '') : 'I');
    } else {
      const selectedType = courseTypeFilterProp || (typeof param === 'string' ? param : 'Formação');
      setEditingCourse(null);
      setCourseType(selectedType);
      setCourseDates([]);
      setCourseStartDate('');
      setCourseEndDate('');

      if (selectedType === 'Formação') {
        setCourseName('Curso de Formação de Policiais Civis');
        setCourseModuleRoman('I');
        setCourseCode('CFTP - Módulo I');
        setCourseDepartment('ACADEPOL');
        setCourseTeachingDept('ACADEPOL');
        setCourseLocationDept('ACADEPOL');
        setCourseDurationDays(1);
        setCourseSubject('MEAF');
      } else {
        const firstCat = ACADEPOL_CATALOG[0];
        setCourseName(firstCat.name);
        setCourseCode(firstCat.code);
        const defaultDept = departments[0]?.name || 'ACADEPOL';
        setCourseDepartment(defaultDept);
        setCourseTeachingDept('ACADEPOL');
        setCourseLocationDept(defaultDept);
        setCourseDurationDays(1);
        setCourseSubject('MEAF');
      }
    }
    setCalendarDate(new Date());
    setShowCourseModal(true);
  };

  const handleModuleRomanChange = (roman: string) => {
    setCourseModuleRoman(roman);
    setCourseCode(`CFTP - Módulo ${roman}`);
  };

  const handleEnsinoContinuadoNameChange = (nameVal: string) => {
    setCourseName(nameVal);
    const found = ACADEPOL_CATALOG.find(c => c.name === nameVal);
    if (found) {
      setCourseCode(found.code);
    } else {
      const initials = nameVal.split(' ').map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '');
      setCourseCode(`EC-${initials.slice(0, 4)}-2026`);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      alert('Informe o nome do curso.');
      return;
    }
    if (!courseCode.trim()) {
      alert('Informe o código do curso.');
      return;
    }

    let finalDates: string[] = [];
    if (courseType === 'Formação') {
      if (!courseStartDate || !courseEndDate) {
        alert('Informe a data de início e a data final do curso de Formação.');
        return;
      }
      finalDates = [courseStartDate, courseEndDate];
    } else {
      // Ensino Continuado
      finalDates = [...courseDates].sort();
      if (finalDates.length === 0) {
        alert('Selecione pelo menos uma data no calendário para o curso de Ensino Continuado.');
        return;
      }
    }

    try {
      const res = await storage.saveAcademyCourse({
        id: editingCourse?.id,
        name: courseName.trim(),
        type: courseType,
        code: courseCode.trim(),
        departmentName: courseType === 'Formação' ? courseDepartment.trim() || 'ACADEPOL' : courseTeachingDept.trim() || 'ACADEPOL',
        startDate: courseType === 'Formação' ? courseStartDate : undefined,
        endDate: courseType === 'Formação' ? courseEndDate : undefined,
        module: courseType === 'Formação' ? `Módulo ${courseModuleRoman}` : undefined,
        teachingDepartmentName: courseType === 'Ensino Continuado' ? (courseTeachingDept.trim() || 'ACADEPOL') : undefined,
        locationDepartmentName: courseType === 'Ensino Continuado' ? (courseLocationDept.trim() || 'ACADEPOL') : undefined,
        durationDays: courseType === 'Ensino Continuado' ? (Number(courseDurationDays) || finalDates.length || 1) : undefined,
        subject: courseType === 'Ensino Continuado' ? courseSubject : undefined,
        dates: finalDates
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Curso salvo com sucesso!');
      setShowCourseModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar curso.');
    }
  };

  // --- 2. WEAPON BOX FORM STATE ---
  const [showBoxModal, setShowBoxModal] = useState(false);
  const [editingBox, setEditingBox] = useState<WeaponBox | null>(null);
  const [boxName, setBoxName] = useState('');
  const [boxDesc, setBoxDesc] = useState('');
  const [selectedBoxWeaponIds, setSelectedBoxWeaponIds] = useState<string[]>([]);

  // Replacement modal
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceBox, setReplaceBox] = useState<WeaponBox | null>(null);
  const [oldWeaponId, setOldWeaponId] = useState('');
  const [newWeaponId, setNewWeaponId] = useState('');
  const [replaceReason, setReplaceReason] = useState('');
  const [replaceTeacherName, setReplaceTeacherName] = useState('');
  const [replaceResponsibleName, setReplaceResponsibleName] = useState('');

  const handleOpenBoxModal = (box?: WeaponBox) => {
    if (box) {
      setEditingBox(box);
      setBoxName(box.name);
      setBoxDesc(box.description || '');
      setSelectedBoxWeaponIds(box.weaponIds || []);
    } else {
      setEditingBox(null);
      setBoxName('');
      setBoxDesc('');
      setSelectedBoxWeaponIds([]);
    }
    setShowBoxModal(true);
  };

  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boxName.trim()) return;
    try {
      const res = await storage.saveWeaponBox({
        id: editingBox?.id,
        name: boxName.trim(),
        description: boxDesc.trim(),
        weaponIds: selectedBoxWeaponIds
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Caixa de armas salva com sucesso!');
      setShowBoxModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar caixa de armas.');
    }
  };

  const handleOpenReplaceModal = (box: WeaponBox) => {
    setReplaceBox(box);
    setOldWeaponId(box.weaponIds[0] || '');
    setNewWeaponId('');
    setReplaceReason('');
    setReplaceTeacherName('');
    setReplaceResponsibleName(currentUser.name || '');
    setShowReplaceModal(true);
  };

  const handleExecuteReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceBox || !oldWeaponId || !newWeaponId) return;
    if (!replaceReason.trim()) {
      alert('Informe o motivo da substituição.');
      return;
    }
    const oldW = weapons.find(w => w.id === oldWeaponId);
    const newW = weapons.find(w => w.id === newWeaponId);
    
    const oldBrand = oldW?.brand || oldW?.manufacturer || 'N/A';
    const oldModel = oldW?.model || 'N/A';
    const oldSerial = oldW?.serialNumber || 'N/A';
    const oldDesc = `MARCA: ${oldBrand} | MODELO: ${oldModel} | N/S: ${oldSerial}`;

    const newBrand = newW?.brand || newW?.manufacturer || 'N/A';
    const newModel = newW?.model || 'N/A';
    const newSerial = newW?.serialNumber || 'N/A';
    const newDesc = `MARCA: ${newBrand} | MODELO: ${newModel} | N/S: ${newSerial}`;

    const responsibleName = replaceResponsibleName.trim() || currentUser.name;

    try {
      const res = await storage.replaceWeaponInBox(
        replaceBox.id,
        oldWeaponId,
        oldDesc,
        newWeaponId,
        newDesc,
        replaceReason.trim(),
        replaceTeacherName.trim(),
        responsibleName
      );
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Arma substituída na caixa com sucesso e histórico gravado.');
      setShowReplaceModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao substituir arma na caixa.');
    }
  };

  // --- 3. COURSE CLASS FORM STATE ---
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<CourseClass | null>(null);
  const [classModalCourseType, setClassModalCourseType] = useState<'Formação' | 'Ensino Continuado'>('Formação');
  const [classCourseId, setClassCourseId] = useState('');
  const [classCareer, setClassCareer] = useState('Delegado');
  const [classTurmaNum, setClassTurmaNum] = useState('01');
  const [selectedCalendarTurma, setSelectedCalendarTurma] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');
  const [classTeacherName, setClassTeacherName] = useState('');
  const [classSubject, setClassSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');
  const [classStudentCount, setClassStudentCount] = useState<number>(20);
  const [classLessonPlanId, setClassLessonPlanId] = useState('');

  // Expand / Collapse details & Alunos Modal
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [selectedStudentsClass, setSelectedStudentsClass] = useState<CourseClass | null>(null);

  // ALUNO TURMA & ALUNO AULAS STATE
  const [classStudents, setClassStudents] = useState<AlunoTurma[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addStudentMode, setAddStudentMode] = useState<'single' | 'batch'>('batch');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentMasp, setNewStudentMasp] = useState('');
  const [newStudentBatchText, setNewStudentBatchText] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  // Edit / Instrutores Extras State
  const [editingStudent, setEditingStudent] = useState<AlunoTurma | null>(null);
  const [editStudentNome, setEditStudentNome] = useState('');
  const [editStudentMasp, setEditStudentMasp] = useState('');
  const [editStudentSituacao, setEditStudentSituacao] = useState('Ativo');
  const [editStudentInstrutor1, setEditStudentInstrutor1] = useState('');
  const [editStudentInstrutor2, setEditStudentInstrutor2] = useState('');
  const [editStudentInstrutor3, setEditStudentInstrutor3] = useState('');
  const [editStudentInstrutor4, setEditStudentInstrutor4] = useState('');

  // Transfer Student State
  const [transferTargetStudent, setTransferTargetStudent] = useState<AlunoTurma | null>(null);
  const [transferNewClassId, setTransferNewClassId] = useState('');
  const [transferringStudent, setTransferringStudent] = useState(false);

  // Student Lessons Modal State
  const [selectedStudentForLessons, setSelectedStudentForLessons] = useState<AlunoTurma | null>(null);
  const [studentLessons, setStudentLessons] = useState<AlunoAula[]>([]);
  const [loadingStudentLessons, setLoadingStudentLessons] = useState(false);
  const [editingLesson, setEditingLesson] = useState<AlunoAula | null>(null);
  const [lessonFormName, setLessonFormName] = useState('');
  const [lessonFormNumber, setLessonFormNumber] = useState<number>(1);
  const [lessonFormDate, setLessonFormDate] = useState('');
  const [lessonFormTime, setLessonFormTime] = useState('');
  const [lessonFormContent, setLessonFormContent] = useState('');
  const [lessonFormObs, setLessonFormObs] = useState('');
  const [lessonFormGrade, setLessonFormGrade] = useState('');
  const [savingLesson, setSavingLesson] = useState(false);

  const toggleClassDetails = (classId: string) => {
    setExpandedClasses(prev => ({
      ...prev,
      [classId]: !prev[classId]
    }));
  };

  const handleOpenStudentsModal = async (cls: CourseClass) => {
    setSelectedStudentsClass(cls);
    setLoadingStudents(true);
    setNewStudentName('');
    setNewStudentMasp('');
    setNewStudentBatchText('');
    setEditingStudent(null);
    setTransferTargetStudent(null);
    setSelectedStudentForLessons(null);
    try {
      const students = await storage.getAlunosTurma(cls.id);
      setClassStudents(students);
    } catch (err: any) {
      setErrorMsg('Erro ao carregar alunos da turma.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadClassStudents = async (classId: string) => {
    setLoadingStudents(true);
    try {
      const students = await storage.getAlunosTurma(classId);
      setClassStudents(students);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleAddStudents = async () => {
    if (!selectedStudentsClass) return;
    setSavingStudent(true);
    try {
      let res;
      if (addStudentMode === 'batch') {
        if (!newStudentBatchText.trim()) {
          throw new Error('Insira ao menos um nome de aluno no campo em bloco (um por linha).');
        }
        res = await storage.addAlunosTurma({
          turmaId: selectedStudentsClass.id,
          names: newStudentBatchText
        });
      } else {
        if (!newStudentName.trim()) {
          throw new Error('Informe o nome do aluno.');
        }
        res = await storage.addAlunosTurma({
          turmaId: selectedStudentsClass.id,
          name: newStudentName.trim(),
          masp: newStudentMasp.trim() || undefined
        });
      }

      if (!res.success) throw new Error(res.error);
      setSuccessMsg(`Aluno(s) cadastrado(s) com sucesso na turma ${selectedStudentsClass.code || selectedStudentsClass.name}!`);
      setNewStudentName('');
      setNewStudentMasp('');
      setNewStudentBatchText('');
      await loadClassStudents(selectedStudentsClass.id);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar aluno(s).');
    } finally {
      setSavingStudent(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!selectedStudentsClass) return;
    try {
      const res = await storage.deleteAlunoTurma(studentId);
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Aluno removido com sucesso.');
      await loadClassStudents(selectedStudentsClass.id);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover aluno.');
    }
  };

  const handleOpenEditStudent = (student: AlunoTurma) => {
    setEditingStudent(student);
    setEditStudentNome(student.nomeAluno);
    setEditStudentMasp(student.maspAluno || '');
    setEditStudentSituacao(student.situacaoAluno || 'Ativo');
    setEditStudentInstrutor1(student.instrutor1Aluno || '');
    setEditStudentInstrutor2(student.instrutor2Aluno || '');
    setEditStudentInstrutor3(student.instrutor3Aluno || '');
    setEditStudentInstrutor4(student.instrutor4Aluno || '');
  };

  const handleSaveEditStudent = async () => {
    if (!editingStudent || !selectedStudentsClass) return;
    setSavingStudent(true);
    try {
      const res = await storage.updateAlunoTurma(editingStudent.id, {
        nomeAluno: editStudentNome,
        maspAluno: editStudentMasp,
        situacaoAluno: editStudentSituacao,
        instrutor1Aluno: editStudentInstrutor1,
        instrutor2Aluno: editStudentInstrutor2,
        instrutor3Aluno: editStudentInstrutor3,
        instrutor4Aluno: editStudentInstrutor4
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg(`Cadastro do aluno ${editStudentNome} atualizado!`);
      setEditingStudent(null);
      await loadClassStudents(selectedStudentsClass.id);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar alterações do aluno.');
    } finally {
      setSavingStudent(false);
    }
  };

  const handleOpenTransferModal = (student: AlunoTurma) => {
    setTransferTargetStudent(student);
    setTransferNewClassId('');
  };

  const handleExecuteTransfer = async () => {
    if (!transferTargetStudent || !transferNewClassId || !selectedStudentsClass) return;
    setTransferringStudent(true);
    try {
      const res = await storage.transferAlunoTurma(transferTargetStudent.id, transferNewClassId);
      if (!res.success) throw new Error(res.error);
      setSuccessMsg(`Aluno ${transferTargetStudent.nomeAluno} transferido de turma com sucesso! Todas as aulas e notas foram mantidas.`);
      setTransferTargetStudent(null);
      await loadClassStudents(selectedStudentsClass.id);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao transferir aluno de turma.');
    } finally {
      setTransferringStudent(false);
    }
  };

  // Lessons Handlers
  const handleOpenLessonsModal = async (student: AlunoTurma) => {
    setSelectedStudentForLessons(student);
    setLoadingStudentLessons(true);
    setEditingLesson(null);
    resetLessonForm();
    try {
      const aulas = await storage.getAlunoAulas(student.id);
      setStudentLessons(aulas);
    } catch (err) {
      setErrorMsg('Erro ao carregar aulas do aluno.');
    } finally {
      setLoadingStudentLessons(false);
    }
  };

  const resetLessonForm = () => {
    setEditingLesson(null);
    setLessonFormName('');
    setLessonFormNumber(1);
    setLessonFormDate('');
    setLessonFormTime('');
    setLessonFormContent('');
    setLessonFormObs('');
    setLessonFormGrade('');
  };

  const handleEditLesson = (lesson: AlunoAula) => {
    setEditingLesson(lesson);
    setLessonFormName(lesson.aulaNomeAluno);
    setLessonFormNumber(lesson.aulaNumeroAluno || 1);
    setLessonFormDate(lesson.aulaDataAluno || '');
    setLessonFormTime(lesson.aulaHoraAluno || '');
    setLessonFormContent(lesson.aulaConteudoAluno || '');
    setLessonFormObs(lesson.observacaoAluno || '');
    setLessonFormGrade(lesson.notaAluno || '');
  };

  const handleSaveLesson = async () => {
    if (!selectedStudentForLessons) return;
    if (!lessonFormName.trim()) {
      setErrorMsg('Informe o nome da aula.');
      return;
    }
    setSavingLesson(true);
    try {
      const res = await storage.saveAlunoAula(selectedStudentForLessons.id, {
        id: editingLesson?.id,
        aulaNomeAluno: lessonFormName.trim(),
        aulaNumeroAluno: Number(lessonFormNumber) || 1,
        aulaDataAluno: lessonFormDate || undefined,
        aulaHoraAluno: lessonFormTime || undefined,
        aulaConteudoAluno: lessonFormContent.slice(0, 500),
        observacaoAluno: lessonFormObs || undefined,
        notaAluno: lessonFormGrade || undefined
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Aula/nota do aluno salva com sucesso!');
      resetLessonForm();
      const updated = await storage.getAlunoAulas(selectedStudentForLessons.id);
      setStudentLessons(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar aula do aluno.');
    } finally {
      setSavingLesson(false);
    }
  };

  const handleDeleteLesson = async (aulaId: string) => {
    if (!selectedStudentForLessons) return;
    try {
      const res = await storage.deleteAlunoAula(aulaId);
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Aula removida com sucesso.');
      const updated = await storage.getAlunoAulas(selectedStudentForLessons.id);
      setStudentLessons(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover aula.');
    }
  };

  const getCareerAbbr = (car: string): 'DL' | 'IP' | 'EP' | 'PC' | 'ML' => {
    const c = (car || '').toUpperCase();
    if (c.includes('DELEGADO') || c.includes('DL')) return 'DL';
    if (c.includes('INVESTIGADOR') || c.includes('IP')) return 'IP';
    if (c.includes('ESCRIVÃ') || c.includes('ESCRIVAO') || c.includes('EP')) return 'EP';
    if (c.includes('PERITO') || c.includes('PC')) return 'PC';
    if (c.includes('MÉDICO') || c.includes('MEDICO') || c.includes('LEGISTA') || c.includes('ML')) return 'ML';
    return 'DL';
  };

  const getTeacherDisplayName = (cls: CourseClass) => {
    if (cls.teacherUserIds && cls.teacherUserIds.length > 0) {
      const names = cls.teacherUserIds
        .map(id => teachers.find(t => t.id === id || t.userId === id || t.masp === id)?.name)
        .filter(Boolean);
      if (names.length > 0) return names.join(', ');
    }
    if (cls.teacherUserId) {
      const found = teachers.find(t => t.id === cls.teacherUserId || t.userId === cls.teacherUserId || t.masp === cls.teacherUserId);
      if (found) return found.name;
    }
    if (cls.teacherName) return cls.teacherName;
    return 'Não informado';
  };

  const getLessonPlanDisplayName = (cls: CourseClass) => {
    const planId = cls.plano_de_aula || cls.lessonPlanId;
    if (planId) {
      const found = lessonPlans.find(p => p.id === planId);
      if (found) return found.name;
    }
    if (cls.lessonPlanName) return cls.lessonPlanName;
    return 'Nenhum vinculado';
  };

  const handleOpenClassModal = (cls?: CourseClass | null, targetType: 'Formação' | 'Ensino Continuado' = 'Formação', initialCalTurma?: string) => {
    if (cls) {
      const linked = academyCourses.find(c => c.id === cls.courseId);
      const effectiveType = linked?.type || targetType;
      setEditingClass(cls);
      setClassModalCourseType(effectiveType);
      setClassCourseId(cls.courseId);
      setClassCareer(cls.career);
      const digits = (cls.turmaNumber || cls.code || cls.name || '').replace(/\D/g, '');
      setClassTurmaNum(digits ? digits.padStart(2, '0').slice(-2) : '01');
      setSelectedCalendarTurma(initialCalTurma || '');
      const primaryTeacher = cls.teacherUserId || (cls.teacherUserIds && cls.teacherUserIds[0]) || '';
      setClassTeacherId(primaryTeacher);
      const teacherObj = teachers.find(t => t.id === primaryTeacher || t.userId === primaryTeacher);
      setClassTeacherName(teacherObj?.name || cls.teacherName || '');
      setClassSubject(cls.subject);
      setClassStudentCount(cls.studentCount);
      setClassLessonPlanId(cls.plano_de_aula || cls.lessonPlanId || '');
    } else {
      const initialSubject: 'MEAF' | 'TAP' | 'DP' = 'MEAF';
      const initialMatching = teachers.filter(t => t.teacherSubject === initialSubject);
      const defaultTeacher = initialMatching[0] || teachers[0];

      const matchingCourses = academyCourses.filter(c => c.type === targetType);

      setEditingClass(null);
      setClassModalCourseType(targetType);
      setClassCourseId(matchingCourses[0]?.id || '');

      if (initialCalTurma) {
        setSelectedCalendarTurma(initialCalTurma);
        const parsed = parseTurmaCalendarCode(initialCalTurma);
        setClassCareer(parsed.career);
        setClassTurmaNum(parsed.turmaNumber);
      } else {
        setSelectedCalendarTurma('');
        setClassCareer('Delegado');
        setClassTurmaNum('01');
      }

      setClassSubject(initialSubject);
      setClassTeacherId(defaultTeacher?.id || '');
      setClassTeacherName(defaultTeacher?.name || '');
      setClassStudentCount(20);
      setClassLessonPlanId('');
    }
    setShowClassModal(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classCourseId) {
      alert('Selecione um curso.');
      return;
    }
    const selectedCourse = academyCourses.find(c => c.id === classCourseId);
    const selectedTeacher = teachers.find(t => t.id === classTeacherId);
    const selectedPlan = lessonPlans.find(p => p.id === classLessonPlanId);

    const abbr = getCareerAbbr(classCareer);
    const formattedNum = (classTurmaNum.trim() || '01').padStart(2, '0').slice(-2);
    const fullName = `${abbr}-${formattedNum}`;

    // Check duplicate turma in same course & career
    const isDuplicate = courseClasses.some(c =>
      c.id !== editingClass?.id &&
      c.courseId === classCourseId &&
      c.career === classCareer &&
      (c.turmaNumber === formattedNum || (c.code && c.code.endsWith(`-${formattedNum}`)))
    );

    if (isDuplicate) {
      alert(`Não é possível salvar duas turmas com o mesmo número (${formattedNum}) para a carreira "${classCareer}" neste mesmo curso.`);
      return;
    }

    const finalTeacherName = classTeacherName.trim() || selectedTeacher?.name || 'Professor';

    try {
      const res = await storage.saveCourseClass({
        id: editingClass?.id,
        courseId: classCourseId,
        courseName: selectedCourse?.name || '',
        career: classCareer,
        careerAbbreviation: abbr,
        turmaNumber: formattedNum,
        code: fullName,
        name: fullName,
        teacherUserId: classTeacherId,
        teacherUserIds: classTeacherId ? [classTeacherId] : [],
        teacherName: finalTeacherName,
        subject: classSubject,
        studentCount: Number(classStudentCount) || 1,
        plano_de_aula: classLessonPlanId || undefined,
        lessonPlanId: classLessonPlanId || undefined,
        lessonPlanName: selectedPlan ? selectedPlan.name : undefined,
        departmentId: currentUser.departmentId
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg(`Turma ${fullName} salva com sucesso!`);
      setShowClassModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar turma.');
    }
  };

  // --- 3.5 LESSON PLAN FORM STATE AND HANDLERS ---
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planTurmaCode, setPlanTurmaCode] = useState('');
  const [planCareer, setPlanCareer] = useState<AcademyCareer>('Delegado');
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear());
  const [planType, setPlanType] = useState<'curso de formação' | 'curso ensino continuado'>('curso de formação');
  const [planLessonCount, setPlanLessonCount] = useState<number>(5);
  const [planLessonsData, setPlanLessonsData] = useState<LessonPlanItem[]>([]);

  const handleOpenPlanModal = (plan?: LessonPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanName(plan.name);
      setPlanTurmaCode(plan.turmaCode || '');
      setPlanCareer(plan.career as AcademyCareer);
      setPlanYear(plan.year);
      setPlanType(plan.type);
      setPlanLessonCount(plan.lessonCount);
      setPlanLessonsData(plan.lessonsData || []);
    } else {
      setEditingPlan(null);
      setPlanName('');
      setPlanTurmaCode('');
      setPlanCareer('Delegado');
      setPlanYear(new Date().getFullYear());
      setPlanType('curso de formação');
      setPlanLessonCount(5);

      const defaultCaliber = ammoStocks[0]?.caliber || '9x19mm';
      const initialItems: LessonPlanItem[] = Array.from({ length: 5 }, (_, i) => ({
        lessonNumber: i + 1,
        shotsPerStudent: 50,
        caliberName: defaultCaliber,
        instructorShots: 10
      }));
      setPlanLessonsData(initialItems);
    }
    setShowPlanModal(true);
  };

  const handlePlanLessonCountChange = (count: number) => {
    const newCount = Math.max(1, Math.min(30, count));
    setPlanLessonCount(newCount);
    setPlanLessonsData(prev => {
      const updated = [...prev];
      if (newCount > updated.length) {
        const defaultCaliber = ammoStocks[0]?.caliber || '9x19mm';
        for (let i = updated.length; i < newCount; i++) {
          updated.push({
            lessonNumber: i + 1,
            shotsPerStudent: 50,
            caliberName: defaultCaliber,
            instructorShots: 10
          });
        }
      } else {
        updated.length = newCount;
      }
      return updated;
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) {
      alert('Informe o nome do plano de aula.');
      return;
    }

    try {
      const res = await storage.saveLessonPlan({
        id: editingPlan?.id,
        name: planName.trim(),
        turmaCode: planTurmaCode || undefined,
        career: planCareer,
        year: Number(planYear) || new Date().getFullYear(),
        type: planType,
        lessonCount: Number(planLessonCount) || 1,
        lessonsData: planLessonsData,
        departmentId: currentUser.departmentId
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg(`Plano de aula "${planName}" salvo com sucesso!`);
      setShowPlanModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar plano de aula.');
    }
  };

  // --- 4. COURSE MOVEMENT (SAÍDA / RETORNO) STATE ---
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movClassId, setMovClassId] = useState('');
  const [movPlanId, setMovPlanId] = useState('');
  const [movLessonNumber, setMovLessonNumber] = useState<number>(1);
  const [movSelectedBoxIds, setMovSelectedBoxIds] = useState<string[]>([]);
  const [movAmmoItems, setMovAmmoItems] = useState<{ id: string; caliberId: string; vaultSpaceId: string; quantity: number }[]>([]);
  const [movRecipientType, setMovRecipientType] = useState<'inside' | 'outside'>('inside');
  const [movTeacherUserId, setMovTeacherUserId] = useState('');
  const [movTeacherNameOutside, setMovTeacherNameOutside] = useState('');
  const [movNotes, setMovNotes] = useState('');

  // Retorno / Fechar Mapa modal
  const [showRetornoModal, setShowRetornoModal] = useState(false);
  const [retornoMovement, setRetornoMovement] = useState<CourseMovement | null>(null);
  const [retornoSelectedBoxIds, setRetornoSelectedBoxIds] = useState<string[]>([]);
  const [retornoAmmoUsed, setRetornoAmmoUsed] = useState<number>(0);
  const [retornoAmmoReturned, setRetornoAmmoReturned] = useState<number>(0);
  const [retornoMaterials, setRetornoMaterials] = useState('');
  const [retornoNotes, setRetornoNotes] = useState('');
  const [retornoUserName, setRetornoUserName] = useState('');

  const handleOpenSaidaModal = () => {
    setErrorMsg('');
    const firstClass = courseClasses[0];
    setMovClassId(firstClass?.id || '');
    setMovSelectedBoxIds([]);

    // Filter plans with type 'curso de formação'
    const formacaoPlans = lessonPlans.filter(p => (p.type || '').toLowerCase().includes('formação'));
    const initialPlan = formacaoPlans[0];
    setMovPlanId(initialPlan?.id || '');
    setMovLessonNumber(1);

    const lessonItem = initialPlan?.lessonsData[0];
    const targetCalName = lessonItem?.caliberName || ammoStocks[0]?.caliber || '';
    const selCalObj = calibers.find(c => c.id === targetCalName || c.name.toLowerCase() === targetCalName.toLowerCase()) || calibers[0];

    // Filter MEAF vaults
    const meafVaults = vaultSpaces.filter(v => {
      if (v.unitId === 'unit-acad-meaf') return true;
      const linkedUnit = units.find(u => u.id === v.unitId);
      if (linkedUnit && (linkedUnit.name.toUpperCase().includes('MEAF') || linkedUnit.code?.toUpperCase().includes('MEAF'))) return true;
      if (v.name?.toUpperCase().includes('MEAF') || v.code?.toUpperCase().includes('MEAF')) return true;
      return false;
    });
    const displayVaults = meafVaults.length > 0 ? meafVaults : vaultSpaces;

    const matchingStock = ammoStocks.find(a =>
      selCalObj && (a.caliberId === selCalObj.id || (a.caliber && a.caliber.toLowerCase() === selCalObj.name.toLowerCase()))
    ) || ammoStocks[0];

    const studentCount = firstClass?.studentCount || 20;
    const shotsPerStudent = lessonItem?.shotsPerStudent || 0;
    const instructorShots = lessonItem?.instructorShots || 0;
    const baseQty = (shotsPerStudent * studentCount) + instructorShots;
    const suppliedQty = Math.round(baseQty * 1.10);

    setMovAmmoItems([
      {
        id: '1',
        caliberId: selCalObj?.id || calibers[0]?.id || '',
        vaultSpaceId: matchingStock?.vaultSpaceId || displayVaults[0]?.id || '',
        quantity: suppliedQty
      }
    ]);

    setMovRecipientType('inside');
    setMovTeacherUserId(firstClass?.teacherUserId || teachers[0]?.id || '');
    setMovTeacherNameOutside('');
    setMovNotes('');
    setShowMovementModal(true);
  };

  const handleExecuteSaida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movClassId) {
      alert('Selecione a Turma da Aula.');
      return;
    }

    const selectedClass = courseClasses.find(c => c.id === movClassId);
    if (!selectedClass) return;

    const selectedPlan = lessonPlans.find(p => p.id === movPlanId);

    let teacherName = '';
    if (movRecipientType === 'inside') {
      const tUser = users.find(u => u.id === movTeacherUserId);
      teacherName = tUser ? tUser.name : (selectedClass.teacherName || 'Professor');
    } else {
      if (!movTeacherNameOutside.trim()) {
        alert('Informe o nome do responsável fora do sistema.');
        return;
      }
      teacherName = movTeacherNameOutside.trim() + ' (Fora do Sistema)';
    }

    const selectedBoxes = weaponBoxes.filter(b => movSelectedBoxIds.includes(b.id));
    const boxNamesJoined = selectedBoxes.length > 0 ? selectedBoxes.map(b => b.name).join(' + ') : undefined;
    const boxIdsJoined = selectedBoxes.length > 0 ? selectedBoxes.map(b => b.id).join(',') : undefined;

    // Ammo summary & calculation
    const ammoCaliberSummary = movAmmoItems
      .filter(item => item.quantity > 0 || movAmmoItems.length === 1)
      .map(item => {
        const calObj = calibers.find(c => c.id === item.caliberId || c.name === item.caliberId);
        const cName = calObj ? calObj.name : item.caliberId;
        return `${item.quantity}un (${cName})`;
      })
      .join(', ');

    const totalAmmoQuantity = movAmmoItems.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
    const primaryItem = movAmmoItems[0];
    const primaryCalObj = calibers.find(c => c.id === primaryItem?.caliberId || c.name === primaryItem?.caliberId);

    try {
      const res = await storage.darSaidaCurso({
        courseId: selectedClass.courseId || selectedClass.id || 'course-default',
        classId: selectedClass.id,
        className: selectedClass.name,
        turmaCode: selectedClass.code || selectedClass.name,
        courseName: selectedClass.courseName,
        career: selectedClass.career,
        subject: selectedClass.subject,
        lessonPlanId: selectedPlan?.id,
        lessonPlanName: selectedPlan?.name,
        lessonNumber: movLessonNumber,
        teacherName,
        teacherUserId: movRecipientType === 'inside' ? movTeacherUserId : undefined,
        boxId: boxIdsJoined,
        boxName: boxNamesJoined,
        caliberId: primaryCalObj ? primaryCalObj.id : primaryItem?.caliberId,
        ammoCaliber: ammoCaliberSummary || primaryCalObj?.name,
        vaultSpaceId: primaryItem?.vaultSpaceId,
        ammoQuantity: totalAmmoQuantity,
        ammoSupplied: totalAmmoQuantity,
        notes: movNotes.trim(),
        issuedByUserId: currentUser.id,
        issuedByUserName: currentUser.name
      });

      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Saída (Aula CFTP) realizada com sucesso!');
      setShowMovementModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao dar saída (Aula CFTP).');
    }
  };

  const handleOpenRetornoModal = (mov: CourseMovement) => {
    setRetornoMovement(mov);
    const supplied = mov.ammoQuantity || mov.ammoSupplied || 0;
    setRetornoAmmoReturned(supplied); // Default: all returned initially
    setRetornoAmmoUsed(0); // Used = 0 initially

    // Find linked boxes
    const movBoxIds = (mov.boxId || mov.weaponBoxId || '').split(',').map(s => s.trim()).filter(Boolean);
    const matchedBoxes = weaponBoxes.filter(b => 
      movBoxIds.includes(b.id) || (mov.boxName && mov.boxName.toLowerCase().includes(b.name.toLowerCase()))
    );

    const initialIds = matchedBoxes.map(b => b.id);
    setRetornoSelectedBoxIds(initialIds);

    const boxNamesStr = matchedBoxes.map(b => b.name).join(' + ');
    setRetornoMaterials(
      boxNamesStr 
        ? `Caixas devolvidas ao cofre: ${boxNamesStr}` 
        : 'Caixas de armamento e acessórios devolvidos em perfeito estado'
    );
    setRetornoNotes(mov.notes || '');
    setRetornoUserName(mov.teacherName || currentUser.name);
    setShowRetornoModal(true);
  };

  const handleExecuteRetorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retornoMovement) return;

    try {
      const selectedBoxes = weaponBoxes.filter(b => retornoSelectedBoxIds.includes(b.id));
      const returnedBoxNames = selectedBoxes.map(b => b.name);
      let finalMaterials = retornoMaterials.trim();

      if (returnedBoxNames.length > 0 && !finalMaterials.includes(returnedBoxNames[0])) {
        finalMaterials = `Caixas Devolvidas: ${returnedBoxNames.join(', ')}. ${finalMaterials}`;
      }

      const res = await storage.darRetornoCurso(
        retornoMovement.id,
        Number(retornoAmmoReturned) || 0,
        retornoUserName.trim(),
        {
          ammoUsed: Number(retornoAmmoUsed) || 0,
          returnedMaterials: finalMaterials,
          notes: retornoNotes.trim()
        }
      );
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Mapa de aula fechado e devolução efetuada com sucesso!');
      setShowRetornoModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao fechar mapa de aula.');
    }
  };

  // Direct Print PDF function
  const handleDirectPrint = (mov: CourseMovement) => {
    const totalAmmo = mov.ammoQuantity || mov.ammoSupplied || 0;
    const ammoReturned = mov.ammoReturned || 0;
    const ammoUsed = (mov.ammoUsed !== undefined) ? mov.ammoUsed : Math.max(0, totalAmmo - ammoReturned);

    // Build box and weapons detailed list for printed receipt
    const movBoxIds = (mov.boxId || mov.weaponBoxId || '').split(',').map(s => s.trim()).filter(Boolean);
    const matchedBoxes = weaponBoxes.filter(b => 
      movBoxIds.includes(b.id) || (mov.boxName && mov.boxName.toLowerCase().includes(b.name.toLowerCase()))
    );

    let boxesHtml = '';
    if (matchedBoxes.length > 0) {
      boxesHtml = matchedBoxes.map((box) => {
        const boxWeapons = weapons.filter(w => box.weaponIds && box.weaponIds.includes(w.id));
        
        let rows = '';
        if (boxWeapons.length > 0) {
          rows = boxWeapons.map((w, wIdx) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px; text-align: center; font-weight: bold;">${wIdx + 1}</td>
              <td style="padding: 5px; font-weight: bold; color: #1e293b;">${w.type || 'Arma'}</td>
              <td style="padding: 5px;">${w.manufacturer || 'N/I'}</td>
              <td style="padding: 5px;">${w.caliber || 'N/I'}</td>
              <td style="padding: 5px;">${w.model || 'N/I'}</td>
              <td style="padding: 5px; font-family: monospace; font-weight: bold; color: #0f172a;">${w.serialNumber || 'N/I'}</td>
            </tr>
          `).join('');
        } else {
          rows = `
            <tr>
              <td colspan="6" style="padding: 8px; text-align: center; color: #64748b; font-style: italic;">
                Nenhuma arma individual cadastrada nesta caixa.
              </td>
            </tr>
          `;
        }

        return `
          <div style="margin-bottom: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
            <div style="font-weight: 800; font-size: 11px; margin-bottom: 6px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
              📦 Caixa de Armas: ${box.name} (${boxWeapons.length} arma${boxWeapons.length !== 1 ? 's' : ''})
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left; background: #ffffff;">
              <thead>
                <tr style="background: #e2e8f0; font-weight: bold; color: #1e293b; border-bottom: 1px solid #cbd5e1;">
                  <th style="padding: 5px; text-align: center; width: 30px;">#</th>
                  <th style="padding: 5px;">Tipo</th>
                  <th style="padding: 5px;">Marca / Fabricante</th>
                  <th style="padding: 5px;">Calibre</th>
                  <th style="padding: 5px;">Modelo</th>
                  <th style="padding: 5px;">Nº de Série</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
    } else if (mov.boxName) {
      boxesHtml = `
        <div style="padding: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: bold; font-size: 11px;">
          Caixa de Armas / Conjunto: ${mov.boxName}
        </div>
      `;
    } else {
      boxesHtml = `<div style="font-style: italic; color: #64748b;">Sem Caixa de Armas vinculada.</div>`;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Mapa de Aula - ${mov.turmaCode || mov.className} - PCMG</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .full-width { grid-column: span 2; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; margin-top: 6px; }
          .stat-item { background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px; border-radius: 6px; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">ACADEMIA DE POLÍCIA CIVIL • MAPA DE AULA E MOVIMENTAÇÃO DE MATERIAL</div>
          </div>
          <div class="reg-id">
            REGISTRO DE AULA<br>
            <span style="font-size: 15px; font-weight: 900;">#${mov.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>STATUS DO MAPA:</strong> ${(mov.status || 'EM AULA').toUpperCase()}</div>
          <div><strong>Emissão:</strong> ${new Date(mov.issuedAt).toLocaleString('pt-BR')}</div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="box-title">1. Identificação da Aula</div>
            <div class="field"><span class="label">Turma:</span> <span class="val">${mov.turmaCode || mov.className}</span></div>
            <div class="field"><span class="label">Curso / Carreira:</span> <span class="val">${mov.courseName} (${mov.career || 'N/A'})</span></div>
            <div class="field"><span class="label">Disciplina:</span> <span class="val">${mov.subject || 'MEAF'}</span></div>
            <div class="field"><span class="label">Plano de Aula:</span> <span class="val">${mov.lessonPlanName || 'Plano Padrão'} (Aula ${mov.lessonNumber || 1})</span></div>
          </div>

          <div class="box">
            <div class="box-title">2. Pessoal Responsável</div>
            <div class="field"><span class="label">Professor Responsável:</span> <span class="val">${mov.teacherName}</span></div>
            <div class="field"><span class="label">Emitido por (Armeiro):</span> <span class="val">${mov.issuedByUserName || 'Armeiro Responsável'}</span></div>
            ${mov.returnedByUserName ? `<div class="field"><span class="label">Recebido por (Devolução):</span> <span class="val">${mov.returnedByUserName}</span></div>` : ''}
          </div>

          <div class="box full-width">
            <div class="box-title">3. Armamento e Caixas de Armas Fornecidas</div>
            ${boxesHtml}
            ${mov.returnedMaterials ? `<div class="field" style="margin-top: 8px;"><span class="label">Materiais Registrados na Devolução:</span> <span class="val" style="font-size: 11px;">${mov.returnedMaterials}</span></div>` : ''}
          </div>

          ${totalAmmo > 0 ? `
          <div class="box full-width">
            <div class="box-title">4. Balanço de Munições</div>
            <div class="stats-grid">
              <div class="stat-item"><span class="label">Calibre</span><span class="val">${mov.ammoCaliber || 'N/A'}</span></div>
              <div class="stat-item"><span class="label">Fornecida</span><span class="val">${totalAmmo} un</span></div>
              <div class="stat-item"><span class="label">Utilizada</span><span class="val">${mov.status === 'Devolvido' || mov.status === 'Finalizada' ? ammoUsed + ' un' : '-'}</span></div>
              <div class="stat-item"><span class="label">Devolvida ao Cofre</span><span class="val">${mov.status === 'Devolvido' || mov.status === 'Finalizada' ? ammoReturned + ' un' : '-'}</span></div>
            </div>
          </div>
          ` : ''}

          ${mov.notes ? `
          <div class="box full-width">
            <div class="box-title">5. Observações</div>
            <div style="font-size: 11px;">${mov.notes}</div>
          </div>
          ` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${mov.issuedByUserName || 'Armeiro Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Emissor</span>
          </div>
          <div class="sig-line">
            ${mov.teacherName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Professor / Policial Responsável</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria da Polícia Civil em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Edit Mapa handlers
  const handleOpenEditMovModal = (mov: CourseMovement) => {
    setEditingMovement(mov);
    setEditMovTeacherName(mov.teacherName || '');
    setEditMovLessonNumber(mov.lessonNumber || 1);
    setEditMovLessonPlanName(mov.lessonPlanName || '');
    setEditMovAmmoSupplied(mov.ammoSupplied || mov.ammoQuantity || 0);
    setEditMovNotes(mov.notes || '');
    setShowEditMovModal(true);
  };

  const handleExecuteEditMov = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement) return;
    try {
      const res = await storage.updateCourseMovement(editingMovement.id, {
        teacherName: editMovTeacherName.trim(),
        lessonNumber: Number(editMovLessonNumber),
        lessonPlanName: editMovLessonPlanName.trim(),
        ammoSupplied: Number(editMovAmmoSupplied),
        notes: editMovNotes.trim()
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Mapa de aula atualizado com sucesso!');
      setShowEditMovModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar mapa de aula.');
    }
  };

  // Delete handler
  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'course') await storage.deleteAcademyCourse(deleteTarget.id);
      if (deleteTarget.type === 'box') await storage.deleteWeaponBox(deleteTarget.id);
      if (deleteTarget.type === 'class') await storage.deleteCourseClass(deleteTarget.id);
      if (deleteTarget.type === 'plan') await storage.deleteLessonPlan(deleteTarget.id);
      if (deleteTarget.type === 'movement') await storage.deleteCourseMovement(deleteTarget.id);
      setSuccessMsg('Item excluído com sucesso.');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir item.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const prevMonth = () => setCalendarDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCalendarDate(new Date(year, month + 1, 1));

    const toggleDate = (dateStr: string) => {
      setCourseDates(prev =>
        prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort()
      );
    };

    const dayCells = [];
    for (let i = 0; i < firstDay; i++) {
      dayCells.push(<div key={`empty-${i}`} className="p-2" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const fullDate = `${year}-${monthStr}-${dayStr}`;
      const isSelected = courseDates.includes(fullDate);

      dayCells.push(
        <button
          key={fullDate}
          type="button"
          onClick={() => toggleDate(fullDate)}
          className={`p-2 text-xs font-semibold rounded-xl transition-all flex flex-col items-center justify-center border ${
            isSelected
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-md scale-105'
              : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800'
          }`}
        >
          <span>{d}</span>
          {isSelected && <span className="text-[9px] font-bold">✓</span>}
        </button>
      );
    }

    return (
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={prevMonth}
            className="px-2.5 py-1 text-slate-300 hover:text-amber-400 bg-slate-900 rounded-lg border border-slate-800 text-xs font-bold"
          >
            &larr; Mês Anterior
          </button>
          <span className="font-bold text-amber-400 text-sm font-mono uppercase tracking-wider">
            {monthNames[month]} / {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="px-2.5 py-1 text-slate-300 hover:text-amber-400 bg-slate-900 rounded-lg border border-slate-800 text-xs font-bold"
          >
            Próximo Mês &rarr;
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span>Dom</span>
          <span>Seg</span>
          <span>Ter</span>
          <span>Qua</span>
          <span>Qui</span>
          <span>Sex</span>
          <span>Sáb</span>
        </div>

        <div className="grid grid-cols-7 gap-1">{dayCells}</div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
          <span className="text-slate-400 font-mono">
            Datas Selecionadas: <strong className="text-amber-400 font-extrabold">{courseDates.length} dia(s)</strong>
          </span>
          {courseDates.length > 0 && (
            <button
              type="button"
              onClick={() => setCourseDates([])}
              className="text-red-400 hover:underline text-[10px] font-semibold"
            >
              Limpar Seleção
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {courseTypeFilterProp === 'Ensino Continuado'
                ? 'Módulo de Ensino Continuado'
                : (courseTypeFilterProp === 'Formação' ? 'Curso de Formação' : 'Academia de Polícia Civil • Gestão de Cursos e Aulas')}
            </h1>
            <p className="text-xs text-slate-400">
              {courseTypeFilterProp === 'Ensino Continuado'
                ? 'Administre todos os Cursos de Ensino Continuado, especializações e aperfeiçoamento da Polícia Civil.'
                : (courseTypeFilterProp === 'Formação'
                  ? 'Módulo exclusivo para consulta de cursos, turmas e dados de formação policial.'
                  : 'Controle de turmas, caixas de armamento para instruções, saídas e mapas de aula com balanço de munições')}
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'movements'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Mapas de Aula ({filteredMovements.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('turmas')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'turmas'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Turmas ({filteredClasses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('cursos')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'cursos'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Cursos ({sortedUnifiedCourses.length})</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-200">×</button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: MOVIMENTAÇÕES DE AULA (MAPA DE AULA - SAÍDA E DEVOLUÇÃO)           */}
      {/* ========================================================================= */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Saídas e Retornos (Aula CFTP)</h2>
              <p className="text-xs text-slate-400">
                Lançamento de saídas de armamentos e munições para instrução prática (Aula CFTP) com retorno de insumos não utilizados
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleOpenSaidaModal}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Saída (Aula CFTP)</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Turma / Curso</th>
                    <th className="py-3 px-4">Carreira / Matéria</th>
                    <th className="py-3 px-4">Professor / Retirada</th>
                    <th className="py-3 px-4">Material Fornecido</th>
                    <th className="py-3 px-4">Munições (Fornecido/Devolvido)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        Nenhuma movimentação de aula registrada.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const isEmAula = (mov.status === 'Em Sala de Aula' || mov.status === 'Em Aula') && !mov.returnedAt;
                      const ammoSuppliedVal = Number(mov.ammoQuantity || mov.ammoSupplied) || 0;
                      const ammoRet = Number(mov.ammoReturned) || 0;
                      const ammoUsed = isEmAula ? 0 : Math.max(0, ammoSuppliedVal - ammoRet);

                      return (
                        <tr key={mov.id} className="hover:bg-slate-800/50 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-100 text-xs">
                              Turma {mov.className || mov.turmaCode} {mov.courseName ? `- ${mov.courseName}` : ''}
                            </div>
                            <div className="text-[11px] text-amber-400 font-medium">Curso: {mov.courseName || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">Carreira: {mov.career || 'N/A'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Matéria: {mov.subject || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-100 text-xs flex items-center space-x-1">
                              <span className="text-emerald-400 font-extrabold">Prof.</span>
                              <span className="text-emerald-300 font-bold">{mov.teacherName}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">Emissor: {mov.issuedByUserName}</div>
                          </td>
                          <td className="py-3 px-4">
                            {(() => {
                              const targetBoxId = mov.weaponBoxId || mov.boxId;
                              const matchedBox = weaponBoxes.find(b => b.id === targetBoxId);
                              const resolvedBoxName = mov.boxName || mov.weaponBoxName || matchedBox?.name;
                              return resolvedBoxName ? (
                                <div className="text-slate-200 font-mono text-[11px] font-semibold">
                                  {resolvedBoxName}
                                </div>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">Sem caixa de armas</span>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {ammoSuppliedVal > 0 ? (
                              <div className="space-y-0.5">
                                <div className="text-slate-100 font-bold text-[11px]">{mov.ammoCaliber || 'Calibre N/I'}</div>
                                <div className="text-[10px] text-amber-300">
                                  Entregue: <strong className="text-amber-400 font-mono">{ammoSuppliedVal} un</strong>
                                </div>
                                <div className="text-[10px] text-emerald-400">
                                  Devolvido: <strong className="font-mono">{ammoRet} un</strong>
                                </div>
                                <div className="text-[10px] text-sky-400">
                                  Utilizadas: <strong className="font-mono">{ammoUsed} un</strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Sem munição</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <span className="text-slate-300 font-medium text-xs">
                                {mov.status}
                              </span>
                              {isEmAula && (
                                <button
                                  onClick={() => handleOpenRetornoModal(mov)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shadow transition flex items-center space-x-1 cursor-pointer"
                                  title="Clique para realizar a devolução das caixas e munições"
                                >
                                  <span>Devolução</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => handleDirectPrint(mov)}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                title="Imprimir PDF / Documento do Mapa de Aula"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenEditMovModal(mov)}
                                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
                                title="Editar Mapa de Aula"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget({ id: mov.id, type: 'movement', name: `Mapa de Aula ${mov.turmaCode || mov.className} (Aula ${mov.lessonNumber || 1})` })}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                                title="Excluir Mapa de Aula"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}



      {/* ========================================================================= */}
      {/* TAB 2: TURMAS (CLASSES)                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'turmas' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Turmas da Academia de Polícia</h2>
              <p className="text-xs text-slate-400">
                Cadastro de turmas vinculadas a cursos, carreiras policiais, professores e disciplinas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const mobileUrl = `${window.location.origin}/?mode=mobile-class`;
                  navigator.clipboard.writeText(mobileUrl);
                  alert(`Link de acesso exclusivo para Celular copiado com sucesso!\n\n${mobileUrl}\n\nEnvie aos instrutores no estande.`);
                }}
                className="bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Copiar link de acesso direto do celular para instrutores no estande"
              >
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <span>📱 Link Celular Estande</span>
              </button>

              {availableCalendarTurmas.length > 0 && (
                <button
                  onClick={() => {
                    const existingCodes = new Set(courseClasses.map(c => {
                      const abbr = c.careerAbbreviation || getCareerAbbr(c.career);
                      const num = (c.turmaNumber || '01').padStart(2, '0').slice(-2);
                      return `${abbr} ${num}`;
                    }));

                    const uncreated = availableCalendarTurmas.filter(t => !existingCodes.has(t));
                    if (uncreated.length === 0) {
                      handleOpenClassModal(null, 'Formação', availableCalendarTurmas[0]);
                    } else {
                      handleOpenClassModal(null, 'Formação', uncreated[0]);
                    }
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border border-amber-500/50 text-amber-300 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                  title="Criar Turma a partir das turmas do Horário/Calendário de Aulas (turma_calendario)"
                >
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>Importar do Calendário</span>
                </button>
              )}

              <button
                onClick={() => handleOpenClassModal(undefined, 'Formação')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Turma</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClasses.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 italic text-xs">
                Nenhuma turma cadastrada.
              </div>
            ) : (
              filteredClasses.map((cls) => {
                const isExpanded = !!expandedClasses[cls.id];
                const linkedCourse = academyCourses.find(c => c.id === cls.courseId || c.name === cls.courseName);
                const classCodeStr = cls.code || `${cls.careerAbbreviation || getCareerAbbr(cls.career)}-${cls.turmaNumber || '01'}`;

                return (
                  <div key={cls.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 relative hover:border-slate-700 transition shadow-sm">
                    {/* Header: Class Code & Actions (Alunos, Editar, Excluir) */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 flex-wrap gap-2">
                      <span className="bg-amber-500/20 border border-amber-500/40 text-amber-400 font-extrabold text-xs px-3 py-1 rounded-lg uppercase font-mono">
                        CÓDIGO: {classCodeStr}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenStudentsModal(cls)}
                          title="Gerenciar Alunos da Turma"
                          className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 rounded-lg transition font-semibold"
                        >
                          <Users className="w-3.5 h-3.5 text-amber-400" />
                          <span>Alunos ({cls.studentCount || 0})</span>
                        </button>

                        <button
                          onClick={() => handleOpenClassModal(cls)}
                          title="Editar Turma"
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-700"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget({ type: 'class', id: cls.id, name: cls.name })}
                          title="Excluir Turma"
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Toggle Button for Details */}
                    <div className="pt-0.5">
                      <button
                        onClick={() => toggleClassDetails(cls.id)}
                        className="w-full text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center justify-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
                      </button>
                    </div>

                    {/* Expanded Details Section */}
                    {isExpanded && (
                      <div className="space-y-3 pt-2.5 border-t border-slate-800/80 animate-fadeIn">
                        <div>
                          <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                            <span>Turma {classCodeStr}</span>
                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700 uppercase font-sans">
                              Carreira: {cls.career}
                            </span>
                          </h3>
                          <div className="text-xs font-mono text-slate-300 mt-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold font-sans">Curso Vinculado:</span>
                            <span className="text-amber-400 font-bold text-xs">
                              Código: {linkedCourse?.code || 'S/ CÓDIGO'}
                            </span>
                            {linkedCourse?.name && (
                              <span className="text-slate-300 text-[11px] block mt-0.5">
                                ({linkedCourse.name})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-300 font-mono bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-sans">Professor:</span>
                            <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                              Prof. {getTeacherDisplayName(cls)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-sans">Disciplina:</span>
                            <span className="text-amber-400 font-bold">{cls.subject}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-sans">Plano de Aula:</span>
                            <span className={`font-bold truncate max-w-[170px] ${getLessonPlanDisplayName(cls) !== 'Nenhum vinculado' ? 'text-amber-400' : 'text-slate-500 italic'}`} title={getLessonPlanDisplayName(cls)}>
                              {getLessonPlanDisplayName(cls)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-sans">Alunos na Turma:</span>
                            <span className="text-slate-100 font-bold">{cls.studentCount} alunos</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CURSOS DA ACADEMIA                                                */}
      {/* ========================================================================= */}
      {activeTab === 'cursos' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Catálogo e Gerenciamento de Cursos</h2>
              <p className="text-xs text-slate-400">
                Gestão de Cursos de Formação e Ensino Continuado
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(!courseTypeFilterProp || courseTypeFilterProp === 'Formação') && (
                <button
                  onClick={() => handleOpenCourseModal('Formação')}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Curso Formação</span>
                </button>
              )}
              {(!courseTypeFilterProp || courseTypeFilterProp === 'Ensino Continuado') && (
                <button
                  onClick={() => handleOpenCourseModal('Ensino Continuado')}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Curso Ensino Continuado</span>
                </button>
              )}
            </div>
          </div>

          {/* BARRA DE FILTROS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>Filtro de Cursos</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                Exibindo <strong>{filteredUnifiedCourses.length}</strong> de <strong>{allUnifiedCourses.length}</strong> cursos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Pesquisa por Nome */}
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Nome do Curso / Modelo / Arma
                </label>
                <input
                  type="text"
                  value={courseSearchName}
                  onChange={(e) => setCourseSearchName(e.target.value)}
                  placeholder="Buscar por nome do curso..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Departamento */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Departamento
                </label>
                <select
                  value={courseDeptFilter}
                  onChange={(e) => setCourseDeptFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                >
                  <option value="TODOS">Todos os Deptos</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Curso */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Tipo de Curso
                </label>
                <select
                  value={courseTypeFilter}
                  onChange={(e) => setCourseTypeFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                >
                  <option value="TODOS">Todos os Tipos</option>
                  <option value="Formação">Formação</option>
                  <option value="Ensino Continuado">Ensino Continuado</option>
                </select>
              </div>

              {/* Mês / Ano */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Mês / Ano
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <select
                    value={courseMonthFilter}
                    onChange={(e) => setCourseMonthFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-[11px] text-slate-100"
                  >
                    <option value="TODOS">Mês</option>
                    <option value="01">Jan</option>
                    <option value="02">Fev</option>
                    <option value="03">Mar</option>
                    <option value="04">Abr</option>
                    <option value="05">Mai</option>
                    <option value="06">Jun</option>
                    <option value="07">Jul</option>
                    <option value="08">Ago</option>
                    <option value="09">Set</option>
                    <option value="10">Out</option>
                    <option value="11">Nov</option>
                    <option value="12">Dez</option>
                  </select>
                  <select
                    value={courseYearFilter}
                    onChange={(e) => setCourseYearFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-[11px] text-slate-100"
                  >
                    <option value="TODOS">Ano</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2027">2027</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>

              {/* Status de Data (Padrão: Futuros / Não Ocorridos) */}
              <div>
                <label className="block text-[10px] font-semibold text-amber-400 uppercase mb-1">
                  Status de Realização
                </label>
                <select
                  value={courseDateStatusFilter}
                  onChange={(e) => setCourseDateStatusFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-semibold"
                >
                  <option value="futuros">Futuros / Não Ocorridos (Padrão)</option>
                  <option value="todos">Todos os Cursos</option>
                  <option value="passados">Cursos Concluídos / Passados</option>
                </select>
              </div>
            </div>
          </div>

          {/* TABELA DE CURSOS UNIFICADA */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Nome do Curso</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Armamento / Modelos / Tiros</th>
                    <th className="py-3 px-4">Local do Curso / Datas</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sortedUnifiedCourses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                        Nenhum curso encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    sortedUnifiedCourses.map((crs) => (
                      <tr key={crs.id} className="hover:bg-slate-800/50 transition">
                        <td className="py-3 px-4 font-bold text-slate-100">{crs.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                              crs.type === 'Formação'
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : crs.type === 'Ensino Continuado'
                                ? 'bg-blue-950 text-blue-300 border-blue-800'
                                : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            }`}
                          >
                            {crs.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {crs.isQualification ? (
                            <div className="space-y-1">
                              {crs.allowedWeaponTypes.length > 0 && (
                                <div className="text-[11px] text-amber-400 font-semibold">
                                  Tipos: {crs.allowedWeaponTypes.join(', ')}
                                </div>
                              )}
                              {crs.allowedModels.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {crs.allowedModels.map(m => (
                                    <span key={m} className="bg-slate-950 text-slate-300 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {crs.shotsPerWeaponType && Object.keys(crs.shotsPerWeaponType).length > 0 ? (
                                <div className="text-[10px] text-slate-400 space-y-0.5 pt-0.5">
                                  {Object.entries(crs.shotsPerWeaponType).map(([type, shots]) => (
                                    <div key={type} className="flex items-center space-x-1">
                                      <span className="text-slate-300 font-medium">{type}:</span>
                                      <span className="text-amber-400 font-bold font-mono">{shots} tiros</span>
                                    </div>
                                  ))}
                                  {Object.keys(crs.shotsPerWeaponType).length > 1 && (
                                    <div className="text-[9px] text-slate-500 font-mono">
                                      Total: {crs.shotsPerStudent} tiros/aluno
                                    </div>
                                  )}
                                </div>
                              ) : (
                                crs.shotsPerStudent > 0 && (
                                  <div className="text-[10px] text-slate-400">
                                    Tiros/Aluno: <strong className="text-amber-400">{crs.shotsPerStudent}</strong>
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic font-mono">{crs.code}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                              <span className="text-[10px] text-amber-400 font-bold uppercase">Local:</span>
                              <span className="text-slate-100 font-bold">{crs.type === 'Formação' ? 'ACADEPOL' : (crs.locationDepartmentName || crs.departmentName || 'ACADEPOL')}</span>
                            </div>
                            {crs.type === 'Ensino Continuado' && crs.teachingDepartmentName && (
                              <div className="text-[10px] text-slate-400">
                                Ministrante: <span className="text-slate-300 font-medium">{crs.teachingDepartmentName}</span>
                              </div>
                            )}
                            {crs.type === 'Ensino Continuado' && crs.subject && (
                              <div className="text-[10px] text-slate-400">
                                Matéria: <span className="text-amber-300 font-semibold">{crs.subject}</span>
                              </div>
                            )}
                            {crs.dates && crs.dates.length > 0 ? (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {crs.dates.map(d => (
                                  <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                                    d >= todayStr
                                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                                      : 'bg-slate-950 text-slate-500 border-slate-800'
                                  }`}>
                                    {d.split('-').reverse().join('/')}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[10px]">Sem restrição de data</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                if (crs.isQualification && crs.rawQual) {
                                  handleOpenQualCourseModal(crs.rawQual);
                                } else if (crs.rawAcademy) {
                                  handleOpenCourseModal(crs.rawAcademy);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                              title="Editar Curso"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {canDeleteCourse ? (
                              <button
                                onClick={() => {
                                  if (crs.isQualification) {
                                    handleDeleteQualCourse(crs.id, crs.name);
                                  } else {
                                    setDeleteTarget({ type: 'course', id: crs.id, name: crs.name });
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                                title="Excluir Curso (Perfil Geral)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span
                                className="p-1.5 text-slate-600 cursor-not-allowed"
                                title="Apenas usuários do perfil Geral podem excluir cursos"
                              >
                                <Trash2 className="w-4 h-4 opacity-30" />
                              </span>
                            )}
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

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* 1. Modal Course Edit/Add */}
      {showCourseModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <span>
                  {editingCourse
                    ? `Editar Curso (${courseType})`
                    : `Novo Curso de ${courseType}`}
                </span>
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                courseType === 'Formação'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : 'bg-blue-950 text-blue-300 border-blue-800'
              }`}>
                {courseType}
              </span>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-4 text-xs">
              {/* NOME DO CURSO */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome do Curso <span className="text-red-400">*</span>
                </label>
                {courseType === 'Ensino Continuado' ? (
                  <div>
                    <input
                      type="text"
                      list="ecCoursesList"
                      value={courseName}
                      onChange={(e) => handleEnsinoContinuadoNameChange(e.target.value)}
                      placeholder="Ex: Operador de Fuzil / Táticas Especiais"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                      required
                    />
                    <datalist id="ecCoursesList">
                      {qualCourses.map((qc) => (
                        <option key={qc.id} value={qc.name} />
                      ))}
                      {ACADEPOL_CATALOG.map((c) => (
                        <option key={c.code} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="Ex: Curso de Formação de Policiais Civis"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>

              {/* MÓDULO EM NUMERAÇÃO ROMANA (Apenas para Formação) */}
              {courseType === 'Formação' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Módulo do Curso (Numeração Romana 1 a 10) <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={courseModuleRoman}
                    onChange={(e) => handleModuleRomanChange(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 text-amber-300 font-bold rounded-xl px-3.5 py-2 focus:border-amber-400 focus:outline-none"
                    required
                  >
                    {ROMAN_NUMERALS.map((rom) => (
                      <option key={rom} value={rom}>
                        Módulo {rom}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* CÓDIGO DO CURSO */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Código do Curso <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">Seleção / Auto</span>
                </label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                  placeholder="Ex: CFTP - Módulo I ou EC-TPE-2026"
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2 text-amber-400 font-mono font-extrabold tracking-wider focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>

              {/* FORM FIELDS ESPECÍFICOS DE ENSINO CONTINUADO */}
              {courseType === 'Ensino Continuado' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* DEPARTAMENTO QUE IRÁ MINISTRAR O CURSO */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Departamento que irá ministrar o curso <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={courseTeachingDept}
                        onChange={(e) => setCourseTeachingDept(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                        required
                      >
                        <option value="ACADEPOL">ACADEPOL</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* DEPARTAMENTO QUE IRÁ ACONTECER O CURSO */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Departamento onde irá acontecer <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={courseLocationDept}
                        onChange={(e) => setCourseLocationDept(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                        required
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                        <option value="ACADEPOL">ACADEPOL</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* QUANTIDADE DE DIAS DO CURSO */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Quantidade de dias do curso <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={courseDurationDays}
                        onChange={(e) => setCourseDurationDays(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono font-bold focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>

                    {/* MATÉRIA DO CURSO (MEAF, TAP e DP) */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Matéria do Curso <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={courseSubject}
                        onChange={(e) => setCourseSubject(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-500/50 text-amber-300 font-bold rounded-xl px-3.5 py-2 focus:border-amber-400 focus:outline-none"
                        required
                      >
                        <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                        <option value="TAP">TAP (Tecnicas de Ações Policiais)</option>
                        <option value="DP">DP (Defesa Pessoal)</option>
                      </select>
                    </div>
                  </div>

                  {/* SELEÇÃO DAS DATAS DO CURSO */}
                  <div className="pt-2">
                    <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                      <span>Seleção das Datas do Curso (Calendário) <span className="text-red-400">*</span></span>
                      <span className="text-amber-400 font-bold font-mono text-[10px]">
                        {courseDates.length} dia(s) selecionado(s)
                      </span>
                    </label>
                    {renderCalendar()}
                  </div>
                </>
              ) : (
                /* FORM FIELDS ESPECÍFICOS DE FORMAÇÃO */
                <>
                  {/* DEPARTAMENTO DO CURSO */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Departamento do curso <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={courseDepartment || 'ACADEPOL'}
                      onChange={(e) => setCourseDepartment(e.target.value)}
                      placeholder="ACADEPOL"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-bold rounded-xl px-3.5 py-2 focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  {/* DATAS DE INÍCIO E FIM DO CURSO */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Data de Início do Curso <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={courseStartDate}
                        onChange={(e) => setCourseStartDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Data Final do Curso <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={courseEndDate}
                        min={courseStartDate}
                        onChange={(e) => setCourseEndDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400 transition"
                >
                  Salvar Curso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Box Edit/Add */}
      {showBoxModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2">
              {editingBox ? 'Editar Caixa de Armas' : 'Nova Caixa de Armas'}
            </h3>
            <form onSubmit={handleSaveBox} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Identificação / Nome da Caixa</label>
                <input
                  type="text"
                  value={boxName}
                  onChange={(e) => setBoxName(e.target.value)}
                  placeholder="Ex: Caixa 01 - Pistolas 9mm (10 armas)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descrição</label>
                <input
                  type="text"
                  value={boxDesc}
                  onChange={(e) => setBoxDesc(e.target.value)}
                  placeholder="Ex: Caixa plástica reforçada verde contendo pistolas Glock"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Selecione as Armas na Caixa ({selectedBoxWeaponIds.length} selecionadas)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 bg-slate-950 border border-slate-800 p-2 rounded-xl">
                  {(() => {
                    const otherBoxesWeaponIds = weaponBoxes
                      .filter(b => !editingBox || b.id !== editingBox.id)
                      .flatMap(b => b.weaponIds || []);
                    const unboxedWeapons = weapons.filter(w => !otherBoxesWeaponIds.includes(w.id));

                    if (unboxedWeapons.length === 0) {
                      return <div className="text-slate-500 italic text-center p-2 text-xs">Nenhuma arma disponível ou sem vínculo com outra caixa.</div>;
                    }

                    return unboxedWeapons.map((w) => {
                      const isChecked = selectedBoxWeaponIds.includes(w.id);
                      return (
                        <label key={w.id} className="flex items-center space-x-2 p-1.5 hover:bg-slate-900 rounded cursor-pointer font-mono text-[11px]">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBoxWeaponIds([...selectedBoxWeaponIds, w.id]);
                              } else {
                                setSelectedBoxWeaponIds(selectedBoxWeaponIds.filter(id => id !== w.id));
                              }
                            }}
                            className="rounded text-amber-500 focus:ring-0"
                          />
                          <span className="text-slate-200 font-bold">{w.type} {w.manufacturer ? `• ${w.manufacturer}` : ''} {w.model}</span>
                          <span className="text-amber-400">Nº {w.serialNumber}</span>
                          <span className="text-slate-500 text-[10px]">({w.caliber})</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBoxModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Replace Weapon in Box */}
      {showReplaceModal && replaceBox && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center space-x-2 text-amber-400">
              <RefreshCw className="w-5 h-5" />
              <span>Substituição de Arma na Caixa {replaceBox.name}</span>
            </h3>
            <form onSubmit={handleExecuteReplace} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Arma a ser Removida (Defeituosa)</label>
                <select
                  value={oldWeaponId}
                  onChange={(e) => setOldWeaponId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs"
                  required
                >
                  {replaceBox.weaponIds.map(wId => {
                    const w = weapons.find(item => item.id === wId);
                    const brand = w?.brand || w?.manufacturer || 'N/A';
                    const model = w?.model || 'N/A';
                    const serial = w?.serialNumber || 'N/A';
                    return (
                      <option key={wId} value={wId}>
                        MARCA: {brand} | MODELO: {model} | N/S: {serial}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nova Arma de Reposição</label>
                <select
                  value={newWeaponId}
                  onChange={(e) => setNewWeaponId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs"
                  required
                >
                  <option value="">-- Selecione uma arma disponível --</option>
                  {availableWeapons.map(w => {
                    const brand = w.brand || w.manufacturer || 'N/A';
                    return (
                      <option key={w.id} value={w.id}>
                        MARCA: {brand} | MODELO: {w.model} | N/S: {w.serialNumber}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Motivo da Substituição <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="Ex: Falha na percussão durante disparo em aula"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome do Responsável pela Troca <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={replaceResponsibleName}
                  onChange={(e) => setReplaceResponsibleName(e.target.value)}
                  placeholder="Ex: Nome do Armeiro / Policial Responsável"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">Pode ser qualquer usuário responsável pela troca da arma na caixa.</p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Professor da Aula (Opcional)</label>
                <input
                  type="text"
                  value={replaceTeacherName}
                  onChange={(e) => setReplaceTeacherName(e.target.value)}
                  placeholder="Ex: Inspetor Carlos"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl"
                >
                  Confirmar Substituição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3.5 Modal Lesson Plan Edit/Add */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center space-x-2 text-amber-400">
              <ClipboardList className="w-5 h-5" />
              <span>{editingPlan ? 'Editar Plano de Aula' : 'Novo Plano de Aula'}</span>
            </h3>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>Turma Referenciada (Código)</span>
                    <span className="text-[10px] text-amber-400 font-bold">Identificação Oficial</span>
                  </label>
                  <select
                    value={planTurmaCode}
                    onChange={(e) => {
                      const selCode = e.target.value;
                      setPlanTurmaCode(selCode);
                      const found = courseClasses.find(c => (c.code || c.name) === selCode);
                      if (found && found.career) {
                        setPlanCareer(found.career);
                      }
                    }}
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2 text-amber-400 font-mono font-extrabold text-xs"
                  >
                    <option value="">-- Nenhuma (Plano Geral) --</option>
                    {courseClasses.map(c => (
                      <option key={c.id} value={c.code || c.name}>
                        [{c.code || c.name}] • Prof: {c.teacherName} ({c.subject})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-slate-300 font-semibold mb-1">Nome do Plano de Aula</label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Ex: Plano Tiro Defensivo - Formação Delegados 2026"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Carreira</label>
                  <select
                    value={planCareer}
                    onChange={(e) => setPlanCareer(e.target.value as AcademyCareer)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                  >
                    <option value="Delegado">DELEGADO</option>
                    <option value="Investigador">INVESTIGADOR</option>
                    <option value="Escrivão">ESCRIVÃO</option>
                    <option value="Perito">PERITO</option>
                    <option value="Médico Legista">MÉDICO LEGISTA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Ano do Plano</label>
                  <input
                    type="number"
                    value={planYear}
                    onChange={(e) => setPlanYear(Number(e.target.value))}
                    min={2000}
                    max={2099}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tipo do Plano de Aula</label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                  >
                    <option value="curso de formação">curso de formação</option>
                    <option value="curso ensino continuado">curso ensino continuado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Quantidade de Aulas</label>
                  <input
                    type="number"
                    value={planLessonCount}
                    onChange={(e) => handlePlanLessonCountChange(Number(e.target.value))}
                    min={1}
                    max={30}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono font-bold text-amber-400"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Lesson Config Grid */}
              <div className="border border-slate-800 rounded-xl p-4 space-y-3 bg-slate-950/50">
                <label className="block text-amber-400 font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Configuração de Munição por Aula ({planLessonCount} Aulas)</span>
                  <span className="text-slate-500 font-normal">Defina tiros/aluno, calibre e insumo do professor</span>
                </label>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {planLessonsData.map((item, index) => (
                    <div key={index} className="bg-slate-900 border border-slate-800 p-3 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <div className="font-bold text-slate-100 text-xs">
                        Aula {item.lessonNumber}
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Tiros por Aluno</label>
                        <input
                          type="number"
                          value={item.shotsPerStudent}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setPlanLessonsData(prev => {
                              const copy = [...prev];
                              copy[index] = { ...copy[index], shotsPerStudent: val };
                              return copy;
                            });
                          }}
                          min={0}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono font-bold text-amber-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Calibre</label>
                        <select
                          value={item.caliberName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlanLessonsData(prev => {
                              const copy = [...prev];
                              copy[index] = { ...copy[index], caliberName: val };
                              return copy;
                            });
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-[11px]"
                        >
                          <option value="9x19mm">9x19mm</option>
                          <option value=".40 S&W">.40 S&W</option>
                          <option value="5,56x45mm">5,56x45mm</option>
                          <option value=".12">.12</option>
                          <option value=".38 SPL">.38 SPL</option>
                          <option value=".380 ACP">.380 ACP</option>
                          {ammoStocks.map(s => (
                            <option key={s.id} value={s.caliber}>{s.caliber}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-1 sm:col-span-3 pt-1 border-t border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Munições adicionais para Professor:</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            value={item.instructorShots}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPlanLessonsData(prev => {
                                const copy = [...prev];
                                copy[index] = { ...copy[index], instructorShots: val };
                                return copy;
                              });
                            }}
                            min={0}
                            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-100 font-mono font-bold text-emerald-400 text-right"
                          />
                          <span className="text-slate-400 font-mono">un</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow"
                >
                  Salvar Plano de Aula
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Class Edit/Add */}
      {showClassModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2">
              {editingClass ? `Editar Turma (${classModalCourseType})` : `Nova Turma - ${classModalCourseType}`}
            </h3>
            <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Curso Vinculado <span className="text-amber-400 font-mono">({classModalCourseType})</span>
                </label>
                <select
                  value={classCourseId}
                  onChange={(e) => setClassCourseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione o Curso de {classModalCourseType} --</option>
                  {academyCourses
                    .filter(c => c.type === classModalCourseType)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                {academyCourses.filter(c => c.type === classModalCourseType).length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    Nenhum curso do tipo "{classModalCourseType}" cadastrado. Crie um curso de {classModalCourseType} no catálogo.
                  </p>
                )}

                {/* Exibição de Dados Herdados para a Turma */}
                {(() => {
                  const acadC = academyCourses.find(c => c.id === classCourseId);
                  if (!acadC) return null;

                  return (
                    <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/30 text-xs space-y-1.5 mt-2">
                      <div className="text-amber-400 font-sans font-bold flex items-center justify-between border-b border-slate-800 pb-1">
                        <span>Dados do Curso Vinculado</span>
                        <span className="text-[10px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-mono">
                          {acadC.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-slate-400 font-sans">Tipo do Curso:</span>
                        <span className="text-slate-200 font-semibold">{acadC.type}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans">Código do Curso:</span>
                        <span className="text-amber-400 font-mono">{acadC.code || 'N/A'}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Relacionar com turma_calendario da tabela calendario_aulas */}
              {classModalCourseType === 'Formação' && (
                <div className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-3 space-y-2">
                  <label className="block text-amber-400 font-bold text-xs flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Relacionar com Turma do Calendário de Aulas (turma_calendario)</span>
                  </label>
                  <select
                    value={selectedCalendarTurma}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCalendarTurma(val);
                      if (val) {
                        const parsed = parseTurmaCalendarCode(val);
                        setClassCareer(parsed.career);
                        setClassTurmaNum(parsed.turmaNumber);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-medium text-xs focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">-- Selecione uma Turma do Calendário de Aulas --</option>
                    {availableCalendarTurmas.map(tCode => {
                      const count = calendarRecords.filter(r => formatTurmaCode(r.turma_calendario) === tCode).length;
                      return (
                        <option key={tCode} value={tCode}>
                          Turma {tCode} ({count} aula{count === 1 ? '' : 's'} no horário/calendário)
                        </option>
                      );
                    })}
                  </select>
                  {availableCalendarTurmas.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">
                      Nenhuma turma encontrada no Calendário de Aulas. Crie aulas no Módulo Calendário.
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      Ao selecionar a turma do calendário, a carreira e o número da turma serão preenchidos automaticamente.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Carreira Policial</label>
                <select
                  value={classCareer}
                  onChange={(e) => setClassCareer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                >
                  <option value="Delegado">DELEGADO (DL)</option>
                  <option value="Investigador">INVESTIGADOR (IP)</option>
                  <option value="Escrivão">ESCRIVÃO (EP)</option>
                  <option value="Perito">PERITO (PC)</option>
                  <option value="Médico Legista">MÉDICO LEGISTA (ML)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Número Identificador da Turma (2 Dígitos)</span>
                  <span className="text-amber-400 font-bold text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-mono">
                    Código Final: {getCareerAbbr(classCareer)} {classTurmaNum.padStart(2, '0').slice(-2)}
                  </span>
                </label>
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-bold text-slate-300 font-mono bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                    {getCareerAbbr(classCareer)}
                  </span>
                  <input
                    type="text"
                    maxLength={2}
                    value={classTurmaNum}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setClassTurmaNum(val);
                    }}
                    placeholder="01"
                    className="w-24 bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2 text-amber-400 font-mono font-extrabold text-base text-center tracking-widest focus:border-amber-400 focus:outline-none"
                    required
                  />
                  <span className="text-xs text-slate-400">Ex: 01, 02, 03</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Não é possível salvar duas turmas com o mesmo número na mesma carreira e curso.
                </p>
              </div>

              {/* 1. Matéria Leccionada (Selecionada Primeiro) */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Matéria Leccionada</label>
                <select
                  value={classSubject}
                  onChange={(e) => {
                    const newSub = e.target.value as 'MEAF' | 'TAP' | 'DP';
                    setClassSubject(newSub);
                    const matching = teachers.filter(t => t.teacherSubject === newSub);
                    if (matching.length > 0) {
                      if (!matching.some(t => t.id === classTeacherId)) {
                        setClassTeacherId(matching[0].id);
                        setClassTeacherName(matching[0].name);
                      }
                    } else {
                      setClassTeacherId('');
                      setClassTeacherName('');
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                >
                  <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                  <option value="TAP">TAP (Técnicas de Ações Policiais)</option>
                  <option value="DP">DP (Defesa Pessoal)</option>
                </select>
              </div>

              {/* 2. Professor Titular */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Professor Titular</span>
                  <span className="text-[10px] text-amber-400 font-normal">
                    Filtro ativo: {classSubject}
                  </span>
                </label>
                <select
                  value={classTeacherId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setClassTeacherId(selectedId);
                    const found = teachers.find(t => t.id === selectedId);
                    if (found) {
                      setClassTeacherName(found.name);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione o Professor ({classSubject}) --</option>
                  {(teachers.filter(t => t.teacherSubject === classSubject).length > 0
                    ? teachers.filter(t => t.teacherSubject === classSubject)
                    : teachers
                  ).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (MASP: {formatMasp(t.masp)}) {t.teacherSubject ? `• ${t.teacherSubject}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <label className="block text-slate-300 font-semibold text-xs">Quantidade de Alunos</label>
                <p className="text-[11px] text-amber-400/90 font-medium leading-relaxed">
                  Calculada automaticamente conforme os alunos cadastrados na turma (botão <strong>Alunos</strong>).
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Plano de Aula Vinculado</span>
                  <span className="text-[10px] text-amber-400 font-normal">
                    Selecione o plano
                  </span>
                </label>
                <select
                  value={classLessonPlanId}
                  onChange={(e) => setClassLessonPlanId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-medium"
                >
                  <option value="">-- Selecione o Plano de Aula Vinculado (Opcional) --</option>
                  {lessonPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.career} • {plan.lessonCount} Aulas)
                    </option>
                  ))}
                </select>
                {classLessonPlanId && (() => {
                  const p = lessonPlans.find(item => item.id === classLessonPlanId);
                  if (!p) return null;
                  return (
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-amber-500/30 text-[11px] space-y-1 mt-1.5">
                      <div className="text-amber-400 font-bold flex items-center justify-between">
                        <span className="truncate max-w-[240px]">Plano: {p.name}</span>
                        <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-[10px] font-mono shrink-0">
                          {p.lessonCount} Aulas
                        </span>
                      </div>
                      <div className="text-slate-400 flex items-center space-x-2 text-[10px]">
                        <span>Carreira: <strong className="text-slate-200">{p.career}</strong></span>
                        <span>•</span>
                        <span>Tipo: <strong className="text-slate-200">{p.type}</strong></span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl"
                >
                  Salvar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.5 Modal Alunos da Turma */}
      {selectedStudentsClass && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-4xl shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-amber-400">
                <Users className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-100">
                  Gestão de Alunos da Turma - <span className="text-amber-400">{selectedStudentsClass.code || selectedStudentsClass.name}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentsClass(null);
                  setEditingStudent(null);
                  setTransferTargetStudent(null);
                  setSelectedStudentForLessons(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Header info card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Código da Turma</span>
                <span className="font-bold text-amber-400 font-mono text-sm">{selectedStudentsClass.code || selectedStudentsClass.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Código do Curso</span>
                <span className="font-semibold text-slate-200 font-mono">
                  {(() => {
                    const linkedC = academyCourses.find(c => c.id === selectedStudentsClass.courseId || c.name === selectedStudentsClass.courseName);
                    return linkedC?.code ? linkedC.code : (selectedStudentsClass.courseId || selectedStudentsClass.courseName);
                  })()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Professor Responsável</span>
                <span className="text-emerald-400 font-semibold">{getTeacherDisplayName(selectedStudentsClass)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total de Alunos</span>
                <span className="font-bold text-emerald-400 text-sm">{classStudents.length} cadastrados</span>
              </div>
            </div>

            {/* Cadastro de Alunos Section */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-amber-400" />
                  <span>Cadastrar Novos Alunos</span>
                </h4>
                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAddStudentMode('batch')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${addStudentMode === 'batch' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Em Bloco (Lote)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddStudentMode('single')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${addStudentMode === 'single' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Individual
                  </button>
                </div>
              </div>

              {addStudentMode === 'batch' ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Insira os nomes dos alunos (um por linha):
                  </label>
                  <textarea
                    rows={4}
                    value={newStudentBatchText}
                    onChange={(e) => setNewStudentBatchText(e.target.value)}
                    placeholder={'Carlos Silva\nMariana Santos\nPedro Henrique'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none font-mono"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400 italic">
                      * Cada quebra de linha criará um novo aluno vinculado a esta turma.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddStudents}
                      disabled={savingStudent || !newStudentBatchText.trim()}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow flex items-center space-x-1 disabled:opacity-50"
                    >
                      {savingStudent ? 'Cadastrando...' : 'Cadastrar Bloco de Alunos'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Nome do Aluno *
                    </label>
                    <input
                      type="text"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="Nome completo do aluno"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      MASP (Opcional)
                    </label>
                    <input
                      type="text"
                      value={newStudentMasp}
                      onChange={(e) => setNewStudentMasp(e.target.value)}
                      placeholder="Ex: 1234567"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleAddStudents}
                      disabled={savingStudent || !newStudentName.trim()}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow disabled:opacity-50"
                    >
                      {savingStudent ? 'Cadastrando...' : 'Cadastrar Aluno'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lista de Alunos Registrados */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Alunos Cadastrados na Turma ({classStudents.length})</span>
                {loadingStudents && <span className="text-[10px] text-amber-400 animate-pulse">Carregando alunos...</span>}
              </h4>

              {classStudents.length === 0 ? (
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                  Nenhum aluno cadastrado nesta turma ainda. Utilize o formulário acima para adicionar alunos.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/60 bg-slate-950/40">
                  {classStudents.map((stu, idx) => (
                    <div key={stu.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-slate-800/30 transition text-xs">
                      <div className="flex items-center space-x-3">
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-slate-100 text-sm">{stu.nomeAluno}</p>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                            {stu.maspAluno && <span>MASP: {formatMasp(stu.maspAluno)}</span>}
                            <span>• Situação: <strong className="text-emerald-400">{stu.situacaoAluno || 'Ativo'}</strong></span>
                            {stu.instrutor1Aluno && <span className="text-amber-400">• Instrutor Ext: {stu.instrutor1Aluno}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end md:self-auto">
                        {/* Botão Aulas e Notas */}
                        <button
                          type="button"
                          onClick={() => handleOpenLessonsModal(stu)}
                          className="bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center space-x-1 transition"
                          title="Visualizar ou registrar aulas e notas deste aluno"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Aulas & Notas ({(stu.aulas || []).length})</span>
                        </button>

                        {/* Botão Transferir Aluno */}
                        <button
                          type="button"
                          onClick={() => handleOpenTransferModal(stu)}
                          className="bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center space-x-1 transition"
                          title="Mudar aluno de turma"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                          <span>Mudar de Turma</span>
                        </button>

                        {/* Editar Instrutores / Dados */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditStudent(stu)}
                          className="text-slate-400 hover:text-amber-400 p-1 rounded-lg hover:bg-slate-800 transition"
                          title="Editar / Cadastrar Instrutores Adicionais"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Excluir Aluno */}
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(stu.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition"
                          title="Excluir Aluno"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStudentsClass(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-5 py-2 rounded-xl transition"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Editar Dados do Aluno / Instrutores Adicionais */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>Editar Aluno e Instrutores - {editingStudent.nomeAluno}</span>
              </h4>
              <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome do Aluno</label>
                <input
                  type="text"
                  value={editStudentNome}
                  onChange={(e) => setEditStudentNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">MASP</label>
                  <input
                    type="text"
                    value={editStudentMasp}
                    onChange={(e) => setEditStudentMasp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Situação</label>
                  <select
                    value={editStudentSituacao}
                    onChange={(e) => setEditStudentSituacao(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Transferido">Transferido</option>
                    <option value="Desligado">Desligado</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>
              </div>

              {/* Instrutores Adicionais 1 a 4 */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Instrutores Adicionais da Turma</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Instrutor 1</label>
                    <input
                      type="text"
                      value={editStudentInstrutor1}
                      onChange={(e) => setEditStudentInstrutor1(e.target.value)}
                      placeholder="Nome do 2º professor"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Instrutor 2</label>
                    <input
                      type="text"
                      value={editStudentInstrutor2}
                      onChange={(e) => setEditStudentInstrutor2(e.target.value)}
                      placeholder="Nome do 3º professor"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Instrutor 3</label>
                    <input
                      type="text"
                      value={editStudentInstrutor3}
                      onChange={(e) => setEditStudentInstrutor3(e.target.value)}
                      placeholder="Nome do 4º professor"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Instrutor 4</label>
                    <input
                      type="text"
                      value={editStudentInstrutor4}
                      onChange={(e) => setEditStudentInstrutor4(e.target.value)}
                      placeholder="Nome do 5º professor"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditStudent}
                disabled={savingStudent}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl"
              >
                {savingStudent ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Transferir Aluno de Turma */}
      {transferTargetStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-100 flex items-center space-x-2 text-amber-400">
                <ArrowRightLeft className="w-4 h-4" />
                <span>Transferir Aluno de Turma</span>
              </h4>
              <button onClick={() => setTransferTargetStudent(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-slate-400">Aluno:</p>
                <p className="text-sm font-bold text-slate-100">{transferTargetStudent.nomeAluno}</p>
                <p className="text-[11px] text-amber-400 mt-1">Turma Atual: {transferTargetStudent.turmaAluno}</p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Selecione a Nova Turma de Destino *</label>
                <select
                  value={transferNewClassId}
                  onChange={(e) => setTransferNewClassId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-medium"
                >
                  <option value="">-- Selecione a Nova Turma --</option>
                  {courseClasses
                    .filter(c => c.id !== selectedStudentsClass?.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        Turma {c.code || `${c.careerAbbreviation}-${c.turmaNumber}`} - {c.career} ({c.subject})
                      </option>
                    ))}
                </select>
              </div>

              <div className="bg-amber-950/30 border border-amber-800/50 p-3 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
                * Ao transferir, o aluno herdará o código da nova turma, o código do curso e o nome do professor responsável da nova turma. <strong>Todas as aulas e notas já registradas serão mantidas.</strong>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTransferTargetStudent(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={transferringStudent || !transferNewClassId}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {transferringStudent ? 'Transferindo...' : 'Confirmar Transferência'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Gerenciar Aulas e Notas do Aluno */}
      {selectedStudentForLessons && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-3xl shadow-2xl space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-indigo-400">
                <BookOpen className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-100">
                  Histórico de Aulas e Notas - <span className="text-indigo-400">{selectedStudentForLessons.nomeAluno}</span>
                </h3>
              </div>
              <button onClick={() => setSelectedStudentForLessons(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            {/* Form de Cadastro / Edição de Aula */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-300 flex items-center justify-between">
                <span>{editingLesson ? 'Editar Registro de Aula / Nota' : 'Cadastrar Nova Aula / Nota'}</span>
                {editingLesson && (
                  <button type="button" onClick={resetLessonForm} className="text-[10px] text-slate-400 hover:text-slate-200 underline">
                    Cancelar Edição
                  </button>
                )}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Nome da Aula *</label>
                  <input
                    type="text"
                    value={lessonFormName}
                    onChange={(e) => setLessonFormName(e.target.value)}
                    placeholder="Ex: Manejo de Pistola 9mm / Tirometro"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nº da Aula</label>
                  <input
                    type="number"
                    min={1}
                    value={lessonFormNumber}
                    onChange={(e) => setLessonFormNumber(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nota do Aluno</label>
                  <input
                    type="text"
                    value={lessonFormGrade}
                    onChange={(e) => setLessonFormGrade(e.target.value)}
                    placeholder="Ex: 9.5 ou Aprovado"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold text-amber-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Data da Aula</label>
                  <input
                    type="date"
                    value={lessonFormDate}
                    onChange={(e) => setLessonFormDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Hora da Aula</label>
                  <input
                    type="time"
                    value={lessonFormTime}
                    onChange={(e) => setLessonFormTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Observação</label>
                  <input
                    type="text"
                    value={lessonFormObs}
                    onChange={(e) => setLessonFormObs(e.target.value)}
                    placeholder="Observações de desempenho ou presença"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-300 font-semibold">Conteúdo da Aula (Até 500 caracteres)</label>
                    <span className={`text-[10px] ${lessonFormContent.length > 500 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                      {lessonFormContent.length}/500 caracteres
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={lessonFormContent}
                    onChange={(e) => setLessonFormContent(e.target.value.slice(0, 500))}
                    placeholder="Descreva resumidamente o conteúdo ministrado na aula..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveLesson}
                  disabled={savingLesson || !lessonFormName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition shadow disabled:opacity-50"
                >
                  {savingLesson ? 'Salvando...' : (editingLesson ? 'Atualizar Aula' : 'Salvar Aula / Nota')}
                </button>
              </div>
            </div>

            {/* Tabela de Aulas Ministradas */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-200">
                Aulas Registradas ({studentLessons.length})
              </h4>

              {loadingStudentLessons ? (
                <p className="text-xs text-amber-400 animate-pulse text-center py-4">Carregando histórico de aulas...</p>
              ) : studentLessons.length === 0 ? (
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                  Nenhuma aula registrada para este aluno ainda.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/60 bg-slate-950/40">
                  {studentLessons.map((les) => (
                    <div key={les.id} className="p-3 flex items-start justify-between gap-3 hover:bg-slate-800/30 transition text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="bg-indigo-950 border border-indigo-700 text-indigo-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md">
                            Aula #{les.aulaNumeroAluno}
                          </span>
                          <span className="font-bold text-slate-100 text-sm">{les.aulaNomeAluno}</span>
                          {les.notaAluno && (
                            <span className="bg-amber-950 border border-amber-700/60 text-amber-300 font-bold px-2 py-0.5 rounded-md text-[11px]">
                              Nota: {les.notaAluno}
                            </span>
                          )}
                        </div>

                        {(les.aulaDataAluno || les.aulaHoraAluno) && (
                          <p className="text-[11px] text-slate-400">
                            Data/Hora: {les.aulaDataAluno || ''} {les.aulaHoraAluno ? `às ${les.aulaHoraAluno}` : ''}
                          </p>
                        )}

                        {les.aulaConteudoAluno && (
                          <p className="text-slate-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800/80 text-[11px] leading-relaxed">
                            {les.aulaConteudoAluno}
                          </p>
                        )}

                        {les.observacaoAluno && (
                          <p className="text-[10px] text-slate-400 italic">
                            Obs: {les.observacaoAluno}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleEditLesson(les)}
                          className="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800"
                          title="Editar aula"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLesson(les.id)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800"
                          title="Excluir aula"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setSelectedStudentForLessons(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-5 py-2 rounded-xl transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Saída para Aula */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl my-8 space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center space-x-2 text-amber-400">
              <ArrowRightLeft className="w-5 h-5" />
              <span>Lançamento de Saída (Aula CFTP)</span>
            </h3>

            <form onSubmit={handleExecuteSaida} className="space-y-4 text-xs">
              
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Selecione a Turma</label>
                <select
                  value={movClassId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setMovClassId(cId);
                    const selectedC = courseClasses.find(c => c.id === cId);
                    if (selectedC) {
                      const primaryTeacher = selectedC.teacherUserId || (selectedC.teacherUserIds && selectedC.teacherUserIds[0]) || '';
                      if (primaryTeacher) {
                        setMovTeacherUserId(primaryTeacher);
                        setMovRecipientType('inside');
                      } else if (selectedC.teacherName) {
                        setMovTeacherNameOutside(selectedC.teacherName);
                        setMovRecipientType('outside');
                      }

                      if (movPlanId) {
                        const selP = lessonPlans.find(p => p.id === movPlanId);
                        const lessonItem = selP?.lessonsData?.find(l => l.lessonNumber === movLessonNumber) || selP?.lessonsData?.[0];
                        if (lessonItem) {
                          const baseSum = (lessonItem.shotsPerStudent * selectedC.studentCount) + lessonItem.instructorShots;
                          const newQty = Math.round(baseSum * 1.10);
                          setMovAmmoItems(prev => prev.length > 0 ? [{ ...prev[0], quantity: newQty }, ...prev.slice(1)] : prev);
                        }
                      }
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  {courseClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      Turma: {c.code || c.name} - Curso: {c.courseName} • Prof: {getTeacherDisplayName(c)} (Carreira: {c.career} - {c.subject}) • {c.studentCount} alunos
                    </option>
                  ))}
                </select>

                {(() => {
                  const selectedC = courseClasses.find(c => c.id === movClassId);
                  if (!selectedC) return null;
                  return (
                    <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/30 text-xs space-y-1 font-mono mt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans font-semibold">TURMA E CURSO:</span>
                        <span className="font-extrabold text-amber-400 text-sm bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                          Turma {selectedC.code || selectedC.name} - {selectedC.courseName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans font-semibold">PROFESSOR RESPONSÁVEL:</span>
                        <span className="font-bold text-emerald-400">Prof. {getTeacherDisplayName(selectedC)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans font-semibold">CURSO / CARREIRA:</span>
                        <span className="text-slate-200">{selectedC.courseName} (Carreira: {selectedC.career})</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-sans font-semibold">DISCIPLINA:</span>
                        <span className="text-amber-300 font-bold">{selectedC.subject} ({selectedC.studentCount} alunos)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Plano de Aula Dropdown (Somente Curso de Formação) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>Plano de Aula</span>
                    <span className="text-[10px] text-amber-400 font-normal">Somente Curso de Formação</span>
                  </label>
                  <select
                    value={movPlanId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setMovPlanId(pId);
                      const selP = lessonPlans.find(p => p.id === pId);
                      if (selP && selP.lessonsData && selP.lessonsData.length > 0) {
                        const firstLesson = selP.lessonsData[0];
                        setMovLessonNumber(firstLesson.lessonNumber);
                        const selectedC = courseClasses.find(c => c.id === movClassId);
                        const stCount = selectedC ? selectedC.studentCount : 20;
                        const baseSum = (firstLesson.shotsPerStudent * stCount) + firstLesson.instructorShots;
                        const newQty = Math.round(baseSum * 1.10);
                        setMovAmmoItems(prev => prev.length > 0 ? [{ ...prev[0], quantity: newQty }, ...prev.slice(1)] : prev);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                  >
                    <option value="">-- Sem Plano de Aula --</option>
                    {lessonPlans
                      .filter(p => (p.type || '').toLowerCase().includes('formação'))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.career} - {p.year})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Número da Aula</label>
                  <select
                    value={movLessonNumber}
                    onChange={(e) => {
                      const lNum = Number(e.target.value);
                      setMovLessonNumber(lNum);
                      const selP = lessonPlans.find(p => p.id === movPlanId);
                      const lessonItem = selP?.lessonsData?.find(l => l.lessonNumber === lNum);
                      if (lessonItem) {
                        const selectedC = courseClasses.find(c => c.id === movClassId);
                        const stCount = selectedC ? selectedC.studentCount : 20;
                        const baseSum = (lessonItem.shotsPerStudent * stCount) + lessonItem.instructorShots;
                        const newQty = Math.round(baseSum * 1.10);
                        setMovAmmoItems(prev => prev.length > 0 ? [{ ...prev[0], quantity: newQty }, ...prev.slice(1)] : prev);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                    disabled={!movPlanId}
                  >
                    {(() => {
                      const selP = lessonPlans.find(p => p.id === movPlanId);
                      if (!selP || !selP.lessonsData) return <option value={1}>Aula 1</option>;
                      return selP.lessonsData.map(l => (
                        <option key={l.lessonNumber} value={l.lessonNumber}>
                          Aula {l.lessonNumber} ({l.shotsPerStudent} t/aluno, Cal: {l.caliberName})
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              {/* Seleção de Caixas de Armas (Múltiplas Caixas) */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between text-xs">
                  <span>Caixas de Armas para Aula (Múltiplas Seleções)</span>
                  <span className="text-[10px] text-amber-400 font-mono">{movSelectedBoxIds.length} selecionada(s)</span>
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-950 border border-slate-800 p-2 rounded-xl">
                  {weaponBoxes.length === 0 ? (
                    <div className="text-slate-500 italic text-xs text-center p-2">Nenhuma caixa cadastrada.</div>
                  ) : (
                    weaponBoxes.map(b => {
                      const isChecked = movSelectedBoxIds.includes(b.id);
                      return (
                        <label key={b.id} className="flex items-center space-x-2 p-1.5 hover:bg-slate-900 rounded cursor-pointer font-mono text-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMovSelectedBoxIds(prev => [...prev, b.id]);
                              } else {
                                setMovSelectedBoxIds(prev => prev.filter(id => id !== b.id));
                              }
                            }}
                            className="rounded text-amber-500 focus:ring-0"
                          />
                          <span className="text-slate-200 font-bold">{b.name}</span>
                          <span className="text-amber-400 font-normal">({b.weaponIds?.length || 0} armas)</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Seleção do Estoque: Múltiplos Calibres e Cofres MEAF */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span>Estoque e Calibres de Munição ({movAmmoItems.length} calibre(s))</span>
                  <button
                    type="button"
                    onClick={() => {
                      const meafVaults = vaultSpaces.filter(v => {
                        if (v.unitId === 'unit-acad-meaf') return true;
                        const linkedUnit = units.find(u => u.id === v.unitId);
                        if (linkedUnit && (linkedUnit.name.toUpperCase().includes('MEAF') || linkedUnit.code?.toUpperCase().includes('MEAF'))) return true;
                        if (v.name?.toUpperCase().includes('MEAF') || v.code?.toUpperCase().includes('MEAF')) return true;
                        return false;
                      });
                      const displayVaults = meafVaults.length > 0 ? meafVaults : vaultSpaces;

                      setMovAmmoItems(prev => [
                        ...prev,
                        {
                          id: Date.now().toString(),
                          caliberId: calibers[0]?.id || '',
                          vaultSpaceId: displayVaults[0]?.id || '',
                          quantity: 0
                        }
                      ]);
                    }}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded transition flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Adicionar Outro Calibre</span>
                  </button>
                </div>

                {(() => {
                  const meafVaults = vaultSpaces.filter(v => {
                    if (v.unitId === 'unit-acad-meaf') return true;
                    const linkedUnit = units.find(u => u.id === v.unitId);
                    if (linkedUnit && (linkedUnit.name.toUpperCase().includes('MEAF') || linkedUnit.code?.toUpperCase().includes('MEAF'))) return true;
                    if (v.name?.toUpperCase().includes('MEAF') || v.code?.toUpperCase().includes('MEAF')) return true;
                    return false;
                  });
                  const displayVaults = meafVaults.length > 0 ? meafVaults : vaultSpaces;

                  return movAmmoItems.map((item, idx) => {
                    const selCal = calibers.find(c => c.id === item.caliberId || c.name === item.caliberId);
                    const calName = selCal ? selCal.name : item.caliberId;

                    const matchStock = ammoStocks.find(a =>
                      (a.vaultSpaceId === item.vaultSpaceId) &&
                      (a.caliberId === item.caliberId || (calName && a.caliber && a.caliber.toLowerCase() === calName.toLowerCase()))
                    );
                    const stockAvail = matchStock ? matchStock.quantity : 0;

                    return (
                      <div key={item.id || idx} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5 relative">
                        {movAmmoItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMovAmmoItems(prev => prev.filter(i => i.id !== item.id))}
                            className="absolute top-2 right-2 text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition"
                            title="Remover este calibre"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                              Calibre da Munição
                            </label>
                            <select
                              value={item.caliberId}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updatedCal = calibers.find(c => c.id === val || c.name === val);
                                const cName = updatedCal ? updatedCal.name : val;
                                const matchingS = ammoStocks.find(a =>
                                  a.caliberId === val || (cName && a.caliber && a.caliber.toLowerCase() === cName.toLowerCase())
                                );
                                setMovAmmoItems(prev => prev.map(i => i.id === item.id ? {
                                  ...i,
                                  caliberId: val,
                                  vaultSpaceId: matchingS?.vaultSpaceId || i.vaultSpaceId
                                } : i));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                            >
                              <option value="">-- Selecione o Calibre --</option>
                              {calibers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                              Nome do Cofre (Unidade MEAF)
                            </label>
                            <select
                              value={item.vaultSpaceId}
                              onChange={(e) => {
                                const vId = e.target.value;
                                setMovAmmoItems(prev => prev.map(i => i.id === item.id ? { ...i, vaultSpaceId: vId } : i));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                            >
                              <option value="">-- Selecione o Cofre MEAF --</option>
                              {displayVaults.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.name || v.code || v.location || 'Cofre MEAF'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 font-mono text-xs">
                          <span className="text-slate-400">
                            Saldo no Cofre: <strong className={stockAvail >= item.quantity ? 'text-emerald-400' : 'text-red-400'}>{stockAvail} un</strong>
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-300 font-semibold font-sans text-[11px]">Qtd. Fornecida:</span>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const q = Number(e.target.value);
                                setMovAmmoItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: q } : i));
                              }}
                              min={0}
                              className="w-24 bg-slate-950 border border-amber-500/50 rounded-lg px-2 py-1 text-slate-100 font-bold text-amber-400 text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Responsible Officer / Recipient */}
              <div className="border border-slate-800 p-3.5 rounded-xl space-y-3 bg-slate-950/40">
                <label className="block text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  Policial Responsável pela Retirada
                </label>
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientType"
                      checked={movRecipientType === 'inside'}
                      onChange={() => setMovRecipientType('inside')}
                      className="text-amber-500"
                    />
                    <span>Policial no Sistema</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientType"
                      checked={movRecipientType === 'outside'}
                      onChange={() => setMovRecipientType('outside')}
                      className="text-amber-500"
                    />
                    <span className="text-amber-400 font-bold">Fora do Sistema</span>
                  </label>
                </div>

                {movRecipientType === 'inside' ? (
                  <select
                    value={movTeacherUserId}
                    onChange={(e) => setMovTeacherUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {formatMasp(u.masp)}) {u.isTeacher ? '• Professor' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={movTeacherNameOutside}
                    onChange={(e) => setMovTeacherNameOutside(e.target.value)}
                    placeholder="Informe o nome completo do responsável fora do sistema"
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-slate-100 font-semibold"
                    required
                  />
                )}
              </div>

              {/* Observações até 500 chars */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Observação na Saída de Munições / Armas</span>
                  <span className="text-[10px] text-slate-500 font-mono">{movNotes.length}/500</span>
                </label>
                <textarea
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value.slice(0, 500))}
                  placeholder="Descreva aqui informações adicionais referentes à aula..."
                  rows={3}
                  maxLength={500}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow"
                >
                  Confirmar Saída e Gerar Recibo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Mapa de Aula */}
      {showEditMovModal && editingMovement && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-400">
                <Edit2 className="w-5 h-5" />
                <span>Editar Mapa de Aula</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEditMovModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </h3>

            <form onSubmit={handleExecuteEditMov} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Professor Responsável <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editMovTeacherName}
                  onChange={(e) => setEditMovTeacherName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Plano de Aula
                  </label>
                  <input
                    type="text"
                    value={editMovLessonPlanName}
                    onChange={(e) => setEditMovLessonPlanName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Aula Nº
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMovLessonNumber}
                    onChange={(e) => setEditMovLessonNumber(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono font-bold focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Quantidade de Munição Fornecida
                </label>
                <input
                  type="number"
                  min={0}
                  value={editMovAmmoSupplied}
                  onChange={(e) => setEditMovAmmoSupplied(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono font-bold focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observações / Ocorrências
                </label>
                <textarea
                  value={editMovNotes}
                  onChange={(e) => setEditMovNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 transition"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditMovModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Fechar Mapa / Devolução de Aula */}
      {showRetornoModal && retornoMovement && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span>Fechamento do Mapa de Aula / Devolução</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRetornoModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </h3>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Turma / Aula:</span>
                <strong className="text-slate-100 font-semibold">{retornoMovement.className || retornoMovement.turmaCode} (Aula {retornoMovement.lessonNumber || 1})</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Professor Responsável:</span>
                <span className="text-amber-400 font-bold">{retornoMovement.teacherName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Munição Cautelada Inicialmente:</span>
                <strong className="text-amber-400 font-mono">{retornoMovement.ammoQuantity || retornoMovement.ammoSupplied} un ({retornoMovement.ammoCaliber || 'Padrão'})</strong>
              </div>
              {retornoMovement.weaponBoxName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Caixa de Armamento:</span>
                  <span className="text-slate-200 font-medium">{retornoMovement.weaponBoxName}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleExecuteRetorno} className="space-y-4 text-xs">
              {/* Caixas de Armas Fornecidas (Seleção de Caixas a Devolver) */}
              {(() => {
                const movBoxIds = (retornoMovement.boxId || retornoMovement.weaponBoxId || '').split(',').map(s => s.trim()).filter(Boolean);
                const matchedBoxes = weaponBoxes.filter(b => 
                  movBoxIds.includes(b.id) || (retornoMovement.boxName && retornoMovement.boxName.toLowerCase().includes(b.name.toLowerCase()))
                );

                return (
                  <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-200 font-bold text-xs">
                        Caixas de Armas Fornecidas (Selecione as caixas devolvidas)
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-semibold">
                        {retornoSelectedBoxIds.length} / {matchedBoxes.length || 1} Selecionada(s)
                      </span>
                    </div>

                    {matchedBoxes.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {matchedBoxes.map((box) => {
                          const isSelected = retornoSelectedBoxIds.includes(box.id);
                          const boxWeapons = weapons.filter(w => box.weaponIds && box.weaponIds.includes(w.id));

                          return (
                            <div
                              key={box.id}
                              onClick={() => {
                                setRetornoSelectedBoxIds(prev =>
                                  prev.includes(box.id) ? prev.filter(id => id !== box.id) : [...prev, box.id]
                                );
                              }}
                              className={`p-3 rounded-xl border transition cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-950/30 border-emerald-500/50 text-slate-100'
                                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}} // Controlled by parent container onClick
                                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500"
                                  />
                                  <div>
                                    <div className="font-bold text-slate-100 text-xs flex items-center space-x-2">
                                      <span>📦 {box.name}</span>
                                      <span className="text-[10px] bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                                        {boxWeapons.length} arma(s)
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isSelected 
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                    : 'bg-slate-800 text-slate-500'
                                }`}>
                                  {isSelected ? 'Devolvida ao Cofre' : 'Não Selecionada'}
                                </span>
                              </div>

                              {/* Conteúdo Detalhado da Caixa (Tipo, Marca, Calibre, Modelo, S/N) */}
                              {boxWeapons.length > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono space-y-1">
                                  <div className="text-slate-400 font-semibold flex justify-between items-center">
                                    <span>Conteúdo da Caixa:</span>
                                    <span className="text-[9px] text-slate-500 font-normal">Tipo • Marca • Calibre • Modelo • Nº de Série</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {boxWeapons.map((w, wIdx) => (
                                      <div key={w.id || wIdx} className="bg-slate-950/80 p-1.5 rounded border border-slate-800/60 flex justify-between items-center text-slate-300">
                                        <span><strong>{w.type || 'Arma'}</strong> {w.manufacturer} {w.model} ({w.caliber})</span>
                                        <span className="text-amber-300 font-bold font-mono text-[9px] ml-1">S/N: {w.serialNumber}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                        <span>📦 {retornoMovement.weaponBoxName || retornoMovement.boxName || 'Caixa de Armas Padrão'}</span>
                        <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded">
                          Resgatada
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Quantidade de Munições Entregues x Devolvidas x Utilizadas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Munições Entregues
                  </label>
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-base font-bold">
                    {retornoMovement.ammoQuantity || retornoMovement.ammoSupplied || 0} un
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Calibre: {retornoMovement.ammoCaliber || 'Padrão'}
                  </p>
                </div>

                <div>
                  <label className="block text-emerald-400 font-semibold mb-1">
                    Munições Devolvidas
                  </label>
                  <input
                    type="number"
                    value={retornoAmmoReturned}
                    onChange={(e) => {
                      const ret = Math.max(0, Number(e.target.value));
                      const total = retornoMovement.ammoQuantity || retornoMovement.ammoSupplied || 0;
                      setRetornoAmmoReturned(ret);
                      setRetornoAmmoUsed(Math.max(0, total - ret));
                    }}
                    min={0}
                    max={retornoMovement.ammoQuantity || retornoMovement.ammoSupplied || 0}
                    className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl px-3 py-2 text-emerald-400 font-mono text-base font-bold focus:border-emerald-400"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Retornam ao estoque do cofre
                  </p>
                </div>

                <div>
                  <label className="block text-amber-400 font-semibold mb-1">
                    Munições Utilizadas
                  </label>
                  <div className="w-full bg-slate-900 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-400 font-mono text-base font-bold">
                    {retornoAmmoUsed} un
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Deflagradas na aula (Subtração)
                  </p>
                </div>
              </div>

              {/* Materiais Devolvidos */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Materiais e Armamentos Devolvidos <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={retornoMaterials}
                  onChange={(e) => setRetornoMaterials(e.target.value)}
                  placeholder="Ex: Caixas de armas, alvos, abafadores e óculos de proteção"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRetornoMaterials('Caixas de armamento e acessórios devolvidos em perfeito estado')}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                  >
                    + Tudo Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetornoMaterials('Armas devolvidas ao cofre, caixas e carregadores conferidos')}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                  >
                    + Armas Conferidas
                  </button>
                </div>
              </div>

              {/* Observações da Aula / Texto livre */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observações / Ocorrências da Aula (Texto Livre)
                </label>
                <textarea
                  value={retornoNotes}
                  onChange={(e) => setRetornoNotes(e.target.value)}
                  rows={3}
                  placeholder="Informe aqui qualquer observação sobre a aula, pane em armamento, extravio de cartucho ou registro relevante..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 transition"
                />
              </div>

              {/* Nome do Responsável */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome do Professor / Usuário Responsável pelo Fechamento</label>
                <input
                  type="text"
                  value={retornoUserName}
                  onChange={(e) => setRetornoUserName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRetornoModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Fechar Mapa de Aula</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gerenciar Cursos de Habilitação Modal - Moved to CourseManagementModule */}
      {false && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2 text-amber-400">
                <GraduationCap className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-100">Gerenciar Cursos de Habilitação em Armas</h3>
              </div>
              <button
                onClick={() => setShowManageCoursesModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Cadastre e gerencie cursos de habilitação operacional com nome livre, seleção de tipos de armas, modelos de armamento e quantidade de tiros por aluno.
            </p>

            {qualModalSuccess && (
              <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{qualModalSuccess}</span>
              </div>
            )}

            {qualModalError && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{qualModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQualCourse} className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                {editingQualCourse ? 'Editar Curso' : 'Cadastrar Novo Curso'}
              </h4>

              {/* Nome do Curso */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nome do Curso (Buscar em Cursos de Habilitação)
                </label>
                <input
                  type="text"
                  list="manageQualCoursesDatalist"
                  value={qualCourseName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQualCourseName(val);
                    const matched = qualCourses.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
                    if (matched) {
                      if (matched.allowedWeaponTypes && matched.allowedWeaponTypes.length > 0) {
                        setQualSelectedWeaponTypes(matched.allowedWeaponTypes);
                      }
                      if (matched.allowedModels && matched.allowedModels.length > 0) {
                        setQualSelectedModels(matched.allowedModels);
                      }
                      if (matched.shotsPerWeaponType && Object.keys(matched.shotsPerWeaponType).length > 0) {
                        setQualShotsPerWeaponType(matched.shotsPerWeaponType);
                      } else if (matched.shotsPerStudent) {
                        const defaultWT = matched.allowedWeaponTypes?.[0] || 'Fuzil';
                        setQualShotsPerWeaponType({ [defaultWT]: matched.shotsPerStudent });
                      }
                    }
                  }}
                  placeholder="Ex: Operador de Fuzil / Habilitação em Fuzil e Pistola"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
                <datalist id="manageQualCoursesDatalist">
                  {qualCourses.map((qc) => (
                    <option key={qc.id} value={qc.name} />
                  ))}
                </datalist>
              </div>

              {/* Informações Herdadas */}
              {(() => {
                const matched = qualCourses.find(c => c.name.toLowerCase() === qualCourseName.trim().toLowerCase());
                if (!matched) return null;
                const totalShots = matched.shotsPerStudent || 
                  (matched.shotsPerWeaponType ? Object.values(matched.shotsPerWeaponType).reduce((a, b) => a + b, 0) : 50);
                return (
                  <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xl text-xs space-y-1">
                    <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                      <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Dados do Curso Cadastrado Anteriores Herdados:</span>
                    </div>
                    <div className="text-slate-300">
                      <strong className="text-slate-100">Tipo de Arma:</strong> {matched.allowedWeaponTypes?.join(', ') || 'N/A'}
                    </div>
                    <div className="text-slate-300">
                      <strong className="text-slate-100">Quantidade de Tiros Herdada:</strong>{' '}
                      <span className="text-amber-400 font-mono font-bold">{totalShots} tiros por aluno</span>
                    </div>
                  </div>
                );
              })()}

              {/* Select List: Tipo de Arma (Pode selecionar mais de uma) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Arma (Select List de Armas Disponíveis)
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableWeaponTypes.map((wt) => {
                    const isSelected = qualSelectedWeaponTypes.includes(wt.name);
                    return (
                      <button
                        type="button"
                        key={wt.id}
                        onClick={() => {
                          if (isSelected) {
                            setQualSelectedWeaponTypes(prev => prev.filter(t => t !== wt.name));
                            setQualShotsPerWeaponType(prev => {
                              const next = { ...prev };
                              delete next[wt.name];
                              return next;
                            });
                          } else {
                            setQualSelectedWeaponTypes(prev => [...prev, wt.name]);
                            setQualShotsPerWeaponType(prev => ({
                              ...prev,
                              [wt.name]: prev[wt.name] || 50
                            }));
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <span>{wt.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 ml-1 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modelos Habilitados (Baseado nos Tipos Selecionados ou Todos) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Modelos de Armas Habilitados no Curso
                </label>
                {(() => {
                  const relevantTypes = availableWeaponTypes.filter(
                    wt => qualSelectedWeaponTypes.length === 0 || qualSelectedWeaponTypes.includes(wt.name)
                  );
                  const allModels = Array.from(new Set(relevantTypes.flatMap(wt => wt.models)));

                  if (allModels.length === 0) {
                    return (
                      <p className="text-xs text-slate-500 italic">
                        Nenhum modelo cadastrado nos tipos selecionados em "Armas Disponíveis".
                      </p>
                    );
                  }

                  return (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-900 border border-slate-800 rounded-xl">
                      {allModels.map((mdl) => {
                        const isMdlSelected = qualSelectedModels.includes(mdl);
                        return (
                          <button
                            type="button"
                            key={mdl}
                            onClick={() => {
                              if (isMdlSelected) {
                                setQualSelectedModels(prev => prev.filter(m => m !== mdl));
                              } else {
                                setQualSelectedModels(prev => [...prev, mdl]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition flex items-center ${
                              isMdlSelected
                                ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>{mdl}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Quantidade de Tiros por Aluno por Tipo de Arma */}
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Quantidade de Tiros por Aluno por Tipo de Arma
                  </label>
                  {qualSelectedWeaponTypes.length > 0 && (
                    <span className="text-xs text-amber-400 font-mono font-bold">
                      Total: {qualSelectedWeaponTypes.reduce((acc, t) => acc + (Number(qualShotsPerWeaponType[t]) || 0), 0)} tiros/aluno
                    </span>
                  )}
                </div>

                {qualSelectedWeaponTypes.length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-2.5 bg-slate-950 rounded-xl border border-slate-800/80">
                    Selecione um ou mais tipos de arma acima para definir a quantidade de tiros de cada uma.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {qualSelectedWeaponTypes.map((wtName) => (
                      <div key={wtName} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <label className="block text-xs font-bold text-amber-300">
                          Tiros de {wtName}
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="0"
                            value={qualShotsPerWeaponType[wtName] ?? 50}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setQualShotsPerWeaponType(prev => ({ ...prev, [wtName]: val }));
                            }}
                            placeholder="Ex: 50"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                            required
                          />
                          <span className="text-xs text-slate-400 font-semibold">tiros</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Departamento do curso */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Departamento do curso
                </label>
                <input
                  type="text"
                  value="ACADEMIA DE POLICIA"
                  disabled
                  className="w-full bg-slate-900/60 border border-slate-800 text-amber-400 font-bold rounded-xl px-3.5 py-2 text-xs cursor-not-allowed"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                {editingQualCourse && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQualCourse(null);
                      setQualCourseName('');
                      setQualSelectedWeaponTypes([]);
                      setQualSelectedModels([]);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingQualCourse ? 'Atualizar Curso' : 'Cadastrar Curso'}</span>
                </button>
              </div>
            </form>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowManageCoursesModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-5 py-2.5 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Confirmar Exclusão"
        message={`Deseja realmente excluir permanentemente "${deleteTarget?.name}"?`}
        onConfirm={confirmExecuteDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Receipt Modal */}
      {selectedReceiptMovement && (
        <AcademyReceiptModal
          movement={selectedReceiptMovement}
          onClose={() => setSelectedReceiptMovement(null)}
        />
      )}

    </div>
  );
};
