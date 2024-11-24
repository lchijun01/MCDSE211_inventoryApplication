# Inventory Management System - MCDSE211

Welcome to the Inventory Management System repository! This project is a comprehensive solution for managing inventory, designed for small to medium-sized businesses. Follow the instructions below to get started with setting up the project locally.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)

## Prerequisites

Before proceeding, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download Node.js](https://nodejs.org/)
- **MySQL** - [Download MySQL](https://dev.mysql.com/downloads/)
- **Git** - [Download Git](https://git-scm.com/)

## Setup Instructions

### 1. Clone the Repository

Start by cloning the repository to your local machine. Run the following command in your terminal:

```bash
$ git clone https://github.com/yourusername/mcdse211-inventory-management.git
$ cd mcdse211-inventory-management
```

### 2. Install Dependencies

Once you've cloned the repository, navigate to the project directory and install the required dependencies by running:

```bash
$ npm install
```

This will install all the necessary packages listed in the `package.json` file.

## Database Setup

### 3. Create Database in MySQL

- Log in to your MySQL server:

```bash
$ mysql -u root -p
```

- Create a database named **`mcdse211`**:

```sql
CREATE DATABASE mcdse211;
```

### 4. Create Tables

Switch to the **`mcdse211`** database and create the required tables by running the following SQL commands:

```sql
USE mcdse211;

CREATE TABLE `purchase_paymentbreakdown` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `paid_by` varchar(255) DEFAULT NULL,
  `paid_date` date DEFAULT NULL,
  `payment_file` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_number` (`invoice_number`),
  CONSTRAINT `purchase_paymentbreakdown_ibfk_1` FOREIGN KEY (`invoice_number`) REFERENCES `purchases` (`invoice_number`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `purchase_products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `product` varchar(255) NOT NULL,
  `quantity` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_number` (`invoice_number`),
  CONSTRAINT `purchase_products_ibfk_1` FOREIGN KEY (`invoice_number`) REFERENCES `purchases` (`invoice_number`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `purchases` (
  `invoice_number` varchar(50) NOT NULL,
  `supplier_name` varchar(255) NOT NULL,
  `purchase_date` date NOT NULL,
  `paid` tinyint(1) DEFAULT '0',
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`invoice_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `buyer_name` varchar(255) NOT NULL,
  `sales_date` date NOT NULL,
  `paid` tinyint(1) DEFAULT '0',
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sales_paymentbreakdown` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `paid_by` varchar(255) DEFAULT NULL,
  `paid_date` date DEFAULT NULL,
  `payment_file` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_id` (`invoice_number`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sales_products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_id` (`invoice_number`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email_UNIQUE` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## Running the Application

### 5. Configure Environment Variables

Make sure you have a `.env` file to configure the database and other settings:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=mcdse211
```

### 6. Start the Server

Once the dependencies are installed and the database is set up, start the application by running:

```bash
$ npm start
```

This will start the server and you should be able to access the application at [http://localhost:3000](http://localhost:3000).

## Issues and Contributions

If you encounter any issues, feel free to submit an issue on GitHub. Contributions are welcome!

Thank you for using the Inventory Management System! We hope it makes managing your inventory simple and effective.

