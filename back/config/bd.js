const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'projet_ihm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test de connexion immédiat (avec promesse)
pool.getConnection()
  .then(connection => {
    console.log('Connexion à la base de donnée établie !');
    connection.release();
  })
  .catch(err => {
    console.error('Erreur lors de la connexion à la base de donnée :', err);
  });

module.exports = pool;
