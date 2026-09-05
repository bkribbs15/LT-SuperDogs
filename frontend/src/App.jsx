import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import ForcePasswordChange from './components/Auth/ForcePasswordChange';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ForgotPassword from './components/Auth/ForgotPassword';
import Dashboard from './components/Dashboard/Dashboard';
import WeeklyBoard from './components/Picks/WeeklyBoard';
import Standings from './components/Standings/Standings';
import Profile from './components/Profile/Profile';
import AdminSettings from './components/Admin/AdminSettings';

const guard = (el, adminOnly = false) => <ProtectedRoute adminOnly={adminOnly}>{el}</ProtectedRoute>;

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route path="/" element={guard(<Dashboard />)} />
          <Route path="/dashboard" element={guard(<Dashboard />)} />
          <Route path="/board" element={guard(<WeeklyBoard />)} />
          <Route path="/board/:week" element={guard(<WeeklyBoard />)} />
          <Route path="/standings" element={guard(<Standings />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/admin" element={guard(<AdminSettings />, true)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {/* Blocks the app until a temp-password user sets their own */}
        <ForcePasswordChange />
      </AuthProvider>
    </Router>
  );
}

export default App;
