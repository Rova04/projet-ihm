const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'projet_ihm'
});

db.connect((err) => {
    if (err) {
        console.error('Erreur lors de la connexion à la base de donnée :', err.message);
    } else {
        console.log('Connexion à la base de donnée établie !');
    }
});

module.exports = db;