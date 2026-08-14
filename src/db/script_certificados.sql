-- =============================================================================
-- SCRIPT DE BANCO DE DADOS MYSQL PARA O MÓDULO DE VERIFICAÇÃO E GESTÃO DE CERTIFICADOS (ACADEPOL)
-- =============================================================================
-- Tabela para armazenar certificados em PDF, metadados, código de autenticação,
-- carimbo de validação com QR Code e histórico para verificação pública.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `certificados` (
  `id` VARCHAR(64) NOT NULL COMMENT 'Identificador único do certificado (UUID ou Hash)',
  `codigo_autenticacao` VARCHAR(128) NOT NULL COMMENT 'Código alfanumérico único para consulta pública do certificado',
  `titulo` VARCHAR(255) NOT NULL COMMENT 'Título do Certificado ou Nome do Curso',
  `nome_aluno` VARCHAR(255) NOT NULL COMMENT 'Nome completo do aluno ou profissional certificado',
  `cpf_masp` VARCHAR(64) DEFAULT NULL COMMENT 'CPF ou MASP do aluno',
  `descricao` TEXT DEFAULT NULL COMMENT 'Descrição complementar ou ementa do certificado',
  `nome_arquivo` VARCHAR(255) NOT NULL COMMENT 'Nome do arquivo original enviado (ex: certificado_joao.pdf)',
  `pdf_base64` LONGTEXT NOT NULL COMMENT 'Arquivo PDF original completo codificado em Base64',
  `pdf_stamped_base64` LONGTEXT DEFAULT NULL COMMENT 'Arquivo PDF carimbado com o QR Code inserido, codificado em Base64',
  `tamanho_bytes` INT DEFAULT NULL COMMENT 'Tamanho do arquivo em bytes',
  `tipo_mime` VARCHAR(64) DEFAULT 'application/pdf' COMMENT 'Tipo MIME do documento',
  `data_emissao` DATE DEFAULT NULL COMMENT 'Data oficial de emissão do certificado',
  `criado_por_usuario_id` VARCHAR(64) DEFAULT NULL COMMENT 'ID do usuário que realizou a importação/emissão',
  `criado_por_nome` VARCHAR(255) DEFAULT NULL COMMENT 'Nome do usuário emissor',
  `status` ENUM('Valido', 'Revogado') NOT NULL DEFAULT 'Valido' COMMENT 'Status de autenticidade do documento',
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora do registro no sistema',
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_codigo_autenticacao` (`codigo_autenticacao`),
  KEY `idx_cert_nome_aluno` (`nome_aluno`),
  KEY `idx_cert_cpf_masp` (`cpf_masp`),
  KEY `idx_cert_data_emissao` (`data_emissao`),
  KEY `idx_cert_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View para compatibilidade em consultas simplificadas
CREATE OR REPLACE VIEW `view_certificados` AS
SELECT 
  id,
  codigo_autenticacao AS auth_code,
  titulo AS title,
  nome_aluno AS student_name,
  cpf_masp,
  descricao AS description,
  nome_arquivo AS file_name,
  tamanho_bytes AS file_size,
  tipo_mime AS mime_type,
  data_emissao AS issue_date,
  criado_por_usuario_id AS created_by_id,
  criado_por_nome AS created_by_name,
  status,
  data_criacao AS created_at,
  data_atualizacao AS updated_at
FROM `certificados`;
