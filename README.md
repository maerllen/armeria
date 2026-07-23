# ARMERIA — Sistema de Gestão e Cautela de Armamento (Polícia Civil)

Sistema web completo para gestão, controle de acervo, agendamento e cautela operacional de armamentos e munições da Polícia Civil, com fluxo estrito de aprovação, logs de auditoria e cadastro de qualificações.

## 👥 Perfis e Credenciais de Acesso

Ao iniciar o sistema, você pode se conectar utilizando as credenciais cadastradas abaixo:

| Perfil | Nome | MASP | Senha Inicial | Escopo de Permissões |
| :--- | :--- | :--- | :--- | :--- |
| **Administrador Geral (Geral)** | Administrador Geral Master | `1255748` | `1255748` | **Acesso Total**: Pode cadastrar, alterar e excluir qualquer usuário, departamento, unidade, curso, cofre, arma, calibre e movimentação no sistema. |
| **Administrador** | Dr. Roberto Silva | `2222222` | `2222222` | Gestão completa dentro do seu departamento. |
| **Armeiro** | Agente Carlos Andrade | `3333333` | `3333333` | Gestão de acervo, cofres, manutenção e aprovação de cautelas. |
| **Policial** | Policial Eduardo Costa | `4444444` | `4444444` | Solicitante de armamento, visualização de perfil e histórico de cautelas. |

> *Nota: No primeiro acesso com a senha padrão (igual ao MASP), o sistema solicita a alteração obrigatória de senha.*

---

## 🚀 Principais Funcionalidades

- **Acesso Total para o Perfil "Geral"**:
  - Cadastro, alteração e exclusão de **Departamentos**, **Unidades**, **Usuários/Policiais**, **Cursos Operacionais**, **Locais no Cofre**, **Calibres**, **Armas** e **Estoque de Munições**.
  - Validações de integridade com mensagens explicativas ao tentar excluir itens vinculados a registros ativos.
- **Fluxo Rigoroso de Cautela de Armamentos**:
  - Verificação de cursos válidos (realizados nos últimos 2 anos) para liberação de modelos/calibres.
  - Solicitação de retirada -> Aprovação pelo Armeiro/Admin -> Pendência de Recibo na devolução com justificativa em caso de divergência de munição.
- **Cofre e Locais de Guarda Separados**:
  - Locais identificados (ex: `B1-G1` para Armas e `M1-L1` para Munições).
- **Rastreabilidade e Logs de Auditoria**:
  - Registro de todas as ações no sistema com timestamp, MASP e IP.

---

## 🛠️ Deploy Automático no GitHub Pages

Este repositório possui uma **GitHub Action** pré-configurada em `.github/workflows/deploy.yml`.

### Como ativar a publicação no GitHub Pages:

1. Suba este código para o seu repositório no GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: Sistema ARMERIA completo com suporte GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
2. No seu repositório no GitHub, acesse **Settings** > **Pages**.
3. Em **Source**, selecione **GitHub Actions**.
4. O GitHub executará o build automaticamente e disponibilizará o link da aplicação online (ex: `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`).

---

## 💻 Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Executar servidor de desenvolvimento
npm run dev

# Executar validação de código
npm run lint

# Executar build de produção
npm run build
```
