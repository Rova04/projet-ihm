
const axios = require('axios');
const db = require('../config/bd.js');
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');

// Récupérer tous les taux de change stockés
const getAllRates = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.id_taux, t.taux_achat, t.taux_vente, t.dev_source, t.dev_cible,
              COALESCE(
                (SELECT h.modif_manual 
                 FROM historique_taux h 
                 WHERE h.dev_cible = t.dev_cible 
                 ORDER BY h.id_histoTaux DESC 
                 LIMIT 1), 0
              ) as modif_manual
       FROM taux t
       ORDER BY t.id_taux;`
    );
    res.json(rows);
    // console.log(rows);
    
  } catch (err) {
    console.error('Erreur lors de la récupération des taux:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des taux.' });
  }
};

// Récupérer l'historique des taux pour une devise
const getRateHistory = async (req, res) => {
  const { dev_cible, date_archivage, filtre } = req.params;
  // console.log(dev_cible, date_archivage, filtre);

  try {
    let query = 'SELECT * FROM historique_taux WHERE DATE(date_archivage) = ?';
    const params = [date_archivage];

    if (dev_cible && dev_cible.trim() !== 'all') {
      query += ' AND dev_cible = ?';
      params.push(dev_cible);
    }

    if (filtre === '2') {
      query += ' AND modif_manual = 1';
    } else if (filtre === '3') {
      query += ' AND modif_manual = 0';
    }

    query += ' ORDER BY id_histoTaux';
    // console.log(query)
    const [rows] = await db.query(query, params);
    // console.log(rows)
    res.json(rows);
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'historique :', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique.' });
  }
};

/**
   Rechercher ou créer un taux de change spécifique
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

    // console.log('Devise cible:', dev_cible);
    
    // Usage de l'endpoint de conversion directe (plus efficace)
    // donne directement combien vaut 1 dev_cible en MGA
    const response = await axios.get(`https://v6.exchangerate-api.com/v6/d06c0ae2a041ffe3e17e28d1/pair/${dev_cible}/MGA`);
    
    // Vérifier si la réponse est valide
    if (response.data.result !== 'success') {
      return res.status(500).json({ error: 'Erreur lors de l\'appel à l\'API de change.' });
    }

    // Récupérer directement le taux de conversion
    const taux_achat_brut = response.data.conversion_rate;

    if (!taux_achat_brut) {
      return res.status(404).json({ error: `Taux de change non disponible pour la devise ${dev_cible}.` });
    }
    const taux_achat = taux_achat_brut.toFixed(2);
    const taux_vente_brut = taux_achat_brut * (1 + marge);
    const taux_vente = taux_vente_brut.toFixed(2);

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

    // console.log('Résultat:', newRate[0]);
    res.json(newRate[0]);
  } catch (err) {
    console.error('Erreur lors de la recherche du taux:', err);
    
    // Gestion d'erreur plus spécifique
    if (err.response) {
      console.error('Erreur API:', err.response.data);
      res.status(500).json({ error: 'Erreur de l\'API externe de change.' });
    } else {
      res.status(500).json({ error: 'Erreur lors de la recherche du taux de change.' });
    }
  }
};


//Mise à jour automatique excluant les maj manuels
const updateExchangeRates = async (options = {}) => {
  try {
    // Récupérer toutes les paires de devises depuis la table taux
    const [existingPairs] = await db.query('SELECT dev_source, dev_cible FROM taux');

    if (existingPairs.length === 0) {
      console.log('Aucun taux à mettre à jour.');
      return { message: 'Aucun taux à mettre à jour.', updatedCount: 0, skippedCount: 0 };
    }

    // Filtrer les paires qui peuvent être mises à jour (modif_manual = 0 ou pas d'historique)
    const pairsToUpdate = [];
    
    for (const pair of existingPairs) {
      const [lastModification] = await db.query(
        `SELECT modif_manual FROM historique_taux 
         WHERE dev_cible = ? 
         ORDER BY id_histoTaux DESC 
         LIMIT 1`,
        [pair.dev_cible]
      );

      // Mettre à jour si : pas d'historique OU dernière modification avec modif_manual = 0
      if (lastModification.length === 0 || lastModification[0].modif_manual === 0) {
        pairsToUpdate.push(pair);
      }
    }

    if (pairsToUpdate.length === 0) {
      console.log('Toutes les paires ont été modifiées manuellement.');
      return { message: 'Aucune paire à mettre à jour.', updatedCount: 0, skippedCount: existingPairs.length };
    }

    console.log(`Mise à jour de ${pairsToUpdate.length} paire(s) : ${pairsToUpdate.map(p => `${p.dev_source}/${p.dev_cible}`).join(', ')}`);

    // Appel API pour récupérer les taux de change
    const response = await axios.get('https://v6.exchangerate-api.com/v6/d06c0ae2a041ffe3e17e28d1/latest/MGA');

    if (!response.data || response.data.result === 'error') {
      throw new Error('Impossible de récupérer les taux de change depuis l\'API');
    }

    const rates = response.data.conversion_rates;
    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let updatedCount = 0;
    let skippedCount = 0;

    // Traiter chaque paire qui peut être mise à jour
    for (const { dev_source, dev_cible } of pairsToUpdate) {
      const rateMGAtoDev = rates[dev_cible];
      
      if (!rateMGAtoDev || rateMGAtoDev <= 0) {
        console.log(`Taux introuvable pour ${dev_cible}`);
        skippedCount++;
        continue;
      }

      // Conversion : 1 MGA = rateMGAtoDev dev_cible, donc 1 dev_cible = 1/rateMGAtoDev MGA
      const newTauxAchat = 1 / rateMGAtoDev;
      // Marge fixe de 2%
      const newTauxVente = newTauxAchat * 1.02;

      // Récupérer le taux actuel pour l'archivage
      const [currentRate] = await db.query(
        'SELECT taux_achat, taux_vente FROM taux WHERE dev_source = ? AND dev_cible = ?',
        [dev_source, dev_cible]
      );
      
      if (currentRate.length === 0) {
        skippedCount++;
        continue;
      }

      // Archiver l'ancien taux
      await db.query(
        'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, modif_manual) VALUES (?, ?, ?, ?, ?, 0)',
        [currentRate[0].taux_achat, currentRate[0].taux_vente, dev_source, dev_cible, dateUpdate]
      );

      // Mise à jour dans la table principale
      await db.query(
        'UPDATE taux SET taux_achat = ?, taux_vente = ? WHERE dev_source = ? AND dev_cible = ?',
        [newTauxAchat, newTauxVente, dev_source, dev_cible]
      );

      updatedCount++;
      console.log(`${dev_source}/${dev_cible} : ${newTauxAchat.toFixed(2)} (${newTauxVente.toFixed(2)})`);
    }

    // Compter les paires ignorées
    const totalSkipped = existingPairs.length - pairsToUpdate.length + skippedCount;

    console.log(`${updatedCount} taux mis à jour, ${totalSkipped} ignorés`);

    return {
      message: `${updatedCount} taux mis à jour avec succès.`,
      updatedCount,
      skippedCount: totalSkipped,
      timestamp: dateUpdate,
      pairesTraitees: pairsToUpdate.map(p => `${p.dev_source}/${p.dev_cible}`)
    };

  } catch (err) {
    console.error("Erreur mise à jour taux:", err.message);
    throw new Error("Erreur durant la mise à jour des taux: " + err.message);
  }
};

//réactiver la mise à jour automatique pour une ligne historique
const resetManualOverride = async (req, res) => {
  const { dev_cible } = req.params;

  try {
    // Vérifier si la ligne existe et est bien une modif manuelle
    const rows = await db.query(
      'SELECT * FROM historique_taux WHERE dev_cible = ? AND modif_manual = 1 order by id_histoTaux DESC LIMIT 1',
      [dev_cible]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Aucune modification manuelle trouvée." });
    }

    const idToUpdate = rows[0][0].id_histoTaux;

    // Déverrouiller la modif manuelle
    await db.query(
      'UPDATE historique_taux SET modif_manual = 0 WHERE id_histoTaux = ?',
      [idToUpdate]
    );

    res.json({ message: `Mise à jour automatique réactivée pour ${dev_cible}.` });
  } catch (err) {
    console.error("Erreur resetManualOverride:", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
};

// Mettre à jour manuellement un taux de change 
const updateRateManually = async (req, res) => {
  try {
    const { id, taux_achat, taux_vente } = req.body;

    if (!id || !taux_achat || !taux_vente) {
      return res.status(400).json({ error: 'Tous les champs sont requis.' });
    }
    
    // Vérifier si le taux existe
    const [existingRate] = await db.query(
      'SELECT * FROM taux WHERE id_taux = ?',
      [id]
    );
    
    if (existingRate.length === 0) {
      return res.status(404).json({ error: 'Taux introuvable.' });
    }

    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Ajouter à l'historique avec le flag modif_manual à 1
    await db.query(
      'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, modif_manual) VALUES (?, ?, ?, ?, ?, 1)',
      [existingRate[0].taux_achat, existingRate[0].taux_vente, existingRate[0].dev_source, existingRate[0].dev_cible, dateUpdate]
    );
    
    // Mettre à jour le taux
    await db.query(
      'UPDATE taux SET taux_achat = ?, taux_vente = ? WHERE id_taux = ?',
      [taux_achat, taux_vente, id]
    );
    
    const [newRate] = await db.query(
      'SELECT * FROM taux WHERE id_taux = ?',
      [id]
    );

    res.json({
      message: 'Taux mis à jour manuellement avec succès.',
      data: newRate[0]
    });
  } catch (err) {
    console.error("Erreur mise à jour manuelle:", err.message);
    res.status(500).json({ error: "Erreur lors de la mise à jour manuelle." });
  }
};

/**
 * Supprimer un taux de change
 */
const deleteRate = async (req, res) => {
  const { id } = req.params;
  // console.log(id);

  try {    
    const [rows] = await db.query(
      'SELECT * FROM taux WHERE id_taux = ?',
      [id]
    );

    // Ajouter la dernière version à l'historique avec un marqueur de suppression
    const dateUpdate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.query(
      'INSERT INTO historique_taux (taux_achat, taux_vente, dev_source, dev_cible, date_archivage, suppr) VALUES (?, ?, ?, ?, ?, ?)',
      [rows[0].taux_achat, rows[0].taux_vente, rows[0].dev_source, rows[0].dev_cible, dateUpdate, 1]
    );
    
    // Supprimer le taux
    await db.query(
      'DELETE FROM taux WHERE id_taux = ?',
      [id]
    );
    
    res.json({ message: 'Taux supprimé avec succès.' });
  } catch (err) {
    console.error("Erreur lors de la suppression du taux:", err.message);
    res.status(500).json({ error: "Erreur lors de la suppression du taux." });
  }
};

/**
 * Supprimer un taux de change
 */
const deleteHistorique = async (req, res) => {
  const { id } = req.params;
  // console.log(id);
  try {
    await db.query('delete from historique_taux where id_histoTaux = ?', [id]);
    res.json({ message: 'Suppression de l\'historiqueréussie' });
  } catch (err) {
    console.error("Erreur lors de la suppression de l'historique:", err.message);
    res.status(500).json({ error: "Erreur lors de la suppression de l'historique." });
  }
}

/**
 * Exporter l'historique des taux en PDF
 */
const exportRateHistoryToPDF = async (req, res) => {
  try {
    const { historique, devise } = req.body;

    // Polices natives PDF standard (aucun fichier .ttf requis)
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };

    const printer = new PdfPrinter(fonts);
    
    // === Formatage des dates ===
    const firstValidDate = new Date(historique[0].date_archivage);
    const dateFormatted = firstValidDate.toLocaleDateString('fr-FR');
    const safeDateForFilename = dateFormatted.replace(/\//g, '-');

    // === Titre dynamique ===
    let titre = 'Historique des taux de change archivés';
    if (devise && devise !== 'all' && devise.trim() !== '') {
      titre += ` pour la devise ${devise.toUpperCase()}`;
    }
    titre += ` - ${dateFormatted}`;

    // === Construction du tableau ===
    const tableBody = [
      [
        { text: 'Devise Cible', style: 'tableHeader' },
        { text: 'Taux Achat', style: 'tableHeader' },
        { text: 'Taux Vente', style: 'tableHeader' },
        { text: "Date d'archivage", style: 'tableHeader' },
        { text: 'Supprimé', style: 'tableHeader' },
        { text: 'Modification manuelle', style: 'tableHeader' },
      ],
    ];

    historique.forEach(row => {
      const dateOnly = row.date_archivage
        ? new Date(row.date_archivage).toLocaleDateString('fr-FR')
        : '';
      tableBody.push([
        row.dev_cible,
        row.taux_achat,
        row.taux_vente,
        dateOnly,
        row.suppr ? 'Oui' : 'Non',
        row.modif_manual ? 'Oui' : 'Non',
      ]);
    });

    // === Définition du document PDF ===
    const docDefinition = {
      content: [
        { text: titre, style: 'header', alignment: 'center', margin: [0, 0, 0, 30] },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*', '*', '*'],
            body: tableBody,
          },
          margin: [0, 10, 0, 0], // Marge supplémentaire avant le tableau
        },
      ],
      pageMargins: [40, 60, 40, 60], // [gauche, haut, droite, bas]
      styles: {
        header: {
          fontSize: 16,
          bold: true,
        },
        tableHeader: {
          bold: true,
          fillColor: '#eeeeee',
        },
      },
      defaultStyle: {
        font: 'Helvetica', // Changé de 'Roboto' vers 'Helvetica'
        fontSize: 10,
      },
      pageOrientation: 'landscape',
    };

    // === Création du PDF et envoi ===
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    let filename = `historique_taux`;
    if (devise && devise !== 'all' && devise.trim() !== '') {
      filename += `_${devise.toUpperCase()}`;
    }
    filename += `_${safeDateForFilename}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error('Erreur export PDF :', error);
    res.status(500).send('Erreur lors de la génération du fichier PDF');
  }
};

/**
 * Exporter l'historique des taux en Excel
 */
const exportRateHistoryToExcel = async (req, res) => {
  try {
    const { historique, devise } = req.body;
    console.log(devise);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Taux affichés');

    // Conversion de proprement la date du premier élément
    const firstValidDate = new Date(historique[0].date_archivage); 

    // Format FR pour affichage (entête Excel)
    const dateFormatted = firstValidDate.toLocaleDateString('fr-FR');
    // Format ISO pour nom de fichier
    const safeDateForFilename = dateFormatted.replace(/\//g, '-'); // Ex: 10-06-2025

    //Créer les colonnes pour ne pas éecraser le titre
    worksheet.columns = [
      { header: 'Devise Cible', key: 'dev_cible', width: 20 },
      { header: 'Taux Achat', key: 'taux_achat', width: 15 },
      { header: 'Taux Vente', key: 'taux_vente', width: 15 },
      { header: "Date d'archivage", key: 'date_archivage', width: 20 },
      { header: 'Supprimé', key: 'suppr', width: 15 },
      { header: 'Modification manuelle', key: 'modif_manual', width: 25 }
    ];

    // Titre principal dans la ligne 1
    let titre = 'Historique des taux de change archivés';
    if (devise && devise !== 'all' && devise.trim() !== '') {
      titre += ` pour la devise ${devise.toUpperCase()}`;
    }
    titre += ` - ${dateFormatted}`;

    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = titre;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    //en-tête (en ligne 3)
    worksheet.spliceRows(2, 0, []);
    const headerRow = worksheet.getRow(3);
    headerRow.values = worksheet.columns.map(col => col.header);
    headerRow.font = { bold: true };

    //Ajout des données
    historique.forEach(row => {
      const dateOnly = row.date_archivage
        ? new Date(row.date_archivage).toLocaleDateString('fr-FR')
        : '';
      worksheet.addRow({
        dev_cible: row.dev_cible,
        taux_achat: row.taux_achat,
        taux_vente: row.taux_vente,
        date_archivage: dateOnly,
        suppr: row.suppr ? 'Oui' : 'Non',
        modif_manual: row.modif_manual ? 'Oui' : 'Non'
      });
    });
    let filename = `historique_taux`;
    if (devise && devise !== 'all' && devise.trim() !== '') {
      filename += `_${devise.toUpperCase()}`;
    }
    filename += `_${safeDateForFilename}.xlsx`;

    // console.log(filename);
    // console.log(safeDateForFilename)
    // Envoi du fichier Excel
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur export Excel :', error);
    res.status(500).send('Erreur lors de la génération du fichier Excel');
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
  deleteHistorique,
  exportRateHistoryToPDF,
  exportRateHistoryToExcel
};
