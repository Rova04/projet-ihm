const express = require('express');
const router = express.Router();

const taux = require('./controllers/globalTaux');
router.get('/taux', taux.getAllRates);  //ok
router.get('/taux/historique/:dev_cible/:date_archivage/:filtre', taux.getRateHistory); //ok (new)
router.get('/taux/recherche/:dev_cible', taux.searchExchangeRate);  //ok

// Routes pour la mise à jour des taux
router.get('/taux/resetManual/:dev_cible', taux.resetManualOverride); //ok
router.post('/taux/update-manual', taux.updateRateManually); //ok

// Route pour la suppression des taux
router.delete('/taux/delete/:id', taux.deleteRate);  //ok
router.delete('/taux/historique/delete/:id', taux.deleteHistorique); //ok (new)

// Routes pour l'export des taux
router.post('/taux/historique/export/pdf', taux.exportRateHistoryToPDF); //ok (new)
router.post('/taux/historique/export/excel', taux.exportRateHistoryToExcel); //ok (new)

module.exports = router;