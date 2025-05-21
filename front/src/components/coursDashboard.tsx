import "./cousDashboard.css"
import { ChevronRight, Search } from "lucide-react"

const coursDashboard = () => {
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
          <input type="text"/>
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
            <div className="table-row">
              <div className="row-item">USD</div>
              <div className="row-item">4450</div>
              <div className="row-item">4550</div>
              <div className="row-item">Actions</div>
            </div>
            <div className="table-row">
              <div className="row-item">USD</div>
              <div className="row-item">4450</div>
              <div className="row-item">4550</div>
              <div className="row-item">Actions</div>
            </div>
            <div className="table-row">
              <div className="row-item">USD</div>
              <div className="row-item">4450</div>
              <div className="row-item">4550</div>
              <div className="row-item">Actions</div>
            </div>
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

export default coursDashboard