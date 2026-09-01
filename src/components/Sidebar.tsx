import React from 'react';
import { User as UserType, Department, ModuleType } from '../types';
import {
  User,
  Building2,
  Users,
  Vault,
  Disc,
  Crosshair,
  ArrowRightLeft,
  FileText,
  BookOpen,
  GraduationCap,
  Award,
  Smartphone,
  Calendar,
  X,
  Shield,
  ShieldCheck
} from 'lucide-react';
import { formatMasp } from '../utils/masks';

interface SidebarProps {
  currentUser: UserType | null;
  departments?: Department[];
  activeModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  pendingMovementsCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  departments = [],
  activeModule,
  onSelectModule,
  pendingMovementsCount = 0,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const userRole = currentUser?.role || 'Policial';
  const isGeral = userRole === 'Geral';
  const userDept = departments.find(d => d.id === currentUser?.departmentId);
  const isAcademiaDept = (userDept?.name || '').toUpperCase().includes('ACADEMIA');
  const isProfessorAcadepol = Boolean(
    currentUser?.isTeacher ||
    currentUser?.teacherSubject ||
    currentUser?.professorSigla ||
    currentUser?.professor_sigla ||
    isGeral ||
    (isAcademiaDept && (userRole === 'Administrador' || userRole === 'Armeiro'))
  );
  const canManageCourses = userRole === 'Geral' || 
    ((userRole === 'Administrador' || userRole === 'Armeiro') && isAcademiaDept) ||
    isProfessorAcadepol;

  const navItems: { id: ModuleType; label: string; icon: React.ComponentType<{ className?: string }>; visible: boolean; badge?: number }[] = [
    {
      id: 'meu-perfil',
      label: 'Meu Perfil',
      icon: User,
      visible: true
    },
    {
      id: 'unidade',
      label: 'Unidades e Deptos',
      icon: Building2,
      visible: true
    },
    {
      id: 'usuarios',
      label: 'Usuários e Cursos',
      icon: Users,
      visible: true
    },
    {
      id: 'cofre',
      label: 'Locais do Cofre',
      icon: Vault,
      visible: true
    },
    {
      id: 'municoes',
      label: 'Munições',
      icon: Disc,
      visible: true
    },
    {
      id: 'armas',
      label: 'Armas',
      icon: Crosshair,
      visible: true
    },
    {
      id: 'movimentacoes',
      label: 'Movimentações',
      icon: ArrowRightLeft,
      visible: true,
      badge: pendingMovementsCount > 0 ? pendingMovementsCount : undefined
    },
    {
      id: 'iniciar-aula-mobile',
      label: 'Iniciar Aula (Modo Celular)',
      icon: Smartphone,
      visible: isGeral
    },
    {
      id: 'cursos',
      label: 'Curso de Formação',
      icon: GraduationCap,
      visible: canManageCourses
    },
    {
      id: 'ensino-continuado',
      label: 'Ensino Continuado',
      icon: Award,
      visible: canManageCourses
    },
    {
      id: 'gerencia-cursos',
      label: 'Gerência de Cursos',
      icon: BookOpen,
      visible: canManageCourses
    },
    {
      id: 'calendario',
      label: 'Calendário Curso de Formação',
      icon: Calendar,
      visible: isProfessorAcadepol
    },
    {
      id: 'certificados',
      label: 'Verificar Certificados',
      icon: ShieldCheck,
      visible: isGeral
    },
    {
      id: 'relatorio',
      label: 'Relatórios',
      icon: FileText,
      visible: userRole === 'Geral' || userRole === 'Administrador' || userRole === 'Armeiro'
    }
  ];

  const handleItemClick = (mod: ModuleType) => {
    onSelectModule(mod);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full p-4 space-y-4">
      <div className="space-y-3">
        {/* Mobile-only header inside drawer */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 md:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="bg-amber-500 p-1.5 rounded-lg text-slate-950 font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-100">{currentUser?.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">MASP: {formatMasp(currentUser?.masp || '')}</p>
            </div>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-3 py-1 text-[10px] font-bold text-amber-400/80 uppercase tracking-widest font-mono">
          MÓDULOS DA ARMERIA
        </div>
        <nav className="space-y-1.5">
          {navItems
            .filter(item => item.visible)
            .map(item => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20 neon-border'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-amber-400'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-slate-950 text-amber-400'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
        <p className="font-semibold text-slate-400 font-mono">Armeria v2.0 • Polícia Civil</p>
        <p className="text-[10px] text-slate-500">Gestão Tática de Armamento</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 glass border-r border-slate-800/80 shrink-0 min-h-[calc(100vh-4rem)] flex-col justify-between print:hidden">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex print:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />

          {/* Drawer Container */}
          <div className="relative w-4/5 max-w-xs bg-slate-900 border-r border-slate-800 h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

