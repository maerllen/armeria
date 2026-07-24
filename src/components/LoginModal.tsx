import React, { useState } from 'react';
import { cleanMasp, formatMasp } from '../utils/masks';
import { Shield, Lock, User, AlertCircle, Database, Server, ChevronDown, ChevronUp, CheckCircle, ExternalLink } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (maspDigits: string, passwordDigits: string) => void;
  onLocalFallbackLogin?: (maspDigits: string) => void;
  error?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onLocalFallbackLogin, error }) => {
  const [maspRaw, setMaspRaw] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [showDbGuide, setShowDbGuide] = useState(false);

  const handleMaspChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Input accepts ONLY digits
    const clean = cleanMasp(e.target.value);
    setMaspRaw(clean);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!maspRaw) {
      setLocalError('Por favor, informe o MASP.');
      return;
    }
    if (!password) {
      setLocalError('Por favor, informe a senha.');
      return;
    }

    onLoginSuccess(maspRaw, password);
  };

  const handleDemoLogin = (demoMasp: string) => {
    setMaspRaw(demoMasp);
    setPassword(demoMasp);
    if (onLocalFallbackLogin) {
      onLocalFallbackLogin(demoMasp);
    } else {
      onLoginSuccess(demoMasp, demoMasp);
    }
  };

  const isDbError = Boolean(
    error && (
      error.toLowerCase().includes('access denied') ||
      error.toLowerCase().includes('mysql') ||
      error.toLowerCase().includes('banco de dados') ||
      error.toLowerCase().includes('econnrefused')
    )
  );

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-8">
        
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border-b border-slate-800 text-center relative">
          <div className="inline-flex p-3 bg-amber-500 text-slate-950 rounded-xl shadow-lg mb-3">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-100 font-mono tracking-wider">ARMERIA</h2>
          <p className="text-xs text-amber-400 font-medium uppercase tracking-widest mt-1">
            Polícia Civil • Gestão de Armas e Munições
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {(error || localError) && (
            <div className="space-y-3">
              <div className="bg-red-950/90 border border-red-800 text-red-200 text-xs p-3.5 rounded-xl flex items-start space-x-2.5 shadow-sm">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">Falha na Autenticação / Conexão</p>
                  <p className="leading-relaxed">{error || localError}</p>
                </div>
              </div>

              {isDbError && (
                <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-3 text-xs space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowDbGuide(!showDbGuide)}
                    className="w-full flex items-center justify-between text-amber-400 hover:text-amber-300 font-medium"
                  >
                    <span className="flex items-center space-x-1.5">
                      <Database className="w-4 h-4" />
                      <span>Como resolver o erro do MySQL no Hostinger?</span>
                    </span>
                    {showDbGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showDbGuide && (
                    <div className="pt-2 border-t border-slate-800 text-slate-300 space-y-2 text-[11px] leading-normal">
                      <p className="text-amber-200 font-semibold">Passos para solução na Hostinger / cPanel:</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-400">
                        <li>Acesse o painel <strong>Hostinger &gt; Bancos de dados MySQL</strong>.</li>
                        <li>Confirme se a base <code>u552818109_Armeriadb</code> e o usuário <code>u552818109_Armeria_user</code> existem.</li>
                        <li>Verifique se a senha informada no <code>.env</code> é exatamente a cadastrada no painel.</li>
                        <li>Em <strong>Permissões / Privilégios</strong>, garanta permissão total ao usuário.</li>
                        <li>Em <strong>MySQL Remoto</strong>, insira <code>%</code> ou o IP do servidor onde a aplicação está rodando.</li>
                        <li>No arquivo <code>.env</code>, defina <code>DB_HOST=127.0.0.1</code> em vez de <code>localhost</code> para evitar falha do IPv6 (<code>::1</code>).</li>
                      </ol>
                    </div>
                  )}

                  {onLocalFallbackLogin && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleDemoLogin('1255748')}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-semibold py-2 px-3 rounded-lg text-xs transition flex items-center justify-center space-x-1.5"
                      >
                        <Server className="w-3.5 h-3.5" />
                        <span>Entrar no Modo Local (Demonstração)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              MASP (Apenas números)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={formatMasp(maspRaw)}
                onChange={handleMaspChange}
                placeholder="Ex: 1.255.748-0"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digitação restrita a números. Formatação automática.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl shadow-lg transition duration-200 flex items-center justify-center space-x-2 text-sm"
          >
            <span>ENTRAR NO SISTEMA</span>
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="px-6 pb-4">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
            <p className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              Contas de Acesso Rápido (Teste):
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setMaspRaw('1255748');
                  setPassword('1255748');
                }}
                className="text-left p-2 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 text-slate-300 transition"
              >
                <div className="font-bold text-amber-400">Admin Master</div>
                <div className="text-[10px] text-slate-500">MASP: 1255748</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMaspRaw('3333333');
                  setPassword('3333333');
                }}
                className="text-left p-2 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 text-slate-300 transition"
              >
                <div className="font-bold text-amber-400">Armeiro COE</div>
                <div className="text-[10px] text-slate-500">MASP: 3333333</div>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500">
            Acesso restrito a policiais civis autorizados. Todas as ações são auditadas.
          </p>
        </div>
      </div>
    </div>
  );
};
