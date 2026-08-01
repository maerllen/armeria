-- ==============================================================================
-- SCRIPT DE ATUALIZAÇÃO DO BANCO DE DADOS SQL (MYSQL / MARIADB)
-- ACADEPOL - Módulos de Calendário, Equipes Auxiliares, Alunos e Aulas
-- ==============================================================================

-- 1. TABELA DE AUXILIAR TABELA EQUIPE (Vínculos de Turmas, Disciplinas e Equipes)
CREATE TABLE IF NOT EXISTS auxiliar_tabela_equipe (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  nome_da_equipe VARCHAR(255) NOT NULL,
  codigo_turma VARCHAR(255) NOT NULL,
  materia VARCHAR(255) NOT NULL,
  professor_titular_nome VARCHAR(255) NULL,
  sigla_professor VARCHAR(50) NULL,
  data_inicio DATE NULL,
  data_fim DATE NULL,
  observacao TEXT NULL,
  instrutores JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABELA DE ITENS AUXILIARES DE INSTRUTORES DA EQUIPE
CREATE TABLE IF NOT EXISTS auxiliar_tabela_equipe_itens (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  auxiliar_id VARCHAR(64) NOT NULL,
  nome_instrutor VARCHAR(255) NOT NULL,
  sigla_instrutor VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auxiliar_id (auxiliar_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABELA DE EQUIPES DO CALENDÁRIO
CREATE TABLE IF NOT EXISTS equipes_calendario (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  professores JSON NULL,
  instrutores JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABELA DE CALENDÁRIO DE AULAS
CREATE TABLE IF NOT EXISTS calendario_aulas (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  data_calendario DATE NOT NULL,
  horario_calendario VARCHAR(100) NOT NULL,
  turma_calendario VARCHAR(255) NOT NULL,
  sigla_calendario VARCHAR(50) NOT NULL,
  disciplina_calendario VARCHAR(255) NULL,
  sala_calendario VARCHAR(255) NULL,
  curso_calendario VARCHAR(255) NULL,
  modulo_calendario VARCHAR(255) NULL,
  ano_calendario VARCHAR(10) NULL,
  numero_aula_calendario VARCHAR(50) NULL,
  equipe_calendario VARCHAR(255) NULL,
  observacao_calendario TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_data_horario (data_calendario, horario_calendario),
  INDEX idx_turma (turma_calendario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. CAMPOS E TABELA DE ALUNOS DA TURMA
CREATE TABLE IF NOT EXISTS aluno_turma (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  turma_id VARCHAR(64) NULL,
  turma_aluno VARCHAR(255) NOT NULL,
  modulo_aluno VARCHAR(255) NULL,
  professor_aluno VARCHAR(255) NULL,
  instrutor1_aluno VARCHAR(255) NULL,
  instrutor2_aluno VARCHAR(255) NULL,
  instrutor3_aluno VARCHAR(255) NULL,
  instrutor4_aluno VARCHAR(255) NULL,
  masp_aluno VARCHAR(64) NULL,
  nome_aluno VARCHAR(255) NOT NULL,
  situacao_aluno VARCHAR(64) DEFAULT 'Ativo',
  departamento_aluno VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_turma_id (turma_id),
  INDEX idx_turma_aluno (turma_aluno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Garante que se a tabela aluno_turma já existir, contenha a coluna turma_id
SET @dbname = DATABASE();
SET @tablename = "aluno_turma";
SET @columnname = "turma_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE aluno_turma ADD COLUMN turma_id VARCHAR(64) NULL AFTER id, ADD INDEX idx_turma_id (turma_id);"
));
PREPARE add_turma_id FROM @preparedStatement;
EXECUTE add_turma_id;
DEALLOCATE PREPARE add_turma_id;

-- 6. TABELA DE AULAS E NOTAS DOS ALUNOS
CREATE TABLE IF NOT EXISTS aluno_aulas (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  aluno_id VARCHAR(64) NOT NULL,
  aula_nome_aluno VARCHAR(255) NOT NULL,
  aula_numero_aluno INT DEFAULT 1,
  aula_data_aluno DATE NULL,
  aula_hora_aluno VARCHAR(50) NULL,
  aula_conteudo_aluno VARCHAR(500) NULL,
  observacao_aluno TEXT NULL,
  nota_aluno VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aluno_id (aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- FIM DO SCRIPT DE ATUALIZAÇÃO
-- ==============================================================================
