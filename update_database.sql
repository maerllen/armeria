-- Script SQL de atualização do Banco de Dados MySQL / MariaDB
-- Pode ser executado diretamente no prompt SQL do servidor (ex: mysql -u root -p nome_do_banco < update_database.sql)

-- 1. Atualizações na tabela de Usuários (Policiais)
-- Adiciona a coluna de SIGLA do Professor aos usuários
SET @dbname = DATABASE();
SET @tablename = "users";
SET @columnname = "professor_sigla";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1;",
  CONCAT("ALTER TABLE `", @tablename, "` ADD COLUMN `", @columnname, "` VARCHAR(64) DEFAULT NULL;")
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Atualizações na tabela Equipe do Calendário (equipe_calendario)
ALTER TABLE `equipe_calendario` ADD COLUMN IF NOT EXISTS `codigo_curso` VARCHAR(100) DEFAULT NULL;
ALTER TABLE `equipe_calendario` ADD COLUMN IF NOT EXISTS `dates_curso` TEXT DEFAULT NULL;
ALTER TABLE `equipe_calendario` ADD COLUMN IF NOT EXISTS `modulo` VARCHAR(50) DEFAULT NULL;
ALTER TABLE `equipe_calendario` ADD COLUMN IF NOT EXISTS `ano` VARCHAR(10) DEFAULT NULL;
ALTER TABLE `equipe_calendario` ADD COLUMN IF NOT EXISTS `data` VARCHAR(20) DEFAULT NULL;

-- 3. Criação/Garantia da Tabela de Professores da Equipe (professores_equipe)
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
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prof_equipe_id` (`equipe_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Garantir que colunas existam caso a tabela já tenha sido criada anteriormente em versão legada
ALTER TABLE `professores_equipe` ADD COLUMN IF NOT EXISTS `nome_professor` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `professores_equipe` ADD COLUMN IF NOT EXISTS `sigla_professor` VARCHAR(64) DEFAULT NULL;
ALTER TABLE `professores_equipe` ADD COLUMN IF NOT EXISTS `titular` VARCHAR(10) DEFAULT 'Não';
ALTER TABLE `professores_equipe` ADD COLUMN IF NOT EXISTS `instrutor` VARCHAR(10) DEFAULT NULL;
ALTER TABLE `professores_equipe` ADD COLUMN IF NOT EXISTS `tipo_funcao` VARCHAR(50) DEFAULT 'INSTRUTOR';

SELECT 'Banco de dados atualizado com sucesso!' AS Resultado;
