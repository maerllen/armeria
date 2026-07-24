import React, { useState, useEffect } from 'react';
import { User, Department, Unit, VaultSpace, Caliber, AmmunitionStock, Weapon, Movement, AmmunitionMovement, ModuleType } from './types';
import { storage } from './services/storage';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { ProfileModule } from './components/ProfileModule';
import { UnitModule } from './components/UnitModule';
import { UserModule } from './components/UserModule';
import { VaultModule } from './components/VaultModule';
import { AmmunitionModule } from './components/AmmunitionModule';
import { WeaponModule } from './components/WeaponModule';
import { MovementModule } from './components/MovementModule';
import { ReportModule } from './components/ReportModule';
import { ManualModule } from './components/ManualModule';
import { Shield, Users, Crosshair, Disc, Vault, ArrowRightLeft, FileText, AlertTriangle, Key, Activity, Clock } from 'lucide-react';
import { formatTimestamp } from './utils/masks';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleType>('meu-perfil');

  // App domain state from storage service
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vaultSpaces, setVaultSpaces] = useState<VaultSpace[]>([]);
  const [calibers, setCalibers] = useState<Caliber[]>([]);
  const [ammoStocks, setAmmoStocks] = useState<AmmunitionStock[]>([]);
  const [ammoMovements, setAmmoMovements] = useState<AmmunitionMovement[]>([]);
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [courses, setCourses] = useState(storage.getCourses());

  // UI Modals
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const [loginError, setLoginError] = useState('');

  // Load all app data based on logged in user
  const refreshData = async () => {
    const active = storage.getCurrentUser();
    if (active) {
      await storage.refreshFromServer();
      const freshUser = storage.getCurrentUser();
      setCurrentUser(freshUser);

      setAllUsers(storage.getUsers(freshUser));
      setDepartments(storage.getDepartments(freshUser));
      setUnits(storage.getUnits(freshUser));
      setVaultSpaces(storage.getVaultSpaces(freshUser));
      setCalibers(storage.getCalibers());
      setAmmoStocks(storage.getAmmoStocks(freshUser));
      setAmmoMovements(storage.getAmmoMovements(freshUser));
      setWeapons(storage.getWeapons(freshUser));
      setMovements(storage.getMovements(freshUser));
      setCourses(storage.getCourses());
    } else {
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleLoginSubmit = async (maspDigits: string, passwordInput: string) => {
    setLoginError('');
    const res = await storage.login(maspDigits, passwordInput);
    if (!res.success || !res.user) {
      setLoginError(res.error || 'MASP ou senha incorretos.');
      return;
    }

    setCurrentUser(res.user);
    await refreshData();

    if (res.user.password === res.user.masp) {
      setShowChangePasswordModal(true);
    } else {
      setShowChangePasswordModal(false);
    }
  };

  const handleLogout = () => {
    storage.logout();
    setCurrentUser(null);
    setShowChangePasswordModal(false);
    setLoginError('');
  };

  const handleLocalFallbackLogin = (maspDigits: string) => {
    setLoginError('');
    const res = storage.loginLocalFallback(maspDigits);
    if (!res.success || !res.user) {
      setLoginError(res.error || 'MASP não encontrado no ambiente local.');
      return;
    }
    setCurrentUser(res.user);
    refreshData();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <LoginModal
          onLoginSuccess={handleLoginSubmit}
          onLocalFallbackLogin={handleLocalFallbackLogin}
          error={loginError}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onChangePasswordClick={() => setShowChangePasswordModal(true)}
        onUserSwitched={refreshData}
      />

      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Navigation */}
        <Sidebar
          currentUser={currentUser}
          activeModule={activeModule}
          onSelectModule={(mod) => setActiveModule(mod)}
          pendingMovementsCount={movements.filter(m => m.status === 'Pendente Aprovação' || m.status === 'Pendente Recibo').length}
        />

        {/* Main Workspace */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
          
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:hidden">
            <div className="glass-card hover:border-amber-500/40 rounded-2xl p-4 flex items-center space-x-3.5 transition-all">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Crosshair className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono">Armas em Acervo</span>
                <p className="text-xl font-black text-slate-100 font-mono">{weapons.length}</p>
              </div>
            </div>

            <div className="glass-card hover:border-cyan-500/40 rounded-2xl p-4 flex items-center space-x-3.5 transition-all">
              <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                <Disc className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono">Munições em Estoque</span>
                <p className="text-xl font-black text-slate-100 font-mono">
                  {ammoStocks.reduce((acc, curr) => acc + curr.quantity, 0)} <span className="text-xs text-slate-400 font-normal">un</span>
                </p>
              </div>
            </div>

            <div className="glass-card hover:border-purple-500/40 rounded-2xl p-4 flex items-center space-x-3.5 transition-all">
              <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono">Em Trânsito</span>
                <p className="text-xl font-black text-amber-400 font-mono">
                  {weapons.filter(w => w.status === 'Em Trânsito').length}
                </p>
              </div>
            </div>

            <div className="glass-card hover:border-emerald-500/40 rounded-2xl p-4 flex items-center space-x-3.5 transition-all">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Vault className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono">No Cofre</span>
                <p className="text-xl font-black text-emerald-400 font-mono">
                  {weapons.filter(w => w.status === 'No Cofre').length}
                </p>
              </div>
            </div>
          </div>


          {/* Module Views */}
          {activeModule === 'meu-perfil' && currentUser && (
            <ProfileModule
              currentUser={currentUser}
              user={currentUser}
              departments={departments}
              units={units}
              allCourses={courses}
              onUserUpdated={refreshData}
              onRefresh={refreshData}
              onChangePasswordClick={() => setShowChangePasswordModal(true)}
            />
          )}

          {activeModule === 'unidade' && (
            <UnitModule
              currentUser={currentUser}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'usuarios' && (
            <UserModule
              currentUser={currentUser}
              users={allUsers}
              departments={departments}
              units={units}
              courses={courses}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'cofre' && (
            <VaultModule
              currentUser={currentUser}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'municoes' && (
            <AmmunitionModule
              currentUser={currentUser}
              calibers={calibers}
              stocks={ammoStocks}
              movements={ammoMovements}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'armas' && (
            <WeaponModule
              currentUser={currentUser}
              weapons={weapons}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'movimentacoes' && (
            <MovementModule
              currentUser={currentUser}
              movements={movements}
              weapons={weapons}
              vaultSpaces={vaultSpaces}
              courses={courses}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'relatorio' && (
            <ReportModule
              currentUser={currentUser}
              movements={movements}
              departments={departments}
              units={units}
              calibers={calibers}
              weapons={weapons}
              users={allUsers}
            />
          )}

          {activeModule === 'manual' && (
            <ManualModule />
          )}

          {/* Footer Bar with Audit Log Trigger */}
          <footer className="pt-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 print:hidden">
            <div>
              Polícia Civil • <strong className="text-slate-400">Armeria</strong> v2.0
            </div>

            <button
              onClick={() => setShowAuditModal(true)}
              className="text-slate-400 hover:text-amber-400 font-mono text-[11px] flex items-center space-x-1 transition"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Ver Trilha de Auditoria (Logs do Sistema)</span>
            </button>
          </footer>

        </main>
      </div>

      {/* Change Password Modal */}
      {(showChangePasswordModal || currentUser.password === currentUser.masp || currentUser.mustChangePassword) && currentUser && (
        <ChangePasswordModal
          user={currentUser}
          isMandatory={currentUser.password === currentUser.masp || currentUser.mustChangePassword}
          onSuccess={() => {
            setShowChangePasswordModal(false);
            refreshData();
          }}
          onCancel={
            (currentUser.password === currentUser.masp || currentUser.mustChangePassword)
              ? handleLogout
              : () => setShowChangePasswordModal(false)
          }
        />
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Activity className="w-5 h-5 text-amber-400" />
                <span>Trilha de Auditoria do Sistema</span>
              </h3>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {storage.getAuditLogs().length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum log registrado.</p>
              ) : (
                storage.getAuditLogs().map((log) => (
                  <div key={log.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{log.userName} (MASP: {log.userMasp})</span>
                      <span className="text-slate-500">{formatTimestamp(log.timestamp)}</span>
                    </div>
                    <p className="font-semibold text-slate-200">{log.action}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
