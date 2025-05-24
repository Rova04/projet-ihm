import React, { useEffect, useState } from "react";
import "./cousDashboard.css"
import { ChevronRight, Search } from "lucide-react"
import axios from "axios";

const CoursDashboard = () => {
  
  type taux = {
    id: number;
    dev_cible: string;
    taux_achat: number;
    taux_vente: number;
  };

  const [tauxList, setTauxList] = useState<taux[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (search.trim() === "") {
          // Pas de recherche : charger tous les taux
          const res = await axios.get("http://localhost:5000/taux");
          setTauxList(res.data);
        } else {
          // Recherche côté backend
          const res = await axios.get(`http://localhost:5000/taux/recherche/${search}`);
          setTauxList(res.data);
        }
      } catch (err) {
        console.error(err);
      }
    };
  
    fetchData();
  }, [search]);

  return (
    <div className='cours-dashboard'>
      <div className="fil-aria">
        <div className="fil-name">Accueil</div>
        <ChevronRight size={16}/>
        <div className="fil-name">Taux de Change</div>
      </div>
      <div className="date">
        <div>29 Avril 2025 - 15:40</div>
        <div className="search">
          <Search size={16} />
          <input type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}/>
        </div>
      </div>
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
              <div className="row-item">Actions</div>
            </div>
              ))
            }
          </div>
          <div className="last">Last</div>
        </div>
        <div className="info">
          ,
        </div>
      </div>
    </div>
  )
}

export default CoursDashboard