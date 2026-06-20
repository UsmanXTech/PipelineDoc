import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Chat from './pages/Chat';
import Intelligence from './pages/Intelligence';
import IncidentDetails from './pages/IncidentDetails';
import DeployProgress from './pages/DeployProgress';
import UiPathHub from './pages/UiPathHub';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/uipath-hub" element={<UiPathHub />} />
          <Route path="/incidents/:id" element={<IncidentDetails />} />
          <Route path="/deployments/:id" element={<DeployProgress />} />
        </Routes>
      </Layout>
    </Router>
  );
}
