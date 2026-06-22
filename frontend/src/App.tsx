import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Chat from './pages/Chat';
import Intelligence from './pages/Intelligence';
import IncidentDetails from './pages/IncidentDetails';
import DeployProgress from './pages/DeployProgress';
import UiPathHub from './pages/UiPathHub';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Dashboard Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/intelligence" element={<Intelligence />} />
                  <Route path="/uipath-hub" element={<UiPathHub />} />
                  <Route path="/incidents/:id" element={<IncidentDetails />} />
                  <Route path="/deployments/:id" element={<DeployProgress />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}
