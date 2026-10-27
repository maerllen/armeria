import React, { useState, useEffect } from 'react';
import { User, ExternalWorkshop } from '../types';
import { storage } from '../services/storage';
import {
  Building,
  X,
  Check,
  MapPin,
  Phone,
  UserCheck,
  Search,
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  Shield,
  Layers
} from 'lucide-react';
import { formatTimestamp } from '../utils/masks';

interface ModalCadastrarArmeriaProps {
  currentUser: User;
  onClose: () => void;
  onSuccess?: () => void;
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export const ModalCadastrarArmeria: React.FC<ModalCadastrarArmeriaProps> = ({
  currentUser,
  onClose,
  onSuccess
}) => {
  const isGeral = currentUser?.role === 'Geral';

  const [activeTab, setActiveTab] = useState<'form' | 'list'>('form');
  const [workshops, setWorkshops] = useState<ExternalWorkshop[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingCep, setLoadingCep] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [cep, setCep] = useState<string>('');
  const [street, setStreet] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [complement, setComplement] = useState<string>('');
  const [neighborhood, setNeighborhood] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('MG');
  const [phone, setPhone] = useState<string>('');
  const [contact, setContact] = useState<string>('');
  const [responsibleArmorer, setResponsibleArmorer] = useState<string>('');
  const [credenciamentoPf, setCredenciamentoPf] = useState<string>('');

  useEffect(() => {
    loadWorkshops();
  }, []);

  const loadWorkshops = async () => {
    try {
      setLoadingList(true);
      const data = await storage.getExternalWorkshops();
      setWorkshops(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar armerias:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleClearForm = () => {
    setEditingId(null);
    setName('');
    setCep('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('MG');
    setPhone('');
    setContact('');
    setResponsibleArmorer('');
    setCredenciamentoPf('');
    setErrorMsg('');
  };

  // ViaCEP Lookup
  const handleLookupCep = async () => {
    const cleanCep = (cep || '').replace(/\D/g, '');
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
        setStreet(data.logradouro || '');
        setNeighborhood(data.bairro || '');
        setCity(data.localidade || '');
        setState(data.uf || 'MG');
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
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Informe o nome da armeria ou oficina credenciada.');
      return;
    }
    if (!responsibleArmorer.trim()) {
      setErrorMsg('Informe o nome do armeiro responsável pela armeria.');
      return;
    }
    if (!credenciamentoPf.trim()) {
      setErrorMsg('Informe o número ou registro de credenciamento na Polícia Federal (PF).');
      return;
    }

    try {
      setSaving(true);
      await storage.saveExternalWorkshop({
        id: editingId || undefined,
        name: name.trim(),
        cep: cep.trim() || undefined,
        street: street.trim() || undefined,
        number: number.trim() || undefined,
        complement: complement.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        phone: phone.trim() || undefined,
        contact: contact.trim() || undefined,
        responsibleArmorer: responsibleArmorer.trim() || undefined,
        credenciamentoPf: credenciamentoPf.trim() || undefined
      });

      setSuccessMsg(editingId ? 'Armeria credenciada atualizada com sucesso!' : 'Nova armeria credenciada cadastrada com sucesso!');
      handleClearForm();
      await loadWorkshops();
      setActiveTab('list');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar armeria.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (shop: ExternalWorkshop) => {
    setEditingId(shop.id);
    setName(shop.name || '');
    setCep(shop.cep || '');
    setStreet(shop.street || '');
    setNumber(shop.number || '');
    setComplement(shop.complement || '');
    setNeighborhood(shop.neighborhood || '');
    setCity(shop.city || '');
    setState(shop.state || 'MG');
    setPhone(shop.phone || '');
    setContact(shop.contact || '');
    setResponsibleArmorer(shop.responsibleArmorer || '');
    setCredenciamentoPf(shop.credenciamentoPf || '');
    setErrorMsg('');
    setActiveTab('form');
  };

  const handleDelete = async (shop: ExternalWorkshop) => {
    if (!window.confirm(`Tem certeza que deseja excluir a armeria "${shop.name}"?`)) {
      return;
    }

    try {
      await storage.deleteExternalWorkshop(shop.id);
      setSuccessMsg(`Armeria "${shop.name}" excluída com sucesso.`);
      await loadWorkshops();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir armeria.');
    }
  };

  // Filter list
  const filteredWorkshops = workshops.filter(w => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (w.name || '').toLowerCase().includes(term) ||
      (w.city || '').toLowerCase().includes(term) ||
      (w.contact || '').toLowerCase().includes(term) ||
      (w.phone || '').toLowerCase().includes(term)
    );
  });

  if (!isGeral) {
    return (
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-100">Acesso Restrito</h3>
          <p className="text-xs text-slate-400">
            Apenas usuários com perfil <strong>Geral</strong> possuem permissão para cadastrar armerias externas.
          </p>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-100">
                  Gerenciamento de Armerias Externas
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                  EXCLUSIVO GERAL
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cadastre e gerencie armerias e oficinas autorizadas para manutenções externas.
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

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-800 space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'form'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {editingId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{editingId ? 'Editar Armeria' : 'Cadastrar Nova Armeria'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'list'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Armerias Cadastradas ({workshops.length})</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-200 text-xs flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {activeTab === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {editingId && (
              <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-300">
                <span>Editando armeria existente.</span>
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="text-[11px] underline font-bold hover:text-purple-200"
                >
                  Cancelar Edição e Limpar
                </button>
              </div>
            )}

            {/* Nome da Armeria */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Nome da Armeria / Oficina Especializada *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Armeria Central de Manutenção Bélica Ltda"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none font-medium"
                required
              />
            </div>

            {/* CEP e Logradouro */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  CEP
                </label>
                <div className="flex space-x-1.5">
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleLookupCep}
                    disabled={loadingCep}
                    title="Buscar endereço pelo CEP nos Correios"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-purple-400 rounded-xl border border-slate-700 text-xs transition shrink-0"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Logradouro Completo
                </label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Rua, Avenida, Praça..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Número e Complemento */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Número
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="123 ou S/N"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Complemento
                </label>
                <input
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Galpão, Sala, Bloco..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Bairro, Cidade, Estado */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Bairro
                </label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Bairro..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Cidade
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Cidade..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Estado (UF)
                </label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none font-mono"
                >
                  {BRAZILIAN_STATES.map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Responsável Técnico e Credenciamento PF */}
            <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-xl space-y-2.5">
              <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Dados de Credenciamento na Polícia Federal</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Nome do Armeiro Responsável *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={responsibleArmorer}
                      onChange={(e) => setResponsibleArmorer(e.target.value)}
                      placeholder="Nome completo do armeiro credenciado..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                      required
                    />
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Credenciamento PF (Polícia Federal) *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={credenciamentoPf}
                      onChange={(e) => setCredenciamentoPf(e.target.value)}
                      placeholder="Ex: Portaria DPF nº 1234/2026 - CGC/PF"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none font-mono"
                      required
                    />
                    <Shield className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Telefone e Contato Adicional */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none font-mono"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Contato Adicional / Gerente
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Nome do contato comercial ou telefone fixo..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                  />
                  <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              {editingId ? (
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Limpar / Cancelar
                </button>
              ) : <div />}

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Gravando...' : (editingId ? 'Atualizar Armeria' : 'Cadastrar Armeria')}</span>
                </button>
              </div>
            </div>

          </form>
        ) : (
          /* List of Registered Workshops */
          <div className="space-y-3">
            {/* Search Box */}
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome da armeria, cidade, armeiro ou credenciamento..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-2 text-xs text-slate-100 focus:border-purple-500 focus:outline-none placeholder-slate-500"
              />
            </div>

            {loadingList ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Carregando armerias...
              </div>
            ) : filteredWorkshops.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl italic">
                Nenhuma armeria cadastrada encontrada. Clique na aba "Cadastrar Nova Armeria" para adicionar.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {filteredWorkshops.map((shop) => (
                  <div
                    key={shop.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-100 text-sm">
                          {shop.name}
                        </span>
                        {shop.state && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-purple-300 font-mono">
                            {shop.state}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-300 flex items-start space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span>
                          {shop.street ? `${shop.street}, ` : ''}
                          {shop.number ? `Nº ${shop.number}, ` : ''}
                          {shop.neighborhood ? `${shop.neighborhood}, ` : ''}
                          {shop.city ? `${shop.city} - ` : ''}
                          {shop.state || ''}
                          {shop.cep ? ` (CEP: ${shop.cep})` : ''}
                        </span>
                      </div>

                      {/* Armeiro Responsável e Credenciamento PF */}
                      {(shop.responsibleArmorer || shop.credenciamentoPf) && (
                        <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[11px] space-y-0.5 mt-1">
                          {shop.responsibleArmorer && (
                            <div className="flex items-center space-x-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>Armeiro Responsável: <strong className="text-slate-100">{shop.responsibleArmorer}</strong></span>
                            </div>
                          )}
                          {shop.credenciamentoPf && (
                            <div className="flex items-center space-x-1.5">
                              <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span>Credenciamento PF: <strong className="font-mono text-purple-300">{shop.credenciamentoPf}</strong></span>
                            </div>
                          )}
                        </div>
                      )}

                      {(shop.phone || shop.contact) && (
                        <div className="text-[11px] text-slate-400 flex items-center space-x-3 pt-0.5">
                          {shop.phone && <span>Telefone: <strong className="text-slate-300 font-mono">{shop.phone}</strong></span>}
                          {shop.contact && <span>Contato: <strong className="text-slate-300">{shop.contact}</strong></span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleEdit(shop)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      >
                        <Edit2 className="w-3 h-3 text-purple-400" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(shop)}
                        className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded-lg text-xs font-semibold transition flex items-center space-x-1 border border-red-800/40"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[11px] text-slate-400">
                Total: <strong className="text-slate-200 font-mono">{filteredWorkshops.length}</strong> armeria(s)
              </span>
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
