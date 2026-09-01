import React, { useState } from 'react';
import { User, UserRole, UserCargo, Department, Unit, Course, UserCourse } from '../types';
import { formatMasp, formatPhone, cleanMasp, cleanPhone, isCourseExpired, formatDisplayDate } from '../utils/masks';
import { storage } from '../services/storage';
import { Users, Plus, Edit2, Trash2, GraduationCap, AlertCircle, Check, Shield, Search, Calendar, AlertTriangle, KeyRound, Building, ChevronDown, ChevronUp } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface UserModuleProps {
  currentUser: User;
  users: User[];
  departments: Department[];
  units: Unit[];
  courses: Course[];
  onRefresh: () => void;
}

export const UserModule: React.FC<UserModuleProps> = ({
  currentUser,
  users,
  departments,
  units,
  courses,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCourseManagementModal, setShowCourseManagementModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };
  const [maspRaw, setMaspRaw] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cargo, setCargo] = useState<UserCargo>('Investigador');
  const [role, setRole] = useState<UserRole>('Policial');
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [canMoveAmmo, setCanMoveAmmo] = useState(false);
  const [canMoveWeapons, setCanMoveWeapons] = useState(false);
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [managementScope, setManagementScope] = useState<'department' | 'unit'>('unit');
  const [userCourses, setUserCourses] = useState<UserCourse[]>([]);

  // Teacher states
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherSubject, setTeacherSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');
  const [professorSigla, setProfessorSigla] = useState('');
  const [showPromoteTeacherModal, setShowPromoteTeacherModal] = useState(false);
  const [existingMaspUser, setExistingMaspUser] = useState<User | null>(null);
  const [promoteSubject, setPromoteSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');

  // Course Management Form states
  const [showCourseAddForm, setShowCourseAddForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedCalibers, setSelectedCalibers] = useState<string[]>([]);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetUser, setDeleteTargetUser] = useState<{ type: 'user' | 'course'; id: string; name: string } | null>(null);

  const isGeral = currentUser.role === 'Geral';
  const isAdminOrArmeiro = currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const isPolicial = currentUser.role === 'Policial';

  // Check if user has rights to manage teachers
  const userDept = departments.find(d => d.id === currentUser.departmentId);
  const isAcademiaDept = (userDept?.name || '').toUpperCase().includes('ACADEMIA');
  const canManageTeachers = isGeral || (isAdminOrArmeiro && isAcademiaDept);

  // Available models from registered weapons & defaults
  const availableModels = Array.from(
    new Set([...storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).map(w => w.model), 'T4', 'IA2', 'PT92', 'Glock G22', 'TH40', 'CBC 586-P'])
  );

  // Available calibers from catalog
  const availableCalibers = storage.getCalibers().map(c => c.name);

  const cargosList: UserCargo[] = [
    'Delegado',
    'Investigador',
    'Escrivão',
    'Perito',
    'Médico Legista',
    'Operador'
  ];

  const rolesList: UserRole[] = (editingUser && editingUser.role === 'Geral')
    ? ['Geral', 'Administrador', 'Armeiro', 'Policial']
    : ['Administrador', 'Armeiro', 'Policial'];

  // Filtered units based on selected department in form
  const availableUnitsForForm = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  // Open User Modal
  const handleOpenUserModal = (usr?: User) => {
    setErrorMsg('');
    if (usr) {
      setEditingUser(usr);
      setMaspRaw(usr.masp);
      setName(usr.name);
      setPhone(usr.phone);
      setCargo(usr.cargo);
      setRole(usr.role);
      setDeptId(usr.departmentId);
      setUnitId(usr.unitId);
      setCanMoveAmmo(usr.canMoveAmmunition);
      setCanMoveWeapons(usr.canMoveWeapons);
      setHasSystemAccess(usr.hasSystemAccess);
      setManagementScope(usr.managementScope || 'department');
      setUserCourses(usr.courses || []);
      setIsTeacher(Boolean(usr.isTeacher));
      setTeacherSubject(usr.teacherSubject || 'MEAF');
      setProfessorSigla(usr.professorSigla || '');
    } else {
      setEditingUser(null);
      setMaspRaw('');
      setName('');
      setPhone('');
      setCargo('Investigador');
      setRole('Policial');
      const initialDept = isGeral ? (departments[0]?.id || '') : currentUser.departmentId;
      setDeptId(initialDept);
      const initialUnits = units.filter(u => u.departmentId === initialDept);
      setUnitId(initialUnits[0]?.id || '');
      setCanMoveAmmo(false);
      setCanMoveWeapons(false);
      setHasSystemAccess(true);
      setManagementScope('unit');
      setUserCourses([]);
      setIsTeacher(false);
      setTeacherSubject('MEAF');
      setProfessorSigla('');
    }
    setShowUserModal(true);
  };

  // MASP blur check
  const handleMaspBlur = () => {
    if (editingUser) return;
    const clean = cleanMasp(maspRaw);
    if (!clean) return;

    const existing = users.find(u => u.masp === clean);
    if (existing) {
      if (canManageTeachers) {
        setExistingMaspUser(existing);
        setPromoteSubject('MEAF');
        setShowPromoteTeacherModal(true);
      } else {
        setErrorMsg(`O policial ${existing.name} (MASP: ${formatMasp(existing.masp)}) já está cadastrado no sistema.`);
      }
    }
  };

  const handleConfirmPromoteTeacher = async () => {
    if (!existingMaspUser) return;
    try {
      await storage.updateUser(existingMaspUser.id, {
        isTeacher: true,
        teacherSubject: promoteSubject
      });

      setSuccessMsg(`O policial ${existingMaspUser.name} (MASP: ${formatMasp(existingMaspUser.masp)}) foi tornado Professor da disciplina ${promoteSubject}!`);
      setShowPromoteTeacherModal(false);
      setShowUserModal(false);
      setExistingMaspUser(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao promover policial para professor.');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanMaspInput = cleanMasp(maspRaw);
    if (!cleanMaspInput) {
      setErrorMsg('Informe o MASP contendo apenas números.');
      return;
    }

    if (!editingUser && role === 'Geral') {
      setErrorMsg('Não é permitido criar usuários com perfil Geral.');
      return;
    }

    try {
      let targetDeptId = deptId;
      let targetUnitId = unitId;

      if (editingUser) {
        await storage.updateUser(editingUser.id, {
          masp: cleanMaspInput,
          name: name.trim(),
          phone: cleanPhone(phone),
          cargo,
          role,
          departmentId: targetDeptId,
          unitId: targetUnitId,
          canMoveAmmunition: canMoveAmmo,
          canMoveWeapons: canMoveWeapons,
          hasSystemAccess,
          managementScope,
          courses: userCourses,
          isTeacher,
          teacherSubject: isTeacher ? teacherSubject : undefined,
          professorSigla: professorSigla.trim() || undefined
        });
        setSuccessMsg('Policial atualizado com sucesso.');
      } else {
        await storage.addUser({
          name: name.trim(),
          masp: cleanMaspInput,
          phone: cleanPhone(phone),
          cargo,
          role,
          departmentId: targetDeptId,
          unitId: targetUnitId,
          canMoveAmmunition: canMoveAmmo,
          canMoveWeapons: canMoveWeapons,
          hasSystemAccess,
          managementScope,
          courses: userCourses,
          isTeacher,
          teacherSubject: isTeacher ? teacherSubject : undefined,
          professorSigla: professorSigla.trim() || undefined
        });
        setSuccessMsg('Novo policial cadastrado com sucesso. A senha inicial será o número do MASP.');
      }

      setShowUserModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar policial.');
    }
  };

  const handleDeleteUser = (usr: User) => {
    setDeleteTargetUser({ type: 'user', id: usr.id, name: `o policial ${usr.name} (MASP: ${formatMasp(usr.masp)})` });
  };

  const isAdmin = currentUser.role === 'Administrador';
  const isArmeiro = currentUser.role === 'Armeiro';
  const canResetPassword = isGeral || isAdmin || isArmeiro;

  const handleResetPassword = async () => {
    if (!editingUser) return;
    if (window.confirm(`Confirma o reset de senha de ${editingUser.name} (MASP: ${formatMasp(editingUser.masp)}) para o número do MASP?`)) {
      try {
        setErrorMsg('');
        setSuccessMsg('');
        await storage.resetUserPassword(editingUser.id);
        setSuccessMsg(`Senha do policial ${editingUser.name} resetada com sucesso para o MASP. No próximo login, o usuário deverá alterar sua senha.`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao resetar senha do policial.');
      }
    }
  };

  const confirmExecuteDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetUser.type === 'user') {
        await storage.deleteUser(deleteTargetUser.id);
        setSuccessMsg(`Policial excluído com sucesso.`);
      } else {
        await storage.deleteCourse(deleteTargetUser.id);
        setSuccessMsg(`Curso excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetUser(null);
    }
  };

  // Add/remove course for user
  const handleAddCourseToUser = (courseId: string) => {
    if (!courseId) return;
    if (userCourses.some(uc => uc.courseId === courseId)) return;

    setUserCourses([
      ...userCourses,
      { courseId, completionDate: new Date().toISOString().split('T')[0] }
    ]);
  };

  const handleUpdateCourseDate = (courseId: string, newDate: string) => {
    setUserCourses(
      userCourses.map(uc => (uc.courseId === courseId ? { ...uc, completionDate: newDate } : uc))
    );
  };

  const handleRemoveCourseFromUser = (courseId: string) => {
    setUserCourses(userCourses.filter(uc => uc.courseId !== courseId));
  };

  // Create Course Handler
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    if (selectedModels.length === 0 || selectedCalibers.length === 0) {
      alert('Selecione ao menos um modelo e um calibre abrangido pelo curso.');
      return;
    }

    try {
      await storage.addCourse({
        name: newCourseName.trim(),
        allowedModels: selectedModels,
        allowedCalibers: selectedCalibers,
        departmentId: currentUser.departmentId
      });
      setNewCourseName('');
      setSelectedModels([]);
      setSelectedCalibers([]);
      setShowCourseAddForm(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar curso');
    }
  };

  // Search filter
  const term = searchTerm.toLowerCase().trim();
  const filteredUsers = users.filter(u => {
    if (!term) return true;
    const maspFmt = formatMasp(u.masp).toLowerCase();
    const dept = departments.find(d => d.id === u.departmentId);
    const unit = units.find(un => un.id === u.unitId);
    return (
      u.name.toLowerCase().includes(term) ||
      u.masp.includes(term) ||
      maspFmt.includes(term) ||
      u.cargo.toLowerCase().includes(term) ||
      (dept && (dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term))) ||
      (unit && unit.name.toLowerCase().includes(term))
    );
  });

  // Filtered Departments to display
  const visibleDepts = isGeral
    ? departments
    : departments.filter(d => d.id === currentUser.departmentId);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão de Policiais por Departamento</h1>
            <p className="text-xs text-slate-400">
              Clique em um departamento para expandir e visualizar os policiais cadastrados.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* New User Button */}
          {!isPolicial && (
            <button
              onClick={() => handleOpenUserModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Policial</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar policial por nome, MASP, cargo ou unidade..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium hidden sm:inline">
          Exibindo <strong className="text-amber-400">{filteredUsers.length}</strong> policial(is)
        </span>
      </div>

      {/* Departments Accordion with Grouped Users */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          const deptUsers = filteredUsers.filter(u => u.departmentId === dept.id);
          const isExpanded = term !== '' || expandedDeptIds.includes(dept.id);

          // If searching and this department has no matching users, hide it
          if (term !== '' && deptUsers.length === 0) return null;

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
              
              {/* Department Header Row */}
              <div
                onClick={() => toggleDeptExpand(dept.id)}
                className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {dept.code}
                      </span>
                      <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {deptUsers.length} policial(is) cadastrado(s) neste departamento
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptUsers.length} Policiais
                  </span>
                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Users Table for this Department (Shown when Expanded) */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Policial / MASP</th>
                        <th className="py-3 px-4">Cargo</th>
                        <th className="py-3 px-4">Perfil</th>
                        <th className="py-3 px-4">Unidade</th>
                        <th className="py-3 px-4 text-center">Acesso</th>
                        <th className="py-3 px-4">Permissões Especial</th>
                        <th className="py-3 px-4">Cursos Habilitados</th>
                        {!isPolicial && <th className="py-3 px-4 text-right">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {deptUsers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-500 italic">
                            Nenhum policial cadastrado neste departamento.
                          </td>
                        </tr>
                      ) : (
                        deptUsers.map((usr) => {
                          const u = units.find(un => un.id === usr.unitId);

                          return (
                            <tr key={usr.id} className="hover:bg-slate-800/40 transition">
                              
                              {/* Name & MASP */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-100 text-sm">{usr.name}</div>
                                <div className="text-[11px] font-mono text-amber-400">
                                  MASP: {formatMasp(usr.masp)}
                                </div>
                              </td>

                              {/* Cargo */}
                              <td className="py-3 px-4">
                                <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded font-medium">
                                  {usr.cargo}
                                </span>
                              </td>

                              {/* Role */}
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded font-bold border text-[11px] ${
                                    usr.role === 'Geral'
                                      ? 'bg-purple-950 text-purple-300 border-purple-800'
                                      : usr.role === 'Administrador'
                                      ? 'bg-blue-950 text-blue-300 border-blue-800'
                                      : usr.role === 'Armeiro'
                                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  }`}
                                >
                                  {usr.role}
                                </span>
                                {usr.isTeacher && (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                      Prof ({usr.teacherSubject || 'MEAF'})
                                    </span>
                                    {usr.professorSigla && (
                                      <span className="bg-slate-950 text-amber-300 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                                        [{usr.professorSigla}]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Unit */}
                              <td className="py-3 px-4 text-slate-300">
                                <div className="font-semibold text-slate-200">{u ? u.name : 'N/A'}</div>
                              </td>

                              {/* System Access */}
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    usr.hasSystemAccess
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-red-950 text-red-400 border border-red-800'
                                  }`}
                                >
                                  {usr.hasSystemAccess ? 'SIM' : 'NÃO'}
                                </span>
                              </td>

                              {/* Special Move Permissions */}
                              <td className="py-3 px-4 space-y-1">
                                <div className="text-[10px]">
                                  Munição: {' '}
                                  <span className={usr.canMoveAmmunition ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                    {usr.canMoveAmmunition ? 'Sim' : 'Não'}
                                  </span>
                                </div>
                                <div className="text-[10px]">
                                  Armas: {' '}
                                  <span className={usr.canMoveWeapons ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                    {usr.canMoveWeapons ? 'Sim' : 'Não'}
                                  </span>
                                </div>
                              </td>

                              {/* Courses */}
                              <td className="py-3 px-4">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {usr.courses.length === 0 ? (
                                    <span className="text-slate-500 italic text-[11px]">Nenhum</span>
                                  ) : (
                                    usr.courses.map((uc, i) => {
                                      const cObj = courses.find(c => c.id === uc.courseId);
                                      const expired = isCourseExpired(uc.completionDate);

                                      return (
                                        <span
                                          key={i}
                                          className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold flex items-center space-x-1 ${
                                            expired
                                              ? 'bg-red-600 text-white border-red-500'
                                              : 'bg-slate-950 text-amber-400 border-slate-800'
                                          }`}
                                          title={expired ? 'Curso Vencido (> 2 anos)' : 'Curso Válido'}
                                        >
                                          <span>{cObj ? cObj.name : uc.courseId}</span>
                                          {expired && <AlertTriangle className="w-3 h-3 text-white inline" />}
                                        </span>
                                      );
                                    })
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              {!isPolicial && (
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end space-x-2">
                                    <button
                                      onClick={() => handleOpenUserModal(usr)}
                                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                      title="Editar Policial"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    {isGeral && (
                                      <button
                                        onClick={() => handleDeleteUser(usr)}
                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                                        title="Excluir Policial"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* User Edit / Add Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              {editingUser ? 'Editar Policial' : 'Novo Policial'}
            </h3>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* MASP */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    MASP (Apenas números)
                  </label>
                  <input
                    type="text"
                    value={formatMasp(maspRaw)}
                    onChange={(e) => setMaspRaw(cleanMasp(e.target.value))}
                    onBlur={handleMaspBlur}
                    placeholder="MASP com dígito"
                    maxLength={11}
                    disabled={!!editingUser}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm font-mono ${
                      editingUser
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {editingUser
                      ? 'O número de MASP é inalterável por qualquer perfil.'
                      : 'Armazenado apenas números. Ao sair da caixa, verifica duplicidade.'}
                  </p>
                </div>

                {/* Nome */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                    required
                  />
                </div>

                {/* Cargo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cargo
                  </label>
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value as UserCargo)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {cargosList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(cleanPhone(e.target.value))}
                    placeholder="(00) 0 0000-0000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>

                {/* Perfil */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Perfil
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {rolesList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Acesso ao Sistema */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Acesso ao Sistema
                  </label>
                  <select
                    value={hasSystemAccess ? 'sim' : 'nao'}
                    onChange={(e) => setHasSystemAccess(e.target.value === 'sim')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="sim">Sim (Ativo)</option>
                    <option value="nao">Não (Bloqueado)</option>
                  </select>
                </div>

                {/* Departamento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Departamento
                  </label>
                  <select
                    value={deptId}
                    onChange={(e) => {
                      setDeptId(e.target.value);
                      const depUnits = units.filter(u => u.departmentId === e.target.value);
                      setUnitId(depUnits[0]?.id || '');
                    }}
                    disabled={!isGeral}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                      !isGeral
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unidade */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Unidade
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {availableUnitsForForm.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Professor da Academia */}
                {canManageTeachers && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Professor da Academia?</span>
                      </label>
                      <select
                        value={isTeacher ? 'sim' : 'nao'}
                        onChange={(e) => setIsTeacher(e.target.value === 'sim')}
                        className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold"
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim (Professor)</option>
                      </select>
                    </div>

                    {isTeacher && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                            Matéria Leccionada
                          </label>
                          <select
                            value={teacherSubject}
                            onChange={(e) => setTeacherSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                            className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold"
                          >
                            <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                            <option value="TAP">TAP (Técnicas de Ações Policiais)</option>
                            <option value="DP">DP (Defesa Pessoal)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                            Sigla do Professor
                          </label>
                          <input
                            type="text"
                            value={professorSigla}
                            onChange={(e) => setProfessorSigla(e.target.value)}
                            placeholder="Ex: SILVA / MEAF"
                            className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold uppercase"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Permissões Especiais */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Pode Movimentar Munições?
                  </label>
                  <select
                    value={canMoveAmmo ? 'sim' : 'nao'}
                    onChange={(e) => setCanMoveAmmo(e.target.value === 'sim')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Pode Movimentar Armas?
                  </label>
                  <select
                    value={canMoveWeapons ? 'sim' : 'nao'}
                    onChange={(e) => setCanMoveWeapons(e.target.value === 'sim')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>

                {/* Abrangência de Movimentação/Gestão (Armeiro / Admin) */}
                <div className="md:col-span-2 bg-amber-950/20 border border-amber-800/40 p-3 rounded-xl">
                  <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
                    Abrangência de Movimentação e Gestão (Armeiro)
                  </label>
                  <select
                    value={managementScope}
                    onChange={(e) => setManagementScope(e.target.value as 'department' | 'unit')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-medium"
                  >
                    <option value="department">Departamento e todas as unidades do departamento vinculado</option>
                    <option value="unit">Apenas a unidade específica que está vinculado</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Determina se o Armeiro/Usuário pode gerenciar e movimentar armas, munições, usuários e cofres em todo o departamento ou restrito à sua unidade.
                  </p>
                </div>

                {/* Resetar Senha (Geral, Administrador ou Armeiro) */}
                {canResetPassword && editingUser && (
                  <div className="md:col-span-2 bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-400 block flex items-center space-x-1.5">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Resetar Senha do Policial</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Redefine a senha do policial para o número do MASP. No próximo acesso, o policial será direcionado obrigatoriamente para a página de primeiro acesso para cadastrar uma nova senha (mínimo 6 dígitos).
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ml-4 flex items-center space-x-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Resetar Senha</span>
                    </button>
                  </div>
                )}

              </div>

              {/* Course Assignment Section */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4" />
                    <span>Cursos do Policial</span>
                  </label>

                  <select
                    onChange={(e) => {
                      handleAddCourseToUser(e.target.value);
                      e.target.value = '';
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-3 py-1"
                  >
                    <option value="">+ Adicionar Curso</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {userCourses.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhum curso associado a este policial.</p>
                  ) : (
                    userCourses.map((uc) => {
                      const cObj = courses.find(c => c.id === uc.courseId);
                      const expired = isCourseExpired(uc.completionDate);

                      return (
                        <div key={uc.courseId} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-200">{cObj ? cObj.name : uc.courseId}</span>
                            <span className="block text-[10px] text-slate-400">
                              Modelos: {cObj?.allowedModels.join(', ')} • Calibres: {cObj?.allowedCalibers.join(', ')}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-400">Data do Curso:</span>
                              <input
                                type="date"
                                value={uc.completionDate}
                                onChange={(e) => handleUpdateCourseDate(uc.courseId, e.target.value)}
                                className={`border rounded px-2 py-1 text-xs font-mono font-bold ${
                                  expired
                                    ? 'bg-red-600 text-white border-red-500'
                                    : 'bg-slate-900 border-slate-700 text-amber-400'
                                }`}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveCourseFromUser(uc.courseId)}
                              className="text-red-400 hover:text-red-300 font-bold"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Salvar Policial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Course Management Modal */}
      {showCourseManagementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <span>Cadastro e Gestão de Cursos</span>
              </h3>
              <button
                onClick={() => setShowCourseManagementModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Defina os cursos e quais modelos de armas e calibres cada curso abrange.
            </p>

            {/* List of existing courses */}
            <div className="space-y-3 mt-4 max-h-60 overflow-y-auto">
              {courses.map((course) => (
                <div key={course.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-amber-400 text-sm">{course.name}</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      <strong>Modelos abrangidos:</strong> {course.allowedModels.join(', ')}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      <strong>Calibres abrangidos:</strong> {course.allowedCalibers.join(', ')}
                    </p>
                  </div>
                  {isGeral && (
                    <button
                      onClick={() => {
                        setDeleteTargetUser({ type: 'course', id: course.id, name: `o curso "${course.name}"` });
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded transition"
                      title="Excluir Curso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Course Toggle */}
            {!showCourseAddForm ? (
              <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setShowCourseAddForm(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo Curso</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateCourse} className="mt-4 pt-4 border-t border-slate-800 space-y-4 bg-slate-950/60 p-4 rounded-xl border">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Novo Curso</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nome do Curso (Cursos de Habilitação)</label>
                  <input
                    type="text"
                    list="userCoursesDatalist"
                    value={newCourseName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewCourseName(val);
                      const matched = courses.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
                      if (matched) {
                        if (matched.allowedModels && matched.allowedModels.length > 0) {
                          setSelectedModels(matched.allowedModels);
                        }
                        if (matched.allowedCalibers && matched.allowedCalibers.length > 0) {
                          setSelectedCalibers(matched.allowedCalibers);
                        }
                      }
                    }}
                    placeholder="Ex: Operador de fuzil"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                    required
                  />
                  <datalist id="userCoursesDatalist">
                    {courses.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>

                  {(() => {
                    const matched = courses.find(c => c.name.toLowerCase() === newCourseName.trim().toLowerCase());
                    if (!matched) return null;
                    return (
                      <div className="bg-amber-950/40 border border-amber-500/40 p-2.5 rounded-xl text-xs space-y-1 mt-2">
                        <div className="font-bold text-amber-400">Dados Herdados do Curso de Habilitação</div>
                        <div className="text-slate-300">
                          <strong>Tipo/Modelos:</strong> {matched.allowedModels?.join(', ') || 'N/A'}
                        </div>
                        <div className="text-slate-300">
                          <strong>Quantidade de Tiros:</strong> <span className="text-amber-400 font-bold">{matched.shotsPerStudent || 50} tiros/aluno</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Select Models */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Modelos de Armas Abrangidos (Selecione múltiplos)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableModels.map((model) => {
                      const selected = selectedModels.includes(model);
                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setSelectedModels(selectedModels.filter(m => m !== model));
                            } else {
                              setSelectedModels([...selectedModels, model]);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                            selected
                              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Select Calibers */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Calibres Abrangidos (Selecione múltiplos)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableCalibers.map((cal) => {
                      const selected = selectedCalibers.includes(cal);
                      return (
                        <button
                          key={cal}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setSelectedCalibers(selectedCalibers.filter(c => c !== cal));
                            } else {
                              setSelectedCalibers([...selectedCalibers, cal]);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                            selected
                              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {cal}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCourseAddForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-lg"
                  >
                    Salvar Curso
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Promote Existing User to Teacher Modal */}
      {showPromoteTeacherModal && existingMaspUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
            <div className="flex items-center space-x-3 text-amber-400">
              <GraduationCap className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-100">Policial Já Cadastrado</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              O policial <strong className="text-amber-400">{existingMaspUser.name}</strong> (MASP: <span className="font-mono">{formatMasp(existingMaspUser.masp)}</span>) já está cadastrado no sistema.
            </p>
            <p className="text-xs text-slate-300 font-semibold">
              Deseja torná-lo professor da Academia de Polícia Civil?
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Informe a Matéria Leccionada
              </label>
              <select
                value={promoteSubject}
                onChange={(e) => setPromoteSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-semibold"
              >
                <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                <option value="TAP">TAP (Técnicas de Ações Policiais)</option>
                <option value="DP">DP (Defesa Pessoal)</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowPromoteTeacherModal(false);
                  setExistingMaspUser(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
              >
                Não (Cancelar)
              </button>
              <button
                type="button"
                onClick={handleConfirmPromoteTeacher}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow transition"
              >
                Sim, Tornar Professor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetUser}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetUser?.name || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteUser}
        onCancel={() => setDeleteTargetUser(null)}
      />

    </div>
  );
};
