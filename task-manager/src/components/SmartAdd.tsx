import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Loader2 } from 'lucide-react';

interface SmartAddProps {
    onAdd: (prompt: string) => Promise<void>;
}

const SmartAdd: React.FC<SmartAddProps> = ({ onAdd }) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || loading) return;

        setLoading(true);
        try {
            await onAdd(prompt);
            setPrompt('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-purple-500/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>

            <div className="relative glass-morphism rounded-2xl p-2 flex items-center gap-2 border border-white/10 shadow-xl">
                <div className="pl-3 py-2">
                    <Sparkles className="w-5 h-5 text-accent animate-pulse" />
                </div>

                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Try 'Remind me to call John tomorrow at 5pm high priority'..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-silver placeholder:text-slate-custom/50 py-3 text-sm md:text-base"
                />

                <button
                    type="submit"
                    disabled={!prompt.trim() || loading}
                    className="bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:grayscale transition-all p-3 rounded-xl text-white shadow-lg"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Send className="w-5 h-5" />
                    )}
                </button>
            </div>

            <AnimatePresence>
                {prompt.length > 5 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute -bottom-8 left-4"
                    >
                        <p className="text-[10px] text-slate-custom uppercase tracking-widest font-bold">
                            Press Enter for <span className="text-accent">AI Magic</span>
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </form>
    );
};

export default SmartAdd;
