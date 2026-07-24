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
  | 'manual';

export type UserCargo = 
  | 'Delegado' 
  | 'Investigador' 
  | 'Escrivão' 
  | 'Perito' 
  | 'Médico Legista' 
  | 'Operador';

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

export interface Course {
  id: string;
  name: string; // e.g., "Operador de fuzil"
  allowedModels: string[]; // e.g., ["T4", "IA2"]
  allowedCalibers: string[]; // e.g., ["5,56x45mm"]
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
  recipientOrReason: string; // Name of user or "Curso" | "Treinamento" | "Substituição"
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
