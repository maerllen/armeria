-- ====================================================================
-- INSTRUÇÃO DE CRIAÇÃO E CONFIGURAÇÃO DO BANCO DE DADOS ARMERIADB
-- BANCO: armeriadb
-- SENHA: OtR2832120135++--
-- ====================================================================

-- 1. CRIAÇÃO DO BANCO DE DADOS E USUÁRIO (PostgreSQL)
CREATE DATABASE armeriadb WITH OWNER = postgres ENCODING = 'UTF8';

-- Criar usuário armeria_user com a senha fornecida
CREATE USER armeria_user WITH PASSWORD 'OtR2832120135++--';
GRANT ALL PRIVILEGES ON DATABASE armeriadb TO armeria_user;

\c armeriadb;

-- ====================================================================
-- SCHEMAS E TABELAS DO SISTEMA DE ARMARIA
-- ====================================================================

-- Tabela de Departamentos
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Unidades
CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(64) PRIMARY KEY,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Usuários (Policiais, Armeiros, Admins, Geral)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    masp VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    cargo VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('Policial', 'Armeiro', 'Administrador', 'Geral')),
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE SET NULL,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE SET NULL,
    can_move_ammo BOOLEAN DEFAULT FALSE,
    can_move_weapons BOOLEAN DEFAULT FALSE,
    has_system_access BOOLEAN DEFAULT TRUE,
    password VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Calibres
CREATE TABLE IF NOT EXISTS calibers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Cursos de Habilitação
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    allowed_models TEXT[] NOT NULL,
    allowed_calibers TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela N:M de Cursos do Policial
CREATE TABLE IF NOT EXISTS user_courses (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    course_id VARCHAR(64) REFERENCES courses(id) ON DELETE CASCADE,
    completion_date DATE NOT NULL,
    expiration_date DATE NOT NULL
);

-- Tabela de Locais no Cofre (Vault Spaces)
CREATE TABLE IF NOT EXISTS vault_spaces (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('ARMAS', 'MUNICOES')),
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Armas (Acervo)
CREATE TABLE IF NOT EXISTS weapons (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    serial_number VARCHAR(128) UNIQUE NOT NULL,
    manufacturer VARCHAR(128) NOT NULL,
    model VARCHAR(128) NOT NULL,
    caliber VARCHAR(128) NOT NULL,
    magazine_quantity INT DEFAULT 1,
    status VARCHAR(32) NOT NULL CHECK (status IN ('No Cofre', 'Em Trânsito', 'Manutenção')),
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE CASCADE,
    vault_space_id VARCHAR(64) REFERENCES vault_spaces(id) ON DELETE SET NULL,
    last_maintenance_date DATE,
    last_maintenance_responsible VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Estoque de Munições por Cofre
CREATE TABLE IF NOT EXISTS ammo_stocks (
    id VARCHAR(64) PRIMARY KEY,
    caliber_id VARCHAR(64) REFERENCES calibers(id) ON DELETE CASCADE,
    quantity INT DEFAULT 0 CHECK (quantity >= 0),
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE CASCADE,
    vault_space_id VARCHAR(64) REFERENCES vault_spaces(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Movimentações de Armas (Cautela/Aprovação/Devolução)
CREATE TABLE IF NOT EXISTS weapon_movements (
    id VARCHAR(64) PRIMARY KEY,
    weapon_id VARCHAR(64) REFERENCES weapons(id) ON DELETE CASCADE,
    weapon_serial_number VARCHAR(128) NOT NULL,
    weapon_model VARCHAR(128) NOT NULL,
    requester_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    requester_name VARCHAR(255) NOT NULL,
    requester_masp VARCHAR(32) NOT NULL,
    origin_vault_id VARCHAR(64) REFERENCES vault_spaces(id) ON DELETE SET NULL,
    ammunition_count INT DEFAULT 0,
    magazine_count INT DEFAULT 0,
    status VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    approved_by_user_name VARCHAR(255),
    returned_at TIMESTAMP WITH TIME ZONE,
    returned_to_vault_id VARCHAR(64) REFERENCES vault_spaces(id) ON DELETE SET NULL,
    received_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    received_by_user_name VARCHAR(255),
    has_divergence BOOLEAN DEFAULT FALSE,
    divergence_justification TEXT
);

-- Tabela de Movimentações de Munições (Entrada / Saída)
CREATE TABLE IF NOT EXISTS ammo_movements (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(32) NOT NULL CHECK (type IN ('Entrada', 'Saída')),
    caliber_id VARCHAR(64) REFERENCES calibers(id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE CASCADE,
    vault_space_id VARCHAR(64) REFERENCES vault_spaces(id) ON DELETE SET NULL,
    recipient_or_reason VARCHAR(255) NOT NULL,
    responsible_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    responsible_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    module VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    details TEXT NOT NULL,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    user_masp VARCHAR(32) NOT NULL,
    user_role VARCHAR(32) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Permissões na tabela para armeria_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO armeria_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO armeria_user;
