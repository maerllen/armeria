import React, { useState, useMemo } from 'react';
import { User, Weapon, Department, Unit, VaultSpace } from '../types';
import { formatTimestamp, formatMasp } from '../utils/masks';
import { printDocumentInPage } from '../utils/printHelper';
import {
  Printer,
  X,
  Filter,
  CheckSquare,
  Square,
  Search,
  Building,
  Crosshair,
  Shield,
  RotateCcw,
  FileText,
  Check,
  MapPin,
  Calendar,
  SlidersHorizontal
} from 'lucide-react';

interface PrintArsenalModalProps {
  currentUser: User;
  weapons: Weapon[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  initialUnitId?: string;
  initialDeptId?: string;
  onClose: () => void;
}

export const PrintArsenalModal: React.FC<PrintArsenalModalProps> = ({
  currentUser,
  weapons,
  departments,
  units,
  vaultSpaces,
  initialUnitId,
  initialDeptId,
  onClose
}) => {
  const isGeral = currentUser.role === 'Geral';
  const isAdmin = currentUser.role === 'Administrador';
  const isArmeiro = currentUser.role === 'Armeiro';

  // Permission Scope: Limit selectable departments and units to what the user is authorized to see
  const accessibleDepts = useMemo(() => {
    if (isGeral) return departments;
    return departments.filter(d => d.id === currentUser.departmentId);
  }, [departments, isGeral, currentUser]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => {
    if (initialDeptId && accessibleDepts.some(d => d.id === initialDeptId)) {
      return initialDeptId;
    }
    return accessibleDepts[0]?.id || '';
  });

  const accessibleUnits = useMemo(() => {
    let list = units;
    if (!isGeral) {
      if (isAdmin || isArmeiro || currentUser.managementScope !== 'unit') {
        list = list.filter(u => u.departmentId === currentUser.departmentId);
      } else {
        // Restricted to unit
        list = list.filter(u => u.id === currentUser.unitId);
      }
    }
    if (selectedDeptId && selectedDeptId !== 'ALL') {
      list = list.filter(u => u.departmentId === selectedDeptId);
    }
    return list;
  }, [units, isGeral, isAdmin, isArmeiro, currentUser, selectedDeptId]);

  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    if (initialUnitId && accessibleUnits.some(u => u.id === initialUnitId)) {
      return initialUnitId;
    }
    return accessibleUnits[0]?.id || 'ALL';
  });

  // Filters
  // By default, filter to "DISPONIVEL" (No Cofre) as requested: "imprimir as armas disponíveis na unidade"
  const [statusFilter, setStatusFilter] = useState<'DISPONIVEL' | 'TODOS' | 'TRANSITO' | 'MANUTENCAO'>('DISPONIVEL');
  const [filterType, setFilterType] = useState<string>('TODOS');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('TODOS');
  const [filterCaliber, setFilterCaliber] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');

  // Set of selected weapon IDs for custom print selection
  const [selectedWeaponIds, setSelectedWeaponIds] = useState<Set<string>>(new Set());

  // Base list of weapons restricted strictly by the user's viewable scope
  const scopedWeapons = useMemo(() => {
    return weapons.filter(w => {
      // Must match department if filtered
      if (selectedDeptId && selectedDeptId !== 'ALL' && w.departmentId !== selectedDeptId) {
        return false;
      }
      // Must match unit if specific unit selected
      if (selectedUnitId && selectedUnitId !== 'ALL' && w.unitId !== selectedUnitId) {
        return false;
      }
      return true;
    });
  }, [weapons, selectedDeptId, selectedUnitId]);

  // Dynamic filter options based on the scoped weapons
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    scopedWeapons.forEach(w => { if (w.type) set.add(w.type.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedWeapons]);

  const availableManufacturers = useMemo(() => {
    const set = new Set<string>();
    scopedWeapons.forEach(w => { if (w.manufacturer) set.add(w.manufacturer.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedWeapons]);

  const availableCalibers = useMemo(() => {
    const set = new Set<string>();
    scopedWeapons.forEach(w => { if (w.caliber) set.add(w.caliber.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedWeapons]);

  // Final filtered list of weapons
  const filteredWeapons = useMemo(() => {
    return scopedWeapons.filter(w => {
      // Status filter
      if (statusFilter === 'DISPONIVEL' && w.status !== 'No Cofre') return false;
      if (statusFilter === 'TRANSITO' && w.status !== 'Em Trânsito') return false;
      if (statusFilter === 'MANUTENCAO' && w.status !== 'EM MANUTENÇÃO' && w.status !== 'Em Manutenção' && w.status !== 'Manutenção') return false;

      // Type filter
      if (filterType !== 'TODOS' && (w.type || '').trim().toLowerCase() !== filterType.trim().toLowerCase()) {
        return false;
      }

      // Manufacturer filter
      if (filterManufacturer !== 'TODOS' && (w.manufacturer || '').trim().toLowerCase() !== filterManufacturer.trim().toLowerCase()) {
        return false;
      }

      // Caliber filter
      if (filterCaliber !== 'TODOS' && (w.caliber || '').trim().toLowerCase() !== filterCaliber.trim().toLowerCase()) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesSerial = (w.serialNumber || '').toLowerCase().includes(term);
        const matchesModel = (w.model || '').toLowerCase().includes(term);
        const matchesManuf = (w.manufacturer || '').toLowerCase().includes(term);
        const matchesType = (w.type || '').toLowerCase().includes(term);
        const matchesCaliber = (w.caliber || '').toLowerCase().includes(term);
        return matchesSerial || matchesModel || matchesManuf || matchesType || matchesCaliber;
      }

      return true;
    });
  }, [scopedWeapons, statusFilter, filterType, filterManufacturer, filterCaliber, searchTerm]);

  // Toggle selection of single weapon
  const toggleWeaponSelection = (id: string) => {
    setSelectedWeaponIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all filtered weapons
  const handleSelectAllFiltered = () => {
    setSelectedWeaponIds(new Set(filteredWeapons.map(w => w.id)));
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedWeaponIds(new Set());
  };

  // Reset all filters
  const handleResetFilters = () => {
    setStatusFilter('DISPONIVEL');
    setFilterType('TODOS');
    setFilterManufacturer('TODOS');
    setFilterCaliber('TODOS');
    setSearchTerm('');
  };

  // Get active unit and department objects
  const activeUnitObj = units.find(u => u.id === selectedUnitId);
  const activeDeptObj = departments.find(d => d.id === selectedDeptId);

  // Print execution: Generates official police inventory report with Armeiro signature block
  const handlePrint = (mode: 'ALL_UNIT' | 'SELECTED' | 'ALL_FILTERED') => {
    let weaponsToPrint: Weapon[] = [];

    if (mode === 'ALL_UNIT') {
      // All available weapons of the unit (or all weapons of unit)
      weaponsToPrint = scopedWeapons.filter(w => w.status === 'No Cofre');
      if (weaponsToPrint.length === 0) {
        weaponsToPrint = scopedWeapons;
      }
    } else if (mode === 'SELECTED') {
      weaponsToPrint = filteredWeapons.filter(w => selectedWeaponIds.has(w.id));
    } else {
      weaponsToPrint = filteredWeapons;
    }

    if (weaponsToPrint.length === 0) {
      alert('Nenhuma arma selecionada ou disponível para impressão com os critérios atuais.');
      return;
    }

    // Sort alphabetically by Type, then Manufacturer, Model, Serial
    const sortedWeapons = [...weaponsToPrint].sort((a, b) => {
      const typeComp = (a.type || '').localeCompare(b.type || '');
      if (typeComp !== 0) return typeComp;
      const manufComp = (a.manufacturer || '').localeCompare(b.manufacturer || '');
      if (manufComp !== 0) return manufComp;
      return (a.serialNumber || '').localeCompare(b.serialNumber || '');
    });

    const now = new Date();
    const emissionDate = formatTimestamp(now.toISOString());
    const authCode = `PCMG-ARS-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Statistics breakdown
    const typeCountMap: Record<string, number> = {};
    const caliberCountMap: Record<string, number> = {};
    let totalCarregadores = 0;

    sortedWeapons.forEach(w => {
      typeCountMap[w.type || 'Outros'] = (typeCountMap[w.type || 'Outros'] || 0) + 1;
      caliberCountMap[w.caliber || 'N/A'] = (caliberCountMap[w.caliber || 'N/A'] || 0) + 1;
      totalCarregadores += w.magazineQuantity || 0;
    });

    const unitDisplayName = activeUnitObj
      ? activeUnitObj.name
      : (selectedUnitId === 'ALL' ? 'TODAS AS UNIDADES DO DEPARTAMENTO' : 'UNIDADE NÃO ESPECIFICADA');

    const deptDisplayName = activeDeptObj
      ? activeDeptObj.name
      : (activeUnitObj ? (departments.find(d => d.id === activeUnitObj.departmentId)?.name || 'DEPARTAMENTO DA POLÍCIA CIVIL') : 'POLÍCIA CIVIL DE MINAS GERAIS');

    const filterDescription = [
      statusFilter === 'DISPONIVEL' ? 'Situação: DISPONÍVEIS NO COFRE' : (statusFilter === 'TRANSITO' ? 'Situação: EM TRÂNSITO' : 'Situação: TODAS AS ARMAS'),
      filterType !== 'TODOS' ? `Tipo: ${filterType}` : null,
      filterManufacturer !== 'TODOS' ? `Fabricante: ${filterManufacturer}` : null,
      filterCaliber !== 'TODOS' ? `Calibre: ${filterCaliber}` : null,
      mode === 'SELECTED' ? `Seleção Manual: ${sortedWeapons.length} arma(s)` : null
    ].filter(Boolean).join(' • ');

    const tableRowsHtml = sortedWeapons.map((w, index) => {
      const unit = units.find(u => u.id === w.unitId);
      const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);

      const locationText = vault
        ? `Cofre: ${vault.code} (${vault.type})`
        : (w.status === 'Em Trânsito' ? 'Em Cautela / Trânsito' : (w.status === 'Pendente de Recibo' ? 'Aguardando Recebimento' : 'Armazém / Não Alocada'));

      const unitText = unit ? unit.name : 'Unidade Policial';

      return `
        <tr style="border-bottom: 1px solid #d1d5db; ${index % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
          <td style="padding: 6px 4px; text-align: center; font-family: monospace; font-size: 10px; font-weight: bold;">
            ${(index + 1).toString().padStart(2, '0')}
          </td>
          <td style="padding: 6px 4px; font-weight: 700; font-size: 11px; text-transform: uppercase;">
            ${w.type || 'ARMA DE FOGO'}
          </td>
          <td style="padding: 6px 4px; font-size: 11px;">
            ${w.manufacturer || '-'}
          </td>
          <td style="padding: 6px 4px; font-size: 11px; font-weight: 600;">
            ${w.model || '-'}
          </td>
          <td style="padding: 6px 4px; font-family: monospace; font-size: 10.5px; font-weight: bold; color: #1e293b;">
            ${w.caliber || '-'}
          </td>
          <td style="padding: 6px 4px; font-family: monospace; font-size: 11px; font-weight: 900; color: #000; letter-spacing: 0.5px;">
            ${w.serialNumber}
          </td>
          <td style="padding: 6px 4px; font-size: 10px;">
            <div style="font-weight: 700; color: #0f172a;">${unitText}</div>
            <div style="font-family: monospace; color: #475569; font-size: 9.5px;">${locationText}</div>
          </td>
          <td style="padding: 6px 4px; text-align: center; font-family: monospace; font-size: 10.5px; font-weight: bold;">
            ${w.magazineQuantity || 0}
          </td>
          <td style="padding: 6px 4px; font-size: 9.5px;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-family: monospace; text-transform: uppercase; ${
              w.status === 'No Cofre'
                ? 'background-color: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;'
                : (w.status === 'Em Trânsito'
                  ? 'background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d;'
                  : 'background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;')
            }">
              ${w.status}
            </span>
          </td>
          <td style="padding: 6px 4px; font-size: 9px; font-family: monospace; color: #475569;">
            ${w.lastMaintenanceDate ? `${w.lastMaintenanceDate}${w.lastMaintenanceResponsible ? ` (${w.lastMaintenanceResponsible})` : ''}` : 'Sem reg.'}
          </td>
        </tr>
      `;
    }).join('');

    const typeSummaryHtml = Object.entries(typeCountMap).map(([t, count]) => {
      return `<span style="display: inline-block; margin-right: 12px; margin-bottom: 4px; font-size: 10px;"><strong>${t}:</strong> ${count} un.</span>`;
    }).join('');

    const caliberSummaryHtml = Object.entries(caliberCountMap).map(([c, count]) => {
      return `<span style="display: inline-block; margin-right: 12px; margin-bottom: 4px; font-size: 10px;"><strong>${c}:</strong> ${count} un.</span>`;
    }).join('');

    const htmlDocument = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Inventário Oficial do Arsenal - ${unitDisplayName} - PCMG</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 10mm 15mm 10mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 10px;
            font-size: 11px;
            line-height: 1.35;
          }
          .header-box {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .gov-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #000;
          }
          .dept-title {
            font-size: 10.5px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
          }
          .doc-title {
            font-size: 12px;
            font-weight: 900;
            color: #0f172a;
            margin-top: 4px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .meta-pill {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 6px 10px;
            font-family: monospace;
            font-size: 10px;
            text-align: right;
          }
          .info-panel {
            background-color: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 12px;
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 10px;
          }
          .info-block {
            font-size: 10.5px;
          }
          .info-label {
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .info-value {
            font-weight: bold;
            color: #0f172a;
          }
          .stats-panel {
            background-color: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 10px;
            margin-bottom: 12px;
            font-family: monospace;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 6px 4px;
            letter-spacing: 0.4px;
            text-align: left;
            border: 1px solid #0f172a;
          }
          td {
            border: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          .statement {
            border: 1px solid #94a3b8;
            background-color: #f8fafc;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 9.5px;
            font-style: italic;
            color: #334155;
            margin-top: 14px;
            margin-bottom: 20px;
            line-height: 1.4;
          }
          .signatures-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 30px;
            page-break-inside: avoid;
          }
          .signature-box {
            text-align: center;
            padding: 10px;
          }
          .signature-line {
            border-top: 1.5px solid #0f172a;
            padding-top: 6px;
            font-size: 10.5px;
            font-weight: bold;
            color: #000;
          }
          .signature-sub {
            font-size: 9.5px;
            color: #475569;
            margin-top: 2px;
            font-family: monospace;
          }
          .footer-note {
            margin-top: 25px;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8.5px;
            color: #64748b;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header-box">
          <div>
            <div class="gov-title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
            <div class="dept-title">${deptDisplayName}</div>
            <div class="doc-title">RELAÇÃO E INVENTÁRIO OFICIAL DO ARSENAL DE ARMAMENTO</div>
          </div>
          <div class="meta-pill">
            AUTENTICAÇÃO: <strong>${authCode}</strong><br>
            EMISSÃO: <strong>${emissionDate}</strong>
          </div>
        </div>

        <!-- Info Panel -->
        <div class="info-panel">
          <div>
            <div class="info-block" style="margin-bottom: 6px;">
              <div class="info-label">Unidade Policial de Lotação / Arsenal</div>
              <div class="info-value" style="font-size: 12px; color: #000;">${unitDisplayName}</div>
            </div>
            <div class="info-block">
              <div class="info-label">Critérios do Filtro / Escopo da Relação</div>
              <div class="info-value" style="font-size: 10px; color: #1e293b;">
                ${filterDescription || 'Inventário Geral das Armas'}
              </div>
            </div>
          </div>

          <div>
            <div class="info-block" style="margin-bottom: 6px;">
              <div class="info-label">Armeiro / Operador Responsável pela Emissão</div>
              <div class="info-value">${currentUser.name} (MASP: ${formatMasp(currentUser.masp)})</div>
              <div style="font-size: 9px; color: #64748b;">${currentUser.cargo || 'Policial Civil'} • Perfil: ${currentUser.role}</div>
            </div>
            <div class="info-block">
              <div class="info-label">Total de Armas na Relação</div>
              <div class="info-value" style="font-size: 14px; color: #000; font-family: monospace;">
                ${sortedWeapons.length} arma(s) cadastrada(s)
              </div>
            </div>
          </div>
        </div>

        <!-- Summary Panel -->
        <div class="stats-panel">
          <div style="margin-bottom: 4px; font-weight: bold; font-size: 9.5px; text-transform: uppercase; color: #334155;">
            Distribuição Bélica:
          </div>
          <div style="margin-bottom: 4px;">
            ${typeSummaryHtml}
          </div>
          <div>
            ${caliberSummaryHtml}
            <span style="display: inline-block; margin-left: 8px; font-size: 10px;">
              <strong>Total de Carregadores da Carga:</strong> ${totalCarregadores} un.
            </span>
          </div>
        </div>

        <!-- Weapons Inventory Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 28px; text-align: center;">#</th>
              <th style="width: 85px;">Tipo</th>
              <th style="width: 80px;">Fabricante</th>
              <th style="width: 75px;">Modelo</th>
              <th style="width: 75px;">Calibre</th>
              <th style="width: 95px;">Nº de Série</th>
              <th>Localização / Cofre</th>
              <th style="width: 45px; text-align: center;">Carreg.</th>
              <th style="width: 85px;">Situação</th>
              <th style="width: 80px;">Últ. Manut.</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Legal Statement -->
        <div class="statement">
          <strong>DECLARAÇÃO DE CONFERÊNCIA FÍSICA E SISTÊMICA:</strong><br>
          Certifico que o armamento constante na presente relação pertence à carga desta Unidade Policial e que todos os dados técnicos, números de série, dotações de carregadores e localizações de cofre foram devidamente conferidos e conferem com o acervo físico em custódia.
        </div>

        <!-- Signatures (Armeiro Responsável Obrigatório) -->
        <div class="signatures-container">
          <div class="signature-box">
            <div class="signature-line">
              ${currentUser.name.toUpperCase()}
            </div>
            <div class="signature-sub">
              MASP: ${formatMasp(currentUser.masp)} • ${currentUser.cargo || 'Policial Civil'}<br>
              <strong>ARMEIRO RESPONSÁVEL / ENCARREGADO DE MATERIAL BÉLICO</strong>
            </div>
          </div>

          <div class="signature-box">
            <div class="signature-line">
              AUTORIDADE POLICIAL / DELEGADO TITULAR
            </div>
            <div class="signature-sub">
              CHEFIA DA UNIDADE POLICIAL / DELEGACIA<br>
              VISTO E CONFERÊNCIA DA CARGA BÉLICA
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer-note">
          <div>
            SISTEMA DE ARMARIA • POLÍCIA CIVIL DE MINAS GERAIS (PCMG)
          </div>
          <div>
            Página 1 de 1 • Registro de Auditoria: ${authCode}
          </div>
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(htmlDocument);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100 font-mono">
                  IMPRESSÃO DO ARSENAL DE ARMAMENTO
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  PCMG Oficial
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Emissão de inventário e relação de armas da unidade com localização, dados completos e assinatura do armeiro
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto modal-body-scroll flex-1">
          
          {/* Permission & Scope Info Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-slate-200 font-semibold">
                  Armeiro Emitente: <strong className="text-amber-400">{currentUser.name}</strong> (MASP: {formatMasp(currentUser.masp)})
                </span>
                <span className="text-slate-400 block text-[11px]">
                  Perfil: <strong>{currentUser.role}</strong> • Cargo: <strong>{currentUser.cargo || 'Policial Civil'}</strong>
                  {!isGeral && ' (Visualização restrita ao escopo funcional autorizado)'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] font-mono shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                Total do Acervo Autorizado: <strong className="text-amber-400">{weapons.length}</strong>
              </span>
            </div>
          </div>

          {/* Filter Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>Filtros de Seleção do Arsenal</span>
              </span>

              <button
                onClick={handleResetFilters}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center space-x-1 hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar Filtros</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              
              {/* 1. Departamento (for Geral only) */}
              {isGeral && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Departamento:
                  </label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => {
                      setSelectedDeptId(e.target.value);
                      setSelectedUnitId('ALL');
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Todos os Departamentos</option>
                    {accessibleDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. Unidade */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1 flex items-center space-x-1">
                  <Building className="w-3 h-3 text-amber-400" />
                  <span>Unidade Policial:</span>
                </label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  disabled={!isGeral && !isAdmin && !isArmeiro && currentUser.managementScope === 'unit'}
                  className={`w-full rounded-xl px-3 py-2 text-xs transition ${
                    selectedUnitId !== 'ALL'
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  } border focus:outline-none focus:border-amber-500 ${(!isGeral && !isAdmin && !isArmeiro && currentUser.managementScope === 'unit') ? 'cursor-not-allowed opacity-80' : ''}`}
                >
                  {(isGeral || isAdmin || isArmeiro) && (
                    <option value="ALL">Todas as Unidades do Departamento ({scopedWeapons.length})</option>
                  )}
                  {accessibleUnits.map(u => {
                    const count = weapons.filter(w => w.unitId === u.id).length;
                    return (
                      <option key={u.id} value={u.id}>
                        {u.name} ({count} armas)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 3. Situação / Disponibilidade */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Situação / Disponibilidade:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className={`w-full rounded-xl px-3 py-2 text-xs border transition ${
                    statusFilter === 'DISPONIVEL'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  } focus:outline-none focus:border-amber-500`}
                >
                  <option value="DISPONIVEL">Disponíveis no Cofre (Padrão)</option>
                  <option value="TODOS">Todas (Cofre + Trânsito + Manut.)</option>
                  <option value="TRANSITO">Em Trânsito / Cautela</option>
                  <option value="MANUTENCAO">Em Manutenção</option>
                </select>
              </div>

              {/* 4. Tipo de Arma */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Tipo de Arma:
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs border transition ${
                    filterType !== 'TODOS'
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  } focus:outline-none focus:border-amber-500`}
                >
                  <option value="TODOS">Todos os Tipos ({availableTypes.length})</option>
                  {availableTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* 5. Fabricante */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Fabricante:
                </label>
                <select
                  value={filterManufacturer}
                  onChange={(e) => setFilterManufacturer(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs border transition ${
                    filterManufacturer !== 'TODOS'
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  } focus:outline-none focus:border-amber-500`}
                >
                  <option value="TODOS">Todos os Fabricantes ({availableManufacturers.length})</option>
                  {availableManufacturers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* 6. Calibre */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Calibre:
                </label>
                <select
                  value={filterCaliber}
                  onChange={(e) => setFilterCaliber(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs border transition ${
                    filterCaliber !== 'TODOS'
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  } focus:outline-none focus:border-amber-500`}
                >
                  <option value="TODOS">Todos os Calibres ({availableCalibers.length})</option>
                  {availableCalibers.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 7. Busca Livre */}
              <div className={isGeral ? '' : 'sm:col-span-2'}>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Buscar Nº de Série / Modelo:
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Digite nº de série ou modelo..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Quick Selection Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="flex items-center space-x-1.5 text-amber-400 hover:text-amber-300 font-semibold transition"
              >
                <CheckSquare className="w-4 h-4" />
                <span>Selecionar Todas ({filteredWeapons.length})</span>
              </button>

              <span className="text-slate-600">|</span>

              <button
                type="button"
                onClick={handleClearSelection}
                className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-300 transition"
              >
                <Square className="w-4 h-4" />
                <span>Desmarcar Todas</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-[11px]">
              <span className="text-slate-400">
                Selecionadas para Impressão:
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                {selectedWeaponIds.size} de {filteredWeapons.length}
              </span>
            </div>
          </div>

          {/* Weapons Checklist Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-300 sticky top-0 z-10 text-[10px] uppercase font-mono tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={filteredWeapons.length > 0 && selectedWeaponIds.size === filteredWeapons.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleSelectAllFiltered();
                          } else {
                            handleClearSelection();
                          }
                        }}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                        title="Marcar/Desmarcar todas"
                      />
                    </th>
                    <th className="py-2.5 px-3">Tipo / Arma</th>
                    <th className="py-2.5 px-3">Fabricante & Modelo</th>
                    <th className="py-2.5 px-3">Calibre</th>
                    <th className="py-2.5 px-3">Nº Série</th>
                    <th className="py-2.5 px-3">Localização (Unidade & Cofre)</th>
                    <th className="py-2.5 px-3 text-center">Carreg.</th>
                    <th className="py-2.5 px-3">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredWeapons.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs italic">
                        Nenhuma arma encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredWeapons.map((w) => {
                      const isChecked = selectedWeaponIds.has(w.id);
                      const unit = units.find(u => u.id === w.unitId);
                      const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);

                      return (
                        <tr
                          key={w.id}
                          onClick={() => toggleWeaponSelection(w.id)}
                          className={`cursor-pointer transition hover:bg-slate-900/60 ${
                            isChecked ? 'bg-amber-500/10' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleWeaponSelection(w.id)}
                              className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-200 block text-xs">
                              {w.type}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-slate-200 font-semibold">{w.manufacturer}</span>{' '}
                            <span className="text-slate-400 font-mono text-[11px]">{w.model}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300 font-semibold">
                            {w.caliber}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-amber-400">
                            {w.serialNumber}
                          </td>
                          <td className="py-2 px-3 text-[11px]">
                            <div className="text-slate-200 font-medium">{unit?.name || 'Unidade'}</div>
                            <div className="text-slate-400 font-mono text-[10px] flex items-center space-x-1">
                              <MapPin className="w-3 h-3 text-amber-500/70 shrink-0" />
                              <span>{vault ? `Cofre: ${vault.code}` : (w.status === 'No Cofre' ? 'Cofre Padrão' : w.status)}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-300">
                            {w.magazineQuantity || 0}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              w.status === 'No Cofre'
                                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                                : (w.status === 'Em Trânsito'
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                  : 'bg-red-950/80 text-red-400 border-red-800')
                            }`}>
                              {w.status}
                            </span>
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

        {/* Footer Actions */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>
              O relatório impresso incluirá <strong>todos os dados técnicos</strong>, <strong>localizações completas</strong> e <strong>campo de assinatura do armeiro responsável</strong>.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition"
            >
              Cancelar
            </button>

            {/* Print All in Unit */}
            <button
              type="button"
              onClick={() => handlePrint('ALL_UNIT')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow"
              title="Imprime todas as armas da unidade selecionada disponíveis no cofre"
            >
              <Building className="w-4 h-4 text-amber-400" />
              <span>Imprimir Todas da Unidade</span>
            </button>

            {/* Print Filtered or Selected */}
            {selectedWeaponIds.size > 0 ? (
              <button
                type="button"
                onClick={() => handlePrint('SELECTED')}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-lg"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Selecionadas ({selectedWeaponIds.size})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePrint('ALL_FILTERED')}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-lg"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Relação Filtrada ({filteredWeapons.length})</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
