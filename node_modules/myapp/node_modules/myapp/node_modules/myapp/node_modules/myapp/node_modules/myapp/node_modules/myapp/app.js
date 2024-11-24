const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const multer  = require('multer');
const moment = require('moment');
const fs = require('fs');
const csv = require('csv-parser');
const fastCsv = require('fast-csv');
const ejs = require('ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.static('public'))
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Chart = require('chart.js');
const path = require('path');
const archiver = require('archiver');
const pdf = require('html-pdf');
const cors = require('cors');

// Set up Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Serve static files from 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Mysql database setting
const pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'abc123',
    database: 'mcdse211'
});
const urlencodedParser = bodyParser.urlencoded({extended: true});

// Set up body-parser middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Set up session handling
app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 hour
}));

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
      return next();
  }
  res.redirect('/login');
}
// Change passowrd & Login
app.get('/login', (req, res) => {
  res.render('login');
});
app.post('/login', (req, res) => {
  const { username, password } = req.body; // 'username' instead of 'identifier'

  // Check if username and password are provided
  if (!username || !password) {
      return res.render('login', { error: 'Username and password are required.' });
  }

  // Query database for the user by username only
  const query = 'SELECT * FROM users WHERE username = ?';
  pool.query(query, [username], async (err, results) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Internal server error' });
      }

      if (results.length === 0) {
          console.log('User not found with identifier:', username);
          return res.render('login', { error: 'Invalid username or password.' });
      }

      // Check if password matches
      const user = results[0];
      console.log('User found:', user);
      const passwordMatches = await bcrypt.compare(password, user.password);
      console.log('Password matches:', passwordMatches);

      if (!passwordMatches) {
          return res.render('login', { error: 'Invalid username or password.' });
      }

      // If login is successful, set the session user
      req.session.user = user;
      res.redirect('/');
  });
});
app.get('/register', (req, res) => {
  res.render('register');
});
app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
      return res.render('register', { error: 'Passwords do not match' });
  }

  try {
      // Check if the username or email already exists
      const query = 'SELECT * FROM users WHERE username = ? OR email = ?';
      pool.query(query, [username, email], async (err, results) => {
          if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Internal server error' });
          }

          if (results.length > 0) {
              return res.render('register', { error: 'Username or email already exists' });
          }

          // Hash the password
          const hashedPassword = await bcrypt.hash(password, 10);

          console.log('Hashed Password:', hashedPassword);

          // Insert the new user into the database
          const insertQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
          pool.query(insertQuery, [username, email, hashedPassword], (err, result) => {
              if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ message: 'Internal server error' });
              }

              console.log('User registered successfully');
              // Redirect to login page after successful registration
              res.redirect('/login');
          });
      });
  } catch (err) {
      console.error('Error:', err);
      res.status(500).json({ message: 'Something went wrong' });
  }
});
app.post('/logout', (req, res) => {
  // Destroy the user's session
  req.session.destroy();
  // Redirect to the login page
  res.redirect('/login');
});
// Dashboard
app.get('/', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const query = `
      SELECT 
          pp.product AS product_name,
          COALESCE(SUM(pp.quantity), 0) AS total_purchased,
          COALESCE((SELECT SUM(sp.quantity) FROM sales_products sp WHERE sp.product_name = pp.product AND sp.user_id = ?), 0) AS total_sold,
          COALESCE(SUM(pp.quantity), 0) - COALESCE((SELECT SUM(sp.quantity) FROM sales_products sp WHERE sp.product_name = pp.product AND sp.user_id = ?), 0) AS stock_left
      FROM purchase_products pp
      WHERE pp.user_id = ?
      GROUP BY pp.product;
  `;

  pool.query(query, [userId, userId, userId], (err, results) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Internal server error' });
      }
      res.render('index', { stockData: results });
  });
});
// API for Restocking Alerts
app.get('/api/restocking-alerts', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  // SQL query to get restocking alerts based on 7-day sales and stock level
  const query = `
    WITH sales_7_days AS (
      SELECT sp.product_name, COALESCE(SUM(sp.quantity), 0) / 7 AS avg_7_days_quantity
      FROM sales_products sp
      JOIN sales s ON sp.invoice_number = s.invoice_number
      WHERE s.sales_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND s.user_id = ?
      GROUP BY sp.product_name
    )
    SELECT 
      pp.product AS product_name,
      COALESCE(sales_7_days.avg_7_days_quantity, 0) AS avg_7_days_quantity,
      COALESCE(SUM(pp.quantity), 0) - COALESCE((SELECT SUM(sp.quantity) FROM sales_products sp WHERE sp.product_name = pp.product AND sp.user_id = ?), 0) AS current_stock,
      CASE 
        WHEN COALESCE(sales_7_days.avg_7_days_quantity, 0) = 0 THEN NULL
        ELSE (COALESCE(SUM(pp.quantity), 0) - COALESCE((SELECT SUM(sp.quantity) FROM sales_products sp WHERE sp.product_name = pp.product AND sp.user_id = ?), 0)) / COALESCE(sales_7_days.avg_7_days_quantity, 1)
      END AS days_of_stock_left
    FROM purchase_products pp
    LEFT JOIN sales_7_days ON pp.product = sales_7_days.product_name
    WHERE pp.user_id = ?
    GROUP BY pp.product
    HAVING days_of_stock_left < 7 OR current_stock = 0
    ORDER BY days_of_stock_left ASC;
  `;

  pool.query(query, [userId, userId, userId, userId], (err, results) => {
    if (err) {
      console.error('Error fetching restocking alerts:', err);
      res.status(500).json({ message: 'Error fetching restocking alerts' });
      return;
    }

    console.log('Restocking Alerts Results:', results);

    res.json(results);
  });
});
// API for Sales Data (Monthly, Daily, Yearly)
app.get('/api/sales-data', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const { interval } = req.query; // The interval can be 'daily', 'monthly', or 'yearly'

  let query;

  if (interval === 'daily') {
    query = `
      SELECT DATE(s.sales_date) AS date, 
             SUM(sp.quantity * sp.price) AS total_sales
      FROM sales s
      JOIN sales_products sp ON s.invoice_number = sp.invoice_number
      WHERE s.user_id = ?
      GROUP BY DATE(s.sales_date)
      ORDER BY DATE(s.sales_date) DESC
      LIMIT 30;
    `;
  } else if (interval === 'monthly') {
    query = `
      SELECT DATE_FORMAT(s.sales_date, '%Y-%m') AS date, 
             SUM(sp.quantity * sp.price) AS total_sales
      FROM sales s
      JOIN sales_products sp ON s.invoice_number = sp.invoice_number
      WHERE s.user_id = ?
      GROUP BY DATE_FORMAT(s.sales_date, '%Y-%m')
      ORDER BY DATE_FORMAT(s.sales_date, '%Y-%m') DESC
      LIMIT 12;
    `;
  } else if (interval === 'yearly') {
    query = `
      SELECT YEAR(s.sales_date) AS date, 
             SUM(sp.quantity * sp.price) AS total_sales
      FROM sales s
      JOIN sales_products sp ON s.invoice_number = sp.invoice_number
      WHERE s.user_id = ?
      GROUP BY YEAR(s.sales_date)
      ORDER BY YEAR(s.sales_date) DESC
      LIMIT 5;
    `;
  } else {
    return res.status(400).json({ message: 'Invalid interval specified' });
  }

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching sales data:', err);
      res.status(500).json({ message: 'Error fetching sales data' });
    } else {
      res.json(results);
    }
  });
});
// API for Current Stock Value Calculation
app.get('/api/current-stock-value', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      pp.product, 
      (COALESCE(SUM(pp.quantity), 0) - COALESCE(SUM(sp.quantity), 0)) * pp.price AS current_stock_value
    FROM purchase_products pp
    LEFT JOIN sales_products sp ON pp.product = sp.product_name AND pp.user_id = sp.user_id
    WHERE pp.user_id = ?
    GROUP BY pp.product, pp.price
  `;

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching current stock value:', err);
      res.status(500).json({ message: 'Error fetching current stock value' });
    } else {
      res.json(results);
    }
  });
});

// Sales
app.get('/available-products', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const query = `
    SELECT pp.product,
       COALESCE(SUM(pp.quantity), 0) - COALESCE(SUM(sp.quantity), 0) AS available_stock
    FROM purchase_products pp
    LEFT JOIN sales_products sp ON pp.product = sp.product_name AND pp.user_id = sp.user_id
    WHERE pp.user_id = ?
    GROUP BY pp.product
    HAVING available_stock > 0;
  `;

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching available products:', err);
      return res.status(500).json({ message: 'Error fetching available products' });
    }

    res.json(results);
  });
});
app.get('/sales', (req, res) => {
  const selectedYear = req.query.year || 'all';

  // Query to fetch sales invoices along with their products
  let query = `
    SELECT 
      s.invoice_number, 
      s.buyer_name, 
      s.sales_date, 
      s.paid,
      SUM(sp.quantity * sp.price) AS total_amount
    FROM sales s
    LEFT JOIN sales_products sp ON s.invoice_number = sp.invoice_number
  `;

  const params = [];

  if (selectedYear !== 'all') {
    query += ` WHERE YEAR(s.sales_date) = ?`;
    params.push(selectedYear);
  }

  // Update GROUP BY clause to include all non-aggregated fields in SELECT
  query += ` GROUP BY s.invoice_number, s.buyer_name, s.sales_date, s.paid ORDER BY s.sales_date DESC`;

  pool.query(query, params, (err, invoiceResults) => {
    if (err) {
      console.error('Error fetching sales invoices:', err);
      res.status(500).json({ message: 'Error fetching sales invoices' });
      return;
    }

    // Prepare a map to store invoice data for each invoice_number
    const invoices = [];
    const invoiceMap = {};

    // Build the invoice structure with basic details and empty product arrays
    invoiceResults.forEach(row => {
      invoiceMap[row.invoice_number] = {
        invoice_number: row.invoice_number,
        buyer_name: row.buyer_name,
        sales_date: row.sales_date,
        paid: row.paid,
        totalAmount: row.total_amount,
        products: []
      };
      invoices.push(invoiceMap[row.invoice_number]);
    });

    // Query to fetch products for all invoices in the current result set
    const invoiceNumbers = invoiceResults.map(row => row.invoice_number);
    if (invoiceNumbers.length === 0) {
      return renderSalesPage(invoices);
    }

    const productQuery = `
      SELECT 
        sp.invoice_number, 
        sp.product_name, 
        sp.quantity, 
        sp.price 
      FROM sales_products sp
      WHERE sp.invoice_number IN (?)
    `;

    pool.query(productQuery, [invoiceNumbers], (err, productResults) => {
      if (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ message: 'Error fetching products' });
        return;
      }

      // Add products to their respective invoices
      productResults.forEach(product => {
        if (invoiceMap[product.invoice_number]) {
          invoiceMap[product.invoice_number].products.push({
            product_name: product.product_name,
            quantity: product.quantity,
            price: product.price
          });
        }
      });

      renderSalesPage(invoices);
    });

    function renderSalesPage(invoices) {
      // Fetch years for dropdown
      const yearQuery = `SELECT DISTINCT YEAR(s.sales_date) as year FROM sales s ORDER BY year DESC`;

      pool.query(yearQuery, (err, yearResults) => {
        if (err) {
          console.error('Error fetching years:', err);
          res.status(500).json({ message: 'Error fetching years' });
          return;
        }

        const years = yearResults.map(row => row.year);

        // Render the sales EJS view with invoice details and year selection options
        res.render('sales', {
          invoices,
          years,
          selectedYear
        });
      });
    }
  });
});
app.post('/sales', upload.single('paymentFile'), requireLogin, (req, res) => {
  const { buyerName, date: salesDate, paidBy, paidDate, product: products, quantity: quantities, price: prices } = req.body;
  const paid = req.body.paid === 'yes' ? 1 : 0;
  let paymentFile = req.file ? req.file.filename : null;
  const userId = req.session.user.user_id;

  if (!buyerName || !salesDate) {
      return res.status(400).json({ message: 'Buyer name and sales date are required' });
  }

  // Create user-specific directory if it doesn't exist
  const userDir = path.join(__dirname, 'uploads', userId.toString(), 'sales');
  if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
  }

  // Move the uploaded file to the user-specific sales directory if a file was uploaded
  if (paymentFile) {
      const oldPath = req.file.path;
      paymentFile = path.join(userId.toString(), 'sales', req.file.filename);
      const newPath = path.join(__dirname, 'uploads', paymentFile);
      fs.renameSync(oldPath, newPath);
  }

  // Generate invoice number
  const datePart = moment(salesDate).format('YYYYMMDD');
  const prefix = 'SAL-';
  let invoiceNumber;

  const checkInvoiceQuery = `
      SELECT invoice_number 
      FROM sales 
      WHERE invoice_number LIKE '${prefix}${datePart}%' 
      ORDER BY invoice_number DESC 
      LIMIT 1;
  `;

  pool.query(checkInvoiceQuery, (err, results) => {
      if (err) {
          console.error('Error checking latest invoice number:', err);
          return res.status(500).json({ message: err.message });
      }

      if (results.length > 0) {
          const lastInvoiceNumber = results[0].invoice_number;
          const lastSequence = parseInt(lastInvoiceNumber.split('-')[2]);
          const newSequence = lastSequence + 1;
          invoiceNumber = `${prefix}${datePart}-${newSequence.toString().padStart(3, '0')}`;
      } else {
          invoiceNumber = `${prefix}${datePart}-001`;
      }

      // Insert sales record
      const insertSalesQuery = `
          INSERT INTO sales (invoice_number, buyer_name, sales_date, paid, user_id) 
          VALUES (?, ?, ?, ?, ?);
      `;
      const salesValues = [invoiceNumber, buyerName, salesDate, paid, userId];

      pool.query(insertSalesQuery, salesValues, (err) => {
          if (err) {
              console.error('Error inserting sales:', err);
              return res.status(500).json({ message: err.message });
          }

          // Insert product details
          const productInsertPromises = products.map((product, index) => {
              return new Promise((resolve, reject) => {
                  const quantity = quantities[index];
                  const price = prices[index];
                  const insertProductQuery = `
                      INSERT INTO sales_products (invoice_number, product_name, quantity, price, user_id) 
                      VALUES (?, ?, ?, ?, ?);
                  `;
                  pool.query(insertProductQuery, [invoiceNumber, product, quantity, price, userId], (err) => {
                      if (err) {
                          console.error('Error inserting product:', err);
                          return reject(err);
                      }
                      resolve();
                  });
              });
          });

          Promise.all(productInsertPromises)
              .then(() => {
                  if (paid) {
                      const totalAmount = products.reduce((acc, _, index) => acc + (quantities[index] * prices[index]), 0);
                      const insertPaymentQuery = `
                          INSERT INTO sales_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount, user_id)
                          VALUES (?, ?, ?, ?, ?, ?);
                      `;
                      const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, totalAmount, userId];

                      pool.query(insertPaymentQuery, paymentValues, (err) => {
                          if (err) {
                              console.error('Error inserting payment breakdown:', err);
                              return res.status(500).json({ message: err.message });
                          }
                          res.redirect('/sales');
                      });
                  } else {
                      res.redirect('/sales');
                  }
              })
              .catch((error) => {
                  console.error('Error inserting products:', error);
                  return res.status(500).json({ message: error.message });
              });
      });
  });
});
// Sales payment breakdown
app.get('/sales-paymentbreakdown', requireLogin, (req, res) => {
  const userId = req.session.user.user_id; // Retrieve user_id from session

  // SQL query for fetching sales and payment breakdown
  const query = `
    SELECT 
      s.invoice_number, 
      s.buyer_name, 
      s.sales_date, 
      COALESCE(SUM(sp.quantity * sp.price), 0) AS total_amount,
      COALESCE((SELECT SUM(amount) FROM sales_paymentbreakdown WHERE invoice_number = s.invoice_number), 0) AS total_paid,
      COALESCE(SUM(sp.quantity * sp.price), 0) - COALESCE((SELECT SUM(amount) FROM sales_paymentbreakdown WHERE invoice_number = s.invoice_number), 0) AS amount_due,
      spb.paid_date,
      spb.amount AS payment_amount,
      spb.paid_by
    FROM sales s
    LEFT JOIN sales_products sp ON s.invoice_number = sp.invoice_number
    LEFT JOIN sales_paymentbreakdown spb ON s.invoice_number = spb.invoice_number
    WHERE s.user_id = ?  -- Filter by user_id
    GROUP BY s.invoice_number, s.buyer_name, s.sales_date, spb.paid_date, spb.amount, spb.paid_by
    ORDER BY s.sales_date DESC, spb.paid_date DESC;
  `;

  // Execute the query
  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching sales and payment history:', err);
      res.status(500).json({ message: 'Error fetching sales and payment history' });
      return;
    }

    // Create a map to organize the invoices and their payment histories
    const invoices = {};
    results.forEach(row => {
      if (!invoices[row.invoice_number]) {
        invoices[row.invoice_number] = {
          invoice_number: row.invoice_number,
          buyer_name: row.buyer_name,
          sales_date: row.sales_date,
          total_amount: row.total_amount,
          total_paid: row.total_paid,
          amount_due: row.amount_due,
          payment_history: []
        };
      }
      if (row.paid_date) {
        invoices[row.invoice_number].payment_history.push({
          paid_date: row.paid_date,
          amount: row.payment_amount,
          paid_by: row.paid_by
        });
      }
    });

    // Convert map to arrays
    const settledSales = Object.values(invoices).filter(sale => sale.amount_due === 0);
    const unpaidSales = Object.values(invoices).filter(sale => sale.amount_due > 0);

    // Render the EJS view with the breakdown
    res.render('sales_paymentbreakdown', {
      unpaidSales,
      settledSales
    });
  });
});
app.post('/submit-sales-payment', upload.single('paymentFile'), requireLogin, (req, res) => {
  const { invoiceNumber, paidBy, paidDate, amountPaid } = req.body;
  let paymentFile = req.file ? req.file.filename : null;
  const userId = req.session.user.user_id;

  if (!invoiceNumber || !paidBy || !paidDate || !amountPaid) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Create user-specific directory if it doesn't exist
  const userDir = path.join(__dirname, 'uploads', userId.toString(), 'sales');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Move the uploaded file to the user-specific sales directory if a file was uploaded
  if (paymentFile) {
    const oldPath = req.file.path; // Temporary upload directory path
    paymentFile = path.join(userId.toString(), 'sales', req.file.filename);
    const newPath = path.join(__dirname, 'uploads', paymentFile);

    // Move file to new path
    fs.renameSync(oldPath, newPath);
  }

  // Insert payment details into the database using the invoice number
  const insertPaymentQuery = `
    INSERT INTO sales_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount, user_id)
    VALUES (?, ?, ?, ?, ?, ?);
  `;
  const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, amountPaid, userId];

  pool.query(insertPaymentQuery, paymentValues, (err) => {
    if (err) {
      console.error('Error inserting sales payment breakdown:', err);
      return res.status(500).json({ message: 'Error inserting sales payment breakdown' });
    }

    // After inserting, check if the sale is fully paid
    const checkPaymentStatusQuery = `
      SELECT 
        (SELECT SUM(quantity * price) FROM sales_products WHERE invoice_number = ? AND user_id = ?) AS total_sales_amount,
        (SELECT SUM(amount) FROM sales_paymentbreakdown WHERE invoice_number = ? AND user_id = ?) AS total_paid_amount
    `;

    pool.query(checkPaymentStatusQuery, [invoiceNumber, userId, invoiceNumber, userId], (err, results) => {
      if (err) {
        console.error('Error checking payment status:', err);
        return res.status(500).json({ message: 'Error checking payment status' });
      }

      const totalSalesAmount = results[0]?.total_sales_amount || 0;
      const totalPaidAmount = results[0]?.total_paid_amount || 0;

      if (totalPaidAmount >= totalSalesAmount) {
        // Mark the sale as fully paid
        const updateSalesQuery = `UPDATE sales SET paid = 1 WHERE invoice_number = ? AND user_id = ?`;

        pool.query(updateSalesQuery, [invoiceNumber, userId], (err) => {
          if (err) {
            console.error('Error updating sales status:', err);
            return res.status(500).json({ message: 'Error updating sales status' });
          }
          res.redirect('/sales-paymentbreakdown');
        });
      } else {
        res.redirect('/sales-paymentbreakdown');
      }
    });
  });
});
app.get('/get-sales-payment-files', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id; // Retrieve user_id from session

  // Modified SQL query to match the structure for purchase payments
  const query = `
    SELECT payment_file
    FROM sales_paymentbreakdown
    WHERE invoice_number = ? AND payment_file IS NOT NULL AND user_id = ?
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching payment files:', err);
      res.status(500).json({ message: 'Error fetching payment files' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ message: 'No payment files found for this invoice.' });
      return;
    }

    // Map the results to get an array of filenames
    const files = results.map(row => row.payment_file);
    res.json(files); // Return the list of payment files
  });
});
app.get('/download-sales-payment-file', requireLogin, (req, res) => {
  const paymentId = req.query.paymentId;

  const query = `SELECT payment_file FROM sales_paymentbreakdown WHERE id = ?`;

  pool.query(query, [paymentId], (err, results) => {
    if (err) {
      console.error('Error fetching payment file:', err);
      return res.status(500).json({ message: 'Error fetching payment file' });
    }

    if (results.length === 0 || !results[0].payment_file) {
      return res.status(404).json({ message: 'Payment file not found' });
    }

    const filePath = path.join(__dirname, 'uploads', results[0].payment_file);

    res.download(filePath, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        return res.status(500).json({ message: 'Error downloading file' });
      }
    });
  });
});
// Sales invoice
app.get('/sales-invoice', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      s.invoice_number, 
      s.buyer_name, 
      s.sales_date, 
      COALESCE(SUM(sp.quantity * sp.price), 0) AS total_amount
    FROM sales s
    LEFT JOIN sales_products sp ON s.invoice_number = sp.invoice_number
    WHERE s.paid = 1 AND s.user_id = ?
    GROUP BY s.invoice_number, s.buyer_name, s.sales_date
    ORDER BY s.sales_date DESC;
  `;

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching paid sales invoices:', err);
      return res.status(500).json({ message: 'Error fetching paid sales invoices' });
    }

    res.render('sales_invoice', { invoices: results });
  });
});
app.get('/generate-sales-invoice', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      s.invoice_number, 
      s.buyer_name, 
      s.sales_date, 
      sp.product_name, 
      sp.quantity, 
      sp.price
    FROM sales s
    JOIN sales_products sp ON s.invoice_number = sp.invoice_number
    WHERE s.invoice_number = ? AND s.user_id = ?
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching sales invoice details:', err);
      return res.status(500).json({ message: 'Error fetching sales invoice details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = {
      invoice_number: results[0].invoice_number,
      buyer_name: results[0].buyer_name,
      sales_date: results[0].sales_date,
      total_amount: results.reduce((acc, curr) => acc + curr.quantity * curr.price, 0),
      products: results.map(row => ({
        product: row.product_name,
        quantity: row.quantity,
        price: row.price,
      }))
    };

    res.render('template_sales', { invoice });
  });
});
app.get('/download-sales-invoice-pdf', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      s.invoice_number, 
      s.buyer_name, 
      s.sales_date, 
      sp.product_name, 
      sp.quantity, 
      sp.price
    FROM sales s
    JOIN sales_products sp ON s.invoice_number = sp.invoice_number
    WHERE s.invoice_number = ? AND s.user_id = ?
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching sales invoice details:', err);
      return res.status(500).json({ message: 'Error fetching sales invoice details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = {
      invoice_number: results[0].invoice_number,
      buyer_name: results[0].buyer_name,
      sales_date: results[0].sales_date,
      total_amount: results.reduce((acc, curr) => acc + curr.quantity * curr.price, 0),
      products: results.map(row => ({
        product: row.product_name,
        quantity: row.quantity,
        price: row.price,
      }))
    };

    res.render('template_sales', { invoice }, (err, html) => {
      if (err) {
        console.error('Error rendering invoice to HTML:', err);
        return res.status(500).json({ message: 'Error rendering invoice to HTML' });
      }

      const options = { 
        format: 'A4',
        border: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      };
      pdf.create(html, options).toBuffer((err, buffer) => {
        if (err) {
          console.error('Error generating PDF:', err);
          return res.status(500).json({ message: 'Error generating PDF' });
        }

        res.setHeader('Content-Disposition', `attachment; filename=${invoiceNumber}.pdf`);
        res.contentType("application/pdf");
        res.send(buffer);
      });
    });
  });
});
// Purchase
app.get('/purchase', requireLogin, (req, res) => {
  const selectedYear = req.query.year || 'all';

  let query = `
      SELECT p.invoice_number, p.supplier_name, p.purchase_date, p.paid,
             pp.product, pp.quantity, pp.price
      FROM purchases p
      LEFT JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
  `;
  
  const params = [];

  if (selectedYear !== 'all') {
      query += ` WHERE YEAR(p.purchase_date) = ?`;
      params.push(selectedYear);
  }

  query += ` ORDER BY p.purchase_date DESC`;

  pool.query(query, params, (err, results) => {
      if (err) {
          console.error('Error fetching invoices:', err);
          res.status(500).json({ message: 'Error fetching invoices' });
          return;
      }

      const invoices = [];
      const invoiceMap = {};

      results.forEach(row => {
          if (!invoiceMap[row.invoice_number]) {
              invoiceMap[row.invoice_number] = {
                  invoice_number: row.invoice_number,
                  supplier_name: row.supplier_name,
                  purchase_date: row.purchase_date,
                  paid: row.paid,
                  totalAmount: 0, // Initialize totalAmount to 0
                  products: []
              };
              invoices.push(invoiceMap[row.invoice_number]);
          }
          
          // Calculate product total and update invoice totalAmount
          if (row.product) {
              const productTotal = row.quantity * row.price; // Calculate product total
              invoiceMap[row.invoice_number].totalAmount += productTotal; // Add product total to invoice's totalAmount

              // Add product details to the invoice's product list
              invoiceMap[row.invoice_number].products.push({
                  product: row.product,
                  quantity: row.quantity,
                  price: row.price
              });
          }
      });

      const yearQuery = `SELECT DISTINCT YEAR(purchase_date) as year FROM purchases ORDER BY year DESC`;
      pool.query(yearQuery, (err, yearResults) => {
          if (err) {
              console.error('Error fetching years:', err);
              res.status(500).json({ message: 'Error fetching years' });
              return;
          }

          const years = yearResults.map(row => row.year);

          res.render('purchase', {
              invoices,
              years,
              selectedYear
          });
      });
  });
});
app.post('/purchase', upload.single('paymentFile'), requireLogin, (req, res) => {
  const { supplierName, date: purchaseDate, paidBy, paidDate, product: products, quantity: quantities, price: prices } = req.body;
  const paid = req.body.paid === 'yes' ? 1 : 0;
  let paymentFile = req.file ? req.file.filename : null;
  const userId = req.session.user.user_id;

  if (!supplierName || !purchaseDate) {
      return res.status(400).json({ message: 'Supplier name and purchase date are required' });
  }

  // Create user-specific directory if it doesn't exist
  const userDir = path.join(__dirname, 'uploads', userId.toString(), 'purchase');
  if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
  }

  // Move the uploaded file to the user-specific purchase directory if a file was uploaded
  if (paymentFile) {
      const oldPath = req.file.path;
      paymentFile = path.join(userId.toString(), 'purchase', req.file.filename);
      const newPath = path.join(__dirname, 'uploads', paymentFile);
      fs.renameSync(oldPath, newPath);
  }

  // Generate invoice number
  const datePart = moment(purchaseDate).format('YYYYMMDD');
  const prefix = 'INV-';
  let invoiceNumber;

  const checkInvoiceQuery = `
      SELECT invoice_number 
      FROM purchases 
      WHERE invoice_number LIKE '${prefix}${datePart}%' 
      ORDER BY invoice_number DESC 
      LIMIT 1;
  `;

  pool.query(checkInvoiceQuery, (err, results) => {
      if (err) {
          console.error('Error checking latest invoice number:', err);
          return res.status(500).json({ message: err.message });
      }

      if (results.length > 0) {
          const lastInvoiceNumber = results[0].invoice_number;
          const lastSequence = parseInt(lastInvoiceNumber.split('-')[2]);
          const newSequence = lastSequence + 1;
          invoiceNumber = `${prefix}${datePart}-${newSequence.toString().padStart(3, '0')}`;
      } else {
          invoiceNumber = `${prefix}${datePart}-001`;
      }

      // Insert purchase record
      const insertPurchaseQuery = `
          INSERT INTO purchases (invoice_number, supplier_name, purchase_date, paid, user_id) 
          VALUES (?, ?, ?, ?, ?);
      `;
      const purchaseValues = [invoiceNumber, supplierName, purchaseDate, paid, userId];

      pool.query(insertPurchaseQuery, purchaseValues, (err) => {
          if (err) {
              console.error('Error inserting purchase:', err);
              return res.status(500).json({ message: err.message });
          }

          // Insert product details
          const productQueries = products.map((product, index) => {
              const quantity = quantities[index];
              const price = prices[index];
              const insertProductQuery = `
                  INSERT INTO purchase_products (invoice_number, product, quantity, price, user_id) 
                  VALUES (?, ?, ?, ?, ?);
              `;
              return pool.query(insertProductQuery, [invoiceNumber, product, quantity, price, userId]);
          });

          Promise.all(productQueries)
              .then(() => {
                  if (paid) {
                      const totalAmount = products.reduce((acc, _, index) => acc + (quantities[index] * prices[index]), 0);
                      const insertPaymentQuery = `
                          INSERT INTO purchase_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount, user_id)
                          VALUES (?, ?, ?, ?, ?, ?);
                      `;
                      const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, totalAmount, userId];

                      pool.query(insertPaymentQuery, paymentValues, (err) => {
                          if (err) {
                              console.error('Error inserting payment breakdown:', err);
                              return res.status(500).json({ message: err.message });
                          }
                          res.redirect('/purchase');
                      });
                  } else {
                      res.redirect('/purchase');
                  }
              })
              .catch((error) => {
                  console.error('Error inserting products:', error);
                  return res.status(500).json({ message: error.message });
              });
      });
  });
});
app.get('/get-suppliers', requireLogin, (req, res) => {
  const searchQuery = req.query.q; // Get the query parameter
  const query = 'SELECT DISTINCT supplier_name FROM purchases WHERE supplier_name LIKE ?';
  const searchTerm = `${searchQuery}%`; // Search term for names starting with the input

  pool.query(query, [searchTerm], (err, results) => {
    if (err) {
      console.error('Error fetching suppliers from purchases:', err);
      res.status(500).json({ message: err.message });
      return;
    }
    const supplierNames = results.map(row => row.supplier_name);
    res.json(supplierNames); // Return matching supplier names as JSON
  });
});
app.get('/get-products', requireLogin, (req, res) => {
  const searchQuery = req.query.q; // Get the query parameter
  const userId = req.session.user.user_id; // Get the user ID from session

  // Query to get products available for sales from purchase products minus sales products
  const query = `
    SELECT pp.product,
           COALESCE(SUM(pp.quantity), 0) - COALESCE(SUM(sp.quantity), 0) AS available_stock
    FROM purchase_products pp
    LEFT JOIN sales_products sp ON pp.product = sp.product_name AND pp.user_id = sp.user_id
    WHERE pp.user_id = ? AND pp.product LIKE ?
    GROUP BY pp.product
    HAVING available_stock > 0;
  `;
  
  const searchTerm = `${searchQuery}%`; // Search term for names starting with the input

  pool.query(query, [userId, searchTerm], (err, results) => {
    if (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: 'Error fetching products' });
      return;
    }

    const productNames = results.map(row => row.product);
    res.json(productNames); // Return matching product names as JSON
  });
});
// Purchase payment breakdown
app.get('/purchase-paymentbreakdown', requireLogin, (req, res) => {
  const userId = req.session.user.user_id; // Retrieve user_id from session

  // SQL query for fetching purchase and payment breakdown
  const query = `
    SELECT 
      p.invoice_number, 
      p.supplier_name, 
      p.purchase_date, 
      COALESCE(SUM(pp.quantity * pp.price), 0) AS total_amount,
      COALESCE((SELECT SUM(amount) FROM purchase_paymentbreakdown WHERE invoice_number = p.invoice_number), 0) AS total_paid,
      COALESCE(SUM(pp.quantity * pp.price), 0) - COALESCE((SELECT SUM(amount) FROM purchase_paymentbreakdown WHERE invoice_number = p.invoice_number), 0) AS amount_due,
      pb.paid_date,
      pb.amount AS payment_amount,
      pb.paid_by
    FROM purchases p
    LEFT JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
    LEFT JOIN purchase_paymentbreakdown pb ON p.invoice_number = pb.invoice_number
    WHERE p.user_id = ?  -- Filter by user_id
    GROUP BY p.invoice_number, p.supplier_name, p.purchase_date, pb.paid_date, pb.amount, pb.paid_by
    ORDER BY p.purchase_date DESC, pb.paid_date DESC;
  `;

  // Execute the query
  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching purchases and payment history:', err);
      res.status(500).json({ message: 'Error fetching purchases and payment history' });
      return;
    }

    // Create a map to organize the invoices and their payment histories
    const invoices = {};
    results.forEach(row => {
      if (!invoices[row.invoice_number]) {
        invoices[row.invoice_number] = {
          invoice_number: row.invoice_number,
          supplier_name: row.supplier_name,
          purchase_date: row.purchase_date,
          total_amount: row.total_amount,
          total_paid: row.total_paid,
          amount_due: row.amount_due,
          payment_history: []
        };
      }
      if (row.paid_date) {
        invoices[row.invoice_number].payment_history.push({
          paid_date: row.paid_date,
          amount: row.payment_amount,
          paid_by: row.paid_by
        });
      }
    });

    // Convert map to arrays
    const settledPurchases = Object.values(invoices).filter(purchase => purchase.amount_due === 0);
    const unpaidPurchases = Object.values(invoices).filter(purchase => purchase.amount_due > 0);

    // Render the EJS view with the breakdown
    res.render('purchase_paymentbreakdown', {
      unpaidPurchases,
      settledPurchases
    });
  });
});
app.get('/get-payment-files', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id; // Assuming user_id is stored in session

  const query = `
    SELECT payment_file 
    FROM purchase_paymentbreakdown 
    WHERE invoice_number = ? AND payment_file IS NOT NULL AND user_id = ?
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching payment files:', err);
      res.status(500).json({ message: 'Error fetching payment files' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ message: 'No payment files found for this invoice.' });
      return;
    }

    const files = results.map(row => row.payment_file);
    res.json(files); // Return the list of payment files
  });
});
app.get('/download-payment-files', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id; // Assuming user_id is stored in session

  const query = `
    SELECT payment_file 
    FROM purchase_paymentbreakdown 
    WHERE invoice_number = ? AND payment_file IS NOT NULL AND user_id = ?
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching payment files:', err);
      res.status(500).json({ message: 'Error fetching payment files' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ message: 'No files found for this invoice.' });
      return;
    }

    // Prepare the files for archiving
    const files = results.map(row => path.join(__dirname, 'uploads', row.payment_file));

    const zipFileName = `${invoiceNumber}_files.zip`;
    const output = fs.createWriteStream(zipFileName);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Handle archive completion
    output.on('close', () => {
      console.log(`Archived ${archive.pointer()} total bytes`);
      res.download(zipFileName, err => {
        if (err) {
          console.error('Error downloading zip file:', err);
        }
        fs.unlinkSync(zipFileName); // Delete the zip file after download
      });
    });

    // Handle errors during archiving
    archive.on('error', (err) => {
      console.error('Error creating zip archive:', err);
      res.status(500).json({ message: 'Error creating zip archive' });
    });

    // Pipe archive data to the output file
    archive.pipe(output);

    // Add files to the archive
    files.forEach(file => {
      if (fs.existsSync(file)) {
        console.log('Adding file to archive:', file);
        archive.file(file, { name: path.basename(file) });
      } else {
        console.error('File does not exist:', file);
      }
    });

    // Finalize the archive
    archive.finalize();
  });
});
app.post('/submit-payment', upload.single('paymentFile'), requireLogin, (req, res) => {
  const { invoiceNumber, paidBy, paidDate, amountPaid } = req.body;
  let paymentFile = req.file ? req.file.filename : null;
  const userId = req.session.user.user_id;

  if (!invoiceNumber || !paidBy || !paidDate || !amountPaid) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Create user-specific directory if it doesn't exist
  const userDir = path.join(__dirname, 'uploads', userId.toString(), 'purchase');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Move the uploaded file to the user-specific purchase directory if a file was uploaded
  if (paymentFile) {
    const oldPath = req.file.path; // Temporary upload directory path
    paymentFile = path.join(userId.toString(), 'purchase', req.file.filename);
    const newPath = path.join(__dirname, 'uploads', paymentFile);

    // Move file to new path
    fs.renameSync(oldPath, newPath);
  }

  // Insert payment details into the database
  const insertPaymentQuery = `
    INSERT INTO purchase_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount, user_id)
    VALUES (?, ?, ?, ?, ?, ?);
  `;
  const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, amountPaid, userId];

  pool.query(insertPaymentQuery, paymentValues, (err) => {
    if (err) {
      console.error('Error inserting payment breakdown:', err);
      return res.status(500).json({ message: 'Error inserting payment breakdown' });
    }

    // Check payment status
    const checkPaymentStatusQuery = `
      SELECT 
        (SELECT SUM(quantity * price) FROM purchase_products WHERE invoice_number = ? AND user_id = ?) AS total_invoice_amount,
        (SELECT SUM(amount) FROM purchase_paymentbreakdown WHERE invoice_number = ? AND user_id = ?) AS total_paid_amount
    `;
    pool.query(checkPaymentStatusQuery, [invoiceNumber, userId, invoiceNumber, userId], (err, results) => {
      if (err) {
        console.error('Error checking payment status:', err);
        return res.status(500).json({ message: 'Error checking payment status' });
      }

      const totalInvoiceAmount = results[0]?.total_invoice_amount || 0;
      const totalPaidAmount = results[0]?.total_paid_amount || 0;

      if (totalPaidAmount === totalInvoiceAmount) {
        // Mark the invoice as fully paid
        const updatePurchaseQuery = `UPDATE purchases SET paid = 1 WHERE invoice_number = ? AND user_id = ?`;

        pool.query(updatePurchaseQuery, [invoiceNumber, userId], (err) => {
          if (err) {
            console.error('Error updating purchase status:', err);
            return res.status(500).json({ message: 'Error updating purchase status' });
          }

          res.redirect('/purchase-paymentbreakdown');
        });
      } else {
        res.redirect('/purchase-paymentbreakdown');
      }
    });
  });
});
// Purchase invoice
app.get('/purchase-invoice', requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      p.invoice_number, 
      p.supplier_name, 
      p.purchase_date, 
      COALESCE(SUM(pp.quantity * pp.price), 0) AS total_amount
    FROM purchases p
    LEFT JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
    WHERE p.paid = 1 AND p.user_id = ?
    GROUP BY p.invoice_number, p.supplier_name, p.purchase_date
    ORDER BY p.purchase_date DESC;
  `;

  pool.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching paid invoices:', err);
      return res.status(500).json({ message: 'Error fetching paid invoices' });
    }

    res.render('purchase_invoice', { invoices: results });
  });
});
app.get('/generate-invoice', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      p.invoice_number, 
      p.supplier_name, 
      p.purchase_date, 
      COALESCE(SUM(pp.quantity * pp.price), 0) AS total_amount,
      pp.product, 
      pp.quantity, 
      pp.price
    FROM purchases p
    JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
    WHERE p.invoice_number = ? AND p.user_id = ?
    GROUP BY p.invoice_number, pp.product, pp.quantity, pp.price, p.supplier_name, p.purchase_date
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching invoice details:', err);
      return res.status(500).json({ message: 'Error fetching invoice details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = {
      invoice_number: results[0].invoice_number,
      supplier_name: results[0].supplier_name,
      purchase_date: results[0].purchase_date,
      total_amount: results.reduce((acc, curr) => acc + curr.quantity * curr.price, 0),
      products: results.map(row => ({
        product: row.product,
        quantity: row.quantity,
        price: row.price,
      }))
    };

    res.render('template', { invoice });
  });
});
app.get('/download-invoice-pdf', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;
  const userId = req.session.user.user_id;

  const query = `
    SELECT 
      p.invoice_number, 
      p.supplier_name, 
      p.purchase_date, 
      COALESCE(SUM(pp.quantity * pp.price), 0) AS total_amount,
      pp.product, 
      pp.quantity, 
      pp.price
    FROM purchases p
    JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
    WHERE p.invoice_number = ? AND p.user_id = ?
    GROUP BY p.invoice_number, pp.product
  `;

  pool.query(query, [invoiceNumber, userId], (err, results) => {
    if (err) {
      console.error('Error fetching invoice details:', err);
      return res.status(500).json({ message: 'Error fetching invoice details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = {
      invoice_number: results[0].invoice_number,
      supplier_name: results[0].supplier_name,
      purchase_date: results[0].purchase_date,
      total_amount: results.reduce((acc, curr) => acc + curr.quantity * curr.price, 0),
      products: results.map(row => ({
        product: row.product,
        quantity: row.quantity,
        price: row.price,
      }))
    };

    res.render('template', { invoice }, (err, html) => {
      if (err) {
        console.error('Error rendering invoice to HTML:', err);
        return res.status(500).json({ message: 'Error rendering invoice to HTML' });
      }

      const options = { format: 'A4' };
      pdf.create(html, options).toBuffer((err, buffer) => {
        if (err) {
          console.error('Error generating PDF:', err);
          return res.status(500).json({ message: 'Error generating PDF' });
        }

        res.setHeader('Content-Disposition', `attachment; filename=${invoiceNumber}.pdf`);
        res.contentType("application/pdf");
        res.send(buffer);
      });
    });
  });
});


// if broke back to Page
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (!res.headersSent) {
    res.status(500);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f8f9fa;
          }
          .error-container {
            text-align: center;
            padding: 20px;
            border: 1px solid #dee2e6;
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          h1 {
            font-size: 24px;
            color: #333;
          }
          button {
            margin-top: 15px;
            padding: 10px 20px;
            font-size: 16px;
            background-color: #007bff;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>Oops! Something went wrong.</h1>
          <button onclick="window.history.back()">Go Back</button>
        </div>
      </body>
      </html>
    `);
  } else {
    console.log("An error occurred, but the response was already sent.");
  }
});

//----------------------Ending--------------------------------------------------------------------------------
app.get('/profile/:name', requireLogin, function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});