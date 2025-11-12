import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { CreateContract } from './pages/CreateContract';
import { ContractDetail } from './pages/ContractDetail';
import { initDB, isLoggedIn } from './lib/database';

function App() {
  const [initialized, setInitialized] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        // Initialize database
        await initDB();

        // Check if user is logged in
        const userLoggedIn = await isLoggedIn();
        setLoggedIn(userLoggedIn);

        setInitialized(true);
      } catch (error) {
        console.error('Initialization error:', error);
        setInitialized(true);
      }
    }

    init();
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 animate-pulse">
            m
          </div>
          <p className="text-gray-600">Inicializando minicontratos...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={loggedIn ? <Navigate to="/dashboard" replace /> : <Onboarding />}
        />
        <Route
          path="/dashboard"
          element={loggedIn ? <Dashboard /> : <Navigate to="/" replace />}
        />
        <Route
          path="/create"
          element={loggedIn ? <CreateContract /> : <Navigate to="/" replace />}
        />
        <Route
          path="/contract/:id"
          element={loggedIn ? <ContractDetail /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
