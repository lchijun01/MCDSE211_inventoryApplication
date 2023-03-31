const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const csv = require('csv-parser');
const fastCsv = require('fast-csv');
const ejs = require('ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.static('public'))
const { createProxyMiddleware } = require('http-proxy-middleware');

// Use a reverse proxy to forward requests to the Node.js server running on port 5000
app.use('/api', createProxyMiddleware({ target: 'http://192.168.0.126:5000', changeOrigin: true }));

const pool = mysql.createPool({
    poolLimit: 10,
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'test11'
  });

const urlencodedParser = bodyParser.urlencoded({extended: false});
app.set('view engine', 'ejs');


app.get('/', function(req, res) {
    res.render('index');
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
      const { InvoiceNo, Date, Name, Address1, Address2, Address3, PostCode, City, State, Country, Description, Quantity, UnitPrice, Amount } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!invoiceNos.has(InvoiceNo)) {
        // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
        invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
        pool.query('INSERT INTO sell_invoice (Invoice_number, Name, Address1, Address2, Address3, PostCode, City, State, Country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, Address1, Address2, Address3, PostCode, City, State, Country], (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
            pool.query('INSERT INTO items_sell (InvoiceNumber, Content_SKU, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?)', [InvoiceNo, Description, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
        pool.query('INSERT INTO items_sell (InvoiceNumber, Content_SKU, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?)', [InvoiceNo, Description, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
  const sql = `SELECT sell_invoice.Invoice_number, sell_invoice.Name, sell_invoice.Phone, sell_invoice.Address1, sell_invoice.Address2, sell_invoice.Address3, sell_invoice.PostCode, sell_invoice.City, sell_invoice.State, sell_invoice.Country, items_sell.Content_SKU AS Description, items_sell.SizeUS, items_sell.Quantity, items_sell.UnitPrice, items_sell.Amount
               FROM sell_invoice
               JOIN items_sell ON sell_invoice.Invoice_number = items_sell.InvoiceNumber
               ORDER BY sell_invoice.Invoice_number, items_sell.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV with only the item data
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sell_data.csv');
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
      const { InvoiceNo, Name, Bank, BankName, BankNumber, Remarks, Description, SizeUS, Quantity, UnitPrice, Amount, SKU } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!isNaN(parsedUnitPrice) && !isNaN(parsedAmount)) {
        // Only insert the row if parsedUnitPrice and parsedAmount are not NaN
        if (!invoiceNos.has(InvoiceNo)) {
          // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
          invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
          pool.query('INSERT INTO buy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks) VALUES (?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, BankName, Bank, BankNumber, Remarks], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
              pool.query('INSERT INTO items_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, SKU, Description, SizeUS, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
          pool.query('INSERT INTO items_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, SKU, Description, SizeUS, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              console.log(`Data successfully inserted for InvoiceNo ${InvoiceNo}`);
            }
          });
        }
      } else {
        console.log(`Skipping row with InvoiceNo ${InvoiceNo} due to NaN values`);
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportbuy_csv', function(req, res) {
  const sql = `SELECT buy_record.Invoice_number, buy_record.Name, buy_record.BankName, buy_record.Bank, buy_record.Bankaccount, buy_record.Remarks, items_buy.Content_SKU AS Description, items_buy.SizeUS, items_buy.Quantity, items_buy.UnitPrice, items_buy.Amount
               FROM buy_record
               JOIN items_buy ON buy_record.Invoice_number = items_buy.InvoiceNumber
               ORDER BY buy_record.Invoice_number, items_buy.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=buy_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
//----------------------------Yong & Yi Partnership Enterprise----------------------------------------------
app.post('/yyimportsell_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  const invoiceNos = new Set(); // Set to keep track of InvoiceNos already inserted into the sell_invoice table

  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { InvoiceNo, Date, Name, Address1, Address2, Address3, PostCode, City, State, Country, Description, Quantity, UnitPrice, Amount } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!invoiceNos.has(InvoiceNo)) {
        // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
        invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
        pool.query('INSERT INTO yysell_invoice (Invoice_number, Name, Address1, Address2, Address3, PostCode, City, State, Country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, Address1, Address2, Address3, PostCode, City, State, Country], (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
            pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?)', [InvoiceNo, Description, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
        pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?)', [InvoiceNo, Description, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
  const sql = `SELECT yysell_invoice.Invoice_number, yysell_invoice.Name, yysell_invoice.Phone, yysell_invoice.Address1, yysell_invoice.Address2, yysell_invoice.Address3, yysell_invoice.PostCode, yysell_invoice.City, yysell_invoice.State, yysell_invoice.Country, yyitems_sell.Content_SKU AS Description, yyitems_sell.SizeUS, yyitems_sell.Quantity, yyitems_sell.UnitPrice, yyitems_sell.Amount
               FROM yysell_invoice
               JOIN yyitems_sell ON yysell_invoice.Invoice_number = yyitems_sell.InvoiceNumber
               ORDER BY yysell_invoice.Invoice_number, yyitems_sell.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV with only the item data
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          Phone: row.Phone,
          Address1: row.Address1,
          Address2: row.Address2,
          Address3: row.Address3,
          PostCode: row.PostCode,
          City: row.City,
          State: row.State,
          Country: row.Country,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yysell_data.csv');
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
      const { InvoiceNo, Name, BankName, Bank, BankNumber, Remarks, Description, SizeUS, Quantity, UnitPrice, Amount, SKU } = data;
      const parsedUnitPrice = parseFloat(UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));

      if (!isNaN(parsedUnitPrice) && !isNaN(parsedAmount)) {
        // Only insert the row if parsedUnitPrice and parsedAmount are not NaN
        if (!invoiceNos.has(InvoiceNo)) {
          // If the InvoiceNo hasn't been inserted into the sell_invoice table yet, insert it along with the relevant data
          invoiceNos.add(InvoiceNo); // Add the InvoiceNo to the Set of already-inserted InvoiceNos
          pool.query('INSERT INTO yybuy_record (Invoice_number, Name, BankName, Bank, Bankaccount, Remarks) VALUES (?, ?, ?, ?, ?, ?)', [InvoiceNo, Name, BankName, Bank, BankNumber, Remarks], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              // If the insert into sell_invoice is successful, insert the corresponding data into the items_sell table
              pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, SKU, Description, SizeUS, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
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
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount) VALUES (?, ?, ?, ?, ?, ?, ?)', [InvoiceNo, SKU, Description, SizeUS, Quantity, parsedUnitPrice, parsedAmount], (error, results, fields) => {
            if (error) {
              console.error(error);
            } else {
              console.log(`Data successfully inserted for InvoiceNo ${InvoiceNo}`);
            }
          });
        }
      } else {
        console.log(`Skipping row with InvoiceNo ${InvoiceNo} due to NaN values`);
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportbuy_csv', function(req, res) {
  const sql = `SELECT yybuy_record.Invoice_number, yybuy_record.Name, yybuy_record.BankName, yybuy_record.Bank, yybuy_record.Bankaccount, yybuy_record.Remarks, yyitems_buy.Content_SKU AS Description, yyitems_buy.SizeUS, yyitems_buy.Quantity, yyitems_buy.UnitPrice, yyitems_buy.Amount
               FROM yybuy_record
               JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber
               ORDER BY yybuy_record.Invoice_number, yyitems_buy.Content_SKU`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      // If this row has a different invoice number than the previous one, start a new row in the CSV
      if (row.Invoice_number !== currentInvoiceNo) {
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
        currentInvoiceNo = row.Invoice_number;
      } else {
        // If this row has the same invoice number as the previous one, add a new row to the CSV
        csvData.push({
          InvoiceNo: row.Invoice_number,
          Name: row.Name,
          BankName: row.BankName,
          Bank: row.Bank,
          BankNumber: row.Bankaccount,
          Remarks: row.Remarks,
          Description: row.Description,
          SizeUS: row.SizeUS,
          Quantity: row.Quantity,
          UnitPrice: row.UnitPrice,
          Amount: row.Amount
        });
      }
    });

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=yybuy_data.csv');
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});


//-------------------------------------Bank statement---------------------------------------------------

  app.get('/accruals', function(req, res){
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
app.get('/stock-check', function(req, res) {
  pool.query('SELECT buy_record.Invoice_number, buy_record.Name, items_buy.Content_SKU, items_buy.SizeUS, SUM(items_buy.Quantity) as totalquantity, SUM(items_buy.Amount) as Total_Cost FROM buy_record JOIN items_buy ON buy_record.Invoice_number = items_buy.InvoiceNumber LEFT JOIN (SELECT Invoice_No, SUM(Amount) as Paid_Amount FROM purchase_paymentbreakdown GROUP BY Invoice_No) AS payment ON items_buy.InvoiceNumber = payment.Invoice_No GROUP BY items_buy.InvoiceNumber HAVING COALESCE(SUM(items_buy.Amount),0) - COALESCE(SUM(payment.Paid_Amount),0) = 0', function(error, zeroResults) {
    if (error) {
      console.log(error);
    } else {
      pool.query('SELECT buy_record.Invoice_number, buy_record.Name, items_buy.Content_SKU, items_buy.SizeUS, SUM(items_buy.Quantity) as totalquantity, SUM(items_buy.Amount) as Total_Cost FROM buy_record JOIN items_buy ON buy_record.Invoice_number = items_buy.InvoiceNumber LEFT JOIN (SELECT Invoice_No, SUM(Amount) as Paid_Amount FROM purchase_paymentbreakdown GROUP BY Invoice_No) AS payment ON items_buy.InvoiceNumber = payment.Invoice_No GROUP BY items_buy.InvoiceNumber HAVING COALESCE(SUM(items_buy.Amount),0) - COALESCE(SUM(payment.Paid_Amount),0) <> 0', function(error, nonZeroResults) {
        if (error) {
          console.log(error);
        } else {
          pool.query('SELECT yybuy_record.Invoice_number, yybuy_record.Name, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, SUM(yyitems_buy.Quantity) as yytotalquantity, SUM(yyitems_buy.Amount) as yyTotal_Cost FROM yybuy_record JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber LEFT JOIN (SELECT Invoice_No, SUM(Amount) as yyPaid_Amount FROM yypurchase_paymentbreakdown GROUP BY Invoice_No) AS yypayment ON yyitems_buy.InvoiceNumber = yypayment.Invoice_No GROUP BY yyitems_buy.InvoiceNumber HAVING COALESCE(SUM(yyitems_buy.Amount),0) - COALESCE(SUM(yypayment.yyPaid_Amount),0) = 0', function(error, yyzeroResults) {
            if (error) {
              console.log(error);
            } else {
              pool.query('SELECT yybuy_record.Invoice_number, yybuy_record.Name, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, SUM(yyitems_buy.Quantity) as yytotalquantity, SUM(yyitems_buy.Amount) as yyTotal_Cost FROM yybuy_record JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber LEFT JOIN (SELECT Invoice_No, SUM(Amount) as yyPaid_Amount FROM yypurchase_paymentbreakdown GROUP BY Invoice_No) AS yypayment ON yyitems_buy.InvoiceNumber = yypayment.Invoice_No GROUP BY yyitems_buy.InvoiceNumber HAVING COALESCE(SUM(yyitems_buy.Amount),0) - COALESCE(SUM(yypayment.yyPaid_Amount),0) <> 0', function(error, yynonZeroResults) {
                if (error) {
                  console.log(error);
                } else {
                  res.render('stock-check', { zeroData: zeroResults, nonZeroData: nonZeroResults, yyzeroData: yyzeroResults, yynonZeroData: yynonZeroResults});
                }
              });
            }
          });
        }
      });
    }
  });
});
app.get('/check', (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const buyrecordQuery = `SELECT * FROM buy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyrecordQuery, (error, buyrecordResults) => {
    if (error) throw error;

    if (!buyrecordResults.length) {
      // Render the sales-details.ejs view with no buyrecordResults
      res.render('stock-details', {
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
          res.render('stock-details', {
            invoiceNumber: invoiceNumber,
            buyrecordResults: buyrecordResults,
            itemsBuyResults: itemsBuyResults,
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

//for stock-checkin
app.get('/stock-checkin', function(req, res){
  res.render('stock-checkin')
});
app.post('/stock-checkin',upload.single('file'),  urlencodedParser, function(req, res){
    const { purchase_order_no, date, name, productsku, size } = req.body;

    // Insert the form data into MySQL
    pool.query('INSERT INTO stock_checkin (Purchase_order_no, Seller_name, Product_SKU, Size_US) VALUES (?, ?, ?, ?)', [purchase_order_no, name, productsku, size], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('stock-checkin', { successMessage: 'Form submitted successfully' });
      }
    });
});

//for stock-check
app.get('/stock-checkins', function(req, res){
  res.render('stock-checkins')
});

//for shipped record page
app.get('/shippedrecord', function(req, res){
  res.render('shippedrecord');
});
//for shipped record page - single ship
app.get('/singleshipped', function(req, res){
  res.render('singleshipped');
});
app.post('/singleshipped',upload.single('file'),  urlencodedParser, function(req, res){
  const { trackingno, date, sku, size, category, remarks } = req.body;

  // Insert the form data into MySQL
  pool.query('INSERT INTO singleship (TrackingNumber, Date, Content_SKU, SizeUS, Category, Remarks) VALUES (?, ?, ?, ?, ?, ?)', [trackingno, date, sku, size, category, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('singleshipped', { successMessage: 'Form submitted successfully' });
    }
  });
});

//for shipped record page - bulk ship
app.get('/bulkshipped', function(req, res){
  res.render('bulkshipped');
});
app.post('/bulkshipped', upload.single('file'), urlencodedParser, function (req, res) {
  const { trackingno, date, boxno, category, remarks, field1 = [], field2 = [], field3 = [] } = req.body;

  // Insert the main form data into MySQL
  pool.query('INSERT INTO bulkship (TrackingNumber, Date, BoxNumber, Category, Remarks) VALUES (?, ?, ?, ?, ?)', [trackingno, date, boxno, category, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      const bulkShipBoxNumber = boxno;
      const shippedItems = field1.map((item, index) => [bulkShipBoxNumber, item, field2[index], field3[index]]);

      // Insert the shipped items data into MySQL
      pool.query('INSERT INTO shipped_items (BulkShipBoxNumber, Content_SKU, SizeUS, Quantity) VALUES ?', [shippedItems], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving shipped items data');
        } else {
          console.log(req.body);
          res.render('bulkshipped', { successMessage: 'Form submitted successfully' });
        }
      });
    }
  });
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
          const sellItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index]]);
              
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
              const balance_left = total_amount - total_paid_amount;
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
              const balance_left = total_amount - total_paid_amount;
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
      const itemsBuyQuery = `SELECT * FROM items_buy WHERE InvoiceNumber = '${invoiceNumber}'`;
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


//-------below is for Yong & Yi  Partnership Enterprise-----------------------------------------------------------------------------
//-------------------Sales-----------------------------------------------------------------------------
//for sales - sell invoice
app.get('/yysell_invoice', function(req, res){
  res.render('yysell_invoice');
});
app.post('/yysell_invoice', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;

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
          // Map over the sell items and add the invoice number to each item
          const sellItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index]]);
              
          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, SizeUS, UnitPrice, Quantity, Amount) VALUES ?', [sellItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              console.log(req.body);
              res.render('yysell_invoice', { successMessage: 'Form submitted successfully' });
            }
          });
        }
      });
    }
  });
});
//for sales-payment break
app.get('/yysales-paymentbreak',function(req, res){
  res.render('yysales-paymentbreak');
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
              const balance_left = total_amount - total_paid_amount;
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
  res.render('yybuy-payby');
});
app.post('/yybuy-payby', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, bankname, bank, bankacc, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [] } = req.body;

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
          const buyItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index], field6[index]]);

          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, UnitPrice, Quantity, Amount) VALUES ?', [buyItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              console.log(req.body);
              res.render('yybuy-payby', { successMessage: 'Form submitted successfully' });
            }
          });
        }
      });
    }
  });
});
  //for buy-payment break
app.get('/yybuy-paymentbreak', function(req, res){
  res.render('yybuy-paymentbreak');
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
  
  pool.query(`SELECT * FROM yybuy_record WHERE Invoice_number ${invoice_number_query}`, invoice_number_params, (error, results) => {
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

      const processInvoiceData = (index, callback) => {
        if (index >= buy_record_data.length) {
          callback();
        } else {
          const invoice = buy_record_data[index];
          getTotalAmount(invoice.Invoice_number, (total_amount) => {
            getTotalPaidAmount(invoice.Invoice_number, (total_paid_amount) => {
              const balance_left = total_amount - total_paid_amount;
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

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].Quantity);
        }

        // Query the sales_paymentbreakdown table
        const BuyPaymentQuery = `SELECT * FROM yypurchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
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
          res.render('yybuy-details', {
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
      // Query the items_sell table
      const itemsBuyQuery = `SELECT * FROM yyitems_buy WHERE InvoiceNumber = '${invoiceNumber}'`;
      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += (itemsBuyResults[i].UnitPrice * itemsBuyResults[i].Quantity);
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
app.get('/yycompany2personal', function(req, res){
      res.render('yycompany2personal');
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
app.get('/yypersonal2company', function(req, res){
      res.render('yypersonal2company');
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


//----------------------Ending--------------------------------------------------------------------------------
app.get('/profile/:name', function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://192.168.0.126:5000/');
});