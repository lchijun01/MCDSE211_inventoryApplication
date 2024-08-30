const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });
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

// Use a reverse proxy to forward requests to the Node.js server running on port 2000
app.use('/api', createProxyMiddleware({ target: 'http://localhost: ', changeOrigin: true }));
// Mysql database setting
const pool = mysql.createPool({
    poolLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'abc123',
    database: 'cjinventorysystemv1'
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
app.get('/', (req, res) => {
  res.render('index');
});
// Import & Export
app.get('/database', function(req, res) {
  const successMessage = req.query.success; // Get the success parameter from the query string
  res.render('database', { successMessage: successMessage });
});
app.post('/importSales', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  const invoiceNos = new Set(); // Set to keep track of InvoiceNos already inserted into the sell_invoice table

  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { InvoiceNo, Date, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, sku, Product_Name, SizeUS, Quantity, UnitPrice, Amount, gender, Remarks, CostPrice, ship } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!invoiceNos.has(InvoiceNo)) {
        // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
        invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
        pool.query('INSERT INTO yysell_invoice (Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks, Date], (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
            pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, product_name, SizeUS, Quantity, UnitPrice, Amount, gender, CostPrice, ship) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, sku, Product_Name, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, CostPrice, ship], (error, results, fields) => {
              if (error) {
                console.error(error);
              } else {
                console.log(`Data successfully inserted for InvoiceNo ${InvoiceNo}`);
              }
            });
          }
        });
      } else {
        // If the InvoiceNo has already been inserted into the sell_invoice table, insert the corresponding data into the items_sell table only
        pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, product_name, SizeUS, Quantity, UnitPrice, Amount, gender, CostPrice, ship) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, sku, Product_Name, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, CostPrice, ship], (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${InvoiceNo}`);
          }
        });
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/database?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportSales', function(req, res) {
  const sql = `SELECT yysell_invoice.Invoice_number, yysell_invoice.Name, yysell_invoice.Remarks, yysell_invoice.Phone, yysell_invoice.timestamp As date, yysell_invoice.Address1, yysell_invoice.Address2, yysell_invoice.Address3, yysell_invoice.PostCode, yysell_invoice.City, yysell_invoice.State, yysell_invoice.Country, yyitems_sell.Content_SKU, yyitems_sell.product_name, yyitems_sell.SizeUS, yyitems_sell.Quantity, yyitems_sell.UnitPrice, yyitems_sell.Amount, yyitems_sell.gender, yyitems_sell.CostPrice, yyitems_sell.ship
                FROM yysell_invoice
                LEFT JOIN yyitems_sell ON yysell_invoice.Invoice_number = yyitems_sell.InvoiceNumber
                ORDER BY yysell_invoice.Invoice_number, yyitems_sell.Content_SKU, yyitems_sell.CostPrice, yyitems_sell.ship`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string

      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Date: formattedDate, // Use the formatted date property
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          sku: row.Content_SKU,
          Product_Name: row.product_name,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount,
          gender: row.gender,
          Remarks: row.Remarks,
          CostPrice: row.CostPrice,
          ship: row.ship
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV with only the item data
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Date: formattedDate, // Use the formatted date property
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          sku: row.Content_SKU,
          Product_Name: row.product_name,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount,
          gender: row.gender,
          CostPrice: row.CostPrice,
          ship: row.ship
        });
      }
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yysales.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
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
  const query = 'SELECT DISTINCT name FROM suppliers';
  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching suppliers:', err);
      res.status(500).json({ message: err.message });
      return;
    }
    const supplierNames = results.map(row => row.name);
    res.render('purchase', { suppliers: supplierNames, message: null });
  });
});
app.post('/purchase', (req, res) => {
  const supplierName = req.body.supplierName;  // Match the name attribute in your form
  const purchaseAmount = req.body.purchaseAmount;
  const product = req.body.product;  // Just for demonstration

  if (!supplierName) {
    return res.status(400).json({ message: 'Supplier name is required' });
  }

  const query = 'INSERT INTO suppliers (name) VALUES (?)';
  pool.query(query, [supplierName], (err, results) => {
    if (err) {
      console.error('Error inserting supplier:', err); // Log error to console
      res.status(500).json({ message: err.message });
      return;
    }
    // Redirect back to the purchase page after successful insertion
    res.redirect('/purchase');
  });
});
app.get('/get-suppliers', (req, res) => {
  const searchQuery = req.query.q; // Get the query parameter
  const query = 'SELECT DISTINCT name FROM suppliers WHERE name LIKE ?';
  const searchTerm = `${searchQuery}%`; // Search term for names starting with the input

  pool.query(query, [searchTerm], (err, results) => {
    if (err) {
      console.error('Error fetching suppliers:', err);
      res.status(500).json({ message: err.message });
      return;
    }
    const supplierNames = results.map(row => row.name);
    res.json(supplierNames); // Return matching supplier names as JSON
  });
});
app.get('/get-product', (req, res) => {
  const searchQuery = req.query.q; // Get the query parameter
  const query = 'SELECT DISTINCT name FROM products WHERE name LIKE ?';
  const searchTerm = `${searchQuery}%`; // Search term for names starting with the input

  pool.query(query, [searchTerm], (err, results) => {
    if (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: err.message });
      return;
    }
    const productNames = results.map(row => row.name);
    res.json(productNames); // Return matching product names as JSON
  });
});

app.get('/purchase-paymentbreakdown', function(req, res){
  res.render('purchase_paymentbreakdown');
});
app.get('/purchase-invoice', function(req, res){
  res.render('purchase_invoice');
});



// if Broke backk to Page
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