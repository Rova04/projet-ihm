const express = require('express');
const cors = require('cors');
const routes = require('./routes.js');
const { updateExchangeRates } = require('./controllers/globalTaux.js')
require('./config/bd.js');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use('/api', routes);

// Pour savoir si une MAJ automatique a eu lieu
let lastAutoUpdate = null;

// Route facultative pour que le frontend sache si une MAJ automatique est passée
app.get('/api/taux/last-auto-update', (req, res) => {
  if (lastAutoUpdate) {
    res.json({
      updated: true,
      message: 'Les taux ont été mis à jour automatiquement. Veuillez actualiser.',
      lastUpdate: lastAutoUpdate,
    });
  } else {
    res.json({ updated: false });
  }
});

// mise à jour automatique
async function updateRatesAutomatically() {
  try {
    console.log('Tentative de mise à jour automatique des taux...');

    const result = await updateExchangeRates(); //appel de la fonc
    console.log('Mise à jour automatique terminée :', result.message);
    if (result.updatedCount > 0) {
      console.log(`${result.updatedCount} taux mis à jour, ${result.skippedCount} ignorés.`);
      console.log(`Paires traitées : ${result.pairesTraitees.join(', ')}`);
    }

    lastAutoUpdate = new Date(); // Marquer l'heure de la dernière MAJ

  } catch (error) {
    console.error('Erreur pendant la mise à jour automatique :', error.message);
  }
}


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // setInterval(updateRatesAutomatically, 2 * 60 * 1000); //2mn pour test
  setInterval(updateRatesAutomatically, 43200000); //12h

});