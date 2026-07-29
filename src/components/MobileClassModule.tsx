import React, { useState, useEffect } from 'react';
import { User, CourseClass, AcademyCourse } from '../types';
import { storage } from '../services/storage';
import {
  Smartphone,
  Lock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Target,
  Plus,
  Search,
  BookOpen,
  Edit2,
  Trash2,
  ArrowRightLeft,
  LogOut,
  Check,
  Award,
  GraduationCap,
  Sparkles,
  ClipboardList,
  Calendar,
  Clock,
  MapPin,
  ChevronRight
} from 'lucide-react';

interface StudentData {
  id: string;
  turmaId: string;
  turmaCode: string;
  courseCode?: string;
  nomeAluno: string;
  maspAluno?: string;
  situacaoAluno?: string;
  teacherName?: string;
  instrutor1Aluno?: string;
  instrutor2Aluno?: string;
  instrutor3Aluno?: string;
  instrutor4Aluno?: string;
  aulas?: Array<{
    id: string;
    aulaNomeAluno: string;
    aulaNumeroAluno?: number;
    notaAluno?: string;
    aulaDataAluno?: string;
    aulaHoraAluno?: string;
    aulaConteudoAluno?: string;
    observacaoAluno?: string;
  }>;
}

interface MobileClassModuleProps {
  currentUser: User;
  onRefresh?: () => void;
  courseClassesProp?: CourseClass[];
}

export const MobileClassModule: React.FC<MobileClassModuleProps> = ({
  currentUser,
  onRefresh
}) => {
  // --- AUTHENTICATION STATE FOR MOBILE CLASS ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [maspInput, setMaspInput] = useState(currentUser?.masp || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);

  // --- DATA STATES ---
  const [courseClasses, setCourseClasses] = useState<CourseClass[]>([]);
  const [academyCourses, setAcademyCourses] = useState<AcademyCourse[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<CourseClass | null>(null);

  // Calendar search & filters
  const [courseSearch, setCourseSearch] = useState('');
  const [courseCareerFilter, setCourseCareerFilter] = useState<string>('TODAS');
  const [courseTypeFilter, setCourseTypeFilter] = useState<'TODOS' | 'Formação' | 'Ensino Continuado'>('TODOS');

  // Students for selected class
  const [classStudents, setClassStudents] = useState<StudentData[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Attendance & Shot Map state: { [studentId]: { present: boolean, shots: number, lane: number, status: 'present'|'absent'|'excused'|'late' } }
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { present: boolean; shots: number; status: 'present' | 'absent' | 'excused'; note?: string }>>({});

  // Active Tab: 'calendario' | 'alunos' | 'lancar-geral'
  const [activeTab, setActiveTab] = useState<'calendario' | 'alunos' | 'lancar-geral'>('calendario');

  // --- MODAL / SUB-FORM STATES ---
  // Add Student
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'batch'>('single');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentMasp, setNewStudentMasp] = useState('');
  const [newStudentBatchText, setNewStudentBatchText] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  // Single Student Lessons & Grades
  const [selectedStudentForLessons, setSelectedStudentForLessons] = useState<StudentData | null>(null);
  const [studentLessons, setStudentLessons] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // Lesson Form for Student
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonName, setLessonName] = useState('');
  const [lessonNumber, setLessonNumber] = useState<number>(1);
  const [lessonGrade, setLessonGrade] = useState('');
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().split('T')[0]);
  const [lessonTime, setLessonTime] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  const [lessonContent, setLessonContent] = useState('');
  const [lessonObs, setLessonObs] = useState('');
  const [savingLesson, setSavingLesson] = useState(false);

  // Batch Lesson Entry for Whole Class
  const [batchLessonName, setBatchLessonName] = useState('');
  const [batchLessonNumber, setBatchLessonNumber] = useState<number>(1);
  const [batchLessonDate, setBatchLessonDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchLessonTime, setBatchLessonTime] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  const [batchLessonContent, setBatchLessonContent] = useState('');
  const [savingBatchLesson, setSavingBatchLesson] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState('');

  // Transfer Student Modal
  const [transferStudent, setTransferStudent] = useState<StudentData | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Status Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Load Turmas and Courses from server
  const loadTurmas = async () => {
    try {
      await storage.refreshFromServer();
      const classes = storage.getCourseClasses();
      setCourseClasses(classes);
      const courses = storage.getAcademyCourses();
      setAcademyCourses(courses);
      if (classes.length > 0 && !selectedClassId) {
        setSelectedClassId(classes[0].id);
        setSelectedClass(classes[0]);
      }
    } catch (err) {
      console.error('Error loading turmas:', err);
    }
  };

  const filteredAcademyCourses = academyCourses.filter((c) => {
    const matchesSearch =
      !courseSearch ||
      c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(courseSearch.toLowerCase()) ||
      (c.subject && c.subject.toLowerCase().includes(courseSearch.toLowerCase()));

    const matchesType =
      courseTypeFilter === 'TODOS' || c.type === courseTypeFilter;

    const matchesCareer =
      courseCareerFilter === 'TODAS' || c.career === courseCareerFilter;

    return matchesSearch && matchesType && matchesCareer;
  });

  // Load Students for current Turma
  const loadStudents = async (turmaObj?: CourseClass) => {
    const targetTurma = turmaObj || selectedClass;
    if (!targetTurma) return;

    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/course-classes/${targetTurma.id}/students`);
      if (res.ok) {
        const data = await res.json();
        const list: StudentData[] = data || [];
        setClassStudents(list);

        // Initialize attendance map if empty or update missing entries
        setAttendanceMap(prev => {
          const next = { ...prev };
          list.forEach((st) => {
            if (!next[st.id]) {
              next[st.id] = { present: true, shots: 0, status: 'present' };
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Error loading class students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadTurmas();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedClassId) {
      const found = courseClasses.find(c => c.id === selectedClassId) || null;
      setSelectedClass(found);
      if (found) {
        loadStudents(found);
      }
    }
  }, [selectedClassId]);

  // --- LOGIN SUBMIT ---
  const handleMobileLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!maspInput.trim() || !passwordInput.trim()) {
      setAuthError('Preencha o MASP e a senha para acessar.');
      return;
    }

    setAuthenticating(true);
    try {
      const res = await storage.login(maspInput.trim(), passwordInput.trim());
      if (!res.success || !res.user) {
        setAuthError(res.error || 'MASP ou senha incorretos.');
        setAuthenticating(false);
        return;
      }

      setAuthenticatedUser(res.user);
      setIsAuthenticated(true);
      setAuthError('');
    } catch (err: any) {
      setAuthError('Erro ao autenticar. Verifique sua conexão.');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogoutClass = () => {
    setIsAuthenticated(false);
    setPasswordInput('');
    setAuthenticatedUser(null);
  };

  // --- STUDENT CREATION ---
  const handleAddStudents = async () => {
    if (!selectedClass) return;
    setAddingStudent(true);

    try {
      if (addMode === 'batch') {
        const lines = newStudentBatchText
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        if (lines.length === 0) {
          showFeedback('Cole ao menos um nome de aluno.', 'error');
          setAddingStudent(false);
          return;
        }

        let addedCount = 0;
        for (const lineName of lines) {
          await fetch(`/api/course-classes/${selectedClass.id}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turmaCode: selectedClass.code || `${selectedClass.careerAbbreviation}-${selectedClass.turmaNumber}`,
              courseCode: selectedClass.courseId || selectedClass.courseName,
              nomeAluno: lineName,
              teacherName: selectedClass.teacherName || currentUser.name
            })
          });
          addedCount++;
        }

        showFeedback(`${addedCount} aluno(s) cadastrado(s) na turma!`);
        setNewStudentBatchText('');
      } else {
        if (!newStudentName.trim()) {
          showFeedback('Informe o nome do aluno.', 'error');
          setAddingStudent(false);
          return;
        }

        await fetch(`/api/course-classes/${selectedClass.id}/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turmaCode: selectedClass.code || `${selectedClass.careerAbbreviation}-${selectedClass.turmaNumber}`,
            courseCode: selectedClass.courseId || selectedClass.courseName,
            nomeAluno: newStudentName.trim(),
            maspAluno: newStudentMasp.trim() || undefined,
            teacherName: selectedClass.teacherName || currentUser.name
          })
        });

        showFeedback('Aluno cadastrado com sucesso!');
        setNewStudentName('');
        setNewStudentMasp('');
      }

      setShowAddStudent(false);
      await loadStudents();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showFeedback('Erro ao cadastrar alunos.', 'error');
    } finally {
      setAddingStudent(false);
    }
  };

  // --- STUDENT LESSONS MANAGEMENT ---
  const handleOpenStudentLessons = async (stu: StudentData) => {
    setSelectedStudentForLessons(stu);
    setLoadingLessons(true);
    setEditingLessonId(null);
    setLessonName('');
    setLessonNumber(1);
    setLessonGrade('');
    setLessonContent('');
    setLessonObs('');

    try {
      const res = await fetch(`/api/course-students/${stu.id}/lessons`);
      if (res.ok) {
        const data = await res.json();
        setStudentLessons(data || []);
      }
    } catch (err) {
      console.error('Error fetching student lessons:', err);
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleSaveStudentLesson = async () => {
    if (!selectedStudentForLessons || !lessonName.trim()) {
      showFeedback('Informe o nome da aula.', 'error');
      return;
    }

    if (lessonContent.length > 500) {
      showFeedback('Conteúdo não pode exceder 500 caracteres.', 'error');
      return;
    }

    setSavingLesson(true);
    try {
      if (editingLessonId) {
        await fetch(`/api/student-lessons/${editingLessonId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aulaNomeAluno: lessonName.trim(),
            aulaNumeroAluno: lessonNumber,
            notaAluno: lessonGrade.trim() || undefined,
            aulaDataAluno: lessonDate,
            aulaHoraAluno: lessonTime,
            aulaConteudoAluno: lessonContent.slice(0, 500),
            observacaoAluno: lessonObs.trim() || undefined
          })
        });
        showFeedback('Aula/Nota atualizada com sucesso!');
      } else {
        await fetch(`/api/course-students/${selectedStudentForLessons.id}/lessons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aulaNomeAluno: lessonName.trim(),
            aulaNumeroAluno: lessonNumber,
            notaAluno: lessonGrade.trim() || undefined,
            aulaDataAluno: lessonDate,
            aulaHoraAluno: lessonTime,
            aulaConteudoAluno: lessonContent.slice(0, 500),
            observacaoAluno: lessonObs.trim() || undefined
          })
        });
        showFeedback('Aula/Nota lançada para o aluno!');
      }

      setEditingLessonId(null);
      setLessonName('');
      setLessonGrade('');
      setLessonContent('');
      setLessonObs('');

      // Reload lessons for student
      const res = await fetch(`/api/course-students/${selectedStudentForLessons.id}/lessons`);
      if (res.ok) {
        setStudentLessons(await res.json());
      }
      loadStudents();
    } catch (err) {
      showFeedback('Erro ao salvar aula.', 'error');
    } finally {
      setSavingLesson(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Deseja realmente apagar esta aula?')) return;
    try {
      await fetch(`/api/student-lessons/${lessonId}`, { method: 'DELETE' });
      showFeedback('Aula removida com sucesso!');
      if (selectedStudentForLessons) {
        const res = await fetch(`/api/course-students/${selectedStudentForLessons.id}/lessons`);
        if (res.ok) {
          setStudentLessons(await res.json());
        }
      }
      loadStudents();
    } catch (err) {
      showFeedback('Erro ao excluir aula.', 'error');
    }
  };

  // --- BATCH LESSON FOR ALL PRESENT STUDENTS ---
  const handleSaveBatchLesson = async () => {
    if (!selectedClass || !batchLessonName.trim()) {
      showFeedback('Informe o nome da aula.', 'error');
      return;
    }

    if (batchLessonContent.length > 500) {
      showFeedback('Conteúdo não pode ultrapassar 500 caracteres.', 'error');
      return;
    }

    // Filter present students
    const presentStudents = classStudents.filter(st => {
      const att = attendanceMap[st.id];
      return !att || att.status === 'present';
    });

    if (presentStudents.length === 0) {
      showFeedback('Nenhum aluno presente na chamada para lançar aula.', 'error');
      return;
    }

    setSavingBatchLesson(true);
    setBatchSuccessMsg('');

    try {
      let count = 0;
      for (const stu of presentStudents) {
        await fetch(`/api/course-students/${stu.id}/lessons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aulaNomeAluno: batchLessonName.trim(),
            aulaNumeroAluno: batchLessonNumber,
            aulaDataAluno: batchLessonDate,
            aulaHoraAluno: batchLessonTime,
            aulaConteudoAluno: batchLessonContent.slice(0, 500)
          })
        });
        count++;
      }

      setBatchSuccessMsg(`✅ Aula lançada para todos os ${count} alunos presentes da turma!`);
      showFeedback(`Aula registrada para ${count} alunos com sucesso!`);
      setBatchLessonName('');
      setBatchLessonContent('');
      loadStudents();
    } catch (err) {
      showFeedback('Erro ao registrar aula em lote.', 'error');
    } finally {
      setSavingBatchLesson(false);
    }
  };

  // --- TRANSFER STUDENT ---
  const handleExecuteTransfer = async () => {
    if (!transferStudent || !transferTargetClassId) return;
    const targetC = courseClasses.find(c => c.id === transferTargetClassId);
    if (!targetC) return;

    setTransferring(true);
    try {
      const newCode = targetC.code || `${targetC.careerAbbreviation}-${targetC.turmaNumber}`;
      const newCourseCode = targetC.courseId || targetC.courseName;

      await fetch(`/api/course-students/${transferStudent.id}/transfer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newTurmaId: targetC.id,
          newTurmaCode: newCode,
          newCourseCode: newCourseCode,
          newTeacherName: targetC.teacherName
        })
      });

      showFeedback(`Aluno transferido para Turma ${newCode}!`);
      setTransferStudent(null);
      setTransferTargetClassId('');
      loadStudents();
    } catch (err) {
      showFeedback('Erro ao transferir aluno.', 'error');
    } finally {
      setTransferring(false);
    }
  };

  // Total calculations
  const attList = Object.values(attendanceMap);
  const totalPresent = attList.filter((a: any) => a.status === 'present').length;
  const totalAbsent = attList.filter((a: any) => a.status === 'absent').length;
  const totalExcused = attList.filter((a: any) => a.status === 'excused').length;
  const totalShotsFired = attList.reduce((acc: number, curr: any) => acc + (curr.shots || 0), 0);

  // Search filtered students
  const filteredStudents = classStudents.filter(s =>
    s.nomeAluno.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.maspAluno && s.maspAluno.includes(studentSearch))
  );

  // --- VIEW 1: AUTHENTICATION LOCK SCREEN (SOLICITE USUÁRIO E SENHA) ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative font-sans">
        {/* Glow background */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 relative z-10">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
              <Smartphone className="w-7 h-7" />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase tracking-widest font-bold text-amber-400 font-mono">
                ACADEPOL • PAINEL MÓVEL
              </span>
              <h2 className="text-xl font-extrabold text-slate-100">
                Iniciar Aula no Estande
              </h2>
              <p className="text-xs text-slate-400">
                Acesso restrito ao instrutor para gestão do mapa da pista e chamada da turma.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleMobileLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                MASP do Instrutor / Policial *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={maspInput}
                  onChange={(e) => setMaspInput(e.target.value)}
                  placeholder="Ex: 1234567"
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-100 font-mono font-bold focus:border-amber-500 focus:outline-none transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Senha do Sistema *
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-100 font-mono focus:border-amber-500 focus:outline-none transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authenticating}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm py-3.5 px-4 rounded-2xl transition shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{authenticating ? 'Autenticando...' : '🔓 Autenticar e Iniciar Aula'}</span>
            </button>
          </form>

          {/* Footer Notice */}
          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-[10px] text-slate-500">
              Interface tática exclusiva para smartphones • Armeria PC
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: AUTHENTICATED MOBILE INTERFACE FOR CLASS & MAP MANAGEMENT ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-24 max-w-md mx-auto relative shadow-2xl border-x border-slate-900">
      
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center space-x-2 transition-all ${
          feedbackMsg.type === 'success' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-600 text-white'
        }`}>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* TOP HEADER - MOBILE COMPACT */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-3.5 sticky top-0 z-40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/30">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider font-mono block">
                MODO CELULAR • CALENDÁRIO & CURSOS
              </span>
              <h1 className="text-sm font-extrabold text-slate-100 leading-tight">
                {authenticatedUser?.name || currentUser.name}
              </h1>
            </div>
          </div>

          <button
            onClick={handleLogoutClass}
            className="p-2 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 rounded-xl text-xs flex items-center space-x-1 border border-slate-700/60 transition"
            title="Sair do modo celular"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Sair</span>
          </button>
        </div>

        {/* SELECT TURMA SELECTOR */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
            Turma Ativa em Instrução:
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-bold text-amber-400 focus:outline-none font-mono"
          >
            {courseClasses.length === 0 ? (
              <option value="">Nenhuma turma cadastrada</option>
            ) : (
              courseClasses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code || `${c.careerAbbreviation}-${c.turmaNumber}`} • Prof. {c.teacherName || 'ACADEPOL'} ({c.career})
                </option>
              ))
            )}
          </select>
        </div>

        {/* QUICK STATS BAR */}
        {selectedClass && (
          <div className="grid grid-cols-4 gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-center font-mono text-[10px]">
            <div>
              <span className="text-slate-500 block text-[9px]">TOTAL</span>
              <span className="font-bold text-slate-200">{classStudents.length}</span>
            </div>
            <div>
              <span className="text-emerald-400 block text-[9px]">PRESENTES</span>
              <span className="font-bold text-emerald-400">{totalPresent}</span>
            </div>
            <div>
              <span className="text-rose-400 block text-[9px]">FALTAS</span>
              <span className="font-bold text-rose-400">{totalAbsent}</span>
            </div>
            <div>
              <span className="text-cyan-400 block text-[9px]">TIROS</span>
              <span className="font-bold text-cyan-400">{totalShotsFired} un</span>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA BY TAB */}
      <main className="p-3.5 space-y-4">
        
        {/* TAB 1: CALENDÁRIO DE CURSOS E CRONOGRAMA */}
        {activeTab === 'calendario' && (
          <div className="space-y-3.5">
            {/* Header / Search */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Calendário de Cursos & Cronograma
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  ACADEPOL 2026
                </span>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Buscar curso, código, carreira ou professor..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Filters: Type & Career */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[10px]">
                  <span className="text-slate-400 font-bold shrink-0 mr-1">Tipo:</span>
                  {(['TODOS', 'Formação', 'Ensino Continuado'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCourseTypeFilter(t)}
                      className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition ${
                        courseTypeFilter === t
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[10px]">
                  <span className="text-slate-400 font-bold shrink-0 mr-1">Carreira:</span>
                  {['TODAS', 'Delegado', 'Investigador', 'Escrivão', 'Perito', 'Médico Legista'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCourseCareerFilter(c)}
                      className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition ${
                        courseCareerFilter === c
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* LIST OF COURSES / TURMAS IN CALENDAR */}
            <div className="space-y-3">
              {filteredAcademyCourses.length === 0 && courseClasses.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs space-y-2">
                  <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="font-semibold text-slate-400">Nenhum curso encontrado no calendário.</p>
                  <p className="text-[11px] text-slate-500">Cadastre cursos na gestão da ACADEPOL para visualizar o cronograma completo aqui.</p>
                </div>
              ) : (
                filteredAcademyCourses.map((c) => {
                  const linkedClasses = courseClasses.filter(
                    (cc) => cc.courseId === c.id || cc.courseName === c.name || (c.code && cc.code?.includes(c.code))
                  );

                  return (
                    <div
                      key={c.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-md hover:border-slate-700 transition"
                    >
                      {/* Badges & Type */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${
                              c.type === 'Formação'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {c.type}
                          </span>
                          {c.career && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {c.career}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] font-bold text-amber-400">{c.code}</span>
                      </div>

                      {/* Title & Subject */}
                      <div>
                        <h4 className="font-extrabold text-slate-100 text-xs leading-snug">{c.name}</h4>
                        {c.subject && <p className="text-[11px] text-slate-400 mt-0.5">Disciplina: {c.subject}</p>}
                      </div>

                      {/* Course Dates / Period Info */}
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 space-y-1.5 text-[10px]">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="font-semibold">Período / Datas:</span>
                          <span className="font-mono font-bold text-slate-100">
                            {c.type === 'Formação'
                              ? (c.startDate && c.endDate ? `${c.startDate} até ${c.endDate}` : 'Período Regulamentar')
                              : (c.dates && c.dates.length > 0 ? c.dates.join(', ') : `${c.durationDays || 5} dias`)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-slate-400">
                          <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>Unidade: {c.departmentName || c.teachingDepartmentName || 'ACADEPOL / Estande'}</span>
                        </div>
                      </div>

                      {/* Linked Turmas */}
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Turmas em Instrução ({linkedClasses.length}):
                        </p>
                        {linkedClasses.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic">Nenhuma turma cadastrada neste curso ainda.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {linkedClasses.map((turma) => (
                              <div
                                key={turma.id}
                                className={`flex items-center justify-between p-2 rounded-xl border transition ${
                                  selectedClassId === turma.id
                                    ? 'bg-amber-500/10 border-amber-500/40'
                                    : 'bg-slate-950/60 border-slate-800'
                                }`}
                              >
                                <div>
                                  <p className="font-bold text-slate-200 text-xs">
                                    Turma {turma.code || `${turma.careerAbbreviation}-${turma.turmaNumber}`}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    Prof. {turma.teacherName || 'ACADEPOL'} • {turma.studentCount || 0} Alunos
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setSelectedClassId(turma.id);
                                    setSelectedClass(turma);
                                    setActiveTab('alunos');
                                    showFeedback(`Turma ${turma.code || turma.id} selecionada.`);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition ${
                                    selectedClassId === turma.id
                                      ? 'bg-amber-500 text-slate-950 font-extrabold'
                                      : 'bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-slate-700'
                                  }`}
                                >
                                  <span>{selectedClassId === turma.id ? '✓ Ativa' : 'Selecionar'}</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* ALL TURMAS CALENDAR SCHEDULE */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-indigo-400" />
                    <span>Todas as Turmas Ativas ({courseClasses.length})</span>
                  </h4>
                </div>

                {courseClasses.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-2">Nenhuma turma cadastrada no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {courseClasses.map((tc) => (
                      <div
                        key={tc.id}
                        onClick={() => {
                          setSelectedClassId(tc.id);
                          setSelectedClass(tc);
                          setActiveTab('alunos');
                          showFeedback(`Turma ${tc.code || tc.id} ativada.`);
                        }}
                        className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          selectedClassId === tc.id
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-xs">
                              {tc.code || `Turma ${tc.turmaNumber}`}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {tc.career}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {tc.courseName} • Prof. {tc.teacherName || 'ACADEPOL'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold font-mono text-cyan-400 block">
                            {tc.studentCount || 0} Alunos
                          </span>
                          <span className="text-[9px] text-amber-400 font-semibold">
                            {selectedClassId === tc.id ? '● Selecionada' : 'Toque p/ Abrir'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GESTÃO DE ALUNOS DA TURMA */}
        {activeTab === 'alunos' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Alunos da Turma ({classStudents.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 shadow transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar por aluno ou MASP..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Student List Cards */}
            {filteredStudents.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs">
                Nenhum aluno encontrado.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStudents.map((st, idx) => (
                  <div key={st.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-extrabold text-slate-100 text-xs">{st.nomeAluno}</p>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            {st.maspAluno && <span>MASP: {st.maspAluno}</span>}
                            <span className="text-emerald-400 font-bold">• {st.situacaoAluno || 'Ativo'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenStudentLessons(st)}
                        className="bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center space-x-1 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Aulas & Notas</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTransferStudent(st);
                          setTransferTargetClassId('');
                        }}
                        className="bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center space-x-1 transition"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                        <span>Mudar Turma</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LANÇAR AULA GERAL EM LOTE */}
        {activeTab === 'lancar-geral' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-2.5">
              <ClipboardList className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Lançar Aula para Toda a Turma
                </h3>
                <p className="text-[10px] text-slate-400">
                  Aplica o registro de aula para todos os alunos marcados como presentes.
                </p>
              </div>
            </div>

            {batchSuccessMsg && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-semibold">
                {batchSuccessMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Nome da Aula / Matéria *
                </label>
                <input
                  type="text"
                  value={batchLessonName}
                  onChange={(e) => setBatchLessonName(e.target.value)}
                  placeholder="Ex: Manejo Tático e Tiromêtro 9mm"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nº da Aula</label>
                  <input
                    type="number"
                    min={1}
                    value={batchLessonNumber}
                    onChange={(e) => setBatchLessonNumber(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data da Aula</label>
                  <input
                    type="date"
                    value={batchLessonDate}
                    onChange={(e) => setBatchLessonDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-semibold text-slate-300">
                    Conteúdo Ministrado (até 500 caracteres)
                  </label>
                  <span className={`text-[10px] font-mono ${
                    batchLessonContent.length > 500 ? 'text-rose-400 font-bold' : 'text-slate-500'
                  }`}>
                    {batchLessonContent.length}/500
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={batchLessonContent}
                  onChange={(e) => setBatchLessonContent(e.target.value.slice(0, 500))}
                  placeholder="Resumo dos tópicos práticos ministrados..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveBatchLesson}
                disabled={savingBatchLesson || !batchLessonName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-3 px-4 rounded-xl transition shadow flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{savingBatchLesson ? 'Registrando...' : '🚀 Lançar Aula para Alunos Presentes'}</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* MODAL: ADD STUDENT */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Cadastrar Aluno na Turma</span>
              </h4>
              <button onClick={() => setShowAddStudent(false)} className="text-slate-400">✕</button>
            </div>

            {/* Mode switch */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAddMode('single')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition ${
                  addMode === 'single' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Individual
              </button>
              <button
                type="button"
                onClick={() => setAddMode('batch')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition ${
                  addMode === 'batch' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Em Lote (Vários)
              </button>
            </div>

            {addMode === 'single' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Nome do aluno"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">MASP (Opcional)</label>
                  <input
                    type="text"
                    value={newStudentMasp}
                    onChange={(e) => setNewStudentMasp(e.target.value)}
                    placeholder="Ex: 1234567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <label className="block font-semibold text-slate-300">
                  Insira os nomes (um por linha):
                </label>
                <textarea
                  rows={5}
                  value={newStudentBatchText}
                  onChange={(e) => setNewStudentBatchText(e.target.value)}
                  placeholder={'Carlos Silva\nMariana Santos\nPedro Henrique'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddStudent(false)}
                className="px-3 py-1.5 text-xs text-slate-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddStudents}
                disabled={addingStudent}
                className="bg-amber-500 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-xl disabled:opacity-50"
              >
                {addingStudent ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LESSONS & GRADES FOR SINGLE STUDENT */}
      {selectedStudentForLessons && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-md my-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-indigo-400">
                <BookOpen className="w-4 h-4" />
                <h4 className="text-xs font-bold text-slate-100">
                  Aulas e Notas - {selectedStudentForLessons.nomeAluno}
                </h4>
              </div>
              <button onClick={() => setSelectedStudentForLessons(null)} className="text-slate-400">✕</button>
            </div>

            {/* Lesson Form */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3 text-xs">
              <span className="font-bold text-indigo-300 text-[11px] block">
                {editingLessonId ? 'Editar Registro de Aula' : 'Novo Lançamento de Aula/Nota'}
              </span>

              <div>
                <label className="block text-slate-400 mb-0.5">Nome da Aula *</label>
                <input
                  type="text"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  placeholder="Ex: Manejo de Pistola / Tiromêtro"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-0.5">Nº Aula</label>
                  <input
                    type="number"
                    min={1}
                    value={lessonNumber}
                    onChange={(e) => setLessonNumber(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Nota</label>
                  <input
                    type="text"
                    value={lessonGrade}
                    onChange={(e) => setLessonGrade(e.target.value)}
                    placeholder="Ex: 9.5"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-amber-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-0.5">
                  <label className="block text-slate-400">Conteúdo (até 500 chars)</label>
                  <span className={`text-[9px] font-mono ${lessonContent.length > 500 ? 'text-rose-400' : 'text-slate-500'}`}>
                    {lessonContent.length}/500
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={lessonContent}
                  onChange={(e) => setLessonContent(e.target.value.slice(0, 500))}
                  placeholder="Resumo do conteúdo ministrado..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveStudentLesson}
                disabled={savingLesson || !lessonName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2 rounded-xl transition disabled:opacity-50"
              >
                {savingLesson ? 'Salvando...' : (editingLessonId ? 'Atualizar Aula' : 'Salvar Aula')}
              </button>
            </div>

            {/* Existing Lessons List */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-300 block">
                Histórico de Aulas ({studentLessons.length})
              </span>

              {loadingLessons ? (
                <p className="text-xs text-amber-400 animate-pulse text-center">Carregando...</p>
              ) : studentLessons.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-2">Nenhuma aula registrada ainda.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {studentLessons.map(les => (
                    <div key={les.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-slate-100">Aula #{les.aulaNumeroAluno} - {les.aulaNomeAluno}</span>
                          {les.notaAluno && (
                            <span className="ml-2 bg-amber-950 text-amber-400 border border-amber-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                              Nota: {les.notaAluno}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteLesson(les.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {les.aulaConteudoAluno && (
                        <p className="text-[10px] text-slate-400 bg-slate-900/60 p-1.5 rounded">{les.aulaConteudoAluno}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedStudentForLessons(null)}
                className="bg-slate-800 text-slate-200 font-bold text-xs px-4 py-1.5 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFER STUDENT */}
      {transferStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                <ArrowRightLeft className="w-4 h-4" />
                <span>Transferir Aluno</span>
              </h4>
              <button onClick={() => setTransferStudent(null)} className="text-slate-400">✕</button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
              <p className="text-slate-400 font-semibold">Aluno:</p>
              <p className="font-bold text-slate-100">{transferStudent.nomeAluno}</p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-300">Nova Turma de Destino *</label>
              <select
                value={transferTargetClassId}
                onChange={(e) => setTransferTargetClassId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs font-mono"
              >
                <option value="">-- Selecione a Turma --</option>
                {courseClasses
                  .filter(c => c.id !== selectedClassId)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      Turma {c.code || `${c.careerAbbreviation}-${c.turmaNumber}`} ({c.career})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setTransferStudent(null)}
                className="px-3 py-1.5 text-xs text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteTransfer}
                disabled={transferring || !transferTargetClassId}
                className="bg-amber-500 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-xl disabled:opacity-50"
              >
                {transferring ? 'Transferindo...' : 'Transferir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM FIXED NAVIGATION BAR (MOBILE SMARTPHONE DEDICATED) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80 px-4 py-2 flex items-center justify-around z-40 shadow-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('calendario')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition ${
            activeTab === 'calendario'
              ? 'text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-[10px]">Calendário de Cursos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alunos')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition ${
            activeTab === 'alunos'
              ? 'text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px]">Alunos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('lancar-geral')}
          className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-2xl transition ${
            activeTab === 'lancar-geral'
              ? 'text-indigo-400 font-extrabold bg-indigo-500/10 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">Lançar Aula</span>
        </button>
      </nav>

    </div>
  );
};
