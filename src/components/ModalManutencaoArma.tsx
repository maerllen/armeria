import React, { useState, useEffect } from 'react';
import { User, Weapon, ExternalWorkshop, VaultSpace } from '../types';
import { storage } from '../services/storage';
import { Wrench, X, Check, Calendar, UserCheck, Building, MapPin, Search, AlertCircle, Info } from 'lucide-react';

interface ModalManutencaoArmaProps {
  weapon: Weapon;
  currentUser: User;
  vaultSpaces: VaultSpace[];
  onClose: () => void;
  onSuccess: (maintId: string) => void;
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export const ModalManutencaoArma: React.FC<ModalManutencaoArmaProps> = ({
  weapon,
  currentUser,
  vaultSpaces,
  onClose,
  onSuccess
}) => {
  const [maintType, setMaintType] = useState<'Interna' | 'Externa'>('Interna');
  const [sentDate, setSentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [armorerName, setArmorerName] = useState<string>(currentUser.name || '');
  const [description, setDescription] = useState<string>('');

  // External workshop fields
  const [registeredWorkshops, setRegisteredWorkshops] = useState<ExternalWorkshop[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>('NEW');
  const [workshopName, setWorkshopName] = useState<string>('');
  const [workshopCep, setWorkshopCep] = useState<string>('');
  const [workshopStreet, setWorkshopStreet] = useState<string>('');
  const [workshopNumber, setWorkshopNumber] = useState<string>('');
  const [workshopComplement, setWorkshopComplement] = useState<string>('');
  const [workshopNeighborhood, setWorkshopNeighborhood] = useState<string>('');
  const [workshopCity, setWorkshopCity] = useState<string>('');
  const [workshopState, setWorkshopState] = useState<string>('MG');
  const [saveWorkshop, setSaveWorkshop] = useState<boolean>(true);

  const [loadingCep, setLoadingCep] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Resgatar a quantidade de tiros da arma registrada
  const shotCountAtMaintenance = Number(weapon.shotCount) || 0;
  const vaultCode = vaultSpaces.find(v => v.id === weapon.vaultSpaceId)?.code || weapon.vaultSpaceId || 'No Cofre';

  // Load registered workshops
  useEffect(() => {
    storage.getExternalWorkshops().then(shops => {
      setRegisteredWorkshops(shops || []);
    }).catch(err => {
      console.warn('Erro ao carregar armerias cadastradas:', err);
    });
  }, []);

  // Handle workshop selection
  const handleSelectWorkshop = (id: string) => {
    setSelectedWorkshopId(id);
    if (id === 'NEW') {
      setWorkshopName('');
      setWorkshopCep('');
      setWorkshopStreet('');
      setWorkshopNumber('');
      setWorkshopComplement('');
      setWorkshopNeighborhood('');
      setWorkshopCity('');
      setWorkshopState('MG');
    } else {
      const found = registeredWorkshops.find(w => w.id === id);
      if (found) {
        setWorkshopName(found.name || '');
        setWorkshopCep(found.cep || '');
        setWorkshopStreet(found.street || '');
        setWorkshopNumber(found.number || '');
        setWorkshopComplement(found.complement || '');
        setWorkshopNeighborhood(found.neighborhood || '');
        setWorkshopCity(found.city || '');
        setWorkshopState(found.state || 'MG');
      }
    }
  };

  // ViaCEP Lookup
  const handleLookupCep = async () => {
    const cleanCep = (workshopCep || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setErrorMsg('Informe um CEP válido com 8 dígitos para consulta.');
      return;
    }

    try {
      setLoadingCep(true);
      setErrorMsg('');
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setErrorMsg('CEP não localizado nos Correios.');
      } else {
        setWorkshopStreet(data.logradouro || '');
        setWorkshopNeighborhood(data.bairro || '');
        setWorkshopCity(data.localidade || '');
        setWorkshopState(data.uf || 'MG');
      }
    } catch (err: any) {
      setErrorMsg('Erro ao consultar CEP. Preencha o endereço manualmente.');
    } finally {
      setLoadingCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!armorerName.trim()) {
      setErrorMsg('Informe o armeiro responsável.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Informe a descrição detalhada da manutenção.');
      return;
    }

    if (maintType === 'Externa') {
      if (!workshopName.trim()) {
        setErrorMsg('Informe o nome da armeria externa.');
        return;
      }
      if (!workshopCity.trim() || !workshopState.trim()) {
        setErrorMsg('Informe a cidade e estado da armeria externa.');
        return;
      }
    }

    try {
      setLoading(true);
      const res = await storage.sendWeaponToMaintenance(weapon.id, {
        type: maintType,
        sentDate,
        sentArmorerName: armorerName.trim(),
        sentDescription: description.trim(),
        workshopName: maintType === 'Externa' ? workshopName.trim() : undefined,
        workshopCep: maintType === 'Externa' ? workshopCep.trim() : undefined,
        workshopStreet: maintType === 'Externa' ? workshopStreet.trim() : undefined,
        workshopNumber: maintType === 'Externa' ? workshopNumber.trim() : undefined,
        workshopComplement: maintType === 'Externa' ? workshopComplement.trim() : undefined,
        workshopNeighborhood: maintType === 'Externa' ? workshopNeighborhood.trim() : undefined,
        workshopCity: maintType === 'Externa' ? workshopCity.trim() : undefined,
        workshopState: maintType === 'Externa' ? workshopState.trim() : undefined,
        saveWorkshop: maintType === 'Externa' ? saveWorkshop : false
      });

      onSuccess(res.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar manutenção.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Registrar Manutenção de Armamento
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {weapon.manufacturer} {weapon.model} • Nº de Série: <span className="text-amber-400 font-bold">{weapon.serialNumber}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resgate da Quantidade de Tiros da Arma & Cofre Original */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Disparos Registrados na Arma:
            </span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-lg font-bold font-mono text-amber-400">
                {shotCountAtMaintenance.toLocaleString('pt-BR')}
              </span>
              <span className="text-slate-400 text-[11px]">tiros efetuados</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Histórico resgatado do sistema no momento do envio.
            </p>
          </div>

          <div className="border-l border-slate-800 pl-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Local no Cofre Atual:
            </span>
            <div className="text-slate-200 font-mono font-bold text-sm mt-0.5">
              {vaultCode}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Ao concluir a manutenção, o armamento retornará automaticamente para este local.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Selectbox Tipo de Manutenção: Interna vs Externa */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Tipo de Manutenção *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMaintType('Interna')}
                className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 ${
                  maintType === 'Interna'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-bold shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  maintType === 'Interna' ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                }`} />
                <div>
                  <div className="text-xs font-bold text-slate-100">Manutenção Interna</div>
                  <div className="text-[10px] text-slate-400">Oficina / Armeiro da própria Unidade</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMaintType('Externa')}
                className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 ${
                  maintType === 'Externa'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-bold shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  maintType === 'Externa' ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                }`} />
                <div>
                  <div className="text-xs font-bold text-slate-100">Manutenção Externa</div>
                  <div className="text-[10px] text-slate-400">Armeria Externa / Oficina Especializada</div>
                </div>
              </button>
            </div>
          </div>

          {/* Common Fields: Data & Armeiro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Data {maintType === 'Interna' ? 'da Manutenção' : 'de Envio'} *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={sentDate}
                  onChange={(e) => setSentDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Armeiro Responsável {maintType === 'Externa' ? 'pelo Despacho' : ''} *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={armorerName}
                  onChange={(e) => setArmorerName(e.target.value)}
                  placeholder="Nome do armeiro..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
                <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>

          {/* Conditional EXTERNA Fields: Workshop Selection & Address */}
          {maintType === 'Externa' && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Building className="w-4 h-4" />
                  <span>Dados da Armeria Externa</span>
                </h4>
                {registeredWorkshops.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {registeredWorkshops.length} armerias cadastradas
                  </span>
                )}
              </div>

              {/* Autocomplete / Select from previously registered workshops */}
              {registeredWorkshops.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Selecionar Armeria Cadastrada
                  </label>
                  <select
                    value={selectedWorkshopId}
                    onChange={(e) => handleSelectWorkshop(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none font-medium"
                  >
                    <option value="NEW">+ Cadastrar Nova Armeria</option>
                    {registeredWorkshops.map(shop => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name} {shop.city ? `(${shop.city} - ${shop.state})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nome da Armeria */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nome da Armeria / Oficina *
                </label>
                <input
                  type="text"
                  value={workshopName}
                  onChange={(e) => setWorkshopName(e.target.value)}
                  placeholder="Ex: Armeria Central de Manutenção Bélica"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* CEP com Busca Automática */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    CEP
                  </label>
                  <div className="flex space-x-1.5">
                    <input
                      type="text"
                      value={workshopCep}
                      onChange={(e) => setWorkshopCep(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleLookupCep}
                      disabled={loadingCep}
                      title="Buscar endereço pelo CEP"
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-700 text-xs transition"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Logradouro Completo *
                  </label>
                  <input
                    type="text"
                    value={workshopStreet}
                    onChange={(e) => setWorkshopStreet(e.target.value)}
                    placeholder="Rua, Avenida, Praça..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Número e Complemento */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Número
                  </label>
                  <input
                    type="text"
                    value={workshopNumber}
                    onChange={(e) => setWorkshopNumber(e.target.value)}
                    placeholder="123 ou S/N"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={workshopComplement}
                    onChange={(e) => setWorkshopComplement(e.target.value)}
                    placeholder="Galpão, Sala, Bloco..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bairro, Cidade, Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={workshopNeighborhood}
                    onChange={(e) => setWorkshopNeighborhood(e.target.value)}
                    placeholder="Bairro..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cidade *
                  </label>
                  <input
                    type="text"
                    value={workshopCity}
                    onChange={(e) => setWorkshopCity(e.target.value)}
                    placeholder="Cidade..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Estado (UF) *
                  </label>
                  <select
                    value={workshopState}
                    onChange={(e) => setWorkshopState(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none font-mono"
                    required
                  >
                    {BRAZILIAN_STATES.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-1 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="saveWorkshopCheck"
                  checked={saveWorkshop}
                  onChange={(e) => setSaveWorkshop(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                />
                <label htmlFor="saveWorkshopCheck" className="text-xs text-slate-300 cursor-pointer">
                  Salvar/atualizar dados desta armeria no sistema para futuras manutenções
                </label>
              </div>
            </div>
          )}

          {/* Descrição da Manutenção (Texto Longo) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Descrição da Manutenção *
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                maintType === 'Interna'
                  ? 'Ex: Trocado o percursor da arma que apresentou falha mecânica, substituída mola recuperadora e realizada lubrificação completa.'
                  : 'Ex: Arma apresentando pane de ejeção e folga no ferrolho. Enviada para reparo especializado, substituição de extrator e testes de estande.'
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:border-amber-500 focus:outline-none leading-relaxed"
              required
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Descreva detalhadamente o serviço efetuado, peças trocadas ou laudo de envio.
            </span>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-amber-400 flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>O status da arma mudará de <strong>No Cofre</strong> para <strong>Manutenção</strong>.</span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? 'Salvando...' : 'Salvar e Enviar para Manutenção'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
