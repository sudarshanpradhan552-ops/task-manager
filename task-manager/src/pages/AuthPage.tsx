import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, ShieldCheck, Sparkles } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';

const AuthPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                const formData = new FormData();
                formData.append('username', username);
                formData.append('password', password);

                const response = await api.post('/token', formData, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                localStorage.setItem('token', response.data.access_token);
                window.location.reload();
            } else {
                await api.post('/signup', { username, email, password });
                setIsLogin(true);
                setError('Account created! Please login.');
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        setLoading(true);
        setError('');
        try {
            const response = await api.post('/auth/google', {
                credential: credentialResponse.credential
            });
            localStorage.setItem('token', response.data.access_token);
            window.location.reload();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Google Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-obsidian text-silver p-4 relative overflow-hidden">
            {/* Background Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md"
            >
                <div className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-onyx border border-steel mb-4 shadow-xl"
                    >
                        <ShieldCheck className="w-8 h-8 text-accent" />
                    </motion.div>
                    <h1 className="text-4xl font-bold tracking-tight mb-2">
                        {isLogin ? 'Welcome Back' : 'Join the Future'}
                    </h1>
                    <p className="text-slate-custom">
                        {isLogin ? 'Enter your credentials to access your workspace.' : 'Create an account to start managing tasks with AI.'}
                    </p>
                </div>

                <div className="glass-morphism rounded-3xl p-8 border border-steel/50 shadow-2xl relative">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-custom mb-1.5 ml-1">Username</label>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-onyx border border-steel rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                                placeholder="johndoe"
                            />
                        </div>

                        {!isLogin && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                            >
                                <label className="block text-sm font-medium text-slate-custom mb-1.5 ml-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-onyx border border-steel rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                                    placeholder="john@example.com"
                                />
                            </motion.div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-custom mb-1.5 ml-1">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-onyx border border-steel rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                </>
                            )}
                        </button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-steel/30"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-[#0f1115] px-2 text-slate-custom">Or continue with</span>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => setError('Google Login Failed')}
                            theme="filled_black"
                            shape="pill"
                            width="250px"
                        />
                    </div>

                    <div className="mt-8 pt-6 border-t border-steel/30 text-center">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-slate-custom hover:text-silver text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
                        >
                            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                            <Sparkles className="w-4 h-4 text-accent/60" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default AuthPage;
