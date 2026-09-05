import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, LogOut, Menu, X, Shield, Trophy, User, ChevronDown, ClipboardList } from 'lucide-react';
import { adminAPI } from '../../services/api';
import { PawMark } from '../common/Brand';
import { initials } from '../../utils/format';

const Navbar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const userMenuRef = useRef(null);

  // Admins get a badge for registrations + reset requests awaiting them
  useEffect(() => {
    if (!isAdmin) return;
    adminAPI.getPendingCount().then((d) => setPendingCount(d.count)).catch(() => {});
  }, [isAdmin, location.pathname]);

  useEffect(() => {
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));
  const name = user?.nickname || user?.display_name || user?.username;

  const navLinks = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/board', icon: ClipboardList, label: 'The Board' },
    { path: '/standings', icon: Trophy, label: 'Standings' },
  ];

  const Badge = ({ className = '' }) =>
    pendingCount > 0 ? (
      <span className={`min-w-[1.25rem] h-5 px-1 inline-flex items-center justify-center rounded-full bg-dog-orange text-white text-[11px] font-bold shadow-md ${className}`}>
        {pendingCount}
      </span>
    ) : null;

  return (
    <nav className="sticky top-0 z-50 bg-white/75 backdrop-blur-xl border-b border-glass shadow-[0_4px_24px_rgba(22,38,74,0.06)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <PawMark className="w-10 h-10 rounded-xl shadow-[0_6px_16px_rgba(22,38,74,0.22)] transform group-hover:scale-105 transition-transform duration-200" />
            <div className="leading-tight">
              <span className="font-display font-extrabold text-2xl uppercase tracking-wide text-dog-navy">LT SuperDogs</span>
              <div className="hidden sm:block text-[10px] text-text-orange font-bold tracking-[0.2em] uppercase">Underdog Pick'em</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  isActive(link.path)
                    ? 'bg-dog-navy text-white shadow-[0_4px_14px_rgba(22,38,74,0.25)]'
                    : 'text-text-secondary hover:bg-black/[0.04] hover:text-dog-navy'
                }`}
              >
                <link.icon className="h-4 w-4" />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>

          <div className="hidden md:block relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="relative flex items-center gap-2 bg-white/60 border border-glass rounded-xl px-2.5 py-1.5 hover:bg-white/90 transition-all duration-200"
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <Badge className="absolute -top-1.5 -right-1.5" />
              <div className="w-8 h-8 bg-navy-gradient rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
                {initials(user?.display_name || user?.username)}
              </div>
              <div className="text-xs hidden lg:block leading-tight text-left">
                <div className="font-semibold text-text-primary">{name}</div>
                {isAdmin && (
                  <div className="flex items-center gap-0.5 text-text-orange font-medium">
                    <Shield className="h-2.5 w-2.5" /> Admin
                  </div>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-text-muted transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl border border-glass rounded-xl shadow-[0_12px_32px_rgba(22,38,74,0.16)] py-2 animate-slide-down z-50">
                <div className="px-4 py-2 border-b border-glass mb-1">
                  <div className="font-semibold text-text-primary text-sm truncate">{user?.display_name || user?.username}</div>
                  <div className="text-xs text-text-muted truncate">{user?.email}</div>
                </div>
                <Link to="/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-black/[0.04] hover:text-dog-navy transition-colors">
                  <User className="h-4 w-4" /> Profile &amp; Settings
                </Link>
                {isAdmin && (
                  <Link to="/admin" className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-black/[0.04] hover:text-dog-navy transition-colors">
                    <Shield className="h-4 w-4" /> Admin <Badge className="ml-auto" />
                  </Link>
                )}
                <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-result-loss hover:bg-result-loss/10 transition-colors">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="relative md:hidden text-dog-navy hover:bg-black/[0.04] p-2 rounded-lg transition-all duration-200"
            aria-label="Toggle menu"
          >
            <Badge className="absolute -top-0.5 -right-0.5" />
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-white/92 backdrop-blur-xl border-t border-glass animate-slide-down">
          <div className="px-3 pt-2 pb-3 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive(link.path) ? 'bg-dog-navy text-white shadow-md' : 'text-text-secondary hover:bg-black/[0.04]'
                  }`}
                >
                  <link.icon className="h-5 w-5 shrink-0" />
                  <span className="font-semibold">{link.label}</span>
                </Link>
              ))}
            </div>

            <p className="px-1 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Account</p>
            <div className="rounded-xl border border-glass overflow-hidden bg-white/50">
              <div className="flex items-center gap-2.5 px-3 py-3 bg-black/[0.03]">
                <div className="w-9 h-9 bg-navy-gradient rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                  {initials(user?.display_name || user?.username)}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-semibold text-text-primary text-sm truncate">{user?.display_name || user?.username}</div>
                  <div className="text-xs text-text-muted truncate">{user?.email}</div>
                </div>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 text-text-orange font-medium text-[11px] shrink-0">
                    <Shield className="h-3 w-3" /> Admin
                  </span>
                )}
              </div>
              <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-black/[0.04] border-t border-glass transition-colors">
                <User className="h-5 w-5 shrink-0" /> Profile &amp; Settings
              </Link>
              {isAdmin && (
                <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-black/[0.04] border-t border-glass transition-colors">
                  <Shield className="h-5 w-5 shrink-0" /> Admin <Badge className="ml-auto" />
                </Link>
              )}
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 w-full text-sm font-medium text-result-loss hover:bg-result-loss/10 border-t border-glass transition-colors">
                <LogOut className="h-5 w-5 shrink-0" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
