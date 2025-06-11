import { useEffect, useState } from "react";
import "./cousDashboard.css"
import { ChevronRight, Search, Edit, Trash2, RefreshCw } from "lucide-react"
import axios from "axios";
import Swal from 'sweetalert2';
import { useNavigate } from "react-router-dom";
import aliasMap from "../aliasMap";

const CoursDashboard = () => {
  
  const navigate = useNavigate();

  type taux = {
    id_taux: number;
    dev_cible: string;
    taux_achat: number;
    taux_vente: number;
    modif_manual: number;
  };

  const [tauxList, setTauxList] = useState<taux[]>([]);
  const [search, setSearch] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [error, setError] = useState<string | null>(null); //error message recherche 
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTaux, setEditingTaux] = useState<taux | null>(null);
  const [editForm, setEditForm] = useState({
    taux_achat: "",
    taux_vente: ""
  });
  const [showDictionary, setShowDictionary] = useState(false); // pour le bouton flottant

  useEffect(() => {
    //date dynamique
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    const formatted = now.toLocaleDateString("fr-FR", options).replace(",", " -");
    setCurrentDate(formatted);

    //Charge les taux du tableau
    const fetchData = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/taux");
        setTauxList(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();

    // pour voir si ça marche
    // handleAutoUpdate();

    // Mise à jour autom toutes les 12h (43 200 000 ms)
    const interval = setInterval(() => {
      handleAutoUpdate();
    }, 43200000); //12h 43200000   2mn 120000

    // Nettoyage de l'intervalle à la destruction du composant
      return () => clearInterval(interval);
      
  }, []);

  //Fonction de recherche
  const handleSearch = async () => {
    setError(null); // Reset erreur à chaque tentative
    
    try {
      let keyword = search.trim().toLowerCase();
  
      //Conversion automatique si alias trouvé
      if (aliasMap[keyword]) {
        keyword = aliasMap[keyword];
      }
  
      if (keyword === "") {
        //chargement du tableau
        const res = await axios.get("http://localhost:5000/api/taux");
        setTauxList(res.data);
      } else {
        const res = await axios.get(`http://localhost:5000/api/taux/recherche/${keyword}`);
        const allRes = await axios.get("http://localhost:5000/api/taux");

        const otherData = allRes.data.filter((t: taux) => t.dev_cible !== res.data.dev_cible);
        setTauxList([res.data, ...otherData]);//res eu dessus puis le reste au dessous

        setSearch("");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          setError(err.response.data?.error || "Devise introuvable.");
        } else {
          setError("Erreur inattendue lors de la recherche.");
        }
      } else {
        setError("Erreur inconnue.");
      }
  
      setTauxList([]);
    }
  };
  
  //for modal edit
  const handleEdit = (taux: taux) => {
    setEditingTaux(taux);
    setEditForm({
      taux_achat: taux.taux_achat.toString(),
      taux_vente: taux.taux_vente.toString()
    });
    setShowEditModal(true);
  };

  const handleUpdateManually = async () => {
    if (!editingTaux) return;
    console.log("editingTaux:", editingTaux);
    console.log("id_taux:", editingTaux.id_taux);
    try {
      await axios.post("http://localhost:5000/api/taux/update-manual", {
        id: editingTaux.id_taux,
        taux_achat: parseFloat(editForm.taux_achat),
        taux_vente: parseFloat(editForm.taux_vente)
      });
      
      // Recharger les données
      const res = await axios.get("http://localhost:5000/api/taux");
      setTauxList(res.data);

      setShowEditModal(false);
      setEditingTaux(null);
      setEditForm({ taux_achat: "", taux_vente: "" });

      // Toast de succès
      Swal.fire({
        icon: 'success',
        title: 'Succès !',
        text: 'Le taux a été mis à jour avec succès.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch (err) {
      console.error("Erreur lors de la mise à jour:", err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: "Erreur lors de la mise à jour du taux.",
        confirmButtonColor: '#dc3545'
      });
    }
  };

  //pour suppression
  const handleDelete = async (taux: taux) => {
    const result = await Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: `Vous allez supprimer le taux ${taux.dev_cible}. Cette action est irréversible !`,
      icon: 'warning',
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
        // console.log(taux.id_taux);
        await axios.delete(`http://localhost:5000/api/taux/delete/${taux.id_taux}`);
        
        const res = await axios.get("http://localhost:5000/api/taux");
        setTauxList(res.data);
        
        Swal.fire({
          icon: 'success',
          title: 'Supprimé !',
          text: 'Le taux a été supprimé avec succès.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        console.error("Erreur lors de la suppression:", err);
        Swal.fire({
          icon: 'error',
          title: 'Erreur de suppression',
          text: 'La suppression du taux a échoué.',
          toast: true,
          position: 'top-end',
          timer: 3000,
          showConfirmButton: false
        });
      }
    }
  };

  //reactivation du maj autom
  const handleReactivateAutoUpdate = async (taux: taux) => {
    const result = await Swal.fire({
      title: 'Réactiver la mise à jour automatique ?',
      text: `Voulez-vous réactiver la mise à jour automatique pour ${taux.dev_cible} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, réactiver',
      cancelButtonText: 'Annuler'
    });

    if (result.isConfirmed) {
      try {
        // const lastManualUpdate = '';
        if (taux) {
          await axios.get(`http://localhost:5000/api/taux/resetManual/${taux.dev_cible}`);
          Swal.fire({
            icon: 'success',
            title: 'Réactivé !',
            text: 'Mise à jour automatique réactivée avec succès.',
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });

          const res = await axios.get("http://localhost:5000/api/taux");
          setTauxList(res.data);
          
        } else {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'Aucune modification manuelle trouvée pour cette devise.',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
          });
        }
      } catch (err) {
        console.error("Erreur lors de la réactivation:", err);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'error',
          title: 'Erreur lors de la réactivation',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }
    }
  };

  // pour afficher qu'une maj auto a été effectué
  const handleAutoUpdate = async () => {
    try {
      await axios.get("http://localhost:5000/api/taux/last-auto-update");
  
      Swal.fire({
        icon: 'info',
        title: 'Mise à jour automatique réussie',
        text: 'Merci de rafraîchir la page pour voir les taux.',
        timer: 3000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });    

      //non chargement car pourrait perturber les actions de l'user comme modif
  
    } catch (err) {
      console.error(err);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Échec de la mise à jour automatique',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    }
  };

  return (
    <div className='cours-dashboard'>
      <div className="fil-aria">
        <div className="fil-name">Accueil</div>
        <ChevronRight size={16}/>
        <div className="fil-name">Taux de Change</div>
      </div>
      <div className="date">
        {/* date dynamique */}
        <div>{ currentDate }</div>
        <div className="search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Rechercher une devise (ex: USD)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch(); // Recherche au clavier
            }}
          />
        </div>
      </div>
      {error && <div className="error-message">{error}</div>} {/* Message d'erreur visible */}
      <div className="content">
        <div className="taux-change">
          <p>Liste des taux de changes</p>
          <div className="table-change">
            <div className="table-head">
              <div className="head-item">Devise</div>
              <div className="head-item">Achat</div>
              <div className="head-item">Vente</div>
              <div className="head-item">Actions</div>
            </div>
            {tauxList
              .map((taux, id) => (
                <div className="table-row" key={id}>
                  <div className="row-item">{taux.dev_cible}</div>
                  <div className="row-item">{taux.taux_achat}</div>
                  <div className="row-item">{taux.taux_vente}</div>
                  <div className="row-item actions-container">
                    <button 
                      className="action-btn edit-btn" 
                      onClick={() => handleEdit(taux)}
                      title="Modifier">
                      <Edit size={16} />
                    </button>
                    <button 
                      className="action-btn delete-btn" 
                      onClick={() => handleDelete(taux)}
                      title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                    {taux.modif_manual === 1 && (
                      <button 
                        className="action-btn refresh-btn" 
                        onClick={() => handleReactivateAutoUpdate(taux)}
                        title="Réactiver mise à jour automatique">
                        <RefreshCw size={16} />
                      </button>
                    )}
                    </div>
                </div>
              ))
            }
          </div>
          <div className="last" onClick={() => navigate('/historique')}>Last</div>
        </div>
        <div className="info">
          truc
        </div>
      </div>

      {/* Modal d'édition */}
      {showEditModal && editingTaux && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="h3">Modifier le taux {editingTaux.dev_cible}</h3>
            <div className="form-group">
              <label className="label">Taux d'achat:</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={editForm.taux_achat}
                onChange={(e) => setEditForm({ ...editForm, taux_achat: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label">Taux de vente:</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={editForm.taux_vente}
                onChange={(e) => setEditForm({ ...editForm, taux_vente: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleUpdateManually}>
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="floating-dictionary">
        <button 
          className="dictionary-toggle-btn"
          onClick={() => setShowDictionary(!showDictionary)}
          title="Voir les alias de devises">
          ?
        </button>
  
        {showDictionary && (
          <div className="dictionary-modal">
            <div className="dictionary-content">
              <div className="dictionary-header">
                <h4>Raccourcis de recherche</h4>
                <button 
                  className="close-btn"
                  onClick={() => setShowDictionary(false)}
                >
                  ×
                </button>
              </div>
              <div className="dictionary-list">
                <p className="dictionary-subtitle">Vous pouvez rechercher avec ces termes :</p>
                {Object.entries(aliasMap).map(([alias, code]) => (
                  <div key={alias} className="dictionary-item">
                    <span className="alias">{alias}</span>
                    <span className="arrow">→</span>
                    <span className="code">{code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CoursDashboard