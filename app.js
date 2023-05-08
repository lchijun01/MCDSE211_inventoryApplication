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

// Use a reverse proxy to forward requests to the Node.js server running on port 5000
app.use('/api', createProxyMiddleware({ target: 'http://192.168.0.103:5000', changeOrigin: true }));

const pool = mysql.createPool({
    poolLimit: 10,
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'test11'
  });

const urlencodedParser = bodyParser.urlencoded({extended: false});
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

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.get('/', (req, res) => {
  // render the EJS template with the fetched data
  res.render('index');
});
app.get('/profitlossstate', (req, res) => {
  const currentYear = new Date().getFullYear(); // get current year

  // fetch distinct years from yyitems_sell table
  pool.query('SELECT DISTINCT YEAR(timestamp) AS year FROM yysell_invoice ORDER BY year DESC', (err, results) => {
    if (err) throw err;
    const years = results;

    // set default selected year to current year
    let selectedYear = currentYear;

    // check if year is selected from the dropdown
    if (req.query.year) {
      selectedYear = parseInt(req.query.year);
    }

    const lastYear = (selectedYear - 1);
    const bfYear = (selectedYear -2);

    // fetch total sales for the selected year from yyitems_sell table
    pool.query('SELECT SUM(UnitPrice) AS total_salesno FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
      if (err) throw err;
      const totalSalesno = results[0].total_salesno;

      // fetch total sales for the selected year from yyitems_sell table where Content_SKU is not null
      pool.query('SELECT SUM(Amount) AS total_sales FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
        if (err) throw err;
        const totalSales = results[0].total_sales;

        pool.query('SELECT SUM(CostPrice) AS total_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
          if (err) throw err;
          const totalCost = results[0].total_cost;

          // fetch total purchases for the selected year from yyitems_buy table
          pool.query('SELECT SUM(Amount) AS total_purchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
            if (err) throw err;
            const totalPurchases = results[0].total_purchases;

            pool.query('SELECT SUM(Amount) AS total_purchasesLastyear FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) < ?)', [selectedYear], (err, results) => {
              if (err) throw err;
              const totalPurchasesLastyear = results[0].total_purchasesLastyear;

              pool.query('SELECT SUM(CostPrice) AS total_costLastyear FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                if (err) throw err;
                const totalCostLastyear = results[0].total_costLastyear;


                pool.query('SELECT SUM(Amount) AS total_buy FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND YEAR(solddate) = ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) < ?)', [selectedYear,selectedYear], (err, results) => {
                  if (err) throw err;
                  const totalbuy = results[0].total_buy;

                  pool.query('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                    if (err) throw err;
                    const totalPurchasesno = results[0].total_purchasesno;

                    pool.query('SELECT SUM(Amount) AS total_purchasesWOnosku FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                      if (err) throw err;
                      const total_purchasesWOnosku = results[0].total_purchasesWOnosku;

                      // fetch total expenses for the selected year from yyexpensesrecord table
                      pool.query('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category', [selectedYear], (err, results) => {
                        if (err) throw err;
                        const categories = results;
                        const totalExpensesByCategory = categories.reduce((acc, cur) => acc + cur.total, 0);

                        // fetch total stock value for the selected year from yyitems_buy table
                        pool.query('SELECT SUM(UnitPrice) AS total_stock_value  FROM yyitems_buy WHERE YEAR(solddate) != ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear, selectedYear], (err, results) => {
                          if (err) throw err;
                          const totalStockValue = results[0].total_stock_value;

                          pool.query('SELECT SUM(Amount) AS total_ship FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear], (err, results) => {
                            if (err) throw err;
                            const totalship = results[0].total_ship;

                            pool.query('SELECT SUM(Amount) AS total_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                              if (err) throw err;
                              const totalc2p = results[0].total_c2p;
              
                              pool.query('SELECT SUM(Amount) AS total_p2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                                if (err) throw err;
                                const totalp2c = results[0].total_p2c;
              
                                pool.query('SELECT SUM(amount) AS supRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                                  if (err) throw err;
                                  const supRefunds = results[0].supRefund;
              
                                  pool.query('SELECT SUM(amount) AS refundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                                    if (err) throw err;
                                    const refundsales = results[0].refundsales;

                                    pool.query('SELECT SUM(bonuscredit) AS bonus FROM yytopupbalance WHERE YEAR(date) = ?', [selectedYear], (err, results) => {
                                      if (err) throw err;
                                      const bonus = results[0].bonus;

                                      pool.query('SELECT SUM(Amount) AS bftotal_sales FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                                        if (err) throw err;
                                        const bftotalSales = results[0].bftotal_sales;
                                
                                        pool.query('SELECT SUM(Amount) AS bftotal_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                                          if (err) throw err;
                                          const bftotalPurchasesno = results[0].bftotal_purchasesno;
                                        
                                          pool.query('SELECT SUM(Amount) AS bftotal_purchasesWOnosku FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                                            if (err) throw err;
                                            const bftotal_purchasesWOnosku = results[0].bftotal_purchasesWOnosku;
                      
                                            pool.query('SELECT SUM(Amount) AS bftotal_ship FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [lastYear], (err, results) => {
                                              if (err) throw err;
                                              const bftotalship = results[0].bftotal_ship;
                  
                                              pool.query('SELECT SUM(Amount) AS bftotal_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [lastYear], (err, results) => {
                                                if (err) throw err;
                                                const bftotalc2p = results[0].bftotal_c2p;
                                
                                                pool.query('SELECT SUM(Amount) AS bftotal_p2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [lastYear], (err, results) => {
                                                  if (err) throw err;
                                                  const bftotalp2c = results[0].bftotal_p2c;
                                
                                                  pool.query('SELECT SUM(amount) AS bfsupRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [lastYear], (err, results) => {
                                                    if (err) throw err;
                                                    const bfsupRefunds = results[0].bfsupRefund;
                                
                                                    pool.query('SELECT SUM(amount) AS bfrefundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [lastYear], (err, results) => {
                                                      if (err) throw err;
                                                      const bfrefundsales = results[0].bfrefundsales;
                  
                                                      pool.query('SELECT SUM(bonuscredit) AS bfbonus FROM yytopupbalance WHERE YEAR(date) = ?', [lastYear], (err, results) => {
                                                        if (err) throw err;
                                                        const bfbonus = results[0].bfbonus;

                                                        pool.query('SELECT SUM(Amount) AS bftotal_purchasesLastyear FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [bfYear], (err, results) => {
                                                          if (err) throw err;
                                                          const bftotalPurchasesLastyear = results[0].bftotal_purchasesLastyear;
                                                        
                                                          pool.query('SELECT SUM(CostPrice) AS bftotal_costLastyear FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [bfYear], (err, results) => {
                                                            if (err) throw err;
                                                            const bftotalCostLastyear = results[0].bftotal_costLastyear;
                                                        
                                                            pool.query('SELECT SUM(CostPrice) AS bftotal_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [lastYear], (err, results) => {
                                                              if (err) throw err;
                                                              const bftotalCost = results[0].bftotal_cost;
                                                  
                                                              pool.query('SELECT SUM(Amount) AS bftotal_purchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [lastYear], (err, results) => {
                                                                if (err) throw err;
                                                                const bftotalPurchases = results[0].bftotal_purchases;
                                                  
                                                                pool.query('SELECT Category, SUM(Amount) AS bftotal FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category', [lastYear], (err, results) => {
                                                                  if (err) throw err;
                                                                  const bfcategories = results;
                                                                  const bftotalExpensesByCategory = bfcategories.reduce((acc, cur) => acc + cur.bftotal, 0);

                                                                  pool.query('SELECT SUM(UnitPrice) AS bftotal_salesno FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                                                                    if (err) throw err;
                                                                    const bftotalSalesno = results[0].bftotal_salesno;

                                                                    // render the EJS template with the fetched data
                                                                    res.render('profitlossstate', { 
                                                                      totalSales, 
                                                                      totalSalesno,
                                                                      totalCost,
                                                                      totalPurchases, 
                                                                      totalExpenses: totalExpensesByCategory, 
                                                                      categories,
                                                                      totalStockValue,
                                                                      totalship,
                                                                      totalPurchasesno,
                                                                      totalc2p,
                                                                      totalp2c,
                                                                      supRefunds,
                                                                      refundsales,
                                                                      years,
                                                                      selectedYear,
                                                                      total_purchasesWOnosku,
                                                                      totalbuy,
                                                                      totalPurchasesLastyear,
                                                                      totalCostLastyear,
                                                                      bonus,
                                                                      bftotalSales,
                                                                      bftotalPurchasesno,
                                                                      bftotal_purchasesWOnosku,
                                                                      bftotalship,
                                                                      bftotalc2p,
                                                                      bftotalp2c,
                                                                      bfsupRefunds,
                                                                      bfrefundsales,
                                                                      bfbonus,
                                                                      bftotalPurchasesLastyear,
                                                                      bftotalCostLastyear,
                                                                      bftotalPurchasesno,
                                                                      bftotal_purchasesWOnosku,
                                                                      bftotalCost,
                                                                      bftotalPurchases,
                                                                      bftotalExpenses: bftotalExpensesByCategory,
                                                                      bftotalSalesno
                                                                    });
                                                                  });
                                                                });
                                                              });
                                                            });
                                                          });
                                                        });
                                                      });
                                                    });
                                                  });
                                                });
                                              });
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
app.get('/balanceSheet', (req, res) => {
  const currentYear = new Date().getFullYear(); // get current year

  // fetch distinct years from yyitems_sell table
  pool.query('SELECT DISTINCT YEAR(timestamp) AS year FROM yysell_invoice ORDER BY year DESC', (err, results) => {
    if (err) throw err;
    const years = results;

    // set default selected year to current year
    let selectedYear = currentYear;

    // check if year is selected from the dropdown
    if (req.query.year) {
      selectedYear = parseInt(req.query.year);
    }

    // fetch total sales for the selected year from yyitems_sell table
    pool.query('SELECT SUM(UnitPrice) AS total_salesno FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
      if (err) throw err;
      const totalSalesno = results[0].total_salesno;

      // fetch total sales for the selected year from yyitems_sell table where Content_SKU is not null
      pool.query('SELECT SUM(Amount) AS total_topup FROM yytopupbalance WHERE YEAR(`date`) = ?', [selectedYear], (err, results) => {
        if (err) throw err;
        const totaltopup = results[0].total_sales;

        // fetch total purchases for the selected year from yyitems_buy table
        pool.query('SELECT SUM(Amount) AS total_purchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
          if (err) throw err;
          const totalPurchases = results[0].total_purchases;
          pool.query('SELECT SUM(CostPrice) AS total_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
            if (err) throw err;
            const totalCost = results[0].total_cost;

            pool.query('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
              if (err) throw err;
              const totalPurchasesno = results[0].total_purchasesno;

              // fetch total expenses for the selected year from yyexpensesrecord table
              pool.query('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category', [selectedYear], (err, results) => {
                if (err) throw err;
                const categories = results;
                const totalExpensesByCategory = categories.reduce((acc, cur) => acc + cur.total, 0);

                // fetch total stock value for the selected year from yyitems_buy table
                pool.query('SELECT SUM(UnitPrice) AS total_stock_value  FROM yyitems_buy  WHERE sold = "no" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                  if (err) throw err;
                  const totalStockValue = results[0].total_stock_value;

                  pool.query('SELECT SUM(Amount) AS total_ship FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear], (err, results) => {
                    if (err) throw err;
                    const totalship = results[0].total_ship;

                    pool.query('SELECT SUM(Amount) AS total_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                      if (err) throw err;
                      const totalc2p = results[0].total_c2p;
      
                      pool.query('SELECT SUM(Amount) AS total_p2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                        if (err) throw err;
                        const totalp2c = results[0].total_p2c;
      
                        pool.query('SELECT SUM(amount) AS supRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                          if (err) throw err;
                          const supRefunds = results[0].supRefund;
      
                          pool.query('SELECT SUM(amount) AS refundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                            if (err) throw err;
                            const refundsales = results[0].refundsales;
      
                            // render the EJS template with the fetched data
                            res.render('balanceSheet', { 
                              totaltopup, 
                              totalSalesno,
                              totalPurchases, 
                              totalExpenses: totalExpensesByCategory, 
                              categories,
                              totalStockValue,
                              totalship,
                              totalPurchasesno,
                              totalc2p,
                              totalp2c,
                              supRefunds,
                              refundsales,
                              years,
                              selectedYear,
                              totalCost
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
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
app.get('/signup', (req, res) => {
  res.render('signup');
});
app.post('/login', urlencodedParser, async (req, res) => {
  const { username, password } = req.body;

  // You can replace this with a database query to fetch the user's details
  const user = {
    username: 'ykzone',
    password: await bcrypt.hash('amitofo123', 10)
  };

  if (username === user.username && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid username or password' });
  }
});
//-------------------------------------Import & Export---------------------------------------------------------------------------------------------------------------------
app.get('/inout', function(req, res) {
  const successMessage = req.query.success; // Get the success parameter from the query string
  res.render('inout', { successMessage: successMessage });
});
//----------------------------Y Kick Zone Shop----------------------------------------------
app.post('/importsell_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  const invoiceNos = new Set(); // Set to keep track of InvoiceNos already inserted into the sell_invoice table

  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { InvoiceNo, Date, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, sku, Product_Name, Quantity, SizeUS, UnitPrice, Amount, gender, Remarks } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!invoiceNos.has(InvoiceNo)) {
        // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
        invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
        pool.query('INSERT INTO sell_invoice (Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks, Date], (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
            pool.query('INSERT INTO items_sell (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, sku, Product_Name, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender], (error, results, fields) => {
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
        pool.query('INSERT INTO items_sell (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, sku, Product_Name, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender], (error, results, fields) => {
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
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportsell_csv', function(req, res) {
  const sql = `SELECT sell_invoice.Invoice_number, sell_invoice.Name, sell_invoice.Phone, sell_invoice.Remarks, sell_invoice.timestamp As date, sell_invoice.Address1, sell_invoice.Address2, sell_invoice.Address3, sell_invoice.PostCode, sell_invoice.City, sell_invoice.State, sell_invoice.Country, items_sell.Content_SKU, items_sell.ProductName, items_sell.SizeUS, items_sell.Quantity, items_sell.UnitPrice, items_sell.Amount, items_sell.gender
                FROM sell_invoice
                LEFT JOIN items_sell ON sell_invoice.Invoice_number = items_sell.InvoiceNumber
                LEFT JOIN items_buy ON items_sell.Content_SKU = items_buy.Content_SKU AND items_sell.SizeUS = items_buy.SizeUS
                ORDER BY sell_invoice.Invoice_number, items_sell.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string

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
          Remarks: row.Remarks
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
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sell_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importspay_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { InvoiceNumber, Date, Amount, IntoWhichBank, OtherCurrencyRemark } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      pool.query('INSERT INTO sales_paymentbreakdown ( Date, Invoice_No, Bank, Amount, Remarks ) VALUES (?, ?, ?, ?, ?)', [Date, InvoiceNumber, IntoWhichBank, parsedAmount, OtherCurrencyRemark], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${InvoiceNumber}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportspay_csv', function(req, res) {
  const sql = `SELECT sales_paymentbreakdown.Invoice_No, sales_paymentbreakdown.Date as date, sales_paymentbreakdown.Bank, sales_paymentbreakdown.Amount, sales_paymentbreakdown.Remarks
               FROM sales_paymentbreakdown
               ORDER BY sales_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          InvoiceNumber: row.Invoice_No,
          Date: formattedDate,
          IntoWhichBank: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ykzsalespaymentbreakdown_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importbuy_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  const invoiceNos = new Set(); // Set to keep track of InvoiceNos already inserted into the sell_invoice table

  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { PONo, Date, Name, BankName, Bank, BankNumber, Remarks, ProductName, SizeUS, Quantity, UnitPrice, Amount, SKU, gender } = data;
      const parsedUnitPrice = parseFloat(UnitPrice && UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!isNaN(parsedUnitPrice) && !isNaN(parsedAmount)) {
        // Only insert the row if parsedUnitPrice and parsedAmount are not NaN
        if (!invoiceNos.has(PONo)) {
          // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
          invoiceNos.add(PONo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
          pool.query('INSERT INTO buy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)', [PONo, Name, BankName, Bank, BankNumber,Remarks, Date], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
              pool.query('INSERT INTO items_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender], (error, results) => {
                if (error) {
                  console.error(error);
                } else {
                  console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
                }
              });
            }
          });
        } else {
          // If the InvoiceNo has already been inserted into the sell_invoice table, insert the corresponding data into the items_sell table only
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender], (error, results) => {
            if (error) {
              console.error(error);
            } else {
              console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
            }
          });
        }
      } else {
        console.log(`Skipping row with InvoiceNo ${PONo} due to NaN values`);
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportbuy_csv', function(req, res) {
  const sql = `SELECT buy_record.Invoice_number, buy_record.Name, buy_record.BankName, buy_record.Bank, buy_record.timestamp as date, buy_record.Bankaccount, buy_record.Remarks, items_buy.Content_SKU, items_buy.ProductName, items_buy.SizeUS, items_buy.Quantity, items_buy.UnitPrice, items_buy.Amount
               FROM buy_record
               JOIN items_buy ON yybuy_record.Invoice_number = items_buy.InvoiceNumber
               ORDER BY buy_record.Invoice_number, items_buy.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string

      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          PONo: row.Invoice_number,
          Date: formattedDate,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          ProductName: row.ProductName,
          SKU: row.Content_SKU,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount, 
          gender: row.gender
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV
        csvData.push({
          PONo: row.Invoice_number,
          Date: formattedDate,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          ProductName: row.ProductName,
          SKU: row.Content_SKU,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount,
          gender: row.gender
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=buy_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importbpay_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { PONo, Date, Amount, To, OtherCurrencyRemark, BankRefs } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));


      pool.query('INSERT INTO purchase_paymentbreakdown ( Date, Invoice_No, Bank, Amount, Remarks, BankRefs ) VALUES (?, ?, ?, ?, ?, ?)', [Date, PONo, To, parsedAmount, OtherCurrencyRemark, BankRefs], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportbpay_csv', function(req, res) {
  const sql = `SELECT purchase_paymentbreakdown.Invoice_No, purchase_paymentbreakdown.Date as date, purchase_paymentbreakdown.Bank, purchase_paymentbreakdown.Amount, purchase_paymentbreakdown.Remarks, purchase_paymentbreakdown.BankRefs
               FROM purchase_paymentbreakdown
               ORDER BY purchase_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          PONo: row.Invoice_No,
          Date: formattedDate,
          To: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks,
          BankRefs: row.BankRefs
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ykzpurchasepaymentbreakdown_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
// y kick zone expenses record
app.post('/importexpenses_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { Date, InvoiceNumber, Category, Bank, Name, Amount, Detail } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      pool.query('INSERT INTO expensesrecord ( Date, Invoice_No, Category, Bank, Name, Amount, Detail ) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date, InvoiceNumber, Category, Bank, Name, parsedAmount, Detail], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${InvoiceNumber}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportexpenses_csv', function(req, res) {
  const sql = `SELECT ykzexpensesrecord.Invoice_No, ykzexpensesrecord.Date as date, ykzexpensesrecord.Bank, ykzexpensesrecord.Amount, ykzexpensesrecord.Name, ykzexpensesrecord.Category, ykzexpensesrecord.Detail
               FROM ykzexpensesrecord
               ORDER BY ykzexpensesrecord.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          InvoiceNumber: row.Invoice_No,
          Date: formattedDate,
          Category: row.Category,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ykzexpenses_record_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
//----------------------------Yong & Yi Partnership Enterprise----------------------------------------------done change
app.post('/yyimportsell_csv', upload.single('file'), function (req, res) {
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
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportsell_csv', function(req, res) {
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
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string

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

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yysell_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/yyimportspay_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { InvoiceNumber, Date, Amount, IntoWhichBank, OtherCurrencyRemark } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      pool.query('INSERT INTO yysales_paymentbreakdown ( Date, Invoice_No, Bank, Amount, Remarks ) VALUES (?, ?, ?, ?, ?)', [Date, InvoiceNumber, IntoWhichBank, parsedAmount, OtherCurrencyRemark], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${InvoiceNumber}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportspay_csv', function(req, res) {
  const sql = `SELECT yysales_paymentbreakdown.Invoice_No, yysales_paymentbreakdown.Date as date, yysales_paymentbreakdown.Bank, yysales_paymentbreakdown.Amount, yysales_paymentbreakdown.Remarks
               FROM yysales_paymentbreakdown
               ORDER BY yysales_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          InvoiceNumber: row.Invoice_No,
          Date: formattedDate,
          IntoWhichBank: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yysalespaymentbreakdown_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/yyimportbuy_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  const invoiceNos = new Set(); // Set to keep track of InvoiceNos already inserted into the sell_invoice table

  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { PONo, Date, Name, BankName, Bank, BankNumber, Remarks, ProductName, SizeUS, Quantity, UnitPrice, Amount, SKU, gender, sold, status, solddate} = data;
      const parsedUnitPrice = parseFloat(UnitPrice && UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));
      const solddateValue = solddate ? moment(solddate, 'YYYY-MM-DD').toDate() : null;

      if (!isNaN(parsedUnitPrice) && !isNaN(parsedAmount)) {
        // Only insert the row if parsedUnitPrice and parsedAmount are not NaN
        if (!invoiceNos.has(PONo)) {
          // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
          invoiceNos.add(PONo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
          pool.query('INSERT INTO yybuy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)', [PONo, Name, BankName, Bank, BankNumber,Remarks, Date], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
              pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender, sold, status, solddate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, sold, status, solddateValue], (error, results) => {
                if (error) {
                  console.error(error);
                } else {
                  console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
                }
              });
            }
          });
        } else {
          // If the InvoiceNo has already been inserted into the sell_invoice table, insert the corresponding data into the items_sell table only
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender, sold, status, solddate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, sold, status, solddateValue], (error, results) => {
            if (error) {
              console.error(error);
            } else {
              console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
            }
          });
        }
      } else {
        console.log(`Skipping row with InvoiceNo ${PONo} due to NaN values`);
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportbuy_csv', function(req, res) {
  const sql = `SELECT yybuy_record.Invoice_number, yybuy_record.Name, yybuy_record.Remarks, yybuy_record.BankName, yybuy_record.Bank, yybuy_record.Bankaccount, yybuy_record.timestamp As date, yyitems_buy.Content_SKU, yyitems_buy.ProductName, yyitems_buy.SizeUS, yyitems_buy.Quantity, yyitems_buy.UnitPrice, yyitems_buy.Amount, yyitems_buy.gender, yyitems_buy.sold, yyitems_buy.status, yyitems_buy.solddate
                FROM yybuy_record
                LEFT JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber
                ORDER BY yybuy_record.Invoice_number, yyitems_buy.Content_SKU, yyitems_buy.sold, yyitems_buy.status, yyitems_buy.solddate`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string

      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          PONo: row.Invoice_number,
          Date: formattedDate, // Use the formatted date property
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          SKU: row.Content_SKU,
          ProductName: row.ProductName,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount,
          gender: row.gender,
          sold: row.sold,
          status: row.status,
          solddate: row.solddate
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV with only the item data
        csvData.push({
          PONo: row.Invoice_number,
          Date: formattedDate, // Use the formatted date property
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          SKU: row.Content_SKU,
          ProductName: row.ProductName,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount,
          gender: row.gender,
          sold: row.sold,
          status: row.status,
          solddate: row.solddate
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yybuy_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/yyimportbpay_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { PONo, Date, Amount, To, OtherCurrencyRemark, BankRefs } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      pool.query('INSERT INTO yypurchase_paymentbreakdown ( Date, Invoice_No, Bank, Amount, Remarks, BankRefs ) VALUES (?, ?, ?, ?, ?, ?)', [Date, PONo, To, parsedAmount, OtherCurrencyRemark, BankRefs], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${PONo}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportbpay_csv', function(req, res) {
  const sql = `SELECT yypurchase_paymentbreakdown.Invoice_No, yypurchase_paymentbreakdown.Date as date, yypurchase_paymentbreakdown.Bank, yypurchase_paymentbreakdown.Amount, yypurchase_paymentbreakdown.Remarks, yypurchase_paymentbreakdown.BankRefs
               FROM yypurchase_paymentbreakdown
               ORDER BY yypurchase_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          PONo: row.Invoice_No,
          Date: formattedDate,
          To: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks,
          BankRefs: row.BankRefs
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yypurchasepaymentbreakdown_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
// yong and yi expenses record
app.post('/yyimportexpenses_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { Date, InvoiceNumber, Category, Bank, Name, Amount, Detail } = data;
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      pool.query('INSERT INTO yyexpensesrecord ( Date, Invoice_No, Category, Bank, Name, Amount, Detail ) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date, InvoiceNumber, Category, Bank, Name, parsedAmount, Detail], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${InvoiceNumber}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportexpenses_csv', function(req, res) {
  const sql = `SELECT yyexpensesrecord.Invoice_No, yyexpensesrecord.Date as date, yyexpensesrecord.Bank, yyexpensesrecord.Amount, yyexpensesrecord.Name, yyexpensesrecord.Category, yyexpensesrecord.Detail
               FROM yyexpensesrecord
               ORDER BY yyexpensesrecord.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          InvoiceNumber: row.Invoice_No,
          Date: formattedDate,
          Category: row.Category,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yyexpenses_record_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});





app.get('/exportcheckin_csv', function(req, res) {
  const sql = `SELECT stock_checkin.pono, stock_checkin.date as date, stock_checkin.sku, stock_checkin.productname, stock_checkin.size, stock_checkin.quantity
               FROM stock_checkin
               ORDER BY stock_checkin.pono`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = moment(row.date).format('YYYY-MM-DD'); // Use moment.js to format the date string
        csvData.push({
          PONo: row.pono,
          Date: formattedDate,
          SKU: row.sku,
          ProductName: row.productname,
          Size: row.size,
          Quantity: row.quantity
        });
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=check_in_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});







//-------------------------------------Bank statement---------------------------------------------------

app.get('/accruals', function(req,res){
    res.render('accruals');
});
app.post('/accruals',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, category, bank, name, amount, detail } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';
  
    // Insert the form data into MySQL
    pool.query('INSERT INTO accruals (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('accruals');
      }
    });
});
app.get('/other-creditor', function(req, res){
    res.render('other-creditor');
});
app.post('/other-creditor',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, category, bank, name, amount, detail } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';
  
    // Insert the form data into MySQL
    pool.query('INSERT INTO othercreditor (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('other-creditor');
      }
    });
});
app.get('/expenses-record', function(req, res){
    res.render('expenses-record');
});
app.post('/expenses-record',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, category, bank, name, amount, detail } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';
  
    // Insert the form data into MySQL
    pool.query('INSERT INTO expensesrecord (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('expenses-record');
      }
    });
});

//-------------------------------------------------------------------------------------------------

// Define route for stock check page
app.get('/stockaudit', function(req, res) {
  pool.query(`
  SELECT Content_SKU, SizeUS, ProductName, Amount, SUM(Quantity) as total_quantity 
  FROM yyitems_buy WHERE sold = 'no'
  GROUP BY Content_SKU, ProductName, SizeUS, Amount 
  ORDER BY Content_SKU ASC, CAST(SizeUS AS SIGNED) ASC;
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row }));
      res.render('stockaudit', { data });
    }
  });
});
//for stock-checkin
app.get('/stock-checkin', function(req, res){
  const sql = "SELECT InvoiceNumber, Content_SKU, SizeUS , ProductName, SUM(Quantity) as total_quantity FROM yyitems_buy WHERE status = 'intransit' GROUP BY InvoiceNumber, Content_SKU, ProductName, SizeUS";
  pool.query(sql, (err, result) => {
    if (err) throw err;
    res.render('stock-checkin', { items: result });
  });
});
app.get('/stockcheckinasd', (req, res) => {
  const ponum = req.query.ponum;
  const query = `SELECT yyitems_buy.ProductName, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, SUM(yyitems_buy.Quantity) as TotalQuantity, yybuy_record.Name, yybuy_record.Bank, yybuy_record.BankName, yybuy_record.Bankaccount, yybuy_record.Remarks 
  FROM yyitems_buy yyitems_buy 
  JOIN yybuy_record yybuy_record ON yyitems_buy.InvoiceNumber = yybuy_record.Invoice_number 
  WHERE yyitems_buy.InvoiceNumber = ? AND yyitems_buy.status = 'intransit'
  GROUP BY yyitems_buy.ProductName, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, yybuy_record.Name, yybuy_record.Bank, yybuy_record.BankName, yybuy_record.Bankaccount, yybuy_record.Remarks
  `;
  pool.query(query, [ponum], (err, results) => {
    if (err) throw err;
    const data = {
      name: results.map(result => result.ProductName),
      sku: results.map(result => result.Content_SKU),
      size: results.map(result => result.SizeUS),
      quantity: results.map(result => result.TotalQuantity),
      bank: results.map(result => result.Bank),
      seller: results.map(result => result.Name),
      bankName: results.map(result => result.BankName),
      bankAccount: results.map(result => result.Bankaccount),
      remarks: results.map(result => result.Remarks)
    };    
    res.send(data);
  });
});
app.post('/stock-checkin', upload.single('file'), urlencodedParser, function(req, res){
  const { invoice, field1 = [], field3 = [], field4 = [] } = req.body;

  // Loop through each item in the form data
  for (let i = 0; i < field1.length; i++) {
    const sku = field1[i];
    const size = field3[i];
    const quantity = parseInt(field4[i]); // Convert string value to integer

    pool.query(
      'UPDATE yyitems_buy SET status = "check" WHERE InvoiceNumber = ? AND Content_SKU = ? AND SizeUS = ? AND status = "intransit" LIMIT ?',
      [invoice, sku, size, quantity],
      (err, results) => {
        if (err) throw err;
        console.log(`Updated ${results.changedRows} rows for SKU ${sku}, Size ${size}`);
      }
    );
  }

  const sql = "SELECT InvoiceNumber, Content_SKU, SizeUS , ProductName, SUM(Quantity) as total_quantity FROM yyitems_buy WHERE status = 'intransit' GROUP BY InvoiceNumber, Content_SKU, ProductName, SizeUS";
  pool.query(sql, (err, result) => {
    if (err) throw err;
    res.render('stock-checkin', { items: result });
  });
});
app.get('/stock-check', function(req, res) {
  const searchTerm = req.query['search-term'];
  const searchBy = req.query['search-by'];

  let query = `
    SELECT b.Content_SKU, b.ProductName, CAST(b.SizeUS AS DECIMAL(3,1)) AS SizeNumber, SUM(b.Quantity) - COALESCE(s.total_quantity, 0) AS quantity_difference
    FROM yyitems_buy b
    LEFT JOIN (
      SELECT Content_SKU, SizeUS, SUM(Quantity) AS total_quantity
      FROM yyitems_sell
      WHERE ship = 'shipped'
      GROUP BY Content_SKU, SizeUS
    ) s ON b.Content_SKU = s.Content_SKU AND b.SizeUS = s.SizeUS
    WHERE b.status = 'check'
    GROUP BY b.Content_SKU, b.ProductName, SizeNumber, s.total_quantity
    HAVING quantity_difference <> 0
    ORDER BY b.Content_SKU ASC, SizeNumber ASC;
  `;

  if (searchTerm && searchBy) {
    if (searchBy === 'size') {
      query = `
        SELECT b.Content_SKU, b.ProductName, CAST(b.SizeUS AS DECIMAL(3,1)) AS SizeNumber, SUM(b.Quantity) - COALESCE(s.total_quantity, 0) AS quantity_difference
        FROM yyitems_buy b
        LEFT JOIN (
          SELECT Content_SKU, SizeUS, SUM(Quantity) AS total_quantity
          FROM yyitems_sell
          WHERE ship = 'shipped'
          GROUP BY Content_SKU, SizeUS
        ) s ON b.Content_SKU = s.Content_SKU AND b.SizeUS = s.SizeUS
        WHERE b.status = 'check' AND CAST(b.SizeUS AS CHAR) = ?
        GROUP BY b.Content_SKU, b.ProductName, SizeNumber, s.total_quantity
        HAVING quantity_difference <> 0
        ORDER BY b.Content_SKU ASC, SizeNumber ASC;
      `;
    } else if (searchBy === 'sku') {
      query = `
        SELECT b.Content_SKU, b.ProductName, CAST(b.SizeUS AS DECIMAL(3,1)) AS SizeNumber, SUM(b.Quantity) - COALESCE(s.total_quantity, 0) AS quantity_difference
        FROM yyitems_buy b
        LEFT JOIN (
        SELECT Content_SKU, SizeUS, SUM(Quantity) AS total_quantity
        FROM yyitems_sell
        WHERE ship = 'shipped'
        GROUP BY Content_SKU, SizeUS
        ) s ON b.Content_SKU = s.Content_SKU AND b.SizeUS = s.SizeUS
        WHERE b.status = 'check' AND b.Content_SKU LIKE ?
        GROUP BY b.Content_SKU, b.ProductName, SizeNumber, s.total_quantity
        HAVING quantity_difference <> 0
        ORDER BY b.Content_SKU ASC, SizeNumber ASC;
        `;
    }
  }
        
  pool.query(query, [searchTerm], function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row }));
      res.render('stock-check', { data, searchTerm, searchBy });
    }
  });
});











//for shipped record page
app.get('/shippedrecord', function(req, res){
  res.render('shippedrecord');
});
//for shipped record page - single ship
app.get('/singleshipped', function(req, res){
  pool.query(`
    SELECT InvoiceNumber, Content_SKU, product_name, SizeUS, SUM(Quantity) AS totalQuantity
    FROM yyitems_sell
    WHERE ship = "pending"
    GROUP BY InvoiceNumber, Content_SKU, product_name, SizeUS
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('singleshipped', { data });
    }
  });
});
app.get('/singleshippeds', (req, res) => {
  const sku = req.query.sku;
  const query = 'SELECT ProductName, SizeUS FROM yyitems_buy WHERE Content_SKU = ? AND status = "pending"';
  pool.query(query, [sku], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error retrieving product data');
    } else {
      const data = {
        name: results.length > 0 ? results[0].productname : '',
        sizes: results.map(result => result.size)
      };
      res.send(data);
    }
  });
});
app.post('/singleshipped', upload.single('file'), urlencodedParser, function(req, res) {
  const { trackingno, date, sku, productname, size, category, invoice, remarks } = req.body;
  const quantity = 1;

  // Insert the form data into MySQL
  pool.query('INSERT INTO singleship (TrackingNumber, Date, Content_SKU, Productname, SizeUS, Category, invoice, quantity, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [trackingno, date, sku, productname, size, category, invoice, quantity, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      // Update yyitems_sell table
      pool.query('UPDATE yyitems_sell SET ship=? WHERE InvoiceNumber=? AND Content_SKU=? AND SizeUS=? AND ship=? LIMIT 1', ['shipped', invoice, sku, size, 'pending'], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error updating yyitems_sell table');
        } else {
          console.log(req.body);
          res.render('singleshipped', { successMessage: 'Form submitted successfully' });
        }
      });
    }
  });
});
//for shipped record page - bulk ship
app.get('/bulkshipped', function(req, res){
  pool.query(`
    SELECT InvoiceNumber, Content_SKU, product_name, SizeUS, SUM(Quantity) AS totalQuantity
    FROM yyitems_sell
    WHERE ship = "pending"
    GROUP BY InvoiceNumber, Content_SKU, product_name, SizeUS
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('bulkshipped', { data });
    }
  });
});
app.post('/bulkshipped', upload.single('file'), urlencodedParser, function (req, res) {
  const { trackingno, date, boxno, category, invoice = [], remarks, productname = [], field1 = [], field2 = [], field3 = [] } = req.body;

  // Insert the main form data into MySQL
  for (let i = 0; i < invoice.length; i++) {
    pool.query('INSERT INTO bulkship (TrackingNumber, Date, BoxNumber, Category, Remarks, invoice) VALUES (?, ?, ?, ?, ?, ?)', [trackingno, date, boxno, category, remarks, invoice[i]], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        const bulkShipBoxNumber = boxno;
        const shippedItems = field1.map((item, index) => [bulkShipBoxNumber, item, field2[index], field3[index], productname[index], invoice[i]]);
        console.log(shippedItems);
        // Insert the shipped items data into MySQL
        pool.query('INSERT INTO shipped_items (BulkShipBoxNumber, Content_SKU, SizeUS, Quantity, productname, invoice) VALUES ?', [shippedItems], (error, results, fields) => {
          if (error) {
            console.error(error);
            res.status(500).send('Error saving shipped items data');
          } else {
            console.log(req.body);

            // Update the `ship` column in `yyitems_sell` table
            for (let j = 0; j < field1.length; j++) {
              pool.query(`
                UPDATE yyitems_sell SET ship = "shipped" WHERE InvoiceNumber = ? AND Content_SKU = ? AND SizeUS = ? LIMIT ?
              `, [invoice[i], field1[j], field2[j], parseInt(field3[j])], (error, results, fields) => {
                if (error) {
                  console.error(error);
                  res.status(500).send('Error updating shipped items data');
                } else {
                  console.log(results);
                }
              });
            }

            // Fetch the data for the GET request
            pool.query(`
              SELECT InvoiceNumber, Content_SKU, product_name, SizeUS, SUM(Quantity) AS totalQuantity
              FROM yyitems_sell
              WHERE ship = "pending"
              GROUP BY InvoiceNumber, Content_SKU, product_name, SizeUS
            `, function(error, results, fields) {
              if (error) {
                console.error(error);
                res.status(500).send('Error fetching data');
              } else {
                // Add the formattedDate field to each row of data
                const data = results.map(row => ({ ...row }));
                res.render('bulkshipped', { data, successMessage: 'Form submitted successfully' });
              }
            });
          }
        });
      }
    });
  }
});
//for database
app.get('/inout', function(req, res){
  res.render('inout');
});


//-------below is for Y Kick Zone Shop----------------------------------------------------------------------------------
//------------------Sales--------------------------------------------------------------------------
//for sales - sell invoice
app.get('/sell_invoice', function(req, res){
  res.render('sell_invoice');
});
app.get('/sellproduct-name', (req, res) => {
  const sku = req.query.sku;
  const query = 'SELECT DISTINCT ProductName FROM items_sell WHERE Content_SKU LIKE ? LIMIT 1';
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;
    const name = results.map(result => result.ProductName);
    const nameString = name.join(',');
    res.send(nameString);
  });
});
app.post('/sell_invoice', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;

  // Fetch the last inserted Invoice_number value from sell_invoice table
  pool.query('SELECT MAX(Invoice_number) as maxInvoiceNumber FROM sell_invoice', (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      // Insert the main form data into MySQL
      pool.query('INSERT INTO sell_invoice (Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [invoice_number, name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          // Map over the sell items and add the invoice number to each item
          const sellItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index], field6[index], field7[index]]);
          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO items_sell (InvoiceNumber, Content_SKU, SizeUS, UnitPrice, Quantity, Amount) VALUES ?', [sellItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              console.log(req.body);
              res.render('sell_invoice', { successMessage: 'Form submitted successfully' });
            }
          });
        }
      });
    }
  });
});
//for sales-payment break
app.get('/sales-paymentbreak',function(req, res){
  res.render('sales-paymentbreak');
});
app.post('/sales-paymentbreak',upload.single('file'), urlencodedParser, function(req, res){
  const { date, invoice_no, bank, amount, remarks } = req.body;
  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO sales_paymentbreakdown (Date, Invoice_No, Bank, Amount, Remarks, File) VALUES (?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, bank, amount, remarks, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.status(200).send('Form data saved successfully');
    }
  });
});
//for sales - balance check
app.get('/sales-balancecheck', (req, res) => {
  const invoice_number = req.query.invoice_number || '';
  const invoice_number_query = invoice_number ? ' = ?' : 'IS NOT NULL';
  const invoice_number_params = invoice_number ? [invoice_number] : [];
  
  pool.query(`SELECT * FROM sell_invoice WHERE Invoice_number ${invoice_number_query}`, invoice_number_params, (error, results) => {
    if (error) {
      console.log(`Error retrieving data from sell_invoice table: ${error}`);
    } else {
      const sell_invoice_data = results;
      
      const getTotalAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_amount FROM items_sell WHERE InvoiceNumber = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from items_sell table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_amount || 0);
          }
        });
      };
      
      const getTotalPaidAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_paid_amount FROM sales_paymentbreakdown WHERE Invoice_No = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from sales_paymentbreakdown table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_paid_amount || 0);
          }
        });
      };

      const processInvoiceData = (index, callback) => {
        if (index >= sell_invoice_data.length) {
          callback();
        } else {
          const invoice = sell_invoice_data[index];
          getTotalAmount(invoice.Invoice_number, (total_amount) => {
            getTotalPaidAmount(invoice.Invoice_number, (total_paid_amount) => {
              const balance_left = total_amount.toFixed(2) - total_paid_amount.toFixed(2);
              if (balance_left != 0) {
                invoice.total_amount = total_amount;
                invoice.total_paid_amount = total_paid_amount;
                invoice.balance_left = balance_left;
                processInvoiceData(index + 1, callback);
              } else {
                sell_invoice_data.splice(index, 1);
                processInvoiceData(index, callback);
              }
            });
          });
        }
      };

      processInvoiceData(0, () => {
        res.render('sales-balancecheck', { sell_invoice_data, invoice_number, results });
      });

    }
  });
});
app.get('/search', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const sellInvoiceQuery = `SELECT * FROM sell_invoice WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(sellInvoiceQuery, (error, sellInvoiceResults) => {
    if (error) throw error;

    if (!sellInvoiceResults.length) {
      // Render the sales-details.ejs view with no sellInvoiceResults
      res.render('sales-details', {
        sellInvoiceResults: sellInvoiceResults,
        invoiceNumber: invoiceNumber,
        sellInvoiceResults: null
      });
    } else {
      // Query the items_sell table
      const itemsSellQuery = `SELECT * FROM items_sell WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsSellQuery, (error, itemsSellResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsSellResults.length; i++) {
          totalAmount += (itemsSellResults[i].UnitPrice * itemsSellResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const salesPaymentQuery = `SELECT * FROM sales_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(salesPaymentQuery, (error, salesPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < salesPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(salesPaymentResults[i].Amount);
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;

          // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
          res.render('sales-details', {
            invoiceNumber: invoiceNumber,
            sellInvoiceResults: sellInvoiceResults,
            name: sellInvoiceResults[0].Name,
            totalAmount: totalAmount,
            transactions: salesPaymentResults,
            balance: balance,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
// for sales invoice generate
app.get('/invoice_generate', function(req, res) {
  res.render('invoice_generate');
});
app.get('/generate', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const sellInvoiceQuery = `SELECT * FROM sell_invoice WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(sellInvoiceQuery, (error, sellInvoiceResults) => {
    if (error) throw error;

    if (!sellInvoiceResults.length) {
      // Render the sales-details.ejs view with no sellInvoiceResults
      res.render('invoice_template', {
        sellInvoiceResults: sellInvoiceResults,
        invoiceNumber: invoiceNumber,
        sellInvoiceResults: null
      });
    } else {
      // Query the items_sell table
      const itemsSellQuery = `SELECT * FROM items_sell WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsSellQuery, (error, itemsSellResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsSellResults.length; i++) {
          totalAmount += (itemsSellResults[i].UnitPrice * itemsSellResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const salesPaymentQuery = `SELECT * FROM sales_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(salesPaymentQuery, (error, salesPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < salesPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(salesPaymentResults[i].Amount);
          }
           // Set the bank variable based on the salesPaymentResults
          let bank = 'N/A';
          if (salesPaymentResults.length > 0) {
           bank = salesPaymentResults[0].Bank;
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;
          // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
          res.render('invoice_template', {
            invoiceNumber: invoiceNumber,
            sellInvoiceResults: sellInvoiceResults,
            itemsSellResults: itemsSellResults,
            name: sellInvoiceResults[0].Name,
            totalAmount: totalAmount,
            transactions: salesPaymentResults,
            balance: balance,
            bank: bank,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
//--------------------Purchase----------------------------------------------------------------------
//for sales - sell invoice
app.get('/buy-payby', function(req, res){
  res.render('buy-payby');
});
app.get('/buyproduct-name', (req, res) => {
  const sku = req.query.sku;
  const query = 'SELECT DISTINCT ProductName FROM items_buy WHERE Content_SKU LIKE ? LIMIT 1';
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;
    const name = results.map(result => result.ProductName);
    const nameString = name.join(',');
    res.send(nameString);
  });
});
app.post('/buy-payby', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, bankname, bank, bankacc, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [] } = req.body;

  // Fetch the last inserted Invoice_number value from buy_record table
  pool.query('SELECT MAX(ID) as maxInvoiceNumber FROM buy_record', (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      // Insert the main form data into MySQL
      pool.query('INSERT INTO buy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks) VALUES (?, ?, ?, ?, ?, ?)', [invoice_number, name, bankname, bank, bankacc, remarks], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          const buyItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index], field6[index]]);

          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO items_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, UnitPrice, Quantity, Amount) VALUES ?', [buyItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              console.log(req.body);
              res.render('buy-payby', { successMessage: 'Form submitted successfully' });
            }
          });
        }
      });
    }
  });
});
//for buy-payment break
app.get('/buy-paymentbreak', function(req, res){
  res.render('buy-paymentbreak');
});
app.post('/buy-paymentbreak',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, bank, amount, remarks } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';

    // Insert the form data into MySQL
    pool.query('INSERT INTO purchase_paymentbreakdown (Date, Invoice_No, Bank, Amount, Remarks, File) VALUES (?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, bank, amount, remarks, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('buy-paymentbreak', { successMessage: 'Form submitted successfully' });
      }
    });
});
//for buy-balance check
app.get('/buy-balancecheck', (req, res) => {
  const invoice_number = req.query.invoice_number || '';
  const invoice_number_query = invoice_number ? ' = ?' : 'IS NOT NULL';
  const invoice_number_params = invoice_number ? [invoice_number] : [];
  
  pool.query(`SELECT * FROM buy_record WHERE Invoice_number ${invoice_number_query}`, invoice_number_params, (error, results) => {
    if (error) {
      console.log(`Error retrieving data from buy_record table: ${error}`);
    } else {
      const buy_record_data = results;
      
      const getTotalAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_amount FROM items_buy WHERE InvoiceNumber = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from items_buy table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_amount || 0);
          }
        });
      };
      
      const getTotalPaidAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_paid_amount FROM purchase_paymentbreakdown WHERE Invoice_No = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from purchase_paymentbreakdown table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_paid_amount || 0);
          }
        });
      };

      const processInvoiceData = (index, callback) => {
        if (index >= buy_record_data.length) {
          callback();
        } else {
          const invoice = buy_record_data[index];
          getTotalAmount(invoice.Invoice_number, (total_amount) => {
            getTotalPaidAmount(invoice.Invoice_number, (total_paid_amount) => {
              const balance_left = total_amount.toFixed(2) - total_paid_amount.toFixed(2);
              if (balance_left != 0) {
                invoice.total_amount = total_amount;
                invoice.total_paid_amount = total_paid_amount;
                invoice.balance_left = balance_left;
                processInvoiceData(index + 1, callback);
              } else {
                buy_record_data.splice(index, 1);
                processInvoiceData(index, callback);
              }
            });
          });
        }
      };

      processInvoiceData(0, () => {
        res.render('buy-balancecheck', { buy_record_data, invoice_number, results });
      });

    }
  });
});
// Set up the searchs route
app.get('/searchs', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const buyrecordQuery = `SELECT * FROM buy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyrecordQuery, (error, buyrecordResults) => {
    if (error) throw error;

    if (!buyrecordResults.length) {
      // Render the sales-details.ejs view with no buyrecordResults
      res.render('buy-details', {
        buyrecordResults: buyrecordResults,
        invoiceNumber: invoiceNumber,
        buyrecordResults: null
      });
    } else {
      // Query the items_buy table
      const itemsBuyQuery = `SELECT * FROM items_buy WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const BuyPaymentQuery = `SELECT * FROM purchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(BuyPaymentQuery, (error, buyPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < buyPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(buyPaymentResults[i].Amount);
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;

          // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
          res.render('buy-details', {
            invoiceNumber: invoiceNumber,
            buyrecordResults: buyrecordResults,
            name: buyrecordResults[0].Name,
            totalAmount: totalAmount,
            transactions: buyPaymentResults,
            balance: balance,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
// for purchase order generate
app.get('/order_generate', function(req, res) {
  res.render('order_generate');
});
app.get('/ordergenerate', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const buyRecordQuery = `SELECT * FROM buy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyRecordQuery, (error, buyRecordResults) => {
    if (error) throw error;

    if (!buyRecordResults.length) {
      // Render the sales-details.ejs view with no buyRecordResults
      res.render('order_template', {
        buyRecordResults: buyRecordResults,
        invoiceNumber: invoiceNumber,
        buyRecordResults: null
      });
    } else {
      // Query the items_sell table
      const itemsBuyQuery = `SELECT * FROM items_buy WHERE InvoiceNumber = '${invoiceNumber}' AND status != "return" AND sold != "return"`;
      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const purchasePaymentQuery = `SELECT * FROM purchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(purchasePaymentQuery, (error, purchasePaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < purchasePaymentResults.length; i++) {
            totalAmountPaid += parseFloat(purchasePaymentResults[i].Amount);
          }
           // Set the bank variable based on the purchasePaymentResults
          let bank = 'N/A';
          if (purchasePaymentResults.length > 0) {
           bank = purchasePaymentResults[0].Bank;
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;
          res.render('order_template', {
            invoiceNumber: invoiceNumber,
            buyRecordResults: buyRecordResults,
            itemsBuyResults: itemsBuyResults,
            name: buyRecordResults[0].Name,
            totalAmount: totalAmount,
            transactions: purchasePaymentResults,
            balance: balance,
            bank: bank,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
//-------------------Drawing------------------------------------------------------------------------
//for company fund 2 personal 
app.get('/company2personal', function(req, res){
  res.render('company2personal');
});
app.post('/company2personal',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, category, bank, name, amount, detail } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';

    // Insert the form data into MySQL
    pool.query('INSERT INTO companyfund2personal (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('company2personal', { successMessage: 'Form submitted successfully' });
      }
    });
});
//for personal 2 company
app.get('/personal2company', function(req, res){
  res.render('personal2company');
});
app.post('/personal2company',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, category, bank, name, amount, detail } = req.body;

    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';

    // Insert the form data into MySQL
    pool.query('INSERT INTO personalfund2company (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('personal2company', { successMessage: 'Form submitted successfully' });
      }
    });
});
//expenses yong yi
app.get('/ykzexpenses-record', function(req, res){
  res.render('ykzexpenses-record');
});
app.post('/ykzexpenses-record',upload.single('file'),  urlencodedParser, function(req, res){
  const { date,invoice_no, category, bank, name, amount, detail } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO ykzexpensesrecord (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('ykzexpenses-record');
    }
  });
});
//for ykickzone top up and check balance left
app.get('/topupbalance', (req, res) => {
  pool.query(
    `SELECT * FROM topupbalance WHERE wallet = 'Gdex' ORDER BY id DESC LIMIT 1`,
    (err, topupResult) => {
      if (err) {
        console.error('Error fetching topup data from database: ', err);
        res.status(500).send('Internal server error');
      } else {
        pool.query(
          `SELECT * FROM ykzexpensesrecord WHERE Name = 'Gdex'`,
          (err, expensesResult) => {
            if (err) {
              console.error('Error fetching expenses data from database: ', err);
              res.status(500).send('Internal server error');
            } else {
              const totalAmount = expensesResult.reduce((acc, row) => row.Name === 'Gdex' ? acc + parseFloat(row.Amount) : acc, 0);
              const rows = topupResult.map(row => {
                if (row.wallet === 'Gdex') {
                  row.lastbalance -= totalAmount;
                }
                return row;
              });
              res.render('topupbalance', { rows , successMessage: false });
            }
          }
        );
      }
    }
  );
});
app.post('/topupbalance', upload.single('file'), urlencodedParser, function(req, res) {
  const wallet = req.body.wallets;
  const amount = req.body.amounts;
  const date = req.body.date;

  // get the last balance for the given wallet
  pool.query(
    `SELECT lastbalance FROM topupbalance WHERE wallet = ? ORDER BY id DESC LIMIT 1`,
    [wallet],
    (err, result) => {
      if (err) {
        console.error('Error fetching data from database: ', err);
        res.status(500).send('Internal server error');
      } else {
        let lastbalance = 0;
        if (result && result.length > 0 && result[0].lastbalance) {
          lastbalance = result[0].lastbalance;
        }

        // calculate the new balance
        const newbalance = parseFloat(lastbalance) + parseFloat(amount);

        // insert a new row into the table
        pool.query(
          `INSERT INTO topupbalance (wallet, amount, lastbalance, date) VALUES (?, ?, ?, ?)`,
          [wallet, amount, newbalance, date],
          (err, result) => {
            if (err) {
              console.error('Error inserting data into database: ', err);
              res.status(500).send('Internal server error');
            } else {
              console.log('Data inserted successfully');
              // fetch the rows again and render the view with all the necessary variables
              pool.query(
                `SELECT * FROM topupbalance WHERE wallet = ? ORDER BY id DESC LIMIT 1`,
                [wallet],
                (err, topupResult) => {
                  if (err) {
                    console.error('Error fetching data from database: ', err);
                    res.status(500).send('Internal server error');
                  } else {
                    pool.query(
                      `SELECT * FROM ykzexpensesrecord WHERE Name = ?`,
                      [wallet],
                      (err, expensesResult) => {
                        if (err) {
                          console.error('Error fetching data from database: ', err);
                          res.status(500).send('Internal server error');
                        } else {
                          const totalAmount = expensesResult.reduce((acc, row) => row.Name === wallet ? acc + parseFloat(row.Amount) : acc, 0);
                          const rows = topupResult.map(row => {
                            if (row.wallet === wallet) {
                              row.lastbalance -= totalAmount;
                            }
                            return row;
                          });
                          res.render('topupbalance', { successMessage: true, wallet, amount, newbalance, rows });
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        );
      }
    }
  );  
});


//-------below is for Yong & Yi  Partnership Enterprise-----------------------------------------------------------------------------
//-------------------Sales-----------------------------------------------------------------------------
//for sales - sell invoice
app.get('/yysell_invoice', function(req, res){
  pool.query(`
    SELECT InvoiceNumber, Content_SKU, product_name, CAST(SizeUS AS DECIMAL(10,2)) AS SizeUS, UnitPrice, SUM(Quantity) as Quantity, SUM(Amount) as Amount, gender, CostPrice
    FROM yyitems_sell
    WHERE Content_SKU IS NOT NULL AND Content_SKU <> ''
    GROUP BY InvoiceNumber, Content_SKU, SizeUS, UnitPrice, product_name, gender, CostPrice
    ORDER BY InvoiceNumber DESC, CAST(SizeUS AS DECIMAL(10,2)) ASC
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('yysell_invoice', { data });
    }
  });
});
app.get('/yyproduct-details', (req, res) => {
  const sku = req.query.sku;
  const size = req.query.size;
  const query = `
    SELECT DISTINCT UnitPrice
    FROM yyitems_buy
    WHERE Content_SKU LIKE ? AND SizeUS = ? AND Sold = 'no'
  `;
  pool.query(query, ['%' + sku + '%', size], (err, results) => {
    if (err) throw err;

    const unitPrices = new Set();

    results.forEach(result => {
      unitPrices.add(result.UnitPrice);
    });

    res.json({
      unitPrices: Array.from(unitPrices)
    });
  });
});
app.get('/yyproduct-name', (req, res) => {
  const sku = req.query.sku;
  const query = `
    SELECT DISTINCT ProductName
    FROM yyitems_buy
    WHERE Content_SKU LIKE ? AND Sold = 'no'
  `;
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;

    const productNames = new Set();

    results.forEach(result => {
      productNames.add(result.ProductName);
    });

    res.json({
      productNames: Array.from(productNames)
    });
  });
});
app.post('/yysell_invoice', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [], field8 = []} = req.body;

  // Fetch the last inserted Invoice_number value from sell_invoice table
  pool.query('SELECT MAX(Invoice_number) as maxInvoiceNumber FROM yysell_invoice', (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      // Insert the main form data into MySQL
      pool.query('INSERT INTO yysell_invoice (Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [invoice_number, name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          const sellItems = [];
          field1.forEach((item, index) => {
            for (let i = 0; i < field5[index]; i++) {
              sellItems.push([invoice_number, item, field2[index], field3[index], field4[index], 1 , field4[index], field7[index], field8[index], 'pending']);
            }
          });
          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, product_name, SizeUS, UnitPrice, Quantity, Amount, gender, CostPrice, ship) VALUES ?', [sellItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              // Update yyitems_buy table with sold items
              field1.forEach((item, index) => {
                const sku = item;
                const size = field3[index];
                const qty = field5[index];
                const unitPrice = field8[index];
                for (let i = 0; i < qty; i++) {
                  pool.query('UPDATE yyitems_buy SET sold = ? WHERE UnitPrice = ? AND Content_SKU = ? AND SizeUS = ? AND UnitPrice = ? AND sold = ? AND status = ?', ['yes', unitPrice, sku, size, unitPrice, 'no', 'check'], (error, results, fields) => {
                    if (error) {
                      console.error(error);
                      res.status(500).send('Error updating yyitems_buy table');
                    }
                  });
                }
              });
              pool.query('SELECT * FROM yyitems_sell ORDER BY InvoiceNumber DESC', function(error, results, fields) {
                if (error) {
                  console.error(error);
                  res.status(500).send('Error fetching data');
                } else {
                  console.log(req.body);
                  const data = results.map(row => ({ ...row }));
                  res.render('yysell_invoice', { successMessage: 'Form submitted successfully' , data });
                }
              });
            }
          });
        }
      });
    }
  });
});
//for sales-payment break
app.get('/yysales-paymentbreak', function(req, res) {
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Amount, Remarks, File FROM yysales_paymentbreakdown ORDER BY Invoice_No DESC', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));
      res.render('yysales-paymentbreak', { data });
    }
  });
});
app.post('/yysales-paymentbreak',upload.single('file'), urlencodedParser, function(req, res){
  const { date, invoice_no, amount, remarks } = req.body;
  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yysales_paymentbreakdown (Date, Invoice_No, Amount, Remarks, File) VALUES (?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, amount, remarks, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.status(200).send('Form data saved successfully');
    }
  });
});
//for sales - balance check
app.get('/yysales-balancecheck', (req, res) => {
  const invoice_number = req.query.invoice_number || '';
  const invoice_number_query = invoice_number ? ' = ?' : 'IS NOT NULL';
  const invoice_number_params = invoice_number ? [invoice_number] : [];
  
  pool.query(`SELECT * FROM yysell_invoice WHERE Invoice_number ${invoice_number_query}`, invoice_number_params, (error, results) => {
    if (error) {
      console.log(`Error retrieving data from yysell_invoice table: ${error}`);
    } else {
      const sell_invoice_data = results;
      
      const getTotalAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_amount FROM yyitems_sell WHERE InvoiceNumber = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from yyitems_sell table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_amount || 0);
          }
        });
      };
      
      const getTotalPaidAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_paid_amount FROM yysales_paymentbreakdown WHERE Invoice_No = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from yysales_paymentbreakdown table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_paid_amount || 0);
          }
        });
      };

      const processInvoiceData = (index, callback) => {
        if (index >= sell_invoice_data.length) {
          callback();
        } else {
          const invoice = sell_invoice_data[index];
          getTotalAmount(invoice.Invoice_number, (total_amount) => {
            getTotalPaidAmount(invoice.Invoice_number, (total_paid_amount) => {
              const balance_left = total_amount.toFixed(2) - total_paid_amount.toFixed(2);
              if (balance_left != 0) {
                invoice.total_amount = total_amount;
                invoice.total_paid_amount = total_paid_amount;
                invoice.balance_left = balance_left;
                processInvoiceData(index + 1, callback);
              } else {
                sell_invoice_data.splice(index, 1);
                processInvoiceData(index, callback);
              }
            });
          });
        }
      };

      processInvoiceData(0, () => {
        res.render('yysales-balancecheck', { sell_invoice_data, invoice_number, results });
      });

    }
  });
});
app.get('/yysearch', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const sellInvoiceQuery = `SELECT * FROM yysell_invoice WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(sellInvoiceQuery, (error, sellInvoiceResults) => {
    if (error) throw error;

    if (!sellInvoiceResults.length) {
      // Render the sales-details.ejs view with no sellInvoiceResults
      res.render('yysales-details', {
        sellInvoiceResults: sellInvoiceResults,
        invoiceNumber: invoiceNumber,
        sellInvoiceResults: null
      });
    } else {
      // Query the items_sell table
      const itemsSellQuery = `SELECT * FROM yyitems_sell WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsSellQuery, (error, itemsSellResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsSellResults.length; i++) {
          totalAmount += (itemsSellResults[i].UnitPrice * itemsSellResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const salesPaymentQuery = `SELECT * FROM yysales_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(salesPaymentQuery, (error, salesPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < salesPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(salesPaymentResults[i].Amount);
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;

          // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
          res.render('yysales-details', {
            invoiceNumber: invoiceNumber,
            sellInvoiceResults: sellInvoiceResults,
            name: sellInvoiceResults[0].Name,
            totalAmount: totalAmount,
            transactions: salesPaymentResults,
            balance: balance,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
// for sales invoice generate
app.get('/yyinvoice_generate', function(req, res) {
  res.render('yyinvoice_generate');
});
app.get('/yygenerate', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const sellInvoiceQuery = `SELECT * FROM yysell_invoice WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(sellInvoiceQuery, (error, sellInvoiceResults) => {
    if (error) throw error;

    if (!sellInvoiceResults.length) {
      // Render the sales-details.ejs view with no sellInvoiceResults
      res.render('yyinvoice_template', {
        sellInvoiceResults: sellInvoiceResults,
        invoiceNumber: invoiceNumber,
        sellInvoiceResults: null
      });
    } else {
      // Query the items_sell table
      const itemsSellQuery = `SELECT product_name, Content_SKU, SizeUS, UnitPrice, SUM(Quantity) AS TotalQuantity FROM yyitems_sell WHERE InvoiceNumber = '${invoiceNumber}' GROUP BY product_name, Content_SKU, SizeUS, UnitPrice`;
      pool.query(itemsSellQuery, (error, itemsSellResults) => {
        if (error) throw error;

        // Query the sales_paymentbreakdown table
        const salesPaymentQuery = `SELECT * FROM yysales_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(salesPaymentQuery, (error, salesPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < salesPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(salesPaymentResults[i].Amount);
          }
          // Calculate the total amount
          let totalAmount = 0;
          for (let i = 0; i < itemsSellResults.length; i++) {
            totalAmount += (itemsSellResults[i].UnitPrice * itemsSellResults[i].TotalQuantity);
          }
           // Set the bank variable based on the salesPaymentResults
          let bank = 'N/A';
          if (salesPaymentResults.length > 0) {
           bank = salesPaymentResults[0].Bank;
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;
          // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
          res.render('yyinvoice_template', {
            invoiceNumber: invoiceNumber,
            sellInvoiceResults: sellInvoiceResults,
            itemsSellResults: itemsSellResults,
            name: sellInvoiceResults[0].Name,
            totalAmount: totalAmount,
            transactions: salesPaymentResults,
            balance: balance,
            bank: bank,
            totalAmount: totalAmount,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});

//---------------------Purchase-------------------------------------------------------------------------
//for buy -- invoice
app.get('/yybuy-payby', function(req, res){
  pool.query(`
    SELECT InvoiceNumber, Content_SKU, ProductName, CAST(SizeUS AS DECIMAL(10,2)) as SizeUS, UnitPrice, SUM(Quantity) as Quantity, SUM(Amount) as Amount, gender
    FROM yyitems_buy
    WHERE Content_SKU IS NOT NULL AND Content_SKU <> ''
    GROUP BY InvoiceNumber, Content_SKU, SizeUS, UnitPrice, ProductName, gender
    ORDER BY InvoiceNumber DESC, CAST(SizeUS AS DECIMAL(10,2)) ASC
    `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('yybuy-payby', { data });
    }
  });
});
app.get('/yybuyproduct-name', (req, res) => {
  const sku = req.query.sku;
  const query = `
    SELECT DISTINCT ProductName
    FROM yyitems_buy
    WHERE Content_SKU LIKE ? LIMIT 1
  `;
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;

    const productNames = new Set();

    results.forEach(result => {
      productNames.add(result.ProductName);
    });
    res.json({
      productNames: Array.from(productNames)
    });
  });
});
app.post('/yybuy-payby', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, bankname, bank, bankacc, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [] } = req.body;

  // Fetch the last inserted Invoice_number value from buy_record table
  pool.query('SELECT MAX(ID) as maxInvoiceNumber FROM yybuy_record', (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      // Insert the main form data into MySQL
      pool.query('INSERT INTO yybuy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks) VALUES (?, ?, ?, ?, ?, ?)', [invoice_number, name, bankname, bank, bankacc, remarks], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          const buyItems = [];
          for (let i = 0; i < field1.length; i++) {
            for (let j = 0; j < field5[i]; j++) {
              buyItems.push([invoice_number, field1[i], field2[i], field3[i], field4[i], 1, field4[i], field7[i], 'no', 'intransit']);
            }
          }

          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, UnitPrice, Quantity, Amount, gender, sold, status) VALUES ?', [buyItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              // Fetch all items from yyitems_buy table and pass to view
              pool.query('SELECT * FROM yyitems_buy', (error, results, fields) => {
                if (error) {
                  console.error(error);
                  res.status(500).send('Error fetching data');
                } else {
                  const data = results.map(row => ({ ...row }));
                  res.render('yybuy-payby', { successMessage: 'Form submitted successfully', data });
                }
              });
            }
          });
        }
      });
    }
  });
});
  //for buy-payment break
app.get('/yybuy-paymentbreak', function(req, res){
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Amount, Remarks, File FROM yypurchase_paymentbreakdown ORDER BY Invoice_No DESC', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));
      res.render('yybuy-paymentbreak', { data });
    }
  });
});
app.post('/yybuy-paymentbreak',upload.single('file'),  urlencodedParser, function(req, res){
    const { date, invoice_no, amount, remarks } = req.body;
  
    // Get the filename from the request
    const filename = req.file ? req.file.filename : 'N/A';
  
    // Insert the form data into MySQL
    pool.query('INSERT INTO yypurchase_paymentbreakdown (Date, Invoice_No, Amount, Remarks, File) VALUES (?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, amount, remarks, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('yybuy-paymentbreak', { successMessage: 'Form submitted successfully' });
      }
    });
});
//for buy-balance check
app.get('/yybuy-balancecheck', (req, res) => {
  const invoice_number = req.query.invoice_number || '';
  const invoice_number_query = invoice_number ? ' = ?' : 'IS NOT NULL';
  const invoice_number_params = invoice_number ? [invoice_number] : [];
  
  pool.query(`SELECT * FROM yybuy_record WHERE Invoice_number ${invoice_number_query} `, invoice_number_params, (error, results) => {
    if (error) {
      console.log(`Error retrieving data from yybuy_record table: ${error}`);
    } else {
      const buy_record_data = results;
      
      const getTotalAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_amount FROM yyitems_buy WHERE InvoiceNumber = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from yyitems_buy table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_amount || 0);
          }
        });
      };
      
      const getTotalPaidAmount = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_paid_amount FROM yypurchase_paymentbreakdown WHERE Invoice_No = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from yypurchase_paymentbreakdown table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_paid_amount || 0);
          }
        });
      };
      
      const getTotalRefund = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(amount) AS total_refund FROM refund WHERE invoice = ?', [InvoiceNumber], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from refund table: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_refund || 0);
          }
        });
      };

      const getTotalRefunditem = (InvoiceNumber, callback) => {
        pool.query('SELECT SUM(Amount) AS total_refunditems FROM yyitems_buy WHERE InvoiceNumber = ? AND sold = ?', [InvoiceNumber, 'return'], (error, results) => {
          if (error) {
            console.log(`Error retrieving data from refund items: ${error}`);
            callback(0);
          } else {
            callback(results[0].total_refunditems || 0);
          }
        });
      };

      const processInvoiceData = (index, callback) => {
        if (index >= buy_record_data.length) {
          callback();
        } else {
          const invoice = buy_record_data[index];
          getTotalAmount(invoice.Invoice_number, (total_amount) => {
            getTotalPaidAmount(invoice.Invoice_number, (total_paid_amount) => {
              getTotalRefund(invoice.Invoice_number, (total_refund) => {
                getTotalRefunditem(invoice.Invoice_number, (total_refunditems) => {
                  const totalPaid = total_paid_amount ;
                  const total_amounts = total_amount;
                  const balance_left = (total_amounts - totalPaid).toFixed(2);
                  if (balance_left != 0) {
                    invoice.total_amount = total_amounts;
                    invoice.total_paid_amount = totalPaid;
                    invoice.total_refund = total_refund;
                    invoice.balance_left = balance_left;
                    processInvoiceData(index + 1, callback);
                  } else {
                    buy_record_data.splice(index, 1);
                    processInvoiceData(index, callback);
                  }
                });
              });
            });
          });
        }
      };
      
      processInvoiceData(0, () => {
        res.render('yybuy-balancecheck', { buy_record_data, invoice_number, results });
      });

    }
  });
});
// Set up the searchs route
app.get('/yysearchs', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const buyrecordQuery = `SELECT * FROM yybuy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyrecordQuery, (error, buyrecordResults) => {
    if (error) throw error;

    if (!buyrecordResults.length) {
      // Render the sales-details.ejs view with no buyrecordResults
      res.render('yybuy-details', {
        buyrecordResults: buyrecordResults,
        invoiceNumber: invoiceNumber,
        buyrecordResults: null
      });
    } else {
      // Query the items_buy table
      const itemsBuyQuery = `SELECT * FROM yyitems_buy WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Query the sales_paymentbreakdown table
        const BuyPaymentQuery = `SELECT * FROM yypurchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(BuyPaymentQuery, (error, buyPaymentResults) => {
          if (error) throw error;

          // Query the sales_paymentbreakdown table
          const refundQuery = `SELECT * FROM refund WHERE invoice = '${invoiceNumber}'`;
          pool.query(refundQuery, (error, refundResults) => {
            if (error) throw error;

            // Calculate the total amount
            let totalAmount = 0;
            for (let i = 0; i < itemsBuyResults.length; i++) {
              if (!isNaN(itemsBuyResults[i].UnitPrice) && !isNaN(itemsBuyResults[i].Quantity)) {
                totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].Quantity);
              }
            }

            // Calculate the total amount paid
            let totalAmountPaid = 0;
            for (let i = 0; i < buyPaymentResults.length; i++) {
              if (!isNaN(parseFloat(buyPaymentResults[i].Amount))) {
                totalAmountPaid += parseFloat(buyPaymentResults[i].Amount);
              }
            }

            // Calculate the total amount refunded
            let totalAmountRefund = 0;
            for (let i = 0; i < refundResults.length; i++) {
              if (!isNaN(parseFloat(refundResults[i].amount))) {
                totalAmountRefund += parseFloat(refundResults[i].amount);
              }
            }

            // Calculate the balance
            const balance = (totalAmount) - totalAmountPaid;


            // Render the sales-details.ejs view, passing the invoice information, items information, transactions information, and the balance
            res.render('yybuy-details', {
              invoiceNumber: invoiceNumber,
              buyrecordResults: buyrecordResults,
              name: buyrecordResults[0].Name,
              totalAmount: totalAmount,
              transactions: buyPaymentResults,
              refundResults: refundResults,
              balance: balance,
              totalpaid: totalAmountPaid,
            });
          });
        });
      });
    }
  });
});
// for purchase order generate
app.get('/yyorder_generate', function(req, res) {
  res.render('yyorder_generate');
});
app.get('/yyordergenerate', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the sell_invoice table
  const buyRecordQuery = `SELECT * FROM yybuy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyRecordQuery, (error, buyRecordResults) => {
    if (error) throw error;

    if (!buyRecordResults.length) {
      // Render the sales-details.ejs view with no buyRecordResults
      res.render('yyorder_template', {
        buyRecordResults: buyRecordResults,
        invoiceNumber: invoiceNumber,
        buyRecordResults: null
      });
    } else {
      // Query the items_buy table with grouping by SKU, SizeUS, and UnitPrice
      const itemsBuyQuery = `SELECT Content_SKU, ProductName, SizeUS, UnitPrice, SUM(Quantity) as TotalQuantity
      FROM yyitems_buy
      WHERE InvoiceNumber = '${invoiceNumber}'
      GROUP BY Content_SKU, ProductName, SizeUS, UnitPrice`;
      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].TotalQuantity);
        }

        // Query the sales_paymentbreakdown table
        const purchasePaymentQuery = `SELECT * FROM yypurchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(purchasePaymentQuery, (error, purchasePaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < purchasePaymentResults.length; i++) {
            totalAmountPaid += parseFloat(purchasePaymentResults[i].Amount);
          }
           // Set the bank variable based on the purchasePaymentResults
          let bank = 'N/A';
          if (purchasePaymentResults.length > 0) {
           bank = purchasePaymentResults[0].Bank;
          }
          // Calculate the balance
          const balance = totalAmount - totalAmountPaid;
          res.render('yyorder_template', {
            invoiceNumber: invoiceNumber,
            buyRecordResults: buyRecordResults,
            itemsBuyResults: itemsBuyResults,
            name: buyRecordResults[0].Name,
            totalAmount: totalAmount,
            transactions: purchasePaymentResults,
            balance: balance,
            bank: bank,
            totalpaid: totalAmountPaid,
          });
        });
      });
    }
  });
});
//=-----------------------Drawing-------------------------------------------------------------------------
//for company fund 2 personal 
app.get('/yycompany2personal', function(req, res) {
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File FROM yycompanyfund2personal', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));
      res.render('yycompany2personal', { data });
    }
  });
});
app.post('/yycompany2personal',upload.single('file'),  urlencodedParser, function(req, res){
        const { date, invoice_no, category, bank, name, amount, detail } = req.body;
    
        // Get the filename from the request
        const filename = req.file ? req.file.filename : 'N/A';
    
        // Insert the form data into MySQL
        pool.query('INSERT INTO yycompanyfund2personal (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
          if (error) {
            console.error(error);
            res.status(500).send('Error saving form data');
          } else {
            console.log(req.body);
            res.render('yycompany2personal', { successMessage: 'Form submitted successfully' });
          }
        });
});
//for personal 2 company
app.get('/yypersonal2company', function(req, res) {
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File FROM yypersonalfund2company', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));
      res.render('yypersonal2company', { data });
    }
  });
});
app.post('/yypersonal2company',upload.single('file'),  urlencodedParser, function(req, res){
        const { date, invoice_no, category, bank, name, amount, detail } = req.body;
    
        // Get the filename from the request
        const filename = req.file ? req.file.filename : 'N/A';
    
        // Insert the form data into MySQL
        pool.query('INSERT INTO yypersonalfund2company (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
          if (error) {
            console.error(error);
            res.status(500).send('Error saving form data');
          } else {
            console.log(req.body);
            res.render('yypersonal2company', { successMessage: 'Form submitted successfully' });
          }
        });
});
//expenses yong yi
app.get('/yyexpenses-record', function(req, res) {
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File FROM yyexpensesrecord ORDER BY Date DESC', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));

      // Sum up the amounts for each category
      const categoryData = data.reduce((acc, curr) => {
        const existingRow = acc.find(row => row.Category === curr.Category);
        if (existingRow) {
          existingRow.Amount += curr.Amount;
        } else {
          acc.push({ Category: curr.Category, Amount: curr.Amount });
        }
        return acc;
      }, []);

      // Calculate the total amount for all categories
      const totalAmount = categoryData.reduce((acc, curr) => acc + curr.Amount, 0);

      res.render('yyexpenses-record', { data, categoryData, totalAmount });
    }
  });
});
app.post('/yyexpenses-record', upload.single('file'), urlencodedParser, function(req, res) {
  const { date, invoice_no, category, bank, name, amount, detail, othername } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Set the value of the name field based on the selected option
  const nameValue = (name === 'other' && othername) ? othername : name;

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyexpensesrecord (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, nameValue, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('yyexpenses-record');
    }
  });
});
//for ykickzone top up and check balance left
app.get('/yytopupbalance', (req, res) => {
  pool.query(
    `SELECT ID, wallet, amount, lastbalance, DATE_FORMAT(date, "%Y-%m-%d") as date, bonuscredit FROM yytopupbalance WHERE wallet = 'Gdex' ORDER BY ID DESC `,
    (err, topupResult) => {
      if (err) {
        console.error('Error fetching topup data from database: ', err);
        res.status(500).send('Internal server error');
      } else {
        pool.query(
          `SELECT * FROM yyexpensesrecord WHERE Name = 'Gdex'`,
          (err, expensesResult) => {
            if (err) {
              console.error('Error fetching expenses data from database: ', err);
              res.status(500).send('Internal server error');
            } else {
              const totalAmount = expensesResult.reduce((acc, row) => row.Name === 'Gdex' ? acc + parseFloat(row.Amount) : acc, 0);
              const rows = topupResult.map(row => {
                if (row.wallet === 'Gdex') {
                  row.lastbalance -= totalAmount;
                }
                return row;
              });
              res.render('yytopupbalance', { rows , successMessage: false });
            }
          }
        );
      }
    }
  );
});
app.post('/yytopupbalance', upload.single('file'), urlencodedParser, function(req, res) {
  const wallet = req.body.wallets;
  const amount = req.body.amounts;
  const date = req.body.date;

  // get the last balance for the given wallet
  pool.query(
    `SELECT lastbalance FROM yytopupbalance WHERE wallet = ? ORDER BY id DESC LIMIT 1`,
    [wallet],
    (err, result) => {
      if (err) {
        console.error('Error fetching data from database: ', err);
        res.status(500).send('Internal server error');
      } else {
        let lastbalance = 0;
        if (result && result.length > 0 && result[0].lastbalance) {
          lastbalance = result[0].lastbalance;
        }

        // calculate the new balance
        const newbalance = parseFloat(lastbalance) + parseFloat(amount) + parseFloat(bonuscredit);

        // insert a new row into the table
        pool.query(
          `INSERT INTO yytopupbalance (wallet, amount, lastbalance, date, bonuscredit) VALUES (?, ?, ?, ?, ?)`,
          [wallet, amount, newbalance, date, bonus],
          (err, result) => {
            if (err) {
              console.error('Error inserting data into database: ', err);
              res.status(500).send('Internal server error');
            } else {
              console.log('Data inserted successfully');
              // fetch the rows again and render the view with all the necessary variables
              pool.query(
                `SELECT * FROM yytopupbalance WHERE wallet = ? ORDER BY id DESC LIMIT 1`,
                [wallet],
                (err, topupResult) => {
                  if (err) {
                    console.error('Error fetching data from database: ', err);
                    res.status(500).send('Internal server error');
                  } else {
                    pool.query(
                      `SELECT * FROM yyexpensesrecord WHERE Name = ?`,
                      [wallet],
                      (err, expensesResult) => {
                        if (err) {
                          console.error('Error fetching data from database: ', err);
                          res.status(500).send('Internal server error');
                        } else {
                          const totalAmount = expensesResult.reduce((acc, row) => row.Name === wallet ? acc + parseFloat(row.Amount) : acc, 0);
                          const rows = topupResult.map(row => {
                            if (row.wallet === wallet) {
                              row.lastbalance -= totalAmount;
                            }
                            return row;
                          });
                          res.render('yytopupbalance', { successMessage: true, wallet, amount, newbalance, rows });
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        );
      }
    }
  );  
});
app.get('/refund', function(req, res) {
  const fromSupQuery = 'SELECT * FROM refund WHERE fromSupplier = ? ORDER BY date DESC';
  const refund2BuyerQuery = 'SELECT * FROM refund WHERE refund2buyer = ? ORDER BY date DESC';
  
  const queries = [
    { query: fromSupQuery, params: ['yes'], label: 'fromSupData' },
    { query: refund2BuyerQuery, params: ['yes'], label: 'refund2BuyerData' }
  ];

  const promises = queries.map(q => new Promise((resolve, reject) => {
    pool.query(q.query, q.params, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve({ label: q.label, data: results });
      }
    });
  }));

  Promise.all(promises)
    .then(results => {
      const data = results.reduce((acc, curr) => {
        acc[curr.label] = curr.data.map(row => ({ ...row }));
        return acc;
      }, {});
      res.render('refund', { data });
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error fetching data');
    });
});
app.post('/refund2buyer', upload.single('file'), urlencodedParser, function(req, res){
  const { invoice, amount, remarks, date, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;

  // Insert data into refund table
  pool.query('INSERT INTO refund (invoice, amount, remarks, refund2buyer, date) VALUES (?, ?, ?, "yes", ?)', [invoice, amount, remarks, date], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);

      if (field1) {
        // Update data in yyitems_sell table
        pool.query('UPDATE yyitems_sell SET ship = "return" WHERE InvoiceNumber = ? AND Content_SKU = ? AND SizeUS = ? AND CostPrice = ? LIMIT ?', [invoice, field1, field3, field5, field4], (error, results, fields) => {
          if (error) {
            console.error(error);
            res.status(500).send('Error updating form data');
          } else {
            console.log('Updated rows in yyitems_sell:', results.affectedRows);

            // Update data in yyitems_buy table
            pool.query('UPDATE yyitems_buy SET sold = "no", status = "check" WHERE Content_SKU = ? AND SizeUS = ? AND Amount = ? LIMIT ?', [field1, field3, field5, field4], (error, results, fields) => {
              if (error) {
                console.error(error);
                res.status(500).send('Error updating form data');
              } else {
                console.log('Updated rows in yyitems_buy:', results.affectedRows);
                res.redirect('refund');
              }
            });
          }
        });
      } else {
        res.redirect('refund');
      }
    }
  });
});
app.post('/refund', upload.single('file'), urlencodedParser, function(req, res){
  const { invoice, amount, remarks, date, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;

  // Insert data into refund table
  pool.query('INSERT INTO refund (invoice, amount, remarks, fromSupplier, date) VALUES (?, ?, ?, "yes", ?)', [invoice, amount, remarks, date], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);

      // Update data in yyitems_buy table only if fields 1-4 are not empty
      if (field1) {
        const limit = parseInt(field4, 10); // Convert field4 to an integer
        pool.query('UPDATE yyitems_buy SET sold = "return", status = "return" WHERE Content_SKU = ? AND SizeUS = ? AND Amount = ? LIMIT ?', [field1, field3, field5, limit], (error, results, fields) => {
          if (error) {
            console.error(error);
            res.status(500).send('Error updating form data');
          } else {
            console.log('Updated rows:', results.affectedRows);
            res.redirect('refund');
          }
        });
      } else {
        res.redirect('refund');
      }
    }
  });
});
app.get('/returned', function(req, res){
  pool.query(`
    SELECT SUM(Quantity) AS totalQuantity, InvoiceNumber, SizeUS, Content_SKU, UnitPrice, status, ProductName
    FROM yyitems_buy
    WHERE status = "return"
    GROUP BY Content_SKU, SizeUS, UnitPrice, InvoiceNumber, status, ProductName
    ORDER BY InvoiceNumber DESC
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('returned', { data });
    }
  });
});
//----------------------Ending--------------------------------------------------------------------------------
app.get('/profile/:name', function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://192.168.0.103:5000/');
});