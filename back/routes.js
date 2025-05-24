const express = require('express');
const router = express.Router();

const taux = require('./controllers/globalTaux');
router.get('/taux', taux.getAllRates);
router.get('/taux/historique/:dev_source/:dev_cible', taux.getRateHistory);
router.get('/taux/recherche/:dev_cible', taux.searchExchangeRate);
router.get('/taux/historique/jour/:date', taux.getDailyRateHistory);

// Routes pour la mise à jour des taux
router.post('/taux/update-existing', taux.updateExchangeRates);
router.get('/taux/resetManual/:id', taux.resetManualOverride)
router.post('/taux/update-manual', taux.updateRateManually);

// Route pour la suppression des taux
router.delete('/taux/:dev_source/:dev_cible', taux.deleteRate);

// Routes pour l'export des taux
router.get('/taux/export/excel', taux.exportRateHistoryToExcel);
router.get('/taux/export/pdf', taux.exportRateHistoryToPDF);

module.exports = router;