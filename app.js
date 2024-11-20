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
// Use a reverse proxy to forward requests to the Node.js server running on port 2000
app.use('/api', createProxyMiddleware({ target: 'http://localhost: ', changeOrigin: true }));
// Mysql database setting
const pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'abc123',
    database: 'mcdse211'
});
const urlencodedParser = bodyParser.urlencoded({extended: true});
app.set('view engine', 'ejs');
app.use(session({
  secret: 'my-secret-key',
  resave: false,
  saveUninitialized: true
}));
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    if (!req.session.logout) {
      // User is authenticated and has not logged out, allow access to the next middleware or route handler
      next();
    } else {
      // User has logged out, redirect to the login page
      res.redirect('/login');
    }
  } else {
    // User is not authenticated, redirect to the login page
    res.redirect('/login');
  }
}
// Set up body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Change passowrd & Login
app.post('/login', urlencodedParser, async (req, res) => {
  const { username, password } = req.body;

  // You can replace this with a database query to fetch the user's details
  const user = {
    username: ' ',
    password: await bcrypt.hash(' ', 10)
  };

  if (username === user.username && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    console.log('Sending response from <specific part of your code>');
    return res.redirect('/');
  } else {
      return res.render('login', { error: 'Invalid username or password' });
  }
});
app.post('/logout', (req, res) => {
  // Destroy the user's session
  req.session.destroy();
  // Redirect to the login page
  res.redirect('/login');
});
app.get('/login', (req, res) => {
  res.render('login');
});
// Dashboard
app.get('/', requireLogin, (req, res) => {
  res.render('index');
});
// Sales
app.get('/sales', function(req, res){
  res.render('sales');
});
app.get('/sales-paymentbreakdown', function(req, res){
  res.render('sales_paymentbreakdown');
});
app.get('/sales-invoice', function(req, res){
  res.render('sales_invoice');
});
// Purchase
app.get('/purchase', (req, res) => {
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
app.post('/purchase', upload.single('paymentFile'), (req, res) => {
  const supplierName = req.body.supplierName;
  const purchaseDate = req.body.date;
  const paid = req.body.paid === 'yes' ? 1 : 0;
  const paidBy = paid ? req.body.paidBy : null;
  const paidDate = paid ? req.body.paidDate : null;
  const paymentFile = req.file ? req.file.filename : null; // Store only the filename
  const products = req.body.product;
  const quantities = req.body.quantity;
  const prices = req.body.price;

  if (!supplierName || !purchaseDate) {
      return res.status(400).json({ message: 'Supplier name and purchase date are required' });
  }

  // Generate invoice number using purchaseDate
  const datePart = moment(purchaseDate).format('YYYYMMDD');
  const prefix = 'INV-';
  let invoiceNumber;

  // Query to find the latest invoice number for the given purchaseDate
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
          res.status(500).json({ message: err.message });
          return;
      }

      if (results.length > 0) {
          const lastInvoiceNumber = results[0].invoice_number;
          const lastSequence = parseInt(lastInvoiceNumber.split('-')[2]);
          const newSequence = lastSequence + 1;
          invoiceNumber = `${prefix}${datePart}-${newSequence.toString().padStart(3, '0')}`;
      } else {
          invoiceNumber = `${prefix}${datePart}-001`;
      }

      // Insert the purchase record with the new invoice number
      const insertPurchaseQuery = `
          INSERT INTO purchases (invoice_number, supplier_name, purchase_date, paid) 
          VALUES (?, ?, ?, ?);
      `;
      const purchaseValues = [invoiceNumber, supplierName, purchaseDate, paid];

      pool.query(insertPurchaseQuery, purchaseValues, (err) => {
          if (err) {
              console.error('Error inserting purchase:', err);
              res.status(500).json({ message: err.message });
              return;
          }

          // Insert product details
          const productQueries = products.map((product, index) => {
              const quantity = quantities[index];
              const price = prices[index];
              const insertProductQuery = `
                  INSERT INTO purchase_products (invoice_number, product, quantity, price) 
                  VALUES (?, ?, ?, ?);
              `;
              return pool.query(insertProductQuery, [invoiceNumber, product, quantity, price]);
          });

          Promise.all(productQueries)
              .then(() => {
                  if (paid) {
                      // Calculate total amount and insert into purchase_paymentbreakdown
                      const totalAmount = products.reduce((acc, _, index) => {
                          return acc + (quantities[index] * prices[index]);
                      }, 0);

                      const insertPaymentQuery = `
                          INSERT INTO purchase_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount)
                          VALUES (?, ?, ?, ?, ?);
                      `;
                      const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, totalAmount];

                      pool.query(insertPaymentQuery, paymentValues, (err) => {
                          if (err) {
                              console.error('Error inserting payment breakdown:', err);
                              res.status(500).json({ message: err.message });
                              return;
                          }
                          res.redirect('/purchase');
                      });
                  } else {
                      res.redirect('/purchase');
                  }
              })
              .catch((error) => {
                  console.error('Error inserting products:', error);
                  res.status(500).json({ message: error.message });
              });
      });
  });
});
app.get('/get-suppliers', (req, res) => {
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
app.get('/get-products', (req, res) => {
  const searchQuery = req.query.q; // Get the query parameter
  const query = 'SELECT DISTINCT product FROM purchase_products WHERE product LIKE ?';
  const searchTerm = `${searchQuery}%`; // Search term for names starting with the input

  pool.query(query, [searchTerm], (err, results) => {
    if (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: err.message });
      return;
    }
    const productNames = results.map(row => row.product);
    res.json(productNames); // Return matching product names as JSON
  });
});
// Purchase payment breakdown
app.get('/purchase-paymentbreakdown', function(req, res) {
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
    GROUP BY p.invoice_number, p.supplier_name, p.purchase_date, pb.paid_date, pb.amount, pb.paid_by
    ORDER BY p.purchase_date DESC, pb.paid_date DESC;
  `;

  pool.query(query, (err, results) => {
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

    // Convert map to array
    const settledPurchases = Object.values(invoices).filter(purchase => purchase.amount_due === 0);
    const unpaidPurchases = Object.values(invoices).filter(purchase => purchase.amount_due > 0);

    // Render the EJS view with both unpaid and settled results
    res.render('purchase_paymentbreakdown', {
      unpaidPurchases,
      settledPurchases
    });
  });
});
app.get('/get-payment-files', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  const query = `
    SELECT payment_file 
    FROM purchase_paymentbreakdown 
    WHERE invoice_number = ? AND payment_file IS NOT NULL
  `;

  pool.query(query, [invoiceNumber], (err, results) => {
    if (err) {
      console.error('Error fetching payment files:', err);
      res.status(500).json({ message: 'Error fetching payment files' });
      return;
    }

    const files = results.map(row => row.payment_file);
    res.json(files);
  });
});
app.get('/download-payment-files', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  const query = `
      SELECT payment_file 
      FROM purchase_paymentbreakdown 
      WHERE invoice_number = ? AND payment_file IS NOT NULL
  `;

  pool.query(query, [invoiceNumber], (err, results) => {

      if (err) {
          console.error('Error fetching payment files:', err);
          return res.status(500).json({ message: 'Error fetching payment files' });
      }

      const files = results.map(row => path.join(__dirname, 'uploads', row.payment_file));

      if (files.length === 0) {
          return res.status(404).json({ message: 'No files found for this invoice.' });
      }

      const zipFileName = `${invoiceNumber}_files.zip`;
      const output = fs.createWriteStream(zipFileName);
      const archive = archiver('zip');

      output.on('close', () => {
          console.log(`Archived ${archive.pointer()} total bytes`);
          res.download(zipFileName, (err) => {
              if (err) {
                  console.error('Error downloading zip file:', err);
              }
              fs.unlinkSync(zipFileName); // Delete the zip file after download
          });
      });

      archive.on('error', (err) => {
          console.error('Error creating zip archive:', err);
          res.status(500).json({ message: 'Error creating zip archive' });
      });

      archive.pipe(output);
      files.forEach(file => {
          if (fs.existsSync(file)) {
              console.log('Adding file to archive:', file); // Log each file being added
              archive.file(file, { name: path.basename(file) });
          } else {
              console.error('File does not exist:', file); // Log if file does not exist
          }
      });
      archive.finalize();
  });
});
app.post('/submit-payment', upload.single('paymentFile'), (req, res) => {
  const { invoiceNumber, paidBy, paidDate, amountPaid } = req.body;
  const paymentFile = req.file ? req.file.filename : null;

  if (!invoiceNumber || !paidBy || !paidDate || !amountPaid) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Insert payment details into the purchase_paymentbreakdown table
  const insertPaymentQuery = `
      INSERT INTO purchase_paymentbreakdown (invoice_number, paid_by, paid_date, payment_file, amount)
      VALUES (?, ?, ?, ?, ?);
  `;
  const paymentValues = [invoiceNumber, paidBy, paidDate, paymentFile, amountPaid];

  pool.query(insertPaymentQuery, paymentValues, (err) => {
    if (err) {
      console.error('Error inserting payment breakdown:', err);
      return res.status(500).json({ message: 'Error inserting payment breakdown' });
    }

    // After inserting payment, check if the invoice is fully paid
    const checkPaymentStatusQuery = `
        SELECT 
            (SELECT SUM(quantity * price) FROM purchase_products WHERE invoice_number = ?) AS total_invoice_amount,
            (SELECT SUM(amount) FROM purchase_paymentbreakdown WHERE invoice_number = ?) AS total_paid_amount
    `;
    
    pool.query(checkPaymentStatusQuery, [invoiceNumber, invoiceNumber], (err, results) => {
      if (err) {
        console.error('Error fetching payment status:', err);
        return res.status(500).json({ message: 'Error checking payment status' });
      }

      const totalInvoiceAmount = results[0].total_invoice_amount || 0;
      const totalPaidAmount = results[0].total_paid_amount || 0;

      // Only mark as fully paid if totalPaidAmount exactly matches totalInvoiceAmount
      if (totalPaidAmount === totalInvoiceAmount) {
        // Update the purchases table to mark this invoice as fully paid
        const updatePurchaseQuery = `
            UPDATE purchases 
            SET paid = 1 
            WHERE invoice_number = ?;
        `;

        pool.query(updatePurchaseQuery, [invoiceNumber], (err) => {
          if (err) {
            console.error('Error updating purchase status:', err);
            return res.status(500).json({ message: 'Error updating purchase status' });
          }

          res.redirect('/purchase-paymentbreakdown');
        });
      } else {
        // If not fully paid, redirect back to payment breakdown without changing the status
        res.redirect('/purchase-paymentbreakdown');
      }
    });
  });
});
// Purchase invoice
app.get('/purchase-invoice', function(req, res) {
  const query = `
    SELECT 
      p.invoice_number, 
      p.supplier_name, 
      p.purchase_date, 
      COALESCE(SUM(pp.quantity * pp.price), 0) AS total_amount
    FROM purchases p
    LEFT JOIN purchase_products pp ON p.invoice_number = pp.invoice_number
    WHERE p.paid = 1
    GROUP BY p.invoice_number, p.supplier_name, p.purchase_date
    ORDER BY p.purchase_date DESC;
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching paid invoices:', err);
      res.status(500).json({ message: 'Error fetching paid invoices' });
      return;
    }

    // Render the purchase_invoice view with the fetched data
    res.render('purchase_invoice', { invoices: results });
  });
});
app.get('/generate-invoice', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Fetch the invoice details based on the invoice number
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
    WHERE p.invoice_number = ?
    GROUP BY p.invoice_number, pp.product, pp.quantity, pp.price, p.supplier_name, p.purchase_date
  `;

  pool.query(query, [invoiceNumber], (err, results) => {
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
        price: row.price
      }))
    };

    // Render the invoice using the template.ejs and send as response
    res.render('template', { invoice });
  });
});
app.get('/download-invoice-pdf', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Similar to /generate-invoice but used for PDF generation
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
    WHERE p.invoice_number = ?
    GROUP BY p.invoice_number, pp.product
  `;

  pool.query(query, [invoiceNumber], (err, results) => {
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
        price: row.price
      }))
    };

    // Render the invoice to HTML
    res.render('template', { invoice }, (err, html) => {
      if (err) {
        console.error('Error rendering invoice to HTML:', err);
        return res.status(500).json({ message: 'Error rendering invoice to HTML' });
      }

      // Generate PDF from HTML
      const options = { format: 'A4' };
      pdf.create(html, options).toBuffer((err, buffer) => {
        if (err) {
          console.error('Error generating PDF:', err);
          return res.status(500).json({ message: 'Error generating PDF' });
        }

        // Send the PDF as a response
        res.setHeader('Content-Disposition', `attachment; filename=${invoiceNumber}.pdf`);
        res.contentType("application/pdf");
        res.send(buffer);
      });
    });
  });
});



app.get('/api/purchase-products', (req, res) => {
  const query = `
    SELECT pp.product, pp.quantity AS total_quantity, COALESCE(SUM(s.quantity), 0) AS total_sold
    FROM purchase_products pp
    LEFT JOIN sales s ON pp.product = s.product
    GROUP BY pp.product, pp.quantity`;

  pool.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server Error');
    }

    const products = results.map(row => {
      const availableQuantity = row.total_quantity - row.total_sold;
      return {
        product: row.product,
        availableQuantity: availableQuantity,
        price: row.price // Assuming 'price' is in the 'purchase_products' table
      };
    });

    res.json(products);
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