import React, { useState } from 'react';
import { User, Weapon, Caliber, VaultSpace, Department, Unit, Movement } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Crosshair, Plus, Edit2, Trash2, History, AlertCircle, Check, Wrench, Shield, Search, Info } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface WeaponModuleProps {
  currentUser: User;
  weapons: Weapon[];
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const WeaponModule: React.FC<WeaponModuleProps> = ({
  currentUser,
  weapons,
  calibers,
  vaultSpaces,
  departments,
  units,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showWeaponModal, setShowWeaponModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTransitDetailModal, setShowTransitDetailModal] = useState(false);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponHistory, setWeaponHistory] = useState<Movement[]>([]);
  const [transitMovement, setTransitMovement] = useState<Movement | null>(null);
  const [deleteTargetWeapon, setDeleteTargetWeapon] = useState<Weapon | null>(null);

  // Weapon form states
  const [editingWeapon, setEditingWeapon] = useState<Weapon | null>(null);
  const [type, setType] = useState('Fuzil');
  const [serialNumber, setSerialNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('Taurus');
  const [model, setModel] = useState('');
  const [caliber, setCaliber] = useState('');
  const [magazineQuantity, setMagazineQuantity] = useState(4);
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [vaultSpaceId, setVaultSpaceId] = useState('');

  // Maintenance form states
  const [maintDate, setMaintDate] = useState('');
  const [maintResponsible, setMaintResponsible] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isPolicial = currentUser.role === 'Policial';

  const canAddEditWeapon = isGeral || isArmeiro || isAdmin || (isPolicial && currentUser.canMoveWeapons);
  const canDeleteWeapon = isGeral || isArmeiro || isAdmin;
  const canManageMaintenance = isGeral || isArmeiro;

  // Vault spaces for weapons: MUST BE TYPE ARMAS
  const weaponVaultSpaces = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === (unitId || currentUser.unitId));

  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const availableUnitsForForm = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  const handleOpenWeaponModal = (weap?: Weapon) => {
    setErrorMsg('');
    if (weap) {
      setEditingWeapon(weap);
      setType(weap.type);
      setSerialNumber(weap.serialNumber);
      setManufacturer(weap.manufacturer);
      setModel(weap.model);
      setCaliber(weap.caliber);
      setMagazineQuantity(weap.magazineQuantity);
      setDeptId(weap.departmentId);
      setUnitId(weap.unitId);
      setVaultSpaceId(weap.vaultSpaceId);
    } else {
      setEditingWeapon(null);
      setType('Fuzil');
      setSerialNumber('');
      setManufacturer('Taurus');
      setModel('T4');
      setCaliber(calibers[0]?.name || '5,56x45mm');
      setMagazineQuantity(4);
      const initialDept = isGeral ? (departments[0]?.id || '') : currentUser.departmentId;
      setDeptId(initialDept);
      const initialUnits = units.filter(u => u.departmentId === initialDept);
      const initialUnitId = initialUnits[0]?.id || currentUser.unitId;
      setUnitId(initialUnitId);
      const initialVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === initialUnitId);
      setVaultSpaceId(initialVaults[0]?.id || '');
    }
    setShowWeaponModal(true);
  };

  const handleSaveWeapon = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!serialNumber.trim()) {
      setErrorMsg('Informe o número de série da arma.');
      return;
    }
    if (!vaultSpaceId) {
      setErrorMsg('Selecione um local do cofre para guardar a arma.');
      return;
    }

    try {
      if (editingWeapon) {
        await storage.updateWeapon(editingWeapon.id, {
          type,
          serialNumber: serialNumber.trim().toUpperCase(),
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          caliber,
          magazineQuantity,
          departmentId: deptId,
          unitId,
          vaultSpaceId
        });
        setSuccessMsg('Arma atualizada com sucesso.');
      } else {
        await storage.addWeapon({
          type,
          serialNumber: serialNumber.trim().toUpperCase(),
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          caliber,
          magazineQuantity,
          departmentId: deptId,
          unitId,
          vaultSpaceId
        });
        setSuccessMsg('Nova arma cadastrada no acervo com sucesso.');
      }
      setShowWeaponModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar arma.');
    }
  };

  const handleDeleteWeapon = (weap: Weapon) => {
    setErrorMsg('');
    setSuccessMsg('');
    setDeleteTargetWeapon(weap);
  };

  const confirmExecuteDeleteWeapon = async () => {
    if (!deleteTargetWeapon) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await storage.deleteWeapon(deleteTargetWeapon.id);
      setSuccessMsg(`Arma ${deleteTargetWeapon.manufacturer} ${deleteTargetWeapon.model} (Série: ${deleteTargetWeapon.serialNumber}) excluída definitivamente.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir arma.');
    } finally {
      setDeleteTargetWeapon(null);
    }
  };

  // Open Maintenance Modal
  const handleOpenMaintenance = (weap: Weapon) => {
    setSelectedWeapon(weap);
    setMaintDate(weap.lastMaintenanceDate || new Date().toISOString().split('T')[0]);
    setMaintResponsible(weap.lastMaintenanceResponsible || currentUser.name);
    setShowMaintenanceModal(true);
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeapon) return;

    try {
      await storage.updateWeapon(selectedWeapon.id, {
        lastMaintenanceDate: maintDate,
        lastMaintenanceResponsible: maintResponsible.trim()
      });
      setSuccessMsg(`Manutenção registrada com sucesso para a arma ${selectedWeapon.serialNumber}.`);
      setShowMaintenanceModal(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar manutenção.');
    }
  };

  // Open Movement History
  const handleOpenHistory = (weap: Weapon) => {
    setSelectedWeapon(weap);
    const hist = storage.getWeaponMovementHistory(weap.id);
    setWeaponHistory(hist);
    setShowHistoryModal(true);
  };

  // View Transit Details
  const handleOpenTransitDetail = (weap: Weapon) => {
    if (weap.status !== 'Em Trânsito' || !weap.currentMovementId) return;

    const allMovs = storage.getMovements({ role: 'Geral' } as User);
    const mov = allMovs.find(m => m.id === weap.currentMovementId);
    if (mov) {
      setTransitMovement(mov);
      setSelectedWeapon(weap);
      setShowTransitDetailModal(true);
    }
  };

  // Search filter
  const filteredWeapons = weapons.filter(w => {
    const term = searchTerm.toLowerCase();
    return (
      w.serialNumber.toLowerCase().includes(term) ||
      w.model.toLowerCase().includes(term) ||
      w.type.toLowerCase().includes(term) ||
      w.manufacturer.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Crosshair className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Catálogo e Acervo de Armas</h1>
            <p className="text-xs text-slate-400">
              Controle físico de armamentos, status de cofre/trânsito e registro de manutenções
            </p>
          </div>
        </div>

        {canAddEditWeapon && (
          <button
            onClick={() => handleOpenWeaponModal()}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Nova Arma</span>
          </button>
        )}
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

      {/* Search Filter */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nº de série, modelo, fabricante ou tipo..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium hidden sm:inline">
          Exibindo <strong className="text-amber-400">{filteredWeapons.length}</strong> arma(s)
        </span>
      </div>

      {/* Weapons Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredWeapons.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs italic">
            Nenhuma arma encontrada no acervo para os critérios selecionados.
          </div>
        ) : (
          filteredWeapons.map((w) => {
            const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);
            const unit = units.find(u => u.id === w.unitId);

            return (
              <div
                key={w.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-slate-700 transition"
              >
                <div>
                  
                  {/* Status Badge & Actions */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => handleOpenTransitDetail(w)}
                      className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border transition ${
                        w.status === 'No Cofre'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : w.status === 'Em Trânsito'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 cursor-pointer animate-pulse'
                          : 'bg-purple-950 text-purple-300 border-purple-800'
                      }`}
                      title={w.status === 'Em Trânsito' ? 'Clique para ver quem está com a arma' : undefined}
                    >
                      {w.status}
                      {w.status === 'Em Trânsito' && <Info className="w-3 h-3 ml-1 inline" />}
                    </button>

                    <div className="flex items-center space-x-1">
                      {/* Movement History Button */}
                      <button
                        onClick={() => handleOpenHistory(w)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                        title="Histórico das últimas 5 movimentações"
                      >
                        <History className="w-4 h-4" />
                      </button>

                      {/* Maintenance Button (Armeiro / Geral) */}
                      {canManageMaintenance && (
                        <button
                          onClick={() => handleOpenMaintenance(w)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                          title="Registrar / Ver Manutenção"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit Button */}
                      {canAddEditWeapon && (
                        <button
                          onClick={() => handleOpenWeaponModal(w)}
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                          title="Editar Arma"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete Button */}
                      {canDeleteWeapon && (
                        <button
                          onClick={() => handleDeleteWeapon(w)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                          title="Excluir Arma"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Weapon Details */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-base font-bold text-slate-100">{w.manufacturer} {w.model}</h3>
                      <span className="text-xs bg-slate-950 border border-slate-800 font-mono text-slate-300 px-2 py-0.5 rounded">
                        {w.type}
                      </span>
                    </div>

                    <p className="text-xs font-mono font-bold text-amber-400">
                      Série: {w.serialNumber}
                    </p>

                    <div className="text-xs text-slate-400 pt-2 space-y-0.5 border-t border-slate-800/80">
                      <p>Calibre: <strong className="text-slate-200 font-mono">{w.caliber}</strong></p>
                      <p>Carregadores: <strong className="text-slate-200 font-mono">{w.magazineQuantity} un</strong></p>
                      <p>Unidade: <strong className="text-slate-300">{unit ? unit.name : 'N/A'}</strong></p>
                      <p>Guarda no Cofre: <strong className="text-amber-400 font-mono">{vault ? vault.code : 'Em Trânsito'}</strong></p>
                    </div>
                  </div>

                </div>

                {/* Maintenance Footer */}
                <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Última Manutenção:</span>
                  <span className="font-mono text-slate-300">
                    {w.lastMaintenanceDate ? w.lastMaintenanceDate : 'Sem registro'}
                  </span>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modal Add / Edit Weapon */}
      {showWeaponModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800">
              {editingWeapon ? 'Editar Arma' : 'Cadastrar Nova Arma'}
            </h3>

            <form onSubmit={handleSaveWeapon} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Tipo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo de Arma
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="Fuzil">Fuzil</option>
                    <option value="Pistola">Pistola</option>
                    <option value="Submetralhadora">Submetralhadora</option>
                    <option value="Espingarda">Espingarda</option>
                    <option value="Carabina">Carabina</option>
                    <option value="Revólver">Revólver</option>
                  </select>
                </div>

                {/* Número de Série */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Número de Série
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Ex: EKG-5486"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                {/* Fabricante */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="Ex: Taurus, Imbel, Glock"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                    required
                  />
                </div>

                {/* Modelo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ex: T4, PT92, IA2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                {/* Calibre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre
                  </label>
                  <select
                    value={caliber}
                    onChange={(e) => setCaliber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Qtd Carregadores */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Qtd. Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={magazineQuantity}
                    onChange={(e) => setMagazineQuantity(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
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
                      const newUnitId = depUnits[0]?.id || '';
                      setUnitId(newUnitId);
                      const newVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === newUnitId);
                      setVaultSpaceId(newVaults[0]?.id || '');
                    }}
                    disabled={!isGeral}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                      !isGeral
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    {availableDepts.map((d) => (
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
                    onChange={(e) => {
                      setUnitId(e.target.value);
                      const newVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === e.target.value);
                      setVaultSpaceId(newVaults[0]?.id || '');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {availableUnitsForForm.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Local do Cofre */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre (Apenas cofres do tipo ARMAS)
                </label>
                <select
                  value={vaultSpaceId}
                  onChange={(e) => setVaultSpaceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {weaponVaultSpaces.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} (Espaço de Armas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowWeaponModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Salvar Arma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Maintenance */}
      {showMaintenanceModal && selectedWeapon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center space-x-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              <span>Registro de Manutenção</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Arma: <strong className="text-amber-400 font-mono">{selectedWeapon.model} ({selectedWeapon.serialNumber})</strong>
            </p>

            <form onSubmit={handleSaveMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Data da Última Manutenção
                </label>
                <input
                  type="date"
                  value={maintDate}
                  onChange={(e) => setMaintDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Responsável pela Manutenção
                </label>
                <input
                  type="text"
                  value={maintResponsible}
                  onChange={(e) => setMaintResponsible(e.target.value)}
                  placeholder="Nome do Armeiro ou Técnico..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Salvar Manutenção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal History (Last 5 movements) */}
      {showHistoryModal && selectedWeapon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <History className="w-5 h-5 text-amber-400" />
                <span>Histórico (Últimas 5 Retiradas e Devoluções)</span>
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Arma: <strong className="text-amber-400 font-mono">{selectedWeapon.type} {selectedWeapon.model} - Série {selectedWeapon.serialNumber}</strong>
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {weaponHistory.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  Nenhuma movimentação registrada no histórico desta arma.
                </p>
              ) : (
                weaponHistory.map((m) => (
                  <div key={m.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100">{m.requesterName} (MASP {m.requesterMasp})</span>
                      <span className="text-[10px] font-mono text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {m.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-0.5">
                      <p>Retirada: <span className="text-slate-200">{m.ammunitionCount} munições • {m.magazineCount} carregadores</span></p>
                      <p>Autorizado por: <span className="text-slate-300 font-semibold">{m.approvedByUserName || 'N/A'}</span></p>
                      {m.receiptDate && (
                        <p>Devolução confirmada em: <span className="text-emerald-400 font-mono">{formatTimestamp(m.receiptDate)}</span> por {m.receiptConfirmedByUserName}</p>
                      )}
                      {m.divergenceJustification && (
                        <p className="text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-900/50 mt-1">
                          Justificativa Divergência: "{m.divergenceJustification}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transit Detail Modal / Tooltip */}
      {showTransitDetailModal && transitMovement && selectedWeapon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400 mb-4 pb-2 border-b border-slate-800">
              <Info className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-100">Arma em Trânsito</h3>
                <p className="text-xs text-slate-400">Detalhamento do policial em posse do armamento</p>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400">Arma:</span>
                <p className="font-bold text-amber-400 text-sm">{selectedWeapon.type} {selectedWeapon.model} ({selectedWeapon.serialNumber})</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Policial com a arma:</span>
                <p className="font-bold text-slate-100 text-sm">{transitMovement.requesterName}</p>
                <p className="text-slate-400 font-mono">MASP: {transitMovement.requesterMasp}</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Data e hora da retirada:</span>
                <p className="font-mono text-slate-200 font-bold">{formatTimestamp(transitMovement.approvalDate || transitMovement.createdAt)}</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Autorizado por:</span>
                <p className="font-bold text-emerald-400">{transitMovement.approvedByUserName || 'N/A'}</p>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between text-slate-300 font-mono">
                <span>Munições levadas: <strong>{transitMovement.ammunitionCount}</strong></span>
                <span>Carregadores: <strong>{transitMovement.magazineCount}</strong></span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setShowTransitDetailModal(false)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetWeapon}
        title="Excluir Arma Definitivamente"
        message={`Deseja realmente apagar permanentemente a arma ${deleteTargetWeapon?.manufacturer} ${deleteTargetWeapon?.model} (Série: ${deleteTargetWeapon?.serialNumber}) do sistema?`}
        onConfirm={confirmExecuteDeleteWeapon}
        onCancel={() => setDeleteTargetWeapon(null)}
      />

    </div>
  );
};
