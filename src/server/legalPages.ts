/**
 * Páginas institucionais públicas (Termos de Serviço e Política de Privacidade)
 * em conformidade com as Diretrizes da Meta Platforms / WhatsApp Business API e LGPD.
 * Servidas diretamente em HTML estático (HTTP 200) para validação imediata pelo
 * painel Meta for Developers e acesso público sem necessidade de autenticação.
 */

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    line-height: 1.65;
  }
  .page {
    max-width: 880px;
    margin: 0 auto;
    padding: 36px 20px 64px;
  }
  .card {
    background: #111827;
    border: 1px solid #1e293b;
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
  }
  .header {
    border-bottom: 1px solid #1e293b;
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #34d399;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 8px;
    padding: 4px 10px;
    margin-bottom: 12px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 900;
    color: #f8fafc;
    letter-spacing: -0.02em;
  }
  .subtitle {
    margin: 0;
    font-size: 14px;
    color: #94a3b8;
  }
  .meta-info {
    margin-top: 12px;
    font-size: 12px;
    color: #64748b;
  }
  h2 {
    margin: 26px 0 10px;
    font-size: 16px;
    font-weight: 800;
    color: #f8fafc;
    border-left: 3px solid #10b981;
    padding-left: 10px;
  }
  p {
    margin: 0 0 12px;
    font-size: 14px;
    color: #cbd5e1;
  }
  ul {
    margin: 0 0 14px;
    padding-left: 20px;
    font-size: 14px;
    color: #cbd5e1;
  }
  li {
    margin-bottom: 6px;
  }
  .highlight {
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
    font-size: 13.5px;
    color: #cbd5e1;
  }
  a {
    color: #38bdf8;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .footer {
    margin-top: 32px;
    padding-top: 18px;
    border-top: 1px solid #1e293b;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: #64748b;
  }
  @media print {
    body { background: #ffffff; color: #0f172a; }
    .card { background: #ffffff; border: 1px solid #cbd5e1; box-shadow: none; }
    h1, h2 { color: #0f172a; }
    p, li, .highlight { color: #1e293b; }
    .highlight { background: #f8fafc; border-color: #cbd5e1; }
  }
`;

export function renderTermosDeServicoHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Termos de Serviço — Armeria PCMG (Integração WhatsApp Business API)</title>
  <meta name="description" content="Termos de Serviço do Sistema Armeria PCMG para uso da integração oficial com a WhatsApp Business Cloud API (Meta Platforms)." />
  <meta property="og:title" content="Termos de Serviço — Armeria PCMG" />
  <meta property="og:description" content="Diretrizes de uso, privacidade, segurança e conformidade com a Meta WhatsApp Business API." />
  <meta property="og:type" content="website" />
  <style>${BASE_STYLES}</style>
</head>
<body>
  <main class="page">
    <article class="card">
      <header class="header">
        <span class="badge">Conformidade Meta Platform &amp; WhatsApp Business API</span>
        <h1>Termos de Serviço</h1>
        <p class="subtitle">
          Sistema Armeria — Gestão de Armaria, Operações, Treinamentos e Canil K9 (Integração Oficial WhatsApp Cloud API)
        </p>
        <div class="meta-info">
          Última atualização: 24 de novembro de 2026 &nbsp;•&nbsp; Versão 1.0 &nbsp;•&nbsp; Uso Institucional
        </div>
      </header>

      <section>
        <h2>1. Aceitação e Objeto</h2>
        <p>
          Estes Termos de Serviço regulam o acesso e a utilização do aplicativo e dos canais automatizados de atendimento
          e notificação via <strong>WhatsApp Business Cloud API (Meta Platforms, Inc.)</strong> operados pelo
          <strong>Sistema Armeria — Gestão de Armaria, Operações e Treinamentos</strong>.
        </p>
        <p>
          Ao enviar mensagens ao número oficial vinculado ao sistema, interagir com seus menus ou utilizar links de sessão
          temporária autenticada, o usuário declara estar ciente e de acordo com todas as disposições destes Termos e com a
          <a href="/politica-de-privacidade">Política de Privacidade</a>.
        </p>
      </section>

      <section>
        <h2>2. Elegibilidade e Uso Institucional</h2>
        <p>
          O serviço destina-se exclusivamente a servidores públicos policiais, armeiros, operadores caninos, gestores e
          administradores previamente cadastrados e autorizados no sistema, respeitando rigorosamente o perfil de acesso e as
          unidades vinculadas a cada usuário.
        </p>
        <ul>
          <li>O acesso às informações e documentos é individual, intransferível e condicionado à validação do número de telefone cadastrado no perfil do servidor.</li>
          <li>Cada usuário visualiza e solicita exclusivamente dados, relatórios e cautelas pertencentes às unidades para as quais possui autorização ativa.</li>
          <li>É vedado compartilhar links temporários de cautela, credenciais de acesso ou documentos internos com terceiros não autorizados.</li>
        </ul>
      </section>

      <section>
        <h2>3. Funcionalidades via API Oficial do WhatsApp (Meta)</h2>
        <p>
          A comunicação por meio da WhatsApp Business Cloud API ocorre exclusivamente para finalidades operacionais,
          administrativas e transacionais solicitadas ou autorizadas pelo usuário, incluindo:
        </p>
        <ul>
          <li><strong>Operações e Treinamentos:</strong> consulta interativa por unidade permitida e por período (data específica, mês/ano, ano ou últimas 24 horas) com envio de relatórios em formato PDF.</li>
          <li><strong>Armaria (Cautelas e Devoluções):</strong> geração de link seguro de sessão temporária autenticada para solicitar ou devolver cautelas de armas, munições e materiais, com notificação de acompanhamento até o deferimento do responsável pela armaria.</li>
          <li><strong>Recibos e Relatórios de Armaria:</strong> emissão de recibos de cautelas e relatórios consolidados por unidade e período conforme o perfil do usuário.</li>
          <li><strong>Notificações Transacionais:</strong> avisos operacionais disparados por meio de modelos (<em>templates</em>) previamente aprovados pela Meta.</li>
        </ul>
      </section>

      <section>
        <h2>4. Conformidade com as Diretrizes da Meta Platforms</h2>
        <div class="highlight">
          Este serviço utiliza a infraestrutura oficial da <strong>WhatsApp Business Cloud API</strong> fornecida pela
          Meta Platforms, Inc., operando em estrita conformidade com os
          <strong>Termos da Plataforma Meta</strong>, os <strong>Termos Comerciais do WhatsApp Business</strong> e a
          <strong>Política de Mensagens do WhatsApp Business</strong>. Este sistema é de operação institucional própria e não
          é afiliado, patrocinado ou endossado pela Meta Platforms, Inc. ou pelo WhatsApp LLC.
        </div>
        <ul>
          <li><strong>Consentimento (Opt-in):</strong> mensagens proativas fora da janela de atendimento de 24 horas somente são enviadas mediante consentimento prévio e por meio de modelos aprovados pela Meta.</li>
          <li><strong>Cancelamento (Opt-out):</strong> o usuário pode solicitar a qualquer momento a interrupção de notificações automatizadas respondendo com solicitação de cancelamento ou contatando o administrador do sistema.</li>
          <li><strong>Proibição de Spam e Marketing:</strong> o canal não realiza envio de publicidade, promoções comerciais ou disparos em massa não solicitados.</li>
        </ul>
      </section>

      <section>
        <h2>5. Privacidade, Proteção de Dados (LGPD) e Auditoria</h2>
        <p>
          O tratamento de dados pessoais observa integralmente a <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)</strong>
          e as normas internas de segurança da informação.
        </p>
        <ul>
          <li>São tratados apenas os dados estritamente necessários à identificação do servidor e execução da solicitação: nome, matrícula/MASP, telefone WhatsApp, unidade de lotação, perfil de acesso e registros de interação.</li>
          <li>Os registros de envio, recebimento de webhooks e ações realizadas em sessões temporárias são mantidos em trilha de auditoria para controle administrativo e rastreabilidade institucional.</li>
          <li>Os dados não são comercializados, cedidos para fins publicitários ou transferidos a terceiros estranhos à prestação do serviço, ressalvado o tráfego técnico indispensável pela API oficial da Meta.</li>
        </ul>
        <p>
          Para mais detalhes sobre coleta, armazenamento, direitos do titular e instruções de exclusão de dados, consulte nossa
          <a href="/politica-de-privacidade">Política de Privacidade</a>.
        </p>
      </section>

      <section>
        <h2>6. Segurança da Informação</h2>
        <ul>
          <li>Todas as comunicações entre o servidor do sistema e a Meta Graph API utilizam criptografia TLS/HTTPS.</li>
          <li>As credenciais da API são armazenadas de forma protegida no servidor e os eventos de webhook são validados por token de verificação e assinatura criptográfica HMAC-SHA256.</li>
          <li>Links de sessão temporária para solicitação ou devolução de cautelas possuem prazo curto de expiração e uso restrito à operação autenticada.</li>
        </ul>
      </section>

      <section>
        <h2>7. Condutas Proibidas</h2>
        <p>É expressamente proibido ao usuário ou a terceiros:</p>
        <ul>
          <li>Utilizar o canal para envio de mensagens ilícitas, ofensivas, fraudulentas ou em desacordo com as políticas da Meta e do WhatsApp.</li>
          <li>Tentar obter acesso não autorizado a relatórios, recibos ou dados de unidades para as quais não possua permissão.</li>
          <li>Realizar automação abusiva, exploração de vulnerabilidades, engenharia reversa ou qualquer ação que comprometa a disponibilidade do serviço.</li>
        </ul>
      </section>

      <section>
        <h2>8. Disponibilidade, Limitação de Responsabilidade e Alterações</h2>
        <p>
          O sistema emprega boas práticas para manter o serviço disponível de forma contínua; contudo, o funcionamento das
          mensagens depende também da disponibilidade da plataforma WhatsApp / Meta Cloud API e dos serviços de conectividade
          do dispositivo do usuário.
        </p>
        <p>
          Estes Termos poderão ser atualizados periodicamente para refletir aprimoramentos técnicos, mudanças regulatórias ou
          atualizações das diretrizes da Meta, passando a vigorar a partir de sua publicação nesta página com a respectiva data
          de revisão.
        </p>
      </section>

      <section>
        <h2>9. Contato, Suporte e Foro</h2>
        <p>
          Em caso de dúvidas sobre estes Termos de Serviço, solicitações de cancelamento de recebimento de mensagens (opt-out),
          exercício de direitos previstos na LGPD ou suporte técnico, o usuário deverá contatar o Administrador do Sistema
          Armeria na sua respectiva unidade administrativa ou pelo módulo de administração institucional.
        </p>
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil, ficando eleito o foro da Comarca de
          Belo Horizonte/MG para dirimir quaisquer controvérsias oriundas de sua interpretação ou execução.
        </p>
      </section>

      <footer class="footer">
        <span>Sistema Armeria — Uso Institucional</span>
        <span>
          <a href="/termos-de-servico">Termos de Serviço</a> &nbsp;•&nbsp;
          <a href="/politica-de-privacidade">Política de Privacidade</a>
        </span>
      </footer>
    </article>
  </main>
</body>
</html>`;
}

export function renderPoliticaDePrivacidadeHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Política de Privacidade — Armeria PCMG (Integração WhatsApp Business API)</title>
  <meta name="description" content="Política de Privacidade e instruções de exclusão de dados do Sistema Armeria PCMG para integração com a WhatsApp Business Cloud API." />
  <meta property="og:title" content="Política de Privacidade — Armeria PCMG" />
  <meta property="og:description" content="Tratamento de dados, LGPD e instruções de exclusão de dados para a integração oficial do WhatsApp." />
  <meta property="og:type" content="website" />
  <style>${BASE_STYLES}</style>
</head>
<body>
  <main class="page">
    <article class="card">
      <header class="header">
        <span class="badge">LGPD &amp; Diretrizes Meta Platforms</span>
        <h1>Política de Privacidade</h1>
        <p class="subtitle">
          Sistema Armeria — Tratamento de Dados na Integração Oficial WhatsApp Business Cloud API
        </p>
        <div class="meta-info">
          Última atualização: 24 de novembro de 2026 &nbsp;•&nbsp; Versão 1.0
        </div>
      </header>

      <section>
        <h2>1. Dados Coletados</h2>
        <p>Para operar o atendimento automatizado e as notificações via WhatsApp Business Cloud API, o sistema processa exclusivamente:</p>
        <ul>
          <li>Número de telefone WhatsApp vinculado ao cadastro do usuário autorizado;</li>
          <li>Identificação funcional (nome, matrícula/MASP, perfil e unidades autorizadas);</li>
          <li>Conteúdo das seleções de menu, solicitações de relatórios, recibos e eventos técnicos de entrega (status de mensagens e webhooks);</li>
          <li>Registros de sessão temporária autenticada para solicitação ou devolução de cautelas.</li>
        </ul>
      </section>

      <section>
        <h2>2. Finalidade e Base Legal</h2>
        <p>
          Os dados são utilizados unicamente para autenticar o servidor solicitante, aplicar as restrições de acesso por unidade,
          entregar relatórios e recibos solicitados, viabilizar o fluxo de cautela/devolução de armaria e manter trilhas de
          auditoria exigidas pelo controle administrativo e pela legislação aplicável (Lei nº 13.709/2018 — LGPD).
        </p>
      </section>

      <section>
        <h2>3. Compartilhamento de Dados</h2>
        <p>
          Os dados nunca são vendidos ou utilizados para publicidade. O tráfego técnico de mensagens ocorre exclusivamente
          por meio da API oficial da <strong>Meta Platforms, Inc. (WhatsApp Cloud API)</strong>, sujeita às políticas de
          segurança e privacidade da própria Meta.
        </p>
      </section>

      <section>
        <h2>4. Segurança e Retenção</h2>
        <p>
          Adotamos criptografia em trânsito (HTTPS/TLS), controle estrito de permissões por perfil e unidade, verificação de
          assinatura HMAC-SHA256 em webhooks e expiração automática de sessões temporárias. Os registros permanecem armazenados
          pelo prazo necessário ao cumprimento de obrigações legais, regulamentares e de auditoria institucional.
        </p>
      </section>

      <section>
        <h2>5. Direitos do Titular e Exclusão de Dados (Data Deletion)</h2>
        <div class="highlight">
          Em conformidade com a LGPD e com as exigências da Meta Platforms, o titular pode solicitar confirmação de tratamento,
          correção de dados cadastrais, cancelamento do recebimento de mensagens via WhatsApp (opt-out) ou exclusão dos dados de
          sessão/histórico de interações do WhatsApp (observadas as hipóteses legais de guarda obrigatória de auditoria pública)
          diretamente junto ao Administrador do Sistema Armeria da sua unidade.
        </div>
      </section>

      <footer class="footer">
        <span>Sistema Armeria — Uso Institucional</span>
        <span>
          <a href="/termos-de-servico">Termos de Serviço</a> &nbsp;•&nbsp;
          <a href="/politica-de-privacidade">Política de Privacidade</a>
        </span>
      </footer>
    </article>
  </main>
</body>
</html>`;
}
