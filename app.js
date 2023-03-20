const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });
const ejs = require('ejs');

app.use(express.static(__dirname + '/public'));
app.use(express.static('public'))

const pool = mysql.createPool({
    connectionLimit: 10,
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
//for bank statement
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

        //for stock-checkin
app.get('/stock-checkin', function(req, res){
  res.render('stock-checkin');
});
app.post('/stock-checkin',upload.single('file'),  urlencodedParser, function(req, res){
    const { purchase_order_no, date, name, productsku, size } = req.body;

    // Insert the form data into MySQL
    pool.query('INSERT INTO stock_checkin (Purchase_order_no, Check_in_Date, Seller_name, Product_SKU, Size_US) VALUES (?, ?, ?, ?, ?)', [purchase_order_no, date, name, productsku, size], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
      } else {
        console.log(req.body);
        res.render('stock-checkin', { successMessage: 'Form submitted successfully' });
      }
    });
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

//for sales - sell invoice
app.get('/sell_invoice', function(req, res){
  res.render('sell_invoice');
});
app.post('/sell_invoice', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, companyname, phone, adr1, adr2, adr3, postcode, city, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;
  // Insert the main form data into MySQL
  pool.query('INSERT INTO sell_invoice (Name, CompanyName, Phone, Address1, Address2, Address3, PostCode, City, Country, Remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, companyname, phone, adr1, adr2, adr3, postcode, city, country, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      const invoice_number = results.insertId;
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
});

//for sales - sell invoice
app.get('/buy-payby', function(req, res){
  res.render('buy-payby');
});
app.post('/buy-payby', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, companyname, bank, bankacc, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [] } = req.body;
  // Insert the main form data into MySQL
  pool.query('INSERT INTO buy_record (Name, CompanyName, Bank, Bankaccount, Remarks) VALUES (?, ?, ?, ?, ?)', [name, companyname, bank, bankacc, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      const invoice_number = results.insertId;
      const buyItems = field1.map((item, index) => [invoice_number, item, field2[index], field3[index], field4[index], field5[index]]);

      // Insert the shipped items data into MySQL
      pool.query('INSERT INTO items_buy (InvoiceNumber, Content_SKU, SizeUS, UnitPrice, Quantity, Amount) VALUES ?', [buyItems], (error, results, fields) => {
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

// for sales invoice generate
app.get('/invoice_generate', function(req, res) {
  res.render('invoice_generate');
});

//for database
app.get('/database', function(req, res){
  res.render('database');
});


app.get('/profile/:name', function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(5000);