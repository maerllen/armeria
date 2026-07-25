import React, { useState } from 'react';
import {
  User,
  Weapon,
  AmmunitionStock,
  VaultSpace,
  Department,
  Unit,
  AcademyCourse,
  WeaponBox,
  WeaponBoxReplacement,
  CourseClass,
  CourseMovement
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
  FileText
} from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { AcademyReceiptModal } from './AcademyReceiptModal';

interface AcademyModuleProps {
  currentUser: User;
  users: User[];
  weapons: Weapon[];
  ammoStocks: AmmunitionStock[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const AcademyModule: React.FC<AcademyModuleProps> = ({
  currentUser,
  users,
  weapons,
  ammoStocks,
  vaultSpaces,
  departments,
  units,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'movements' | 'turmas' | 'caixas' | 'cursos'>('movements');

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
  const weaponBoxes = storage.getWeaponBoxes();
  const boxReplacements = storage.getWeaponBoxReplacements();
  const courseClasses = storage.getCourseClasses();
  const courseMovements = storage.getCourseMovements();

  // Feedback messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'course' | 'box' | 'class'; id: string; name: string } | null>(null);

  // Selected receipt for printing
  const [selectedReceiptMovement, setSelectedReceiptMovement] = useState<CourseMovement | null>(null);

  // Teachers list
  const teachers = users.filter(u => u.isTeacher || u.role === 'Geral' || u.role === 'Administrador' || u.role === 'Armeiro');

  // Available weapons for boxes or movements
  const availableWeapons = weapons.filter(w => w.status === 'Disponível' || w.status === 'No Cofre');

  // --- 1. COURSE FORM STATE ---
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AcademyCourse | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseType, setCourseType] = useState<'Formação' | 'Ensino Continuado'>('Formação');
  const [courseCode, setCourseCode] = useState('');

  const handleOpenCourseModal = (course?: AcademyCourse) => {
    if (course) {
      setEditingCourse(course);
      setCourseName(course.name);
      setCourseType(course.type);
      setCourseCode(course.code || '');
    } else {
      setEditingCourse(null);
      setCourseName('');
      setCourseType('Formação');
      setCourseCode('');
    }
    setShowCourseModal(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) return;
    try {
      const res = await storage.saveAcademyCourse({
        id: editingCourse?.id,
        name: courseName.trim(),
        type: courseType,
        code: courseCode.trim()
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
    const oldDesc = oldW ? `${oldW.type} ${oldW.brand} ${oldW.model} (${oldW.serialNumber})` : oldWeaponId;
    const newDesc = newW ? `${newW.type} ${newW.brand} ${newW.model} (${newW.serialNumber})` : newWeaponId;

    try {
      const res = await storage.replaceWeaponInBox(
        replaceBox.id,
        oldWeaponId,
        oldDesc,
        newWeaponId,
        newDesc,
        replaceReason.trim(),
        replaceTeacherName.trim()
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
  const [classCourseId, setClassCourseId] = useState('');
  const [classCareer, setClassCareer] = useState('Delegado');
  const [classNameStr, setClassNameStr] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');
  const [classSubject, setClassSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');
  const [classStudentCount, setClassStudentCount] = useState<number>(20);

  const handleOpenClassModal = (cls?: CourseClass) => {
    if (cls) {
      setEditingClass(cls);
      setClassCourseId(cls.courseId);
      setClassCareer(cls.career);
      setClassNameStr(cls.name);
      setClassTeacherId(cls.teacherUserId);
      setClassSubject(cls.subject);
      setClassStudentCount(cls.studentCount);
    } else {
      setEditingClass(null);
      setClassCourseId(academyCourses[0]?.id || '');
      setClassCareer('Delegado');
      setClassNameStr('');
      setClassTeacherId(teachers[0]?.id || '');
      setClassSubject('MEAF');
      setClassStudentCount(20);
    }
    setShowClassModal(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classCourseId || !classNameStr.trim()) return;
    const selectedCourse = academyCourses.find(c => c.id === classCourseId);
    const selectedTeacher = teachers.find(t => t.id === classTeacherId);

    try {
      const res = await storage.saveCourseClass({
        id: editingClass?.id,
        courseId: classCourseId,
        courseName: selectedCourse?.name || '',
        career: classCareer,
        name: classNameStr.trim(),
        teacherUserId: classTeacherId,
        teacherName: selectedTeacher?.name || 'Professor',
        subject: classSubject,
        studentCount: Number(classStudentCount) || 0
      });
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Turma salva com sucesso!');
      setShowClassModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar turma.');
    }
  };

  // --- 4. COURSE MOVEMENT (SAÍDA / RETORNO) STATE ---
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movClassId, setMovClassId] = useState('');
  const [movBoxId, setMovBoxId] = useState('');
  const [movAmmoStockId, setMovAmmoStockId] = useState('');
  const [movAmmoQuantity, setMovAmmoQuantity] = useState<number>(0);
  const [movRecipientType, setMovRecipientType] = useState<'inside' | 'outside'>('inside');
  const [movTeacherUserId, setMovTeacherUserId] = useState('');
  const [movTeacherNameOutside, setMovTeacherNameOutside] = useState('');
  const [movNotes, setMovNotes] = useState('');

  // Retorno modal
  const [showRetornoModal, setShowRetornoModal] = useState(false);
  const [retornoMovement, setRetornoMovement] = useState<CourseMovement | null>(null);
  const [retornoAmmoReturned, setRetornoAmmoReturned] = useState<number>(0);
  const [retornoUserName, setRetornoUserName] = useState('');

  const handleOpenSaidaModal = () => {
    setErrorMsg('');
    setMovClassId(courseClasses[0]?.id || '');
    setMovBoxId('');
    setMovAmmoStockId(ammoStocks[0]?.id || '');
    setMovAmmoQuantity(0);
    setMovRecipientType('inside');
    setMovTeacherUserId(teachers[0]?.id || '');
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

    let teacherName = '';
    if (movRecipientType === 'inside') {
      const tUser = users.find(u => u.id === movTeacherUserId);
      teacherName = tUser ? tUser.name : 'Professor';
    } else {
      if (!movTeacherNameOutside.trim()) {
        alert('Informe o nome do responsável fora do sistema.');
        return;
      }
      teacherName = movTeacherNameOutside.trim() + ' (Fora do Sistema)';
    }

    const selectedBox = weaponBoxes.find(b => b.id === movBoxId);
    const selectedAmmo = ammoStocks.find(a => a.id === movAmmoStockId);

    try {
      const res = await storage.darSaidaCurso({
        classId: selectedClass.id,
        className: selectedClass.name,
        courseName: selectedClass.courseName,
        career: selectedClass.career,
        subject: selectedClass.subject,
        teacherName,
        teacherUserId: movRecipientType === 'inside' ? movTeacherUserId : undefined,
        boxId: selectedBox ? selectedBox.id : undefined,
        boxName: selectedBox ? selectedBox.name : undefined,
        ammoStockId: selectedAmmo ? selectedAmmo.id : undefined,
        ammoCaliber: selectedAmmo ? selectedAmmo.caliber : undefined,
        ammoQuantity: Number(movAmmoQuantity) || 0,
        notes: movNotes.trim(),
        issuedByUserId: currentUser.id,
        issuedByUserName: currentUser.name
      });

      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Saída para aula realizada com sucesso!');
      setShowMovementModal(false);
      onRefresh();

      // Find created movement for receipt print
      const createdMov = storage.getCourseMovements().find(m => m.id === res.id);
      if (createdMov) {
        setSelectedReceiptMovement(createdMov);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao dar saída para aula.');
    }
  };

  const handleOpenRetornoModal = (mov: CourseMovement) => {
    setRetornoMovement(mov);
    setRetornoAmmoReturned(mov.ammoQuantity); // Default all returned
    setRetornoUserName(mov.teacherName);
    setShowRetornoModal(true);
  };

  const handleExecuteRetorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retornoMovement) return;

    try {
      const res = await storage.darRetornoCurso(
        retornoMovement.id,
        Number(retornoAmmoReturned) || 0,
        retornoUserName.trim()
      );
      if (!res.success) throw new Error(res.error);
      setSuccessMsg('Devolução de aula efetuada e estoque atualizado com sucesso!');
      setShowRetornoModal(false);
      onRefresh();

      // Show receipt modal
      const updatedMov = storage.getCourseMovements().find(m => m.id === retornoMovement.id);
      if (updatedMov) {
        setSelectedReceiptMovement(updatedMov);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao efetuar devolução de aula.');
    }
  };

  // Delete handler
  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'course') await storage.deleteAcademyCourse(deleteTarget.id);
      if (deleteTarget.type === 'box') await storage.deleteWeaponBox(deleteTarget.id);
      if (deleteTarget.type === 'class') await storage.deleteCourseClass(deleteTarget.id);
      setSuccessMsg('Item excluído com sucesso.');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir item.');
    } finally {
      setDeleteTarget(null);
    }
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
            <h1 className="text-xl font-bold text-slate-100">Academia de Polícia Civil • Gestão de Cursos e Aulas</h1>
            <p className="text-xs text-slate-400">
              Controle de turmas, caixas de armamento para instruções, saídas e mapas de aula com balanço de munições
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
            <span>Mapas de Aula ({courseMovements.length})</span>
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
            <span>Turmas ({courseClasses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('caixas')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'caixas'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Caixas de Armas ({weaponBoxes.length})</span>
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
            <span>Cursos ({academyCourses.length})</span>
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
              <h2 className="text-sm font-bold text-slate-100">Saídas e Retornos para Aulas da Academia</h2>
              <p className="text-xs text-slate-400">
                Lançamento de saídas de armamentos e munições para instrução prática com retorno de insumos não utilizados
              </p>
            </div>
            <button
              onClick={handleOpenSaidaModal}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Saída para Aula</span>
            </button>
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
                  {courseMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        Nenhuma movimentação de aula registrada.
                      </td>
                    </tr>
                  ) : (
                    courseMovements.map((mov) => {
                      const isEmAula = mov.status === 'Em Sala de Aula';
                      const ammoRet = mov.ammoReturned || 0;
                      const ammoUsed = mov.ammoQuantity - ammoRet;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-800/50 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-100">{mov.className}</div>
                            <div className="text-[11px] text-amber-400 font-mono">{mov.courseName}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{mov.career}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Disciplina: {mov.subject}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{mov.teacherName}</div>
                            <div className="text-[10px] text-slate-400">Por: {mov.issuedByUserName}</div>
                          </td>
                          <td className="py-3 px-4">
                            {mov.boxName ? (
                              <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded font-mono text-[11px] font-semibold border border-slate-700">
                                {mov.boxName}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Sem caixa</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {mov.ammoQuantity > 0 ? (
                              <div>
                                <div className="text-slate-100 font-bold">{mov.ammoQuantity} un ({mov.ammoCaliber})</div>
                                {!isEmAula && (
                                  <div className="text-[10px] text-emerald-400">
                                    Devolvido: {ammoRet} un • Usado: {ammoUsed} un
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Sem munição</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                isEmAula
                                  ? 'bg-amber-950/80 text-amber-400 border-amber-800 animate-pulse'
                                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                              }`}
                            >
                              {mov.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {isEmAula && (
                                <button
                                  onClick={() => handleOpenRetornoModal(mov)}
                                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Dar Devolução</span>
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedReceiptMovement(mov)}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                title="Imprimir Recibo / Mapa de Aula"
                              >
                                <Printer className="w-4 h-4" />
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
            <button
              onClick={() => handleOpenClassModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Turma</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courseClasses.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 italic text-xs">
                Nenhuma turma cadastrada.
              </div>
            ) : (
              courseClasses.map((cls) => (
                <div key={cls.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 relative hover:border-slate-700 transition">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase">
                      {cls.career}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenClassModal(cls)}
                        className="p-1 text-slate-400 hover:text-amber-400 rounded transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: 'class', id: cls.id, name: cls.name })}
                        className="p-1 text-slate-400 hover:text-red-400 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-100">{cls.name}</h3>
                    <p className="text-xs font-mono text-amber-400 font-semibold">{cls.courseName}</p>
                  </div>

                  <div className="space-y-1 text-xs text-slate-300 font-mono bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div>Professor: <strong className="text-slate-100">{cls.teacherName}</strong></div>
                    <div>Disciplina: <span className="text-amber-400 font-bold">{cls.subject}</span></div>
                    <div>Qtd de Alunos: <span className="text-slate-100">{cls.studentCount} alunos</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CAIXAS DE ARMAS DE AULA & HISTÓRICO DE SUBSTITUIÇÃO                */}
      {/* ========================================================================= */}
      {activeTab === 'caixas' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Caixas de Armamento para Instrução</h2>
              <p className="text-xs text-slate-400">
                Agrupamento de armas em caixas organizadas por tipo/modelo para saídas rápidas de aulas
              </p>
            </div>
            <button
              onClick={() => handleOpenBoxModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Caixa de Armas</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weaponBoxes.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 italic text-xs">
                Nenhuma caixa de armas cadastrada.
              </div>
            ) : (
              weaponBoxes.map((box) => (
                <div key={box.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <Box className="w-5 h-5 text-amber-400" />
                      <h3 className="text-base font-bold text-slate-100">{box.name}</h3>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleOpenReplaceModal(box)}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                        title="Substituir Arma Defeituosa na Caixa"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Substituir Arma</span>
                      </button>
                      <button
                        onClick={() => handleOpenBoxModal(box)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: 'box', id: box.id, name: box.name })}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {box.description && (
                    <p className="text-xs text-slate-400">{box.description}</p>
                  )}

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Armas na Caixa ({box.weaponIds.length}):
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {box.weaponIds.map(wId => {
                        const w = weapons.find(item => item.id === wId);
                        return (
                          <div key={wId} className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-[11px]">
                            {w ? (
                              <>
                                <div className="font-bold text-slate-100">{w.type} {w.model}</div>
                                <div className="text-amber-400 font-mono text-[10px]">Nº {w.serialNumber}</div>
                              </>
                            ) : (
                              <span className="text-slate-500 italic">{wId}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
      {/* TAB 4: CURSOS DA ACADEMIA                                                */}
      {/* ========================================================================= */}
      {activeTab === 'cursos' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Catálogo de Cursos da Academia</h2>
              <p className="text-xs text-slate-400">
                Divisão entre Cursos de Formação e Ensino Continuado da Polícia Civil
              </p>
            </div>
            <button
              onClick={() => handleOpenCourseModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Curso</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Nome do Curso</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {academyCourses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                        Nenhum curso cadastrado no catálogo.
                      </td>
                    </tr>
                  ) : (
                    academyCourses.map((crs) => (
                      <tr key={crs.id} className="hover:bg-slate-800/50 transition">
                        <td className="py-3 px-4 font-bold text-slate-100">{crs.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                              crs.type === 'Formação'
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : 'bg-blue-950 text-blue-300 border-blue-800'
                            }`}
                          >
                            {crs.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{crs.code || 'N/A'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleOpenCourseModal(crs)}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ type: 'course', id: crs.id, name: crs.name })}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2">
              {editingCourse ? 'Editar Curso da Academia' : 'Novo Curso da Academia'}
            </h3>
            <form onSubmit={handleSaveCourse} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome do Curso</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Ex: Curso de Formação de Investigadores"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Curso</label>
                <select
                  value={courseType}
                  onChange={(e) => setCourseType(e.target.value as 'Formação' | 'Ensino Continuado')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                >
                  <option value="Formação">Formação</option>
                  <option value="Ensino Continuado">Ensino Continuado</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Código (Opcional)</label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="Ex: CFI-2025"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
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
                  {weapons.map((w) => {
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
                        <span className="text-slate-200 font-bold">{w.type} {w.model}</span>
                        <span className="text-amber-400">Nº {w.serialNumber}</span>
                        <span className="text-slate-500 text-[10px]">({w.caliber})</span>
                      </label>
                    );
                  })}
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
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                  required
                >
                  {replaceBox.weaponIds.map(wId => {
                    const w = weapons.find(item => item.id === wId);
                    return (
                      <option key={wId} value={wId}>
                        {w ? `${w.type} ${w.model} (Série: ${w.serialNumber})` : wId}
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                  required
                >
                  <option value="">-- Selecione uma arma disponível --</option>
                  {availableWeapons.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.type} {w.brand} {w.model} (Série: {w.serialNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Motivo da Substituição</label>
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
                <label className="block text-slate-300 font-semibold mb-1">Professor Responsável (Opcional)</label>
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

      {/* 4. Modal Class Edit/Add */}
      {showClassModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2">
              {editingClass ? 'Editar Turma' : 'Nova Turma'}
            </h3>
            <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Curso Vinculado</label>
                <select
                  value={classCourseId}
                  onChange={(e) => setClassCourseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione o Curso --</option>
                  {academyCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Carreira Policial</label>
                <select
                  value={classCareer}
                  onChange={(e) => setClassCareer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                >
                  <option value="Delegado">Delegado de Polícia</option>
                  <option value="Investigador">Investigador de Polícia</option>
                  <option value="Escrivão">Escrivão de Polícia</option>
                  <option value="Perito">Perito Criminal</option>
                  <option value="Médico Legista">Médico Legista</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome / Identificador da Turma</label>
                <input
                  type="text"
                  value={classNameStr}
                  onChange={(e) => setClassNameStr(e.target.value)}
                  placeholder="Ex: Turma Alfa - 2025/1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Professor Titular</label>
                <select
                  value={classTeacherId}
                  onChange={(e) => setClassTeacherId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  <option value="">-- Selecione o Professor --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (MASP: {formatMasp(t.masp)}) {t.teacherSubject ? `• ${t.teacherSubject}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Matéria Leccionada</label>
                <select
                  value={classSubject}
                  onChange={(e) => setClassSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                >
                  <option value="MEAF">MEAF (Manejo, Emprego e Armamento de Fogo)</option>
                  <option value="TAP">TAP (Tática de Ação Policial)</option>
                  <option value="DP">DP (Direito Processual / Penal)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Quantidade de Alunos</label>
                <input
                  type="number"
                  value={classStudentCount}
                  onChange={(e) => setClassStudentCount(Number(e.target.value))}
                  min={1}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                />
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

      {/* 5. Modal Saída para Aula */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl my-8 space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center space-x-2 text-amber-400">
              <ArrowRightLeft className="w-5 h-5" />
              <span>Lançamento de Saída para Aula Prática</span>
            </h3>

            <form onSubmit={handleExecuteSaida} className="space-y-4 text-xs">
              
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Selecione a Turma</label>
                <select
                  value={movClassId}
                  onChange={(e) => setMovClassId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100"
                  required
                >
                  {courseClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.career} - {c.subject}) • Prof. {c.teacherName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Caixa de Armas para Aula (Opcional)</label>
                <select
                  value={movBoxId}
                  onChange={(e) => setMovBoxId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                >
                  <option value="">-- Nenhuma caixa (somente munição) --</option>
                  {weaponBoxes.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.weaponIds.length} armas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Estoque de Munição</label>
                  <select
                    value={movAmmoStockId}
                    onChange={(e) => setMovAmmoStockId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono"
                  >
                    <option value="">-- Sem munição --</option>
                    {ammoStocks.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.caliber} (Disp: {a.quantity} un)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Quantidade Fornecida</label>
                  <input
                    type="number"
                    value={movAmmoQuantity}
                    onChange={(e) => setMovAmmoQuantity(Number(e.target.value))}
                    min={0}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono font-bold text-amber-400"
                  />
                </div>
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

      {/* 6. Modal Retorno / Devolução de Aula */}
      {showRetornoModal && retornoMovement && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-2 flex items-center space-x-2 text-emerald-400">
              <RefreshCw className="w-5 h-5" />
              <span>Devolução e Retorno da Aula</span>
            </h3>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
              <div>Turma: <strong className="text-slate-100">{retornoMovement.className}</strong></div>
              <div>Professor: <span className="text-amber-400 font-bold">{retornoMovement.teacherName}</span></div>
              <div>Munição Fornecida Inicialmente: <strong className="text-amber-400 font-mono">{retornoMovement.ammoQuantity} un ({retornoMovement.ammoCaliber})</strong></div>
            </div>

            <form onSubmit={handleExecuteRetorno} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Munições NÃO Utilizadas (Quantidade Devolvida ao Cofre)
                </label>
                <input
                  type="number"
                  value={retornoAmmoReturned}
                  onChange={(e) => setRetornoAmmoReturned(Number(e.target.value))}
                  min={0}
                  max={retornoMovement.ammoQuantity}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-base font-bold text-emerald-400"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Munição Utilizada em Aula: <strong className="text-slate-100 font-mono">{retornoMovement.ammoQuantity - Number(retornoAmmoReturned)} un</strong>
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome de Quem Efetuou a Devolução</label>
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
                  className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow"
                >
                  Confirmar Retorno e Atualizar Recibo
                </button>
              </div>
            </form>
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
