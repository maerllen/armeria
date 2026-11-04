/**
 * Preloader Service & Interceptor
 * 
 * Gerencia o estado global de carregamento do sistema, intercepta
 * requisições /api/* automaticamente e garante feedback visual
 * instantâneo e profissional para qualquer comando do usuário.
 */

export interface PreloaderState {
  isActive: boolean;
  message: string;
  submessage: string;
  type?: 'command' | 'sync' | 'module' | 'auth';
}

type PreloaderListener = (state: PreloaderState) => void;

class PreloaderService {
  private activeTasks = new Map<string, { message: string; submessage: string; type?: PreloaderState['type'] }>();
  private listeners = new Set<PreloaderListener>();
  private minDisplayTimer: any = null;
  private autoDismissTimer: any = null;
  private isShowing = false;
  private currentMessage = 'Processando comando...';
  private currentSubmessage = 'Aguarde enquanto o sistema executa a operação...';
  private currentType: PreloaderState['type'] = 'command';
  private startedAt = 0;
  private readonly MIN_DISPLAY_MS = 200; // Duração mínima reduzida para evitar espera desnecessária
  private interceptorInstalled = false;
  private clickInterceptorInstalled = false;

  constructor() {
    this.installFetchInterceptor();
    this.installClickInterceptor();
  }

  public getState(): PreloaderState {
    return {
      isActive: this.isShowing,
      message: this.currentMessage,
      submessage: this.currentSubmessage,
      type: this.currentType
    };
  }

  public subscribe(listener: PreloaderListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    if (typeof document !== 'undefined') {
      if (this.isShowing) {
        document.body.classList.add('is-preloader-active');
      } else {
        document.body.classList.remove('is-preloader-active');
      }
    }
    this.listeners.forEach(fn => {
      try {
        fn(state);
      } catch (err) {
        console.error('[PreloaderService] Listener error:', err);
      }
    });
  }

  /**
   * Inicia um comando com feedback visual no preloader
   * Retorna um identificador único para encerramento
   */
  public start(
    message = 'Processando comando...',
    submessage = 'Aguarde enquanto o sistema executa a operação...',
    type: PreloaderState['type'] = 'command'
  ): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.activeTasks.set(id, { message, submessage, type });

    // Se existir alguma tarefa de 'auth' em andamento e a nova tarefa não for 'auth',
    // preserva a mensagem de autenticação no login/logout
    const hasActiveAuth = Array.from(this.activeTasks.values()).some(t => t.type === 'auth');
    if (type === 'auth' || !hasActiveAuth) {
      this.currentMessage = message;
      this.currentSubmessage = submessage;
      this.currentType = type;
    }

    if (!this.isShowing) {
      this.isShowing = true;
      this.startedAt = Date.now();
      this.notify();
    } else {
      this.notify();
    }

    // Safety timeout: se uma operação travar por mais de 25 segundos, destrava
    if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
    this.autoDismissTimer = setTimeout(() => {
      console.warn('[PreloaderService] Safety timeout reached, resetting tasks.');
      this.forceStop();
    }, 25000);

    return id;
  }

  /**
   * Encerra um comando específico
   */
  public stop(id: string) {
    this.activeTasks.delete(id);

    // Se ainda houver tarefas ativas, atualiza a mensagem com a última pendente (priorizando auth)
    if (this.activeTasks.size > 0) {
      const authTask = Array.from(this.activeTasks.values()).find(t => t.type === 'auth');
      const last = authTask || Array.from(this.activeTasks.values())[this.activeTasks.size - 1];
      this.currentMessage = last.message;
      this.currentSubmessage = last.submessage;
      this.currentType = last.type;
      this.notify();
      return;
    }

    // Se todas as tarefas acabaram, aguarda o tempo mínimo para fechamento suave
    const elapsed = Date.now() - this.startedAt;
    const remaining = Math.max(0, this.MIN_DISPLAY_MS - elapsed);

    if (this.minDisplayTimer) clearTimeout(this.minDisplayTimer);
    this.minDisplayTimer = setTimeout(() => {
      if (this.activeTasks.size === 0) {
        this.isShowing = false;
        if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
        this.notify();
      }
    }, remaining);
  }

  /**
   * Força parada imediata de qualquer preloader ativo
   */
  public forceStop() {
    this.activeTasks.clear();
    this.isShowing = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('is-preloader-active');
    }
    if (this.minDisplayTimer) clearTimeout(this.minDisplayTimer);
    if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
    this.notify();
  }

  /**
   * Wrapper utilitário para envolver qualquer Promise no preloader
   */
  public async withPreloader<T>(
    operation: Promise<T> | (() => Promise<T>),
    message = 'Processando comando...',
    submessage = 'Aguarde enquanto o sistema executa a operação...',
    type: PreloaderState['type'] = 'command'
  ): Promise<T> {
    const taskId = this.start(message, submessage, type);
    try {
      const promise = typeof operation === 'function' ? operation() : operation;
      return await promise;
    } finally {
      this.stop(taskId);
    }
  }

  /**
   * Instala interceptor em window.fetch para que qualquer requisição
   * à API do sistema ative o preloader automaticamente.
   */
  private installFetchInterceptor() {
    if (this.interceptorInstalled || typeof window === 'undefined') return;
    this.interceptorInstalled = true;

    const originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      let urlString = '';
      if (typeof input === 'string') {
        urlString = input;
      } else if (input instanceof URL) {
        urlString = input.toString();
      } else if (input && typeof input === 'object' && 'url' in input) {
        urlString = (input as Request).url;
      }

      const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();

      // Intercepta chamadas de API do sistema (/api/...)
      const isApiCall = urlString.includes('/api/');
      const skipPreloader = init?.headers && (
        (init.headers as any)['x-skip-preloader'] === 'true' ||
        (init.headers instanceof Headers && init.headers.get('x-skip-preloader') === 'true')
      );

      // O preloader deve carregar somente o necessário para funcionar:
      // Apenas operações de gravação/alteração (POST, PUT, PATCH, DELETE) ou login ativam o preloader de tela cheia.
      // Requisições GET normais (leitura de dados da tela/background) não bloqueiam a interface.
      const isMutatingOrAuth = method !== 'GET' || urlString.includes('/api/auth/login') || urlString.includes('/api/auth/change-password');

      if (!isApiCall || skipPreloader || !isMutatingOrAuth) {
        return originalFetch.apply(this, [input as any, init]);
      }

      // Define mensagens contextuais conforme o endpoint e método
      const { message, submessage, type } = self.resolveMessagesForRequest(urlString, method);
      const taskId = self.start(message, submessage, type);

      try {
        const response = await originalFetch.apply(this, [input as any, init]);
        return response;
      } finally {
        self.stop(taskId);
      }
    };
  }

  /**
   * Intercepta cliques globais em botões para:
   * 1. Impedir cliques múltiplos no mesmo botão (double/triple-clicks).
   * 2. Evitar disparar telas de preloader desnecessárias em cliques simples (abrir modais, filtros, abas).
   */
  private installClickInterceptor() {
    if (this.clickInterceptorInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.clickInterceptorInstalled = true;

    const busyButtons = new WeakSet<HTMLElement>();

    document.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const button = target.closest('button, input[type="submit"], [role="button"]') as HTMLElement | null;
      if (!button) return;

      // 1. Evita múltiplos cliques rápidos no mesmo botão
      if (this.isShowing || busyButtons.has(button) || button.getAttribute('data-busy') === 'true' || (button as HTMLButtonElement).disabled) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      // Marca temporariamente para evitar duplo clique acidental
      busyButtons.add(button);
      button.setAttribute('data-busy', 'true');
      setTimeout(() => {
        busyButtons.delete(button);
        button.removeAttribute('data-busy');
      }, 350);
    }, true);
  }

  private resolveMessagesForRequest(url: string, method: string): { message: string; submessage: string; type: PreloaderState['type'] } {
    // 1. Autenticação
    if (url.includes('/api/auth/login')) {
      return {
        message: 'Autenticando usuário no sistema...',
        submessage: 'Validando credenciais na base de dados da Polícia Civil...',
        type: 'auth'
      };
    }
    if (url.includes('/api/auth/change-password')) {
      return {
        message: 'Atualizando senha de acesso...',
        submessage: 'Gravando nova senha com segurança...',
        type: 'auth'
      };
    }

    // Se for requisição GET (leitura/sincronização de dados), nunca usar mensagens de gravação
    if (method === 'GET') {
      return {
        message: 'Sincronizando com o servidor...',
        submessage: 'Carregando informações do sistema...',
        type: 'sync'
      };
    }

    // 2. Módulo de Explosivos
    if (url.includes('/api/explosivos')) {
      if (method === 'POST') {
        return {
          message: 'Cadastrando explosivo...',
          submessage: 'Gravando dados no acervo técnico de explosivos...',
          type: 'command'
        };
      }
      if (method === 'PUT') {
        return {
          message: 'Atualizando explosivo...',
          submessage: 'Salvando alterações no cadastro do material...',
          type: 'command'
        };
      }
      if (method === 'DELETE') {
        return {
          message: 'Excluindo explosivo...',
          submessage: 'Removendo registro do acervo técnico...',
          type: 'command'
        };
      }
    }

    if (url.includes('/api/movimentacoes-explosivos')) {
      return {
        message: 'Registrando movimentação de explosivos...',
        submessage: 'Processando entrada/saída no sistema...',
        type: 'command'
      };
    }

    if (url.includes('/api/tipos-explosivos')) {
      return {
        message: method === 'DELETE' ? 'Excluindo tipo de explosivo...' : method === 'PUT' ? 'Atualizando tipo de explosivo...' : 'Cadastrando tipo de explosivo...',
        submessage: 'Atualizando catálogo de explosivos...',
        type: 'command'
      };
    }

    if (url.includes('/api/subtipos-explosivos')) {
      return {
        message: method === 'DELETE' ? 'Excluindo subtipo de explosivo...' : method === 'PUT' ? 'Atualizando subtipo de explosivo...' : 'Cadastrando subtipo de explosivo...',
        submessage: 'Atualizando catálogo de explosivos...',
        type: 'command'
      };
    }

    if (url.includes('/api/fabricantes-explosivos')) {
      return {
        message: method === 'DELETE' ? 'Excluindo fabricante de explosivo...' : method === 'PUT' ? 'Atualizando fabricante de explosivo...' : 'Cadastrando fabricante de explosivos...',
        submessage: 'Atualizando cadastro de fabricantes...',
        type: 'command'
      };
    }

    // 3. Armas
    if (url.includes('/api/weapons') || url.includes('/api/armas')) {
      if (method === 'POST') {
        return {
          message: 'Cadastrando armamento no acervo...',
          submessage: 'Gravando número de série e dados técnicos...',
          type: 'command'
        };
      }
      if (method === 'PUT') {
        return {
          message: 'Atualizando armamento...',
          submessage: 'Salvando alterações na base de dados...',
          type: 'command'
        };
      }
      if (method === 'DELETE') {
        return {
          message: 'Excluindo armamento...',
          submessage: 'Removendo arma do acervo policial...',
          type: 'command'
        };
      }
    }

    // 4. Munições
    if (url.includes('/api/ammo-stocks') || url.includes('/api/municoes')) {
      return {
        message: 'Atualizando estoque de munições...',
        submessage: 'Recalculando saldos e lotes nos cofres...',
        type: 'command'
      };
    }

    if (url.includes('/api/ammo-movements')) {
      return {
        message: 'Registrando movimentação de munição...',
        submessage: 'Processando recibo e ajustando saldos...',
        type: 'command'
      };
    }

    // 5. Movimentações Gerais
    if (url.includes('/api/movements')) {
      return {
        message: 'Registrando movimentação...',
        submessage: 'Processando cautela ou devolução de material...',
        type: 'command'
      };
    }

    // 6. Cofres
    if (url.includes('/api/vault-spaces')) {
      return {
        message: method === 'DELETE' ? 'Excluindo local do cofre...' : 'Processando local do cofre...',
        submessage: 'Atualizando espaços físicos de armazenamento...',
        type: 'command'
      };
    }

    // 7. Departamentos e Unidades
    if (url.includes('/api/departments')) {
      return {
        message: method === 'DELETE' ? 'Excluindo departamento...' : 'Processando departamento...',
        submessage: 'Atualizando estrutura de departamentos...',
        type: 'command'
      };
    }

    if (url.includes('/api/units')) {
      return {
        message: method === 'DELETE' ? 'Excluindo unidade...' : 'Processando unidade policial...',
        submessage: 'Atualizando estrutura da unidade...',
        type: 'command'
      };
    }

    // 8. Usuários
    if (url.includes('/api/users')) {
      return {
        message: method === 'DELETE' ? 'Excluindo usuário...' : 'Processando dados do usuário...',
        submessage: 'Gravando cadastro e permissões no sistema...',
        type: 'command'
      };
    }

    // 9. Materiais
    if (url.includes('/api/materiais') || url.includes('/api/cautelas-materiais') || url.includes('/api/tipos-materiais')) {
      return {
        message: 'Processando material bélico...',
        submessage: 'Gravando informações de materiais...',
        type: 'command'
      };
    }

    // 10. Transferências
    if (url.includes('/api/weapon-transfers')) {
      return {
        message: 'Processando transferência de armamento...',
        submessage: 'Gerando protocolo de trânsito...',
        type: 'command'
      };
    }

    // Padrão para POST/PUT/DELETE
    if (method === 'POST') {
      return {
        message: 'Processando comando...',
        submessage: 'Gravando novo registro no banco de dados...',
        type: 'command'
      };
    }

    if (method === 'PUT') {
      return {
        message: 'Processando comando...',
        submessage: 'Atualizando dados no sistema...',
        type: 'command'
      };
    }

    if (method === 'DELETE') {
      return {
        message: 'Processando comando...',
        submessage: 'Removendo registro do sistema...',
        type: 'command'
      };
    }

    // Padrão para GET
    return {
      message: 'Sincronizando com o servidor...',
      submessage: 'Carregando informações atualizadas...',
      type: 'sync'
    };
  }
}

// Exporta instância singleton
export const preloaderService = new PreloaderService();
