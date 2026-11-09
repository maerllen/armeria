import React, { useState, useEffect } from 'react';
import { User, UserCargo, Department, Unit, Course, getSystemLogo, DEFAULT_SYSTEM_LOGO } from '../types';
import { formatMasp, formatPhone, formatDisplayDate, isCourseExpired, cleanPhone } from '../utils/masks';
import { storage } from '../services/storage';
import { User as UserIcon, Briefcase, GraduationCap, Calendar, AlertTriangle, Check, KeyRound, Palette, Printer, Crosshair, Disc, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from './AlternadorTema';

interface ProfileModuleProps {
  currentUser?: User | null;
  user?: User | null;
  departments?: Department[];
  units?: Unit[];
  allCourses?: Course[];
  onUserUpdated?: () => void;
  onRefresh?: () => void;
  onChangePasswordClick: () => void;
  onNavigateToModule?: (mod: any) => void;
}

export const ProfileModule: React.FC<ProfileModuleProps> = ({
  currentUser,
  user,
  departments = [],
  units = [],
  allCourses = [],
  onUserUpdated,
  onRefresh,
  onChangePasswordClick,
  onNavigateToModule
}) => {
  const activeUser = currentUser || user;

  if (!activeUser) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-400 text-center">
        Nenhum perfil de usuário disponível.
      </div>
    );
  }

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(activeUser.name || '');
  const [phone, setPhone] = useState(activeUser.phone || '');
  const [cargo, setCargo] = useState<UserCargo>(activeUser.cargo || 'Investigador');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Notificações de Cautelas Autorizadas para o usuário logado com dismiss no clique
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`pc_dismissed_alerts_${activeUser.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const userMaspClean = (activeUser.masp || '').replace(/\D/g, '');
  const userNorm = (activeUser.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isProfileUserMatch = (requesterId?: string, requesterMasp?: string, requesterName?: string) => {
    if (requesterId && requesterId === activeUser.id) return true;
    if (requesterMasp && activeUser.masp && requesterMasp.trim().toLowerCase() === activeUser.masp.trim().toLowerCase()) return true;
    const reqClean = (requesterMasp || '').replace(/\D/g, '');
    if (userMaspClean && reqClean && userMaspClean === reqClean) return true;
    const reqNorm = (requesterName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (userNorm && reqNorm && (userNorm === reqNorm || userNorm.includes(reqNorm) || reqNorm.includes(userNorm))) return true;
    return false;
  };

  const userArmasCautelas = storage.getCautelasArmas().filter(
    c => isProfileUserMatch(c.requesterId, c.requesterMasp, c.requesterName) && c.status === 'AUTORIZADA' && !dismissedAlertIds.includes(c.id)
  );
  const userMunicoesCautelas = storage.getCautelasMunicoes().filter(
    c => isProfileUserMatch(c.requesterId, c.requesterMasp, c.requesterName) && c.status === 'AUTORIZADA' && !dismissedAlertIds.includes(c.id)
  );
  const totalAutorizadas = userArmasCautelas.length + userMunicoesCautelas.length;

  const handleDismissAndNavigate = (targetMod: 'cautela-armas' | 'cautela-municoes', idsToDismiss: string[]) => {
    const updated = [...dismissedAlertIds, ...idsToDismiss];
    setDismissedAlertIds(updated);
    try {
      localStorage.setItem(`pc_dismissed_alerts_${activeUser.id}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
    if (onNavigateToModule) {
      onNavigateToModule(targetMod);
    }
  };

  const handleDismissAll = () => {
    const allIds = [...userArmasCautelas.map(c => c.id), ...userMunicoesCautelas.map(c => c.id)];
    const updated = [...dismissedAlertIds, ...allIds];
    setDismissedAlertIds(updated);
    try {
      localStorage.setItem(`pc_dismissed_alerts_${activeUser.id}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeUser) {
      setName(activeUser.name || '');
      setPhone(activeUser.phone || '');
      setCargo(activeUser.cargo || 'Investigador');
    }
  }, [activeUser]);

  const dept = departments.find(d => d.id === activeUser.departmentId);
  const unit = units.find(u => u.id === activeUser.unitId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await storage.updateUser(activeUser.id, {
        name: name.trim(),
        phone: cleanPhone(phone),
        cargo
      });
      setSuccessMsg('Informações do perfil atualizadas com sucesso!');
      setIsEditing(false);
      if (onUserUpdated) onUserUpdated();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar perfil.');
    }
  };

  const cargosList: UserCargo[] = [
    'DELEGADO',
    'PERITO',
    'INVESTIGADOR',
    'ESCRIVÃO'
  ];

  return (
    <div className="space-y-6">
      
      {/* Notificação de Cautelas Autorizadas prontas para impressão de recibo (Some ao clicar) */}
      {totalAutorizadas > 0 && (
        <div className="bg-gradient-to-r from-emerald-950/90 to-teal-950/90 border border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in relative">
          <div className="flex items-center space-x-3.5 pr-8 sm:pr-0">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-200">
                Autorização Concluída pelo Armeiro! ({totalAutorizadas} cautela{totalAutorizadas > 1 ? 's' : ''} pronta{totalAutorizadas > 1 ? 's' : ''})
              </h4>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Sua solicitação foi autorizada e liberada pela armaria. Clique para visualizar e imprimir o recibo.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {userArmasCautelas.length > 0 && onNavigateToModule && (
              <button
                onClick={() => handleDismissAndNavigate('cautela-armas', userArmasCautelas.map(c => c.id))}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow"
                title="Abrir Cautela de Armas (este aviso sumirá após o clique)"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Ver Cautela de Armas ({userArmasCautelas.length})</span>
              </button>
            )}
            {userMunicoesCautelas.length > 0 && onNavigateToModule && (
              <button
                onClick={() => handleDismissAndNavigate('cautela-municoes', userMunicoesCautelas.map(c => c.id))}
                className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow"
                title="Abrir Cautela de Munições (este aviso sumirá após o clique)"
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Ver Cautela de Munições ({userMunicoesCautelas.length})</span>
              </button>
            )}
            <button
              onClick={handleDismissAll}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-lg transition"
              title="Dispensar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Module Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="relative shrink-0">
            <img
              src={getSystemLogo(unit, dept)}
              alt="Logo da Unidade / Departamento"
              className="w-14 h-14 object-contain rounded-2xl bg-slate-950 p-1 border border-amber-500/30 shadow-md shadow-amber-500/5"
              onError={(e) => {
                if (e.currentTarget.src !== window.location.origin + DEFAULT_SYSTEM_LOGO) {
                  e.currentTarget.src = DEFAULT_SYSTEM_LOGO;
                }
              }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{activeUser.name}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              MASP: <span className="font-mono text-amber-400 font-semibold">{formatMasp(activeUser.masp)}</span> (Campo inalterável)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onChangePasswordClick}
            className="flex items-center space-x-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl border border-slate-700 transition"
          >
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>Alterar Senha</span>
          </button>
          
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow"
            >
              Editar Dados
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl transition"
            >
              Cancelar
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
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Personal & Professional info */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3 flex items-center space-x-2">
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span>Dados Funcionais e de Identificação</span>
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* MASP (ReadOnly) */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  MASP (Identificador de Login - Inalterável)
                </label>
                <input
                  type="text"
                  value={formatMasp(activeUser.masp)}
                  disabled
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-400 font-mono cursor-not-allowed"
                />
              </div>

              {/* Perfil */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Perfil de Acesso
                </label>
                <input
                  type="text"
                  value={activeUser.role}
                  disabled
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-amber-400 font-semibold cursor-not-allowed"
                />
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
                  disabled={!isEditing}
                  className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                    isEditing
                      ? 'bg-slate-950 border-amber-500 text-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200 cursor-not-allowed'
                  }`}
                  required
                />
              </div>

              {/* Cargo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Cargo
                </label>
                {isEditing ? (
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value as UserCargo)}
                    className="w-full bg-slate-950 border border-amber-500 text-slate-100 rounded-xl px-3.5 py-2 text-sm"
                  >
                    {cargosList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={activeUser.cargo}
                    disabled
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 cursor-not-allowed"
                  />
                )}
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Telefone
                </label>
                <input
                  type="text"
                  value={isEditing ? phone : formatPhone(phone)}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isEditing}
                  placeholder="(00) 0 0000-0000"
                  className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                    isEditing
                      ? 'bg-slate-950 border-amber-500 text-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200 cursor-not-allowed'
                  }`}
                />
              </div>

              {/* Status do Acesso */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Acesso ao Sistema
                </label>
                <div className="py-2 px-3 bg-slate-950/60 border border-slate-800 rounded-xl text-sm font-medium flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${activeUser.hasSystemAccess ? 'bg-emerald-400' : 'bg-red-500'}`} />
                  <span className={activeUser.hasSystemAccess ? 'text-emerald-400' : 'text-red-400'}>
                    {activeUser.hasSystemAccess ? 'Ativo e Autorizado' : 'Bloqueado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Department & Unit Info */}
            <div className="pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-slate-400 mb-1">Departamento Lotado:</span>
                <p className="text-sm font-semibold text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  {dept ? dept.name : 'Não informado'}
                </p>
              </div>
              <div>
                <span className="block text-xs text-slate-400 mb-1">Unidade Lotada:</span>
                <p className="text-sm font-semibold text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  {unit ? unit.name : 'Não informado'}
                </p>
              </div>
            </div>

            {/* Operational Rights */}
            <div className="pt-4 border-t border-slate-800">
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Permissões Operacionais Especiais
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Pode Movimentar Munições:</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${activeUser.canMoveAmmunition ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>
                    {activeUser.canMoveAmmunition ? 'SIM' : 'NÃO'}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-300">Pode Movimentar Armas:</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${activeUser.canMoveWeapons ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>
                    {activeUser.canMoveWeapons ? 'SIM' : 'NÃO'}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Theme Preference */}
            <div className="pt-4 border-t border-slate-800">
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>Aparência e Tema do Sistema</span>
              </span>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-200 font-semibold block">Tema do Sistema</span>
                  <span className="text-slate-400 text-[11px] block mt-0.5">
                    Alterne entre o tema Claro (padrão) e o tema Escuro.
                  </span>
                </div>
                <div className="shrink-0 self-start sm:self-auto">
                  <ThemeToggle showDropdown={true} />
                </div>
              </div>
            </div>

            {isEditing && (
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-6 py-2.5 rounded-xl shadow transition"
                >
                  Salvar Alterações
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Courses & Qualifications */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <GraduationCap className="w-5 h-5 text-amber-400" />
              <span>Cursos Realizados</span>
            </h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono font-semibold">
              {(activeUser.courses || []).length}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            A validade do curso é de 2 anos. Cursos realizados há mais de 2 anos ficam destacados em vermelho e inabilitam o usuário para solicitar a arma correspondente.
          </p>

          <div className="space-y-3 pt-2">
            {(!activeUser.courses || activeUser.courses.length === 0) ? (
              <div className="bg-slate-950 p-4 rounded-xl text-center border border-slate-800 text-xs text-slate-500">
                Nenhum curso cadastrado para este policial.
              </div>
            ) : (
              activeUser.courses.map((uc, idx) => {
                const courseObj = allCourses.find(c => c.id === uc.courseId);
                const expired = isCourseExpired(uc.completionDate);

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border transition ${
                      expired
                        ? 'bg-red-950/30 border-red-800/80 text-red-200'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-sm block">
                          {courseObj ? courseObj.name : 'Curso ' + uc.courseId}
                        </span>
                        {courseObj && (
                          <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                            <p>Modelos: <span className="text-slate-300 font-mono">{courseObj.allowedModels.join(', ')}</span></p>
                            <p>Calibres: <span className="text-slate-300 font-mono">{courseObj.allowedCalibers.join(', ')}</span></p>
                          </div>
                        )}
                      </div>

                      {/* Course Date Badge - RED if expired (> 2 years) */}
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center space-x-1 text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
                            expired
                              ? 'bg-red-600 text-white border-red-500 animate-pulse'
                              : 'bg-slate-800 text-amber-400 border-slate-700'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          <span>{formatDisplayDate(uc.completionDate)}</span>
                        </span>

                        {expired && (
                          <span className="block text-[10px] font-bold text-red-400 mt-1 flex items-center justify-end space-x-0.5">
                            <AlertTriangle className="w-3 h-3 text-red-400 inline" />
                            <span>EXPIRADO (&gt; 2 anos)</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
