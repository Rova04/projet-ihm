import { useState, useRef } from 'react'
import "./historique.css"
import { ChevronRight, Search, Funnel, FileText, FileSpreadsheet, Trash2 } from "lucide-react"
import Swal from 'sweetalert2';
import axios from "axios";
import aliasMap from './aliasMap';

const Historique = () => {

  type historique = {
    id_histoTaux: number,
    dev_source: string,
    dev_cible: string,
    taux_achat: number,
    taux_vente: number,
    date_archivage: Date,
    suppr: boolean,
    modif_manual: boolean
  }

  const dateInputRef = useRef<HTMLInputElement>(null);

  const [historique, setHistorique] = useState<historique[]>([]);
  const [searchDevise, setSearchDevise] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedOption, setSelectedOption] = useState('Toutes');
  const [lastSearchDevise, setLastSearchDevise] = useState('');

  const filtreMapping: { [key: string]: string } = {
    "Toutes": "1",
    "Manuelles": "2",
    "Automatique": "3"
  };

  const fetchHistorique = async () => {
    if (!searchDate) {
      Swal.fire({
        icon: 'info',
        title: 'Date manquante',
        text: 'Veuillez sélectionner une date pour lancer la recherche.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      return;
    }

    const filtre = filtreMapping[selectedOption] || "1";

    // Appliquer le mapping d'alias comme dans CoursDashboard
    let keyword = searchDevise.trim().toLowerCase();
    
    // Conversion automatique si alias trouvé
    if (aliasMap[keyword]) {
      keyword = aliasMap[keyword];
    }

    const deviseParam = keyword === '' ? 'all' : keyword;
    setLastSearchDevise(deviseParam); // stocke la recherche
  
    try {
      const res = await axios.get(`http://localhost:5000/api/taux/historique/${deviseParam}/${searchDate}/${filtre}`);
      const data = res.data;
      setHistorique(data);

      setSearchDevise('');
      setSearchDate('');
      setSelectedOption('Toutes');
    } catch (err) {
      console.error("Erreur lors de la récupération de l'historique :", err);
    }
  };

  const handleOptionClick = (option: string) => {
    setSelectedOption(option);
  };

  const handleDelete = async (id_histoTaux: number, dev_cible: string) => {
    const result = await Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: `Vous allez supprimer l'entrée pour la devise cible ${dev_cible}. Cette action est irréversible !`,
      // icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler',
      reverseButtons: true,
      focusCancel: true
    });
  
    if (result.isConfirmed) {
      try {
        await axios.delete(`http://localhost:5000/api/taux/historique/delete/${id_histoTaux}`);
  
        setHistorique(prev => prev.filter(item => item.id_histoTaux !== id_histoTaux));
  
        Swal.fire({
          icon: 'success',
          title: 'Supprimé !',
          text: 'L\'historique a été supprimé avec succès.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        console.error("Erreur lors de la suppression :", err);
        Swal.fire({
          icon: 'error',
          title: 'Erreur de suppression',
          text: 'La suppression a échoué.',
          toast: true,
          position: 'top-end',
          timer: 3000,
          showConfirmButton: false
        });
      }
    }
  };

  // génerer pdf
  const generatePDF = async () => {
    if (historique.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune donnée',
        text: 'Aucune donnée à exporter en PDF.',
        toast: true,
        position: 'top-end',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }
  
    try {
      const response = await axios.post(
        'http://localhost:5000/api/taux/historique/export/pdf',
        { historique, devise: lastSearchDevise },
        {
          responseType: 'blob',
          headers: { 'Content-Type': 'application/json' }
        }
      );
  
      const disposition = response.headers['content-disposition'];
      let filename = 'historique_taux.pdf';
      if (disposition) {
        let match = disposition.match(/filename\*=UTF-8''([^;]+)/);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        } else if (disposition.includes('filename=')) {
          match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) {
            filename = match[1];
          }
        }
      }
  
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur lors de l'export PDF :", error);
      Swal.fire({
        icon: 'error',
        title: 'Erreur PDF',
        text: 'Impossible de générer le fichier PDF.',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
      });
    }
  };

  //génerer excel
  const generateExcel = async () => {
    if (historique.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune donnée',
        text: 'Aucune donnée à exporter en Excel.',
        toast: true,
        position: 'top-end',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }
  
    try {
      const response = await axios.post(
        'http://localhost:5000/api/taux/historique/export/excel',
        { historique, devise: lastSearchDevise },
        {
          responseType: 'blob',
          // Lecture des headers
          headers: { 'Content-Type': 'application/json' }
        }
      );
  
      // Extraire le nom depuis le header
    const disposition = response.headers['content-disposition'];
    console.log('Tous les headers:', response.headers); // AJOUTEZ
    console.log('Content-Disposition:', disposition); // AJOUTEZ
    let filename = 'historique_taux.xlsx'; // fallback

    if (disposition) {
      // Essayer d'abord filename*= (UTF-8 encodé)
      let match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      } else if (disposition.includes('filename=')) {
        // Fallback sur filename= (simple)
        match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }
    }
  
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
  
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      console.log(filename)
      // Ajouter temporairement au DOM pour déclencher le téléchargement
      document.body.appendChild(link);
      link.click();
      
      // Nettoyer
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur lors de l'export Excel :", error);
      Swal.fire({
        icon: 'error',
        title: 'Erreur Excel',
        text: 'Impossible de générer le fichier Excel.',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
      });
    }
  };
  
  return (
    <div className='historique-taux'>
      <div className='fil-aria'>
        <div className="fil-name">Accueil</div>
          <ChevronRight size={16}/>
        <div className="fil-name">Historique taux de Change</div>
      </div>
      <div className='ambony'>
        <h3>Historique des taux de change</h3>
      </div>
      <div className='menu'>
        <div className='real-search'>
          <input type="text"
            placeholder='Rechercher une devise'
            value={searchDevise}
            onChange={(e) => setSearchDevise(e.target.value)}
          />
        </div>
        <div className='mini-menu'>
          <h5>Options avancées: </h5>
          <div className='date' onClick={() => dateInputRef.current?.showPicker()}>
            <input type="date"
              id="dateInput"
              ref={dateInputRef}
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>
          <div className='filtre-wrapper'>
            <div className='filtre-select-container'>
              <select
                className='filtre-select'
                value={selectedOption}
                onChange={(e) => handleOptionClick(e.target.value)}>
                <option value="Toutes">Toutes</option>
                <option value="Manuelles">Manuelles</option>
                <option value="Automatique">Automatique</option>
              </select>
              <Funnel className="filtre-icon" size={16} />
            </div>
          </div>
          <button className='search-button' onClick={fetchHistorique}>
            <Search size={16} />
          </button>
          <button className='pdf' onClick={generatePDF}>
            <label>Pdf</label>
            <FileText size={16}/>
          </button>
          <button className='excel' onClick={generateExcel}>
            <label>Excel</label>
            <FileSpreadsheet size={16}/>
          </button>
        </div>
      </div>
      <div className='tableau'>
        <table className='table-change'>
          <thead>
            <tr>
              <td className='titre'>Devise source</td>
              <td className='titre'>Devise cible</td>
              <td className='titre'>Taux achat</td>
              <td className='titre'>Taux vente</td>
              <td className='titre'>Date archivage</td>
              <td className='titre'>Supprimé</td>
              <td className='titre'>Modification manuelle</td>
              <td className='titre'>Action</td>
            </tr>
          </thead>
          <tbody>
            
            {historique.map(item => (
              <tr key={item.id_histoTaux}>
                <td>{item.dev_source}</td>
                <td>{item.dev_cible}</td>
                <td>{item.taux_achat}</td>
                <td>{item.taux_vente}</td>
                <td>{new Date(item.date_archivage).toLocaleDateString()}</td>
                <td>{item.suppr ? 'Oui' : 'Non'}</td>
                <td>{item.modif_manual ? 'Oui' : 'Non'}</td>
                <td className="actions-container">
                  <button 
                    className="action-btn delete-btn" 
                    title="Supprimer"
                    onClick={() => handleDelete(item.id_histoTaux, item.dev_cible)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Historique