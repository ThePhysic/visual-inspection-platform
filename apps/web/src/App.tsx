import DraftNavigationGuard from './annotations/DraftNavigationGuard';
import { Link, NavLink, Route, Routes } from 'react-router';
import HealthPage from './HealthPage';
import UploadPage from './UploadPage';
import InspectionPage from './InspectionPage';

export default function App() {
  return <DraftNavigationGuard>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link className="brand" to="/">Visual Inspection Platform</Link>
      <nav aria-label="Main navigation">
        <NavLink to="/" end>New inspection</NavLink>
        <NavLink to="/health">Service status</NavLink>
      </nav>
    </header>
    <main id="main">
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/inspections/:inspectionId" element={<InspectionPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="*" element={<><h1>Page not found</h1><p>This link does not point to an inspection.</p><Link to="/">Start a new inspection</Link></>} />
      </Routes>
    </main>
  </DraftNavigationGuard>;
}
