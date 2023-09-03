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
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});


// Set up body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

//change password here
app.post('/login', urlencodedParser, async (req, res) => {
  const { username, password } = req.body;

  // You can replace this with a database query to fetch the user's details
  const user = {
    username: ' ',
    password: await bcrypt.hash(' ', 10)
  };

  if (username === user.username && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid username or password' });
  }
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
app.get('/bankledger', requireLogin, (req, res) => {
  pool.query('SELECT * FROM yysales_paymentbreakdown', (error, salesResults) => {
    if (error) {
      console.error(error);
      res.status(500).send('An error occurred');
    } else {
      const totalSalesPaymentbreakdown = salesResults;

      pool.query('SELECT * FROM yypurchase_paymentbreakdown', (error, purchaseResults) => {
        if (error) {
          console.error(error);
          res.status(500).send('An error occurred');
        } else {
          const totalPurchasePaymentbreakdown = purchaseResults;

          pool.query('SELECT * FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL AND Name != "Gdex"', (error, expensesResults) => {
            if (error) {
              console.error(error);
              res.status(500).send('An error occurred');
            } else {
              const totalExpenses = expensesResults;
    
              pool.query('SELECT * FROM yyaccruals', (error, accrualsResults) => {
                if (error) {
                  console.error(error);
                  res.status(500).send('An error occurred');
                } else {
                  const totalExpensesPaymentbreakdown = accrualsResults;
        
                  pool.query('SELECT * FROM yytopupbalance WHERE wallet = "Gdex" ORDER BY ID DESC', (error, TopupResults) => {
                    if (error) {
                      console.error(error);
                      res.status(500).send('An error occurred');
                    } else {
                      const topupBalance = TopupResults;
            
                      pool.query('SELECT amount, refund2buyer, fromSupplier, date FROM refund', (error, refundResults) => {
                        if (error) {
                          console.error(error);
                          res.status(500).send('An error occurred');
                        } else {
                          const refund = refundResults;

                          pool.query('SELECT * FROM yycompanyfund2personal', (error, drawingResults) => {
                            if (error) {
                              console.error(error);
                              res.status(500).send('An error occurred');
                            } else {
                              const totalDrawing = drawingResults;
                    
                              pool.query('SELECT * FROM yydeposit', (error, depositResults) => {
                                if (error) {
                                  console.error(error);
                                  res.status(500).send('An error occurred');
                                } else {
                                  const totalDeposit = depositResults;

                                  pool.query('SELECT * FROM yyothercreditor', (error, creditorResults) => {
                                    if (error) {
                                      console.error(error);
                                      res.status(500).send('An error occurred');
                                    } else {
                                      const totalCreditor = creditorResults;
                        
                                    pool.query('SELECT * FROM yyequity', (error, capitalResults) => {
                                      if (error) {
                                        console.error(error);
                                        res.status(500).send('An error occurred');
                                      } else {
                                        const totalCapital = capitalResults;

                                        pool.query('SELECT * FROM yyothercreditor_paymentbreakdown', (error, capitalpayResults) => {
                                          if (error) {
                                            console.error(error);
                                            res.status(500).send('An error occurred');
                                          } else {
                                            const totalCreditorpaymentbreak = capitalpayResults;

                                            pool.query('SELECT * FROM yyotherdebtor', (error, debtorResults) => {
                                              if (error) {
                                                console.error(error);
                                                res.status(500).send('An error occurred');
                                              } else {
                                                const totalDebtor = debtorResults;

                                                pool.query('SELECT * FROM yyotherdebtor_paymentbreakdown', (error, debtorpayResults) => {
                                                  if (error) {
                                                    console.error(error);
                                                    res.status(500).send('An error occurred');
                                                  } else {
                                                    const totalDebtorpaymentbreak = debtorpayResults;
                              
                                                    res.render('bankledger', { 
                                                      totalDebtorpaymentbreak,
                                                      totalDebtor,
                                                      totalCreditorpaymentbreak,
                                                      totalSalesPaymentbreakdown, 
                                                      totalPurchasePaymentbreakdown,
                                                      totalExpenses ,
                                                      totalExpensesPaymentbreakdown,
                                                      topupBalance,
                                                      refund,
                                                      totalDrawing,
                                                      totalDeposit,
                                                      totalCapital,
                                                      totalCreditor
                                                    });
                                                  }
                                                });
                                              }
                                            });
                                          }
                                        });
                                      }
                                    });
                                  }
                                });
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
});
app.get('/profitlossstate', requireLogin, (req, res) => {
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
                      pool.query('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE Category != "Postage & Courier" AND Category != "Office Equipment" AND YEAR(Date) = ? GROUP BY Category', [selectedYear], (err, results) => {
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

                                                                    pool.query('SELECT courier, SUM(amount) AS total_sales FROM creditnote WHERE YEAR(`date`) = ? GROUP BY courier', [selectedYear], (err, results) => {
                                                                      if (err) throw err;
                                                                      const creditNoteTotals = results;

                                                                      // render the EJS template with the fetched data
                                                                      res.render('profitlossstate', { 
                                                                        creditNoteTotals,
                                                                        total_buydiscount,
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
                                                          });});
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
app.get('/balanceSheet', requireLogin, (req, res) => {
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

      pool.query('SELECT SUM(UnitPrice) AS total_salesno2 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
        if (err) throw err;
        const totalSalesno2 = results[0].total_salesno2;

        // fetch total sales for the selected year from yyitems_sell table where Content_SKU is not null
        pool.query('SELECT SUM(Amount) AS total_sales FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
          if (err) throw err;
          const totalSales = results[0].total_sales;

          pool.query('SELECT SUM(CostPrice) AS total_cost FROM yyitems_sell WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
            if (err) throw err;
            const totalCost = results[0].total_cost;

            // fetch total purchases for the selected year from yyitems_buy table
            pool.query('SELECT SUM(Amount) AS total_purchases FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND status != "return" AND status != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
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

                    pool.query('SELECT SUM(Amount) AS total_purchasesno FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                      if (err) throw err;
                      const totalPurchasesno = results[0].total_purchasesno;

                      pool.query('SELECT SUM(Amount) AS total_purchasesno2 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
                        if (err) throw err;
                        const totalPurchasesno2 = results[0].total_purchasesno2;

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

                                pool.query('SELECT SUM(Amount) AS total_gdex FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [selectedYear], (err, results) => {
                                  if (err) throw err;
                                  const totalgdex = results[0].total_gdex;

                                  pool.query('SELECT SUM(Amount) AS total_c2p FROM yycompanyfund2personal WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                                    if (err) throw err;
                                    const totalc2p = results[0].total_c2p;

                                    pool.query('SELECT SUM(Amount) AS totalp2c FROM yypersonalfund2company WHERE YEAR(Date) = ?', [selectedYear], (err, results) => {
                                      if (err) throw err;
                                      const totalp2c = results[0].totalp2c;
                    
                                      pool.query('SELECT SUM(amount) AS supRefund FROM refund WHERE fromSupplier = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                                        if (err) throw err;
                                        const supRefunds = results[0].supRefund;
                    
                                        pool.query('SELECT SUM(amount) AS refundsales FROM refund WHERE refund2buyer = "yes" AND YEAR(date) = ?', [selectedYear], (err, results) => {
                                          if (err) throw err;
                                          const refundsales = results[0].refundsales;

                                          pool.query('SELECT SUM(bonuscredit) AS bonus FROM yytopupbalance WHERE YEAR(date) = ?', [selectedYear], (err, results) => {
                                            if (err) throw err;
                                            const bonus = results[0].bonus;

                                            pool.query('SELECT SUM(bonuscredit) AS bonus2 FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                              if (err) throw err;
                                              const bonus2 = results[0].bonus2;

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

                                                                                            pool.query('SELECT SUM(Amount) as Atotalsalespay FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                              if (err) throw err;
                                                                                              const Atotalsalespay = results[0].Atotalsalespay;
                                                                                          
                                                                                                pool.query('SELECT SUM(Amount) as Atotalbuypay FROM yypurchase_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                  if (err) throw err;
                                                                                                  const Atotalbuypay = results[0].Atotalbuypay;

                                                                                                  pool.query('SELECT SUM(Amount) as Atotalexpenses FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL AND Name != "Gdex" AND YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                    if (err) throw err;
                                                                                                    const Atotalexpenses = results[0].Atotalexpenses;

                                                                                                    pool.query('SELECT SUM(Amount) as AtotalExpensesPaymentbreakdown FROM yyaccruals WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                      if (err) throw err;
                                                                                                      const AtotalExpensesPaymentbreakdown = results[0].AtotalExpensesPaymentbreakdown;

                                                                                                      pool.query('SELECT SUM(Amount) as Atotaltopup FROM yytopupbalance WHERE wallet = "Gdex" AND YEAR(date) <= ? ORDER BY ID DESC', [selectedYear], (error, results) => {
                                                                                                        if (err) throw err;
                                                                                                        const Atotaltopup = results[0].Atotaltopup;

                                                                                                        pool.query('SELECT SUM(amount) as Arefund2buyer FROM refund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                          if (err) throw err;
                                                                                                          const Arefund2buyer = results[0].Arefund2buyer;

                                                                                                          pool.query('SELECT SUM(amount) as AfromSupplier FROM refund WHERE fromSupplier = "yes" AND YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                            if (err) throw err;
                                                                                                            const AfromSupplier = results[0].AfromSupplier;

                                                                                                            pool.query('SELECT SUM(Amount) as Acompanyfund2personal FROM yycompanyfund2personal WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                              if (err) throw err;
                                                                                                              const Acompanyfund2personal = results[0].Acompanyfund2personal;

                                                                                                              pool.query('SELECT SUM(amount) as Adeposit FROM yydeposit WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                if (err) throw err;
                                                                                                                const Adeposit = results[0].Adeposit;

                                                                                                                pool.query('SELECT SUM(Amount) as Acreditor FROM yyothercreditor WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                                  if (err) throw err;
                                                                                                                  const Acreditor = results[0].Acreditor;

                                                                                                                  pool.query('SELECT SUM(amount) as Aequity FROM yyequity WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                    if (err) throw err;
                                                                                                                    const Acapital = results[0].Aequity;

                                                                                                                    pool.query('SELECT SUM(amount) as Acreditorpayment FROM yyothercreditor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                      if (err) throw err;
                                                                                                                      const Acreditorpayment = results[0].Acreditorpayment;

                                                                                                                      pool.query('SELECT SUM(Amount) as Adebtor FROM yyotherdebtor WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                                        if (err) throw err;
                                                                                                                        const Adebtor = results[0].Adebtor;

                                                                                                                        pool.query('SELECT SUM(amount) as Adebtorpayment FROM yyotherdebtor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                          if (err) throw err;
                                                                                                                          const Adebtorpayment = results[0].Adebtorpayment;

                                                                                                                          const bankledger = (Atotalsalespay-Atotalbuypay-Atotalexpenses-Atotaltopup-AtotalExpensesPaymentbreakdown-Arefund2buyer+AfromSupplier-Adeposit+Acapital+Acreditor-Acreditorpayment+Adebtorpayment-Adebtor+Acompanyfund2personal);
                                                                                                                         
                                                                                                                          pool.query('SELECT SUM(Amount) as officeEquipment FROM yyexpensesrecord WHERE Category = "Office Equipment" AND YEAR(Date) = ?', [selectedYear], (err, results) => {
                                                                                                                            if (err) throw err;
                                                                                                                            const officeEquipment = results[0].officeEquipment;

                                                                                                                            // render the EJS template with the fetched data
                                                                                                                            res.render('balanceSheet', { 
                                                                                                                              officeEquipment,
                                                                                                                              bankledger,
                                                                                                                              totalaccrued,
                                                                                                                              totaldeposit,
                                                                                                                              totalSalesno2,
                                                                                                                              totalPurchasesno2,
                                                                                                                              totalcapital,
                                                                                                                              totalotcredit,
                                                                                                                              totalBuypaid,
                                                                                                                              totalTopup,
                                                                                                                              totalSalespaid,
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
                                                                                                                              bonus2,
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
                                                                                                                              bftotalSalesno,
                                                                                                                              totalgdex,
                                                                                                                              assetsData 
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
app.get('/trialbalance', requireLogin, (req, res) => {
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

      pool.query('SELECT SUM(UnitPrice) AS total_salesno2 FROM yyitems_sell WHERE InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
        if (err) throw err;
        const totalSalesno2 = results[0].total_salesno2;

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

                      pool.query('SELECT SUM(Amount) AS total_purchasesno2 FROM yyitems_buy WHERE InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) <= ?)', [selectedYear], (err, results) => {
                        if (err) throw err;
                        const totalPurchasesno2 = results[0].total_purchasesno2;

                        pool.query('SELECT SUM(Amount) AS total_purchasesWOnosku FROM yyitems_buy WHERE Content_SKU IS NOT NULL AND Content_SKU != "" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                          if (err) throw err;
                          const total_purchasesWOnosku = results[0].total_purchasesWOnosku;

                          pool.query('SELECT SUM(Amount) AS buydiscount FROM yyitems_buy WHERE ProductName = "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yybuy_record WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                            if (err) throw err;
                            const total_buydiscount = results[0].buydiscount;

                            pool.query('SELECT SUM(Amount) AS selldiscount FROM yyitems_sell WHERE product_name = "Discount" AND InvoiceNumber IN (SELECT Invoice_number FROM yysell_invoice WHERE YEAR(`timestamp`) = ?)', [selectedYear], (err, results) => {
                              if (err) throw err;
                              const total_selldiscount = results[0].selldiscount;

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

                                pool.query('SELECT SUM(Amount) AS total_gdex FROM yyexpensesrecord WHERE Category = "Postage & Courier" AND Name = "Gdex" AND YEAR(Date) <= ?', [selectedYear], (err, results) => {
                                  if (err) throw err;
                                  const totalgdex = results[0].total_gdex;

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

                                            pool.query('SELECT SUM(bonuscredit) AS bonus2 FROM yytopupbalance WHERE YEAR(date) <= ?', [selectedYear], (err, results) => {
                                              if (err) throw err;
                                              const bonus2 = results[0].bonus2;

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

                                                                                          pool.query('SELECT Category, SUM(Amount) AS total FROM yyexpensesrecord WHERE YEAR(Date) = ? GROUP BY Category', [selectedYear], (err, results) => {
                                                                                            if (err) throw err;
                                                                                            const categoriesss = results;

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

                                                                                                pool.query('SELECT SUM(Amount) as Atotalsalespay FROM yysales_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                  if (err) throw err;
                                                                                                  const Atotalsalespay = results[0].Atotalsalespay;
                                                                                              
                                                                                                    pool.query('SELECT SUM(Amount) as Atotalbuypay FROM yypurchase_paymentbreakdown WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                      if (err) throw err;
                                                                                                      const Atotalbuypay = results[0].Atotalbuypay;
    
                                                                                                      pool.query('SELECT SUM(Amount) as Atotalexpenses FROM yyexpensesrecord WHERE accrued = "" OR accrued IS NULL AND Name != "Gdex" AND YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                        if (err) throw err;
                                                                                                        const Atotalexpenses = results[0].Atotalexpenses;
    
                                                                                                        pool.query('SELECT SUM(Amount) as AtotalExpensesPaymentbreakdown FROM yyaccruals WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                          if (err) throw err;
                                                                                                          const AtotalExpensesPaymentbreakdown = results[0].AtotalExpensesPaymentbreakdown;
    
                                                                                                          pool.query('SELECT SUM(Amount) as Atotaltopup FROM yytopupbalance WHERE wallet = "Gdex" AND YEAR(date) <= ? ORDER BY ID DESC', [selectedYear], (error, results) => {
                                                                                                            if (err) throw err;
                                                                                                            const Atotaltopup = results[0].Atotaltopup;
    
                                                                                                            pool.query('SELECT SUM(amount) as Arefund2buyer FROM refund WHERE refund2buyer = "yes" AND YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                              if (err) throw err;
                                                                                                              const Arefund2buyer = results[0].Arefund2buyer;
    
                                                                                                              pool.query('SELECT SUM(amount) as AfromSupplier FROM refund WHERE fromSupplier = "yes" AND YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                if (err) throw err;
                                                                                                                const AfromSupplier = results[0].AfromSupplier;
    
                                                                                                                pool.query('SELECT SUM(Amount) as Acompanyfund2personal FROM yycompanyfund2personal WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                  if (err) throw err;
                                                                                                                  const Acompanyfund2personal = results[0].Acompanyfund2personal;
    
                                                                                                                  pool.query('SELECT SUM(amount) as Adeposit FROM yydeposit WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                    if (err) throw err;
                                                                                                                    const Adeposit = results[0].Adeposit;
    
                                                                                                                    pool.query('SELECT SUM(Amount) as Acreditor FROM yyothercreditor WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                                      if (err) throw err;
                                                                                                                      const Acreditor = results[0].Acreditor;
    
                                                                                                                      pool.query('SELECT SUM(amount) as Aequity FROM yyequity WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                        if (err) throw err;
                                                                                                                        const Acapital = results[0].Aequity;
    
                                                                                                                        pool.query('SELECT SUM(amount) as Acreditorpayment FROM yyothercreditor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                          if (err) throw err;
                                                                                                                          const Acreditorpayment = results[0].Acreditorpayment;
    
                                                                                                                          pool.query('SELECT SUM(Amount) as Adebtor FROM yyotherdebtor WHERE YEAR(Date) <= ?', [selectedYear], (error, results) => {
                                                                                                                            if (err) throw err;
                                                                                                                            const Adebtor = results[0].Adebtor;
    
                                                                                                                            pool.query('SELECT SUM(amount) as Adebtorpayment FROM yyotherdebtor_paymentbreakdown WHERE YEAR(date) <= ?', [selectedYear], (error, results) => {
                                                                                                                              if (err) throw err;
                                                                                                                              const Adebtorpayment = results[0].Adebtorpayment;
    
                                                                                                                              const bankledger = (Atotalsalespay-Atotalbuypay-Atotalexpenses-Atotaltopup-AtotalExpensesPaymentbreakdown-Arefund2buyer+AfromSupplier-Adeposit+Acapital+Acreditor-Acreditorpayment+Adebtorpayment-Adebtor+Acompanyfund2personal);
                                                                                                                             
                                                                                                                              pool.query('SELECT SUM(amount) AS totalamount, courier FROM creditnote WHERE YEAR(date) <= ? GROUP BY courier', [selectedYear], (error, amountResults) => {
                                                                                                                                if (error) {
                                                                                                                                  console.error(error);
                                                                                                                                  res.status(500).send('Error fetching creditnote data');
                                                                                                                                } else {
                                                                                                                                  pool.query('SELECT SUM(used) AS totalused, courier FROM creditnote WHERE YEAR(useddate) <= ? GROUP BY courier', [selectedYear], (error, usedResults) => {
                                                                                                                                    if (error) {
                                                                                                                                      console.error(error);
                                                                                                                                      res.status(500).send('Error fetching creditnote data');
                                                                                                                                    } else {
                                                                                                                                      // Combine the amount and used results based on the courier
                                                                                                                                      const creditNoteBalances = {};
                                                                                                                              
                                                                                                                                      amountResults.forEach((amountRow) => {
                                                                                                                                        const courier = amountRow.courier;
                                                                                                                                        const totalAmount = amountRow.totalamount;
                                                                                                                                        const usedRow = usedResults.find((usedRow) => usedRow.courier === courier);
                                                                                                                              
                                                                                                                                        if (usedRow) {
                                                                                                                                          const totalUsed = usedRow.totalused;
                                                                                                                                          const balance = totalAmount - totalUsed;
                                                                                                                                          creditNoteBalances[courier] = balance;
                                                                                                                                        } else {
                                                                                                                                          // If used result is not available for the courier, use total amount as the balance
                                                                                                                                          creditNoteBalances[courier] = totalAmount;
                                                                                                                                        }
                                                                                                                                      });

                                                                                                                                  pool.query('SELECT SUM(amount) AS totalCreditNote FROM creditnote', (error, results) => {
                                                                                                                                    if (error) {
                                                                                                                                      console.error(error);
                                                                                                                                      res.status(500).send('Error fetching credit note data');
                                                                                                                                    } else {
                                                                                                                                      const totalCreditNote = results[0].totalCreditNote || 0;
                                                                                                                                  

                                                                                                                              // render the EJS template with the fetched data
                                                                                                                              res.render('trialbalance', {
                                                                                                                                totalCreditNote, 
                                                                                                                                creditNoteBalances,
                                                                                                                                bankledger,
                                                                                                                                total_selldiscount,
                                                                                                                                total_buydiscount,
                                                                                                                                totaldeposit,
                                                                                                                                totalSalesno2,
                                                                                                                                totalPurchasesno2,
                                                                                                                                totalcapital,
                                                                                                                                totalotcredit,
                                                                                                                                totalBuypaid,
                                                                                                                                totalTopup,
                                                                                                                                totalSalespaid,
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
                                                                                                                                bonus2,
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
                                                                                                                                bftotalSalesno,
                                                                                                                                totalgdex,
                                                                                                                                assetsData,
                                                                                                                                totalaccrued,
                                                                                                                                categoriesss 
                                                                                                                                });
                                                                                                                              }})
                                                                                                                          }});
                                                                                                                        }});
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
//-------------------------------------Import & Export---------------------------------------------------------------------------------------------------------------------
app.get('/inout', requireLogin, function(req, res) {
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
app.get('/yysell_invoice', requireLogin, function(req, res) {
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
app.get('/yyproduct-details', requireLogin, (req, res) => {
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
app.get('/yyproduct-name', requireLogin, (req, res) => {
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
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [], field8 = []} = req.body;

  pool.query('SELECT MAX(Invoice_number) as maxInvoiceNumber FROM yysell_invoice', (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Error fetching max Invoice_number');
    } else {
      const maxInvoiceNumber = results[0].maxInvoiceNumber;
      const invoice_number = (maxInvoiceNumber ? parseInt(maxInvoiceNumber) : 0) + 1;

      pool.query('INSERT INTO yysell_invoice (Invoice_number, Name, Phone, Address1, Address2, Address3, PostCode, City, State, Country, Remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [invoice_number, name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks], (error, results, fields) => {
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
                const currentDate = new Date().toISOString();
                const content_SKU = item;
                const productName = field2[index];
                const sizeUS = field3[index];

                pool.query('INSERT INTO singgleship (TrackingNumber, Date, Content_SKU, Productname, SizeUS, invoice, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)', [trackingNumber, currentDate, content_SKU, productName, sizeUS, invoice_number, 1], (error, results, fields) => {
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
                const unitPrice = field8[index];
                const soldDate = moment().format('YYYY-MM-DD');
                for (let i = 0; i < qty; i++) {
                  pool.query('UPDATE yyitems_buy SET sold = ?, solddate = ? WHERE UnitPrice = ? AND Content_SKU = ? AND SizeUS = ? AND sold = ? AND status = ? LIMIT ?', ['yes', soldDate, unitPrice, sku, size, 'no', 'check', parseInt(qty)], (error, results, fields) => {
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

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO yyaccruals (Date, Invoice_No, Bank, Name, Amount, Detail, File) VALUES (?, ?, ?, ?, ?, ?, ifnull(?, "N/A"))', [date, invoice_no, bank, name, amount, detail, filename], (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('Error saving form data');
    } else {
      console.log(req.body);

      // Update the settle column for the specified ID
      pool.query('UPDATE yyexpensesrecord SET settle = "yes" WHERE ID = ?', [id], function(error, results, fields) {
        if (error) {
          console.error(error);
          res.status(500).send('Error updating data');
        } else {
          if (creditN && creditN > 0) {
            // Get the creditnote rows for the courier
            pool.query('SELECT id, amount, used FROM creditnote WHERE courier = ? AND used < amount ORDER BY id', [name], function(error, creditNoteResults, fields) {
              if (error) {
                console.error(error);
                res.status(500).send('Error fetching creditnote data');
              } else {
                let remainingCreditN = creditN;
                let redirectPerformed = false;

                // Update the creditnote rows based on available creditN amount
                creditNoteResults.forEach((row) => {
                  if (remainingCreditN <= 0) {
                    return; // Exit the loop if creditN is fully used
                  }

                  const availableAmount = row.amount - row.used;
                  const usedAmount = Math.min(availableAmount, remainingCreditN);
                  remainingCreditN -= usedAmount;

                  const usedDate = now.toISOString();

                  pool.query('UPDATE creditnote SET used = ?, useddate = ? WHERE id = ?', [row.used + usedAmount, usedDate, row.id], function(error, results, fields) {
                    if (error) {
                      console.error(error);
                      res.status(500).send('Error updating creditnote');
                    } else {
                      if (remainingCreditN === 0 && !redirectPerformed) {
                        // All creditN amount has been used and redirect has not been performed yet
                        redirectPerformed = true;
                        res.redirect('/yyaccruals');
                      }
                    }
                  });
                });

                if (remainingCreditN > 0 && !redirectPerformed) {
                  // If there is remaining creditN amount and redirect has not been performed yet,
                  // insert a new row in the creditnote table
                  pool.query('INSERT INTO creditnote (courier, amount, used, useddate) VALUES (?, ?, ?, ?)', [name, creditN, remainingCreditN, usedDate], function(error, results, fields) {
                    if (error) {
                      console.error(error);
                      res.status(500).send('Error inserting creditnote data');
                    } else {
                      res.redirect('/yyaccruals');
                    }
                  });
                }
              }
            });
          } else {
            res.redirect('/yyaccruals');
          }
        }
      });
    }
  });
});

//for procurement buy
app.get('/procurementbuy', function(req, res) {
  // Query the database to retrieve all rows with summed quantity
  const sql = `
  SELECT buyinvoice, sku, productname, size, costprice, SUM(buyquantity) as quantity
  FROM procurementdatabase
  GROUP BY sku, size, costprice, productname, buyinvoice`;

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
app.get('/procurementbuyproduct-name', (req, res) => {
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
app.post('/procurementbuy', upload.single('file'), urlencodedParser, (req, res) => {
  const {
    field1,
    field2,
    field3,
    field7,
    name,
    bank,
    bankname,
    bankacc,
    remarks,
    field4,
    field5,
    discount
  } = req.body;
  console.log(req.body);

  const buydate = new Date();

  // Fetch the maximum buyinvoice value from the database
  pool.query('SELECT MAX(buyinvoice) AS maxBuyInvoice FROM procurementdatabase', (err, result) => {
    if (err) {
      console.error('Error fetching maximum buyinvoice:', err);
      return;
    }

    // Extract the maximum buyinvoice from the result
    const maxBuyInvoice = result[0].maxBuyInvoice;
    let invoiceCounter = 1;

    if (maxBuyInvoice) {
      // Extract the numeric part of the maximum buyinvoice and increment it
      invoiceCounter = parseInt(maxBuyInvoice.replace('PO', ''), 10) + 1;
    }

    // Generate the buyinvoice value using the counter
    const buyinvoice = `PO${invoiceCounter.toString().padStart(5, '0')}`; // Format the invoice number as "PO00001"

    // Prepare the SQL query
    const sql = 'INSERT INTO procurementdatabase (sku, productname, size, gender, buydate, buyinvoice, name, bank, bankname, bankacc, buyremarks, costprice, buyquantity) VALUES ?';

    // Prepare the values for multiple rows
    const values = [];

    // Iterate over the submitted data and generate the values array for multiple rows
    for (let i = 0; i < field1.length; i++) {
      const quantity = parseInt(field5[i]);

      for (let j = 0; j < quantity; j++) {
        values.push([
          field1[i],
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
          parseFloat(field4[i]), // Use the original cost price without any changes
          1, // Set buyquantity to 1 for each row
        ]);
      }
    }

    // If there is a discount, add a separate entry for the discount
    if (parseFloat(discount) > 0) {
      values.push([
        null, // Set SKU as null for the discount entry
        'Discount',
        null,
        null,
        buydate,
        buyinvoice,
        name,
        bank,
        bankname,
        bankacc,
        remarks,
        -parseFloat(discount), // Use negative discount as cost price for the discount entry
        1,
      ]);
    }

    // Execute the SQL query with the values array
    pool.query(sql, [values], (err, result) => {
      if (err) {
        console.error('Error inserting data:', err);
      } else {
        console.log('Data inserted successfully');
      }
    });

    // Fetch the data from the database
    const selectSql = `
      SELECT buyinvoice, sku, productname, size, costprice, SUM(buyquantity) as quantity
      FROM procurementdatabase
      GROUP BY sku, size, costprice, productname, buyinvoice`;

    // Execute the SQL query to fetch data
    pool.query(selectSql, (err, result) => {
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
});
app.get('/procurementbuy-payment', function(req, res) {
  const invoiceQuery = `
    SELECT DATE_FORMAT(p.buydate, "%Y-%m-%d") AS formattedbuyDate, p.buyinvoice, SUM(p.costprice) AS totalAmount, IFNULL(b.totalPaid, 0) AS totalPaid,
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
    GROUP BY p.buyinvoice, b.totalPaid, p.buydate
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
  const { date, invoice_no, amount, remarks, bankref } = req.body;

  // Get the filename from the request
  const filename = req.file ? req.file.filename : 'N/A';

  // Insert the form data into MySQL
  pool.query('INSERT INTO procurementbuypaymentbreakdown (date, buyinvoice, amount, remarks, file, bankrefs) VALUES (?, ?, ?, ?, ifnull(?, "N/A"), ?)', [date, invoice_no, amount, remarks, filename, bankref], (error, results, fields) => {
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
app.get('/procurementBuypayment_search', function(req, res) {
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
    GROUP BY p.buyinvoice, p.costprice, b.totalPaid, p.name
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
app.get('/procurementbuy-generate', function(req, res) {
  res.render('procurementbuy-generate');
});
app.get('/procurementbuygenerate', (req, res) => {
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
        WHERE buyinvoice = '${invoiceNumber}' AND sku IS NOT NULL AND sku != ""
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


app.get('/procurementsales', function(req, res) {
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = `
    SELECT salesinvoice, sku, size, sellprice, productname, gender, costprice, salesdate FROM procurementdatabase WHERE sku IS NOT NULL AND sku <> ''
  `;

  if (startDate && endDate) {
    query += ` AND salesdate BETWEEN '${startDate}' AND '${endDate}'`;
  }

  query += `
    GROUP BY salesinvoice, sku, size, sellprice, productname, gender, costprice, salesdate
    ORDER BY salesinvoice DESC, CAST(size AS DECIMAL(10,2)) ASC
  `;

  pool.query(query, function(error, results, fields) {
    if (error) {
      console.error(error);
      res.status(500).send('Error fetching data');
    } else {
      const data = results.map(row => ({ ...row }));
      res.render('procurementsales', { data });
    }
  });
});
app.get('/procurement-productname', (req, res) => {
  const sku = req.query.sku;
  const query = `
    SELECT DISTINCT productname
    FROM procurementdatabase
    WHERE sku LIKE ?
  `;
  pool.query(query, ['%' + sku + '%'], (err, results) => {
    if (err) throw err;

    const productnames = new Set();

    results.forEach(result => {
      productnames.add(result.productname);
    });

    res.json({
      productnames: Array.from(productnames)
    });
  });
});
app.get('/procurementQuantityAndCostPrice', (req, res) => {
  // Retrieve SKU and Size from the query parameters
  const sku = req.query.sku;
  const size = req.query.size;

  // Perform the necessary database query to retrieve the quantity and distinct unit prices
  const query = `SELECT SUM(buyquantity) AS quantity, costprice 
                 FROM procurementdatabase 
                 WHERE sku = '${sku}' AND size = '${size}' AND (salesinvoice = '' OR salesinvoice IS NULL)
                 GROUP BY costprice`;

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
        Quantity: row.quantity,
        Costprice: row.costprice
      };
    });

    // Send the response data as JSON response
    res.json(responseData);
  });
});
app.get('/procurementCostPrices', (req, res) => {
  const sku = req.query.sku;
  const size = req.query.size;

  const query = `
    SELECT DISTINCT costprice
    FROM procurementdatabase
    WHERE sku = '${sku}' AND size = '${size}' AND (salesinvoice IS NULL OR salesinvoice = '')
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    const costprices = results.map(result => result.costprice);
    res.json(costprices);
  });
});
app.post('/procurementsales', upload.single('file'), urlencodedParser, function (req, res) {
  const { name, phone, adr1, adr2, adr3, postcode, city, state, country, runnerfee, shipfee, remarks, field1 = [], field2 = [], field3 = [], field4 = [], field5 = [], field6 = [], field7 = [], field8 = []} = req.body;
 
  pool.query('INSERT INTO procurementdatabase (sellto, phone, adres1, adres2, adres3, postcode, city, state, country, salesremarks, runnerfee, shippingfee) VALUES (?,?,?,?,?,?,?,?,?,?)', [name, phone, adr1, adr2, adr3, postcode, city, state, country, remarks, runnerfee, shipfee], (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Error saving form data');
  }});
});




//----------------------Ending--------------------------------------------------------------------------------
app.get('/profile/:name', requireLogin, function(req, res){
    res.render('profile', {person: req.params.name});
});
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://192.168.0.103:5000/');
});