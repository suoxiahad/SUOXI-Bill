-- SUO XI Hospital MySQL Database Schema
-- Run this SQL script in MySQL database on your VPS to create the required tables.

CREATE DATABASE IF NOT EXISTS suoxi_hospital_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE suoxi_hospital_db;

-- 1. Users Table for Authentication & Role-Based Access Control
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('System Admin', 'Doctor', 'Call Center') NOT NULL,
    phone VARCHAR(20),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default users (Passwords hashed or default for initial setup)
-- admin / admin123, doctor / doctor123, callcenter / cc123
INSERT INTO users (id, username, password_hash, name, role) VALUES
('usr-admin', 'admin', '$2a$10$wS3fLhM0O4E5s/L.YwUu..2i2P8nO0M0000000000000000000000', 'Hospital Admin', 'System Admin'),
('usr-doctor', 'doctor', '$2a$10$wS3fLhM0O4E5s/L.YwUu..2i2P8nO0M0000000000000000000000', 'Prof. Dr. SM Shahidullah', 'Doctor'),
('usr-callcenter', 'callcenter', '$2a$10$wS3fLhM0O4E5s/L.YwUu..2i2P8nO0M0000000000000000000000', 'Call Center Desk', 'Call Center')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 2. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    age VARCHAR(20),
    gender VARCHAR(20),
    address TEXT,
    doctor_name VARCHAR(150),
    appointment_date DATE,
    appointment_time VARCHAR(30),
    department VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending Counseling',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_phone (phone),
    INDEX idx_date (appointment_date)
);

-- 3. Catalog / Pricing Table
CREATE TABLE IF NOT EXISTS catalog (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    defaultPrice DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    defaultDiscountPercent DECIMAL(5,2) DEFAULT 0.00,
    fixedDiscountAmount DECIMAL(10,2) DEFAULT NULL,
    outdoorDiscountPercent DECIMAL(5,2) DEFAULT NULL,
    outdoorDiscountAmount DECIMAL(10,2) DEFAULT NULL,
    description TEXT,
    rateNote TEXT,
    outdoorSessions INT DEFAULT NULL,
    indoorSessions INT DEFAULT NULL,
    isIndoorFree TINYINT(1) DEFAULT 0,
    isRatioBased TINYINT(1) DEFAULT 0,
    sessionsPer10Days INT DEFAULT NULL,
    orderIndex INT DEFAULT 0,
    details_json LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category_order (category, orderIndex)
);

-- 4. Invoice Quotations Table
CREATE TABLE IF NOT EXISTS invoice_quotations (
    id VARCHAR(50) PRIMARY KEY,
    quotation_number VARCHAR(50) NOT NULL UNIQUE,
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    patient_phone VARCHAR(30) NOT NULL,
    patient_age VARCHAR(20),
    patient_gender VARCHAR(20),
    doctor_name VARCHAR(150),
    created_date DATE NOT NULL,
    valid_until DATE NOT NULL,
    
    treatments_json LONGTEXT,
    treatments_subtotal DECIMAL(10,2) DEFAULT 0.00,
    
    outdoor_packages_json LONGTEXT,
    outdoor_subtotal DECIMAL(10,2) DEFAULT 0.00,
    
    indoor_services_json LONGTEXT,
    indoor_subtotal DECIMAL(10,2) DEFAULT 0.00,
    
    consultation_fee DECIMAL(10,2) DEFAULT 0.00,
    investigation_fee DECIMAL(10,2) DEFAULT 0.00,
    overall_discount_percent DECIMAL(5,2) DEFAULT 0.00,
    overall_discount_amount DECIMAL(10,2) DEFAULT 0.00,
    
    gross_total DECIMAL(10,2) DEFAULT 0.00,
    grand_total DECIMAL(10,2) DEFAULT 0.00,
    advance_paid DECIMAL(10,2) DEFAULT 0.00,
    due_amount DECIMAL(10,2) DEFAULT 0.00,
    
    payment_status VARCHAR(50) DEFAULT 'Quotation',
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_quotation_number (quotation_number),
    INDEX idx_patient_phone (patient_phone)
);
