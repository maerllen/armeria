import React from 'react';
import { User as UserType, Department, ModuleType, getAllowedModulesForUser } from '../types';
import {
  User,
  Building2,
  Users,
  Vault,
  Crosshair,
  Disc,
  ArrowRightLeft,
  FileText,
  BookOpen,
  GraduationCap,
  Award,
  Smartphone,
  Calendar,
  X,
  Shield,
  ShieldCheck,
  Package,
  Bomb,
  Dog
} from 'lucide-react';
import { formatMasp } from '../utils/masks';
import { ThemeToggle } from './AlternadorTema';

interface SidebarProps {
  currentUser: UserType | null;
  departments?: Department[];
  activeModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  pendingMovementsCount?: number;
  pendingWeaponCautelasCount?: number;
  pendingAmmoCautelasCount?: number;
  pendingMaterialCautelasCount?: number;
  readyReceiptsCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  departments = [],
  activeModule,
  onSelectModule,
  pendingMovementsCount = 0,
  pendingWeaponCautelasCount = 0,
  pendingAmmoCautelasCount = 0,
  pendingMaterialCautelasCount = 0,
  readyReceiptsCount = 0,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const allowedModules = getAllowedModulesForUser(currentUser);

  // Lista dos módulos do sistema na ordem exata solicitada
  const navItems: { 
    id: ModuleType; 
    label: string; 
    icon: React.ComponentType<{ className?: string }>; 
    visible: boolean; 
    badge?: number;
    hasNotification?: boolean;
  }[] = [
    {
      id: 'meu-perfil',
      label: 'Meu Perfil',
      icon: User,
      visible: allowedModules.includes('meu-perfil'),
      hasNotification: readyReceiptsCount > 0,
      badge: readyReceiptsCount > 0 ? readyReceiptsCount : undefined
    },
    {
      id: 'cautela-armas',
      label: 'Cautela de armas',
      icon: Crosshair,
      visible: allowedModules.includes('cautela-armas'),
      hasNotification: pendingWeaponCautelasCount > 0,
      badge: pendingWeaponCautelasCount > 0 ? pendingWeaponCautelasCount : undefined
    },
    {
      id: 'cautela-municoes',
      label: 'Cautela de munições',
      icon: Disc,
      visible: allowedModules.includes('cautela-municoes'),
      hasNotification: pendingAmmoCautelasCount > 0,
      badge: pendingAmmoCautelasCount > 0 ? pendingAmmoCautelasCount : undefined
    },
    {
      id: 'cautela-materiais',
      label: 'Cautela de materiais',
      icon: Package,
      visible: allowedModules.includes('cautela-materiais'),
      hasNotification: pendingMaterialCautelasCount > 0,
      badge: pendingMaterialCautelasCount > 0 ? pendingMaterialCautelasCount : undefined
    },
    {
      id: 'explosivos',
      label: 'Explosivos',
      icon: Bomb,
      visible: allowedModules.includes('explosivos')
    },
    {
      id: 'armas',
      label: 'Armas',
      icon: Crosshair,
      visible: allowedModules.includes('armas')
    },
    {
      id: 'municoes',
      label: 'Munições',
      icon: Disc,
      visible: allowedModules.includes('municoes')
    },
    {
      id: 'unidade',
      label: 'Unidades e Deptos',
      icon: Building2,
      visible: allowedModules.includes('unidade')
    },
    {
      id: 'usuarios',
      label: 'Usuários',
      icon: Users,
      visible: allowedModules.includes('usuarios')
    },
    {
      id: 'cofre',
      label: 'Locais do Cofre',
      icon: Vault,
      visible: allowedModules.includes('cofre')
    },
    {
      id: 'movimentacoes',
      label: 'Movimentações',
      icon: ArrowRightLeft,
      visible: allowedModules.includes('movimentacoes'),
      badge: pendingMovementsCount > 0 ? pendingMovementsCount : undefined,
      hasNotification: pendingMovementsCount > 0
    },
    {
      id: 'materiais',
      label: 'Materiais',
      icon: Package,
      visible: allowedModules.includes('materiais')
    },
    {
      id: 'iniciar-aula-mobile',
      label: 'Iniciar Aula (Modo Celular)',
      icon: Smartphone,
      visible: allowedModules.includes('iniciar-aula-mobile')
    },
    {
      id: 'cursos',
      label: 'Curso de Formação',
      icon: GraduationCap,
      visible: allowedModules.includes('cursos')
    },
    {
      id: 'ensino-continuado',
      label: 'Ensino Continuado',
      icon: Award,
      visible: allowedModules.includes('ensino-continuado')
    },
    {
      id: 'gerencia-cursos',
      label: 'Gerência de Cursos',
      icon: BookOpen,
      visible: allowedModules.includes('gerencia-cursos')
    },
    {
      id: 'calendario',
      label: 'Calendário Curso de Formação',
      icon: Calendar,
      visible: allowedModules.includes('calendario')
    },
    {
      id: 'certificados',
      label: 'Verificar Certificados',
      icon: ShieldCheck,
      visible: allowedModules.includes('certificados')
    },
    {
      id: 'veterinario',
      label: 'CANIL',
      icon: Dog,
      visible: allowedModules.includes('veterinario')
    },
    {
      id: 'relatorio',
      label: 'Relatórios',
      icon: FileText,
      visible: allowedModules.includes('relatorio')
    },
    {
      id: 'manual',
      label: 'Manual do Policial',
      icon: BookOpen,
      visible: allowedModules.includes('manual')
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
          MÓDULOS DA ARMARIA
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
                  className={`w-full flex items-center justify-between px-3.5 py-3 md:py-2.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20 neon-border'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-amber-400'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    {item.hasNotification && (
                      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Solicitação pendente de sua ação / autorização">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                      </span>
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
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

      {/* Footer Info & Theme Switcher */}
      <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Tema:</span>
          <ThemeToggle compact={false} />
        </div>
        <div className="text-[11px] text-slate-500 space-y-0.5">
          <p className="font-semibold text-slate-400 font-mono">Armaria v2.0 • Polícia Civil</p>
          <p className="text-[10px] text-slate-500">Gestão Tática de Materiais Bélicos</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 glass border-r border-slate-800/80 shrink-0 min-h-[calc(100dvh-4rem)] flex-col justify-between print:hidden">
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
          <div className="relative w-[84vw] max-w-xs bg-slate-900 border-r border-slate-800 h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-2xl flex flex-col z-10 overflow-y-auto overscroll-contain">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

