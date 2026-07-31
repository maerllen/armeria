export type UserRole = 'Geral' | 'Administrador' | 'Armeiro' | 'Policial';

export type ModuleType = 
  | 'meu-perfil' 
  | 'unidade' 
  | 'usuarios' 
  | 'cofre' 
  | 'municoes' 
  | 'armas' 
  | 'movimentacoes' 
  | 'relatorio'
  | 'manual'
  | 'cursos'
  | 'ensino-continuado'
  | 'gerencia-cursos'
  | 'iniciar-aula-mobile'
  | 'calendario';

export type UserCargo = 
  | 'Delegado' 
  | 'Investigador' 
  | 'Escrivão' 
  | 'Perito' 
  | 'Médico Legista' 
  | 'Operador';

export type TeacherSubject = 'MEAF' | 'TAP' | 'DP';

export interface UserCourse {
  courseId: string;
  completionDate: string; // YYYY-MM-DD or DD/MM/YYYY
}

export interface User {
  id: string;
  masp: string; // Cleaned numbers only, e.g., "1255748"
  password: string;
  name: string;
  cargo: UserCargo;
  phone: string;
  role: UserRole;
  departmentId: string;
  unitId: string;
  canMoveAmmunition: boolean;
  canMoveWeapons: boolean;
  hasSystemAccess: boolean;
  mustChangePassword: boolean;
  managementScope?: 'department' | 'unit';
  courses: UserCourse[];
  isTeacher?: boolean;
  teacherSubject?: TeacherSubject;
  professorSigla?: string;
  professor_sigla?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface Unit {
  id: string;
  name: string;
  departmentId: string;
  createdAt: string;
}

export interface AvailableWeaponType {
  id: string;
  name: string; // e.g. "Pistola", "Fuzil", "Espingarda"
  models: string[]; // e.g. ["PT100", "TS9", "G22"]
  createdAt?: string;
}

export interface Course {
  id: string;
  name: string; // e.g., "Operador de fuzil"
  allowedWeaponTypes?: string[]; // e.g., ["Pistola", "Fuzil"]
  allowedModels: string[]; // e.g., ["T4", "IA2"]
  allowedCalibers: string[]; // e.g., ["5,56x45mm"]
  shotsPerStudent?: number; // e.g., 50
  shotsPerWeaponType?: Record<string, number>; // e.g., { "Pistola": 50, "Fuzil": 100 }
  departmentId?: string;
  createdAt: string;
}

export type VaultSpaceType = 'ARMAS' | 'MUNIÇÕES';

export interface VaultSpace {
  id: string;
  code: string; // e.g., "A1-G1", "C1-L1"
  type: VaultSpaceType;
  departmentId: string;
  unitId: string;
  createdAt: string;
}

export interface Caliber {
  id: string;
  name: string; // e.g., "5,56x45mm", ".40 S&W", "9x19mm"
  createdAt: string;
}

export interface AmmunitionStock {
  id: string;
  caliberId: string;
  vaultSpaceId: string;
  unitId: string;
  departmentId: string;
  quantity: number;
}

export type AmmoMovementType = 'Entrada' | 'Saída';

export interface AmmunitionMovement {
  id: string;
  type: AmmoMovementType;
  caliberId: string;
  quantity: number;
  vaultSpaceId: string;
  unitId: string;
  departmentId: string;
  recipientOrReason: string; // "Curso ou Teste" | "Treinamento" | "Substituição" | "Abastecimento do Cofre" | etc.
  responsibleType?: 'SISTEMA' | 'FORA_DO_SISTEMA';
  responsibleUserId?: string;
  responsibleName?: string;
  responsibleMasp?: string;
  observation?: string;
  returnedQuantity?: number;
  returnedAt?: string;
  returnedByUserName?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export type WeaponStatus = 'No Cofre' | 'Em Trânsito' | 'Pendente de Recibo';

export interface Weapon {
  id: string;
  type: string; // Fuzil, Pistola, Submetralhadora, Espingarda
  serialNumber: string; // e.g. EKG-5486
  manufacturer: string; // e.g. Taurus, Imbel
  model: string; // e.g. T4, PT92
  caliber: string; // e.g. 5,56x45mm
  magazineQuantity: number;
  departmentId: string;
  unitId: string;
  vaultSpaceId: string;
  status: WeaponStatus;
  lastMaintenanceDate?: string;
  lastMaintenanceResponsible?: string;
  currentMovementId?: string;
  createdAt: string;
}

export type MovementStatus = 
  | 'Pendente Aprovação' 
  | 'Em Trânsito' 
  | 'Pendente Recibo' 
  | 'Concluído' 
  | 'Rejeitado';

export interface Movement {
  id: string;
  weaponId: string;
  weaponSerialNumber: string;
  weaponModel: string;
  weaponType: string;
  departmentId: string;
  unitId: string;
  requesterId: string;
  requesterName: string;
  requesterMasp: string;
  ammunitionCount: number;
  magazineCount: number;
  caliber: string;
  status: MovementStatus;
  
  // Withdrawal info
  withdrawalVaultSpaceId: string;
  approvedByUserId?: string;
  approvedByUserName?: string;
  approvalDate?: string;

  // Return info
  returnVaultSpaceId?: string;
  returningAmmunitionCount?: number;
  returningMagazineCount?: number;
  divergenceJustification?: string;
  
  // Confirmation info
  receiptConfirmedByUserId?: string;
  receiptConfirmedByUserName?: string;
  receiptDate?: string;

  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userMasp: string;
  userRole: UserRole;
  module: 'Unidade' | 'Usuários' | 'Cofre' | 'Munições' | 'Armas' | 'Movimentações' | 'Perfil' | 'Login' | 'Cursos';
  action: 'Criar' | 'Editar' | 'Excluir' | 'Aprovar' | 'Solicitar' | 'Devolver' | 'Confirmar Recibo' | 'Login' | 'Alterar Senha' | 'Rejeitar';
  details: string;
  ipAddress: string;
}

// Academia de Policia Cursos & Movimentacao Interfaces
export type AcademyCourseType = 'Formação' | 'Ensino Continuado';
export type AcademyCareer = 'Delegado' | 'Médico Legista' | 'Perito' | 'Investigador' | 'Escrivão';

export interface LessonPlanItem {
  lessonNumber: number;
  shotsPerStudent: number;
  caliberId?: string;
  caliberName: string;
  instructorShots?: number;
}

export interface LessonPlan {
  id: string;
  name: string;
  subject?: 'MEAF' | 'TAP' | 'DP' | string;
  turmaCode?: string;
  career: AcademyCareer;
  year: number;
  type: 'curso de formação' | 'curso ensino continuado';
  lessonCount: number;
  lessonsData: LessonPlanItem[];
  departmentId?: string;
  unitId?: string;
  createdAt: string;
}

export interface AcademyLessonPlan {
  lessonNumber: number;
  title: string;
  materialsDescription: string;
  suggestedTeachersCount: number;
}

export interface AcademyCourse {
  id: string;
  name: string;
  type: AcademyCourseType;
  career?: AcademyCareer;
  code: string;
  // Formação specific:
  moduleNumber?: number;
  module?: string;
  startDate?: string;
  endDate?: string;
  departmentName?: string;
  departmentId?: string;
  // Ensino Continuado specific:
  teachingDepartmentName?: string;
  teachingDepartmentId?: string;
  locationDepartmentName?: string;
  locationDepartmentId?: string;
  durationDays?: number;
  subject?: string;
  dates?: string[];
  unitId?: string;
  createdAt: string;
}

export interface CourseFormacao {
  id: string;
  name: string;
  module: string;
  code: string;
  departmentName: string;
  departmentId?: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
}

export interface CourseEnsinoContinuado {
  id: string;
  name: string;
  code: string;
  teachingDepartmentName: string;
  teachingDepartmentId?: string;
  locationDepartmentName: string;
  locationDepartmentId?: string;
  durationDays: number;
  subject: string;
  dates: string[];
  createdAt?: string;
}

export type CourseHabilitacao = Course;

export interface WeaponBox {
  id: string;
  name: string;
  description?: string;
  courseType?: AcademyCourseType;
  weaponCount?: number;
  weaponIds: string[];
  departmentId?: string;
  unitId?: string;
  createdAt: string;
}

export interface WeaponBoxReplacement {
  id: string;
  boxId: string;
  boxName?: string;
  oldWeaponId: string;
  oldWeaponDesc: string;
  newWeaponId: string;
  newWeaponDesc: string;
  reason: string;
  teacherName?: string;
  responsibleUserName: string;
  replacedByUserName?: string;
  replacedAt?: string;
  createdAt: string;
}

export interface AlunoTurma {
  id: string;
  turmaId?: string;
  turmaAluno: string;
  moduloAluno?: string;
  professorAluno?: string;
  instrutor1Aluno?: string;
  instrutor2Aluno?: string;
  instrutor3Aluno?: string;
  instrutor4Aluno?: string;
  maspAluno?: string;
  nomeAluno: string;
  situacaoAluno?: string;
  departamentoAluno?: string;
  createdAt?: string;
  updatedAt?: string;
  aulas?: AlunoAula[];
}

export interface AlunoAula {
  id: string;
  alunoId: string;
  aulaNomeAluno: string;
  aulaNumeroAluno?: number;
  aulaDataAluno?: string;
  aulaHoraAluno?: string;
  aulaConteudoAluno?: string;
  observacaoAluno?: string;
  notaAluno?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseClass {
  id: string;
  courseId: string;
  courseName: string;
  name?: string;
  subject: TeacherSubject;
  career: AcademyCareer;
  careerAbbreviation?: 'DL' | 'IP' | 'EP' | 'PC' | 'ML';
  turmaNumber?: string;
  code?: string;
  studentCount: number;
  teacherUserId?: string;
  teacherName?: string;
  teacherUserIds?: string[];
  lessonPlanId?: string;
  lessonPlanName?: string;
  plano_de_aula?: string;
  firstClassDate?: string;
  lastClassDate?: string;
  turmaCalendario?: string;
  departmentId?: string;
  unitId?: string;
  createdAt: string;
}

export interface CourseMovement {
  id: string;
  courseId?: string;
  courseName?: string;
  classId?: string;
  className?: string;
  turmaCode?: string;
  career?: string;
  subject?: string;
  lessonPlanId?: string;
  lessonPlanName?: string;
  lessonNumber?: number;
  teacherName: string;
  teacherUserId?: string;
  weaponBoxId?: string;
  weaponBoxName?: string;
  boxId?: string;
  boxName?: string;
  weaponIds?: string[];
  caliberId?: string;
  vaultSpaceId?: string;
  ammoStockId?: string;
  ammoCaliber?: string;
  ammoQuantity?: number;
  ammoSupplied?: number;
  studentCount?: number;
  shotsPerStudent?: number;
  instructorShots?: number;
  ammoUsed?: number;
  ammoReturned?: number;
  extraMagazinesCount?: number;
  status: 'Em Aula' | 'Finalizada' | 'Em Sala de Aula' | 'Devolvido';
  notes?: string;
  returnedMaterials?: string;
  issuedByUserId?: string;
  issuedByUserName: string;
  returnedByUserName?: string;
  issuedAt?: string;
  createdAt: string;
  returnedAt?: string;
}

export interface CalendarRecord {
  id: string;
  data_calendario: string; // YYYY-MM-DD
  horario_calendario: string; // e.g. "08:00 as 09:40", "10:00 as 11:40", "14:00 as 15:40", "16:00 as 16:40"
  turma_calendario: string;
  sigla_calendario: string;
  disciplina_calendario?: string;
  sala_calendario?: string;
  curso_calendario?: string;
  modulo_calendario?: string;
  ano_calendario?: number | string;
  numero_aula_calendario?: number | string;
  equipe_calendario?: string;
  observacao_calendario?: string;
  createdAt?: string;
}

export interface InstrutorItem {
  id?: string;
  rotulo?: string; // e.g. "Instrutor 02", "Instrutor 03", "Instrutor 04"
  instrutorNome: string;
  siglaInstrutor: string;
}

export interface ProfessorEquipe {
  id?: string;
  equipeId?: string;
  nome_professor?: string;
  sigla_professor?: string;
  titular?: 'Sim' | 'Não' | string;
  instrutor?: '1' | '2' | '3' | '4' | string;
  professorTitularId?: string;
  professorTitularNome?: string;
  siglaProfessor?: string;
  instrutorId?: string;
  instrutorNome?: string;
  siglaInstrutor?: string;
  tipoFuncao?: 'TITULAR' | 'INSTRUTOR';
}

export interface EquipeCalendario {
  id: string;
  nome_da_equipe: string;
  materia: string;
  tipo_curso: string;
  nome_do_curso: string;
  codigo_curso?: string;
  dates_curso?: string;
  modulo: string;
  ano?: string | number;
  data?: string;
  professor_titular_equipe?: string;
  sigla_professor?: string;
  instrutor_equipe?: string;
  sigla_instrutor?: string;
  instrutores?: InstrutorItem[];
  professores_equipe?: ProfessorEquipe[];
  createdAt?: string;
}
