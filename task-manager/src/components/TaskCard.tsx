import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock, Tag, Zap, Trash2 } from 'lucide-react';

interface SubTask {
    id: number;
    title: string;
    is_completed: boolean;
}

interface Task {
    id: number;
    title: string;
    description?: string;
    priority: string;
    status: string;
    category?: string;
    due_date?: string;
    estimated_minutes?: number;
    subtasks: SubTask[];
}

interface TaskCardProps {
    task: Task;
    onToggleStatus: (id: number) => void;
    onDecompose: (id: number) => void;
    onDelete: (id: number) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onToggleStatus, onDecompose, onDelete }) => {
    const priorityColors: Record<string, string> = {
        high: 'text-red-400 bg-red-400/10 border-red-400/20',
        medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-morphism rounded-2xl p-5 border border-steel/50 hover:border-accent/40 transition-all group"
        >
            <div className="flex items-start gap-4">
                <button
                    onClick={() => onToggleStatus(task.id)}
                    className="mt-1 text-slate-custom hover:text-accent transition-colors"
                >
                    {task.status === 'completed' ? (
                        <CheckCircle2 className="w-6 h-6 text-accent" />
                    ) : (
                        <Circle className="w-6 h-6" />
                    )}
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className={`font-semibold truncate ${task.status === 'completed' ? 'line-through text-slate-custom' : 'text-silver'}`}>
                            {task.title}
                        </h3>
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${priorityColors[task.priority] || priorityColors.medium}`}>
                            {task.priority}
                        </span>
                    </div>

                    {task.description && (
                        <p className="text-sm text-slate-custom line-clamp-2 mb-3">
                            {task.description}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-custom">
                        {task.category && (
                            <div className="flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {task.category}
                            </div>
                        )}
                        {task.estimated_minutes && (
                            <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {task.estimated_minutes}m
                            </div>
                        )}
                    </div>

                    {task.subtasks && task.subtasks.length > 0 && (
                        <div className="mt-4 space-y-2 border-l border-steel/30 ml-1 pl-4">
                            {task.subtasks.map((sub) => (
                                <div key={sub.id} className="flex items-center gap-2 text-xs text-slate-custom">
                                    <div className={`w-1.5 h-1.5 rounded-full ${sub.is_completed ? 'bg-accent' : 'bg-steel'}`} />
                                    {sub.title}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onDecompose(task.id)}
                        className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-custom hover:text-silver"
                        title="AI Decompose"
                    >
                        <Zap className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(task.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg transition-all text-slate-custom hover:text-red-400"
                        title="Delete Task"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default TaskCard;
