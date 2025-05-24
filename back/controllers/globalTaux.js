
const axios = require('axios');
const db = require('../config/bd.js');
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');

// Récupérer tous les taux de change stockés
const getAllRates = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM taux ORDER BY dev_cible');
    res.json(rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des taux:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des taux.' });
  }
};

// Récupérer l'historique des taux pour une devise
const getRateHistory = async (req, res) => {
  const { dev_source, dev_cible } = req.params;
  
  try {
    const [rows] = await db.query(
      'SELECT * FROM historique_taux WHERE dev_source = ? AND dev_cible = ? ORDER BY date_archivage DESC LIMIT 30',
      [dev_source, dev_cible]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'historique:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique.' });
  }
};

/**
 * Rechercher ou créer un taux de change spécifique
 * Cette fonction est appelée quand un utilisateur recherche un taux
 */
const searchExchangeRate = async (req, res) => {
  console.log('API externe bien appellé');
  const dev_source = 'Ariary'; // Toujours fixe
  const { dev_cible } = req.params;
  const marge = 0.02; // Marge de 2%

  try {
    // Vérifier si le taux existe déjà
    const [existingRate] = await db.query(
      'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );

    if (existingRate.length > 0) {
      return res.json(existingRate[0]);
    }

    console.log(dev_cible)    // Requête vers l'API : combien vaut 1 dev_cible en MGA
    const response = await axios.get('https://api.exchangerate.host/latest', {
      params: {
        base: dev_cible,
        symbols: 'MGA'
      }
    });
    console.log('API externe bien exécutée');
    const rateMGA = response.data?.rates?.MGA;

    if (!rateMGA) {
      return res.status(404).json({ error: 'Taux de change non disponible pour cette devise.' });
    }

    // Ici, 1 dev_cible = rateMGA Ariary → c'est ce qu'on veut
    const taux_achat = rateMGA;
    const taux_vente = taux_achat * (1 + marge);

    // Enregistrement dans la base
    await db.query(
      'INSERT INTO taux (taux_achat, taux_vente, dev_source, dev_cible) VALUES (?, ?, ?, ?)',
      [taux_achat, taux_vente, dev_source, dev_cible]
    );

    // Retourner ce qu'on vient d'insérer
    const [newRate] = await db.query(
      'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );

    res.json(newRate[0]);
  } catch (err) {
    console.error('Erreur lors de la recherche du taux:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche du taux de change.' });
  }
};


//Mise à jour automatique ne prenant en charge les taux modifiés en moins de 48h
const updateExchangeRates = async (options = {}) => {
  try {
    const {
      respectManualUpdates = true,
      logToConsole = true,
    } = options;

    const [existingPairs] = await db.query('SELECT dev_source, dev_cible FROM taux');

    if (existingPairs.length === 0) {
      if (logToConsole) console.log('Aucun taux à mettre à jour.');
      return { message: 'Aucun taux à mettre à jour.', updatedCount: 0, skippedCount: 0 };
    }

    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const now = new Date();
    let updatedCount = 0;
    let skippedCount = 0;

    for (const { dev_source, dev_cible } of existingPairs) {
      try {
        // Vérification et filtrage manuel
        const [currentRate] = await db.query(
          'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
          [dev_source, dev_cible]
        );
        if (currentRate.length === 0) continue;

        if (respectManualUpdates) {
          const [lastModification] = await db.query(
            `SELECT modification_manuelle, date_archivage 
             FROM historique_taux 
             WHERE dev_source = ? AND dev_cible = ? 
             ORDER BY date_archivage DESC 
             LIMIT 1`,
            [dev_source, dev_cible]
          );

          if (lastModification.length > 0 && lastModification[0].modification_manuelle === 1) {
            const modifDate = new Date(lastModification[0].date_archivage);
            const diffMs = now - modifDate;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (diffHours < 48) {
              if (logToConsole) console.log(`Taux ${dev_source}/${dev_cible} ignoré (modifié manuellement il y a ${diffHours.toFixed(1)}h).`);
              skippedCount++;
              continue;
            }
          }
        }

        // Récupération du taux depuis l'API (1 dev_cible = ? MGA)
        const response = await axios.get('https://api.exchangerate.host/latest', {
          params: { base: dev_cible, symbols: 'MGA' }
        });

        const rateMGA = response.data?.rates?.MGA;
        if (!rateMGA || rateMGA <= 0) {
          if (logToConsole) console.log(`Taux MGA introuvable pour ${dev_cible}`);
          continue;
        }

        // Conversion inversée : 1 MGA = ? dev_cible
        const newTauxAchat = 1 / rateMGA;

        // Calculer la même marge qu’actuellement
        const marge = (currentRate[0].taux_vente / currentRate[0].taux_achat) - 1;
        const newTauxVente = newTauxAchat * (1 + marge);

        // Archiver l'ancien taux
        await db.query(
          'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, modification_manuelle) VALUES (?, ?, ?, ?, ?, 0)',
          [currentRate[0].taux_achat, currentRate[0].taux_vente, dev_source, dev_cible, dateUpdate]
        );

        // Mise à jour dans la table principale
        await db.query(
          'UPDATE taux SET taux_achat = ?, taux_vente = ? WHERE dev_source = ? AND dev_cible = ?',
          [newTauxAchat, newTauxVente, dev_source, dev_cible]
        );

        updatedCount++;
      } catch (error) {
        if (logToConsole) console.error(`Erreur sur ${dev_source}/${dev_cible}:`, error.message);
      }
    }

    if (logToConsole) console.log(`${updatedCount} taux mis à jour, ${skippedCount} ignorés à ${dateUpdate}`);

    return {
      message: `${updatedCount} taux mis à jour avec succès.`,
      updatedCount,
      skippedCount,
      timestamp: dateUpdate
    };
  } catch (err) {
    const errorMsg = "Erreur durant la mise à jour des taux: " + err.message;
    if (logToConsole) console.error(errorMsg);
    throw new Error(errorMsg);
  }
};


//réactiver la mise à jour automatique pour une ligne historique
const resetManualOverride = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID requis.' });
  }

  try {
    // Vérifier si la ligne existe et est bien une modif manuelle
    const [row] = await db.query(
      'SELECT * FROM historique_taux WHERE id = ? AND modification_manuelle = 1',
      [id]
    );

    if (row.length === 0) {
      return res.status(404).json({ error: "Aucune modification manuelle trouvée avec cet ID." });
    }

    // Déverrouiller la modif manuelle
    await db.query(
      'UPDATE historique_taux SET modification_manuelle = 0 WHERE id = ?',
      [id]
    );

    res.json({ message: `Mise à jour automatique réactivée pour l'entrée #${id}.` });
  } catch (err) {
    console.error("Erreur resetManualOverride:", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

// Mettre à jour manuellement un taux de change 
const updateRateManually = async (req, res) => {
  try {
    const { dev_source, dev_cible, taux_achat, taux_vente } = req.body;
    
    if (!dev_source || !dev_cible || !taux_achat || !taux_vente) {
      return res.status(400).json({ error: 'Tous les champs sont requis.' });
    }
    
    // Vérifier si le taux existe
    const [existingRate] = await db.query(
      'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );
    
    if (existingRate.length === 0) {
      return res.status(404).json({ error: 'Taux de change non trouvé.' });
    }
    
    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Ajouter à l'historique avec le flag modification_manuelle à 1
    await db.query(
      'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, modification_manuelle) VALUES (?, ?, ?, ?, ?, 1)',
      [existingRate[0].taux_achat, existingRate[0].taux_vente, dev_source, dev_cible, dateUpdate]
    );
    
    // Mettre à jour le taux
    await db.query(
      'UPDATE taux SET taux_achat = ?, taux_vente = ? WHERE dev_source = ? AND dev_cible = ?',
      [taux_achat, taux_vente, dev_source, dev_cible]
    );
    
    // Récupérer le taux mis à jour
    const [updatedRate] = await db.query(
      'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );
    
    res.json({
      message: 'Taux mis à jour manuellement avec succès.',
      data: updatedRate[0]
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour manuelle du taux:", err.message);
    res.status(500).json({ error: "Erreur lors de la mise à jour manuelle du taux." });
  }
};

/**
 * Supprimer un taux de change
 */
const deleteRate = async (req, res) => {
  const { dev_source, dev_cible } = req.params;
  
  try {
    // Vérifier si le taux existe
    const [rows] = await db.query(
      'SELECT * FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Taux de change non trouvé.' });
    }
    
    // Ajouter la dernière version à l'historique avec un marqueur de suppression
    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.query(
      'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, suppression) VALUES (?, ?, ?, ?, ?, ?)',
      [rows[0].taux_achat, rows[0].taux_vente, dev_source, dev_cible, dateUpdate, 1]
    );
    
    // Supprimer le taux
    await db.query(
      'DELETE FROM taux WHERE dev_source = ? AND dev_cible = ?',
      [dev_source, dev_cible]
    );
    
    res.json({ message: 'Taux supprimé avec succès.' });
  } catch (err) {
    console.error("Erreur lors de la suppression du taux:", err.message);
    res.status(500).json({ error: "Erreur lors de la suppression du taux." });
  }
};

/**
 * Récupérer l'historique des taux pour une journée spécifique
 */
const getDailyRateHistory = async (req, res) => {
  const { date } = req.params;
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD.' });
  }
  
  // Formater la date pour la requête SQL
  const formattedDate = dateObj.toISOString().slice(0, 10);
  
  try {
    const [rows] = await db.query(
      'SELECT * FROM historique_taux WHERE DATE(date_archivage) = ? ORDER BY dev_source, dev_cible, date_archivage',
      [formattedDate]
    );
    
    res.json(rows);
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'historique journalier:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique journalier.' });
  }
};

/**
 * Exporter l'historique des taux en Excel
 */
const exportRateHistoryToExcel = async (req, res) => {
  try {
    const { date, dev_source, dev_cible } = req.query;
    let rows;
    
    if (date) {
      // Historique d'une journée spécifique
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD.' });
      }
      const formattedDate = dateObj.toISOString().slice(0, 10);
      
      [rows] = await db.query(
        'SELECT * FROM historique_taux WHERE DATE(date_archivage) = ? ORDER BY dev_source, dev_cible, date_archivage',
        [formattedDate]
      );
    } else if (dev_source && dev_cible) {
      // Historique d'une paire de devises spécifique
      [rows] = await db.query(
        'SELECT * FROM historique_taux WHERE dev_source = ? AND dev_cible = ? ORDER BY date_archivage DESC',
        [dev_source, dev_cible]
      );
    } else {
      // Tous les taux (limités aux 50 derniers)
      [rows] = await db.query(
        'SELECT * FROM historique_taux ORDER BY date_archivage DESC LIMIT 50'
      );
    }
    
    // Créer un nouveau workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Historique des taux');
    
    // Ajouter les en-têtes
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Devise source', key: 'dev_source', width: 15 },
      { header: 'Devise cible', key: 'dev_cible', width: 15 },
      { header: 'Taux achat', key: 'taux_achat', width: 15 },
      { header: 'Taux vente', key: 'taux_vente', width: 15 },
      { header: 'Date de modification', key: 'date_archivage', width: 20 },
      { header: 'Modification manuelle', key: 'modification_manuelle', width: 20 },
      { header: 'Suppression', key: 'suppression', width: 15 }
    ];
    
    // Ajouter les données
    worksheet.addRows(rows);
    
    // Créer le répertoire de sortie s'il n'existe pas
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Génération du nom de fichier basé sur la date/heure actuelle
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `historique_taux_${timestamp}.xlsx`;
    const filePath = path.join(uploadDir, fileName);
    
    // Écrire le fichier
    await workbook.xlsx.writeFile(filePath);
    
    // Renvoyer le fichier
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Erreur lors du téléchargement du fichier:', err);
        res.status(500).json({ error: 'Erreur lors du téléchargement du fichier.' });
      }
      
      // Supprimer le fichier après envoi
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error('Erreur lors de l\'export en Excel:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export en Excel.' });
  }
};

/**
 * Exporter l'historique des taux de change en PDF
 */
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
    italics: path.join(__dirname, '../fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf')
  }
};
const printer = new PdfPrinter(fonts);

/**
 * Exporter l'historique des taux en PDF (avec pdfMake)
 */
const exportRateHistoryToPDF = async (req, res) => {
  try {
    const { date, dev_source, dev_cible } = req.query;
    let title = 'Historique des taux de change';
    let rows;

    if (date) {
      const formattedDate = new Date(date).toISOString().slice(0, 10);
      [rows] = await db.query(
        'SELECT * FROM historique_taux WHERE DATE(date_archivage) = ? ORDER BY dev_source, dev_cible, date_archivage',
        [formattedDate]
      );
      title += ` - ${formattedDate}`;
    } else if (dev_source && dev_cible) {
      [rows] = await db.query(
        'SELECT * FROM historique_taux WHERE dev_source = ? AND dev_cible = ? ORDER BY date_archivage DESC',
        [dev_source, dev_cible]
      );
      title += ` - ${dev_source}/${dev_cible}`;
    } else {
      [rows] = await db.query(
        'SELECT * FROM historique_taux ORDER BY date_archivage DESC LIMIT 50'
      );
    }

    const tableBody = [
      ['Source', 'Cible', 'Achat', 'Vente', 'Date', 'Manuel']
    ];

    rows.forEach(row => {
      tableBody.push([
        row.dev_source,
        row.dev_cible,
        row.taux_achat.toFixed(4),
        row.taux_vente.toFixed(4),
        new Date(row.date_archivage).toLocaleString(),
        row.modification_manuelle ? 'Oui' : 'Non'
      ]);
    });

    const docDefinition = {
      content: [
        { text: title, style: 'header' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', '*', '*', 'auto'],
            body: tableBody
          },
          layout: 'lightHorizontalLines'
        }
      ],
      styles: {
        header: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 10],
          alignment: 'center'
        }
      }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const fileName = `historique_taux_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../uploads', fileName);

    const stream = fs.createWriteStream(filePath);
    pdfDoc.pipe(stream);
    pdfDoc.end();

    stream.on('finish', () => {
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Erreur envoi PDF:', err);
          res.status(500).json({ error: 'Erreur lors du téléchargement.' });
        }
        fs.unlinkSync(filePath); // Nettoyage
      });
    });
  } catch (err) {
    console.error('Erreur export PDF:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export PDF.' });
  }
};

module.exports = { 
  getAllRates, 
  getRateHistory, 
  searchExchangeRate, 
  updateExchangeRates, 
  resetManualOverride,
  updateRateManually,
  deleteRate,
  getDailyRateHistory,
  exportRateHistoryToExcel,
  exportRateHistoryToPDF
};
