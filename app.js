const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });

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

app.get('/accruals', function(req, res){
    res.render('accruals');
});

//for accruals form
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

//for other-creditor form
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

//for other-creditor form
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

app.get('/profile/:name', function(req, res){
    res.render('profile', {person: req.params.name});
});

app.listen(5000);