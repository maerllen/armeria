-- =============================================================================
-- SISTEMA DE GESTÃO DE ARMARIA POLICIAL (PCMG)
-- SCRIPT COMPLETO DE ATUALIZAÇÃO E CRIAÇÃO DAS TABELAS DO BANCO DE DADOS (MySQL)
-- =============================================================================
-- Este script cria todas as tabelas com estrutura padronizada (UTF8MB4),
-- aplica migrações de colunas caso as tabelas já existam, cria as Views de
-- retrocompatibilidade e inclui os dados mestres iniciais recomendados.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. TABELA: departamentos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departamentos` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `codigo` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. TABELA: unidades
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `unidades` (
  `id` VARCHAR(64) NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_unidades_dept` (`departamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. TABELA: usuarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` VARCHAR(64) NOT NULL,
  `masp` VARCHAR(32) NOT NULL,
  `senha` VARCHAR(255) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `telefone` VARCHAR(32) DEFAULT NULL,
  `cargo` VARCHAR(64) NOT NULL,
  `perfil` ENUM('Policial', 'Armeiro', 'Administrador', 'Geral') NOT NULL DEFAULT 'Policial',
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `pode_mover_municao` TINYINT(1) NOT NULL DEFAULT 0,
  `pode_mover_armas` TINYINT(1) NOT NULL DEFAULT 0,
  `tem_acesso_sistema` TINYINT(1) NOT NULL DEFAULT 1,
  `eh_professor` TINYINT(1) NOT NULL DEFAULT 0,
  `disciplina_professor` VARCHAR(32) DEFAULT NULL,
  `professor_sigla` VARCHAR(64) DEFAULT NULL,
  `deve_alterar_senha` TINYINT(1) NOT NULL DEFAULT 1,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_usuarios_masp` (`masp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. TABELA: calibres
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `calibres` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(128) NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_calibres_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. TABELA: tipos_armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tipos_armas` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(100) NOT NULL,
  `modelos` JSON NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. TABELA: cursos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cursos` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `modelos_permitidos` JSON NOT NULL,
  `calibres_permitidos` JSON NOT NULL,
  `tipos_armas_permitidos` JSON DEFAULT NULL,
  `tiros_por_aluno` INT DEFAULT 0,
  `tiros_por_tipo_arma` JSON DEFAULT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. TABELA: usuario_cursos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuario_cursos` (
  `id` VARCHAR(64) NOT NULL,
  `usuario_id` VARCHAR(64) NOT NULL,
  `curso_id` VARCHAR(64) NOT NULL,
  `data_conclusao` DATE DEFAULT NULL,
  `data_validade` DATE DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_usr_cur_usuario` (`usuario_id`),
  KEY `idx_usr_cur_curso` (`curso_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. TABELA: cofres
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cofres` (
  `id` VARCHAR(64) NOT NULL,
  `codigo` VARCHAR(64) NOT NULL,
  `tipo` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 9. TABELA: armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `armas` (
  `id` VARCHAR(64) NOT NULL,
  `tipo` VARCHAR(64) NOT NULL,
  `numero_serie` VARCHAR(128) NOT NULL,
  `fabricante` VARCHAR(128) NOT NULL,
  `modelo` VARCHAR(128) NOT NULL,
  `calibre` VARCHAR(128) NOT NULL,
  `quantidade_carregadores` INT NOT NULL DEFAULT 1,
  `status` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo') NOT NULL DEFAULT 'No Cofre',
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `cofre_id` VARCHAR(64) DEFAULT NULL,
  `observacao_localizacao` VARCHAR(255) DEFAULT NULL,
  `data_ultima_manutencao` DATE DEFAULT NULL,
  `responsavel_ultima_manutencao` VARCHAR(255) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_armas_serie` (`numero_serie`),
  KEY `idx_armas_unidade` (`unidade_id`),
  KEY `idx_armas_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 10. TABELA: estoque_municoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `estoque_municoes` (
  `id` VARCHAR(64) NOT NULL,
  `calibre_id` VARCHAR(64) NOT NULL,
  `quantidade` INT NOT NULL DEFAULT 0,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `cofre_id` VARCHAR(64) DEFAULT NULL,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_municoes_unidade` (`unidade_id`),
  KEY `idx_municoes_calibre` (`calibre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 11. TABELA: movimentacoes_armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimentacoes_armas` (
  `id` VARCHAR(64) NOT NULL,
  `arma_id` VARCHAR(64) NOT NULL,
  `numero_serie_arma` VARCHAR(128) NOT NULL,
  `modelo_arma` VARCHAR(128) NOT NULL,
  `tipo_arma` VARCHAR(64) DEFAULT NULL,
  `calibre` VARCHAR(128) DEFAULT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `requerente_id` VARCHAR(64) NOT NULL,
  `nome_requerente` VARCHAR(255) NOT NULL,
  `masp_requerente` VARCHAR(32) NOT NULL,
  `cofre_retirada_id` VARCHAR(64) DEFAULT NULL,
  `cofre_devolucao_id` VARCHAR(64) DEFAULT NULL,
  `quantidade_municao` INT NOT NULL DEFAULT 0,
  `quantidade_carregadores` INT NOT NULL DEFAULT 0,
  `quantidade_municao_devolucao` INT NOT NULL DEFAULT 0,
  `quantidade_carregadores_devolucao` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(64) NOT NULL,
  `aprovado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
  `aprovado_por_nome` VARCHAR(255) DEFAULT NULL,
  `data_aprovacao` DATETIME DEFAULT NULL,
  `recibo_confirmado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
  `recibo_confirmado_por_nome` VARCHAR(255) DEFAULT NULL,
  `data_recibo` DATETIME DEFAULT NULL,
  `possui_divergencia` TINYINT(1) NOT NULL DEFAULT 0,
  `justificativa_divergencia` TEXT DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mov_armas_arma` (`arma_id`),
  KEY `idx_mov_armas_requerente` (`requerente_id`),
  KEY `idx_mov_armas_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 12. TABELA: movimentacoes_municoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimentacoes_municoes` (
  `id` VARCHAR(64) NOT NULL,
  `tipo` ENUM('Entrada', 'Saída') NOT NULL,
  `calibre_id` VARCHAR(64) NOT NULL,
  `quantidade` INT NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `cofre_id` VARCHAR(64) DEFAULT NULL,
  `destinatario_ou_motivo` VARCHAR(255) NOT NULL,
  `tipo_responsavel` VARCHAR(32) DEFAULT 'SISTEMA',
  `responsavel_usuario_id` VARCHAR(64) DEFAULT NULL,
  `responsavel_nome` VARCHAR(255) DEFAULT NULL,
  `responsavel_masp` VARCHAR(64) DEFAULT NULL,
  `observacao` VARCHAR(500) DEFAULT NULL,
  `quantidade_devolvida` INT DEFAULT 0,
  `data_devolucao` DATETIME DEFAULT NULL,
  `devolvido_por_nome` VARCHAR(255) DEFAULT NULL,
  `usuario_id` VARCHAR(64) DEFAULT NULL,
  `nome_usuario` VARCHAR(255) NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mov_mun_calibre` (`calibre_id`),
  KEY `idx_mov_mun_unidade` (`unidade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 13. TABELA: logs_auditoria
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `logs_auditoria` (
  `id` VARCHAR(64) NOT NULL,
  `modulo` VARCHAR(64) NOT NULL,
  `acao` VARCHAR(64) NOT NULL,
  `detalhes` TEXT NOT NULL,
  `usuario_id` VARCHAR(64) DEFAULT NULL,
  `nome_usuario` VARCHAR(255) NOT NULL,
  `masp_usuario` VARCHAR(32) NOT NULL,
  `perfil_usuario` VARCHAR(32) NOT NULL,
  `endereco_ip` VARCHAR(64) DEFAULT NULL,
  `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_data` (`data_hora`),
  KEY `idx_logs_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 14. TABELA: cursos_academia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cursos_academia` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `tipo` ENUM('Formação', 'Ensino Continuado') NOT NULL,
  `carreira` VARCHAR(64) DEFAULT NULL,
  `codigo` VARCHAR(64) DEFAULT NULL,
  `datas` JSON DEFAULT NULL,
  `nome_departamento` VARCHAR(255) DEFAULT NULL,
  `data_inicio` DATE DEFAULT NULL,
  `numero_modulo` INT DEFAULT NULL,
  `quantidade_aulas` INT NOT NULL DEFAULT 1,
  `dados_aulas` JSON NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 15. TABELA: caixas_armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `caixas_armas` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `tipo_curso` VARCHAR(64) NOT NULL,
  `quantidade_armas` INT NOT NULL,
  `ids_armas` JSON NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 16. TABELA: substituicoes_caixa_armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `substituicoes_caixa_armas` (
  `id` VARCHAR(64) NOT NULL,
  `caixa_id` VARCHAR(64) NOT NULL,
  `nome_caixa` VARCHAR(255) NOT NULL,
  `arma_antiga_id` VARCHAR(64) NOT NULL,
  `descricao_arma_antiga` VARCHAR(255) NOT NULL,
  `arma_nova_id` VARCHAR(64) NOT NULL,
  `descricao_arma_nova` VARCHAR(255) NOT NULL,
  `motivo` VARCHAR(500) NOT NULL,
  `nome_professor` VARCHAR(255) DEFAULT NULL,
  `nome_responsavel` VARCHAR(255) NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subst_caixa` (`caixa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 17. TABELA: turmas_curso
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `turmas_curso` (
  `id` VARCHAR(64) NOT NULL,
  `curso_id` VARCHAR(64) DEFAULT NULL,
  `nome_curso` VARCHAR(255) NOT NULL,
  `disciplina` ENUM('MEAF', 'TAP', 'DP') NOT NULL,
  `carreira` VARCHAR(64) NOT NULL,
  `sigla_carreira` VARCHAR(16) NOT NULL,
  `numero_turma` VARCHAR(32) NOT NULL,
  `codigo` VARCHAR(64) NOT NULL,
  `quantidade_alunos` INT NOT NULL DEFAULT 1,
  `ids_professores` JSON NOT NULL,
  `nome_professor` VARCHAR(255) DEFAULT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `primeira_data_aula` VARCHAR(32) DEFAULT NULL,
  `ultima_data_aula` VARCHAR(32) DEFAULT NULL,
  `turma_calendario` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_turmas_codigo` (`codigo`),
  KEY `idx_turmas_cal` (`turma_calendario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 18. TABELA: planos_aula
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `planos_aula` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `carreira` VARCHAR(64) NOT NULL,
  `ano` INT NOT NULL,
  `tipo` VARCHAR(64) NOT NULL,
  `codigo_turma` VARCHAR(64) DEFAULT NULL,
  `quantidade_aulas` INT NOT NULL DEFAULT 1,
  `dados_aulas` JSON NOT NULL,
  `departamento_id` VARCHAR(64) DEFAULT NULL,
  `unidade_id` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 19. TABELA: movimentacoes_turma
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimentacoes_turma` (
  `id` VARCHAR(64) NOT NULL,
  `curso_id` VARCHAR(64) DEFAULT NULL,
  `turma_id` VARCHAR(64) DEFAULT NULL,
  `codigo_turma` VARCHAR(64) DEFAULT NULL,
  `plano_aula_id` VARCHAR(64) DEFAULT NULL,
  `nome_plano_aula` VARCHAR(255) DEFAULT NULL,
  `numero_aula` INT NOT NULL DEFAULT 1,
  `nome_professor` VARCHAR(255) DEFAULT NULL,
  `caixa_armas_id` VARCHAR(64) DEFAULT NULL,
  `nome_caixa_armas` VARCHAR(255) DEFAULT NULL,
  `ids_armas` JSON DEFAULT NULL,
  `calibre_id` VARCHAR(64) DEFAULT NULL,
  `cofre_id` VARCHAR(64) DEFAULT NULL,
  `municao_fornecida` INT DEFAULT 0,
  `quantidade_alunos` INT DEFAULT 0,
  `tiros_por_aluno` INT DEFAULT 0,
  `tiros_instrutor` INT DEFAULT 0,
  `municao_usada` INT DEFAULT 0,
  `municao_devolvida` INT DEFAULT 0,
  `carregadores_extras` INT DEFAULT 0,
  `status` ENUM('Em Aula', 'Finalizada') NOT NULL DEFAULT 'Em Aula',
  `emitido_por_nome` VARCHAR(255) DEFAULT NULL,
  `devolvido_por_nome` VARCHAR(255) DEFAULT NULL,
  `materiais_devolvidos` TEXT DEFAULT NULL,
  `observacoes` TEXT DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_devolucao` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mov_turma_turma` (`turma_id`),
  KEY `idx_mov_turma_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 20. TABELA: aluno_turma
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `aluno_turma` (
  `id` VARCHAR(64) NOT NULL,
  `turma_id` VARCHAR(64) DEFAULT NULL,
  `turma_aluno` VARCHAR(64) NOT NULL,
  `modulo_aluno` VARCHAR(64) DEFAULT NULL,
  `professor_aluno` VARCHAR(255) DEFAULT NULL,
  `instrutor1_aluno` VARCHAR(255) DEFAULT NULL,
  `instrutor2_aluno` VARCHAR(255) DEFAULT NULL,
  `instrutor3_aluno` VARCHAR(255) DEFAULT NULL,
  `instrutor4_aluno` VARCHAR(255) DEFAULT NULL,
  `masp_aluno` VARCHAR(64) DEFAULT NULL,
  `nome_aluno` VARCHAR(255) NOT NULL,
  `situacao_aluno` VARCHAR(64) NOT NULL DEFAULT 'Ativo',
  `departamento_aluno` VARCHAR(255) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aluno_turma_id` (`turma_id`),
  KEY `idx_aluno_turma_code` (`turma_aluno`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 21. TABELA: aluno_aulas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `aluno_aulas` (
  `id` VARCHAR(64) NOT NULL,
  `aluno_id` VARCHAR(64) NOT NULL,
  `aula_nome_aluno` VARCHAR(255) NOT NULL,
  `aula_numero_aluno` INT NOT NULL DEFAULT 1,
  `aula_data_aluno` DATE DEFAULT NULL,
  `aula_hora_aluno` VARCHAR(32) DEFAULT NULL,
  `aula_conteudo_aluno` VARCHAR(500) DEFAULT NULL,
  `observacao_aluno` TEXT DEFAULT NULL,
  `nota_aluno` VARCHAR(32) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aluno_aulas_aluno` (`aluno_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 22. TABELA: calendario_aulas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `calendario_aulas` (
  `id` VARCHAR(64) NOT NULL,
  `data_calendario` DATE NOT NULL,
  `horario_calendario` VARCHAR(64) NOT NULL,
  `turma_calendario` VARCHAR(64) NOT NULL,
  `sigla_calendario` VARCHAR(64) NOT NULL,
  `disciplina_calendario` VARCHAR(255) DEFAULT NULL,
  `sala_calendario` VARCHAR(100) DEFAULT NULL,
  `curso_calendario` VARCHAR(255) DEFAULT NULL,
  `modulo_calendario` VARCHAR(100) DEFAULT NULL,
  `ano_calendario` VARCHAR(64) DEFAULT NULL,
  `numero_aula_calendario` VARCHAR(64) DEFAULT NULL,
  `equipe_calendario` VARCHAR(100) DEFAULT NULL,
  `observacao_calendario` TEXT DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cal_data` (`data_calendario`),
  KEY `idx_cal_turma` (`turma_calendario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 23. TABELA: equipe_calendario
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `equipe_calendario` (
  `id` VARCHAR(64) NOT NULL,
  `nome_da_equipe` VARCHAR(100) NOT NULL,
  `materia` VARCHAR(100) NOT NULL,
  `tipo_curso` VARCHAR(100) NOT NULL DEFAULT 'Curso de Formação',
  `nome_do_curso` VARCHAR(255) NOT NULL,
  `codigo_curso` VARCHAR(100) DEFAULT NULL,
  `dates_curso` TEXT DEFAULT NULL,
  `modulo` VARCHAR(100) NOT NULL,
  `ano` VARCHAR(10) DEFAULT NULL,
  `data` DATE DEFAULT NULL,
  `professor_titular_id` VARCHAR(64) DEFAULT NULL,
  `professor_titular_nome` VARCHAR(255) DEFAULT NULL,
  `sigla_professor` VARCHAR(64) DEFAULT NULL,
  `instrutor_id` VARCHAR(64) DEFAULT NULL,
  `instrutor_nome` VARCHAR(255) DEFAULT NULL,
  `sigla_instrutor` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 24. TABELA: professores_equipe
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `professores_equipe` (
  `id` VARCHAR(64) NOT NULL,
  `equipe_id` VARCHAR(64) NOT NULL,
  `nome_professor` VARCHAR(255) DEFAULT NULL,
  `sigla_professor` VARCHAR(64) DEFAULT NULL,
  `titular` VARCHAR(10) DEFAULT 'Não',
  `instrutor` VARCHAR(10) DEFAULT NULL,
  `tipo_funcao` VARCHAR(50) DEFAULT 'INSTRUTOR',
  `professor_titular_id` VARCHAR(64) DEFAULT NULL,
  `professor_titular_nome` VARCHAR(255) DEFAULT NULL,
  `instrutor_id` VARCHAR(64) DEFAULT NULL,
  `instrutor_nome` VARCHAR(255) DEFAULT NULL,
  `sigla_instrutor` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prof_eq_id` (`equipe_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 25. TABELA: auxiliar_tabela_equipe
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auxiliar_tabela_equipe` (
  `id` VARCHAR(64) NOT NULL,
  `equipe_id` VARCHAR(64) DEFAULT NULL,
  `nome_da_equipe` VARCHAR(100) NOT NULL,
  `turma_id` VARCHAR(64) DEFAULT NULL,
  `codigo_turma` VARCHAR(64) NOT NULL,
  `materia` VARCHAR(100) NOT NULL,
  `professor_titular_id` VARCHAR(64) DEFAULT NULL,
  `professor_titular_nome` VARCHAR(255) DEFAULT NULL,
  `sigla_professor` VARCHAR(64) DEFAULT NULL,
  `professores` JSON DEFAULT NULL,
  `data_inicio` DATE NOT NULL,
  `data_fim` DATE NOT NULL,
  `observacao` TEXT DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aux_eq_equipe` (`equipe_id`),
  KEY `idx_aux_eq_turma` (`codigo_turma`),
  KEY `idx_aux_eq_periodo` (`data_inicio`, `data_fim`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 26. TABELA: certificados
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `certificados` (
  `id` VARCHAR(64) NOT NULL,
  `codigo_autenticacao` VARCHAR(128) NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `nome_aluno` VARCHAR(255) NOT NULL,
  `cpf_masp` VARCHAR(64) DEFAULT NULL,
  `descricao` TEXT DEFAULT NULL,
  `nome_arquivo` VARCHAR(255) NOT NULL,
  `pdf_base64` LONGTEXT NOT NULL,
  `pdf_stamped_base64` LONGTEXT DEFAULT NULL,
  `tamanho_bytes` INT DEFAULT NULL,
  `tipo_mime` VARCHAR(64) DEFAULT 'application/pdf',
  `data_emissao` DATE DEFAULT NULL,
  `criado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
  `criado_por_nome` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('Valido', 'Revogado') NOT NULL DEFAULT 'Valido',
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_codigo_autenticacao` (`codigo_autenticacao`),
  KEY `idx_cert_nome_aluno` (`nome_aluno`),
  KEY `idx_cert_cpf_masp` (`cpf_masp`),
  KEY `idx_cert_data_emissao` (`data_emissao`),
  KEY `idx_cert_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 27. TABELA: transferencias_armas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transferencias_armas` (
  `id` VARCHAR(64) NOT NULL,
  `numero_protocolo` VARCHAR(64) DEFAULT NULL,
  `data_transferencia` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `origem_departamento_id` VARCHAR(64) DEFAULT NULL,
  `origem_departamento_nome` VARCHAR(255) DEFAULT NULL,
  `origem_unidade_id` VARCHAR(64) DEFAULT NULL,
  `origem_unidade_nome` VARCHAR(255) DEFAULT NULL,
  `destino_departamento_id` VARCHAR(64) DEFAULT NULL,
  `destino_departamento_nome` VARCHAR(255) DEFAULT NULL,
  `destino_unidade_id` VARCHAR(64) DEFAULT NULL,
  `destino_unidade_nome` VARCHAR(255) DEFAULT NULL,
  `destino_cofre_id` VARCHAR(64) DEFAULT NULL,
  `destino_cofre_codigo` VARCHAR(64) DEFAULT NULL,
  `responsavel_id` VARCHAR(64) NOT NULL,
  `responsavel_nome` VARCHAR(255) NOT NULL,
  `responsavel_masp` VARCHAR(32) NOT NULL,
  `responsavel_perfil` VARCHAR(64) NOT NULL,
  `transportador_nome` VARCHAR(255) NOT NULL,
  `transportador_masp` VARCHAR(32) NOT NULL,
  `transportador_cargo` VARCHAR(64) DEFAULT NULL,
  `motivo` TEXT NOT NULL,
  `armas_json` JSON NOT NULL,
  `total_armas` INT NOT NULL DEFAULT 1,
  `total_carregadores` INT NOT NULL DEFAULT 0,
  `observacao` TEXT DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trf_origem` (`origem_unidade_id`),
  KEY `idx_trf_destino` (`destino_unidade_id`),
  KEY `idx_trf_data` (`data_transferencia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- MIGRAÇÕES / ATUALIZAÇÃO SEGURA DE COLUNAS EXISTENTES (ALTER TABLE)
-- =============================================================================
-- Caso as tabelas já tenham sido criadas anteriormente em versões prévias,
-- os blocos a seguir garantem que campos novos e compatibilidade existam.

-- Ajustes na tabela turmas_curso
SET @col_first_class = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='turmas_curso' AND column_name='primeira_data_aula');
SET @sql_first = IF(@col_first_class = 0, 'ALTER TABLE `turmas_curso` ADD COLUMN `primeira_data_aula` VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_first; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_last_class = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='turmas_curso' AND column_name='ultima_data_aula');
SET @sql_last = IF(@col_last_class = 0, 'ALTER TABLE `turmas_curso` ADD COLUMN `ultima_data_aula` VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_last; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_turma_cal = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='turmas_curso' AND column_name='turma_calendario');
SET @sql_cal = IF(@col_turma_cal = 0, 'ALTER TABLE `turmas_curso` ADD COLUMN `turma_calendario` VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_cal; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================
-- VIEWS DE RETROCOMPATIBILIDADE (COMPATÍVEIS COM QUERIES LEGADAS EM INGLÊS)
-- =============================================================================

CREATE OR REPLACE VIEW `departments` AS 
SELECT id, nome AS name, codigo AS code, data_criacao AS created_at FROM `departamentos`;

CREATE OR REPLACE VIEW `units` AS 
SELECT id, departamento_id AS department_id, nome AS name, data_criacao AS created_at FROM `unidades`;

CREATE OR REPLACE VIEW `users` AS 
SELECT id, masp, senha AS password, nome AS name, telefone AS phone, cargo, perfil AS role, departamento_id AS department_id, unidade_id AS unit_id, pode_mover_municao AS can_move_ammo, pode_mover_armas AS can_move_weapons, tem_acesso_sistema AS has_system_access, eh_professor AS is_teacher, disciplina_professor AS teacher_subject, professor_sigla, deve_alterar_senha AS must_change_password, data_criacao AS created_at FROM `usuarios`;

CREATE OR REPLACE VIEW `calibers` AS 
SELECT id, nome AS name, data_criacao AS created_at FROM `calibres`;

CREATE OR REPLACE VIEW `available_weapon_types` AS 
SELECT id, nome AS name, modelos AS models, data_criacao AS created_at FROM `tipos_armas`;

CREATE OR REPLACE VIEW `vault_spaces` AS 
SELECT id, codigo AS code, tipo AS type, departamento_id AS department_id, unidade_id AS unit_id, data_criacao AS created_at FROM `cofres`;

CREATE OR REPLACE VIEW `weapons` AS 
SELECT id, tipo AS type, numero_serie AS serial_number, fabricante AS manufacturer, modelo AS model, calibre, quantidade_carregadores AS magazine_quantity, status, departamento_id AS department_id, unidade_id AS unit_id, cofre_id AS vault_space_id, observacao_localizacao AS location_note, data_ultima_manutencao AS last_maintenance_date, responsavel_ultima_manutencao AS last_maintenance_responsible, data_criacao AS created_at FROM `armas`;

CREATE OR REPLACE VIEW `weapon_transfers` AS 
SELECT id, numero_protocolo AS protocol_number, data_transferencia AS transfer_date, origem_departamento_id AS origin_department_id, origem_departamento_nome AS origin_department_name, origem_unidade_id AS origin_unit_id, origem_unidade_nome AS origin_unit_name, destino_departamento_id AS destination_department_id, destino_departamento_nome AS destination_department_name, destino_unidade_id AS destination_unit_id, destino_unidade_nome AS destination_unit_name, destino_cofre_id AS destination_vault_space_id, destino_cofre_codigo AS destination_vault_space_code, responsavel_id AS transferred_by_user_id, responsavel_nome AS transferred_by_user_name, responsavel_masp AS transferred_by_user_masp, responsavel_perfil AS transferred_by_user_role, transportador_nome AS receiver_or_transporter_name, transportador_masp AS receiver_or_transporter_masp, transportador_cargo AS receiver_or_transporter_cargo, motivo AS reason, armas_json AS weapons_json, total_armas AS total_weapons, total_carregadores AS total_magazines, observacao AS observation, data_criacao AS created_at FROM `transferencias_armas`;

CREATE OR REPLACE VIEW `ammo_stocks` AS 
SELECT id, calibre_id, quantidade AS quantity, departamento_id AS department_id, unidade_id AS unit_id, cofre_id AS vault_space_id, data_atualizacao AS updated_at FROM `estoque_municoes`;

CREATE OR REPLACE VIEW `courses` AS 
SELECT id, nome AS name, modelos_permitidos AS allowed_models, calibres_permitidos AS allowed_calibers, tipos_armas_permitidos AS allowed_weapon_types, tiros_por_aluno AS shots_per_student, tiros_por_tipo_arma AS shots_per_weapon_type, departamento_id AS department_id, data_criacao AS created_at FROM `cursos`;

CREATE OR REPLACE VIEW `user_courses` AS 
SELECT id, usuario_id AS user_id, curso_id, data_conclusao AS completion_date, data_validade AS expiration_date, data_criacao AS created_at FROM `usuario_cursos`;

CREATE OR REPLACE VIEW `audit_logs` AS 
SELECT id, modulo AS module, acao AS action, detalhes AS details, usuario_id AS user_id, nome_usuario AS user_name, masp_usuario AS user_masp, perfil_usuario AS user_role, endereco_ip AS ip_address, data_hora AS timestamp FROM `logs_auditoria`;

SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================
-- FIM DO SCRIPT DE ATUALIZAÇÃO DO BANCO DE DADOS
-- =============================================================================
