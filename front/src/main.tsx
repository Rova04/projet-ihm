import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { createBrowserRouter, RouterProvider } from "react-router-dom";

// Import other pages as needed
import "./index.css";
import Historique from './Historique.tsx';


const router = createBrowserRouter([
  // Shop Routes
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/historique",
    element: <Historique />,
  }

 
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
 
      <RouterProvider router={router} />

  </StrictMode>
);
