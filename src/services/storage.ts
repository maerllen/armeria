import {
  User,
  Department,
  Unit,
  VaultSpace,
  Caliber,
  AmmunitionStock,
  AmmunitionMovement,
  Weapon,
  Movement,
  Course,
  AuditLog
} from '../types';
import { isCourseExpired } from '../utils/masks';

export interface AppState {
  currentUser: User | null;
  users: User[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  calibers: Caliber[];
  ammoStocks: AmmunitionStock[];
  ammoMovements: AmmunitionMovement[];
  weapons: Weapon[];
  movements: Movement[];
  courses: Course[];
  auditLogs: AuditLog[];
}

class StorageService {
  private state: AppState = {
    currentUser: null,
    users: [],
    departments: [],
    units: [],
    vaultSpaces: [],
    calibers: [],
    ammoStocks: [],
    ammoMovements: [],
    weapons: [],
    movements: [],
    courses: [],
    auditLogs: []
  };

  constructor() {
    // Session state restored from sessionStorage if present (only session user reference)
    try {
      const savedUser = sessionStorage.getItem('armeria_session_user');
      if (savedUser) {
        this.state.currentUser = JSON.parse(savedUser);
      }
    } catch {
      this.state.currentUser = null;
    }
  }

  // --- REFRESH DATA FROM MYSQL BACKEND SERVER ---
  public async refreshFromServer(): Promise<AppState> {
    try {
      const [
        usersRes,
        deptsRes,
        unitsRes,
        vaultsRes,
        calibersRes,
        coursesRes,
        ammoStocksRes,
        ammoMovsRes,
        weaponsRes,
        movsRes,
        auditLogsRes
      ] = await Promise.all([
        fetch('/api/users').then(r => r.ok ? r.json() : []),
        fetch('/api/departments').then(r => r.ok ? r.json() : []),
        fetch('/api/units').then(r => r.ok ? r.json() : []),
        fetch('/api/vault-spaces').then(r => r.ok ? r.json() : []),
        fetch('/api/calibers').then(r => r.ok ? r.json() : []),
        fetch('/api/courses').then(r => r.ok ? r.json() : []),
        fetch('/api/ammo-stocks').then(r => r.ok ? r.json() : []),
        fetch('/api/ammo-movements').then(r => r.ok ? r.json() : []),
        fetch('/api/weapons').then(r => r.ok ? r.json() : []),
        fetch('/api/movements').then(r => r.ok ? r.json() : []),
        fetch('/api/audit-logs').then(r => r.ok ? r.json() : [])
      ]);

      this.state.users = usersRes || [];
      this.state.departments = deptsRes || [];
      this.state.units = unitsRes || [];
      this.state.vaultSpaces = vaultsRes || [];
      this.state.calibers = calibersRes || [];
      this.state.courses = coursesRes || [];
      this.state.ammoStocks = ammoStocksRes || [];
      this.state.ammoMovements = ammoMovsRes || [];
      this.state.weapons = weaponsRes || [];
      this.state.movements = movsRes || [];
      this.state.auditLogs = auditLogsRes || [];

      // Refresh current user reference if logged in
      if (this.state.currentUser) {
        const updatedUser = this.state.users.find(u => u.id === this.state.currentUser?.id);
        if (updatedUser) {
          this.state.currentUser = updatedUser;
          sessionStorage.setItem('armeria_session_user', JSON.stringify(updatedUser));
        }
      }
    } catch (err) {
      console.error('[StorageService] Error refreshing from MySQL server:', err);
    }
    return this.state;
  }

  // --- AUTHENTICATION ---
  public async login(masp: string, pass: string): Promise<{ success: boolean; user: User | null; error?: string; isDbError?: boolean }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maspDigits: masp, passwordDigits: pass })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          user: null,
          error: data.error || 'MASP ou senha incorretos.',
          isDbError: Boolean(data.isDbError)
        };
      }

      this.state.currentUser = data.user;
      sessionStorage.setItem('armeria_session_user', JSON.stringify(data.user));
      await this.refreshFromServer();
      return { success: true, user: data.user };
    } catch (err: any) {
      return {
        success: false,
        user: null,
        error: err.message || 'Erro de conexão com o servidor.',
        isDbError: true
      };
    }
  }

  public loginLocalFallback(masp: string): { success: boolean; user: User | null; error?: string } {
    const cleanMasp = masp.replace(/\D/g, '');
    let user = this.state.users.find(u => u.masp === cleanMasp);
    
    if (!user) {
      // Create local master user fallback if not present
      if (cleanMasp === '1255748' || cleanMasp === '2222222' || cleanMasp === '3333333' || cleanMasp === '4444444') {
        user = {
          id: `usr-fallback-${cleanMasp}`,
          masp: cleanMasp,
          password: cleanMasp,
          name: cleanMasp === '1255748' ? 'Administrador Geral Master (Modo Local)' : `Policial MASP ${cleanMasp}`,
          phone: '31999998888',
          cargo: 'Delegado',
          role: 'Geral',
          departmentId: 'dept-coe',
          unitId: 'unit-coe-insp',
          canMoveAmmunition: true,
          canMoveWeapons: true,
          hasSystemAccess: true,
          mustChangePassword: false,
          courses: [],
          createdAt: new Date().toISOString()
        };
      }
    }

    if (user) {
      this.state.currentUser = user;
      sessionStorage.setItem('armeria_session_user', JSON.stringify(user));
      return { success: true, user };
    }

    return { success: false, user: null, error: 'MASP não encontrado no ambiente local.' };
  }

  public logout() {
    this.state.currentUser = null;
    sessionStorage.removeItem('armeria_session_user');
  }

  public getCurrentUser(): User | null {
    return this.state.currentUser;
  }

  public setCurrentUser(user: User | null): void {
    this.state.currentUser = user;
    if (user) {
      sessionStorage.setItem('armeria_session_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('armeria_session_user');
    }
  }

  public getAllUsersUnfiltered(): User[] {
    return this.state.users;
  }

  public getAllUsers(currentUser?: User | null): User[] {
    return this.getUsers(currentUser);
  }

  public async addAuditLog(action: string, details: string, description?: string): Promise<void> {
    // Audit log placeholder
  }

  public async resetToSeedData(): Promise<void> {
    await fetch('/api/seed', { method: 'POST' });
    await this.refreshFromServer();
  }

  public async changePassword(userId: string, newPass: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: newPass })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Erro ao alterar senha.' };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao comunicar com o servidor.' };
    }
  }

  // --- DEPARTMENTS ---
  public getDepartments(currentUser?: User | null): Department[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.departments;
    return this.state.departments.filter(d => d.id === actor.departmentId);
  }

  public async addDepartment(data: { name: string; code: string }): Promise<Department> {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const dept = await res.json();
    if (!res.ok) throw new Error(dept.error || 'Erro ao criar departamento.');
    await this.refreshFromServer();
    return dept;
  }

  public async updateDepartment(id: string, name: string, code: string): Promise<Department> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, actor: this.state.currentUser })
    });
    const dept = await res.json();
    if (!res.ok) throw new Error(dept.error || 'Erro ao atualizar departamento.');
    await this.refreshFromServer();
    return dept;
  }

  public async deleteDepartment(id: string): Promise<boolean> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir departamento.');
    await this.refreshFromServer();
    return true;
  }

  // --- UNITS ---
  public getUnits(currentUser?: User | null): Unit[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.units;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.units.filter(u => u.departmentId === actor.departmentId);
    }
    return this.state.units.filter(u => u.id === actor.unitId);
  }

  public async addUnit(data: { name: string; departmentId: string }): Promise<Unit> {
    const res = await fetch('/api/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const unit = await res.json();
    if (!res.ok) throw new Error(unit.error || 'Erro ao criar unidade.');
    await this.refreshFromServer();
    return unit;
  }

  public async updateUnit(id: string, name: string, departmentId: string): Promise<Unit> {
    const res = await fetch(`/api/units/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departmentId, actor: this.state.currentUser })
    });
    const unit = await res.json();
    if (!res.ok) throw new Error(unit.error || 'Erro ao atualizar unidade.');
    await this.refreshFromServer();
    return unit;
  }

  public async deleteUnit(id: string): Promise<boolean> {
    const res = await fetch(`/api/units/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir unidade.');
    await this.refreshFromServer();
    return true;
  }

  // --- USERS ---
  public getUsers(currentUser?: User | null): User[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.users;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.users.filter(u => u.departmentId === actor.departmentId);
    }
    return this.state.users.filter(u => u.unitId === actor.unitId);
  }

  public async addUser(data: Omit<User, 'id' | 'password' | 'createdAt' | 'mustChangePassword'>): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'Erro ao cadastrar policial.');
    await this.refreshFromServer();
    return user;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<boolean> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar policial.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteUser(id: string): Promise<boolean> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir policial.');
    await this.refreshFromServer();
    return true;
  }

  // --- COURSES ---
  public getCourses(): Course[] {
    return this.state.courses;
  }

  public async addCourse(data: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const course = await res.json();
    if (!res.ok) throw new Error(course.error || 'Erro ao adicionar curso.');
    await this.refreshFromServer();
    return course;
  }

  public async deleteCourse(id: string): Promise<boolean> {
    const res = await fetch(`/api/courses/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir curso.');
    await this.refreshFromServer();
    return true;
  }

  // --- VAULT SPACES ---
  public getVaultSpaces(currentUser?: User | null): VaultSpace[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.vaultSpaces;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.vaultSpaces.filter(v => v.departmentId === actor.departmentId);
    }
    return this.state.vaultSpaces.filter(v => v.unitId === actor.unitId);
  }

  public async addVaultSpace(data: Omit<VaultSpace, 'id' | 'createdAt'>): Promise<VaultSpace> {
    const res = await fetch('/api/vault-spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const space = await res.json();
    if (!res.ok) throw new Error(space.error || 'Erro ao criar local no cofre.');
    await this.refreshFromServer();
    return space;
  }

  public async deleteVaultSpace(id: string): Promise<boolean> {
    const res = await fetch(`/api/vault-spaces/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir local do cofre.');
    await this.refreshFromServer();
    return true;
  }

  // --- CALIBERS ---
  public getCalibers(): Caliber[] {
    return this.state.calibers;
  }

  public async addCaliber(name: string): Promise<Caliber> {
    const res = await fetch('/api/calibers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, actor: this.state.currentUser })
    });
    const caliber = await res.json();
    if (!res.ok) throw new Error(caliber.error || 'Erro ao cadastrar calibre.');
    await this.refreshFromServer();
    return caliber;
  }

  public async deleteCaliber(id: string): Promise<boolean> {
    const res = await fetch(`/api/calibers/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir calibre.');
    await this.refreshFromServer();
    return true;
  }

  // --- AMMUNITION ---
  public getAmmoStocks(currentUser?: User | null): AmmunitionStock[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.ammoStocks;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.ammoStocks.filter(s => s.departmentId === actor.departmentId);
    }
    return this.state.ammoStocks.filter(s => s.unitId === actor.unitId);
  }

  public getAmmoMovements(currentUser?: User | null): AmmunitionMovement[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.ammoMovements;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.ammoMovements.filter(m => m.departmentId === actor.departmentId);
    }
    return this.state.ammoMovements.filter(m => m.unitId === actor.unitId);
  }

  public async addAmmoMovement(data: {
    type: 'Entrada' | 'Saída';
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
  }): Promise<AmmunitionMovement> {
    const res = await fetch('/api/ammo-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const mov = await res.json();
    if (!res.ok) throw new Error(mov.error || 'Erro ao registrar movimentação de munição.');
    await this.refreshFromServer();
    return mov;
  }

  public recordAmmoMovement(data: {
    type: 'Entrada' | 'Saída';
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
  }) {
    return this.addAmmoMovement(data);
  }

  public async deleteAmmoStock(id: string): Promise<boolean> {
    const res = await fetch(`/api/ammo-stocks/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir registro de estoque.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteAmmoMovement(id: string): Promise<boolean> {
    const res = await fetch(`/api/ammo-movements/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir movimentação de munição.');
    await this.refreshFromServer();
    return true;
  }

  // --- WEAPONS ---
  public getWeapons(currentUser?: User | null): Weapon[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];

    let result: Weapon[] = [];
    if (actor.role === 'Geral') {
      result = this.state.weapons;
    } else if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      result = this.state.weapons.filter(w => w.departmentId === actor.departmentId);
    } else {
      // Policial: filter weapons in unit and qualified courses
      result = this.state.weapons.filter(w => w.unitId === actor.unitId);
      const validCourses = (actor.courses || []).filter(c => !isCourseExpired(c.completionDate));
      const qualifiedCourseObjects = this.state.courses.filter(courseObj =>
        validCourses.some(vc => vc.courseId === courseObj.id)
      );

      result = result.filter(weapon => {
        return qualifiedCourseObjects.some(course => {
          const modelMatch = course.allowedModels.some(m => m.toLowerCase() === weapon.model.toLowerCase());
          const caliberMatch = course.allowedCalibers.some(c => c.toLowerCase() === weapon.caliber.toLowerCase());
          return modelMatch && caliberMatch;
        });
      });
    }

    return result;
  }

  public getAllWeaponsForAdmin(currentUser?: User | null): Weapon[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.weapons;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.weapons.filter(w => w.departmentId === actor.departmentId);
    }
    return this.state.weapons.filter(w => w.unitId === actor.unitId);
  }

  public async addWeapon(data: Omit<Weapon, 'id' | 'createdAt' | 'status'>): Promise<Weapon> {
    const res = await fetch('/api/weapons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const weap = await res.json();
    if (!res.ok) throw new Error(weap.error || 'Erro ao cadastrar arma.');
    await this.refreshFromServer();
    return weap;
  }

  public async updateWeapon(id: string, updates: Partial<Weapon>): Promise<boolean> {
    const res = await fetch(`/api/weapons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar arma.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteWeapon(id: string): Promise<boolean> {
    const res = await fetch(`/api/weapons/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir arma.');
    await this.refreshFromServer();
    return true;
  }

  // --- WEAPON MOVEMENTS (CAUTELAS) ---
  public getMovements(currentUser?: User | null): Movement[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.movements;
    if (actor.role === 'Administrador' || actor.role === 'Armeiro') {
      return this.state.movements.filter(m => m.departmentId === actor.departmentId);
    }
    return this.state.movements.filter(m => m.unitId === actor.unitId);
  }

  public getWeaponMovementHistory(weaponId: string): Movement[] {
    return this.state.movements
      .filter(m => m.weaponId === weaponId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }

  public async requestWithdrawal(data: {
    weaponId: string;
    ammunitionCount: number;
    magazineCount: number;
  }): Promise<boolean> {
    const res = await fetch('/api/movements/request-withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao solicitar retirada.');
    await this.refreshFromServer();
    return true;
  }

  public async approveWithdrawal(movementId: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${movementId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao aprovar retirada.');
    await this.refreshFromServer();
    return true;
  }

  public async requestReturn(data: {
    movementId: string;
    returnVaultSpaceId: string;
    returningAmmunitionCount: number;
    returningMagazineCount: number;
    divergenceJustification?: string;
  }): Promise<boolean> {
    const res = await fetch(`/api/movements/${data.movementId}/request-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao solicitar devolução.');
    await this.refreshFromServer();
    return true;
  }

  public async confirmReceipt(movementId: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${movementId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao confirmar recibo.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteMovement(id: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao excluir movimentação.');
    await this.refreshFromServer();
    return true;
  }

  // --- AUDIT LOGS ---
  public getAuditLogs(): AuditLog[] {
    return this.state.auditLogs;
  }
}

export const storage = new StorageService();
