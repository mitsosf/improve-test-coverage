import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { RepositoriesPage } from './components/RepositoriesPage';
import { CoveragePage } from './components/CoveragePage';
import { JobsPage } from './components/JobsPage';
import './App.css';

function App() {
  const location = useLocation();

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">Coverage Improver</h1>
          <nav className="nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              Repositories
            </Link>
            <Link
              to="/jobs"
              className={`nav-link ${location.pathname === '/jobs' ? 'active' : ''}`}
            >
              Jobs
            </Link>
          </nav>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<RepositoriesPage />} />
          <Route path="/coverage/:repoId" element={<CoveragePage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
