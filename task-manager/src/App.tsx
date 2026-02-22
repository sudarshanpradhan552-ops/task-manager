import { useEffect, useState } from 'react';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import { GoogleOAuthProvider } from '@react-oauth/google';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID'}>
      {isAuthenticated ? <Dashboard /> : <AuthPage />}
    </GoogleOAuthProvider>
  );
}

export default App;
