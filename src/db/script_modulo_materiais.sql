-- =================================================================================
-- SCRIPT SQL: MÓDULO DE MATERIAIS, TIPOS DE MATERIAIS E CAUTELAS (USO/ANOMALIAS/CONSUMO)
-- SISTEMA DE GESTÃO DE ARMERIA E PATRIMÔNIO BÉLICO - POLÍCIA CIVIL DE MINAS GERAIS
-- =================================================================================

-- 1. TABELA DE TIPOS DE MATERIAIS (CATEGORIAS/TIPOS CONFIGURÁVEIS)
CREATE TABLE IF NOT EXISTS `tipos_materiais` (
  `id` VARCHAR(64) NOT NULL,
  `nome` VARCHAR(128) NOT NULL,
  `descricao` TEXT DEFAULT NULL,
  `categoria` VARCHAR(100) DEFAULT 'Geral',
  `eh_consumivel` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 se for material de uso único/descartável/que se perde (ex: gás, granada, lacre, APH)',
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tipos_materiais_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABELA DE MATERIAIS (ESTOQUE E CONTROLE POR DEPARTAMENTO E UNIDADE)
CREATE TABLE IF NOT EXISTS `materiais` (
  `id` VARCHAR(64) NOT NULL,
  `tipo_material_id` VARCHAR(64) NOT NULL,
  `tipo_material_nome` VARCHAR(128) NOT NULL,
  `nome` VARCHAR(255) NOT NULL,
  `quantidade` INT NOT NULL DEFAULT 1 COMMENT 'Quantidade total cadastrada no patrimônio',
  `quantidade_disponivel` INT NOT NULL DEFAULT 1 COMMENT 'Quantidade disponível no almoxarifado/guarda',
  `quantidade_em_uso` INT NOT NULL DEFAULT 0 COMMENT 'Quantidade atualmente acautelada/emprestada',
  `quantidade_consumida` INT NOT NULL DEFAULT 0 COMMENT 'Quantidade utilizada em operação que não retornará mais',
  `departamento_id` VARCHAR(64) NOT NULL,
  `departamento_nome` VARCHAR(255) DEFAULT NULL,
  `unidade_id` VARCHAR(64) NOT NULL,
  `unidade_nome` VARCHAR(255) DEFAULT NULL,
  `validade` DATE DEFAULT NULL COMMENT 'Data de validade (ex: coletes, químicos, sprays, filtros)',
  `local_guarda` VARCHAR(255) NOT NULL COMMENT 'Local físico de guarda (ex: Armário 02, Gaveta 3, Prateleira B, Sala de Armas)',
  `numero_serie` VARCHAR(128) DEFAULT NULL COMMENT 'Número de patrimônio, tombamento ou série (se houver)',
  `observacoes` TEXT DEFAULT NULL,
  `criado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
  `criado_por_nome` VARCHAR(255) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_materiais_tipo` (`tipo_material_id`),
  KEY `idx_materiais_dept` (`departamento_id`),
  KEY `idx_materiais_unidade` (`unidade_id`),
  KEY `idx_materiais_validade` (`validade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABELA DE CAUTELAS E MOVIMENTAÇÕES DE MATERIAIS (EMPRÉSTIMOS / RETIRADAS / DEVOLUÇÕES / USO / ANOMALIAS)
CREATE TABLE IF NOT EXISTS `cautelas_materiais` (
  `id` VARCHAR(64) NOT NULL,
  `protocolo` VARCHAR(64) DEFAULT NULL COMMENT 'Número sequencial do termo de cautela/recibo',
  `material_id` VARCHAR(64) NOT NULL,
  `material_nome` VARCHAR(255) NOT NULL,
  `tipo_material_nome` VARCHAR(128) DEFAULT NULL,
  `quantidade` INT NOT NULL DEFAULT 1,
  `tipo_destinatario` ENUM('interno', 'externo') NOT NULL DEFAULT 'interno',
  
  -- Destinatário Interno (Policial cadastrado no sistema)
  `usuario_interno_id` VARCHAR(64) DEFAULT NULL,
  `usuario_interno_nome` VARCHAR(255) DEFAULT NULL,
  `usuario_interno_masp` VARCHAR(32) DEFAULT NULL,
  `usuario_interno_cargo` VARCHAR(64) DEFAULT NULL,
  
  -- Destinatário Externo (Outras corporações, peritos, militares, convênios)
  `usuario_externo_nome` VARCHAR(255) DEFAULT NULL,
  `usuario_externo_documento` VARCHAR(64) DEFAULT NULL COMMENT 'CPF, RG ou Matrícula funcional externa',
  `usuario_externo_orgao` VARCHAR(255) DEFAULT NULL COMMENT 'Órgão de lotação externa (ex: PMMG, PCERJ, PF, PRF, SEJUSP, etc.)',
  `usuario_externo_telefone` VARCHAR(32) DEFAULT NULL,
  
  -- Datas e Prazos
  `data_retirada` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_prevista_devolucao` DATE DEFAULT NULL,
  `data_devolucao` DATETIME DEFAULT NULL,
  `finalidade` TEXT NOT NULL COMMENT 'Operação, plantão, curso, missão específica ou ordem de serviço',
  `status` ENUM('Em Uso', 'Devolvido', 'Consumido', 'Devolvido com Anomalia') NOT NULL DEFAULT 'Em Uso',
  
  -- Comunicação de Uso e Anomalias
  `foi_consumido` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 se o material foi consumido/esgotado e não retornará mais ao estoque',
  `relato_uso_anomalias` TEXT DEFAULT NULL COMMENT 'Relato de emprego operacional, avarias, perda, defeito, disparo ou anomalia constatada',
  
  -- Responsáveis pela Cautela e pelo Recebimento
  `responsavel_entrega_id` VARCHAR(64) NOT NULL,
  `responsavel_entrega_nome` VARCHAR(255) NOT NULL,
  `responsavel_entrega_masp` VARCHAR(32) DEFAULT NULL,
  
  `responsavel_recebimento_id` VARCHAR(64) DEFAULT NULL,
  `responsavel_recebimento_nome` VARCHAR(255) DEFAULT NULL,
  `responsavel_recebimento_masp` VARCHAR(32) DEFAULT NULL,
  
  -- Unidade da Cautela
  `departamento_id` VARCHAR(64) NOT NULL,
  `unidade_id` VARCHAR(64) NOT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cautelas_material` (`material_id`),
  KEY `idx_cautelas_status` (`status`),
  KEY `idx_cautelas_usr_int` (`usuario_interno_id`),
  KEY `idx_cautelas_data_ret` (`data_retirada`),
  KEY `idx_cautelas_dept` (`departamento_id`),
  KEY `idx_cautelas_unidade` (`unidade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. INSERÇÃO DE TIPOS BÁSICOS DE MATERIAIS POLICIAIS (SEED)
INSERT IGNORE INTO `tipos_materiais` (`id`, `nome`, `descricao`, `categoria`, `eh_consumivel`) VALUES
('tipo-mat-colete', 'Colete Balístico', 'Colete de proteção balística individual (Nível II, III-A, etc.)', 'Proteção Balística', 0),
('tipo-mat-algema', 'Algemas', 'Par de algemas de corrente ou dobradiça em aço inox com chave', 'Contenção', 0),
('tipo-mat-espargidor', 'Espargidor / Spray de Pimenta', 'Agente químico lacrimogêneo/OC em aerosol para controle de distúrbios e defesa', 'Menos Letal', 1),
('tipo-mat-granada', 'Granada de Efeito Moral / Gás', 'Granadas não letais de luz e som, fumaça ou gás lacrimogêneo', 'Menos Letal', 1),
('tipo-mat-lanterna', 'Lanterna Tática', 'Lanterna tática de alta intensidade recarregável para operações noturnas e CQB', 'Iluminação', 0),
('tipo-mat-escudo', 'Escudo Balístico', 'Escudo de proteção balística com visor blindado', 'Proteção Balística', 0),
('tipo-mat-radio', 'Rádio Comunicador HT', 'Rádio transceptor portátil digital/analógico VHF/UHF com bateria e carregador', 'Comunicação', 0),
('tipo-mat-bastao', 'Bastão Retrátil / Tonfa', 'Bastão tático retrátil em aço ou tonfa de polímero para contenção', 'Contenção', 0),
('tipo-mat-taser', 'Dispositivo Eletrochoque / Spark / Taser', 'Arma de eletrochoque por emissão de pulsos elétricos com cartuchos', 'Menos Letal', 0),
('tipo-mat-drone', 'Aeronave Remotamente Pilotada (Drone)', 'Drone multirotor tático para vigilância, inteligência e reconhecimento aéreo', 'Tecnologia e Monitoramento', 0),
('tipo-mat-capacete', 'Capacete Balístico / Choque', 'Capacete balístico de alta resistência com trilhos e suporte para visão noturna/viseira', 'Proteção Balística', 0),
('tipo-mat-aph', 'Kit de APH Tático / Torniquete', 'Kit de Primeiros Socorros em Combate (Torniquete, bandagem hemostática, selo de tórax)', 'Saúde Operacional', 1),
('tipo-mat-mascara', 'Máscara de Proteção Respiratória', 'Máscara panorâmica facial com filtro contra gases e agentes químicos', 'Proteção Respiratória', 0);

-- 5. INSERÇÃO DE MATERIAIS DE EXEMPLO
INSERT IGNORE INTO `materiais` 
(`id`, `tipo_material_id`, `tipo_material_nome`, `nome`, `quantidade`, `quantidade_disponivel`, `quantidade_em_uso`, `quantidade_consumida`, `departamento_id`, `departamento_nome`, `unidade_id`, `unidade_nome`, `validade`, `local_guarda`, `numero_serie`, `observacoes`, `criado_por_nome`) 
VALUES
('mat-01', 'tipo-mat-colete', 'Colete Balístico', 'Colete Balístico Nível III-A CBC Tam G', 15, 12, 3, 0, 'dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'unit-coe-insp', 'INSPETORIA COE', '2028-12-31', 'Armário de Proteção Balística A-01', 'PAT-COE-7890', 'Capas pretas táticas com sistema MOLLE', 'Administrador Geral Master'),
('mat-02', 'tipo-mat-algema', 'Algemas', 'Par de Algemas de Corrente Inox Invictus', 20, 16, 4, 0, 'dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'unit-coe-insp', 'INSPETORIA COE', NULL, 'Gaveta de Contenção 03', 'SERIE-ALG-044', 'Acompanha 02 chaves por par', 'Administrador Geral Master'),
('mat-03', 'tipo-mat-espargidor', 'Espargidor / Spray de Pimenta', 'Espargidor de Pimenta GL-108 Max Condor 50g', 30, 24, 4, 2, 'dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'unit-coe-insp', 'INSPETORIA COE', '2027-06-30', 'Prateleira de Não Letais B-02', 'LOTE-2024-C9', 'Material de uso único; relatar acionamento e ocorrência', 'Administrador Geral Master'),
('mat-04', 'tipo-mat-radio', 'Rádio Comunicador HT', 'Rádio HT Motorola APX2000 Digital VHF', 10, 8, 2, 0, 'dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'unit-coe-insp', 'INSPETORIA COE', NULL, 'Bancada de Carregadores R-01', 'HT-MOT-102', 'Inclui base carregadora e fone de lapela acústico', 'Administrador Geral Master'),
('mat-05', 'tipo-mat-drone', 'Aeronave Remotamente Pilotada (Drone)', 'Drone DJI Matrice 30T com Câmera Térmica e Zoom', 2, 1, 1, 0, 'dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'unit-coe-grt', 'GRUPO DE RESGATE TÁTICO (GRT)', '2030-01-01', 'Maleta Rígida Tática Case 01', 'DJI-M30T-BR09', 'Acompanha 6 baterias inteligentes e estação de recarga rápida', 'Administrador Geral Master'),
('mat-06', 'tipo-mat-colete', 'Colete Balístico', 'Colete Balístico Nível III-A Feminino Tam M', 10, 10, 0, 0, 'dept-acad', 'ACADEMIA DE POLICIA', 'unit-acad-meaf', 'MEAF - Módulo de Ensino de Armamento e Tiro', '2029-05-15', 'Sala MEAF Armário 04', 'PAT-ACAD-4512', 'Para instrução de armamento e tiro na Acadepol', 'Administrador Geral Master');
