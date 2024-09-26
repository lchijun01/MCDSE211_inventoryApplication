create database(mysql) :

CREATE DATABASE mcdse211 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_0900_ai_ci;

USE mcdse211;

CREATE TABLE purchase_paymentbreakdown (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(20),
    paid_by VARCHAR(50),
    paid_date DATE,
    payment_file VARCHAR(255),
    amount INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product VARCHAR(255),
    quantity INT,
    price DECIMAL(10,2),
    invoice_number VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name VARCHAR(255),
    purchase_date DATE,
    paid TINYINT(1) DEFAULT 0,
    invoice_number VARCHAR(20) UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
