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
app.use('/api', createProxyMiddleware({ target: 'http://192.168.0.136:2000', changeOrigin: true }));

const pool = mysql.createPool({
    poolLimit: 10,
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'test11'
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

//change password here
app.post('/login', urlencodedParser, async (req, res) => {
  const { username, password } = req.body;

  // You can replace this with a database query to fetch the user's details
  const user = {
    username: 'yongkhaw',
    password: await bcrypt.hash('abc123', 10)
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



app.get('/', requireLogin, (req, res) => {
  let startDate = req.query.startDate;
  let endDate = req.query.endDate;

  // check if start date is defined
  if (!startDate) {
    startDate = '0001-01-01';
  }

  // check if end date is defined
  if (!endDate) {
    endDate = '9999-12-31';
  } else {
    // add 23:59:59 to end date if time not selected
    if (!endDate.includes('T')) {
      endDate += ' 23:59:59';
    }
  }

  const sql = `
    SELECT
      Content_SKU,
      product_name,
      SUM(Quantity) AS totalQuantity,
      SUM(Amount) AS totalSales,
      SUM(Amount - (Quantity * CostPrice)) AS totalProfit,
      SUM(Quantity * CostPrice) AS totalCost,
      (SUM(Amount - (Quantity * CostPrice)) / SUM(Quantity)) AS averageProfit,
      AVG(UnitPrice) AS averagePrice
    FROM
      yyitems_sell
      INNER JOIN yysell_invoice
      ON yyitems_sell.InvoiceNumber = yysell_invoice.Invoice_number
    WHERE
      yysell_invoice.timestamp >= ? AND yysell_invoice.timestamp <= ? AND yyitems_sell.Content_SKU != ""
    GROUP BY
      Content_SKU,
      product_name
    ORDER BY
      SUM(Quantity) DESC;
  `;
  pool.query(sql, [startDate, endDate], (err, result) => {
    if (err) {
      console.error('Error executing query', err.stack);
      res.status(500).send('Error executing query');
      return;
    }
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
  
              pool.query('SELECT SUM(Amount) AS total_purchasesLastyear FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                if (err) throw err;
                const totalPurchasesLastyear = results[0].total_purchasesLastyear;
  
                pool.query('SELECT SUM(CostPrice) AS total_costLastyear FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [lastYear], (err, results) => {
                  if (err) throw err;
                  const totalCostLastyear = results[0].total_costLastyear;
  
                  pool.query('SELECT SUM(Amount) AS total_buy FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND YEAR(solddate) = ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) < ?)', [selectedYear,selectedYear], (err, results) => {
                    if (err) throw err;
                    const totalbuy = results[0].total_buy;
  
                    pool.query('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE ProductName != "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
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
  
                                                pool.query('SELECT SUM(Amount) AS buydiscount FROM yyitems_buy WHERE ProductName = "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                                                  if (err) throw err;
                                                  const total_buydiscount = results[0].buydiscount;
                    
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

                                                                        pool.query('SELECT SUM(UnitPrice) AS total_salesno2 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
                                                                          if (err) throw err;
                                                                          const totalSalesno2 = results[0].total_salesno2;
                                                                  
                                                                          pool.query('SELECT SUM(Amount) AS total_purchasesno2 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
                                                                            if (err) throw err;
                                                                            const totalPurchasesno2 = results[0].total_purchasesno2;
                                                                          
                                                                            pool.query('SELECT SUM(Amount) AS total_gdex FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [selectedYear], (err, results) => {
                                                                              if (err) throw err;
                                                                              const totalgdex = results[0].total_gdex;

                                                                              pool.query('SELECT SUM(bonuscredit) AS bonus2 FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                                                                if (err) throw err;
                                                                                const bonus2 = results[0].bonus2;
                                                                                
                                                                                pool.query('SELECT SUM(Amount) AS totalSalespaid FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear], (err, results) => {
                                                                                  if (err) throw err;
                                                                                  const totalSalespaid = results[0].totalSalespaid;
    
                                                                                  pool.query('SELECT SUM(Amount) AS totalTopup FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                                                                    if (err) throw err;
                                                                                    const totalTopup = results[0].totalTopup;
    
                                                                                    pool.query('SELECT SUM(Amount) AS totalBuypaid FROM yypurchase_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                                                                      if (err) throw err;
                                                                                      const totalBuypaid = results[0].totalBuypaid;
    
                                                                                      pool.query('SELECT SUM(amount) AS totalcapital FROM yyequity WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                                                                        if (err) throw err;
                                                                                        const totalcapital = results[0].totalcapital;
    
                                                                                        pool.query('SELECT SUM(Amount) AS totalotcredit FROM yyothercreditor WHERE YEAR(date) = ?', [selectedYear], (err, results) => {
                                                                                          if (err) throw err;
                                                                                          const totalotcredit = results[0].totalotcredit;
    
                                                                                          pool.query('SELECT SUM(amount) AS totaldeposit FROM yydeposit WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                                                                            if (err) throw err;
                                                                                            const totaldeposit = results[0].totaldeposit;
    
                                                                                            pool.query('SELECT SUM(Amount) AS totalaccrued FROM yyexpensesrecord WHERE accrued = "yes" AND settle = "no" AND YEAR(Date) = ?', [selectedYear], (err, results) => {
                                                                                              if (err) throw err;
                                                                                              const totalaccrued = results[0].totalaccrued;

                                                                                              pool.query('SELECT SUM(Amount) AS total_purchasesno1 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                                                                                                if (err) throw err;
                                                                                                const totalPurchasesno1 = results[0].total_purchasesno1;
    
                                                                                                pool.query(`
                                                                                                  SELECT 
                                                                                                    a.bank, 
                                                                                                    a.amount 
                                                                                                  FROM 
                                                                                                    yycurrent_assets a
                                                                                                  INNER JOIN (
                                                                                                    SELECT 
                                                                                                      bank, 
                                                                                                      MAX(date) AS max_date 
                                                                                                    FROM 
                                                                                                      yycurrent_assets 
                                                                                                    WHERE 
                                                                                                      YEAR(date) = ? 
                                                                                                    GROUP BY 
                                                                                                      bank
                                                                                                  ) b ON a.bank = b.bank AND a.date = b.max_date
                                                                                                `, [selectedYear], (error, assetsResults, fields) => {
                                                                                                  if (error) {
                                                                                                    console.error(error);
                                                                                                    res.status(500).send('Error fetching data');
                                                                                                  } else {
                                                                                                    const assetsData = assetsResults.map(row => ({ ...row }));

                                                                                                    pool.query('SELECT YEAR(y.timestamp) AS sales_year, SUM(i.Amount) AS total_sales2 FROM yyitems_sell i JOIN yysell_invoice y ON i.InvoiceNumber = y.Invoice_number WHERE i.Content_SKU IS NOT NULL AND i.Content_SKU != "" GROUP BY YEAR(y.timestamp)', (err, results) => {
                                                                                                      if (err) throw err;
                                                                                                      const salesData = results.map(result => ({
                                                                                                        year: result.sales_year,
                                                                                                        sales: result.total_sales2
                                                                                                      }));

                                                                                                      pool.query('SELECT YEAR(y.timestamp) AS sales_year, SUM(i.Amount) AS total_salesno2 FROM yyitems_sell i JOIN yysell_invoice y ON i.InvoiceNumber = y.Invoice_number GROUP BY YEAR(y.timestamp)', (err, results) => {
                                                                                                        if (err) throw err;
                                                                                                        const salesData2 = results.map(result => ({
                                                                                                          year: result.sales_year,
                                                                                                          sales: result.total_salesno2
                                                                                                        }));

                                                                                                        pool.query('SELECT YEAR(date) AS sales_year, SUM(bonuscredit) AS bonus FROM yytopupbalance GROUP BY YEAR(date)', (err, results) => {
                                                                                                          if (err) throw err;
                                                                                                          const bonusData = results.map(result => ({
                                                                                                            year: result.sales_year,
                                                                                                            bonus: result.bonus
                                                                                                          }));

                                                                                                          pool.query('SELECT YEAR(date) AS sales_year, SUM(amount) AS refundsales1 FROM refund WHERE refund2buyer = "yes" GROUP BY YEAR(date)', (err, results) => {
                                                                                                            if (err) throw err;
                                                                                                            const refundData = results.map(result => ({
                                                                                                              year: result.sales_year,
                                                                                                              refundsales: result.refundsales1
                                                                                                            }));

                                                                                                            pool.query('SELECT DISTINCT YEAR(`timestamp`) AS ayear FROM yybuy_record', (err, results) => {
                                                                                                              if (err) throw err;
                                                                                                              const ayears = results.map(result => result.ayear);
                                                                                                          
                                                                                                              // Create an array to store the calculated net profits for each year
                                                                                                              const netProfits = [];
                                                                                                              const totalAssetss = [];
                                                                                                              const equitys = [];
                                                                                                          
                                                                                                              // Loop through each year and perform the necessary calculations
                                                                                                              ayears.forEach(year => {
                                                                                                                // Query to fetch the total purchases from the previous year
                                                                                                                pool.query('SELECT SUM(Amount) AS totalPurchasesLastyear0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year - 1], (err, results) => {
                                                                                                                  if (err) throw err;
                                                                                                                  const totalPurchasesLastyear0 = results[0].totalPurchasesLastyear0 || 0;

                                                                                                                  pool.query('SELECT SUM(Amount) AS totalexpenses0 FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ?', [year], (err, results) => {
                                                                                                                    if (err) throw err;
                                                                                                                    const totalexpenses0 = results[0].totalexpenses0 || 0;

                                                                                                                    pool.query('SELECT SUM(Amount) AS bftotalexpense0 FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ?', [year-1], (err, results) => {
                                                                                                                      if (err) throw err;
                                                                                                                      const bftotalexpense0 = results[0].bftotalexpense0 || 0;
                                                                                                          
                                                                                                                    // Query to fetch the total cost from the previous year
                                                                                                                    pool.query('SELECT SUM(CostPrice) AS totalCostLastyear0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year - 1], (err, results) => {
                                                                                                                      if (err) throw err;
                                                                                                                      const totalCostLastyear0 = results[0].totalCostLastyear0 || 0;
                                                                                                            
                                                                                                                      // Query to fetch the total purchases without SKU for the current year
                                                                                                                      pool.query('SELECT SUM(Amount) AS totalPurchasesWOnosku0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                        if (err) throw err;
                                                                                                                        const totalPurchasesWOnosku0 = results[0].totalPurchasesWOnosku0 || 0;
                                                                                                            
                                                                                                                        // Query to fetch the total ship expenses for the current year
                                                                                                                        pool.query('SELECT SUM(Amount) AS totalShip0 FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [year], (err, results) => {
                                                                                                                          if (err) throw err;
                                                                                                                          const totalShip0 = results[0].totalShip0 || 0;
                                                                                                            
                                                                                                                          // Query to fetch the total purchases and total cost for the current year
                                                                                                                          pool.query('SELECT SUM(Amount) AS totalPurchases0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [year], (err, results) => {
                                                                                                                            if (err) throw err;
                                                                                                                            const totalPurchases0 = results[0].totalPurchases0 || 0;
                                                                                                                            
                                                                                                                            pool.query('SELECT SUM(CostPrice) AS totalCost0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [year], (err, results) => {
                                                                                                                              if (err) throw err;
                                                                                                                              const totalCost0 = results[0].totalCost0 || 0;
                                                                                                            
                                                                                                                              // Query to fetch the supplier refunds for the current year
                                                                                                                              pool.query('SELECT SUM(amount) AS supRefunds0 FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [year], (err, results) => {
                                                                                                                                if (err) throw err;
                                                                                                                                const supRefunds0 = results[0].supRefunds0 || 0;
                                                                                                            
                                                                                                                                // Query to fetch the total purchases without SKU for the current year (continued)
                                                                                                                                pool.query('SELECT SUM(Amount) AS totalPurchasesno0 FROM yyitems_buy WHERE ProductName != "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                                  if (err) throw err;
                                                                                                                                  const totalPurchasesno0 = results[0].totalPurchasesno0 || 0;
                                                                                                            
                                                                                                                                  // Query to fetch the total buy discount for the current year
                                                                                                                                  pool.query('SELECT SUM(Amount) AS buydiscount0 FROM yyitems_buy WHERE ProductName = "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                                    if (err) throw err;
                                                                                                                                    const totalBuyDiscount0 = results[0].buydiscount0 || 0;

                                                                                                                                    pool.query('SELECT SUM(Amount) AS totalSalespaid0 FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [year], (err, results) => {
                                                                                                                                      if (err) throw err;
                                                                                                                                      const totalSalespaid0 = results[0].totalSalespaid0 || 0;

                                                                                                                                      pool.query('SELECT SUM(Amount) AS totalTopup0 FROM yytopupbalance WHERE YEAR(date) <= ?', [year], (err, results) => {
                                                                                                                                        if (err) throw err;
                                                                                                                                        const totalTopup0 = results[0].totalTopup0 || 0;

                                                                                                                                        pool.query('SELECT SUM(Amount) AS total_gdex0 FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [year], (err, results) => {
                                                                                                                                          if (err) throw err;
                                                                                                                                          const totalgdex0 = results[0].total_gdex0 || 0;

                                                                                                                                          pool.query('SELECT SUM(amount) AS totaldeposit0 FROM yydeposit WHERE YEAR(date) <= ?', [year], (err, results) => {
                                                                                                                                            if (err) throw err;
                                                                                                                                            const totaldeposit0 = results[0].totaldeposit0 || 0;

                                                                                                                                            pool.query('SELECT SUM(UnitPrice) AS total_salesno20 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [year], (err, results) => {
                                                                                                                                              if (err) throw err;
                                                                                                                                              const totalSalesno20 = results[0].total_salesno20 || 0;

                                                                                                                                              pool.query('SELECT SUM(bonuscredit) AS bonus20 FROM yytopupbalance WHERE YEAR(date) = ?', [year], (err, results) => {
                                                                                                                                                if (err) throw err;
                                                                                                                                                const bonus20 = results[0].bonus20 || 0;

                                                                                                                                                pool.query('SELECT SUM(amount) AS totalCashInBank0 FROM yycurrent_assets WHERE YEAR(date) = ? AND (date, bank) IN (SELECT MAX(date), bank FROM yycurrent_assets WHERE YEAR(date) = ? GROUP BY bank)', [year, year], (err, results) => {
                                                                                                                                                  if (err) throw err;
                                                                                                                                                  const totalCashInBank0 = results[0].totalCashInBank0 || 0;

                                                                                                                                                  pool.query('SELECT SUM(Amount) AS total_c2p0 FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [year], (err, results) => {
                                                                                                                                                    if (err) throw err;
                                                                                                                                                    const totalc2p0 = results[0].total_c2p0 || 0;
                                                                                                                
                                                                                                                                                      pool.query('SELECT SUM(Amount) AS total_p2c0 FROM yypersonalfund2company WHERE YEAR(Date) = ?', [year], (err, results) => {
                                                                                                                                                        if (err) throw err;
                                                                                                                                                        const totalp2c0 = results[0].total_p2c0 || 0;
                                                                                                                                                      
                                                                                                                                                        pool.query('SELECT SUM(Amount) AS total_sales0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                                                          if (err) throw err;
                                                                                                                                                          const totalSales0 = results[0].total_sales0 || 0;
                                                                                                                                                        
                                                                                                                                                          pool.query('SELECT SUM(UnitPrice) AS total_salesno0 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                                                            if (err) throw err;
                                                                                                                                                            const totalSalesno0 = results[0].total_salesno0 || 0;
                                                                                                                                                          
                                                                                                                                                            pool.query('SELECT SUM(bonuscredit) AS bonus0 FROM yytopupbalance WHERE YEAR(date) = ?', [year], (err, results) => {
                                                                                                                                                              if (err) throw err;
                                                                                                                                                              const bonus0 = results[0].bonus0 || 0;
                                                                                                                                                            
                                                                                                                                                              pool.query('SELECT SUM(amount) AS refundsales0 FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [year], (err, results) => {
                                                                                                                                                                if (err) throw err;
                                                                                                                                                                const refundsales0 = results[0].refundsales0 || 0;
                                                                                                                                                              
                                                                                                                                                                pool.query('SELECT SUM(Amount) AS total_purchasesWOnosku0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year], (err, results) => {
                                                                                                                                                                  if (err) throw err;
                                                                                                                                                                  const total_purchasesWOnosku0 = results[0].total_purchasesWOnosku0 || 0;
                                                                                                                                                                
                                                                                                                                                                  pool.query('SELECT SUM(Amount) AS bftotal_sales0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year-1], (err, results) => {
                                                                                                                                                                    if (err) throw err;
                                                                                                                                                                    const bftotalSales0 = results[0].bftotal_sales0 || 0;
                                                                                                                                                                  
                                                                                                                                                                    pool.query('SELECT SUM(UnitPrice) AS bftotal_salesno0 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year-1], (err, results) => {
                                                                                                                                                                      if (err) throw err;
                                                                                                                                                                      const bftotalSalesno0 = results[0].bftotal_salesno0 || 0;
                                                                                                                                                                    
                                                                                                                                                                      pool.query('SELECT SUM(bonuscredit) AS bfbonus0 FROM yytopupbalance WHERE YEAR(date) = ?', [year-1], (err, results) => {
                                                                                                                                                                        if (err) throw err;
                                                                                                                                                                        const bfbonus0 = results[0].bfbonus0 || 0;
                                                                                                                                                                      
                                                                                                                                                                        pool.query('SELECT SUM(amount) AS bfrefundsales0 FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [year-1], (err, results) => {
                                                                                                                                                                          if (err) throw err;
                                                                                                                                                                          const bfrefundsales0 = results[0].bfrefundsales0 || 0;
                                                                                                                                                                        
                                                                                                                                                                          pool.query('SELECT SUM(Amount) AS bftotal_purchasesLastyear0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year-2], (err, results) => {
                                                                                                                                                                            if (err) throw err;
                                                                                                                                                                            const bftotalPurchasesLastyear0 = results[0].bftotal_purchasesLastyear0 || 0;
                                                                                                                                                                          
                                                                                                                                                                            pool.query('SELECT SUM(CostPrice) AS bftotal_costLastyear0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [year-2], (err, results) => {
                                                                                                                                                                              if (err) throw err;
                                                                                                                                                                              const bftotalCostLastyear0 = results[0].bftotal_costLastyear0 || 0;
                                                                                                                                                                            
                                                                                                                                                                              pool.query('SELECT SUM(Amount) AS bftotal_purchasesWOnosku0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year-1], (err, results) => {
                                                                                                                                                                                if (err) throw err;
                                                                                                                                                                                const bftotal_purchasesWOnosku0 = results[0].bftotal_purchasesWOnosku0 || 0;
                                                                                                                                                                              
                                                                                                                                                                                pool.query('SELECT SUM(Amount) AS bftotal_purchasesno0 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [year-1], (err, results) => {
                                                                                                                                                                                  if (err) throw err;
                                                                                                                                                                                  const bftotalPurchasesno0 = results[0].bftotal_purchasesno0 || 0;
                                                                                                                                                                                
                                                                                                                                                                                  pool.query('SELECT SUM(Amount) AS bftotal_ship0 FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [year-1], (err, results) => {
                                                                                                                                                                                    if (err) throw err;
                                                                                                                                                                                    const bftotalship0 = results[0].bftotal_ship0 || 0;
                                                                                                                                                                                  
                                                                                                                                                                                    pool.query('SELECT SUM(Amount) AS bftotal_purchases0 FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [year-1], (err, results) => {
                                                                                                                                                                                      if (err) throw err;
                                                                                                                                                                                      const bftotalPurchases0 = results[0].bftotal_purchases0 || 0;
                                                                                                                                                                                    
                                                                                                                                                                                      pool.query('SELECT SUM(CostPrice) AS bftotal_cost0 FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [year-1], (err, results) => {
                                                                                                                                                                                        if (err) throw err;
                                                                                                                                                                                        const bftotalCost0 = results[0].bftotal_cost0 || 0;
                                                                                                                                                                                      
                                                                                                                                                                                        pool.query('SELECT SUM(amount) AS bfsupRefund0 FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [year-1], (err, results) => {
                                                                                                                                                                                          if (err) throw err;
                                                                                                                                                                                          const bfsupRefunds0 = results[0].bfsupRefund0 || 0;
                                                                                                                                                                                        
                                                                                                                                                                                          pool.query('SELECT SUM(Amount) AS bftotal_c2p0 FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [year-1], (err, results) => {
                                                                                                                                                                                            if (err) throw err;
                                                                                                                                                                                            const bftotalc2p0 = results[0].bftotal_c2p0 || 0;
                                                                                                                                    
                                                                                                                                                                                            pool.query('SELECT SUM(Amount) AS bftotal_p2c0 FROM yypersonalfund2company WHERE YEAR(Date) = ?', [year-1], (err, results) => {
                                                                                                                                                                                              if (err) throw err;
                                                                                                                                                                                              const bftotalp2c0 = results[0].bftotal_p2c0 || 0;
                                                                                                                                    
                                                                                                                                                                                              pool.query('SELECT SUM(amount) AS totalcapital0 FROM yyequity WHERE YEAR(date) <= ?', [year], (err, results) => {
                                                                                                                                                                                                if (err) throw err;
                                                                                                                                                                                                const totalcapital0 = results[0].totalcapital0 || 0;

                                                                                                                                                                                                  const totalassets = ((totalPurchases0 - totalCost0) + (totalSalesno20 - totalSalespaid0) + (totalTopup0 + bonus20 - totalgdex0) + totaldeposit0 + totalCashInBank0);
                                                                                                                                                                                                  // Calculate the net profit for the current year based on the provided formula



                                                                                                                                                                                                  const equity = ((((((((totalSales0 + totalSalesno0
                                                                                                                                                                                                    - totalSales0 + bonus0) - refundsales0)- 
                                                                                                                                                                                                   ((totalPurchasesLastyear0 - totalCostLastyear0)
                                                                                                                                                                                                    +total_purchasesWOnosku0 + totalShip0 - 
                                                                                                                                                                                                   (totalPurchases0 - totalCost0) - 
                                                                                                                                                                                                   supRefunds0 + (totalPurchasesno0 - 
                                                                                                                                                                                                   total_purchasesWOnosku0))
                                                                                                                                                                                                   +Math.abs(totalBuyDiscount0))-totalexpenses0)+ 
                                                                                                                                                                                                   totalc2p0 - totalp2c0))+((((((bftotalSales0 + bftotalSalesno0
                                                                                                                                                                                                   -bftotalSales0 + bfbonus0) - bfrefundsales0) - 
                                                                                                                                                                                                  ((bftotalPurchasesLastyear0 - bftotalCostLastyear0)
                                                                                                                                                                                                   + bftotal_purchasesWOnosku0 + bftotalship0 - 
                                                                                                                                                                                                  (bftotalPurchases0 - bftotalCost0) - 
                                                                                                                                                                                                  bfsupRefunds0 + (bftotalPurchasesno0 - 
                                                                                                                                                                                                  bftotal_purchasesWOnosku0)))-bftotalexpense0) + 
                                                                                                                                                                                                 bftotalc2p0 - bftotalp2c0))) + totalcapital0);




                                                                                                                                                                                                  const netProfit =((totalPurchasesLastyear0 - totalCostLastyear0) + totalPurchasesWOnosku0 + totalShip0 - (totalPurchases0 - totalCost0) - supRefunds0 + (totalPurchasesno0 - totalPurchasesWOnosku0)) - (Math.abs(totalBuyDiscount0)) + bftotalexpense0;
                                                                                                                                                                          
                                                                                                                                                                                                  // Push the net profit for the current year into the netProfits array
                                                                                                                                                                                                  equitys.push(equity);
                                                                                                                                                                                                  netProfits.push(netProfit);
                                                                                                                                                                                                  totalAssetss.push(totalassets);

                                                                                                                                                                                                  pool.query(
                                                                                                                                                                                                    `SELECT
                                                                                                                                                                                                      yyitems_buy.Content_SKU AS sku,
                                                                                                                                                                                                      yyitems_buy.ProductName AS product_name,
                                                                                                                                                                                                      AVG(DATEDIFF(yysell_invoice.timestamp, yybuy_record.timestamp)) AS average_days_to_sold
                                                                                                                                                                                                    FROM
                                                                                                                                                                                                      yyitems_buy
                                                                                                                                                                                                      INNER JOIN yybuy_record ON yyitems_buy.InvoiceNumber = yybuy_record.Invoice_number
                                                                                                                                                                                                      INNER JOIN yyitems_sell ON yyitems_buy.Content_SKU = yyitems_sell.Content_SKU
                                                                                                                                                                                                      INNER JOIN yysell_invoice ON yyitems_sell.InvoiceNumber = yysell_invoice.Invoice_number
                                                                                                                                                                                                    WHERE
                                                                                                                                                                                                      yysell_invoice.timestamp >= ? AND yysell_invoice.timestamp <= ? AND yyitems_sell.Content_SKU != ""
                                                                                                                                                                                                    GROUP BY
                                                                                                                                                                                                      yyitems_buy.Content_SKU,
                                                                                                                                                                                                      yyitems_buy.ProductName
                                                                                                                                                                                                    ORDER BY
                                                                                                                                                                                                      AVG(DATEDIFF(yysell_invoice.timestamp, yybuy_record.timestamp)) DESC;`,
                                                                                                                                                                                                    [startDate, endDate],
                                                                                                                                                                                                    (err, results) => {
                                                                                                                                                                                                      if (err) throw err;
                                                                                                                                                                                                      const firstResult = results[0] || {};
                                                                                                                                                                                                      const sku = firstResult.sku || "";
                                                                                                                                                                                                      const product_name = firstResult.product_name || "";
                                                                                                                                                                                                      const average_days_to_sold = firstResult.average_days_to_sold || 0;
                                                                                                                                                                          
                                                                                                                                                                                                  // Check if all years have been processed
                                                                                                                                                                                                  if (netProfits.length === ayears.length && totalAssetss.length === ayears.length) {
                                                                                                                                                                                                    
                                                                                                                                                                                                    res.render('index', {
                                                                                                                                                                                                      data: results,
                                                                                                                                                                                                      sku,product_name,average_days_to_sold,
                                                                                                                                                                                                      equitys,
                                                                                                                                                                                                      totalAssetss,
                                                                                                                                                                                                      netProfits, 
                                                                                                                                                                                                      ayears,
                                                                                                                                                                                                      refundData,
                                                                                                                                                                                                      bonusData,
                                                                                                                                                                                                      salesData,
                                                                                                                                                                                                      salesData2,
                                                                                                                                                                                                      startDate, 
                                                                                                                                                                                                      endDate, 
                                                                                                                                                                                                      rows: result, 
                                                                                                                                                                                                      error: null ,
                                                                                                                                                                                                      years,
                                                                                                                                                                                                      selectedYear,
                                                                                                                                                                                                      totalSalesno,
                                                                                                                                                                                                      totalSales,
                                                                                                                                                                                                      totalCost,
                                                                                                                                                                                                      totalPurchases,
                                                                                                                                                                                                      totalPurchasesLastyear,
                                                                                                                                                                                                      totalbuy,
                                                                                                                                                                                                      totalCostLastyear,
                                                                                                                                                                                                      totalPurchasesno,
                                                                                                                                                                                                      total_purchasesWOnosku,
                                                                                                                                                                                                      totalStockValue,
                                                                                                                                                                                                      totalship,
                                                                                                                                                                                                      totalc2p,
                                                                                                                                                                                                      totalp2c,
                                                                                                                                                                                                      supRefunds,
                                                                                                                                                                                                      refundsales,
                                                                                                                                                                                                      bonus,
                                                                                                                                                                                                      bftotalSales,
                                                                                                                                                                                                      bftotalPurchasesno,
                                                                                                                                                                                                      bftotal_purchasesWOnosku,
                                                                                                                                                                                                      bftotalship,
                                                                                                                                                                                                      total_buydiscount,
                                                                                                                                                                                                      bftotalc2p,
                                                                                                                                                                                                      bftotalp2c,
                                                                                                                                                                                                      bfsupRefunds,
                                                                                                                                                                                                      bfrefundsales,
                                                                                                                                                                                                      bftotalPurchasesLastyear,
                                                                                                                                                                                                      bfbonus,
                                                                                                                                                                                                      bftotalCostLastyear,
                                                                                                                                                                                                      bftotalCost,
                                                                                                                                                                                                      bftotalPurchases,
                                                                                                                                                                                                      bftotalSalesno,
                                                                                                                                                                                                      totalExpenses: totalExpensesByCategory,
                                                                                                                                                                                                      bftotalExpenses: bftotalExpensesByCategory,
                                                                                                                                                                                                      totalSalesno2,
                                                                                                                                                                                                      totalPurchasesno2,
                                                                                                                                                                                                      totalgdex,
                                                                                                                                                                                                      bonus2,
                                                                                                                                                                                                      totalSalespaid,
                                                                                                                                                                                                      totalTopup,
                                                                                                                                                                                                      totalBuypaid,
                                                                                                                                                                                                      totalcapital,
                                                                                                                                                                                                      totalotcredit,
                                                                                                                                                                                                      totaldeposit,
                                                                                                                                                                                                      totalaccrued,
                                                                                                                                                                                                      totalPurchasesno1,
                                                                                                                                                                                                    assetsData
                                                                                                                                                                                                  });
                                                                                                                                                                                                };
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
                                                                                                  };
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
app.get('/bankledger', async (req, res) => {
  try {
    const salesResults = await queryDatabase('SELECT * FROM yysales_paymentbreakdown');
    const purchaseResults = await queryDatabase('SELECT * FROM yypurchase_paymentbreakdown');
    const expensesResults = await queryDatabase('SELECT * FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL OR accrued = "no" AND Name != "Gdex"');
    const accrualsResults = await queryDatabase('SELECT * FROM yyaccruals WHERE detail != "creditnote"');
    const topupResults = await queryDatabase('SELECT * FROM yytopupbalance WHERE wallet = "Gdex" ORDER BY ID DESC');
    const refundResults = await queryDatabase('SELECT amount, refund2buyer, fromSupplier, date FROM refund');
    const drawingResults = await queryDatabase('SELECT * FROM yycompanyfund2personal');
    const depositResults = await queryDatabase('SELECT * FROM yydeposit');
    const creditorResults = await queryDatabase('SELECT * FROM yyothercreditor');
    const capitalResults = await queryDatabase('SELECT * FROM yyequity');
    const capitalpayResults = await queryDatabase('SELECT * FROM yyothercreditor_paymentbreakdown');
    const debtorResults = await queryDatabase('SELECT * FROM yyotherdebtor');
    const debtorpayResults = await queryDatabase('SELECT * FROM yyotherdebtor_paymentbreakdown');
    const propayResults = await queryDatabase('SELECT * FROM procurementbuypaymentbreakdown');
    const prosellpayResults = await queryDatabase('SELECT * FROM procurementsellpaymentbreakdown');
    const prorefundResults = await queryDatabase('SELECT amount, refund2buyer, fromsupplier, date FROM procurementrefund');

    res.render('bankledger', { 
      totalSalesPaymentbreakdown: salesResults,
      totalPurchasePaymentbreakdown: purchaseResults,
      totalExpenses: expensesResults,
      totalExpensesPaymentbreakdown: accrualsResults,
      topupBalance: topupResults,
      refund: refundResults,
      totalDrawing: drawingResults,
      totalDeposit: depositResults,
      totalCapital: capitalResults,
      totalCreditor: creditorResults,
      totalCreditorpaymentbreak: capitalpayResults,
      totalDebtor: debtorResults,
      totalDebtorpaymentbreak: debtorpayResults,
      procurementbuypaymentbreakdown: propayResults,
      procurementsellpaymentbreakdown: prosellpayResults,
      prorefund: prorefundResults
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
});
async function queryDatabase(query) {
  return new Promise((resolve, reject) => {
    pool.query(query, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}
app.get('/profitlossstate', (req, res) => { 
  const currentYear = new Date().getFullYear(); // get current year
  let selectedYear = req.query.year ? parseInt(req.query.year) : currentYear;

  const profitLossQuery = `
  SELECT
    
    (SELECT SUM(costprice) FROM procurementdatabase WHERE name != 'return' AND YEAR(buydate) <= ?) AS lastYBuypro,

    (SELECT SUM(sellprice) FROM procurementdatabase WHERE YEAR(salesdate) <= ?) AS lastYSalespro,

    (SELECT SUM(CostPrice) FROM yyitems_sell
      WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)) AS lastYSales,

    (SELECT SUM(UnitPrice) FROM yyitems_buy
      WHERE (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
      AND InvoiceNumber IN
        (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)) AS lastYBuy,

    (SELECT SUM(UnitPrice) FROM yyitems_sell
      WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) = ?)) AS totalSales,

    (SELECT SUM(sellprice) FROM procurementdatabase WHERE name != "return" AND YEAR(salesdate) = ?) AS proSales,

    (SELECT SUM(amount) FROM refund 
      WHERE (refund2buyer = "yes") AND YEAR(date) = ?) AS refundOutwards,

    (SELECT SUM(Amount) FROM yyitems_buy
      WHERE Productname != "Discount" AND InvoiceNumber IN
        (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) = ?)) AS totalPurchase,

    (SELECT SUM(Amount) FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?) AS PostageCourier,

    (SELECT GROUP_CONCAT(courier, ':', amount) FROM (SELECT courier, SUM(amount) AS amount FROM creditnote WHERE YEAR(Date) = ? GROUP BY courier) AS subquery) AS courierData,

    (SELECT 
      SUM(UnitPrice)
      FROM 
        yyitems_buy
      WHERE 
        (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
        AND InvoiceNumber IN (
          SELECT Invoice_number 
          FROM yybuy_record 
          WHERE YEAR(timestamp) <= ?)
    ) AS allPurchase,

    (SELECT SUM(CostPrice) FROM yyitems_sell
      WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)) AS allSales,

    (SELECT SUM(amount) FROM refund 
      WHERE (fromSupplier = "yes") AND YEAR(date) = ?) AS refundInwards,
      
    (SELECT SUM(MaxFee) AS totalShippingFee
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) = ?
        GROUP BY salesinvoice
    ) AS Subquery) AS otherIncomePro,

    (SELECT SUM(MaxRunnerFee) AS totalRunnerFee
    FROM (
        SELECT MAX(runnerfee) AS MaxRunnerFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) = ?
        GROUP BY salesinvoice
    ) AS SubRunnerFees) AS totalRunnerFee,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE YEAR(buydate) = ?) AS totalPurchasepro,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE name != 'return' AND YEAR(buydate) <= ?) AS totalallPurchasepro,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE YEAR(salesdate) <= ?) AS totalallSalespro,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) = ?) AS Discountpro,

    (SELECT SUM(UnitPrice) FROM yyitems_buy
      WHERE ProductName = "Discount" AND InvoiceNumber IN
        (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) = ?)) AS Discount,
    (SELECT GROUP_CONCAT(category, ':', amount) FROM (SELECT Category, SUM(Amount) AS amount FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category) AS subquery) AS categoryData,
    (SELECT SUM(amount) AS amount FROM creditnote WHERE YEAR(Date) = ?) AS totalCourier,
    (SELECT SUM(Amount) AS amount FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ?) AS totalotherExpenses,
    (SELECT SUM(Amount) AS amount FROM yycompanyfund2personal WHERE YEAR(Date) = ?) AS distribution2Owners,
    (SELECT SUM(amount) AS amount FROM procurementrefund WHERE fromsupplier = 'yes' AND YEAR(Date) = ?) AS prorefundInwards,
    (SELECT SUM(amount) AS amount FROM procurementrefund WHERE refund2buyer = 'yes' AND YEAR(Date) = ?) AS prorefundOutwards,



    (SELECT SUM(UnitPrice) FROM yyitems_sell
      WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) < ?)) AS totalSalesbf,

    (SELECT SUM(sellprice) FROM procurementdatabase WHERE YEAR(salesdate) < ?) AS proSalesbf,

    (SELECT SUM(amount) FROM refund 
      WHERE (refund2buyer = "yes") AND YEAR(date) < ?) AS refundOutwardsbf,

    (SELECT SUM(Amount) FROM yyitems_buy
      WHERE Productname != "Discount" AND InvoiceNumber IN
        (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) < ?)) AS totalPurchasebf,

    (SELECT SUM(Amount) FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) < ?) AS PostageCourierbf,

    (SELECT GROUP_CONCAT(courier, ':', amount) FROM (SELECT courier, SUM(amount) AS amount FROM creditnote WHERE YEAR(Date) < ?
      GROUP BY courier) AS subquery) AS courierDatabf,

    (SELECT 
      SUM(UnitPrice)
      FROM 
        yyitems_buy
      WHERE 
        (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
        AND InvoiceNumber IN (
          SELECT Invoice_number 
          FROM yybuy_record 
          WHERE YEAR(timestamp) < ?)
    ) AS allPurchasebf,

    (SELECT SUM(CostPrice) FROM yyitems_sell
      WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) < ?)) AS allSalesbf,

    (SELECT SUM(amount) FROM refund 
      WHERE (fromSupplier = "yes") AND YEAR(date) < ?) AS refundInwardsbf,
      
    (SELECT SUM(MaxFee) AS totalShippingFee
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) < ?
        GROUP BY salesinvoice
    ) AS Subquery) AS otherIncomeProbf,

    (SELECT SUM(MaxRunnerFee) AS totalRunnerFee
    FROM (
        SELECT MAX(runnerfee) AS MaxRunnerFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) < ?
        GROUP BY salesinvoice
    ) AS SubRunnerFees) AS totalRunnerFeebf,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE YEAR(buydate) < ?) AS totalPurchaseprobf,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE name != 'return' AND YEAR(buydate) < ?) AS totalallPurchaseprobf,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE YEAR(salesdate) < ?) AS totalallSalesprobf,

    (SELECT SUM(costprice) FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) < ?) AS Discountprobf,

    (SELECT SUM(UnitPrice) FROM yyitems_buy
      WHERE ProductName = "Discount" AND InvoiceNumber IN
        (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) < ?)) AS Discountbf,
    (SELECT GROUP_CONCAT(category, ':', amount) FROM (SELECT Category, SUM(Amount) AS amount FROM yyexpensesrecord
        WHERE Category != "Postage & Courier" AND YEAR(Date) < ? GROUP BY Category) AS subquery) AS categoryDatabf,
    (SELECT SUM(amount) AS amount FROM creditnote WHERE YEAR(Date) < ?) AS totalCourierbf,
    (SELECT SUM(Amount) AS amount FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) < ?) AS totalotherExpensesbf,
    (SELECT SUM(Amount) AS amount FROM yycompanyfund2personal WHERE YEAR(Date) < ?) AS distribution2Ownersbf,
    (SELECT SUM(amount) AS amount FROM procurementrefund WHERE fromsupplier <= 'yes' AND YEAR(Date) < ?) AS prorefundInwardsbf,
    (SELECT SUM(amount) AS amount FROM procurementrefund WHERE refund2buyer <= 'yes' AND YEAR(Date) < ?) AS prorefundOutwardsbf,
    



    (SELECT SUM(bonuscredit) AS amount FROM yytopupbalance WHERE YEAR(date) <= ?) AS otherincomebonuscreditbf,

    
    (SELECT SUM(bonuscredit) AS amount FROM yytopupbalance WHERE YEAR(date) = ?) AS otherincomebonuscredit

`;

  // Perform a single query to the database
  pool.query(profitLossQuery, [
    selectedYear-1, selectedYear-1, selectedYear-1, selectedYear-1, selectedYear, selectedYear, selectedYear, selectedYear, 
    selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear,
    selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear,
  
    selectedYear, selectedYear, selectedYear, selectedYear, 
    selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear,
    selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear, selectedYear,
    
    selectedYear-1,
  
    selectedYear], (err, results) => {
    if (err) throw err;

    // Process the results
    const otherincomebonuscredit = Math.abs(parseFloat(results[0].otherincomebonuscredit) || 0);
    const totalSales = Math.abs(parseFloat(results[0].totalSales) || 0);
    const proSales = Math.abs(parseFloat(results[0].proSales) || 0);
    const otherIncomePro = Math.abs(parseFloat(results[0].otherIncomePro) || 0);
    const totalRunnerFee = Math.abs(parseFloat(results[0].totalRunnerFee) || 0);
    const prorefundOutwards = Math.abs(parseFloat(results[0].prorefundOutwards) || 0);
    const prorefundInwards = Math.abs(parseFloat(results[0].prorefundInwards) || 0);
    const refundOutwards = Math.abs(parseFloat(results[0].refundOutwards) || 0);
    const refundInwards = Math.abs(parseFloat(results[0].refundInwards) || 0);
    const lastYSales = Math.abs(parseFloat(results[0].lastYSales) || 0);
    const lastYBuy = Math.abs(parseFloat(results[0].lastYBuy) || 0);
    const totalPurchase = Math.abs(parseFloat(results[0].totalPurchase) || 0);
    const totalPurchasepro = Math.abs(parseFloat(results[0].totalPurchasepro) || 0);
    const PostageCourier = Math.abs(parseFloat(results[0].PostageCourier) || 0);
    const courierData = results[0].courierData;
    const categoryData = results[0].categoryData;
    const allPurchase = Math.abs(parseFloat(results[0].allPurchase) || 0);
    const allSales = Math.abs(parseFloat(results[0].allSales) || 0);
    const lastYBuypro = Math.abs(parseFloat(results[0].lastYBuypro) || 0);
    const lastYSalespro = Math.abs(parseFloat(results[0].lastYSalespro) || 0);
    const totalallPurchasepro = Math.abs(parseFloat(results[0].totalallPurchasepro) || 0);
    const totalallSalespro = Math.abs(parseFloat(results[0].totalallSalespro) || 0);
    const totalCourier = Math.abs(parseFloat(results[0].totalCourier) || 0);
    const Discountpro = Math.abs(parseFloat(results[0].Discountpro) || 0);
    const Discount = Math.abs(parseFloat(results[0].Discount) || 0);
    const totalotherExpenses = Math.abs(parseFloat(results[0].totalotherExpenses) || 0);
    const distribution2Owners = Math.abs(parseFloat(results[0].distribution2Owners) || 0);
    const procurementRun_Ship_fee = otherIncomePro +  totalRunnerFee;
    const totalproSales = (proSales + procurementRun_Ship_fee);
    const totalrefund_out = (prorefundOutwards + refundOutwards);
    const totalrefund_in = (prorefundInwards + refundInwards);
    const openStock = (lastYBuy + lastYBuypro - lastYSales - lastYSalespro);
    const closeStock = (allPurchase + totalallPurchasepro - totalallSalespro - allSales);
    const allPruchase = (totalPurchase + totalPurchasepro);
    const totalDiscount = (Discount + Discountpro);
    const revenue = (totalSales + totalproSales - totalrefund_out + otherincomebonuscredit);
    const COGS = (openStock + allPruchase + PostageCourier - totalCourier - closeStock - totalrefund_in - totalDiscount);
    const grossProfit = (revenue - COGS)
    const nettProfit = ( grossProfit - totalotherExpenses);


    const totalSalesbf = Math.abs(parseFloat(results[0].totalSalesbf) || 0);
    const proSalesbf = Math.abs(parseFloat(results[0].proSalesbf) || 0);
    const otherIncomeProbf = Math.abs(parseFloat(results[0].otherIncomeProbf) || 0);
    const totalRunnerFeebf = Math.abs(parseFloat(results[0].totalRunnerFeebf) || 0);
    const prorefundOutwardsbf = Math.abs(parseFloat(results[0].prorefundOutwardsbf) || 0);
    const prorefundInwardsbf = Math.abs(parseFloat(results[0].prorefundInwardsbf) || 0);
    const refundOutwardsbf = Math.abs(parseFloat(results[0].refundOutwardsbf) || 0);
    const refundInwardsbf = Math.abs(parseFloat(results[0].refundInwardsbf) || 0);
    const totalPurchasebf = Math.abs(parseFloat(results[0].totalPurchasebf) || 0);
    const totalPurchaseprobf = Math.abs(parseFloat(results[0].totalPurchaseprobf) || 0);
    const PostageCourierbf = Math.abs(parseFloat(results[0].PostageCourierbf) || 0);
    const courierDatabf = Math.abs(parseFloat(results[0].courierDatabf) || 0);
    const categoryDatabf = results[0].categoryDatabf;
    const allPurchasebf = Math.abs(parseFloat(results[0].allPurchasebf) || 0);
    const allSalesbf = Math.abs(parseFloat(results[0].allSalesbf) || 0);
    const totalallPurchaseprobf = Math.abs(parseFloat(results[0].totalallPurchaseprobf) || 0);
    const totalallSalesprobf = Math.abs(parseFloat(results[0].totalallSalesprobf) || 0);
    const totalCourierbf = Math.abs(parseFloat(results[0].totalCourierbf) || 0);
    const Discountprobf = Math.abs(parseFloat(results[0].Discountprobf) || 0);
    const Discountbf = Math.abs(parseFloat(results[0].Discountbf) || 0);
    const totalotherExpensesbf = Math.abs(parseFloat(results[0].totalotherExpensesbf) || 0);
    const distribution2Ownersbf = Math.abs(parseFloat(results[0].distribution2Ownersbf) || 0);
    const otherincomebonuscreditbf = Math.abs(parseFloat(results[0].otherincomebonuscreditbf) || 0);
    const procurementRun_Ship_feebf = otherIncomeProbf +  totalRunnerFeebf;
    const totalproSalesbf = (proSalesbf + procurementRun_Ship_feebf);
    const totalrefund_outbf = (prorefundOutwardsbf + refundOutwardsbf);
    const totalrefund_inbf = (prorefundInwardsbf + refundInwardsbf);
    const closeStockbf = (allPurchasebf + totalallPurchaseprobf - totalallSalesprobf - allSalesbf);
    const allPruchasebf = (totalPurchasebf + totalPurchaseprobf);
    const totalDiscountbf = (Discountbf + Discountprobf);
    const nettProfitbf = ((totalSalesbf + totalproSalesbf - totalrefund_outbf + otherincomebonuscreditbf) - 
    (allPruchasebf + PostageCourierbf - totalCourierbf - closeStockbf - totalrefund_inbf - totalDiscountbf) - 
    totalotherExpensesbf);

    const retainedBF = (nettProfitbf - distribution2Ownersbf);

    pool.query('SELECT DISTINCT YEAR(timestamp) AS year FROM yysell_invoice ORDER BY year DESC', (err, yearsResults) => {
      if (err) throw err;
      const years = yearsResults;
      

      // Render the page with fetched data
      res.render('profitlossstate', {
        COGS,
        otherincomebonuscredit,
        revenue,
        nettProfit,
        grossProfit,
        totalPurchasepro,
        totalproSales,
        refundOutwards,
        totalSales,
        totalrefund_out,
        totalrefund_in,
        proSales,
        procurementRun_Ship_fee,
        lastYSales,
        lastYBuy,
        totalPurchase,
        PostageCourier,
        courierData,
        categoryData,
        years,
        selectedYear,
        openStock,
        closeStock,
        allPruchase,
        totalDiscount,
        totalotherExpenses,
        totalCourier,
        distribution2Owners,
        retainedBF
      });
    });
  });
});
app.get('/balanceSheet', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;
    const lastYear = selectedYear - 1;
    const bfYear = selectedYear - 2;

    const yearQuery = 'SELECT DISTINCT YEAR(timestamp) AS year FROM yysell_invoice ORDER BY year DESC';
    const years = await queryDatabase(yearQuery);

    const totalSalesResult = await queryDatabase(`
      SELECT SUM(UnitPrice) AS totalSales FROM yyitems_sell
        WHERE InvoiceNumber IN
          (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) = ?)
    `, [selectedYear]);
    const totalSales = (totalSalesResult[0].totalSales || 0);
    const totalCostResult = await queryDatabase('SELECT SUM(CostPrice) AS total_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalCost = (totalCostResult[0].totalCost || 0);
    const totalSalesnoResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalSalesno FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const totalSalesno = (totalSalesnoResult[0].totalSalesno || 0);
    const totalSalesno2Result = await queryDatabase('SELECT SUM(CostPrice) AS totalSalesno2 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalSalesno2 = (totalSalesno2Result[0].totalSalesno2 || 0);
    const totalPurchasesResult = await queryDatabase('SELECT SUM(Amount) AS totalPurchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND status != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalPurchases = (totalPurchasesResult[0].totalPurchases || 0);
    const totalPurchasesLastyearResult = await queryDatabase('SELECT SUM(Amount) AS total_purchasesLastyear FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [lastYear]);
    const totalPurchasesLastyear = (totalPurchasesLastyearResult[0].totalPurchasesLastyear || 0);
    const totalCostLastyearResult = await queryDatabase('SELECT SUM(CostPrice) AS total_costLastyear FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [lastYear]);
    const totalCostLastyear = (totalCostLastyearResult[0].totalCostLastyear || 0);
    const totalbuyResult = await queryDatabase('SELECT SUM(Amount) AS total_buy FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND YEAR(solddate) = ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) < ?)', [selectedYear, selectedYear]);
    const totalbuy = (totalbuyResult[0].totalbuy || 0);
    const totalPurchasesnoResult = await queryDatabase('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const totalPurchasesno = (totalPurchasesnoResult[0].totalPurchasesno || 0);
    const totalPurchasesno2Result = await queryDatabase('SELECT SUM(Amount) AS totalPurchasesno2 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalPurchasesno2 = (totalPurchasesno2Result[0].totalPurchasesno2 || 0);
    const total_purchasesWOnoskuResult = await queryDatabase('SELECT SUM(Amount) AS total_purchasesWOnosku FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const total_purchasesWOnosku = (total_purchasesWOnoskuResult[0].total_purchasesWOnosku || 0);
    const totalExpensesByCategoryResult = await queryDatabase('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category', [selectedYear]);
    const totalExpensesByCategory = (totalExpensesByCategoryResult && totalExpensesByCategoryResult[0] && totalExpensesByCategoryResult[0].total) || 0;
    const totalStockValue = await queryDatabase('SELECT SUM(UnitPrice) AS total_stock_value  FROM yyitems_buy WHERE YEAR(solddate) != ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear, selectedYear]);
    const totalshipResult = await queryDatabase('SELECT SUM(Amount) AS total_ship FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const totalship = (totalshipResult[0].totalship || 0);
    const totalgdexResult = await queryDatabase('SELECT SUM(Amount) AS totalgdex FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [selectedYear]);
    const totalgdex = (totalgdexResult[0].totalgdex || 0);
    const totalc2pResult = await queryDatabase('SELECT SUM(Amount) AS total_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear]);
    const totalc2p = (totalc2pResult[0].totalc2p || 0);
    const totalp2cResult = await queryDatabase('SELECT SUM(Amount) AS totalp2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [selectedYear]);
    const totalp2c = (totalp2cResult[0].totalp2c || 0);
    const supRefundsResult = await queryDatabase('SELECT SUM(amount) AS supRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [selectedYear]);
    const supRefunds = (supRefundsResult[0].supRefunds || 0);
    const refundsalesResult = await queryDatabase('SELECT SUM(amount) AS refundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [selectedYear]);
    const refundsales = (refundsalesResult[0].refundsales || 0);
    const bonusResult = await queryDatabase('SELECT SUM(bonuscredit) AS bonus FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const bonus = (bonusResult[0].bonus || 0);
    const bonus2Result = await queryDatabase('SELECT SUM(bonuscredit) AS bonus2 FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const bonus2 = (bonus2Result[0].bonus2 || 0);
    const officeEquipmentResult = await queryDatabase('SELECT SUM(Amount) as officeEquipment FROM yyexpensesrecord WHERE Category = "Office Equipment" AND YEAR(Date) <= ?', [selectedYear]);
    const officeEquipment = (officeEquipmentResult[0].officeEquipment || 0);

    const salesDataResult = await queryDatabase('SELECT SUM(Amount) AS salesData FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const salesData = (salesDataResult[0].salesData || 0);
    const totalSalespaidResult = await queryDatabase('SELECT SUM(Amount) AS totalSalespaid FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalSalespaid = (totalSalespaidResult[0].totalSalespaid || 0);

    const totalTopupResult = await queryDatabase('SELECT SUM(Amount) AS totalTopup FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const totalTopup = (totalTopupResult[0].totalTopup || 0);
    const totalBuypaidResult = await queryDatabase('SELECT SUM(Amount) AS totalBuypaid FROM yypurchase_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalBuypaid = (totalBuypaidResult[0].totalBuypaid || 0);
    const totalcapitalResult = await queryDatabase('SELECT SUM(amount) AS totalcapital FROM yyequity WHERE YEAR(date) <= ?', [selectedYear]);
    const totalcapital = (totalcapitalResult[0].totalcapital || 0);
    const totalotcreditResult = await queryDatabase('SELECT SUM(Amount) AS totalotcredit FROM yyothercreditor WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotcredit = (totalotcreditResult[0].totalotcredit || 0);
    const totalotcreditpayResult = await queryDatabase('SELECT SUM(Amount) AS totalotcreditpay FROM yyothercreditor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotcreditpay = (totalotcreditpayResult[0].totalotcreditpay || 0);
    const totaldepositResult = await queryDatabase('SELECT SUM(amount) AS totaldeposit FROM yydeposit WHERE YEAR(date) <= ?', [selectedYear]);
    const totaldeposit = (totaldepositResult[0].totaldeposit || 0);
    const totalaccruedResult = await queryDatabase('SELECT SUM(Amount) AS totalaccrued FROM yyexpensesrecord WHERE accrued = "yes" AND YEAR(Date) <= ?', [selectedYear]);
    const totalaccrued = (totalaccruedResult[0].totalaccrued || 0);
    const totalaccruedpayResult = await queryDatabase('SELECT SUM(Amount) AS totalaccruedpay FROM yyaccruals WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalaccruedpay = (totalaccruedpayResult[0].totalaccruedpay || 0);
    const totalotherdebtorResult = await queryDatabase('SELECT SUM(Amount) AS totalotherdebtor FROM yyotherdebtor WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalotherdebtor = (totalotherdebtorResult[0].totalotherdebtor || 0);
    const totalprosaleResult = await queryDatabase('SELECT SUM(costprice) AS totalprosale FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear]);
    const totalprosale = (totalprosaleResult[0].totalprosale || 0);
    const totalpropayResult = await queryDatabase('SELECT SUM(amount) AS totalpropay FROM procurementsellpaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalpropay = (totalpropayResult[0].totalpropay || 0);
    const totalshippingfeeResult = await queryDatabase(`SELECT SUM(MaxFee) AS totalShippingFee
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery`, [selectedYear]);
    const totalShippingFee = (totalshippingfeeResult[0].totalShippingFee || 0);
    const totalrunnerfeeResult = await queryDatabase(`SELECT SUM(MaxRunnerFee) AS totalrunnerfee
    FROM (
        SELECT MAX(runnerfee) AS MaxRunnerFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery`, [selectedYear]);
    const totalrunnerfee = (totalrunnerfeeResult[0].totalrunnerfee || 0);
    const totalproBuyResult = await queryDatabase('SELECT SUM(costprice) AS totalprobuy FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear]);
    const totalprobuy = (totalproBuyResult[0].totalprobuy || 0);
    const totalallproBuyResult = await queryDatabase('SELECT SUM(costprice) AS totalallprobuy FROM procurementdatabase WHERE YEAR(buydate) <= ?', [selectedYear]);
    const totalallprobuy = (totalallproBuyResult[0].totalallprobuy || 0);
    const totalproBuypayResult = await queryDatabase('SELECT SUM(amount) AS totalprobuypay FROM procurementbuypaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalprobuypay = (totalproBuypayResult[0].totalprobuypay || 0);
    const totalproSalesResult = await queryDatabase('SELECT SUM(costprice) AS totalprosell FROM procurementdatabase WHERE name != "return" AND YEAR(salesdate) <= ?', [selectedYear]);
    const totalprosell = (totalproSalesResult[0].totalprosell || 0);
    const totalSalespaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalSalespayment FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalSalespayment = (totalSalespaymentResult[0].totalSalespayment || 0);
    const totalBuypaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalBuypayment FROM yypurchase_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalBuypayment = (totalBuypaymentResult[0].totalBuypayment || 0);
    const totalAccruedResult = await queryDatabase('SELECT SUM(Amount) as totalAccrued FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL OR accrued = "no" AND Name != "Gdex" AND YEAR(Date) <= ?', [selectedYear]);
    const totalAccrued = (totalAccruedResult[0].totalAccrued || 0);
    const totalAccrualpaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalAccrualpayment FROM yyaccruals WHERE detail != "creditnote" AND YEAR(Date) <= ?', [selectedYear]);
    const totalAccrualpayment = (totalAccrualpaymentResult[0].totalAccrualpayment || 0);
    const totaltopupResult = await queryDatabase('SELECT SUM(amount) as totaltopup FROM yytopupbalance WHERE wallet = "Gdex" AND YEAR(date) <= ?', [selectedYear]);
    const totaltopup = (totaltopupResult[0].totaltopup || 0);
    const totalrefundfromSupplierResult = await queryDatabase('SELECT SUM(amount) as totalrefundfromSupplier FROM refund WHERE fromSupplier = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const totalrefundfromSupplier = (totalrefundfromSupplierResult[0].totalrefundfromSupplier || 0);
    const totalrefund2buyerResult = await queryDatabase('SELECT SUM(amount) as totalrefund2buyer FROM refund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const totalrefund2buyer = (totalrefund2buyerResult[0].totalrefund2buyer || 0);
    const totalcompanyfund2personalResult = await queryDatabase('SELECT SUM(Amount) AS totalcompanyfund2personal FROM yycompanyfund2personal WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalcompanyfund2personal = (totalcompanyfund2personalResult[0].totalcompanyfund2personal || 0);
    const totalotherdebtorpayResult = await queryDatabase('SELECT SUM(amount) AS totalotherdebtorpay FROM yyotherdebtor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotherdebtorpay = (totalotherdebtorpayResult[0].totalotherdebtorpay || 0);
    const probuypaymentResult = await queryDatabase('SELECT SUM(amount) AS probuypayment FROM procurementbuypaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const probuypayment = (probuypaymentResult[0].probuypayment || 0);
    const prosalepaymentResult = await queryDatabase('SELECT SUM(amount) AS prosalepayment FROM procurementsellpaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const prosalepayment = (prosalepaymentResult[0].prosalepayment || 0);
    const prorefund2buyerResult = await queryDatabase('SELECT SUM(amount) AS prorefund2buyer FROM procurementrefund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const prorefund2buyer = (prorefund2buyerResult[0].prorefund2buyer || 0);
    const profromsupplierResult = await queryDatabase('SELECT SUM(amount) AS profromsupplier FROM procurementrefund WHERE fromsupplier = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const profromsupplier = (profromsupplierResult[0].profromsupplier || 0);


    const totalSalesbfResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalSalesbf FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)', [selectedYear-1]);
    const totalSalesbf = (totalSalesbfResult[0].totalSalesbf || 0);
    const proSalesbfResult = await queryDatabase('SELECT SUM(sellprice) AS proSalesbf FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const proSalesbf = (proSalesbfResult[0].proSalesbf || 0);
    const refundOutwardsbfResult = await queryDatabase('SELECT SUM(amount) AS refundOutwardsbf FROM refund WHERE (refund2buyer = "yes") AND YEAR(date) <= ?', [selectedYear-1]);
    const refundOutwardsbf = (refundOutwardsbfResult[0].refundOutwardsbf || 0);
    const totalPurchasebfResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalPurchasebf FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)', [selectedYear-1]);
    const totalPurchasebf = (totalPurchasebfResult[0].totalPurchasebf || 0);
    const PostageCourierbfResult = await queryDatabase('SELECT SUM(Amount) AS PostageCourierbf FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) <= ?', [selectedYear-1]);
    const PostageCourierbf = (PostageCourierbfResult[0].PostageCourierbf || 0);
    const allPurchasebfResult = await queryDatabase(`SELECT 
                                SUM(UnitPrice) AS allPurchasebf
                                FROM 
                                  yyitems_buy
                                WHERE 
                                  (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
                                  AND InvoiceNumber IN (
                                    SELECT Invoice_number 
                                    FROM yybuy_record 
                                    WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const allPurchasebf = (allPurchasebfResult[0].allPurchasebf || 0);
    const allSalesbfResult = await queryDatabase(`SELECT SUM(CostPrice) AS allSalesbf FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const allSalesbf = (allSalesbfResult[0].allSalesbf || 0);
    const refundInwardsbfResult = await queryDatabase('SELECT SUM(amount) AS refundInwardsbf FROM refund WHERE (fromSupplier = "yes") AND YEAR(date) <= ?', [selectedYear-1]);
    const refundInwardsbf = (refundInwardsbfResult[0].refundInwardsbf || 0);
    const totalPurchaseprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalPurchaseprobf FROM procurementdatabase WHERE YEAR(buydate) <= ?', [selectedYear-1]);
    const totalPurchaseprobf = (totalPurchaseprobfResult[0].totalPurchaseprobf || 0);
    
    
    const totalallPurchaseprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalallPurchaseprobf FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear-1]);
    const totalallPurchaseprobf = (totalallPurchaseprobfResult[0].totalallPurchaseprobf || 0);
    const totalallSalesprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalallSalesprobf FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const totalallSalesprobf = (totalallSalesprobfResult[0].totalallSalesprobf || 0);
    const DiscountprobfResult = await queryDatabase('SELECT SUM(costprice) AS Discountprobf FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) <= ?', [selectedYear-1]);
    const Discountprobf = (DiscountprobfResult[0].Discountprobf || 0);
    const DiscountbfResult = await queryDatabase(`SELECT SUM(ABS(UnitPrice)) AS Discountbf FROM yyitems_buy
                                                  WHERE ProductName = "Discount" AND InvoiceNumber IN
                                                    (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const Discountbf = (DiscountbfResult[0].Discountbf || 0);
    const totalCourierbfResult = await queryDatabase('SELECT SUM(amount) AS totalCourierbf FROM creditnote WHERE YEAR(Date) <= ?', [selectedYear-1]);
    const totalCourierbf = (totalCourierbfResult[0].totalCourierbf || 0);
    const totalotherExpensesbfResult = await queryDatabase('SELECT SUM(Amount) AS totalotherExpensesbf FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) <= ?', [selectedYear-1]);
    const totalotherExpensesbf = (totalotherExpensesbfResult[0].totalotherExpensesbf || 0);
    const distribution2OwnersbfResult = await queryDatabase('SELECT SUM(Amount) AS distribution2Ownersbf FROM yycompanyfund2personal WHERE YEAR(Date) <= ?', [selectedYear-1]);
    const distribution2Ownersbf = (distribution2OwnersbfResult[0].distribution2Ownersbf || 0);
    const prorefundInwardsbfResult = await queryDatabase('SELECT SUM(amount) AS prorefundInwardsbf FROM procurementrefund WHERE fromsupplier <= "yes" AND YEAR(Date) = ?', [selectedYear-1]);
    const prorefundInwardsbf = (prorefundInwardsbfResult[0].prorefundInwardsbf || 0);
    const prorefundOutwardsbfResult = await queryDatabase('SELECT SUM(amount) AS prorefundOutwardsbf FROM procurementrefund WHERE refund2buyer <= "yes" AND YEAR(Date) = ?', [selectedYear-1]);
    const prorefundOutwardsbf = (prorefundOutwardsbfResult[0].prorefundOutwardsbf || 0);
    const totalRunnerFeebfResult = await queryDatabase(`
        SELECT SUM(MaxRunnerFee) AS totalRunnerFeebf
        FROM (
            SELECT MAX(runnerfee) AS MaxRunnerFee
            FROM procurementdatabase
            WHERE YEAR(salesdate) <= ?
            GROUP BY salesinvoice
        ) AS Subquery
    `, [selectedYear - 1]);
    const totalRunnerFeebf = totalRunnerFeebfResult[0].totalRunnerFeebf || 0;

    const otherIncomeProbfResult = await queryDatabase(`
    SELECT SUM(MaxFee) AS otherIncomeProbf
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery
    `, [selectedYear - 1]);
    const otherIncomeProbf = otherIncomeProbfResult[0].otherIncomeProbf || 0;
    const otherIncomeProResult = await queryDatabase(`
        SELECT SUM(MaxFee) AS otherIncomePro
        FROM (
            SELECT MAX(shippingfee) AS MaxFee
            FROM procurementdatabase
            WHERE YEAR(salesdate) = ?
            GROUP BY salesinvoice
        ) AS Subquery
    `, [selectedYear]);
    const otherIncomePro = otherIncomeProResult[0].otherIncomePro || 0;
    const totalRunnerFeeResult = await queryDatabase(`
            SELECT SUM(MaxRunnerFee) AS totalRunnerFee
            FROM (
                SELECT MAX(runnerfee) AS MaxRunnerFee
                FROM procurementdatabase
                WHERE YEAR(salesdate) = ?
                GROUP BY salesinvoice
            ) AS Subquery
        `, [selectedYear]);
    const totalRunnerFee = totalRunnerFeeResult[0].totalRunnerFee || 0;
    const proSalesResult = await queryDatabase('SELECT SUM(sellprice) AS proSales FROM procurementdatabase WHERE name != "return" AND YEAR(salesdate) = ?', [selectedYear]);
    const proSales = (proSalesResult[0].proSales || 0);
    const prorefundOutwardsResult = await queryDatabase('SELECT SUM(amount) AS prorefundOutwards FROM procurementrefund WHERE refund2buyer = "yes" AND YEAR(Date) = ?', [selectedYear]);
    const prorefundOutwards = (prorefundOutwardsResult[0].prorefundOutwards || 0);
    const refundOutwardsResult = await queryDatabase('SELECT SUM(amount) AS refundOutwards FROM refund WHERE (refund2buyer = "yes") AND YEAR(date) = ?', [selectedYear]);
    const refundOutwards = (refundOutwardsResult[0].refundOutwards || 0);

    const otherincomebonuscreditResult = await queryDatabase('SELECT SUM(bonuscredit) AS otherincomebonuscredit FROM yytopupbalance WHERE YEAR(date) = ?', [selectedYear]);
    const otherincomebonuscredit = (otherincomebonuscreditResult[0].otherincomebonuscredit || 0);
    const totalPurchaseproResult = await queryDatabase('SELECT SUM(costprice) AS totalPurchasepro FROM procurementdatabase WHERE YEAR(buydate) = ?', [selectedYear]);
    const totalPurchasepro = (totalPurchaseproResult[0].totalPurchasepro || 0);
    const PostageCourierResult = await queryDatabase('SELECT SUM(Amount) AS PostageCourier FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const PostageCourier = (PostageCourierResult[0].PostageCourier || 0);
    const totalCourierResult = await queryDatabase('SELECT SUM(amount) AS totalCourier FROM creditnote WHERE YEAR(Date) = ?', [selectedYear]);
    const totalCourier = (totalCourierResult[0].totalCourier || 0);
    const allPurchaseResult = await queryDatabase(`
          SELECT SUM(UnitPrice) AS allPurchase
          FROM yyitems_buy
          WHERE (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
            AND InvoiceNumber IN (
              SELECT Invoice_number 
              FROM yybuy_record 
              WHERE YEAR(timestamp) <= ?)
        `, [selectedYear]);
const allPurchase = allPurchaseResult[0].allPurchase || 0;

const totalPurchaseResult = await queryDatabase(`
SELECT SUM(Amount) AS totalPurchase FROM yyitems_buy
WHERE Productname != "Discount" AND InvoiceNumber IN
  (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) = ?)
`, [selectedYear]);
const totalPurchase = totalPurchaseResult[0].totalPurchase || 0;

const allSalesResult = await queryDatabase(`
SELECT SUM(CostPrice) AS allSales FROM yyitems_sell
WHERE InvoiceNumber IN (
    SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)
`, [selectedYear]);
const allSales = allSalesResult[0].allSales || 0;



    const totalallPurchaseproResult = await queryDatabase('SELECT SUM(costprice) AS totalallPurchasepro FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear]);
    const totalallPurchasepro = (totalallPurchaseproResult[0].totalallPurchasepro || 0);
    const totalallSalesproResult = await queryDatabase('SELECT SUM(costprice) AS totalallSalespro FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear]);
    const totalallSalespro = (totalallSalesproResult[0].totalallSalespro || 0);
    const prorefundInwardsResult = await queryDatabase('SELECT SUM(amount) AS prorefundInwards FROM procurementrefund WHERE fromsupplier = "yes" AND YEAR(Date) = ?', [selectedYear]);
    const prorefundInwards = (prorefundInwardsResult[0].prorefundInwards || 0);
    const refundInwardsResult = await queryDatabase('SELECT SUM(amount) AS refundInwards FROM refund WHERE (fromSupplier = "yes") AND YEAR(date) = ?', [selectedYear]);
    const refundInwards = (refundInwardsResult[0].refundInwards || 0);
    const DiscountResult = await queryDatabase(`
      SELECT SUM(ABS(UnitPrice)) AS Discount 
      FROM yyitems_buy 
      WHERE ProductName = "Discount" 
      AND InvoiceNumber IN (
          SELECT Invoice_number 
          FROM yybuy_record 
          WHERE YEAR(timestamp) = ?)
    `, [selectedYear]);
    const Discount = (DiscountResult[0].Discount || 0);

    const DiscountproResult = await queryDatabase('SELECT SUM(costprice) AS Discountpro FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) = ?', [selectedYear]);
    const Discountpro = (DiscountproResult[0].Discountpro || 0);
    const totalotherExpensesResult = await queryDatabase('SELECT SUM(Amount) AS totalotherExpenses FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const totalotherExpenses = (totalotherExpensesResult[0].totalotherExpenses || 0);

    
    const lastYBuyproResult = await queryDatabase('SELECT SUM(costprice) AS lastYBuypro FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear-1]);
    const lastYBuypro = (lastYBuyproResult[0].lastYBuypro || 0);
    const lastYSalesproResult = await queryDatabase('SELECT SUM(sellprice) AS lastYSalespro FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const lastYSalespro = (lastYSalesproResult[0].lastYSalespro || 0);
    const lastYSalesResult = await queryDatabase(`
      SELECT SUM(CostPrice) AS lastYSales FROM yyitems_sell
        WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)
      `, [selectedYear-1]);
    const lastYSales = (lastYSalesResult[0].lastYSales || 0);
    const lastYBuyResult = await queryDatabase(`
    SELECT SUM(UnitPrice) AS lastYBuy FROM yyitems_buy
    WHERE (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
    AND InvoiceNumber IN
      (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)
      `, [selectedYear-1]);
    const lastYBuy = (lastYBuyResult[0].lastYBuy || 0);
    const distribution2OwnersResult = await queryDatabase('SELECT SUM(Amount) AS distribution2Owners FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear]);
    const distribution2Owners = (distribution2OwnersResult[0].distribution2Owners || 0);
    const otherincomebonuscreditbfResult = await queryDatabase('SELECT SUM(bonuscredit) AS otherincomebonuscreditbf FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear-1]);
    const otherincomebonuscreditbf = (otherincomebonuscreditbfResult[0].otherincomebonuscreditbf || 0);

    const accountpayable = (totalPurchasesno2 - totalBuypaid + totalallprobuy - totalprobuypay);
    const accruals = (totalaccrued - totalaccruedpay);
    const accreceivable = (salesData - totalSalespaid + totalprosale + totalShippingFee + totalrunnerfee - totalpropay);
    const totalcreditor = (totalotcredit - totalotcreditpay);
    const closingstock = (totalPurchases + totalprobuy - totalSalesno2 - totalprosell);
    const cashInbank = (totalSalespayment + prosalepayment - totalBuypayment - probuypayment + totalcapital + totalotcredit + totalotherdebtorpay
      + totalrefundfromSupplier + profromsupplier - totalrefund2buyer - prorefund2buyer - totalAccrued - totalAccrualpayment - totaltopup 
      - totalcompanyfund2personal - totaldeposit - totalotcreditpay - totalotherdebtor);
    const cashInotherACC = (totalTopup + bonus2 - totalgdex);
    const totalCurrestassets = (closingstock + accreceivable + cashInbank + cashInotherACC + totalotherdebtor + totaldeposit);
    const currentLiabi = (accountpayable + totalcreditor + accruals);
    const nettProfitbf = (totalSalesbf + (proSalesbf + (otherIncomeProbf +  totalRunnerFeebf)) - (prorefundOutwardsbf + refundOutwardsbf) - 
    (totalPurchasebf + totalPurchaseprobf) - PostageCourierbf + totalCourierbf + (allPurchasebf + totalallPurchaseprobf - totalallSalesprobf - allSalesbf) + 
    (prorefundInwardsbf + refundInwardsbf) + (Discountbf + Discountprobf) - totalotherExpensesbf);
    const retainedBF = (nettProfitbf - distribution2Ownersbf);

    const nettProfit = ( ((totalSales + (proSales + (otherIncomePro +  totalRunnerFee)) - (prorefundOutwards + refundOutwards) + 
    otherincomebonuscredit) - ((lastYBuy + lastYBuypro - lastYSales - lastYSalespro) + (totalPurchase + totalPurchasepro) + 
    PostageCourier - totalCourier - (allPurchase + totalallPurchasepro - totalallSalespro - allSales) - 
    (prorefundInwards + refundInwards) - (Discount + Discountpro))) - totalotherExpenses + otherincomebonuscreditbf);

    const retainedCF = (nettProfit + retainedBF - distribution2Owners);

    res.render('balanceSheet', {
      retainedBF,
      retainedCF,
      currentLiabi,
      cashInotherACC,
      totalCurrestassets,
      cashInbank,
      years,
      totalcreditor,
      closingstock,
      accreceivable,
      totalotherdebtor,
      accountpayable,
      accruals,
      selectedYear,
      totalaccruedpay,
      officeEquipment,
      totalPurchases, 
      totalCost,
      totalSalesno2,
      totalaccrued,
      totaldeposit,
      totalPurchasesno2,
      totalcapital,
      totalotcredit,
      totalBuypaid,
      totalTopup,
      totalSalespaid,
      totalSales, 
      totalSalesno,
      totalExpenses: totalExpensesByCategory,
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
      bonus2,
      totalgdex
    });
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).send('Error fetching data');
  }
});
async function queryDatabase(query, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(query, params, (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
}
app.get('/trialbalance', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;
    const lastYear = selectedYear - 1;
    const bfYear = selectedYear - 2;

    const yearQuery = 'SELECT DISTINCT YEAR(timestamp) AS year FROM yysell_invoice ORDER BY year DESC';
    const years = await queryDatabase(yearQuery);

    const totalSalesResult = await queryDatabase(`
      SELECT SUM(UnitPrice) AS totalSales FROM yyitems_sell
        WHERE InvoiceNumber IN
          (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) = ?)
    `, [selectedYear]);
    const totalSales = (totalSalesResult[0].totalSales || 0);
    const totalCostResult = await queryDatabase('SELECT SUM(CostPrice) AS total_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalCost = (totalCostResult[0].totalCost || 0);
    const totalSalesnoResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalSalesno FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const totalSalesno = (totalSalesnoResult[0].totalSalesno || 0);
    const totalSalesno2Result = await queryDatabase('SELECT SUM(CostPrice) AS totalSalesno2 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalSalesno2 = (totalSalesno2Result[0].totalSalesno2 || 0);
    const totalPurchasesResult = await queryDatabase('SELECT SUM(Amount) AS totalPurchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND status != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalPurchases = (totalPurchasesResult[0].totalPurchases || 0);
    const totalPurchasesLastyearResult = await queryDatabase('SELECT SUM(Amount) AS totalPurchasesLastyear FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [lastYear]);
    const totalPurchasesLastyear = (totalPurchasesLastyearResult[0].totalPurchasesLastyear || 0);
    const totalCostLastyearResult = await queryDatabase('SELECT SUM(CostPrice) AS totalCostLastyear FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [lastYear]);
    const totalCostLastyear = (totalCostLastyearResult[0].totalCostLastyear || 0);
    const totalbuyResult = await queryDatabase('SELECT SUM(Amount) AS total_buy FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND YEAR(solddate) = ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) < ?)', [selectedYear, selectedYear]);
    const totalbuy = (totalbuyResult[0].totalbuy || 0);
    const totalPurchasesnoResult = await queryDatabase('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const totalPurchasesno = (totalPurchasesnoResult[0].totalPurchasesno || 0);
    const totalPurchasesno2Result = await queryDatabase('SELECT SUM(Amount) AS totalPurchasesno2 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const totalPurchasesno2 = (totalPurchasesno2Result[0].totalPurchasesno2 || 0);
    const total_purchasesWOnoskuResult = await queryDatabase('SELECT SUM(Amount) AS total_purchasesWOnosku FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear]);
    const total_purchasesWOnosku = (total_purchasesWOnoskuResult[0].total_purchasesWOnosku || 0);
    const totalExpensesByCategoryResult = await queryDatabase('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ? GROUP BY Category', [selectedYear]);
    const totalExpensesByCategory = (totalExpensesByCategoryResult && totalExpensesByCategoryResult[0] && totalExpensesByCategoryResult[0].total) || 0;
    const totalStockValue = await queryDatabase('SELECT SUM(UnitPrice) AS total_stock_value  FROM yyitems_buy WHERE YEAR(solddate) != ? AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear, selectedYear]);
    const totalshipResult = await queryDatabase('SELECT SUM(Amount) AS total_ship FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const totalship = (totalshipResult[0].totalship || 0);
    const totalgdexResult = await queryDatabase('SELECT SUM(Amount) AS totalgdex FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [selectedYear]);
    const totalgdex = (totalgdexResult[0].totalgdex || 0);
    const totalc2pResult = await queryDatabase('SELECT SUM(Amount) AS total_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear]);
    const totalc2p = (totalc2pResult[0].totalc2p || 0);
    const totalp2cResult = await queryDatabase('SELECT SUM(Amount) AS totalp2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [selectedYear]);
    const totalp2c = (totalp2cResult[0].totalp2c || 0);
    const supRefundsResult = await queryDatabase('SELECT SUM(amount) AS supRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [selectedYear]);
    const supRefunds = (supRefundsResult[0].supRefunds || 0);
    const refundsalesResult = await queryDatabase('SELECT SUM(amount) AS refundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [selectedYear]);
    const refundsales = (refundsalesResult[0].refundsales || 0);
    const bonusResult = await queryDatabase('SELECT SUM(bonuscredit) AS bonus FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const bonus = (bonusResult[0].bonus || 0);
    const bonus2Result = await queryDatabase('SELECT SUM(bonuscredit) AS bonus2 FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const bonus2 = (bonus2Result[0].bonus2 || 0);
    const officeEquipmentResult = await queryDatabase('SELECT SUM(Amount) as officeEquipment FROM yyexpensesrecord WHERE Category = "Office Equipment" AND YEAR(Date) <= ?', [selectedYear]);
    const officeEquipment = (officeEquipmentResult[0].officeEquipment || 0);

    const salesDataResult = await queryDatabase('SELECT SUM(Amount) AS salesData FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear]);
    const salesData = (salesDataResult[0].salesData || 0);
    const totalSalespaidResult = await queryDatabase('SELECT SUM(Amount) AS totalSalespaid FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalSalespaid = (totalSalespaidResult[0].totalSalespaid || 0);

    const totalTopupResult = await queryDatabase('SELECT SUM(Amount) AS totalTopup FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear]);
    const totalTopup = (totalTopupResult[0].totalTopup || 0);
    const totalBuypaidResult = await queryDatabase('SELECT SUM(Amount) AS totalBuypaid FROM yypurchase_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalBuypaid = (totalBuypaidResult[0].totalBuypaid || 0);
    const totalcapitalResult = await queryDatabase('SELECT SUM(amount) AS totalcapital FROM yyequity WHERE YEAR(date) <= ?', [selectedYear]);
    const totalcapital = (totalcapitalResult[0].totalcapital || 0);
    const totalotcreditResult = await queryDatabase('SELECT SUM(Amount) AS totalotcredit FROM yyothercreditor WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotcredit = (totalotcreditResult[0].totalotcredit || 0);
    const totalotcreditpayResult = await queryDatabase('SELECT SUM(Amount) AS totalotcreditpay FROM yyothercreditor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotcreditpay = (totalotcreditpayResult[0].totalotcreditpay || 0);
    const totaldepositResult = await queryDatabase('SELECT SUM(amount) AS totaldeposit FROM yydeposit WHERE YEAR(date) <= ?', [selectedYear]);
    const totaldeposit = (totaldepositResult[0].totaldeposit || 0);
    const totalaccruedResult = await queryDatabase('SELECT SUM(Amount) AS totalaccrued FROM yyexpensesrecord WHERE accrued = "yes" AND YEAR(Date) <= ?', [selectedYear]);
    const totalaccrued = (totalaccruedResult[0].totalaccrued || 0);
    const totalaccruedpayResult = await queryDatabase('SELECT SUM(Amount) AS totalaccruedpay FROM yyaccruals WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalaccruedpay = (totalaccruedpayResult[0].totalaccruedpay || 0);
    const totalotherdebtorResult = await queryDatabase('SELECT SUM(Amount) AS totalotherdebtor FROM yyotherdebtor WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalotherdebtor = (totalotherdebtorResult[0].totalotherdebtor || 0);
    const totalprosaleResult = await queryDatabase('SELECT SUM(costprice) AS totalprosale FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear]);
    const totalprosale = (totalprosaleResult[0].totalprosale || 0);
    const totalpropayResult = await queryDatabase('SELECT SUM(amount) AS totalpropay FROM procurementsellpaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalpropay = (totalpropayResult[0].totalpropay || 0);
    const totalshippingfeeResult = await queryDatabase(`SELECT SUM(MaxFee) AS totalShippingFee
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery`, [selectedYear]);
    const totalShippingFee = (totalshippingfeeResult[0].totalShippingFee || 0);
    const totalrunnerfeeResult = await queryDatabase(`SELECT SUM(MaxRunnerFee) AS totalrunnerfee
    FROM (
        SELECT MAX(runnerfee) AS MaxRunnerFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery`, [selectedYear]);
    const totalrunnerfee = (totalrunnerfeeResult[0].totalrunnerfee || 0);
    const totalproBuyResult = await queryDatabase('SELECT SUM(costprice) AS totalprobuy FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear]);
    const totalprobuy = (totalproBuyResult[0].totalprobuy || 0);
    const totalallproBuyResult = await queryDatabase('SELECT SUM(costprice) AS totalallprobuy FROM procurementdatabase WHERE YEAR(buydate) <= ?', [selectedYear]);
    const totalallprobuy = (totalallproBuyResult[0].totalallprobuy || 0);
    const totalproBuypayResult = await queryDatabase('SELECT SUM(amount) AS totalprobuypay FROM procurementbuypaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalprobuypay = (totalproBuypayResult[0].totalprobuypay || 0);
    const totalproSalesResult = await queryDatabase('SELECT SUM(costprice) AS totalprosell FROM procurementdatabase WHERE name != "return" AND YEAR(salesdate) <= ?', [selectedYear]);
    const totalprosell = (totalproSalesResult[0].totalprosell || 0);
    const totalSalespaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalSalespayment FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalSalespayment = (totalSalespaymentResult[0].totalSalespayment || 0);
    const totalBuypaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalBuypayment FROM yypurchase_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalBuypayment = (totalBuypaymentResult[0].totalBuypayment || 0);
    const totalAccruedResult = await queryDatabase('SELECT SUM(Amount) as totalAccrued FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL OR accrued = "no" AND Name != "Gdex" AND YEAR(Date) <= ?', [selectedYear]);
    const totalAccrued = (totalAccruedResult[0].totalAccrued || 0);
    const totalAccrualpaymentResult = await queryDatabase('SELECT SUM(Amount) AS totalAccrualpayment FROM yyaccruals WHERE detail != "creditnote" AND YEAR(Date) <= ?', [selectedYear]);
    const totalAccrualpayment = (totalAccrualpaymentResult[0].totalAccrualpayment || 0);
    const totaltopupResult = await queryDatabase('SELECT SUM(amount) as totaltopup FROM yytopupbalance WHERE wallet = "Gdex" AND YEAR(date) <= ?', [selectedYear]);
    const totaltopup = (totaltopupResult[0].totaltopup || 0);
    const totalrefundfromSupplierResult = await queryDatabase('SELECT SUM(amount) as totalrefundfromSupplier FROM refund WHERE fromSupplier = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const totalrefundfromSupplier = (totalrefundfromSupplierResult[0].totalrefundfromSupplier || 0);
    const totalrefund2buyerResult = await queryDatabase('SELECT SUM(amount) as totalrefund2buyer FROM refund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const totalrefund2buyer = (totalrefund2buyerResult[0].totalrefund2buyer || 0);
    const totalcompanyfund2personalResult = await queryDatabase('SELECT SUM(Amount) AS totalcompanyfund2personal FROM yycompanyfund2personal WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalcompanyfund2personal = (totalcompanyfund2personalResult[0].totalcompanyfund2personal || 0);
    const totalotherdebtorpayResult = await queryDatabase('SELECT SUM(amount) AS totalotherdebtorpay FROM yyotherdebtor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const totalotherdebtorpay = (totalotherdebtorpayResult[0].totalotherdebtorpay || 0);
    const probuypaymentResult = await queryDatabase('SELECT SUM(amount) AS probuypayment FROM procurementbuypaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const probuypayment = (probuypaymentResult[0].probuypayment || 0);
    const prosalepaymentResult = await queryDatabase('SELECT SUM(amount) AS prosalepayment FROM procurementsellpaymentbreakdown WHERE YEAR(date) <= ?', [selectedYear]);
    const prosalepayment = (prosalepaymentResult[0].prosalepayment || 0);
    const prorefund2buyerResult = await queryDatabase('SELECT SUM(amount) AS prorefund2buyer FROM procurementrefund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const prorefund2buyer = (prorefund2buyerResult[0].prorefund2buyer || 0);
    const profromsupplierResult = await queryDatabase('SELECT SUM(amount) AS profromsupplier FROM procurementrefund WHERE fromsupplier = "yes" AND YEAR(date) <= ?', [selectedYear]);
    const profromsupplier = (profromsupplierResult[0].profromsupplier || 0);


    const totalSalesbfResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalSalesbf FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)', [selectedYear-1]);
    const totalSalesbf = (totalSalesbfResult[0].totalSalesbf || 0);
    const proSalesbfResult = await queryDatabase('SELECT SUM(sellprice) AS proSalesbf FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const proSalesbf = (proSalesbfResult[0].proSalesbf || 0);
    const refundOutwardsbfResult = await queryDatabase('SELECT SUM(amount) AS refundOutwardsbf FROM refund WHERE (refund2buyer = "yes") AND YEAR(date) <= ?', [selectedYear-1]);
    const refundOutwardsbf = (refundOutwardsbfResult[0].refundOutwardsbf || 0);
    const totalPurchasebfResult = await queryDatabase('SELECT SUM(UnitPrice) AS totalPurchasebf FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)', [selectedYear-1]);
    const totalPurchasebf = (totalPurchasebfResult[0].totalPurchasebf || 0);
    const PostageCourierbfResult = await queryDatabase('SELECT SUM(Amount) AS PostageCourierbf FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) <= ?', [selectedYear-1]);
    const PostageCourierbf = (PostageCourierbfResult[0].PostageCourierbf || 0);
    const allPurchasebfResult = await queryDatabase(`SELECT 
                                SUM(UnitPrice) AS allPurchasebf
                                FROM 
                                  yyitems_buy
                                WHERE 
                                  (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
                                  AND InvoiceNumber IN (
                                    SELECT Invoice_number 
                                    FROM yybuy_record 
                                    WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const allPurchasebf = (allPurchasebfResult[0].allPurchasebf || 0);
    const allSalesbfResult = await queryDatabase(`SELECT SUM(CostPrice) AS allSalesbf FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const allSalesbf = (allSalesbfResult[0].allSalesbf || 0);
    const refundInwardsbfResult = await queryDatabase('SELECT SUM(amount) AS refundInwardsbf FROM refund WHERE (fromSupplier = "yes") AND YEAR(date) <= ?', [selectedYear-1]);
    const refundInwardsbf = (refundInwardsbfResult[0].refundInwardsbf || 0);
    const totalPurchaseprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalPurchaseprobf FROM procurementdatabase WHERE YEAR(buydate) <= ?', [selectedYear-1]);
    const totalPurchaseprobf = (totalPurchaseprobfResult[0].totalPurchaseprobf || 0);
    
    
    const totalallPurchaseprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalallPurchaseprobf FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear-1]);
    const totalallPurchaseprobf = (totalallPurchaseprobfResult[0].totalallPurchaseprobf || 0);
    const totalallSalesprobfResult = await queryDatabase('SELECT SUM(costprice) AS totalallSalesprobf FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const totalallSalesprobf = (totalallSalesprobfResult[0].totalallSalesprobf || 0);
    const DiscountprobfResult = await queryDatabase('SELECT SUM(costprice) AS Discountprobf FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) <= ?', [selectedYear-1]);
    const Discountprobf = (DiscountprobfResult[0].Discountprobf || 0);
    const DiscountbfResult = await queryDatabase(`SELECT SUM(ABS(UnitPrice)) AS Discountbf FROM yyitems_buy
                                                  WHERE ProductName = "Discount" AND InvoiceNumber IN
                                                    (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)`, [selectedYear-1]);
    const Discountbf = (DiscountbfResult[0].Discountbf || 0);
    const totalCourierbfResult = await queryDatabase('SELECT SUM(amount) AS totalCourierbf FROM creditnote WHERE YEAR(Date) <= ?', [selectedYear-1]);
    const totalCourierbf = (totalCourierbfResult[0].totalCourierbf || 0);
    const totalCreditnoteResult = await queryDatabase('SELECT SUM(amount) AS totalCreditnote FROM creditnote WHERE YEAR(Date) <= ?', [selectedYear]);
    const totalCreditnote = (totalCreditnoteResult[0].totalCreditnote || 0);
    const totalotherExpensesbfResult = await queryDatabase('SELECT SUM(Amount) AS totalotherExpensesbf FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) <= ?', [selectedYear-1]);
    const totalotherExpensesbf = (totalotherExpensesbfResult[0].totalotherExpensesbf || 0);
    const distribution2OwnersbfResult = await queryDatabase('SELECT SUM(Amount) AS distribution2Ownersbf FROM yycompanyfund2personal WHERE YEAR(Date) <= ?', [selectedYear-1]);
    const distribution2Ownersbf = (distribution2OwnersbfResult[0].distribution2Ownersbf || 0);
    const prorefundInwardsbfResult = await queryDatabase('SELECT SUM(amount) AS prorefundInwardsbf FROM procurementrefund WHERE fromsupplier <= "yes" AND YEAR(Date) = ?', [selectedYear-1]);
    const prorefundInwardsbf = (prorefundInwardsbfResult[0].prorefundInwardsbf || 0);
    const prorefundOutwardsbfResult = await queryDatabase('SELECT SUM(amount) AS prorefundOutwardsbf FROM procurementrefund WHERE refund2buyer <= "yes" AND YEAR(Date) = ?', [selectedYear-1]);
    const prorefundOutwardsbf = (prorefundOutwardsbfResult[0].prorefundOutwardsbf || 0);
    const totalRunnerFeebfResult = await queryDatabase(`
        SELECT SUM(MaxRunnerFee) AS totalRunnerFeebf
        FROM (
            SELECT MAX(runnerfee) AS MaxRunnerFee
            FROM procurementdatabase
            WHERE YEAR(salesdate) <= ?
            GROUP BY salesinvoice
        ) AS Subquery
    `, [selectedYear - 1]);
    const totalRunnerFeebf = totalRunnerFeebfResult[0].totalRunnerFeebf || 0;

    const otherIncomeProbfResult = await queryDatabase(`
    SELECT SUM(MaxFee) AS otherIncomeProbf
    FROM (
        SELECT MAX(shippingfee) AS MaxFee
        FROM procurementdatabase
        WHERE YEAR(salesdate) <= ?
        GROUP BY salesinvoice
    ) AS Subquery
    `, [selectedYear - 1]);
    const otherIncomeProbf = otherIncomeProbfResult[0].otherIncomeProbf || 0;
    const otherIncomeProResult = await queryDatabase(`
        SELECT SUM(MaxFee) AS otherIncomePro
        FROM (
            SELECT MAX(shippingfee) AS MaxFee
            FROM procurementdatabase
            WHERE YEAR(salesdate) = ?
            GROUP BY salesinvoice
        ) AS Subquery
    `, [selectedYear]);
    const otherIncomePro = otherIncomeProResult[0].otherIncomePro || 0;
    const totalRunnerFeeResult = await queryDatabase(`
            SELECT SUM(MaxRunnerFee) AS totalRunnerFee
            FROM (
                SELECT MAX(runnerfee) AS MaxRunnerFee
                FROM procurementdatabase
                WHERE YEAR(salesdate) = ?
                GROUP BY salesinvoice
            ) AS Subquery
        `, [selectedYear]);
    const totalRunnerFee = totalRunnerFeeResult[0].totalRunnerFee || 0;
    const proSalesResult = await queryDatabase('SELECT SUM(sellprice) AS proSales FROM procurementdatabase WHERE name != "return" AND YEAR(salesdate) = ?', [selectedYear]);
    const proSales = (proSalesResult[0].proSales || 0);
    const prorefundOutwardsResult = await queryDatabase('SELECT SUM(amount) AS prorefundOutwards FROM procurementrefund WHERE refund2buyer = "yes" AND YEAR(Date) = ?', [selectedYear]);
    const prorefundOutwards = (prorefundOutwardsResult[0].prorefundOutwards || 0);
    const refundOutwardsResult = await queryDatabase('SELECT SUM(amount) AS refundOutwards FROM refund WHERE (refund2buyer = "yes") AND YEAR(date) = ?', [selectedYear]);
    const refundOutwards = (refundOutwardsResult[0].refundOutwards || 0);

    const otherincomebonuscreditResult = await queryDatabase('SELECT SUM(bonuscredit) AS otherincomebonuscredit FROM yytopupbalance WHERE YEAR(date) = ?', [selectedYear]);
    const otherincomebonuscredit = (otherincomebonuscreditResult[0].otherincomebonuscredit || 0);
    const totalPurchaseproResult = await queryDatabase('SELECT SUM(costprice) AS totalPurchasepro FROM procurementdatabase WHERE YEAR(buydate) = ?', [selectedYear]);
    const totalPurchasepro = (totalPurchaseproResult[0].totalPurchasepro || 0);
    const PostageCourierResult = await queryDatabase('SELECT SUM(Amount) AS PostageCourier FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const PostageCourier = (PostageCourierResult[0].PostageCourier || 0);
    const totalCourierResult = await queryDatabase('SELECT SUM(amount) AS totalCourier FROM creditnote WHERE YEAR(Date) = ?', [selectedYear]);
    const totalCourier = (totalCourierResult[0].totalCourier || 0);
    const allPurchaseResult = await queryDatabase(`
          SELECT SUM(UnitPrice) AS allPurchase
          FROM yyitems_buy
          WHERE (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
            AND InvoiceNumber IN (
              SELECT Invoice_number 
              FROM yybuy_record 
              WHERE YEAR(timestamp) <= ?)
        `, [selectedYear]);
const allPurchase = allPurchaseResult[0].allPurchase || 0;

const totalPurchaseResult = await queryDatabase(`
SELECT SUM(Amount) AS totalPurchase FROM yyitems_buy
WHERE Productname != "Discount" AND InvoiceNumber IN
  (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) = ?)
`, [selectedYear]);
const totalPurchase = totalPurchaseResult[0].totalPurchase || 0;

const allSalesResult = await queryDatabase(`
SELECT SUM(CostPrice) AS allSales FROM yyitems_sell
WHERE InvoiceNumber IN (
    SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)
`, [selectedYear]);
const allSales = allSalesResult[0].allSales || 0;



    const totalallPurchaseproResult = await queryDatabase('SELECT SUM(costprice) AS totalallPurchasepro FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear]);
    const totalallPurchasepro = (totalallPurchaseproResult[0].totalallPurchasepro || 0);
    const totalallSalesproResult = await queryDatabase('SELECT SUM(costprice) AS totalallSalespro FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear]);
    const totalallSalespro = (totalallSalesproResult[0].totalallSalespro || 0);
    const prorefundInwardsResult = await queryDatabase('SELECT SUM(amount) AS prorefundInwards FROM procurementrefund WHERE fromsupplier = "yes" AND YEAR(Date) = ?', [selectedYear]);
    const prorefundInwards = (prorefundInwardsResult[0].prorefundInwards || 0);
    const refundInwardsResult = await queryDatabase('SELECT SUM(amount) AS refundInwards FROM refund WHERE (fromSupplier = "yes") AND YEAR(date) = ?', [selectedYear]);
    const refundInwards = (refundInwardsResult[0].refundInwards || 0);
    const DiscountResult = await queryDatabase(`
      SELECT SUM(ABS(UnitPrice)) AS Discount 
      FROM yyitems_buy 
      WHERE ProductName = "Discount" 
      AND InvoiceNumber IN (
          SELECT Invoice_number 
          FROM yybuy_record 
          WHERE YEAR(timestamp) = ?)
    `, [selectedYear]);
    const Discount = (DiscountResult[0].Discount || 0);

    const DiscountproResult = await queryDatabase('SELECT SUM(costprice) AS Discountpro FROM procurementdatabase WHERE productname = "Discount" AND YEAR(salesdate) = ?', [selectedYear]);
    const Discountpro = (DiscountproResult[0].Discountpro || 0);
    const totalotherExpensesResult = await queryDatabase('SELECT SUM(Amount) AS totalotherExpenses FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const totalotherExpenses = (totalotherExpensesResult[0].totalotherExpenses || 0);
    const totalshippingfeesResult = await queryDatabase('SELECT SUM(Amount) AS totalshippingfees FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND YEAR(Date) = ?', [selectedYear]);
    const totalshippingfees = (totalshippingfeesResult[0].totalshippingfees || 0);
    
    const totalbankchargesResult = await queryDatabase('SELECT SUM(Amount) AS totalbankcharges FROM yyexpensesrecord WHERE Category = "Bank Charges" AND YEAR(Date) = ?', [selectedYear]);
    const totalbankcharges = (totalbankchargesResult[0].totalbankcharges || 0);
    const handlingexpensesResult = await queryDatabase('SELECT SUM(Amount) AS handlingexpenses FROM yyexpensesrecord WHERE Category = "Handling Expenses" AND YEAR(Date) = ?', [selectedYear]);
    const handlingexpenses = (handlingexpensesResult[0].handlingexpenses || 0);
    const totalwagesResult = await queryDatabase('SELECT SUM(Amount) AS totalwages FROM yyexpensesrecord WHERE Category = "Wages" AND YEAR(Date) = ?', [selectedYear]);
    const totalwages = (totalwagesResult[0].totalwages || 0);

    
    const lastYBuyproResult = await queryDatabase('SELECT SUM(costprice) AS lastYBuypro FROM procurementdatabase WHERE name != "return" AND YEAR(buydate) <= ?', [selectedYear-1]);
    const lastYBuypro = (lastYBuyproResult[0].lastYBuypro || 0);
    const lastYSalesproResult = await queryDatabase('SELECT SUM(sellprice) AS lastYSalespro FROM procurementdatabase WHERE YEAR(salesdate) <= ?', [selectedYear-1]);
    const lastYSalespro = (lastYSalesproResult[0].lastYSalespro || 0);
    const lastYSalesResult = await queryDatabase(`
      SELECT SUM(CostPrice) AS lastYSales FROM yyitems_sell
        WHERE InvoiceNumber IN
        (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(timestamp) <= ?)
      `, [selectedYear-1]);
    const lastYSales = (lastYSalesResult[0].lastYSales || 0);
    const lastYBuyResult = await queryDatabase(`
    SELECT SUM(UnitPrice) AS lastYBuy FROM yyitems_buy
    WHERE (Content_SKU IS NOT NULL AND Content_SKU != '') AND status != 'return'
    AND InvoiceNumber IN
      (SELECT Invoice_number FROM yybuy_record WHERE YEAR(timestamp) <= ?)
      `, [selectedYear-1]);
    const lastYBuy = (lastYBuyResult[0].lastYBuy || 0);
    const distribution2OwnersResult = await queryDatabase('SELECT SUM(Amount) AS distribution2Owners FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear]);
    const distribution2Owners = (distribution2OwnersResult[0].distribution2Owners || 0);
    const totaldistribution2OwnersResult = await queryDatabase('SELECT SUM(Amount) AS totaldistribution2Owners FROM yycompanyfund2personal WHERE YEAR(Date) <= ?', [selectedYear]);
    const totaldistribution2Owners = (totaldistribution2OwnersResult[0].totaldistribution2Owners || 0);
    const otherincomebonuscreditbfResult = await queryDatabase('SELECT SUM(bonuscredit) AS otherincomebonuscreditbf FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear-1]);
    const otherincomebonuscreditbf = (otherincomebonuscreditbfResult[0].otherincomebonuscreditbf || 0);

    const accountpayable = (totalPurchasesno2 - totalBuypaid + totalallprobuy - totalprobuypay);
    const accruals = (totalaccrued - totalaccruedpay);
    const accreceivable = (salesData - totalSalespaid + totalprosale + totalShippingFee + totalrunnerfee - totalpropay);
    const totalcreditor = (totalotcredit - totalotcreditpay);
    const closingstock = (totalPurchases + totalprobuy - totalSalesno2 - totalprosell);
    const cashInbank = (totalSalespayment + prosalepayment - totalBuypayment - probuypayment + totalcapital + totalotcredit + totalotherdebtorpay
      + totalrefundfromSupplier + profromsupplier - totalrefund2buyer - prorefund2buyer - totalAccrued - totalAccrualpayment - totaltopup 
      - totalcompanyfund2personal - totaldeposit - totalotcreditpay - totalotherdebtor);
    const cashInotherACC = (totalTopup + bonus2 - totalgdex);
    const totalCurrestassets = (closingstock + accreceivable + cashInbank + cashInotherACC + totalotherdebtor + totaldeposit);
    const currentLiabi = (accountpayable + totalcreditor + accruals);
    const nettProfitbf = (totalSalesbf + (proSalesbf + (otherIncomeProbf +  totalRunnerFeebf)) - (prorefundOutwardsbf + refundOutwardsbf) - 
    (totalPurchasebf + totalPurchaseprobf) - PostageCourierbf + totalCourierbf + (allPurchasebf + totalallPurchaseprobf - totalallSalesprobf - allSalesbf) + 
    (prorefundInwardsbf + refundInwardsbf) + (Discountbf + Discountprobf) - totalotherExpensesbf);
    const retainedBF = (nettProfitbf - distribution2Ownersbf + otherincomebonuscreditbf);

    const nettProfit = ( ((totalSales + (proSales + (otherIncomePro +  totalRunnerFee)) - (prorefundOutwards + refundOutwards) + 
    otherincomebonuscredit) - ((lastYBuy + lastYBuypro - lastYSales - lastYSalespro) + (totalPurchase + totalPurchasepro) + 
    PostageCourier - totalCourier - (allPurchase + totalallPurchasepro - totalallSalespro - allSales) - 
    (prorefundInwards + refundInwards) - (Discount + Discountpro))) - totalotherExpenses + otherincomebonuscreditbf);

    const retainedCF = (nettProfit + retainedBF - distribution2Owners);
    const openstock  = (totalPurchasesLastyear - totalCostLastyear);
    const buydiscount = (Discount + Discountpro);
    console.log(accountpayable);

    res.render('trialbalance', {
      accountpayable,
      totalshippingfees,
      totalwages,
      totalbankcharges,
      totaldistribution2Owners,
      totalCreditnote,
      totalPurchasepro,
      totalPurchase,
      handlingexpenses,
      totalotherExpenses,
      otherincomebonuscredit,
      buydiscount,
      prorefundOutwards,
      refundOutwards,
      refundInwards,
      prorefundInwards,
      otherIncomePro,
      totalRunnerFee,
      openstock,
      proSales,
      retainedBF,
      retainedCF,
      currentLiabi,
      cashInotherACC,
      totalCurrestassets,
      cashInbank,
      years,
      totalcreditor,
      closingstock,
      accreceivable,
      totalotherdebtor,
      accountpayable,
      accruals,
      selectedYear,
      totalaccruedpay,
      officeEquipment,
      totalPurchases, 
      totalCost,
      totalSalesno2,
      totalaccrued,
      totaldeposit,
      totalPurchasesno2,
      totalcapital,
      totalotcredit,
      totalBuypaid,
      totalTopup,
      totalSalespaid,
      totalSales, 
      totalSalesno,
      totalExpenses: totalExpensesByCategory,
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
      bonus2,
      totalgdex
    });
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).send('Error fetching data');
  }
});
app.get('/yyequity', requireLogin, function(req, res){
  pool.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate FROM yyequity', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row }));
      res.render('yyequity', { data });
    }
  });
});
app.post('/yyequity', upload.array(), function (req, res) {
  const { date, amount } = req.body;

  // Insert the assets into the MySQL database
  pool.query('INSERT INTO yyequity (date, amount, account) VALUES (?, ?, "Capital Account")', [date, amount], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving assets data');
    } else {
      // Fetch all assets from yycurrent_assets table and pass to view
      pool.query('SELECT * FROM yyequity', (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching data');
        } else {
          // Add the formattedDate field to each row of data
          const data = results.map(row => ({ ...row, formattedDate: row.date.toISOString().split('T')[0] }));
          res.render('yyequity', { successMessage: 'Form submitted successfully', data });
        }
      });
    }
  });
});
app.get('/yydeposit', requireLogin, function(req, res){
  pool.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate FROM yydeposit', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row }));
      res.render('yydeposit', { data });
    }
  });
});
app.post('/yydeposit', upload.array(), function (req, res) {
  const { date, amount, details } = req.body;

  // Insert the assets into the MySQL database
  pool.query('INSERT INTO yydeposit (`date`, `amount`, `for`, `details`) VALUES (?, ?, ?, ?)', [date, amount, "deposit", details], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving assets data');
    } else {
      // Fetch all assets from yycurrent_assets table and pass to view
      pool.query('SELECT * FROM yydeposit', (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching data');
        } else {
          // Add the formattedDate field to each row of data
          const data = results.map(row => ({ ...row, formattedDate: row.date.toISOString().split('T')[0] }));
          res.render('yydeposit', { successMessage: 'Form submitted successfully', data });
        }
      });
    }
  });
});
app.get('/yycurrentassets', requireLogin, function(req, res){
  pool.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate FROM yycurrent_assets', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('yycurrentassets', { data });
    }
  });
});
app.post('/yycurrentassets', upload.array(), function (req, res) {
  const { date, bank = [], amount = [] } = req.body;

  // Handle error if bank and amount arrays don't have the same length
  if (bank.length !== amount.length) {
    return res.status(400).send('Mismatched bank and amount arrays');
  }

  // Construct an array of assets to be inserted into the database
  const assets = bank.map((bank, index) => [date, bank, amount[index]]);

  // Insert the assets into the MySQL database
  pool.query('INSERT INTO yycurrent_assets (date, bank, amount) VALUES ?', [assets], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving assets data');
    } else {
      // Fetch all assets from yycurrent_assets table and pass to view
      pool.query('SELECT * FROM yycurrent_assets', (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching data');
        } else {
          const data = results.map(row => ({ ...row }));
          res.render('yycurrentassets', { successMessage: 'Form submitted successfully', data });
        }
      });
    }
  });
});
app.get('/creditnote', requireLogin, function(req, res){
  pool.query(`SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as formattedDate, DATE_FORMAT(useddate, "%Y-%m-%d") as formattedusedDate FROM creditnote`, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('creditnote', { data });
    }
  });
});
app.post('/creditnote',upload.single('file'), function (req, res) {
  const { invoice, date, courier, amount, remarks } = req.body;
  // Insert the assets into the MySQL database
  pool.query('INSERT INTO creditnote (invoice, date, courier, amount, remarks) VALUES (?, ?, ?, ?, ?)', [invoice, date, courier, amount, remarks], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving assets data');
    } else {
      // Fetch all assets from yycurrent_assets table and pass to view
      pool.query('SELECT * FROM creditnote', (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching data');
        } else {
          const data = results.map(row => ({ ...row }));
          res.render('creditnote', { successMessage: 'Form submitted successfully', data });
        }
      });
    }
  });
});
//-------------------------------------Import & Export---------------------------------------------------------------------------------------------------------------------
app.get('/inout', requireLogin, function(req, res) {
  const successMessage = req.query.success; // Get the success parameter from the query string
  res.render('inout', { successMessage: successMessage });
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
app.get('/yyexportsell_csv', requireLogin, function(req, res) {
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
app.get('/yyexportspay_csv', requireLogin, function(req, res) {
  const sql = `SELECT yysales_paymentbreakdown.Invoice_No, yysales_paymentbreakdown.Date as date, yysales_paymentbreakdown.Bank, yysales_paymentbreakdown.Amount, yysales_paymentbreakdown.Remarks
               FROM yysales_paymentbreakdown
               ORDER BY yysales_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          InvoiceNumber: row.Invoice_No,
          Date: formattedDate,
          IntoWhichBank: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yysalespaymentbreakdown_data.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
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
      const { PONo, Date, Name, BankName, Bank, BankNumber, Remarks, SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender, sold, status, solddate, checkindate} = data;
      const parsedUnitPrice = parseFloat(UnitPrice && UnitPrice.replace(/[^0-9.-]+/g,""));
      const parsedAmount = parseFloat(Amount.replace(/[^0-9.-]+/g,""));
      const solddateValue = solddate ? moment(solddate, ['YYYY-MM-DD', 'ddd MMM DD YYYY HH:mm:ss ZZ']).format('YYYY-MM-DD') : null;
      const checkindateValue = checkindate ? moment(checkindate, ['YYYY-MM-DD', 'ddd MMM DD YYYY HH:mm:ss ZZ']).format('YYYY-MM-DD') : null;


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
              pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender, sold, status, solddate, checkindate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, sold, status, solddateValue, checkindateValue], (error, results) => {
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
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, Quantity, UnitPrice, Amount, gender, sold, status, solddate, checkindate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [PONo, SKU, ProductName, SizeUS, Quantity, parsedUnitPrice, parsedAmount, gender, sold, status, solddateValue, checkindateValue], (error, results) => {
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
app.get('/yyexportbuy_csv', requireLogin, function(req, res) {
  const sql = `SELECT yybuy_record.Invoice_number, yybuy_record.Name, yybuy_record.Remarks, yybuy_record.BankName, yybuy_record.Bank, yybuy_record.Bankaccount, yybuy_record.timestamp As date, yyitems_buy.Content_SKU, yyitems_buy.ProductName, yyitems_buy.SizeUS, yyitems_buy.Quantity, yyitems_buy.UnitPrice, yyitems_buy.Amount, yyitems_buy.gender, yyitems_buy.sold, yyitems_buy.status, yyitems_buy.solddate, yyitems_buy.checkindate
                FROM yybuy_record
                LEFT JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber
                ORDER BY yybuy_record.Invoice_number, yyitems_buy.Content_SKU, yyitems_buy.sold, yyitems_buy.status, yyitems_buy.solddate, yyitems_buy.checkindate`;

  pool.query(sql, function(error, results, fields) {
    if (error) throw error;

    const csvData = [];
    let currentInvoiceNo = null;

    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string if it exists, otherwise set it as empty
      const formattedsoldDate = row.solddate ? moment(row.solddate).format('YYYY-MM-DD') : '';
      const formattedcheckDate = row.checkindate ? moment(row.checkindate).format('YYYY-MM-DD') : '';


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
          solddate: formattedsoldDate,
          checkindate: formattedcheckDate
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
          solddate: formattedsoldDate,
          checkindate: formattedcheckDate
        });
      }
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yybuy_data.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
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
app.get('/yyexportbpay_csv', requireLogin, function(req, res) {
  const sql = `SELECT yypurchase_paymentbreakdown.Invoice_No, yypurchase_paymentbreakdown.Date as date, yypurchase_paymentbreakdown.Bank, yypurchase_paymentbreakdown.Amount, yypurchase_paymentbreakdown.Remarks, yypurchase_paymentbreakdown.BankRefs
               FROM yypurchase_paymentbreakdown
               ORDER BY yypurchase_paymentbreakdown.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          PONo: row.Invoice_No,
          Date: formattedDate,
          To: row.Bank,
          Amount: row.Amount,
          OtherCurrencyRemark: row.Remarks,
          BankRefs: row.BankRefs
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yypurchasepaymentbreakdown_data.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
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
app.get('/yyexportexpenses_csv', requireLogin, function(req, res) {
  const sql = `SELECT yyexpensesrecord.Invoice_No, yyexpensesrecord.Date as date, yyexpensesrecord.Bank, yyexpensesrecord.Amount, yyexpensesrecord.Name, yyexpensesrecord.Category, yyexpensesrecord.Detail
               FROM yyexpensesrecord
               ORDER BY yyexpensesrecord.Invoice_No`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
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
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyexpenses.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importcheckin_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { pono, date, seller, bankname, bank, bankacc, remarks, sku, productname, size, quantity } = data;

      pool.query('INSERT INTO stock_checkin ( pono, date, sku, productname, size, quantity, seller, bank, bankname, bankacc, remarks ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [pono, date, sku, productname, size, quantity, seller, bank, bankname, bankacc, remarks], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${pono}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportcheckin_csv', requireLogin, function(req, res) {
  const sql = `SELECT stock_checkin.pono, stock_checkin.date as date, stock_checkin.sku, stock_checkin.productname, stock_checkin.size, stock_checkin.quantity,stock_checkin.seller, stock_checkin.bank, stock_checkin.bankname, stock_checkin.bankacc, stock_checkin.remarks
               FROM stock_checkin
               ORDER BY stock_checkin.pono`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          pono: row.pono,
          date: formattedDate,
          seller: row.seller,
          bankname: row.bankname,
          bank: row.bank,
          bankacc: row.bankacc,
          remarks: row.remarks,
          sku: row.sku,
          productname: row.productname,
          size: row.size,
          quantity: row.quantity,
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_check_in_data.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importdistributer2owner_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const {  Date, Invoice_No, Category, Bank, Name, Amount, Detail, banknum } = data;

      pool.query('INSERT INTO yycompanyfund2personal ( Date, Invoice_No, Category, Bank, Name, Amount, Detail, banknum ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [Date, Invoice_No, Category, Bank, Name, Amount, Detail, banknum], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${Invoice_No}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportdistributer2owner_csv', requireLogin, function(req, res) {
  const sql = `SELECT Date, Invoice_No, Category, Bank, Name, Amount, Detail, banknum, File
               FROM yycompanyfund2personal
               ORDER BY yycompanyfund2personal.Date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          Date: formattedDate,
          Invoice_No: row.Invoice_No,
          Category: row.Category,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail,
          banknum: row.banknum,
          File: row.File
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_Distributer_to_Owner.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyyothercreditor_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { Date, Invoice_No, Bank, Name, Amount, Detail, File, settle } = data;

      pool.query('INSERT INTO yyothercreditor ( Date, Invoice_No, Bank, Name, Amount, Detail, File, settle ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [Date, Invoice_No, Bank, Name, Amount, Detail, File, settle], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${Invoice_No}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyyothercreditor_csv', requireLogin, function(req, res) {
  const sql = `SELECT Date, Invoice_No, Bank, Name, Amount, Detail, File, settle
               FROM yyothercreditor
               ORDER BY Date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          Date: formattedDate,
          Invoice_No: row.Invoice_No,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail,
          File: row.File,
          settle: row.settle
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyotherCreditor.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyyothercreditorpaymentbreak_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { date, invoiceNo, name, amount, detail, file } = data;

      pool.query('INSERT INTO yyothercreditor_paymentbreakdown ( date, invoiceNo, name, amount, detail, file ) VALUES (?, ?, ?, ?, ?, ?)', [date, invoiceNo, name, amount, detail, file], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${invoiceNo}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyyothercreditorpaymentbreak_csv', requireLogin, function(req, res) {
  const sql = `SELECT date, invoiceNo, name, amount, detail, file
               FROM yyothercreditor_paymentbreakdown
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          date: formattedDate,
          invoiceNo: row.invoiceNo,
          name: row.name,
          amount: row.amount,
          detail: row.detail,
          file: row.file
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyotherCreditor_paymentbreakdown.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyyotherdebtor_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, settle } = data;

      pool.query('INSERT INTO yyotherdebtor ( Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, settle ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, settle], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${Invoice_No}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyyotherdebtor_csv', requireLogin, function(req, res) {
  const sql = `SELECT Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, settle
               FROM yyotherdebtor
               ORDER BY Date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          Date: formattedDate,
          Invoice_No: row.Invoice_No,
          Category: row.Category,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail,
          File: row.File,
          settle: row.settle
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyotherDebtor.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyyotherdebtorpaymentbreak_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { date, invoiceNo, name, amount, detail, file } = data;

      pool.query('INSERT INTO yyotherdebtor_paymentbreakdown ( date, invoiceNo, name, amount, detail, file ) VALUES (?, ?, ?, ?, ?, ?)', [date, invoiceNo, name, amount, detail, file], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${invoiceNo}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyyotherdebtorpaymentbreak_csv', requireLogin, function(req, res) {
  const sql = `SELECT date, invoiceNo, name, amount, detail, file
               FROM yyotherdebtor_paymentbreakdown
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          date: formattedDate,
          invoiceNo: row.invoiceNo,
          name: row.name,
          amount: row.amount,
          detail: row.detail,
          file: row.file
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyotherDebtor_paymentbreakdown.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/yyimportyyaccrualpaymentbreak_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { Date, Invoice_No, Bank, Name, Amount, Detail, File } = data;

      pool.query('INSERT INTO yyaccruals ( Date, Invoice_No, Bank, Name, Amount, Detail, File ) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date, Invoice_No, Bank, Name, Amount, Detail, File], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for InvoiceNo ${Invoice_No}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/yyexportyyaccrualpaymentbreak_csv', requireLogin, function(req, res) {
  const sql = `SELECT Date, Invoice_No, Bank, Name, Amount, Detail, File
               FROM yyaccruals
               ORDER BY Date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          Date: formattedDate,
          Invoice_No: row.Invoice_No,
          Bank: row.Bank,
          Name: row.Name,
          Amount: row.Amount,
          Detail: row.Detail,
          File: row.File
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyAccruals_paymentbreakdown.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyydeposit_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { date, amount, details } = data;
      const purpose = data.for;

      pool.query('INSERT INTO yydeposit ( date, amount, for, details ) VALUES (?, ?, ?, ?)', [date, amount, purpose, details], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyydeposit_csv', requireLogin, function(req, res) {
  const sql = `SELECT date, amount, \`for\`, details
               FROM yydeposit
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          date: formattedDate,
          amount: row.amount,
          for: row.for,
          details: row.details
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yydeposit.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importyyequity_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { date, amount, account } = data;

      pool.query('INSERT INTO yyequity ( date, amount, account ) VALUES (?, ?, ?)', [date, amount, account], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportyyequity_csv', requireLogin, function(req, res) {0
  const sql = `SELECT date, amount, account
               FROM yyequity
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          date: formattedDate,
          amount: row.amount,
          account: row.account
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyequity.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importbulkshipdata_csv', upload.single('file'), function(req, res) {
  const { path: csvFilePath } = req.file;

  const bulkshipData = new Set(); // Set to keep track of unique Date and BoxNumber combinations

  // Parse the CSV file and insert the data into the bulkship and shipped_items tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { TrackingNumber, Date, BoxNumber, invoice, Remarks, Content_SKU, productname, SizeUS, Quantity, BulkShipBoxNumber } = data;

      // Create a unique key using Date and BoxNumber
      const key = `${Date}-${BoxNumber}`;

      // Check if the combination of Date and BoxNumber is already processed
      if (!bulkshipData.has(key)) {
        bulkshipData.add(key); // Add the unique key to the Set of already-processed combinations

        // Check if a row with the same Date and BoxNumber exists in the bulkship table
        pool.query('SELECT * FROM bulkship WHERE Date = ? AND BoxNumber = ?', [Date, BoxNumber], (error, results) => {
          if (error) {
            console.error(error);
          } else {
            if (results.length === 0) {
              // If no row exists with the same Date and BoxNumber, insert the row into the bulkship table
              pool.query('INSERT INTO bulkship (TrackingNumber, Date, BoxNumber, invoice, Remarks) VALUES (?, ?, ?, ?, ?)', [TrackingNumber, Date, BoxNumber, invoice, Remarks], (error, results) => {
                if (error) {
                  console.error(error);
                } else {
                  console.log(`Data successfully inserted for Date: ${Date}, BoxNumber: ${BoxNumber}`);
                }
              });
            } else {
              console.log(`Data already exists for Date: ${Date}, BoxNumber: ${BoxNumber}`);
            }
          }
        });
      }

      // Insert the corresponding data into the shipped_items table
      pool.query('INSERT INTO shipped_items (BulkShipBoxNumber, Content_SKU, productname, SizeUS, Quantity, invoice) VALUES (?, ?, ?, ?, ?, ?)', [BulkShipBoxNumber, Content_SKU, productname, SizeUS, Quantity, invoice], (error, results) => {
        if (error) {
          console.error(error);
        } else {
          console.log(`Data successfully inserted into shipped_items for InvoiceNo: ${invoice}, BulkShipBoxNumber: ${BoxNumber}`);
        }
      });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportbulkshipdata_csv', requireLogin, function(req, res) {
  const sql = `SELECT si.BulkShipBoxNumber, si.Content_SKU, si.productname, si.SizeUS, si.Quantity, si.invoice, 
               bs.TrackingNumber, bs.Date, bs.BoxNumber, bs.invoice AS bulkship_invoice, bs.Remarks
               FROM shipped_items si
               JOIN bulkship bs ON si.invoice = bs.invoice AND si.BulkShipBoxNumber = bs.BoxNumber`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : '';
      csvData.push({
        BulkShipBoxNumber: row.BulkShipBoxNumber,
        Content_SKU: row.Content_SKU,
        productname: row.productname,
        SizeUS: row.SizeUS,
        Quantity: row.Quantity,
        invoice: row.invoice,
        TrackingNumber: row.TrackingNumber,
        Date: formattedDate,
        BoxNumber: row.BoxNumber,
        bulkship_invoice: row.bulkship_invoice,
        Remarks: row.Remarks
      });
    });

    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yybulkship.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importsinggleship_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity, remarks } = data;

      pool.query('INSERT INTO singleship ( TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity, remarks ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity, remarks], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportsinggleship_csv', requireLogin, function(req, res) {
  const sql = `SELECT TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity, remarks
               FROM singleship
               ORDER BY Date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.Date ? moment(row.Date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          TrackingNumber: row.TrackingNumber,
          Date: formattedDate,
          Content_SKU: row.Content_SKU,
          Productname: row.Productname,
          SizeUS: row.SizeUS,
          invoice: row.invoice,
          quantity: row.quantity,
          remarks: row.remarks
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yysinggleship.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importrefunds_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { invoice, amount, remarks, refund2buyer, fromSupplier, date } = data;

      pool.query('INSERT INTO refund ( invoice, amount, remarks, refund2buyer, fromSupplier, date ) VALUES (?, ?, ?, ?, ?, ?)', [invoice, amount, remarks, refund2buyer, fromSupplier, date], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportrefunds_csv', requireLogin, function(req, res) {
  const sql = `SELECT invoice, amount, remarks, refund2buyer, fromSupplier, date
               FROM refund
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          invoice: row.invoice,
          amount: row.amount,
          remarks: row.remarks,
          refund2buyer: row.refund2buyer,
          fromSupplier: row.fromSupplier,
          date: formattedDate
        });
    });
    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yyrefunds.csv`;

    // Use fast-csv to stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/importtopup_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { wallet, amount, lastbalance, date, bonuscredit } = data;

      pool.query('INSERT INTO yytopupbalance ( wallet, amount, lastbalance, date, bonuscredit ) VALUES (?, ?, ?, ?, ?)', [wallet, amount, lastbalance, date, bonuscredit], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exporttopup_csv', requireLogin, function(req, res) {
  const sql = `SELECT wallet, amount, lastbalance, date, bonuscredit
               FROM yytopupbalance
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          wallet: row.wallet,
          amount: row.amount,
          lastbalance: row.lastbalance,
          date: formattedDate,
          bonuscredit: row.bonuscredit
        });
    });

    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_yytopup.csv`;

    // Set the response headers with the updated file name
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    // Use fast-csv to stream the CSV data to the HTTP response
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});

app.post('/importcreditNote_csv', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;
  
  // Parse the CSV file and insert the data into MySQL tables
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Extract the relevant data from the CSV row
      const { invoice, amount, courier, remarks, date, used, useddate } = data;

      pool.query('INSERT INTO yytopupbalance ( invoice, amount, courier, remarks, date, used, useddate ) VALUES (?, ?, ?, ?, ?, ?, ?)', [invoice, amount, courier, remarks, date, used, useddate], (error, results) => {
          if (error) {
            console.error(error);
            res.send('An error occurred while processing the CSV file.');
          } else {
            console.log(`Data successfully inserted for Date: ${date}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.redirect('/inout?success=true'); // Redirect to the /inout route with the success parameter
    });
});
app.get('/exportcreditNote_csv', requireLogin, function(req, res) {
  const sql = `SELECT invoice, amount, courier, remarks, date, used, useddate
               FROM creditnote
               ORDER BY date`;

  pool.query(sql, function(error, results) {
    if (error) throw error;

    const csvData = [];
    // Iterate through the SQL query results and build the CSV data
    results.forEach((row) => {
      const formattedDate = row.date ? moment(row.date).format('YYYY-MM-DD') : '';
      const formattedusedDate = row.useddate ? moment(row.useddate).format('YYYY-MM-DD') : ''; // Use moment.js to format the date string
        csvData.push({
          invoice: row.invoice,
          amount: row.amount,
          courier: row.courier,
          remarks: row.remarks,
          date: formattedDate,
          used: row.used,
          useddate: formattedusedDate,
        });
    });

    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD');
    const fileName = `${timestamp}_CreditNote.csv`;

    // Set the response headers with the updated file name
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    // Use fast-csv to stream the CSV data to the HTTP response
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});

//-------------------------------------Bank statement---------------------------------------------------
app.get('/expenses-record', requireLogin, function(req, res){
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
app.get('/stockaudit', requireLogin, function(req, res) {
  pool.query(`
  SELECT Content_SKU, SizeUS, ProductName, Amount, SUM(Quantity) as total_quantity, status
  FROM yyitems_buy WHERE sold = 'no' AND Content_SKU != "" AND Content_SKU IS NOT NULL
  GROUP BY Content_SKU, ProductName, SizeUS, Amount, status
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
app.get('/stock-checkin', requireLogin, function(req, res){
  const sql = "SELECT InvoiceNumber, Content_SKU, SizeUS , ProductName, SUM(Quantity) as total_quantity FROM yyitems_buy WHERE status = 'intransit' GROUP BY InvoiceNumber, Content_SKU, ProductName, SizeUS";
  pool.query(sql, (err, result) => {
    if (err) throw err;
    res.render('stock-checkin', { items: result });
  });
});
app.get('/stockcheckinasd', requireLogin, (req, res) => {
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
  const { invoice, date, field1 = [], field3 = [], field4 = [] } = req.body;

  // Loop through each item in the form data
  for (let i = 0; i < field1.length; i++) {
    const sku = field1[i];
    const size = field3[i];
    const quantity = parseInt(field4[i]); // Convert string value to integer

    pool.query(
      'UPDATE yyitems_buy SET status = "check", checkindate = ? WHERE InvoiceNumber = ? AND Content_SKU = ? AND SizeUS = ? AND status = "intransit" LIMIT ?',
      [date, invoice, sku, size, quantity],
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
app.get('/stock-summarize', requireLogin, function(req, res) {
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
      res.render('stock-summarize', { data, searchTerm, searchBy });
    }
  });
});
app.get('/stock-check', requireLogin, function(req, res) {
  const searchTerm = req.query['search-term'];
  const searchBy = req.query['search-by'];

  let query = `
    SELECT b.Content_SKU, b.ProductName, CAST(b.SizeUS AS DECIMAL(3,1)) AS SizeNumber, SUM(b.Quantity) AS totalQuantity, b.checkindate
    FROM yyitems_buy b
    WHERE b.status = 'check' AND b.sold = 'no'
  `;

  if (searchTerm && searchBy) {
    if (searchBy === 'size') {
      query += ` AND CAST(b.SizeUS AS CHAR) = ?`;
    } else if (searchBy === 'sku') {
      query += ` AND b.Content_SKU LIKE ?`;
    }
  }

  query += ` GROUP BY b.Content_SKU, b.ProductName, SizeNumber, b.checkindate ORDER BY b.Content_SKU ASC, SizeNumber ASC;`;

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
app.post('/stock-location', (req, res) => {
  const invoice = req.body.invoice;
  const location = req.body.location;
  const skus = req.body.sku;
  const sizes = req.body.size;
  const quantities = req.body.quantity;
  const currentLocations = req.body.currlocation;
  console.log(invoice);
  console.log(location);
  console.log(skus);
  console.log(sizes);
  console.log(quantities);
  console.log(currentLocations);

  for (let i = 0; i < skus.length; i++) {
    const updateQuery = 'UPDATE yyitems_buy SET location = ? WHERE InvoiceNumber = ? AND Content_SKU = ? AND SizeUS = ? AND sold = "no" AND status = "check" AND (location IS NULL OR location = ?) LIMIT ?';
    pool.query(updateQuery, [location, invoice, skus[i], sizes[i], currentLocations[i], parseInt(quantities[i])], (error, results) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error updating location');
        return;
      }
    });
  }
  
  res.redirect('/stocklocation');
});
app.get('/stocklocationasd', requireLogin, (req, res) => {
  const ponum = req.query.ponum;
  const query = `
    SELECT yyitems_buy.ProductName, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, SUM(yyitems_buy.Quantity) as TotalQuantity, yyitems_buy.location
    FROM yyitems_buy yyitems_buy
    JOIN yybuy_record yybuy_record ON yyitems_buy.InvoiceNumber = yybuy_record.Invoice_number
    WHERE yyitems_buy.InvoiceNumber = ? AND yyitems_buy.sold = 'no' AND yyitems_buy.status = 'check'
    GROUP BY yyitems_buy.ProductName, yyitems_buy.Content_SKU, yyitems_buy.SizeUS, yybuy_record.Name, yybuy_record.Bank, yybuy_record.BankName, yybuy_record.Bankaccount, yybuy_record.Remarks, yyitems_buy.location
  `;
  pool.query(query, [ponum], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error fetching items');
      return;
    }

    const items = results.map(result => ({
      sku: result.Content_SKU,
      name: result.ProductName,
      size: result.SizeUS,
      quantity: result.TotalQuantity,
      currlocation: result.location,
    }));

    res.json({ items });
  });
});
app.get('/stocklocation', requireLogin, (req, res) => {
  const sql = `SELECT InvoiceNumber, Content_SKU, SizeUS, ProductName, SUM(Quantity) as total_quantity, location
  FROM yyitems_buy WHERE sold = 'no' AND status != 'intransit'
  GROUP BY InvoiceNumber, Content_SKU, ProductName, SizeUS, location
  ORDER BY location ASC, InvoiceNumber ASC`;
  pool.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error fetching stock locations');
      return;
    }

    res.render('stocklocation', { items: result });
  });
});
fs.rmSync
app.get('/shippedrecord', requireLogin, (req, res) => {
  res.render('shippedrecord');
});
//for shipped record page
app.get('/singleshipped', requireLogin, function(req, res) {
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
app.get('/singleshippeds', requireLogin, (req, res) => {
  const invoice = req.query.invoice;
  const sku = req.query.sku;
  const query = 'SELECT product_name, SizeUS FROM yyitems_sell WHERE InvoiceNumber = ? AND Content_SKU = ? AND ship = "pending"';
  pool.query(query, [invoice, sku], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error retrieving product data');
    } else {
      const sizes = results.map(result => result.SizeUS);
      const uniqueSizes = [...new Set(sizes)]; // Remove duplicates using Set
      const data = {
        productName: results.length > 0 ? results[0].product_name : '',
        sizes: uniqueSizes
      };
      console.log('Product Data:', data); // Log the product data
      res.send(data);
    }
  });
});
app.post('/singleshipped', upload.single('file'), urlencodedParser, function(req, res) {
  const { trackingno, date, sku, productname, size, invoice, remarks } = req.body;
  const quantity = 1;

  // Insert the form data into MySQL
  pool.query('INSERT INTO singleship (TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [trackingno, date, sku, productname, size, invoice, quantity, remarks], (error, results, fields) => {
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
              console.log(req.body);
              res.render('singleshipped', { successMessage: 'Form submitted successfully', data });
            }
          });
        }
      });
    }
  });
});

//for shipped record page - bulk ship
app.get('/bulkshipped', requireLogin, function(req, res){
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
  const { trackingno, date, boxno, invoice = [], remarks, productname = [], field1 = [], field2 = [], field3 = [] } = req.body;

  // Insert the main form data into MySQL
  for (let i = 0; i < invoice.length; i++) {
    pool.query('INSERT INTO bulkship (TrackingNumber, Date, BoxNumber, Remarks, invoice) VALUES (?, ?, ?, ?, ?)', [trackingno, date, boxno, remarks, invoice[i]], (error, results, fields) => {
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
app.get('/inout', requireLogin, function(req, res){
  res.render('inout');
});
//-------below is for Y Kick Zone Shop----------------------------------------------------------------------------------
//------------------Sales--------------------------------------------------------------------------
//for sales - sell invoice
app.get('/sell_invoice', requireLogin, function(req, res){
  res.render('sell_invoice');
});
app.get('/sellproduct-name', requireLogin, (req, res) => {
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
app.get('/sales-paymentbreak', requireLogin, function(req, res){
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
app.get('/sales-balancecheck', requireLogin, (req, res) => {
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
app.get('/invoice_generate', requireLogin, function(req, res) {
  res.render('invoice_generate');
});
app.get('/generate', requireLogin, (req, res) => {
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
app.get('/buy-payby', requireLogin, function(req, res){
  res.render('buy-payby');
});
app.get('/buyproduct-name', requireLogin, (req, res) => {
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
app.get('/buy-paymentbreak', requireLogin, function(req, res){
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
app.get('/buy-balancecheck', requireLogin, (req, res) => {
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
app.get('/searchs', requireLogin, (req, res) => {
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
app.get('/order_generate', requireLogin, function(req, res) {
  res.render('order_generate');
});
app.get('/ordergenerate', requireLogin, (req, res) => {
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
app.get('/company2personal', requireLogin, function(req, res){
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
app.get('/yysell_invoice', function(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = `
    SELECT i.InvoiceNumber, i.Content_SKU, i.product_name, CAST(i.SizeUS AS DECIMAL(10,2)) AS SizeUS, i.UnitPrice, SUM(i.Quantity) as Quantity, SUM(i.Amount) as Amount, i.gender, i.CostPrice, s.timestamp
    FROM yyitems_sell i
    JOIN yysell_invoice s ON i.InvoiceNumber = s.Invoice_number
    WHERE i.Content_SKU IS NOT NULL AND i.Content_SKU <> ''
  `;

  if (startDate && endDate) {
    query += ` AND s.timestamp BETWEEN '${startDate}' AND '${endDate}'`;
  }

  query += `
    GROUP BY i.InvoiceNumber, i.Content_SKU, i.SizeUS, i.UnitPrice, i.product_name, i.gender, i.CostPrice, s.timestamp
    ORDER BY i.InvoiceNumber DESC, CAST(i.SizeUS AS DECIMAL(10,2)) ASC
  `;

  pool.query(query, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
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
app.get('/getQuantityAndCostPrice', (req, res) => {
  // Retrieve SKU and Size from the query parameters
  const sku = req.query.sku;
  const size = req.query.size;

  // Perform the necessary database query to retrieve the quantity and distinct unit prices
  const query = `SELECT SUM(Quantity) AS quantity, UnitPrice 
                 FROM yyitems_buy 
                 WHERE Content_SKU = '${sku}' AND SizeUS = '${size}' AND sold = 'no' 
                 GROUP BY UnitPrice`;

  // Execute the query and retrieve the results using the database connection pool
  pool.query(query, (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    // Check if the query result contains any rows
    if (result.length === 0) {
      res.status(404).json({ error: 'No data found' });
      return;
    }

    // Prepare the response data as an array of objects
    const responseData = result.map(row => {
      return {
        quantity: row.quantity,
        costPrice: row.UnitPrice
      };
    });

    // Send the response data as JSON response
    res.json(responseData);
  });
});
app.post('/yysell_invoice', upload.single('file'), urlencodedParser, function (req, res) {
  const { date, name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [], field8 = []} = req.body;

  pool.query('SELECT MAX(Invoice_number) as maxInvoiceNumber FROM yysell_invoice', (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      pool.query('INSERT INTO yysell_invoice (timestamp, Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [date, invoice_number, name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks], (error, results, fields) => {
        if (error) {
          console.error(error);
          return res.status(500).send('Error saving form data');
        } else {
          const sellItems = [];
          field1.forEach((item, index) => {
            for (let i = 0; i < field5[index]; i++) {
              let shipStatus = 'pending';
              if (name.toLowerCase() === 'goat') {
                shipStatus = 'shipped';
                // Insert into singgleship table
                const trackingNumber = 'goat';
                const currentDate = new Date().toISOString().split('T')[0];
                const content_SKU = item;
                const productName = field2[index];
                const sizeUS = field3[index];

                pool.query('INSERT INTO singleship (TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)', [trackingNumber, currentDate, content_SKU, productName, sizeUS, invoice_number, 1], (error, results, fields) => {
                  if (error) {
                    console.error(error);
                    return res.status(500).send('Error saving data to singgleship table');
                  }
                });
              }
              sellItems.push([invoice_number, item, field2[index], field3[index], field4[index], 1 , field4[index], field7[index], field8[index], shipStatus]);
            }
          });
          pool.query('INSERT INTO yyitems_sell (InvoiceNumber, Content_SKU, product_name, SizeUS, UnitPrice, Quantity, Amount, gender, CostPrice, ship) VALUES ?', [sellItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              return res.status(500).send('Error saving shipped items data');
            } else {
              field1.forEach((item, index) => {
                const sku = item;
                const size = field3[index];
                const qty = field5[index];
                const unitPrice = field8[index] === '' || field8[index] == null ? null : field8[index];
                console.log(sku, size, qty, unitPrice, soldDate);
                for (let i = 0; i < qty; i++) {
                  pool.query('UPDATE yyitems_buy SET sold = ?, solddate = ? WHERE UnitPrice = ? AND Content_SKU = ? AND SizeUS = ? AND sold = ? AND status = ? LIMIT ?', ['yes', date, unitPrice, sku, size, 'no', 'check', parseInt(qty)], (error, results, fields) => {
                    if (error) {
                      console.error(error);
                      return res.status(500).send('Error updating yyitems_buy table');
                    }
                  });
                }
              });
              pool.query(`
                    SELECT i.*, s.timestamp 
                    FROM yyitems_sell i
                    LEFT JOIN yysell_invoice s ON i.InvoiceNumber = s.Invoice_number
                    ORDER BY i.InvoiceNumber DESC
                `, function(error, results, fields) {
                    if (error) {
                      console.error(error);
                      return res.status(500).send('Error fetching data');
                    } else {
                      console.log(req.body);
                      const data = results.map(row => ({ ...row }));
                      res.render('yysell_invoice', { successMessage: 'Form submitted successfully', data });
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
app.get('/yysales-paymentbreak', requireLogin, function(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = 'SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Amount, Remarks, File FROM yysales_paymentbreakdown';

  if (startDate && endDate) {
    query += ` WHERE Date BETWEEN '${startDate}' AND '${endDate}'`;
  }

  query += ' ORDER BY Invoice_No DESC';

  pool.query(query, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));

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
            res.render('yysales-paymentbreak', { sell_invoice_data, invoice_number, data });
          });
        }
      });
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
// Set up the searchs route for balance check details
app.get('/yysearch', requireLogin, (req, res) => {
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
app.get('/yyinvoice_generate', requireLogin, function(req, res) {
  pool.query(`
  SELECT yysell_invoice.Invoice_number, yysell_invoice.Name, DATE_FORMAT(yysell_invoice.timestamp, "%d/%m/%Y") AS formattedDate, 
  yyitems_sell.Content_SKU, yyitems_sell.product_name, SUM(yyitems_sell.Quantity) AS totalQuantity, SUM(yyitems_sell.Amount) AS totalAmount
  FROM yysell_invoice JOIN yyitems_sell ON yysell_invoice.Invoice_number = yyitems_sell.InvoiceNumber
  WHERE yyitems_sell.Content_SKU IS NOT NULL AND yyitems_sell.Content_SKU != ""
  GROUP BY yysell_invoice.Invoice_number, yysell_invoice.Name, yysell_invoice.timestamp, yyitems_sell.Content_SKU, yyitems_sell.product_name
  ORDER BY yysell_invoice.Invoice_number DESC`, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const invoiceData = results;
      res.render('yyinvoice_generate', { invoiceData });
    }
  });
});
app.get('/yygenerate', requireLogin, (req, res) => {
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
app.get('/yybuy-payby', requireLogin, function(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = `
    SELECT b.InvoiceNumber, b.Content_SKU, b.ProductName, CAST(b.SizeUS AS DECIMAL(10,2)) as SizeUS, b.UnitPrice, SUM(b.Quantity) as Quantity, SUM(b.Amount) as Amount, b.gender, r.timestamp
    FROM yyitems_buy b
    LEFT JOIN yybuy_record r ON b.InvoiceNumber = r.Invoice_number
    WHERE b.Content_SKU IS NOT NULL AND b.Content_SKU <> ''
  `;

  if (startDate && endDate) {
    query += ` AND r.timestamp BETWEEN '${startDate}' AND '${endDate}'`;
  }

  query += `
    GROUP BY b.InvoiceNumber, b.Content_SKU, b.SizeUS, b.UnitPrice, b.ProductName, b.gender, r.timestamp
    ORDER BY b.InvoiceNumber DESC, CAST(b.SizeUS AS DECIMAL(10,2)) ASC
  `;

  pool.query(query, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => {
        const date = new Date(row.timestamp);
        const formattedDate = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        return { ...row, formattedDate };
      });

      res.render('yybuy-payby', { data });
    }
  });
});
app.get('/yybuyproduct-name', requireLogin, (req, res) => {
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
  const { name, bankname, bank, bankacc, remarks, discount, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [] } = req.body;

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
          if (discount && parseFloat(discount) > 0) {
            discountAmount = -Math.abs(parseFloat(discount));
          }
          // Add discount item if a discount is submitted
          if (discount) {
            buyItems.push([invoice_number, '', 'Discount', '', discountAmount, 1, discountAmount, '', '', '']);
          }
          // Insert the shipped items data into MySQL
          pool.query('INSERT INTO yyitems_buy (InvoiceNumber, Content_SKU, ProductName, SizeUS, UnitPrice, Quantity, Amount, gender, sold, status) VALUES ?', [buyItems], (error, results, fields) => {
            if (error) {
              console.error(error);
              res.status(500).send('Error saving shipped items data');
            } else {
              // Fetch all items from yyitems_buy table and pass to view
              pool.query(`
                SELECT yyitems_buy.*, yybuy_record.timestamp
                FROM yyitems_buy
                INNER JOIN yybuy_record ON yyitems_buy.InvoiceNumber = yybuy_record.Invoice_number
                ORDER BY yyitems_buy.InvoiceNumber DESC
              `, (error, results, fields) => {
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
app.get('/yybuy-paymentbreak', requireLogin, function(req, res){
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Amount, Remarks, File FROM yypurchase_paymentbreakdown ORDER BY Invoice_No DESC', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row, formattedDate: moment(row.formattedDate).format('YYYY-MM-DD') }));

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
            res.render('yybuy-paymentbreak', { buy_record_data, invoice_number, data });
          });
        }
      });
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
// Set up the searchs route for balance check details
app.get('/yysearchs', requireLogin, (req, res) => {
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
app.get('/yyorder_generate', requireLogin, function(req, res) {
  pool.query(`
  SELECT yybuy_record.Invoice_number, yybuy_record.Name, DATE_FORMAT(yybuy_record.timestamp, "%d/%m/%Y") AS formattedDate, 
  yyitems_buy.Content_SKU, yyitems_buy.ProductName, SUM(yyitems_buy.Quantity) AS totalQuantity, SUM(Amount) AS totalAmount
  FROM yybuy_record JOIN yyitems_buy ON yybuy_record.Invoice_number = yyitems_buy.InvoiceNumber
  WHERE yyitems_buy.Content_SKU IS NOT NULL AND yyitems_buy.Content_SKU != ""
  GROUP BY yybuy_record.Invoice_number, yyitems_buy.Content_SKU, yybuy_record.Name, yybuy_record.timestamp, yyitems_buy.ProductName
  ORDER BY yybuy_record.Invoice_number DESC`, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const orderData = results;
      res.render('yyorder_generate', { orderData });
    }
  });
});
app.get('/yyordergenerate', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const buyRecordQuery = `SELECT * FROM yybuy_record WHERE Invoice_number = '${invoiceNumber}'`;
  pool.query(buyRecordQuery, (error, buyRecordResults) => {
    if (error) throw error;

    if (!buyRecordResults.length) {
      // Render the yyorder_template view with no buyRecordResults
      res.render('yyorder_template', {
        buyRecordResults: buyRecordResults,
        invoiceNumber: invoiceNumber,
        buyRecordResults: null
      });
    } else {
      // Query the items_buy table with grouping by ProductName, SizeUS, and UnitPrice
      const itemsBuyQuery = `SELECT ProductName, SizeUS, UnitPrice, SUM(Quantity) AS TotalQuantity
        FROM yyitems_buy
        WHERE InvoiceNumber = '${invoiceNumber}' AND Content_SKU IS NOT NULL AND Content_SKU != ""
        GROUP BY ProductName, SizeUS, UnitPrice`;

      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        let totalAmounts = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += itemsBuyResults[i].UnitPrice * itemsBuyResults[i].TotalQuantity;
        }

        // Query the purchase_paymentbreakdown table
        const purchasePaymentQuery = `SELECT * FROM yypurchase_paymentbreakdown WHERE Invoice_No = '${invoiceNumber}'`;
        pool.query(purchasePaymentQuery, (error, purchasePaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < purchasePaymentResults.length; i++) {
            totalAmountPaid += parseFloat(purchasePaymentResults[i].Amount);
          }

          // Query the discount item amount separately
          const discountQuery = `SELECT SUM(UnitPrice) AS DiscountAmount FROM yyitems_buy WHERE InvoiceNumber = '${invoiceNumber}' AND ProductName = 'Discount'`;
          pool.query(discountQuery, (error, discountResult) => {
            if (error) throw error;

            const discountAmount = discountResult[0].DiscountAmount || 0;
            totalAmounts = totalAmount + discountAmount; // Deduct the discount amount from the total

            // Calculate the balance
            const balance = totalAmounts - totalAmountPaid;
            const discountApplied = itemsBuyResults.length >= 5;

            res.render('yyorder_template', {
              invoiceNumber: invoiceNumber,
              buyRecordResults: buyRecordResults,
              itemsBuyResults: itemsBuyResults,
              name: buyRecordResults[0].Name,
              totalAmounts: totalAmounts,
              totalAmount: totalAmount,
              transactions: purchasePaymentResults,
              balance: balance,
              totalpaid: totalAmountPaid,
              discountApplied: discountApplied,
              discountAmount: discountAmount,
            });
          });
        });
      });
    }
  });
});
app.get('/yycompany2personal', requireLogin, function(req, res) {
  pool.query('SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File, banknum FROM yycompanyfund2personal', function(error, results, fields) {
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
  const { date, invoice_no, category, bank, name, amount, detail, banknum } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yycompanyfund2personal (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, banknum) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"), ?)', [date, invoice_no, category, bank, name, amount, detail, filename, banknum], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('yycompany2personal', { successMessage: 'Form submitted successfully' });
    }
  });
});
app.get('/yypersonal2company', requireLogin, function(req, res) {
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
app.get('/yyexpenses-record', requireLogin, function(req, res) {
  let years = [];
  pool.query('SELECT DISTINCT YEAR(Date) AS year FROM yyexpensesrecord ORDER BY year DESC', function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      years = results.map(row => row.year);

      const selectedYear = req.query.year;
      let query = 'SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File FROM yyexpensesrecord';

      if (selectedYear) {
        query += ' WHERE YEAR(Date) = ?';
      }

      query += ' ORDER BY Date DESC';

      pool.query(query, [selectedYear], function(error, results, fields) {
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

          res.render('yyexpenses-record', { data, categoryData, totalAmount, selectedYear, years });
        }
      });
    }
  });
});
app.post('/yyexpenses-record', upload.single('file'), urlencodedParser, function(req, res) {
  const { date, invoice_no, category, bank, name, amount, detail, othername } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Set the value of the name field based on the selected option
  const nameValue = (name === 'other' && othername) ? othername : name;

  // Determine the value of the accrued and settle columns based on the checkbox selection
  const accruedValue = req.body.Accrued === 'yes' ? 'yes' : 'no';
  const settleValue = accruedValue === 'yes' ? 'no' : '';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyexpensesrecord (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File, accrued, settle) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"), ?, ?)', [date, invoice_no, category, bank, nameValue, amount, detail, filename, accruedValue, settleValue], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      // Fetch updated data after inserting the form data
      pool.query('SELECT DISTINCT YEAR(Date) AS year FROM yyexpensesrecord ORDER BY year DESC', function(error, results, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching data');
        } else {
          const years = results.map(row => row.year);

          const selectedYear = req.query.year;
          let query = 'SELECT DATE_FORMAT(Date, "%Y-%m-%d") as formattedDate, Invoice_No, Category, Bank, Name, Amount, Detail, File FROM yyexpensesrecord';

          if (selectedYear) {
            query += ' WHERE YEAR(Date) = ?';
          }

          query += ' ORDER BY Date DESC';

          pool.query(query, [selectedYear], function(error, results, fields) {
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

              res.render('yyexpenses-record', { data, categoryData, totalAmount, selectedYear, years });
            }
          });
        }
      });
    }
  });
});
app.get('/yytopupbalance', requireLogin, (req, res) => {
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
app.get('/refund', requireLogin, function(req, res) {
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
app.get('/returned', requireLogin, function(req, res){
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
app.get('/yyother-creditor', requireLogin, function(req, res){
  res.render('yyother-creditor');
});
app.post('/yyother-creditor',upload.single('file'),  urlencodedParser, function(req, res){
  const { date, invoice_no, bank, name, amount, detail } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyothercreditor (Date, Invoice_No, Bank, Name, Amount, Detail, File, settle) VALUES (?, ?, ?, ?, ?, ?, ifnull(?, "N/A"), ?)', [date, invoice_no, bank, name, amount, detail, filename, 'no'], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('yyother-creditor');
    }
  });
});
app.get('/yyothercreditor_paymentbreakdown', requireLogin, function(req, res){
  pool.query("SELECT * FROM yyothercreditor WHERE settle = 'no'", function(err, results){
    if(err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
      return;
    }
    pool.query("SELECT * FROM yyothercreditor_paymentbreakdown", function(err2, results2) {
      if (err2) {
        console.error(err2);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.render('yyothercreditor_paymentbreakdown', { data: results, paymentData: results2 });
    });
  });
});
app.post('/yyothercreditor_paymentbreakdown', upload.single('file'), urlencodedParser, function(req, res) {
  const { id, date, invoice_no, name, amount, detail } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyothercreditor_paymentbreakdown (date, invoiceNo, name, amount, detail, file) VALUES (?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, name, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      // Update the settle column to "yes" for the given ID
      pool.query('UPDATE yyothercreditor SET settle = "yes" WHERE ID = ?', [id], (updateError, updateResults) => {
        if (updateError) {
          console.error(updateError);
          res.status(500).send('Error updating settle column');
        } else {
          console.log('Form data saved successfully');
          res.render('yyothercreditor_paymentbreakdown');
        }
      });
    }
  });
});
app.get('/yydebtor', requireLogin, function(req, res){
  res.render('yydebtor');
});
app.post('/yydebtor',upload.single('file'),  urlencodedParser, function(req, res){
  const { date, invoice_no, category, bank, name, amount, detail } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyotherdebtor (Date, Invoice_No, Category, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, category, bank, name, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);
      res.render('yydebtor');
    }
  });
});
app.get('/yyotherdebtor_paymentbreakdown', requireLogin, function(req, res){
  pool.query("SELECT * FROM yyotherdebtor WHERE settle = 'no'", function(err, results){
    if(err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
      return;
    }
    pool.query("SELECT * FROM yyotherdebtor_paymentbreakdown", function(err2, results2) {
      if (err2) {
        console.error(err2);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.render('yyotherdebtor_paymentbreakdown', { data: results, paymentData: results2 });
    });
  });
});
app.post('/yyothercreditor_paymentbreakdown', upload.single('file'), urlencodedParser, function(req, res) {
  const { id, date, invoice_no, name, amount, detail } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyotherdebtor_paymentbreakdown (date, invoiceNo, name, amount, detail, file) VALUES (?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, name, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      // Update the settle column to "yes" for the given ID
      pool.query('UPDATE yyotherdebtor SET settle = "yes" WHERE ID = ?', [id], (updateError, updateResults) => {
        if (updateError) {
          console.error(updateError);
          res.status(500).send('Error updating settle column');
        } else {
          console.log('Form data saved successfully');
          res.render('yyotherdebtor_paymentbreakdown');
        }
      });
    }
  });
});
app.get('/yyaccruals', requireLogin, function(req, res) {
  pool.query('SELECT * FROM yyexpensesrecord WHERE accrued = "yes" AND settle = "no" ORDER BY Invoice_No DESC', function(error, expensesResults, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching expenses data');
    } else {
      pool.query('SELECT Date, Invoice_No, Bank, Name, Amount, Detail, File FROM yyaccruals ORDER BY Invoice_No DESC', function(error, accrualsResults, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error fetching accruals data');
        } else {
          res.render('yyaccruals', { expensesData: expensesResults, accrualsData: accrualsResults });
        }
      });
    }
  });
});
app.post('/yyaccruals', upload.single('file'), urlencodedParser, function(req, res){
  const { id, date, invoice_no, bank, name, creditN, amount, detail } = req.body;
  const invoiceNumber = invoice_no || '0';
  const filename = req.file ? req.file.filename : 'N/A';
  const actualAmount = creditN ? creditN : amount; // Use credit note amount if available, otherwise use the input amount

  // Insert the form data into MySQL with the actual amount
  pool.query('INSERT INTO yyaccruals (Date, Invoice_No, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, IFNULL(?, "N/A"))', 
    [date, invoiceNumber, bank, name, actualAmount, detail, filename], (error, results, fields) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error saving form data');
        return;
      }
      console.log('Data inserted into yyaccruals:', req.body);

      // Update the settle column for the specified ID
      pool.query('UPDATE yyexpensesrecord SET settle = "yes" WHERE ID = ?', [id], function(error, results, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error updating data');
          return;
        }

        if (creditN && creditN > 0) {
          // Update the creditnote as used if it matches the exact amount and has not been used
          pool.query('UPDATE creditnote SET used = "yes", useddate = ? WHERE courier = ? AND amount = ? AND (used = "no" OR used is null OR used = "")', 
            [new Date().toISOString(), name, creditN], function(error, results, fields) {
              if (error) {
                console.error(error);
                res.status(500).send('Error updating creditnote data');
                return;
              }
              if (results.affectedRows > 0) {
                console.log('Credit note marked as used');
              } else {
                console.log('No matching credit note to update');
              }
              res.redirect('/yyaccruals');
          });
        } else {
          res.redirect('/yyaccruals');
        }
      });
    });
});


//for procurement buy
app.get('/procurementbuy', requireLogin, function(req, res) {
  // Query the database to retrieve all rows with summed quantity
  const sql = `
  SELECT buyinvoice, sku, productname, size, costprice, SUM(buyquantity) as quantity, DATE_FORMAT(buydate, "%Y-%m-%d") AS formattedDate, name
  FROM procurementdatabase
  GROUP BY sku, size, costprice, productname, buyinvoice, formattedDate, name
  ORDER BY buyinvoice DESC`;

  // Execute the SQL query
  pool.query(sql, (err, result) => {
    if (err) {
      console.error('Error fetching data from the database:', err);
      res.render('error'); // Render an error page or handle the error accordingly
    } else {
      const data = result; // Assuming the result contains the data from the database

      // Pass the data to the EJS template for rendering
      res.render('procurementbuy', { data: data });
    }
  });
});
app.get('/procurementbuyproduct-name', requireLogin, (req, res) => {
  const sku = req.query.sku;
  const query = `
    SELECT DISTINCT productname
    FROM procurementdatabase
    WHERE sku LIKE ? LIMIT 1
  `;
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;

    const productNames = new Set();

    results.forEach(result => {
      productNames.add(result.productname);
    });
    res.json({
      productNames: Array.from(productNames)
    });
  });
});
app.post('/procurementbuy', upload.single('file'), (req, res) => {
  const {
    field1, field2, field3, field4, field5, field7, 
    name, bank, bankname, bankacc, remarks, discount, buydate
  } = req.body;

  pool.query('SELECT MAX(buyinvoice) AS maxBuyInvoice FROM procurementdatabase', (err, result) => {
    if (err) {
      console.error('Error fetching maximum buyinvoice:', err);
      res.status(500).send('Error processing request');
      return;
    }

    const maxBuyInvoice = result[0].maxBuyInvoice;
    let invoiceCounter = maxBuyInvoice ? parseInt(maxBuyInvoice.replace('PO', ''), 10) + 1 : 1;
    const buyinvoice = `PO${invoiceCounter.toString().padStart(5, '0')}`;

    const insertData = [];
    field1.forEach((sku, i) => {
      const quantity = parseInt(field5[i]);
      for (let j = 0; j < quantity; j++) {
        insertData.push([
          sku,
          field2[i],
          field3[i],
          field7[i],
          buydate,
          buyinvoice,
          name,
          bank,
          bankname,
          bankacc,
          remarks,
          parseFloat(field4[i]),
          1 // Quantity is always 1 for each row
        ]);
      }
    });

    if (parseFloat(discount) > 0) {
      insertData.push([null, 'Discount', null, null, buydate, buyinvoice, name, bank, bankname, bankacc, remarks, -parseFloat(discount), 1]);
    }

    const sql = 'INSERT INTO procurementdatabase (sku, productname, size, gender, buydate, buyinvoice, name, bank, bankname, bankacc, buyremarks, costprice, buyquantity) VALUES ?';

    pool.query(sql, [insertData], (err, result) => {
      if (err) {
        console.error('Error inserting data:', err);
        res.status(500).send('Error processing request');
        return;
      }
      const sqlSelect = `
      SELECT buyinvoice, sku, productname, size, costprice, SUM(buyquantity) as quantity, DATE_FORMAT(buydate, "%Y-%m-%d") AS formattedDate, name
      FROM procurementdatabase
      GROUP BY sku, size, costprice, productname, buyinvoice, formattedDate, name
      ORDER BY buyinvoice DESC`;

      pool.query(sqlSelect, (err, selectResult) => {
        if (err) {
          console.error('Error fetching updated data from the database:', err);
          res.status(500).send('Error processing request');
          return;
        }
        res.render('procurementbuy', { successMessage: 'Form submitted successfully', data: selectResult, });
      });
    });
  });
});

app.get('/procurementbuy-payment', requireLogin, function(req, res) {
  const invoiceQuery = `
    SELECT DATE_FORMAT(p.buydate, "%Y-%m-%d") AS formattedbuyDate, p.buyinvoice, p.name, SUM(p.costprice) AS totalAmount, IFNULL(b.totalPaid, 0) AS totalPaid,
    CASE
      WHEN SUM(p.costprice) - IFNULL(b.totalPaid, 0) < 0 THEN 'Overpaid'
      WHEN SUM(p.costprice) - IFNULL(b.totalPaid, 0) > 0 THEN 'Need to Pay'
      ELSE ''
    END AS status
    FROM procurementdatabase AS p
    LEFT JOIN (
      SELECT buyinvoice, SUM(amount) AS totalPaid
      FROM procurementbuypaymentbreakdown
      GROUP BY buyinvoice
    ) AS b ON p.buyinvoice = b.buyinvoice
    GROUP BY p.buyinvoice, b.totalPaid, p.buydate, p.name
  `;

  const paymentBreakdownQuery = `
    SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate
    FROM procurementbuypaymentbreakdown
  `;

  pool.query(invoiceQuery, function(error, invoiceResults, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error retrieving invoice data');
      return;
    }

    pool.query(paymentBreakdownQuery, function(error, paymentBreakdownResults, fields) {
      if (error) {
        console.error(error);
        res.status(500).send('Error retrieving payment breakdown data');
        return;
      }

      const filteredInvoices = invoiceResults.filter((invoice) => {
        return invoice.status === 'Overpaid' || invoice.status === 'Need to Pay';
      });

      res.render('procurementbuy-payment', {
        invoiceData: filteredInvoices,
        paymentBreakdownData: paymentBreakdownResults
      });
    });
  });
});
app.post('/procurementbuy-payment', upload.single('file'), urlencodedParser, function(req, res) {
  const { date, invoice_no, name, amount, remarks, bankref } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO procurementbuypaymentbreakdown (date, buyinvoice, name, amount, remarks, file, bankrefs) VALUES (?, ?, ?, ?, ?, ifnull(?, "N/A"), ?)', [date, invoice_no, name, amount, remarks, filename, bankref], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      // Retrieve data from MySQL
      pool.query('SELECT *,  DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate FROM procurementbuypaymentbreakdown', function(error, selectResults, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error retrieving data');
        } else {
          console.log(req.body);
          res.render('procurementbuy-payment', { successMessage: 'Form submitted successfully', data: selectResults });
        }
      });
    }
  });
});
app.get('/procurementBuypayment_search', requireLogin, function(req, res) {
  const invoiceNumber = req.query.invoice_number;

  const invoiceQuery = `
    SELECT p.name, p.buyinvoice, SUM(p.costprice) AS totalAmount, IFNULL(b.totalPaid, 0) AS totalPaid,
    CASE
      WHEN SUM(p.costprice) - IFNULL(b.totalPaid, 0) < 0 THEN 'Overpaid'
      WHEN SUM(p.costprice) - IFNULL(b.totalPaid, 0) > 0 THEN 'Need to Pay'
      ELSE ''
    END AS status
    FROM procurementdatabase AS p
    LEFT JOIN (
      SELECT buyinvoice, SUM(amount) AS totalPaid
      FROM procurementbuypaymentbreakdown
      GROUP BY buyinvoice
    ) AS b ON p.buyinvoice = b.buyinvoice
    WHERE p.buyinvoice = ?
    GROUP BY p.buyinvoice, b.totalPaid, p.name
  `;

  const paymentBreakdownQuery = `
    SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate
    FROM procurementbuypaymentbreakdown
    WHERE buyinvoice = ?
  `;

  pool.query(invoiceQuery, [invoiceNumber], function(error, invoiceResults, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error retrieving invoice data');
      return;
    }

    pool.query(paymentBreakdownQuery, [invoiceNumber], function(error, paymentBreakdownResults, fields) {
      if (error) {
        console.error(error);
        res.status(500).send('Error retrieving payment breakdown data');
        return;
      }

      // Fetch the discount data
      const discountQuery = `
        SELECT SUM(costprice) AS totalDiscount
        FROM procurementdatabase
        WHERE buyinvoice = ?
          AND productname = 'Discount'
      `;
    

      pool.query(discountQuery, [invoiceNumber], function(error, discountResult, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error retrieving discount data');
          return;
        }

        const totalAmount = (invoiceResults.length > 0 ? invoiceResults[0].totalAmount : 0) + (discountResult.length > 0 ? discountResult[0].totalDiscount : 0);
        const totalPaid = invoiceResults.length > 0 ? invoiceResults[0].totalPaid : 0;
        const totalDiscount = discountResult.length > 0 ? discountResult[0].totalDiscount : 0;
        const balance = totalAmount - totalPaid;

        res.render('procurementbuypayment-details', {
          invoiceNumber: invoiceNumber,
          buyrecordResults: invoiceResults,
          paymentBreakdownData: paymentBreakdownResults,
          totalAmount: totalAmount,
          totalPaid: totalPaid,
          totalDiscount: totalDiscount,
          balance: balance
        });
      });
    });
  });
});
app.get('/procurementbuy-generate', requireLogin, function(req, res) {
  pool.query(`
  SELECT buyinvoice, name, sku, productname, DATE_FORMAT(buydate, "%d/%m/%Y") AS formattedDate, SUM(buyquantity) AS totalQuantity, SUM(costprice) AS totalAmount
  FROM procurementdatabase
  WHERE sku IS NOT NULL AND sku != ""
  GROUP BY buyinvoice, name, buydate, sku, productname
  ORDER BY buyinvoice DESC`, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const invoiceData = results;
      res.render('procurementbuy-generate', { invoiceData });
    }
  });
});
app.get('/procurementbuygenerate', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const buyRecordQuery = `SELECT * FROM procurementdatabase WHERE buyinvoice = '${invoiceNumber}'`;
  pool.query(buyRecordQuery, (error, buyRecordResults) => {
    if (error) throw error;

    if (!buyRecordResults.length) {
      // Render the procurementbuy_template view with no buyRecordResults
      res.render('procurementbuy_template', {
        buyRecordResults: null,
        invoiceNumber: invoiceNumber
      });
    } else {
      // Query the items_buy table with grouping by ProductName, SizeUS, and UnitPrice
      const itemsBuyQuery = `SELECT sku, productname, size, costprice, SUM(buyquantity) AS TotalQuantity
        FROM procurementdatabase
        WHERE buyinvoice = '${invoiceNumber}' AND sku IS NOT NULL AND sku != "" AND name != "return"
        GROUP BY sku, productname, size, costprice`;

      pool.query(itemsBuyQuery, (error, itemsBuyResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemsBuyResults.length; i++) {
          totalAmount += itemsBuyResults[i].costprice * itemsBuyResults[i].TotalQuantity;
        }

        // Query the purchase_paymentbreakdown table
        const purchasePaymentQuery = `SELECT * FROM procurementbuypaymentbreakdown WHERE buyinvoice = '${invoiceNumber}'`;
        pool.query(purchasePaymentQuery, (error, purchasePaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < purchasePaymentResults.length; i++) {
            totalAmountPaid += parseFloat(purchasePaymentResults[i].amount);
          }

          const discountQuery = `SELECT SUM(costprice) AS DiscountAmount FROM procurementdatabase WHERE buyinvoice = '${invoiceNumber}' AND productname = 'Discount'`;
          pool.query(discountQuery, (error, discountResult) => {
            if (error) throw error;

            const discountAmount = discountResult[0].DiscountAmount || 0;
            const totalAmounts = totalAmount + discountAmount; // Deduct the discount amount from the total

            // Calculate the balance
            const balance = totalAmounts - totalAmountPaid;
            const discountApplied = itemsBuyResults.length >= 5;

            res.render('procurementbuy_template', {
              discountResult: discountResult,
              invoiceNumber: invoiceNumber,
              buyRecordResults: buyRecordResults,
              itemsBuyResults: itemsBuyResults,
              totalAmounts: totalAmounts,
              totalAmount: totalAmount,
              transactions: purchasePaymentResults,
              balance: balance,
              totalpaid: totalAmountPaid,
              discountApplied: discountApplied,
              discountAmount: discountAmount,
            });
          });
        });
      });
    }
  });
});


app.get('/procurementsales', requireLogin, function(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  // Query for fetching sales data
  let query = `
    SELECT salesinvoice, sku, size, productname, gender, runnerfee, shippingfee, tracknum, sellprice, DATE_FORMAT(salesdate, "%Y-%m-%d") AS formattedDate
    FROM procurementdatabase
    WHERE salesinvoice != '' AND sku IS NOT NULL AND sku <> ''
  `;

  if (startDate && endDate) {
    query += ` AND salesdate BETWEEN '${startDate}' AND '${endDate}'`;
  }

  query += `
    GROUP BY salesinvoice, sku, size, sellprice, productname, gender, salesdate, shippingfee, tracknum, runnerfee
    ORDER BY salesinvoice DESC, CAST(size AS DECIMAL(10,2)) ASC
  `;

  // Query for fetching buyers
  const queryBuyers = 'SELECT * FROM buyerlist';

  // First, fetch buyers
  pool.query(queryBuyers, (err, buyers) => {
      if (err) {
          console.error('Error fetching buyers:', err);
          return res.status(500).send('Error fetching buyers');
      }

      // Then, fetch sales data
      pool.query(query, function(error, salesData) {
        if (error) {
          console.error(error);
          return res.status(500).send('Error fetching sales data');
        }

        // Render the EJS template with both sales data and buyers
        res.render('procurementsales', { salesData, buyers });
      });
  });
});
app.post('/addbuyer', urlencodedParser, (req, res) => {
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country } = req.body;
  console.log(req.body)

  const query = `INSERT INTO buyerlist (name, phone, adr1, adr2, adr3, postcode, city, state, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  // Assuming 'pool' is your MySQL connection pool
  pool.query(query, [name, phone, adr1, adr2, adr3, postcode, city, state, country], (error, results) => {
      if (error) {
          console.error('Error adding buyer to database:', error);
          return res.status(500).send('Error adding buyer to database');
      }
      res.redirect('/procurementsales');
  });
});
app.get('/fetch-items', requireLogin, (req, res) => {
  // Split the buyinvoice input into an array and trim whitespace
  const buyInvoices = req.query.buyinvoices.split(',').map(invoice => invoice.trim());

  // Construct the query with placeholders for parameterized query
  const placeholders = buyInvoices.map(() => '?').join(',');
  const query = `
    SELECT buyinvoice, sku, productname, size, costprice, SUM(buyquantity) AS total_quantity
    FROM procurementdatabase
    WHERE sellto is null AND buyinvoice IN (${placeholders})
    GROUP BY buyinvoice, sku, size, costprice, productname
    ORDER BY buyinvoice, sku, size, costprice, productname;
  `;

  // Execute the query with buyInvoices array as parameters
  pool.query(query, buyInvoices, (error, results) => {
    if (error) {
      console.error('Error fetching aggregated items:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(results);
  });
});
function queryAsync(query, params) {
  return new Promise((resolve, reject) => {
      pool.query(query, params, (error, results) => {
          if (error) reject(error);
          else resolve(results);
      });
  });
}
async function generateNewSalesInvoiceNumber() {
  const results = await queryAsync('SELECT salesinvoice FROM procurementdatabase ORDER BY salesinvoice DESC LIMIT 1', []);
  const lastInvoice = results[0]?.salesinvoice || '#000000';
  const invoiceNumber = parseInt(lastInvoice.slice(1)) + 1;
  return `#${invoiceNumber.toString().padStart(6, '0')}`;
}
app.post('/procurementsales', upload.single('file'), async (req, res) => {
  const { buyerid, shippingfee, runnerfee, remarks, boxNames, boxItems, salesdate } = req.body;

  try {
      const buyerResults = await queryAsync('SELECT * FROM buyerlist WHERE id = ?', [buyerid]);
      if (buyerResults.length === 0) {
          return res.status(404).send('Buyer not found');
      }
      const buyerInfo = buyerResults[0];
      const invoiceNumber = await generateNewSalesInvoiceNumber();

      for (const [boxId, items] of Object.entries(boxItems)) {
          const boxName = boxNames[boxId];

          for (let i = 0; i < items.sku.length; i++) {
              const itemDetails = extractItemDetails(items, i);
              const totalQuantityInt = parseInt(itemDetails.total_quantity, 10);
              const shippingFee = parseFloat(shippingfee);
              const runnerFee = parseFloat(runnerfee);

              const updateRowIds = await queryAsync(`
                  SELECT id FROM procurementdatabase 
                  WHERE buyinvoice = ? AND productname = ? AND sku = ? AND size = ? AND costprice = ?
                  ORDER BY id ASC 
                  LIMIT ?
              `, [itemDetails.buyinvoice, itemDetails.productname, itemDetails.sku, itemDetails.size, itemDetails.costprice, totalQuantityInt]);

              const idsToUpdate = updateRowIds.map(row => row.id);

              if(idsToUpdate.length > 0) {
                  await queryAsync(`
                      UPDATE procurementdatabase 
                      SET sellto = ?, phone = ?, adres1 = ?, adres2 = ?, adres3 = ?, postcode = ?, city = ?, state = ?, country = ?, shippingfee = ?, runnerfee = ?, tracknum = ?, salesremarks = ?, salesinvoice = ?, salesdate = ?, sellprice = ?
                      WHERE id IN (?)
                  `, [
                      buyerInfo.name, buyerInfo.phone, buyerInfo.adr1, buyerInfo.adr2, buyerInfo.adr3, buyerInfo.postcode, buyerInfo.city, buyerInfo.state, buyerInfo.country, shippingFee, runnerFee, boxName, remarks, invoiceNumber, salesdate, itemDetails.costprice, idsToUpdate
                  ]);
              }
          }
      }

      // After updates, fetch and render the updated sales data.
      const updatedData = await queryAsync(`
          SELECT salesinvoice, sku, productname, size, sellprice, SUM(buyquantity) as quantity
          FROM procurementdatabase
          WHERE salesinvoice = ?
          GROUP BY sku, size, costprice, productname, salesinvoice, sellprice
          ORDER BY salesinvoice DESC
      `, [invoiceNumber]);

      res.render('procurementsales-payment', {
          successMessage: 'Form submitted successfully',
          salesdata: updatedData
      });
  } catch (error) {
      console.error('Error processing sales invoice:', error);
      res.status(500).send('Error processing sales invoice');
  }
});
function extractItemDetails(items, index) {
  return {
      buyinvoice: items.buyInvoice?.[index] || '', // Using optional chaining and providing default value
      productname: items.productname?.[index] || '',
      sku: items.sku?.[index] || '',
      size: items.size?.[index] || '',
      costprice: items.costprice?.[index] || '',
      total_quantity: items.quantities?.[index] || ''
  };
}
app.get('/procurementsales-payment', requireLogin, function(req, res) {
  const invoiceQuery = `
    SELECT 
    DATE_FORMAT(p.salesdate, "%Y-%m-%d") AS formattedbuyDate, 
    p.salesinvoice,
    SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) AS totalAmount, 
    IFNULL(b.totalPaid, 0) AS totalPaid, 
    p.sellto, 
    CASE
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) < 0 THEN 'Overpaid'
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) > 0 THEN 'Need to Pay'
        ELSE 'Settled'
    END AS status
  FROM 
    procurementdatabase AS p
  LEFT JOIN (
    SELECT 
        salesinvoice, 
        SUM(amount) AS totalPaid
    FROM 
        procurementsellpaymentbreakdown
    GROUP BY 
        salesinvoice
  ) AS b ON p.salesinvoice = b.salesinvoice
  LEFT JOIN (
    SELECT 
        salesinvoice, 
        MAX(runnerfee) AS runnerfee, -- Assuming runnerfee and shippingfee are the same for all rows of the same salesinvoice
        MAX(shippingfee) AS shippingfee
    FROM 
        procurementdatabase
    GROUP BY 
        salesinvoice
  ) AS fees ON p.salesinvoice = fees.salesinvoice
  GROUP BY 
    p.salesinvoice, 
    b.totalPaid, 
    p.salesdate, 
    p.sellto, 
    fees.runnerfee, 
    fees.shippingfee
  `;

  const paymentBreakdownQuery = `
    SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate
    FROM procurementsellpaymentbreakdown
  `;

  pool.query(invoiceQuery, function(error, invoiceResults, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error retrieving invoice data');
      return;
    }

    pool.query(paymentBreakdownQuery, function(error, paymentBreakdownResults, fields) {
      if (error) {
        console.error(error);
        res.status(500).send('Error retrieving payment breakdown data');
        return;
      }

      const filteredInvoices = invoiceResults.filter((invoice) => {
        return invoice.status === 'Overpaid' || invoice.status === 'Need to Pay';
      });

      res.render('procurementsales-payment', {
        invoiceData: filteredInvoices,
        paymentBreakdownData: paymentBreakdownResults
      });
    });
  });
});
app.post('/procurementsales-payment', upload.single('file'), urlencodedParser, function(req, res) {

  const invoiceQuery = `
    SELECT 
    DATE_FORMAT(p.salesdate, "%Y-%m-%d") AS formattedbuyDate, 
    p.salesinvoice,
    SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) AS totalAmount, 
    IFNULL(b.totalPaid, 0) AS totalPaid, 
    p.sellto, 
    CASE
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) < 0 THEN 'Overpaid'
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) > 0 THEN 'Need to Pay'
        ELSE 'Settled'
    END AS status
  FROM 
    procurementdatabase AS p
  LEFT JOIN (
    SELECT 
        salesinvoice, 
        SUM(amount) AS totalPaid
    FROM 
        procurementsellpaymentbreakdown
    GROUP BY 
        salesinvoice
  ) AS b ON p.salesinvoice = b.salesinvoice
  LEFT JOIN (
    SELECT 
        salesinvoice, 
        MAX(runnerfee) AS runnerfee, -- Assuming runnerfee and shippingfee are the same for all rows of the same salesinvoice
        MAX(shippingfee) AS shippingfee
    FROM 
        procurementdatabase
    GROUP BY 
        salesinvoice
  ) AS fees ON p.salesinvoice = fees.salesinvoice
  GROUP BY 
    p.salesinvoice, 
    b.totalPaid, 
    p.salesdate, 
    p.sellto, 
    p.sellprice, 
    fees.runnerfee, 
    fees.shippingfee
  `;

  const paymentBreakdownQuery = `
    SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate
    FROM procurementsellpaymentbreakdown
  `;
  
  const { date, invoice_no, name, amount, remarks, bankref } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into the procurementsellpaymentbreakdown table
  pool.query('INSERT INTO procurementsellpaymentbreakdown (date, salesinvoice, name, amount, remarks, file, bankrefs) VALUES (?, ?, ?, ?, ?, ?, ?)', [date, invoice_no, name, amount, remarks, filename, bankref], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
      return;
    }

    // After inserting data, retrieve updated invoice and payment breakdown data
    // First, execute the invoiceQuery
    pool.query(invoiceQuery, function(error, invoiceResults, fields) {
      if (error) {
        console.error(error);
        res.status(500).send('Error retrieving invoice data');
        return;
      }

      // Then, execute the paymentBreakdownQuery
      pool.query(paymentBreakdownQuery, function(error, paymentBreakdownResults, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error retrieving payment breakdown data');
          return;
        }

        // Filter invoices to include only 'Overpaid' or 'Need to Pay'
        const filteredInvoices = invoiceResults.filter((invoice) => {
          return invoice.status === 'Overpaid' || invoice.status === 'Need to Pay';
        });

        // Render the page with updated data
        res.render('procurementsales-payment', {
          successMessage: 'Form submitted successfully',
          invoiceData: filteredInvoices,
          paymentBreakdownData: paymentBreakdownResults
        });
      });
    });
  });
});
app.get('/procurementSalespayment_search', requireLogin, function(req, res) {
  const invoiceNumber = req.query.invoice_number;

  const invoiceQuery = `
    SELECT 
    DATE_FORMAT(p.salesdate, "%Y-%m-%d") AS formattedbuyDate, 
    p.salesinvoice,
    SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) AS totalAmount, 
    IFNULL(b.totalPaid, 0) AS totalPaid, 
    p.sellto, 
    p.salesremarks,
    CASE
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) < 0 THEN 'Overpaid'
        WHEN SUM(p.sellprice) + IFNULL(fees.runnerfee, 0) + IFNULL(fees.shippingfee, 0) - IFNULL(b.totalPaid, 0) > 0 THEN 'Need to Pay'
        ELSE 'Settled'
    END AS status
    FROM 
    procurementdatabase AS p
    LEFT JOIN (
        SELECT 
            salesinvoice, 
            SUM(amount) AS totalPaid
        FROM 
            procurementsellpaymentbreakdown
        GROUP BY 
            salesinvoice
    ) AS b ON p.salesinvoice = b.salesinvoice
    LEFT JOIN (
        SELECT 
            salesinvoice, 
            MAX(runnerfee) AS runnerfee, 
            MAX(shippingfee) AS shippingfee
        FROM 
            procurementdatabase
        GROUP BY 
            salesinvoice
    ) AS fees ON p.salesinvoice = fees.salesinvoice
    WHERE p.salesinvoice = ? -- Correct placement of WHERE clause
    GROUP BY 
    p.salesinvoice, 
    b.totalPaid, 
    p.salesdate, 
    p.sellto, 
    p.salesremarks,
    fees.runnerfee, 
    fees.shippingfee
  `;

  const paymentBreakdownQuery = `
    SELECT *, DATE_FORMAT(date, "%Y-%m-%d") AS formattedDate
    FROM procurementsellpaymentbreakdown
    WHERE salesinvoice = ?
  `;

  pool.query(invoiceQuery, [invoiceNumber], function(error, invoiceResults, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error retrieving invoice data');
      return;
    }

    pool.query(paymentBreakdownQuery, [invoiceNumber], function(error, paymentBreakdownResults, fields) {
      if (error) {
        console.error(error);
        res.status(500).send('Error retrieving payment breakdown data');
        return;
      }
  
      const totalAmount = (invoiceResults.length > 0 ? invoiceResults[0].totalAmount : 0);
      const totalPaid = invoiceResults.length > 0 ? invoiceResults[0].totalPaid : 0;
      const balance = totalAmount - totalPaid;

      res.render('procurementsalespayment-details', {
        invoiceNumber: invoiceNumber,
        sellrecordResults: invoiceResults,
        paymentBreakdownData: paymentBreakdownResults,
        totalAmount: totalAmount,
        totalPaid: totalPaid,
        balance: balance
      });
    });
  });
});
app.get('/procurementrefund', requireLogin, function(req, res) {
  const fromSupQuery = 'SELECT * FROM procurementrefund WHERE fromSupplier = ? ORDER BY date DESC';
  const refund2BuyerQuery = 'SELECT * FROM procurementrefund WHERE refund2buyer = ? ORDER BY date DESC';
  
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
      res.render('procurementrefund', { data });
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error fetching data');
    });
});
app.post('/prorefund2buyer', (req, res) => {
  const { salesinvoice, amount, remarks, date, field1, field2, field3, field4, field5 } = req.body;
  console.log(req.body);
  console.log('Field 1:', field1);
  console.log('Field 2:', field2);
  console.log('Field 3:', field3);
  console.log('Field 4:', field4);
  console.log('Field 5:', field5);

  // Define the database queries
  const fromSupQuery = 'SELECT * FROM procurementrefund WHERE fromSupplier = ? ORDER BY date DESC';
  const refund2BuyerQuery = 'SELECT * FROM procurementrefund WHERE refund2buyer = ? ORDER BY date DESC';
  
  const queries = [
    { query: fromSupQuery, params: ['yes'], label: 'fromSupData' },
    { query: refund2BuyerQuery, params: ['yes'], label: 'refund2BuyerData' }
  ];

  const promises = queries.map(q => new Promise((resolve, reject) => {
    // Execute each query
    pool.query(q.query, q.params, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve({ label: q.label, data: results });
      }
    });
  }));

  // Execute all queries in parallel
  Promise.all(promises)
    .then(results => {
      // Insert the form data into MySQL
      pool.query('INSERT INTO procurementrefund (invoice, amount, remarks, refund2buyer, date) VALUES (?, ?, ?, "yes", ?)', [salesinvoice, amount, remarks, date], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          // Iterate over the arrays to update procurementdatabase
          for (let i = 0; i < field1.length; i++) {
            const sku = field1[i];
            const productname = field2[i];
            const size = field3[i];
            const sellprice = field5[i];
            
            // Update procurementdatabase
            pool.query('UPDATE procurementdatabase SET ship = "refund" WHERE sku = ? AND productname = ? AND size = ? AND sellprice = ?', [sku, productname, size, sellprice], (error, results, fields) => {
              if (error) {
                console.error(error);
                res.status(500).send('Error updating procurementdatabase');
              }
            });
          }
          
          // Redirect to procurementrefund page after updating
          res.redirect('/procurementrefund');
        }
      });
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error fetching data');
    });
});
app.post('/prorefund', (req, res) => {
  const { buyinvoice, amount, remarks, date, field1, field2, field3, field4, field5 } = req.body;
  console.log(req.body);

  // Define the database queries
  const fromSupQuery = 'SELECT * FROM procurementrefund WHERE fromSupplier = ? ORDER BY date DESC';
  const refund2BuyerQuery = 'SELECT * FROM procurementrefund WHERE refund2buyer = ? ORDER BY date DESC';
  
  const queries = [
    { query: fromSupQuery, params: ['yes'], label: 'fromSupData' },
    { query: refund2BuyerQuery, params: ['yes'], label: 'refund2BuyerData' }
  ];

  const promises = queries.map(q => new Promise((resolve, reject) => {
    // Execute each query
    pool.query(q.query, q.params, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve({ label: q.label, data: results });
      }
    });
  }));

  // Execute all queries in parallel
  Promise.all(promises)
    .then(results => {
      // Insert the form data into MySQL
      pool.query('INSERT INTO procurementrefund (invoice, amount, remarks, refund2buyer, fromSupplier, date) VALUES (?, ?, ?, NULL, "yes", ?)', [buyinvoice, amount, remarks, date], (error, results, fields) => {
        if (error) {
          console.error(error);
          res.status(500).send('Error saving form data');
        } else {
          // Update procurementdatabase
          for (let i = 0; i < field1.length; i++) {
            const sku = field1[i];
            const productname = field2[i];
            const size = field3[i];
            const quantity = field4[i];
            const costprice = field5[i];
            
            // Update procurementdatabase for rows matching SKU, product name, size, and quantity
            pool.query('UPDATE procurementdatabase SET name = "return" WHERE sku = ? AND productname = ? AND size = ? AND ship IS NULL AND costprice = ? LIMIT ?', [sku, productname, size, costprice, parseInt(quantity, 10)], (error, results, fields) => {
              if (error) {
                console.error(error);
                res.status(500).send('Error updating procurementdatabase');
              }
            });
          }
          
          // Redirect to the procurementrefund page after successful form submission
          res.redirect('/procurementrefund');
        }
      });
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error fetching data');
    });
});
app.get('/proreturned', requireLogin, function(req, res){
  pool.query(`
    SELECT SUM(buyquantity) AS totalQuantity, buyinvoice, size, sku, costprice, name, productname
    FROM procurementdatabase
    WHERE name = "return"
    GROUP BY sku, size, costprice, buyinvoice, name, productname
    ORDER BY buyinvoice DESC
  `, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      // Add the formattedDate field to each row of data
      const data = results.map(row => ({ ...row }));
      res.render('proreturned', { data });
    }
  });
});
app.get('/fetch-sales-invoice-data', requireLogin, (req, res) => {
  const { salesinvoice } = req.query;
  pool.query('SELECT sku, productname, size, buyquantity, sellprice FROM procurementdatabase WHERE salesinvoice = ?', [salesinvoice], (error, results) => {
      if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Internal Server Error' });
      }
      res.json(results);
  });
});
app.get('/fetch-purchase-invoice-data', requireLogin, (req, res) => {
  const { buyinvoice } = req.query;
  const query = `
    SELECT sku, productname, size, costprice, COUNT(*) AS quantity
    FROM procurementdatabase
    WHERE buyinvoice = ?
    GROUP BY sku, productname, size, costprice
  `;
  pool.query(query, [buyinvoice], (error, results) => {
      if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Internal Server Error' });
      }
      res.json(results);
  });
});
app.get('/procurementsale-generate', requireLogin, function(req, res) {
  pool.query(`
  SELECT salesinvoice, sellto, sku, productname, DATE_FORMAT(salesdate, "%d/%m/%Y") AS formattedDate, SUM(buyquantity) AS totalQuantity, SUM(sellprice) AS totalAmount
  FROM procurementdatabase
  WHERE sku IS NOT NULL AND sku != "" AND salesinvoice != ""
  GROUP BY salesinvoice, sellto, salesdate, sku, productname
  ORDER BY salesinvoice DESC`, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const invoiceData = results;
      res.render('procurementsale-generate', { invoiceData });
    }
  });
});
app.get('/procurementsalegenerate', requireLogin, (req, res) => {
  const invoiceNumber = req.query.invoice_number;

  // Query the buy_record table
  const saleRecordQuery = `SELECT * FROM procurementdatabase WHERE salesinvoice = '${invoiceNumber}'`;
  pool.query(saleRecordQuery, (error, saleRecordResults) => {
    if (error) throw error;

    if (!saleRecordResults.length) {
      // Render the procurementbuy_template view with no buyRecordResults
      res.render('procurementsale_template', {
        saleRecordResults: null,
        invoiceNumber: invoiceNumber
      });
    } else {
      // Query the items_buy table with grouping by ProductName, SizeUS, and UnitPrice
      const itemsSaleQuery = `SELECT sku, productname, size, sellprice, SUM(buyquantity) AS TotalQuantity
        FROM procurementdatabase
        WHERE salesinvoice = '${invoiceNumber}' AND sku IS NOT NULL AND sku != ""
        GROUP BY sku, productname, size, sellprice`;

      pool.query(itemsSaleQuery, (error, itemSaleResults) => {
        if (error) throw error;

        // Calculate the total amount
        let totalAmount = 0;
        for (let i = 0; i < itemSaleResults.length; i++) {
          totalAmount += itemSaleResults[i].sellprice * itemSaleResults[i].TotalQuantity;
        }

        // Query the purchase_paymentbreakdown table
        const salesPaymentQuery = `SELECT * FROM procurementsellpaymentbreakdown WHERE salesinvoice = '${invoiceNumber}'`;
        pool.query(salesPaymentQuery, (error, salesPaymentResults) => {
          if (error) throw error;

          // Calculate the total amount paid
          let totalAmountPaid = 0;
          for (let i = 0; i < salesPaymentResults.length; i++) {
            totalAmountPaid += parseFloat(salesPaymentResults[i].amount);
          }

          let shippingfee = saleRecordResults[0].shippingfee;
          let runnerfee = saleRecordResults[0].runnerfee;

            let totalAmounts = totalAmount + (saleRecordResults[0].runnerfee || 0) + (saleRecordResults[0].shippingfee || 0);

            // Calculate the balance
            const balance = totalAmounts - totalAmountPaid;

            res.render('procurementsale_template', {
              invoiceNumber: invoiceNumber,
              saleRecordResults: saleRecordResults,
              itemsSaleResults: itemSaleResults,
              totalAmount: totalAmount,
              transactions: salesPaymentResults,
              balance: balance,
              totalpaid: totalAmountPaid,
              totalAmounts: totalAmounts,
              shippingfee: shippingfee,
              runnerfee: runnerfee
          });
        });
      });
    }
  });
});
app.get('/procurementdataExport', requireLogin, function(req, res) {
  // SQL query to select data from procurementdatabase
  const sql = `SELECT * FROM procurementdatabase ORDER BY id`;

  pool.query(sql, function(error, results) {
    if (error) {
      console.error('Error executing query:', error);
      return res.status(500).send('Internal Server Error');
    }

    const csvData = results.map(row => ({
      id: row.id,
      sku: row.sku,
      productname: row.productname,
      size: row.size,
      gender: row.gender,
      buydate: row.buydate ? moment(row.buydate).format('YYYY-MM-DD') : null,
      buyinvoice: row.buyinvoice,
      name: row.name,
      bank: row.bank,
      bankname: row.bankname,
      bankacc: row.bankacc,
      buyremarks: row.buyremarks,
      costprice: row.costprice,
      buyquantity: row.buyquantity,
      salesdate: row.salesdate ? moment(row.salesdate).format('YYYY-MM-DD') : null,
      salesinvoice: row.salesinvoice,
      sellto: row.sellto,
      phone: row.phone,
      adres1: row.adres1,
      adres2: row.adres2,
      adres3: row.adres3,
      postcode: row.postcode,
      city: row.city,
      state: row.state,
      country: row.country,
      salesremarks: row.salesremarks,
      sellprice: row.sellprice,
      ship: row.ship,
      runnerfee: row.runnerfee,
      shippingfee: row.shippingfee,
      tracknum: row.tracknum
    }));

    // Generate a timestamp for the file name
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const fileName = `procurementdata_${timestamp}.csv`;

    // Stream the CSV data to the HTTP response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fastCsv.write(csvData, { headers: true }).pipe(res);
  });
});
app.post('/procurementdataImport', upload.single('file'), function (req, res) {
  const { path: csvFilePath } = req.file;

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {

      Object.keys(data).forEach(key => {
        data[key] = data[key] === '' ? null : data[key];
      });
      // Assuming data contains all fields required by procurementdatabase
      const { id, sku, productname, size, gender, buydate, buyinvoice, name, bank, bankname, bankacc, buyremarks, costprice, buyquantity, salesdate, salesinvoice, sellto, phone, adres1, adres2, adres3, postcode, city, state, country, salesremarks, sellprice, ship, runnerfee, shippingfee, tracknum } = data;

      // Convert numerical strings to appropriate types, e.g., costprice to float
      const parsedCostPrice = parseFloat(costprice.replace(/[^0-9.-]+/g,""));

      // Insert into procurementdatabase table
      pool.query('INSERT INTO procurementdatabase (id, sku, productname, size, gender, buydate, buyinvoice, name, bank, bankname, bankacc, buyremarks, costprice, buyquantity, salesdate, salesinvoice, sellto, phone, adres1, adres2, adres3, postcode, city, state, country, salesremarks, sellprice, ship, runnerfee, shippingfee, tracknum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, sku, productname, size, gender, buydate, buyinvoice, name, bank, bankname, bankacc, buyremarks, parsedCostPrice, buyquantity, salesdate, salesinvoice, sellto, phone, adres1, adres2, adres3, postcode, city, state, country, salesremarks, sellprice, ship, runnerfee, shippingfee, tracknum], 
        (error, results, fields) => {
          if (error) {
            console.error(error);
          } else {
            console.log(`Data successfully inserted for buyinvoice ${buyinvoice}`);
          }
        });
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      res.send('Data imported successfully');
    });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (!res.headersSent) {
    res.status(500);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send('Something broke!');
  } else {
    console.log("An error occurred, but the response was already sent.");
  }
});
//----------------------Ending--------------------------------------------------------------------------------
app.get('/profile/:name', requireLogin, function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(2000, '0.0.0.0', () => {
  console.log('Server running on port 2000');
});