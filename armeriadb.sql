-- ====================================================================
-- SCRIPT COMPLETO E OTIMIZADO DE BANCO DE DADOS MYSQL (100% EM PORTUGUÊS)
-- SISTEMA: ARMERIA - Gestão de Armas, Munições e Cursos
-- BANCO DE DADOS: u552818109_Armeriadb
-- ====================================================================

CREATE DATABASE IF NOT EXISTS `u552818109_Armeriadb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `u552818109_Armeriadb`;

SET FOREIGN_KEY_CHECKS = 0;

-- ====================================================================
-- 1. ESTRUTURA DAS TABELAS REORGANIZADAS EM PORTUGUÊS
-- ====================================================================

-- 1.1 Departamentos
CREATE TABLE IF NOT EXISTS `departamentos` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `codigo` VARCHAR(64) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.2 Unidades
CREATE TABLE IF NOT EXISTS `unidades` (
    `id` VARCHAR(64) NOT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_unidades_dept` (`departamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.3 Usuários (Policiais, Armeiros, Admins, Geral, Professores)
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
    UNIQUE KEY `uk_usuarios_masp` (`masp`),
    KEY `idx_usuarios_dept` (`departamento_id`),
    KEY `idx_usuarios_unidade` (`unidade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.4 Calibres
CREATE TABLE IF NOT EXISTS `calibres` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(128) NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_calibres_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.5 Cursos de Habilitação Geral
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
    PRIMARY KEY (`id`),
    KEY `idx_cursos_dept` (`departamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.6 Tipos e Modelos de Armas
CREATE TABLE IF NOT EXISTS `tipos_armas` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `modelos` JSON NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.7 Cursos Concluídos pelos Usuários
CREATE TABLE IF NOT EXISTS `usuario_cursos` (
    `id` VARCHAR(64) NOT NULL,
    `usuario_id` VARCHAR(64) NOT NULL,
    `curso_id` VARCHAR(64) NOT NULL,
    `data_conclusao` DATE DEFAULT NULL,
    `data_validade` DATE DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_uc_usuario` (`usuario_id`),
    KEY `idx_uc_curso` (`curso_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.8 Cofres / Locais de Guarda
CREATE TABLE IF NOT EXISTS `cofres` (
    `id` VARCHAR(64) NOT NULL,
    `codigo` VARCHAR(64) NOT NULL,
    `tipo` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_cofres_dept` (`departamento_id`),
    KEY `idx_cofres_unidade` (`unidade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.9 Acervo de Armas
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
    KEY `idx_armas_dept` (`departamento_id`),
    KEY `idx_armas_unidade` (`unidade_id`),
    KEY `idx_armas_cofre` (`cofre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.10 Estoque de Munições por Cofre
CREATE TABLE IF NOT EXISTS `estoque_municoes` (
    `id` VARCHAR(64) NOT NULL,
    `calibre_id` VARCHAR(64) NOT NULL,
    `quantidade` INT NOT NULL DEFAULT 0,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `cofre_id` VARCHAR(64) DEFAULT NULL,
    `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_estoque_calibre` (`calibre_id`),
    KEY `idx_estoque_dept` (`departamento_id`),
    KEY `idx_estoque_unidade` (`unidade_id`),
    KEY `idx_estoque_cofre` (`cofre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.11 Movimentações de Armas (Cautela/Aprovação/Devolução)
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
    KEY `idx_ma_arma` (`arma_id`),
    KEY `idx_ma_requerente` (`requerente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.12 Movimentações de Munições
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
    KEY `idx_mm_calibre` (`calibre_id`),
    KEY `idx_mm_cofre` (`cofre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.13 Logs de Auditoria
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
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.14 Cursos da Academia de Polícia
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

-- 1.15 Caixas de Armas
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

-- 1.16 Substituições de Armas em Caixas
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
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.17 Turmas do Curso
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
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.18 Planos de Aula
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

-- 1.19 Movimentações da Turma / Aulas
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
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.20 Alunos por Turma
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

-- 1.21 Aulas do Aluno
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

-- 1.22 Calendário de Aulas
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
    KEY `idx_cal_sigla` (`sigla_calendario`),
    KEY `idx_cal_turma` (`turma_calendario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.23 Equipes do Calendário
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

-- 1.24 Professores da Equipe
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

-- ====================================================================
-- 2. MIGRAÇÃO AUTOMÁTICA DE DADOS SE EXISTIREM TABELAS LEGADAS
-- ====================================================================
DROP PROCEDURE IF EXISTS `migrar_dados_legados_proc`;
DELIMITER //
CREATE PROCEDURE `migrar_dados_legados_proc`()
BEGIN
    -- Copia departamentos antigos se existirem
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='departments') THEN
        INSERT IGNORE INTO `departamentos` (`id`, `nome`, `codigo`, `data_criacao`)
        SELECT `id`, `name`, `code`, `created_at` FROM `departments`;
    END IF;

    -- Copia unidades antigas
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='units') THEN
        INSERT IGNORE INTO `unidades` (`id`, `departamento_id`, `nome`, `data_criacao`)
        SELECT `id`, `department_id`, `name`, `created_at` FROM `units`;
    END IF;

    -- Copia usuários antigos
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users') THEN
        INSERT IGNORE INTO `usuarios` (`id`, `masp`, `senha`, `nome`, `telefone`, `cargo`, `perfil`, `departamento_id`, `unidade_id`, `pode_mover_municao`, `pode_mover_armas`, `tem_acesso_sistema`, `eh_professor`, `disciplina_professor`, `professor_sigla`, `deve_alterar_senha`, `data_criacao`)
        SELECT `id`, `masp`, `password`, `name`, `phone`, `cargo`, `role`, `department_id`, `unit_id`, `can_move_ammo`, `can_move_weapons`, `has_system_access`, IFNULL(`is_teacher`, 0), `teacher_subject`, `professor_sigla`, `must_change_password`, `created_at` FROM `users`;
    END IF;

    -- Copia calibres
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calibers') THEN
        INSERT IGNORE INTO `calibres` (`id`, `nome`, `data_criacao`)
        SELECT `id`, `name`, `created_at` FROM `calibers`;
    END IF;

    -- Copia cursos
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses') THEN
        INSERT IGNORE INTO `cursos` (`id`, `nome`, `modelos_permitidos`, `calibres_permitidos`, `tipos_armas_permitidos`, `tiros_por_aluno`, `tiros_por_tipo_arma`, `departamento_id`, `data_criacao`)
        SELECT `id`, `name`, `allowed_models`, `allowed_calibers`, `allowed_weapon_types`, IFNULL(`shots_per_student`, 0), `shots_per_weapon_type`, `department_id`, `created_at` FROM `courses`;
    END IF;

    -- Copia tipos de armas
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='available_weapon_types') THEN
        INSERT IGNORE INTO `tipos_armas` (`id`, `nome`, `modelos`, `data_criacao`)
        SELECT `id`, `name`, `models`, `created_at` FROM `available_weapon_types`;
    END IF;

    -- Copia usuario_cursos
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_courses') THEN
        INSERT IGNORE INTO `usuario_cursos` (`id`, `usuario_id`, `curso_id`, `data_conclusao`, `data_validade`, `data_criacao`)
        SELECT `id`, `user_id`, `course_id`, `completion_date`, `expiration_date`, `created_at` FROM `user_courses`;
    END IF;

    -- Copia cofres
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vault_spaces') THEN
        INSERT IGNORE INTO `cofres` (`id`, `codigo`, `tipo`, `departamento_id`, `unidade_id`, `data_criacao`)
        SELECT `id`, `code`, `type`, `department_id`, `unit_id`, `created_at` FROM `vault_spaces`;
    END IF;

    -- Copia armas
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='weapons') THEN
        INSERT IGNORE INTO `armas` (`id`, `tipo`, `numero_serie`, `fabricante`, `modelo`, `calibre`, `quantidade_carregadores`, `status`, `departamento_id`, `unidade_id`, `cofre_id`, `observacao_localizacao`, `data_ultima_manutencao`, `responsavel_ultima_manutencao`, `data_criacao`)
        SELECT `id`, `type`, `serial_number`, `manufacturer`, `model`, `caliber`, `magazine_quantity`, `status`, `department_id`, `unit_id`, `vault_space_id`, `location_note`, `last_maintenance_date`, `last_maintenance_responsible`, `created_at` FROM `weapons`;
    END IF;

    -- Copia estoque de munições
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_stocks') THEN
        INSERT IGNORE INTO `estoque_municoes` (`id`, `calibre_id`, `quantidade`, `departamento_id`, `unidade_id`, `cofre_id`, `data_atualizacao`)
        SELECT `id`, `caliber_id`, `quantity`, `department_id`, `unit_id`, `vault_space_id`, `updated_at` FROM `ammo_stocks`;
    END IF;

    -- Copia movimentacoes de armas
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='weapon_movements') THEN
        INSERT IGNORE INTO `movimentacoes_armas` (`id`, `arma_id`, `numero_serie_arma`, `modelo_arma`, `tipo_arma`, `calibre`, `departamento_id`, `unidade_id`, `requerente_id`, `nome_requerente`, `masp_requerente`, `cofre_retirada_id`, `cofre_devolucao_id`, `quantidade_municao`, `quantidade_carregadores`, `quantidade_municao_devolucao`, `quantidade_carregadores_devolucao`, `status`, `aprovado_por_usuario_id`, `aprovado_por_nome`, `data_aprovacao`, `recibo_confirmado_por_usuario_id`, `recibo_confirmado_por_nome`, `data_recibo`, `possui_divergencia`, `justificativa_divergencia`, `data_criacao`, `data_atualizacao`)
        SELECT `id`, `weapon_id`, `weapon_serial_number`, `weapon_model`, `weapon_type`, `caliber`, `department_id`, `unit_id`, `requester_id`, `requester_name`, `requester_masp`, `withdrawal_vault_space_id`, `return_vault_space_id`, `ammunition_count`, `magazine_count`, `returning_ammunition_count`, `returning_magazine_count`, `status`, `approved_by_user_id`, `approved_by_user_name`, `approval_date`, `receipt_confirmed_by_user_id`, `receipt_confirmed_by_user_name`, `receipt_date`, `has_divergence`, `divergence_justification`, `created_at`, `updated_at` FROM `weapon_movements`;
    END IF;

    -- Copia movimentacoes de municoes
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements') THEN
        INSERT IGNORE INTO `movimentacoes_municoes` (`id`, `tipo`, `calibre_id`, `quantidade`, `departamento_id`, `unidade_id`, `cofre_id`, `destinatario_ou_motivo`, `tipo_responsavel`, `responsavel_usuario_id`, `responsavel_nome`, `responsavel_masp`, `observacao`, `quantidade_devolvida`, `data_devolucao`, `devolvido_por_nome`, `usuario_id`, `nome_usuario`, `data_criacao`)
        SELECT `id`, `type`, `caliber_id`, `quantity`, `department_id`, `unit_id`, `vault_space_id`, `recipient_or_reason`, `responsible_type`, `responsible_user_id`, `responsible_name`, `responsible_masp`, `observation`, `returned_quantity`, `returned_at`, `returned_by_user_name`, `user_id`, `user_name`, `created_at` FROM `ammo_movements`;
    END IF;

    -- Copia logs de auditoria
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs') THEN
        INSERT IGNORE INTO `logs_auditoria` (`id`, `modulo`, `acao`, `detalhes`, `usuario_id`, `nome_usuario`, `masp_usuario`, `perfil_usuario`, `endereco_ip`, `data_hora`)
        SELECT `id`, `module`, `action`, `details`, `user_id`, `user_name`, `user_masp`, `user_role`, `ip_address`, `timestamp` FROM `audit_logs`;
    END IF;
END //
DELIMITER ;

CALL `migrar_dados_legados_proc`();
DROP PROCEDURE IF EXISTS `migrar_dados_legados_proc`;

-- ====================================================================
-- 3. DADOS INICIAIS (SEED DATA EM PORTUGUÊS)
-- ====================================================================

-- Departamentos Padrão
INSERT INTO `departamentos` (`id`, `nome`, `codigo`) VALUES
('dept-acad', 'ACADEMIA DE POLICIA', 'ACADEPOL'),
('dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'DOE-COE'),
('dept-dhpp', 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)', 'DHPP'),
('dept-dic', 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)', 'DIC')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`), `codigo` = VALUES(`codigo`);

-- Unidades Padrão
INSERT INTO `unidades` (`id`, `departamento_id`, `nome`) VALUES
('unit-acad-meaf', 'dept-acad', 'MEAF - Módulo de Ensino de Armamento e Tiro'),
('unit-coe-insp', 'dept-coe', 'INSPETORIA COE'),
('unit-coe-grt', 'dept-coe', 'GRUPO DE RESGATE TÁTICO (GRT)'),
('unit-dhpp-1', 'dept-dhpp', '1ª DELEGACIA DE HOMICÍDIOS'),
('unit-dic-cargas', 'dept-dic', 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Tipos e Modelos de Armas
INSERT INTO `tipos_armas` (`id`, `nome`, `modelos`) VALUES
('wt-pistola', 'Pistola', '["PT100", "PT24/7", "TS9", "Glock G22", "Glock G17", "Glock G19", "PT840", "PT92", "M&P9", "APX"]'),
('wt-fuzil', 'Fuzil', '["T4", "IA2", "MD97", "FAL 7.62", "M4A1", "AR-15", "HK416"]'),
('wt-submet', 'Submetralhadora', '["SMT40", "MT12", "MP5", "UMP40", "SAF 9mm"]'),
('wt-espingarda', 'Espingarda', '["Calibre 12 CBC 586", "Calibre 12 Benelli M4", "Calibre 12 Mossberg 500", "Calibre 12 Boito"]'),
('wt-revolver', 'Revólver', '["RT 889", "RT 85", "RT 82", "RT 357"]'),
('wt-carabina', 'Carabina', '["CT40", "CT9", "CCT9"]')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`), `modelos` = VALUES(`modelos`);

-- Calibres Padrão
INSERT INTO `calibres` (`id`, `nome`) VALUES
('cal-556', '5,56x45mm'),
('cal-40', '.40 S&W'),
('cal-9mm', '9x19mm'),
('cal-380', '.380 ACP'),
('cal-12ga', '12 GA')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Cursos Padrão
INSERT INTO `cursos` (`id`, `nome`, `modelos_permitidos`, `calibres_permitidos`, `departamento_id`) VALUES
('course-fuzil', 'Operador de fuzil', '["T4", "IA2", "M4A1"]', '["5,56x45mm"]', 'dept-coe'),
('course-pistola', 'Operador de Pistola', '["PT92", "Glock G22", "TH40", "PT840"]', '[".40 S&W", "9x19mm"]', 'dept-coe'),
('course-12', 'Operador de Espingarda C12', '["CBC 586-P", "Benelli M4"]', '["12 GA"]', 'dept-coe')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Cofres Padrão
INSERT INTO `cofres` (`id`, `codigo`, `tipo`, `departamento_id`, `unidade_id`) VALUES
('vault-acad-1', 'COFRE-MEAF-01', 'ARMAS', 'dept-acad', 'unit-acad-meaf'),
('vault-acad-2', 'COFRE-MEAF-02', 'MUNIÇÕES', 'dept-acad', 'unit-acad-meaf'),
('vault-coe-1', 'A1-G1', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-2', 'A1-G2', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-3', 'C1-L1', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-coe-4', 'C1-L2', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-dhpp-1', 'B1-G1', 'ARMAS', 'dept-dhpp', 'unit-dhpp-1'),
('vault-dhpp-2', 'M1-L1', 'MUNIÇÕES', 'dept-dhpp', 'unit-dhpp-1')
ON DUPLICATE KEY UPDATE `codigo` = VALUES(`codigo`);

-- Usuários Iniciais de Acesso
INSERT INTO `usuarios` (`id`, `masp`, `senha`, `nome`, `telefone`, `cargo`, `perfil`, `departamento_id`, `unidade_id`, `pode_mover_municao`, `pode_mover_armas`, `tem_acesso_sistema`, `eh_professor`, `disciplina_professor`, `deve_alterar_senha`) VALUES
('usr-master-geral', '1255748', '1255748', 'Administrador Geral Master', '31999998888', 'Delegado', 'Geral', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, 1),
('usr-admin-coe', '2222222', '2222222', 'Dr. Roberto Silva (Admin DOE)', '31988887777', 'Delegado', 'Administrador', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, 0),
('usr-armeiro-coe', '3333333', '3333333', 'Agente Carlos Andrade (Armeiro COE)', '31977776666', 'Investigador', 'Armeiro', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, 0),
('usr-prof-meaf-1', '6666666', '6666666', 'Prof. Marcus Vinícius (Instrutor MEAF)', '31944443333', 'Investigador', 'Policial', 'dept-acad', 'unit-acad-meaf', 1, 1, 1, 1, 'MEAF', 0),
('usr-policial-coe', '4444444', '4444444', 'Policial Eduardo Costa', '31966665555', 'Investigador', 'Policial', 'dept-coe', 'unit-coe-insp', 0, 0, 1, 0, NULL, 0),
('usr-policial-dhpp', '5555555', '5555555', 'Escrivã Ana Lima', '31955554444', 'Escrivão', 'Policial', 'dept-dhpp', 'unit-dhpp-1', 0, 0, 1, 0, NULL, 0)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Cursos do Usuário
INSERT INTO `usuario_cursos` (`id`, `usuario_id`, `curso_id`, `data_conclusao`, `data_validade`) VALUES
('uc-1', 'usr-master-geral', 'course-fuzil', '2025-10-15', '2027-10-15'),
('uc-2', 'usr-master-geral', 'course-pistola', '2025-11-20', '2027-11-20'),
('uc-3', 'usr-admin-coe', 'course-fuzil', '2025-05-10', '2027-05-10'),
('uc-4', 'usr-admin-coe', 'course-pistola', '2025-06-01', '2027-06-01'),
('uc-5', 'usr-armeiro-coe', 'course-fuzil', '2025-01-15', '2027-01-15'),
('uc-6', 'usr-armeiro-coe', 'course-pistola', '2025-02-10', '2027-02-10'),
('uc-7', 'usr-armeiro-coe', 'course-12', '2025-03-01', '2027-03-01'),
('uc-8', 'usr-policial-coe', 'course-fuzil', '2025-08-12', '2027-08-12'),
('uc-9', 'usr-policial-coe', 'course-pistola', '2023-01-10', '2025-01-10'),
('uc-10', 'usr-policial-dhpp', 'course-pistola', '2025-04-10', '2027-04-10')
ON DUPLICATE KEY UPDATE `curso_id` = VALUES(`curso_id`);

-- Armas Iniciais
INSERT INTO `armas` (`id`, `tipo`, `numero_serie`, `fabricante`, `modelo`, `calibre`, `quantidade_carregadores`, `status`, `departamento_id`, `unidade_id`, `cofre_id`, `data_ultima_manutencao`, `responsavel_ultima_manutencao`) VALUES
('weap-1', 'Fuzil', 'EKG-5486', 'Taurus', 'T4', '5,56x45mm', 4, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-1', '2026-05-10', 'Agente Carlos Andrade'),
('weap-2', 'Pistola', 'PT-998822', 'Taurus', 'PT92', '.40 S&W', 3, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-2', '2026-06-15', 'Agente Carlos Andrade'),
('weap-3', 'Espingarda', 'CBC-12009', 'CBC', 'CBC 586-P', '12 GA', 1, 'No Cofre', 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-1', '2026-04-01', 'Armeiro DHPP')
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

-- Estoque Inicial de Munições
INSERT INTO `estoque_municoes` (`id`, `calibre_id`, `quantidade`, `departamento_id`, `unidade_id`, `cofre_id`) VALUES
('stock-1', 'cal-556', 2500, 'dept-coe', 'unit-coe-insp', 'vault-coe-3'),
('stock-2', 'cal-40', 1200, 'dept-coe', 'unit-coe-insp', 'vault-coe-4'),
('stock-3', 'cal-9mm', 800, 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-2'),
('stock-acad-40', 'cal-40', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2'),
('stock-acad-9mm', 'cal-9mm', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2')
ON DUPLICATE KEY UPDATE `quantidade` = VALUES(`quantidade`);

-- Log de Auditoria Inicial
INSERT INTO `logs_auditoria` (`id`, `data_hora`, `usuario_id`, `nome_usuario`, `masp_usuario`, `perfil_usuario`, `modulo`, `acao`, `detalhes`, `endereco_ip`) VALUES
('log-1', NOW(), 'usr-master-geral', 'Administrador Geral Master', '1255748', 'Geral', 'Sistema', 'Remodelagem do Banco', 'Modelagem e tradução completa do banco de dados para o Português', '127.0.0.1')
ON DUPLICATE KEY UPDATE `detalhes` = VALUES(`detalhes`);

SET FOREIGN_KEY_CHECKS = 1;

-- SCRIPT EXECUTADO COM SUCESSO! ESTRUTURA E DADOS ORGANIZADOS EM PORTUGUÊS.
